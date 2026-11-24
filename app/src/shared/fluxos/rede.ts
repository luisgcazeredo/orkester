// Fluxos (1.9.6): as regras de rede do nó HTTP, a parte pura (plano §4). O pedido em si (Node `http`/`https`, o
// `lookup` próprio e o redirecionamento) está em `main/fluxos/http.ts`; aqui, o que se decide sem rede:
//
// - quais IPs são de rede interna (`ipBloqueado`), inclusive IPv4 escondido em IPv6 (mapeado, compatível, NAT64, 6to4);
// - quais hosts nem chegam a ser resolvidos (`hostBloqueado`: localhost, *.local, IP literal interno);
// - a URL final (só http/https, sem usuário:senha, com a consulta codificada);
// - os cabeçalhos: os do pedido (sem os do protocolo, sem quebra de linha) e os da resposta (sem set-cookie nem
//   authorization, que não entram na execução);
// - o corpo JSON com as expressões ESCAPADAS (dentro de aspas, o valor entra como texto JSON; fora, como valor JSON), e
//   o formulário com cada valor codificado — a interpolação crua do `resolverAjustes` quebraria com aspas ou `&`.
import type { Item, ParNomeValor } from './tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { emTexto, partes, resolverTexto, valorNoCaminho } from './expressoes.ts'

export const PRAZO_HTTP = 30_000
export const MAX_RESPOSTA = 5 * 1024 * 1024
export const MAX_REDIRECIONAMENTOS = 5
export const MAX_URL_FINAL = 8000

// ---------------------------------------------------------------- IPs

/** `a.b.c.d` estrito (o que o `dns.lookup` e o `URL` devolvem) → número de 32 bits; outra coisa → null. */
export function ipv4(texto: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto)
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some((x) => x > 255)) return null
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]
}

/** IPv6 (com `::`, IPv4 no fim, zona `%x` e colchetes) → 16 bytes; outra coisa → null. */
export function ipv6(texto: string): number[] | null {
  let s = texto.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  s = s.replace(/%.*$/, '').toLowerCase()
  if (!s.includes(':')) return null
  // IPv4 no fim (`::ffff:1.2.3.4`): vira os dois últimos hextetos
  const ultimo = s.lastIndexOf(':')
  if (s.slice(ultimo + 1).includes('.')) {
    const v4 = ipv4(s.slice(ultimo + 1))
    if (v4 === null) return null
    s = `${s.slice(0, ultimo + 1)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const lados = s.split('::')
  if (lados.length > 2) return null
  const ler = (t: string): number[] | null => {
    if (!t) return []
    const hs = t.split(':')
    if (hs.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null
    return hs.map((h) => parseInt(h, 16))
  }
  const esq = ler(lados[0])
  const dir = lados.length === 2 ? ler(lados[1]) : []
  if (!esq || !dir) return null
  const total = esq.length + dir.length
  let hextetos: number[]
  if (lados.length === 2) {
    if (total > 7) return null
    hextetos = [...esq, ...Array<number>(8 - total).fill(0), ...dir]
  } else {
    if (total !== 8) return null
    hextetos = esq
  }
  return hextetos.flatMap((h) => [h >> 8, h & 0xff])
}

const FAIXAS_V4: [string, number, number][] = [
  ['0.0.0.0/8', 0x00000000, 8],
  ['10.0.0.0/8', 0x0a000000, 8],
  ['100.64.0.0/10', 0x64400000, 10],
  ['127.0.0.0/8', 0x7f000000, 8],
  ['169.254.0.0/16', 0xa9fe0000, 16],
  ['172.16.0.0/12', 0xac100000, 12],
  ['192.0.0.0/24', 0xc0000000, 24],
  ['192.168.0.0/16', 0xc0a80000, 16],
  ['198.18.0.0/15', 0xc6120000, 15],
  ['224.0.0.0/4 (multicast)', 0xe0000000, 4],
  ['240.0.0.0/4 (reservada)', 0xf0000000, 4]
]

function faixaV4(n: number): string | null {
  for (const [nome, base, bits] of FAIXAS_V4) {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    if (((n & mascara) >>> 0) === base) return nome
  }
  return null
}

const prefixo = (b: number[], bytes: number[], bitsExtras = 0, mascaraExtra = 0): boolean =>
  bytes.every((x, i) => b[i] === x) && (bitsExtras === 0 || (b[bytes.length] & mascaraExtra) === bitsExtras)

const v4De = (b: number[], i: number): number => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]

/** A faixa interna em que o IP cai (para a mensagem), ou null se é da internet. Texto que não é IP: bloqueado. */
export function ipBloqueado(ip: string): string | null {
  const n4 = ipv4(ip)
  if (n4 !== null) return faixaV4(n4)
  const b = ipv6(ip)
  if (!b) return 'endereço que não é IP'
  const zeros = (ate: number): boolean => b.slice(0, ate).every((x) => x === 0)
  if (zeros(16)) return '::/128'
  if (zeros(15) && b[15] === 1) return '::1/128'
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return `IPv4 mapeado em IPv6 (::ffff:0:0/96)`
  if (zeros(12)) return 'IPv4 compatível em IPv6 (::/96)'
  // NAT64 de uso local (RFC 8215): o tradutor é da própria rede e pode levar a qualquer IPv4 interno. Bloqueado inteiro.
  if (prefixo(b, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01])) return 'NAT64 local (64:ff9b:1::/48)'
  if (prefixo(b, [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0])) {
    const dentro = faixaV4(v4De(b, 12))
    if (dentro) return `NAT64 de ${dentro}`
  }
  if (prefixo(b, [0x20, 0x02])) {
    const dentro = faixaV4(v4De(b, 2))
    if (dentro) return `6to4 de ${dentro}`
  }
  if ((b[0] & 0xfe) === 0xfc) return 'fc00::/7'
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return 'fe80::/10'
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return 'fec0::/10'
  if (b[0] === 0xff) return 'ff00::/8 (multicast)'
  if (prefixo(b, [0x01, 0x00, 0, 0, 0, 0, 0, 0])) return '100::/64'
  return null
}

// ---------------------------------------------------------------- endereços locais permitidos (veredito 196)
//
// A rede local não se libera inteira: o usuário permite, no nó HTTP, um ENDEREÇO exato (`host:porta`) por fluxo, e a
// lista (`fluxo.rede.locaisPermitidos`) entra no selo. Só valem `localhost:N` e IPv4 literal de loopback ou de rede
// privada (10/8, 172.16/12, 192.168/16) + porta. Nome DNS (NAS, mDNS) não: o usuário escreve e permite o IP. Link-local,
// metadados, IPv6 (fora o ::1 que `localhost` resolve) e as faixas reservadas nunca, mesmo escritos na lista.

/** As faixas IPv4 que podem ser permitidas, endereço por endereço. */
const FAIXAS_PERMITIVEIS_V4: [number, number][] = [
  [0x7f000000, 8],
  [0x0a000000, 8],
  [0xac100000, 12],
  [0xc0a80000, 16]
]
const naFaixa = (n: number, [base, bits]: [number, number]): boolean => ((n & ((0xffffffff << (32 - bits)) >>> 0)) >>> 0) === base
const textoV4 = (n: number): string => [n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')

/** Sufixos de nome que só existem na rede local (o usuário precisa usar o IP). */
const SUFIXOS_LOCAIS = ['.local', '.lan', '.home', '.internal', '.intranet', '.home.arpa', '.localdomain']

/** `null`: endereço público. `autoridade`: `host:porta` canônico que pode ser permitido. `recusa`: local que nunca pode. */
export type AutoridadeLocal = null | { autoridade: string } | { recusa: string }

const hostLimpo = (hostname: string): string => hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '').replace(/\.$/, '')

/** O IPv4 (número) de um texto IPv4 ou IPv4 mapeado em IPv6 (`::ffff:a.b.c.d`); outra coisa → null. */
function v4OuMapeado(h: string): number | null {
  const n = ipv4(h)
  if (n !== null) return n
  const b = ipv6(h)
  if (b && b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) return v4De(b, 12)
  return null
}

/**
 * O host (como o `URL` o deixa: minúsculo, IPv4 alternativo já em `a.b.c.d`) e a porta efetiva → a classificação.
 * Nome público dá `null` (o HTTP ainda confere os IPs dele depois do DNS).
 */
function classificarHost(hostname: string, porta: number): AutoridadeLocal {
  const h = hostLimpo(hostname)
  if (!h) return { recusa: 'o endereço não tem host' }
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { recusa: 'a porta precisa ser de 1 a 65535' }
  if (h === 'localhost') return { autoridade: `localhost:${porta}` }
  if (h.endsWith('.localhost')) return { recusa: `só "localhost" puro pode ser permitido: use localhost:${porta}` }
  const n4 = v4OuMapeado(h)
  if (n4 !== null) {
    const faixa = faixaV4(n4)
    if (!faixa) return null
    const ip = textoV4(n4)
    if (FAIXAS_PERMITIVEIS_V4.some((f) => naFaixa(n4, f))) return { autoridade: `${ip}:${porta}` }
    if (faixa === '169.254.0.0/16') return { recusa: `${ip} é link-local (onde ficam os metadados da nuvem) e nunca pode ser permitido` }
    return { recusa: `${ip} é de uma faixa reservada (${faixa}) e nunca pode ser permitido` }
  }
  if (ipv6(h)) {
    const faixa = ipBloqueado(h)
    if (!faixa) return null
    if (faixa === '::1/128') return { recusa: `IPv6 não pode ser permitido: para esta máquina, use localhost:${porta}` }
    return { recusa: `${h} é IPv6 de rede interna (${faixa}) e nunca pode ser permitido` }
  }
  if (!h.includes('.') || SUFIXOS_LOCAIS.some((s) => h.endsWith(s))) {
    return { recusa: `"${h}" é um nome da rede local: escreva o IP do aparelho no nó (por exemplo 192.168.0.10:${porta}) e permita o IP` }
  }
  return null
}

const portaEfetiva = (url: URL): number => (url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80)

/**
 * A URL escrita no nó HTTP (ainda com as `{{ }}`) é desta máquina ou da rede local?
 * - `null`: endereço público, ou URL que nem é http/https (o nó acusa o erro dele);
 * - `{ autoridade }`: o `host:porta` canônico que o usuário pode permitir neste fluxo (caminho e consulta podem ter
 *   expressões; a porta vem sempre escrita, a padrão incluída);
 * - `{ recusa }`: é local (ou pode ser), mas nunca pode ser permitido — host com expressão, nome da rede local,
 *   link-local, IPv6… —, com o motivo em português simples.
 */
export function autoridadeLocal(url: string): AutoridadeLocal {
  const m = /^\s*(https?):\/\/([^/?#\\]*)/i.exec(url)
  if (!m) return null
  const escrita = m[2]
  if (escrita.includes('{{') || escrita.includes('}}')) {
    return { recusa: 'o host vem de uma expressão ({{ }}): só um endereço fixo desta máquina ou da rede local pode ser permitido' }
  }
  let alvo: URL
  try {
    alvo = new URL(`${m[1].toLowerCase()}://${escrita}/`)
  } catch {
    return null
  }
  if (alvo.username || alvo.password) return null
  return classificarHost(alvo.hostname, portaEfetiva(alvo))
}

/** A forma canônica de um item da lista (`host:porta`, porta obrigatória), ou null se ele não pode estar nela. */
export function canonizarPermitido(texto: unknown): string | null {
  if (typeof texto !== 'string') return null
  const t = texto.trim()
  if (!t || t.length > 64 || !/:\d{1,5}$/.test(t) || /[/?#@\\{}\s]/.test(t)) return null
  const r = autoridadeLocal(`http://${t}`)
  return r && 'autoridade' in r ? r.autoridade : null
}

/** `autoridade` (como `autoridadeLocal` devolve) está na lista? Os dois lados são canonizados antes de comparar. */
export function enderecoPermitido(lista: readonly string[], autoridade: string): boolean {
  const alvo = canonizarPermitido(autoridade)
  return alvo !== null && lista.some((x) => canonizarPermitido(x) === alvo)
}

/** A lista como vai para o disco: só itens que podem estar nela, canônicos, sem repetição, em ordem. */
export function normalizarPermitidos(lista: readonly unknown[]): string[] {
  const saida = new Set<string>()
  for (const x of lista) {
    const c = canonizarPermitido(x)
    if (c) saida.add(c)
  }
  return [...saida].sort()
}

export const mensagemDeLocalNaoPermitido = (autoridade: string): string =>
  `${autoridade} é desta máquina ou da rede local; permita este endereço no nó HTTP (botão "Permitir ${autoridade} neste fluxo")`

const mensagemDeNuncaPermitido = (alvo: string, motivo: string): string => `${alvo} é desta máquina ou da rede local e não pode ser usado: ${motivo}`

/**
 * Antes de conectar, em cada salto: o host da URL (IP literal, localhost, nome local) contra a lista. `null` = pode
 * seguir (nome público ainda passa por `conferirResolvidos`). O que nunca pode ser permitido recusa sempre.
 */
export function conferirDestino(url: URL, lista: readonly string[]): string | null {
  const porta = portaEfetiva(url)
  const c = classificarHost(url.hostname, porta)
  if (c === null) return null
  if ('recusa' in c) return mensagemDeNuncaPermitido(`${hostLimpo(url.hostname)}:${porta}`, c.recusa)
  return enderecoPermitido(lista, c.autoridade) ? null : mensagemDeLocalNaoPermitido(c.autoridade)
}

/**
 * Depois do DNS, antes de conectar: os IPs que o nome `host` devolveu, na `porta` efetiva. `null` = pode conectar.
 * - todos públicos: passa;
 * - `localhost`: só loopback (127/8 e ::1), e só com `localhost:porta` na lista;
 * - outro nome que devolve IP interno: recusa (rebinding, resposta mista ou NAS por nome — o usuário escreve o IP).
 */
export function conferirResolvidos(host: string, porta: number, ips: readonly string[], lista: readonly string[]): string | null {
  const h = hostLimpo(host)
  if (h === 'localhost') {
    const loopback = (ip: string): boolean => {
      const n = v4OuMapeado(hostLimpo(ip))
      return n !== null ? naFaixa(n, FAIXAS_PERMITIVEIS_V4[0]) : ipBloqueado(ip) === '::1/128'
    }
    if (!ips.every(loopback)) return `localhost devolveu um endereço que não é desta máquina; o pedido foi recusado`
    return enderecoPermitido(lista, `localhost:${porta}`) ? null : mensagemDeLocalNaoPermitido(`localhost:${porta}`)
  }
  const internos = ips.filter((ip) => ipBloqueado(ip) !== null)
  if (!internos.length) return null
  if (internos.length !== ips.length) return `${h} devolveu endereços públicos e internos ao mesmo tempo; o pedido foi recusado`
  const ip = hostLimpo(internos[0])
  const c = classificarHost(ip, porta)
  const sugestao = c && 'autoridade' in c ? ` (escreva ${c.autoridade} no nó e permita-o)` : ''
  return `${h}:${porta} aponta para ${ip}, desta máquina ou da rede local; nome não é permitido${sugestao}`
}

// ---------------------------------------------------------------- URL

/** A URL do pedido com a consulta acrescentada (codificada). Só http/https, sem usuário:senha na URL. */
export function montarUrl(url: string, consulta: readonly ParNomeValor[]): URL | { erro: string } {
  let alvo: URL
  try {
    alvo = new URL(url.trim())
  } catch {
    return { erro: `URL inválida depois das expressões: ${url.slice(0, 200)}` }
  }
  if (alvo.protocol !== 'http:' && alvo.protocol !== 'https:') return { erro: 'a URL começa com http:// ou https://' }
  if (alvo.username || alvo.password) return { erro: 'usuário e senha não vão na URL: use uma credencial (Conexões › Credenciais)' }
  for (const { nome, valor } of consulta) if (nome) alvo.searchParams.append(nome, valor)
  if (alvo.href.length > MAX_URL_FINAL) return { erro: `a URL passa de ${MAX_URL_FINAL} letras` }
  return alvo
}

// ---------------------------------------------------------------- cabeçalhos

/** `token` da RFC 9110 §5.6.2: o único formato que vale para nome de cabeçalho. */
const TOKEN_HTTP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,256}$/

/** Do protocolo: quem põe é o Node (ou ninguém). */
const PROIBIDOS_NO_PEDIDO = new Set([
  'host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'keep-alive', 'expect',
  'proxy-connection', 'proxy-authorization'
])
/** O que vale como "login" e não segue para outro site num redirecionamento. */
export const CABECALHOS_DE_LOGIN = new Set(['authorization', 'cookie', 'proxy-authorization'])
/** Não entram na execução (a execução fica em disco e aparece na tela). */
const FORA_DA_EXECUCAO = new Set(['set-cookie', 'set-cookie2', 'authorization', 'proxy-authorization', 'cookie', 'proxy-authenticate'])

/**
 * Os cabeçalhos escritos no nó, já com as expressões: nome em minúsculas, sem os do protocolo, sem valor com quebra de
 * linha. Um nome repetido: vale o último.
 */
export function cabecalhosDoPedido(pares: readonly ParNomeValor[]): Record<string, string> | { erro: string } {
  const saida: Record<string, string> = {}
  for (const { nome, valor } of pares) {
    if (!nome.trim()) continue
    // o nome vai como está para o Node: só o token da RFC 9110 (nada de espaço, CR, LF, NUL, dois-pontos…)
    if (!TOKEN_HTTP.test(nome)) return { erro: `o nome de cabeçalho ${JSON.stringify(nome.slice(0, 60))} não vale: só letras, números e ! # $ % & ' * + - . ^ _ \` | ~` }
    const n = nome.toLowerCase()
    if (PROIBIDOS_NO_PEDIDO.has(n)) return { erro: `o cabeçalho ${nome} é do próprio HTTP e não se escreve no nó` }
    if (/[\r\n\0]/.test(valor)) return { erro: `o cabeçalho ${nome} ficou com quebra de linha depois das expressões` }
    saida[n] = valor.trim()
  }
  return saida
}

/** Os cabeçalhos da resposta que entram na execução: sem set-cookie nem authorization; repetidos viram uma linha. */
export function cabecalhosDaResposta(brutos: Record<string, string | string[] | undefined>): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const [nome, valor] of Object.entries(brutos)) {
    const n = nome.toLowerCase()
    if (FORA_DA_EXECUCAO.has(n) || valor === undefined) continue
    saida[n] = Array.isArray(valor) ? valor.join(', ') : valor
  }
  return saida
}

// ---------------------------------------------------------------- corpo

/**
 * O corpo JSON com as expressões escapadas. Dentro de uma string JSON (`"oi {{ nome }}"`), o valor entra como texto
 * escapado; fora (`{"n": {{ numero }}}`), como valor JSON (texto ganha aspas, ausente vira `null`). O resultado precisa
 * ser JSON válido.
 */
export function corpoJson(modelo: string, json: unknown): string | { erro: string } {
  let dentroDeTexto = false
  let saida = ''
  for (const p of partes(modelo)) {
    if (p.tipo === 'texto') {
      for (let i = 0; i < p.texto.length; i++) {
        const c = p.texto[i]
        if (dentroDeTexto && c === '\\') {
          saida += c + (p.texto[i + 1] ?? '')
          i++
          continue
        }
        if (c === '"') dentroDeTexto = !dentroDeTexto
        saida += c
      }
      continue
    }
    if (!p.caminho) {
      saida += p.bruto
      continue
    }
    const v = valorNoCaminho(json, p.caminho)
    if (dentroDeTexto) saida += JSON.stringify(emTexto(v)).slice(1, -1)
    else saida += v === undefined ? 'null' : (JSON.stringify(v) ?? 'null')
  }
  if (!saida.trim()) return ''
  try {
    JSON.parse(saida)
  } catch (e) {
    return { erro: `o corpo JSON não ficou válido depois das expressões (${e instanceof Error ? e.message.slice(0, 120) : 'erro'})` }
  }
  return saida
}

/**
 * O formulário (`application/x-www-form-urlencoded`): uma linha `nome=valor` por campo (ou separados por `&`). Cada
 * nome e valor é resolvido e codificado sozinho, então um `&` ou `=` vindo do item não cria campo novo.
 */
export function corpoFormulario(modelo: string, json: unknown): string {
  const campos = new URLSearchParams()
  for (const linha of modelo.split(/\r?\n|&/)) {
    if (!linha.trim()) continue
    const igual = linha.indexOf('=')
    const nome = igual < 0 ? linha : linha.slice(0, igual)
    const valor = igual < 0 ? '' : linha.slice(igual + 1)
    campos.append(resolverTexto(nome.trim(), json), resolverTexto(valor, json))
  }
  return campos.toString()
}

const TIPO_DO_CORPO = { json: 'application/json', texto: 'text/plain; charset=utf-8', formulario: 'application/x-www-form-urlencoded' } as const

/** O corpo pronto e o content-type dele. `modelo` é o texto do nó ANTES das expressões (o `ctx.no.ajustes`). */
export function montarCorpo(tipo: 'nenhum' | 'json' | 'texto' | 'formulario', modelo: string, resolvido: string, item: Item):
  { corpo?: string; tipoDeConteudo?: string } | { erro: string } {
  if (tipo === 'nenhum') return {}
  const corpo = tipo === 'json' ? corpoJson(modelo, item.json) : tipo === 'formulario' ? corpoFormulario(modelo, item.json) : resolvido
  if (typeof corpo !== 'string') return corpo
  return { corpo, tipoDeConteudo: TIPO_DO_CORPO[tipo] }
}

// ---------------------------------------------------------------- redirecionamento

/**
 * O próximo passo de um 3xx: a URL nova (relativa à atual) e o método (303, e 301/302 de quem não é GET/HEAD, viram
 * GET sem corpo, como nos navegadores). Sem `Location`: null (a resposta 3xx vira erro).
 */
export function proximoPasso(status: number, location: string | undefined, atual: URL, metodo: string):
  { url: URL; metodo: string; semCorpo: boolean } | { erro: string } | null {
  if (![301, 302, 303, 307, 308].includes(status) || !location) return null
  let url: URL
  try {
    url = new URL(location, atual)
  } catch {
    return { erro: `redirecionamento para um endereço inválido (${location.slice(0, 120)})` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { erro: `redirecionamento para ${url.protocol} não vale` }
  const vira = status === 303 || ((status === 301 || status === 302) && metodo !== 'GET' && metodo !== 'HEAD')
  return { url, metodo: vira ? (metodo === 'HEAD' ? 'HEAD' : 'GET') : metodo, semCorpo: vira }
}

/** A resposta como o nó a devolve: JSON vira objeto; o resto, texto. */
export function lerCorpo(texto: string, tipoDeConteudo: string | undefined): unknown {
  if (/\bjson\b/i.test(tipoDeConteudo ?? '') && texto.trim()) {
    try {
      return JSON.parse(texto)
    } catch {
      return texto
    }
  }
  return texto
}
