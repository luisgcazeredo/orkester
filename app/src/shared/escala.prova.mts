import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { cliqueSemEscala, escalaDoElemento } from './escala.ts'
import type { CaixaNaTela } from './escala'

// O cartão de terminal de verdade: 660 px de largura no quadro, o xterm desenhado em 1320 de layout.
const CAIXA: CaixaNaTela = { esquerda: 300, topo: 200, largura: 660 }
const LAYOUT = 1320

test('a escala sai da razão entre o que aparece e o que o layout ocupa', () => {
  assert.equal(escalaDoElemento(CAIXA, LAYOUT), 0.5)
  assert.equal(escalaDoElemento({ esquerda: 0, topo: 0, largura: 462 }, LAYOUT), 0.35)
})

test('sem como medir, a escala é 1 (não se mexe no clique)', () => {
  assert.equal(escalaDoElemento({ esquerda: 0, topo: 0, largura: 0 }, LAYOUT), 1)
  assert.equal(escalaDoElemento(CAIXA, 0), 1)
  assert.equal(escalaDoElemento(CAIXA, -10), 1)
})

test('escala 1 devolve o clique intacto', () => {
  const ponto = { x: 420, y: 530 }
  assert.equal(cliqueSemEscala(ponto, CAIXA, 1), ponto)
})

test('o canto do elemento não se move: lá o erro é zero', () => {
  assert.deepEqual(cliqueSemEscala({ x: 300, y: 200 }, CAIXA, 0.5), { x: 300, y: 200 })
})

test('o erro cresce com a distância até o canto, que é o que se vê na tela', () => {
  // 100 px abaixo do topo do cartão, com o terminal desenhado em dobro: para o xterm são 200 px de layout
  assert.deepEqual(cliqueSemEscala({ x: 300, y: 300 }, CAIXA, 0.5), { x: 300, y: 400 })
  // o dobro da distância, o dobro da correção
  assert.deepEqual(cliqueSemEscala({ x: 300, y: 400 }, CAIXA, 0.5), { x: 300, y: 600 })
})

test('zoom do quadro junto com o dobro do desenho: as duas escalas se multiplicam', () => {
  // quadro em 75%, terminal em dobro → escala total 0.375; 150 px na tela são 400 px de layout
  const escala = 0.75 / 2
  assert.deepEqual(cliqueSemEscala({ x: 300, y: 350 }, CAIXA, escala), { x: 300, y: 600 })
})

test('quadro acima de 100% também é corrigido, para o outro lado', () => {
  // zoom 200% com desenho em dobro dá escala 1: aí o clique passa intacto
  assert.deepEqual(cliqueSemEscala({ x: 500, y: 400 }, CAIXA, 1), { x: 500, y: 400 })
  // zoom 300% → escala 1,5: o clique na tela anda mais que o layout
  assert.deepEqual(cliqueSemEscala({ x: 300, y: 500 }, CAIXA, 1.5), { x: 300, y: 400 })
})

test('clique acima ou à esquerda do elemento continua negativo (o xterm trava na borda)', () => {
  const corrigido = cliqueSemEscala({ x: 290, y: 190 }, CAIXA, 0.5)
  assert.ok(corrigido.x < CAIXA.esquerda)
  assert.ok(corrigido.y < CAIXA.topo)
})

test('escala inválida não estraga o clique', () => {
  const ponto = { x: 420, y: 530 }
  assert.equal(cliqueSemEscala(ponto, CAIXA, 0), ponto)
  assert.equal(cliqueSemEscala(ponto, CAIXA, -0.5), ponto)
  assert.equal(cliqueSemEscala(ponto, CAIXA, Number.NaN), ponto)
})
