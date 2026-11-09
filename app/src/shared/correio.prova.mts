import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ehRecado, idDoRecado, nomeDaPasta, nomeDoRecado, pastasMortas, respostaDe, SUFIXO_PARCIAL } from './correio.ts'

const ID = 'a1b2c3d4e5f60718293a4b5c'

test('o nome do recado é o protocolo: tipo e id', () => {
  assert.equal(nomeDoRecado('pedido', ID), `pedido-${ID}.json`)
  assert.equal(nomeDoRecado('resposta', ID), `resposta-${ID}.json`)
})

test('ida e volta: o id sai do nome', () => {
  assert.equal(idDoRecado(nomeDoRecado('pedido', ID)), ID)
  assert.equal(idDoRecado(nomeDoRecado('resposta', ID)), ID)
})

test('o tipo pedido é cobrado quando se pede o tipo', () => {
  assert.equal(idDoRecado(`pedido-${ID}.json`, 'pedido'), ID)
  assert.equal(idDoRecado(`resposta-${ID}.json`, 'pedido'), null)
  assert.equal(idDoRecado(`pedido-${ID}.json`, 'resposta'), null)
})

test('a resposta de um pedido tem o mesmo id', () => {
  assert.equal(respostaDe(`pedido-${ID}.json`), `resposta-${ID}.json`)
})

test('só pedido tem resposta: resposta de resposta não existe', () => {
  assert.equal(respostaDe(`resposta-${ID}.json`), null)
})

test('lixo na pasta é ignorado, não dá erro', () => {
  for (const nome of [
    'pedido.json',
    'pedido-.json',
    `pedido-${ID}.txt`,
    `pedido-${ID}`,
    'PEDIDO-a1b2c3d4e5f60718293a4b5c.json',
    `pedido-${ID.toUpperCase()}.json`,
    'pedido-naohexadecimal0000000000.json',
    `pedido-${ID}aa.json`,
    `pedido-${ID.slice(0, 20)}.json`,
    '.gitkeep',
    'recado.json'
  ]) {
    assert.equal(idDoRecado(nome), null, nome)
    assert.equal(ehRecado(nome), false, nome)
    assert.equal(respostaDe(nome), null, nome)
  }
})

test('recado sendo escrito não é recado: o nome só vale depois do renomear', () => {
  const parcial = nomeDoRecado('pedido', ID) + SUFIXO_PARCIAL
  assert.equal(ehRecado(parcial), false)
  assert.equal(idDoRecado(parcial), null)
})

test('nome com caminho não passa: recado é nome de arquivo, não caminho', () => {
  assert.equal(idDoRecado(`sub/pedido-${ID}.json`), null)
  assert.equal(idDoRecado(`..\\pedido-${ID}.json`), null)
})

test('pasta do correio leva o pid: é por ele que se sabe de quem ela é', () => {
  assert.equal(nomeDaPasta(1234), 'orkester-correio-1234')
})

test('varre só as pastas de apps mortos; a minha e as dos vivos ficam', () => {
  const vivo = (pid: number): boolean => pid === 500
  const mortas = pastasMortas(
    ['orkester-correio-100', 'orkester-correio-500', 'orkester-correio-900', 'outra-coisa', 'orkester-correio-'],
    vivo,
    900
  )
  assert.deepEqual(mortas, ['orkester-correio-100'])
})

test('pasta da versão antiga, de nome sorteado, é sempre lixo: ninguém mais cria uma', () => {
  const mortas = pastasMortas(['orkester-correio-283b40829d772bfb4ab63bc3'], () => true, 900)
  assert.deepEqual(mortas, ['orkester-correio-283b40829d772bfb4ab63bc3'])
})

test('nome que não é pasta de correio nunca entra na lista de apagar', () => {
  assert.deepEqual(pastasMortas(['tmp-abc', 'orkester-outra-coisa', 'orkester-correio-abc'], () => false, 1), [])
})
