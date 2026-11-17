import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { compararBitmaps, dentroDoLimite, LIMITE_PERCENTUAL, relatarComparacao } from './comparar.ts'

function cinza(largura: number, altura: number, valor = 100) {
  return { largura, altura, dados: new Uint8Array(largura * altura * 4).fill(valor) }
}

test('imagens iguais dão 0%', () => {
  const c = compararBitmaps(cinza(10, 10), cinza(10, 10))
  assert.equal(c.diferentes, 0)
  assert.equal(c.percentual, 0)
  assert.equal(c.total, 100)
  assert.equal(dentroDoLimite(c), true)
})

test('1 px mudado acima da tolerância é acusado', () => {
  const a = cinza(10, 10)
  const b = cinza(10, 10)
  b.dados[4 * 37 + 1] = 100 + 9 // tolerância padrão é 8
  const c = compararBitmaps(a, b)
  assert.equal(c.diferentes, 1)
  assert.equal(c.percentual, 1)
  // o pixel mudado fica vermelho (BGRA) na imagem da diferença
  assert.deepEqual([...c.diferenca.slice(4 * 37, 4 * 37 + 4)], [0, 0, 255, 255])
  assert.equal(dentroDoLimite(c), false)
})

test('mudança dentro da tolerância não conta', () => {
  const a = cinza(10, 10)
  const b = cinza(10, 10)
  b.dados[0] = 108
  assert.equal(compararBitmaps(a, b).diferentes, 0)
  assert.equal(compararBitmaps(a, b, 7).diferentes, 1)
})

test('o limite de 0,5% separa o aceitável do reprovado', () => {
  const a = cinza(100, 100) // 10 000 px: 50 px = 0,5%
  const b = cinza(100, 100)
  for (let p = 0; p < 50; p++) b.dados[p * 4] = 255
  const c = compararBitmaps(a, b)
  assert.equal(c.percentual, 0.5)
  assert.equal(dentroDoLimite(c), true)
  b.dados[50 * 4] = 255
  assert.equal(dentroDoLimite(compararBitmaps(a, b)), false)
  assert.equal(LIMITE_PERCENTUAL, 0.5)
})

test('tamanhos diferentes são recusados', () => {
  assert.throws(() => compararBitmaps(cinza(10, 10), cinza(10, 11)), /tamanhos diferentes/)
  assert.throws(() => compararBitmaps(cinza(10, 10), cinza(11, 10)), /tamanhos diferentes/)
})

test('bitmap com bytes a menos é recusado', () => {
  const ruim = { largura: 10, altura: 10, dados: new Uint8Array(10) }
  assert.throws(() => compararBitmaps(ruim, cinza(10, 10)), /bytes/)
})

test('relatório: a % aparece e a diferença é gravada mesmo abaixo do limite', () => {
  const a = cinza(100, 100)
  const b = cinza(100, 100)
  assert.deepEqual(relatarComparacao(compararBitmaps(a, b)), { ok: true, detalhe: '0.000% (0 px) — limite 0.5%', gravarDiferenca: false })
  b.dados[0] = 255
  const abaixo = relatarComparacao(compararBitmaps(a, b))
  assert.equal(abaixo.ok, true)
  assert.equal(abaixo.gravarDiferenca, true)
  assert.match(abaixo.detalhe, /^0\.010% \(1 px\)/)
  for (let p = 0; p < 60; p++) b.dados[p * 4] = 255
  const acima = relatarComparacao(compararBitmaps(a, b))
  assert.equal(acima.ok, false)
  assert.equal(acima.gravarDiferenca, true)
})
