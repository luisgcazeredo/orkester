import { webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { CANAIS_AGENTES, type PedidoDoAgente, type RespostaAoAgente } from '../shared/api'
import { abrirJanela, donoDe } from './janelas'

export const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---------- pedidos que mexem no quadro: vão para a janela dona do espaço ----------

export const respostas = new Map<string, { janela: number; resolver: (r: RespostaAoAgente) => void }>()
/** Janelas que já instalaram o atendente do renderer. */
export const janelasProntas = new Set<number>()

export function janelaDoEspaco(espacoId: string) {
  const dono = donoDe(espacoId)
  const janela = dono !== undefined ? webContents.fromId(dono) : undefined
  return janela && !janela.isDestroyed() ? janela : undefined
}

/** Uma janela reservada ainda está carregando: pedido antes do atendente se perderia no IPC. */
export async function abrirJanelaPronta(espacoId: string): Promise<{ jaEstavaAberta: boolean }> {
  const jaEstavaAberta = !!janelaDoEspaco(espacoId)
  if (!abrirJanela(espacoId)) throw new Error('não consegui abrir uma janela para este espaço')
  for (const limite = Date.now() + 10_000; Date.now() < limite; await esperar(50)) {
    const janela = janelaDoEspaco(espacoId)
    if (janela && janelasProntas.has(janela.id)) return { jaEstavaAberta }
  }
  throw new Error('a janela do espaço abriu, mas não ficou pronta para atender em 10 s; tente de novo')
}

export function pedirAJanela(pedido: PedidoDoAgente): Promise<RespostaAoAgente> {
  const janela = janelaDoEspaco(pedido.espacoId)
  if (!janela) {
    return Promise.resolve({ ok: false, erro: 'o espaço deste terminal não está aberto em nenhuma janela; peça ao usuário para abri-lo' })
  }
  const id = randomUUID()
  return new Promise((resolver) => {
    const limite = setTimeout(() => {
      respostas.delete(id)
      resolver({ ok: false, erro: 'a janela do app não respondeu' })
    }, 10_000)
    respostas.set(id, {
      janela: janela.id,
      resolver: (r) => {
        clearTimeout(limite)
        respostas.delete(id)
        resolver(r)
      }
    })
    janela.send(CANAIS_AGENTES.pedido, id, pedido)
  })
}
