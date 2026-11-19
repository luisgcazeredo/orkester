import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as EventoDePonteiro } from 'react'
import { Columns3, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { OperacaoDoKanban, Posicao } from '../../../../shared/kanban'
import { abrirEspaco, enquadrarNo, usarLoja } from '../../estado/loja'
import { irParaPagina } from '../../casca/paginas'
import { abrirMenu, type ItemMenu } from '../../ui/MenuContexto'
import { avisar, confirmar, perguntarTexto } from '../../ui/Perguntas'
import { aoChegarPedidoDePagina, pegarPedidoDoKanban, type PedidoDoKanban } from '../abrir'
import { acoesDoKanban } from './atalhos'
import { Coluna } from './Coluna'
import { gravarEstadoDaPagina, lerEstadoDaPagina, painelQueVale } from './estadoDaPagina'
import { FILTRO_INICIAL, colunaDoPapel, colunasNaTela, etiquetasEmUso, filtrando as estaFiltrando, posicaoDaSoltura, semCartao as quemSemCartao, soltouNoMesmoLugar, type FiltroDaPagina } from './filtros'
import { PainelDaLixeira, PainelDaTarefa } from './PainelDaTarefa'
import { TarefaNoKanban } from './TarefaNoKanban'
import { usarKanban } from './usarKanban'
import '../../estilos/kanban.css'

// Kanban (página, 1.9.4): as tarefas do espaço desta janela, em colunas na largura toda. Agentes (`ork kanban`), o MCP
// e a página mexem no mesmo arquivo pelo processo principal; a página relê quando ele avisa. Palavra: o item é
// **tarefa**; **cartão** é o do agente no quadro. Arrastar é com eventos de ponteiro (sem dependência nova); pelo
// teclado, a coluna se troca no painel. O Luís escreve em Demandas ("+ Demanda") e delega arrastando para "Com o
// Maestro" (o principal acha o Maestro do espaço e põe o pedido na caixa dele; sem Maestro, recusa e nada se move).
// O seletor do topo troca o espaço da JANELA (`abrirEspaco`); filtros e painel ficam guardados por espaço
// (`estadoDaPagina`).

/** Quanto o ponteiro anda antes de um clique virar arrasto. */
const LIMIAR_PX = 5

interface Arrasto {
  numero: number
  /** Onde o ponteiro pegou a tarefa, dentro dela (o fantasma segue com o mesmo deslocamento). */
  dx: number
  dy: number
  largura: number
  x: number
  y: number
  alvo: { coluna: string; indice: number } | null
}

/** Coluna e vaga sob o ponteiro: a coluna pela faixa horizontal; a vaga pela metade de cada tarefa visível. */
function alvoSob(x: number, y: number, arrastada: number): Arrasto['alvo'] {
  const colunas = [...document.querySelectorAll<HTMLElement>('.pagina-ativa .kanban-coluna[data-coluna]')]
  const coluna = colunas.find((c) => {
    const r = c.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 40
  })
  if (!coluna) return null
  const tarefas = [...coluna.querySelectorAll<HTMLElement>('.kanban-tarefa[data-numero]')].filter((t) => Number(t.dataset.numero) !== arrastada)
  const indice = tarefas.findIndex((t) => {
    const r = t.getBoundingClientRect()
    return y < r.top + r.height / 2
  })
  return { coluna: coluna.dataset.coluna!, indice: indice < 0 ? tarefas.length : indice }
}

export function Kanban() {
  const espacoId = usarLoja((e) => e.espaco?.id)
  const espacos = usarLoja((e) => e.espacos)
  const emOutras = usarLoja((e) => e.emOutrasJanelas)
  const { leitura, erro: erroDeLeitura, aplicar } = usarKanban(espacoId)
  // F1: filtros e painel de cada espaço, guardados na memória da janela (voltar do Quadro ou de outro espaço os traz)
  const [filtro, setFiltro] = useState<FiltroDaPagina>(() => (espacoId ? lerEstadoDaPagina(espacoId).filtro : FILTRO_INICIAL))
  const [painel, setPainel] = useState<number | 'lixeira' | null>(() => (espacoId ? lerEstadoDaPagina(espacoId).painel : null))
  const [espacoDoEstado, setEspacoDoEstado] = useState(espacoId)
  const [demandaAberta, setDemandaAberta] = useState(false)
  if (espacoDoEstado !== espacoId) {
    // trocou de espaço (seletor, ou a lista do Quadro): o estado passa a ser o do espaço novo
    const guardado = espacoId ? lerEstadoDaPagina(espacoId) : { filtro: FILTRO_INICIAL, painel: null }
    setEspacoDoEstado(espacoId)
    setFiltro(guardado.filtro)
    setPainel(guardado.painel)
    setDemandaAberta(false)
  }
  useEffect(() => {
    if (espacoId && espacoId === espacoDoEstado) gravarEstadoDaPagina(espacoId, { filtro, painel: typeof painel === 'number' ? painel : null })
  }, [espacoId, espacoDoEstado, filtro, painel])
  const [arrasto, setArrasto] = useState<Arrasto | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const busca = useRef<HTMLInputElement>(null)
  const arrastoAtual = useRef<Arrasto | null>(null)
  const apertado = useRef<{ numero: number; x: number; y: number; dx: number; dy: number; largura: number; id: number } | null>(null)

  const arquivo = leitura?.arquivo
  const agentes = useMemo(() => leitura?.agentes ?? [], [leitura])
  const maestro = leitura?.maestro ?? null
  const podeEditar = !!leitura && !leitura.soLeitura
  const entrada = arquivo ? colunaDoPapel(arquivo, 'entrada') : undefined
  // `agora` anda com as leituras (o "Feito com mais de 7 dias" não precisa de relógio próprio)
  useEffect(() => setAgora(Date.now()), [leitura])
  const colunas = useMemo(() => (arquivo ? colunasNaTela(arquivo, filtro, agora) : []), [arquivo, filtro, agora])
  const etiquetas = useMemo(() => (arquivo ? etiquetasEmUso(arquivo) : []), [arquivo])
  const filtrando = estaFiltrando(filtro)

  // ---------- pedidos de fora (menu do cartão: "Ver tarefas dele") ----------
  const receberPedido = useCallback((p: PedidoDoKanban | null): void => {
    if (!p) return
    if (p.responsavel) setFiltro({ ...FILTRO_INICIAL, quem: p.responsavel })
    if (p.numero) setPainel(p.numero)
  }, [])
  useEffect(() => {
    receberPedido(pegarPedidoDoKanban())
    return aoChegarPedidoDePagina(() => receberPedido(pegarPedidoDoKanban()))
  }, [receberPedido])

  // a tarefa aberta sumiu (apagada por um agente, por exemplo): o painel fecha, calado
  useEffect(() => {
    if (typeof painel !== 'number') return
    if (painelQueVale(painel, arquivo ? arquivo.tarefas.map((t) => t.numero) : null) === null) setPainel(null)
  }, [arquivo, painel])

  const pedir = useCallback(
    async (op: OperacaoDoKanban, titulo = 'Kanban'): Promise<boolean> => {
      const r = await aplicar(op)
      if (!r.ok) await avisar(titulo, r.erro)
      return r.ok
    },
    [aplicar]
  )

  // toda tarefa criada pela página nasce em Demandas (a coluna de entrada); a descrição se escreve no painel
  const novaDemanda = useCallback((): void => {
    if (podeEditar && entrada) setDemandaAberta(true)
  }, [podeEditar, entrada])
  const criarDemanda = useCallback(
    async (titulo: string): Promise<string | null> => {
      if (!entrada) return 'não há coluna de Demandas neste kanban'
      const r = await aplicar({ tipo: 'criar', titulo, coluna: entrada.id })
      return r.ok ? null : r.erro
    },
    [aplicar, entrada]
  )

  // atalhos da página (N, /, Esc): a Casca chama `atalhosDoKanban`, que chama estas
  useEffect(() => {
    acoesDoKanban.nova = novaDemanda
    acoesDoKanban.buscar = () => busca.current?.focus()
    acoesDoKanban.fechar = () => {
      if (painel === null) return false
      setPainel(null)
      return true
    }
    return () => {
      acoesDoKanban.nova = () => {}
      acoesDoKanban.buscar = () => {}
      acoesDoKanban.fechar = () => false
    }
  }, [novaDemanda, painel])

  // ---------- arrastar ----------
  const aoApertar = useCallback(
    (e: EventoDePonteiro<HTMLDivElement>, numero: number): void => {
      if (e.button !== 0) return
      const r = e.currentTarget.getBoundingClientRect()
      apertado.current = { numero, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, largura: r.width, id: e.pointerId }
    },
    []
  )

  useEffect(() => {
    // o arrasto também mora num ref: os ouvintes da janela leem o valor de agora, sem efeito dentro do setState
    const definir = (a: Arrasto | null): void => {
      arrastoAtual.current = a
      setArrasto(a)
    }
    const mover = (e: PointerEvent): void => {
      const a = apertado.current
      if (!a || e.pointerId !== a.id || !podeEditar) return
      if (!arrastoAtual.current && Math.hypot(e.clientX - a.x, e.clientY - a.y) < LIMIAR_PX) return
      definir({ numero: a.numero, dx: a.dx, dy: a.dy, largura: a.largura, x: e.clientX, y: e.clientY, alvo: alvoSob(e.clientX, e.clientY, a.numero) })
    }
    const soltar = (e: PointerEvent): void => {
      const a = apertado.current
      if (!a || e.pointerId !== a.id) return
      apertado.current = null
      const andou = !!arrastoAtual.current
      definir(null)
      if (!andou) {
        // não andou: foi um clique, abre (ou fecha) o painel da tarefa
        setPainel((p) => (p === a.numero ? null : a.numero))
        return
      }
      const alvo = alvoSob(e.clientX, e.clientY, a.numero)
      const coluna = alvo && colunas.find((c) => c.id === alvo.coluna)
      if (!alvo || !coluna) return
      const todas = coluna.todas.map((t) => t.numero)
      const posicao: Posicao = posicaoDaSoltura(todas, coluna.visiveis.map((t) => t.numero), alvo.indice, a.numero)
      if (todas.includes(a.numero) && soltouNoMesmoLugar(todas, a.numero, posicao)) return
      // para "Com o Maestro" a soltura é a delegação: sem Maestro, o principal recusa e a tarefa fica onde estava
      void pedir({ tipo: 'mover', numero: a.numero, coluna: coluna.id, posicao }, coluna.papel === 'delegar' ? 'Delegar ao Maestro' : 'Mover tarefa')
    }
    const cancelar = (): void => {
      apertado.current = null
      definir(null)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && apertado.current) {
        e.stopPropagation()
        cancelar()
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', cancelar)
    window.addEventListener('blur', cancelar)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', cancelar)
      window.removeEventListener('blur', cancelar)
      window.removeEventListener('keydown', esc, true)
    }
  }, [colunas, pedir, podeEditar])

  // ---------- colunas e lixeira (menu ⋯) ----------
  const abrirMenuDoKanban = (x: number, y: number): void => {
    if (!arquivo) return
    const itens: ItemMenu[] = [
      {
        rotulo: 'Nova coluna…',
        icone: Plus,
        desligado: !podeEditar || arquivo.colunas.length >= 12,
        acao: async () => {
          const nome = await perguntarTexto('Nova coluna', 'Nome', '', 'Criar')
          if (nome) void pedir({ tipo: 'coluna', acao: 'criar', nome }, 'Nova coluna')
        }
      },
      {
        rotulo: 'Renomear coluna',
        icone: Pencil,
        desligado: !podeEditar,
        submenu: arquivo.colunas.map((c) => ({
          rotulo: c.nome,
          acao: async () => {
            const nome = await perguntarTexto('Renomear coluna', 'Nome', c.nome, 'Renomear')
            if (nome && nome !== c.nome) void pedir({ tipo: 'coluna', acao: 'renomear', coluna: c.id, nome }, 'Renomear coluna')
          }
        }))
      },
      {
        rotulo: 'Apagar coluna',
        icone: Columns3,
        desligado: !podeEditar || arquivo.colunas.length <= 1,
        submenu: arquivo.colunas.map((c) => {
          const n = arquivo.tarefas.filter((t) => t.coluna === c.id).length
          // Demandas, Com o Maestro e Revisão têm papel: renomeiam, mas não se apagam
          const rotulo = c.papel ? `${c.nome} (fixa: só renomeia)` : n ? `${c.nome} (${n}: mova antes)` : c.nome
          return { rotulo, perigo: true, desligado: n > 0 || !!c.papel, acao:() => void pedir({ tipo: 'coluna', acao: 'apagar', coluna: c.id }, 'Apagar coluna') }
        })
      },
      { separador: true },
      { rotulo: `Lixeira (${arquivo.lixeira.length})`, icone: Trash2, acao: () => setPainel('lixeira') }
    ]
    abrirMenu(x, y, itens)
  }

  const esvaziarLixeira = async (): Promise<void> => {
    if (!arquivo?.lixeira.length) return
    const r = await confirmar({
      titulo: `Esvaziar a lixeira (${arquivo.lixeira.length})?`,
      mensagem: 'As tarefas da lixeira somem de vez; não dá para recuperar.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Esvaziar', valor: 'esvaziar', perigo: true }
      ]
    })
    if (r.botao === 'esvaziar') void pedir({ tipo: 'esvaziar' }, 'Lixeira')
  }

  const irAoCartao = (id: string): void => {
    irParaPagina('quadro')
    requestAnimationFrame(() => enquadrarNo(id))
  }

  // ---------- desenho ----------
  if (!espacoId) {
    return (
      <div className="pagina-geral" data-pagina-geral="kanban">
        <p className="suave pagina-vazio kanban-sem-espaco">Abra um espaço para ver o kanban dele.</p>
      </div>
    )
  }

  const candidatos = agentes.filter((a) => a.agente !== 'shell')
  // quem trabalha numa tarefa e teve o cartão apagado também entra no filtro (pelo nome guardado)
  const semCartao = arquivo ? quemSemCartao(arquivo, agentes) : []
  const tarefaAberta = typeof painel === 'number' ? arquivo?.tarefas.find((t) => t.numero === painel) : undefined
  const arrastada = arrasto ? arquivo?.tarefas.find((t) => t.numero === arrasto.numero) : undefined
  const total = arquivo?.tarefas.length ?? 0
  const visiveis = colunas.reduce((n, c) => n + c.visiveis.length, 0)

  return (
    <div className={`pagina-geral kanban ${arrasto ? 'kanban-arrastando' : ''}`} data-pagina-geral="kanban">
      <header className="pagina-cabecalho kanban-topo">
        <div className="kanban-linha-titulo">
          <h2 className="kanban-titulo">
            Kanban <span className="suave">·</span>
          </h2>
          <select
            className="kanban-espaco"
            value={espacoId}
            data-campo="espaco"
            aria-label="Espaço do kanban (troca o espaço desta janela)"
            title="Troca o espaço desta janela; o Quadro acompanha"
            onChange={(e) => void abrirEspaco(e.target.value)}
          >
            {espacos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {e.id !== espacoId && emOutras.includes(e.id) ? ' (em outra janela)' : ''}
              </option>
            ))}
          </select>
          <span className="espaco-flex" />
          <button type="button" className="kanban-botao primario" data-acao="nova-demanda" disabled={!podeEditar || !entrada} title="Nova demanda (N)" onClick={novaDemanda}>
            <Plus size={14} aria-hidden /> Demanda
          </button>
          <button
            type="button"
            className="kanban-icone kanban-mais"
            title="Colunas e lixeira"
            aria-label="Colunas e lixeira"
            data-acao="menu-kanban"
            disabled={!arquivo}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              abrirMenuDoKanban(r.left, r.bottom + 4)
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="kanban-filtros" role="toolbar" aria-label="Filtros do kanban">
          <label className="kanban-busca">
            <Search size={14} aria-hidden />
            <input
              ref={busca}
              type="search"
              value={filtro.busca}
              placeholder="Buscar título, descrição ou #número  ( / )"
              aria-label="Buscar tarefas"
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setFiltro({ ...filtro, busca: '' })
                  e.currentTarget.blur()
                }
              }}
            />
          </label>
          <label>
            <span>Quem trabalha</span>
            <select value={filtro.quem} data-filtro="quem" onChange={(e) => setFiltro({ ...filtro, quem: e.target.value })}>
              <option value="todos">Todos</option>
              <option value="ninguem">Ninguém</option>
              {candidatos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
              {semCartao.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome} (sem cartão)
                </option>
              ))}
              {/* pedido de um agente que ainda não aparece na lista (shell, ou a leitura não chegou) */}
              {!['todos', 'ninguem'].includes(filtro.quem) && !candidatos.some((a) => a.id === filtro.quem) && !semCartao.some(([id]) => id === filtro.quem) && (
                <option value={filtro.quem}>{agentes.find((a) => a.id === filtro.quem)?.nome ?? 'agente'}</option>
              )}
            </select>
          </label>
          <label>
            <span>Etiqueta</span>
            <select value={filtro.etiqueta} data-filtro="etiqueta" onChange={(e) => setFiltro({ ...filtro, etiqueta: e.target.value })}>
              <option value="">Todas</option>
              {etiquetas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              {filtro.etiqueta && !etiquetas.includes(filtro.etiqueta) && <option value={filtro.etiqueta}>{filtro.etiqueta}</option>}
            </select>
          </label>
          <label className="kanban-marcar">
            <input type="checkbox" checked={filtro.esconderFeitoAntigo} data-filtro="feito-antigo" onChange={(e) => setFiltro({ ...filtro, esconderFeitoAntigo: e.target.checked })} />
            <span>Esconder concluídas há mais de 7 dias</span>
          </label>
          <span className="espaco-flex" />
          {filtrando && (
            <button type="button" className="kanban-botao" onClick={() => setFiltro({ ...FILTRO_INICIAL, esconderFeitoAntigo: filtro.esconderFeitoAntigo })}>
              Limpar filtros
            </button>
          )}
          <span className="suave kanban-total">{arquivo ? (visiveis === total ? `${total} tarefa${total === 1 ? '' : 's'}` : `${visiveis} de ${total} tarefas`) : 'Lendo…'}</span>
        </div>
      </header>

      {leitura?.soLeitura && (
        <p className="kanban-aviso" role="alert">
          {leitura.soLeitura}
        </p>
      )}
      {erroDeLeitura && (
        <p className="kanban-aviso" role="alert">
          Não consegui ler o kanban: {erroDeLeitura}
        </p>
      )}

      <div className={`kanban-corpo ${painel !== null ? 'com-painel' : ''}`}>
        <div className="kanban-colunas" style={{ '--kanban-n': colunas.length || 1 } as CSSProperties}>
          {colunas.map((c) => (
            <Coluna
              key={c.id}
              coluna={c}
              agentes={agentes}
              maestro={maestro}
              filtrando={filtrando}
              aberta={typeof painel === 'number' ? painel : null}
              arrastada={arrasto?.numero ?? null}
              // sem Maestro, "Com o Maestro" não acende: soltar ali só traz o aviso
              vaga={arrasto?.alvo?.coluna === c.id && !(c.papel === 'delegar' && !maestro) ? arrasto.alvo.indice : null}
              podeEditar={podeEditar}
              demandaAberta={demandaAberta}
              aoAbrirDemanda={novaDemanda}
              aoFecharDemanda={() => setDemandaAberta(false)}
              aoCriarDemanda={criarDemanda}
              aoApertar={aoApertar}
              aoAbrir={(n) => setPainel(n)}
              aoRenomear={(nome) => void pedir({ tipo: 'coluna', acao: 'renomear', coluna: c.id, nome }, 'Renomear coluna')}
            />
          ))}
        </div>
        {tarefaAberta && arquivo && (
          <PainelDaTarefa
            key={tarefaAberta.numero}
            tarefa={tarefaAberta}
            arquivo={arquivo}
            agentes={agentes}
            podeEditar={podeEditar}
            aplicar={aplicar}
            fechar={() => setPainel(null)}
            irAoCartao={irAoCartao}
          />
        )}
        {painel === 'lixeira' && arquivo && <PainelDaLixeira arquivo={arquivo} podeEditar={podeEditar} aplicar={aplicar} esvaziar={() => void esvaziarLixeira()} fechar={() => setPainel(null)} />}
      </div>

      {arrasto && arrastada && (
        <div className="kanban-fantasma" style={{ left: arrasto.x - arrasto.dx, top: arrasto.y - arrasto.dy, width: arrasto.largura }} aria-hidden>
          <TarefaNoKanban
            tarefa={arrastada}
            agentes={agentes}
            maestro={maestro}
            delegar={arquivo?.colunas.find((c) => c.id === arrastada.coluna)?.papel === 'delegar'}
            aberta={false}
            arrastando={false}
            fantasma
          />
        </div>
      )}
    </div>
  )
}
