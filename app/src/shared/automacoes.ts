// Automações (1.9.6): "quando X, faça Y" por espaço, no arquivo `~/.orkester/espacos/<id>/automacoes.json`.
// Puro de propósito: o processo principal lê, grava e dispara (main/automacoes.ts); aqui fica o que vale — o formato,
// a validação do arquivo (não confiável), se uma regra combina com um evento, as travas contra laço e excesso, a frase
// que a página e o `ork automacao ver` mostram e o resumo do evento que vai junto do recado. As provas rodam no Node.
//
// Agentes e colunas são guardados pelo id (o do cartão, estável entre reaberturas; o da coluna do kanban).
import type { QuandoDaRotina } from './modelo.ts'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { descricaoDe, MAX_MINUTOS, MIN_MINUTOS, proximaDe } from './rotinas.ts'
// @ts-expect-error idem
import { limparTextoDoRecado } from './paginas.ts'
// @ts-expect-error idem
import { acharColuna, normalizar } from './kanban.ts'

export const VERSAO_DAS_AUTOMACOES = 1
export const MAX_AUTOMACOES = 40
export const MAX_NOME = 80
export const MAX_TEXTO = 2000
export const MAX_COMANDO = 500
export const MAX_TITULO = 120
export const MAX_DESCRICAO = 4000
export const MAX_CONTEM = 80
/** O texto do aviso ao usuário (uma linha, no canto da janela). */
export const MAX_AVISO = 300
/** O resumo do evento que vai junto do recado ou da tarefa. */
export const MAX_RESUMO = 1500
export const MIN_POR_HORA = 1
export const MAX_POR_HORA = 30
export const POR_HORA_PADRAO = 6
/** Somando todas as regras de um espaço, por hora (decisão 3a do Luís). */
export const POR_HORA_NO_ESPACO = 30
/** Entre dois disparos da mesma regra: o evento que chega antes disso espera a vez (até `MAX_NA_ESPERA` por regra). */
export const INTERVALO_MINIMO = 60_000
/** Eventos que esperam o intervalo de uma regra; passou disso, o evento é descartado (e contado no histórico). */
export const MAX_NA_ESPERA = 3
/**
 * "A cada N min": a regra precisa de teto por hora ≥ ⌈60/N⌉, senão o próprio relógio a desligaria por excesso. Com o
 * teto máximo (30 por hora), o menor intervalo é 2 min.
 */
export const MIN_MINUTOS_DA_AUTOMACAO = Math.ceil(60 / MAX_POR_HORA)
/** O nome de quem grava pela página (sem `id`): o usuário. */
export const NOME_DO_USUARIO = 'Usuário'
/** Profundidade máxima de uma cadeia de regras (regra que dispara regra…). */
export const MAX_ELOS = 3
/** Por quanto tempo um recado de automação marca a cadeia do agente que o recebeu. */
export const VALIDADE_DA_CADEIA = 30 * 60_000
export const LIMITE_DO_HISTORICO = 200
/** Passou disto, o histórico é reescrito só com as `LIMITE_DO_HISTORICO` mais novas. */
export const CORTE_DO_HISTORICO = 400
/** Livre por este tempo depois de trabalhar = "parou" (o mesmo `PARADO_PARA_AVISO` da caixa). */
export const PARADO_PARA_EVENTO = 20_000
/** Numa pergunta, mais cedo (o `PERGUNTA_PARA_AVISO` da caixa). */
export const PERGUNTA_PARA_EVENTO = 8000

// ---------------------------------------------------------------- formato

/** Quem criou: sem `id` = o usuário (página, nome `Usuário`) ou um cliente MCP (`MCP · <chave>`); com `id` = o cartão do agente. */
export interface CriadaPor {
  id?: string
  nome: string
}

/** Quem mexeu por último no conteúdo da regra (gatilho, ação, nome, teto), e quando. Ligar e desligar não contam. */
export interface EditadaPor extends CriadaPor {
  em: string
}

/** Quem mexe: o usuário pela página, um cliente MCP pela chave, ou um agente pelo `ork`/MCP com crachá. */
export type AutorDaMudanca = { tipo: 'usuario' } | { tipo: 'mcp'; nome: string } | { tipo: 'agente'; id: string; nome: string }

export type ComoParou = 'parou' | 'pergunta' | 'encerrou'
export const COMO_PAROU: readonly ComoParou[] = ['parou', 'pergunta', 'encerrou']

export type Gatilho =
  /** `proxima` é só mostrador: o motor conta a próxima vez em memória, a partir de quando viu a regra. */
  | { tipo: 'horario'; quando: QuandoDaRotina; proxima: string }
  /** ids de cartão; ausente = qualquer. `contem`: sem diferenciar maiúsculas. */
  | { tipo: 'entrega'; de?: string; para?: string; contem?: string }
  | { tipo: 'parou'; agente?: string; como: ComoParou[] }
  /** ids de coluna. Movimento feito por automação nunca conta. */
  | { tipo: 'kanban'; paraColuna: string; deColuna?: string; por?: 'usuario' | 'agente' | 'qualquer' }

export type Acao =
  /** `para`/`entregaPara`: id do cartão ou `maestro` (o Maestro vivo do espaço na hora). `entregaPara` padrão: Maestro. */
  | { tipo: 'recado'; para: string; texto: string; juntarEvento: boolean; entregaPara?: string }
  /** Texto fixo, sem variável nenhuma, digitado num cartão shell do espaço quando ele está livre. */
  | { tipo: 'comando'; terminal: string; comando: string }
  /** `coluna` padrão = a de papel `entrada`. */
  | { tipo: 'tarefa'; titulo: string; descricao?: string; coluna?: string; juntarEvento?: boolean }
  /** Aviso ao usuário (1.9.6, F2): uma linha no canto da janela do espaço e no histórico. Texto fixo, nada do evento. */
  | { tipo: 'avisar'; texto: string }

export interface Automacao {
  id: string
  nome: string
  ligada: boolean
  criadaEm: string
  criadaPor?: CriadaPor
  editadaPor?: EditadaPor
  quando: Gatilho
  faca: Acao
  limite: { porHora: number }
  desligadaPor?: { motivo: 'excesso' | 'cartao-sumiu'; em: string }
}

/** `entregue`: o recado que estava `na-fila` foi digitado no terminal de quem recebe (a linha do histórico é trocada). */
export type ResultadoDoDisparo = 'feito' | 'na-fila' | 'entregue' | 'ocupado' | 'sem-destino' | 'barrado-laco' | 'barrado-taxa' | 'erro' | 'teste'
/** O "Rodar agora" da página: `regra-mudou` = o comando no disco não é o que a página mostrou (nada rodou). */
export type ResultadoDoRodarAgora = ResultadoDoDisparo | 'regra-mudou'
const RESULTADOS: readonly ResultadoDoDisparo[] = ['feito', 'na-fila', 'entregue', 'ocupado', 'sem-destino', 'barrado-laco', 'barrado-taxa', 'erro', 'teste']

export interface LinhaDoHistorico {
  em: string
  regra: string
  nome: string
  /** Resumo do evento, ≤ 120. */
  gatilho: string
  acao: string
  resultado: ResultadoDoDisparo
  /** ≤ 200. */
  detalhe: string
  /** O recado da caixa que esta linha acompanha (`na-fila` → `entregue` quando ele é digitado). */
  recado?: string
}

export interface RegraInvalida {
  indice: number
  motivo: string
  nome?: string
  /** O id dela, quando dá para apagá-la pela página sem levar outra junto (id válido e só dela). */
  id?: string
}

export interface ListaDeAutomacoes {
  regras: Automacao[]
  /** Regras do arquivo que não passaram na validação: não rodam, não são apagadas sozinhas. */
  invalidas: RegraInvalida[]
  /** O arquivo é de uma versão mais nova: a página só mostra. */
  soLeitura?: string
  /** Regra de horário ligada → a próxima vez (ISO), contada pelo motor (só com o espaço aberto numa janela). */
  proximas?: Record<string, string>
}

export type ResultadoDaGravacao = { ok: true; id?: string } | { ok: false; erro: string }

// ---------------------------------------------------------------- validação

const ID = /^[A-Za-z0-9_-]{1,80}$/
const ID_DE_COLUNA = /^[a-z0-9-]{1,40}$/
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/

/** Uma linha só, sem controles nem marcadores de colagem; cortada em `max`. */
function linha(valor: unknown, max: number): string {
  return typeof valor === 'string'
    ? valor
        .replace(/\x1b\[20[01]~/g, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
        .trim()
        .slice(0, max)
    : ''
}

/** Texto de várias linhas: sem controles (menos quebra de linha e tab) nem marcadores de colagem. */
function textoLimpo(valor: unknown): string {
  return typeof valor === 'string'
    ? valor
        .replace(/\x1b\[20[01]~/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
        .trim()
    : ''
}

const idValido = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const destinoValido = (v: unknown): v is string => v === 'maestro' || idValido(v)

function quandoValido(q: unknown): QuandoDaRotina | null {
  const x = q as Partial<{ tipo: string; minutos: number; hora: number; minuto: number; dia: number }> | null
  const hora = (h: unknown, m: unknown): boolean => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 && Number.isInteger(m) && (m as number) >= 0 && (m as number) <= 59
  if (!x || typeof x !== 'object') return null
  if (x.tipo === 'cada' && Number.isFinite(x.minutos) && x.minutos! >= MIN_MINUTOS && x.minutos! <= MAX_MINUTOS) return { tipo: 'cada', minutos: Math.round(x.minutos!) }
  if (x.tipo === 'diario' && hora(x.hora, x.minuto)) return { tipo: 'diario', hora: x.hora!, minuto: x.minuto! }
  if (x.tipo === 'semanal' && Number.isInteger(x.dia) && x.dia! >= 0 && x.dia! <= 6 && hora(x.hora, x.minuto)) return { tipo: 'semanal', dia: x.dia!, hora: x.hora!, minuto: x.minuto! }
  return null
}

function gatilhoValido(g: unknown, agora: Date): Gatilho | string {
  const x = g as Record<string, unknown> | null
  if (!x || typeof x !== 'object') return 'falta o gatilho (quando)'
  switch (x.tipo) {
    case 'horario': {
      const quando = quandoValido(x.quando)
      if (!quando) return 'horário inválido (a cada N min, todo dia ou toda semana)'
      const dada = typeof x.proxima === 'string' && Number.isFinite(Date.parse(x.proxima)) ? x.proxima : null
      return { tipo: 'horario', quando, proxima: dada ?? proximaDe(quando, agora).toISOString() }
    }
    case 'entrega': {
      for (const campo of ['de', 'para'] as const) if (x[campo] !== undefined && !idValido(x[campo])) return `gatilho de entrega: "${campo}" não é um cartão`
      const contem = x.contem === undefined ? '' : linha(x.contem, MAX_CONTEM + 1)
      if (contem.length > MAX_CONTEM) return `"contém" passa de ${MAX_CONTEM} letras`
      return { tipo: 'entrega', ...(x.de ? { de: x.de as string } : {}), ...(x.para ? { para: x.para as string } : {}), ...(contem ? { contem } : {}) }
    }
    case 'parou': {
      if (x.agente !== undefined && !idValido(x.agente)) return 'gatilho de parada: "agente" não é um cartão'
      const como = Array.isArray(x.como) ? [...new Set(x.como)] : []
      if (!como.length || !como.every((c) => COMO_PAROU.includes(c as ComoParou))) return 'gatilho de parada: diga parou, pergunta e/ou encerrou'
      return { tipo: 'parou', ...(x.agente ? { agente: x.agente as string } : {}), como: como as ComoParou[] }
    }
    case 'kanban': {
      if (typeof x.paraColuna !== 'string' || !ID_DE_COLUNA.test(x.paraColuna)) return 'gatilho do kanban: falta a coluna de destino'
      if (x.deColuna !== undefined && (typeof x.deColuna !== 'string' || !ID_DE_COLUNA.test(x.deColuna))) return 'gatilho do kanban: coluna de origem inválida'
      const por = x.por === undefined ? 'qualquer' : x.por
      if (por !== 'usuario' && por !== 'agente' && por !== 'qualquer') return 'gatilho do kanban: "por" é usuario, agente ou qualquer'
      return { tipo: 'kanban', paraColuna: x.paraColuna, ...(x.deColuna ? { deColuna: x.deColuna as string } : {}), por }
    }
    default:
      return `gatilho desconhecido: "${linha(x.tipo, 30)}"`
  }
}

function acaoValida(a: unknown): Acao | string {
  const x = a as Record<string, unknown> | null
  if (!x || typeof x !== 'object') return 'falta a ação (faça)'
  switch (x.tipo) {
    case 'recado': {
      if (!destinoValido(x.para)) return 'recado: diga para quem (um agente do espaço ou o Maestro)'
      if (x.entregaPara !== undefined && !destinoValido(x.entregaPara)) return 'recado: "entregar para" não é um cartão'
      const texto = textoLimpo(x.texto)
      if (!texto) return 'recado: escreva o texto'
      if (texto.length > MAX_TEXTO) return `recado: o texto passa de ${MAX_TEXTO} letras`
      return { tipo: 'recado', para: x.para, texto, juntarEvento: x.juntarEvento === true, ...(x.entregaPara ? { entregaPara: x.entregaPara as string } : {}) }
    }
    case 'comando': {
      if (!idValido(x.terminal)) return 'comando: diga em qual cartão shell ele é digitado'
      const bruto = typeof x.comando === 'string' ? x.comando.replace(/\x1b\[20[01]~/g, '').trim() : ''
      if (!bruto) return 'comando: escreva o comando'
      if (/[\r\n]/.test(bruto)) return 'comando: uma linha só'
      const comando = bruto.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      if (comando.length > MAX_COMANDO) return `comando: passa de ${MAX_COMANDO} letras`
      return { tipo: 'comando', terminal: x.terminal, comando }
    }
    case 'tarefa': {
      const titulo = linha(x.titulo, MAX_TITULO + 1)
      if (!titulo) return 'tarefa: escreva o título'
      if (titulo.length > MAX_TITULO) return `tarefa: o título passa de ${MAX_TITULO} letras`
      const descricao = x.descricao === undefined ? '' : textoLimpo(x.descricao)
      if (descricao.length > MAX_DESCRICAO) return `tarefa: a descrição passa de ${MAX_DESCRICAO} letras`
      if (x.coluna !== undefined && (typeof x.coluna !== 'string' || !ID_DE_COLUNA.test(x.coluna))) return 'tarefa: coluna inválida'
      return {
        tipo: 'tarefa',
        titulo,
        ...(descricao ? { descricao } : {}),
        ...(x.coluna ? { coluna: x.coluna as string } : {}),
        ...(x.juntarEvento === true ? { juntarEvento: true } : {})
      }
    }
    case 'avisar': {
      const texto = linha(x.texto, MAX_AVISO + 1)
      if (!texto) return 'aviso: escreva o texto'
      if (texto.length > MAX_AVISO) return `aviso: o texto passa de ${MAX_AVISO} letras`
      return { tipo: 'avisar', texto }
    }
    default:
      return `ação desconhecida: "${linha(x.tipo, 30)}"`
  }
}

/** O teto por hora que o horário exige: ⌈60/N⌉ no "a cada N min" (o relógio dispara isso numa hora); 1 no diário e no semanal. */
export function porHoraDoHorario(q: QuandoDaRotina): number {
  return q.tipo === 'cada' ? Math.ceil(60 / q.minutos) : 1
}

/**
 * Item 2 da revisão da 1.9.6: o teto por hora não pode ser menor do que o próprio relógio da regra dispara, senão ela
 * se desliga sozinha "por excesso" sem nada de errado. Regra: no "a cada N min", N ≥ 2 e teto ≥ ⌈60/N⌉.
 */
function faltaNoTetoDoHorario(q: QuandoDaRotina, porHora: number): string | null {
  if (q.tipo !== 'cada') return null
  if (q.minutos < MIN_MINUTOS_DA_AUTOMACAO) return `horário: a cada ${q.minutos} min é rápido demais; numa automação o mínimo é a cada ${MIN_MINUTOS_DA_AUTOMACAO} min`
  const precisa = porHoraDoHorario(q)
  if (precisa > porHora) return `a cada ${q.minutos} min dá ${precisa} disparos por hora: suba o teto desta regra para ${precisa} (vai até ${MAX_POR_HORA}) ou aumente o intervalo`
  return null
}

/**
 * Serve para guardar e rodar? Devolve a regra normalizada (campos a mais caem, textos limpos de controles) ou o motivo.
 * O que vem do arquivo, da página, do `ork` e do MCP passa por aqui.
 */
export function regraValida(bruto: unknown, agora = new Date()): { ok: true; regra: Automacao } | { ok: false; motivo: string } {
  const x = bruto as Record<string, unknown> | null
  const nao = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo })
  if (!x || typeof x !== 'object' || Array.isArray(x)) return nao('não é uma regra')
  if (!idValido(x.id)) return nao('sem id')
  if (typeof x.nome !== 'string' || CONTROLE.test(x.nome) || !x.nome.trim()) return nao('dê um nome à regra (uma linha)')
  const nome = x.nome.trim()
  if (nome.length > MAX_NOME) return nao(`o nome passa de ${MAX_NOME} letras`)
  if (typeof x.ligada !== 'boolean') return nao('"ligada" não é sim/não')
  if (typeof x.criadaEm !== 'string' || !Number.isFinite(Date.parse(x.criadaEm))) return nao('data de criação inválida')
  let criadaPor: CriadaPor | undefined
  if (x.criadaPor !== undefined) {
    const c = x.criadaPor as Partial<CriadaPor> | null
    const nomeDeQuem = linha(c?.nome, MAX_NOME)
    if (!c || typeof c !== 'object' || !nomeDeQuem || (c.id !== undefined && !idValido(c.id))) return nao('"criada por" inválido')
    criadaPor = c.id ? { id: c.id, nome: nomeDeQuem } : { nome: nomeDeQuem }
  }
  let editadaPor: EditadaPor | undefined
  if (x.editadaPor !== undefined) {
    const c = x.editadaPor as Partial<EditadaPor> | null
    const nomeDeQuem = linha(c?.nome, MAX_NOME)
    if (!c || typeof c !== 'object' || !nomeDeQuem || (c.id !== undefined && !idValido(c.id)) || typeof c.em !== 'string' || !Number.isFinite(Date.parse(c.em))) {
      return nao('"editada por" inválido')
    }
    editadaPor = c.id ? { id: c.id, nome: nomeDeQuem, em: c.em } : { nome: nomeDeQuem, em: c.em }
  }
  const quando = gatilhoValido(x.quando, agora)
  if (typeof quando === 'string') return nao(quando)
  let faca = acaoValida(x.faca)
  if (typeof faca === 'string') return nao(faca)
  // F8: no relógio não há evento a resumir ("Disparada pelo horário." não diz nada): o resumo cai
  if (quando.tipo === 'horario' && faca.tipo === 'recado' && faca.juntarEvento) faca = { ...faca, juntarEvento: false }
  if (quando.tipo === 'horario' && faca.tipo === 'tarefa' && faca.juntarEvento) {
    const { juntarEvento: _, ...semResumo } = faca
    faca = semResumo
  }
  const porHora = (x.limite as { porHora?: unknown } | undefined)?.porHora
  if (!Number.isInteger(porHora) || (porHora as number) < MIN_POR_HORA || (porHora as number) > MAX_POR_HORA) return nao(`limite por hora: de ${MIN_POR_HORA} a ${MAX_POR_HORA}`)
  if (quando.tipo === 'horario') {
    const falta = faltaNoTetoDoHorario(quando.quando, porHora as number)
    if (falta) return nao(falta)
  }
  let desligadaPor: Automacao['desligadaPor']
  if (x.desligadaPor !== undefined) {
    const d = x.desligadaPor as Partial<NonNullable<Automacao['desligadaPor']>> | null
    if (!d || (d.motivo !== 'excesso' && d.motivo !== 'cartao-sumiu') || typeof d.em !== 'string' || !Number.isFinite(Date.parse(d.em))) return nao('"desligada por" inválido')
    desligadaPor = { motivo: d.motivo, em: d.em }
  }
  return {
    ok: true,
    regra: {
      id: x.id,
      nome,
      ligada: x.ligada,
      criadaEm: x.criadaEm,
      ...(criadaPor ? { criadaPor } : {}),
      ...(editadaPor ? { editadaPor } : {}),
      quando,
      faca,
      limite: { porHora: porHora as number },
      ...(desligadaPor ? { desligadaPor } : {})
    }
  }
}

/**
 * A regra que vai ser gravada: o que a página, o `ork` ou o MCP mandou, com id, data, autor e "editada por" postos
 * aqui (nunca confiados de quem pede). Existindo uma regra com o mesmo id, ela mantém data e autor e ganha
 * `editadaPor` = quem grava agora; ligar de novo tira o "desligada por". Sem teto mandado, o teto sobe sozinho até o
 * que o "a cada N min" exige (`porHoraDoHorario`); mandado, vale o que veio e a validação explica se não der.
 */
export function montarRegra(
  entrada: unknown,
  ctx: { existente?: Automacao; autor: CriadaPor; agora: Date; novoId: () => string }
): { ok: true; regra: Automacao } | { ok: false; motivo: string } {
  const x = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>
  const { existente } = ctx
  let limite: unknown = (x.limite as { porHora?: unknown } | undefined) ?? existente?.limite ?? { porHora: POR_HORA_PADRAO }
  const qx = x.quando as { tipo?: unknown; quando?: unknown } | undefined
  const doRelogio = x.limite === undefined && qx?.tipo === 'horario' ? quandoValido(qx.quando) : null
  if (doRelogio) {
    const atual = (limite as { porHora?: unknown }).porHora
    const precisa = porHoraDoHorario(doRelogio)
    if (Number.isInteger(atual) && precisa <= MAX_POR_HORA && precisa > (atual as number)) limite = { porHora: precisa }
  }
  const ligada = typeof x.ligada === 'boolean' ? x.ligada : (existente?.ligada ?? false)
  const montada: Record<string, unknown> = {
    ...x,
    id: existente?.id ?? ctx.novoId(),
    criadaEm: existente?.criadaEm ?? ctx.agora.toISOString(),
    criadaPor: existente ? (existente.criadaPor ?? ctx.autor) : ctx.autor,
    editadaPor: existente ? { ...ctx.autor, em: ctx.agora.toISOString() } : undefined,
    ligada,
    limite,
    // ligada, o selo some; desligada, ele fica (é o motivo de ela estar desligada)
    desligadaPor: ligada ? undefined : (x.desligadaPor ?? existente?.desligadaPor)
  }
  if (montada.desligadaPor === undefined) delete montada.desligadaPor
  if (montada.editadaPor === undefined) delete montada.editadaPor
  // horário editado: a próxima vez é contada de agora (o motor recalcula mesmo assim)
  const q = montada.quando as { tipo?: string; proxima?: unknown } | undefined
  if (q?.tipo === 'horario') montada.quando = { ...q, proxima: undefined }
  return regraValida(montada, ctx.agora)
}

/**
 * O arquivo lido como não confiável. JSON ilegível: lista vazia e `ruim` (nada é sobrescrito antes da próxima
 * gravação, que guarda uma cópia `.ruim`). Regra inválida não roda e vai em `invalidas` com o motivo — e continua em
 * `brutas`, para a gravação seguinte não a apagar sozinha. Acima de 40, o resto é inválido.
 */
export function lerArquivoDeAutomacoes(json: unknown, agora = new Date()): ListaDeAutomacoes & { brutas: unknown[]; ruim?: true } {
  if (json === null || json === undefined) return { regras: [], invalidas: [], brutas: [] }
  const x = json as { versao?: unknown; regras?: unknown }
  if (typeof x !== 'object' || Array.isArray(x) || !Array.isArray(x.regras)) return { regras: [], invalidas: [], brutas: [], ruim: true }
  const brutas = x.regras as unknown[]
  if (typeof x.versao === 'number' && x.versao > VERSAO_DAS_AUTOMACOES) {
    return { regras: [], invalidas: [], brutas, soLeitura: 'as automações são de uma versão mais nova do Orkester: atualize para mexer nelas' }
  }
  const regras: Automacao[] = []
  const invalidas: RegraInvalida[] = []
  const ids = new Set<string>()
  brutas.forEach((b, indice) => {
    const nome = linha((b as { nome?: unknown } | null)?.nome, MAX_NOME) || undefined
    const r = indice >= MAX_AUTOMACOES ? ({ ok: false, motivo: `passa do teto de ${MAX_AUTOMACOES} regras por espaço` } as const) : regraValida(b, agora)
    if (!r.ok) return void invalidas.push({ indice, motivo: r.motivo, ...(nome ? { nome } : {}) })
    if (ids.has(r.regra.id)) return void invalidas.push({ indice, motivo: 'id repetido', ...(nome ? { nome } : {}) })
    ids.add(r.regra.id)
    regras.push(r.regra)
  })
  // a inválida com id só dela pode ser apagada pela página (apagar leva tudo o que tem o id: nunca uma válida junto)
  const contagem = new Map<string, number>()
  for (const b of brutas) {
    const id = (b as { id?: unknown } | null)?.id
    if (idValido(id)) contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }
  for (const i of invalidas) {
    const id = (brutas[i.indice] as { id?: unknown } | null)?.id
    if (idValido(id) && contagem.get(id) === 1) i.id = id
  }
  return { regras, invalidas, brutas }
}

/** O que vai para o disco: as brutas (inválidas mantidas) com a mudança aplicada. */
export function arquivoParaGravar(brutas: unknown[]): { versao: 1; regras: unknown[] } {
  return { versao: VERSAO_DAS_AUTOMACOES, regras: brutas }
}

/** Troca (ou acrescenta) a regra de mesmo id nas brutas; `null` apaga. */
export function trocarNasBrutas(brutas: readonly unknown[], id: string, nova: Automacao | null): unknown[] {
  const igual = (b: unknown): boolean => (b as { id?: unknown } | null)?.id === id
  if (!nova) return brutas.filter((b) => !igual(b))
  return brutas.some(igual) ? brutas.map((b) => (igual(b) ? nova : b)) : [...brutas, nova]
}

// ---------------------------------------------------------------- eventos

export type EventoDeAutomacao =
  | { tipo: 'horario'; regra: string }
  | { tipo: 'entrega'; de: string | null; deNome: string; para: string; paraNome: string; texto: string }
  | { tipo: 'parou'; agente: string; agenteNome: string; como: ComoParou }
  /** `agente`: o cartão que moveu, quando foi um agente (herda a cadeia do último recado de automação dele). */
  | { tipo: 'kanban'; numero: number; titulo: string; deColuna: string; paraColuna: string; por: 'usuario' | 'agente' | 'automacao'; quem: string; agente?: string }
  /** "Rodar agora": só a ação, sem gatilho. */
  | { tipo: 'teste' }

/** O evento e a cadeia de regras que levou a ele (ids). */
export type EventoComCadeia = EventoDeAutomacao & { cadeia: string[] }

const minusculo = (t: string): string => t.normalize('NFKC').toLocaleLowerCase('pt-BR')

/** A regra (ligada ou não) se aplica a este evento? Só o gatilho e os filtros; laço e taxa são `podeDisparar`. */
export function combina(regra: Pick<Automacao, 'id' | 'quando'>, e: EventoDeAutomacao): boolean {
  const q = regra.quando
  switch (e.tipo) {
    case 'horario':
      return q.tipo === 'horario' && e.regra === regra.id
    case 'entrega':
      return q.tipo === 'entrega' && (!q.de || q.de === e.de) && (!q.para || q.para === e.para) && (!q.contem || minusculo(e.texto).includes(minusculo(q.contem)))
    case 'parou':
      return q.tipo === 'parou' && (!q.agente || q.agente === e.agente) && q.como.includes(e.como)
    case 'kanban': {
      if (q.tipo !== 'kanban' || e.por === 'automacao') return false
      const por = q.por ?? 'qualquer'
      return e.paraColuna === q.paraColuna && (!q.deColuna || q.deColuna === e.deColuna) && (por === 'qualquer' || por === e.por)
    }
    default:
      return false
  }
}

export type Barrado = { resultado: 'barrado-laco' | 'barrado-taxa'; detalhe: string; desligar: boolean }
/** Ainda não é a vez desta regra: o evento espera `ms` (o motor guarda até `MAX_NA_ESPERA` por regra). */
export type Esperar = { resultado: 'esperar'; ms: number }

/**
 * As redes contra laço e excesso, na ordem:
 *  1. a cadeia já passou por esta regra ou tem `MAX_ELOS` elos → laço (barrado, nunca espera);
 *  2. menos de 1 min desde o último disparo desta regra → **espera** a vez (não é descartado);
 *  3. o teto por hora da regra → desliga a regra, com aviso (é ela que está disparando demais);
 *  4. o teto do espaço → só pula, sem desligar (a regra que tentou agora pode ser inocente: o excesso é da soma).
 * `disparos` são os instantes dos disparos que contaram, na janela de 60 min.
 */
export function podeDisparar(
  regra: Pick<Automacao, 'id' | 'limite'>,
  cadeia: readonly string[],
  disparos: { daRegra: readonly number[]; doEspaco: readonly number[] },
  agora: number
): Barrado | Esperar | null {
  if (cadeia.includes(regra.id)) return { resultado: 'barrado-laco', detalhe: 'laço: a cadeia de automações já passou por esta regra', desligar: false }
  if (cadeia.length >= MAX_ELOS) return { resultado: 'barrado-laco', detalhe: `laço: cadeia com ${cadeia.length} automações seguidas (máximo ${MAX_ELOS})`, desligar: false }
  const naHora = (lista: readonly number[]): number[] => lista.filter((t) => agora - t < 3_600_000)
  const daRegra = naHora(disparos.daRegra)
  const ultimo = Math.max(-Infinity, ...daRegra)
  if (agora - ultimo < INTERVALO_MINIMO) return { resultado: 'esperar', ms: INTERVALO_MINIMO - (agora - ultimo) }
  if (daRegra.length >= regra.limite.porHora) {
    return { resultado: 'barrado-taxa', detalhe: `passou de ${regra.limite.porHora} disparos na última hora: a regra foi desligada`, desligar: true }
  }
  if (naHora(disparos.doEspaco).length >= POR_HORA_NO_ESPACO) {
    return { resultado: 'barrado-taxa', detalhe: `o espaço passou de ${POR_HORA_NO_ESPACO} disparos na última hora: pulou (a regra continua ligada)`, desligar: false }
  }
  return null
}

/** Nomes para as frases: id do cartão → nome, id da coluna → nome. O que falta aparece como "(cartão que sumiu)". */
export interface NomesDaFrase {
  agentes?: Readonly<Record<string, string>>
  colunas?: Readonly<Record<string, string>>
}

const COMO_EM_TEXTO: Record<ComoParou, string> = { parou: 'parar', pergunta: 'parar numa pergunta', encerrou: 'encerrar' }

/** "Quando "Construtor" entregar algo que contém "pronto", mande recado a "Testador": "…"". */
export function fraseDe(regra: Pick<Automacao, 'quando' | 'faca'>, nomes: NomesDaFrase = {}): string {
  const agente = (id: string): string => `"${nomes.agentes?.[id] ?? '(cartão que sumiu)'}"`
  const coluna = (id: string): string => `"${nomes.colunas?.[id] ?? id}"`
  const destino = (d: string): string => (d === 'maestro' ? 'ao Maestro' : `a ${agente(d)}`)
  const curto = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t).replace(/\s+/g, ' ')
  const q = regra.quando
  let quando: string
  switch (q.tipo) {
    case 'horario': {
      const d = descricaoDe(q.quando)
      quando = d.charAt(0).toUpperCase() + d.slice(1)
      break
    }
    case 'entrega':
      quando = `Quando ${q.de ? agente(q.de) : 'qualquer agente'} entregar algo${q.para ? ` a ${agente(q.para)}` : ''}${q.contem ? ` que contém "${q.contem}"` : ''}`
      break
    case 'parou':
      quando = `Quando ${q.agente ? agente(q.agente) : 'qualquer agente'} ${q.como.map((c) => COMO_EM_TEXTO[c]).join(' ou ')}`
      break
    case 'kanban': {
      const por = q.por === 'usuario' ? ' pelo usuário' : q.por === 'agente' ? ' por um agente' : ''
      quando = `Quando uma tarefa entrar em ${coluna(q.paraColuna)}${q.deColuna ? ` vinda de ${coluna(q.deColuna)}` : ''}${por}`
      break
    }
  }
  const a = regra.faca
  const faca =
    a.tipo === 'recado'
      ? `mande recado ${destino(a.para)}: "${curto(a.texto, 60)}"`
      : a.tipo === 'comando'
        ? `digite \`${curto(a.comando, 60)}\` no shell ${agente(a.terminal)} quando ele estiver livre`
        : a.tipo === 'avisar'
          ? `avise o usuário no canto da janela: "${curto(a.texto, 60)}"`
          : `crie a tarefa "${curto(a.titulo, 60)}"${a.coluna ? ` em ${coluna(a.coluna)}` : ''}`
  return `${quando}, ${faca}.`
}

/**
 * O resumo do evento que vai junto do recado ou da tarefa (≤ `MAX_RESUMO`). **Sempre** por `limparTextoDoRecado`: cada
 * linha ganha `| `, e o texto de outro agente (o começo da entrega, o título da tarefa) nunca vira cabeçalho nem
 * instrução solta.
 */
export function resumoDoEvento(e: EventoDeAutomacao, nomes: NomesDaFrase = {}): string {
  const coluna = (id: string): string => nomes.colunas?.[id] ?? id
  let bruto: string
  switch (e.tipo) {
    case 'horario':
      bruto = 'Disparada pelo horário.'
      break
    case 'entrega':
      bruto = `Entrega de "${e.deNome}" para "${e.paraNome}":\n${e.texto}`
      break
    case 'parou':
      bruto = `"${e.agenteNome}" ${e.como === 'parou' ? 'parou' : e.como === 'pergunta' ? 'parou numa pergunta' : 'encerrou'}.`
      break
    case 'kanban':
      bruto = `A tarefa #${e.numero} "${e.titulo}" foi de "${coluna(e.deColuna)}" para "${coluna(e.paraColuna)}" (por ${e.quem}).`
      break
    default:
      bruto = 'Teste (Rodar agora): nenhum evento de verdade.'
  }
  return limparTextoDoRecado(bruto.slice(0, MAX_RESUMO - 200)).slice(0, MAX_RESUMO)
}

/** Uma linha (≤ 120) para o histórico. Nada de texto de entrega inteiro. Colunas pelo nome (F11), quando há `nomes`. */
export function gatilhoNoHistorico(e: EventoDeAutomacao, nomes: NomesDaFrase = {}): string {
  const coluna = (id: string): string => nomes.colunas?.[id] ?? id
  const t =
    e.tipo === 'horario'
      ? 'horário'
      : e.tipo === 'entrega'
        ? `entrega de "${e.deNome}" para "${e.paraNome}"`
        : e.tipo === 'parou'
          ? `"${e.agenteNome}" ${e.como}`
          : e.tipo === 'kanban'
            ? `#${e.numero} ${coluna(e.deColuna)} → ${coluna(e.paraColuna)} (${e.por === 'usuario' ? 'usuário' : e.quem})`
            : 'teste (Rodar agora)'
  return linha(t, 120)
}

// ---------------------------------------------------------------- observador de parada

export type SituacaoDoAgente = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'

/** O que o observador lembra de um cartão. */
export interface VistaDeParada {
  /** Foi visto trabalhando desde o último evento. */
  trabalhou: boolean
  paradoDesde: number
  /** Foi visto com processo (para "encerrou" só valer para quem estava vivo). */
  vivo: boolean
}

/**
 * Um passo do observador de um cartão. **Um evento por parada**: depois dele, só rearma vendo o agente trabalhar de
 * novo (a lógica de `decidirPendencia` da caixa). Livre por 20 s = `parou`; numa pergunta por 8 s = `pergunta`;
 * processo saiu (estava vivo) = `encerrou`. `situacao` null = o cartão não existe mais.
 */
export function observarParada(v: VistaDeParada | undefined, situacao: SituacaoDoAgente | null, agora: number): { vista: VistaDeParada; evento?: ComoParou } {
  const antes: VistaDeParada = v ?? { trabalhou: false, paradoDesde: 0, vivo: false }
  if (situacao === null || situacao === 'encerrado') {
    const vista = { trabalhou: false, paradoDesde: 0, vivo: false }
    return antes.vivo ? { vista, evento: 'encerrou' } : { vista }
  }
  if (situacao === 'trabalhando') return { vista: { trabalhou: true, paradoDesde: 0, vivo: true } }
  if (!antes.trabalhou) return { vista: { ...antes, paradoDesde: 0, vivo: true } }
  const paradoDesde = antes.paradoDesde || agora
  const limite = situacao === 'pergunta' ? PERGUNTA_PARA_EVENTO : PARADO_PARA_EVENTO
  if (agora - paradoDesde >= limite) return { vista: { trabalhou: false, paradoDesde: 0, vivo: true }, evento: situacao === 'pergunta' ? 'pergunta' : 'parou' }
  return { vista: { trabalhou: true, paradoDesde, vivo: true } }
}

// ---------------------------------------------------------------- histórico

/** As linhas do `.jsonl`, da mais nova para a mais antiga; linha ruim é descartada. */
export function lerHistorico(texto: string, limite = LIMITE_DO_HISTORICO): LinhaDoHistorico[] {
  const saida: LinhaDoHistorico[] = []
  const linhas = texto.split('\n')
  for (let i = linhas.length - 1; i >= 0 && saida.length < limite; i--) {
    if (!linhas[i].trim()) continue
    try {
      const x = JSON.parse(linhas[i]) as Partial<LinhaDoHistorico>
      if (typeof x.em !== 'string' || typeof x.regra !== 'string' || !RESULTADOS.includes(x.resultado as ResultadoDoDisparo)) continue
      saida.push({
        em: x.em,
        regra: x.regra,
        nome: linha(x.nome, MAX_NOME),
        gatilho: linha(x.gatilho, 120),
        acao: linha(x.acao, 40),
        resultado: x.resultado as ResultadoDoDisparo,
        detalhe: linha(x.detalhe, 200),
        ...(idValido(x.recado) ? { recado: x.recado } : {})
      })
    } catch {
      // linha ruim: fica de fora
    }
  }
  return saida
}

/** Passou de `CORTE_DO_HISTORICO` linhas: o texto novo, só com as `LIMITE_DO_HISTORICO` mais novas. null = não cortar. */
export function cortarHistorico(texto: string): string | null {
  const linhas = texto.split('\n').filter((l) => l.trim())
  if (linhas.length <= CORTE_DO_HISTORICO) return null
  return `${linhas.slice(-LIMITE_DO_HISTORICO).join('\n')}\n`
}

/** Uma linha nova, com os limites de tamanho. */
export function linhaDoHistorico(x: Omit<LinhaDoHistorico, 'em'>, em: Date): LinhaDoHistorico {
  return {
    em: em.toISOString(),
    regra: x.regra,
    nome: linha(x.nome, MAX_NOME),
    gatilho: linha(x.gatilho, 120),
    acao: linha(x.acao, 40),
    resultado: x.resultado,
    detalhe: linha(x.detalhe, 200),
    ...(idValido(x.recado) ? { recado: x.recado } : {})
  }
}

/**
 * F4: o recado `recado` chegou (ou não) ao terminal: a linha mais nova que o acompanha troca resultado e detalhe, e
 * deixa de acompanhá-lo (não muda de novo). `null` = não achou (o histórico foi cortado no meio).
 */
export function trocarNoHistorico(texto: string, recado: string, mudanca: { resultado: ResultadoDoDisparo; detalhe: string }): string | null {
  const linhas = texto.split('\n')
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (!linhas[i].includes(recado)) continue
    try {
      const x = JSON.parse(linhas[i]) as Partial<LinhaDoHistorico>
      if (x.recado !== recado) continue
      const { recado: _, ...resto } = x
      linhas[i] = JSON.stringify({ ...resto, resultado: mudanca.resultado, detalhe: linha(mudanca.detalhe, 200) })
      return linhas.join('\n')
    } catch {
      // linha ruim: segue procurando
    }
  }
  return null
}

/** Como um recado da caixa acabou (o `FimDoRecado` de main/caixa.ts). */
export type FimDoRecadoNaCaixa = 'entregue' | 'incerto' | 'ficou' | 'sem-destino' | 'cancelado'

/** O fim do recado na caixa vira o resultado da linha do histórico que estava `na-fila`. */
export function resultadoDoFimDoRecado(fim: FimDoRecadoNaCaixa, nome: string): { resultado: ResultadoDoDisparo; detalhe: string } {
  const quem = `"${nomeNoCabecalho(nome)}"`
  switch (fim) {
    case 'entregue':
      return { resultado: 'entregue', detalhe: `digitado no terminal de ${quem}` }
    case 'incerto':
      return { resultado: 'entregue', detalhe: `digitado no terminal de ${quem} (sem confirmação de que entrou)` }
    case 'ficou':
      return { resultado: 'erro', detalhe: `digitado, mas ficou parado na linha de ${quem} sem enviar` }
    case 'sem-destino':
      return { resultado: 'sem-destino', detalhe: `${quem} saiu antes de o recado ser digitado` }
    default:
      return { resultado: 'sem-destino', detalhe: 'o recado saiu da fila antes de ser digitado' }
  }
}

/**
 * F9: o teto do espaço é a soma das regras (30 disparos por hora). Uma regra de relógio gasta certo ⌈60/N⌉ por hora;
 * se ela sozinha, ou com as outras de relógio ligadas, chega ao teto, as demais regras pulam. O aviso do editor, ou
 * `null`. `outras`: as regras do espaço (esta, se estiver, é ignorada).
 */
export function avisoDoTetoDoEspaco(
  regra: Pick<Automacao, 'id' | 'quando' | 'limite'>,
  outras: readonly Pick<Automacao, 'id' | 'quando' | 'ligada'>[]
): string | null {
  const doRelogio = (q: Gatilho): number => (q.tipo === 'horario' ? porHoraDoHorario(q.quando) : 0)
  const esta = doRelogio(regra.quando)
  const dasOutras = outras.filter((o) => o.id !== regra.id && o.ligada).reduce((n, o) => n + doRelogio(o.quando), 0)
  if (esta >= POR_HORA_NO_ESPACO) {
    return `esta regra sozinha gasta os ${POR_HORA_NO_ESPACO} disparos por hora do espaço, e as outras regras dele vão pular. Use um intervalo maior (a cada 4 min ou mais deixa metade livre)`
  }
  if (esta && esta + dasOutras >= POR_HORA_NO_ESPACO) {
    return `com as outras regras de horário ligadas, o relógio gasta ${esta + dasOutras} dos ${POR_HORA_NO_ESPACO} disparos por hora do espaço, e as demais regras vão pular. Aumente o intervalo`
  }
  if (!esta && regra.limite.porHora >= POR_HORA_NO_ESPACO) {
    return `um teto de ${regra.limite.porHora} por hora é todo o teto do espaço (${POR_HORA_NO_ESPACO}): se esta regra disparar tanto, as outras pulam`
  }
  return null
}

// ---------------------------------------------------------------- quem pode mexer

/**
 * A página só grava no espaço da própria janela, ou num espaço que nenhuma janela tem aberto (o motor dele está
 * parado; é o que a página Rotinas também faz). Espaço aberto em OUTRA janela: recusado.
 */
export function podeMexerNoEspaco(dono: number | undefined, remetente: number): boolean {
  return dono === undefined || dono === remetente
}

/** Como o autor fica gravado na regra (`criadaPor`/`editadaPor`). */
export function criadaPorDe(a: AutorDaMudanca): CriadaPor {
  return a.tipo === 'agente' ? { id: a.id, nome: linha(a.nome, MAX_NOME) || '?' } : a.tipo === 'mcp' ? { nome: linha(a.nome, MAX_NOME) || 'MCP' } : { nome: NOME_DO_USUARIO }
}

/** Foi este autor que criou a regra? O usuário pode tudo; agente pelo cartão; cliente MCP pela chave. */
export function ehDoAutor(c: CriadaPor | undefined, a: AutorDaMudanca): boolean {
  if (a.tipo === 'usuario') return true
  if (!c) return false
  return a.tipo === 'agente' ? c.id === a.id : !c.id && c.nome === criadaPorDe(a).nome
}

const mudouOComando = (antes: Acao, depois: Acao): boolean =>
  antes.tipo !== 'comando' || depois.tipo !== 'comando' ? antes.tipo !== depois.tipo : antes.comando !== depois.comando || antes.terminal !== depois.terminal

/**
 * Item 1 da revisão da 1.9.6 (grave): o que um agente ou cliente MCP **não** grava numa regra de rodar comando. O
 * usuário, pela página, pode tudo (e a página confirma toda ligação mostrando o comando inteiro).
 *  - criar ou editar: regra de comando (antes ou depois da mudança) só a que ele mesmo criou; de uma **ligada**, não
 *    troca o comando nem o shell (nem vira comando); e o que ele grava numa regra de comando fica desligado (quem
 *    chama aplica: `ligada = false`);
 *  - ligar: nunca; desligar e apagar: só a que ele criou.
 * `null` = pode.
 */
export function recusaDoComando(
  autor: AutorDaMudanca,
  acao: 'gravar' | 'ligar' | 'desligar' | 'apagar',
  existente: Pick<Automacao, 'faca' | 'ligada' | 'criadaPor'> | undefined,
  nova?: Pick<Automacao, 'faca'>
): string | null {
  if (autor.tipo === 'usuario') return null
  const comando = existente?.faca.tipo === 'comando' || nova?.faca.tipo === 'comando'
  if (!comando) return null
  if (acao === 'ligar') return 'regra de rodar comando só o usuário liga, na página Automações (é digitada num terminal); nada mudou'
  if (existente && !ehDoAutor(existente.criadaPor, autor)) {
    return `regra de rodar comando: um agente só ${acao === 'gravar' ? 'edita' : acao === 'desligar' ? 'desliga' : 'apaga'} a que ele mesmo criou; nada mudou`
  }
  if (acao === 'gravar' && existente?.ligada && nova && mudouOComando(existente.faca, nova.faca)) {
    return 'esta regra está ligada: um agente não troca o comando nem o shell dela (desligue antes; depois só o usuário religa, vendo o comando); nada mudou'
  }
  return null
}

/**
 * Item 4 da revisão (decisão do Maestro): a regra de recado que um agente cria ou edita só fala com quem o `ork` dele
 * alcança — os cartões ligados a ele por corda (e os que ele abriu), ou ele mesmo. `maestro` vira o id do Maestro de
 * agora (e precisa estar ao alcance); sem `entregaPara`, a entrega volta para o próprio agente, como no `ork pedir`.
 * Outras ações passam como vieram. Devolve a ação com ids, ou o motivo da recusa.
 */
export function prenderAoAlcance(
  faca: Acao,
  ctx: { agente: string; alcance: ReadonlySet<string>; maestro?: string; nome: (id: string) => string }
): Acao | string {
  if (faca.tipo !== 'recado') return faca
  const resolver = (d: string, oQue: string): string | { erro: string } => {
    const id = d === 'maestro' ? ctx.maestro : d
    if (!id) return { erro: `${oQue}: não há Maestro aberto neste espaço` }
    if (id !== ctx.agente && !ctx.alcance.has(id)) {
      return { erro: `${oQue}: "${ctx.nome(id)}" não está ligado a você por corda. Automação criada por agente só manda recado a quem o seu \`ork\` alcança (veja \`ork quem\`); nada mudou` }
    }
    return id
  }
  const para = resolver(faca.para, 'para quem vai o recado')
  if (typeof para !== 'string') return para.erro
  const entregaPara = resolver(faca.entregaPara ?? ctx.agente, 'para quem vai a entrega')
  if (typeof entregaPara !== 'string') return entregaPara.erro
  return { ...faca, para, entregaPara }
}

/** Os cartões que o gatilho nomeia (quem entrega, quem recebe, quem para). */
function cartoesDoGatilho(q: Gatilho): string[] {
  if (q.tipo === 'entrega') return [q.de, q.para].filter((x): x is string => !!x)
  if (q.tipo === 'parou') return q.agente ? [q.agente] : []
  return []
}

/** Os cartões cujo conteúdo o evento leva (o texto de uma entrega é de quem entregou e de quem recebeu). */
function cartoesDoEvento(e: EventoDeAutomacao): string[] {
  if (e.tipo === 'entrega') return [e.de, e.para].filter((x): x is string => !!x)
  if (e.tipo === 'parou') return [e.agente]
  return []
}

/**
 * Item 3 da reconferência da 1.9.6: a regra que um agente cria ou edita só **vigia** quem o `ork` dele alcança. O
 * gatilho de entrega (`de`/`para`) e o de parada (`agente`) que nomeiam um cartão fora de `alcance ∪ {agente}` são
 * recusados. "Qualquer" passa: no disparo, só valem os eventos entre cartões ao alcance (`conferirAlcanceNoDisparo`).
 * Horário e kanban (do próprio espaço) passam. `null` = pode.
 */
export function gatilhoNoAlcance(quando: Gatilho, ctx: { agente: string; alcance: ReadonlySet<string>; nome: (id: string) => string }): string | null {
  for (const id of cartoesDoGatilho(quando)) {
    if (id !== ctx.agente && !ctx.alcance.has(id)) {
      return `quando: "${ctx.nome(id)}" não está ligado a você por corda. Automação criada por agente só vigia quem o seu \`ork\` alcança (veja \`ork quem\`); nada mudou`
    }
  }
  return null
}

/** O agente que responde pelo conteúdo da regra: quem a editou por último, senão quem a criou. Usuário ou MCP: nenhum. */
export function agenteDaRegra(r: Pick<Automacao, 'criadaPor' | 'editadaPor'>): string | undefined {
  return r.editadaPor ? r.editadaPor.id : r.criadaPor?.id
}

/**
 * `null` = dispara; `ignorar` = a regra não vê este evento (sem linha); `pular` = não dispara, com a linha no histórico;
 * `desligar` junto = a regra se desliga ("cartão sumiu": o agente dela saiu do quadro).
 */
export type VereditoDoAlcance = null | 'ignorar' | { pular: string; desligar?: true }

/**
 * Itens 2 e 3 da reconferência (decisão do Maestro): o alcance da regra de agente é conferido também **na hora do
 * disparo**, porque a corda pode ter saído e o cartão pode ter fechado depois de gravada. Vale para a regra cujo último
 * autor de conteúdo é um agente (`agenteDaRegra`); o usuário a "adota" editando-a pela página.
 * Só vale para o que leva algo do evento ou fala em nome do agente: **recado**, e **tarefa com `juntarEvento`**. Comando
 * (texto fixo, que o usuário viu ao ligar) e tarefa sem `juntarEvento` passam sempre (decisão do Maestro, revisão C).
 *  - recado cujo agente saiu do quadro (o cartão foi fechado) → desliga, como o "cartão sumiu";
 *  - agente sem sessão (o cartão existe, sem processo aberto) → pula; a regra continua ligada;
 *  - o gatilho nomeia um cartão fora de `alcance ∪ {agente}` → pula;
 *  - o evento é de um cartão fora do alcance (gatilho "qualquer") → a regra não o vê: nada vaza no recado nem na tarefa;
 *  - o destino do recado ou quem recebe a entrega saiu do alcance → pula.
 * `alcanceDe` devolve os ids ligados ao agente agora (cordas e os que ele abriu), ou `null` se ele não tem sessão;
 * `saiuDoQuadro` diz se o cartão dele não existe mais; `destino` resolve `maestro` para o Maestro de agora.
 */
export function conferirAlcanceNoDisparo(
  regra: Pick<Automacao, 'criadaPor' | 'editadaPor' | 'quando' | 'faca'>,
  e: EventoDeAutomacao,
  ctx: {
    alcanceDe: (agente: string) => ReadonlySet<string> | null
    saiuDoQuadro?: (agente: string) => boolean
    destino: (d: string) => string | undefined
    nome: (id: string) => string
  }
): VereditoDoAlcance {
  const agente = agenteDaRegra(regra)
  if (!agente) return null
  const a = regra.faca
  // comando e tarefa sem o evento não levam nada de ninguém: não há alcance a proteger
  if (a.tipo !== 'recado' && !(a.tipo === 'tarefa' && a.juntarEvento)) return null
  const quem = nomeNoCabecalho(ctx.nome(agente))
  const alcance = ctx.alcanceDe(agente)
  if (!alcance) {
    if (a.tipo === 'recado' && ctx.saiuDoQuadro?.(agente)) return { pular: `desligada: "${quem}", o agente da regra, saiu do quadro`, desligar: true }
    return { pular: `pulado: fora do alcance — "${quem}", o agente da regra, está sem sessão (a regra continua ligada)` }
  }
  const ve = (id: string): boolean => id === agente || alcance.has(id)
  const fora = (id: string, papel: string): { pular: string } => ({
    pular: `pulado: fora do alcance de "${quem}" — ${papel} "${nomeNoCabecalho(ctx.nome(id))}" não está ligado a ele por corda (a regra continua ligada)`
  })
  if (e.tipo !== 'teste') {
    for (const id of cartoesDoGatilho(regra.quando)) if (!ve(id)) return fora(id, 'o gatilho vigia')
    if (cartoesDoEvento(e).some((id) => !ve(id))) return 'ignorar'
  }
  if (a.tipo === 'recado') {
    const para = ctx.destino(a.para)
    if (para && !ve(para)) return fora(para, 'o recado vai para')
    const entrega = ctx.destino(a.entregaPara ?? 'maestro')
    if (entrega && !ve(entrega)) return fora(entrega, 'a entrega volta para')
  }
  return null
}

// ---------------------------------------------------------------- confirmação do comando

/**
 * Item 1 da reconferência: o que a página mostrou ao confirmar uma regra (o comando e o shell; quem não é comando tem
 * uma assinatura fixa). Ligar e "Rodar agora" mandam isto, e o principal recusa se o que está no disco é outro.
 */
export function assinaturaDoComando(a: Acao): string {
  return a.tipo === 'comando' ? JSON.stringify(['comando', a.terminal, a.comando]) : JSON.stringify([a.tipo])
}

export const A_REGRA_MUDOU = 'a regra mudou enquanto você confirmava; confira de novo'

/** A regra do disco é a que a página mostrou? `null` = é; senão o motivo (nada muda). */
export function conferirOQueFoiMostrado(noDisco: Pick<Automacao, 'faca'>, mostrado: unknown): string | null {
  return mostrado === assinaturaDoComando(noDisco.faca) ? null : A_REGRA_MUDOU
}

/**
 * Texto de regra que vai num recado: sem o que imita uma marca do Orkester (o mesmo de `limparTextoDoRecado`, sem o
 * `| ` na frente — o texto é de quem criou a regra, como um `ork pedir`): NFKC (o `［ork` de letra larga vira `[ork`
 * antes de ser desarmado), sem invisíveis, U+2028/U+2029 viram quebra de linha, `[ork` vira `(ork`.
 */
export function semMarcasDoOrkester(texto: string): string {
  return texto
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{Cs}]/gu, '')
    .replace(/\x1b\[20[01]~/g, '')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/\[(ork)/gi, '($1')
}

/** Um nome que vai entre aspas no cabeçalho de um recado: uma linha, sem marca do Orkester, sem aspas duplas. */
export function nomeNoCabecalho(nome: string): string {
  return semMarcasDoOrkester(nome).replace(/\s+/g, ' ').replace(/["\u201c\u201d]/g, "'").trim().slice(0, MAX_NOME) || '?'
}

const pessoaDoRecado = (c: CriadaPor | undefined): string => (!c || (!c.id && c.nome === NOME_DO_USUARIO) ? 'pelo usuário' : `por "${nomeNoCabecalho(c.nome)}"`)
const mesmaPessoa = (a: CriadaPor | undefined, b: CriadaPor | undefined): boolean => pessoaDoRecado(a) === pessoaDoRecado(b) && (a?.id ?? '') === (b?.id ?? '')

/** "criada pelo usuário", "criada por "Construtor"", "criada pelo usuário e editada por "Construtor"" (vai na origem do recado). */
export function autoriaDe(r: Pick<Automacao, 'criadaPor' | 'editadaPor'>): string {
  const criada = `criada ${pessoaDoRecado(r.criadaPor)}`
  return r.editadaPor && !mesmaPessoa(r.editadaPor, r.criadaPor) ? `${criada} e editada ${pessoaDoRecado(r.editadaPor)}` : criada
}

/**
 * O aviso no canto da janela (ação `avisar`): nome da regra **e quem a fez**, como a origem do recado. Nome e texto
 * podem ser de um agente: sem a autoria, `Automação "Orkester": confirme em Ajustes` pareceria do app. Uma linha, sem
 * marca do Orkester.
 */
export function textoDoAviso(regra: Pick<Automacao, 'nome' | 'criadaPor' | 'editadaPor'>, texto: string): string {
  return `Automação "${nomeNoCabecalho(regra.nome)}" (${autoriaDe(regra)}): ${semMarcasDoOrkester(texto).replace(/\s+/g, ' ').trim()}`
}

// ---------------------------------------------------------------- o pedido do agente (ork/MCP)

/** Um cartão do espaço, para resolver nomes. */
export interface CartaoDoEspaco {
  id: string
  nome: string
  agente: 'claude' | 'codex' | 'shell'
}

/** O cartão pelo id, pelo nome exato (sem caixa) ou pelo começo único do nome. */
function acharCartao(cartoes: readonly CartaoDoEspaco[], pedido: unknown, oQue: string): CartaoDoEspaco | string {
  const p = typeof pedido === 'string' ? pedido.trim() : ''
  if (!p) return `diga ${oQue}`
  const n = normalizar(p)
  const exatos = cartoes.filter((c) => c.id === p || normalizar(c.nome) === n)
  const achados = exatos.length ? exatos : cartoes.filter((c) => normalizar(c.nome).startsWith(n))
  if (achados.length === 1) return achados[0]
  if (achados.length > 1) return `mais de um cartão com "${p}": ${achados.map((c) => `"${c.nome}"`).join(', ')}`
  return `não há cartão "${p}" neste espaço; há: ${cartoes.map((c) => `"${c.nome}"`).join(', ') || 'nenhum'}`
}

const USUARIO_NO_PEDIDO = new Set(['usuario', 'o usuario', 'voce', 'eu', 'me', 'mim', 'user'])
/**
 * "usuário", "o usuário", "você"…: o destino de um aviso, não um cartão — a não ser que haja um cartão com esse nome
 * exato (um agente chamado "Eu" continua recebendo recado).
 */
const ehOUsuario = (valor: unknown, cartoes: readonly CartaoDoEspaco[]): boolean =>
  typeof valor === 'string' && USUARIO_NO_PEDIDO.has(normalizar(valor)) && !cartoes.some((c) => normalizar(c.nome) === normalizar(valor))

/**
 * O JSON que o agente escreve (`ork automacao criar --arquivo regra.json`, ou o MCP), com **nomes** de cartão e de
 * coluna, vira a entrada de `montarRegra`, com ids. Erro = texto claro do que falta. Recado nunca vai a um shell;
 * comando só num shell.
 *
 * ```json
 * { "nome": "Pronto → Testador",
 *   "quando": { "tipo": "entrega", "de": "Construtor", "contem": "pronto" },
 *   "faca": { "tipo": "recado", "para": "Testador", "texto": "Teste o que o Construtor entregou." } }
 * ```
 */
export function regraDoPedido(json: unknown, ctx: { cartoes: readonly CartaoDoEspaco[]; colunas: readonly { id: string; nome: string }[] }): Record<string, unknown> | string {
  const x = json as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || Array.isArray(x)) return 'mande a regra em JSON: { "nome", "quando": {…}, "faca": {…} } (veja `ork ajuda`)'
  const saida: Record<string, unknown> = {}
  if (x.nome !== undefined) saida.nome = x.nome
  if (x.porHora !== undefined || x.limite !== undefined) saida.limite = { porHora: x.porHora ?? (x.limite as { porHora?: unknown })?.porHora }
  const agente = (valor: unknown, oQue: string, aceitaShell: boolean): string | { erro: string } => {
    const c = acharCartao(ctx.cartoes, valor, oQue)
    if (typeof c === 'string') return { erro: c }
    if (!aceitaShell && c.agente === 'shell') return { erro: `"${c.nome}" é um shell: recado só vai a Claude ou Codex` }
    return c.id
  }
  const destino = (valor: unknown, oQue: string): string | { erro: string } =>
    typeof valor === 'string' && normalizar(valor) === 'maestro' ? 'maestro' : agente(valor, oQue, false)
  const coluna = (valor: unknown): string | { erro: string } => {
    const c = typeof valor === 'string' ? acharColuna(ctx.colunas, valor) : undefined
    return c ? c.id : { erro: `não há coluna "${String(valor ?? '')}" no kanban; há: ${ctx.colunas.map((k) => `"${k.nome}"`).join(', ')}` }
  }
  const erroDe = (...vs: unknown[]): string | null => {
    for (const v of vs) if (v && typeof v === 'object' && 'erro' in (v as object)) return (v as { erro: string }).erro
    return null
  }

  const q = x.quando as Record<string, unknown> | undefined
  if (q !== undefined) {
    if (!q || typeof q !== 'object') return '"quando" tem de ser um objeto'
    if (q.tipo === 'entrega') {
      const de = q.de === undefined ? undefined : agente(q.de, 'quem entrega', true)
      const para = q.para === undefined ? undefined : agente(q.para, 'quem recebe', true)
      const e = erroDe(de, para)
      if (e) return e
      saida.quando = { tipo: 'entrega', ...(de ? { de } : {}), ...(para ? { para } : {}), ...(q.contem !== undefined ? { contem: q.contem } : {}) }
    } else if (q.tipo === 'parou') {
      const ag = q.agente === undefined ? undefined : agente(q.agente, 'o agente', true)
      const e = erroDe(ag)
      if (e) return e
      saida.quando = { tipo: 'parou', ...(ag ? { agente: ag } : {}), como: q.como ?? ['parou'] }
    } else if (q.tipo === 'kanban') {
      const para = coluna(q.paraColuna ?? q.coluna)
      const de = q.deColuna === undefined ? undefined : coluna(q.deColuna)
      const e = erroDe(para, de)
      if (e) return e
      saida.quando = { tipo: 'kanban', paraColuna: para, ...(de ? { deColuna: de } : {}), ...(q.por !== undefined ? { por: q.por } : {}) }
    } else {
      saida.quando = q // horário (e o tipo desconhecido, que a validação recusa com o motivo)
    }
  }

  const a = x.faca as Record<string, unknown> | undefined
  if (a !== undefined) {
    if (!a || typeof a !== 'object') return '"faca" tem de ser um objeto'
    if (a.tipo === 'avisar' || (a.tipo === 'recado' && ehOUsuario(a.para, ctx.cartoes))) {
      // F2: "me avise" = o aviso no canto da janela (o usuário não é um cartão); recado "para o usuário" vira isso
      saida.faca = { tipo: 'avisar', texto: a.texto }
    } else if (a.tipo === 'recado') {
      const para = destino(a.para, 'para quem vai o recado')
      const entregaPara = a.entregaPara === undefined ? undefined : destino(a.entregaPara, 'para quem vai a entrega')
      const e = erroDe(para, entregaPara)
      if (e) return e
      saida.faca = { tipo: 'recado', para, texto: a.texto, juntarEvento: a.juntarEvento === true, ...(entregaPara ? { entregaPara } : {}) }
    } else if (a.tipo === 'comando') {
      const c = acharCartao(ctx.cartoes, a.terminal, 'em qual shell o comando é digitado')
      if (typeof c === 'string') return c
      if (c.agente !== 'shell') return `"${c.nome}" não é um shell: comando só é digitado num cartão shell`
      saida.faca = { tipo: 'comando', terminal: c.id, comando: a.comando }
    } else if (a.tipo === 'tarefa') {
      const col = a.coluna === undefined ? undefined : coluna(a.coluna)
      const e = erroDe(col)
      if (e) return e
      saida.faca = { tipo: 'tarefa', titulo: a.titulo, ...(a.descricao !== undefined ? { descricao: a.descricao } : {}), ...(col ? { coluna: col } : {}), ...(a.juntarEvento === true ? { juntarEvento: true } : {}) }
    } else {
      saida.faca = a
    }
  }
  return saida
}
