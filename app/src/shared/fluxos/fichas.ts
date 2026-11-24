// Fichas padrão dos fluxos (plano-fluxos-dados §2): um formato só por coisa do Orkester (tarefa, agente, coluna,
// cartão do quadro, andar, espaço, fluxo e execução), o mesmo nos gatilhos, no nó Tarefa e no nó Consultar. Puro:
// quem chama junta os dados (kanban, sessões, arquivo do espaço, disco dos fluxos) e a prova roda no Node.
//
// Regras: datas em ISO (vazio se não houver); texto limpo e cortado; as chaves saem sempre (vazio, `null` ou 0 quando
// não se aplica), para a expressão não depender do tipo. **Nunca saem:** credencial, chave, o `comando`, a `pasta` no
// disco e a `sessao` do terminal, a tela do terminal, caminho completo de arquivo ou pasta, a consulta (`?`) e o `#` da
// URL do portal, os itens e o detalhe das execuções, a lixeira do kanban.
import type { Coluna, PapelDaColuna, Pessoa, Tarefa } from '../kanban'
import type { Esforco } from '../modelos'
import type { Andar, EstadoAndar, No, NoTerminal } from '../modelo'
import type { FluxoGravado, ResumoDaExecucao, ResultadoDaExecucao } from './tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { linha, textoLimpo } from './nos.ts'
// @ts-expect-error idem
import { modeloEfetivo } from '../modelos.ts'

/** O que a ficha de agente lê do cartão (o `comando` só serve para achar o modelo; não sai). */
export type NoDoAgente = Pick<NoTerminal, 'id' | 'nome' | 'agente' | 'comando' | 'funcao' | 'modelo' | 'esforco'>
/** Um cartão do quadro que não é agente. */
export type CartaoDoQuadro = Exclude<No, NoTerminal>
/** O que a ficha de andar lê (do git, só o ramo). */
export type AndarSituacao = Pick<Andar, 'id' | 'nome' | 'status'> & { git: { ramo: string } | null }

/** Tamanhos dos cortes (em letras). */
export const CORTES_DAS_FICHAS = {
  titulo: 120,
  descricao: 1500,
  comentario: 500,
  nome: 80,
  etiqueta: 24,
  textoDoCartao: 2000,
  url: 500,
  erro: 300,
  status: 200
} as const

/** O nome do andar de baixo (o quadro do espaço), que não tem id. */
export const NOME_DO_TERREO = 'Térreo'

export interface Ref {
  id: string
  nome: string
}

export interface FichaDeTarefa {
  numero: number
  /** `#12`: o app não tem link direto para uma tarefa. */
  ref: string
  titulo: string
  descricao: string
  coluna: Ref
  etiquetas: string[]
  responsaveis: Ref[]
  delegadaA: Ref | null
  concluida: boolean
  criadaEm: string
  /** O nome de quem criou. */
  criadaPor: string
  atualizadaEm: string
  concluidaEm: string | null
  /** Quantos comentários. */
  comentarios: number
  ultimoComentario: { por: string; em: string; texto: string } | null
  /** O título ou a descrição foi escrito por um agente (não tem a autoridade do usuário). */
  textoDeAgente: boolean
}

export type EstadoDoAgente = 'livre' | 'trabalhando' | 'pergunta' | 'encerrado' | 'fechado'

export interface FichaDeAgente {
  id: string
  nome: string
  tipo: 'claude' | 'codex' | 'shell'
  funcao: string
  /** O modelo que o processo roda (vazio = o padrão do motor; shell não tem). */
  modelo: string
  esforco: Esforco | ''
  estado: EstadoDoAgente
  /** Térreo: id vazio. */
  andar: Ref
  /** Recados esperando na caixa. */
  fila: number
  /** As tarefas não concluídas em que ele está. */
  tarefas: number[]
}

export interface FichaDeColuna {
  id: string
  nome: string
  papel: PapelDaColuna | ''
  final: boolean
  /** Quantas tarefas (sem a lixeira). */
  tarefas: number
}

export type TipoDeCartao = 'nota' | 'texto' | 'portal' | 'arquivo' | 'pasta' | 'imagem' | 'codigo' | 'banda'

export interface FichaDeCartao {
  id: string
  tipo: TipoDeCartao
  /** Como o `ork quadro` o chama (o portal, sem consulta). */
  nome: string
  andar: Ref
  /** Nota ou texto, até 2000 letras; vazio nos outros. */
  texto: string
  /** Portal: só origem e caminho; vazio nos outros. */
  url: string
}

export interface FichaDeAndar {
  /** Térreo: vazio. */
  id: string
  nome: string
  ramo: string | null
  status: { texto: string; estado: EstadoAndar } | null
  /** Quantos cartões no quadro dele (agentes inclusive). */
  cartoes: number
}

export interface FichaDeEspaco {
  id: string
  nome: string
}

export interface FichaDeFluxo {
  id: string
  nome: string
  ligado: boolean
  /** O nome da pasta da página Fluxos (vazio = fora de pasta). */
  pasta: string
  /** "criado pelo usuário", `criado por "Construtor"`… */
  autoria: string
  ultima: { resultado: ResultadoDaExecucao; em: string } | null
}

export interface FichaDeExecucao {
  id: string
  fluxo: Ref
  modo: 'gatilho' | 'manual'
  inicio: string
  ms: number
  resultado: ResultadoDaExecucao
  erro: string | null
  /** O nome do nó que falhou. */
  noComErro: string | null
}

// ---------------------------------------------------------------- ajudantes

const iso = (ms: number | undefined): string => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : '')
const ref = (p: Pessoa): Ref => ({ id: linha(p.id, CORTES_DAS_FICHAS.nome), nome: linha(p.nome, CORTES_DAS_FICHAS.nome) })
const texto = (v: unknown, max: number): string => textoLimpo(v).slice(0, max)
const nomeDoArquivo = (caminho: string): string => caminho.split(/[/\\]/).filter(Boolean).pop() ?? ''
const umaLinha = (t: string): string => t.replace(/\s+/g, ' ').trim()

/** O andar como ref: `null`/vazio = o térreo. */
export function refDoAndar(andar: { id: string; nome: string } | null | undefined): Ref {
  return andar?.id ? { id: andar.id, nome: linha(andar.nome, CORTES_DAS_FICHAS.nome) } : { id: '', nome: NOME_DO_TERREO }
}

/** Só origem e caminho (sem usuário e senha, `?` e `#`); o que não é http(s) válido sai vazio. */
export function urlSemConsulta(url: unknown): string {
  if (typeof url !== 'string') return ''
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return `${u.origin}${u.pathname}`.slice(0, CORTES_DAS_FICHAS.url)
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- as fichas

export function fichaDeTarefa(t: Tarefa, colunas: readonly Coluna[]): FichaDeTarefa {
  const coluna = colunas.find((c) => c.id === t.coluna)
  const ultimo = t.comentarios.length ? t.comentarios[t.comentarios.length - 1] : undefined
  return {
    numero: t.numero,
    ref: `#${t.numero}`,
    titulo: linha(t.titulo, CORTES_DAS_FICHAS.titulo),
    descricao: texto(t.descricao, CORTES_DAS_FICHAS.descricao),
    coluna: { id: t.coluna, nome: coluna ? linha(coluna.nome, CORTES_DAS_FICHAS.nome) : '' },
    etiquetas: t.etiquetas.map((e) => linha(e, CORTES_DAS_FICHAS.etiqueta)).filter(Boolean),
    responsaveis: t.trabalhando.map(ref),
    delegadaA: t.delegada ? ref(t.delegada) : null,
    concluida: t.concluidaEm !== undefined,
    criadaEm: iso(t.criadaEm),
    criadaPor: linha(t.criadaPor.nome, CORTES_DAS_FICHAS.nome),
    atualizadaEm: iso(t.atualizadaEm),
    concluidaEm: t.concluidaEm !== undefined ? iso(t.concluidaEm) : null,
    comentarios: t.comentarios.length,
    ultimoComentario: ultimo ? { por: linha(ultimo.por.nome, CORTES_DAS_FICHAS.nome), em: iso(ultimo.em), texto: texto(ultimo.texto, CORTES_DAS_FICHAS.comentario) } : null,
    textoDeAgente: !!((t.tituloPor ?? t.criadaPor).id || (t.descricao.trim() && (t.descricaoPor ?? t.criadaPor).id))
  }
}

export function fichaDeAgente(a: {
  no: NoDoAgente
  /** Sem situação = o cartão não tem processo (fechado). */
  situacao?: 'livre' | 'trabalhando' | 'pergunta' | 'encerrado'
  andar?: { id: string; nome: string } | null
  fila?: number
  /** As tarefas do kanban (a ficha tira as do agente). */
  tarefas?: readonly Pick<Tarefa, 'numero' | 'trabalhando' | 'concluidaEm'>[]
}): FichaDeAgente {
  const { no } = a
  const efetivo = modeloEfetivo(no.agente, no.comando, no.modelo, no.esforco)
  return {
    id: no.id,
    nome: linha(no.nome, CORTES_DAS_FICHAS.nome),
    tipo: no.agente,
    funcao: linha(no.funcao, CORTES_DAS_FICHAS.nome),
    modelo: efetivo.modelo ?? '',
    esforco: efetivo.esforco ?? '',
    estado: a.situacao ?? 'fechado',
    andar: refDoAndar(a.andar),
    fila: Math.max(0, Math.floor(a.fila ?? 0)),
    tarefas: (a.tarefas ?? []).filter((t) => t.concluidaEm === undefined && t.trabalhando.some((p) => p.id === no.id)).map((t) => t.numero)
  }
}

export function fichaDeColuna(c: Coluna, tarefas: readonly Pick<Tarefa, 'coluna'>[]): FichaDeColuna {
  return {
    id: c.id,
    nome: linha(c.nome, CORTES_DAS_FICHAS.nome),
    papel: c.papel ?? '',
    final: !!c.final,
    tarefas: tarefas.filter((t) => t.coluna === c.id).length
  }
}

const TIPO_DO_CARTAO: Record<CartaoDoQuadro['tipo'], TipoDeCartao> = {
  postit: 'nota',
  texto: 'texto',
  portal: 'portal',
  arquivo: 'arquivo',
  pasta: 'pasta',
  imagem: 'imagem',
  codigo: 'codigo',
  banda: 'banda'
}

/** Como o `ork quadro` chama o cartão (`rotuloDoNo` de shared/quadro/agente.ts), menos o portal: sem a consulta. */
function nomeDoCartao(no: CartaoDoQuadro): string {
  switch (no.tipo) {
    case 'codigo':
      return no.caminho ? nomeDoArquivo(no.caminho) : 'código (sem arquivo ainda)'
    case 'texto':
      return umaLinha(no.texto).slice(0, 60) || 'texto vazio'
    case 'postit':
      return 'post-it'
    case 'arquivo':
      return no.nomeExibido || nomeDoArquivo(no.caminho)
    case 'pasta':
      return nomeDoArquivo(no.caminho)
    case 'portal':
      return urlSemConsulta(no.url) || 'portal'
    case 'imagem':
      return 'imagem'
    case 'banda':
      return no.nome
  }
}

/**
 * Um cartão do quadro que não é agente. `textoDaNota`: o conteúdo do post-it (está num arquivo; quem chama lê).
 * Terminal não entra aqui: é a ficha de agente.
 */
export function fichaDeCartao(no: CartaoDoQuadro, andar?: { id: string; nome: string } | null, textoDaNota?: string): FichaDeCartao {
  const corpo = no.tipo === 'texto' ? no.texto : no.tipo === 'postit' ? (textoDaNota ?? '') : ''
  return {
    id: no.id,
    tipo: TIPO_DO_CARTAO[no.tipo],
    nome: linha(nomeDoCartao(no), CORTES_DAS_FICHAS.nome),
    andar: refDoAndar(andar),
    texto: texto(corpo, CORTES_DAS_FICHAS.textoDoCartao),
    url: no.tipo === 'portal' ? urlSemConsulta(no.url) : ''
  }
}

/** Um andar; `null` = o térreo (o quadro do espaço). `cartoes`: quantos nós tem o quadro dele. */
export function fichaDeAndar(andar: AndarSituacao | null, cartoes: number): FichaDeAndar {
  if (!andar) return { id: '', nome: NOME_DO_TERREO, ramo: null, status: null, cartoes }
  return {
    id: andar.id,
    nome: linha(andar.nome, CORTES_DAS_FICHAS.nome),
    ramo: andar.git?.ramo ? linha(andar.git.ramo, CORTES_DAS_FICHAS.nome) : null,
    status: andar.status ? { texto: linha(andar.status.texto, CORTES_DAS_FICHAS.status), estado: andar.status.estado } : null,
    cartoes
  }
}

export function fichaDeEspaco(e: { id: string; nome: string }): FichaDeEspaco {
  return { id: e.id, nome: linha(e.nome, CORTES_DAS_FICHAS.nome) }
}

/**
 * Um fluxo. `pastas`: as da página Fluxos (para o nome); `autoria`: o texto de `autoriaDoFluxo` (main/fluxos);
 * `ultima`: a execução mais recente, se houver.
 */
export function fichaDeFluxo(
  f: Pick<FluxoGravado, 'id' | 'nome' | 'ligado' | 'pasta'>,
  extra: { pastas?: readonly { id: string; nome: string }[]; autoria: string; ultima?: Pick<ResumoDaExecucao, 'resultado' | 'inicio'> | null }
): FichaDeFluxo {
  const pasta = f.pasta ? extra.pastas?.find((p) => p.id === f.pasta) : undefined
  return {
    id: f.id,
    nome: linha(f.nome, CORTES_DAS_FICHAS.nome),
    ligado: f.ligado,
    pasta: pasta ? linha(pasta.nome, CORTES_DAS_FICHAS.nome) : '',
    autoria: linha(extra.autoria, 200),
    ultima: extra.ultima ? { resultado: extra.ultima.resultado, em: extra.ultima.inicio } : null
  }
}

/** Uma execução, pelo resumo (a linha do `.jsonl`): nada dos itens nem do detalhe. */
export function fichaDeExecucao(r: ResumoDaExecucao, fluxo: Pick<FluxoGravado, 'id' | 'nome'> & { nos?: readonly { id: string; nome: string }[] }): FichaDeExecucao {
  const no = r.noComErro ? (fluxo.nos?.find((n) => n.id === r.noComErro)?.nome ?? r.noComErro) : null
  return {
    id: r.id,
    fluxo: { id: fluxo.id, nome: linha(fluxo.nome, CORTES_DAS_FICHAS.nome) },
    modo: r.modo,
    inicio: r.inicio,
    ms: r.ms,
    resultado: r.resultado,
    erro: r.erro ? linha(r.erro, CORTES_DAS_FICHAS.erro) : null,
    noComErro: no ? linha(no, CORTES_DAS_FICHAS.nome) : null
  }
}

/**
 * O item do gatilho em linhas `campo: valor`, para o "O que aconteceu" do recado (main/fluxos/index.ts). Só os campos
 * simples (texto, número, sim/não): as fichas (`tarefa`, `quemEntregou`…) e as listas não viram JSON no recado.
 */
export function resumoDoItem(item: { json: Record<string, unknown> }): string {
  return Object.entries(item.json)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n')
}
