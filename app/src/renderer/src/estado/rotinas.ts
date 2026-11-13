import { type QuandoDaRotina, type ResultadoDaRotina, type Rotina } from '../../../shared/modelo'
import { type AvisoRotina } from '../../../shared/api'
import { MAX_ROTINAS, novaRotina, proximaDe } from '../../../shared/rotinas'
import { novoId } from './nos'
import { estado, mudarEspaco } from './nucleo'

// ---------- rotinas (o que o app digita sozinho num cartão) ----------

/** Lista vazia constante: devolver um array novo a cada leitura põe o useSyncExternalStore em laço. */
const SEM_ROTINAS: Rotina[] = []

/** As rotinas do espaço aberto. */
export function rotinasDoEspaco(): Rotina[] {
  return estado.espaco?.rotinas ?? SEM_ROTINAS
}

/**
 * Guarda a lista de rotinas no espaço (fora do desfazer: é configuração, não quadro) e manda ao processo
 * principal, que é quem conta o tempo e digita.
 */
function guardarRotinas(lista: Rotina[]): void {
  mudarEspaco((e) => ({ ...e, rotinas: lista }), false)
}

/** Cria uma rotina. Devolve a queixa em texto quando não dá. */
export function criarRotina(dados: { nome: string; terminal: string; texto: string; quando: QuandoDaRotina }): string | null {
  if (!estado.espaco) return 'nenhum espaço aberto'
  const lista = rotinasDoEspaco()
  if (lista.length >= MAX_ROTINAS) return `este espaço já tem ${lista.length} rotinas (o limite é ${MAX_ROTINAS})`
  const feita = novaRotina(dados, { novoId, agora: () => new Date() })
  if (typeof feita === 'string') return feita
  guardarRotinas([...lista, feita])
  return null
}

export function mudarRotina(id: string, parcial: Partial<Rotina>): void {
  guardarRotinas(rotinasDoEspaco().map((r) => (r.id === id ? { ...r, ...parcial } : r)))
}

export function apagarRotina(id: string): void {
  guardarRotinas(rotinasDoEspaco().filter((r) => r.id !== id))
}

/** Pausa ou volta a rotina. Pausada, ela some do relógio sem perder o que já aconteceu. */
export function alternarPausaDaRotina(id: string): void {
  const rotina = rotinasDoEspaco().find((r) => r.id === id)
  if (!rotina) return
  // ao voltar, a próxima vez é contada de agora: uma rotina pausada por dias não dispara tudo de uma vez
  mudarRotina(id, {
    pausada: !rotina.pausada,
    ...(rotina.pausada ? { proxima: proximaDe(rotina.quando, new Date()).toISOString() } : {})
  })
}

/** Dispara agora, sem mexer no relógio (o botão "testar"). */
export async function testarRotina(id: string): Promise<ResultadoDaRotina> {
  const espaco = estado.espaco
  if (!espaco) return 'sem-cartao'
  return window.ork.rotinas.testar(espaco.id, id)
}

/** O processo principal digitou (ou pulou): guarda o que aconteceu e a próxima vez. */
export function anotarDisparo(aviso: AvisoRotina): void {
  if (!estado.espaco || estado.espaco.id !== aviso.espacoId) return
  const lista = rotinasDoEspaco()
  if (!lista.some((r) => r.id === aviso.id)) return
  guardarRotinas(
    lista.map((r) => (r.id === aviso.id ? { ...r, vezes: r.vezes + (aviso.resultado === 'rodou' ? 1 : 0), ultima: { em: aviso.em, resultado: aviso.resultado }, proxima: aviso.proxima } : r))
  )
}

/** Manda as rotinas ao processo principal quando (e só quando) elas mudam. */
let firmaRotinas = ''
export function sincronizarRotinas(): void {
  const e = estado.espaco
  const lista = e?.rotinas ?? []
  const firma = `${e?.id ?? ''}\u0002${lista.map((r) => [r.id, r.terminal, r.texto, r.proxima, r.pausada ? '1' : '', JSON.stringify(r.quando)].join('\u0001')).join('\u0002')}`
  if (firma === firmaRotinas) return
  firmaRotinas = firma
  if (e) window.ork.rotinas.definir(e.id, lista)
}
