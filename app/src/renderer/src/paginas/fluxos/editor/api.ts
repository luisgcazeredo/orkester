// Editor de Fluxos: o que o editor pede ao processo principal (plano §10). Desde a S3 é o próprio `window.ork.fluxos`;
// o editor só usa `ler`, `gravar`, `rodar` e `ligar`. O rascunho em memória que existia até a S3 saiu.
import type { ApiFluxos } from '../../../../../shared/api'

export type ApiDoEditor = Pick<ApiFluxos, 'ler' | 'gravar' | 'rodar' | 'ligar'>

export const apiDoEditor = (): ApiDoEditor => window.ork.fluxos
