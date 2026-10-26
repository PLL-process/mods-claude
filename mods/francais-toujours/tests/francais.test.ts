import { expect, test } from 'claude-code/testing'

const FAITS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const

test('la règle du français est ajoutée une fois, en dernier, côté session', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'moteur', scope: 'shared' as const }] }))
  const r = await $.prompt.compose(FAITS)
  const derniere = r.sections.at(-1)
  expect(derniere?.id).toBe('francais-toujours:regle')
  expect(derniere?.scope).toBe('session')
  expect(derniere?.text).toMatch(/Réponds toujours en français/)
  expect(r.sections.filter(s => s.id === 'francais-toujours:regle').length).toBe(1)
})
