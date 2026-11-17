import { useSyncExternalStore } from 'react'
import { aoMudarRegistro, irParaPagina, paginasRegistradas, versaoDoRegistroDePaginas } from './paginas'
import { usarLoja } from '../estado/loja'

/**
 * Trilho fino de ícones, um por página registrada, ao lado da lista de espaços (não a substitui). O ícone da página
 * em tela fica marcado (`aria-current`). O clique só chama `irParaPagina`, o único escritor da página ativa.
 */
export function BarraPaginas() {
  const ativa = usarLoja((e) => e.paginaAtiva)
  useSyncExternalStore(aoMudarRegistro, versaoDoRegistroDePaginas) // redesenha quando uma página é registrada
  return (
    <nav className="barra-paginas" aria-label="Páginas">
      {paginasRegistradas().map(({ id, titulo, icone: Icone }) => (
        <button
          key={id}
          type="button"
          className={`barra-pagina ${id === ativa ? 'ativo' : ''}`}
          title={titulo}
          aria-label={titulo}
          aria-current={id === ativa ? 'page' : undefined}
          data-pagina-id={id}
          onClick={() => irParaPagina(id)}
        >
          <Icone size={18} strokeWidth={1.8} />
        </button>
      ))}
    </nav>
  )
}
