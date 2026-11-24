// O barramento das automações (1.9.6): quem vê um evento (a caixa, o kanban) só o põe aqui; o motor
// (main/automacoes.ts) tira e decide. Módulo sem dependências de propósito: kanban.ts e espera.ts importam isto sem
// criar ciclo com o motor, que importa os dois.
import type { EventoDeAutomacao } from '../shared/automacoes'

/** Um evento de um espaço, com a cadeia de regras que levou a ele (vazia = não veio de automação). */
export type EventoNoEspaco = { espacoId: string; evento: EventoDeAutomacao; cadeia: string[] }

/** Teto da fila: um surto de eventos não cresce sem fim (o que passa disto se perde, como o que vence com o app fechado). */
const MAX_NA_FILA = 500
let fila: EventoNoEspaco[] = []

/** Síncrono: só enfileira. Nunca lança e não espera nada. */
export function emitir(espacoId: string, evento: EventoDeAutomacao, cadeia: readonly string[] = []): void {
  try {
    if (fila.length < MAX_NA_FILA) fila.push({ espacoId, evento, cadeia: [...cadeia] })
  } catch {
    // o evento é extra: nunca atrapalha quem o viu
  }
}

/** Tira tudo o que está na fila (o motor consome um por vez). */
export function tirarEventos(): EventoNoEspaco[] {
  const saida = fila
  fila = []
  return saida
}
