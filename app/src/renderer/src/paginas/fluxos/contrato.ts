// Contrato da lista de Fluxos (plano §10): o que a página pede ao processo principal. Os tipos moram em
// `shared/api.ts` (o preload e a tela usam os mesmos); aqui só os nomes que a F1 já usa.
import type { AoMudarFluxos, ApiFluxos, FluxoInvalido, ListaDeFluxos, ResultadoDeFluxo, ResumoDeFluxo } from '../../../../shared/api'
import type { CriadaPor, EditadaPor, MotivoDoDesligado, PastaDeFluxos, ResumoDaExecucao, TipoDeNo } from '../../../../shared/fluxos/tipos'

export type { AoMudarFluxos, ApiFluxos, FluxoInvalido, ListaDeFluxos, ResumoDeFluxo }
export type { CriadaPor, EditadaPor, MotivoDoDesligado, PastaDeFluxos, ResumoDaExecucao, TipoDeNo }
export type { ResultadoDaExecucao } from '../../../../shared/fluxos/tipos'

export type Resultado = ResultadoDeFluxo
