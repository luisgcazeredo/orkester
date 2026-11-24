// Abas da página Conexões e o pedido "abra Conexões nesta aba" vindo de fora (o painel do "+" manda para Páginas).
// Módulo pequeno e sem React: quem pede não puxa a página Conexões.

export type AbaDeConexoes = 'chaves' | 'mcp' | 'paginas' | 'credenciais' | 'portais'

let pedida: AbaDeConexoes | null = null
const ouvintes = new Set<() => void>()

export function pedirAbaDeConexoes(aba: AbaDeConexoes): void {
  pedida = aba
  ouvintes.forEach((o) => o())
}

/** Entrega a aba pedida e a esquece (cada pedido vale uma vez). */
export function pegarAbaDeConexoes(): AbaDeConexoes | null {
  const a = pedida
  pedida = null
  return a
}

export function aoPedirAbaDeConexoes(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}
