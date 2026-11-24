import { useMemo, type DragEvent } from 'react'
import { Folder, FolderOpen, FolderPlus, Layers, Pencil, Trash2 } from 'lucide-react'
import type { PastaDeFluxos, ResumoDeFluxo } from './contrato'
import { arvoreDePastas, contarPorPasta, mesmaVista, motivoSemCriarPasta, type PastaNaArvore, type Vista } from './textos'

// A barra lateral de pastas: "Todos", "Sem pasta" (a raiz) e a árvore de até 3 níveis. Cada pasta e a raiz recebem um
// fluxo arrastado da lista. Criar, renomear e apagar são pedidos à página (que pergunta e fala com o main).

interface Props {
  pastas: readonly PastaDeFluxos[]
  fluxos: readonly ResumoDeFluxo[]
  vista: Vista
  aoEscolher: (v: Vista) => void
  editavel: boolean
  /** Há um fluxo sendo arrastado: as pastas viram alvo. */
  arrastando: boolean
  /** `null` = raiz. */
  aoSoltar: (pasta: string | null) => void
  /** `pai: null` = raiz. */
  aoNova: (pai: string | null) => void
  aoRenomear: (p: PastaDeFluxos) => void
  aoApagar: (p: PastaDeFluxos) => void
}

function Contagem({ n }: { n: number }) {
  return <span className="fluxo-pasta-contagem">{n}</span>
}

export function Pastas({ pastas, fluxos, vista, aoEscolher, editavel, arrastando, aoSoltar, aoNova, aoRenomear, aoApagar }: Props) {
  const arvore = useMemo(() => arvoreDePastas(pastas), [pastas])
  const contagem = useMemo(() => contarPorPasta(fluxos, pastas), [fluxos, pastas])
  // "Nova pasta" cria dentro da pasta escolhida; em "Todos" ou "Sem pasta", na raiz
  const pai = vista.tipo === 'pasta' && arvore.some((p) => p.id === vista.id) ? vista.id : null
  const paiNome = pai ? arvore.find((p) => p.id === pai)?.nome : undefined
  const semCriar = motivoSemCriarPasta(pastas, pai)

  const alvo = (destino: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!editavel || !arrastando) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: DragEvent) => {
      if (!editavel || !arrastando) return
      e.preventDefault()
      aoSoltar(destino)
    }
  })

  const linhaDaPasta = (p: PastaNaArvore) => {
    const ativa = vista.tipo === 'pasta' && vista.id === p.id
    const Icone = ativa ? FolderOpen : Folder
    return (
      <li
        key={p.id}
        className={`fluxo-pasta ${ativa ? 'ativa' : ''} ${arrastando && editavel ? 'alvo' : ''}`}
        style={{ paddingLeft: `calc(var(--espaco-2) + ${(p.nivel - 1) * 14}px)` }}
        data-fluxo-pasta={p.id}
        {...alvo(p.id)}
      >
        <button className="fluxo-pasta-nome" aria-current={ativa ? 'true' : undefined} title={p.caminho} onClick={() => aoEscolher({ tipo: 'pasta', id: p.id })}>
          <Icone size={15} aria-hidden />
          <span className="fluxo-pasta-texto">{p.nome}</span>
          <Contagem n={contagem.get(p.id) ?? 0} />
        </button>
        {editavel && (
          <span className="fluxo-pasta-acoes">
            <button className="preset-apagar" aria-label={`Renomear a pasta ${p.nome}`} title="Renomear" onClick={() => aoRenomear(p)}>
              <Pencil size={13} />
            </button>
            <button className="preset-apagar" aria-label={`Apagar a pasta ${p.nome}`} title="Apagar" onClick={() => aoApagar(p)}>
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </li>
    )
  }

  return (
    <nav className="fluxo-pastas" aria-label="Pastas de fluxos" data-fluxos-pastas>
      <div className="fluxo-pastas-topo">
        <span className="fluxo-pastas-titulo">Pastas</span>
        <button
          className="fluxo-botao"
          disabled={!editavel || !!semCriar}
          title={!editavel ? 'Abra este espaço nesta janela para criar pastas' : semCriar ? `Nova pasta: ${semCriar}` : paiNome ? `Nova pasta dentro de "${paiNome}"` : 'Nova pasta'}
          onClick={() => aoNova(pai)}
          data-fluxos-nova-pasta
        >
          <FolderPlus size={14} /> Nova
        </button>
      </div>
      <ul className="fluxo-pastas-lista">
        <li className={`fluxo-pasta ${vista.tipo === 'todos' ? 'ativa' : ''}`} data-fluxo-pasta="todos">
          <button className="fluxo-pasta-nome" aria-current={vista.tipo === 'todos' ? 'true' : undefined} onClick={() => aoEscolher({ tipo: 'todos' })}>
            <Layers size={15} aria-hidden />
            <span className="fluxo-pasta-texto">Todos os fluxos</span>
            <Contagem n={fluxos.length} />
          </button>
        </li>
        <li
          className={`fluxo-pasta ${mesmaVista(vista, { tipo: 'raiz' }) ? 'ativa' : ''} ${arrastando && editavel ? 'alvo' : ''}`}
          data-fluxo-pasta="raiz"
          {...alvo(null)}
        >
          <button className="fluxo-pasta-nome" aria-current={vista.tipo === 'raiz' ? 'true' : undefined} onClick={() => aoEscolher({ tipo: 'raiz' })}>
            <Folder size={15} aria-hidden />
            <span className="fluxo-pasta-texto">Sem pasta</span>
            <Contagem n={contagem.get('') ?? 0} />
          </button>
        </li>
        {arvore.map(linhaDaPasta)}
      </ul>
      {editavel && <p className="fluxo-pastas-dica suave">Arraste um fluxo até uma pasta para guardá-lo nela.</p>}
    </nav>
  )
}
