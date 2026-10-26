// garde-fous — refuse, avant qu'elles partent, trois actions que le dépôt de Pascal ne veut pas :
//   1. un push sur `main` (on passe toujours par une branche et une PR) ;
//   2. une écriture dans `_archive-anciennes-versions/` (une archive est une trace, pas une ressource) ;
//   3. un commit quand `_outils/controle_competences.py` est rouge (règle d'or n°314).
// Le refus dit pourquoi et comment faire autrement. Si le garde-fou lui-même échoue, l'action passe : il ne bloque
// jamais le travail par sa propre panne.
import type { EngineInterface, Register } from 'claude-code'

import { DEPOT_NOM } from './commun'

type Moteur = EngineInterface

const ARCHIVE = '_archive-anciennes-versions'

/** Le dossier où une commande Bash s'exécute : `cd X &&`, `git -C X`, sinon celui de la session. */
async function dossierDe($: Moteur, commande: string): Promise<string> {
  const c = commande.match(/(?:^|&&|;)\s*cd\s+("([^"]+)"|'([^']+)'|(\S+))/)
  const g = commande.match(/\bgit\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))/)
  const brut = g?.[2] ?? g?.[3] ?? g?.[4] ?? c?.[2] ?? c?.[3] ?? c?.[4]
  const cwd = await $.session.cwd()
  if (!brut) return cwd
  const d = brut.replace(/^~(?=\/|$)/, '/root')
  return d.startsWith('/') ? d : `${cwd}/${d}`
}

async function git($: Moteur, dossier: string, args: string[]): Promise<string> {
  const r = await $.process.run(['git', '-C', dossier, ...args], { timeoutMs: 10000 })
  return r.exitCode === 0 ? r.stdout.trim() : ''
}

/** Un push qui vise `main` : nommé dans la commande, ou branche courante `main` sans cible nommée. */
async function pushSurMain($: Moteur, commande: string): Promise<boolean> {
  for (const morceau of commande.split(/&&|\|\||;|\n/)) {
    if (!/\bgit\b.*\bpush\b/.test(morceau)) continue
    if (/(?:^|[\s:+])(?:refs\/heads\/)?(main|master)(?=\s|$)/.test(morceau.replace(/\bgit\s+-C\s+\S+/, ''))) return true
    const args = morceau.replace(/.*\bpush\b/, '').trim().split(/\s+/).filter(a => a && !a.startsWith('-'))
    if (args.length <= 1 || args.includes('HEAD')) {
      const branche = await git($, await dossierDe($, commande), ['rev-parse', '--abbrev-ref', 'HEAD'])
      if (branche === 'main' || branche === 'master') return true
    }
  }
  return false
}

/** La commande sans le corps de ses « here-documents » (<<'EOF' … EOF) : un texte qui NOMME l'archive n'y écrit pas. */
function sansHeredocs(commande: string): string {
  return commande.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, m => m.split('\n')[0] ?? '')
}

/** Vrai quand l'archive est la CIBLE d'une écriture : redirection, tee, sed -i, destination de cp/mv, rm, touch,
 *  mkdir, ou un open(…, 'w') de Python. La lire, la chercher ou la lister passe. */
function ecritDansArchive(commande: string): boolean {
  const c = sansHeredocs(commande)
  if (!c.includes(ARCHIVE)) return false
  const A = `[^\\s'"|;&]*${ARCHIVE}`
  const motifs = [
    new RegExp(`>>?\\s*['"]?${A}`),
    new RegExp(`\\btee\\b[^|;&\\n]*${ARCHIVE}`),
    new RegExp(`\\bsed\\s+(?:-[a-zA-Z]*\\s+)*-i[^|;&\\n]*${ARCHIVE}`),
    new RegExp(`\\b(?:cp|mv|install)\\b[^|;&\\n]*\\s['"]?${A}[^\\s'"|;&]*['"]?\\s*(?:$|[|;&\\n])`),
    new RegExp(`\\b(?:rm|rmdir|touch|mkdir|truncate)\\b[^|;&\\n]*${ARCHIVE}`),
    new RegExp(`open\\([^)]*${ARCHIVE}[^)]*['"][wax]\\+?['"]`),
    new RegExp(`${ARCHIVE}[^\\n]*\\.write_text\\(`),
  ]
  return motifs.some(m => m.test(c))
}

export const register: Register = on => {
  on('tool.call', ($, e, next) => {
    const chemin = String((e as unknown as { file_path?: string; notebook_path?: string }).file_path ?? (e as unknown as { notebook_path?: string }).notebook_path ?? '')
    if ((e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') && chemin.includes(`/${ARCHIVE}/`)) {
      return {
        deny:
          `garde-fous : ${ARCHIVE}/ est une archive — une trace, pas une ressource. On n'y écrit pas : ` +
          'la version vivante est dans le dossier du thème. (Pour lever ce garde-fou, Pascal désactive le mod « garde-fous ».)',
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const commande = e.command
    try {
      if (ecritDansArchive(commande)) {
        return {
          deny:
            `garde-fous : cette commande semble écrire dans ${ARCHIVE}/ — une archive ne se modifie pas. ` +
            'Si elle ne fait que lire, sépare la lecture de toute redirection ou copie vers ce dossier.',
        }
      }
      if (/\bgit\b.*\bpush\b/.test(commande) && (await pushSurMain($, commande))) {
        return {
          deny:
            'garde-fous : pas de push sur main. Pousse une branche (git push origin <branche>) et ouvre une PR : ' +
            'c’est Pascal qui fusionne.',
        }
      }
      if (/\bgit\b.*\bcommit\b/.test(commande)) {
        const dossier = await dossierDe($, commande)
        const racine = await git($, dossier, ['rev-parse', '--show-toplevel'])
        const origine = racine ? await git($, racine, ['remote', 'get-url', 'origin']) : ''
        if (racine && origine.includes(DEPOT_NOM)) {
          const r = await $.process.run(['python3', '_outils/controle_competences.py', '--muet'], { cwd: racine, timeoutMs: 120000 })
          if (r.exitCode === 1) {
            const fin = r.stdout.split('\n').filter(l => l.trim()).slice(0, 12).join('\n')
            return {
              deny:
                'garde-fous : commit refusé — controle_competences.py est rouge (règle d’or n°314 : une compétence ' +
                `numérique se lit en toutes lettres). Corrige d'abord :\n${fin}`,
            }
          }
        }
      }
    } catch {
      // le garde-fou a échoué : l'action passe, il ne bloque jamais par sa propre panne
    }
    return next(e)
  })
}
