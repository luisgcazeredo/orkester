import { useEffect, useState } from 'react'
import { Pause, Play, Plus, Trash2, Zap } from 'lucide-react'
import type { ResumoEspaco, QuandoDaRotina } from '../../../../shared/modelo'
import type { RotinaDoPanorama } from '../../../../shared/api'
import { MAX_MINUTOS, MIN_MINUTOS, descricaoDe, textoDoResultado } from '../../../../shared/rotinas'
import { apagarRotina, criarRotina, planoAtual } from '../../estado/loja'
import { avisar } from '../../ui/Perguntas'
import { aoChegarPedidoDePagina, pegarCartaoPedido } from '../abrir'
import { usarPanorama } from '../panorama'

// Rotinas (página geral): o app digita um pedido num cartão de hora em hora, todo dia ou toda semana — e **pula a
// vez** quando o terminal está ocupado, numa pergunta ou encerrado. Lista as rotinas de TODOS os espaços, agrupadas
// por espaço. Pausar, religar e testar valem em qualquer espaço; criar e apagar, só no espaço aberto nesta janela.

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const hora = (iso: string): string => {
  const d = new Date(iso)
  const mesmoDia = d.toDateString() === new Date().toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Linha({ r, apagavel, recarregar }: { r: RotinaDoPanorama; apagavel: boolean; recarregar: () => void }) {
  async function testar(): Promise<void> {
    const resultado = await window.ork.panorama.agirNaRotina(r.espacoId, r.id, 'testar')
    if (resultado === 'erro') await avisar('Rotinas', 'Não achei mais essa rotina.')
    else if (resultado !== 'rodou' && resultado !== 'ok') await avisar('Rotinas', `Não digitei agora: ${textoDoResultado(resultado)}.`)
  }
  async function alternar(): Promise<void> {
    const resultado = await window.ork.panorama.agirNaRotina(r.espacoId, r.id, r.pausada ? 'ligar' : 'pausar')
    if (resultado === 'erro') await avisar('Rotinas', 'Não consegui mudar essa rotina agora (o espaço pode estar abrindo ou ela não existe mais). Tente de novo em instantes.')
    recarregar()
  }
  return (
    <div className={`rotina-linha ${r.pausada ? 'pausada' : ''}`} data-rotina={r.id}>
      <div className="rotina-dados">
        <span className="rotina-nome">{r.nome}</span>
        <span className="rotina-detalhe suave">
          {r.nomeDoCartao ?? 'cartão que saiu do quadro'} · {descricaoDe(r.quando)} · {r.pausada ? 'pausada' : `próxima às ${hora(r.proxima)}`}
          {r.ultima ? ` · última ${hora(r.ultima.em)}: ${textoDoResultado(r.ultima.resultado)}` : ' · ainda não rodou'}
          {r.vezes ? ` · ${r.vezes}×` : ''}
        </span>
      </div>
      <button className="preset-apagar" title="Digitar agora (testar)" onClick={() => void testar()}>
        <Zap size={14} />
      </button>
      <button className="preset-apagar" title={r.pausada ? 'Voltar a rodar' : 'Pausar'} onClick={() => void alternar()}>
        {r.pausada ? <Play size={14} /> : <Pause size={14} />}
      </button>
      {apagavel ? (
        <button className="preset-apagar" title="Apagar rotina" onClick={() => apagarRotina(r.id)}>
          <Trash2 size={14} />
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

function Grupo({ espaco, atual, rotinas, recarregar }: { espaco: ResumoEspaco; atual: boolean; rotinas: RotinaDoPanorama[] | null; recarregar: () => void }) {
  return (
    <section className="pagina-grupo" data-espaco={espaco.id}>
      <h3 className="pagina-grupo-titulo">
        <span className="pagina-grupo-cor" style={{ background: espaco.cor }} />
        {espaco.nome}
        <span className="suave pagina-grupo-nota">{atual ? 'aberto aqui' : 'ligar, desligar e testar valem aqui; apagar e criar, só no espaço aberto'}</span>
      </h3>
      {(rotinas ?? []).map((r) => (
        <Linha key={r.id} r={r} apagavel={atual} recarregar={recarregar} />
      ))}
      {rotinas && !rotinas.length && <p className="suave pagina-vazio">Nenhuma rotina neste espaço.</p>}
      {!rotinas && <p className="suave pagina-vazio">Lendo…</p>}
    </section>
  )
}

function Nova({ cartaoInicial }: { cartaoInicial: string }) {
  const plano = planoAtual()
  const agentes = (plano?.nos ?? []).flatMap((n) => (n.tipo === 'terminal' ? [{ id: n.id, nome: n.nome }] : []))
  const [cartao, setCartao] = useState(cartaoInicial || agentes[0]?.id || '')
  const [nome, setNome] = useState('')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<QuandoDaRotina['tipo']>('cada')
  const [minutos, setMinutos] = useState(30)
  const [horaDoDia, setHoraDoDia] = useState('09:00')
  const [dia, setDia] = useState(1)

  useEffect(() => {
    if (cartaoInicial) setCartao(cartaoInicial)
  }, [cartaoInicial])

  function quando(): QuandoDaRotina {
    const [h, m] = horaDoDia.split(':').map((n) => Number(n) || 0)
    if (tipo === 'cada') return { tipo: 'cada', minutos }
    if (tipo === 'diario') return { tipo: 'diario', hora: h, minuto: m }
    return { tipo: 'semanal', dia, hora: h, minuto: m }
  }

  function criar(): void {
    const erro = criarRotina({ nome, terminal: cartao, texto, quando: quando() })
    if (erro) return void avisar('Rotinas', erro)
    setNome('')
    setTexto('')
  }

  return (
    <div className="rotina-nova" data-rotina-nova>
      <div className="rotina-campos">
        <input className="rotina-campo-nome" value={nome} placeholder="Nome (ex.: Relatório do dia)" onChange={(e) => setNome(e.target.value)} />
        <select value={cartao} onChange={(e) => setCartao(e.target.value)}>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
          {!agentes.length && <option value="">nenhum agente no andar à mostra</option>}
        </select>
      </div>
      <textarea className="rotina-texto" value={texto} rows={3} placeholder="O que digitar no cartão (um pedido ao agente, ou um comando no shell)" onChange={(e) => setTexto(e.target.value)} />
      <div className="rotina-campos">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as QuandoDaRotina['tipo'])}>
          <option value="cada">a cada…</option>
          <option value="diario">todo dia às…</option>
          <option value="semanal">toda semana…</option>
        </select>
        {tipo === 'cada' && (
          <label className="rotina-minutos">
            <input type="number" min={MIN_MINUTOS} max={MAX_MINUTOS} value={minutos} onChange={(e) => setMinutos(Number(e.target.value) || MIN_MINUTOS)} />
            <span className="suave">minutos</span>
          </label>
        )}
        {tipo === 'semanal' && (
          <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
            {DIAS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        )}
        {tipo !== 'cada' && <input type="time" value={horaDoDia} onChange={(e) => setHoraDoDia(e.target.value)} />}
        <span className="espaco-flex" />
        <button className="preset-novo" disabled={!agentes.length} onClick={criar}>
          <Plus size={14} /> Criar rotina
        </button>
      </div>
    </div>
  )
}

export function Rotinas() {
  const { espacos, atualId, panorama, recarregar } = usarPanorama({ agentes: false })
  const [cartao, setCartao] = useState(() => pegarCartaoPedido() ?? '')
  // pedido que chega com a página já montada (menu do cartão)
  useEffect(() => aoChegarPedidoDePagina(() => setCartao(pegarCartaoPedido() ?? '')), [])
  return (
    <div className="pagina-geral" data-pagina-geral="rotinas">
      <header className="pagina-cabecalho">
        <h2>Rotinas</h2>
        <p className="suave">
          O app digita o pedido no cartão na hora marcada. Se o terminal estiver <b>ocupado</b>, parado numa pergunta ou encerrado, ele <b>pula a vez</b> em
          vez de escrever no meio do trabalho. As rotinas correm enquanto o espaço está aberto numa janela; as dos outros espaços aparecem aqui, mas só correm quando eles são abertos.
        </p>
      </header>
      <div className="pagina-corpo">
        {espacos.map((e) => (
          <Grupo key={e.id} espaco={e} atual={e.id === atualId} rotinas={panorama ? panorama.rotinas.filter((x) => x.espacoId === e.id) : null} recarregar={recarregar} />
        ))}
        {!espacos.length && <p className="suave pagina-vazio">Nenhum espaço ainda.</p>}
        {atualId && (
          <section className="pagina-grupo">
            <h3 className="pagina-grupo-titulo">Nova rotina no espaço aberto</h3>
            <Nova cartaoInicial={cartao} />
          </section>
        )}
      </div>
    </div>
  )
}
