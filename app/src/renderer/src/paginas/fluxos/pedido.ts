// Pedidos à página Fluxos que vêm de fora dela: a Paleta abre um fluxo pelo nome, e o clique no ícone "Fluxos" da barra, com
// o editor aberto, volta à lista. Mesmo desenho de `paginas/abrir.ts`: quem pede guarda o pedido aqui e troca de página; a
// página, ao montar, pega o pedido pendente (e, se já estiver montada, é avisada). Módulo pequeno e sem React, para a Casca e
// a Paleta o importarem sem puxar a página (que é preguiçosa). A `pedido.prova` roda no Node.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { irParaPagina } from '../../casca/paginas.ts'

export type PedidoDeFluxos = { tipo: 'abrir'; espacoId: string; fluxoId: string } | { tipo: 'lista' }

let pendente: PedidoDeFluxos | null = null
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

/** Abre a página Fluxos já com esse fluxo aberto no editor (a Paleta). Página que não existe: não guarda nada. */
export function abrirFluxo(espacoId: string, fluxoId: string): void {
  pendente = { tipo: 'abrir', espacoId, fluxoId }
  if (!irParaPagina('fluxos')) pendente = null
  else avisar()
}

/** O clique no ícone "Fluxos" com a página já em tela: volta à lista (a guarda de rascunho é consultada por quem trata). */
export function voltarParaAListaDeFluxos(): void {
  pendente = { tipo: 'lista' }
  avisar()
}

/** Entrega o pedido (uma vez) e o esquece. */
export function pegarPedidoDeFluxos(): PedidoDeFluxos | null {
  const p = pendente
  pendente = null
  return p
}

/** Avisa a página já montada de que chegou um pedido. A função devolvida cancela. */
export function aoChegarPedidoDeFluxos(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}
