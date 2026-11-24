// Fluxos (1.9.6): os TIPOS do contrato, sem nada de execução. Front-end, motor, disco e `ork` dependem só disto e de
// `formato.ts` (que valida). Ligações por id do nó (renomear não reescreve nada); o `nome` é único no fluxo e é o que a
// tela mostra e o que o `$('Nome')` do nó Código usa. Repositório público: nada de código, ícone ou texto do n8n.
import type { QuandoDaRotina } from '../modelo'
import type { ComoParou, CriadaPor, EditadaPor } from '../automacoes'

export type { ComoParou, CriadaPor, EditadaPor, QuandoDaRotina }

/** Um item que passa de nó em nó. Sem binário na 1.9.6. */
export type Item = { json: Record<string, unknown> }

export type TipoDeNo =
  | 'gatilho.kanban'
  | 'gatilho.entrega'
  | 'gatilho.parou'
  | 'gatilho.relogio'
  | 'gatilho.manual'
  | 'orkester.recado'
  | 'orkester.tarefa'
  | 'orkester.comando'
  | 'orkester.avisar'
  | 'orkester.consultar'
  | 'logica.se'
  | 'logica.definir'
  | 'fora.codigo'
  | 'fora.http'

export type CategoriaDoNo = 'gatilho' | 'orkester' | 'logica' | 'fora'

/**
 * Um cartão ou uma coluna do espaço: o id e o nome (o nome é o que resolve um fluxo colado em outro espaço).
 * `id: ''` = "a escolher" (o nome não bateu com nada do espaço): o fluxo não liga enquanto houver um.
 * Em destino de recado, `id: 'maestro'` é o Maestro vivo do espaço na hora.
 */
export interface Referencia {
  id: string
  nome: string
}

/** Uma linha nome → valor (consulta e cabeçalhos do HTTP, campos do Definir). O valor aceita expressão. */
export interface ParNomeValor {
  nome: string
  valor: string
}

export type OperadorDoSe =
  | 'igual'
  | 'diferente'
  | 'contem'
  | 'nao-contem'
  | 'comeca'
  | 'termina'
  | 'vazio'
  | 'nao-vazio'
  | 'maior'
  | 'menor'
  | 'verdadeiro'
  | 'falso'

/** `valor` e `comparar` aceitam expressão. `vazio`, `nao-vazio`, `verdadeiro` e `falso` ignoram `comparar`. */
export interface CondicaoDoSe {
  valor: string
  operador: OperadorDoSe
  comparar: string
}

/** O que o nó Consultar lê (só o espaço do fluxo; plano-fluxos-dados §3). */
export type RecursoDaConsulta = 'tarefa' | 'coluna' | 'agente' | 'cartao' | 'andar' | 'espaco' | 'fluxo' | 'execucao'
export type OperacaoDaConsulta = 'um' | 'varios'

/**
 * Os ajustes do Consultar. Cada recurso usa só os filtros dele (o validador tira os outros); os de texto marcados
 * aceitam `{{ }}`. "um" acha uma coisa (nada = erro do nó); "vários" solta 0 ou mais itens, até `limite`.
 */
export interface AjustesDaConsulta {
  recurso: RecursoDaConsulta
  operacao: OperacaoDaConsulta
  /** "vários": 1 a 100 (padrão 20; execução: no máximo 20). */
  limite: number
  /** tarefa "um": o número (`12`, `#12` ou `{{ numero }}`). */
  numero?: string
  /** tarefa "vários" (filtro) e coluna "um". */
  coluna?: Referencia
  /** tarefa "vários": tem esta etiqueta. `{{ }}`. */
  etiqueta?: string
  /** tarefa "vários": este cartão está nela. */
  responsavel?: Referencia
  /** tarefa "vários" (título ou descrição) e cartão "vários" (nome ou texto): contém, sem diferenciar maiúsculas. `{{ }}`. */
  contem?: string
  /** tarefa "vários": entram também as concluídas. */
  concluidas?: boolean
  /** agente "um" (aceita o Maestro). */
  agente?: Referencia
  /** agente "vários" (claude, codex, shell) e cartão "vários" (nota, texto, portal…). */
  tipo?: string
  /** agente "vários": livre, trabalhando, pergunta, encerrado ou fechado. */
  estado?: string
  /** agente "vários": a função (sem caixa nem acento). */
  funcao?: string
  /** cartão "um" (exato), andar "um" e fluxo "um" (vazio = este fluxo). `{{ }}`. */
  nome?: string
  /** cartão "vários": o nome do andar ("Térreo" = o quadro do espaço). */
  andar?: string
  /** fluxo "vários": só os ligados. */
  ligados?: boolean
  /** execução "vários": o nome do fluxo (vazio = este). */
  fluxo?: string
}

export type MetodoHttp = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
export type CorpoHttp = { tipo: 'nenhum' | 'json' | 'texto' | 'formulario'; valor: string }

/** Os ajustes de cada tipo, já normalizados (o que `lerFluxo` devolve). */
export interface AjustesPorTipo {
  /** Movimento feito por fluxo nunca conta. */
  'gatilho.kanban': { paraColuna: Referencia; deColuna?: Referencia; por: 'usuario' | 'agente' | 'qualquer' }
  /** Ausente = qualquer. `contem`: sem diferenciar maiúsculas. */
  'gatilho.entrega': { de?: Referencia; para?: Referencia; contem?: string }
  'gatilho.parou': { agente?: Referencia; como: ComoParou[] }
  'gatilho.relogio': { quando: QuandoDaRotina }
  'gatilho.manual': Record<string, never>
  /** `para` aceita `maestro`. `entregaPara` padrão: o Maestro. */
  'orkester.recado': { para: Referencia; texto: string; juntarEvento: boolean; entregaPara?: Referencia }
  /** `coluna` ausente = a de papel `entrada`. */
  'orkester.tarefa': { titulo: string; descricao?: string; coluna?: Referencia }
  /** Texto fixo (sem expressão), digitado num cartão shell do espaço quando ele está livre. Sensível. */
  'orkester.comando': { terminal: Referencia; comando: string }
  'orkester.avisar': { texto: string }
  /** Só leitura, só no espaço do fluxo. Um item de saída por ficha (shared/fluxos/fichas.ts). Não é sensível. */
  'orkester.consultar': AjustesDaConsulta
  'logica.se': { condicoes: CondicaoDoSe[]; combinar: 'e' | 'ou' }
  /** `nome` é um caminho (`a.b`); `manterOutros: false` = o item sai só com os campos definidos. */
  'logica.definir': { campos: ParNomeValor[]; manterOutros: boolean }
  /** JavaScript isolado (sem disco, sem rede, 5 s). Sensível. */
  'fora.codigo': { codigo: string }
  /** `credencial`: só o NOME da credencial global; o valor nunca entra no fluxo. Sensível. */
  'fora.http': { metodo: MetodoHttp; url: string; consulta: ParNomeValor[]; cabecalhos: ParNomeValor[]; corpo: CorpoHttp; credencial?: string }
}

export interface NoDoFluxo {
  id: string
  /** Único no fluxo (sem diferenciar maiúsculas), uma linha, até 60 letras. */
  nome: string
  tipo: TipoDeNo
  versaoDoTipo: 1
  posicao: [number, number]
  /** Validado por tipo em `nos.ts`; depois de `lerFluxo`, tem a forma de `AjustesPorTipo[tipo]`. */
  ajustes: Record<string, unknown>
  notas?: string
}

/** Um nó com os ajustes tipados (para os formulários e o executor). */
export type NoTipado<T extends TipoDeNo = TipoDeNo> = T extends TipoDeNo ? Omit<NoDoFluxo, 'tipo' | 'ajustes'> & { tipo: T; ajustes: AjustesPorTipo[T] } : never

/** `saida`: no Se, 0 = verdadeiro e 1 = falso; nos outros, sempre 0. */
export interface Ligacao {
  de: string
  saida: number
  para: string
}

/** O que vai no Ctrl+C e no `ork fluxo ver --json`: sem id, ligado, pasta, autor, teto, rede nem aprovação. */
export interface FluxoExportado {
  orkester: 'fluxo'
  versao: 1
  nome: string
  nos: NoDoFluxo[]
  ligacoes: Ligacao[]
}

/** `coluna-sumiu`: uma coluna que o gatilho ou o nó Tarefa usa saiu do kanban (1.9.6, D1). */
export type MotivoDoDesligado = 'excesso' | 'cartao-sumiu' | 'mudou-sem-aprovacao' | 'coluna-sumiu'

export interface FluxoGravado extends FluxoExportado {
  id: string
  ligado: boolean
  /** id da pasta no `indice.json`; ausente = raiz. */
  pasta?: string
  criadoEm: string
  criadoPor?: CriadaPor
  editadoPor?: EditadaPor
  /** 1..30, padrão 6 (a trava da 1.9.6, agora por fluxo). */
  limite: { porHora: number }
  /**
   * Os endereços desta máquina ou da rede local (`host:porta` canônico, `shared/fluxos/rede.ts`) que o HTTP deste fluxo
   * pode usar. Só o usuário muda, pela página; entra no selo. Ausente (ou vazia) = o HTTP recusa todo endereço local.
   */
  rede?: { locaisPermitidos: string[] }
  /** `nos`: id do nó sensível → hash de `assinaturaDoNo`; `selo`: HMAC feito no main. */
  aprovado?: { em: string; nos: Record<string, string>; selo: string }
  desligadoPor?: { motivo: MotivoDoDesligado; em: string }
}

// ---------------------------------------------------------------- disco (`~/.orkester/espacos/<id>/fluxos/`)

export interface PastaDeFluxos {
  id: string
  nome: string
  pai?: string
}

/** `indice.json`. `ordem`: ids dos fluxos na ordem da lista. */
export interface IndiceDeFluxos {
  versao: 1
  pastas: PastaDeFluxos[]
  ordem: string[]
  exemplosCriados?: true
}

// ---------------------------------------------------------------- execução

export type ResultadoDaExecucao = 'ok' | 'erro' | 'barrado-laco' | 'barrado-taxa' | 'sem-destino'
export type EstadoDoNo = 'ok' | 'erro' | 'nao-rodou'

export interface NoNaExecucao {
  estado: EstadoDoNo
  ms: number
  entrada: Item[]
  /** Uma lista por saída do nó (o Se tem 2). */
  saidas: Item[][]
  /** As contagens de verdade, mesmo quando `entrada`/`saidas` foram cortadas. */
  itens: { entrada: number; saidas: number[] }
  /** Passou de ~10 KB e foi cortado. */
  cortado?: true
  erro?: string
  /** O resultado do recado (entregue, na fila, sem destino…). */
  recado?: string
  /** `console.log` do Código: até 50 linhas e 2 KB. */
  log?: string[]
}

/** `execucoes/<fluxoId>/<execId>.json`. Nenhuma credencial entra aqui. */
export interface Execucao {
  id: string
  fluxo: string
  modo: 'gatilho' | 'manual'
  /** Resumo do que disparou, até 120 letras. */
  gatilho: string
  cadeia: string[]
  inicio: string
  ms: number
  resultado: ResultadoDaExecucao
  /** ids dos nós na ordem em que rodaram. */
  caminho: string[]
  nos: Record<string, NoNaExecucao>
  /** O motivo de um barrado, pulado ou não aprovado, e o que esperou na fila (nada rodou ou rodou depois de esperar). */
  detalhe?: string
}

/** Uma linha de `execucoes/<fluxoId>.jsonl`. */
export type ResumoDaExecucao = Pick<Execucao, 'id' | 'modo' | 'gatilho' | 'inicio' | 'ms' | 'resultado' | 'detalhe'> & { erro?: string; noComErro?: string }

// ---------------------------------------------------------------- saídas dos gatilhos e das ações (o `json` do item)

export interface SaidaDoKanban {
  numero: number
  titulo: string
  deColuna: string
  paraColuna: string
  deColunaNome: string
  paraColunaNome: string
  por: 'usuario' | 'agente'
  quem: string
}
/** `texto` até 1500 letras. */
export interface SaidaDaEntrega {
  de: string | null
  deNome: string
  para: string
  paraNome: string
  texto: string
}
export interface SaidaDoParou {
  agente: string
  agenteNome: string
  como: ComoParou
}
/** Relógio e Manual. */
export interface SaidaDoRelogio {
  em: string
}
export interface SaidaDoRecado {
  para: string
  paraNome: string
  resultado: string
  posicao?: number
}
export interface SaidaDaTarefa {
  numero: number
  titulo: string
  coluna: string
}
