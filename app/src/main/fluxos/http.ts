// Fluxos (1.9.6): o nó HTTP (plano §4). A ação que o executor chama item a item (`acoes.http`); o motor (S3) cria uma
// por execução com `criarAcaoHttp({ cofre, locaisPermitidos: fluxo.rede?.locaisPermitidos ?? [] })`.
//
// Segurança, nesta ordem:
// 1. host literal (IP, localhost, nome local) é conferido antes de qualquer conexão (`conferirDestino`): o Node não
//    chama o `lookup` para IP. Endereço local só se o `host:porta` exato está na lista do fluxo, que só o usuário muda
//    (veredito 196); link-local, metadados, IPv6 interno e faixas reservadas nunca. Host escrito com `{{ }}` no nó
//    não usa a lista: nenhum salto do pedido chega a endereço local;
// 2. nomes passam por um `lookup` próprio que confere TODOS os IPs devolvidos DEPOIS da resolução, com a porta efetiva
//    (`conferirResolvidos`: pega o DNS rebinding e a resposta mista; o que conecta é exatamente o IP conferido). Nome que
//    não é `localhost` nunca chega a IP interno: o usuário escreve e permite o IP;
// 3. a credencial é aberta pelo cofre (`paraPedido`), que exige https e host cadastrado; os textos dela vão para o
//    `ctx.ocultar` antes do pedido, então nenhum erro ou resposta a leva para a execução;
// 4. redirecionamento manual, no máximo 5, cada salto reconferido (1 e 2 de novo). Ao trocar de origem (esquema,
//    host ou porta), a credencial sai PARA SEMPRE, mesmo para outro host cadastrado nela, e saem também
//    authorization/cookie escritos à mão; na mesma origem, o cofre ainda reconfere;
// 5. prazo de 30 s para o pedido inteiro (com os saltos), resposta até 5 MB contada no fim, depois de desfazer TODAS as
//    compressões do Content-Encoding (encadeadas na ordem inversa; desconhecida é recusada antes de ler), resposta
//    que não é 2xx dá erro, e os cabeçalhos da resposta entram na execução sem set-cookie nem authorization.
//
// Sem Electron: roda igual no Node, e a prova troca o resolvedor de nomes e o transporte (https de mentira sobre http
// local, sem certificado) por dependências.
import { request as pedirHttp, type IncomingMessage, type RequestOptions, type ClientRequest } from 'node:http'
import { request as pedirHttps } from 'node:https'
import { lookup as lookupDoSistema, type LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'
import type { Readable, Transform } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { AcoesDoFluxo } from '../../shared/fluxos/executor'
import type { CredencialParaPedido } from '../../shared/fluxos/credenciais'
import type { CofreDeCredenciais } from './credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { CABECALHOS_DE_LOGIN, MAX_REDIRECIONAMENTOS, MAX_RESPOSTA, PRAZO_HTTP, cabecalhosDaResposta, cabecalhosDoPedido, conferirDestino, conferirResolvidos, lerCorpo, montarCorpo, montarUrl, proximoPasso } from '../../shared/fluxos/rede.ts'
// @ts-expect-error idem
import { comContexto } from '../../shared/fluxos/executor.ts'

/** Resolve um nome em todos os IPs dele (o padrão é o `dns.lookup` do sistema, com `all`). */
export type Resolvedor = (host: string, pronto: (erro: Error | null, enderecos: LookupAddress[]) => void) => void

type Pedir = (opcoes: RequestOptions, aoResponder: (res: IncomingMessage) => void) => ClientRequest

export interface DependenciasDoHttp {
  cofre: Pick<CofreDeCredenciais, 'paraPedido'>
  /** `fluxo.rede.locaisPermitidos`: os `host:porta` locais que o usuário permitiu neste fluxo. */
  locaisPermitidos: readonly string[]
  resolvedor?: Resolvedor
  /** O `request` de cada protocolo (a prova põe um https de mentira). */
  transporte?: { http: Pedir; https: Pedir }
  /** Padrão `PRAZO_HTTP` (30 s) e `MAX_RESPOSTA` (5 MB); a prova encurta o prazo. */
  prazoMs?: number
  maxBytes?: number
}

const resolvedorDoSistema: Resolvedor = (host, pronto) =>
  lookupDoSistema(host, { all: true, verbatim: true }, (erro, enderecos) => pronto(erro, erro ? [] : enderecos))

/** Erro de rede com mensagem nossa (a que aparece no nó). */
class ErroDoHttp extends Error {}

/**
 * O `lookup` que o Node usa para conectar na `porta` efetiva: resolve, confere TODOS os IPs contra a lista e só então
 * entrega exatamente esses (o Node conecta num deles). Um IP interno não permitido no meio já recusa o nome inteiro.
 */
export function lookupConferido(locaisPermitidos: readonly string[], porta: number, resolvedor: Resolvedor = resolvedorDoSistema): LookupFunction {
  return (hostname, opcoes, callback) => {
    resolvedor(hostname, (erro, enderecos) => {
      if (erro) return callback(erro, '', 0)
      if (!enderecos.length) return callback(new ErroDoHttp(`${hostname} não tem endereço`), '', 0)
      const recusa = conferirResolvidos(hostname, porta, enderecos.map((e) => e.address), locaisPermitidos)
      if (recusa) return callback(new ErroDoHttp(recusa), '', 0)
      const familia = opcoes.family === 4 || opcoes.family === 6 ? enderecos.filter((e) => e.family === opcoes.family) : enderecos
      if (!familia.length) return callback(new ErroDoHttp(`${hostname} não tem endereço IPv${opcoes.family}`), '', 0)
      if (opcoes.all) callback(null, familia)
      else callback(null, familia[0].address, familia[0].family)
    })
  }
}

const DESCOMPRESSORES: Record<string, () => Transform> = {
  gzip: createGunzip,
  'x-gzip': createGunzip,
  deflate: createInflate,
  br: createBrotliDecompress
}
/** Mais que isto encadeado não é resposta de servidor de verdade. */
const MAX_CODIFICACOES = 3

/**
 * As etapas para desfazer o `Content-Encoding`, na ORDEM INVERSA da lista (`gzip, br` = gzip primeiro, br por cima:
 * desfaz br, depois gzip). Codificação desconhecida ou lista longa demais: erro antes de ler o corpo.
 */
export function etapasDeDescompressao(cabecalho: string | string[] | undefined): Array<() => Transform> | { erro: string } {
  const lista = (Array.isArray(cabecalho) ? cabecalho.join(',') : (cabecalho ?? ''))
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c && c !== 'identity')
  if (lista.length > MAX_CODIFICACOES) return { erro: `a resposta vem com ${lista.length} compressões encadeadas` }
  const desconhecida = lista.find((c) => !DESCOMPRESSORES[c])
  if (desconhecida) return { erro: `a resposta vem numa compressão que o nó não abre (${desconhecida.slice(0, 40)})` }
  return lista.reverse().map((c) => DESCOMPRESSORES[c])
}

/** Lê a resposta inteira, até `max` bytes medidos no FIM (depois de todas as descompressões). */
function lerResposta(res: IncomingMessage, max: number): Promise<Buffer> {
  const etapas = etapasDeDescompressao(res.headers['content-encoding'])
  if ('erro' in etapas) {
    res.destroy()
    return Promise.reject(new ErroDoHttp(etapas.erro))
  }
  const passou = (): ErroDoHttp => new ErroDoHttp(`a resposta passa de ${Math.round(max / 1024 / 1024)} MB`)
  const anunciado = Number(res.headers['content-length'])
  // sem compressão, o tamanho anunciado já é o final: recusa antes de ler
  if (!etapas.length && Number.isFinite(anunciado) && anunciado > max) {
    res.destroy()
    return Promise.reject(passou())
  }
  return new Promise((ok, falha) => {
    const estagios: Readable[] = [res]
    for (const criar of etapas) estagios.push(estagios[estagios.length - 1].pipe(criar()))
    const fluxo = estagios[estagios.length - 1]
    const parar = (): void => estagios.forEach((s) => s.destroy())
    const pedacos: Buffer[] = []
    let total = 0
    fluxo.on('data', (b: Buffer) => {
      total += b.length
      if (total > max) {
        parar()
        falha(passou())
        return
      }
      pedacos.push(b)
    })
    fluxo.on('end', () => ok(Buffer.concat(pedacos)))
    for (const s of estagios.slice(1)) {
      s.on('error', (e) => {
        parar()
        falha(new ErroDoHttp(`não consegui ler a resposta (${e.message.slice(0, 120)})`))
      })
    }
    res.on('error', falha)
  })
}

/** O pedido HTTP do nó. Devolve o `json` do item de saída: `{ status, cabecalhos, corpo, url? }`. */
export function criarAcaoHttp(dep: DependenciasDoHttp): AcoesDoFluxo['http'] {
  const transporte = dep.transporte ?? { http: pedirHttp, https: pedirHttps }
  const prazoMs = dep.prazoMs ?? PRAZO_HTTP
  const maxBytes = dep.maxBytes ?? MAX_RESPOSTA

  return async (ajustes, item, ctx) => {
    // o corpo é montado do texto do nó ANTES das expressões: assim o JSON e o formulário saem escapados. Ele vê
    // `$fluxo/$espaco/$execucao` como a URL e os cabeçalhos (não enumeráveis: o `{{ $json }}` não os mostra)
    const modelo = (ctx.no.ajustes as { corpo?: { valor?: unknown } }).corpo?.valor
    // a lista só vale com o host FIXO no nó: host vindo de expressão nunca ganha endereço local (nem num redirecionamento)
    const urlDoNo = (ctx.no.ajustes as { url?: unknown }).url
    const hostDoNo = typeof urlDoNo === 'string' ? /^\s*https?:\/\/([^/?#\\]*)/i.exec(urlDoNo)?.[1] : undefined
    const locais = hostDoNo !== undefined && !/[{}]/.test(hostDoNo) ? dep.locaisPermitidos : []
    const visto = { json: comContexto(item.json, ctx.contexto) }
    const corpo = montarCorpo(ajustes.corpo.tipo, typeof modelo === 'string' ? modelo : ajustes.corpo.valor, ajustes.corpo.valor, visto)
    if ('erro' in corpo) throw new ErroDoHttp(corpo.erro)
    const inicial = montarUrl(ajustes.url, ajustes.consulta)
    if ('erro' in inicial) throw new ErroDoHttp(inicial.erro)
    const proprios = cabecalhosDoPedido(ajustes.cabecalhos)
    if ('erro' in proprios) throw new ErroDoHttp(proprios.erro)

    let credencial: CredencialParaPedido | null = null
    if (ajustes.credencial) {
      const c = dep.cofre.paraPedido(ajustes.credencial, inicial.href)
      if ('erro' in c) throw new ErroDoHttp(c.erro)
      c.ocultar.forEach(ctx.ocultar)
      credencial = c
    }

    // um prazo para o pedido inteiro, e o fim da execução (ctx.sinal) também corta
    const controle = new AbortController()
    let estourou = false
    const timer = setTimeout(() => {
      estourou = true
      controle.abort()
    }, prazoMs)
    const aoAbortar = (): void => controle.abort()
    if (ctx.sinal.aborted) controle.abort()
    else ctx.sinal.addEventListener('abort', aoAbortar, { once: true })
    const motivo = (e: unknown): Error => {
      if (estourou) return new ErroDoHttp(`o pedido passou de ${Math.round(prazoMs / 1000)} s`)
      if (controle.signal.aborted) return new ErroDoHttp('a execução acabou antes da resposta')
      if (e instanceof ErroDoHttp) return e
      const codigo = (e as { code?: string })?.code
      return new ErroDoHttp(`o pedido falhou${codigo ? ` (${codigo})` : ''}: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`)
    }

    const pedir = (url: URL, metodo: string, cabecalhos: Record<string, string>, envio: string | undefined): Promise<IncomingMessage> =>
      new Promise((ok, falha) => {
        const https = url.protocol === 'https:'
        const porta = url.port ? Number(url.port) : https ? 443 : 80
        const req = (https ? transporte.https : transporte.http)(
          {
            protocol: url.protocol,
            hostname: url.hostname.replace(/^\[|\]$/g, ''),
            port: porta,
            path: `${url.pathname}${url.search}`,
            method: metodo,
            headers: envio === undefined ? cabecalhos : { ...cabecalhos, 'content-length': String(Buffer.byteLength(envio)) },
            lookup: lookupConferido(locais, porta, dep.resolvedor),
            agent: false,
            signal: controle.signal
          },
          ok
        )
        req.on('error', falha)
        req.end(envio)
      })

    try {
      let url = inicial
      let metodo: string = ajustes.metodo
      let envio = corpo.corpo
      let tipoDoEnvio = corpo.tipoDeConteudo
      const cabecalhos = { ...proprios }
      for (let saltos = 0; ; saltos++) {
        // cada salto de novo: host literal, porta efetiva e lista (o nome passa pelo lookup conferido)
        const bloqueio = conferirDestino(url, locais)
        if (bloqueio) throw new ErroDoHttp(bloqueio)
        const finais: Record<string, string> = { 'user-agent': 'Orkester-Fluxos', 'accept-encoding': 'gzip, deflate, br', ...cabecalhos }
        if (envio !== undefined && tipoDoEnvio && !('content-type' in finais)) finais['content-type'] = tipoDoEnvio
        if (credencial) {
          const nome = credencial.cabecalho.nome.toLowerCase()
          finais[nome] = credencial.cabecalho.valor // a credencial manda sobre um cabeçalho de mesmo nome escrito à mão
        }

        const res = await pedir(url, metodo, finais, envio)
        const passo = proximoPasso(res.statusCode ?? 0, res.headers.location, url, metodo)
        if (passo === null) {
          const status = res.statusCode ?? 0
          const texto = metodo === 'HEAD' ? (res.resume(), '') : (await lerResposta(res, maxBytes)).toString('utf8')
          if (status < 200 || status > 299) {
            throw new ErroDoHttp(`${url.hostname} respondeu ${status}${res.statusMessage ? ` ${res.statusMessage}` : ''}${texto.trim() ? `: ${texto.trim().slice(0, 300)}` : ''}`)
          }
          return {
            status,
            cabecalhos: cabecalhosDaResposta(res.headers),
            corpo: lerCorpo(texto, res.headers['content-type']),
            ...(url.href !== inicial.href ? { url: url.href } : {})
          }
        }
        res.resume() // descarta o corpo do 3xx
        if ('erro' in passo) throw new ErroDoHttp(passo.erro)
        if (saltos >= MAX_REDIRECIONAMENTOS) throw new ErroDoHttp(`mais de ${MAX_REDIRECIONAMENTOS} redirecionamentos`)

        // trocou de origem (esquema, host ou porta): a credencial sai PARA SEMPRE, mesmo que o host novo esteja nos
        // domínios dela, junto com o authorization/cookie escritos à mão. Na mesma origem, o cofre ainda reconfere.
        if (passo.url.origin !== url.origin) {
          credencial = null
          for (const n of CABECALHOS_DE_LOGIN) delete cabecalhos[n]
        } else if (credencial && ajustes.credencial) {
          const c = dep.cofre.paraPedido(ajustes.credencial, passo.url.href)
          if ('erro' in c) credencial = null
          else {
            c.ocultar.forEach(ctx.ocultar)
            credencial = c
          }
        }
        if (passo.semCorpo) {
          envio = undefined
          tipoDoEnvio = undefined
          delete cabecalhos['content-type']
        }
        url = passo.url
        metodo = passo.metodo
      }
    } catch (e) {
      throw motivo(e)
    } finally {
      clearTimeout(timer)
      ctx.sinal.removeEventListener('abort', aoAbortar)
    }
  }
}
