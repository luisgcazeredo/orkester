import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { NODE_MINIMO, nodeServe } from './node-do-sistema.ts'

test('aceita a versão do sistema a partir do mínimo, com ou sem o v', () => {
  assert.equal(nodeServe(`v${NODE_MINIMO}.0.0`), true)
  assert.equal(nodeServe('24.22.1'), true)
  assert.equal(nodeServe('v99.0.0'), true)
})

test('recusa Node velho demais para o que o bundler gera', () => {
  assert.equal(nodeServe('v18.20.0'), false)
  assert.equal(nodeServe('v16.0.0'), false)
})

test('sem Node, ou com resposta que não é versão, recusa em vez de chutar', () => {
  for (const nada of [null, undefined, '', '   ', 'node não encontrado', 'v', 'vinte']) {
    assert.equal(nodeServe(nada), false, String(nada))
  }
})
