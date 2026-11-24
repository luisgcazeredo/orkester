import { RefreshCw } from 'lucide-react'
import type { ResumoDaExecucao } from '../../../../shared/fluxos/tipos'
import { duracaoEmTexto, modoEmTexto, motivoDaExecucao, quandoFoi, textoDoResultado } from './execucoes/textos'
import { usarExecucoes } from './execucoes/usarExecucoes'
import '../../estilos/fluxos-execucoes.css'

// As execuções de um fluxo: as 50 últimas, da mais nova para a mais antiga. Cada linha diz quando foi, como começou
// (um gatilho ou o Rodar fluxo), quanto demorou, o resultado e o motivo quando não foi um "ok" simples (barrado, pulado,
// erro). Clicar numa linha abre aquela execução no editor (nós pintados, itens nas ligações, entrada e saída no painel);
// clicar de novo na aberta fecha. Quem monta decide onde: o editor põe esta lista num painel ao lado.

interface Props {
  espacoId: string
  /** `null` = fluxo ainda não salvo (não tem execuções). */
  fluxoId: string | null
  /** A execução aberta no editor, se houver. */
  abertaId: string | null
  /** `null` = fechar a que está aberta. */
  aoAbrir: (execId: string | null) => void
  /** id do nó → nome, para dizer em que nó deu erro (`ResumoDaExecucao.noComErro` é um id). */
  nomesDosNos?: Readonly<Record<string, string>>
}

function Linha({ r, aberta, nomes, aoAbrir }: { r: ResumoDaExecucao; aberta: boolean; nomes: Readonly<Record<string, string>>; aoAbrir: (id: string | null) => void }) {
  const res = textoDoResultado(r.resultado)
  const motivo = motivoDaExecucao(r, nomes)
  return (
    <li>
      <button type="button" className={`exec-linha ${aberta ? 'aberta' : ''}`} aria-pressed={aberta} onClick={() => aoAbrir(aberta ? null : r.id)} data-execucao={r.id} data-resultado={r.resultado}>
        <span className={`exec-resultado ${res.tom}`}>{res.texto}</span>
        <span className="exec-quando">{quandoFoi(r.inicio)}</span>
        <span className="suave exec-duracao">{duracaoEmTexto(r.ms)}</span>
        <span className="suave exec-origem" title={r.gatilho}>
          {modoEmTexto(r.modo)}
          {r.gatilho ? ` · ${r.gatilho}` : ''}
        </span>
        {motivo && <span className={`exec-motivo ${res.tom}`}>{motivo}</span>}
      </button>
    </li>
  )
}

export function Execucoes({ espacoId, fluxoId, abertaId, aoAbrir, nomesDosNos = {} }: Props) {
  const { lista, erro, recarregar } = usarExecucoes(espacoId, fluxoId)
  return (
    <section className="exec-painel" data-execucoes aria-label="Execuções do fluxo">
      <header className="exec-topo">
        <h3>Execuções</h3>
        {lista && <span className="suave">{lista.length === 1 ? '1 execução' : `${lista.length} execuções`}</span>}
        <span className="exec-flex" />
        <button type="button" className="exec-atualizar" title="Ler a lista de novo" aria-label="Atualizar a lista de execuções" onClick={recarregar} disabled={!fluxoId}>
          <RefreshCw size={14} />
        </button>
      </header>
      {!fluxoId && <p className="suave exec-vazio">Salve o fluxo para ele começar a guardar as execuções.</p>}
      {fluxoId && erro && (
        <p className="exec-erro" role="alert">
          Não consegui ler as execuções: {erro}
        </p>
      )}
      {fluxoId && !erro && !lista && <p className="suave exec-vazio">Lendo…</p>}
      {fluxoId && lista && !lista.length && <p className="suave exec-vazio">Nenhuma execução ainda. Quando o fluxo disparar, ou com o Rodar fluxo, ela aparece aqui.</p>}
      {!!lista?.length && (
        <>
          <ol className="exec-lista">
            {lista.map((r) => (
              <Linha key={r.id} r={r} aberta={r.id === abertaId} nomes={nomesDosNos} aoAbrir={aoAbrir} />
            ))}
          </ol>
          <p className="suave exec-nota">O Orkester guarda as 50 últimas de cada fluxo; as mais antigas somem sozinhas.</p>
        </>
      )}
    </section>
  )
}
