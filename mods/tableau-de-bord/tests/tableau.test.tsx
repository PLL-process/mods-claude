import { expect, mock, test } from 'claude-code/testing'

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ok = (stdout: string, exitCode = 0): { value: Run } => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

const PANE = {
  plugin: 'tableau-de-bord',
  component: 'Pane',
  requestId: 'tableau-de-bord',
  props: { title: 'Tableau de bord du lot', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('le panneau montre la branche, la PR et sa CI, puis les contrôles rapides', async ($, on) => {
  const horloge = mock.clock(on, { now: Date.UTC(2026, 9, 26, 14, 0) })
  on('session.cwd', () => ({ value: '/depot' }))
  on('fs.list', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'tableau' } }) as never)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', (_, e) => {
    const s = e.argv.join(' ')
    if (s.includes('remote get-url')) return ok('https://github.com/PLL-process/en-ligne-pour-le-cycle-4\n')
    if (s.includes('--show-toplevel')) return ok('/depot\n')
    if (s.includes('--abbrev-ref')) return ok('fable/regle-314-competences\n')
    if (s.includes('log -1')) return ok('b4c6ac0 Règle d’or n°314\n')
    if (s.includes('status --porcelain')) return ok('')
    if (s.includes('/pulls?')) return ok('521\tfable/regle-314-competences\tRègle d’or n°314\n')
    if (s.includes('/pulls/521')) return ok('abc\tclean\n')
    if (s.includes('check-runs')) return ok('success\n')
    if (e.argv[0] === 'python3') return ok(e.argv[1]?.includes('sigles') ? '⛔ 2 sigles\n' : '✅ vert\n', e.argv[1]?.includes('sigles') ? 1 : 0)
    return ok('')
  })

  await $.session.start({ cwd: '/depot', surface: 'desktop', isInteractive: true })
  await horloge.advance(2500)
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /fable\/regle-314-competences/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /#521 .*CI success .*fusionnable/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'controles' })
  expect(await ui.find({ type: 'Text', text: /✅ controle_competences/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⛔ controle_sigles — ⛔ 2 sigles/ })).toBeDefined()
  await ui.unmount()
})
