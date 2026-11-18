import { type QuandoDaRotina, type Rotina } from '../../../shared/modelo'
import { type AvisoDePausa, type AvisoRotina } from '../../../shared/api'
import { MAX_ROTINAS, novaRotina } from '../../../shared/rotinas'
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

/** O principal pausou ou religou uma rotina deste espaço (pela página Rotinas): guarda no espaço. */
export function aplicarPausa(aviso: AvisoDePausa): void {
  if (!estado.espaco || estado.espaco.id !== aviso.espacoId) return
  if (!rotinasDoEspaco().some((r) => r.id === aviso.id)) return
  mudarRotina(aviso.id, { pausada: aviso.pausada, proxima: aviso.proxima })
}
