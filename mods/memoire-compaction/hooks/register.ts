// memoire-compaction — quand une session devient trop longue, elle se résume elle-même et oublie le détail.
// Ce mod garde ce résumé : il l'écrit dans COMPACTIONS.md, sur la branche « relais » du dépôt (les trois derniers,
// le plus récent en tête), pour qu'une session suivante, ou Pascal, puisse le relire. `/compactions` montre le dernier.
import type { EngineInterface, Register } from 'claude-code'

import { dateMartinique, depotGithub, ecrireRelais, lireRelais, trouverDepot } from './commun'

type Moteur = EngineInterface
type Resume = { quand: string; texte: string; avant?: number; apres?: number }

const GARDES = 3
const TAILLE_MAX = 40000

async function garder($: Moteur, resume: Resume) {
  await $.store.set('dernier', resume)
  const depot = await trouverDepot($)
  const repo = await depotGithub($, depot)
  const ancien = (await lireRelais($, repo, 'COMPACTIONS.md', depot)) ?? ''
  const anciens = ancien.split(/\n(?=## )/).filter(s => s.startsWith('## ')).slice(0, GARDES - 1)
  const tailles = resume.avant ? ` — ${Math.round(resume.avant / 1000)} k jetons ramenés à ${Math.round((resume.apres ?? 0) / 1000)} k` : ''
  const neuf = `## ${resume.quand}${tailles}\n\n${resume.texte.slice(0, TAILLE_MAX)}\n`
  const texte = ['# Résumés de compaction', '', 'Le plus récent en tête ; les trois derniers sont gardés.', '', neuf, ...anciens].join('\n')
  await ecrireRelais($, depot, 'COMPACTIONS.md', texte, `Compaction du ${resume.quand}`)
}

// Le résumé en attente d'écriture : les deux chemins peuvent l'apporter pour la même compaction, à quelques
// instants d'écart ; le premier fixe le texte, le second n'ajoute que les tailles s'il les a.
let enAttente: Resume | undefined
let dernierEcrit = ''

function planifier($: Moteur, resume: Resume) {
  const cle = resume.texte.slice(0, 400)
  if (cle === dernierEcrit) return
  if (enAttente && enAttente.texte.slice(0, 400) === cle) {
    enAttente.avant ??= resume.avant
    enAttente.apres ??= resume.apres
    return
  }
  const premier = enAttente === undefined
  enAttente = resume
  if (!premier) return
  // Hors de la compaction : l'écriture sur GitHub ne la retarde pas ; deux secondes laissent l'autre chemin arriver.
  $.clock.after(2000, () => {
    const r = enAttente
    enAttente = undefined
    if (!r) return
    dernierEcrit = r.texte.slice(0, 400)
    void garder($, r).catch(() => undefined)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compactions',
      description: 'Montre le dernier résumé de compaction gardé (COMPACTIONS.md, branche relais).',
    })
    return next(e)
  })

  // Deux chemins mènent au même résumé, et le premier arrivé l'écrit :
  //  · `session.compact`, quand ce mod est dans la chaîne de la compaction ;
  //  · la ligne de résumé que la compaction ajoute à la conversation (`session.append`, porte `compaction`).
  //    Le second chemin existe parce qu'un autre plugin peut répondre à la compaction à la place du moteur
  //    sans la passer plus bas (vu le 26/10/2026 : « cc-plugin-sec-default » l'a fait, et ce mod n'a rien vu).
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.trigger === 'precompute' || e.agentId !== undefined || r.messages === undefined) return r
    const texte = r.messages.map(m => m.text).find(t => t.trim().length > 200) ?? r.messages[0]?.text ?? ''
    if (!texte.trim()) return r
    planifier($, { quand: dateMartinique(await $.clock.now()), texte, avant: r.tokensBefore, apres: r.tokensAfter })
    return r
  })

  on('session.append', { door: 'compaction' }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || e.message.type !== 'user') return r
    const texte = e.message.content.map(b => (b.type === 'text' ? b.text : '')).join('\n')
    if (texte.trim().length <= 200) return r
    planifier($, { quand: dateMartinique(await $.clock.now()), texte })
    return r
  })

  on('command.run', { command: 'compactions' }, async $ => {
    const depot = await trouverDepot($)
    const lu = await lireRelais($, await depotGithub($, depot), 'COMPACTIONS.md', depot)
    if (lu) return { text: lu.split(/\n(?=## )/).slice(0, 2).join('\n') }
    const local = (await $.store.get('dernier')) as Resume | undefined
    return { text: local ? `## ${local.quand}\n\n${local.texte}` : 'Aucune compaction gardée pour l’instant.' }
  })
}
