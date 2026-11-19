// Kanban (página, F1): filtros, busca e painel aberto de cada espaço, na memória desta janela (não vai para o disco).
// "Ir ao cartão" e voltar mantém tudo; trocar de espaço pelo seletor e voltar recupera o estado daquele espaço. Sem
// `manterMontada`: a página desmonta e lê daqui ao montar. Puro (sem DOM, sem React): a `estadoDaPagina.prova` roda no Node.
import type { FiltroDaPagina } from './filtros'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { FILTRO_INICIAL } from './filtros.ts'

export interface EstadoDaPagina {
  filtro: FiltroDaPagina
  /** Número da tarefa com o painel aberto. A lixeira não se guarda (é de passagem). */
  painel: number | null
}

const INICIAL: EstadoDaPagina = { filtro: FILTRO_INICIAL, painel: null }

const porEspaco = new Map<string, EstadoDaPagina>()

/** O estado guardado do espaço (ou o inicial, para um espaço que a página ainda não viu nesta janela). */
export function lerEstadoDaPagina(espacoId: string): EstadoDaPagina {
  return porEspaco.get(espacoId) ?? INICIAL
}

/** Grava (por cima) o estado do espaço. */
export function gravarEstadoDaPagina(espacoId: string, estado: EstadoDaPagina): void {
  porEspaco.set(espacoId, { filtro: { ...estado.filtro }, painel: estado.painel })
}

/**
 * O painel que ainda vale, dado o que existe no arquivo: a tarefa sumiu (apagada por um agente, por exemplo) → fecha,
 * calado. `numeros` null = a leitura ainda não chegou, então nada se fecha por enquanto.
 */
export function painelQueVale(painel: number | null, numeros: readonly number[] | null): number | null {
  if (painel === null || numeros === null) return painel
  return numeros.includes(painel) ? painel : null
}

/** Só para a prova: esquece tudo. */
export function esquecerEstadosDaPagina(): void {
  porEspaco.clear()
}
