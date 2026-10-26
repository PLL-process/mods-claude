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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compactions',
      description: 'Montre le dernier résumé de compaction gardé (COMPACTIONS.md, branche relais).',
    })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.trigger === 'precompute' || e.agentId !== undefined || r.messages === undefined) return r
    const texte = r.messages.map(m => m.text).find(t => t.trim().length > 200) ?? r.messages[0]?.text ?? ''
    if (!texte.trim()) return r
    const resume: Resume = { quand: dateMartinique(await $.clock.now()), texte, avant: r.tokensBefore, apres: r.tokensAfter }
    // Hors de la compaction : l'écriture sur GitHub ne la retarde pas.
    $.clock.after(0, () => {
      void garder($, resume).catch(() => undefined)
    })
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
