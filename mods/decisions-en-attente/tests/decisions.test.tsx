import { expect, test } from 'claude-code/testing'

import { lireDecisions, lireReponses } from '../hooks/commun'

const REPONSE = [
  'Je te propose six mods.',
  '',
  '🔶 1. Lesquels je construis maintenant ?',
  '- **a (par défaut)** : Relais, Décisions en attente et Français toujours.',
  '- b : les six.',
  '- c : seulement Relais, pour essayer.',
  '',
  '🔶 2. Où vit le relais ?',
  '- **a (par défaut)** : dans un fichier RELAIS.md du dépôt.',
  '- b : dans ma mémoire.',
  '',
  '➡️ Réponds « 1a 2a ».',
].join('\n')

const BANDE = {
  plugin: 'decisions-en-attente',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 90, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

test('les décisions 🔶 se lisent, le défaut marqué', () => {
  const d = lireDecisions(REPONSE)
  expect(d.length).toBe(2)
  expect(d[0]?.options.map(o => o.lettre).join('')).toBe('abc')
  expect(d[0]?.options[0]?.defaut).toBe(true)
  expect(d[0]?.options[1]?.defaut).toBe(false)
  expect(d[1]?.question).toBe('Où vit le relais ?')
})

test('les réponses de Pascal se lisent : « 1b 2a 3a », pas « B » seul', () => {
  expect(lireReponses('1b 2a 3a')).toEqual({ '1': 'b', '2': 'a', '3': 'a' })
  expect(lireReponses('B')).toEqual({})
  expect(lireReponses('Je prends 1a, puis 2b.')).toEqual({ '1': 'a', '2': 'b' })
})

test('la bande montre les décisions, un clic écrit la réponse, l’envoi les retire', async ($, on) => {
  let boite = ''
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'hors ligne', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.cwd', () => ({ value: '/' }))
  on('fs.list', () => ({ value: [] }))
  on('prompt.read', () => ({ value: { text: boite, cursor: boite.length } }))
  on('prompt.fill', (_, e) => {
    boite = e.text
    return { isFilled: true, text: boite, cursor: boite.length } as never
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>moteur</Text>
  })

  await $.turn.complete({ answer: REPONSE, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDE, surface })
    expect(await ui.find({ type: 'Text', text: /🔶 1\. Lesquels/ })).toBeDefined()
    expect(await ui.find({ key: 'o1b' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BANDE, surface: 'desktop' })
  await ui.press({ key: 'o1b' })
  expect(boite.trim()).toBe('1b')
  await ui.press({ key: 'o2a' })
  expect(boite.trim()).toBe('1b 2a')
  await ui.press({ key: 'defauts' })
  expect(boite.trim()).toBe('1a 2a')
  await ui.unmount()

  await $.prompt.submit({ text: '1b 2a' } as never)
  const apres = await $.ui.mount({ ...BANDE, surface: 'desktop' })
  expect(await apres.find({ type: 'Text', text: /🔶/ })).toBeUndefined()
  expect((await apres.find({ type: 'Text' }))?.text).toBe('moteur')
  await apres.unmount()
})
