import { LocateFixed, SquareKanban } from 'lucide-react'
import { ocupadosSemTarefa, type AgenteDoKanban, type ArquivoDoKanban } from '../../../../shared/kanban'
import { abrirMenu, type ItemMenu } from '../../ui/MenuContexto'
import { TEXTO_DA_SITUACAO } from './filtros'

// Faixa "Ocupados sem tarefa" (1.9.5, S5): os agentes Claude/Codex trabalhando (ou numa pergunta) que não estão em
// tarefa aberta nenhuma do kanban, para o Luís ver o que anda fora dele. Clicar oferece "pôr numa tarefa" (o agente
// entra na lista "trabalhando", sem recado na caixa dele) e "ir ao cartão". Some quando não há ninguém.

/** Quantas tarefas o submenu lista (as atualizadas por último primeiro). */
const MAXIMO_NO_MENU = 15

interface Props {
  arquivo: ArquivoDoKanban
  agentes: readonly AgenteDoKanban[]
  podeEditar: boolean
  porNaTarefa: (numero: number, agenteId: string) => void
  irAoCartao: (id: string) => void
}

export function OcupadosSemTarefa({ arquivo, agentes, podeEditar, porNaTarefa, irAoCartao }: Props) {
  const ocupados = ocupadosSemTarefa(arquivo, agentes)
  if (!ocupados.length) return null
  const final = arquivo.colunas.find((c) => c.final)?.id
  const abertas = arquivo.tarefas
    .filter((t) => t.coluna !== final)
    .sort((a, b) => b.atualizadaEm - a.atualizadaEm)
    .slice(0, MAXIMO_NO_MENU)

  const menu = (a: AgenteDoKanban, x: number, y: number): void => {
    const tarefas: ItemMenu[] = abertas.length
      ? abertas.map((t) => ({ rotulo: `#${t.numero} ${t.titulo}`, acao: () => porNaTarefa(t.numero, a.id) }))
      : [{ rotulo: 'Nenhuma tarefa aberta: crie uma em Demandas', desligado: true }]
    abrirMenu(x, y, [
      { rotulo: 'Pôr numa tarefa', icone: SquareKanban, desligado: !podeEditar, submenu: tarefas },
      { rotulo: 'Ir ao cartão', icone: LocateFixed, acao: () => irAoCartao(a.id) }
    ])
  }

  return (
    <section className="kanban-ocupados" aria-label="Agentes ocupados sem tarefa no kanban" data-faixa="ocupados-sem-tarefa">
      <span className="kanban-ocupados-titulo" title="Agentes Claude ou Codex trabalhando agora que não estão em nenhuma tarefa aberta">
        Ocupados sem tarefa
      </span>
      <div className="kanban-chips">
        {ocupados.map((a) => {
          const situacao = a.situacao ?? 'trabalhando'
          return (
            <button
              key={a.id}
              type="button"
              className={`kanban-chip kanban-chip-botao situacao-${situacao}`}
              data-id={a.id}
              title={`${a.nome}: ${TEXTO_DA_SITUACAO[situacao]}, sem tarefa no kanban. Clique para pôr numa tarefa.`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                menu(a, r.left, r.bottom + 4)
              }}
            >
              <span className="kanban-ponto" aria-hidden />
              <span className="kanban-chip-nome">{a.nome}</span>
              <span className="kanban-chip-extra">· {TEXTO_DA_SITUACAO[situacao]}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
