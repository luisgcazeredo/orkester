// Nó "Consultar o Orkester" (T4): a lógica do formulário, sem React e sem DOM (a `consulta.prova` roda no Node). O que o
// formulário mostra para cada recurso e operação sai das tabelas do contrato (`FILTROS_DA_CONSULTA` e companhia, em
// shared/fluxos/nos.ts), as mesmas que o validador usa: tela e validação não podem divergir.
import type { AjustesDaConsulta, OperacaoDaConsulta, RecursoDaConsulta } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ESTADOS_DE_AGENTE_DA_CONSULTA, FILTROS_DA_CONSULTA, LIMITE_PADRAO_DA_CONSULTA, MAX_EXECUCOES_DA_CONSULTA, MAX_LIMITE_DA_CONSULTA, OPERACOES_DA_CONSULTA, RECURSOS_DA_CONSULTA, TIPOS_DE_AGENTE_DA_CONSULTA, TIPOS_DE_CARTAO_DA_CONSULTA } from '../../../../../shared/fluxos/nos.ts'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_CONTEM, MAX_NOME } from '../../../../../shared/automacoes.ts'

export const RECURSOS: readonly RecursoDaConsulta[] = RECURSOS_DA_CONSULTA

export const ROTULO_DO_RECURSO: Record<RecursoDaConsulta, string> = {
  tarefa: 'Tarefas do kanban',
  coluna: 'Colunas do kanban',
  agente: 'Agentes (cartões de terminal)',
  cartao: 'Cartões do quadro',
  andar: 'Andares',
  espaco: 'O espaço',
  fluxo: 'Fluxos',
  execucao: 'Execuções de fluxo'
}

type Filtro = keyof AjustesDaConsulta

/** Como cada filtro é desenhado. `expressao`: aceita `{{ }}` (as mesmas quatro do catálogo: numero, etiqueta, contem, nome). */
export interface CampoDoFiltro {
  campo: Filtro
  rotulo: string
  tipo: 'texto' | 'coluna' | 'cartao' | 'opcoes' | 'marcar'
  expressao: boolean
  /** O "um" cobra este campo: sem ele o nó não vale. */
  obrigatorio: boolean
  dica?: string
  max?: number
  opcoes?: readonly string[]
  /** O texto da opção vazia (filtro de um "vários") ou da caixa marcada. */
  qualquer?: string
}

const EXPRESSAO: readonly Filtro[] = ['numero', 'etiqueta', 'contem', 'nome']

/** Os ajustes lidos com cuidado: recurso e operação sempre válidos (o que não vale cai no primeiro da lista). */
export function recursoEOperacao(a: Record<string, unknown>): { recurso: RecursoDaConsulta; operacao: OperacaoDaConsulta } {
  const recurso = (RECURSOS as readonly unknown[]).includes(a.recurso) ? (a.recurso as RecursoDaConsulta) : 'tarefa'
  const operacoes = OPERACOES_DA_CONSULTA[recurso]
  const operacao = (operacoes as readonly unknown[]).includes(a.operacao) ? (a.operacao as OperacaoDaConsulta) : operacoes[0]
  return { recurso, operacao }
}

/** Os filtros do recurso e da operação, na ordem do contrato. */
export const filtrosDoNo = (a: Record<string, unknown>): readonly Filtro[] => {
  const { recurso, operacao } = recursoEOperacao(a)
  return FILTROS_DA_CONSULTA[recurso][operacao] ?? []
}

/** O teto do `limite`: 100, e 20 nas execuções. */
export const limiteMaximo = (recurso: RecursoDaConsulta): number => (recurso === 'execucao' ? MAX_EXECUCOES_DA_CONSULTA : MAX_LIMITE_DA_CONSULTA)

/** Só o "vários" tem limite (o "um" acha uma coisa). */
export const temLimite = (a: Record<string, unknown>): boolean => recursoEOperacao(a).operacao === 'varios'

export const limiteDoNo = (a: Record<string, unknown>): number => {
  const n = a.limite
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? Math.min(n, limiteMaximo(recursoEOperacao(a).recurso)) : LIMITE_PADRAO_DA_CONSULTA
}

/** Fica só o que serve: os filtros do recurso e da operação, mais o recurso, a operação e o limite. */
function soOsFiltros(a: Record<string, unknown>, recurso: RecursoDaConsulta, operacao: OperacaoDaConsulta): Record<string, unknown> {
  const saida: Record<string, unknown> = { recurso, operacao, limite: a.limite ?? LIMITE_PADRAO_DA_CONSULTA }
  for (const f of FILTROS_DA_CONSULTA[recurso][operacao] ?? []) if (a[f] !== undefined) saida[f] = a[f]
  return saida
}

/**
 * Trocar o recurso limpa os filtros do anterior. Fica a operação se o novo recurso a tem; senão, a primeira dele. O
 * limite fica, mas dentro do teto do recurso (execução: 20).
 */
export function trocarRecurso(a: Record<string, unknown>, recurso: RecursoDaConsulta): Record<string, unknown> {
  const antes = recursoEOperacao(a)
  const operacoes = OPERACOES_DA_CONSULTA[recurso]
  const operacao = operacoes.includes(antes.operacao) ? antes.operacao : operacoes[0]
  // nenhum filtro é herdado (`coluna` de tarefa e `coluna` de coluna são coisas diferentes): fica só o limite
  const novo = soOsFiltros({ limite: a.limite }, recurso, operacao)
  novo.limite = Math.min(typeof novo.limite === 'number' ? novo.limite : LIMITE_PADRAO_DA_CONSULTA, limiteMaximo(recurso))
  return novo
}

/** Trocar a operação limpa os filtros que ela não tem. */
export function trocarOperacao(a: Record<string, unknown>, operacao: OperacaoDaConsulta): Record<string, unknown> {
  const { recurso } = recursoEOperacao(a)
  if (!OPERACOES_DA_CONSULTA[recurso].includes(operacao)) return a
  return soOsFiltros({ limite: a.limite }, recurso, operacao)
}

export const ROTULO_DA_OPERACAO: Record<OperacaoDaConsulta, string> = { um: 'uma só', varios: 'várias' }

/** O texto que a pessoa lê na opção de operação, por recurso ("uma só: pelo número", "várias: com filtros"). */
export function rotuloDaOperacao(recurso: RecursoDaConsulta, operacao: OperacaoDaConsulta): string {
  if (operacao === 'varios') return recurso === 'execucao' ? 'as últimas' : 'várias'
  return { tarefa: 'uma só, pelo número', coluna: 'uma só, escolhida', agente: 'um só, escolhido', cartao: 'um só, pelo nome', andar: 'um só, pelo nome', espaco: 'o deste fluxo', fluxo: 'um só, pelo nome', execucao: '' }[recurso]
}

/** Os campos de filtro do formulário, para o recurso e a operação em vigor. */
export function camposDoNo(a: Record<string, unknown>): CampoDoFiltro[] {
  const { recurso, operacao } = recursoEOperacao(a)
  const um = operacao === 'um'
  const feito = (campo: Filtro, resto: Omit<CampoDoFiltro, 'campo' | 'expressao' | 'obrigatorio'> & { obrigatorio?: boolean }): CampoDoFiltro => ({
    campo,
    expressao: EXPRESSAO.includes(campo),
    obrigatorio: resto.obrigatorio ?? false,
    ...resto
  })
  return filtrosDoNo(a).map((campo): CampoDoFiltro => {
    switch (campo) {
      case 'numero':
        return feito(campo, { rotulo: 'Número da tarefa', tipo: 'texto', obrigatorio: true, dica: '12 ou {{ numero }}', max: 40 })
      case 'coluna':
        return um
          ? feito(campo, { rotulo: 'Coluna', tipo: 'coluna', obrigatorio: true })
          : feito(campo, { rotulo: 'Na coluna', tipo: 'coluna', qualquer: 'qualquer coluna' })
      case 'etiqueta':
        return feito(campo, { rotulo: 'Com a etiqueta', tipo: 'texto', dica: '(qualquer)', max: 24 })
      case 'responsavel':
        return feito(campo, { rotulo: 'Responsável', tipo: 'cartao', qualquer: 'qualquer um' })
      case 'contem':
        return feito(campo, {
          rotulo: recurso === 'tarefa' ? 'Contém (no título ou na descrição)' : 'Contém (no nome ou no texto)',
          tipo: 'texto',
          dica: '(qualquer texto)',
          max: MAX_CONTEM
        })
      case 'concluidas':
        return feito(campo, { rotulo: 'Concluídas', tipo: 'marcar', qualquer: 'incluir as tarefas já concluídas' })
      case 'agente':
        return feito(campo, { rotulo: 'Agente', tipo: 'cartao', obrigatorio: true })
      case 'tipo':
        return feito(campo, {
          rotulo: recurso === 'agente' ? 'Tipo de agente' : 'Tipo de cartão',
          tipo: 'opcoes',
          opcoes: recurso === 'agente' ? TIPOS_DE_AGENTE_DA_CONSULTA : TIPOS_DE_CARTAO_DA_CONSULTA,
          qualquer: 'qualquer tipo'
        })
      case 'estado':
        return feito(campo, { rotulo: 'Estado', tipo: 'opcoes', opcoes: ESTADOS_DE_AGENTE_DA_CONSULTA, qualquer: 'qualquer estado' })
      case 'funcao':
        return feito(campo, { rotulo: 'Função', tipo: 'texto', dica: '(qualquer)', max: MAX_NOME })
      case 'nome':
        return recurso === 'fluxo'
          ? feito(campo, { rotulo: 'Nome do fluxo', tipo: 'texto', dica: '(vazio = este fluxo)', max: MAX_NOME })
          : feito(campo, { rotulo: recurso === 'andar' ? 'Nome do andar' : 'Nome do cartão', tipo: 'texto', obrigatorio: true, dica: recurso === 'andar' ? 'Térreo ou o nome do andar' : 'o nome, exato', max: MAX_NOME })
      case 'andar':
        return feito(campo, { rotulo: 'No andar', tipo: 'texto', dica: '(qualquer; "Térreo" é o quadro do espaço)', max: MAX_NOME })
      case 'ligados':
        return feito(campo, { rotulo: 'Ligados', tipo: 'marcar', qualquer: 'só os fluxos ligados' })
      case 'fluxo':
        return feito(campo, { rotulo: 'Do fluxo', tipo: 'texto', dica: '(vazio = este fluxo)', max: MAX_NOME })
      default:
        return feito(campo, { rotulo: String(campo), tipo: 'texto' })
    }
  })
}

/** O que a consulta devolve e o que acontece quando não acha: a nota fixa sob o formulário. */
export function notaDoNo(a: Record<string, unknown>): string {
  const { recurso, operacao } = recursoEOperacao(a)
  if (recurso === 'espaco') return 'Solta um item: a ficha do espaço deste fluxo.'
  if (operacao === 'um') return 'Solta um item: a ficha. Se não achar, o nó dá erro e o fluxo para aqui.'
  const quantos = recurso === 'execucao' ? `até ${MAX_EXECUCOES_DA_CONSULTA}` : `até o limite (no máximo ${MAX_LIMITE_DA_CONSULTA})`
  return `Solta um item por ficha, ${quantos}. Se nada casar, solta 0 itens, sem erro.`
}
