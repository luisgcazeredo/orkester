import { useSyncExternalStore } from 'react'
import { tarefasDosAgentes, type TarefaDoAgente } from '../../../../shared/kanban'
import { ouvirAvisos } from './usarKanban'

// Em que tarefa cada cartão do quadro está (1.9.5, S5): o selo "#N" no cabeçalho do agente. Uma leitura do kanban
// do espaço da janela, refeita só quando ele muda (aviso `{ tipo: 'kanban' }`: agente, MCP ou página gravou). Sem
// relógio: quem está em quê só muda por gravação. Fora da loja, como as caixas: muda sozinho e não entra no desfazer.

let espacoAtual: string | null = null
let porAgente: Record<string, TarefaDoAgente[]> = {}
let geracao = 0
const ouvintes = new Set<() => void>()
let soltarAviso: (() => void) | null = null

const avisar = (): void => ouvintes.forEach((o) => o())

function carregar(espacoId: string): void {
  const minha = ++geracao
  window.ork.kanban.ler(espacoId).then(
    (l) => {
      // uma leitura que voltou depois de outra (ou de trocar de espaço) não vale
      if (minha !== geracao || espacoId !== espacoAtual) return
      porAgente = tarefasDosAgentes(l.arquivo)
      avisar()
    },
    () => {}
  )
}

/** A janela abriu (ou trocou de) espaço: lê o kanban dele e passa a ouvir as mudanças. */
export function ligarTarefasNoQuadro(espacoId: string | undefined): void {
  if (!espacoId || espacoId === espacoAtual) return
  espacoAtual = espacoId
  porAgente = {}
  avisar()
  soltarAviso ??= ouvirAvisos((id) => {
    if (id === espacoAtual) carregar(id)
  })
  carregar(espacoId)
}

const assinar = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

/** As tarefas abertas do cartão (a que ele pegou por último primeiro), ou undefined se ele não está em nenhuma. */
export function usarTarefasDoCartao(id: string): TarefaDoAgente[] | undefined {
  return useSyncExternalStore(assinar, () => porAgente[id])
}
