import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { leitorValido, pastaFixavel, pastaFixavelReal, pastaRealFixavel, raizesDeLeitura } from './leitor.ts'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, parse } from 'node:path'
// @ts-expect-error idem.
import { juntarPreferencias } from './preferencias.ts'

const CASA = 'C:\\Users\\fulano'

test('lista válida passa, ausente também', () => {
  assert.equal(leitorValido(undefined, CASA), true)
  assert.equal(leitorValido({ pastas: [] }, CASA), true)
  assert.equal(leitorValido({ pastas: ['D:\\Cerebro', 'C:\\Users\\fulano\\Documentos\\notas', 'D:/notas/x'] }, CASA), true)
  // em Unix (pasta do usuário sem letra de disco) vale caminho com `/`
  assert.equal(pastaFixavel('/home/x/notas', '/home/x'), true)
  assert.equal(pastaFixavel('/home/x', '/home/x'), false)
  assert.equal(pastaFixavel('/', '/home/x'), false)
  assert.equal(pastaFixavel('D:\\x', '/home/x'), false)
})

test('contornos pelo texto são recusados (casos da revisão)', () => {
  const ruins = [
    'C:\\.', 'C:\\.\\', 'C:/.', '\\.', '\\', '\\Users', '/Users', 'C:\\Users\\fulano\\.', 'C:\\Users\\fulano\\.\\',
    'C:\\a\\.\\b', '\\\\localhost\\c$', '\\\\localhost\\c$\\Users', '//localhost/c$', '\\\\srv\\pasta', '\\\\?\\C:\\', '\\\\?\\C:\\x',
    '\\\\.\\C:\\x', '\\\\?\\UNC\\srv\\x', ' D:\\x', 'D:\\x ', 'D:\\x.', 'D:\\x \\y', 'D:\\x:fluxo', 'C:\\Users\\fulano.', 'D:\\a|b', 'C:x'
  ]
  for (const ruim of ruins) assert.equal(pastaFixavel(ruim, CASA), false, ruim)
  assert.equal(pastaFixavel('D:\\.cerebro\\notas', CASA), true, 'ponto no começo do nome é nome comum')
})

test('caminho real: raiz de disco, rede, a casa e ancestral da casa são recusados', () => {
  const casa = 'C:\\Users\\fulano'
  for (const real of ['C:\\', 'C:\\Users', 'C:\\Users\\', 'c:\\users', casa, 'C:\\Users\\FULANO\\', '\\\\?\\C:\\', '\\\\srv\\x', '']) {
    assert.equal(pastaRealFixavel(real, casa), false, real)
  }
  for (const real of ['C:\\Users\\fulano\\notas', 'C:\\Users\\fulano2', 'D:\\Cerebro', 'C:\\UsersX']) {
    assert.equal(pastaRealFixavel(real, casa), true, real)
  }
})

// ---- com o disco de verdade (pasta temporária) ----

function ambiente() {
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), 'ork-leitor-')))
  const casa = join(base, 'casa')
  mkdirSync(join(casa, 'notas'), { recursive: true })
  mkdirSync(join(base, 'fora', 'cerebro'), { recursive: true })
  const resolver = (c: string): string | null => {
    try {
      const r = realpathSync.native(c)
      return statSync(r).isDirectory() ? r : null
    } catch {
      return null
    }
  }
  return { base, casa, resolver, limpar: () => rmSync(base, { recursive: true, force: true }) }
}

test('com disco: pasta comum passa, devolve o caminho real', () => {
  const a = ambiente()
  try {
    assert.equal(pastaFixavelReal(join(a.base, 'fora', 'cerebro'), a.casa, a.resolver), join(a.base, 'fora', 'cerebro'))
    assert.equal(pastaFixavelReal(join(a.casa, 'notas'), a.casa, a.resolver), join(a.casa, 'notas'))
  } finally {
    a.limpar()
  }
})

test('com disco: inexistente, arquivo, a casa, o pai da casa e a raiz do disco são recusados', () => {
  const a = ambiente()
  try {
    for (const ruim of [join(a.base, 'nao-existe'), a.casa, a.base, parse(a.base).root, join(a.casa, '..')]) {
      assert.equal(pastaFixavelReal(ruim, a.casa, a.resolver), null, ruim)
    }
  } finally {
    a.limpar()
  }
})

test('com disco: junção para a casa, para o pai da casa e para a raiz do disco é recusada', () => {
  const a = ambiente()
  try {
    const alvos: Record<string, string> = { paraCasa: a.casa, paraPai: a.base, paraDisco: parse(a.base).root }
    for (const [nome, alvo] of Object.entries(alvos)) {
      const atalho = join(a.base, 'fora', nome)
      try {
        symlinkSync(alvo, atalho, 'junction')
      } catch (erro) {
        assert.fail(`não consegui criar a junção ${nome}: ${String(erro)}`)
      }
      assert.equal(pastaFixavelReal(atalho, a.casa, a.resolver), null, nome)
    }
    // junção para uma pasta comum continua valendo, e devolve o destino real
    const boa = join(a.base, 'fora', 'paraCerebro')
    symlinkSync(join(a.base, 'fora', 'cerebro'), boa, 'junction')
    assert.equal(pastaFixavelReal(boa, a.casa, a.resolver), join(a.base, 'fora', 'cerebro'))
  } finally {
    a.limpar()
  }
})

test('fixada entra na leitura e nunca na lista de abrir; fixada inválida cai', () => {
  const a = ambiente()
  try {
    const paraAbrir = [join(a.base, 'fora')]
    const fixada = join(a.base, 'fora', 'cerebro')
    const leitura = raizesDeLeitura(paraAbrir, [fixada, a.casa, join(a.base, 'nao-existe'), 7], a.casa, a.resolver)
    assert.deepEqual(leitura, [...paraAbrir, fixada])
    assert.deepEqual(paraAbrir, [join(a.base, 'fora')], 'a lista de abrir não é alterada')
    assert.equal(paraAbrir.includes(fixada), false)
  } finally {
    a.limpar()
  }
})

test('com disco (Windows): C:\\., \\., <casa>\\., C:\\Users e \\localhost\\c$ não passam com a casa de verdade', { skip: process.platform !== 'win32' }, () => {
  const casa = homedir()
  const resolver = (c: string): string | null => {
    try {
      const r = realpathSync.native(c)
      return statSync(r).isDirectory() ? r : null
    } catch {
      return null
    }
  }
  const usuarios = parse(casa).root + 'Users'
  for (const ruim of ['C:\\.', '\\.', `${casa}\\.`, usuarios, '\\\\localhost\\c$', '\\\\?\\C:\\', parse(casa).root, casa]) {
    assert.equal(pastaFixavelReal(ruim, casa, resolver), null, ruim)
  }
})

test('raiz de disco é recusada', () => {
  for (const raiz of ['C:\\', 'C:/', 'C:', 'c:\\', '/', '\\']) {
    assert.equal(leitorValido({ pastas: [raiz] }, CASA), false, raiz)
  }
})

test('a pasta do usuário inteira é recusada, subpasta passa', () => {
  for (const casa of ['C:\\Users\\fulano', 'c:/users/FULANO/', 'C:\\Users\\fulano\\']) {
    assert.equal(leitorValido({ pastas: [casa] }, CASA), false, casa)
  }
  assert.equal(pastaFixavel('C:\\Users\\fulano2', CASA), true)
})

test('mais de 20 itens é recusado, 20 passa', () => {
  const vinte = Array.from({ length: 20 }, (_, i) => `D:\\p${i}`)
  assert.equal(leitorValido({ pastas: vinte }, CASA), true)
  assert.equal(leitorValido({ pastas: [...vinte, 'D:\\p20'] }, CASA), false)
})

test('item que não é string, relativo, com .. ou vazio é recusado', () => {
  for (const ruim of [1, null, {}, ['D:\\x'], '', '  ', 'notas', '.\\notas', 'D:\\a\\..\\b', 'D:\\a\nb']) {
    assert.equal(leitorValido({ pastas: [ruim] }, CASA), false, JSON.stringify(ruim))
  }
  assert.equal(leitorValido({ pastas: 'D:\\x' }, CASA), false)
  assert.equal(leitorValido({}, CASA), false)
  assert.equal(leitorValido(null, CASA), false)
  assert.equal(leitorValido('D:\\x', CASA), false)
})

test('outra janela gravando o tema não apaga o leitor; gravar o leitor substitui', () => {
  const disco = {
    versao: 1 as const,
    tema: 'escuro' as const,
    presets: [{ id: 'c', nome: 'Claude', agente: 'claude' as const, comando: 'claude' }],
    corPostItPadrao: 'amarelo' as const,
    leitor: { pastas: ['D:\\Cerebro'] }
  }
  const juntas = juntarPreferencias(disco as never, { tema: 'claro' })
  assert.equal(juntas.tema, 'claro')
  assert.deepEqual(juntas.leitor, { pastas: ['D:\\Cerebro'] })
  const novo = juntarPreferencias(disco as never, { leitor: { pastas: [] } })
  assert.deepEqual(novo.leitor, { pastas: [] })
})

test('arquivo sem leitor carrega igual', () => {
  const antigo = { versao: 1 as const, tema: 'escuro' as const, presets: [], corPostItPadrao: 'amarelo' as const }
  const juntas = juntarPreferencias(antigo as never, { tema: 'claro' })
  assert.equal('leitor' in juntas, false)
  assert.equal(leitorValido((juntas as { leitor?: unknown }).leitor, CASA), true)
})
