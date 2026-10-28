// commun.ts — ce que les mods de Pascal partagent (copié à l'identique dans chacun : un mod n'importe que ses fichiers).
// Le dépôt, la branche « relais » sur GitHub, les dates à l'heure de la Martinique, et la lecture des décisions 🔶.
import type { EngineInterface } from 'claude-code'

type Moteur = EngineInterface

export const DEPOT_NOM = 'en-ligne-pour-le-cycle-4'
export const DEPOT_GITHUB = 'PLL-process/en-ligne-pour-le-cycle-4'
export const BRANCHE_RELAIS = 'relais'

/** Le dossier du dépôt en-ligne-pour-le-cycle-4 sur cette machine, ou null s'il n'y est pas (pas encore cloné). */
export async function trouverDepot($: Moteur): Promise<string | null> {
  let cwd = '/'
  try {
    cwd = await $.session.cwd()
  } catch {
    // la session ne dit pas son dossier : on essaie les emplacements habituels
  }
  const candidats = [cwd, `${cwd}/${DEPOT_NOM}`, `/home/claude/${DEPOT_NOM}`, `/home/user/${DEPOT_NOM}`, `/workspace/${DEPOT_NOM}`]
  try {
    for (const ent of await $.fs.list(cwd)) {
      if (ent.kind === 'dir') candidats.push(`${cwd}/${ent.name}`)
    }
  } catch {
    // dossier illisible : les candidats fixes suffisent
  }
  for (const c of candidats) {
    try {
      const r = await $.process.run(['git', '-C', c, 'remote', 'get-url', 'origin'], { timeoutMs: 5000 })
      if (r.exitCode !== 0 || !r.stdout.includes(DEPOT_NOM)) continue
      const top = await $.process.run(['git', '-C', c, 'rev-parse', '--show-toplevel'], { timeoutMs: 5000 })
      if (top.exitCode === 0) return top.stdout.trim()
    } catch {
      // pas un dépôt git
    }
  }
  return null
}

/** « propriétaire/dépôt » sur GitHub, lu dans l'adresse du dépôt cloné ; celui de Pascal par défaut. */
export async function depotGithub($: Moteur, depot: string | null): Promise<string> {
  if (!depot) return DEPOT_GITHUB
  try {
    const r = await $.process.run(['git', '-C', depot, 'remote', 'get-url', 'origin'], { timeoutMs: 5000 })
    const m = r.stdout.trim().match(/([^/:]+)\/([^/]+?)(?:\.git)?$/)
    if (m) return `${m[1]}/${m[2]}`
  } catch {
    // adresse illisible
  }
  return DEPOT_GITHUB
}

/** `gh api …` ; jamais d'exception : le code de sortie dit si l'appel a abouti. */
export async function gh($: Moteur, args: string[], corps?: unknown): Promise<{ ok: boolean; sortie: string }> {
  try {
    const r = await $.process.run(['gh', 'api', ...args, ...(corps === undefined ? [] : ['--input', '-'])], {
      stdin: corps === undefined ? undefined : JSON.stringify(corps),
      timeoutMs: 30000,
    })
    return { ok: r.exitCode === 0, sortie: r.exitCode === 0 ? r.stdout : r.stderr || r.stdout }
  } catch (err) {
    return { ok: false, sortie: String(err) }
  }
}

/** Un fichier de la branche « relais » : par l'API de GitHub (lecture seule, sans clone), sinon par le clone local. */
export async function lireRelais($: Moteur, repo: string, chemin: string, depot: string | null = null): Promise<string | null> {
  const brut = await gh($, ['-H', 'Accept: application/vnd.github.raw+json', `repos/${repo}/contents/${chemin}?ref=${BRANCHE_RELAIS}`])
  if (brut.ok) return brut.sortie
  if (!depot) return null
  try {
    await $.process.run(['git', '-C', depot, 'fetch', '-q', 'origin', BRANCHE_RELAIS], { timeoutMs: 30000 })
    const r = await $.process.run(['git', '-C', depot, 'show', `origin/${BRANCHE_RELAIS}:${chemin}`], { timeoutMs: 10000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

const LISEZMOI = [
  '# Branche « relais »',
  '',
  'Cette branche ne porte pas le site : elle garde le point de reprise que les sessions de Claude se passent.',
  '',
  '- `RELAIS.md` : où on en est (branche, PR, décisions en attente, prochaine action), écrit par le mod « relais ».',
  '- `COMPACTIONS.md` : les derniers résumés de compaction, écrits par le mod « memoire-compaction ».',
  '',
  'Le journal des décisions (`JOURNAL_DES_DECISIONS.md`, sur `main`) fait foi ; ce relais dit seulement où on en est.',
  '',
].join('\n')

const IDENTITE = {
  GIT_AUTHOR_NAME: 'Claude (relais)',
  GIT_AUTHOR_EMAIL: 'noreply@anthropic.com',
  GIT_COMMITTER_NAME: 'Claude (relais)',
  GIT_COMMITTER_EMAIL: 'noreply@anthropic.com',
}

/**
 * Écrit un fichier sur la branche « relais » par la plomberie de git, sans toucher à la copie de travail ni à la
 * branche en cours : un objet, un arbre, un commit dont le parent est le dernier relais (aucun la première fois),
 * puis `git push origin <commit>:refs/heads/relais`. Demande le clone du dépôt ; « inchangé » quand le texte y est.
 */
export async function ecrireRelais(
  $: Moteur,
  depot: string | null,
  chemin: string,
  texte: string,
  message: string,
): Promise<'écrit' | 'inchangé' | string> {
  if (!depot) return 'échec : le dépôt n’est pas cloné dans cette session'
  const git = (args: string[], stdin?: string) =>
    $.process.run(['git', '-C', depot, ...args], { stdin, env: IDENTITE, timeoutMs: 60000 })
  let derniere = ''
  for (let essai = 0; essai < 3; essai++) {
    const f = await git(['fetch', '-q', 'origin', `+refs/heads/${BRANCHE_RELAIS}:refs/remotes/origin/${BRANCHE_RELAIS}`])
    const parent = f.exitCode === 0 ? (await git(['rev-parse', `origin/${BRANCHE_RELAIS}`])).stdout.trim() : ''
    const entrees = new Map<string, string>()
    if (parent) {
      for (const ligne of (await git(['ls-tree', parent])).stdout.split('\n').filter(Boolean)) {
        const nom = ligne.split('\t')[1] ?? ''
        entrees.set(nom, ligne)
      }
    } else {
      const l = (await git(['hash-object', '-w', '--stdin'], LISEZMOI)).stdout.trim()
      entrees.set('LISEZMOI.md', `100644 blob ${l}\tLISEZMOI.md`)
    }
    const objet = (await git(['hash-object', '-w', '--stdin'], texte)).stdout.trim()
    if (!objet) return 'échec : git hash-object'
    const avant = entrees.get(chemin)
    if (avant && avant.includes(` ${objet}\t`)) return 'inchangé'
    entrees.set(chemin, `100644 blob ${objet}\t${chemin}`)
    const arbre = (await git(['mktree'], `${[...entrees.values()].join('\n')}\n`)).stdout.trim()
    const commit = (await git(['commit-tree', arbre, ...(parent ? ['-p', parent] : []), '-m', message])).stdout.trim()
    if (!arbre || !commit) return 'échec : git mktree ou commit-tree'
    const p = await git(['push', '-q', 'origin', `${commit}:refs/heads/${BRANCHE_RELAIS}`])
    if (p.exitCode === 0) return 'écrit'
    derniere = (p.stderr || p.stdout).trim().slice(0, 200)
  }
  return `échec : ${derniere}`
}

/** La date et l'heure à la Martinique, « 26/10/2026 09:40 ». */
export function dateMartinique(ms: number): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'America/Martinique',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(new Date(ms))
      .replace(',', '')
  } catch {
    return new Date(ms - 4 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
  }
}

export type Option = { lettre: string; texte: string; defaut: boolean }
export type Decision = { n: string; question: string; options: Option[] }

/** Les décisions 🔶 d'un message au format « réponses-actionnables » : « 🔶 1. Question », puis « - a (par défaut) : … ». */
export function lireDecisions(texte: string): Decision[] {
  const out: Decision[] = []
  let cur: Decision | null = null
  for (const ligne of texte.split('\n')) {
    const tete = ligne.match(/^\s*🔶\s*(\d+)\s*[.)]\s*(.+)$/u)
    if (tete) {
      cur = { n: tete[1] ?? '', question: (tete[2] ?? '').replace(/\*\*/g, '').trim(), options: [] }
      out.push(cur)
      continue
    }
    if (!cur) continue
    const opt = ligne.match(/^\s*[-•*]\s*(?:\*\*)?([a-e])\b\s*(?:\(([^)]*)\))?\s*(?:\*\*)?\s*[:：]\s*(.+)$/u)
    if (opt) {
      cur.options.push({
        lettre: opt[1] ?? '',
        texte: (opt[3] ?? '').replace(/\*\*/g, '').trim(),
        defaut: /d[ée]faut/i.test(opt[2] ?? ''),
      })
      continue
    }
    if (/^\s*$/.test(ligne)) continue
    if (/^\s*(➡️|⚠️)/u.test(ligne) || (!/^\s/.test(ligne) && cur.options.length > 0)) cur = null
  }
  return out.filter(d => d.options.length > 0)
}

/** La ligne ➡️ d'un message (l'action unique), ou null. */
export function lireAction(texte: string): string | null {
  const m = texte.match(/^\s*➡️\s*(.+)$/mu)
  return m ? (m[1] ?? '').replace(/\*\*/g, '').trim() : null
}

/**
 * Le texte que Pascal a tapé, sans ce que l'hôte glisse devant ou derrière : des blocs
 * `<system-reminder>…</system-reminder>` (l'heure d'envoi, des rappels). Sans ce nettoyage, le relais gardait
 * « <system-reminder>The user's timezone is… </system-reminder> 1 » au lieu de « 1a 2a 3a 4a 5a » (vu le 28/10/2026).
 */
export function texteDePascal(texte: string): string {
  return texte
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Les réponses « 1a 2b » d'un message de Pascal : { "1": "a", "2": "b" }. */
export function lireReponses(texte: string): Record<string, string> {
  const out: Record<string, string> = {}
  texte = texteDePascal(texte)
  for (const m of texte.matchAll(/(?:^|[\s,;])(\d)\s?([a-e])(?=$|[\s,;.!])/gimu)) {
    out[m[1] ?? ''] = (m[2] ?? '').toLowerCase()
  }
  return out
}

/** Une décision écrite comme dans les réponses : « 🔶 1. Question » puis ses options, le défaut marqué. */
export function ecrireDecision(d: Decision): string {
  return [
    `🔶 ${d.n}. ${d.question}`,
    ...d.options.map(o => `- ${o.defaut ? `**${o.lettre} (par défaut)**` : o.lettre} : ${o.texte}`),
  ].join('\n')
}
