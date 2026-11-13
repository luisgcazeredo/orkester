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

/** Recusa (lança) id repetido: duas páginas com o mesmo id esconderiam uma à outra. */
export function registrarPagina(pagina: Pagina): void {
  if (paginas.has(pagina.id)) throw new Error(`Já existe uma página com o id "${pagina.id}".`)
  paginas.set(pagina.id, pagina)
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

/** Só para a prova: esvazia o registro. */
export function limparPaginas(): void {
  paginas.clear()
}
