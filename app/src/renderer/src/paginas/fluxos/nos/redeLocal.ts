// Rede local no nó HTTP (1.9.6, #91), a parte pura da tela: o que o nó diz da URL dele diante da lista de endereços
// permitidos do fluxo. A regra (o que é local, o que nunca é permitido, a forma canônica `host:porta`) é a de
// `shared/fluxos/rede.ts`; aqui só se traduz em situação, Falta e as frases da tela. Roda no Node, sem React.
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { autoridadeLocal, enderecoPermitido } from '../../../../../shared/fluxos/rede.ts'

/** `null` = endereço da internet (ou sem host fixo ainda); senão, local já permitido, local a permitir, ou recusado. */
export type SituacaoDaRede = { estado: 'permitido' | 'falta'; autoridade: string } | { estado: 'recusa'; motivo: string } | null

export function situacaoDaRede(url: string, locais: readonly string[]): SituacaoDaRede {
  const r = autoridadeLocal(url)
  if (!r) return null
  if ('recusa' in r) return { estado: 'recusa', motivo: r.recusa }
  return { estado: enderecoPermitido(locais, r.autoridade) ? 'permitido' : 'falta', autoridade: r.autoridade }
}

/** A Falta que o nó mostra no desenho por causa da rede (`null` = nada a dizer). */
export function faltaDeRede(url: string, locais: readonly string[]): string | null {
  const s = situacaoDaRede(url, locais)
  if (!s) return null
  if (s.estado === 'recusa') return `endereço recusado: ${s.motivo}`
  return s.estado === 'falta' ? `permitir o endereço local ${s.autoridade} (no nó HTTP)` : null
}

export const AVISO_DE_REDE_LOCAL =
  'Este endereço é do seu computador ou da sua rede local. Por segurança, um fluxo só chama endereços assim se você permitir, um por um.'

/** O rótulo do selo do topo do editor. */
export const rotuloDaRede = (n: number): string => `Rede local: ${n} ${n === 1 ? 'endereço' : 'endereços'}`

/** Mesma lista (a ordem não importa): o rascunho difere do disco? */
export const mesmaLista = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')
