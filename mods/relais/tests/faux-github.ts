// faux-github.ts — sous le mod, pendant les tests : un dépôt cloné en /depot et une branche « relais » en mémoire.
// L'API de GitHub n'est lue qu'en lecture brute ; l'écriture passe par la plomberie de git, puis `git push`.
import type { On } from 'claude-code'

type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const ok = (stdout: string): { value: Run } => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const ko = (stderr: string): { value: Run } => ({ value: { exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })

export type FauxGithub = { fichiers: Map<string, string>; pushes: string[]; clone: boolean }

export function fauxGithub(on: On, depart: Record<string, string> = {}, clone = true): FauxGithub {
  const etat: FauxGithub = { fichiers: new Map(Object.entries(depart)), pushes: [], clone }
  const objets = new Map<string, string>()
  let arbre = new Map<string, string>()
  on('session.cwd', () => ({ value: '/depot' }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_, e) => {
    const a = e.argv
    const s = a.join(' ')
    const stdin = e.init?.stdin ?? ''
    if (a[0] === 'gh') {
      const m = s.match(/contents\/([^? ]+)\?ref=relais/)
      if (m) {
        const t = etat.fichiers.get(m[1] ?? '')
        return t === undefined ? ko('HTTP 404') : ok(t)
      }
      return ok('')
    }
    if (!etat.clone) return ko('fatal: not a git repository')
    if (s.includes('remote get-url')) return ok('https://github.com/PLL-process/en-ligne-pour-le-cycle-4\n')
    if (s.includes('--show-toplevel')) return ok('/depot\n')
    if (s.includes('--abbrev-ref')) return ok('fable/essai\n')
    if (s.includes('log -1')) return ok('abc1234 Un commit\n')
    if (s.includes('status --porcelain')) return ok('')
    if (s.includes(' fetch ')) return etat.fichiers.size ? ok('') : ko('couldn’t find remote ref relais')
    if (s.includes('rev-parse origin/relais')) return ok('p1\n')
    if (s.includes('ls-tree')) {
      return ok([...etat.fichiers.keys()].map(n => `100644 blob s-${n}\t${n}`).join('\n'))
    }
    if (s.includes('hash-object')) {
      const sha = `o${objets.size + 1}`
      objets.set(sha, stdin)
      return ok(`${sha}\n`)
    }
    if (s.includes('mktree')) {
      arbre = new Map()
      for (const ligne of stdin.split('\n').filter(Boolean)) {
        const [tete, nom] = ligne.split('\t')
        arbre.set(nom ?? '', (tete ?? '').split(' ')[2] ?? '')
      }
      return ok('t1\n')
    }
    if (s.includes('commit-tree')) return ok('c1\n')
    if (s.includes(' push ')) {
      etat.pushes.push(s)
      for (const [nom, sha] of arbre) {
        const texte = objets.get(sha)
        if (texte !== undefined) etat.fichiers.set(nom, texte)
      }
      return ok('')
    }
    return ok('')
  })
  return etat
}
