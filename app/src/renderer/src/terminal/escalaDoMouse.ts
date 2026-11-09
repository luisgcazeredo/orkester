import type { Terminal } from '@xterm/xterm'
import { cliqueSemEscala, escalaDoElemento, type Ponto } from '../../../shared/escala'

/**
 * Faz o xterm acertar a linha e a coluna do clique dentro de um elemento com escala CSS — o nosso caso, que
 * tem duas escalas multiplicadas (o terminal desenhado em dobro e o zoom do quadro). O porquê da conta está
 * em `shared/escala.ts`.
 *
 * Só há um lugar onde o xterm converte clique em célula, o `MouseService`, e ele não é API pública: é um
 * serviço interno do terminal. Então o que se faz aqui é embrulhar os dois métodos dele, corrigindo o ponto
 * antes de a conta acontecer. Se a versão do xterm mudar e esses nomes saírem, nada explode — a função
 * devolve `false` e a seleção volta a ser a de antes. Quem garante que continua funcionando é o autoteste,
 * que seleciona texto com o mouse de verdade e confere o que foi selecionado.
 */

interface ServicoDeMouse {
  getCoords?: (evento: Ponto4, elemento: HTMLElement, ...resto: unknown[]) => unknown
  getMouseReportCoords?: (evento: Ponto4, elemento: HTMLElement, ...resto: unknown[]) => unknown
}

type Ponto4 = { clientX: number; clientY: number }

const METODOS = ['getCoords', 'getMouseReportCoords'] as const

function corrigir(evento: Ponto4, elemento: HTMLElement): Ponto4 {
  const caixa = elemento.getBoundingClientRect()
  const escala = escalaDoElemento({ esquerda: caixa.left, topo: caixa.top, largura: caixa.width }, elemento.offsetWidth)
  const ponto: Ponto = { x: evento.clientX, y: evento.clientY }
  const certo = cliqueSemEscala(ponto, { esquerda: caixa.left, topo: caixa.top, largura: caixa.width }, escala)
  if (certo === ponto) return evento
  // um objeto só com o que o xterm lê do evento: nada de clonar MouseEvent, que não é copiável
  return { clientX: certo.x, clientY: certo.y }
}

export function corrigirEscalaDoMouse(terminal: Terminal): boolean {
  const servico = (terminal as unknown as { _core?: { _mouseService?: ServicoDeMouse } })._core?._mouseService
  if (!servico) return false
  let embrulhados = 0
  for (const nome of METODOS) {
    const original = servico[nome]
    if (typeof original !== 'function') continue
    servico[nome] = function (this: unknown, evento: Ponto4, elemento: HTMLElement, ...resto: unknown[]) {
      return (original as (...a: unknown[]) => unknown).call(this, corrigir(evento, elemento), elemento, ...resto)
    }
    embrulhados++
  }
  return embrulhados === METODOS.length
}
