// relais — les sessions de Pascal se passent le relais (décisions de Pascal du 26/10/2026 : 1b 2a 3a).
//
// Au démarrage, la session lit RELAIS.md sur la branche « relais » du dépôt et le met dans son prompt système :
// elle sait où la précédente s'est arrêtée. Pendant la session, le mod relève dans les réponses les décisions 🔶 et
// l'action ➡️, et dans les messages de Pascal ses réponses (« 1b 2a ») ; il réécrit RELAIS.md quand ils changent,
// au plus une fois toutes les trois minutes, et tout de suite quand Claude l'écrit lui-même avec l'outil
// `mcp__relais__ecrire` (où on en est, en quelques lignes) ou quand Pascal tape `/relais`.
// Le fichier vit sur une branche à part : la branche de travail reste propre, et aucune PR ne le porte.
import type { EngineInterface, Register } from 'claude-code'

import {
  type Decision,
  dateMartinique,
  depotGithub,
  ecrireDecision,
  ecrireRelais,
  gh,
  lireAction,
  lireDecisions,
  lireRelais,
  lireReponses,
  trouverDepot,
} from './commun'

type Moteur = EngineInterface
type Prise = { quand: string; texte: string }
type Etat = {
  notes: string
  notesQuand: string
  decisions: Decision[]
  action: string
  prises: Prise[]
}

const VIDE: Etat = { notes: '', notesQuand: '', decisions: [], action: '', prises: [] }
const CLE = 'etat-v1'
const ATTENTE_MS = 3 * 60 * 1000

async function lireEtat($: Moteur): Promise<Etat> {
  try {
    const v = (await $.store.get(CLE)) as Partial<Etat> | undefined
    return { ...VIDE, ...(v ?? {}) }
  } catch {
    return { ...VIDE }
  }
}

async function contexteGit($: Moteur, depot: string | null, repo: string): Promise<string[]> {
  const l: string[] = []
  if (depot) {
    const run = (args: string[]) => $.process.run(['git', '-C', depot, ...args], { timeoutMs: 10000 })
    try {
      const branche = (await run(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
      const dernier = (await run(['log', '-1', '--format=%h %s'])).stdout.trim()
      const sale = (await run(['status', '--porcelain'])).stdout.split('\n').filter(Boolean).length
      l.push(`- Branche : \`${branche}\` — dernier commit ${dernier.slice(0, 110)}`)
      if (sale) l.push(`- ${sale} fichier(s) modifié(s) non commité(s) au moment du relais`)
    } catch {
      l.push('- Branche : illisible')
    }
  } else {
    l.push('- Le dépôt n’était pas cloné dans cette session.')
  }
  const prs = await gh($, [`repos/${repo}/pulls?state=open&per_page=6`, '--jq', '.[] | [.number, .head.ref, .head.sha, .title] | @tsv'])
  if (prs.ok) {
    for (const ligne of prs.sortie.split('\n').filter(Boolean).slice(0, 6)) {
      const [num, ref, sha, titre] = ligne.split('\t')
      const ci = await gh($, [`repos/${repo}/commits/${sha}/check-runs`, '--jq', '[.check_runs[] | .conclusion // .status] | join(", ")'])
      l.push(`- PR #${num} ouverte (\`${ref}\`) — ${(titre ?? '').slice(0, 90)} — CI : ${ci.ok ? ci.sortie.trim() || 'aucune' : '?'}`)
    }
    if (!prs.sortie.trim()) l.push('- Aucune PR ouverte.')
  }
  return l
}

async function composer($: Moteur, etat: Etat): Promise<string> {
  const depot = await trouverDepot($)
  const repo = await depotGithub($, depot)
  const maintenant = dateMartinique(await $.clock.now())
  const parties = [
    '# Relais — en-ligne-pour-le-cycle-4',
    '',
    `Mis à jour le ${maintenant} (heure de la Martinique). Le journal des décisions fait foi ; ce relais dit où on en est.`,
    '',
    '## Où on en est',
    etat.notes ? `${etat.notes}\n\n_(écrit par Claude le ${etat.notesQuand})_` : '_Rien d’écrit par Claude pour l’instant._',
    '',
    '## Branche et PR',
    ...(await contexteGit($, depot, repo)),
    '',
    '## Décisions en attente',
    etat.decisions.length ? etat.decisions.map(ecrireDecision).join('\n\n') : '_Aucune._',
    '',
    '## Prochaine action',
    etat.action ? `➡️ ${etat.action}` : '_Non dite._',
    '',
    '## Décisions prises récemment (messages de Pascal)',
    etat.prises.length ? etat.prises.map(p => `- ${p.quand} — « ${p.texte} »`).join('\n') : '_Aucune relevée._',
    '',
    '_Résumés de compaction : `COMPACTIONS.md`, même branche._',
    '',
  ]
  return parties.join('\n')
}

async function ecrire($: Moteur, pourquoi: string): Promise<string> {
  const etat = await lireEtat($)
  const texte = await composer($, etat)
  const r = await ecrireRelais($, await trouverDepot($), 'RELAIS.md', texte, `Relais : ${pourquoi}`)
  await $.store.set('dernier-ecrit', await $.clock.now())
  return r
}

let precedent = ''
let minuterie: { cancel: () => void } | null = null

function plusTard($: Moteur, pourquoi: string) {
  minuterie?.cancel()
  minuterie = $.clock.after(ATTENTE_MS, () => {
    minuterie = null
    void ecrire($, pourquoi).catch(() => undefined)
  })
}

async function releverMessage($: Moteur, texte: string) {
  const decisions = lireDecisions(texte)
  const action = lireAction(texte)
  if (!decisions.length && !action) return
  const etat = await lireEtat($)
  if (decisions.length) etat.decisions = decisions
  if (action) etat.action = action
  await $.store.set(CLE, etat)
  plusTard($, 'décisions et prochaine action relevées')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'relais',
      description: 'Écrit le relais maintenant (RELAIS.md, branche relais) ; « /relais lire » montre celui de la session précédente.',
      argumentHint: '[lire]',
    })
    await $.tool.register({
      name: 'ecrire',
      description:
        'Écrit le point de reprise de la session (RELAIS.md sur la branche « relais » du dépôt) pour que la session ' +
        'suivante reprenne là où celle-ci s’arrête. À appeler après chaque étape notable : PR ouverte ou fusionnée, ' +
        'décision posée ou tranchée, fin de lot, avant une longue attente. `ou_on_en_est` : 3 à 8 lignes en français, ' +
        'ce qui est fait, ce qui reste, où sont les fichiers utiles. Les décisions 🔶, l’action ➡️, la branche, les PR ' +
        'et leur CI sont ajoutées par le mod.',
      inputSchema: {
        type: 'object',
        properties: {
          ou_on_en_est: { type: 'string', description: 'Où on en est, en 3 à 8 lignes (markdown).' },
          prochaine_action: { type: 'string', description: 'La prochaine action, si elle a changé.' },
        },
        required: ['ou_on_en_est'],
      },
      isDeferred: false,
    })
    try {
      const depot = await trouverDepot($)
      precedent = (await lireRelais($, await depotGithub($, depot), 'RELAIS.md', depot)) ?? ''
    } catch {
      precedent = ''
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (r.sections.some(s => s.id === 'relais:reprise')) return r
    const texte = [
      'Relais entre les sessions (mod « relais ») :',
      '- Le point de reprise vit dans RELAIS.md, sur la branche « relais » du dépôt en-ligne-pour-le-cycle-4.',
      '- Après chaque étape notable (PR ouverte ou fusionnée, décision posée ou tranchée, fin de lot), appelle',
      '  l’outil mcp__relais__ecrire avec « où on en est » en 3 à 8 lignes. Le mod ajoute décisions, action, branche et PR.',
      precedent
        ? `\nVoici le relais laissé par la session précédente — reprends à partir de là, sans le redemander à Pascal :\n\n${precedent.slice(0, 6000)}`
        : '\nAucun relais n’a été trouvé au démarrage (premier usage, ou GitHub injoignable).',
    ].join('\n')
    return { sections: [...r.sections, { id: 'relais:reprise', text: texte, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'mcp__relais__ecrire' }, async ($, e) => {
    const entree = e as unknown as { ou_on_en_est?: string; prochaine_action?: string }
    const etat = await lireEtat($)
    etat.notes = String(entree.ou_on_en_est ?? '').trim().slice(0, 3000)
    etat.notesQuand = dateMartinique(await $.clock.now())
    if (entree.prochaine_action) etat.action = String(entree.prochaine_action).trim()
    await $.store.set(CLE, etat)
    minuterie?.cancel()
    const r = await ecrire($, 'point écrit par Claude')
    return { result: r.startsWith('échec') ? `Relais NON écrit — ${r}` : `Relais ${r} : RELAIS.md, branche « relais ».` }
  })

  on('tool.call', { tool: 'SendUserMessage' }, async ($, e, next) => {
    const ran = await next(e)
    const message = (e as unknown as { message?: string }).message
    if (typeof message === 'string') await releverMessage($, message).catch(() => undefined)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.answer) await releverMessage($, e.answer).catch(() => undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const reponses = lireReponses(e.text ?? '')
    if (Object.keys(reponses).length) {
      const etat = await lireEtat($)
      etat.prises = [{ quand: dateMartinique(await $.clock.now()), texte: (e.text ?? '').trim().slice(0, 140) }, ...etat.prises].slice(0, 8)
      etat.decisions = etat.decisions.filter(d => !(d.n in reponses))
      await $.store.set(CLE, etat)
      plusTard($, 'réponses de Pascal relevées')
    }
    return next(e)
  })

  on('command.run', { command: 'relais' }, async ($, e) => {
    if (e.args.trim() === 'lire') {
      return { text: precedent || 'Aucun relais lu au démarrage de cette session.' }
    }
    minuterie?.cancel()
    const r = await ecrire($, 'demandé par Pascal (/relais)')
    const depot = await trouverDepot($)
    const lu = await lireRelais($, await depotGithub($, depot), 'RELAIS.md', depot)
    return { text: `Relais ${r}.\n\n${lu ?? ''}` }
  })
}
