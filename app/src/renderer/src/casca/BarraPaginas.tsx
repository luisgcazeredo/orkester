import { useSyncExternalStore } from 'react'
import { aoMudarRegistro, irParaPagina, paginasRegistradas, versaoDoRegistroDePaginas } from './paginas'
import { Settings } from 'lucide-react'
import { usarLoja } from '../estado/loja'
import { abrirConfiguracoes } from '../ui/Configuracoes'

/**
 * Trilho fino de ícones, um por página registrada, na ponta esquerda da janela, ANTES da lista de espaços (não a substitui). É GERAL: não depende de haver espaço aberto nem da lista estar recolhida. No pé fica a engrenagem das Configurações, separada dos ícones das páginas. O ícone da página
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
      <button type="button" className="barra-pagina barra-engrenagem" title="Configurações (chaves MCP)" aria-label="Configurações" data-configuracoes onClick={abrirConfiguracoes}>
        <Settings size={18} strokeWidth={1.8} />
      </button>
    </nav>
  )
}
