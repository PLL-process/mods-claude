// tableau-de-bord — un panneau à côté de la conversation : la branche du dépôt, les PR ouvertes avec leur CI et
// leur état de fusion, et, sur demande, six contrôles rapides du dépôt (une trentaine de secondes). Il se met à jour
// toutes les cinq minutes, après chaque tour, et au bouton « Rafraîchir ». `/tableau` l'ouvre.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Controle, Tableau } from '../types'
import { dateMartinique, depotGithub, gh, trouverDepot } from './commun'

type Moteur = EngineInterface

const PANE = 'tableau-de-bord'
const tableau = atom({ plugin: 'tableau-de-bord', key: 'tableau' } as const, null as Tableau | null, { shape: 'tableau-1' })
const controles = atom({ plugin: 'tableau-de-bord', key: 'controles' } as const, [] as Controle[], { shape: 'controles-1' })
const occupe = atom({ plugin: 'tableau-de-bord', key: 'occupe' } as const, '')

const RAPIDES = [
  'controle_competences.py',
  'controle_regles_visibles.py',
  'controle_sigles.py',
  'controle_liens.py',
  'controle_formulations.py',
  'controle_marqueurs.py',
]

async function rafraichir($: Moteur) {
  const quand = dateMartinique(await $.clock.now())
  const depot = await trouverDepot($)
  const repo = await depotGithub($, depot)
  const t: Tableau = { quand, depot: depot ?? '', branche: '', commit: '', sale: 0, prs: [] }
  if (depot) {
    const run = (args: string[]) => $.process.run(['git', '-C', depot, ...args], { timeoutMs: 10000 })
    try {
      t.branche = (await run(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
      t.commit = (await run(['log', '-1', '--format=%h %s'])).stdout.trim().slice(0, 80)
      t.sale = (await run(['status', '--porcelain'])).stdout.split('\n').filter(Boolean).length
    } catch {
      t.branche = '?'
    }
  }
  const prs = await gh($, [`repos/${repo}/pulls?state=open&per_page=6`, '--jq', '.[] | [.number, .head.ref, .title] | @tsv'])
  if (prs.ok) {
    for (const ligne of prs.sortie.split('\n').filter(Boolean).slice(0, 6)) {
      const [num, ref, titre] = ligne.split('\t')
      const detail = await gh($, [`repos/${repo}/pulls/${num}`, '--jq', '[.head.sha, .mergeable_state] | @tsv'])
      const [sha, fusion] = detail.ok ? detail.sortie.trim().split('\t') : ['', '?']
      const ci = sha
        ? await gh($, [`repos/${repo}/commits/${sha}/check-runs`, '--jq', '[.check_runs[] | .conclusion // .status] | join(", ")'])
        : { ok: false, sortie: '' }
      t.prs.push({
        num: Number(num),
        ref: ref ?? '',
        titre: titre ?? '',
        ci: ci.ok ? ci.sortie.trim() || 'aucune' : '?',
        fusion: fusion ?? '?',
      })
    }
  } else {
    t.erreur = 'GitHub injoignable depuis cette session'
  }
  await update($, tableau, () => t)
}

async function lancerControles($: Moteur) {
  if (await read($, occupe)) return
  const depot = await trouverDepot($)
  if (!depot) {
    await update($, controles, () => [{ nom: 'dépôt', code: 2, ligne: 'Le dépôt n’est pas cloné dans cette session.' }])
    return
  }
  await update($, controles, () => [])
  for (const nom of RAPIDES) {
    await update($, occupe, () => nom)
    let c: Controle
    try {
      const r = await $.process.run(['python3', `_outils/${nom}`, '--muet'], { cwd: depot, timeoutMs: 120000 })
      const lignes = `${r.stdout}\n${r.stderr}`.split('\n').filter(l => l.trim())
      c = { nom, code: r.exitCode, ligne: (lignes.at(-1) ?? '').trim().slice(0, 140) }
    } catch (err) {
      c = { nom, code: 2, ligne: String(err).slice(0, 140) }
    }
    await update($, controles, l => [...l, c])
  }
  await update($, occupe, () => '')
}

let attente: { cancel: () => void } | null = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tableau', description: 'Ouvre le tableau de bord du lot (branche, PR, CI, contrôles).' })
    $.clock.after(2000, () => void rafraichir($).catch(() => undefined))
    $.clock.every(5 * 60 * 1000, () => void rafraichir($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'tableau' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Tableau de bord du lot' })
    void rafraichir($).catch(() => undefined)
    return { text: isPlaced ? 'Tableau de bord ouvert.' : 'Cet écran n’affiche pas de panneau latéral.' }
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      attente?.cancel()
      attente = $.clock.after(5000, () => void rafraichir($).catch(() => undefined))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await read($, tableau)
    const c = await read($, controles)
    const enCours = await read($, occupe)
    return (
      <Box flexDirection="column">
        {t === null && <Text dimColor>Lecture du dépôt et de GitHub…</Text>}
        {t !== null && (
          <Box flexDirection="column">
            <Text bold>Dépôt</Text>
            {t.depot ? (
              <Text>
                Branche {t.branche} · {t.sale ? `${t.sale} modif. non commitée(s)` : 'propre'}
              </Text>
            ) : (
              <Text dimColor>Pas cloné dans cette session.</Text>
            )}
            {t.commit !== '' && <Text dimColor>{t.commit}</Text>}
            <Text bold>PR ouvertes</Text>
            {t.erreur !== undefined && <Text color="red">{t.erreur}</Text>}
            {t.prs.length === 0 && t.erreur === undefined && <Text dimColor>Aucune.</Text>}
            {t.prs.map(p => (
              <Text>
                #{p.num} {p.titre.slice(0, 60)} — CI {p.ci} — {p.fusion === 'clean' ? 'fusionnable' : p.fusion}
              </Text>
            ))}
            <Text dimColor>Mis à jour le {t.quand}</Text>
          </Box>
        )}
        <Text bold>Contrôles rapides</Text>
        {c.length === 0 && !enCours && <Text dimColor>Pas encore lancés dans cette session.</Text>}
        {c.map(x => (
          <Text>
            {x.code === 0 ? '✅' : x.code === 1 ? '⛔' : '⚠️'} {x.nom.replace(/\.py$/, '')} — {x.ligne}
          </Text>
        ))}
        {enCours !== '' && <Text dimColor>En cours : {enCours}…</Text>}
        <Box flexDirection="row">
          <Button key="rafraichir" label="Rafraîchir" onPress={() => rafraichir($)} />
          <Button key="controles" label="Contrôles rapides" onPress={() => lancerControles($)} />
        </Box>
      </Box>
    )
  })
}
