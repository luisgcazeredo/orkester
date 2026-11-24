// Textos e regras puras da lista de Fluxos: a árvore de pastas (até 3 níveis), a busca, quem criou e editou, o
// resultado da última execução e os selos. Sem React e sem DOM: a `textos.prova` roda no Node.
import type { PastaDeFluxos, ResumoDeFluxo, ResultadoDaExecucao, TipoDeNo } from './contrato'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_NIVEIS_DE_PASTA, MAX_PASTAS } from '../../../../shared/fluxos/formato.ts'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_POR_HORA, MIN_MINUTOS_DA_AUTOMACAO, POR_HORA_PADRAO, porHoraDoHorario } from '../../../../shared/automacoes.ts'

export const MAX_NOME_DA_PASTA = 60

// ---------------------------------------------------------------- pastas

export interface PastaNaArvore extends PastaDeFluxos {
  /** 1 = direto na raiz. */
  nivel: number
  /** "Exemplos / Kanban". */
  caminho: string
}

const porNome = (a: PastaDeFluxos, b: PastaDeFluxos): number => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })

/** As pastas em ordem de árvore (cada pai seguido dos filhos, por nome). Pai que não existe vale como raiz. */
export function arvoreDePastas(pastas: readonly PastaDeFluxos[]): PastaNaArvore[] {
  const ids = new Set(pastas.map((p) => p.id))
  const filhas = new Map<string, PastaDeFluxos[]>()
  for (const p of pastas) {
    const pai = p.pai && ids.has(p.pai) && p.pai !== p.id ? p.pai : ''
    filhas.set(pai, [...(filhas.get(pai) ?? []), p])
  }
  const saida: PastaNaArvore[] = []
  const visitadas = new Set<string>()
  const descer = (pai: string, nivel: number, trilha: string): void => {
    for (const p of [...(filhas.get(pai) ?? [])].sort(porNome)) {
      if (visitadas.has(p.id)) continue
      visitadas.add(p.id)
      const caminho = trilha ? `${trilha} / ${p.nome}` : p.nome
      saida.push({ ...p, nivel, caminho })
      descer(p.id, nivel + 1, caminho)
    }
  }
  descer('', 1, '')
  return saida
}

export const caminhoDaPasta = (pastas: readonly PastaDeFluxos[], id: string | undefined): string =>
  (id && arvoreDePastas(pastas).find((p) => p.id === id)?.caminho) || ''

export const subpastasDe = (pastas: readonly PastaDeFluxos[], id: string): PastaDeFluxos[] => pastas.filter((p) => p.pai === id)

/** Por que não dá para criar uma pasta dentro de `pai` (`null` = raiz), ou `null` quando dá. */
export function motivoSemCriarPasta(pastas: readonly PastaDeFluxos[], pai: string | null): string | null {
  if (pastas.length >= MAX_PASTAS) return `no máximo ${MAX_PASTAS} pastas`
  if (pai === null) return null
  const nivel = arvoreDePastas(pastas).find((p) => p.id === pai)?.nivel ?? 1
  return nivel >= MAX_NIVEIS_DE_PASTA ? `as pastas vão até ${MAX_NIVEIS_DE_PASTA} níveis` : null
}

/** O que está errado no nome da pasta (a primeira coisa), ou `null`. `ignorar`: a própria pasta, ao renomear. */
export function nomeDePastaInvalido(nome: string, pastas: readonly PastaDeFluxos[], pai: string | null, ignorar?: string): string | null {
  const limpo = nome.trim()
  if (!limpo) return 'dê um nome à pasta'
  if (limpo.length > MAX_NOME_DA_PASTA) return `o nome passa de ${MAX_NOME_DA_PASTA} letras`
  const chave = limpo.toLocaleLowerCase('pt-BR')
  const repetido = pastas.some((p) => p.id !== ignorar && (p.pai ?? null) === pai && p.nome.trim().toLocaleLowerCase('pt-BR') === chave)
  return repetido ? 'já existe uma pasta com esse nome aqui' : null
}

// ---------------------------------------------------------------- vista, busca e contagem

/** O que a lista mostra: todos, só os da raiz, ou os de uma pasta. */
export type Vista = { tipo: 'todos' } | { tipo: 'raiz' } | { tipo: 'pasta'; id: string }

export const mesmaVista = (a: Vista, b: Vista): boolean => a.tipo === b.tipo && (a.tipo !== 'pasta' || a.id === (b as { id: string }).id)

const simples = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')

/** A pasta e todas as de dentro dela (o id da própria pasta vem junto). Ciclo ou pai que não existe não travam. */
export function pastaComSubpastas(pastas: readonly PastaDeFluxos[], id: string): Set<string> {
  const ids = new Set([id])
  for (const alvo of ids) for (const p of pastas) if (p.pai === alvo) ids.add(p.id)
  return ids
}

/**
 * Com busca, procura em todos os fluxos (a pasta escolhida não limita); sem ela, vale a vista. Com `pastas`, a vista de uma
 * pasta inclui os fluxos das subpastas, o mesmo que a contagem dela soma.
 */
export function fluxosDaVista(fluxos: readonly ResumoDeFluxo[], vista: Vista, busca: string, pastas: readonly PastaDeFluxos[] = []): ResumoDeFluxo[] {
  const q = simples(busca.trim())
  if (q) return fluxos.filter((f) => simples(f.nome).includes(q))
  if (vista.tipo === 'todos') return [...fluxos]
  if (vista.tipo === 'raiz') return fluxos.filter((f) => !f.pasta)
  const dentro = pastaComSubpastas(pastas, vista.id)
  return fluxos.filter((f) => f.pasta !== undefined && dentro.has(f.pasta))
}

/**
 * Quantos fluxos há em cada pasta; a chave `''` é a raiz. Com `pastas`, a pasta-mãe soma os das subpastas (a raiz só conta
 * os que não estão em pasta nenhuma). Sem `pastas`, só os que estão direto nela.
 */
export function contarPorPasta(fluxos: readonly ResumoDeFluxo[], pastas: readonly PastaDeFluxos[] = []): Map<string, number> {
  const direto = new Map<string, number>()
  for (const f of fluxos) direto.set(f.pasta ?? '', (direto.get(f.pasta ?? '') ?? 0) + 1)
  if (!pastas.length) return direto
  const m = new Map(direto)
  for (const p of pastas) {
    let soma = 0
    for (const id of pastaComSubpastas(pastas, p.id)) soma += direto.get(id) ?? 0
    if (soma) m.set(p.id, soma)
  }
  return m
}

// ---------------------------------------------------------------- linha do fluxo

const GATILHOS: Record<Extract<TipoDeNo, `gatilho.${string}`>, string> = {
  'gatilho.kanban': 'Kanban',
  'gatilho.entrega': 'Entrega',
  'gatilho.parou': 'Agente parou',
  'gatilho.relogio': 'Relógio',
  'gatilho.manual': 'Manual'
}

/** "Kanban · Relógio" (sem repetir), ou "sem gatilho". */
export function textoDosGatilhos(gatilhos: readonly TipoDeNo[]): string {
  const nomes = [...new Set(gatilhos.map((g) => GATILHOS[g as keyof typeof GATILHOS]).filter(Boolean))]
  return nomes.length ? nomes.join(' · ') : 'sem gatilho'
}

const dois = (n: number): string => String(n).padStart(2, '0')

/** "hoje 14:03", "ontem 09:00", "23/11 14:03" (no relógio local), ou "—" se a data não vale. */
export function quandoFoi(iso: string | undefined, agora: Date = new Date()): string {
  const d = new Date(iso ?? '')
  if (!Number.isFinite(d.getTime())) return '—'
  const hhmm = `${dois(d.getHours())}:${dois(d.getMinutes())}`
  const dia = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((dia(agora) - dia(d)) / 86_400_000)
  if (dias === 0) return `hoje ${hhmm}`
  if (dias === 1) return `ontem ${hhmm}`
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${hhmm}`
}

export type Tom = 'ok' | 'neutro' | 'atencao' | 'perigo'

const RESULTADOS: Record<ResultadoDaExecucao, { texto: string; tom: Tom }> = {
  ok: { texto: 'ok', tom: 'ok' },
  erro: { texto: 'erro', tom: 'perigo' },
  'barrado-laco': { texto: 'barrado: laço', tom: 'perigo' },
  'barrado-taxa': { texto: 'barrado: excesso', tom: 'perigo' },
  'sem-destino': { texto: 'sem destino', tom: 'atencao' }
}

export const textoDoResultado = (r: string): { texto: string; tom: Tom } => RESULTADOS[r as ResultadoDaExecucao] ?? { texto: r, tom: 'neutro' }

type Autor = { id?: string; nome: string } | undefined

/** O nome com que a página grava o usuário (o main usa o mesmo; repetido aqui para não importar o shared em execução). */
const USUARIO = 'Usuário'

const quem = (c: Autor): string => (!c || (!c.id && (c.nome === USUARIO || !c.nome)) ? 'você' : c.id ? `o agente ${c.nome || '?'}` : c.nome)

/**
 * "criado por você" / "criado pelo agente Construtor" / "criado por MCP · <chave>". Sem autor = um dos exemplos que o
 * Orkester põe no espaço novo (o main os grava sem `criadoPor`; todo fluxo criado depois tem um).
 */
export function textoDeQuemCriou(c: Autor): string {
  if (!c) return 'exemplo do Orkester'
  const q = quem(c)
  return q.startsWith('o agente ') ? `criado pel${q}` : `criado por ${q}`
}

/** "editado pelo agente Construtor" etc., ou `''` quando ninguém editou ou foi quem criou. */
export function textoDeQuemEditou(f: { criadoPor?: Autor; editadoPor?: Autor }): string {
  const e = f.editadoPor
  if (!e) return ''
  if (f.criadoPor && (e.id ?? '') === (f.criadoPor.id ?? '') && quem(e) === quem(f.criadoPor)) return ''
  const q = quem(e)
  return q.startsWith('o agente ') ? `editado pel${q}` : `editado por ${q}`
}

export interface Selo {
  texto: string
  tipo: 'perigo' | 'atencao' | 'neutro'
}

/** Os selos ao lado do nome: por que está desligado, se pede confirmação ao ligar, se um agente mexeu. */
export function selosDoFluxo(f: Pick<ResumoDeFluxo, 'desligadoPor' | 'sensivel' | 'criadoPor' | 'editadoPor'>): Selo[] {
  const selos: Selo[] = []
  const d = f.desligadoPor
  if (d?.motivo === 'excesso') selos.push({ texto: 'desligado por excesso de disparos', tipo: 'perigo' })
  else if (d?.motivo === 'cartao-sumiu') selos.push({ texto: 'desligado: um cartão saiu do quadro', tipo: 'atencao' })
  else if (d?.motivo === 'coluna-sumiu') selos.push({ texto: 'desligado: uma coluna saiu do kanban', tipo: 'atencao' })
  else if (d?.motivo === 'mudou-sem-aprovacao') selos.push({ texto: 'desligado: mudou sem a sua aprovação', tipo: 'atencao' })
  if (f.sensivel) selos.push({ texto: 'Código, HTTP ou comando', tipo: 'neutro' })
  if (f.criadoPor?.id) selos.push({ texto: 'criado por agente', tipo: 'atencao' })
  if (f.editadoPor?.id && textoDeQuemEditou(f)) selos.push({ texto: 'editado por agente', tipo: 'atencao' })
  return selos
}

// ---------------------------------------------------------------- gatilho Relógio

/**
 * As notas sob o campo do Relógio: o mínimo do "a cada N min" (o campo sobe sozinho para ele) e, quando o intervalo dispara
 * mais vezes por hora do que o teto padrão de um fluxo, o aviso. O main sobe o teto do fluxo ao salvar (até MAX_POR_HORA por
 * hora); o que passar do teto é barrado (a execução fica "barrado: excesso"). Diário e semanal não têm nota.
 */
export function notasDoRelogio(q: { tipo: string; minutos?: number }): { minimo: string | null; teto: string | null } {
  if (q.tipo !== 'cada') return { minimo: null, teto: null }
  const minimo = `mínimo ${MIN_MINUTOS_DA_AUTOMACAO} minutos`
  const minutos = typeof q.minutos === 'number' && Number.isFinite(q.minutos) && q.minutos > 0 ? q.minutos : MIN_MINUTOS_DA_AUTOMACAO
  const porHora = porHoraDoHorario({ tipo: 'cada', minutos })
  if (porHora <= POR_HORA_PADRAO) return { minimo, teto: null }
  return {
    minimo,
    teto: `A cada ${minutos} min são ${porHora} disparos por hora, acima do teto padrão de ${POR_HORA_PADRAO}: ao salvar, o teto deste fluxo sobe para ${porHora} (o máximo é ${MAX_POR_HORA}), e o que passar do teto é barrado.`
  }
}
