import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { renderizarMarkdown } from './markdown.ts'

test('HTML cru do arquivo sai como texto: <script> e onerror= não viram marcação', () => {
  const html = renderizarMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\ntexto <b>x</b>')
  assert.ok(!/<script/i.test(html))
  assert.ok(!/<img/i.test(html))
  assert.ok(!/<b>/i.test(html))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('link javascript:, file:, data: e protocolo relativo ficam sem href', () => {
  for (const alvo of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'file:///C:/segredo.txt', 'data:text/html,x', '//evil.com/x', 'vbscript:x']) {
    const html = renderizarMarkdown(`[x](${alvo})`)
    assert.ok(!html.includes('href'), alvo)
    assert.ok(!html.includes('data-externo'), alvo)
    assert.ok(!html.includes('data-md'), alvo)
    // esquema perigoso: a lib nem vira link (texto literal); `//host`: vira link morto, sem destino
  }
})

test('link relativo .md vira data-md com o caminho, sem href', () => {
  const html = renderizarMarkdown('[b](b.md) e [c](docs/c.md#parte) e [d](pasta/d%20e.md?x=1)')
  assert.ok(html.includes('data-md="b.md"'))
  assert.ok(html.includes('data-md="docs/c.md"'))
  assert.ok(html.includes('data-md="pasta/d e.md"'))
  assert.ok(!html.includes('href'))
})

test('data-md recusa absoluto, UNC, letra de disco e esquema DEPOIS de decodificar (incl. duplo encoding)', () => {
  const mortos = [
    '%5C%5Cserver%5Cshare%5Ca.md', // \\server\share\a.md
    '%5c%5cserver%5cshare%5ca.md', // minúsculas
    '/%2Fserver/share/a.md', // //server/...
    '%2F%2Fserver/share/a.md',
    '%43:/Windows/a.md', // C:/
    '%43%3A%5CWindows%5Ca.md',
    '%63%3a/Windows/a.md',
    '/etc/a.md',
    '%2Fetc%2Fa.md',
    'C:/Windows/a.md',
    'pasta%5Ca.md', // barra invertida em qualquer posição
    '%255C%255Cserver%255Cshare%255Ca.md', // duplo encoding
    '%252F%252Fserver/a.md',
    '%2543:/Windows/a.md',
    '%25255C%25255Cserver%25255Ca.md', // triplo
    '%66ile:///C:/a.md', // file: escondido
    '%E0%A4%A.md', // decode quebrado
    'a%00.md', // NUL
    'a%0A.md', // controle
  ]
  for (const alvo of mortos) {
    const html = renderizarMarkdown(`[x](${alvo})`)
    assert.ok(!html.includes('data-md'), alvo)
    assert.ok(!html.includes('href'), alvo)
  }
})

test('data-md aceita relativos legítimos, inclusive ../ e nomes com %', () => {
  const casos: Array<[string, string]> = [
    ['a.md', 'a.md'],
    ['./a.md', './a.md'],
    ['../a.md', '../a.md'],
    ['../../x/B.MD', '../../x/B.MD'],
    ['..%2Fa.md', '../a.md'],
    ['pasta/sub/c.markdown', 'pasta/sub/c.markdown'],
    ['d%20e.md', 'd e.md'],
    ['a.md#parte', 'a.md'],
    ['a.md?x=1', 'a.md'],
    ['100%25.md', '100%.md'],
  ]
  for (const [entrada, esperado] of casos) {
    const html = renderizarMarkdown(`[x](${entrada})`)
    assert.ok(html.includes(`data-md="${esperado}"`), `${entrada} -> ${html}`)
  }
})

test('link relativo que não é .md fica morto', () => {
  const html = renderizarMarkdown('[img](foto.png) [x](../x.txt)')
  assert.ok(!html.includes('data-md'))
  assert.ok(!html.includes('href'))
})

test('http(s) e mailto viram data-externo, sem href', () => {
  const html = renderizarMarkdown('[a](https://exemplo.com/a?b=1&c=2) [b](http://x.org) [m](mailto:a@exemplo.invalid)')
  assert.ok(html.includes('data-externo="https://exemplo.com/a?b=1&amp;c=2"'))
  assert.ok(html.includes('data-externo="http://x.org"'))
  assert.ok(html.includes('data-externo="mailto:a@exemplo.invalid"'))
  assert.ok(!html.includes('href'))
})

test('aspas no endereço não escapam do atributo', () => {
  const html = renderizarMarkdown('[x](https://a.com/"onmouseover="alert(1))')
  assert.ok(!/ onmouseover=/.test(html))
})

test('âncora interna mantém href', () => {
  assert.ok(renderizarMarkdown('[topo](#titulo)').includes('href="#titulo"'))
})

test('imagem vira texto: nada de <img>', () => {
  const html = renderizarMarkdown('![logo](https://exemplo.com/a.png)')
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('<span class="md-imagem">logo</span>'))
})

test('tabela renderiza dentro da caixa de rolagem', () => {
  const html = renderizarMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n')
  assert.ok(html.startsWith('<div class="md-tabela"><table>'))
  assert.ok(html.includes('<th>a</th>'))
  assert.ok(html.includes('<td>2</td>'))
  assert.ok(html.trimEnd().endsWith('</table></div>'))
})

test('bloco de código: sem realcador sai escapado; com realcador usa o corpo dele', () => {
  const md = '```ts\nconst a = 1 < 2\n```\n'
  const cru = renderizarMarkdown(md)
  assert.ok(cru.includes('<code class="hljs language-typescript">const a = 1 &lt; 2\n</code>'))
  let recebido = ''
  const colorido = renderizarMarkdown(md, {
    realcar: (codigo, lingua) => {
      recebido = `${lingua}|${codigo}`
      return '<span class="hljs-keyword">const</span> a'
    }
  })
  assert.equal(recebido, 'typescript|const a = 1 < 2\n')
  assert.ok(colorido.includes('<code class="hljs language-typescript"><span class="hljs-keyword">const</span> a</code>'))
})

test('língua desconhecida ou maliciosa na cerca não vai para a classe nem chama o realcador', () => {
  let chamou = false
  const html = renderizarMarkdown('```"><script>x\ncodigo\n```\n\n```zzz\nb\n```\n', {
    realcar: () => {
      chamou = true
      return null
    }
  })
  assert.equal(chamou, false)
  assert.ok(!html.includes('<script'))
  assert.ok(!html.includes('language-'))
})

test('realcador que lança ou devolve null cai no escape', () => {
  const html = renderizarMarkdown('```js\n<x>\n```\n', {
    realcar: () => {
      throw new Error('falhou')
    }
  })
  assert.ok(html.includes('&lt;x&gt;'))
})

test('título, lista e código em linha seguem o Markdown normal', () => {
  const html = renderizarMarkdown('# Oi\n\n- um\n- dois\n\n`a<b`')
  assert.ok(html.includes('<h1>Oi</h1>'))
  assert.ok(html.includes('<li>um</li>'))
  assert.ok(html.includes('<code>a&lt;b</code>'))
})
