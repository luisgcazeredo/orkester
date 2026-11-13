import { type NoTerminal, type PresetAgente } from '../../../shared/modelo'
import { criarBanda, membrosDaBanda } from '../../../shared/quadro/bandas'
import { trocarAgente } from '../../../shared/quadro/trocar'
import { entregarPrimeiroPedido } from './espacos'
import { agora, novoId } from './nos'
import { definir, estado, mudarPlano, NADA, planoAtual, registrarHistorico } from './nucleo'

// ---------- bandas (grupos de agentes) e troca de agente ----------

/**
 * Cria uma banda: a moldura em volta dos cartões escolhidos, ou vazia em (x, y) para você arrastar agentes
 * para dentro. Quem está dentro da moldura fala com todos os outros de dentro.
 */
export function criarBandaNoQuadro(nome: string, ids: string[], onde: { x: number; y: number }): { erro: string } | { texto: string } {
  const plano = planoAtual()
  if (!plano) return { erro: 'nenhum espaço aberto' }
  const feito = criarBanda(plano, nome, ids, onde, { novoId, agora })
  if ('erro' in feito) return feito
  registrarHistorico()
  mudarPlano(() => feito.plano, false)
  definir({ selecao: { ...NADA, nos: [feito.banda.id] }, editando: null })
  return { texto: feito.texto }
}

/** Os agentes que estão dentro desta banda agora (é a moldura que diz, não uma lista guardada). */
export function membrosDaBandaAtual(bandaId: string): NoTerminal[] {
  const plano = planoAtual()
  return plano ? membrosDaBanda(plano, bandaId) : []
}

/**
 * Troca o agente de um cartão (Claude → Codex, outro modelo…) sem mexer no lugar, no nome, nas cordas nem na
 * árvore de código. O processo é reaberto pelo processo principal, e a função do cartão é entregue de novo.
 */
export function trocarAgenteDoCartao(id: string, preset: PresetAgente, porAgente = false): { erro: string } | { texto: string } {
  const plano = planoAtual()
  if (!plano) return { erro: 'nenhum espaço aberto' }
  const feito = trocarAgente(plano, { id, preset, porAgente }, estado.preferencias.funcoes ?? [], { novoId })
  if ('erro' in feito) return feito
  registrarHistorico()
  mudarPlano(() => feito.plano, false)
  // o `sincronizar` sai no mesmo instante (dentro de `definir`), então o main já tem o cartão novo quando a
  // troca chega: as mensagens para o processo principal mantêm a ordem em que foram mandadas
  window.ork.terminal.trocar(feito.id)
  if (feito.primeiroPedido) entregarPrimeiroPedido(feito.id, feito.primeiroPedido)
  return { texto: feito.texto }
}

export function definirPresets(presets: PresetAgente[]): void {
  definir({ preferencias: { ...estado.preferencias, presets } })
  void window.ork.dados.salvarPreferencias({ presets })
}
