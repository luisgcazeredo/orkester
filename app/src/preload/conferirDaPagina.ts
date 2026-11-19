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
    default:
      return recusa('chamada desconhecida')
  }
}
