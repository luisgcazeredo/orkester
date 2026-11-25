// Execuções de um fluxo: os textos e as contas puras da lista e do desenho (resultado, duração, motivo de um barrado ou
// pulado, itens que passaram por cada ligação). Sem React e sem DOM: a `textos.prova` roda no Node.
import type { Execucao, Ligacao, NoNaExecucao, ResumoDaExecucao } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { quandoFoi, textoDoResultado, type Tom } from '../textos.ts'

export { quandoFoi, textoDoResultado, type Tom }

/** "840 ms", "2,3 s", "1 min 5 s". */
export function duracaoEmTexto(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '')} s`
  const min = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return s === 60 ? `${min + 1} min` : s ? `${min} min ${s} s` : `${min} min`
}

export const modoEmTexto = (modo: ResumoDaExecucao['modo']): string => (modo === 'manual' ? 'Rodar fluxo' : 'Gatilho')

/** "1 item", "0 itens", "1.250 itens". */
export const rotuloDeItens = (n: number): string => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'item' : 'itens'}`

const PADRAO: Record<ResumoDaExecucao['resultado'], string> = {
  ok: '',
  erro: 'deu erro',
  'barrado-laco': 'o fluxo já tinha rodado nesta cadeia de disparos (laço)',
  'barrado-taxa': 'passou do teto de disparos por hora',
  'sem-destino': 'o destino do recado não estava disponível'
}

/**
 * Por que a execução terminou assim, em uma frase. O `detalhe` que o motor grava (barrado, pulado, esperou na fila)
 * vale mais que o texto padrão; em erro, vale o do nó que falhou, com o nome dele quando se sabe (`nomes`: id → nome).
 */
export function motivoDaExecucao(r: Pick<ResumoDaExecucao, 'resultado' | 'detalhe' | 'erro' | 'noComErro'>, nomes: Readonly<Record<string, string>> = {}): string {
  if (r.resultado === 'erro') {
    const onde = r.noComErro ? (nomes[r.noComErro] ?? '') : ''
    const porque = r.erro ?? r.detalhe ?? PADRAO.erro
    return onde ? `${onde}: ${porque}` : porque
  }
  return r.detalhe ?? PADRAO[r.resultado] ?? ''
}

// ---------------------------------------------------------------- as ligações de uma execução aberta

/**
 * `passou`: saíram itens por ela; `vazia`: o nó rodou mas nada saiu por esta saída (o Se que mandou tudo pelo outro
 * lado, ou o nó que deu erro); `parada`: o nó de origem nem rodou.
 */
export type EstadoDaLigacao = 'passou' | 'vazia' | 'parada'

export function estadoDaLigacao(l: Ligacao, execucao: Pick<Execucao, 'nos'>): { estado: EstadoDaLigacao; itens: number | null } {
  const de = execucao.nos[l.de]
  if (!de || de.estado === 'nao-rodou') return { estado: 'parada', itens: null }
  const itens = de.itens?.saidas?.[l.saida] ?? 0
  return { estado: itens > 0 ? 'passou' : 'vazia', itens }
}

/** A classe que a ligação ganha no desenho (`exec-passou`…); vazio sem execução aberta. */
export const classeDaLigacao = (l: Ligacao, execucao: Pick<Execucao, 'nos'> | null | undefined): string => (execucao ? `exec-${estadoDaLigacao(l, execucao).estado}` : '')

/** O texto do rótulo no meio da ligação, ou `null` quando não há o que dizer (a origem não rodou). */
export function rotuloDaLigacao(l: Ligacao, execucao: Pick<Execucao, 'nos'>): string | null {
  const { itens } = estadoDaLigacao(l, execucao)
  return itens === null ? null : rotuloDeItens(itens)
}

/** O que a faixa da execução aberta resume: o que rodou, o que deu erro e o que ficou parado. */
export function resumoDosNos(execucao: Pick<Execucao, 'nos'>): { ok: number; erro: number; naoRodou: number } {
  const r = { ok: 0, erro: 0, naoRodou: 0 }
  for (const n of Object.values(execucao.nos)) {
    if (n.estado === 'ok') r.ok++
    else if (n.estado === 'erro') r.erro++
    else r.naoRodou++
  }
  return r
}

/**
 * Em qual painel do nó mostrar "Cortado": o corte é um só (`cortado`), mas as contagens guardam o que havia de verdade.
 * Entrada cortada = veio menos item do que a contagem; saída cortada, idem para a saída mostrada. Se o corte não aparece
 * em nenhuma contagem (um item só, grande demais), vale onde há itens para ver.
 */
export function ondeCortou(no: Pick<NoNaExecucao, 'cortado' | 'entrada' | 'saidas' | 'itens'>, saida: number): { entrada: boolean; saida: boolean } {
  if (!no.cortado) return { entrada: false, saida: false }
  const entrada = no.entrada.length < no.itens.entrada
  const naSaida = (no.saidas[saida] ?? []).length < (no.itens.saidas[saida] ?? 0)
  const algumaSaida = no.saidas.some((s, i) => s.length < (no.itens.saidas[i] ?? 0))
  if (entrada || naSaida || algumaSaida) return { entrada, saida: naSaida }
  return { entrada: no.entrada.length > 0, saida: (no.saidas[saida] ?? []).length > 0 }
}

/** Quantos nós tiveram a entrada ou a saída cortada (passou de ~10 KB) e quantos deixaram `console.log`. */
export function marcasDosNos(execucao: Pick<Execucao, 'nos'>): { cortados: number; comLog: number } {
  const nos = Object.values(execucao.nos)
  return { cortados: nos.filter((n) => n.cortado).length, comLog: nos.filter((n) => n.log && n.log.length > 0).length }
}

// ---------------------------------------------------------------- {{ }} vazias (1.9.7, D5)

/** As `{{ }}` que vieram vazias em cada nó (o executor grava `vazias`, até 10 por nó), na ordem do caminho. */
export function vaziasDaExecucao(execucao: Pick<Execucao, 'nos'> & { caminho?: readonly string[] }, nomes: Readonly<Record<string, string>> = {}): { no: string; nome: string; expressoes: string[] }[] {
  const ids = [...new Set([...(execucao.caminho ?? []), ...Object.keys(execucao.nos)])]
  const achadas: { no: string; nome: string; expressoes: string[] }[] = []
  for (const id of ids) {
    // a execução vem do disco: confere o formato mesmo com o tipo declarado
    const v: unknown = execucao.nos[id]?.vazias
    const expressoes = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    if (expressoes.length) achadas.push({ no: id, nome: nomes[id] ?? id, expressoes })
  }
  return achadas
}

/** "{{ a.b }} veio vazio em Avisar", "2 {{ }} vieram vazias em Recado". */
export function frasesDasVazias(vazias: ReturnType<typeof vaziasDaExecucao>): string[] {
  return vazias.map((v) => (v.expressoes.length === 1 ? `${v.expressoes[0]} veio vazio em ${v.nome}` : `${v.expressoes.join(', ')} vieram vazios em ${v.nome}`))
}
