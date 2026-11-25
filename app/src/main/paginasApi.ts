/**
 * Páginas "+" (1.9.7): as APIs e os MCPs que a página enxerga, no main. As regras puras estão em
 * `shared/paginasAcessos.ts` (quem a página enxerga e por qual nome) e `shared/paginasApi.ts` (o pedido); o pedido em
 * si é o núcleo do nó HTTP (`pedirComSaltos`, main/fluxos/http.ts), com a mesma conferência de IP a cada salto e a
 * credencial que sai na troca de origem.
 *
 * A página chama pelo nome (da API/servidor, ou um de `atende`); o main resolve contra os acessos que o Luís marcou,
 * lidos a cada chamada (desmarcar corta o próximo pedido). A escrita é a da página E a da API (o cofre ainda confere o
 * "só lê" pelo método de cada salto).
 *
 * O que a página recebe: `{ status, tipo, corpo }`. Nenhum cabeçalho além do content-type (então authorization,
 * set-cookie e companhia nunca chegam), e o valor da credencial, em todas as formas em que pode voltar, vira `•••` no
 * corpo, no tipo e nas mensagens de erro. Cada pedido (até os recusados) entra no registro da página: hora, método,
 * caminho sem consulta, status e ms; nunca corpo nem cabeçalho.
 *
 * Sem Electron: a prova roda no Node com a rede de mentira passada em `rede`. Em tempo de execução, só o autoteste
 * troca a rede (`trocarRedeNoTeste`); fora do `--autoteste`, a troca lança erro.
 */
import type {
  AcessosDaPagina,
  ApiDisponivelParaPagina,
  FerramentaMcp,
  FerramentaMcpParaPagina,
  McpDisponivelParaPagina,
  PedidoDaPagina,
  RespostaDeApiDaPagina,
  ResultadoMcpParaPagina
} from '../shared/api'
import type { ApiConhecida, ServidorConhecido } from '../shared/paginasAcessos'
import type { CofreDeCredenciais } from './fluxos/credenciais'
import type { DependenciasDoHttp } from './fluxos/http'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { pedirComSaltos } from './fluxos/http.ts'
// @ts-expect-error idem
import { LIMITES, NOME_DE_FERRAMENTA, bytesDe } from '../shared/paginas.ts'
// @ts-expect-error idem
import { apisDisponiveis, escritaEfetiva, resolverApi, resolverMcp } from '../shared/paginasAcessos.ts'
// @ts-expect-error idem
import { API_POR_MINUTO, API_PRAZO_MS, API_RESPOSTA_BYTES, anotarPedido, caminhoParaRegistro, criarJanelaDeTaxa, formasDoSegredo, hostDoPedido, mascarar, metodoPermitido, redirecionamentoPermitido, urlDaApi } from '../shared/paginasApi.ts'
import type { FormaDoSegredo } from '../shared/paginasApi.ts'

const AUTOTESTE = process.argv.includes('--autoteste')

/** O resolvedor de nomes e o transporte: só a prova (na criação) e o autoteste (`trocarRedeNoTeste`) mudam. */
export type RedeDaApi = Pick<DependenciasDoHttp, 'resolvedor' | 'transporte'>

/** (1.9.7) O que a página usa do registro de servidores de fora (main/mcpFora). */
export interface McpParaPaginas {
  /** os cadastrados (id e nome), sem subir nada */
  servidores(): Array<{ id: string; nome: string; precisaLogin?: boolean }>
  /** as ferramentas conhecidas da última conexão, sem subir nada (para `mcp.disponiveis`) */
  ferramentasConhecidas(id: string): FerramentaMcp[]
  ferramentasParaUso(id: string): Promise<FerramentaMcp[]>
  chamar(id: string, ferramenta: string, argumentos: Record<string, unknown>, opcoes?: { sinal?: AbortSignal }): Promise<{ texto: string; estruturado?: unknown; erro: boolean }>
  segredosDe(id: string): string[]
}

export interface DependenciasDaApi {
  cofre: Pick<CofreDeCredenciais, 'paraPedidoPorId' | 'listar'>
  /** ausente: toda chamada `mcp` recusa */
  mcp?: McpParaPaginas
  agora?: () => number
  rede?: RedeDaApi
  /** padrão 20 s; a prova encurta */
  prazoMs?: number
}

/** O que a API precisa da página registrada, lido a cada chamada (desmarcar corta o próximo pedido). */
export interface PaginaParaApi {
  id: string
  acessos?: AcessosDaPagina
  /** a página pede `rede`/`local`: não enxerga API nem MCP (o motivo) */
  bloqueio?: string
}

/** As APIs do cofre como a página pode enxergá-las: sem valor, sem fim e sem `segredo` (que não é API). */
export function apisDoCofre(cofre: Pick<CofreDeCredenciais, 'listar'>): ApiConhecida[] {
  return cofre
    .listar()
    .itens.filter((c) => c.tipo !== 'segredo')
    .map((c) => ({ id: c.id, nome: c.nome, dominios: [...c.dominios], ...(c.soLeitura ? { soLeitura: true } : {}) }))
}

class Recusa extends Error {}

/**
 * (revisão A2) O corte dos pedidos `api`/`mcp` de UM documento da página aberta. `cortar()` aborta os que estão em curso
 * e já deixa um sinal novo para o documento seguinte. main/paginas.ts corta antes de recarregar (revogar, aceitar de
 * novo, definir acessos), antes do `about:blank` (desligar, remover, chave geral) e quando a página fecha.
 */
export interface CorteDosPedidos {
  sinal(): AbortSignal
  cortar(): void
}

export function criarCorte(): CorteDosPedidos {
  let controle = new AbortController()
  return {
    sinal: () => controle.signal,
    cortar() {
      controle.abort()
      controle = new AbortController()
    }
  }
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** O nome como a página mandou, para o registro e as mensagens. */
const nomeDoPedido = (nome: unknown): string => (typeof nome === 'string' ? nome.slice(0, 80) : '')

export function criarApiDasPaginas(dep: DependenciasDaApi) {
  const agora = dep.agora ?? Date.now
  let rede: RedeDaApi = dep.rede ?? {}
  const taxa = criarJanelaDeTaxa(API_POR_MINUTO, 60_000, agora)
  const registros = new Map<string, PedidoDaPagina[]>()

  const anotar = (id: string, pedido: PedidoDaPagina): void => {
    registros.set(id, anotarPedido(registros.get(id) ?? [], pedido))
  }

  const servidores = (): ServidorConhecido[] => (dep.mcp ? dep.mcp.servidores().map((s) => ({ id: s.id, nome: s.nome, ...(s.precisaLogin ? { precisaLogin: true } : {}) })) : [])

  /**
   * O que `mcp.ferramentas` e `mcp.chamar` conferem antes: página sem `rede`/`local`, a mesma janela de 60 por minuto
   * da `api`, servidor que a página enxerga. Toda chamada (até a recusada) entra no mesmo registro, com
   * `metodo: 'MCP'` e a ferramenta no lugar do caminho. Os segredos do servidor viram ••• também nas mensagens de erro.
   */
  async function usarMcp<T>(
    pagina: PaginaParaApi,
    nomeBruto: unknown,
    caminho: string,
    fazer: (mcp: McpParaPaginas, servidorId: string, lista: string[], nome: string) => Promise<{ valor: T; status: number }>
  ): Promise<T> {
    const inicio = agora()
    let nome = nomeDoPedido(nomeBruto)
    const linha = (status: number | null, erro?: string): PedidoDaPagina => ({
      em: inicio,
      tipo: 'mcp',
      nome,
      metodo: 'MCP',
      caminho: caminho.slice(0, 200),
      status,
      ms: Math.max(0, agora() - inicio),
      ...(erro ? { erro: erro.slice(0, 160) } : {})
    })
    let servidorId: string | undefined
    try {
      if (pagina.bloqueio) throw new Error(pagina.bloqueio)
      if (!dep.mcp) throw new Error('os servidores MCP de fora não estão disponíveis')
      const achado = resolverMcp(pagina.acessos, servidores(), nomeBruto)
      if (!achado.ok) throw new Error(achado.erro)
      servidorId = achado.valor.alvo.id
      nome = achado.valor.alvo.nome.slice(0, 80)
      // (R5 S3) o servidor passou a "precisa de login" depois de marcado: a mesma mensagem do conferirAcessos
      if (achado.valor.alvo.precisaLogin) throw new Error(`o servidor ${nome} precisa de login: termine em Conexões › MCP antes de marcar`)
      if (!taxa.tirar(pagina.id)) throw new Error(`no máximo ${API_POR_MINUTO} pedidos por minuto: espere um pouco`)
      const r = await fazer(dep.mcp, servidorId, achado.valor.acesso.ferramentas, nome)
      anotar(pagina.id, linha(r.status))
      return r.valor
    } catch (e) {
      const formas = servidorId && dep.mcp ? formasDoSegredo(dep.mcp.segredosDe(servidorId)) : []
      const texto = mascarar(e instanceof Error ? e.message : String(e), formas).slice(0, 300)
      anotar(pagina.id, linha(null, texto))
      throw new Error(texto)
    }
  }

  return {
    /** `orkPagina.api.disponiveis()`: nome, domínios, escrita (página E API) e `atende`. Nunca id, fim ou valor. */
    disponiveis(pagina: PaginaParaApi): ApiDisponivelParaPagina[] {
      if (pagina.bloqueio) return []
      return apisDisponiveis(pagina.acessos, apisDoCofre(dep.cofre))
    },

    /**
     * `orkPagina.api.pedir(nome, pedido)`. A API é a que a página enxerga com este nome; o host é o `host` do pedido
     * (nos domínios dela) ou o 1º domínio sem curinga; a credencial é aberta pelo id, com o método de cada salto.
     */
    async pedir(pagina: PaginaParaApi, nomeBruto: unknown, bruto: unknown, sinal: AbortSignal = new AbortController().signal): Promise<RespostaDeApiDaPagina> {
      const inicio = agora()
      let nome = nomeDoPedido(nomeBruto)
      const pedido = ehObjeto(bruto) ? bruto : {}
      const metodo = typeof pedido.metodo === 'string' ? pedido.metodo.toUpperCase() : 'GET'
      const linha = (status: number | null, erro?: string): PedidoDaPagina => ({
        em: inicio,
        tipo: 'api',
        nome,
        metodo: metodo.slice(0, 10),
        caminho: caminhoParaRegistro(pedido.caminho),
        status,
        ms: Math.max(0, agora() - inicio),
        ...(erro ? { erro: erro.slice(0, 160) } : {})
      })
      // os textos da credencial (valor, forma do fio…) e os padrões que os pegam em qualquer forma que voltem
      let segredos: string[] = []
      let formas: FormaDoSegredo[] = []
      try {
        if (pagina.bloqueio) throw new Recusa(pagina.bloqueio)
        if (!ehObjeto(bruto)) throw new Recusa('pedido inválido: use { metodo, caminho, consulta?, corpo?, host? }')
        const achado = resolverApi(pagina.acessos, apisDoCofre(dep.cofre), nomeBruto)
        if (!achado.ok) throw new Recusa(achado.erro)
        const { acesso, alvo: api } = achado.valor
        nome = api.nome.slice(0, 80)
        if (!taxa.tirar(pagina.id)) throw new Recusa(`no máximo ${API_POR_MINUTO} pedidos por minuto: espere um pouco`)
        if (api.soLeitura && metodo !== 'GET' && metodo !== 'HEAD' && metodoPermitido(metodo, true) === null) {
          throw new Recusa(`a API ${nome} só lê: mude em Conexões › APIs`)
        }
        const recusaDoMetodo = metodoPermitido(metodo, escritaEfetiva(acesso, api))
        if (recusaDoMetodo) throw new Recusa(recusaDoMetodo)
        const host = hostDoPedido(pedido.host, api)
        if (!host.ok) throw new Recusa(host.erro)
        const url = urlDaApi(host.valor, pedido.caminho, pedido.consulta)
        if (!url.ok) throw new Recusa(url.erro)

        let envio: string | undefined
        let tipoDoEnvio: string | undefined
        if (pedido.corpo !== undefined) {
          if (metodo === 'GET' || metodo === 'HEAD') throw new Recusa(`${metodo} não leva corpo`)
          envio = typeof pedido.corpo === 'string' ? pedido.corpo : JSON.stringify(pedido.corpo)
          if (envio === undefined) throw new Recusa('o corpo não é JSON')
          tipoDoEnvio = typeof pedido.corpo === 'string' ? 'text/plain; charset=utf-8' : 'application/json'
          if (envio.length > LIMITES.apiCorpoBytes || bytesDe(envio) > LIMITES.apiCorpoBytes) throw new Recusa(`o corpo passa de ${LIMITES.apiCorpoBytes / 1024} KB`)
        }

        const r = await pedirComSaltos({
          url: url.valor,
          metodo,
          cabecalhos: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' },
          envio,
          tipoDoEnvio,
          // cada abertura (1º salto e saltos na mesma origem) confere domínio e "só lê" pelo método do salto, e junta
          // as formas do valor ao que é mascarado
          credencial: (endereco, metodoDoSalto) => {
            const c = dep.cofre.paraPedidoPorId(api.id, endereco, metodoDoSalto)
            if (!('erro' in c)) {
              segredos = [...new Set([...segredos, ...c.ocultar])]
              formas = formasDoSegredo(segredos)
            }
            return c
          },
          locais: [],
          sinal,
          aoCortar: 'a página fechou antes da resposta',
          prazoMs: dep.prazoMs ?? API_PRAZO_MS,
          maxBytes: API_RESPOSTA_BYTES,
          userAgent: 'Orkester-Paginas',
          // fora dos domínios da API (outro host, http, porta, usuário na URL), a página recebe o 3xx como veio
          seguir: (para) => redirecionamentoPermitido(para, api.dominios),
          resolvedor: rede.resolvedor,
          transporte: rede.transporte
        })
        const tipo = String(r.cabecalhos['content-type'] ?? '').slice(0, 200)
        anotar(pagina.id, linha(r.status))
        return { status: r.status, tipo: mascarar(tipo, formas), corpo: mascarar(r.texto, formas) }
      } catch (e) {
        const texto = mascarar(e instanceof Error ? e.message : String(e), formas).slice(0, 300)
        anotar(pagina.id, linha(null, texto))
        throw new Error(texto)
      }
    },

    /**
     * `orkPagina.mcp.disponiveis()`: os servidores que a página enxerga, com as ferramentas marcadas que o servidor
     * conhece e não estão bloqueadas (da última conexão; não sobe nada). Apagado some.
     */
    mcpDisponiveis(pagina: PaginaParaApi): McpDisponivelParaPagina[] {
      if (pagina.bloqueio || !dep.mcp) return []
      const mcp = dep.mcp
      const conhecidos = servidores()
      const saida: McpDisponivelParaPagina[] = []
      for (const a of pagina.acessos?.mcp ?? []) {
        const s = conhecidos.find((x) => x.id === a.servidorId)
        if (!s) continue
        const ferramentas = mcp
          .ferramentasConhecidas(s.id)
          .filter((f) => a.ferramentas.includes(f.nome) && !f.bloqueada)
          .map((f) => ({ nome: f.nome, descricao: f.descricao, esquema: f.esquema, dizQueSoLe: f.anotacoes?.readOnlyHint === true }))
        saida.push({ nome: s.nome, ...(a.atende?.length ? { atende: [...a.atende] } : {}), ferramentas })
      }
      return saida
    },

    /**
     * `orkPagina.mcp.ferramentas(nome)`: só as marcadas e que o servidor oferece sem bloqueio (a mudada fica de fora
     * até o Luís rever em Conexões › MCP).
     */
    async mcpFerramentas(pagina: PaginaParaApi, nome: unknown): Promise<FerramentaMcpParaPagina[]> {
      return usarMcp(pagina, nome, '(lista)', async (mcp, servidorId, lista) => {
        const todas = await mcp.ferramentasParaUso(servidorId)
        const vistas = todas
          .filter((f) => lista.includes(f.nome) && !f.bloqueada)
          .map((f) => ({ nome: f.nome, descricao: f.descricao, esquema: f.esquema, dizQueSoLe: f.anotacoes?.readOnlyHint === true }))
        return { valor: vistas, status: 200 }
      })
    },

    /** `orkPagina.mcp.chamar(nome, ferramenta, argumentos)`: só ferramenta marcada; o resultado vem já mascarado. */
    async mcpChamar(pagina: PaginaParaApi, nome: unknown, ferramenta: unknown, argumentos: unknown, sinal?: AbortSignal): Promise<ResultadoMcpParaPagina> {
      const qual = typeof ferramenta === 'string' ? ferramenta.slice(0, 128) : ''
      return usarMcp(pagina, nome, qual, async (mcp, servidorId, lista, nomeDoServidor) => {
        if (!NOME_DE_FERRAMENTA.test(qual)) throw new Error('ferramenta inválida')
        if (!lista.includes(qual)) throw new Error(`a ferramenta "${qual}" de ${nomeDoServidor} não está marcada para esta página: marque em Conexões › Páginas`)
        const args = argumentos ?? {}
        if (!ehObjeto(args)) throw new Error('argumentos inválidos: use um objeto')
        const json = JSON.stringify(args)
        if (json.length > LIMITES.mcpArgumentosBytes || bytesDe(json) > LIMITES.mcpArgumentosBytes) throw new Error(`os argumentos passam de ${LIMITES.mcpArgumentosBytes / 1024} KB`)
        const r = await mcp.chamar(servidorId, qual, args, { sinal })
        const saida: ResultadoMcpParaPagina = { texto: r.texto, erro: r.erro === true, ...(r.estruturado !== undefined ? { estruturado: r.estruturado } : {}) }
        // no registro: 200 = a ferramenta respondeu; 0 = respondeu com erro (`isError`)
        return { valor: saida, status: saida.erro ? 0 : 200 }
      })
    },

    /** O registro da página: os últimos 100, do mais novo para o mais velho (só em memória: some ao fechar o app). */
    pedidos: (id: string): PedidoDaPagina[] => [...(registros.get(id) ?? [])],

    /** Página removida: some o registro e a taxa dela. */
    esquecer(id: string): void {
      registros.delete(id)
      taxa.esquecer(id)
    },

    /** Só no autoteste: o cenário põe um servidor falso no lugar da internet. Fora dele, lança. */
    trocarRedeNoTeste(nova: RedeDaApi): void {
      if (!AUTOTESTE) throw new Error('a rede da API das páginas só muda no autoteste')
      rede = nova
    }
  }
}

export type ApiDasPaginas = ReturnType<typeof criarApiDasPaginas>
