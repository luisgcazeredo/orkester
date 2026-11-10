import type { ApiOrkester } from '../../shared/api'
import type * as loja from './estado/loja'

declare global {
  interface Window {
    ork: ApiOrkester
    /** Só existe no autoteste: acesso às ações do quadro. */
    __teste?: { loja: typeof loja }
  }
}

export {}

declare global {
  /** A versão do app, posta pelo bundler a partir do package.json (ver electron.vite.config.ts). */
  const __VERSAO__: string
}
