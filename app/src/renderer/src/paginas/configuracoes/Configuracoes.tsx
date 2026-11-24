import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppWindow, ArrowRight, FolderOpen, HardDrive, Info, Keyboard, LayoutGrid, Palette, Plug, Settings, SlidersHorizontal } from 'lucide-react'
import { alternarLinhasDoCodigo, usarLoja } from '../../estado/loja'
import { SECOES as ATALHOS_DO_QUADRO } from '../../ui/Atalhos'
import { Conexoes } from '../conexoes/Conexoes'
import { apiPaginas, usarPaginas } from '../extra/estado'
import { Temas } from '../temas/Temas'
import { TEMAS } from '../../../../shared/temas'
import { aoMudarSecao, abrirConfiguracoes, escolherSecao, ultimaSecao, type SecaoDeConfiguracoes } from './abrir'
import '../../estilos/configuracoes.css'

// A página Configurações (1.9.6, A2): o que a engrenagem abre. Navegação lateral por seções; Aparência é a página Temas
// inteira e Conexões são as quatro abas de antes, sem mudança. Só entra aqui o que já existe e funciona no app.

const SECOES: Array<{ id: SecaoDeConfiguracoes; titulo: string; icone: ReactNode }> = [
  { id: 'geral', titulo: 'Geral', icone: <SlidersHorizontal size={16} /> },
  { id: 'aparencia', titulo: 'Aparência', icone: <Palette size={16} /> },
  { id: 'conexoes', titulo: 'Conexões', icone: <Plug size={16} /> },
  { id: 'atalhos', titulo: 'Atalhos', icone: <Keyboard size={16} /> }
]

/** As versões do motor, lidas do próprio navegador (Electron e Chromium vêm no user agent). */
function versoesDoMotor(): string {
  const ua = navigator.userAgent
  const electron = /Electron\/([\d.]+)/.exec(ua)?.[1]
  const chromium = /Chrome\/([\d.]+)/.exec(ua)?.[1]
  return [electron && `Electron ${electron}`, chromium && `Chromium ${chromium}`].filter(Boolean).join(' · ')
}

function Cartao({ titulo, icone, children, dado }: { titulo: string; icone: ReactNode; children: ReactNode; dado: string }) {
  return (
    <section className="config-cartao" data-config-cartao={dado}>
      <h3 className="config-cartao-titulo">
        {icone} {titulo}
      </h3>
      {children}
    </section>
  )
}

/** Caminho do Windows (letra de unidade ou \\servidor) sempre com contrabarra, para os dois caminhos saírem iguais. */
const caminhoParaMostrar = (p: string): string => (/^([A-Za-z]:|[\\/]{2})/.test(p) ? p.replace(/\//g, '\\') : p)

/** Quebra linha só depois de um separador; no meio de um nome de pasta, só se ele sozinho não couber na linha. */
function Caminho({ texto }: { texto: string }) {
  const partes = texto.split(/(?<=[\\/])/)
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i}>
          <span className="config-caminho-parte">{parte}</span>
          {i < partes.length - 1 && <wbr />}
        </span>
      ))}
    </>
  )
}

/** A pasta de dados e a do registro (o log), com "Abrir pasta". Os caminhos vêm do processo principal. */
function PastasDoApp() {
  const [pastas, definirPastas] = useState<{ dados: string; registro: string } | null>(null)
  const [erro, definirErro] = useState('')
  useEffect(() => {
    window.ork.dados.pastasDoApp().then(definirPastas, (e) => definirErro(`Não consegui ler onde ficam os dados: ${e instanceof Error ? e.message : String(e)}`))
  }, [])
  const abrir = (qual: 'dados' | 'registro'): void =>
    void window.ork.dados.abrirPastaDoApp(qual).then(
      (r) => definirErro(r ? `Não consegui abrir a pasta: ${r}` : ''),
      (e) => definirErro(`Não consegui abrir a pasta: ${e instanceof Error ? e.message : String(e)}`)
    )
  const linha = (qual: 'dados' | 'registro', rotulo: string, nota: string) => (
    <div className="config-pasta" data-config-pasta={qual}>
      <div className="config-pasta-texto">
        <b>{rotulo}</b>
        <code title={pastas ? caminhoParaMostrar(pastas[qual]) : undefined}>{pastas ? <Caminho texto={caminhoParaMostrar(pastas[qual])} /> : 'Lendo…'}</code>
        <span className="suave config-miudo">{nota}</span>
      </div>
      <button type="button" className="config-botao" disabled={!pastas} onClick={() => abrir(qual)}>
        <FolderOpen size={14} /> Abrir pasta
      </button>
    </div>
  )
  return (
    <Cartao titulo="Onde ficam os dados" icone={<HardDrive size={15} />} dado="pastas">
      {linha('dados', 'Pasta de dados', 'Espaços, quadros, post-its, preferências, temas, chaves e páginas próprias, em JSON e Markdown.')}
      {linha('registro', 'Registro (log)', 'Um arquivo .jsonl por dia: comandos do ork, recados, entregas e rotinas entre os agentes.')}
      {erro && (
        <p className="config-erro" role="alert">
          {erro}
        </p>
      )}
    </Cartao>
  )
}

function Geral() {
  const linhas = usarLoja((e) => e.preferencias.linhasDoCodigo !== false)
  const tema = usarLoja((e) => e.preferencias.tema)
  const temPaginas = !!apiPaginas()
  const { lista } = usarPaginas()
  const nomeDoTema = TEMAS.find((t) => t.id === tema)?.rotulo ?? tema
  const motor = versoesDoMotor()
  return (
    <div className="pagina-geral" data-config-conteudo="geral">
      <header className="pagina-cabecalho">
        <h2>Geral</h2>
        <p className="suave">A versão do app, onde ficam os dados e as escolhas que valem para o Orkester inteiro.</p>
      </header>
      <div className="pagina-corpo">
        <div className="config-grade">
          <Cartao titulo="Sobre" icone={<Info size={15} />} dado="sobre">
            <p className="config-versao">
              Orkester <b data-versao-do-app>{__VERSAO__}</b>
            </p>
            <p className="suave">Quadro infinito para orquestrar agentes de código.</p>
            {motor && <p className="suave config-miudo">{motor}</p>}
          </Cartao>
          <PastasDoApp />
          <Cartao titulo="Quadro" icone={<LayoutGrid size={15} />} dado="quadro">
            <label className="config-chave" data-config-linhas>
              <input type="checkbox" role="switch" checked={linhas} onChange={alternarLinhasDoCodigo} />
              <span>Linhas entre o agente e os cartões de código dele</span>
            </label>
            <p className="suave">É a mesma opção "Mostrar as linhas até os visores" do menu do código do terminal.</p>
          </Cartao>
          <Cartao titulo="Aparência" icone={<Palette size={15} />} dado="aparencia">
            <p>
              Tema em uso: <b data-config-tema>{nomeDoTema}</b>
            </p>
            <button type="button" className="config-link" onClick={() => escolherSecao('aparencia')}>
              Mudar o tema e a cor de destaque <ArrowRight size={13} />
            </button>
          </Cartao>
          {temPaginas && (
            <Cartao titulo="Páginas próprias" icone={<AppWindow size={15} />} dado="paginas">
              <p data-config-paginas={lista ? (lista.ligadas ? 'ligadas' : 'desligadas') : undefined}>
                {!lista ? 'Lendo…' : lista.ligadas ? `Ligadas · ${lista.paginas.length} instalada(s)` : 'Desligadas'}
              </p>
              <button type="button" className="config-link" onClick={() => abrirConfiguracoes('conexoes', 'paginas')}>
                Ligar, desligar e rever permissões em Conexões › Páginas <ArrowRight size={13} />
              </button>
            </Cartao>
          )}
        </div>
      </div>
    </div>
  )
}

/** Os atalhos de cada página, lidos do código de cada uma (paginas/kanban/atalhos.ts e paginas/leitor/atalhos.ts). */
const ATALHOS_DAS_PAGINAS: Array<[string, Array<[string, string]>]> = [
  [
    'Kanban',
    [
      ['N', 'Nova tarefa'],
      ['/', 'Busca'],
      ['Esc', 'Fecha o painel da tarefa (num campo, o primeiro Esc só tira o foco)']
    ]
  ],
  [
    'Leitor de Markdown',
    [
      ['Ctrl + F', 'Busca no arquivo'],
      ['Esc', 'Limpa a busca'],
      ['Alt + ←', 'Volta ao arquivo anterior']
    ]
  ]
]

function GrupoDeAtalhos({ titulo, linhas }: { titulo: string; linhas: Array<[string, string]> }) {
  return (
    <section className="config-cartao config-atalhos" data-config-atalhos={titulo}>
      <h3 className="config-cartao-titulo">{titulo}</h3>
      {linhas.map(([tecla, oQue]) => (
        <div key={tecla} className="config-atalho">
          <kbd>{tecla}</kbd>
          <span>{oQue}</span>
        </div>
      ))}
    </section>
  )
}

function Atalhos() {
  return (
    <div className="pagina-geral" data-config-conteudo="atalhos">
      <header className="pagina-cabecalho">
        <h2>Atalhos</h2>
        <p className="suave">
          Os atalhos do teclado, por página. No quadro, <kbd>?</kbd> abre a mesma lista do quadro numa janela.
        </p>
      </header>
      <div className="pagina-corpo">
        <h4 className="config-subtitulo">No Quadro</h4>
        <div className="config-grade">
          {ATALHOS_DO_QUADRO.map(([titulo, linhas]) => (
            <GrupoDeAtalhos key={titulo} titulo={titulo} linhas={linhas} />
          ))}
        </div>
        <h4 className="config-subtitulo">Nas outras páginas (valem só com a página aberta)</h4>
        <div className="config-grade">
          {ATALHOS_DAS_PAGINAS.map(([titulo, linhas]) => (
            <GrupoDeAtalhos key={titulo} titulo={titulo} linhas={linhas} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Configuracoes() {
  const secao = useSyncExternalStore(aoMudarSecao, ultimaSecao)
  return (
    <div className="configuracoes" data-pagina-geral="configuracoes">
      <nav className="config-nav" aria-label="Seções das Configurações">
        <h2 className="config-nav-titulo">
          <Settings size={17} /> Configurações
        </h2>
        {SECOES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`config-nav-item ${secao === s.id ? 'ativo' : ''}`}
            aria-current={secao === s.id ? 'page' : undefined}
            data-config-secao={s.id}
            onClick={() => escolherSecao(s.id)}
          >
            {s.icone} {s.titulo}
          </button>
        ))}
      </nav>
      <div className="config-conteudo">
        {secao === 'geral' && <Geral />}
        {secao === 'aparencia' && (
          <div className="config-embutida" data-config-conteudo="aparencia">
            <Temas />
          </div>
        )}
        {secao === 'conexoes' && (
          <div className="config-embutida" data-config-conteudo="conexoes">
            <Conexoes />
          </div>
        )}
        {secao === 'atalhos' && <Atalhos />}
      </div>
    </div>
  )
}
