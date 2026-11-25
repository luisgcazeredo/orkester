// Editor de Fluxos: a escolha de nó (o painel que desliza da direita: "+ Nó", Tab, duplo clique no vazio, soltar uma
// ligação no vazio e o "+" de uma saída livre). Pura: a `busca.prova` roda no Node.
import type { TipoDeNo } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { CATALOGO, TIPOS_DE_NO } from '../../../../../shared/fluxos/nos.ts'

/** Os grupos da escolha, nesta ordem. Não são as categorias do catálogo (cor do nó): Código e Definir ficam juntos. */
export const GRUPOS_DE_NOS = ['Gatilhos', 'Orkester', 'Lógica', 'Dados e Código', 'Rede'] as const
export type GrupoDeNo = (typeof GRUPOS_DE_NOS)[number]

const GRUPO_POR_TIPO: Partial<Record<TipoDeNo, GrupoDeNo>> = {
  'logica.definir': 'Dados e Código',
  'fora.codigo': 'Dados e Código',
  'fora.http': 'Rede',
  'fora.mcp': 'Rede'
}

export function grupoDoNo(t: TipoDeNo): GrupoDeNo {
  const g = GRUPO_POR_TIPO[t]
  if (g) return g
  const c = CATALOGO[t].categoria
  return c === 'gatilho' ? 'Gatilhos' : c === 'orkester' ? 'Orkester' : c === 'logica' ? 'Lógica' : 'Dados e Código'
}

const sem = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')

/**
 * Os tipos que batem com o texto (cada palavra no rótulo, na descrição ou no nome do grupo, sem acento nem caixa). Sem
 * texto: todos, agrupados na ordem de `GRUPOS_DE_NOS` (dentro do grupo, a do catálogo). Com texto: os que batem pelo
 * rótulo primeiro. `semGatilho`: a escolha veio de uma saída, e gatilho não recebe ligação.
 */
export function buscarNos(texto: string, opcoes: { semGatilho?: boolean; gatilhosSoltos?: boolean } = {}): TipoDeNo[] {
  const lista = buscarTodos(texto, opcoes)
  if (!opcoes.gatilhosSoltos) return lista
  // (1.9.7, D3) vindo de uma saída: os gatilhos ficam, mas num grupo à parte, no fim (entram soltos, sem ligação)
  const ehG = (t: TipoDeNo): boolean => CATALOGO[t].categoria === 'gatilho'
  return [...lista.filter((t) => !ehG(t)), ...lista.filter(ehG)]
}

/** A nota do grupo dos gatilhos quando a escolha veio de uma saída. */
export const NOTA_DOS_GATILHOS_SOLTOS = 'gatilho entra solto'

function buscarTodos(texto: string, opcoes: { semGatilho?: boolean }): TipoDeNo[] {
  const palavras = sem(texto).split(/\s+/).filter(Boolean)
  const tipos = TIPOS_DE_NO.filter((t: TipoDeNo) => !(opcoes.semGatilho && CATALOGO[t].categoria === 'gatilho'))
  const ordem = (t: TipoDeNo): number => GRUPOS_DE_NOS.indexOf(grupoDoNo(t))
  if (!palavras.length) return tipos.map((t: TipoDeNo, i: number) => ({ t, i })).sort((a: { t: TipoDeNo; i: number }, b: { t: TipoDeNo; i: number }) => ordem(a.t) - ordem(b.t) || a.i - b.i).map((x: { t: TipoDeNo }) => x.t)
  const pontos = (t: TipoDeNo): number => {
    const d = CATALOGO[t]
    const rotulo = sem(d.rotulo)
    const resto = `${sem(d.descricao)} ${sem(grupoDoNo(t))} ${t}`
    let p = 0
    for (const w of palavras) {
      if (rotulo.includes(w)) p += 2
      else if (resto.includes(w)) p += 1
      else return 0
    }
    return p
  }
  const comPontos = tipos.map((t: TipoDeNo, i: number) => ({ t, i, p: pontos(t) })).filter((x: { p: number }) => x.p > 0)
  return comPontos.sort((a: { p: number; i: number }, b: { p: number; i: number }) => b.p - a.p || a.i - b.i).map((x: { t: TipoDeNo }) => x.t)
}
