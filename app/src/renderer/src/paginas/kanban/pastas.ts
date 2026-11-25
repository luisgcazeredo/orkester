// Kanban em pastas (página, 1.9.7, K2): como uma coluna agrupa as tarefas por pasta, a ordem das pastas (a mais nova
// primeiro), quais nascem recolhidas e o que a página guarda sobre isso nesta máquina. Puro (sem DOM, sem React): a
// `pastas.prova` roda no Node. A pasta é um campo da tarefa (`Tarefa.pasta`); aqui só se decide como aparece.
import type { Tarefa } from '../../../../shared/kanban'

export interface GrupoDePasta {
  /** O nome como a primeira tarefa do grupo o escreve. */
  nome: string
  tarefas: Tarefa[]
}

export interface ColunaAgrupada {
  /** As sem pasta, no alto, como era antes das pastas. */
  semPasta: Tarefa[]
  /** As pastas, da mais nova para a mais velha. */
  pastas: GrupoDePasta[]
}

const semCaixa = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim()

const VERSAO = /^v?(\d+(?:\.\d+)*)$/i
const MES = /^\d{4}-\d{2}$/

/** Versão (1.9.6, v2.0) antes de mês (2026-11) antes do resto. */
function categoria(nome: string): 0 | 1 | 2 {
  if (VERSAO.test(nome.trim())) return 0
  return MES.test(nome.trim()) ? 1 : 2
}

/** Negativo = `a` vem antes (é mais nova). Versão e mês: o maior primeiro; o resto, em ordem alfabética. */
export function compararPastas(a: string, b: string): number {
  const ca = categoria(a)
  const cb = categoria(b)
  if (ca !== cb) return ca - cb
  if (ca === 0) {
    const na = VERSAO.exec(a.trim())![1].split('.').map(Number)
    const nb = VERSAO.exec(b.trim())![1].split('.').map(Number)
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const d = (nb[i] ?? 0) - (na[i] ?? 0)
      if (d) return d
    }
    return 0
  }
  if (ca === 1) return a < b ? 1 : a > b ? -1 : 0
  return a.localeCompare(b, 'pt-BR')
}

/** Separa as tarefas (na ordem em que vêm) em sem pasta e pastas. Pastas com o mesmo nome (sem caixa nem acento) são uma só. */
export function agruparEmPastas(tarefas: readonly Tarefa[]): ColunaAgrupada {
  const semPasta: Tarefa[] = []
  const grupos = new Map<string, GrupoDePasta>()
  for (const t of tarefas) {
    const nome = t.pasta?.trim()
    if (!nome) {
      semPasta.push(t)
      continue
    }
    const chave = semCaixa(nome)
    const g = grupos.get(chave)
    if (g) g.tarefas.push(t)
    else grupos.set(chave, { nome, tarefas: [t] })
  }
  return { semPasta, pastas: [...grupos.values()].sort((a, b) => compararPastas(a.nome, b.nome)) }
}

/** Os dois nomes são a mesma pasta (sem caixa nem acento). */
export const mesmaPasta = (a: string, b: string): boolean => semCaixa(a) === semCaixa(b)

/** A pasta mais nova entre as tarefas (a "versão atual" do Feito), ou null se ninguém tem pasta. */
export function pastaAtual(tarefas: readonly Tarefa[]): string | null {
  return agruparEmPastas(tarefas).pastas[0]?.nome ?? null
}

/** As pastas em uso, sem repetir (sem caixa nem acento), da mais nova para a mais velha: as sugestões do campo Pasta. */
export function pastasEmUso(tarefas: readonly Tarefa[]): string[] {
  return agruparEmPastas(tarefas).pastas.map((p) => p.nome)
}

/** A chave de uma pasta de uma coluna no que a página guarda. */
export const chaveDaPasta = (colunaId: string, nome: string): string => `${colunaId}|${semCaixa(nome)}`

/** Recolhido (true) ou aberto (false) que o usuário deixou, por coluna e pasta. */
export type Recolhidas = Record<string, boolean>

export const chaveDoArmazenamento = (espacoId: string): string => `orkester.kanban.recolhidas.${espacoId}`

/** O texto guardado → o mapa; texto estragado ou de outro formato vira mapa vazio. */
export function lerRecolhidas(texto: string | null | undefined): Recolhidas {
  if (!texto) return {}
  try {
    const v: unknown = JSON.parse(texto)
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return {}
    const saida: Recolhidas = {}
    for (const [k, valor] of Object.entries(v)) if (typeof valor === 'boolean') saida[k] = valor
    return saida
  } catch {
    return {}
  }
}

export interface ContextoDaPasta {
  /** A coluna é a final (Feito). */
  final: boolean
  /** Esta é a pasta mais nova da coluna. */
  atual: boolean
  /** A busca do topo está ligada: toda pasta que aparece tem resultado, então abre. */
  buscando: boolean
}

/**
 * A pasta está recolhida? A busca abre tudo o que sobrou. Senão vale o que o usuário deixou; sem escolha dele, no Feito
 * só a pasta da versão atual fica aberta, e nas outras colunas tudo fica aberto.
 */
export function estaRecolhida(guardado: Recolhidas, colunaId: string, nome: string, ctx: ContextoDaPasta): boolean {
  if (ctx.buscando) return false
  const escolha = guardado[chaveDaPasta(colunaId, nome)]
  if (escolha !== undefined) return escolha
  return ctx.final && !ctx.atual
}

/** As tarefas na ordem em que a coluna as desenha: sem pasta, depois cada pasta aberta. Serve ao arrasto e à vaga. */
export function ordemNaTela(agrupada: ColunaAgrupada, recolhida: (nome: string) => boolean): Tarefa[] {
  return [...agrupada.semPasta, ...agrupada.pastas.filter((p) => !recolhida(p.nome)).flatMap((p) => p.tarefas)]
}
