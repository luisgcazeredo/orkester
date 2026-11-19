// Kanban (página): o que cada coluna mostra com os filtros do topo, os chips de quem trabalha em cada tarefa (e o do
// Maestro, na coluna de delegar) e a posição em que uma tarefa arrastada cai. Puro (sem DOM, sem React): a
// `filtros.prova` roda no Node. Palavra: o item do kanban é **tarefa**; **cartão** é o do agente no quadro.
import type { AgenteDoKanban, ArquivoDoKanban, Coluna, LeituraDoKanban, Posicao, Tarefa } from '../../../../shared/kanban'

/** Sete dias: "esconder Feito com mais de 7 dias". */
export const FEITO_ANTIGO_MS = 7 * 24 * 60 * 60 * 1000

export interface FiltroDaPagina {
  /** Título, descrição ou número (`12`, `#12`). Sem caixa nem acento. */
  busca: string
  /** `todos`, `ninguem` (ninguém na lista `trabalhando`) ou o id do cartão de quem está na lista. */
  quem: string
  /** `''` = todas; senão o nome da etiqueta (sem caixa nem acento). */
  etiqueta: string
  /** Esconde da coluna final o que foi concluído há mais de 7 dias. */
  esconderFeitoAntigo: boolean
}

export const FILTRO_INICIAL: FiltroDaPagina = { busca: '', quem: 'todos', etiqueta: '', esconderFeitoAntigo: true }

const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()

/** Algum filtro além do "esconder Feito antigo" (que é o padrão) está ligado. */
export function filtrando(f: FiltroDaPagina): boolean {
  return !!f.busca.trim() || f.quem !== 'todos' || !!f.etiqueta
}

/** A tarefa passa nos filtros? `final`: ela está na coluna final. */
export function passaNoFiltro(t: Tarefa, f: FiltroDaPagina, final: boolean, agora: number): boolean {
  if (f.quem === 'ninguem' ? t.trabalhando.length > 0 : f.quem !== 'todos' && !t.trabalhando.some((p) => p.id === f.quem)) return false
  if (f.etiqueta && !t.etiquetas.some((e) => normalizar(e) === normalizar(f.etiqueta))) return false
  if (final && f.esconderFeitoAntigo && agora - (t.concluidaEm ?? t.atualizadaEm) > FEITO_ANTIGO_MS) return false
  const b = normalizar(f.busca)
  if (b) {
    const numero = b.replace(/^#/, '')
    if (/^\d+$/.test(numero)) return String(t.numero) === numero || normalizar(t.titulo).includes(b)
    return normalizar(t.titulo).includes(b) || normalizar(t.descricao).includes(b)
  }
  return true
}

export interface ColunaNaTela {
  id: string
  nome: string
  final: boolean
  papel?: Coluna['papel']
  /** Todas as tarefas da coluna, na ordem. */
  todas: Tarefa[]
  /** As que passam nos filtros, na ordem. */
  visiveis: Tarefa[]
}

/** As colunas do arquivo, cada uma com as tarefas em ordem e as que passam nos filtros. */
export function colunasNaTela(arquivo: ArquivoDoKanban, f: FiltroDaPagina, agora: number): ColunaNaTela[] {
  return arquivo.colunas.map((c) => {
    const todas = arquivo.tarefas.filter((t) => t.coluna === c.id).sort((a, b) => a.ordem - b.ordem || a.numero - b.numero)
    return { id: c.id, nome: c.nome, final: !!c.final, papel: c.papel, todas, visiveis: todas.filter((t) => passaNoFiltro(t, f, !!c.final, agora)) }
  })
}

/** A coluna com o papel pedido (há no máximo uma de cada). */
export function colunaDoPapel(arquivo: Pick<ArquivoDoKanban, 'colunas'>, papel: NonNullable<Coluna['papel']>): Coluna | undefined {
  return arquivo.colunas.find((c) => c.papel === papel)
}

/** As etiquetas em uso, sem repetir (sem caixa nem acento), em ordem alfabética. */
export function etiquetasEmUso(arquivo: ArquivoDoKanban): string[] {
  const vistas = new Map<string, string>()
  for (const t of arquivo.tarefas) for (const e of t.etiquetas) if (!vistas.has(normalizar(e))) vistas.set(normalizar(e), e)
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** O ponto de cada chip. `sem-cartao`: o cartão do agente foi apagado (a tarefa guarda o nome). */
export type SituacaoDoChip = NonNullable<AgenteDoKanban['situacao']> | 'sem-cartao' | 'desconhecida'

export const TEXTO_DA_SITUACAO: Record<SituacaoDoChip, string> = {
  livre: 'livre',
  trabalhando: 'ocupado',
  pergunta: 'numa pergunta',
  encerrado: 'fechado',
  'sem-cartao': 'cartão não existe mais',
  desconhecida: 'situação desconhecida'
}

/** Um chip: quem, o nome a mostrar e o ponto. */
export interface Chip {
  id: string
  nome: string
  situacao: SituacaoDoChip
}

/** A situação vem da leitura; o nome é o de agora, se o cartão existe, senão o guardado na tarefa. */
export function chipDe(p: { id: string; nome: string }, agentes: readonly AgenteDoKanban[]): Chip {
  const vivo = agentes.find((a) => a.id === p.id)
  return { id: p.id, nome: vivo?.nome ?? p.nome, situacao: vivo ? (vivo.situacao ?? 'desconhecida') : 'sem-cartao' }
}

/** Os chips da lista `trabalhando`, na ordem em que entraram. Quem fechou continua na lista (chip apagado). */
export function chipsDaTarefa(t: Pick<Tarefa, 'trabalhando'>, agentes: readonly AgenteDoKanban[]): Chip[] {
  return t.trabalhando.map((p) => chipDe(p, agentes))
}

/** Quem está na lista de alguma tarefa e cujo cartão saiu do quadro (entra no filtro pelo nome guardado). */
export function semCartao(arquivo: ArquivoDoKanban, agentes: readonly AgenteDoKanban[]): [string, string][] {
  const vistos = new Map<string, string>()
  for (const t of arquivo.tarefas) for (const p of t.trabalhando) if (!agentes.some((a) => a.id === p.id) && !vistos.has(p.id)) vistos.set(p.id, p.nome)
  return [...vistos.entries()]
}

export type MaestroDaLeitura = NonNullable<LeituraDoKanban['maestro']>

/** O cabeçalho da coluna de delegar: "→ Maestro (livre)", "→ Maestro (ocupado · fila 2)" ou "sem Maestro". */
export function textoDoMaestro(m: MaestroDaLeitura | null | undefined): string {
  if (!m) return 'sem Maestro'
  const situacao = TEXTO_DA_SITUACAO[m.situacao ?? 'desconhecida']
  return `→ ${m.nome} (${situacao}${m.fila ? ` · fila ${m.fila}` : ''})`
}

/**
 * O chip da tarefa na coluna de delegar: o Maestro a quem ela foi delegada. `naFila`: ele não está livre e tem recados
 * esperando (deduzido: a leitura não diz se ESTE pedido já foi entregue, só que há fila).
 */
export function chipDoMaestro(
  t: Pick<Tarefa, 'delegada'>,
  maestro: MaestroDaLeitura | null | undefined,
  agentes: readonly AgenteDoKanban[]
): (Chip & { naFila: boolean }) | null {
  if (!t.delegada) return null
  const chip = chipDe(t.delegada, agentes)
  const mesmo = !!maestro && maestro.id === t.delegada.id
  return {
    ...chip,
    situacao: mesmo && maestro.situacao ? maestro.situacao : chip.situacao,
    naFila: mesmo && !!maestro.fila && maestro.situacao !== 'livre'
  }
}

/**
 * Onde a tarefa arrastada cai, em termos da operação `mover`. A tela mostra só as `visiveis` (filtros); a soltura
 * diz o índice entre elas, sem contar a arrastada (0 = antes da primeira; o tamanho = depois da última). O `mover` conta a
 * posição na coluna INTEIRA sem a tarefa arrastada (1 = topo): cair antes da visível X é ficar no lugar de X.
 */
export function posicaoDaSoltura(todas: readonly number[], visiveis: readonly number[], indiceVisivel: number, arrastada: number): Posicao {
  const semEla = todas.filter((n) => n !== arrastada)
  const vistas = visiveis.filter((n) => n !== arrastada)
  if (!vistas.length) return 'fim'
  if (indiceVisivel >= vistas.length) {
    const ultima = semEla.indexOf(vistas[vistas.length - 1])
    return ultima + 2 > semEla.length ? 'fim' : ultima + 2
  }
  const alvo = semEla.indexOf(vistas[Math.max(0, indiceVisivel)])
  return alvo <= 0 ? 'topo' : alvo + 1
}

/** A soltura não muda nada (mesma coluna, mesmo lugar)? Evita gravar e "atualizar" à toa. */
export function soltouNoMesmoLugar(todas: readonly number[], arrastada: number, posicao: Posicao): boolean {
  const atual = todas.indexOf(arrastada)
  if (atual < 0) return false
  const tamanho = todas.length - 1
  const destino = posicao === 'topo' ? 0 : posicao === 'fim' ? tamanho : Math.min(Math.max(1, posicao), tamanho + 1) - 1
  return destino === atual
}
