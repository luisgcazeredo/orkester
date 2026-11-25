// Fluxos (1.9.6): o catálogo dos nós (15 na 1.9.7, com o Consultar e a Ferramenta MCP). Para cada tipo: rótulo, categoria, saídas, se é sensível, onde vale expressão,
// quais campos apontam para cartão ou coluna, os ajustes padrão e o validador (que recebe o que veio do disco, da
// colagem, do `ork` ou do MCP, não confiável, e devolve os ajustes normalizados ou o motivo). Puro: roda no Node.
import type { AjustesDaConsulta, AjustesPorTipo, CategoriaDoNo, CondicaoDoSe, CorpoHttp, MetodoHttp, NoDoFluxo, OperadorDoSe, ParNomeValor, OperacaoDaConsulta, QuandoDaRotina, RecursoDaConsulta, Referencia, TipoDeNo } from './tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { COMO_PAROU, MAX_AVISO, MAX_COMANDO, MAX_CONTEM, MAX_DESCRICAO, MAX_NOME, MAX_TEXTO, MAX_TITULO, MIN_MINUTOS_DA_AUTOMACAO, semMarcasDoOrkester } from '../automacoes.ts'
// @ts-expect-error idem
import { MAX_MINUTOS } from '../rotinas.ts'
// @ts-expect-error idem
import { limparTextoDoRecado } from '../paginas.ts'
// @ts-expect-error idem
import { errosDeExpressao, partes, resolverTexto } from './expressoes.ts'
// @ts-expect-error idem
import { corpoJson } from './rede.ts'

export const MAX_CONDICOES = 10
export const MAX_CAMPOS = 30
export const MAX_PARES = 30
export const MAX_NOME_DE_CAMPO = 100
export const MAX_VALOR = 2000
export const MAX_CODIGO = 20_000
export const MAX_URL = 2000
export const MAX_CORPO = 20_000
/** (1.9.7) O nome de uma ferramenta MCP (o da especificação, mais `/`). */
export const NOME_DE_FERRAMENTA_MCP = /^[A-Za-z0-9_./-]{1,128}$/
/** O nome do servidor MCP no nó: o mesmo teto do cadastro (`main/mcpFora/registro.ts`). */
export const MAX_NOME_DO_SERVIDOR_MCP = 60

export const OPERADORES_DO_SE: readonly OperadorDoSe[] = ['igual', 'diferente', 'contem', 'nao-contem', 'comeca', 'termina', 'vazio', 'nao-vazio', 'maior', 'menor', 'verdadeiro', 'falso']
/** Operadores que não usam o `comparar`. */
export const OPERADORES_SEM_COMPARAR: readonly OperadorDoSe[] = ['vazio', 'nao-vazio', 'verdadeiro', 'falso']
export const METODOS_HTTP: readonly MetodoHttp[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
export const TIPOS_DE_CORPO: readonly CorpoHttp['tipo'][] = ['nenhum', 'json', 'texto', 'formulario']

/** Um campo dos ajustes que aponta para algo do espaço (`[]` no fim = cada item de uma lista não existe aqui). */
export interface CampoDeReferencia {
  campo: string
  de: 'cartao' | 'coluna'
}

export interface DefinicaoDoNo<T extends TipoDeNo = TipoDeNo> {
  tipo: T
  rotulo: string
  descricao: string
  categoria: CategoriaDoNo
  /** O rótulo de cada saída (o Se tem 2; os outros, 1 sem rótulo). */
  saidas: readonly string[]
  /** Código, HTTP e comando: o agente cria, mas só o usuário liga, vendo o nó inteiro. */
  sensivel: boolean
  /** Campos (de primeiro nível, ou `lista[].campo`) em que vale `{{ }}`. O comando não tem nenhum. */
  expressoes: readonly string[]
  referencias: readonly CampoDeReferencia[]
  padrao: () => AjustesPorTipo[T]
  validar: (bruto: unknown) => AjustesPorTipo[T] | string
}

// ---------------------------------------------------------------- limpeza

const ID = /^[A-Za-z0-9_-]{1,80}$/
const ID_DE_COLUNA = /^[a-z0-9-]{1,40}$/

/** Uma linha só, sem controles nem marcadores de colagem; cortada em `max`. */
export function linha(valor: unknown, max: number): string {
  return typeof valor === 'string'
    ? valor
        .replace(/\x1b\[20[01]~/g, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
        .trim()
        .slice(0, max)
    : ''
}

/** Texto de várias linhas: sem controles (menos quebra de linha e tab) nem marcadores de colagem. */
export function textoLimpo(valor: unknown): string {
  return typeof valor === 'string'
    ? valor
        .replace(/\x1b\[20[01]~/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
        .trim()
    : ''
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** O primeiro erro de expressão do texto, já com o nome do campo; `null` = nenhum. */
function erroDeExpressao(texto: string, campo: string): string | null {
  const e = errosDeExpressao(texto)[0]
  return e ? `${campo}: ${e}` : null
}

/**
 * Referência a cartão ou coluna: `{ id, nome }`. Aceita também só o nome (texto, ou `{ nome }` sem id): vira
 * "a escolher" (`id: ''`) até `resolverReferencias` achar pelo nome. `maestro` só onde `comMaestro`.
 */
function referencia(v: unknown, de: 'cartao' | 'coluna', comMaestro = false): Referencia | null {
  if (typeof v === 'string') v = { nome: v }
  const x = objeto(v)
  if (!x) return null
  const nome = linha(x.nome, MAX_NOME)
  const id = x.id === undefined ? '' : x.id
  if (typeof id !== 'string') return null
  if (comMaestro && (id === 'maestro' || (!id && nome.toLocaleLowerCase('pt-BR') === 'maestro'))) return { id: 'maestro', nome: 'Maestro' }
  if (!id) return nome ? { id: '', nome } : null
  if (!(de === 'coluna' ? ID_DE_COLUNA : ID).test(id)) return null
  return { id, nome: nome || id }
}

/** Lista de pares nome → valor. `nomeValido` diz se o nome serve; o valor aceita expressão. */
function pares(v: unknown, campo: string, nomeValido: (n: string) => boolean): ParNomeValor[] | string {
  if (v === undefined) return []
  if (!Array.isArray(v)) return `${campo}: precisa ser uma lista`
  if (v.length > MAX_PARES) return `${campo}: no máximo ${MAX_PARES}`
  const saida: ParNomeValor[] = []
  for (const bruto of v) {
    const x = objeto(bruto)
    const nome = linha(x?.nome, MAX_NOME_DE_CAMPO + 1)
    if (!x || !nome || nome.length > MAX_NOME_DE_CAMPO || !nomeValido(nome)) return `${campo}: nome inválido "${nome.slice(0, 40)}"`
    const valor = linha(x.valor, MAX_VALOR + 1)
    if (valor.length > MAX_VALOR) return `${campo}: o valor de "${nome}" passa de ${MAX_VALOR} letras`
    const e = erroDeExpressao(valor, `${campo} "${nome}"`)
    if (e) return e
    saida.push({ nome, valor })
  }
  return saida
}

function quandoValido(q: unknown): QuandoDaRotina | null {
  const x = objeto(q) as Partial<{ tipo: string; minutos: number; hora: number; minuto: number; dia: number }> | null
  const hora = (h: unknown, m: unknown): boolean => Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 && Number.isInteger(m) && (m as number) >= 0 && (m as number) <= 59
  if (!x) return null
  if (x.tipo === 'cada' && Number.isInteger(x.minutos) && x.minutos! >= MIN_MINUTOS_DA_AUTOMACAO && x.minutos! <= MAX_MINUTOS) return { tipo: 'cada', minutos: x.minutos! }
  if (x.tipo === 'diario' && hora(x.hora, x.minuto)) return { tipo: 'diario', hora: x.hora!, minuto: x.minuto! }
  if (x.tipo === 'semanal' && Number.isInteger(x.dia) && x.dia! >= 0 && x.dia! <= 6 && hora(x.hora, x.minuto)) return { tipo: 'semanal', dia: x.dia!, hora: x.hora!, minuto: x.minuto! }
  return null
}

/** Texto obrigatório de várias linhas (ou uma, com `umaLinha`), com teto e expressões conferidas. */
function textoComExpressao(v: unknown, campo: string, max: number, umaLinha = false): string | { erro: string } {
  const t = umaLinha ? linha(v, max + 1) : textoLimpo(v)
  if (!t) return { erro: `escreva ${campo}` }
  if (t.length > max) return { erro: `${campo} passa de ${max} letras` }
  const e = erroDeExpressao(t, campo)
  return e ? { erro: e } : t
}

const NOME_DE_CABECALHO = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const CAMINHO_DE_CAMPO = /^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)*$/u
const CHAVES_PROIBIDAS = new Set(['__proto__', 'prototype', 'constructor'])

// ---------------------------------------------------------------- o nó Consultar

/** As operações de cada recurso, na ordem do menu (a primeira é a padrão quando falta). */
export const OPERACOES_DA_CONSULTA: { readonly [R in RecursoDaConsulta]: readonly OperacaoDaConsulta[] } = {
  tarefa: ['varios', 'um'],
  coluna: ['varios', 'um'],
  agente: ['varios', 'um'],
  cartao: ['varios', 'um'],
  andar: ['varios', 'um'],
  espaco: ['um'],
  fluxo: ['um', 'varios'],
  execucao: ['varios']
}
export const RECURSOS_DA_CONSULTA = Object.keys(OPERACOES_DA_CONSULTA) as RecursoDaConsulta[]
/** Os filtros (campos dos ajustes) de cada recurso e operação; o resto é tirado na validação. */
export const FILTROS_DA_CONSULTA: { readonly [R in RecursoDaConsulta]: Partial<Record<OperacaoDaConsulta, readonly (keyof AjustesDaConsulta)[]>> } = {
  tarefa: { um: ['numero'], varios: ['coluna', 'etiqueta', 'responsavel', 'contem', 'concluidas'] },
  coluna: { um: ['coluna'], varios: [] },
  agente: { um: ['agente'], varios: ['tipo', 'estado', 'funcao'] },
  cartao: { um: ['nome'], varios: ['tipo', 'andar', 'contem'] },
  andar: { um: ['nome'], varios: [] },
  espaco: { um: [] },
  fluxo: { um: ['nome'], varios: ['ligados'] },
  execucao: { varios: ['fluxo'] }
}
export const LIMITE_PADRAO_DA_CONSULTA = 20
export const MAX_LIMITE_DA_CONSULTA = 100
/** Execuções: no máximo esta quantidade por consulta. */
export const MAX_EXECUCOES_DA_CONSULTA = 20
export const TIPOS_DE_AGENTE_DA_CONSULTA = ['claude', 'codex', 'shell'] as const
export const ESTADOS_DE_AGENTE_DA_CONSULTA = ['livre', 'trabalhando', 'pergunta', 'encerrado', 'fechado'] as const
export const TIPOS_DE_CARTAO_DA_CONSULTA = ['nota', 'texto', 'portal', 'arquivo', 'pasta', 'imagem', 'codigo', 'banda'] as const
/** Os filtros de texto que aceitam {{ }} (o catálogo marca os mesmos em `expressoes`). */
const FILTROS_COM_EXPRESSAO: readonly string[] = ['numero', 'etiqueta', 'contem', 'nome']

/** Um texto curto opcional, com a expressão conferida (`undefined` = vazio). */
function filtroDeTexto(v: unknown, campo: string, max: number): string | undefined | { erro: string } {
  if (v === undefined || v === null || v === '') return undefined
  const t = linha(v, max + 1)
  if (t.length > max) return { erro: `${campo} passa de ${max} letras` }
  const e = erroDeExpressao(t, campo)
  return e ? { erro: e } : t || undefined
}

/** Os ajustes do Consultar: só os filtros do recurso e da operação ficam; os obrigatórios do "um" são cobrados. */
function validarConsulta(b: unknown): AjustesDaConsulta | string {
  const x = objeto(b)
  if (!x) return 'ajustes ausentes'
  const recurso = x.recurso as RecursoDaConsulta
  if (!(RECURSOS_DA_CONSULTA as readonly unknown[]).includes(recurso)) return `recurso: ${RECURSOS_DA_CONSULTA.join(', ')}`
  const operacoes = OPERACOES_DA_CONSULTA[recurso]
  const operacao = (x.operacao ?? operacoes[0]) as OperacaoDaConsulta
  if (!operacoes.includes(operacao)) return `${recurso} não tem a operação "${String(x.operacao)}" (${operacoes.join(' ou ')})`
  const limite = x.limite ?? LIMITE_PADRAO_DA_CONSULTA
  if (typeof limite !== 'number' || !Number.isInteger(limite) || limite < 1 || limite > MAX_LIMITE_DA_CONSULTA) return `o limite vai de 1 a ${MAX_LIMITE_DA_CONSULTA}`
  const saida: AjustesDaConsulta = { recurso, operacao, limite }
  for (const campo of FILTROS_DA_CONSULTA[recurso][operacao] ?? []) {
    const v = x[campo]
    switch (campo) {
      case 'numero': {
        const t = filtroDeTexto(v, 'o número', 40)
        if (typeof t === 'object') return t.erro
        if (!t) return 'diga o número da tarefa'
        if (!t.includes('{{') && !/^#?\d{1,9}$/.test(t)) return `número de tarefa inválido: "${t}"`
        saida.numero = t.includes('{{') ? t : t.replace('#', '')
        break
      }
      case 'coluna':
      case 'responsavel':
      case 'agente': {
        if (v === undefined || v === null || v === '') {
          if (operacao === 'um') return campo === 'coluna' ? 'diga a coluna' : 'diga o agente'
          break
        }
        const r = referencia(v, campo === 'coluna' ? 'coluna' : 'cartao', campo !== 'coluna')
        if (!r) return `"${campo}" inválido`
        saida[campo] = r
        break
      }
      case 'etiqueta':
      case 'contem':
      case 'funcao':
      case 'andar':
      case 'fluxo':
      case 'nome': {
        const max = campo === 'etiqueta' ? 24 : campo === 'contem' ? MAX_CONTEM : MAX_NOME
        const t = filtroDeTexto(v, `"${campo}"`, max)
        if (typeof t === 'object') return t.erro
        if (t?.includes('{{') && !FILTROS_COM_EXPRESSAO.includes(campo)) return `{{ }} não vale em "${campo}"`
        if (!t && campo === 'nome' && operacao === 'um' && recurso !== 'fluxo') return 'diga o nome'
        if (t) saida[campo] = t
        break
      }
      case 'tipo':
      case 'estado': {
        if (v === undefined || v === null || v === '') break
        const validos: readonly string[] = campo === 'estado' ? ESTADOS_DE_AGENTE_DA_CONSULTA : recurso === 'agente' ? TIPOS_DE_AGENTE_DA_CONSULTA : TIPOS_DE_CARTAO_DA_CONSULTA
        if (typeof v !== 'string' || !validos.includes(v)) return `"${campo}": ${validos.join(', ')}`
        saida[campo] = v
        break
      }
      case 'concluidas':
      case 'ligados':
        if (v === true) saida[campo] = true
        break
    }
  }
  return saida
}

// ---------------------------------------------------------------- o catálogo

const semExtras = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const CATALOGO_: { [T in TipoDeNo]: DefinicaoDoNo<T> } = {
  'gatilho.kanban': {
    tipo: 'gatilho.kanban',
    rotulo: 'Tarefa mudou de coluna',
    descricao: 'Dispara quando uma tarefa do kanban entra numa coluna. Movimento feito por fluxo não conta.',
    categoria: 'gatilho',
    saidas: [''],
    sensivel: false,
    expressoes: [],
    referencias: [
      { campo: 'paraColuna', de: 'coluna' },
      { campo: 'deColuna', de: 'coluna' }
    ],
    padrao: () => ({ paraColuna: { id: '', nome: '' }, por: 'qualquer' }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const paraColuna = referencia(x.paraColuna, 'coluna')
      if (!paraColuna) return 'diga a coluna de destino'
      const deColuna = x.deColuna === undefined ? undefined : referencia(x.deColuna, 'coluna')
      if (deColuna === null) return 'coluna de origem inválida'
      const por = x.por ?? 'qualquer'
      if (por !== 'usuario' && por !== 'agente' && por !== 'qualquer') return '"por" é usuario, agente ou qualquer'
      return semExtras({ paraColuna, deColuna, por: por as AjustesPorTipo['gatilho.kanban']['por'] })
    }
  },
  'gatilho.entrega': {
    tipo: 'gatilho.entrega',
    rotulo: 'Entrega chegou',
    descricao: 'Dispara quando um agente entrega (ork entregar). Filtros opcionais: de quem, para quem, texto que contém.',
    categoria: 'gatilho',
    saidas: [''],
    sensivel: false,
    expressoes: [],
    referencias: [
      { campo: 'de', de: 'cartao' },
      { campo: 'para', de: 'cartao' }
    ],
    padrao: () => ({}),
    validar: (b) => {
      const x = objeto(b) ?? {}
      const de = x.de === undefined ? undefined : referencia(x.de, 'cartao')
      const para = x.para === undefined ? undefined : referencia(x.para, 'cartao')
      if (de === null) return '"de" não é um cartão'
      if (para === null) return '"para" não é um cartão'
      const contem = x.contem === undefined ? '' : linha(x.contem, MAX_CONTEM + 1)
      if (contem.length > MAX_CONTEM) return `"contém" passa de ${MAX_CONTEM} letras`
      return semExtras({ de, para, contem: contem || undefined })
    }
  },
  'gatilho.parou': {
    tipo: 'gatilho.parou',
    rotulo: 'Agente parou',
    descricao: 'Dispara quando um agente para, para numa pergunta ou encerra.',
    categoria: 'gatilho',
    saidas: [''],
    sensivel: false,
    expressoes: [],
    referencias: [{ campo: 'agente', de: 'cartao' }],
    padrao: () => ({ como: ['pergunta'] }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const agente = x.agente === undefined ? undefined : referencia(x.agente, 'cartao')
      if (agente === null) return '"agente" não é um cartão'
      const como = Array.isArray(x.como) ? [...new Set(x.como)] : []
      if (!como.length || !como.every((c) => (COMO_PAROU as readonly unknown[]).includes(c))) return 'diga parou, pergunta e/ou encerrou'
      return semExtras({ agente, como: como as AjustesPorTipo['gatilho.parou']['como'] })
    }
  },
  'gatilho.relogio': {
    tipo: 'gatilho.relogio',
    rotulo: 'Relógio',
    descricao: 'Dispara a cada N minutos, todo dia ou toda semana. O que venceu com o app fechado não dispara depois.',
    categoria: 'gatilho',
    saidas: [''],
    sensivel: false,
    expressoes: [],
    referencias: [],
    padrao: () => ({ quando: { tipo: 'diario', hora: 9, minuto: 0 } }),
    validar: (b) => {
      const quando = quandoValido(objeto(b)?.quando)
      return quando ? { quando } : `horário inválido (a cada N min, de ${MIN_MINUTOS_DA_AUTOMACAO} em diante; todo dia; ou toda semana)`
    }
  },
  'gatilho.manual': {
    tipo: 'gatilho.manual',
    rotulo: 'Manual',
    descricao: 'Dispara pelo botão Rodar fluxo.',
    categoria: 'gatilho',
    saidas: [''],
    sensivel: false,
    expressoes: [],
    referencias: [],
    padrao: () => ({}),
    validar: () => ({})
  },
  'orkester.recado': {
    tipo: 'orkester.recado',
    rotulo: 'Recado',
    descricao: 'Manda um recado a um agente do espaço (ou ao Maestro). Até 5 itens; junte antes no Código.',
    categoria: 'orkester',
    saidas: [''],
    sensivel: false,
    expressoes: ['texto'],
    referencias: [
      { campo: 'para', de: 'cartao' },
      { campo: 'entregaPara', de: 'cartao' }
    ],
    padrao: () => ({ para: { id: 'maestro', nome: 'Maestro' }, texto: '', juntarEvento: false }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const para = referencia(x.para, 'cartao', true)
      if (!para) return 'diga para quem (um agente do espaço ou o Maestro)'
      const entregaPara = x.entregaPara === undefined ? undefined : referencia(x.entregaPara, 'cartao', true)
      if (entregaPara === null) return '"entregar para" não é um cartão'
      const texto = textoComExpressao(x.texto, 'o texto', MAX_TEXTO)
      if (typeof texto !== 'string') return texto.erro
      return semExtras({ para, texto, juntarEvento: x.juntarEvento === true, entregaPara })
    }
  },
  'orkester.tarefa': {
    tipo: 'orkester.tarefa',
    rotulo: 'Tarefa',
    descricao: 'Cria uma tarefa no kanban do espaço. Até 5 itens.',
    categoria: 'orkester',
    saidas: [''],
    sensivel: false,
    expressoes: ['titulo', 'descricao'],
    referencias: [{ campo: 'coluna', de: 'coluna' }],
    padrao: () => ({ titulo: '' }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const titulo = textoComExpressao(x.titulo, 'o título', MAX_TITULO, true)
      if (typeof titulo !== 'string') return titulo.erro
      const descricao = x.descricao === undefined ? '' : textoLimpo(x.descricao)
      if (descricao.length > MAX_DESCRICAO) return `a descrição passa de ${MAX_DESCRICAO} letras`
      const e = erroDeExpressao(descricao, 'a descrição')
      if (e) return e
      const coluna = x.coluna === undefined ? undefined : referencia(x.coluna, 'coluna')
      if (coluna === null) return 'coluna inválida'
      return semExtras({ titulo, descricao: descricao || undefined, coluna })
    }
  },
  'orkester.comando': {
    tipo: 'orkester.comando',
    rotulo: 'Comando no shell',
    descricao: 'Digita um comando fixo (sem expressões) num cartão shell do espaço quando ele está livre. Só você liga.',
    categoria: 'orkester',
    saidas: [''],
    sensivel: true,
    expressoes: [],
    referencias: [{ campo: 'terminal', de: 'cartao' }],
    padrao: () => ({ terminal: { id: '', nome: '' }, comando: '' }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const terminal = referencia(x.terminal, 'cartao')
      if (!terminal) return 'diga em qual cartão shell ele é digitado'
      const bruto = typeof x.comando === 'string' ? x.comando.replace(/\x1b\[20[01]~/g, '').trim() : ''
      if (!bruto) return 'escreva o comando'
      if (/[\r\n]/.test(bruto)) return 'o comando é uma linha só'
      const comando = bruto.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      if (comando.length > MAX_COMANDO) return `o comando passa de ${MAX_COMANDO} letras`
      return { terminal, comando }
    }
  },
  'orkester.avisar': {
    tipo: 'orkester.avisar',
    rotulo: 'Avisar',
    descricao: 'Mostra um aviso ao usuário: na janela do espaço ou, sem janela, numa notificação do Windows. Até 5 itens.',
    categoria: 'orkester',
    saidas: [''],
    sensivel: false,
    expressoes: ['texto'],
    referencias: [],
    padrao: () => ({ texto: '' }),
    validar: (b) => {
      const texto = textoComExpressao(objeto(b)?.texto, 'o texto', MAX_AVISO, true)
      return typeof texto === 'string' ? { texto } : texto.erro
    }
  },
  'orkester.consultar': {
    tipo: 'orkester.consultar',
    rotulo: 'Consultar o Orkester',
    descricao: 'Lê tarefas, colunas, agentes, cartões, andares, o espaço, fluxos ou execuções deste espaço. Só leitura; um item por ficha.',
    categoria: 'orkester',
    saidas: [''],
    sensivel: false,
    expressoes: ['numero', 'etiqueta', 'contem', 'nome'],
    referencias: [
      { campo: 'coluna', de: 'coluna' },
      { campo: 'responsavel', de: 'cartao' },
      { campo: 'agente', de: 'cartao' }
    ],
    padrao: () => ({ recurso: 'tarefa', operacao: 'varios', limite: LIMITE_PADRAO_DA_CONSULTA }),
    validar: validarConsulta
  },
  'logica.se': {
    tipo: 'logica.se',
    rotulo: 'Se',
    descricao: 'Separa os itens em duas saídas: os que passam nas condições (verdadeiro) e os outros (falso).',
    categoria: 'logica',
    saidas: ['verdadeiro', 'falso'],
    sensivel: false,
    expressoes: ['condicoes[].valor', 'condicoes[].comparar'],
    referencias: [],
    padrao: () => ({ condicoes: [{ valor: '', operador: 'igual', comparar: '' }], combinar: 'e' }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      if (!Array.isArray(x.condicoes) || !x.condicoes.length) return 'escreva pelo menos uma condição'
      if (x.condicoes.length > MAX_CONDICOES) return `no máximo ${MAX_CONDICOES} condições`
      const condicoes: CondicaoDoSe[] = []
      for (const [i, bruto] of x.condicoes.entries()) {
        const c = objeto(bruto)
        if (!c || !(OPERADORES_DO_SE as readonly unknown[]).includes(c.operador)) return `condição ${i + 1}: operador inválido`
        const operador = c.operador as OperadorDoSe
        const valor = linha(c.valor, MAX_VALOR + 1)
        const comparar = OPERADORES_SEM_COMPARAR.includes(operador) ? '' : linha(c.comparar, MAX_VALOR + 1)
        if (!valor) return `condição ${i + 1}: diga o valor (ex.: {{ titulo }})`
        if (valor.length > MAX_VALOR || comparar.length > MAX_VALOR) return `condição ${i + 1}: passa de ${MAX_VALOR} letras`
        const e = erroDeExpressao(valor, `condição ${i + 1}`) ?? erroDeExpressao(comparar, `condição ${i + 1}`)
        if (e) return e
        condicoes.push({ valor, operador, comparar })
      }
      const combinar = x.combinar ?? 'e'
      if (combinar !== 'e' && combinar !== 'ou') return '"combinar" é e ou ou'
      return { condicoes, combinar }
    }
  },
  'logica.definir': {
    tipo: 'logica.definir',
    rotulo: 'Definir campos',
    descricao: 'Põe ou troca campos em cada item. O nome aceita caminho (a.b); o valor, expressão.',
    categoria: 'logica',
    saidas: [''],
    sensivel: false,
    expressoes: ['campos[].valor'],
    referencias: [],
    padrao: () => ({ campos: [], manterOutros: true }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const campos = pares(x.campos, 'campos', (n) => CAMINHO_DE_CAMPO.test(n) && !n.split('.').some((p) => CHAVES_PROIBIDAS.has(p)))
      if (typeof campos === 'string') return campos
      if (!campos.length) return 'defina pelo menos um campo'
      if (campos.length > MAX_CAMPOS) return `no máximo ${MAX_CAMPOS} campos`
      return { campos, manterOutros: x.manterOutros !== false }
    }
  },
  'fora.codigo': {
    tipo: 'fora.codigo',
    rotulo: 'Código',
    descricao: 'JavaScript isolado que recebe todos os itens e devolve itens. Sem disco, sem rede, 5 s. Só você liga.',
    categoria: 'fora',
    saidas: [''],
    sensivel: true,
    expressoes: [],
    referencias: [],
    padrao: () => ({ codigo: 'return $input.all()\n' }),
    validar: (b) => {
      const bruto = objeto(b)?.codigo
      const codigo = typeof bruto === 'string' ? bruto.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '') : ''
      if (!codigo.trim()) return 'escreva o código'
      if (codigo.length > MAX_CODIGO) return `o código passa de ${MAX_CODIGO} letras`
      return { codigo }
    }
  },
  'fora.http': {
    tipo: 'fora.http',
    rotulo: 'HTTP',
    descricao: 'Faz um pedido HTTP. Endereço do seu computador ou da rede local só com a sua permissão, no próprio nó. Só você liga.',
    categoria: 'fora',
    saidas: [''],
    sensivel: true,
    expressoes: ['url', 'consulta[].valor', 'cabecalhos[].valor', 'corpo.valor'],
    referencias: [],
    padrao: () => ({ metodo: 'GET', url: 'https://', consulta: [], cabecalhos: [], corpo: { tipo: 'nenhum', valor: '' } }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const metodo = x.metodo ?? 'GET'
      if (!(METODOS_HTTP as readonly unknown[]).includes(metodo)) return `método é ${METODOS_HTTP.join(', ')}`
      const url = textoComExpressao(x.url, 'a URL', MAX_URL, true)
      if (typeof url !== 'string') return url.erro
      if (!/^https?:\/\//i.test(url) && !url.startsWith('{{')) return 'a URL começa com http:// ou https://'
      if (!url.includes('{{')) {
        try {
          new URL(url)
        } catch {
          return 'URL inválida'
        }
      }
      const consulta = pares(x.consulta, 'consulta', () => true)
      if (typeof consulta === 'string') return consulta
      const cabecalhos = pares(x.cabecalhos, 'cabeçalhos', (n) => NOME_DE_CABECALHO.test(n))
      if (typeof cabecalhos === 'string') return cabecalhos
      const c = objeto(x.corpo) ?? { tipo: 'nenhum', valor: '' }
      if (!(TIPOS_DE_CORPO as readonly unknown[]).includes(c.tipo)) return `corpo: o tipo é ${TIPOS_DE_CORPO.join(', ')}`
      const tipo = c.tipo as CorpoHttp['tipo']
      const valor = tipo === 'nenhum' ? '' : textoLimpo(c.valor)
      if (valor.length > MAX_CORPO) return `o corpo passa de ${MAX_CORPO} letras`
      const e = erroDeExpressao(valor, 'o corpo')
      if (e) return e
      if (tipo !== 'nenhum' && (metodo === 'GET' || metodo === 'HEAD')) return `${metodo} não leva corpo`
      const credencial = x.credencial === undefined || x.credencial === '' ? '' : linha(x.credencial, MAX_NOME + 1)
      if (x.credencial !== undefined && x.credencial !== '' && (!credencial || credencial.length > MAX_NOME)) return 'credencial: diga só o nome dela'
      return semExtras({ metodo: metodo as MetodoHttp, url, consulta, cabecalhos, corpo: { tipo, valor }, credencial: credencial || undefined })
    }
  },
  'fora.mcp': {
    tipo: 'fora.mcp',
    rotulo: 'Ferramenta MCP',
    descricao: 'Chama uma ferramenta de um servidor MCP de fora (Conexões › MCP). A ferramenta que mudou fica bloqueada até você rever. Só você liga.',
    categoria: 'fora',
    saidas: [''],
    sensivel: true,
    expressoes: ['argumentos'],
    referencias: [],
    padrao: () => ({ servidor: { id: '', nome: '' }, ferramenta: '', argumentos: '{}' }),
    validar: (b) => {
      const x = objeto(b)
      if (!x) return 'ajustes ausentes'
      const s = objeto(typeof x.servidor === 'string' ? { nome: x.servidor } : x.servidor)
      const nome = linha(s?.nome, MAX_NOME_DO_SERVIDOR_MCP + 1)
      const id = s?.id === undefined ? '' : s.id
      if (!s || typeof id !== 'string' || (id && !ID.test(id))) return 'servidor: escolha um servidor de Conexões › MCP'
      if (!id && !nome) return 'escolha o servidor MCP'
      if (nome.length > MAX_NOME_DO_SERVIDOR_MCP) return `servidor: o nome passa de ${MAX_NOME_DO_SERVIDOR_MCP} letras`
      const ferramenta = linha(x.ferramenta, 129)
      if (!ferramenta) return 'escolha a ferramenta'
      if (!NOME_DE_FERRAMENTA_MCP.test(ferramenta)) return 'ferramenta: o nome dela como o servidor mostra (letras, números e _ - . /)'
      const argumentos = argumentosDoMcp(x.argumentos)
      if (typeof argumentos !== 'string') return argumentos.erro
      return { servidor: { id, nome: nome || id }, ferramenta, argumentos }
    }
  }
}

export const CATALOGO: { readonly [T in TipoDeNo]: DefinicaoDoNo<T> } = CATALOGO_

/**
 * (1.9.7) Os argumentos do nó MCP: um objeto JSON, como texto com `{{ }}` (o agente pode mandar o objeto: vira texto).
 * Vazio = `{}`. Conferido com as expressões vazias: dentro de aspas viram texto, fora viram `null`.
 */
function argumentosDoMcp(v: unknown): string | { erro: string } {
  let t: string
  if (v === undefined || v === null || v === '') t = '{}'
  else if (typeof v === 'string') t = textoLimpo(v) || '{}'
  else if (objeto(v)) t = JSON.stringify(v, null, 2)
  else return { erro: 'argumentos: um objeto JSON, como {"texto": "{{ titulo }}"}' }
  if (t.length > MAX_CORPO) return { erro: `os argumentos passam de ${MAX_CORPO} letras` }
  const e = erroDeExpressao(t, 'os argumentos')
  if (e) return { erro: e }
  const montado = corpoJson(t, {})
  if (typeof montado !== 'string') return { erro: montado.erro.replace('o corpo JSON', 'os argumentos') }
  if (!objeto(JSON.parse(montado || '{}'))) return { erro: 'argumentos: precisa ser um objeto JSON ({ ... })' }
  return t
}

/** Na ordem do menu: gatilhos, Orkester, lógica, fora. */
export const TIPOS_DE_NO = Object.keys(CATALOGO_) as TipoDeNo[]

export const ehTipoDeNo = (t: unknown): t is TipoDeNo => typeof t === 'string' && Object.prototype.hasOwnProperty.call(CATALOGO_, t)
export const definicaoDe = <T extends TipoDeNo>(tipo: T): DefinicaoDoNo<T> => CATALOGO_[tipo] as DefinicaoDoNo<T>
export const ehGatilho = (tipo: TipoDeNo): boolean => CATALOGO_[tipo].categoria === 'gatilho'
export const quantasSaidas = (tipo: TipoDeNo): number => CATALOGO_[tipo].saidas.length

/** Os ajustes do tipo, validados e normalizados; ou o motivo. */
export function validarAjustes<T extends TipoDeNo>(tipo: T, bruto: unknown): AjustesPorTipo[T] | string {
  return definicaoDe(tipo).validar(bruto)
}

// ---------------------------------------------------------------- referências

/** Lê e escreve um campo de referência (`campo`, sem lista). */
const lerRef = (ajustes: Record<string, unknown>, campo: string): Referencia | undefined => ajustes[campo] as Referencia | undefined

/** Os campos "a escolher" do nó (`id: ''`). */
export function pendenciasDoNo(no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>): string[] {
  return CATALOGO_[no.tipo].referencias.filter((r) => lerRef(no.ajustes, r.campo)?.id === '').map((r) => r.campo)
}

/** Os cartões e as colunas de agora do espaço. Faltando uma das listas, aquele tipo não é conferido. */
export interface EspacoDasReferencias {
  cartoes: readonly { id: string; nome: string }[]
  colunas: readonly { id: string; nome: string }[]
}

/**
 * O id da referência ainda existe no espaço? `maestro` sempre; "a escolher" (`id: ''`) e sem referência, não. Para o
 * seletor da tela marcar "(apagada)" uma coluna ou um cartão que saiu (D1).
 */
export function referenciaExiste(ref: Pick<Referencia, 'id'> | undefined, de: 'cartao' | 'coluna', espaco: Partial<EspacoDasReferencias>): boolean {
  if (!ref || !ref.id) return false
  if (ref.id === 'maestro') return true
  const lista = de === 'coluna' ? espaco.colunas : espaco.cartoes
  return !lista || lista.some((c) => c.id === ref.id)
}

/** Os campos do nó que apontam para um id que saiu do espaço (coluna apagada, cartão fechado). "A escolher" não entra. */
export function referenciasSumidas(no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>, espaco: Partial<EspacoDasReferencias>): { campo: string; de: 'cartao' | 'coluna'; nome: string }[] {
  return CATALOGO_[no.tipo].referencias.flatMap((r) => {
    const ref = lerRef(no.ajustes, r.campo)
    return ref && ref.id && !referenciaExiste(ref, r.de, espaco) ? [{ campo: r.campo, de: r.de, nome: ref.nome || ref.id }] : []
  })
}

/** O nó usa a coluna `colunaId` (gatilho de kanban ou nó Tarefa)? */
export const usaColuna = (no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>, colunaId: string): boolean =>
  CATALOGO_[no.tipo].referencias.some((r) => r.de === 'coluna' && lerRef(no.ajustes, r.campo)?.id === colunaId)

/**
 * O comando é digitado como está: uma expressão que o Orkester resolveria (`{{ em }}`) não é resolvida, e o shell a
 * leria como outra coisa (D5). É Falta, não recusa do validador: um fluxo gravado antes segue legível e abre para ser
 * consertado. O que não é caminho, como o `{{.Names}}` do docker, passa.
 */
export const comandoComExpressao = (comando: string): boolean => partes(comando).some((p) => p.tipo === 'expressao' && p.caminho !== null)

/**
 * A Falta do nó (o aviso no nó; `null` = nada falta): o validador; o comando com `{{ }}` (D5); cartão ou coluna "a
 * escolher" (D4); e, com `espaco`, id que saiu dele (D1). O Salvar recusa só a do validador; o Ligar recusa todas
 * (`faltaParaLigar`).
 */
export function faltaDoNo(no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>, espaco?: Partial<EspacoDasReferencias>): string | null {
  const r = validarAjustes(no.tipo, no.ajustes)
  if (typeof r === 'string') return r
  if (no.tipo === 'orkester.comando' && comandoComExpressao((r as AjustesPorTipo['orkester.comando']).comando)) return '{{ }} não vale no comando'
  if (no.tipo === 'fora.mcp' && !(r as AjustesPorTipo['fora.mcp']).servidor.id) {
    return `escolha o servidor MCP no nó (o "${(r as AjustesPorTipo['fora.mcp']).servidor.nome}" não está ligado a um cadastro)`
  }
  const p = pendenciasDoNo(no)
  if (p.length) return `escolha ${p.map((c) => `"${c}"`).join(', ')} (o nome não bateu com nada deste espaço)`
  const s = espaco ? referenciasSumidas(no, espaco)[0] : undefined
  if (s) return s.de === 'coluna' ? `a coluna "${s.nome}" saiu do kanban` : `o cartão "${s.nome}" não está mais no quadro`
  return null
}

const normalizarNome = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()

/**
 * As referências do nó contra o espaço: id que existe fica (e ganha o nome de agora); id que não existe, ou "a
 * escolher", é procurado pelo nome exato (sem caixa nem acento); nenhum ou mais de um = "a escolher" (`id: ''`).
 * `maestro` fica sempre. Devolve um nó novo; o original não muda.
 */
export function resolverReferenciasDoNo<N extends Pick<NoDoFluxo, 'tipo' | 'ajustes'>>(
  no: N,
  espaco: { cartoes: readonly { id: string; nome: string }[]; colunas: readonly { id: string; nome: string }[] }
): N {
  const refs = CATALOGO_[no.tipo].referencias
  if (!refs.length) return no
  const ajustes = { ...no.ajustes }
  for (const r of refs) {
    const atual = lerRef(ajustes, r.campo)
    if (!atual || atual.id === 'maestro') continue
    const lista = r.de === 'coluna' ? espaco.colunas : espaco.cartoes
    const peloId = atual.id ? lista.find((c) => c.id === atual.id) : undefined
    if (peloId) {
      ajustes[r.campo] = { id: peloId.id, nome: peloId.nome }
      continue
    }
    const n = normalizarNome(atual.nome)
    const peloNome = n ? lista.filter((c) => normalizarNome(c.nome) === n) : []
    ajustes[r.campo] = peloNome.length === 1 ? { id: peloNome[0].id, nome: peloNome[0].nome } : { id: '', nome: atual.nome }
  }
  return { ...no, ajustes }
}

// ---------------------------------------------------------------- expressões nos ajustes

/**
 * O que vem do item e entra num recado: sem o que imita uma marca do Orkester; com mais de uma linha, vai citado em
 * bloco (cada linha com `| `), como o resumo do evento da 1.9.6.
 */
export function valorNoRecado(valor: string): string {
  const s = semMarcasDoOrkester(valor)
  if (!s.includes('\n')) return s
  const citado = limparTextoDoRecado(s)
  return citado ? `\n${citado}\n` : ''
}

/**
 * Os ajustes com as expressões de texto trocadas pelo valor no item (`json`), só nos campos que o catálogo marca.
 * Vale para recado, tarefa, avisar e HTTP; o comando nunca é resolvido. Se e Definir guardam o tipo: o executor usa
 * `resolverValor` campo a campo e aqui eles voltam como estão.
 */
export function resolverAjustes<T extends TipoDeNo>(tipo: T, ajustes: AjustesPorTipo[T], json: unknown): AjustesPorTipo[T] {
  if (tipo === 'logica.se' || tipo === 'logica.definir') return ajustes
  const campos = CATALOGO_[tipo].expressoes
  if (!campos.length) return ajustes
  const limpar = tipo === 'orkester.recado' ? valorNoRecado : undefined
  const r = (t: string): string => resolverTexto(t, json, limpar)
  const saida: Record<string, unknown> = { ...(ajustes as Record<string, unknown>) }
  for (const campo of campos) {
    const [lista, sub] = campo.split('[].')
    const [obj, chave] = campo.split('.')
    if (sub !== undefined) {
      const itens = saida[lista]
      if (Array.isArray(itens)) saida[lista] = itens.map((i: Record<string, unknown>) => (typeof i[sub] === 'string' ? { ...i, [sub]: r(i[sub] as string) } : i))
    } else if (chave !== undefined) {
      const o = saida[obj] as Record<string, unknown> | undefined
      if (o && typeof o[chave] === 'string') saida[obj] = { ...o, [chave]: r(o[chave] as string) }
    } else if (typeof saida[campo] === 'string') saida[campo] = r(saida[campo] as string)
  }
  return saida as AjustesPorTipo[T]
}
