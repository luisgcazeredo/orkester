import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error o Node roda TypeScript direto e exige a extensão
import { buscarPorNome, juntarRaizes, caminhoAbsoluto, mesmaPasta, montarArvore, nomeDaPasta, paisDe, relativoAberto } from './arvore.ts'

test('árvore: pastas antes de arquivos, cada grupo em ordem', () => {
  const t = montarArvore(['z.md', 'b/y.md', 'b/a/x.md', 'a.md', 'c/d.md'])
  assert.deepEqual(t.map((n: { nome: string }) => n.nome), ['b', 'c', 'a.md', 'z.md'])
  const b = t[0]
  if (b.tipo !== 'pasta') throw new Error('esperava pasta')
  assert.deepEqual(b.filhos.map((n: { nome: string }) => n.nome), ['a', 'y.md'])
  const a = b.filhos[0]
  if (a.tipo !== 'pasta') throw new Error('esperava pasta')
  assert.equal(a.filhos[0].caminho, 'b/a/x.md')
})

test('árvore: lista vazia e caminho vazio não quebram', () => {
  assert.deepEqual(montarArvore([]), [])
  assert.deepEqual(montarArvore(['', '/']), [])
})

test('busca por nome: sem acento e sem caixa, todas as palavras, nome antes da pasta', () => {
  const l = ['docs/Orçamento/leia.md', 'orcamento.md', 'notas/ideias.md']
  assert.deepEqual(buscarPorNome(l, 'ORCAMENTO'), ['orcamento.md', 'docs/Orçamento/leia.md'])
  assert.deepEqual(buscarPorNome(l, 'notas ideias'), ['notas/ideias.md'])
  assert.deepEqual(buscarPorNome(l, 'inexistente'), [])
})

test('busca com termo vazio não devolve nada', () => {
  assert.deepEqual(buscarPorNome(['a.md'], ''), [])
  assert.deepEqual(buscarPorNome(['a.md'], '   '), [])
})

test('pais, nome e comparação de pasta', () => {
  assert.deepEqual(paisDe('a/b/c.md'), ['a', 'a/b'])
  assert.deepEqual(paisDe('c.md'), [])
  assert.equal(nomeDaPasta('C:\\x\\Projeto\\'), 'Projeto')
  assert.equal(nomeDaPasta('/a/b'), 'b')
  assert.ok(mesmaPasta('C:\\Docs\\', 'c:/docs'))
  assert.ok(!mesmaPasta('C:\\Docs', 'C:\\Docs2'))
  assert.equal(caminhoAbsoluto('C:\\x\\', 'a/b.md'), 'C:\\x/a/b.md')
})

test('arquivo aberto: caminho relativo inteiro, a.md e z/a.md não se confundem', () => {
  const l = ['a.md', 'docs/a.md', 'z/a.md']
  assert.equal(relativoAberto('C:\\p', 'C:\\p\\z\\a.md', l), 'z/a.md')
  assert.equal(relativoAberto('C:\\p\\', 'c:/P/a.md', l), 'a.md')
  assert.equal(relativoAberto('C:\\p', 'C:\\p\\docs\\A.MD', l), 'docs/a.md')
  assert.equal(relativoAberto('C:\\p', 'C:\\p\\fora.md', l), null)
})

test('arquivo aberto: raiz com pasta de mesmo nome dentro não engana', () => {
  const l = ['a.md', 'z/a.md']
  assert.equal(relativoAberto('C:\\z', 'C:\\z\\a.md', l), 'a.md')
  assert.equal(relativoAberto('C:\\z', 'C:\\z\\z\\a.md', l), 'z/a.md')
})

test('arquivo aberto: raiz com outro nome (junção) cai no achado mais longo', () => {
  const l = ['a.md', 'z/a.md']
  assert.equal(relativoAberto('D:\\atalho', 'C:\\real\\z\\a.md', l), 'z/a.md')
})

test('juntarRaizes: pastas de todos os espaços, depois as fixadas, sem repetir', () => {
  const r = juntarRaizes(['C:/a', 'C:/b/', 'c:/A'], ['C:/b', 'C:/z'])
  assert.deepEqual(r, [
    { caminho: 'C:/a', fixada: false },
    { caminho: 'C:/b/', fixada: false },
    { caminho: 'C:/z', fixada: true }
  ])
  assert.deepEqual(juntarRaizes([], []), [])
})
