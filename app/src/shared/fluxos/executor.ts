// Fluxos (1.9.6): o executor do grafo. Puro: as ações (recado, tarefa, comando, avisar, Código, HTTP) chegam como
// dependências, e o relógio também; roda no Node com `node --test`. O motor (main) monta a `Execucao` em volta disto.
//
// Regras (plano §3): percorre o grafo em profundidade a partir do gatilho, com as saídas na ordem das ligações (nó com
// várias entradas roda a cada chegada, com os itens dela, sem juntar ramos); nó que
// recebe 0 itens não roda (nem os filhos). O primeiro erro para o fluxo: o nó fica `erro`, os que não rodaram ficam
// `nao-rodou`, sem nova tentativa. Se e Definir rodam item a item; Código uma vez com todos; HTTP item a item até 20;
// ações Orkester item a item até 5 (o Consultar solta N por item, até 100 no total). Tetos: 50 passos, 60 s, 1000 itens e 5 MB por lista. Na execução, a entrada e as
// saídas de cada nó ficam até ~10 KB (`cortado`), e todo texto de credencial vira `•••`.
import type { AjustesPorTipo, CondicaoDoSe, Execucao, Item, Ligacao, NoDoFluxo, NoNaExecucao, TipoDeNo } from './tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { CORTE_DO_NO, MAX_BYTES_DA_LISTA, MAX_BYTES_DE_LOG, MAX_ITENS, MAX_ITENS_HTTP, MAX_ITENS_ORKESTER, MAX_LINHAS_DE_LOG, MAX_PASSOS, PRAZO_DA_EXECUCAO } from './formato.ts'
// @ts-expect-error idem
import { comandoComExpressao, ehGatilho, quantasSaidas, resolverAjustes } from './nos.ts'
// @ts-expect-error idem
import { emTexto, resolverValor } from './expressoes.ts'

// ---------------------------------------------------------------- dependências

export interface ContextoDaAcao {
  no: NoDoFluxo
  /** Aborta quando o prazo da execução acaba (o HTTP deve parar o pedido). */
  sinal: AbortSignal
  /** Registra um texto secreto (valor de credencial): ele vira `•••` em tudo o que a execução guarda e na saída do nó. */
  ocultar: (segredo: string) => void
  /** O `contexto` das opções (`$fluxo/$espaco/$execucao`), para a ação que lê expressão por conta própria (o corpo do HTTP). */
  contexto?: ContextoDasExpressoes
}

/** `void` = o item de entrada passa adiante como está; objeto = o `json` do item de saída. */
export type SaidaDaAcao = Record<string, unknown> | void

type AcaoPorItem<T extends TipoDeNo> = (ajustes: AjustesPorTipo[T], item: Item, ctx: ContextoDaAcao) => SaidaDaAcao | Promise<SaidaDaAcao>

export interface AcoesDoFluxo {
  /** Ajustes já resolvidos para o item. O `resultado` devolvido vai para o `recado` do nó na execução. */
  recado: AcaoPorItem<'orkester.recado'>
  tarefa: AcaoPorItem<'orkester.tarefa'>
  /** O comando nunca é resolvido (texto fixo). */
  comando: AcaoPorItem<'orkester.comando'>
  avisar: AcaoPorItem<'orkester.avisar'>
  http: AcaoPorItem<'fora.http'>
  /**
   * Consultar (só leitura): uma vez por item de entrada, com os ajustes resolvidos para ele. `itens`: um `json` por
   * ficha (já cortados no `limite`); `total`: quantos casaram antes do corte.
   */
  consultar: (ajustes: AjustesPorTipo['orkester.consultar'], item: Item, ctx: ContextoDaAcao) => Promise<ResultadoDaConsulta> | ResultadoDaConsulta
  /**
   * Uma vez com todos os itens. `anteriores`: nome do nó → itens que ele mandou pelo caminho até aqui (o `$('Nome')`);
   * nó fora do caminho não aparece. Devolve `[{json}]` ou uma lista de objetos, e o `console.log`.
   */
  codigo: (
    ajustes: AjustesPorTipo['fora.codigo'],
    itens: Item[],
    ctx: ContextoDaAcao & { anteriores: Record<string, Item[]> }
  ) => Promise<{ itens: unknown[]; log?: string[] }> | { itens: unknown[]; log?: string[] }
}

export interface ResultadoDaConsulta {
  itens: Record<string, unknown>[]
  total: number
}

/** O Consultar solta no máximo isto de itens por execução do nó (somadas as vezes); o resto é cortado, com nota no log. */
export const MAX_SAIDA_DA_CONSULTA = 100

export interface OpcoesDoExecutor {
  /** Faltou uma ação: o nó dá erro "ainda não roda aqui" (ex.: Código e HTTP antes da onda 2). */
  acoes: Partial<AcoesDoFluxo>
  /** Relógio em ms (padrão `Date.now`). */
  agora?: () => number
  /** Segredos já conhecidos antes de começar. */
  segredos?: readonly string[]
  /** Padrão `PRAZO_DA_EXECUCAO`; as provas encurtam. */
  prazoMs?: number
  /**
   * O que toda expressão enxerga além do item: `{{ $fluxo.nome }}`, `{{ $espaco.nome }}`, `{{ $execucao.id }}` (as fichas
   * de shared/fluxos/fichas.ts). Não entra nos itens: só na leitura das expressões.
   */
  contexto?: ContextoDasExpressoes
}

export interface ContextoDasExpressoes {
  $fluxo?: unknown
  $espaco?: unknown
  $execucao?: unknown
}

/**
 * O item com o contexto, para ler as expressões. As chaves do contexto são próprias mas não enumeráveis: `{{ $json }}`
 * (o item inteiro, em JSON) não as mostra, e o `manterOutros` do Definir não as copia. Cobrem um campo de mesmo nome.
 */
export function comContexto(json: Record<string, unknown>, contexto?: ContextoDasExpressoes): Record<string, unknown> {
  if (!contexto) return json
  const visto: Record<string, unknown> = { ...json }
  for (const chave of ['$fluxo', '$espaco', '$execucao'] as const) {
    if (contexto[chave] !== undefined) Object.defineProperty(visto, chave, { value: contexto[chave], enumerable: false, configurable: true, writable: false })
  }
  return visto
}

export type ResultadoDoExecutor = Pick<Execucao, 'caminho' | 'nos' | 'ms'> & { resultado: 'ok' | 'erro'; erro?: string; noComErro?: string }

export const OCULTO = '•••'
/** Segredo mais curto que isto não é procurado (trocaria letras soltas de qualquer texto). */
export const MIN_SEGREDO = 4
const MAX_ERRO = 500

// ---------------------------------------------------------------- utilidades puras

const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v) ?? '').length
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Troca cada segredo por `•••` em todo texto (chaves e valores), sem mexer no original. */
export function ocultarEm<T>(v: T, segredos: readonly string[]): T {
  if (!segredos.length) return v
  const texto = (s: string): string => segredos.reduce((acc, seg) => acc.split(seg).join(OCULTO), s)
  const andar = (x: unknown): unknown => {
    if (typeof x === 'string') return texto(x)
    if (Array.isArray(x)) return x.map(andar)
    if (ehObjeto(x)) return Object.fromEntries(Object.entries(x).map(([k, val]) => [texto(k), andar(val)]))
    return x
  }
  return andar(v) as T
}

/** As listas que cabem em ~`limite` bytes, repartido igual entre elas; o que passa é cortado (`cortado: true`). */
export function cortarListas(listas: Item[][], limite = CORTE_DO_NO): { listas: Item[][]; cortado: boolean } {
  if (bytes(listas) <= limite) return { listas, cortado: false }
  const porLista = Math.floor(limite / Math.max(1, listas.length))
  const saida = listas.map((lista) => {
    const ficou: Item[] = []
    let usado = 2
    for (const item of lista) {
      const b = bytes(item) + 1
      if (usado + b > porLista) break
      ficou.push(item)
      usado += b
    }
    return ficou
  })
  return { listas: saida, cortado: true }
}

const mensagemDe = (e: unknown): string => {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : emTexto(e)
  return (m || 'erro sem mensagem').slice(0, MAX_ERRO)
}

class ErroDoNo extends Error {}

// ---------------------------------------------------------------- Se e Definir

const vazio = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length) || (ehObjeto(v) && !Object.keys(v).length)

const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

const minusculo = (v: unknown): string => emTexto(v).toLocaleLowerCase('pt-BR')

/**
 * Uma condição sobre o item. `igual`/`diferente`: números comparam como número (`5` = `"5"`), o resto pelo texto
 * exato. `contem` (sem diferenciar maiúsculas): numa lista, algum elemento igual; no resto, o texto contém.
 * `comeca`/`termina`: texto, sem diferenciar maiúsculas. `maior`/`menor`: só números (texto que não é número = falso).
 * `verdadeiro`/`falso`: o booleano ou o texto `true`/`false`.
 */
export function avaliarCondicao(c: CondicaoDoSe, json: unknown): boolean {
  const a = resolverValor(c.valor, json)
  const b = resolverValor(c.comparar, json)
  switch (c.operador) {
    case 'igual':
    case 'diferente': {
      const na = numero(a)
      const nb = numero(b)
      const igual = na !== null && nb !== null ? na === nb : emTexto(a) === emTexto(b)
      return c.operador === 'igual' ? igual : !igual
    }
    case 'contem':
    case 'nao-contem': {
      const tem = Array.isArray(a) ? a.some((x) => emTexto(x) === emTexto(b)) : minusculo(a).includes(minusculo(b))
      return c.operador === 'contem' ? tem : !tem
    }
    case 'comeca':
      return minusculo(a).startsWith(minusculo(b))
    case 'termina':
      return minusculo(a).endsWith(minusculo(b))
    case 'vazio':
      return vazio(a)
    case 'nao-vazio':
      return !vazio(a)
    case 'maior':
    case 'menor': {
      const na = numero(a)
      const nb = numero(b)
      if (na === null || nb === null) return false
      return c.operador === 'maior' ? na > nb : na < nb
    }
    case 'verdadeiro':
      return a === true || minusculo(a).trim() === 'true'
    case 'falso':
      return a === false || minusculo(a).trim() === 'false'
  }
}

export function separarSe(ajustes: AjustesPorTipo['logica.se'], itens: Item[], contexto?: ContextoDasExpressoes): [Item[], Item[]] {
  const sim: Item[] = []
  const nao: Item[] = []
  for (const item of itens) {
    const visto = comContexto(item.json, contexto)
    const r = ajustes.condicoes.map((c) => avaliarCondicao(c, visto))
    const passa = ajustes.combinar === 'ou' ? r.some(Boolean) : r.every(Boolean)
    ;(passa ? sim : nao).push(item)
  }
  return [sim, nao]
}

const CHAVE_PROIBIDA = new Set(['__proto__', 'prototype', 'constructor'])

/** Os campos postos no item. O valor é lido do item como ele chegou (ordem dos campos não importa); ausente = `null`. */
export function definirCampos(ajustes: AjustesPorTipo['logica.definir'], item: Item, contexto?: ContextoDasExpressoes): Item {
  const json: Record<string, unknown> = ajustes.manterOutros ? structuredClone(item.json) : {}
  const visto = comContexto(item.json, contexto)
  for (const campo of ajustes.campos) {
    const partes = campo.nome.split('.')
    if (partes.some((p) => CHAVE_PROIBIDA.has(p))) continue
    const valor = resolverValor(campo.valor, visto)
    let alvo = json
    for (const p of partes.slice(0, -1)) {
      const prox = Object.prototype.hasOwnProperty.call(alvo, p) ? alvo[p] : undefined
      if (!ehObjeto(prox)) alvo[p] = {}
      alvo = alvo[p] as Record<string, unknown>
    }
    alvo[partes[partes.length - 1]] = valor === undefined ? null : structuredClone(valor)
  }
  return { json }
}

/** O que o Código devolveu, como itens: `[{json}]` ou lista de objetos; só JSON simples. */
export function itensDoCodigo(bruto: unknown): Item[] {
  if (!Array.isArray(bruto)) throw new ErroDoNo('o Código precisa devolver uma lista ([{ json: {...} }] ou [{...}])')
  let simples: unknown[]
  try {
    simples = JSON.parse(JSON.stringify(bruto)) as unknown[]
  } catch {
    throw new ErroDoNo('a saída do Código não é JSON simples')
  }
  return simples.map((x, i) => {
    if (!ehObjeto(x)) throw new ErroDoNo(`a saída do Código: o item ${i + 1} não é um objeto`)
    const chaves = Object.keys(x)
    if (chaves.length === 1 && chaves[0] === 'json' && ehObjeto(x.json)) return { json: x.json }
    return { json: x }
  })
}

function cortarLog(log: unknown): string[] | undefined {
  if (!Array.isArray(log) || !log.length) return undefined
  const saida: string[] = []
  let usados = 0
  for (const l of log.slice(0, MAX_LINHAS_DE_LOG)) {
    const t = emTexto(l)
    const resta = MAX_BYTES_DE_LOG - usados
    if (resta <= 0) break
    const parte = new TextEncoder().encode(t).length > resta ? t.slice(0, resta) : t
    saida.push(parte)
    usados += new TextEncoder().encode(parte).length
  }
  return saida
}

// ---------------------------------------------------------------- executor

const ACAO_ORKESTER: Partial<Record<TipoDeNo, 'recado' | 'tarefa' | 'comando' | 'avisar'>> = {
  'orkester.recado': 'recado',
  'orkester.tarefa': 'tarefa',
  'orkester.comando': 'comando',
  'orkester.avisar': 'avisar'
}

/**
 * Roda o fluxo a partir de `noGatilho`, com os itens do evento (Manual e Relógio: `[{ json: { em } }]`). Nunca lança:
 * erro de qualquer nó vira `resultado: 'erro'`. `nos` traz todos os nós do fluxo (os que não rodaram, `nao-rodou`).
 */
export async function executarFluxo(
  fluxo: { nos: readonly NoDoFluxo[]; ligacoes: readonly Ligacao[] },
  inicio: { noGatilho: string; itens: Item[] },
  opcoes: OpcoesDoExecutor
): Promise<ResultadoDoExecutor> {
  const agora = opcoes.agora ?? Date.now
  const prazo = opcoes.prazoMs ?? PRAZO_DA_EXECUCAO
  const t0 = agora()
  const segredos = new Set<string>()
  const ocultar = (s: string): void => {
    if (typeof s === 'string' && s.length >= MIN_SEGREDO) segredos.add(s)
  }
  for (const s of opcoes.segredos ?? []) ocultar(s)
  const lista = (): string[] => [...segredos].sort((a, b) => b.length - a.length)

  const porId = new Map(fluxo.nos.map((n) => [n.id, n]))
  const filhos = (id: string): Ligacao[] => fluxo.ligacoes.filter((l) => l.de === id)
  const caminho: string[] = []
  const brutos = new Map<string, Bruto>()
  const controle = new AbortController()
  let erro: { no: string; mensagem: string } | null = null

  const restante = (): number => prazo - (agora() - t0)
  const comPrazo = async <T>(p: Promise<T> | T): Promise<T> => {
    const ms = restante()
    if (ms <= 0) throw new ErroDoNo(`a execução passou de ${Math.round(prazo / 1000)} s`)
    let timer: ReturnType<typeof setTimeout> | undefined
    const estourou = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => {
        controle.abort()
        rejeitar(new ErroDoNo(`a execução passou de ${Math.round(prazo / 1000)} s`))
      }, ms)
    })
    try {
      return await Promise.race([Promise.resolve(p), estourou])
    } finally {
      clearTimeout(timer)
    }
  }

  const conferirLista = (itens: Item[], onde: string): void => {
    if (itens.length > MAX_ITENS) throw new ErroDoNo(`${onde}: ${itens.length} itens, o máximo é ${MAX_ITENS}`)
    if (bytes(itens) > MAX_BYTES_DA_LISTA) throw new ErroDoNo(`${onde}: passou de ${MAX_BYTES_DA_LISTA / 1024 / 1024} MB`)
  }

  /** Roda um nó e devolve uma lista de itens por saída. */
  const rodarNo = async (no: NoDoFluxo, entrada: Item[], anteriores: Record<string, Item[]>): Promise<{ saidas: Item[][]; recado?: string; log?: string[] }> => {
    const ctx: ContextoDaAcao = { no, sinal: controle.signal, ocultar, contexto: opcoes.contexto }
    if (ehGatilho(no.tipo)) return { saidas: [entrada] }
    switch (no.tipo) {
      case 'logica.se':
        return { saidas: separarSe(no.ajustes as AjustesPorTipo['logica.se'], entrada, opcoes.contexto) }
      case 'logica.definir':
        return { saidas: [entrada.map((i) => definirCampos(no.ajustes as AjustesPorTipo['logica.definir'], i, opcoes.contexto))] }
      case 'fora.codigo': {
        const acao = opcoes.acoes.codigo
        if (!acao) throw new ErroDoNo('o nó Código ainda não roda aqui')
        const r = await comPrazo(acao(no.ajustes as AjustesPorTipo['fora.codigo'], entrada, { ...ctx, anteriores }))
        return { saidas: [itensDoCodigo(r?.itens)], log: cortarLog(r?.log) }
      }
      case 'orkester.consultar': {
        const acao = opcoes.acoes.consultar
        if (!acao) throw new ErroDoNo('o nó Consultar ainda não roda aqui')
        if (entrada.length > MAX_ITENS_ORKESTER) throw new ErroDoNo(`chegaram ${entrada.length} itens e este nó consulta no máximo ${MAX_ITENS_ORKESTER} vezes: junte os itens antes, no nó Código`)
        const saida: Item[] = []
        let casaram = 0
        for (const item of entrada) {
          const ajustes = resolverAjustes(no.tipo, no.ajustes as never, comContexto(item.json, opcoes.contexto)) as AjustesPorTipo['orkester.consultar']
          const r = await comPrazo(acao(ajustes, item, ctx))
          if (!r || !Array.isArray(r.itens) || !r.itens.every(ehObjeto)) throw new ErroDoNo('a consulta devolveu algo que não é uma lista de objetos')
          casaram += Math.max(r.total, r.itens.length)
          for (const json of r.itens) saida.push({ json: JSON.parse(JSON.stringify(json)) as Record<string, unknown> })
        }
        const ficou = saida.slice(0, MAX_SAIDA_DA_CONSULTA)
        const cortes: string[] = []
        if (casaram > saida.length) cortes.push(`cortado no limite do nó: ${casaram} casaram, saíram ${saida.length}`)
        if (saida.length > ficou.length) cortes.push(`cortado em ${MAX_SAIDA_DA_CONSULTA} itens (eram ${saida.length})`)
        return { saidas: [ficou], log: cortes.length ? cortes : undefined }
      }
      default: {
        const nome = no.tipo === 'fora.http' ? 'http' : ACAO_ORKESTER[no.tipo]
        if (!nome) throw new ErroDoNo(`tipo de nó desconhecido: ${no.tipo}`)
        // a Falta do comando (D5) não impede a leitura do disco: um fluxo antigo, ligado, para aqui e não digita nada
        if (no.tipo === 'orkester.comando' && comandoComExpressao((no.ajustes as AjustesPorTipo['orkester.comando']).comando)) throw new ErroDoNo('{{ }} não vale no comando')
        const max = no.tipo === 'fora.http' ? MAX_ITENS_HTTP : MAX_ITENS_ORKESTER
        if (entrada.length > max) {
          throw new ErroDoNo(
            no.tipo === 'fora.http'
              ? `chegaram ${entrada.length} itens e o HTTP faz no máximo ${max} pedidos: junte os itens antes, no nó Código`
              : `chegaram ${entrada.length} itens e este nó age no máximo ${max} vezes: junte os itens antes, no nó Código`
          )
        }
        const acao = opcoes.acoes[nome] as AcaoPorItem<TipoDeNo> | undefined
        if (!acao) throw new ErroDoNo(`o nó ${no.tipo} ainda não roda aqui`)
        const saida: Item[] = []
        const recados: string[] = []
        for (const item of entrada) {
          const ajustes = resolverAjustes(no.tipo, no.ajustes as never, comContexto(item.json, opcoes.contexto)) as never
          const r = await comPrazo(acao(ajustes, item, ctx))
          if (r !== undefined && r !== null && !ehObjeto(r)) throw new ErroDoNo('a ação devolveu algo que não é objeto')
          saida.push(r ? { json: JSON.parse(JSON.stringify(r)) as Record<string, unknown> } : item)
          if (no.tipo === 'orkester.recado' && r && typeof r.resultado === 'string' && !recados.includes(r.resultado)) recados.push(r.resultado)
        }
        return { saidas: [saida], recado: recados.length ? recados.join(', ') : undefined }
      }
    }
  }

  type Bruto = { estado: 'ok' | 'erro'; ms: number; entrada: Item[]; saidas: Item[][]; erro?: string; recado?: string; log?: string[] }
  /** Nó com várias entradas roda a cada chegada: a execução guarda a soma (itens, tempo, recados e log). */
  const anotar = (id: string, b: Bruto): void => {
    const antes = brutos.get(id)
    if (!antes) return void brutos.set(id, b)
    const juntar = <T>(x?: T[], y?: T[]): T[] | undefined => (x || y ? [...(x ?? []), ...(y ?? [])] : undefined)
    brutos.set(id, {
      estado: b.estado === 'erro' ? 'erro' : antes.estado,
      ms: antes.ms + b.ms,
      entrada: [...antes.entrada, ...b.entrada],
      saidas: antes.saidas.map((s, i) => [...s, ...(b.saidas[i] ?? [])]),
      erro: b.erro ?? antes.erro,
      recado: [antes.recado, b.recado].filter(Boolean).join(', ') || undefined,
      log: juntar(antes.log, b.log)
    })
  }

  const visitar = async (id: string, entrada: Item[], anteriores: Record<string, Item[]>): Promise<void> => {
    if (erro) return
    const no = porId.get(id)
    if (!no) return
    if (!ehGatilho(no.tipo) && !entrada.length) return
    const inicioDoNo = agora()
    let contado = false
    try {
      if (caminho.length >= MAX_PASSOS) throw new ErroDoNo(`o fluxo passou de ${MAX_PASSOS} passos`)
      if (restante() <= 0) throw new ErroDoNo(`a execução passou de ${Math.round(prazo / 1000)} s`)
      caminho.push(id)
      contado = true
      const r = await rodarNo(no, entrada, anteriores)
      const n = quantasSaidas(no.tipo)
      const saidas = Array.from({ length: n }, (_, i) => r.saidas[i] ?? [])
      const finais = segredos.size ? saidas.map((s) => ocultarEm(s, lista())) : saidas
      finais.forEach((s, i) => conferirLista(s, n > 1 ? `saída ${i + 1}` : 'a saída'))
      anotar(id, { estado: 'ok', ms: agora() - inicioDoNo, entrada, saidas: finais, recado: r.recado, log: r.log })
      for (const l of filhos(id)) {
        if (erro) return
        const itens = finais[l.saida] ?? []
        await visitar(l.para, itens, { ...anteriores, [no.nome]: itens })
      }
    } catch (e) {
      if (!contado) caminho.push(id)
      const mensagem = mensagemDe(e)
      anotar(id, { estado: 'erro', ms: agora() - inicioDoNo, entrada, saidas: Array.from({ length: quantasSaidas(no.tipo) }, () => []), erro: mensagem })
      erro = { no: id, mensagem }
    }
  }

  const gatilho = porId.get(inicio.noGatilho)
  if (!gatilho || !ehGatilho(gatilho.tipo)) {
    erro = { no: inicio.noGatilho, mensagem: `o gatilho ${inicio.noGatilho} não existe neste fluxo` }
  } else {
    await visitar(gatilho.id, structuredClone(inicio.itens), {})
  }

  // A execução guardada: cortada em ~10 KB por nó e sem nenhum texto de credencial.
  const seg = lista()
  const nos: Record<string, NoNaExecucao> = {}
  for (const no of fluxo.nos) {
    const b = brutos.get(no.id)
    if (!b) {
      nos[no.id] = { estado: 'nao-rodou', ms: 0, entrada: [], saidas: [], itens: { entrada: 0, saidas: [] } }
      continue
    }
    const { listas, cortado } = cortarListas(ocultarEm([b.entrada, ...b.saidas], seg))
    const n: NoNaExecucao = {
      estado: b.estado,
      ms: b.ms,
      entrada: listas[0],
      saidas: listas.slice(1),
      itens: { entrada: b.entrada.length, saidas: b.saidas.map((s) => s.length) }
    }
    if (cortado) n.cortado = true
    if (b.erro) n.erro = ocultarEm(b.erro, seg)
    if (b.recado) n.recado = ocultarEm(b.recado, seg)
    if (b.log) n.log = ocultarEm(b.log, seg)
    nos[no.id] = n
  }
  const final: ResultadoDoExecutor = { resultado: erro ? 'erro' : 'ok', caminho, nos, ms: agora() - t0 }
  if (erro) {
    final.erro = ocultarEm(erro.mensagem, seg)
    final.noComErro = erro.no
  }
  return final
}
