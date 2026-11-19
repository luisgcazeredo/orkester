import type { ReactNode } from 'react'
import { RotateCw, Settings2 } from 'lucide-react'
import { irParaPagina } from '../../casca/paginas'
import { usarLoja } from '../../estado/loja'
import type { PaginaInstalada } from './contrato'
import { IconeDaPagina } from './Icone'
import { LigarAgente } from './LigarAgente'
import '../../estilos/extra.css'

// A moldura do app em volta de uma página extra: cabeçalho com ícone, nome e versão desenhados pela JANELA (fora do
// webview, a página não consegue imitá-los), as ligações dela neste espaço, "Ligar a agente…" e recarregar.

export function Moldura({ pagina, aoRecarregar, children }: { pagina: PaginaInstalada; aoRecarregar?: () => void; children: ReactNode }) {
  const espacoId = usarLoja((e) => e.espaco?.id)
  const aqui = pagina.cordas.filter((c) => c.espacoId === espacoId)
  return (
    <div className="extra-moldura" data-pagina-extra={pagina.id}>
      <header className="extra-cabecalho">
        <IconeDaPagina icone={pagina.icone} nome={pagina.nome} />
        <span className="extra-nome">{pagina.nome}</span>
        <span className="suave extra-versao">versão {pagina.versao} · página extra</span>
        <span className="extra-cordas suave" data-cordas-da-pagina>
          {aqui.length ? `ligada a ${aqui.map((c) => c.cartaoNome).join(', ')}` : 'não ligada a nenhum agente deste espaço'}
        </span>
        <span className="extra-espaco-flex" />
        <LigarAgente pagina={pagina} />
        {aoRecarregar && (
          <button type="button" className="extra-botao extra-icone" title="Recarregar a página" aria-label="Recarregar a página" onClick={aoRecarregar}>
            <RotateCw size={13} />
          </button>
        )}
        <button type="button" className="extra-botao extra-icone" title="Permissões e ligações (Conexões)" aria-label="Permissões e ligações desta página em Conexões" onClick={() => irParaPagina('conexoes')}>
          <Settings2 size={13} />
        </button>
      </header>
      <div className="extra-corpo">{children}</div>
    </div>
  )
}

/** Faixa no lugar do webview quando a página não carrega (pede permissão nova, mudou, caiu, desligada). */
export function AvisoDaMoldura({ texto, botao, aoClicar, perigo }: { texto: string; botao: string; aoClicar: () => void; perigo?: boolean }) {
  return (
    <div className={`extra-aviso ${perigo ? 'perigo' : ''}`} role="status" data-aviso-da-pagina>
      <p>{texto}</p>
      <button type="button" className="extra-botao primario" onClick={aoClicar}>
        {botao}
      </button>
    </div>
  )
}
