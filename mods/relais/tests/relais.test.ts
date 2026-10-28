import { expect, mock, test } from 'claude-code/testing'

import { fauxGithub } from './faux-github'

const FAITS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

function moteur(on: Parameters<typeof fauxGithub>[0]) {
  mock.clock(on, { now: Date.UTC(2026, 9, 26, 13, 40) })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'relais' } }) as never)
  on('tool.register', () => ({ value: { name: 'mcp__relais__ecrire' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'moteur', scope: 'shared' as const }] }))
  on('tool.call', () => ({ result: 'moteur' }) as never)
}

test('au démarrage, le relais précédent entre dans le prompt système', async ($, on) => {
  fauxGithub(on, { 'RELAIS.md': '# Relais\n\n## Où on en est\nPR #521 en attente de fusion.' })
  moteur(on)
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  const r = await $.prompt.compose(FAITS)
  const s = r.sections.find(x => x.id === 'relais:reprise')
  expect(s?.text).toMatch(/PR #521 en attente de fusion/)
  expect(s?.scope).toBe('session')
})

test('l’outil ecrire crée la branche relais la première fois, et y pousse RELAIS.md', async ($, on) => {
  const gh = fauxGithub(on)
  moteur(on)
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__relais__ecrire', ou_on_en_est: 'La PR #521 attend la fusion.' } as never)
  expect(String((r as { result?: unknown }).result)).toMatch(/Relais écrit/)
  expect(gh.pushes.length).toBe(1)
  expect(gh.pushes[0]).toMatch(/c1:refs\/heads\/relais/)
  expect(gh.fichiers.get('LISEZMOI.md')).toMatch(/Branche « relais »/)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/## Où on en est\nLa PR #521 attend la fusion\./)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/Branche : `fable\/essai`/)
})

test('un relais identique ne fait pas de commit', async ($, on) => {
  const gh = fauxGithub(on)
  moteur(on)
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__relais__ecrire', ou_on_en_est: 'Même texte.' } as never)
  const premier = gh.fichiers.get('RELAIS.md')
  expect(premier).toBeDefined()
  expect(gh.pushes.length).toBe(1)
})

test('les décisions 🔶 et l’action ➡️ d’une réponse, puis la réponse de Pascal, passent dans le relais', async ($, on) => {
  const gh = fauxGithub(on)
  const horloge = mock.clock(on, { now: Date.UTC(2026, 9, 26, 13, 40) })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'relais' } }) as never)
  on('tool.register', () => ({ value: { name: 'mcp__relais__ecrire' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: 'moteur' }))
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: '🔶 1. On publie ?\n- **a (par défaut)** : oui.\n- b : non.\n\n➡️ Réponds 1a.',
    durationMs: 1, isAborted: false, turnId: 't', reason: 'answer',
  })
  await horloge.advance(3 * 60 * 1000 + 10)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/🔶 1\. On publie \?\n- \*\*a \(par défaut\)\*\* : oui\./)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/➡️ Réponds 1a\./)
  await $.prompt.submit({ text: '1b' } as never)
  await horloge.advance(3 * 60 * 1000 + 10)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/« 1b »/)
  expect(gh.fichiers.get('RELAIS.md')).toMatch(/## Décisions en attente\n_Aucune\._/)
})

test('sans clone du dépôt, le relais le dit au lieu d’échouer en silence', async ($, on) => {
  fauxGithub(on, {}, false)
  moteur(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.tool.call({ tool: 'mcp__relais__ecrire', ou_on_en_est: 'x' } as never)
  expect(String((r as { result?: unknown }).result)).toMatch(/NON écrit.*pas cloné/)
})

test('la réponse de Pascal est gardée sans le rappel que l’hôte glisse devant', async ($, on) => {
  const gh = fauxGithub(on)
  const horloge = mock.clock(on, { now: Date.UTC(2026, 9, 28, 17, 38) })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'relais' } }) as never)
  on('tool.register', () => ({ value: { name: 'mcp__relais__ecrire' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('command.run', () => ({ text: 'moteur' }))
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: '🔶 1. On publie ?\n- **a (par défaut)** : oui.\n- b : non.\n\n🔶 5. On corrige ?\n- **a (par défaut)** : oui.\n- b : non.',
    durationMs: 1, isAborted: false, turnId: 't', reason: 'answer',
  })
  await horloge.advance(3 * 60 * 1000 + 10)
  const rappel = "<system-reminder>The user's timezone is America/Martinique (UTC-04:00). Message sent at Wed 2026-10-28 13:38 local time.</system-reminder>"
  await $.prompt.submit({ text: rappel + '1a 2a 3a 4a 5a' } as never)
  await horloge.advance(3 * 60 * 1000 + 10)
  const relais = gh.fichiers.get('RELAIS.md') ?? ''
  expect(relais).toMatch(/« 1a 2a 3a 4a 5a »/)
  expect(relais).not.toMatch(/system-reminder/)
  expect(relais).toMatch(/## Décisions en attente\n_Aucune\._/)
})

test('une réponse gardée avant le correctif, rappel compris, ne revient pas dans le relais', async ($, on) => {
  const gh = fauxGithub(on)
  const horloge = mock.clock(on, { now: Date.UTC(2026, 9, 28, 20, 20) })
  mock.store(on, {
    'etat-v1': {
      notes: '', notesQuand: '', decisions: [], action: '',
      prises: [
        { quand: '28/10/2026 13:38', texte: "<system-reminder>The user's timezone is America/Martinique (UTC-04:00).</system-reminder>\n1" },
        { quand: '26/10/2026 10:00', texte: '1b 2a 3a' },
      ],
    },
  })
  on('command.register', () => ({ value: { command: 'relais' } }) as never)
  on('tool.register', () => ({ value: { name: 'mcp__relais__ecrire' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: 'moteur' }))
  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__relais__ecrire', ou_on_en_est: 'Tout est fusionné.' } as never)
  await horloge.advance(10)
  const relais = gh.fichiers.get('RELAIS.md') ?? ''
  expect(relais).not.toMatch(/system-reminder/)
  expect(relais).toMatch(/« 1b 2a 3a »/)
})
