import { useEffect } from 'react'
import * as loja from './estado/loja'
import { iniciar, salvarParaFechar, usarLoja } from './estado/loja'
import { classeDoDestaque, classeDoTema } from '../../shared/temas'
import { Casca, Dialogos } from './casca/Casca'
import { BarraPaginas } from './casca/BarraPaginas'
import { despacharAtalho, haSaidaPendente, nomeDaSaidaPendente, irParaPagina, paginaAtiva, paginasRegistradas, registrarPagina, trocarPaginasExtras } from './casca/paginas'
import { ehAtalhoDaPaleta } from './casca/atalhoDaPaleta'
import { BarraExplorador } from './ui/BarraExplorador'
import { menuAberto } from './ui/MenuContexto'
import { abrirPaleta } from './ui/Paleta'
import { ListaDeEspacos } from './ui/ListaDeEspacos'

/** O `keydown` global: Ctrl+K abre a Paleta em qualquer página (no quadro, quem trata é o atalho dele); o resto é da página ativa. */
function aoTeclar(e: KeyboardEvent): void {
  if (ehAtalhoDaPaleta(e, { pagina: paginaAtiva(), menuAberto: menuAberto(), dialogoAberto: !!document.querySelector('.dialogo-fundo') })) {
    e.preventDefault()
    abrirPaleta()
    return
  }
  despacharAtalho(e)
}

export function App() {
  const temEspaco = usarLoja((e) => e.espaco !== null)
  const tema = usarLoja((e) => e.preferencias.tema)
  const destaque = usarLoja((e) => e.preferencias.destaque)
  const lateralAberta = usarLoja((e) => e.lateralAberta)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const pagina = usarLoja((e) => e.paginaAtiva)
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
    window.addEventListener('keydown', aoTeclar)
    // rascunho não salvo (editor de Fluxos): salva o resto e responde o motivo, para o main perguntar antes de fechar
    window.ork.aoPedirFechar(async () => ((await salvarParaFechar()) ? !haSaidaPendente() || { gravou: false, motivo: 'rascunho-de-fluxo', nome: nomeDaSaidaPendente() } : false))
    if (window.ork.autoteste) window.__teste = { loja, casca: { registrarPagina, irParaPagina, paginaAtiva, paginasRegistradas, trocarPaginasExtras } }
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <div className={`app ${classeDoTema(tema)} ${classeDoDestaque(destaque)} ${lateralAberta && pagina === 'quadro' ? '' : 'sem-lateral'} ferramenta-${ferramenta}`}>
      <BarraPaginas />
      {/* a lista de espaços só existe na página Quadro (decisão do Luís, 17/11); ao voltar, volta como estava */}
      {lateralAberta && pagina === 'quadro' && <ListaDeEspacos />}
      <Casca />
      {temEspaco && <BarraExplorador />}
      <Dialogos />
    </div>
  )
}
