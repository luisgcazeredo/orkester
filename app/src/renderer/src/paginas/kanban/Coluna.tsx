import { Fragment, useEffect, useRef, useState, type PointerEvent as EventoDePonteiro } from 'react'
import { Plus } from 'lucide-react'
import type { AgenteDoKanban } from '../../../../shared/kanban'
import { textoDoMaestro, type ColunaNaTela, type MaestroDaLeitura } from './filtros'
import { TarefaNoKanban } from './TarefaNoKanban'

// Uma coluna: cabeçalho com nome e contagem (duplo clique renomeia), as tarefas que passam nos filtros e, durante um
// arrasto que passa por ela, a vaga onde a tarefa vai cair. A coluna de entrada (Demandas) tem no topo o campo
// "+ Demanda": Enter cria e o campo continua aberto para a próxima, Esc fecha. A de delegar (Com o Maestro) diz no
// cabeçalho se há Maestro e como ele está; sem Maestro, ela não acende no arrasto.

interface Props {
  coluna: ColunaNaTela
  agentes: readonly AgenteDoKanban[]
  maestro: MaestroDaLeitura | null
  filtrando: boolean
  aberta: number | null
  /** Número da tarefa sendo arrastada (de qualquer coluna). */
  arrastada: number | null
  /** Índice da vaga nesta coluna (entre as visíveis, sem a arrastada); null = a soltura não é aqui. */
  vaga: number | null
  podeEditar: boolean
  /** Campo "+ Demanda" aberto (só na coluna de entrada). */
  demandaAberta: boolean
  aoAbrirDemanda: () => void
  aoFecharDemanda: () => void
  /** Cria a demanda; devolve o erro (ou null) para o campo mostrar. */
  aoCriarDemanda: (titulo: string) => Promise<string | null>
  aoApertar: (e: EventoDePonteiro<HTMLDivElement>, numero: number) => void
  aoAbrir: (numero: number) => void
  aoRenomear: (nome: string) => void
}

function CampoDeDemanda({ aoCriar, aoFechar }: { aoCriar: (titulo: string) => Promise<string | null>; aoFechar: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  // foca ao abrir e de novo quando o pedido termina: o campo fica `disabled` enquanto cria, e desabilitado perde o foco
  // (focar dentro do próprio `criar`, antes de reabilitar, não pega) — sem isto a próxima demanda ou o Esc não chegam nele
  useEffect(() => {
    if (!criando) campo.current?.focus()
  }, [criando])
  const criar = async (): Promise<void> => {
    if (!titulo.trim() || criando) return
    setCriando(true)
    const falhou = await aoCriar(titulo.trim())
    setCriando(false)
    setErro(falhou)
    if (!falhou) setTitulo('')
  }
  return (
    <div className="kanban-demanda">
      <input
        ref={campo}
        className="kanban-demanda-campo"
        value={titulo}
        maxLength={120}
        placeholder="Nova demanda + Enter (Esc fecha)"
        aria-label="Nova demanda"
        disabled={criando}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void criar()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            aoFechar()
          }
        }}
      />
      {erro && (
        <p className="kanban-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

export function Coluna(p: Props) {
  const { coluna, agentes, maestro, filtrando, aberta, arrastada, vaga, podeEditar, aoApertar, aoAbrir, aoRenomear } = p
  const [renomeando, setRenomeando] = useState(false)
  const [nome, setNome] = useState(coluna.nome)
  const delegar = coluna.papel === 'delegar'
  const entrada = coluna.papel === 'entrada'
  const contagem = filtrando || coluna.visiveis.length !== coluna.todas.length ? `${coluna.visiveis.length} de ${coluna.todas.length}` : String(coluna.todas.length)
  const terminar = (salvar: boolean): void => {
    setRenomeando(false)
    if (salvar && nome.trim() && nome.trim() !== coluna.nome) aoRenomear(nome.trim())
  }
  // a vaga conta só as que ficam (sem a arrastada): o índice bate com `posicaoDaSoltura`
  let restantes = 0
  return (
    <section className={`kanban-coluna ${vaga !== null ? 'alvo' : ''}`} data-coluna={coluna.id} data-papel={coluna.papel} aria-label={`Coluna ${coluna.nome}`}>
      <header className="kanban-coluna-topo" onDoubleClick={() => podeEditar && (setNome(coluna.nome), setRenomeando(true))} title={podeEditar ? 'Duplo clique para renomear' : undefined}>
        {renomeando ? (
          <input
            className="kanban-coluna-renomear"
            autoFocus
            value={nome}
            maxLength={30}
            aria-label="Novo nome da coluna"
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => terminar(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') terminar(true)
              else if (e.key === 'Escape') {
                e.stopPropagation()
                terminar(false)
              }
            }}
          />
        ) : (
          <h3 className="kanban-coluna-nome">{coluna.nome}</h3>
        )}
        <span className="kanban-coluna-contagem" title={contagem.includes('de') ? 'visíveis com os filtros, de todas na coluna' : 'tarefas na coluna'}>
          {contagem}
        </span>
      </header>
      {delegar && (
        <p className={`kanban-coluna-maestro ${maestro ? `situacao-${maestro.situacao ?? 'desconhecida'}` : 'sem-maestro'}`} data-maestro={maestro ? 'sim' : 'nao'}>
          {maestro && <span className="kanban-ponto" aria-hidden />}
          {textoDoMaestro(maestro)}
        </p>
      )}
      {entrada &&
        podeEditar &&
        (p.demandaAberta ? (
          <CampoDeDemanda aoCriar={p.aoCriarDemanda} aoFechar={p.aoFecharDemanda} />
        ) : (
          <button type="button" className="kanban-demanda-abrir" data-acao="abrir-demanda" title="Nova demanda (N)" onClick={p.aoAbrirDemanda}>
            <Plus size={14} aria-hidden /> Demanda
          </button>
        ))}
      <div className="kanban-coluna-lista">
        {coluna.visiveis.map((t) => {
          const indice = t.numero === arrastada ? -1 : restantes++
          return (
            <Fragment key={t.numero}>
              {vaga !== null && indice === vaga && <div className="kanban-vaga" aria-hidden />}
              <TarefaNoKanban
                tarefa={t}
                agentes={agentes}
                maestro={maestro}
                delegar={delegar}
                aberta={aberta === t.numero}
                arrastando={arrastada === t.numero}
                aoApertar={aoApertar}
                aoAbrir={aoAbrir}
              />
            </Fragment>
          )
        })}
        {vaga !== null && vaga >= restantes && <div className="kanban-vaga" aria-hidden />}
        {!coluna.visiveis.length && vaga === null && <p className="kanban-coluna-vazia suave">{coluna.todas.length ? 'Nada com esses filtros.' : 'Vazia.'}</p>}
      </div>
    </section>
  )
}
