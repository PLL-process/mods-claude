import { expect, mock, test } from 'claude-code/testing'

import { fauxGithub } from './faux-github'

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ok = (stdout: string): { value: Run } => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const RESUME = 'Résumé : la PR #521 (règle n°314) attend la fusion ; la vague n°298 suit, thème 3 d’abord. '.repeat(4)

test('une compaction est gardée dans COMPACTIONS.md, sur la branche relais', async ($, on) => {
  const gh = fauxGithub(on)
  const horloge = mock.clock(on, { now: Date.UTC(2026, 9, 26, 14, 0) })
  mock.store(on)
  on('session.compact', () => ({ messages: [{ role: 'user' as const, text: RESUME, toolUses: [] }], tokensBefore: 180000, tokensAfter: 12000 }))

  const r = await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'bonjour', toolUses: [] }] } as never)
  expect('messages' in r && r.messages?.length).toBe(1)
  await horloge.advance(10)
  expect(gh.pushes.length).toBe(1)
  expect(gh.fichiers.get('COMPACTIONS.md')).toMatch(/180 k jetons ramenés à 12 k/)
  expect(gh.fichiers.get('COMPACTIONS.md')).toMatch(/la PR #521/)
})

test('une précompaction n’est pas gardée', async ($, on) => {
  const ecrits: string[] = []
  const horloge = mock.clock(on)
  mock.store(on)
  on('process.run', (_, e) => {
    ecrits.push(e.argv.join(' '))
    return ok('{}')
  })
  on('session.compact', () => ({ messages: [{ role: 'user' as const, text: RESUME, toolUses: [] }] }))
  await $.session.compact({ trigger: 'precompute', messages: [{ role: 'user', text: 'bonjour', toolUses: [] }] } as never)
  await horloge.advance(10)
  expect(ecrits.length).toBe(0)
})
