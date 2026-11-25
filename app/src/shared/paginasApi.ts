/**
 * Páginas "+" (1.9.7), a permissão `api`: as regras puras do pedido que o app faz por uma página. Quem aplica é
 * `main/paginasApi.ts`; aqui, sem Node nem Electron, para a prova e a tela.
 *
 * Em uma frase: (1.9.7) a página diz o nome da API, o caminho e, se quiser, o host; a API vem dos acessos que o Luís
 * marcou (por id, `shared/paginasAcessos.ts`), o host tem de estar nos domínios dela, e o que volta para a página não
 * tem cabeçalho nenhum além do content-type, com o valor da credencial trocado por `•••`.
 *
 * O caminho não monta URL livre: começa com `/`, sem `//`, `\`, `@`, `..`, `?` nem `#` (nem codificados), e depois
 * do `new URL` o host tem de ser exatamente o escolhido.
 */
import type { PedidoDaPagina } from './api'
import type { Resultado } from './paginas'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { hostPermitido } from './fluxos/credenciais.ts'
// @ts-expect-error idem
import { hostValido } from './paginas.ts'

/** 60 pedidos por minuto por página (`api` e, na C5a, `mcp` no mesmo balde). O 61º no minuto é recusado. */
export const API_POR_MINUTO = 60
export const API_PRAZO_MS = 20_000
export const API_RESPOSTA_BYTES = 2 * 1024 * 1024
export const API_CAMINHO = 2048
export const API_MAX_URL = 8000
export const API_MAX_REDIRECIONAMENTOS = 5
/** O registro de cada página: os últimos 100 pedidos, do mais novo para o mais velho. */
export const PEDIDOS_NO_REGISTRO = 100
/** Sem a ficha de escrita, só estes. */
export const METODOS_DE_LEITURA: readonly string[] = ['GET', 'HEAD']
export const METODOS_DE_API: readonly string[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']
export const OCULTO = '•••'
/** Igual ao `MIN_SEGREDO` do executor dos fluxos: texto mais curto não é procurado. */
const MIN_SEGREDO = 4

const falha = <T>(erro: string): Resultado<T> => ({ ok: false, erro })
const objetoSimples = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// ---------------------------------------------------------------- o pedido

/** Uma etapa de decodificação: `%xx` vira o caractere. Codificação quebrada = null. */
function decodificar(s: string): string | null {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

/**
 * O caminho que a página mandou. Cru: sem espaço, `?` nem `#` (a consulta vai em `consulta`). Em cada nível de
 * decodificação (até 3: `%252e` vira `%2e` vira `.`): sem controle, `\`, `@`, `//` e sem segmento `.` ou `..`.
 * Espaço, `?` e `#` codificados (`%20`, `%3F`, `%23`) valem: são parte do nome, não mudam o destino.
 */
export function caminhoDaApiValido(caminho: unknown): string | null {
  if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.length > API_CAMINHO) return 'caminho inválido: comece com "/"'
  if (/[?#]/.test(caminho)) return 'caminho inválido: a consulta vai em "consulta", não no caminho'
  if (/\s/.test(caminho)) return 'caminho inválido: espaço vai codificado (%20)'
  let nivel: string | null = caminho
  for (let i = 0; i < 4 && nivel !== null; i++) {
    if (/[\u0000-\u001f\u007f\\@]/.test(nivel) || nivel.includes('//')) return 'caminho inválido: sem "//", "\\", "@" nem controle (nem codificados)'
    if (nivel.split('/').some((s) => s === '.' || s === '..')) return 'caminho inválido: sem "." nem ".." (nem codificados)'
    const proximo = decodificar(nivel)
    if (proximo === nivel) return null
    nivel = proximo
  }
  return nivel === null ? 'caminho inválido: codificação "%" quebrada' : 'caminho inválido: codificado vezes demais'
}

/** A URL do pedido: `https://<host><caminho>` com a consulta acrescentada. O host da URL tem de ser o do manifesto. */
export function urlDaApi(host: string, caminho: unknown, consulta?: unknown): Resultado<URL> {
  const ruim = caminhoDaApiValido(caminho)
  if (ruim) return falha(ruim)
  let url: URL
  try {
    url = new URL(`https://${host}${caminho as string}`)
  } catch {
    return falha('caminho inválido')
  }
  if (url.protocol !== 'https:' || url.host !== host || url.hostname !== host || url.username || url.password || url.port) return falha('caminho inválido')
  if (consulta !== undefined) {
    if (!objetoSimples(consulta)) return falha('consulta inválida: use um objeto de textos')
    for (const [k, v] of Object.entries(consulta)) {
      if (!k || !['string', 'number', 'boolean'].includes(typeof v)) return falha('consulta inválida: use um objeto de textos')
      url.searchParams.append(k, String(v))
    }
  }
  if (url.href.length > API_MAX_URL) return falha(`o endereço passa de ${API_MAX_URL} letras`)
  return { ok: true, valor: url }
}

/** O método (já em maiúsculas) pode sair com esta escrita (a da página E a da API)? Sem escrita, só GET e HEAD. */
export function metodoPermitido(metodo: unknown, escrita: boolean): string | null {
  if (typeof metodo !== 'string' || !METODOS_DE_API.includes(metodo)) return 'método inválido: use GET, HEAD, POST, PUT, PATCH ou DELETE'
  if (!escrita && !METODOS_DE_LEITURA.includes(metodo)) return `a página só lê nesta API: ${metodo} precisa de "também escreve" em Conexões › Páginas`
  return null
}

/**
 * (1.9.7) O host do pedido. Com `host`: tem de ser um nome DNS aceito (`hostValido`: sem IP, localhost nem rede
 * local) e estar nos domínios da API. Sem `host`: o 1º domínio sem curinga; API só com curinga exige `host`.
 */
export function hostDoPedido(host: unknown, api: { nome: string; dominios: readonly string[] }): Resultado<string> {
  if (host === undefined) {
    const primeiro = api.dominios.find((d) => !d.startsWith('*.'))
    if (!primeiro) return falha(`a API ${api.nome.slice(0, 80)} só tem domínio com curinga: diga o host no pedido`)
    return hostValido(primeiro) ? { ok: true, valor: primeiro } : falha(`a API ${api.nome.slice(0, 80)}: ${primeiro} não vale para páginas`)
  }
  const h = typeof host === 'string' ? host.toLowerCase() : ''
  if (!hostValido(h)) return falha('host inválido: use um dos domínios da API')
  if (!hostPermitido(h, api.dominios)) return falha(`host fora da API ${api.nome.slice(0, 80)}: use um destes domínios: ${api.dominios.join(', ')}`)
  return { ok: true, valor: h }
}

/**
 * Para onde um 3xx pode levar o pedido da página: só https, porta padrão, sem usuário na URL e para um host dos
 * domínios da MESMA API (`*.dominio` vale). Fora disso, a página recebe o 3xx como veio.
 */
export function redirecionamentoPermitido(para: URL, dominios: readonly string[]): boolean {
  return para.protocol === 'https:' && !para.port && !para.username && !para.password && hostValido(para.hostname) && hostPermitido(para.hostname, dominios)
}

// ---------------------------------------------------------------- o que volta

/**
 * Um padrão de busca do segredo, com a tabela de falhas do KMP já pronta (a busca é linear, sem retrocesso).
 * - `decodificada`: os bytes UTF-8 do valor, procurados no texto já decodificado (ver `bytesDecodificados`).
 * - `inteira`: uma forma procurada no texto como está (o valor cru, o escapado em JSON, o base64 e o base64url).
 */
export interface FormaDoSegredo {
  onde: 'decodificada' | 'inteira'
  padrao: Uint16Array
  falha: Int32Array
}

const ESPACO = 0x20
const MAIS = 0x2b
/** Escapes curtos do JSON: a letra depois da `\` → o caractere. */
const ESCAPE_CURTO = new Map<number, number>([
  [0x22, 0x22],
  [0x5c, 0x5c],
  [0x2f, 0x2f],
  [0x62, 0x08],
  [0x66, 0x0c],
  [0x6e, 0x0a],
  [0x72, 0x0d],
  [0x74, 0x09]
])

function digitoHex(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30
  const m = c | 0x20
  return m >= 0x61 && m <= 0x66 ? m - 0x57 : -1
}
function hex4(t: string, i: number): number {
  if (i + 4 > t.length) return -1
  let v = 0
  for (let j = i; j < i + 4; j++) {
    const d = digitoHex(t.charCodeAt(j))
    if (d < 0) return -1
    v = v * 16 + d
  }
  return v
}

/**
 * O texto como um fluxo de bytes UTF-8 decodificados, guardando onde começa no texto original a unidade de cada byte:
 * `%XX` (em qualquer caixa) é um byte; `\"`, `\\`, `\/`, `\b`, `\f`, `\n`, `\r`, `\t` e `\uXXXX` (em qualquer caixa,
 * com o par substituto) viram o caractere; o resto vale como está. `+` e espaço viram o mesmo byte (o formulário troca
 * um pelo outro). Um passo por unidade: trabalho linear.
 */
function bytesDecodificados(t: string): { bytes: Uint16Array; ini: Int32Array; n: number } {
  let bytes = new Uint16Array(t.length + 16)
  let ini = new Int32Array(t.length + 16)
  let n = 0
  const byte = (b: number, de: number): void => {
    if (n === bytes.length) {
      const maisBytes = new Uint16Array(bytes.length * 2)
      maisBytes.set(bytes)
      bytes = maisBytes
      const maisIni = new Int32Array(ini.length * 2)
      maisIni.set(ini)
      ini = maisIni
    }
    bytes[n] = b === MAIS ? ESPACO : b
    ini[n++] = de
  }
  const ponto = (cp: number, de: number): void => {
    if (cp < 0x80) byte(cp, de)
    else if (cp < 0x800) {
      byte(0xc0 | (cp >> 6), de)
      byte(0x80 | (cp & 63), de)
    } else if (cp < 0x10000) {
      byte(0xe0 | (cp >> 12), de)
      byte(0x80 | ((cp >> 6) & 63), de)
      byte(0x80 | (cp & 63), de)
    } else {
      byte(0xf0 | (cp >> 18), de)
      byte(0x80 | ((cp >> 12) & 63), de)
      byte(0x80 | ((cp >> 6) & 63), de)
      byte(0x80 | (cp & 63), de)
    }
  }
  for (let i = 0; i < t.length; ) {
    const c = t.charCodeAt(i)
    if (c === 0x25 && i + 2 < t.length) {
      const a = digitoHex(t.charCodeAt(i + 1))
      const b = digitoHex(t.charCodeAt(i + 2))
      if (a >= 0 && b >= 0) {
        byte(a * 16 + b, i)
        i += 3
        continue
      }
    }
    if (c === 0x5c && i + 1 < t.length) {
      const d = t.charCodeAt(i + 1)
      const curto = ESCAPE_CURTO.get(d)
      if (curto !== undefined) {
        byte(curto, i)
        i += 2
        continue
      }
      if (d === 0x75) {
        const u = hex4(t, i + 2)
        if (u >= 0xd800 && u < 0xdc00 && t.charCodeAt(i + 6) === 0x5c && t.charCodeAt(i + 7) === 0x75) {
          const v = hex4(t, i + 8)
          if (v >= 0xdc00 && v < 0xe000) {
            ponto(0x10000 + ((u - 0xd800) << 10) + (v - 0xdc00), i)
            i += 12
            continue
          }
        }
        if (u >= 0 && (u < 0xd800 || u >= 0xe000)) {
          ponto(u, i)
          i += 6
          continue
        }
      }
    }
    const cp = t.codePointAt(i) as number
    ponto(cp >= 0xd800 && cp < 0xe000 ? 0xfffd : cp, i)
    i += cp > 0xffff ? 2 : 1
  }
  return { bytes, ini, n }
}

function forma(onde: FormaDoSegredo['onde'], unidades: ArrayLike<number>): FormaDoSegredo {
  const padrao = Uint16Array.from(unidades)
  const falha = new Int32Array(padrao.length)
  for (let i = 1, k = 0; i < padrao.length; i++) {
    while (k > 0 && padrao[i] !== padrao[k]) k = falha[k - 1]
    if (padrao[i] === padrao[k]) k++
    falha[i] = k
  }
  return { onde, padrao, falha }
}

/** KMP: chama `achou(ini, fim)` para cada ocorrência (inclusive as sobrepostas), em O(n + m). */
function buscar(texto: Uint16Array, n: number, f: FormaDoSegredo, achou: (ini: number, fim: number) => void): void {
  const { padrao: p, falha } = f
  for (let i = 0, k = 0; i < n; i++) {
    const c = texto[i]
    while (k > 0 && c !== p[k]) k = falha[k - 1]
    if (c === p[k]) k++
    if (k === p.length) {
      achou(i + 1 - k, i + 1)
      k = falha[k - 1]
    }
  }
}

function unidadesDe(s: string): Uint16Array {
  const u = new Uint16Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}

/** base64 dos bytes UTF-8, sem o `=` do fim (o valor pode estar no meio de um bloco maior). */
function base64(s: string): string {
  let binario = ''
  for (const b of new TextEncoder().encode(s)) binario += String.fromCharCode(b)
  return btoa(binario).replace(/=+$/, '')
}

/**
 * Os padrões que pegam um segredo num texto que volta para a página:
 * - o valor no texto decodificado, que cobre qualquer mistura de forma crua, escape percentual (qualquer caixa),
 *   formulário (`+`) e escapes do JSON (até o valor escapado só em parte);
 * - inteiros, no texto como está: o valor cru e escapado em JSON (pegam o valor que tem `%XX` ou `\` de verdade), o
 *   base64 e o base64url.
 * Mais curto que 4 letras não entra (trocaria letras soltas de qualquer texto). A busca é KMP: o tempo cresce com o
 * tamanho do texto, nunca com texto × segredo (revisão A, reconferência).
 *
 * Limite: um servidor que transforme o valor de outro jeito (hash, cifra, base64 começando no meio de um bloco, outra
 * codificação, outra caixa) não é coberto. O servidor é o que o usuário escolheu ao criar a credencial.
 */
export function formasDoSegredo(segredos: readonly string[]): FormaDoSegredo[] {
  const formas: FormaDoSegredo[] = []
  const vistas = new Set<string>()
  const inteira = (f: string): void => {
    if (f.length < MIN_SEGREDO || vistas.has(f)) return
    vistas.add(f)
    formas.push(forma('inteira', unidadesDe(f)))
  }
  for (const s of new Set(segredos)) {
    if (typeof s !== 'string' || s.length < MIN_SEGREDO) continue
    formas.push(forma('decodificada', Array.from(new TextEncoder().encode(s), (b) => (b === MAIS ? ESPACO : b))))
    const json = JSON.stringify(s).slice(1, -1)
    for (const f of [s, json, json.replace(/\//g, '\\/')]) inteira(f)
    const b64 = base64(s)
    inteira(b64)
    inteira(b64.replace(/\+/g, '-').replace(/\//g, '_'))
  }
  return formas
}

/**
 * Troca por `•••` cada trecho do texto onde um padrão aparece. Trechos que se sobrepõem (`Bearer x` e `x`) viram um
 * `•••` só. Linear no tamanho do texto.
 */
export function mascarar(texto: string, formas: readonly FormaDoSegredo[]): string {
  if (!formas.length || !texto) return texto
  // contagem de diferenças: +1 onde um trecho começa, -1 onde acaba
  const marca = new Int32Array(texto.length + 1)
  let algum = false
  const achou = (ini: number, fim: number): void => {
    marca[ini]++
    marca[fim]--
    algum = true
  }
  const inteiras = formas.filter((f) => f.onde === 'inteira')
  if (inteiras.length) {
    const u = unidadesDe(texto)
    for (const f of inteiras) buscar(u, u.length, f, achou)
  }
  const decodificadas = formas.filter((f) => f.onde === 'decodificada')
  if (decodificadas.length) {
    const d = bytesDecodificados(texto)
    // o trecho achado começa e acaba numa unidade inteira do texto (o valor é UTF-8 válido)
    for (const f of decodificadas) buscar(d.bytes, d.n, f, (i, j) => achou(d.ini[i], j < d.n ? d.ini[j] : texto.length))
  }
  if (!algum) return texto
  const partes: string[] = []
  let aberto = 0
  let de = 0
  for (let i = 0; i <= texto.length; i++) {
    const antes = aberto
    aberto += marca[i]
    if (antes === 0 && aberto > 0) partes.push(texto.slice(de, i), OCULTO)
    else if (antes > 0 && aberto === 0) de = i
  }
  partes.push(texto.slice(de))
  return partes.join('')
}

// ---------------------------------------------------------------- taxa e registro

/**
 * Janela deslizante: no máximo `max` em qualquer `periodoMs`, por chave (página). Diferente do balde de fichas, o
 * 61º no mesmo minuto é recusado mesmo que os 60 tenham vindo espaçados.
 */
export function criarJanelaDeTaxa(max: number, periodoMs: number, agora: () => number): { tirar(chave: string): boolean; esquecer(chave: string): void } {
  const marcas = new Map<string, number[]>()
  return {
    tirar(chave) {
      const t = agora()
      const lista = (marcas.get(chave) ?? []).filter((m) => t - m < periodoMs)
      if (lista.length >= max) {
        marcas.set(chave, lista)
        return false
      }
      lista.push(t)
      marcas.set(chave, lista)
      if (marcas.size > 1000) marcas.delete(marcas.keys().next().value!)
      return true
    },
    esquecer: (chave) => void marcas.delete(chave)
  }
}

/** O caminho como o registro guarda: sem consulta, sem fragmento, até 200 letras. */
export const caminhoParaRegistro = (caminho: unknown): string => (typeof caminho === 'string' ? caminho.split(/[?#]/)[0].slice(0, 200) : '')

/** Põe o pedido no topo do registro e corta em 100. */
export function anotarPedido(lista: readonly PedidoDaPagina[], pedido: PedidoDaPagina): PedidoDaPagina[] {
  return [pedido, ...lista].slice(0, PEDIDOS_NO_REGISTRO)
}
