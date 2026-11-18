// "Abra X" para o Leitor, sem montar o Leitor antes da hora. Quem pede (o visor de código) guarda o pedido aqui e
// troca de página; o Leitor, ao montar, pega o pedido pendente (e, se já estiver montado, é avisado). Módulo puro e
// pequeno de propósito: o visor o importa sem puxar o Leitor nem o markdown-it.
//
// O pedido é só uma INTENÇÃO, não confiável: `link` vem do texto de um arquivo. Quem resolve e confere o alvo é o
// principal (`leitor:ler` e `leitor:ler-link`), nunca este módulo nem o renderer.

export interface PedidoAoLeitor {
  /** O .md de onde o pedido sai (caminho absoluto): é o que se abre, ou a origem de `link`. */
  de: string
  /** Link relativo (`data-md`) clicado dentro de `de`: abre o alvo dele em vez de `de`. */
  link?: string
}

let pendente: PedidoAoLeitor | null = null
const ouvintes = new Set<() => void>()

export function pedirAoLeitor(pedido: PedidoAoLeitor): void {
  pendente = pedido
  ouvintes.forEach((o) => o())
}

/** Entrega o pedido pendente e o esquece (cada pedido é atendido uma vez). */
export function pegarPedido(): PedidoAoLeitor | null {
  const p = pendente
  pendente = null
  return p
}

/**
 * Guarda o pedido e troca para a página do Leitor com `ir`. Se a troca não acontece (página não registrada), o pedido
 * é descartado, para não virar uma abertura "fantasma" quando o Leitor montar mais tarde. Devolve se trocou.
 */
export function pedirEIr(pedido: PedidoAoLeitor, ir: (pagina: string) => boolean): boolean {
  pedirAoLeitor(pedido)
  const foi = ir('leitor')
  if (!foi) pegarPedido()
  return foi
}

/** Avisa o Leitor já montado de que chegou um pedido. A função devolvida cancela. */
export function aoChegarPedido(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}

const chave = (c: string): string => c.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * A raiz do Leitor (espaço ou fixada) que contém `caminho`; a mais específica se houver mais de uma. Só pelo texto:
 * o principal confere o caminho real ao ler. Nenhuma contém: null (o Leitor avisa e NÃO fixa nada sozinho).
 */
export function raizDoCaminho(raizes: readonly string[], caminho: string): string | null {
  const alvo = chave(caminho)
  let melhor: string | null = null
  for (const r of raizes) {
    const k = chave(r)
    if (k && alvo.startsWith(`${k}/`) && (!melhor || k.length > chave(melhor).length)) melhor = r
  }
  return melhor
}

export const AVISO_FORA_DAS_PASTAS = 'Esse arquivo está fora das pastas do Leitor. Fixe a pasta dele (Fixar pasta…) para abri-lo aqui.'

/** Há um pedido esperando o Leitor? (só espia, não consome.) O pedido ganha do "voltar ao que estava aberto". */
export function haPedidoPendente(): boolean {
  return pendente !== null
}

/** A releitura da vigia só vale se o arquivo vigiado ainda é o que está em tela (não passa à frente de outra abertura). */
export function vigiaAindaVale(mostrado: string | null | undefined, vigiado: string): boolean {
  return !!mostrado && chave(mostrado) === chave(vigiado)
}
