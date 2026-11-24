// Fluxos (1.9.6): as expressões `{{ caminho }}`, lidas sobre o `json` do item atual. Só caminho (`a.b[0].c`,
// `["nome com espaço"]`; `$json.` na frente é aceito e não muda nada): não há JS, nem `$nó`, nem conta. Quem precisa de
// lógica usa o nó Código. Caminho ausente vira `''`; objeto vira JSON; `{{` sem fechar fica literal. Puro: roda no Node.

export type Caminho = (string | number)[]

export type ParteDoTexto = { tipo: 'texto'; texto: string } | { tipo: 'expressao'; bruto: string; caminho: Caminho | null }

const IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*/u
const INDICE = /^\[(\d{1,6})\]/
const CHAVE_ENTRE_ASPAS = /^\[\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\]/

/** `a.b[0]["c d"]` → `['a','b',0,'c d']`; `null` se não for só um caminho. */
export function lerCaminho(texto: string): Caminho | null {
  let s = texto.trim()
  if (!s || s.length > 300) return null
  const caminho: Caminho = []
  let primeiro = true
  while (s) {
    let m: RegExpMatchArray | null
    if (primeiro || s.startsWith('.')) {
      const resto = primeiro ? s : s.slice(1)
      m = resto.match(IDENT)
      if (m) {
        caminho.push(m[0])
        s = resto.slice(m[0].length)
        primeiro = false
        continue
      }
      if (!primeiro) return null
    }
    if ((m = s.match(INDICE))) caminho.push(Number(m[1]))
    else if ((m = s.match(CHAVE_ENTRE_ASPAS))) caminho.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'))
    else return null
    s = s.slice(m[0].length)
    primeiro = false
  }
  // `$json.a` = `a` (hábito de quem vem do n8n); `$json` sozinho = o item inteiro
  if (caminho[0] === '$json') caminho.shift()
  return caminho
}

/** O texto em pedaços: texto puro e expressões. `{{` sem `}}` fica texto. */
export function partes(texto: string): ParteDoTexto[] {
  const saida: ParteDoTexto[] = []
  let resto = texto
  const empurrarTexto = (t: string): void => {
    if (!t) return
    const ultima = saida[saida.length - 1]
    if (ultima?.tipo === 'texto') ultima.texto += t
    else saida.push({ tipo: 'texto', texto: t })
  }
  for (;;) {
    const abre = resto.indexOf('{{')
    if (abre < 0) break
    const fecha = resto.indexOf('}}', abre + 2)
    if (fecha < 0) break
    empurrarTexto(resto.slice(0, abre))
    const bruto = resto.slice(abre, fecha + 2)
    saida.push({ tipo: 'expressao', bruto, caminho: lerCaminho(bruto.slice(2, -2)) })
    resto = resto.slice(fecha + 2)
  }
  empurrarTexto(resto)
  return saida
}

export const temExpressao = (texto: string): boolean => partes(texto).some((p) => p.tipo === 'expressao')

/** As expressões que não são só um caminho (o validador do nó recusa o texto com a primeira). */
export function errosDeExpressao(texto: string): string[] {
  return partes(texto)
    .filter((p): p is Extract<ParteDoTexto, { tipo: 'expressao' }> => p.tipo === 'expressao' && p.caminho === null)
    .map((p) => `expressão inválida ${p.bruto.slice(0, 60)}: use só um caminho como {{ a.b[0] }}; lógica vai no nó Código`)
}

/** O valor no caminho, só por propriedades próprias (nada de `__proto__`, `constructor`…). Ausente = `undefined`. */
export function valorNoCaminho(json: unknown, caminho: Caminho): unknown {
  let atual: unknown = json
  for (const passo of caminho) {
    if (atual === null || typeof atual !== 'object') return undefined
    if (Array.isArray(atual)) {
      if (typeof passo !== 'number') return undefined
      atual = atual[passo]
    } else {
      if (!Object.prototype.hasOwnProperty.call(atual, passo)) return undefined
      atual = (atual as Record<string, unknown>)[String(passo)]
    }
  }
  return atual
}

/** Como um valor entra num texto: ausente e `null` = `''`; objeto e lista = JSON. */
export function emTexto(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  try {
    return JSON.stringify(v) ?? ''
  } catch {
    return ''
  }
}

/**
 * O texto com as expressões trocadas pelo valor no item. Expressão inválida fica literal (o validador já não deixa
 * gravar). `limpar` passa só no que veio do item (no recado: tirar o que imita uma marca do Orkester).
 */
export function resolverTexto(texto: string, json: unknown, limpar?: (valor: string) => string): string {
  return partes(texto)
    .map((p) => {
      if (p.tipo === 'texto') return p.texto
      if (!p.caminho) return p.bruto
      const valor = emTexto(valorNoCaminho(json, p.caminho))
      return limpar ? limpar(valor) : valor
    })
    .join('')
}

/**
 * Para o Se e o Definir, que guardam o tipo: o texto que é **só** uma expressão (`{{ a }}`, com espaço em volta)
 * devolve o valor como está (número, lista, objeto; ausente = `undefined`). Qualquer outro texto vira `resolverTexto`.
 */
export function resolverValor(texto: string, json: unknown): unknown {
  const p = partes(texto.trim())
  if (p.length === 1 && p[0].tipo === 'expressao' && p[0].caminho) return valorNoCaminho(json, p[0].caminho)
  return resolverTexto(texto, json)
}
