// decisions-en-attente — une bande au-dessus de la zone de saisie : les décisions 🔶 que Pascal n'a pas encore
// tranchées, chacune avec ses options, le défaut marqué ★. Un clic écrit la réponse dans la zone de saisie
// (« 1b 2a ») ; Pascal n'a plus qu'à envoyer. Les décisions viennent de la dernière réponse de Claude qui en pose,
// ou, au démarrage, du relais de la session précédente (RELAIS.md, branche « relais »).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Decision } from '../types'
import { depotGithub, lireDecisions, lireRelais, lireReponses, trouverDepot } from './commun'

type Moteur = EngineInterface

const liste = atom({ plugin: 'decisions-en-attente', key: 'liste' } as const, [] as Decision[], { shape: 'decisions-1' })
const choix = atom({ plugin: 'decisions-en-attente', key: 'choix' } as const, {} as Record<string, string>)
const masque = atom({ plugin: 'decisions-en-attente', key: 'masque' } as const, false)

const couper = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

async function poser($: Moteur, decisions: Decision[]) {
  if (!decisions.length) return
  await update($, liste, () => decisions)
  await update($, choix, () => ({}))
  await update($, masque, () => false)
}

/** Met la réponse composée (« 1b 2a ») en tête de la zone de saisie, sans toucher au reste de ce que Pascal a tapé. */
async function remplir($: Moteur, c: Record<string, string>) {
  const reponse = Object.keys(c)
    .sort()
    .map(k => `${k}${c[k]}`)
    .join(' ')
  const boite = await $.prompt.read()
  const reste = boite.text.replace(/(?:^|\s)\d[a-e](?=\s|$)/g, ' ').trim()
  await $.prompt.fill({ text: reste ? `${reponse} ${reste}` : `${reponse} `, mode: 'replace' })
}

async function choisir($: Moteur, n: string, lettre: string) {
  const avant = await read($, choix)
  const c = { ...avant, [n]: lettre }
  await update($, choix, () => c)
  await remplir($, c)
}

async function lesDefauts($: Moteur) {
  const d = await read($, liste)
  const c: Record<string, string> = {}
  for (const x of d) {
    const o = x.options.find(y => y.defaut) ?? x.options[0]
    if (o) c[x.n] = o.lettre
  }
  await update($, choix, () => c)
  await remplir($, c)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'decisions',
      description: 'Remontre la bande des décisions en attente (si elle a été masquée).',
    })
    const deja = await read($, liste)
    if (!deja.length) {
      try {
        const depot = await trouverDepot($)
        const relais = (await lireRelais($, await depotGithub($, depot), 'RELAIS.md', depot)) ?? ''
        const partie = relais.split('## Décisions en attente')[1]?.split('\n## ')[0] ?? ''
        await poser($, lireDecisions(partie))
      } catch {
        // pas de relais : la bande attend la première réponse qui pose une décision
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.answer) await poser($, lireDecisions(e.answer))
    return next(e)
  })

  on('tool.call', { tool: 'SendUserMessage' }, async ($, e, next) => {
    const ran = await next(e)
    const message = (e as unknown as { message?: string }).message
    if (typeof message === 'string') await poser($, lireDecisions(message))
    return ran
  })

  on('prompt.submit', async ($, e, next) => {
    const reponses = lireReponses(e.text ?? '')
    if (Object.keys(reponses).length) {
      await update($, liste, l => l.filter(d => !(d.n in reponses)))
      await update($, choix, () => ({}))
    }
    return next(e)
  })

  on('command.run', { command: 'decisions' }, async $ => {
    await update($, masque, () => false)
    const n = (await read($, liste)).length
    return { text: n ? `${n} décision(s) en attente, au-dessus de la zone de saisie.` : 'Aucune décision en attente.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, liste)
    if (e.props.hasSurvey || d.length === 0 || (await read($, masque))) return next(e)
    const c = await read($, choix)
    const { Box, Button, Text } = $.ui.resolve(e)
    const large = Math.max(30, e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {d.slice(0, 4).map(x => (
          <Box key={`d${x.n}`} flexDirection="column">
            <Text bold>{couper(`🔶 ${x.n}. ${x.question}`, large)}</Text>
            <Box flexDirection="row">
              {x.options.map(o => (
                <Button
                  key={`o${x.n}${o.lettre}`}
                  label={couper(`${x.n}${o.lettre}${o.defaut ? ' ★' : ''} ${o.texte}`, 34)}
                  variant={c[x.n] === o.lettre ? 'primary' : 'secondary'}
                  onPress={() => choisir($, x.n, o.lettre)}
                />
              ))}
            </Box>
          </Box>
        ))}
        <Box flexDirection="row">
          <Button key="defauts" label="Prendre les défauts ★" onPress={() => lesDefauts($)} />
          <Button key="masquer" label="Masquer" onPress={() => update($, masque, () => true)} />
          <Text dimColor> puis Entrée pour envoyer</Text>
        </Box>
      </Box>
    )
  })
}
