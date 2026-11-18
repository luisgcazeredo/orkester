import { BookOpen, LayoutGrid } from 'lucide-react'
import { lazy, Suspense } from 'react'
import * as loja from '../estado/loja'
import {
  abrirNovaJanela, agrupar, apagarSelecao, definirEstiloDesenho, desagrupar, desfazer, duplicarSelecao, editar, empurrarSelecao,
  escolherFerramenta, alternarExplorador, escreverPaginaAtiva, lerEstado, refazer, selecionar, selecionarTudo, usarLoja
} from '../estado/loja'
import { cancelarGestos, emGesto } from '../quadro/arrasto'
import { criarAtalhos } from '../quadro/atalhos'
import { colar, copiarSelecao } from '../ui/area'
import { abrirAtalhos } from '../ui/Atalhos'
import { enquadrarTudo, zoomPeloCentro } from '../ui/Controles'
import { abrirPaleta } from '../ui/Paleta'
import { menuAberto } from '../ui/MenuContexto'
import { Quadro } from '../quadro/Quadro'
import { BarraSelecao } from '../ui/BarraSelecao'
import { BarraFerramentas } from '../ui/BarraFerramentas'
import { BotaoLateral, CantoInferior, CantoSuperior } from '../ui/Controles'
import { VistaAndares } from '../ui/Andares'
import { atalhosDoLeitor } from '../paginas/leitor/atalhos'
import { DIALOGOS } from './dialogos'
import { acharPagina, ligarPaginaAtiva, paginaAtiva, paginasMontadas, PAGINA_INICIAL, registrarPagina, temPagina } from './paginas'

// A página ativa mora na loja (campo `paginaAtiva`), para a casca redesenhar quando ela mudar.
ligarPaginaAtiva({
  ler: () => lerEstado().paginaAtiva,
  escrever: escreverPaginaAtiva
})

function digitando(): boolean {
  return !!document.activeElement?.closest('input, textarea, [contenteditable], [data-teclado]')
}

/** O campo do terminal selecionado sozinho: ativo, o cartão é dono do teclado (ver terminal/CorpoXterm). */
function terminalComOTeclado(): HTMLElement | null {
  return document.querySelector('.no-terminal.selecionado.sozinho .xterm-helper-textarea')
}

const atalhosDoQuadro = criarAtalhos(
  () => ({
    pagina: paginaAtiva(),
    digitando: digitando(),
    menuAberto: menuAberto(),
    dialogoAberto: !!document.querySelector('.dialogo-fundo'),
    terminalComTeclado: terminalComOTeclado() !== null,
    emGesto: emGesto()
  }),
  {
    devolverFoco: () => terminalComOTeclado()?.focus(),
    cancelarGesto: cancelarGestos,
    zoom: zoomPeloCentro,
    enquadrarTudo,
    desfazer,
    refazer,
    duplicar: duplicarSelecao,
    selecionarTudo,
    agrupar,
    desagrupar,
    copiar: (recortar) => void (recortar ? copiarSelecao(true) : copiarSelecao()),
    colar: () => void colar(),
    paleta: abrirPaleta,
    novaJanela: abrirNovaJanela,
    alternarExplorador,
    empurrar: empurrarSelecao,
    mostrarAtalhos: abrirAtalhos,
    apagar: apagarSelecao,
    escape: () => {
      cancelarGestos()
      selecionar(null)
      editar(null)
      loja.abrirVistaAndares(false)
      escolherFerramenta('selecionar')
    },
    borracha: () => definirEstiloDesenho({ ferramenta: 'borracha' }),
    ferramenta: escolherFerramenta
  }
)

// O Leitor (e o markdown-it dele) só carrega quando a página abre; os atalhos vêm de um módulo pequeno à parte.
const LeitorPreguicoso = lazy(() => import('../paginas/leitor/Leitor').then((m) => ({ default: m.Leitor })))

function PaginaLeitor() {
  return (
    <Suspense fallback={null}>
      <LeitorPreguicoso />
    </Suspense>
  )
}

/** A página `quadro`: o corpo que o App tinha, sem mudança. */
function PaginaQuadro() {
  const carregado = usarLoja((e) => e.carregado)
  const temEspaco = usarLoja((e) => e.espaco !== null)
  const erroAoSalvar = usarLoja((e) => e.erroAoSalvar)
  return (
    <main className="area">
      {carregado && temEspaco && <Quadro />}
      {temEspaco && <VistaAndares />}
      <BotaoLateral />
      <BarraFerramentas />
      <CantoSuperior />
      {temEspaco && <CantoInferior />}
      {carregado && temEspaco && <BarraSelecao />}
      {erroAoSalvar && (
        <div className="pilula aviso-erro" title={erroAoSalvar}>
          Não consegui salvar. Tento de novo na próxima mudança.
        </div>
      )}
    </main>
  )
}

// o Fast Refresh reexecuta este módulo: sem a checagem, o registro lançaria por id repetido
if (!temPagina(PAGINA_INICIAL)) registrarPagina({ id: PAGINA_INICIAL, titulo: 'Quadro', icone: LayoutGrid, nativa: true, manterMontada: true, atalhos: atalhosDoQuadro, Componente: PaginaQuadro })
if (!temPagina('leitor')) registrarPagina({ id: 'leitor', titulo: 'Leitor de Markdown', icone: BookOpen, nativa: true, atalhos: atalhosDoLeitor, Componente: PaginaLeitor })

/**
 * As páginas montadas: a ativa e as que pedem `manterMontada` (o quadro, para os terminais não caírem ao trocar).
 * As escondidas ficam no mesmo tamanho (só invisíveis e `inert`), para o terminal não ser redimensionado.
 */
export function Casca() {
  const ativa = usarLoja((e) => e.paginaAtiva)
  const ids = paginasMontadas(ativa)
  const emTela = ids.includes(ativa) ? ativa : PAGINA_INICIAL
  return (
    <div className="paginas">
      {ids.map((id) => {
        const Pagina = acharPagina(id)!.Componente
        return (
          <div key={id} className={`pagina ${id === emTela ? 'pagina-ativa' : 'pagina-escondida'}`} data-pagina={id} inert={id !== emTela}>
            <Pagina />
          </div>
        )
      })}
    </div>
  )
}

/** Menus e diálogos, na ordem da lista. */
export function Dialogos() {
  return (
    <>
      {DIALOGOS.map(({ id, Componente }) => (
        <Componente key={id} />
      ))}
    </>
  )
}
