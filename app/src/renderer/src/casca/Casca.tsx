import { LayoutGrid } from 'lucide-react'
import { escreverPaginaAtiva, lerEstado, usarLoja } from '../estado/loja'
import { Quadro } from '../quadro/Quadro'
import { BarraSelecao } from '../ui/BarraSelecao'
import { BarraFerramentas } from '../ui/BarraFerramentas'
import { BotaoLateral, CantoInferior, CantoSuperior } from '../ui/Controles'
import { VistaAndares } from '../ui/Andares'
import { DIALOGOS } from './dialogos'
import { acharPagina, ligarPaginaAtiva, PAGINA_INICIAL, registrarPagina, temPagina } from './paginas'

// A página ativa mora na loja (campo `paginaAtiva`), para a casca redesenhar quando ela mudar.
ligarPaginaAtiva({
  ler: () => lerEstado().paginaAtiva,
  escrever: escreverPaginaAtiva
})

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
if (!temPagina(PAGINA_INICIAL)) registrarPagina({ id: PAGINA_INICIAL, titulo: 'Quadro', icone: LayoutGrid, nativa: true, Componente: PaginaQuadro })

/** A página ativa. Id sem registro (não deveria ocorrer: `irParaPagina` recusa) cai no quadro. */
export function Casca() {
  const id = usarLoja((e) => e.paginaAtiva)
  const Pagina = (acharPagina(id) ?? acharPagina(PAGINA_INICIAL))!.Componente
  return <Pagina />
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
