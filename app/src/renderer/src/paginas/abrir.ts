// "Abra a página Rotinas / Agentes / Kanban", sem montar a página antes da hora. Quem pede (menu do cartão, barra de
// ferramentas, paleta) guarda o pedido aqui e troca de página; a página, ao montar, pega o pedido pendente (e, se
// já estiver montada, é avisada). Módulo pequeno de propósito: é importado pelo quadro sem puxar as páginas.
import { irParaPagina } from '../casca/paginas'

export type AbaAgentes = 'agora' | 'funcoes' | 'presets' | 'partituras'

let cartao: string | null = null
let aba: AbaAgentes | null = null
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

/** Abre a página Rotinas; com `cartaoId`, o formulário de nova rotina já vem com esse cartão escolhido. */
export function abrirRotinas(cartaoId?: string): void {
  cartao = cartaoId ?? null
  if (!irParaPagina('rotinas')) cartao = null
  else avisar()
}

/** Abre a página Agentes, na aba pedida (padrão: os agentes de agora). */
export function abrirAgentes(qual: AbaAgentes = 'agora'): void {
  aba = qual
  if (!irParaPagina('agentes')) aba = null
  else avisar()
}

/** O que abrir no Kanban: só as tarefas de um agente (id do cartão) e/ou o painel de uma tarefa. */
export interface PedidoDoKanban {
  responsavel?: string
  numero?: number
}

let kanban: PedidoDoKanban | null = null

/** Abre a página Kanban; com `responsavel`, já filtrada pelas tarefas desse agente; com `numero`, com a tarefa aberta. */
export function abrirKanban(pedido: PedidoDoKanban = {}): void {
  kanban = pedido
  if (!irParaPagina('kanban')) kanban = null
  else avisar()
}

/** Entrega o pedido do Kanban (uma vez) e o esquece. */
export function pegarPedidoDoKanban(): PedidoDoKanban | null {
  const p = kanban
  kanban = null
  return p
}

/** Entrega o cartão pedido (uma vez) e o esquece. */
export function pegarCartaoPedido(): string | null {
  const c = cartao
  cartao = null
  return c
}

/** Entrega a aba pedida (uma vez) e a esquece. */
export function pegarAbaPedida(): AbaAgentes | null {
  const a = aba
  aba = null
  return a
}

/** Avisa a página já montada de que chegou um pedido. A função devolvida cancela. */
export function aoChegarPedidoDePagina(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}
