import { useEffect, useSyncExternalStore } from 'react'
import { aoMudarRegistro, irParaPagina, paginasRegistradas, versaoDoRegistroDePaginas, type Pagina } from './paginas'
import { Plus, Settings } from 'lucide-react'
import { usarLoja } from '../estado/loja'
import { DialogoAceite } from '../paginas/extra/DialogoAceite'
import { usarPaginas } from '../paginas/extra/estado'
import { abrirPainelDePaginas, PainelDePaginas } from '../paginas/extra/PainelMais'
import { iniciarPaginasExtras } from '../paginas/extra/PaginaExtra'
import { abrirConfiguracoes, PAGINA_CONFIGURACOES } from '../paginas/configuracoes/abrir'

function IconeNaBarra({ pagina: { icone: Icone, imagem, inicial } }: { pagina: Pagina }) {
  if (imagem) return <img className="extra-icone-img" src={imagem} width={18} height={18} alt="" draggable={false} />
  if (inicial)
    return (
      <span className="extra-icone-inicial" style={{ width: 18, height: 18, fontSize: 11 }} aria-hidden>
        {inicial}
      </span>
    )
  return <Icone size={18} strokeWidth={1.8} />
}

/**
 * Trilho fino de ícones, um por página registrada, na ponta esquerda da janela, ANTES da lista de espaços (não a substitui). É GERAL: não depende de haver espaço aberto nem da lista estar recolhida. No pé fica a engrenagem, separada dos ícones das páginas, que abre a página Configurações (1.9.6: na última seção aberta; Temas e Conexões moram lá dentro e não têm ícone próprio). O ícone da página
 * em tela fica marcado (`aria-current`). O clique só chama `irParaPagina`, o único escritor da página ativa.
 * Páginas extras (`nativa: false`, do registro do main) vêm depois das nativas, separadas por um traço. O "+" fica SEMPRE
 * (1.9.5, S6) e abre o painel das páginas (guia, exemplo, pasta, pedir a um agente); com a chave geral desligada o painel
 * abre no modo "Páginas estão desligadas", com o botão de ligar.
 */
export function BarraPaginas() {
  const ativa = usarLoja((e) => e.paginaAtiva)
  useSyncExternalStore(aoMudarRegistro, versaoDoRegistroDePaginas) // redesenha quando uma página é registrada
  const ligadas = usarPaginas().lista?.ligadas === true
  const temApi = !!window.ork.paginas
  useEffect(iniciarPaginasExtras, [])
  const todas = paginasRegistradas()
  const nativas = todas.filter((p) => p.nativa && p.naBarra !== false)
  const extras = todas.filter((p) => !p.nativa)
  const botao = (p: Pagina) => (
    <button
      key={p.id}
      type="button"
      className={`barra-pagina ${p.id === ativa ? 'ativo' : ''} ${p.nativa ? '' : 'barra-pagina-extra'}`}
      title={p.nativa ? p.titulo : `${p.titulo} (página extra)`}
      aria-label={p.nativa ? p.titulo : `${p.titulo} (página extra)`}
      aria-current={p.id === ativa ? 'page' : undefined}
      data-pagina-id={p.id}
      onClick={() => {
        // o ícone da página que já está em tela não troca de página: deixa ela decidir (Fluxos volta da edição à lista)
        if (p.id === ativa) p.aoReclicar?.()
        else irParaPagina(p.id)
      }}
    >
      <IconeNaBarra pagina={p} />
    </button>
  )
  return (
    <nav className="barra-paginas" aria-label="Páginas">
      {nativas.map(botao)}
      {(extras.length > 0 || temApi) && <span className="barra-separador" role="separator" />}
      {extras.map(botao)}
      {temApi && (
        <button
          type="button"
          className={`barra-pagina barra-mais ${ligadas ? '' : 'desligado'}`}
          title={ligadas ? 'Páginas próprias: adicionar uma página e ver como funciona' : 'Páginas próprias (desligadas): ver o que são e ligar'}
          aria-label={ligadas ? 'Páginas próprias: adicionar uma página' : 'Páginas próprias, desligadas: ver o que são e ligar'}
          data-adicionar-pagina
          data-paginas-ligadas={ligadas || undefined}
          onClick={abrirPainelDePaginas}
        >
          <Plus size={18} strokeWidth={1.8} />
        </button>
      )}
      <button
        type="button"
        className={`barra-pagina barra-engrenagem ${ativa === PAGINA_CONFIGURACOES ? 'ativo' : ''}`}
        title="Configurações: geral, aparência, conexões e atalhos"
        aria-label="Configurações"
        aria-current={ativa === PAGINA_CONFIGURACOES ? 'page' : undefined}
        data-configuracoes
        onClick={() => abrirConfiguracoes()}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      <DialogoAceite />
      <PainelDePaginas />
    </nav>
  )
}
