import { useEffect } from 'react'
import * as loja from './estado/loja'
import {
  abrirNovaJanela,
  agrupar,
  apagarSelecao,
  definirEstiloDesenho,
  desagrupar,
  desfazer,
  duplicarSelecao,
  editar,
  empurrarSelecao,
  escolherFerramenta,
  alternarExplorador,
  iniciar,
  refazer,
  salvarParaFechar,
  selecionar,
  selecionarTudo,
  usarLoja
} from './estado/loja'
import { Casca, Dialogos } from './casca/Casca'
import { irParaPagina, paginaAtiva, registrarPagina } from './casca/paginas'
import { cancelarGestos, emGesto } from './quadro/arrasto'
import { criarAtalhos } from './quadro/atalhos'
import { colar, copiarSelecao } from './ui/area'
import { abrirAtalhos } from './ui/Atalhos'
import { BarraExplorador } from './ui/BarraExplorador'
import { enquadrarTudo, zoomPeloCentro } from './ui/Controles'
import { ListaDeEspacos } from './ui/ListaDeEspacos'
import { abrirPaleta } from './ui/Paleta'
import { menuAberto } from './ui/MenuContexto'

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

export function App() {
  const temEspaco = usarLoja((e) => e.espaco !== null)
  const tema = usarLoja((e) => e.preferencias.tema)
  const lateralAberta = usarLoja((e) => e.lateralAberta)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const nomeDoEspaco = usarLoja((e) => e.espaco?.nome)

  // Com várias janelas, a barra de tarefas e o Alt+Tab mostram qual espaço está em cada uma — e a versão
  // vai junto, porque depois de instalar uma atualização a primeira pergunta é "pegou?" (pedido do Luís,
  // 10/11/2026). O número vem do package.json pelo bundler, não escrito à mão.
  useEffect(() => {
    const app = `Orkester ${__VERSAO__}`
    document.title = nomeDoEspaco ? `${nomeDoEspaco} — ${app}` : app
  }, [nomeDoEspaco])

  useEffect(() => {
    void iniciar()
    window.addEventListener('keydown', atalhosDoQuadro)
    window.ork.aoPedirFechar(salvarParaFechar)
    if (window.ork.autoteste) window.__teste = { loja, casca: { registrarPagina, irParaPagina, paginaAtiva } }
    return () => window.removeEventListener('keydown', atalhosDoQuadro)
  }, [])

  return (
    <div className={`app tema-${tema} ${lateralAberta ? '' : 'sem-lateral'} ferramenta-${ferramenta}`}>
      {lateralAberta && <ListaDeEspacos />}
      <Casca />
      {temEspaco && <BarraExplorador />}
      <Dialogos />
    </div>
  )
}
