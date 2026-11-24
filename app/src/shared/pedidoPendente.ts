// O selo "pedido?" do cartão (1.9.6): quando o primeiro pedido não chegou a ser digitado, o usuário pode mandar digitar de novo.
// Só a decisão mora aqui (sem janela, sem Electron), para a prova poder exercitá-la.

/** Estados do aviso em que NADA foi digitado: repetir não duplica o pedido. */
const NADA_FOI_DIGITADO = new Set(['nao-pronto', 'sem-sessao'])

/**
 * Pode oferecer "Digitar agora"? Só quando o pedido não foi digitado. `ficou` (escrito no campo e não enviado),
 * `incerto` (pode ter saído) e `erro` (não dá para saber) ficam só com "dispensar": digitar de novo repetiria o pedido.
 */
export function podeDigitarAgora(status: string | undefined): boolean {
  return status !== undefined && NADA_FOI_DIGITADO.has(status)
}

/**
 * O texto a digitar quando o usuário clica em "Digitar agora", ou `null` se não há o que digitar (sem aviso, aviso
 * de outro tipo, ou o pedido já foi dispensado e esquecido).
 */
export function pedidoParaDigitarAgora(status: string | undefined, texto: string | undefined): string | null {
  if (!podeDigitarAgora(status)) return null
  return texto && texto.trim() ? texto : null
}
