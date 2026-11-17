import { useEffect } from 'react'
import * as loja from './estado/loja'
import { iniciar, salvarParaFechar, usarLoja } from './estado/loja'
import { classeDoTema } from '../../shared/temas'
import { Casca, Dialogos } from './casca/Casca'
import { BarraPaginas } from './casca/BarraPaginas'
import { despacharAtalho, irParaPagina, paginaAtiva, registrarPagina } from './casca/paginas'
import { BarraExplorador } from './ui/BarraExplorador'
import { ListaDeEspacos } from './ui/ListaDeEspacos'

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
    window.addEventListener('keydown', despacharAtalho)
    window.ork.aoPedirFechar(salvarParaFechar)
    if (window.ork.autoteste) window.__teste = { loja, casca: { registrarPagina, irParaPagina, paginaAtiva } }
    return () => window.removeEventListener('keydown', despacharAtalho)
  }, [])

  return (
    <div className={`app ${classeDoTema(tema)} ${lateralAberta ? '' : 'sem-lateral'} ferramenta-${ferramenta}`}>
      {lateralAberta && <ListaDeEspacos />}
      <BarraPaginas />
      <Casca />
      {temEspaco && <BarraExplorador />}
      <Dialogos />
    </div>
  )
}
