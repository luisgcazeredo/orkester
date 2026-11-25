// MCP de fora (1.9.7, C1): a parte pura do cliente de servidores MCP de terceiros. Vale no main e na tela (nada de
// `node:*` aqui; o hash usa o `crypto.subtle`, que existe nos dois). O cliente em si (subir, reusar, matar a árvore,
// https com IP conferido) está em `main/mcpFora/cliente.ts`. Aqui, o que se decide sem processo nem rede:
//
// - os limites (prazos, parado, máximo de vivos, quedas, tamanho do resultado);
// - a definição de um servidor (stdio ou https) e o que nela é recusado;
// - o ambiente do processo stdio: só o mínimo do SDK mais o declarado, sem nenhum `ORK_*`;
// - a impressão (hash) de cada ferramenta: nome, título, descrição, esquemas e anotações;
// - o resultado de uma chamada: só texto e conteúdo estruturado, até 2 MB;
// - a conta das quedas (3 em 10 min pausam o servidor).
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { autoridadeLocal, ipv4, ipv6 } from './fluxos/rede.ts'

// ---------------------------------------------------------------- limites

/** Prazo de cada chamada de ferramenta (e de cada listagem). */
export const PRAZO_CHAMADA_MS = 30_000
/** Prazo da subida: processo + `initialize` (o `npx` pode baixar o pacote na primeira vez). */
export const PRAZO_SUBIDA_MS = 60_000
/** Parado este tempo sem chamada, o servidor fecha (e a árvore dele morre). */
export const PARADO_MS = 5 * 60_000
/** Servidores vivos ao mesmo tempo. O 7º fecha o parado há mais tempo; se todos estão em uso, é recusado. */
export const MAX_VIVOS = 6
/** Quedas (subida que falhou ou processo que morreu sozinho) nesta janela deixam o servidor pausado. */
export const MAX_QUEDAS = 3
export const JANELA_QUEDAS_MS = 10 * 60_000
/** Resultado de uma chamada (texto + estruturado em JSON, em bytes UTF-8). */
export const MAX_RESULTADO = 2 * 1024 * 1024
/** Ferramentas lidas de um servidor (a lista vem em páginas; mais que isso é recusado). */
export const MAX_FERRAMENTAS = 500

// ---------------------------------------------------------------- definição

/**
 * Um servidor stdio, já com os valores (o C2 tira os segredos do cofre só na hora de subir). `env` é só o declarado:
 * o resto do ambiente vem do mínimo do SDK.
 */
export interface DefinicaoStdio {
  tipo: 'stdio'
  comando: string
  args?: string[]
  env?: Record<string, string>
  pasta?: string
}

/** Um servidor MCP por https, fora deste PC, com os cabeçalhos já resolvidos da credencial. */
export interface DefinicaoHttp {
  tipo: 'http'
  url: string
  cabecalhos?: Record<string, string>
}

export type DefinicaoMcpFora = DefinicaoStdio | DefinicaoHttp

const NOME_DE_VARIAVEL = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
/** `token` da RFC 9110 §5.6.2, o mesmo do nó HTTP. */
const TOKEN_HTTP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/
/** Cabeçalhos que o transporte põe (ou que não fazem sentido escritos). */
const CABECALHOS_DO_PROTOCOLO = new Set([
  'host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'keep-alive', 'expect',
  'proxy-connection', 'proxy-authorization', 'content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id'
])

/** Variável do próprio Orkester (`ORK_PIPE`, a chave…): nunca chega a um servidor de fora. Windows não liga para caixa. */
export const variavelDoOrkester = (nome: string): boolean => /^ork_/i.test(nome)

const temQuebra = (t: string): boolean => /[\r\n\0]/.test(t)

/**
 * A URL de um servidor MCP HTTP: só https, sem usuário:senha, e o host é um NOME público (não IP, nem `localhost`, nem
 * nome da rede local). O IP do nome ainda é conferido na hora de conectar (`cliente.ts`). Servidor deste PC entra por
 * stdio (decisão 0.2 do plano).
 */
export function conferirUrlHttp(texto: unknown): URL | { erro: string } {
  if (typeof texto !== 'string' || !texto.trim()) return { erro: 'falta a URL do servidor' }
  if (texto.length > 2000) return { erro: 'a URL passa de 2000 letras' }
  let url: URL
  try {
    url = new URL(texto.trim())
  } catch {
    return { erro: 'URL inválida' }
  }
  if (url.protocol !== 'https:') return { erro: 'servidor MCP por HTTP só com https:// (um servidor deste PC entra por stdio)' }
  if (url.username || url.password) return { erro: 'usuário e senha não vão na URL: use uma credencial' }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (ipv4(host) !== null || ipv6(host) !== null) return { erro: 'o host precisa ser um nome, não um IP' }
  if (autoridadeLocal(url.href) !== null) return { erro: `${host} é desta máquina ou da rede local: servidor deste PC entra por stdio` }
  return url
}

/** A definição pode subir? `null` = pode; senão, o motivo em português simples. Não cita valores. */
export function validarDefinicao(d: unknown): string | null {
  if (!d || typeof d !== 'object') return 'definição vazia'
  const def = d as { tipo?: unknown; comando?: unknown; args?: unknown; env?: unknown; pasta?: unknown; url?: unknown; cabecalhos?: unknown }
  if (def.tipo === 'stdio') {
    if (typeof def.comando !== 'string' || !def.comando.trim()) return 'falta o comando'
    if (temQuebra(def.comando)) return 'o comando tem quebra de linha'
    if (def.args !== undefined && (!Array.isArray(def.args) || def.args.some((a) => typeof a !== 'string' || a.includes('\0')))) {
      return 'os argumentos precisam ser uma lista de textos'
    }
    if (def.pasta !== undefined && (typeof def.pasta !== 'string' || temQuebra(def.pasta))) return 'a pasta não vale'
    if (def.env !== undefined) {
      if (typeof def.env !== 'object' || def.env === null || Array.isArray(def.env)) return 'o ambiente precisa ser nome → valor'
      for (const [nome, valor] of Object.entries(def.env)) {
        if (!NOME_DE_VARIAVEL.test(nome)) return `a variável ${JSON.stringify(nome.slice(0, 40))} tem um nome que não vale`
        if (variavelDoOrkester(nome)) return `a variável ${nome} é do Orkester e não vai para um servidor de fora`
        if (typeof valor !== 'string' || valor.includes('\0')) return `a variável ${nome} precisa de um texto`
      }
    }
    return null
  }
  if (def.tipo === 'http') {
    const url = conferirUrlHttp(def.url)
    if ('erro' in url) return url.erro
    if (def.cabecalhos !== undefined) {
      if (typeof def.cabecalhos !== 'object' || def.cabecalhos === null || Array.isArray(def.cabecalhos)) return 'os cabeçalhos precisam ser nome → valor'
      for (const [nome, valor] of Object.entries(def.cabecalhos)) {
        if (!TOKEN_HTTP.test(nome)) return `o cabeçalho ${JSON.stringify(nome.slice(0, 40))} tem um nome que não vale`
        if (CABECALHOS_DO_PROTOCOLO.has(nome.toLowerCase())) return `o cabeçalho ${nome} é do protocolo e não se escreve`
        if (typeof valor !== 'string' || temQuebra(valor)) return `o cabeçalho ${nome} precisa de um texto sem quebra de linha`
      }
    }
    return null
  }
  return 'o tipo precisa ser stdio ou http'
}

/**
 * O ambiente do processo stdio: o mínimo que o SDK herda (`getDefaultEnvironment`: PATH, SYSTEMROOT, APPDATA…) mais o
 * declarado. Nenhum `ORK_*` passa, nem se vier no mínimo nem no declarado.
 */
export function ambienteMinimo(padrao: Readonly<Record<string, string>>, declarado?: Readonly<Record<string, string>>): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const [nome, valor] of Object.entries({ ...padrao, ...(declarado ?? {}) })) {
    if (!variavelDoOrkester(nome) && typeof valor === 'string') saida[nome] = valor
  }
  return saida
}

/** Os valores secretos de uma definição (o declarado no env e os cabeçalhos), para mascarar mensagens. */
export function segredosDaDefinicao(d: DefinicaoMcpFora): string[] {
  const valores = d.tipo === 'stdio' ? Object.values(d.env ?? {}) : Object.values(d.cabecalhos ?? {})
  const saida = new Set<string>()
  for (const v of valores) {
    if (v.length >= 4) saida.add(v)
    // `Bearer abc…`: o token sozinho também
    const partes = v.split(/\s+/).filter((p) => p.length >= 4)
    if (partes.length > 1) for (const p of partes) saida.add(p)
  }
  return [...saida].sort((a, b) => b.length - a.length)
}

/** Troca cada segredo por •••. Os mais longos primeiro (um pode conter o outro). */
export function mascarar(texto: string, segredos: readonly string[]): string {
  let t = texto
  for (const s of [...segredos].sort((a, b) => b.length - a.length)) if (s) t = t.split(s).join('•••')
  return t
}

// ---------------------------------------------------------------- ferramentas e impressão

export interface AnotacoesMcp {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** Uma ferramenta como o servidor a descreve, com a impressão que o app guarda no aceite. */
export interface FerramentaMcp {
  nome: string
  titulo?: string
  descricao: string
  esquemaEntrada: unknown
  esquemaSaida?: unknown
  /** Palavra do servidor: nunca libera nada (sem anotação = "pode mudar coisas"). */
  anotacoes?: AnotacoesMcp
  /** SHA-256 (hex) do texto canônico: nome, título, descrição, esquemas e anotações. */
  impressao: string
}

/** JSON com as chaves em ordem: a mesma ferramenta dá o mesmo texto, venha na ordem que vier. */
export function textoCanonico(valor: unknown): string {
  if (valor === undefined) return 'null'
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null'
  if (Array.isArray(valor)) return `[${valor.map(textoCanonico).join(',')}]`
  const chaves = Object.keys(valor as Record<string, unknown>).filter((k) => (valor as Record<string, unknown>)[k] !== undefined).sort()
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${textoCanonico((valor as Record<string, unknown>)[k])}`).join(',')}}`
}

/** A ferramenta crua do `tools/list` (o SDK já validou o formato) → o que entra na impressão. */
export function partesDaImpressao(t: { name: string; title?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; annotations?: unknown }): unknown {
  return {
    nome: t.name,
    titulo: t.title,
    descricao: t.description ?? '',
    esquemaEntrada: t.inputSchema ?? null,
    esquemaSaida: t.outputSchema,
    anotacoes: t.annotations
  }
}

const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

/** SHA-256 do texto canônico (o mesmo no main e na tela). */
export async function impressaoDe(partes: unknown): Promise<string> {
  return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(textoCanonico(partes))))
}

const ANOTACOES_BOOL = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const

/** A ferramenta do `tools/list` → `FerramentaMcp` (com a impressão). Anotação que não é booleana é ignorada. */
export async function ferramentaDe(t: { name: string; title?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; annotations?: Record<string, unknown> }): Promise<FerramentaMcp> {
  const f: FerramentaMcp = { nome: t.name, descricao: t.description ?? '', esquemaEntrada: t.inputSchema ?? { type: 'object' }, impressao: await impressaoDe(partesDaImpressao(t)) }
  if (t.title) f.titulo = t.title
  if (t.outputSchema !== undefined) f.esquemaSaida = t.outputSchema
  if (t.annotations && typeof t.annotations === 'object') {
    const a: AnotacoesMcp = {}
    if (typeof t.annotations.title === 'string') a.title = t.annotations.title
    for (const k of ANOTACOES_BOOL) if (typeof t.annotations[k] === 'boolean') a[k] = t.annotations[k] as boolean
    if (Object.keys(a).length) f.anotacoes = a
  }
  return f
}

/** "Diz que só lê": só com `readOnlyHint: true` explícito. É rótulo, nunca permissão. */
export const dizQueSoLe = (f: Pick<FerramentaMcp, 'anotacoes'>): boolean => f.anotacoes?.readOnlyHint === true

/** As ferramentas de agora contra as impressões aprovadas (nome → impressão). */
export function compararImpressoes(atuais: readonly Pick<FerramentaMcp, 'nome' | 'impressao'>[], aprovadas: Readonly<Record<string, string>>):
  { iguais: string[]; mudadas: string[]; novas: string[]; sumidas: string[] } {
  const r = { iguais: [] as string[], mudadas: [] as string[], novas: [] as string[], sumidas: [] as string[] }
  const vistas = new Set<string>()
  for (const f of atuais) {
    vistas.add(f.nome)
    if (!Object.hasOwn(aprovadas, f.nome)) r.novas.push(f.nome)
    else if (aprovadas[f.nome] === f.impressao) r.iguais.push(f.nome)
    else r.mudadas.push(f.nome)
  }
  for (const nome of Object.keys(aprovadas)) if (!vistas.has(nome)) r.sumidas.push(nome)
  return r
}

// ---------------------------------------------------------------- resultado

/** O que uma chamada devolve (o contrato de `mcp.chamar` e do nó `fora.mcp`). */
export interface ResultadoMcp {
  /** Os blocos de texto, um por linha. */
  texto: string
  /** O `structuredContent` do servidor, se veio. */
  estruturado?: unknown
  /** O servidor disse `isError` (a ferramenta falhou; `texto` traz a mensagem dele). */
  erro: boolean
  /** Blocos que não são texto (imagem, áudio, recurso) e ficaram de fora. */
  omitidos?: number
}

const bytes = (t: string): number => new TextEncoder().encode(t).length

/** O resultado cru do `tools/call` → `ResultadoMcp`, ou o motivo de recusa (passou de 2 MB). */
export function resultadoDaChamada(bruto: unknown, max = MAX_RESULTADO): ResultadoMcp | { erro: string } {
  const r = (bruto && typeof bruto === 'object' ? bruto : {}) as { content?: unknown; structuredContent?: unknown; isError?: unknown; toolResult?: unknown }
  const textos: string[] = []
  let omitidos = 0
  if (Array.isArray(r.content)) {
    for (const c of r.content) {
      if (c && typeof c === 'object' && (c as { type?: unknown }).type === 'text' && typeof (c as { text?: unknown }).text === 'string') textos.push((c as { text: string }).text)
      else omitidos++
    }
  } else if (r.toolResult !== undefined) {
    // protocolo antigo (2024-10-07): `toolResult` no lugar de `content`
    textos.push(typeof r.toolResult === 'string' ? r.toolResult : (JSON.stringify(r.toolResult) ?? ''))
  }
  const saida: ResultadoMcp = { texto: textos.join('\n'), erro: r.isError === true }
  if (r.structuredContent !== undefined && r.structuredContent !== null) saida.estruturado = r.structuredContent
  if (omitidos) saida.omitidos = omitidos
  const tamanho = bytes(saida.texto) + (saida.estruturado === undefined ? 0 : bytes(JSON.stringify(saida.estruturado) ?? ''))
  if (tamanho > max) return { erro: `o resultado passou de ${Math.round(max / 1024 / 1024)} MB (${(tamanho / 1024 / 1024).toFixed(1)} MB) e foi recusado` }
  return saida
}

// ---------------------------------------------------------------- quedas

/** As quedas que ainda contam (dentro da janela), com a nova. `pausar`: chegou a 3. */
export function registrarQueda(anteriores: readonly number[], agora: number, janela = JANELA_QUEDAS_MS, max = MAX_QUEDAS): { quedas: number[]; pausar: boolean } {
  const quedas = [...anteriores.filter((t) => agora - t < janela), agora]
  return { quedas, pausar: quedas.length >= max }
}

// ---------------------------------------------------------------- segredo nos argumentos (Revisão C, achado 2 e R2)

/**
 * Nome (de opção, de cabeçalho ou de variável) que leva segredo. Compara sem `-`/`_` e sem caixa, então `--api-key`,
 * `--apiKey`, `--accessToken`, `--client_secret` e `X-Api-Key` caem todos. `id`/`ids` no fim nunca (`--database-id`).
 */
const NOME_DE_SEGREDO = /(?:apikey|key|keys|token|tokens|secret|secrets|password|passwd|pass|pwd|bearer|auth|authorization|credential|credentials|privatekey|pat|cookie)$/
const nomeDeSegredo = (nome: string): boolean => {
  const n = nome.replace(/^-+/, '').replace(/[-_.]/g, '').toLowerCase()
  return n === 'k' || (NOME_DE_SEGREDO.test(n) && !/ids?$/.test(n))
}
/** Opções que levam um cabeçalho HTTP (`mcp-remote --header "Authorization: Bearer …"`). */
const OPCAO_DE_CABECALHO = /^(?:--header|--headers|-H)$/
/** Valores que nunca são segredo: variável (`${X}`, `$X`, `%X%`), caminho, UUID e palavras de configuração. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PALAVRAS = new Set(['none', 'true', 'false', 'null', 'on', 'off', 'yes', 'no', 'env', 'oauth', 'oauth2', 'basic', 'bearer', 'auto', 'default', 'disabled', 'enabled'])
function valorSemSegredo(v: string): boolean {
  const t = v.trim()
  if (!t) return true
  if (/^(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)$/.test(t)) return true
  if (/^(?:[A-Za-z]:[\\/]|[\\/~.])/.test(t) || t.includes('\\')) return true
  if (UUID.test(t)) return true
  return PALAVRAS.has(t.toLowerCase())
}
/** Formatos conhecidos de token (prefixos de provedores e JWT). */
const FORMATO_DE_TOKEN = /^(?:sk-|sk_(?:live|test)_|pk_(?:live|test)_|rk_(?:live|test)_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|glpat-|xox[abposr]-|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{20,}|pat[A-Za-z0-9]{10,}\.|ntn_|secret_|Bearer\s)|^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
/** Texto longo só de letras, dígitos e `_-+=` com letras e dígitos misturados: parece token (não é caminho nem UUID). */
const pareceToken = (v: string): boolean => v.length >= 32 && /^[A-Za-z0-9_\-+=]+$/.test(v) && /[0-9]/.test(v) && /[A-Za-z]/.test(v) && !UUID.test(v)
/** URL com senha ou com chave na consulta (usuário sozinho não conta). */
function urlComSegredo(v: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return false
  try {
    const u = new URL(v)
    if (u.password && !valorSemSegredo(decodeURIComponent(u.password))) return true
    for (const [k, valor] of u.searchParams) if (valor && !valorSemSegredo(valor) && (nomeDeSegredo(k) || /^(?:sig|signature|accesstoken)$/i.test(k) || pareceToken(valor))) return true
  } catch {
    /* não é URL */
  }
  return false
}
/** Um cabeçalho `Nome: valor` com segredo (nome de segredo e valor de verdade, ou valor com cara de token). */
function cabecalhoComSegredo(texto: string): boolean {
  const i = texto.indexOf(':')
  if (i <= 0) return parecePorSi(texto)
  const nome = texto.slice(0, i).trim()
  const valor = texto.slice(i + 1).trim().replace(/^(?:Bearer|Basic|Token|Bot)\s+/i, '')
  if (valorSemSegredo(valor)) return false
  return nomeDeSegredo(nome) || parecePorSi(valor)
}
/** O valor sozinho já tem cara de segredo (sem olhar a opção). */
const parecePorSi = (v: string): boolean => !valorSemSegredo(v) && (FORMATO_DE_TOKEN.test(v) || pareceToken(v) || urlComSegredo(v))

/**
 * Onde há um valor com cara de segredo nos argumentos (sem dizer o valor), ou `null`. Olha: o valor depois de uma
 * opção de segredo (`--api-key x`, `--accessToken x`, `-k x`) e a forma `--opcao=valor`; `--header`/`-H` com
 * `Authorization: Bearer …`, `X-Api-Key: …` e afins; `NOME_DO_SEGREDO=valor`; formatos conhecidos de token; texto longo
 * que parece token; URL com senha ou chave. Nunca alarma: variável (`${X}`), caminho, UUID, `none`/`true`/`env`...
 * Na importação, o servidor com isto não é oferecido (o valor ia ficar em texto no cadastro e à vista na tela).
 */
export function segredoNosArgumentos(args: readonly string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i].trim()
    const n = i + 1
    const igual = /^(-{1,2}[^=\s]+)=(.*)$/s.exec(a)
    const opcao = igual ? igual[1] : a.startsWith('-') ? a : ''
    const valorDaOpcao = igual ? igual[2] : undefined
    if (opcao && OPCAO_DE_CABECALHO.test(opcao)) {
      const v = valorDaOpcao ?? args[i + 1]
      if (v !== undefined && cabecalhoComSegredo(v)) return valorDaOpcao !== undefined ? `argumento ${n}, ${opcao}=…` : `argumento ${n + 1}, o cabeçalho de ${opcao}`
      if (valorDaOpcao === undefined) i++
      continue
    }
    if (opcao && nomeDeSegredo(opcao)) {
      const v = (valorDaOpcao ?? args[i + 1] ?? '').trim()
      const ehValor = valorDaOpcao !== undefined || (v !== '' && !v.startsWith('-'))
      if (ehValor && !valorSemSegredo(v)) return valorDaOpcao !== undefined ? `argumento ${n}, ${opcao}=…` : `argumento ${n + 1}, o valor de ${opcao}`
      if (valorDaOpcao === undefined && ehValor) i++
      continue
    }
    // id depois de uma opção de id (`--database-id`, `--page-id`): UUID ou 32 hex (Notion) não é segredo aqui; os
    // mesmos 32 hex soltos seguem suspeitos (há chave de API assim)
    if (opcao && /ids?$/i.test(opcao.replace(/[-_]/g, ''))) {
      const v = (valorDaOpcao ?? args[i + 1] ?? '').trim()
      if (/^[0-9a-f]{32}$/i.test(v) || UUID.test(v)) {
        if (valorDaOpcao === undefined) i++
        continue
      }
    }
    const valor = valorDaOpcao !== undefined ? valorDaOpcao.trim() : a
    const atrib = /^([A-Za-z0-9_.-]+)=(.+)$/s.exec(valor)
    if (atrib && nomeDeSegredo(atrib[1]) && !valorSemSegredo(atrib[2])) return `argumento ${n}, ${atrib[1]}=…`
    if (FORMATO_DE_TOKEN.test(valor) || pareceToken(valor)) return `argumento ${n}, parece um token`
    if (urlComSegredo(valor)) return `argumento ${n}, endereço com senha ou chave`
  }
  return null
}

/** O mesmo para a URL de um servidor http (senha ou chave na consulta). */
export const segredoNaUrl = (url: string): boolean => urlComSegredo(url)
