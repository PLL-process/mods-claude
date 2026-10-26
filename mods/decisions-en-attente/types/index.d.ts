export type Option = { lettre: string; texte: string; defaut: boolean }
export type Decision = { n: string; question: string; options: Option[] }

declare module 'claude-code' {
  interface PluginState {
    'decisions-en-attente': {
      liste: Shaped<Decision[]>
      choix: Record<string, string>
      masque: boolean
    }
  }
}
