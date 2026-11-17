import type { JSX } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Registro das páginas da casca. Hoje só existe `quadro`; as outras entram depois, sem mexer na casca.
 * Este arquivo não importa nada do app em tempo de execução (a `paginas.prova` o roda no Node, sem DOM): onde a
 * página ativa mora é plugado por `ligarPaginaAtiva` (a Casca liga ao campo `paginaAtiva` da loja).
 */
export interface Pagina {
  id: string
  titulo: string
  icone: LucideIcon
  /** Vem de fábrica (não é de um plugin). */
  nativa: boolean
  Componente: () => JSX.Element
  /** Fica montada (só escondida) quando outra página está em tela: o quadro precisa, ou os terminais cairiam junto. */
  manterMontada?: boolean
  /** Atalhos próprios da página (R6): só chamados com ela ativa. */
  atalhos?: (e: KeyboardEvent) => void
}

export const PAGINA_INICIAL = 'quadro'

export interface ArmazemDaPaginaAtiva {
  ler: () => string
  escrever: (id: string) => void
}

const paginas = new Map<string, Pagina>()

function armazemEmMemoria(): ArmazemDaPaginaAtiva {
  let id = PAGINA_INICIAL
  return { ler: () => id, escrever: (novo) => void (id = novo) }
}

let armazem = armazemEmMemoria()

/** Troca onde a página ativa é guardada. Sem argumento, volta à memória local (usado pela prova). */
export function ligarPaginaAtiva(novo?: ArmazemDaPaginaAtiva): void {
  armazem = novo ?? armazemEmMemoria()
}

// A barra de páginas desenha o que está registrado; quem registra depois (plugin) precisa avisá-la.
const ouvintesDoRegistro = new Set<() => void>()
let versaoDoRegistro = 0

export function aoMudarRegistro(ouvinte: () => void): () => void {
  ouvintesDoRegistro.add(ouvinte)
  return () => void ouvintesDoRegistro.delete(ouvinte)
}

/** Número que sobe a cada página registrada (para `useSyncExternalStore`). */
export function versaoDoRegistroDePaginas(): number {
  return versaoDoRegistro
}

/** Recusa (lança) id repetido: duas páginas com o mesmo id esconderiam uma à outra. */
export function registrarPagina(pagina: Pagina): void {
  if (paginas.has(pagina.id)) throw new Error(`Já existe uma página com o id "${pagina.id}".`)
  paginas.set(pagina.id, pagina)
  versaoDoRegistro++
  ouvintesDoRegistro.forEach((o) => o())
}

export function paginasRegistradas(): Pagina[] {
  return [...paginas.values()]
}

export function temPagina(id: string): boolean {
  return paginas.has(id)
}

export function acharPagina(id: string): Pagina | undefined {
  return paginas.get(id)
}

export function paginaAtiva(): string {
  return armazem.ler()
}

/** Único escritor da página ativa. Id não registrado: devolve `false` e não muda nada. */
export function irParaPagina(id: string): boolean {
  if (!paginas.has(id)) return false
  if (armazem.ler() !== id) armazem.escrever(id)
  return true
}

/**
 * Despacho dos atalhos: o `keydown` global chama isto, e só o `atalhos` da página ativa é chamado (R6).
 * Página sem `atalhos`, ou ativa sem registro, não faz nada.
 */
export function despacharAtalho(e: KeyboardEvent): void {
  acharPagina(paginaAtiva())?.atalhos?.(e)
}

// Páginas já montadas, na ordem em que apareceram. Uma página sem `manterMontada` sai daqui ao deixar de ser a
// ativa (desmonta); uma com `manterMontada` fica, e a casca só a esconde.
let montadas: string[] = []

/**
 * As páginas que a casca deve manter montadas com `ativa` em tela: a ativa, mais as já montadas que pedem
 * `manterMontada`. A ordem é estável (a primeira a montar fica no início), para o React não remontar ao trocar.
 */
export function paginasMontadas(ativa: string): string[] {
  const alvo = temPagina(ativa) ? ativa : PAGINA_INICIAL
  montadas = montadas.filter((id) => id === alvo || acharPagina(id)?.manterMontada)
  if (!montadas.includes(alvo)) montadas.push(alvo)
  return [...montadas]
}

/** Só para a prova: esvazia o registro. */
export function limparPaginas(): void {
  paginas.clear()
  montadas = []
}
