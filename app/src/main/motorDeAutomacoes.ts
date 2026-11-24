/**
 * O motor dos Fluxos (1.9.7; era o das automações da 1.9.6), sem Electron nem disco: tudo do mundo vem em
 * `DependenciasDoMotor`, para a prova (motorDeAutomacoes.prova.mts) rodar com `node --test`. Cada disparo percorre o
 * grafo do fluxo com `executarFluxo` (shared/fluxos/executor.ts); as ações chegam prontas de `d.acoes`.
 *
 * Um passo (de segundo em segundo):
 *  1. o relógio dos nós Relógio (a próxima vez fica em memória, contada a partir de quando o motor viu o nó: o que
 *     venceu com o app fechado ou o fluxo desligado não dispara);
 *  2. o observador de parada (a cada 2 s, só dos cartões citados por gatilhos `parou` de fluxos ligados);
 *  3. os eventos do barramento (entrega, kanban) — de espaço sem fluxo ligado, descartados;
 *  4. os eventos que esperavam o intervalo de 1 min de um fluxo (fila curta por fluxo, `MAX_NA_ESPERA`; cheia, o
 *     evento é descartado e contado no detalhe do próximo disparo dele);
 *  5. cada disparo aprovado (laço, teto, espera) entra na FILA DO ESPAÇO: um fluxo por vez em cada espaço, e os espaços
 *     rodam em paralelo (um HTTP de 30 s num espaço não trava os outros). O passo não espera as filas (`ocioso` espera).
 *
 * Só digitar num terminal (o recado que a caixa enfileira e o comando) passa por uma trava GLOBAL, para dois espaços
 * não embaralharem o teclado. Dois passos ao mesmo tempo não existem: o segundo volta na hora.
 * Um espaço é ativo quando tem pelo menos um fluxo ligado, com ou sem janela.
 */
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { combina, gatilhoNoHistorico, INTERVALO_MINIMO, MAX_NA_ESPERA, observarParada, podeDisparar, VALIDADE_DA_CADEIA } from '../shared/automacoes.ts'
// @ts-expect-error idem
import { proximaDe } from '../shared/rotinas.ts'
// @ts-expect-error idem
import { executarFluxo } from '../shared/fluxos/executor.ts'
// @ts-expect-error idem
import { MAX_RESUMO_DO_GATILHO } from '../shared/fluxos/formato.ts'
import type { EventoDeAutomacao, Gatilho, NomesDaFrase, SituacaoDoAgente, VereditoDoAlcance, VistaDeParada } from '../shared/automacoes'
import type { AjustesPorTipo, Execucao, FluxoGravado, Item, MotivoDoDesligado, NoDoFluxo, ResultadoDaExecucao } from '../shared/fluxos/formato'
import type { AcoesDoFluxo, ContextoDasExpressoes } from '../shared/fluxos/executor'
import type { FichaDeAgente, FichaDeEspaco, FichaDeFluxo, FichaDeTarefa } from '../shared/fluxos/fichas'
import type { EventoNoEspaco } from './eventosDeAutomacao'

export interface DependenciasDoMotor {
  agora(): number
  /** Todos os espaços que têm fluxos (com ou sem janela). Os ativos são os que têm um fluxo ligado. */
  espacos(): string[]
  /** Os fluxos válidos do espaço (ligados ou não), como estão gravados. */
  fluxos(espacoId: string): FluxoGravado[]
  /** Os cartões do espaço (para o "qualquer agente" do gatilho de parada). */
  cartoes(espacoId: string): { id: string; nome: string; agente: string }[]
  situacao(cartaoId: string): Promise<SituacaoDoAgente | null>
  nome(cartaoId: string): string
  /**
   * As ações reais para esta execução. `cadeia` já inclui o fluxo: o recado deve levá-la à caixa (o agente que
   * receber herda). Nunca esperam o agente responder. O motor põe recado e comando na trava global de digitar.
   */
  acoes(espacoId: string, fluxo: FluxoGravado, ctx: { cadeia: string[] }): Partial<AcoesDoFluxo>
  desligar(espacoId: string, fluxoId: string, motivo: MotivoDoDesligado): void
  /**
   * Toda execução (e todo barrado e pulado que vira linha) vai para cá. `detalhe`: o motivo do barrado/pulado e o
   * que esperou na fila (a `Execucao` não tem campo para isso).
   */
  registrar(espacoId: string, execucao: Execucao, detalhe?: string): void
  /** Nomes das colunas e dos cartões, para o resumo do gatilho e para a saída do nó de kanban. */
  nomes?(espacoId: string): NomesDaFrase
  /** O barramento (main/eventosDeAutomacao.ts). */
  tirarEventos(): EventoNoEspaco[]
  /** O cartão a que um destino de recado chega agora (`maestro` → o Maestro vivo). Sem isto, `maestro` não resolve. */
  destino?(espacoId: string, para: string): string | undefined
  /** O fluxo de agente ainda alcança o que o evento e os nós tocam? Sem isto, sempre. */
  foraDoAlcance?(espacoId: string, fluxo: FluxoGravado, evento: EventoDeAutomacao): VereditoDoAlcance
  /**
   * As fichas (shared/fluxos/fichas.ts) que o gatilho solta ao lado dos campos de hoje, e o `$fluxo`/`$espaco` das
   * expressões. Lidas na vez da execução. Sem isto (ou com erro), a ficha sai `null` e o contexto fica só com o
   * `$execucao`.
   */
  fichas?: FontesDasFichas
  /** Fluxo sensível com selo ausente ou errado: `false` = não roda (e, no disparo, é desligado). Sem isto, sempre roda. */
  conferirSelo?(espacoId: string, fluxo: FluxoGravado): boolean
  /** Id da execução. Padrão: o instante em base 36 mais um contador. */
  novoId?(): string
  /** Padrões `PRAZO_DE_DIGITAR` e `FOLGA_DO_CANCELAMENTO` (as provas encurtam). */
  prazoDeDigitar?: number
  folgaDoCancelamento?: number
}

export interface FontesDasFichas {
  tarefa(espacoId: string, numero: number): FichaDeTarefa | null
  /** `null`: o cartão não está aberto no espaço (fechado ou de outro espaço). */
  agente(espacoId: string, cartaoId: string): Promise<FichaDeAgente | null> | FichaDeAgente | null
  contexto(espacoId: string, fluxo: FluxoGravado): { $fluxo: FichaDeFluxo; $espaco: FichaDeEspaco }
}

/** As fichas de um evento: só as do tipo dele. */
export interface FichasDoEvento {
  tarefa?: FichaDeTarefa | null
  quemEntregou?: FichaDeAgente | null
  quemRecebe?: FichaDeAgente | null
  quemParou?: FichaDeAgente | null
}

/** De quanto em quanto o observador lê a situação dos cartões (custo: ler a tela). */
export const PASSO_DO_OBSERVADOR = 2000
/** Prazo de uma ação sob a trava global de digitar; passou, o sinal dela é abortado e ela para de digitar. */
export const PRAZO_DE_DIGITAR = 30_000
/** Depois do abort, quanto a ação tem para parar antes de a trava ser solta à força (defesa). */
export const FOLGA_DO_CANCELAMENTO = 5_000
const HORA = 3_600_000

export type ResultadoDoRodar = { ok: true; execucao: Execucao } | { ok: false; motivo: 'nao-existe' | 'fluxo-mudou' | 'sem-manual' | 'sem-aprovacao' }

export interface Motor {
  passo(): Promise<void>
  /** Espera as filas de todos os espaços esvaziarem (provas e saída do app). */
  ocioso(): Promise<void>
  /**
   * "Rodar fluxo" do editor: pelo nó `noGatilho` (padrão: o primeiro Manual do fluxo), fora do teto e da trava de laço,
   * na fila do espaço. `conferir` olha o fluxo relido na vez dele: `false` = nada roda (`fluxo-mudou`).
   */
  rodarAgora(espacoId: string, fluxoId: string, opcoes?: { noGatilho?: string; conferir?: (f: FluxoGravado) => boolean }): Promise<ResultadoDoRodar>
  /** O fluxo foi religado pelo usuário: a conta da última hora dele recomeça. */
  zerarTaxa(espacoId: string, fluxoId: string): void
  /** A próxima vez de cada nó Relógio de fluxo ligado do espaço (ms), chave `fluxo/no`. */
  proximas(espacoId: string): Record<string, number>
  /** Quantos fluxos ligados há em todos os espaços (a bandeja usa). */
  fluxosLigados(): number
  /** Os espaços com pelo menos um fluxo ligado. */
  espacosAtivos(): string[]
}

// ---------------------------------------------------------------- nós de gatilho → o gatilho da 1.9.6 e o item

const idDe = (r: { id: string } | undefined): string | undefined => (r && r.id !== '' ? r.id : undefined)
const aEscolher = (r: { id: string } | undefined): boolean => !!r && r.id === ''

/**
 * O gatilho do nó no formato de `combina`. `null`: não casa com evento nenhum (Manual, nó que não é gatilho ou com
 * cartão/coluna "a escolher").
 */
export function gatilhoDoNo(no: NoDoFluxo): Gatilho | null {
  switch (no.tipo) {
    case 'gatilho.kanban': {
      const a = no.ajustes as AjustesPorTipo['gatilho.kanban']
      if (aEscolher(a.paraColuna) || aEscolher(a.deColuna)) return null
      return { tipo: 'kanban', paraColuna: a.paraColuna.id, deColuna: idDe(a.deColuna), por: a.por }
    }
    case 'gatilho.entrega': {
      const a = no.ajustes as AjustesPorTipo['gatilho.entrega']
      if (aEscolher(a.de) || aEscolher(a.para)) return null
      return { tipo: 'entrega', de: idDe(a.de), para: idDe(a.para), contem: a.contem }
    }
    case 'gatilho.parou': {
      const a = no.ajustes as AjustesPorTipo['gatilho.parou']
      if (aEscolher(a.agente)) return null
      return { tipo: 'parou', agente: idDe(a.agente), como: a.como }
    }
    case 'gatilho.relogio':
      return { tipo: 'horario', quando: (no.ajustes as AjustesPorTipo['gatilho.relogio']).quando, proxima: '' }
    default:
      return null
  }
}

/** Os textos de `podeDisparar` (escritos para regra) ditos para fluxo. */
export const emFluxo = (t: string): string =>
  t
    .replace('esta regra', 'este fluxo')
    .replace('a regra foi desligada', 'o fluxo foi desligado')
    .replace('a regra continua ligada', 'o fluxo continua ligado')
    .replace(/automações/g, 'fluxos')

/** A chave do nó Relógio no evento `horario` (o `regra` do evento). */
export const chaveDoRelogio = (fluxoId: string, noId: string): string => `${fluxoId}/${noId}`

/** O primeiro nó de gatilho do fluxo que casa com o evento (ordem dos nós). */
export function gatilhoQueCasa(fluxo: Pick<FluxoGravado, 'id' | 'nos'>, e: EventoDeAutomacao): NoDoFluxo | undefined {
  return fluxo.nos.find((no) => {
    const quando = gatilhoDoNo(no)
    return !!quando && combina({ id: chaveDoRelogio(fluxo.id, no.id), quando }, e)
  })
}

/**
 * O item que o nó de gatilho põe no fluxo (as `Saida*` do contrato) e, ao lado, a ficha do evento (`tarefa`,
 * `quemEntregou`/`quemRecebe`, `quemParou`; `null` quando não há: o usuário, cartão fechado, tarefa que sumiu).
 */
export function itemDoEvento(e: EventoDeAutomacao, agora: number, nomes: NomesDaFrase = {}, fichas: FichasDoEvento = {}): Item {
  switch (e.tipo) {
    case 'kanban':
      return {
        json: {
          numero: e.numero,
          titulo: e.titulo,
          deColuna: e.deColuna,
          paraColuna: e.paraColuna,
          deColunaNome: nomes.colunas?.[e.deColuna] ?? e.deColuna,
          paraColunaNome: nomes.colunas?.[e.paraColuna] ?? e.paraColuna,
          por: e.por === 'usuario' ? 'usuario' : 'agente',
          quem: e.quem,
          tarefa: fichas.tarefa ?? null
        }
      }
    case 'entrega':
      return {
        json: {
          de: e.de,
          deNome: e.deNome,
          para: e.para,
          paraNome: e.paraNome,
          texto: e.texto.slice(0, 1500),
          quemEntregou: fichas.quemEntregou ?? null,
          quemRecebe: fichas.quemRecebe ?? null
        }
      }
    case 'parou':
      return { json: { agente: e.agente, agenteNome: e.agenteNome, como: e.como, quemParou: fichas.quemParou ?? null } }
    default:
      return { json: { em: new Date(agora).toISOString() } }
  }
}

// ---------------------------------------------------------------- o motor

type Espera = { evento: EventoDeAutomacao; cadeia: string[]; desde: number }

export function criarMotor(d: DependenciasDoMotor): Motor {
  const fila: EventoNoEspaco[] = []
  /** `espaço|fluxo/no` → próxima vez (ms) e a assinatura do horário (mudou o horário, recomeça a conta). */
  let proximas = new Map<string, { em: number; assinatura: string }>()
  const vistas = new Map<string, VistaDeParada>()
  let ultimaObservacao = -Infinity
  const disparosDoFluxo = new Map<string, number[]>()
  const disparosDoEspaco = new Map<string, number[]>()
  /** cartão → a cadeia do último recado de fluxo que ele recebeu (vale `VALIDADE_DA_CADEIA`). */
  const ultimaCadeia = new Map<string, { cadeia: string[]; em: number }>()
  /** `espaço|fluxo` → os eventos esperando o intervalo de 1 min dele (no máximo `MAX_NA_ESPERA`) e os descartados. */
  const esperando = new Map<string, { espacoId: string; fluxo: string; itens: Espera[]; descartados: number }>()
  /** `espaço|fluxo` → o motivo do último pulo por alcance e quantas vezes seguidas. */
  const pulos = new Map<string, { motivo: string; vezes: number }>()
  /** A fila de cada espaço: um fluxo por vez nele. */
  const filas = new Map<string, Promise<void>>()
  let emPasso = false
  let travaDeDigitar: Promise<void> = Promise.resolve()
  let contador = 0

  const novoId = (): string => d.novoId?.() ?? `${d.agora().toString(36)}-${(contador++).toString(36)}`
  const naHora = (lista: number[] | undefined, agora: number): number[] => (lista ?? []).filter((t) => agora - t < HORA)

  /**
   * Só digitar é global: o recado que a caixa enfileira e o comando no shell. A trava tem término garantido: passado
   * `prazoDeDigitar` (ou abortado o sinal da execução), o sinal da ação é abortado, e a ação real para de digitar na
   * hora (`EnvioCancelado`, envio.ts). A trava só é solta quando a ação para; se uma ação ignorar o sinal, ela é solta
   * `folgaDoCancelamento` depois, com erro no nó (defesa: as ações reais não chegam a isso).
   */
  async function digitando<T>(fn: (sinal: AbortSignal) => Promise<T> | T, sinalDaExecucao: AbortSignal): Promise<T> {
    const antes = travaDeDigitar
    let soltar!: () => void
    travaDeDigitar = new Promise<void>((ok) => (soltar = ok))
    await antes
    const prazo = d.prazoDeDigitar ?? PRAZO_DE_DIGITAR
    const folga = d.folgaDoCancelamento ?? FOLGA_DO_CANCELAMENTO
    const corte = new AbortController()
    const sinal = AbortSignal.any([sinalDaExecucao, corte.signal])
    let ateDesistir: ReturnType<typeof setTimeout> | undefined
    let desistir = (): void => {}
    const desistiu = new Promise<never>((_, rejeitar) => {
      desistir = () => {
        ateDesistir ??= setTimeout(() => rejeitar(new Error(`a ação não parou ${folga / 1000} s depois de cancelada; a trava de digitar foi solta`)), folga)
      }
    })
    sinal.addEventListener('abort', desistir, { once: true })
    const ateCortar = setTimeout(() => corte.abort(), prazo)
    try {
      return await Promise.race([Promise.resolve().then(() => fn(sinal)), desistiu])
    } catch (e) {
      if (!corte.signal.aborted) throw e
      throw new Error(`não terminou em ${prazo / 1000} s e foi cancelada: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      clearTimeout(ateCortar)
      clearTimeout(ateDesistir)
      sinal.removeEventListener('abort', desistir)
      soltar()
    }
  }

  /** Põe `fn` na fila do espaço; o erro de um não para a fila. */
  function naFilaDoEspaco<T>(espacoId: string, fn: () => Promise<T>): Promise<T> {
    const antes = filas.get(espacoId) ?? Promise.resolve()
    const vez = antes.then(fn)
    const fim = vez.then(
      () => {},
      () => {}
    )
    filas.set(espacoId, fim)
    void fim.then(() => {
      if (filas.get(espacoId) === fim) filas.delete(espacoId)
    })
    return vez
  }

  function ativos(): string[] {
    return d.espacos().filter((e) => d.fluxos(e).some((f) => f.ligado))
  }

  function cadeiaDe(cartao: string | null, agora: number): string[] {
    if (!cartao) return []
    const c = ultimaCadeia.get(cartao)
    if (!c) return []
    if (agora - c.em > VALIDADE_DA_CADEIA) {
      ultimaCadeia.delete(cartao)
      return []
    }
    return c.cadeia
  }

  /** A cadeia do evento mais a herdada de quem o causou (o agente que entregou, parou ou moveu depois de um recado de fluxo). */
  function cadeiaDoEvento(e: EventoNoEspaco, agora: number): string[] {
    const ev = e.evento
    const herdada =
      ev.tipo === 'entrega' ? cadeiaDe(ev.de, agora) : ev.tipo === 'parou' ? cadeiaDe(ev.agente, agora) : ev.tipo === 'kanban' ? cadeiaDe(ev.agente ?? null, agora) : []
    return [...new Set([...e.cadeia, ...herdada])]
  }

  /**
   * "Qualquer agente parou → recado a X": a parada do próprio X não conta (o recado falaria dele para ele mesmo). Só
   * contam os recados ALCANÇÁVEIS a partir do gatilho que casou, pelas ligações (o de outro ramo não impede este).
   */
  function falaDeSi(espacoId: string, fluxo: FluxoGravado, no: NoDoFluxo, e: EventoDeAutomacao): boolean {
    if (e.tipo !== 'parou' || no.tipo !== 'gatilho.parou' || idDe((no.ajustes as AjustesPorTipo['gatilho.parou']).agente)) return false
    const alcancaveis = new Set<string>([no.id])
    for (let mudou = true; mudou; ) {
      mudou = false
      for (const l of fluxo.ligacoes) if (alcancaveis.has(l.de) && !alcancaveis.has(l.para)) (alcancaveis.add(l.para), (mudou = true))
    }
    return fluxo.nos.some((n) => {
      if (n.tipo !== 'orkester.recado' || !alcancaveis.has(n.id)) return false
      const para = (n.ajustes as AjustesPorTipo['orkester.recado']).para.id
      return (para === 'maestro' ? d.destino?.(espacoId, para) : para) === e.agente
    })
  }

  function porNaEspera(espacoId: string, fluxo: string, item: Espera, naFrente: boolean): void {
    const chave = `${espacoId}|${fluxo}`
    const e = esperando.get(chave) ?? { espacoId, fluxo, itens: [], descartados: 0 }
    if (naFrente) e.itens.unshift(item)
    else if (e.itens.length < MAX_NA_ESPERA) e.itens.push(item)
    else e.descartados++
    esperando.set(chave, e)
  }

  /** Uma execução em que nada rodou (barrado, pulado, sem aprovação). */
  function execucaoVazia(fluxo: FluxoGravado, modo: Execucao['modo'], gatilho: string, cadeia: string[], resultado: ResultadoDaExecucao): Execucao {
    const nos: Execucao['nos'] = {}
    for (const n of fluxo.nos) nos[n.id] = { estado: 'nao-rodou', ms: 0, entrada: [], saidas: [], itens: { entrada: 0, saidas: [] } }
    return { id: novoId(), fluxo: fluxo.id, modo, gatilho, cadeia, inicio: new Date(d.agora()).toISOString(), ms: 0, resultado, caminho: [], nos }
  }

  /** As fichas do evento, lidas agora (na vez da execução). Erro numa fonte = aquela ficha `null`. */
  async function fichasDoEvento(espacoId: string, e: EventoDeAutomacao): Promise<FichasDoEvento> {
    const f = d.fichas
    if (!f) return {}
    const agente = async (id: string | null | undefined): Promise<FichaDeAgente | null> => {
      if (!id) return null
      try {
        return (await f.agente(espacoId, id)) ?? null
      } catch {
        return null
      }
    }
    switch (e.tipo) {
      case 'kanban': {
        let tarefa: FichaDeTarefa | null = null
        try {
          tarefa = f.tarefa(espacoId, e.numero)
        } catch {
          tarefa = null
        }
        return { tarefa }
      }
      case 'entrega':
        return { quemEntregou: await agente(e.de), quemRecebe: await agente(e.para) }
      case 'parou':
        return { quemParou: await agente(e.agente) }
      default:
        return {}
    }
  }

  /** O `$fluxo`, o `$espaco` e o `$execucao` das expressões. */
  function contextoDe(espacoId: string, fluxo: FluxoGravado, execucao: { id: string; modo: Execucao['modo']; inicio: string }): ContextoDasExpressoes {
    let doEspaco: Partial<ReturnType<FontesDasFichas['contexto']>> = {}
    try {
      doEspaco = d.fichas?.contexto(espacoId, fluxo) ?? {}
    } catch {
      doEspaco = {}
    }
    return { ...doEspaco, $execucao: execucao }
  }

  /** Percorre o fluxo (já na fila do espaço) e registra a execução. */
  async function percorrer(espacoId: string, fluxo: FluxoGravado, no: NoDoFluxo, evento: EventoDeAutomacao, cadeia: string[], modo: Execucao['modo'], detalhe?: string): Promise<Execucao> {
    const nomes = d.nomes?.(espacoId)
    const gatilho = (modo === 'manual' ? 'Rodar fluxo' : gatilhoNoHistorico(evento, nomes)).slice(0, MAX_RESUMO_DO_GATILHO)
    const inicio = d.agora()
    const daCadeia = [...cadeia, fluxo.id]
    const base = d.acoes(espacoId, fluxo, { cadeia: daCadeia })
    const alcancados: string[] = []
    const acoes: Partial<AcoesDoFluxo> = { ...base }
    if (base.recado) {
      const recado = base.recado
      acoes.recado = async (a, item, ctx) => {
        const r = await digitando((sinal) => recado(a, item, { ...ctx, sinal }), ctx.sinal)
        if (r && typeof r.para === 'string' && r.para) alcancados.push(r.para)
        return r
      }
    }
    if (base.tarefa) {
      // tarefa delegada ao Maestro (coluna "delegar"): a ação devolve `para` = o Maestro, que herda a cadeia
      const tarefa = base.tarefa
      acoes.tarefa = async (a, item, ctx) => {
        const r = await tarefa(a, item, ctx)
        if (r && typeof r.para === 'string' && r.para) alcancados.push(r.para)
        return r
      }
    }
    if (base.comando) {
      const comando = base.comando
      acoes.comando = (a, item, ctx) => digitando((sinal) => comando(a, item, { ...ctx, sinal }), ctx.sinal)
    }
    const id = novoId()
    const contexto = contextoDe(espacoId, fluxo, { id, modo, inicio: new Date(inicio).toISOString() })
    const item = itemDoEvento(evento, inicio, nomes, await fichasDoEvento(espacoId, evento))
    const r = await executarFluxo(fluxo, { noGatilho: no.id, itens: [item] }, { acoes, agora: d.agora, contexto })
    for (const id of alcancados) ultimaCadeia.set(id, { cadeia: daCadeia, em: d.agora() })
    const execucao: Execucao = {
      id,
      fluxo: fluxo.id,
      modo,
      gatilho,
      cadeia,
      inicio: new Date(inicio).toISOString(),
      ms: r.ms,
      resultado: r.resultado,
      caminho: r.caminho,
      nos: r.nos
    }
    d.registrar(espacoId, execucao, detalhe)
    return execucao
  }

  /** Confere selo, alcance, espera, laço e teto; aprovado, o fluxo entra na fila do espaço. Síncrono. */
  function disparar(espacoId: string, fluxo: FluxoGravado, no: NoDoFluxo, evento: EventoDeAutomacao, cadeia: string[], daEspera?: { desde: number; descartados: number }): void {
    const agora = d.agora()
    const chave = `${espacoId}|${fluxo.id}`
    const extras = daEspera
      ? [`esperou ${Math.round((agora - daEspera.desde) / 1000)} s a vez`, daEspera.descartados ? `${daEspera.descartados} evento(s) descartado(s): fila de espera cheia` : '']
      : []
    const comExtra = (detalhe: string): string => [detalhe, ...extras].filter(Boolean).join(' · ')
    const gatilho = gatilhoNoHistorico(evento, d.nomes?.(espacoId)).slice(0, MAX_RESUMO_DO_GATILHO)
    // fluxo sensível com o selo mexido à mão: não roda e desliga (o S3 avisa)
    if (d.conferirSelo && !d.conferirSelo(espacoId, fluxo)) {
      d.registrar(espacoId, execucaoVazia(fluxo, 'gatilho', gatilho, cadeia, 'erro'), 'desligado: o fluxo sensível mudou sem a sua aprovação')
      d.desligar(espacoId, fluxo.id, 'mudou-sem-aprovacao')
      return
    }
    // fluxo de agente: o alcance é conferido agora (antes da espera e do teto, que não contam o que foi pulado)
    const fora = d.foraDoAlcance?.(espacoId, fluxo, evento) ?? null
    if (fora === 'ignorar') return
    if (fora) {
      // pulos seguidos pelo mesmo motivo não enchem a lista: linha na 1ª, 2ª, 4ª, 8ª… vez, com a conta
      const antes = pulos.get(chave)
      const vezes = antes?.motivo === fora.pular ? antes.vezes + 1 : 1
      pulos.set(chave, { motivo: fora.pular, vezes })
      if (fora.desligar || (vezes & (vezes - 1)) === 0) {
        const detalhe = vezes > 1 ? fora.pular.replace(/^pulado:/, `pulado (${vezes}ª vez seguida):`) : fora.pular
        d.registrar(espacoId, execucaoVazia(fluxo, 'gatilho', gatilho, cadeia, 'sem-destino'), comExtra(detalhe))
      }
      if (fora.desligar) {
        pulos.delete(chave)
        d.desligar(espacoId, fluxo.id, 'cartao-sumiu')
      }
      return
    }
    pulos.delete(chave)
    // já há quem espere a vez deste fluxo: o evento novo entra atrás
    if (!daEspera && esperando.get(chave)?.itens.length) {
      porNaEspera(espacoId, fluxo.id, { evento, cadeia, desde: agora }, false)
      return
    }
    const doFluxo = naHora(disparosDoFluxo.get(chave), agora)
    const doEspaco = naHora(disparosDoEspaco.get(espacoId), agora)
    const veredito = podeDisparar(fluxo, cadeia, { daRegra: doFluxo, doEspaco }, agora)
    if (veredito?.resultado === 'esperar') {
      porNaEspera(espacoId, fluxo.id, { evento, cadeia, desde: daEspera?.desde ?? agora }, !!daEspera)
      return
    }
    if (veredito) {
      d.registrar(espacoId, execucaoVazia(fluxo, 'gatilho', gatilho, cadeia, veredito.resultado), comExtra(emFluxo(veredito.detalhe)))
      if (veredito.desligar) d.desligar(espacoId, fluxo.id, 'excesso')
      return
    }
    // uma execução conta como um disparo, já na decisão (a fila do espaço pode demorar)
    disparosDoFluxo.set(chave, [...doFluxo, agora])
    disparosDoEspaco.set(espacoId, [...doEspaco, agora])
    const detalhe = extras.filter(Boolean).join(' · ') || undefined
    void naFilaDoEspaco(espacoId, () => percorrer(espacoId, fluxo, no, evento, cadeia, 'gatilho', detalhe)).catch(() => {})
  }

  /** Os eventos que esperavam a vez: um por fluxo por passo, quando o intervalo dele passou. */
  function soltarEsperas(ativo: Set<string>): void {
    for (const [chave, e] of [...esperando]) {
      const fluxo = ativo.has(e.espacoId) ? d.fluxos(e.espacoId).find((f) => f.id === e.fluxo) : undefined
      if (!fluxo || !fluxo.ligado || !e.itens.length) {
        esperando.delete(chave)
        continue
      }
      const agora = d.agora()
      const ultimo = Math.max(-Infinity, ...naHora(disparosDoFluxo.get(chave), agora))
      if (agora - ultimo < INTERVALO_MINIMO) continue
      const item = e.itens.shift()!
      const descartados = e.descartados
      e.descartados = 0
      if (!e.itens.length) esperando.delete(chave)
      // o fluxo mudou e o evento não casa mais: ele cai
      const no = gatilhoQueCasa(fluxo, item.evento)
      if (!no) continue
      disparar(e.espacoId, fluxo, no, item.evento, item.cadeia, { desde: item.desde, descartados })
    }
  }

  /** O relógio dos nós Relógio de fluxos ligados; vencido = evento. Fluxo desligado esquece a conta. */
  function relogio(espacos: string[], agora: number): void {
    const novas = new Map<string, { em: number; assinatura: string }>()
    for (const espacoId of espacos) {
      for (const f of d.fluxos(espacoId)) {
        if (!f.ligado) continue
        for (const no of f.nos) {
          if (no.tipo !== 'gatilho.relogio') continue
          const quando = (no.ajustes as AjustesPorTipo['gatilho.relogio']).quando
          const id = chaveDoRelogio(f.id, no.id)
          const chave = `${espacoId}|${id}`
          const assinatura = JSON.stringify(quando)
          const conhecida = proximas.get(chave)
          if (!conhecida || conhecida.assinatura !== assinatura) {
            novas.set(chave, { em: proximaDe(quando, new Date(agora)).getTime(), assinatura })
          } else if (conhecida.em <= agora) {
            fila.push({ espacoId, evento: { tipo: 'horario', regra: id }, cadeia: [] })
            novas.set(chave, { em: proximaDe(quando, new Date(agora)).getTime(), assinatura })
          } else {
            novas.set(chave, conhecida)
          }
        }
      }
    }
    proximas = novas
  }

  /** O observador de parada: só os cartões citados por gatilhos `parou` de fluxos ligados (todos, se um diz "qualquer"). */
  async function observar(espacos: string[], agora: number): Promise<void> {
    const vigiados = new Map<string, string>() // cartão → espaço
    for (const espacoId of espacos) {
      for (const f of d.fluxos(espacoId)) {
        if (!f.ligado) continue
        for (const no of f.nos) {
          const q = gatilhoDoNo(no)
          if (q?.tipo !== 'parou') continue
          if (q.agente) vigiados.set(q.agente, espacoId)
          else for (const c of d.cartoes(espacoId)) if (c.agente !== 'shell') vigiados.set(c.id, espacoId)
        }
      }
    }
    for (const id of [...vistas.keys()]) if (!vigiados.has(id)) vistas.delete(id)
    for (const [id, espacoId] of vigiados) {
      const { vista, evento } = observarParada(vistas.get(id), await d.situacao(id), agora)
      vistas.set(id, vista)
      if (evento) fila.push({ espacoId, evento: { tipo: 'parou', agente: id, agenteNome: d.nome(id), como: evento }, cadeia: [] })
    }
  }

  async function umPasso(): Promise<void> {
    const agora = d.agora()
    const espacos = ativos()
    const ativo = new Set(espacos)
    relogio(espacos, agora)
    if (agora - ultimaObservacao >= PASSO_DO_OBSERVADOR) {
      ultimaObservacao = agora
      await observar(espacos, agora)
    }
    // de espaço sem fluxo ligado: descartado, nem fica para depois
    for (const e of d.tirarEventos()) if (ativo.has(e.espacoId)) fila.push(e)
    // primeiro quem já esperava a vez (ordem de chegada), depois os eventos novos
    soltarEsperas(ativo)
    while (fila.length) {
      const e = fila.shift()!
      if (!ativo.has(e.espacoId)) continue
      const cadeia = cadeiaDoEvento(e, d.agora())
      // a lista é relida a cada evento: um fluxo desligado por excesso no evento anterior não dispara de novo
      for (const fluxo of d.fluxos(e.espacoId)) {
        if (!fluxo.ligado) continue
        const no = gatilhoQueCasa(fluxo, e.evento)
        if (no && !falaDeSi(e.espacoId, fluxo, no, e.evento)) disparar(e.espacoId, fluxo, no, e.evento, cadeia)
      }
    }
  }

  return {
    async passo() {
      if (emPasso) return
      emPasso = true
      try {
        await umPasso()
      } finally {
        emPasso = false
      }
    },
    async ocioso() {
      while (filas.size) await Promise.all([...filas.values()])
    },
    rodarAgora(espacoId, fluxoId, opcoes = {}) {
      return naFilaDoEspaco(espacoId, async (): Promise<ResultadoDoRodar> => {
        const fluxo = d.fluxos(espacoId).find((f) => f.id === fluxoId)
        if (!fluxo) return { ok: false, motivo: 'nao-existe' }
        // relido e conferido no mesmo instante em que vai rodar: nada o troca no meio
        if (opcoes.conferir && !opcoes.conferir(fluxo)) return { ok: false, motivo: 'fluxo-mudou' }
        const no = opcoes.noGatilho ? fluxo.nos.find((n) => n.id === opcoes.noGatilho && n.tipo.startsWith('gatilho.')) : fluxo.nos.find((n) => n.tipo === 'gatilho.manual')
        if (!no) return { ok: false, motivo: 'sem-manual' }
        if (d.conferirSelo && !d.conferirSelo(espacoId, fluxo)) return { ok: false, motivo: 'sem-aprovacao' }
        const evento: EventoDeAutomacao = { tipo: 'teste' }
        const fora = d.foraDoAlcance?.(espacoId, fluxo, evento) ?? null
        if (fora && fora !== 'ignorar') {
          const execucao = execucaoVazia(fluxo, 'manual', 'Rodar fluxo', [], 'sem-destino')
          d.registrar(espacoId, execucao, fora.pular)
          return { ok: true, execucao }
        }
        return { ok: true, execucao: await percorrer(espacoId, fluxo, no, evento, [], 'manual') }
      })
    },
    proximas(espacoId) {
      const saida: Record<string, number> = {}
      const prefixo = `${espacoId}|`
      for (const [chave, p] of proximas) if (chave.startsWith(prefixo)) saida[chave.slice(prefixo.length)] = p.em
      return saida
    },
    zerarTaxa(espacoId, fluxoId) {
      disparosDoFluxo.delete(`${espacoId}|${fluxoId}`)
      // o que esperava antes de ele ser desligado não dispara ao religar
      esperando.delete(`${espacoId}|${fluxoId}`)
    },
    fluxosLigados() {
      return d.espacos().reduce((n, e) => n + d.fluxos(e).filter((f) => f.ligado).length, 0)
    },
    espacosAtivos: ativos
  }
}
