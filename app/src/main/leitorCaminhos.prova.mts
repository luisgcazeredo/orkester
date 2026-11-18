import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
// @ts-expect-error o Node roda TypeScript direto e exige a extensão
import { alvoDoLink, ehMarkdown, enderecoExterno, estaEmBaixo } from './leitorCaminhos.ts'

const raiz = resolve('/tmp/espaco')
const md = resolve(raiz, 'sub/a.md')

test('link relativo vira o .md ao lado ou acima, dentro da raiz', () => {
  assert.equal(alvoDoLink(raiz, md, 'b.md'), resolve(raiz, 'sub/b.md'))
  assert.equal(alvoDoLink(raiz, md, '../topo.MD'), resolve(raiz, 'topo.MD'))
  assert.equal(alvoDoLink(raiz, md, 'x/y.markdown'), resolve(raiz, 'sub/x/y.markdown'))
})

test('recusa o que sai da raiz, absoluto, UNC, disco, barra invertida, esquema e controle', () => {
  for (const v of ['../../fora.md', '../../../../etc/x.md', '/etc/x.md', '//srv/x.md', 'C:/x.md', 'C:x.md', '..\\x.md', 'sub\\x.md', 'file:x.md', 'a\u0000.md', 'a\n.md', '']) {
    assert.equal(alvoDoLink(raiz, md, v), null, JSON.stringify(v))
  }
})

test('recusa outra extensão e valor que não é texto', () => {
  assert.equal(alvoDoLink(raiz, md, 'a.txt'), null)
  assert.equal(alvoDoLink(raiz, md, 'a.md.exe'), null)
  assert.equal(alvoDoLink(raiz, md, 'a.mdx'), null)
  assert.equal(alvoDoLink(raiz, md, 42), null)
  assert.equal(alvoDoLink(raiz, md, null), null)
  assert.equal(alvoDoLink(raiz, md, 'a'.repeat(2000) + '.md'), null)
})

test('raiz irmã com o mesmo prefixo não conta como dentro', () => {
  assert.equal(estaEmBaixo(raiz, resolve('/tmp/espaco2/x.md')), false)
  assert.equal(estaEmBaixo(raiz, resolve(raiz, 'a/b')), true)
  assert.equal(estaEmBaixo(raiz, raiz), true)
})

test('externo: só http, https e mailto, em qualquer caixa; o resto é recusado', () => {
  assert.equal(enderecoExterno('HTTPS://A.com/x'), 'https://a.com/x')
  assert.equal(enderecoExterno('mailto:a@exemplo.invalid'), 'mailto:a@exemplo.invalid')
  for (const v of ['javascript:alert(1)', 'file:///c:/x', 'data:text/html,x', 'vbscript:x', '//a.com', 'C:\\x', 'ms-msdt:x', '', 3, null]) {
    assert.equal(enderecoExterno(v), null, String(v))
  }
})

test('extensão md em qualquer caixa', () => {
  assert.ok(ehMarkdown('A.MD') && ehMarkdown('a.Markdown'))
  assert.ok(!ehMarkdown('a.md.txt') && !ehMarkdown('md'))
})

test('mailto: fica só subject, body, cc e bcc; attach e o resto caem', () => {
  assert.equal(enderecoExterno('mailto:a@exemplo.invalid?subject=Oi&attach=C:\\x.txt'), 'mailto:a@exemplo.invalid?subject=Oi')
  assert.equal(enderecoExterno('MAILTO:a@exemplo.invalid?Attachment=C:/x&ATTACH=y&body=a%20b&cc=c@exemplo.invalid&bcc=e@exemplo.invalid'), 'mailto:a@exemplo.invalid?body=a%20b&cc=c@exemplo.invalid&bcc=e@exemplo.invalid')
  assert.equal(enderecoExterno('mailto:a@exemplo.invalid?at%74ach=C:/x'), 'mailto:a@exemplo.invalid')
  assert.equal(enderecoExterno('mailto:a@exemplo.invalid?to=x@exemplo.invalid&in-reply-to=1'), 'mailto:a@exemplo.invalid')
  assert.equal(enderecoExterno('mailto:a@exemplo.invalid#x'), 'mailto:a@exemplo.invalid')
  assert.equal(enderecoExterno('https://a.com/x?attach=1'), 'https://a.com/x?attach=1')
})
