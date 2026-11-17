import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { acharPagina, aoMudarRegistro, versaoDoRegistroDePaginas, despacharAtalho, irParaPagina, ligarPaginaAtiva, limparPaginas, paginaAtiva, paginasMontadas, paginasRegistradas, registrarPagina, temPagina } from './paginas.ts'
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

test('despacharAtalho chama só o `atalhos` da página ativa', () => {
  const chamadas: string[] = []
  registrarPagina({ ...pagina('quadro'), atalhos: () => void chamadas.push('quadro') })
  registrarPagina({ ...pagina('leitor'), atalhos: () => void chamadas.push('leitor') })
  registrarPagina(pagina('muda'))
  const tecla = { key: 'n' } as KeyboardEvent
  despacharAtalho(tecla)
  assert.deepEqual(chamadas, ['quadro'])
  irParaPagina('leitor')
  despacharAtalho(tecla)
  assert.deepEqual(chamadas, ['quadro', 'leitor'])
  irParaPagina('muda') // sem `atalhos`: não lança e ninguém é chamado
  despacharAtalho(tecla)
  assert.deepEqual(chamadas, ['quadro', 'leitor'])
})

test('despacharAtalho passa o mesmo evento à página', () => {
  let recebido: KeyboardEvent | null = null
  registrarPagina({ ...pagina('quadro'), atalhos: (e) => void (recebido = e) })
  const tecla = { key: 'Escape' } as KeyboardEvent
  despacharAtalho(tecla)
  assert.equal(recebido, tecla)
})

test('página com manterMontada não sai das montadas ao trocar; a outra sai', () => {
  registrarPagina({ ...pagina('quadro'), manterMontada: true })
  registrarPagina(pagina('leitor'))
  registrarPagina(pagina('outra'))
  assert.deepEqual(paginasMontadas('quadro'), ['quadro'])
  assert.deepEqual(paginasMontadas('leitor'), ['quadro', 'leitor'])
  assert.deepEqual(paginasMontadas('outra'), ['quadro', 'outra'])
  assert.deepEqual(paginasMontadas('quadro'), ['quadro'])
  assert.deepEqual(paginasMontadas('leitor'), ['quadro', 'leitor'])
})

test('a ordem das montadas é estável ao voltar a uma que ficou', () => {
  registrarPagina({ ...pagina('quadro'), manterMontada: true })
  registrarPagina({ ...pagina('b'), manterMontada: true })
  paginasMontadas('quadro')
  paginasMontadas('b')
  assert.deepEqual(paginasMontadas('quadro'), ['quadro', 'b'])
})

test('id sem registro cai no quadro, sem montar página fantasma', () => {
  registrarPagina({ ...pagina('quadro'), manterMontada: true })
  assert.deepEqual(paginasMontadas('nao-existe'), ['quadro'])
})

test('registrar uma página avisa quem ouve o registro e sobe a versão; recusa não avisa', () => {
  let avisos = 0
  const parar = aoMudarRegistro(() => void avisos++)
  const antes = versaoDoRegistroDePaginas()
  registrarPagina(pagina('quadro'))
  assert.equal(avisos, 1)
  assert.equal(versaoDoRegistroDePaginas(), antes + 1)
  assert.throws(() => registrarPagina(pagina('quadro')))
  assert.equal(avisos, 1)
  parar()
  registrarPagina(pagina('outra'))
  assert.equal(avisos, 1)
})
