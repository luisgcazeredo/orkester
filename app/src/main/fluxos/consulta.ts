// O nó "Consultar o Orkester" (plano-fluxos-dados §3): só leitura, só no espaço do fluxo. Puro: o mundo (kanban,
// espaço salvo, sessões abertas, notas, fluxos e execuções) chega por `FontesDaConsulta`, sempre pedido com o id do
// espaço do fluxo, e a prova roda no Node com um espaço falso. Nada aqui escreve.
//
// "um" acha uma coisa (nada, ou mais de uma no cartão pelo nome = erro do nó); "vários" devolve de 0 até `limite`
// fichas (e `total`: quantas casaram). As fichas são as de shared/fluxos/fichas.ts: nada de comando, sessão, pasta de
// disco, credencial ou tela do terminal.
import type { Coluna, Tarefa } from '../../shared/kanban'
import type { Andar, No, NoTerminal } from '../../shared/modelo'
import type { AjustesDaConsulta, FluxoGravado, ResumoDaExecucao } from '../../shared/fluxos/tipos'
import type { CartaoDoQuadro, EstadoDoAgente, FichaDeAgente, NoDoAgente } from '../../shared/fluxos/fichas'
import type { ResultadoDaConsulta } from '../../shared/fluxos/executor'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { fichaDeAgente, fichaDeAndar, fichaDeCartao, fichaDeColuna, fichaDeEspaco, fichaDeExecucao, fichaDeFluxo, fichaDeTarefa, NOME_DO_TERREO } from '../../shared/fluxos/fichas.ts'
// @ts-expect-error idem
import { MAX_EXECUCOES_DA_CONSULTA } from '../../shared/fluxos/nos.ts'

/** O espaço salvo, no que a consulta lê (o arquivo: o que acabou de mudar na tela pode levar uns segundos). */
export interface EspacoDaConsulta {
  id: string
  nome: string
  nos: readonly No[]
  andares: readonly (Pick<Andar, 'id' | 'nome' | 'status'> & { git: { ramo: string } | null; nos: readonly No[] })[]
}

/** Um cartão de agente aberto agora no espaço (as sessões, ao vivo). */
export interface AgenteAberto {
  no: NoDoAgente
  situacao: Exclude<EstadoDoAgente, 'fechado'>
  fila: number
}

export interface FontesDaConsulta {
  kanban(espacoId: string): { colunas: readonly Coluna[]; tarefas: readonly Tarefa[] }
  espaco(espacoId: string): EspacoDaConsulta | null
  /** Só chamado quando o recurso é agente (lê a tela de cada um). */
  abertos(espacoId: string): Promise<AgenteAberto[]> | AgenteAberto[]
  /** O texto do post-it (arquivo em `notas/` do espaço); vazio se não houver. */
  textoDaNota(espacoId: string, arquivo: string): string
  fluxos(espacoId: string): { fluxos: readonly FluxoGravado[]; pastas: readonly { id: string; nome: string }[]; ultimas: Readonly<Record<string, ResumoDaExecucao>> }
  execucoes(espacoId: string, fluxoId: string, limite: number): ResumoDaExecucao[]
  /** O Maestro vivo do espaço agora. */
  maestro(espacoId: string): string | undefined
  /** "criado pelo usuário"… (main/fluxos/autoria.ts). */
  autoria(f: FluxoGravado): string
}

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
const contem = (onde: string, procurado: string): boolean => normalizar(onde).includes(normalizar(procurado))

class ErroDaConsulta extends Error {}

/** Os planos do espaço com o andar de cada um (`null` = térreo), térreo primeiro. */
function planos(e: EspacoDaConsulta): { andar: EspacoDaConsulta['andares'][number] | null; nos: readonly No[] }[] {
  return [{ andar: null, nos: e.nos }, ...e.andares.map((a) => ({ andar: a, nos: a.nos }))]
}

/** Os agentes do espaço: os cartões de terminal do arquivo (abertos com a situação de agora, os outros "fechado") e os abertos que o arquivo ainda não tem. */
async function agentesDo(f: FontesDaConsulta, espacoId: string): Promise<FichaDeAgente[]> {
  const abertos = new Map((await f.abertos(espacoId)).map((a) => [a.no.id, a]))
  const { tarefas } = f.kanban(espacoId)
  const espaco = f.espaco(espacoId)
  const saida: FichaDeAgente[] = []
  const vistos = new Set<string>()
  for (const { andar, nos } of espaco ? planos(espaco) : []) {
    for (const no of nos) {
      if (no.tipo !== 'terminal' || vistos.has(no.id)) continue
      vistos.add(no.id)
      const aberto = abertos.get(no.id)
      saida.push(fichaDeAgente({ no: aberto?.no ?? (no as NoTerminal), situacao: aberto?.situacao, fila: aberto?.fila, andar, tarefas }))
    }
  }
  for (const a of abertos.values()) {
    if (!vistos.has(a.no.id)) saida.push(fichaDeAgente({ no: a.no, situacao: a.situacao, fila: a.fila, tarefas }))
  }
  return saida
}

function cartoesDo(f: FontesDaConsulta, espacoId: string) {
  const espaco = f.espaco(espacoId)
  return (espaco ? planos(espaco) : []).flatMap(({ andar, nos }) =>
    nos.filter((n): n is CartaoDoQuadro => n.tipo !== 'terminal').map((n) => fichaDeCartao(n, andar, n.tipo === 'postit' ? f.textoDaNota(espacoId, n.arquivo) : undefined))
  )
}

/** O fluxo pelo nome (vazio = o deste nó), no espaço do fluxo. */
function acharFluxo(lista: readonly FluxoGravado[], nome: string | undefined, este: FluxoGravado): FluxoGravado {
  if (!nome?.trim()) return lista.find((x) => x.id === este.id) ?? este
  const achado = lista.filter((x) => normalizar(x.nome) === normalizar(nome))
  if (!achado.length) throw new ErroDaConsulta(`o fluxo "${nome}" não existe neste espaço`)
  return achado[0]
}

const varios = (fichas: readonly object[], limite: number): ResultadoDaConsulta => ({ itens: fichas.slice(0, limite) as Record<string, unknown>[], total: fichas.length })
const um = (ficha: object): ResultadoDaConsulta => ({ itens: [ficha as Record<string, unknown>], total: 1 })

/**
 * A consulta de um item (os ajustes já resolvidos para ele). Erro do nó = lança. `fluxo`: o fluxo que roda (o "este"
 * de fluxo e de execução). O espaço é sempre o do fluxo.
 */
export async function consultar(f: FontesDaConsulta, espacoId: string, fluxo: FluxoGravado, a: AjustesDaConsulta): Promise<ResultadoDaConsulta> {
  switch (a.recurso) {
    case 'tarefa': {
      const { colunas, tarefas } = f.kanban(espacoId)
      if (a.operacao === 'um') {
        const n = Number(String(a.numero ?? '').trim().replace(/^#/, ''))
        if (!Number.isInteger(n) || n < 1) throw new ErroDaConsulta(`número de tarefa inválido: "${a.numero ?? ''}"`)
        const t = tarefas.find((x) => x.numero === n)
        if (!t) throw new ErroDaConsulta(`a tarefa #${n} não existe neste espaço`)
        return um(fichaDeTarefa(t, colunas))
      }
      const responsavel = a.responsavel ? (a.responsavel.id === 'maestro' ? f.maestro(espacoId) : a.responsavel.id) : undefined
      if (a.responsavel && !responsavel) return varios([], a.limite)
      const achadas = tarefas
        .filter((t) => a.concluidas || t.concluidaEm === undefined)
        .filter((t) => !a.coluna || t.coluna === a.coluna.id)
        .filter((t) => !a.etiqueta || t.etiquetas.some((e) => normalizar(e) === normalizar(a.etiqueta!)))
        .filter((t) => !responsavel || t.trabalhando.some((p) => p.id === responsavel))
        .filter((t) => !a.contem || contem(t.titulo, a.contem) || contem(t.descricao, a.contem))
        .sort((x, y) => y.numero - x.numero)
      return varios(
        achadas.map((t) => fichaDeTarefa(t, colunas)),
        a.limite
      )
    }
    case 'coluna': {
      const { colunas, tarefas } = f.kanban(espacoId)
      if (a.operacao === 'um') {
        const c = colunas.find((x) => x.id === a.coluna?.id)
        if (!c) throw new ErroDaConsulta(`a coluna "${a.coluna?.nome ?? ''}" não existe mais no kanban`)
        return um(fichaDeColuna(c, tarefas))
      }
      return varios(
        colunas.map((c) => fichaDeColuna(c, tarefas)),
        a.limite
      )
    }
    case 'agente': {
      const todos = await agentesDo(f, espacoId)
      if (a.operacao === 'um') {
        const id = a.agente?.id === 'maestro' ? f.maestro(espacoId) : a.agente?.id
        if (!id) throw new ErroDaConsulta('não há Maestro aberto neste espaço')
        const achado = todos.find((x) => x.id === id)
        if (!achado) throw new ErroDaConsulta(`o agente "${a.agente?.nome ?? id}" não está neste espaço`)
        return um(achado)
      }
      return varios(
        todos.filter((x) => (!a.tipo || x.tipo === a.tipo) && (!a.estado || x.estado === a.estado) && (!a.funcao || normalizar(x.funcao) === normalizar(a.funcao))),
        a.limite
      )
    }
    case 'cartao': {
      const todos = cartoesDo(f, espacoId)
      if (a.operacao === 'um') {
        const nome = a.nome ?? ''
        const achados = todos.filter((c) => normalizar(c.nome) === normalizar(nome))
        if (!achados.length) throw new ErroDaConsulta(`nenhum cartão se chama "${nome}" neste espaço`)
        if (achados.length > 1) throw new ErroDaConsulta(`${achados.length} cartões se chamam "${nome}": use "vários" com outro filtro`)
        return um(achados[0])
      }
      return varios(
        todos.filter((c) => (!a.tipo || c.tipo === a.tipo) && (!a.andar || normalizar(c.andar.nome) === normalizar(a.andar)) && (!a.contem || contem(c.nome, a.contem) || contem(c.texto, a.contem))),
        a.limite
      )
    }
    case 'andar': {
      const espaco = f.espaco(espacoId)
      const todos = espaco ? planos(espaco).map(({ andar, nos }) => fichaDeAndar(andar, nos.length)) : [fichaDeAndar(null, 0)]
      if (a.operacao === 'um') {
        const achado = todos.find((x) => normalizar(x.nome) === normalizar(a.nome ?? ''))
        if (!achado) throw new ErroDaConsulta(`o andar "${a.nome ?? ''}" não existe neste espaço (o de baixo se chama "${NOME_DO_TERREO}")`)
        return um(achado)
      }
      return varios(todos, a.limite)
    }
    case 'espaco':
      return um(fichaDeEspaco({ id: espacoId, nome: f.espaco(espacoId)?.nome ?? '' }))
    case 'fluxo': {
      const l = f.fluxos(espacoId)
      const ficha = (x: FluxoGravado) => fichaDeFluxo(x, { pastas: l.pastas, autoria: f.autoria(x), ultima: l.ultimas[x.id] ?? null })
      if (a.operacao === 'um') return um(ficha(acharFluxo(l.fluxos, a.nome, fluxo)))
      return varios(
        l.fluxos.filter((x) => !a.ligados || x.ligado).map(ficha),
        a.limite
      )
    }
    case 'execucao': {
      const alvo = acharFluxo(f.fluxos(espacoId).fluxos, a.fluxo, fluxo)
      const limite = Math.min(a.limite, MAX_EXECUCOES_DA_CONSULTA)
      const lista = f.execucoes(espacoId, alvo.id, limite)
      return varios(
        lista.map((r) => fichaDeExecucao(r, alvo)),
        limite
      )
    }
  }
}
