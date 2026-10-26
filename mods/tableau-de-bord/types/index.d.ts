export type PR = { num: number; ref: string; titre: string; ci: string; fusion: string }
export type Tableau = {
  quand: string
  depot: string
  branche: string
  commit: string
  sale: number
  prs: PR[]
  erreur?: string
}
export type Controle = { nom: string; code: number; ligne: string }

declare module 'claude-code' {
  interface PluginState {
    'tableau-de-bord': {
      tableau: Shaped<Tableau | null>
      controles: Shaped<Controle[]>
      occupe: string
    }
  }
}
