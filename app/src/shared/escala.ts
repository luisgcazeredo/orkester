/**
 * Clique dentro de um elemento com escala CSS.
 *
 * O xterm descobre a linha e a coluna do clique dividindo a distância até o canto do elemento pelo tamanho
 * de uma célula. A distância ele tira do `getBoundingClientRect`, que **já vem reduzida** pela escala CSS;
 * o tamanho da célula ele mede num `OffscreenCanvas`, que **não** tem escala nenhuma. Onde houver escala, as
 * duas contas falam unidades diferentes e a seleção cai longe do mouse — e o erro cresce com a distância até
 * o topo, porque é um fator, não uma folga.
 *
 * No nosso cartão há duas escalas multiplicadas: o terminal é desenhado no dobro do tamanho dentro de uma
 * caixa com `scale(1/2)` (para o texto não borrar no zoom) e o quadro inteiro tem `scale(zoom)`.
 *
 * A correção é devolver o clique em unidades de layout — as mesmas da célula — afastando-o do canto do
 * elemento na proporção da escala. Em vez de confiar nesses dois fatores, que mudam quando o CSS muda, a
 * escala é medida: o quanto o elemento aparece na tela dividido pelo quanto ele ocupa no layout.
 */

export interface CaixaNaTela {
  esquerda: number
  topo: number
  largura: number
}

export interface Ponto {
  x: number
  y: number
}

/** 1 quando não há escala (ou quando não há como medir): aí não se mexe em nada. */
export function escalaDoElemento(caixa: CaixaNaTela, larguraDeLayout: number): number {
  if (!(caixa.largura > 0) || !(larguraDeLayout > 0)) return 1
  return caixa.largura / larguraDeLayout
}

/**
 * O mesmo clique, em unidades de layout. Com escala 1 devolve o ponto como está — não por economia, mas
 * para que o caminho normal não passe por divisão nenhuma.
 */
export function cliqueSemEscala(ponto: Ponto, caixa: CaixaNaTela, escala: number): Ponto {
  if (!(escala > 0) || Math.abs(escala - 1) < 0.001) return ponto
  return {
    x: caixa.esquerda + (ponto.x - caixa.esquerda) / escala,
    y: caixa.topo + (ponto.y - caixa.topo) / escala
  }
}
