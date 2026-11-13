import { useSyncExternalStore } from 'react'
import type { MotivoDaFila, ResumoDaCaixa } from '../../../shared/api'

/**
 * As caixas de entrada dos cartões (recados de agentes esperando para ser digitados), como o processo
 * principal conta. Fica fora da loja de propósito: muda sozinho, não entra no desfazer nem é gravado.
 */
const caixas = new Map<string, ResumoDaCaixa>()
const ouvintes = new Set<() => void>()
let espacoCarregado: string | null = null

const avisar = (): void => ouvintes.forEach((o) => o())

window.ork.terminal.aoMudarCaixa((id, resumo) => {
  if (resumo.fila) caixas.set(id, resumo)
  else caixas.delete(id)
  avisar()
})

/** A janela abriu (ou trocou de) espaço: pega as caixas que já tinham recado antes de ela ouvir. */
export function carregarCaixas(espacoId: string | undefined): void {
  if (!espacoId || espacoId === espacoCarregado) return
  espacoCarregado = espacoId
  void window.ork.terminal.caixas(espacoId).then(
    (lista) => {
      for (const [id, r] of Object.entries(lista)) caixas.set(id, r)
      avisar()
    },
    () => {}
  )
}

const assinar = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function usarCaixa(id: string): ResumoDaCaixa | undefined {
  return useSyncExternalStore(assinar, () => caixas.get(id))
}

export const MOTIVO_CURTO: Record<MotivoDaFila, string> = {
  trabalhando: 'ele está trabalhando',
  pergunta: 'ele está numa pergunta',
  digitando: 'você está escrevendo aqui',
  rascunho: 'há texto seu no campo, ainda não enviado',
  'recado-antigo': 'um recado antigo, que o app deu por perdido, ainda está no campo',
  encerrado: 'o processo está encerrado'
}
