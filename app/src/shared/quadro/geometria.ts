import type { No, Plano } from '../modelo'

export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

export const caixaDoNo = (no: No): Caixa => ({ x: no.x, y: no.y, largura: no.largura, altura: no.altura })

export const tocam = (a: Caixa, b: Caixa, folga: number): boolean =>
  a.x < b.x + b.largura + folga && b.x < a.x + a.largura + folga && a.y < b.y + b.altura + folga && b.y < a.y + a.altura + folga

/**
 * Lugar para um cartão novo perto de quem o abriu: o vão livre **mais próximo** numa grade em volta dele,
 * e não "à direita, e se estiver ocupado, mais para baixo".
 *
 * Por quê (12/11/2026): com a regra antiga, cada agente que o Maestro abria descia um andar à direita dele,
 * e um time de dez virava uma coluna de dez terminais — longe de quem abriu e fora da tela. Agora os filhos
 * ocupam primeiro a volta do pai (direita, embaixo à direita, esquerda, em cima…), e só depois se afastam.
 * A direita continua preferida: o primeiro filho nasce exatamente onde nascia antes.
 */
export function lugarPerto(
  pai: Caixa,
  tamanho: { largura: number; altura: number },
  ocupados: Caixa[],
  vao = { x: 80, y: 60 },
  folga = 30
): { x: number; y: number } {
  const passoX = tamanho.largura + vao.x
  const passoY = tamanho.altura + vao.y
  const centroPai = { x: pai.x + pai.largura / 2, y: pai.y + pai.altura / 2 }
  const candidatos: Array<{ x: number; y: number; custo: number }> = []
  for (let coluna = -4; coluna <= 5; coluna++) {
    if (coluna === 0) continue
    // coluna 1 encosta na direita do pai; coluna -1, na esquerda
    const x = coluna > 0 ? pai.x + pai.largura + vao.x + (coluna - 1) * passoX : pai.x - vao.x - tamanho.largura + (coluna + 1) * passoX
    for (let linha = -3; linha <= 4; linha++) {
      const y = pai.y + linha * passoY
      const dx = x + tamanho.largura / 2 - centroPai.x
      const dy = y + tamanho.altura / 2 - centroPai.y
      // esquerda e para cima custam um pouco mais: o olho lê da esquerda para a direita, de cima para baixo
      const custo = Math.hypot(dx * (coluna < 0 ? 1.3 : 1), dy * (linha < 0 ? 1.2 : 1))
      candidatos.push({ x, y, custo })
    }
  }
  candidatos.sort((a, b) => a.custo - b.custo)
  const livre = candidatos.find((c) => !ocupados.some((o) => tocam({ ...c, ...tamanho }, o, folga)))
  if (livre) return { x: livre.x, y: livre.y }
  // a volta inteira está ocupada: desce pela direita, como era antes
  const caixa = { x: pai.x + pai.largura + vao.x, y: pai.y, ...tamanho }
  for (let tentativa = 0; tentativa < 60 && ocupados.some((o) => tocam(caixa, o, folga)); tentativa++) caixa.y += passoY
  return { x: caixa.x, y: caixa.y }
}

/**
 * Onde pôr um cartão novo que o usuário pediu "no centro da tela" (menu Terminal, paleta). Livre, fica no centro;
 * ocupado (o cartão anterior nasceu ali), vai para o vão livre mais perto dele, ao lado, e não por cima (1.9.6).
 * Devolve o canto de cima à esquerda.
 */
export function lugarNoCentro(
  centro: { x: number; y: number },
  tamanho: { largura: number; altura: number },
  ocupados: Caixa[],
  folga = 30
): { x: number; y: number } {
  const noCentro = { x: centro.x - tamanho.largura / 2, y: centro.y - tamanho.altura / 2 }
  if (!ocupados.some((o) => tocam({ ...noCentro, ...tamanho }, o, folga))) return noCentro
  return lugarPerto({ ...noCentro, ...tamanho }, tamanho, ocupados, undefined, folga)
}

/**
 * Onde nasce um terminal novo. Pedido "no centro da tela" (menu Terminal, paleta): desvia do que já ocupa o centro.
 * Pedido num ponto exato (botão direito → Terminal, autoteste): fica centrado no ponto clicado, como antes da 1.9.6.
 */
export function lugarDoTerminalNovo(
  ponto: { x: number; y: number },
  tamanho: { largura: number; altura: number },
  ocupados: Caixa[],
  noCentro: boolean
): { x: number; y: number } {
  if (!noCentro) return { x: ponto.x - tamanho.largura / 2, y: ponto.y - tamanho.altura / 2 }
  return lugarNoCentro(ponto, tamanho, ocupados)
}

export const proximoZ =(plano: Plano): number => Math.max(0, ...plano.nos.map((no) => no.z), ...plano.desenhos.map((desenho) => desenho.z)) + 1
