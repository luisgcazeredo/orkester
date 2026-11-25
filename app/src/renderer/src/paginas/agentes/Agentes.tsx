import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Inbox, Pencil, Play, SquareKanban, Trash2 } from 'lucide-react'
import type { Agente, Partitura, ResumoEspaco } from '../../../../shared/modelo'
import type { AgenteDoPanorama } from '../../../../shared/api'
import { rotuloModelo, TEXTO_PADRAO } from '../../../../shared/modelos'
import { resumoDaPartitura } from '../../../../shared/quadro/partituras'
import { abrirEspaco, definirPartituras, lerEstado, usarLoja } from '../../estado/loja'
import { EditorDeFuncoes } from './Funcoes'
import { EditorDePresets } from './Presets'
import { confirmar, perguntarTexto } from '../../ui/Perguntas'
import { subirPartituraNoCentro } from '../../ui/Partituras'
import { irParaPagina } from '../../casca/paginas'
import { abrirKanban, aoChegarPedidoDePagina, pegarAbaPedida, type AbaAgentes } from '../abrir'
import { usarPanorama } from '../panorama'
import { COR_AGENTE, ICONE_AGENTE } from '../../nos/icones'

// Agentes (página geral): os agentes de todos os espaços, agrupados por espaço, e as peças que os montam —
// Funções, Presets e Partituras. Todos os espaços vêm do processo principal, com livre/ocupado e a caixa de
// entrada de cada agente vivo, em qualquer janela. Só leitura: daqui não se comanda agente nenhum.
// Leitura (1.9.2, C2): cartões numa grade que usa a largura toda, um grupo recolhível por espaço e filtros no topo.

const ABAS: Array<[AbaAgentes, string]> = [
  ['agora', 'Agentes'],
  ['funcoes', 'Funções'],
  ['presets', 'Presets'],
  ['partituras', 'Partituras']
]

const MOTOR: Record<Agente, string> = { claude: 'Claude Code', codex: 'Codex', shell: 'PowerShell' }
const SITUACAO: Record<AgenteDoPanorama['situacao'], string> = { livre: 'livre', trabalhando: 'ocupado', pergunta: 'numa pergunta', encerrado: 'encerrado' }

const plural = (n: number, palavra: string): string => `${n} ${palavra}${n === 1 ? '' : 's'}`
const recados = (n: number): string => (n ? `${plural(n, 'recado')} esperando` : 'caixa vazia')

// Um campo do cartão: rótulo pequeno em cima, valor embaixo. O valor quebra linha em vez de cortar no meio.
function Campo({ rotulo, children, classe }: { rotulo: string; children: ReactNode; classe: string }) {
  return (
    <div className="agente-campo">
      <dt>{rotulo}</dt>
      <dd className={classe}>{children}</dd>
    </div>
  )
}

/**
 * Abre a tarefa no Kanban (1.9.5, S5). Agente de outro espaço: esta janela passa para o espaço dele (como o seletor
 * do Kanban); se o espaço está aberto em outra janela, aquela vem para a frente e esta fica onde está.
 */
async function abrirTarefa(espacoId: string, numero: number): Promise<void> {
  await abrirEspaco(espacoId)
  if (lerEstado().espaco?.id === espacoId) abrirKanban({ numero })
}

/** "#N título" de cada tarefa aberta em que o agente está; clicar abre a tarefa no Kanban. */
function TarefasDoAgente({ ag }: { ag: AgenteDoPanorama }) {
  const tarefas = ag.tarefas ?? []
  if (!tarefas.length) return null
  return (
    <div className="agente-campo agente-campo-largo">
      <dt>{tarefas.length > 1 ? 'Tarefas' : 'Tarefa'}</dt>
      <dd className="agente-tarefas">
        {tarefas.map((t) => (
          <button
            key={t.numero}
            type="button"
            className="agente-tarefa"
            data-tarefa={t.numero}
            title={`#${t.numero} ${t.titulo} · abrir no Kanban`}
            onClick={() => void abrirTarefa(ag.espacoId, t.numero)}
          >
            <SquareKanban size={13} aria-hidden />
            <span>
              #{t.numero} {t.titulo}
            </span>
          </button>
        ))}
      </dd>
    </div>
  )
}

function CartaoAgente({ ag, cor }: { ag: AgenteDoPanorama; cor: string }) {
  const modelo = rotuloModelo(ag)
  const Icone = ICONE_AGENTE[ag.agente]
  return (
    <article className="agente-card" data-agente={ag.id} style={{ borderLeftColor: cor }}>
      <header className="agente-card-topo">
        <h4 className="agente-nome">{ag.nome}</h4>
        <span className={`agente-situacao situacao-${ag.situacao}`}>{SITUACAO[ag.situacao]}</span>
      </header>
      <dl className="agente-campos">
        <Campo rotulo="Função" classe={ag.funcao ? 'agente-funcao' : 'agente-funcao suave'}>
          {ag.funcao ?? 'sem função'}
        </Campo>
        <Campo rotulo="Motor" classe="agente-motor">
          {Icone && <Icone size={13} style={{ color: COR_AGENTE[ag.agente] }} aria-hidden />}
          {MOTOR[ag.agente] ?? ag.agente}
        </Campo>
        <Campo rotulo="Modelo · esforço" classe={modelo && !modelo.startsWith(TEXTO_PADRAO) ? 'agente-modelo' : 'agente-modelo suave'}>
          {modelo || TEXTO_PADRAO}
        </Campo>
        <Campo rotulo="Caixa" classe={ag.fila ? 'agente-caixa com-recado' : 'agente-caixa suave'}>
          <Inbox size={13} aria-hidden />
          {recados(ag.fila)}
        </Campo>
        <TarefasDoAgente ag={ag} />
      </dl>
    </article>
  )
}

function contagem(lista: AgenteDoPanorama[], total: number, filtrando: boolean): string {
  const ocupados = lista.filter((a) => a.situacao === 'trabalhando').length
  const base = filtrando ? `${lista.length} de ${plural(total, 'agente')}` : plural(total, 'agente')
  return ocupados ? `${base} · ${ocupados} ocupado${ocupados > 1 ? 's' : ''}` : base
}

interface PropsGrupo {
  espaco: ResumoEspaco
  atual: boolean
  /** Os agentes do espaço que passam nos filtros; null enquanto o panorama não chegou. */
  agentes: AgenteDoPanorama[] | null
  /** Todos os agentes vivos do espaço, sem filtro. */
  total: number
  filtrando: boolean
  aberto: boolean
  alternar: () => void
}

function GrupoAgentes({ espaco, atual, agentes, total, filtrando, aberto, alternar }: PropsGrupo) {
  const Seta = aberto ? ChevronDown : ChevronRight
  return (
    <section className="pagina-grupo agentes-grupo" data-espaco={espaco.id}>
      <h3 className="pagina-grupo-titulo">
        <button type="button" className="agentes-grupo-botao" aria-expanded={aberto} onClick={alternar} title={aberto ? 'Recolher este espaço' : 'Mostrar os agentes deste espaço'}>
          <Seta size={15} aria-hidden />
          <span className="pagina-grupo-cor" style={{ background: espaco.cor }} />
          <span className="agentes-grupo-nome">{espaco.nome}</span>
          <span className="agentes-grupo-contagem">{agentes ? contagem(agentes, total, filtrando) : '…'}</span>
        </button>
        <span className="suave pagina-grupo-nota">{atual ? 'aberto aqui' : 'só leitura: comande no quadro do espaço'}</span>
      </h3>
      {aberto && agentes && agentes.length > 0 && (
        <div className="agentes-grade">
          {agentes.map((ag) => (
            <CartaoAgente key={ag.id} ag={ag} cor={espaco.cor} />
          ))}
        </div>
      )}
      {aberto && agentes && !agentes.length && <p className="suave pagina-vazio">{filtrando && total ? 'Nenhum agente deste espaço com esses filtros.' : 'Nenhum agente vivo neste espaço.'}</p>}
      {aberto && !agentes && <p className="suave pagina-vazio">Lendo…</p>}
    </section>
  )
}

type FiltroSituacao = 'todas' | AgenteDoPanorama['situacao']

// Recolher por espaço, e não paginar: o time de um espaço fica junto (página não parte o grupo ao meio) e a leitura
// de 3 em 3 s não faz um agente pular de página quando muda de situação. Os filtros encurtam a lista quando ela cresce.
function AbaAgora() {
  const { espacos, atualId, panorama } = usarPanorama()
  const [espacoEscolhido, setEspacoFiltro] = useState('todos')
  // espaço que sumiu (fechado/apagado) volta sozinho para "Todos", sem página em branco
  const espacoFiltro = espacos.some((e) => e.id === espacoEscolhido) ? espacoEscolhido : 'todos'
  const [situacao, setSituacao] = useState<FiltroSituacao>('todas')
  const [motor, setMotor] = useState<'todos' | Agente>('todos')
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(() => new Set())
  const filtrando = situacao !== 'todas' || motor !== 'todos'
  const passa = (a: AgenteDoPanorama): boolean => (situacao === 'todas' || a.situacao === situacao) && (motor === 'todos' || a.agente === motor)
  const visiveis = espacos.filter((e) => espacoFiltro === 'todos' || e.id === espacoFiltro)
  const alternar = (id: string): void =>
    setRecolhidos((r) => {
      const n = new Set(r)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todos = panorama?.agentes ?? []
  const ocupados = todos.filter((a) => a.situacao === 'trabalhando').length
  return (
    <>
      <div className="agentes-filtros" role="toolbar" aria-label="Filtros dos agentes">
        <label>
          <span>Espaço</span>
          <select value={espacoFiltro} onChange={(e) => setEspacoFiltro(e.target.value)} data-filtro="espaco" title={espacos.find((x) => x.id === espacoFiltro)?.nome ?? 'Todos os espaços'}>
            <option value="todos">Todos ({espacos.length})</option>
            {espacos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Situação</span>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value as FiltroSituacao)} data-filtro="situacao">
            <option value="todas">Todas</option>
            {(Object.keys(SITUACAO) as Array<AgenteDoPanorama['situacao']>).map((s) => (
              <option key={s} value={s}>
                {SITUACAO[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Motor</span>
          <select value={motor} onChange={(e) => setMotor(e.target.value as 'todos' | Agente)} data-filtro="motor">
            <option value="todos">Todos</option>
            {(Object.keys(MOTOR) as Agente[]).map((m) => (
              <option key={m} value={m}>
                {MOTOR[m]}
              </option>
            ))}
          </select>
        </label>
        <span className="espaco-flex" />
        <span className="suave agentes-total">{panorama ? `${plural(todos.length, 'agente')} · ${ocupados} ocupado${ocupados === 1 ? '' : 's'}` : 'Lendo…'}</span>
        <button type="button" className="agentes-recolher" onClick={() => setRecolhidos(recolhidos.size ? new Set() : new Set(espacos.map((e) => e.id)))}>
          {recolhidos.size ? 'Abrir todos' : 'Recolher todos'}
        </button>
      </div>
      {visiveis.map((e) => {
        const doEspaco = panorama ? todos.filter((x) => x.espacoId === e.id) : null
        return (
          <GrupoAgentes
            key={e.id}
            espaco={e}
            atual={e.id === atualId}
            agentes={doEspaco ? doEspaco.filter(passa) : null}
            total={doEspaco?.length ?? 0}
            filtrando={filtrando}
            aberto={!recolhidos.has(e.id)}
            alternar={() => alternar(e.id)}
          />
        )
      })}
      {!espacos.length && <p className="suave pagina-vazio">Nenhum espaço ainda.</p>}
    </>
  )
}

function AbaFuncoes() {
  return (
    <section className="pagina-grupo">
      <EditorDeFuncoes />
    </section>
  )
}

function AbaPresets() {
  return (
    <section className="pagina-grupo">
      <EditorDePresets />
    </section>
  )
}

const SEM_PARTITURAS: Partitura[] = []

function AbaPartituras() {
  // sem o `?? []` dentro do seletor: array novo a cada leitura faz o useSyncExternalStore repetir sem parar
  const partituras = usarLoja((e) => e.preferencias.partituras) ?? SEM_PARTITURAS
  const temEspaco = usarLoja((e) => e.espaco !== null)

  async function renomear(p: Partitura): Promise<void> {
    const nome = await perguntarTexto('Renomear partitura', 'Nome', p.nome, 'Renomear')
    if (!nome?.trim()) return
    definirPartituras(partituras.map((x) => (x.id === p.id ? { ...x, nome: nome.trim().slice(0, 80) } : x)))
  }

  async function apagar(p: Partitura): Promise<void> {
    const r = await confirmar({
      titulo: `Apagar a partitura "${p.nome}"?`,
      mensagem: 'Os cartões que já subiram dela ficam onde estão; só o time guardado sai.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Apagar', valor: 'apagar', perigo: true }
      ]
    })
    if (r.botao === 'apagar') definirPartituras(partituras.filter((x) => x.id !== p.id))
  }

  return (
    <section className="pagina-grupo">
      <p className="suave">
        Um time salvo: os agentes com as funções e os comandos deles, os recados e as cordas entre eles. Para guardar um, selecione os cartões no quadro e use{' '}
        <b>Salvar como partitura…</b>. A pasta não é salva: cada cartão abre na pasta do espaço (ou na da função).
      </p>
      {partituras.length > 0 && (
        <div className="partituras-grade">
          {partituras.map((p) => (
            <div key={p.id} className="partitura-linha" data-partitura={p.id}>
              <div className="partitura-dados">
                <span className="partitura-nome">{p.nome}</span>
                <span className="partitura-resumo suave">{resumoDaPartitura(p)}</span>
              </div>
              <div className="partitura-acoes">
                <button
                  className="partitura-subir"
                  disabled={!temEspaco}
                  title={temEspaco ? 'Subir este time no andar à mostra do quadro' : 'Abra um espaço para subir o time'}
                  onClick={() => {
                    irParaPagina('quadro')
                    subirPartituraNoCentro(p)
                  }}
                >
                  <Play size={13} /> Subir
                </button>
                <button className="preset-apagar" title="Renomear" onClick={() => void renomear(p)}>
                  <Pencil size={14} />
                </button>
                <button className="preset-apagar" title="Apagar partitura" onClick={() => void apagar(p)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!partituras.length && <p className="suave pagina-vazio">Nenhuma partitura guardada ainda.</p>}
    </section>
  )
}

export function Agentes() {
  const [aba, setAba] = useState<AbaAgentes>(() => pegarAbaPedida() ?? 'agora')
  // pedido que chega com a página já montada (menu do terminal, paleta)
  useEffect(() => aoChegarPedidoDePagina(() => setAba(pegarAbaPedida() ?? 'agora')), [])
  return (
    <div className="pagina-geral" data-pagina-geral="agentes">
      <header className="pagina-cabecalho">
        <h2>Agentes</h2>
        <div className="pagina-abas" role="tablist">
          {ABAS.map(([id, titulo]) => (
            <button key={id} type="button" role="tab" aria-selected={aba === id} className={`pagina-aba ${aba === id ? 'ativo' : ''}`} data-aba={id} onClick={() => setAba(id)}>
              {titulo}
            </button>
          ))}
        </div>
      </header>
      <div className="pagina-corpo">
        {aba === 'agora' && <AbaAgora />}
        {aba === 'funcoes' && <AbaFuncoes />}
        {aba === 'presets' && <AbaPresets />}
        {aba === 'partituras' && <AbaPartituras />}
      </div>
    </div>
  )
}
