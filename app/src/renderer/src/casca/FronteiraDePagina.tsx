import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Rede de segurança de cada página da casca: se uma página lança erro ao desenhar, só ela cai (mostra o erro e um botão para
 * tentar de novo); o resto da janela, o quadro e os terminais continuam de pé. Sem isto o React desmonta a raiz inteira
 * e a janela fica em branco.
 */
interface Props {
  nome: string
  children: ReactNode
}

export class FronteiraDePagina extends Component<Props, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error): { erro: Error } {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error(`página "${this.props.nome}" falhou ao desenhar`, erro, info.componentStack)
  }

  render(): ReactNode {
    const { erro } = this.state
    if (!erro) return this.props.children
    return (
      <div className="pagina-erro" role="alert" data-pagina-erro>
        <p>
          <b>{this.props.nome}</b> não conseguiu abrir: {erro.message || String(erro)}
        </p>
        <button type="button" onClick={() => this.setState({ erro: null })}>
          Tentar de novo
        </button>
      </div>
    )
  }
}
