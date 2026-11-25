// MCP de fora (1.9.7, C1): o cliente que fala com servidores MCP de terceiros, por stdio ou por https. Quem cadastra
// é o C2 (`registro.ts`); quem chama é o nó `fora.mcp` (C3a) e a permissão `mcp` das páginas (C5a). As regras puras
// estão em `shared/mcpFora.ts`; aqui, o que precisa de processo e rede:
//
// - **stdio:** sobe na 1ª chamada e reusa a mesma conexão; parado 5 min, fecha. Fechar é matar a ÁRVORE (no Windows,
//   `taskkill /T /F`: o `cmd /c npx` deixa netos), também ao sair do app (`encerrarTudoJa`, síncrono). Revisão C:
//   a morte é CONFERIDA na lista de processos (`arvore.ts`), com reserva por pid se o taskkill falhar; "fechou" só
//   sai conferido, senão sai "sobrou" com os pids. No máximo 6
//   vivos; 3 quedas em 10 min deixam o servidor pausado até `retomar`. Ambiente: o mínimo do SDK + o declarado, sem
//   nenhum `ORK_*`.
// - **https:** só para fora do PC, host por nome, e o IP é conferido depois do DNS e antes de conectar (o mesmo
//   `conferirResolvidos` do nó HTTP, sem nenhum endereço local permitido). Redirecionamento só dentro da mesma origem
//   (o SDK pede de novo e o `fetch` daqui confere host e porta a cada pedido). Cabeçalho de credencial vem resolvido.
// - **Prazos:** 30 s por chamada, 60 s na subida. **Resultado:** só texto e estruturado, até 2 MB.
// - **Impressão:** cada ferramenta listada leva a sua; `chamar` com `impressaoEsperada` recusa a que mudou.
// - Mensagens de erro passam pela máscara dos segredos da definição.
import type { ChildProcess } from 'node:child_process'
import { request as pedirHttpsDoNode, type RequestOptions } from 'node:https'
import type { ClientRequest, IncomingMessage } from 'node:http'
import { Readable, Transform } from 'node:stream'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ErrorCode, McpError, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import type { DefinicaoHttp, DefinicaoMcpFora, DefinicaoStdio, FerramentaMcp, ResultadoMcp } from '../../shared/mcpFora'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { JANELA_QUEDAS_MS, MAX_FERRAMENTAS, MAX_RESULTADO, MAX_VIVOS, PARADO_MS, PRAZO_CHAMADA_MS, PRAZO_SUBIDA_MS, ambienteMinimo, conferirUrlHttp, ferramentaDe, mascarar, registrarQueda, resultadoDaChamada, segredosDaDefinicao, validarDefinicao } from '../../shared/mcpFora.ts'
// @ts-expect-error idem
import { conferirDestino } from '../../shared/fluxos/rede.ts'
// @ts-expect-error idem
import { matarEConferir, matarEConferirJa, nossos, sistemaDoNode, type AlvoDaArvore, type Processo, type ResultadoDaMorte, type SistemaDeProcessos } from './arvore.ts'
// o mesmo `lookup` conferido do nó HTTP e das páginas (A1), sem nenhum endereço local permitido
// @ts-expect-error idem
import { lookupConferido, type Resolvedor } from '../fluxos/http.ts'

/** Bytes de uma mensagem stdio (o SDK fecha a conexão acima disso) e de uma resposta https. */
const MAX_MENSAGEM = 8 * 1024 * 1024
/** O fim do stderr do servidor, para explicar uma subida que falhou. */
const MAX_STDERR = 4 * 1024

export type CodigoDoErroMcp =
  | 'definicao' // a definição não vale (ou o resolvedor falhou)
  | 'pausado' // 3 quedas em 10 min: só volta com `retomar`
  | 'lotado' // 6 vivos, todos em uso
  | 'subida' // o processo não subiu, ou não respondeu ao `initialize` em 60 s
  | 'prazo' // a chamada passou de 30 s
  | 'caiu' // a conexão caiu no meio
  | 'grande' // resultado acima de 2 MB
  | 'ferramenta-mudou' // a impressão não é a aprovada
  | 'ferramenta-sumiu' // o servidor não lista mais a ferramenta
  | 'rede' // https recusado (IP interno, host fora da origem…) ou falha de rede
  | 'servidor' // erro de protocolo devolvido pelo servidor
  | 'nao-existe' // (registro, C2) o servidor foi removido
  | 'precisa-login' // (registro, C2) http importado sem cabeçalho: OAuth chega na 1.9.8

/** Erro do cliente, com um código que o C3a e o C5a traduzem. A mensagem nunca cita um segredo. */
export class ErroMcpFora extends Error {
  readonly codigo: CodigoDoErroMcp
  constructor(codigo: CodigoDoErroMcp, mensagem: string) {
    super(mensagem)
    this.codigo = codigo
    this.name = 'ErroMcpFora'
  }
}

export type EventoMcpFora =
  | { tipo: 'subiu'; id: string; pid?: number }
  | { tipo: 'fechou'; id: string; motivo: 'parado' | 'lotado' | 'pedido' | 'saida' }
  | { tipo: 'caiu'; id: string; quedas: number }
  | { tipo: 'pausado'; id: string }
  /** Fechamos, mas a árvore não morreu toda (`pids`), ou não deu para conferir (`conferido: false`). */
  | { tipo: 'sobrou'; id: string; pids: number[]; conferido: boolean }

export type { Resolvedor }
type PedirHttps = (opcoes: RequestOptions, aoResponder: (res: IncomingMessage) => void) => ClientRequest

export interface OpcoesDoClienteMcp {
  /**
   * id do servidor → a definição COM os valores (o C2 lê o registro e tira os segredos do cofre aqui). Chamado a cada
   * subida, então o cliente não guarda segredo além da vida da conexão.
   */
  resolver: (id: string) => Promise<DefinicaoMcpFora>
  /** Subiu, fechou, caiu, pausou: para a tela (C4) e o registro (C2). */
  aoEvento?: (e: EventoMcpFora) => void
  /** Só para as provas: encurtar prazos, trocar o relógio, a rede e o ambiente padrão. */
  prazoChamadaMs?: number
  prazoSubidaMs?: number
  paradoMs?: number
  janelaQuedasMs?: number
  maxVivos?: number
  agora?: () => number
  resolvedor?: Resolvedor
  pedirHttps?: PedirHttps
  ambientePadrao?: () => Record<string, string>
  /** Listar e matar processos (as provas trocam para simular taskkill negado). */
  sistema?: SistemaDeProcessos
}

export interface OpcoesDaChamada {
  /** A impressão aprovada desta ferramenta: diferente (ou ferramenta sumida) → recusa sem chamar. */
  impressaoEsperada?: string
  sinal?: AbortSignal
}

export interface EstadoMcpFora {
  id: string
  vivo: boolean
  pid?: number
  emUso: number
  pausado: boolean
  quedas: number
  /** Fechamos e a morte da árvore ainda não foi conferida: não conta como fechada. */
  fechando?: true
  /** Pids que não morreram ao fechar (até a saída do app tentar de novo). */
  sobraram?: number[]
}

interface Conexao {
  id: string
  cliente: Client
  transporte: Transport
  pid?: number
  /** Quando o processo raiz nasceu (ms): filtra os descendentes na lista do sistema. */
  nasceu?: number
  /** A árvore vista depois da subida (pid + quando nasceu), para o que a lista da hora já não liga à raiz. */
  conhecidos?: Processo[]
  /**
   * O processo raiz ainda é o nosso filho (não saiu): o Node segura o handle dele, então o pid não pode ter sido
   * reaproveitado e o `taskkill /T` nele é seguro (Revisão C, R3).
   */
  filhoVivo?: boolean
  segredos: string[]
  emUso: number
  ultimoUso: number
  relogio?: ReturnType<typeof setTimeout>
  /** Nós fechamos (não conta como queda). */
  fechando: boolean
  ferramentas?: Promise<FerramentaMcp[]>
  /** A promessa que está em `conexoes` para esta conexão (para não apagar a de uma subida mais nova). */
  promessa?: Promise<Conexao>
}

const portaEfetiva = (url: URL): number => (url.port ? Number(url.port) : 443)

/** Corta a resposta https acima de `max` bytes (a conexão cai com erro). */
function limitador(max: number): Transform {
  let total = 0
  return new Transform({
    transform(pedaco: Buffer, _cod, pronto) {
      total += pedaco.length
      if (total > max) return pronto(new ErroMcpFora('grande', `a resposta do servidor passou de ${Math.round(max / 1024 / 1024)} MB`))
      pronto(null, pedaco)
    }
  })
}

/**
 * O `fetch` do transporte HTTP: node `https` com o `lookup` conferido, só para a origem cadastrada (protocolo, host e
 * porta conferidos a cada pedido, então um redirecionamento para fora nunca sai daqui) e sem seguir redirecionamento.
 */
export function fetchConferido(origem: URL, resolvedor?: Resolvedor, pedir: PedirHttps = pedirHttpsDoNode): FetchLike {
  const porta = portaEfetiva(origem)
  return (entrada, init) =>
    new Promise<Response>((ok, falha) => {
      let url: URL
      try {
        url = new URL(typeof entrada === 'string' || entrada instanceof URL ? entrada : (entrada as { url: string }).url)
      } catch {
        return falha(new ErroMcpFora('rede', 'URL inválida'))
      }
      if (url.protocol !== 'https:' || url.hostname !== origem.hostname || portaEfetiva(url) !== porta || url.username || url.password) {
        return falha(new ErroMcpFora('rede', `pedido para fora do servidor cadastrado (${url.protocol}//${url.host}) recusado`))
      }
      const destino = conferirDestino(url, [])
      if (destino) return falha(new ErroMcpFora('rede', destino))
      const cabecalhos: Record<string, string> = {}
      new Headers(init?.headers).forEach((v, k) => (cabecalhos[k] = v))
      const corpo = init?.body
      if (corpo !== undefined && corpo !== null && typeof corpo !== 'string' && !(corpo instanceof Uint8Array)) {
        return falha(new ErroMcpFora('rede', 'corpo de pedido que o cliente não sabe mandar'))
      }
      const metodo = (init?.method ?? 'GET').toUpperCase()
      let req: ClientRequest
      try {
        req = pedir(
          {
            protocol: 'https:',
            hostname: url.hostname,
            port: porta,
            path: `${url.pathname}${url.search}`,
            method: metodo,
            headers: cabecalhos,
            lookup: lookupConferido([], porta, resolvedor),
            signal: init?.signal ?? undefined
          },
          (res) => {
            const h = new Headers()
            const brutos = res.rawHeaders
            for (let i = 0; i + 1 < brutos.length; i += 2) {
              try {
                h.append(brutos[i], brutos[i + 1])
              } catch {
                /* cabeçalho inválido: fica de fora */
              }
            }
            const status = res.statusCode ?? 502
            const semCorpo = metodo === 'HEAD' || status === 204 || status === 205 || status === 304
            if (semCorpo) res.resume()
            let fluxo: ReadableStream<Uint8Array> | null = null
            if (!semCorpo) {
              const lim = limitador(MAX_MENSAGEM)
              res.on('error', (e) => lim.destroy(e))
              lim.on('error', () => res.destroy())
              fluxo = Readable.toWeb(res.pipe(lim)) as unknown as ReadableStream<Uint8Array>
            }
            try {
              ok(new Response(fluxo, { status: status < 200 || status > 599 ? 502 : status, statusText: res.statusMessage ?? '', headers: h }))
            } catch (e) {
              res.destroy()
              falha(e)
            }
          }
        )
      } catch (e) {
        return falha(e)
      }
      req.on('error', falha)
      if (corpo !== undefined && corpo !== null) req.end(corpo)
      else req.end()
    })
}

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * O cliente de MCP de fora. Uma instância no main (o C2 cria e registra `encerrarTudoJa` na saída do app).
 *
 * Interface pública:
 * - `ferramentas(id)`: lista (sobe se preciso), com a impressão de cada uma; serve também ao "Testar";
 * - `chamar(id, ferramenta, argumentos, { impressaoEsperada?, sinal? })` → `ResultadoMcp`;
 * - `fechar(id)`, `encerrarTudo()`, `encerrarTudoJa()`;
 * - `pausado(id)`, `retomar(id)`, `estado()`.
 * Falhas viram `ErroMcpFora` (com `codigo`).
 */
export class ClienteMcpFora {
  private readonly conexoes = new Map<string, Promise<Conexao>>()
  private readonly vivas = new Map<string, Conexao>()
  private readonly quedas = new Map<string, number[]>()
  private readonly pausados = new Set<string>()
  /** Toda conexão com processo, da subida (antes do `initialize`) até a morte conferida: a saída do app mata todas. */
  private readonly comProcesso = new Set<Conexao>()
  /** Os processos que não morreram ao fechar (por servidor): a saída do app tenta de novo. */
  private readonly restos = new Map<string, Processo[]>()
  private readonly sistema: SistemaDeProcessos
  private readonly op: OpcoesDoClienteMcp
  private readonly agora: () => number

  constructor(opcoes: OpcoesDoClienteMcp) {
    this.sistema = opcoes.sistema ?? sistemaDoNode()
    this.op = opcoes
    this.agora = opcoes.agora ?? Date.now
  }

  // ------------------------------------------------------------ público

  async ferramentas(id: string): Promise<FerramentaMcp[]> {
    return this.usar(id, (c) => this.listar(c))
  }

  async chamar(id: string, ferramenta: string, argumentos: Record<string, unknown> = {}, opcoes: OpcoesDaChamada = {}): Promise<ResultadoMcp> {
    return this.usar(id, async (c) => {
      if (opcoes.impressaoEsperada !== undefined) {
        // Revisão C (achado 3): a lista é SEMPRE nova antes de chamar; a notificação `list_changed` é do servidor de
        // fora e não dá para confiar nela. Sem lista nova, não chama.
        let lista: FerramentaMcp[]
        try {
          lista = await this.listar(c, true)
        } catch (e) {
          const t = e instanceof ErroMcpFora ? e : this.traduzir(e, c)
          throw new ErroMcpFora(t.codigo, `não deu para conferir a ferramenta ${ferramenta} antes de chamar (${t.message}); a chamada foi recusada`)
        }
        const f = lista.find((x) => x.nome === ferramenta)
        if (!f) throw new ErroMcpFora('ferramenta-sumiu', `o servidor não tem mais a ferramenta ${ferramenta}`)
        if (f.impressao !== opcoes.impressaoEsperada) {
          throw new ErroMcpFora('ferramenta-mudou', `a ferramenta ${ferramenta} mudou desde o aceite e está bloqueada até ser revista em Conexões`)
        }
      }
      const bruto = await c.cliente.callTool({ name: ferramenta, arguments: argumentos }, undefined, {
        timeout: this.op.prazoChamadaMs ?? PRAZO_CHAMADA_MS,
        signal: opcoes.sinal
      })
      const r = resultadoDaChamada(bruto, MAX_RESULTADO)
      if ('erro' in r && typeof r.erro === 'string') throw new ErroMcpFora('grande', r.erro)
      return r as ResultadoMcp
    })
  }

  /** Fecha um servidor (a árvore morre). Não conta como queda. */
  async fechar(id: string, motivo: 'parado' | 'lotado' | 'pedido' | 'saida' = 'pedido'): Promise<void> {
    const p = this.conexoes.get(id)
    if (!p) return
    let c: Conexao
    try {
      c = await p
    } catch {
      return
    }
    await this.derrubar(c, motivo)
  }

  async encerrarTudo(): Promise<void> {
    await Promise.all([...this.conexoes.keys()].map((id) => this.fechar(id, 'saida')))
  }

  /**
   * Na saída do app: mata todas as árvores já (síncrono), as vivas, as que estão subindo e os restos de antes, e
   * confere na lista de processos. Devolve o que sobrou (o main não tem mais o que fazer, mas a prova confere).
   */
  encerrarTudoJa(): ResultadoDaMorte {
    const raizes: AlvoDaArvore[] = []
    for (const c of new Set([...this.vivas.values(), ...this.comProcesso])) {
      c.fechando = true
      if (c.relogio) clearTimeout(c.relogio)
      if (c.pid) raizes.push(this.alvoDe(c))
    }
    // os restos de um fechamento que falhou: nunca são filhos vivos (taskkill /T não vale); só morrem se pid + hora baterem
    for (const restos of this.restos.values()) for (const p of restos) raizes.push({ raiz: p.pid, desde: p.nasceu, raizNossa: false, conhecidos: [p] })
    const r = matarEConferirJa(this.sistema, raizes)
    for (const c of new Set([...this.vivas.values(), ...this.comProcesso])) void c.cliente.close().catch(() => {})
    this.vivas.clear()
    this.conexoes.clear()
    this.comProcesso.clear()
    this.restos.clear()
    return r
  }

  /** Os pids que não morreram ao fechar, por servidor (vazio = nada sobrou). */
  restosVivos(): { id: string; pids: number[] }[] {
    return [...this.restos].map(([id, ps]) => ({ id, pids: ps.map((p) => p.pid) }))
  }

  private alvoDe(c: Conexao): AlvoDaArvore {
    return { raiz: c.pid as number, desde: c.nasceu ?? 0, raizNossa: !!c.filhoVivo, conhecidos: c.conhecidos }
  }

  /** Mata a árvore da conexão e confere; o que sobrar fica em `restos` e vira o evento "sobrou". */
  private async matar(c: Conexao, aoConferir?: () => void): Promise<boolean> {
    if (!c.pid) {
      this.comProcesso.delete(c)
      aoConferir?.()
      return true
    }
    const r = await matarEConferir(this.sistema, this.alvoDe(c))
    if (r.conferido) this.restos.delete(c.id)
    if (r.conferido) aoConferir?.()
    this.comProcesso.delete(c)
    if (r.conferido) return true
    // só o que tem hora de nascimento conferida entra nos restos (a saída do app tenta de novo, conferindo)
    if (r.restos.length) this.restos.set(c.id, r.restos)
    this.op.aoEvento?.({ tipo: 'sobrou', id: c.id, pids: r.sobraram, conferido: r.conferido })
    return false
  }

  pausado(id: string): boolean {
    return this.pausados.has(id)
  }

  /** Tira da pausa e zera as quedas (o usuário mandou tentar de novo). */
  retomar(id: string): void {
    this.pausados.delete(id)
    this.quedas.delete(id)
  }

  estado(): EstadoMcpFora[] {
    const fechando = new Set([...this.comProcesso].filter((c) => c.fechando).map((c) => c.id))
    const ids = new Set([...this.vivas.keys(), ...this.pausados, ...this.quedas.keys(), ...fechando, ...this.restos.keys()])
    return [...ids].sort().map((id) => {
      const c = this.vivas.get(id)
      const e: EstadoMcpFora = { id, vivo: !!c, emUso: c?.emUso ?? 0, pausado: this.pausados.has(id), quedas: this.quedasValendo(id).length }
      if (c?.pid) e.pid = c.pid
      if (!c && fechando.has(id)) e.fechando = true
      const restos = this.restos.get(id)
      if (restos?.length) e.sobraram = restos.map((p) => p.pid)
      return e
    })
  }

  // ------------------------------------------------------------ uso e relógio de parado

  private async usar<T>(id: string, fazer: (c: Conexao) => Promise<T>): Promise<T> {
    const c = await this.conectar(id)
    c.emUso++
    if (c.relogio) clearTimeout(c.relogio)
    try {
      return await fazer(c)
    } catch (e) {
      throw this.traduzir(e, c)
    } finally {
      c.emUso--
      c.ultimoUso = this.agora()
      this.armarParado(c)
    }
  }

  private armarParado(c: Conexao): void {
    if (c.relogio) clearTimeout(c.relogio)
    if (c.emUso > 0 || c.fechando) return
    c.relogio = setTimeout(() => void this.derrubar(c, 'parado'), this.op.paradoMs ?? PARADO_MS)
    c.relogio.unref?.()
  }

  private traduzir(e: unknown, c: Conexao): ErroMcpFora {
    if (e instanceof ErroMcpFora) return new ErroMcpFora(e.codigo, mascarar(e.message, c.segredos))
    const msg = mascarar(mensagemDe(e), c.segredos)
    if (e instanceof McpError) {
      if (e.code === ErrorCode.RequestTimeout) return new ErroMcpFora('prazo', `o servidor não respondeu em ${Math.round((this.op.prazoChamadaMs ?? PRAZO_CHAMADA_MS) / 1000)} s`)
      if (e.code === ErrorCode.ConnectionClosed) return new ErroMcpFora('caiu', 'a conexão com o servidor caiu no meio da chamada')
      return new ErroMcpFora('servidor', msg)
    }
    if (c.fechando || !this.vivas.has(c.id)) return new ErroMcpFora('caiu', 'a conexão com o servidor caiu no meio da chamada')
    return new ErroMcpFora('rede', msg)
  }

  /** As ferramentas da conexão; `fresca`: pede a lista de novo ao servidor (não usa a guardada). */
  private async listar(c: Conexao, fresca = false): Promise<FerramentaMcp[]> {
    if (!c.ferramentas || fresca) {
      const p = (async () => {
        const saida: FerramentaMcp[] = []
        let cursor: string | undefined
        do {
          const pagina = await c.cliente.listTools(cursor ? { cursor } : undefined, { timeout: this.op.prazoChamadaMs ?? PRAZO_CHAMADA_MS })
          for (const t of pagina.tools) saida.push(await ferramentaDe(t))
          if (saida.length > MAX_FERRAMENTAS) throw new ErroMcpFora('servidor', `o servidor lista mais de ${MAX_FERRAMENTAS} ferramentas`)
          cursor = pagina.nextCursor
        } while (cursor)
        return saida
      })()
      c.ferramentas = p
      p.catch(() => {
        if (c.ferramentas === p) c.ferramentas = undefined
      })
    }
    return c.ferramentas
  }

  // ------------------------------------------------------------ subir, cair, fechar

  private quedasValendo(id: string): number[] {
    const janela = this.op.janelaQuedasMs ?? JANELA_QUEDAS_MS
    return (this.quedas.get(id) ?? []).filter((t) => this.agora() - t < janela)
  }

  private queda(id: string): void {
    const { quedas, pausar } = registrarQueda(this.quedas.get(id) ?? [], this.agora(), this.op.janelaQuedasMs ?? JANELA_QUEDAS_MS)
    this.quedas.set(id, quedas)
    this.op.aoEvento?.({ tipo: 'caiu', id, quedas: quedas.length })
    if (pausar && !this.pausados.has(id)) {
      this.pausados.add(id)
      this.op.aoEvento?.({ tipo: 'pausado', id })
    }
  }

  private conectar(id: string): Promise<Conexao> {
    const existente = this.conexoes.get(id)
    if (existente) return existente
    if (this.pausados.has(id)) {
      return Promise.reject(new ErroMcpFora('pausado', 'o servidor caiu 3 vezes em 10 minutos e está pausado: retome em Conexões › MCP'))
    }
    const p = this.subir(id)
    this.conexoes.set(id, p)
    p.then(
      (c) => (c.promessa = p),
      () => {}
    )
    p.catch(() => {
      if (this.conexoes.get(id) === p) this.conexoes.delete(id)
    })
    return p
  }

  /** Abre vaga: 6 vivos (contando as que estão subindo) → fecha a parada há mais tempo; todas em uso → recusa. */
  private async abrirVaga(id: string): Promise<void> {
    const max = this.op.maxVivos ?? MAX_VIVOS
    const ocupadas = [...this.conexoes.keys()].filter((x) => x !== id).length
    if (ocupadas < max) return
    const paradas = [...this.vivas.values()].filter((c) => c.emUso === 0 && !c.fechando).sort((a, b) => a.ultimoUso - b.ultimoUso)
    if (!paradas.length) throw new ErroMcpFora('lotado', `já há ${max} servidores de fora em uso; tente de novo quando um terminar`)
    await this.derrubar(paradas[0], 'lotado')
  }

  private async subir(id: string): Promise<Conexao> {
    let def: DefinicaoMcpFora
    try {
      def = await this.op.resolver(id)
    } catch (e) {
      throw new ErroMcpFora('definicao', `não deu para ler o servidor ${id}: ${mensagemDe(e)}`)
    }
    const invalida = validarDefinicao(def)
    if (invalida) throw new ErroMcpFora('definicao', invalida)
    await this.abrirVaga(id)

    const segredos = segredosDaDefinicao(def)
    const stderr: string[] = []
    const transporte = def.tipo === 'stdio' ? this.transporteStdio(def, stderr) : this.transporteHttp(def)
    const cliente = new Client({ name: 'orkester', version: '1' }, { capabilities: {} })
    const c: Conexao = { id, cliente, transporte, segredos, emUso: 0, ultimoUso: this.agora(), fechando: false }

    if (transporte instanceof StdioClientTransport) {
      // o pid assim que o processo nasce: se o `initialize` falhar, o SDK fecha o transporte (e esquece o pid) antes
      // de o erro chegar aqui, e o `kill` dele no Windows só mata o `cmd`, não os netos
      const iniciar = transporte.start.bind(transporte)
      transporte.start = async () => {
        c.nasceu = Date.now()
        await iniciar()
        c.pid = transporte.pid ?? undefined
        if (c.pid) this.comProcesso.add(c)
        // o ChildProcess do SDK (campo interno): se não der para ler, a raiz conta como não conferida e a morte passa
        // pela lista do sistema (mais lenta, mas nunca mata processo alheio)
        const filho = (transporte as unknown as { _process?: ChildProcess })._process
        if (filho && filho.pid === c.pid && filho.exitCode === null && filho.signalCode === null) {
          c.filhoVivo = true
          filho.once('exit', () => {
            c.filhoVivo = false
          })
        }
      }
    }
    cliente.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      c.ferramentas = undefined
    })
    cliente.onclose = () => {
      const eraEsta = this.vivas.get(id) === c
      if (eraEsta) this.vivas.delete(id)
      if (c.promessa && this.conexoes.get(id) === c.promessa) this.conexoes.delete(id)
      if (c.relogio) clearTimeout(c.relogio)
      if (!c.fechando && eraEsta) {
        c.fechando = true
        void this.matar(c)
        this.queda(id)
      }
    }

    const prazo = this.op.prazoSubidaMs ?? PRAZO_SUBIDA_MS
    try {
      await cliente.connect(transporte, { timeout: prazo, maxTotalTimeout: prazo })
    } catch (e) {
      c.fechando = true
      await this.matar(c)
      await cliente.close().catch(() => {})
      this.queda(id)
      const fim = mascarar(stderr.join('').slice(-600).trim(), segredos)
      const motivo =
        e instanceof McpError && e.code === ErrorCode.RequestTimeout
          ? `não respondeu em ${Math.round(prazo / 1000)} s`
          : mascarar(mensagemDe(e), segredos)
      throw new ErroMcpFora('subida', `o servidor não subiu: ${motivo}${fim ? ` · últimas linhas: ${fim}` : ''}`)
    }
    this.vivas.set(id, c)
    if (c.pid) {
      // a árvore já subida (o `npx` → node): se um do meio morrer, a lista da hora não liga mais os netos à raiz
      const raiz = c.pid
      void this.sistema.listar().then((l) => {
        if (l && !c.fechando && c.pid === raiz) c.conhecidos = nossos(l, this.alvoDe(c))
      })
    }
    this.op.aoEvento?.(c.pid ? { tipo: 'subiu', id, pid: c.pid } : { tipo: 'subiu', id })
    this.armarParado(c)
    return c
  }

  private transporteStdio(def: DefinicaoStdio, stderr: string[]): StdioClientTransport {
    const padrao = this.op.ambientePadrao?.() ?? getDefaultEnvironment()
    const t = new StdioClientTransport({
      command: def.comando,
      args: def.args ?? [],
      env: ambienteMinimo(padrao, def.env),
      cwd: def.pasta,
      stderr: 'pipe',
      maxBufferSize: MAX_MENSAGEM
    })
    let tamanho = 0
    t.stderr?.on('data', (pedaco: Buffer) => {
      stderr.push(pedaco.toString('utf8'))
      tamanho += pedaco.length
      while (tamanho > MAX_STDERR && stderr.length > 1) tamanho -= Buffer.byteLength(stderr.shift() ?? '')
    })
    return t
  }

  private transporteHttp(def: DefinicaoHttp): StreamableHTTPClientTransport {
    const url = conferirUrlHttp(def.url)
    if ('erro' in url) throw new ErroMcpFora('definicao', url.erro)
    return new StreamableHTTPClientTransport(url, {
      fetch: fetchConferido(url, this.op.resolvedor, this.op.pedirHttps),
      requestInit: { headers: { ...(def.cabecalhos ?? {}) } }
    })
  }

  private async derrubar(c: Conexao, motivo: 'parado' | 'lotado' | 'pedido' | 'saida'): Promise<void> {
    if (c.fechando) return
    c.fechando = true
    if (c.relogio) clearTimeout(c.relogio)
    if (this.vivas.get(c.id) === c) this.vivas.delete(c.id)
    if (c.promessa && this.conexoes.get(c.id) === c.promessa) this.conexoes.delete(c.id)
    // "fechou" só com a árvore morta e conferida (e antes de a conexão sair do estado)
    await this.matar(c, () => this.op.aoEvento?.({ tipo: 'fechou', id: c.id, motivo }))
    await c.cliente.close().catch(() => {})
  }
}
