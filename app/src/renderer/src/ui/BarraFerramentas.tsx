import { useEffect, useState } from 'react'
import {
  Eraser,
  FolderTree,
  Globe,
  MousePointer2,
  MoveUpRight,
  Paperclip,
  Pencil,
  Square,
  SquareTerminal,
  StickyNote,
  Type,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { PincelDesenho, Funcao, Partitura } from '../../../shared/modelo'
import { resumoDaPartitura } from '../../../shared/quadro/partituras'
import { adicionarNo, definirEstiloDesenho, escolherFerramenta, planoAtual, usarLoja, type Ferramenta } from '../estado/loja'
import { anexarArquivoEm, arvoreEm, portalEm } from './menus'
import { centroDaTela } from '../quadro/geometria'
import { CORES_DE_DESENHO } from '../estado/coresDeDados'
import { COR_AGENTE, ICONE_AGENTE } from '../nos/icones'
import { subirPartituraNoCentro } from './Partituras'
import { abrirAgentes } from '../paginas/abrir'

const FORMAS: Array<[PincelDesenho, LucideIcon, string]> = [
  ['lapis', Pencil, 'Lápis'],
  ['retangulo', Square, 'Retângulo'],
  ['seta', MoveUpRight, 'Seta'],
  ['borracha', Eraser, 'Borracha: passe por cima dos traços para apagar (E)']
]

function Botao({
  icone: Icone,
  titulo,
  ativo,
  desligado,
  aoClicar
}: {
  icone: LucideIcon
  titulo: string
  ativo?: boolean
  desligado?: boolean
  aoClicar?: () => void
}) {
  return (
    <button
      className={`ferramenta ${ativo ? 'ativa' : ''}`}
      title={titulo}
      aria-label={titulo}
      disabled={desligado}
      onClick={aoClicar}
    >
      <Icone size={20} strokeWidth={1.7} />
    </button>
  )
}

/** Lista vazia constante: ver o comentário em `funcoes`. */
const SEM_FUNCOES: Funcao[] = []
const SEM_PARTITURAS: Partitura[] = []

export function BarraFerramentas() {
  const ferramenta = usarLoja((e) => e.ferramenta)
  const estilo = usarLoja((e) => e.estiloDesenho)
  const presets = usarLoja((e) => e.preferencias.presets)
  // sem o `?? []` aqui: um array novo a cada leitura faz o useSyncExternalStore repetir sem parar e a
  // janela fica em branco (custou uma rodada inteira do autoteste)
  const funcoes = usarLoja((e) => e.preferencias.funcoes) ?? SEM_FUNCOES
  const partituras = usarLoja((e) => e.preferencias.partituras) ?? SEM_PARTITURAS
  const [menuTerminal, abrirOuFecharMenu] = useState(false)
  const [filtro, setFiltro] = useState('')
  // fechar o menu limpa o filtro: na próxima vez ele abre com todas as funções
  const setMenuTerminal = (aberto: boolean): void => {
    abrirOuFecharMenu(aberto)
    if (!aberto) setFiltro('')
  }
  // Esc fecha o menu mesmo com o foco fora dele (a casca avisa por este evento, ver casca/Casca)
  useEffect(() => {
    if (!menuTerminal) return
    const fechar = (): void => setMenuTerminal(false)
    window.addEventListener('ork:fechar-menu-terminal', fechar)
    return () => window.removeEventListener('ork:fechar-menu-terminal', fechar)
  }, [menuTerminal])
  const procurado = filtro.trim().toLocaleLowerCase('pt-BR')
  const funcoesFiltradas = procurado ? funcoes.filter((f) => f.nome.toLocaleLowerCase('pt-BR').includes(procurado)) : funcoes

  const escolher = (f: Ferramenta) => () => {
    setMenuTerminal(false)
    escolherFerramenta(ferramenta === f && f !== 'selecionar' ? 'selecionar' : f)
  }

  function noCentro(): { x: number; y: number } {
    return centroDaTela(planoAtual()!.camera)
  }

  async function anexar(): Promise<void> {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    await anexarArquivoEm(x, y)
  }

  async function arvore(): Promise<void> {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    await arvoreEm(x, y)
  }

  function portal(): void {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    portalEm(x, y)
  }

  return (
    <div className="barra-ferramentas-pos">
      <div className="pilula barra-ferramentas">
        <Botao icone={MousePointer2} titulo="Selecionar (V)" ativo={ferramenta === 'selecionar'} aoClicar={escolher('selecionar')} />
        <Botao icone={SquareTerminal} titulo="Terminal" ativo={menuTerminal} aoClicar={() => setMenuTerminal(!menuTerminal)} />
        <Botao icone={StickyNote} titulo="Post-it (N)" ativo={ferramenta === 'postit'} aoClicar={escolher('postit')} />
        <Botao icone={Paperclip} titulo="Anexar arquivo" aoClicar={() => void anexar()} />
        <Botao icone={FolderTree} titulo="Árvore de arquivos de uma pasta" aoClicar={() => void arvore()} />
        <Botao icone={Globe} titulo="Portal: navegador no quadro" aoClicar={portal} />
        <Botao icone={Type} titulo="Texto (T)" ativo={ferramenta === 'texto'} aoClicar={escolher('texto')} />
        <Botao icone={Pencil} titulo="Desenhar (D)" ativo={ferramenta === 'desenho'} aoClicar={escolher('desenho')} />
      </div>

      {menuTerminal && (
        // Um painel com seções, e não uma pílula só: com o catálogo do time (18 funções) a pílula passava
        // da largura da janela e cortava os nomes (12/11/2026). As funções quebram em grade, e com muitas
        // aparece o filtro.
        <div
          className="menu-terminal"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMenuTerminal(false)
          }}
        >
          <div className="menu-terminal-secao">
            <span className="menu-terminal-titulo">Agentes</span>
            <div className="menu-terminal-grade">
              {presets.map((p) => {
                const Icone = ICONE_AGENTE[p.agente]
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setMenuTerminal(false)
                      const { x, y } = noCentro()
                      adicionarNo({ tipo: 'terminal', preset: p }, x, y, { noCentro: true })
                    }}
                  >
                    <Icone size={15} style={{ color: COR_AGENTE[p.agente] }} />
                    {p.nome}
                  </button>
                )
              })}
            </div>
          </div>
          {funcoes.length > 0 && (
            <div className="menu-terminal-secao">
              <div className="menu-terminal-cabeca">
                <span className="menu-terminal-titulo">Funções</span>
                {funcoes.length > 8 && (
                  <input
                    className="menu-terminal-filtro"
                    placeholder="Filtrar funções…"
                    value={filtro}
                    autoFocus
                    onChange={(e) => setFiltro(e.target.value)}
                    // Enter abre a primeira que sobrou no filtro
                    onKeyDown={(e) => {
                      const primeira = funcoesFiltradas[0]
                      if (e.key !== 'Enter' || !primeira) return
                      const preset = presets.find((p) => p.id === primeira.preset) ?? presets[0]
                      setMenuTerminal(false)
                      const { x, y } = noCentro()
                      adicionarNo({ tipo: 'terminal', preset, funcao: primeira }, x, y, { noCentro: true })
                    }}
                  />
                )}
              </div>
              <div className="menu-terminal-grade menu-terminal-grade-funcoes">
                {funcoesFiltradas.map((f) => {
                  // a função abre com o preset preferido dela, ou com o primeiro da lista
                  const preset = presets.find((p) => p.id === f.preset) ?? presets[0]
                  const Icone = ICONE_AGENTE[preset.agente]
                  return (
                    <button
                      key={f.id}
                      className="menu-terminal-funcao"
                      title={`${f.nome}\n\n${f.prompt.slice(0, 200)}`}
                      onClick={() => {
                        setMenuTerminal(false)
                        const { x, y } = noCentro()
                        adicionarNo({ tipo: 'terminal', preset, funcao: f }, x, y, { noCentro: true })
                      }}
                    >
                      <Icone size={15} style={{ color: COR_AGENTE[preset.agente] }} />
                      {f.nome}
                    </button>
                  )
                })}
                {!funcoesFiltradas.length && <span className="menu-terminal-vazio">Nenhuma função com “{filtro}”.</span>}
              </div>
            </div>
          )}
          {partituras.length > 0 && (
            <div className="menu-terminal-secao">
              <span className="menu-terminal-titulo">Times</span>
              <div className="menu-terminal-grade">
                {partituras.map((p) => (
                  <button
                    key={p.id}
                    className="menu-terminal-partitura"
                    title={`Subir este time: ${resumoDaPartitura(p)}`}
                    onClick={() => {
                      setMenuTerminal(false)
                      subirPartituraNoCentro(p)
                    }}
                  >
                    <Users size={15} />
                    {p.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="menu-terminal-rodape">
          <button
            className="menu-terminal-editar"
            onClick={() => {
              setMenuTerminal(false)
              abrirAgentes('presets')
            }}
          >
            Editar presets…
          </button>
          <button
            className="menu-terminal-funcoes"
            onClick={() => {
              setMenuTerminal(false)
              abrirAgentes('funcoes')
            }}
          >
            Editar funções…
          </button>
          <button
            className="menu-terminal-partituras"
            onClick={() => {
              setMenuTerminal(false)
              abrirAgentes('partituras')
            }}
          >
            Partituras…
          </button>
          </div>
        </div>
      )}

      {ferramenta === 'desenho' && (
        <div className="pilula barra-desenho">
          {FORMAS.map(([forma, Icone, titulo]) => (
            <button
              key={forma}
              className={`ferramenta pequena ${estilo.ferramenta === forma ? 'ativa' : ''}`}
              title={titulo}
              onClick={() => definirEstiloDesenho({ ferramenta: forma })}
            >
              <Icone size={16} />
            </button>
          ))}
          <span className="divisoria" />
          {CORES_DE_DESENHO.map((cor) => (
            <button
              key={cor}
              className={`amostra ${estilo.cor === cor ? 'ativa' : ''}`}
              style={{ background: cor }}
              title={cor}
              // escolher cor com a borracha na mão volta para o lápis
              onClick={() => definirEstiloDesenho({ cor, ...(estilo.ferramenta === 'borracha' ? { ferramenta: 'lapis' as const } : {}) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
