import { useMemo, type ReactNode } from 'react'
import { GripVertical, Trash2 } from 'lucide-react'
import type { PastaDeFluxos, ResumoDeFluxo } from './contrato'
import { arvoreDePastas, caminhoDaPasta, quandoFoi, selosDoFluxo, textoDeQuemCriou, textoDeQuemEditou, textoDoResultado, textoDosGatilhos } from './textos'

// A lista de fluxos: uma linha por fluxo, com o interruptor, os selos, quem criou e editou, e o último disparo com o
// resultado. A linha se arrasta até uma pasta; o seletor "Mover" faz o mesmo para quem usa o teclado.

interface Acoes {
  /** Clicar no nome abre o fluxo no editor. */
  abrir: (f: ResumoDeFluxo) => void
  ligar: (f: ResumoDeFluxo) => void
  apagar: (f: ResumoDeFluxo) => void
  /** `null` = raiz. */
  mover: (f: ResumoDeFluxo, pasta: string | null) => void
  /** `null` = o arrasto acabou. */
  arrastar: (id: string | null) => void
}

interface Props {
  fluxos: readonly ResumoDeFluxo[]
  pastas: readonly PastaDeFluxos[]
  /** Mostra a pasta de cada fluxo (vista "Todos" e busca). */
  comPasta: boolean
  editavel: boolean
  /** Por que a lista está vazia (a página escolhe o texto; sem nenhum fluxo, também o "como começar"). */
  vazio: ReactNode
  acoes: Acoes
}

function Interruptor({ ligado, disabled, alternar, rotulo }: { ligado: boolean; disabled?: boolean; alternar: () => void; rotulo: string }) {
  return (
    <button
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      title={ligado ? 'Ligado: clique para desligar' : 'Desligado: clique para ligar'}
      className={`fluxo-interruptor ${ligado ? 'ligado' : ''}`}
      disabled={disabled}
      onClick={alternar}
    >
      <span className="fluxo-interruptor-bola" />
    </button>
  )
}

function Linha({ f, pastas, arvore, comPasta, editavel, acoes }: { f: ResumoDeFluxo; pastas: readonly PastaDeFluxos[]; arvore: ReturnType<typeof arvoreDePastas>; comPasta: boolean; editavel: boolean; acoes: Acoes }) {
  const editada = textoDeQuemEditou(f)
  const resultado = f.ultima ? textoDoResultado(f.ultima.resultado) : null
  const pasta = comPasta && f.pasta ? caminhoDaPasta(pastas, f.pasta) : ''
  return (
    <li
      className={`fluxo-linha ${f.ligado ? '' : 'desligado'}`}
      data-fluxo={f.id}
      draggable={editavel}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', f.id)
        acoes.arrastar(f.id)
      }}
      onDragEnd={() => acoes.arrastar(null)}
    >
      <Interruptor ligado={f.ligado} disabled={!editavel} alternar={() => acoes.ligar(f)} rotulo={`Ligar ou desligar "${f.nome}"`} />
      <div className="fluxo-dados">
        <span className="fluxo-nome">
          <button type="button" className="fluxo-abrir" title={editavel ? 'Abrir no editor' : 'Abrir no editor (só olhar)'} onClick={() => acoes.abrir(f)} data-fluxo-abrir={f.id}>
            {f.nome}
          </button>
          {selosDoFluxo(f).map((s) => (
            <span key={s.texto} className={`fluxo-selo ${s.tipo}`}>
              {s.texto}
            </span>
          ))}
        </span>
        <span className="suave fluxo-detalhe">
          {textoDosGatilhos(f.gatilhos)} · {f.nos} {f.nos === 1 ? 'nó' : 'nós'} · até {f.limite.porHora}/hora
          {pasta && ` · em ${pasta}`}
        </span>
        <span className="suave fluxo-detalhe">
          {textoDeQuemCriou(f.criadoPor)}
          {editada && ` · ${editada}`}
        </span>
      </div>
      <div className="fluxo-ultimo" data-fluxo-ultimo>
        {f.ultima && resultado ? (
          <>
            <span className={`fluxo-resultado ${resultado.tom}`} title={f.ultima.erro ? `${f.ultima.noComErro ? `${f.ultima.noComErro}: ` : ''}${f.ultima.erro}` : f.ultima.gatilho}>
              {resultado.texto}
            </span>
            <span className="suave fluxo-detalhe">{quandoFoi(f.ultima.inicio)}</span>
          </>
        ) : (
          <span className="suave fluxo-detalhe">nunca disparou</span>
        )}
      </div>
      <div className="fluxo-acoes">
        <select
          className="fluxo-mover"
          aria-label={`Mover "${f.nome}" para uma pasta`}
          title="Mover para uma pasta"
          disabled={!editavel}
          value={f.pasta ?? ''}
          onChange={(e) => acoes.mover(f, e.target.value || null)}
        >
          <option value="">Sem pasta</option>
          {arvore.map((p) => (
            <option key={p.id} value={p.id}>
              {' '.repeat(p.nivel - 1)}
              {p.nome}
            </option>
          ))}
        </select>
        <button className="preset-apagar" title="Apagar o fluxo" aria-label={`Apagar "${f.nome}"`} disabled={!editavel} onClick={() => acoes.apagar(f)}>
          <Trash2 size={14} />
        </button>
        {editavel && <GripVertical size={14} className="fluxo-alca" aria-hidden />}
      </div>
    </li>
  )
}

export function Lista({ fluxos, pastas, comPasta, editavel, vazio, acoes }: Props) {
  const arvore = useMemo(() => arvoreDePastas(pastas), [pastas])
  if (!fluxos.length)
    return typeof vazio === 'string' ? (
      <p className="suave pagina-vazio" data-fluxos-vazio>
        {vazio}
      </p>
    ) : (
      <div className="pagina-vazio fluxo-vazio" data-fluxos-vazio>
        {vazio}
      </div>
    )
  return (
    <ul className="fluxo-linhas" data-fluxos-lista>
      {fluxos.map((f) => (
        <Linha key={f.id} f={f} pastas={pastas} arvore={arvore} comPasta={comPasta} editavel={editavel} acoes={acoes} />
      ))}
    </ul>
  )
}
