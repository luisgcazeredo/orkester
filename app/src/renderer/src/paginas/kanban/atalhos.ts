// Atalhos do Kanban, num módulo pequeno à parte: a Casca registra a página com isto sem puxar a página inteira
// (ela só carrega quando abre). Chamados só com a página ativa (R6). `N` nova tarefa, `/` busca, Esc fecha o painel.
import { menuAberto } from '../../ui/MenuContexto'

/** Ponte dos atalhos para o componente montado (ele troca estas funções ao montar e as desliga ao sair). */
export const acoesDoKanban = { nova: (): void => {}, buscar: (): void => {}, fechar: (): boolean => false }

const digitando = (): boolean => !!document.activeElement?.closest('input, textarea, select, [contenteditable]')

export function atalhosDoKanban(e: KeyboardEvent): void {
  if (document.querySelector('.dialogo-fundo') || menuAberto()) return // diálogo e menu são donos do teclado
  if (e.key === 'Escape') {
    // num campo, o primeiro Esc só tira o foco dele (o texto não some); o seguinte fecha o painel
    if (digitando()) {
      if (!document.activeElement?.closest('.kanban-busca')) (document.activeElement as HTMLElement | null)?.blur()
      return
    }
    if (acoesDoKanban.fechar()) e.preventDefault()
    return
  }
  if (digitando() || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault()
    acoesDoKanban.nova()
  } else if (e.key === '/') {
    e.preventDefault()
    acoesDoKanban.buscar()
  }
}
