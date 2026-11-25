/**
 * Conferência de tamanho **no preload da página, antes do IPC** (1.9.5, revisão 195, item 2). Sem ela, um
 * `orkPagina.recado('a', 'x'.repeat(1e8))` em laço cruza o IPC inteiro e é desserializado no heap do main antes de o
 * main recusar: o processo do app inteiro (com todos os terminais) estoura memória. Aqui a recusa sai sem enviar.
 *
 * O main continua conferindo tudo (o preload é a primeira barreira, não a única). Os tetos são os de `LIMITES` em
 * shared/paginas.ts; a prova (shared/paginas.prova.mts) confere que batem.
 *
 * Módulo puro e sem import: só o preload da página (preload/pagina.ts) o importa, então ele vai embutido em
 * `pagina.js`. Não importe daqui no preload da janela: viraria um pedaço compartilhado que o sandbox não carrega.
 */

export const TETOS_NO_PRELOAD = {
  agenteId: 64,
  recadoBytes: 4 * 1024,
  chave: 64,
  dadoBytes: 256 * 1024,
  caminho: 1024,
  /** (1.9.7) `api.pedir`/`mcp.*`: o nome da API/servidor (ou um de `atende`) */
  nome: 80,
  /** (1.9.7) `api.pedir`: o `host` opcional (o main confere se está nos domínios da API) */
  host: 253,
  /** (1.9.7) `api.pedir`: caminho (sem o host) e a consulta inteira em JSON */
  apiCaminho: 2048,
  apiConsultaBytes: 8 * 1024,
  /** (1.9.7) `api.pedir`: corpo (texto como está, ou o JSON do valor) */
  apiCorpoBytes: 100 * 1024,
  /** (1.9.7) `mcp.chamar`: nome da ferramenta (o teto do MCP) e os argumentos em JSON */
  mcpFerramenta: 128,
  mcpArgumentosBytes: 100 * 1024,
  /** chamadas da página esperando resposta do main, ao mesmo tempo */
  emVoo: 8
} as const

/** Bytes em UTF-8 sem codificar texto grande: comprimento (UTF-16) acima do teto já passa do teto em bytes. */
function cabe(texto: string, teto: number): boolean {
  if (texto.length > teto) return false
  return new TextEncoder().encode(texto).length <= teto
}

/**
 * Roda **no mundo da página**, em todo frame em que o preload roda (`contextBridge.executeInMainWorld`, antes de
 * qualquer script dela): tira do global toda interface `RTC*` (e `webkitRTC*`). Sem `RTCPeerConnection` não há STUN,
 * TURN, ICE nem o DNS do servidor ICE, que passam por fora da CSP e do `webRequest` (revisão 195, decisão do Maestro:
 * páginas "+" não usam WebRTC). O iframe `about:blank` (sem preload) é de outra origem pela CSP `sandbox`. A função é
 * serializada: não use nada de fora dela. Devolve o que sobrou (o esperado é nada).
 */
export function desligarWebRtc(): string[] {
  const g = globalThis as unknown as Record<string, unknown>
  const ehRtc = (n: string): boolean => /^(webkit)?RTC/.test(n)
  const nomes = new Set(Object.getOwnPropertyNames(g).filter(ehRtc))
  for (const n of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCIceTransport', 'RTCDataChannel']) nomes.add(n)
  for (const n of nomes) {
    try {
      delete g[n]
    } catch {
      // não configurável: aparece no que sobrou
    }
  }
  return Object.getOwnPropertyNames(g).filter(ehRtc)
}

export type Conferido = { ok: true; args: unknown[] } | { ok: false; erro: string }

const recusa = (erro: string): Conferido => ({ ok: false, erro })

const METODOS_DE_API = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** O valor depois de ida e volta pelo JSON, se couber em `teto` bytes; senão, o motivo. */
function jsonQueCabe(valor: unknown, teto: number, nome: string): { ok: true; valor: unknown } | { ok: false; erro: string } {
  let json: string | undefined
  try {
    json = JSON.stringify(valor)
  } catch {
    return { ok: false, erro: `${nome} não é JSON` }
  }
  if (json === undefined) return { ok: false, erro: `${nome} não é JSON` }
  if (!cabe(json, teto)) return { ok: false, erro: `${nome} passa de ${teto / 1024} KB` }
  return { ok: true, valor: JSON.parse(json) }
}

/** (1.9.7) Nome da API/servidor, como a página chama: texto de 1 a 80 (o main resolve sem caixa, acento e espaço). */
const nomeValido = (e: unknown): e is string => typeof e === 'string' && e.trim().length > 0 && e.length <= TETOS_NO_PRELOAD.nome

/** Só a forma (letras, dígitos, ponto e hífen, até 253): se está nos domínios da API, quem diz é o main. */
const HOST_NO_PRELOAD = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

/**
 * (1.9.7) `api.pedir(nome, pedido)`: só os campos conhecidos cruzam. O corpo em texto vai como está; outro valor
 * vai depois do JSON (o main o manda como JSON). GET e HEAD não levam corpo. `host` vai em minúsculas.
 */
function conferirPedidoDeApi(nome: unknown, pedido: unknown): Conferido {
  const T = TETOS_NO_PRELOAD
  if (!nomeValido(nome)) return recusa(`nome inválido: use o nome da API (até ${T.nome} letras)`)
  if (!ehObjeto(pedido)) return recusa('pedido inválido: use { metodo, caminho, consulta?, corpo?, host? }')
  const metodo = typeof pedido.metodo === 'string' ? pedido.metodo.toUpperCase() : 'GET'
  if (!METODOS_DE_API.includes(metodo)) return recusa('método inválido: use GET, HEAD, POST, PUT, PATCH ou DELETE')
  const { caminho, consulta, corpo, host } = pedido
  if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.length > T.apiCaminho) return recusa('caminho inválido: comece com "/"')
  const saida: Record<string, unknown> = { metodo, caminho }
  if (host !== undefined) {
    if (typeof host !== 'string' || host.length > T.host) return recusa('host inválido: use um dos domínios da API')
    const h = host.toLowerCase()
    if (!HOST_NO_PRELOAD.test(h) || h.includes('..')) return recusa('host inválido: use um dos domínios da API')
    saida.host = h
  }
  if (consulta !== undefined) {
    if (!ehObjeto(consulta)) return recusa('consulta inválida: use um objeto de textos')
    for (const v of Object.values(consulta)) {
      if (!['string', 'number', 'boolean'].includes(typeof v)) return recusa('consulta inválida: use um objeto de textos')
    }
    const r = jsonQueCabe(consulta, T.apiConsultaBytes, 'a consulta')
    if (!r.ok) return recusa(r.erro)
    saida.consulta = r.valor
  }
  if (corpo !== undefined) {
    if (metodo === 'GET' || metodo === 'HEAD') return recusa(`${metodo} não leva corpo`)
    if (typeof corpo === 'string') {
      if (!cabe(corpo, T.apiCorpoBytes)) return recusa(`o corpo passa de ${T.apiCorpoBytes / 1024} KB`)
      saida.corpo = corpo
    } else {
      const r = jsonQueCabe(corpo, T.apiCorpoBytes, 'o corpo')
      if (!r.ok) return recusa(r.erro)
      saida.corpo = r.valor
    }
  }
  return { ok: true, args: [nome, saida] }
}

/**
 * Confere os argumentos de `metodo` e devolve os que podem ir ao main. Em `dados-gravar`, vai o valor já passado
 * por JSON (ida e volta): um `Map` ou objeto com conteúdo que o JSON não vê não leva megabytes escondidos no IPC.
 */
export function conferirAntesDeEnviar(metodo: string, args: readonly unknown[]): Conferido {
  const T = TETOS_NO_PRELOAD
  switch (metodo) {
    case 'eu':
    case 'quadro':
    case 'agentes':
    case 'dados-chaves':
      return { ok: true, args: [] }
    case 'recado': {
      const [agenteId, texto] = args
      if (typeof agenteId !== 'string' || agenteId.length > T.agenteId) return recusa('agente inválido')
      if (typeof texto !== 'string') return recusa('o recado precisa ser texto')
      if (!cabe(texto, T.recadoBytes)) return recusa(`o recado passa de ${T.recadoBytes / 1024} KB`)
      return { ok: true, args: [agenteId, texto] }
    }
    case 'dados-ler':
    case 'dados-apagar': {
      const [chave] = args
      if (typeof chave !== 'string' || chave.length > T.chave) return recusa('chave inválida')
      return { ok: true, args: [chave] }
    }
    case 'dados-gravar': {
      const [chave, valor] = args
      if (typeof chave !== 'string' || chave.length > T.chave) return recusa('chave inválida')
      let json: string | undefined
      try {
        json = JSON.stringify(valor)
      } catch {
        return recusa('o valor não é JSON')
      }
      if (json === undefined) return recusa('o valor não é JSON')
      if (!cabe(json, T.dadoBytes)) return recusa(`o valor passa de ${T.dadoBytes / 1024} KB`)
      return { ok: true, args: [chave, JSON.parse(json)] }
    }
    case 'local-ler': {
      const [caminho] = args
      if (typeof caminho !== 'string' || caminho.length > T.caminho) return recusa('caminho inválido: comece com "/"')
      return { ok: true, args: [caminho] }
    }
    case 'api-disponiveis':
    case 'mcp-disponiveis':
      return { ok: true, args: [] }
    case 'api-pedir':
      return conferirPedidoDeApi(args[0], args[1])
    case 'mcp-ferramentas': {
      const [nome] = args
      if (!nomeValido(nome)) return recusa(`nome inválido: use o nome do servidor (até ${T.nome} letras)`)
      return { ok: true, args: [nome] }
    }
    case 'mcp-chamar': {
      const [nome, ferramenta, argumentos = {}] = args
      if (!nomeValido(nome)) return recusa(`nome inválido: use o nome do servidor (até ${T.nome} letras)`)
      if (typeof ferramenta !== 'string' || !ferramenta || ferramenta.length > T.mcpFerramenta) return recusa('ferramenta inválida')
      if (!ehObjeto(argumentos)) return recusa('argumentos inválidos: use um objeto')
      const r = jsonQueCabe(argumentos, T.mcpArgumentosBytes, 'os argumentos')
      if (!r.ok) return recusa(r.erro)
      return { ok: true, args: [nome, ferramenta, r.valor] }
    }
    default:
      return recusa('chamada desconhecida')
  }
}
