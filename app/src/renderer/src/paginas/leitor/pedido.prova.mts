import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error o Node roda TypeScript direto e exige a extensão
import { aoChegarPedido, haPedidoPendente, pedirAoLeitor, pedirEIr, pegarPedido, raizDoCaminho, vigiaAindaVale } from './pedido.ts'

test('pedirEIr: trocou de página, o pedido fica para o Leitor; não trocou, é descartado', () => {
  assert.equal(pedirEIr({ de: 'a.md' }, (p) => p === 'leitor'), true)
  assert.deepEqual(pegarPedido(), { de: 'a.md' })
  assert.equal(pedirEIr({ de: 'b.md' }, () => false), false)
  assert.equal(pegarPedido(), null)
})

test('pedido: fica guardado até alguém pegar, e só é entregue uma vez', () => {
  assert.equal(pegarPedido(), null)
  pedirAoLeitor({ de: 'C:\\p\\a.md' })
  pedirAoLeitor({ de: 'C:\\p\\b.md', link: '../c.md' })
  assert.deepEqual(pegarPedido(), { de: 'C:\\p\\b.md', link: '../c.md' })
  assert.equal(pegarPedido(), null)
})

test('pedido: Leitor já montado é avisado, e cancelar para o aviso', () => {
  let avisos = 0
  const parar = aoChegarPedido(() => avisos++)
  pedirAoLeitor({ de: 'x.md' })
  parar()
  pedirAoLeitor({ de: 'y.md' })
  assert.equal(avisos, 1)
  pegarPedido()
})

test('raiz do caminho: contém, mais específica vence, barra e caixa não importam', () => {
  const raizes = ['C:\\Projetos', 'c:/projetos/orkester/', 'D:\\Outro']
  assert.equal(raizDoCaminho(raizes, 'C:\\Projetos\\Orkester\\docs\\a.md'), 'c:/projetos/orkester/')
  assert.equal(raizDoCaminho(raizes, 'C:\\PROJETOS\\x\\a.md'), 'C:\\Projetos')
  assert.equal(raizDoCaminho(raizes, 'D:\\Outro\\a.md'), 'D:\\Outro')
})

test('raiz do caminho: fora de todas, prefixo parecido e raiz vazia não casam', () => {
  assert.equal(raizDoCaminho(['C:\\Projetos'], 'C:\\Projetos2\\a.md'), null)
  assert.equal(raizDoCaminho(['C:\\Projetos'], 'E:\\a.md'), null)
  assert.equal(raizDoCaminho(['C:\\Projetos'], 'C:\\Projetos'), null)
  assert.equal(raizDoCaminho([''], 'C:\\a.md'), null)
  assert.equal(raizDoCaminho([], 'C:\\a.md'), null)
})

test('haPedidoPendente: espia sem consumir, e some depois de pegar', () => {
  assert.equal(haPedidoPendente(), false)
  pedirAoLeitor({ de: 'a.md' })
  assert.equal(haPedidoPendente(), true)
  assert.equal(haPedidoPendente(), true)
  pegarPedido()
  assert.equal(haPedidoPendente(), false)
})

test('vigiaAindaVale: só aplica se o arquivo vigiado ainda é o mostrado', () => {
  assert.equal(vigiaAindaVale('C:/x/B.md', 'c:/x/b.md'), true)
  assert.equal(vigiaAindaVale('C:/x/a.md', 'C:/x/b.md'), false)
  assert.equal(vigiaAindaVale(null, 'b.md'), false)
  assert.equal(vigiaAindaVale(undefined, 'b.md'), false)
})
