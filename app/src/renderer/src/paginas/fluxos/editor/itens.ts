// Editor de Fluxos: os itens de entrada e saída de um nó, como JSON e como tabela (o painel do nó). Puro: a
// `itens.prova` roda no Node.
import type { Item } from '../../../../../shared/fluxos/tipos'

export const MAX_COLUNAS = 30
export const MAX_LINHAS = 200
export const MAX_CELULA = 200

export interface Tabela {
  colunas: string[]
  linhas: string[][]
  /** Ficaram linhas ou colunas de fora (passou de `MAX_LINHAS` ou `MAX_COLUNAS`). */
  cortada: boolean
}

/** O valor de uma célula: texto como está; o resto em JSON; ausente vazio; longo cortado com "…". */
export function textoDaCelula(v: unknown): string {
  const t = v === undefined ? '' : typeof v === 'string' ? v : (JSON.stringify(v) ?? String(v))
  return t.length > MAX_CELULA ? `${t.slice(0, MAX_CELULA - 1)}…` : t
}

/** Uma coluna por campo de primeiro nível (na ordem em que aparecem), uma linha por item. */
export function tabelaDeItens(itens: readonly Item[]): Tabela {
  const colunas: string[] = []
  let cortada = itens.length > MAX_LINHAS
  const mostrados = itens.slice(0, MAX_LINHAS)
  for (const i of mostrados) {
    for (const k of Object.keys(i.json ?? {})) {
      if (colunas.includes(k)) continue
      if (colunas.length >= MAX_COLUNAS) {
        cortada = true
        continue
      }
      colunas.push(k)
    }
  }
  const linhas = mostrados.map((i) => colunas.map((c) => textoDaCelula((i.json ?? {})[c])))
  return { colunas, linhas, cortada }
}

/** O JSON que o painel mostra: a lista dos `json` dos itens, identada. */
export const jsonDeItens = (itens: readonly Item[]): string => JSON.stringify(itens.map((i) => i.json), null, 2)
