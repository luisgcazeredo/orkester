import type { PointerEvent as EventoDePonteiro } from 'react'
import { MessageSquare } from 'lucide-react'
import type { AgenteDoKanban, Tarefa } from '../../../../shared/kanban'
import { TEXTO_DA_SITUACAO, chipDoMaestro, chipsDaTarefa, type Chip, type MaestroDaLeitura } from './filtros'

// Uma tarefa na coluna: número, título (até 2 linhas), etiquetas, um chip por agente da lista "trabalhando" (nome +
// ponto de situação; quem fechou fica apagado, cartão apagado fica riscado) e quantos comentários tem. Na coluna de
// delegar, o chip é o do Maestro (com "na fila do Maestro" se ele estiver ocupado com fila). Clique (ou Enter) abre o
// painel; arrastar é com o ponteiro, a partir daqui (ver PaginaKanban).

interface Props {
  tarefa: Tarefa
  agentes: readonly AgenteDoKanban[]
  /** O Maestro do espaço agora (leitura); só conta na coluna de delegar. */
  maestro?: MaestroDaLeitura | null
  /** A tarefa está na coluna de delegar ("Com o Maestro"). */
  delegar?: boolean
  aberta: boolean
  arrastando: boolean
  /** Fantasma que segue o ponteiro durante o arrasto: sem eventos e fora da ordem de tabulação. */
  fantasma?: boolean
  aoApertar?: (e: EventoDePonteiro<HTMLDivElement>, numero: number) => void
  aoAbrir?: (numero: number) => void
}

export function ChipDeAgente({ chip, extra }: { chip: Chip; extra?: string }) {
  const sufixo = chip.situacao === 'sem-cartao' ? ' (cartão não existe mais)' : chip.situacao === 'encerrado' ? ' · fechado' : extra ? ` · ${extra}` : ''
  return (
    <span className={`kanban-chip situacao-${chip.situacao}`} title={`${chip.nome}: ${TEXTO_DA_SITUACAO[chip.situacao]}`} data-situacao={chip.situacao} data-id={chip.id}>
      <span className="kanban-ponto" aria-hidden />
      <span className="kanban-chip-nome">{chip.nome}</span>
      {sufixo && <span className="kanban-chip-extra">{sufixo}</span>}
    </span>
  )
}

export function TarefaNoKanban({ tarefa: t, agentes, maestro, delegar, aberta, arrastando, fantasma, aoApertar, aoAbrir }: Props) {
  const chips = chipsDaTarefa(t, agentes)
  const doMaestro = delegar ? chipDoMaestro(t, maestro, agentes) : null
  const nomes = [doMaestro?.nome, ...chips.map((c) => c.nome)].filter(Boolean).join(', ')
  const classes = ['kanban-tarefa', aberta && 'aberta', arrastando && 'arrastando', fantasma && 'fantasma'].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
      data-numero={fantasma ? undefined : t.numero}
      role={fantasma ? undefined : 'button'}
      tabIndex={fantasma ? -1 : 0}
      aria-hidden={fantasma || undefined}
      aria-label={fantasma ? undefined : `Tarefa #${t.numero}: ${t.titulo}${nomes ? `, com ${nomes}` : ''}`}
      aria-pressed={fantasma ? undefined : aberta}
      onPointerDown={fantasma ? undefined : (e) => aoApertar?.(e, t.numero)}
      onKeyDown={
        fantasma
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                aoAbrir?.(t.numero)
              }
            }
      }
    >
      <div className="kanban-tarefa-topo">
        <span className="kanban-numero">#{t.numero}</span>
        {t.comentarios.length > 0 && (
          <span className="kanban-tarefa-comentarios" title={`${t.comentarios.length} comentário${t.comentarios.length === 1 ? '' : 's'}`}>
            <MessageSquare size={12} aria-hidden />
            {t.comentarios.length}
          </span>
        )}
      </div>
      <p className="kanban-tarefa-titulo">{t.titulo}</p>
      {t.etiquetas.length > 0 && (
        <ul className="kanban-etiquetas" aria-label="Etiquetas">
          {t.etiquetas.map((e) => (
            <li key={e} className="kanban-etiqueta">
              {e}
            </li>
          ))}
        </ul>
      )}
      {(doMaestro || chips.length > 0) && (
        <div className="kanban-chips" aria-label="Trabalhando nela">
          {doMaestro && <ChipDeAgente chip={doMaestro} extra={doMaestro.naFila ? 'na fila do Maestro' : undefined} />}
          {chips.map((c) => (
            <ChipDeAgente key={c.id} chip={c} />
          ))}
        </div>
      )}
    </div>
  )
}
