import type { ApiOrkester } from '../../shared/api'
import type * as loja from './estado/loja'
import type * as casca from './casca/paginas'

declare global {
  interface Window {
    ork: ApiOrkester
    /** Só existe no autoteste: acesso às ações do quadro. */
    __teste?: { loja: typeof loja; casca: Pick<typeof casca, 'registrarPagina' | 'irParaPagina' | 'paginaAtiva' | 'paginasRegistradas' | 'trocarPaginasExtras'> }
  }
}

export {}

declare global {
  /** A versão do app, posta pelo bundler a partir do package.json (ver electron.vite.config.ts). */
  const __VERSAO__: string
}
