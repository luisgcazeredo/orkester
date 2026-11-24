// Documentação de um nó na tela (T6): recorta do guia (docs/fluxos.pt-BR.md) o trecho do nó. Puro (sem React e sem DOM):
// a `trechoDoGuia.prova` roda no Node.
//
// O guia segue um modelo único (plano-fluxos-dados-196, §4). Cada nó é um título de nível 3 que traz o tipo entre crases,
// e depois cinco partes, cada uma um parágrafo que abre com o rótulo em negrito:
//
//   ### <Rótulo> · `<tipo>`
//   **O que faz.** …   **Ajustes.** …   **Saída.** …   **Expressões úteis.** …   **Erros comuns.** …
//
// O trecho vai do título que contém `tipo` até o próximo título de nível 3 ou menor (## ou #). Linhas dentro de um bloco
// de código (```) nunca contam como título.

/** A âncora da seção "Primeiros passos" do guia em português, onde o botão "Guia dos fluxos" da página abre. */
export const ANCORA_PRIMEIROS_PASSOS = '#primeiros-passos'

/** Os rótulos das 5 partes no guia em português, na ordem. */
export const PARTES_DO_NO = ['O que faz.', 'Ajustes.', 'Saída.', 'Expressões úteis.', 'Erros comuns.'] as const

/** Linhas do guia, marcando as que estão dentro de um bloco de código. */
function linhasComCerca(md: string): { texto: string; cerca: boolean }[] {
  let dentro = false
  return md.replace(/\r\n/g, '\n').split('\n').map((texto) => {
    const abre = /^\s*(```|~~~)/.test(texto)
    if (abre) {
      dentro = !dentro
      return { texto, cerca: true }
    }
    return { texto, cerca: dentro }
  })
}

const nivelDoTitulo = (linha: string): number => /^(#{1,6})\s/.exec(linha)?.[1].length ?? 0

/** O trecho do guia que fala do nó do `tipo`, ou `null` se o guia não tem título para ele. */
export function trechoDoNo(md: string, tipo: string): string | null {
  const linhas = linhasComCerca(md)
  const marca = `\`${tipo}\``
  const inicio = linhas.findIndex((l) => !l.cerca && nivelDoTitulo(l.texto) === 3 && l.texto.includes(marca))
  if (inicio < 0) return null
  let fim = linhas.length
  for (let i = inicio + 1; i < linhas.length; i++) {
    const n = linhas[i].cerca ? 0 : nivelDoTitulo(linhas[i].texto)
    if (n > 0 && n <= 3) {
      fim = i
      break
    }
  }
  return linhas.slice(inicio, fim).map((l) => l.texto).join('\n').trim()
}

/** Os rótulos em negrito que abrem as partes do trecho (`**Ajustes.**` → "Ajustes."), na ordem em que aparecem. */
export function partesDoTrecho(trecho: string): string[] {
  return linhasComCerca(trecho)
    .filter((l) => !l.cerca)
    .map((l) => /^\*\*([^*]+\.)\*\*/.exec(l.texto)?.[1])
    .filter((p): p is string => !!p)
}

/** O tipo entre crases de cada título de nível 3 do guia (a âncora que a tela procura): `gatilho.kanban`, `orkester.consultar`… */
export function tiposNoGuia(md: string): string[] {
  return linhasComCerca(md)
    .filter((l) => !l.cerca && nivelDoTitulo(l.texto) === 3)
    .flatMap((l) => [...l.texto.matchAll(/`([a-z]+\.[a-z]+)`/g)].map((m) => m[1]))
}

/**
 * A ficha de tarefa como o guia a descreve na seção "Campos padrão (fichas)": os campos da tabela (primeira coluna, entre
 * crases) e o exemplo JSON logo abaixo. Vale para o guia em português e em inglês: o ponto de partida é a linha em negrito
 * `**Tarefa**` (a ficha de tarefa abre a lista de fichas). `null` quando o guia não tem a tabela ou o exemplo.
 */
export function fichaDeTarefaNoGuia(md: string): { campos: string[]; exemplo: unknown } | null {
  const linhas = linhasComCerca(md)
  const inicio = linhas.findIndex((l) => !l.cerca && /^\*\*Tarefa\*\*/.test(l.texto))
  if (inicio < 0) return null
  const campos: string[] = []
  let i = inicio + 1
  for (; i < linhas.length && !linhas[i].cerca && !/^\*\*[^*]+\*\*/.test(linhas[i].texto); i++) {
    const primeira = /^\|([^|]*)\|/.exec(linhas[i].texto)?.[1]
    if (primeira) campos.push(...[...primeira.matchAll(/`([^`]+)`/g)].map((m) => m[1]))
    if (/^```/.test(linhas[i].texto)) break
  }
  const abre = linhas.findIndex((l, k) => k > inicio && l.cerca && /^\s*```json/.test(l.texto))
  if (abre < 0 || campos.length === 0) return null
  const fecha = linhas.findIndex((l, k) => k > abre && /^\s*```\s*$/.test(l.texto))
  try {
    return { campos, exemplo: JSON.parse(linhas.slice(abre + 1, fecha < 0 ? undefined : fecha).map((l) => l.texto).join('\n')) }
  } catch {
    return null
  }
}

/**
 * A âncora de um título como o GitHub a gera, que é a que os links do guia usam (`[ficha](#campos-padrão-fichas)`):
 * o texto do título já renderizado (sem crases nem negrito), em minúsculas, sem pontuação nem símbolo (`·`, `(`, `{`, `.`…),
 * e cada espaço vira um "-" (sem juntar: "Se · `logica.se`" → `se--logicase`). Acento fica.
 */
export const ancoraDoTitulo = (texto: string): string =>
  texto
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')

/**
 * Em que título cai o link de âncora `href` (`#campos-padrão-fichas`, ou com o acento codificado, `%C3%A3`, como o
 * markdown-it escreve no HTML). `titulos`: o texto de todos os títulos, na ordem do guia. Títulos repetidos ganham `-1`,
 * `-2`… como no GitHub. Devolve o índice, ou -1 se nenhum título tem essa âncora.
 */
export function indiceDaAncora(titulos: readonly string[], href: string): number {
  let alvo = href.replace(/^#/, '')
  try {
    alvo = decodeURIComponent(alvo)
  } catch {
    // âncora mal codificada: compara como veio
  }
  alvo = alvo.normalize('NFC').toLowerCase()
  const vistos = new Map<string, number>()
  for (let i = 0; i < titulos.length; i++) {
    const base = ancoraDoTitulo(titulos[i].normalize('NFC'))
    const n = vistos.get(base) ?? 0
    vistos.set(base, n + 1)
    if ((n === 0 ? base : `${base}-${n}`) === alvo) return i
  }
  return -1
}
