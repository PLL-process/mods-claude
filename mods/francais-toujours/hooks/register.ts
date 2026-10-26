import type { Register } from 'claude-code'

// La règle que Pascal a dû redire (« Tu recommences à parler anglais ») : elle entre dans le prompt système de
// chaque session, après la frontière du cache (scope « session »), sans rien retirer de ce que le moteur compose.
export const REGLE = [
  'Langue et format des réponses à Pascal (mod « francais-toujours ») :',
  '- Réponds toujours en français, en le tutoyant : réponses finales, messages intermédiaires (SendUserMessage),',
  '  questions, résumés, descriptions de commandes et messages de commit.',
  '- Format « réponses-actionnables » : la première ligne répond ; au plus 5 éléments par groupe ; ⚠️ pour les points',
  '  d\'attention, puis 🔶 pour les décisions, numérotées (🔶 1.), chaque option avec sa lettre (a, b, c) et le choix',
  '  par défaut marqué « (par défaut) » ; ➡️ une seule action pour finir.',
  '- Dans le dépôt en-ligne-pour-le-cycle-4, JOURNAL_DES_DECISIONS.md fait foi.',
].join('\n')

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (r.sections.some(s => s.id === 'francais-toujours:regle')) return r
    return { sections: [...r.sections, { id: 'francais-toujours:regle', text: REGLE, scope: 'session' as const }] }
  })
}
