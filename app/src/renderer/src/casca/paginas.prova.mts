import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { acharPagina, irParaPagina, ligarPaginaAtiva, limparPaginas, paginaAtiva, paginasRegistradas, registrarPagina, temPagina } from './paginas.ts'
import type { Pagina } from './paginas'

const pagina = (id: string): Pagina => ({ id, titulo: id, icone: (() => null) as never, nativa: true, Componente: () => null as never })

beforeEach(() => {
  limparPaginas()
  ligarPaginaAtiva()
})

test('registrar uma página a põe na lista e a deixa achar', () => {
  registrarPagina(pagina('quadro'))
  assert.deepEqual(paginasRegistradas().map((p) => p.id), ['quadro'])
  assert.equal(acharPagina('quadro')?.titulo, 'quadro')
  assert.equal(acharPagina('outra'), undefined)
})

test('id repetido é recusado e o registro fica como estava', () => {
  const primeira = pagina('quadro')
  registrarPagina(primeira)
  assert.throws(() => registrarPagina({ ...pagina('quadro'), titulo: 'outra' }), /quadro/)
  assert.equal(paginasRegistradas().length, 1)
  assert.equal(acharPagina('quadro'), primeira)
})

test('a página ativa começa no quadro', () => {
  assert.equal(paginaAtiva(), 'quadro')
})

test('irParaPagina com id desconhecido devolve false e não muda nada', () => {
  registrarPagina(pagina('quadro'))
  const escritas: string[] = []
  ligarPaginaAtiva({ ler: () => 'quadro', escrever: (id) => escritas.push(id) })
  assert.equal(irParaPagina('nao-existe'), false)
  assert.equal(paginaAtiva(), 'quadro')
  assert.deepEqual(escritas, [])
  assert.equal(paginasRegistradas().length, 1)
})

test('irParaPagina com id registrado troca a ativa, devolve true e escreve uma vez só', () => {
  registrarPagina(pagina('quadro'))
  registrarPagina(pagina('extra'))
  const escritas: string[] = []
  let atual = 'quadro'
  ligarPaginaAtiva({ ler: () => atual, escrever: (id) => (escritas.push(id), void (atual = id)) })
  assert.equal(irParaPagina('extra'), true)
  assert.equal(paginaAtiva(), 'extra')
  assert.equal(irParaPagina('extra'), true)
  assert.deepEqual(escritas, ['extra'])
  assert.equal(irParaPagina('quadro'), true)
  assert.equal(paginaAtiva(), 'quadro')
})

test('temPagina diz se o id está registrado', () => {
  assert.equal(temPagina('quadro'), false)
  registrarPagina(pagina('quadro'))
  assert.equal(temPagina('quadro'), true)
})
