import { useEffect, useState } from 'react'
import { Pencil, Play, Trash2 } from 'lucide-react'
import type { Partitura, ResumoEspaco } from '../../../../shared/modelo'
import type { AgenteDoPanorama } from '../../../../shared/api'
import { rotuloModelo } from '../../../../shared/modelos'
import { resumoDaPartitura } from '../../../../shared/quadro/partituras'
import { definirPartituras, usarLoja } from '../../estado/loja'
import { EditorDeFuncoes } from './Funcoes'
import { EditorDePresets } from './Presets'
import { confirmar, perguntarTexto } from '../../ui/Perguntas'
import { subirPartituraNoCentro } from '../../ui/Partituras'
import { irParaPagina } from '../../casca/paginas'
import { aoChegarPedidoDePagina, pegarAbaPedida, type AbaAgentes } from '../abrir'
import { usarPanorama } from '../panorama'

// Agentes (página geral): os agentes de todos os espaços, agrupados por espaço, e as peças que os montam —
// Funções, Presets e Partituras. Todos os espaços vêm do processo principal, com livre/ocupado e a caixa de
// entrada de cada agente vivo, em qualquer janela. Só leitura: agente de outro espaço não se comanda daqui.

const ABAS: Array<[AbaAgentes, string]> = [
  ['agora', 'Agentes'],
  ['funcoes', 'Funções'],
  ['presets', 'Presets'],
  ['partituras', 'Partituras']
]

const MOTOR: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', shell: 'PowerShell' }
const SITUACAO: Record<AgenteDoPanorama['situacao'], string> = { livre: 'livre', trabalhando: 'ocupado', pergunta: 'numa pergunta', encerrado: 'encerrado' }

function LinhaAgente({ ag }: { ag: AgenteDoPanorama }) {
  const modelo = rotuloModelo(ag)
  return (
    <div className="agente-linha" data-agente={ag.id}>
      <span className="agente-nome">{ag.nome}</span>
      <span className="agente-funcao suave">{ag.funcao ?? 'sem função'}</span>
      <span className="agente-motor">{MOTOR[ag.agente] ?? ag.agente}</span>
      <span className="agente-modelo suave">{modelo || 'padrão do motor'}</span>
      <span className={`agente-situacao situacao-${ag.situacao}`}>{SITUACAO[ag.situacao]}</span>
      <span className="agente-caixa suave">{ag.fila ? `${ag.fila} recado${ag.fila > 1 ? 's' : ''} esperando` : 'caixa vazia'}</span>
    </div>
  )
}

function GrupoAgentes({ espaco, atual, agentes }: { espaco: ResumoEspaco; atual: boolean; agentes: AgenteDoPanorama[] | null }) {
  return (
    <section className="pagina-grupo" data-espaco={espaco.id}>
      <h3 className="pagina-grupo-titulo">
        <span className="pagina-grupo-cor" style={{ background: espaco.cor }} />
        {espaco.nome}
        <span className="suave pagina-grupo-nota">{atual ? 'aberto aqui' : 'só leitura: comande no quadro do espaço'}</span>
      </h3>
      {(agentes ?? []).map((ag) => (
        <LinhaAgente key={ag.id} ag={ag} />
      ))}
      {agentes && !agentes.length && <p className="suave pagina-vazio">Nenhum agente vivo neste espaço.</p>}
      {!agentes && <p className="suave pagina-vazio">Lendo…</p>}
    </section>
  )
}

function AbaAgora() {
  const { espacos, atualId, panorama } = usarPanorama()
  return (
    <>
      {espacos.map((e) => (
        <GrupoAgentes key={e.id} espaco={e} atual={e.id === atualId} agentes={panorama ? panorama.agentes.filter((x) => x.espacoId === e.id) : null} />
      ))}
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
      {partituras.map((p) => (
        <div key={p.id} className="partitura-linha" data-partitura={p.id}>
          <div className="partitura-dados">
            <span className="partitura-nome">{p.nome}</span>
            <span className="partitura-resumo suave">{resumoDaPartitura(p)}</span>
          </div>
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
      ))}
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
