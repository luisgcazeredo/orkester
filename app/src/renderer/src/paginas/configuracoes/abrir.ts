// "Abra as Configurações nesta seção" (1.9.6, A2): a engrenagem, a paleta, o painel do "+" e a moldura das páginas
// extras chamam daqui. Módulo pequeno e sem React: quem pede não puxa a página (ela carrega sob demanda).
import { irParaPagina } from '../../casca/paginas'
import { pedirAbaDeConexoes, type AbaDeConexoes } from '../conexoes/aba'

export const PAGINA_CONFIGURACOES = 'configuracoes'

export type SecaoDeConfiguracoes = 'geral' | 'aparencia' | 'conexoes' | 'atalhos'

export const SECOES_DE_CONFIGURACOES: readonly SecaoDeConfiguracoes[] = ['geral', 'aparencia', 'conexoes', 'atalhos']

// A última seção aberta: a engrenagem volta nela (vale enquanto o app está aberto, como a última aba de Conexões).
let ultima: SecaoDeConfiguracoes = 'geral'
const ouvintes = new Set<() => void>()

export function ultimaSecao(): SecaoDeConfiguracoes {
  return ultima
}

/** Guarda a seção em tela e avisa a página (se montada). */
export function escolherSecao(secao: SecaoDeConfiguracoes): void {
  if (ultima === secao) return
  ultima = secao
  ouvintes.forEach((o) => o())
}

export function aoMudarSecao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}

/**
 * Abre a página Configurações. Sem `secao`, na última aberta; com `secao`, nela; com `aba` (só Conexões), já na aba
 * (Chaves, MCP, Páginas, Portais).
 */
export function abrirConfiguracoes(secao?: SecaoDeConfiguracoes, aba?: AbaDeConexoes): void {
  if (aba) pedirAbaDeConexoes(aba)
  if (secao) escolherSecao(secao)
  irParaPagina(PAGINA_CONFIGURACOES)
}
