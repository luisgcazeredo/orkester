// Atalhos do Leitor, num módulo pequeno à parte: a Casca registra a página com isto sem puxar o Leitor inteiro
// (o Leitor, com o markdown-it, só carrega quando a página abre).

/** Ponte dos atalhos da página (R6: chamados só com ela ativa) para o componente montado. */
export const acoesDoLeitor = { voltar: (): void => {}, buscar: (): void => {}, limparBusca: (): boolean => false }

export function atalhosDoLeitor(e: KeyboardEvent): void {
  if (document.querySelector('.dialogo-fundo')) return // diálogo aberto é dono do teclado (Esc fecha o diálogo, não a busca)
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    acoesDoLeitor.buscar()
  } else if (e.key === 'Escape') {
    if (acoesDoLeitor.limparBusca()) e.preventDefault()
  } else if (e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    acoesDoLeitor.voltar()
  }
}
