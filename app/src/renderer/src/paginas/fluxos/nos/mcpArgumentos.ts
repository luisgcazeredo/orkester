// Nó "Ferramenta MCP" (1.9.7, C3b): do esquema de entrada da ferramenta aos campos do formulário e de volta ao texto de
// `argumentos` (um objeto JSON em texto, que aceita `{{ }}`). Puro (sem React e sem DOM): a `mcpArgumentos.prova` roda no Node.
//
// `{{ x }}` entre aspas vira texto; fora das aspas vira valor JSON (é o que o motor faz). Por isso um campo número ou
// sim/não que é só `{{ x }}` sai SEM aspas. Aqui o `{{ x }}` solto é lido e escrito como `Cru`.

/** Uma `{{ }}` que fica fora das aspas no texto dos argumentos. */
export class Cru {
  readonly texto: string
  constructor(texto: string) {
    this.texto = texto
  }
}

export type TipoDoCampo = 'texto' | 'numero' | 'booleano' | 'lista-texto' | 'lista-numero' | 'escolha' | 'json'

export interface CampoDoEsquema {
  nome: string
  tipo: TipoDoCampo
  descricao: string
  obrigatorio: boolean
  /** Só `escolha`. */
  opcoes?: string[]
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function tipoDe(p: Record<string, unknown>): TipoDoCampo {
  if (Array.isArray(p.enum) && p.enum.length > 0 && p.enum.every((x) => typeof x === 'string')) return 'escolha'
  const t = Array.isArray(p.type) ? p.type.find((x) => x !== 'null') : p.type
  if (t === 'string') return 'texto'
  if (t === 'number' || t === 'integer') return 'numero'
  if (t === 'boolean') return 'booleano'
  if (t === 'array' && ehObjeto(p.items)) {
    const i = Array.isArray(p.items.type) ? p.items.type[0] : p.items.type
    if (i === 'string') return 'lista-texto'
    if (i === 'number' || i === 'integer') return 'lista-numero'
  }
  return 'json'
}

/** Os campos de um `inputSchema` (propriedades de primeiro nível). `usavel: false` = sem propriedades para listar. */
export function camposDoEsquema(esquema: unknown): { campos: CampoDoEsquema[]; usavel: boolean } {
  if (!ehObjeto(esquema) || !ehObjeto(esquema.properties)) return { campos: [], usavel: false }
  const obrigatorios = new Set(Array.isArray(esquema.required) ? esquema.required.filter((x): x is string => typeof x === 'string') : [])
  const campos = Object.entries(esquema.properties)
    .slice(0, 40)
    .map(([nome, p]): CampoDoEsquema => {
      const prop = ehObjeto(p) ? p : {}
      const tipo = tipoDe(prop)
      return {
        nome,
        tipo,
        descricao: typeof prop.description === 'string' ? prop.description.slice(0, 300) : '',
        obrigatorio: obrigatorios.has(nome),
        ...(tipo === 'escolha' ? { opcoes: (prop.enum as string[]).slice(0, 50) } : {})
      }
    })
  return { campos, usavel: campos.length > 0 }
}

// ---------------------------------------------------------------- texto ↔ objeto

/** Marca (caractere de uso privado) que segura o lugar de uma `{{ }}` solta enquanto o JSON é lido. */
const MARCA = String.fromCharCode(0xe000)

/** O texto dos argumentos como objeto; as `{{ }}` fora das aspas voltam como `Cru`. `ok: false` = não é um objeto JSON. */
export function lerArgumentos(texto: string): { ok: true; objeto: Record<string, unknown> } | { ok: false } {
  const cru: string[] = []
  let saida = ''
  let dentro = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (dentro) {
      saida += c
      if (c === '\\') saida += texto[++i] ?? ''
      else if (c === '"') dentro = false
      continue
    }
    if (c === '"') {
      dentro = true
      saida += c
    } else if (c === '{' && texto[i + 1] === '{') {
      const fim = texto.indexOf('}}', i + 2)
      if (fim < 0) {
        saida += c
        continue
      }
      cru.push(texto.slice(i, fim + 2))
      saida += `"${MARCA}${cru.length - 1}${MARCA}"`
      i = fim + 1
    } else saida += c
  }
  let v: unknown
  try {
    v = JSON.parse(saida.trim() || '{}')
  } catch {
    return { ok: false }
  }
  if (!ehObjeto(v)) return { ok: false }
  const volta = (x: unknown): unknown => {
    if (typeof x === 'string') {
      const m = new RegExp(`^${MARCA}(\\d+)${MARCA}$`).exec(x)
      return m ? new Cru(cru[Number(m[1])]) : x
    }
    if (Array.isArray(x)) return x.map(volta)
    if (ehObjeto(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, volta(y)]))
    return x
  }
  return { ok: true, objeto: volta(v) as Record<string, unknown> }
}

/** O objeto em texto (2 espaços), com os `Cru` sem aspas. Objeto vazio = `{}`. */
export function textoDosArgumentos(objeto: Record<string, unknown>): string {
  const escrever = (v: unknown, nivel: number): string => {
    if (v instanceof Cru) return v.texto
    const margem = '  '.repeat(nivel + 1)
    const fecho = '  '.repeat(nivel)
    if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => margem + escrever(x, nivel + 1)).join(',\n')}\n${fecho}]` : '[]'
    if (ehObjeto(v)) {
      const itens = Object.entries(v).filter(([, x]) => x !== undefined)
      return itens.length ? `{\n${itens.map(([k, x]) => `${margem}${JSON.stringify(k)}: ${escrever(x, nivel + 1)}`).join(',\n')}\n${fecho}}` : '{}'
    }
    return JSON.stringify(v) ?? 'null'
  }
  return escrever(objeto, 0)
}

// ---------------------------------------------------------------- campos ↔ objeto

const SO_EXPRESSAO = /^\{\{[^{}]*\}\}$/

/** O que cada campo mostra (texto) e o resto do objeto (campos de tipo `json` e chaves que o esquema não conhece). */
export function valoresDosCampos(campos: readonly CampoDoEsquema[], objeto: Record<string, unknown>): { valores: Record<string, string>; extra: Record<string, unknown> } {
  const valores: Record<string, string> = {}
  const extra: Record<string, unknown> = {}
  const doEsquema = new Map(campos.map((c) => [c.nome, c]))
  const emTexto = (x: unknown): string => (x instanceof Cru ? x.texto : typeof x === 'string' ? x : typeof x === 'number' || typeof x === 'boolean' ? String(x) : '')
  for (const [nome, v] of Object.entries(objeto)) {
    const campo = doEsquema.get(nome)
    if (!campo || campo.tipo === 'json') {
      extra[nome] = v
      continue
    }
    if (campo.tipo === 'lista-texto' || campo.tipo === 'lista-numero') {
      if (Array.isArray(v)) valores[nome] = v.map(emTexto).join('\n')
      else if (v instanceof Cru) valores[nome] = v.texto
      else extra[nome] = v
    } else if (typeof v === 'object' && !(v instanceof Cru)) extra[nome] = v
    else valores[nome] = emTexto(v)
  }
  return { valores, extra }
}

const numeroOuTexto = (t: string): number | string | Cru => (SO_EXPRESSAO.test(t) ? new Cru(t) : t !== '' && Number.isFinite(Number(t)) ? Number(t) : t)

/** O objeto dos argumentos a partir do que está nos campos. Campo vazio não vai; `extra` entra por último. */
export function objetoDosCampos(campos: readonly CampoDoEsquema[], valores: Readonly<Record<string, string>>, extra: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const c of campos) {
    if (c.tipo === 'json') continue
    const bruto = valores[c.nome] ?? ''
    if (c.tipo === 'lista-texto' || c.tipo === 'lista-numero') {
      const linhas = bruto.split('\n').map((l) => l.trim()).filter(Boolean)
      // uma linha só que é {{ expressão }} vale como a lista inteira (sem colchetes nem aspas)
      if (linhas.length === 1 && SO_EXPRESSAO.test(linhas[0])) {
        saida[c.nome] = new Cru(linhas[0])
        continue
      }
      if (linhas.length) saida[c.nome] = c.tipo === 'lista-numero' ? linhas.map(numeroOuTexto) : linhas
      continue
    }
    const v = bruto.trim()
    if (c.tipo === 'texto' || c.tipo === 'escolha') {
      if (bruto !== '') saida[c.nome] = bruto
    } else if (!v) continue
    else if (c.tipo === 'numero') saida[c.nome] = numeroOuTexto(v)
    else if (c.tipo === 'booleano') saida[c.nome] = v === 'true' ? true : v === 'false' ? false : SO_EXPRESSAO.test(v) ? new Cru(v) : v
  }
  return { ...saida, ...extra }
}
