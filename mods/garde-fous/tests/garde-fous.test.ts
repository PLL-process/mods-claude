import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

// Sous le mod : ces hooks tiennent lieu du moteur. Le dépôt simulé est /depot, sur la branche `travail`.
function moteur(on: On, opts: { branche?: string; controle?: number } = {}) {
  on('session.cwd', () => ({ value: '/depot' }))
  on('process.run', (_, e) => {
    const a = e.argv.join(' ')
    if (a.includes('rev-parse --abbrev-ref HEAD')) return { value: { exitCode: 0, stdout: `${opts.branche ?? 'travail'}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (a.includes('rev-parse --show-toplevel')) return { value: { exitCode: 0, stdout: '/depot\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (a.includes('remote get-url origin')) return { value: { exitCode: 0, stdout: 'https://github.com/PLL-process/en-ligne-pour-le-cycle-4\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (a.includes('controle_competences.py')) return { value: { exitCode: opts.controle ?? 0, stdout: '⛔ 1 fichier montre une compétence sans la nommer\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } as never }))
}

test('un push nommant main est refusé', async ($, on) => {
  moteur(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'cd /depot && git push origin main' })
  expect(r.deny ?? (r as { text?: string }).text ?? '').toMatch(/pas de push sur main/)
})

test('un push sans cible, depuis main, est refusé', async ($, on) => {
  moteur(on, { branche: 'main' })
  const r = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(r.deny ?? (r as { text?: string }).text ?? '').toMatch(/pas de push sur main/)
})

test('un push de branche passe', async ($, on) => {
  moteur(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'git push -q origin fable/regle-314-competences' })
  expect(r.deny).toBeUndefined()
})

test('une écriture dans l’archive est refusée (Edit, et Bash avec redirection)', async ($, on) => {
  moteur(on)
  const a = await $.tool.call({ tool: 'Edit', file_path: '/depot/_archive-anciennes-versions/x.html', old_string: 'a', new_string: 'b' })
  expect(a.deny ?? (a as { text?: string }).text ?? '').toMatch(/archive/)
  const b = await $.tool.call({ tool: 'Bash', command: 'echo x > /depot/_archive-anciennes-versions/y.txt' })
  expect(b.deny ?? (b as { text?: string }).text ?? '').toMatch(/archive/)
})

test('lire l’archive passe, même redirigé ailleurs', async ($, on) => {
  moteur(on)
  const r = await $.tool.call({ tool: 'Bash', command: 'grep -rn CRCN /depot/_archive-anciennes-versions | head' })
  expect(r.deny).toBeUndefined()
  const s = await $.tool.call({ tool: 'Bash', command: 'grep -rln CRCN /depot/_archive-anciennes-versions > /tmp/liste.txt 2>/dev/null' })
  expect(s.deny).toBeUndefined()
})

test('un texte qui nomme l’archive (here-document) passe', async ($, on) => {
  moteur(on)
  const r = await $.tool.call({
    tool: 'Bash',
    command: "cat > /tmp/README.md <<'EOF'\nRefuse une écriture dans `_archive-anciennes-versions/`.\nEOF\necho fait",
  })
  expect(r.deny).toBeUndefined()
})

test('copier, déplacer ou effacer dans l’archive est refusé', async ($, on) => {
  moteur(on)
  for (const command of [
    'cp sequence.html /depot/_archive-anciennes-versions/sequence.html',
    'mv a.html _archive-anciennes-versions/',
    'rm -rf /depot/_archive-anciennes-versions/vieux',
    "sed -i 's/a/b/' /depot/_archive-anciennes-versions/x.html",
    "cat > /depot/_archive-anciennes-versions/x.md <<'EOF'\nx\nEOF",
  ]) {
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny ?? (r as { text?: string }).text ?? '', command).toMatch(/archive/)
  }
})

test('un commit est refusé quand controle_competences.py est rouge, et passe quand il est vert', async ($, on) => {
  moteur(on, { controle: 1 })
  const rouge = await $.tool.call({ tool: 'Bash', command: 'cd /depot && git commit -q -m "x"' })
  expect(rouge.deny ?? (rouge as { text?: string }).text ?? '').toMatch(/controle_competences/)
})

test('un commit passe quand controle_competences.py est vert', async ($, on) => {
  moteur(on, { controle: 0 })
  const vert = await $.tool.call({ tool: 'Bash', command: 'cd /depot && git commit -q -m "x"' })
  expect(vert.deny).toBeUndefined()
})
