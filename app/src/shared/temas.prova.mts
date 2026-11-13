import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { juntarPreferencias } from './preferencias.ts'
// @ts-expect-error idem.
import { TEMAS, TEMA_PADRAO, classeDoTema, temaValido } from './temas.ts'
// @ts-expect-error idem.
import { TEMAS_XTERM } from '../renderer/src/terminal/temaXterm.ts'
// @ts-expect-error idem.
import { CORES_DE_CARTAO, CORES_DE_DESENHO, COR_DO_TRACO_PADRAO, TOM_DO_POSTIT } from '../renderer/src/estado/coresDeDados.ts'

const tokens = readFileSync(join(import.meta.dirname, '../renderer/src/estilos/tokens.css'), 'utf8')

// Preferências v1 como as versões antigas gravaram: só 'escuro' ou 'claro', e às vezes sem o campo.
const antigas = (tema?: string) => ({
  versao: 1 as const,
  ...(tema === undefined ? {} : { tema }),
  presets: [{ id: 'claude', nome: 'Claude Code', agente: 'claude' as const, comando: 'claude' }],
  corPostItPadrao: 'amarelo' as const,
  funcoes: [{ nome: 'Revisor', prompt: 'revise', cor: '#007AFF' }]
})

test('os ids gravados nas preferências antigas ("escuro" e "claro") continuam temas válidos', () => {
  assert.equal(temaValido('escuro'), true)
  assert.equal(temaValido('claro'), true)
  assert.equal(temaValido(undefined), false) // como antes: a gravação recusa preferência sem tema
  assert.equal(temaValido('sepia'), false)
  assert.equal(temaValido(1), false)
  assert.equal(TEMA_PADRAO, 'escuro')
})

test('preferências v1 antigas passam pela junção sem perder nada, com tema escuro, claro ou ausente', () => {
  for (const tema of ['escuro', 'claro', undefined]) {
    const disco = antigas(tema)
    const sem = juntarPreferencias(disco as never, { corPostItPadrao: 'rosa' })
    assert.equal(sem.versao, 1)
    assert.equal((sem as { tema?: string }).tema, tema) // o tema ausente continua ausente: nada é inventado
    assert.deepEqual(sem.presets, disco.presets)
    assert.deepEqual(sem.funcoes, disco.funcoes)
    assert.equal(sem.corPostItPadrao, 'rosa')
  }
  assert.equal(juntarPreferencias(antigas('escuro') as never, { tema: 'claro' }).tema, 'claro')
})

test('cada tema registrado tem um bloco de cores em tokens.css e um tema do xterm, e a classe é tema-<id>', () => {
  assert.deepEqual(TEMAS.map((t: { id: string }) => t.id), ['escuro', 'claro'])
  assert.equal(new Set(TEMAS.map((t: { id: string }) => t.id)).size, TEMAS.length)
  for (const { id } of TEMAS) {
    assert.equal(classeDoTema(id), `tema-${id}`)
    assert.match(tokens, new RegExp(`^\\.tema-${id} \\{`, 'm'), `falta o bloco .tema-${id}`)
    assert.ok(TEMAS_XTERM[id]?.background, `falta o tema do xterm de ${id}`)
  }
})

test('o tema é definido uma vez: um único bloco .tema-<id> (só em tokens.css), sem variável repetida', () => {
  for (const { id } of TEMAS) {
    const seletor = new RegExp(`^\\.tema-${id}\\b[^{]*\\{`, 'gm')
    assert.equal([...tokens.matchAll(seletor)].length, 1, `o seletor .tema-${id} tem de aparecer uma vez só`)
    const bloco = new RegExp(`^\\.tema-${id} \\{([^}]*)\\}`, 'gm')
    const nomes = [...tokens.matchAll(bloco)].flatMap((m) => [...m[1].matchAll(/(--[\w-]+)\s*:/g)].map((x) => x[1]))
    assert.equal(new Set(nomes).size, nomes.length, `variável repetida em .tema-${id}`)
    assert.ok(nomes.length > 30)
    assert.ok(nomes.includes('--cod-texto'), `o realce de sintaxe tem de estar no bloco de .tema-${id}`)
  }
})

test('as cores gravadas no quadro continuam com o mesmo texto (são dado, não tema)', () => {
  assert.deepEqual(CORES_DE_CARTAO.map((c: { cor: string | null }) => c.cor), [null, '#007AFF', '#AF52DE', '#FF2D55', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#8E8E93'])
  assert.deepEqual(CORES_DE_DESENHO, ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#8E8E93'])
  assert.equal(COR_DO_TRACO_PADRAO, '#FF3B30')
  assert.deepEqual(TOM_DO_POSTIT, { '#007AFF': 'azul', '#AF52DE': 'roxo', '#FF2D55': 'rosa', '#FF3B30': 'rosa', '#FF9500': 'amarelo', '#FFCC00': 'amarelo', '#34C759': 'verde' })
})

test('o tema do xterm tem os mesmos valores de antes', () => {
  assert.deepEqual(TEMAS_XTERM.escuro, { background: '#1A1A1E', foreground: '#E6E6E6', cursor: '#E6E6E6', cursorAccent: '#1A1A1E', selectionBackground: '#264F78' })
  assert.deepEqual(TEMAS_XTERM.claro, {
    background: '#FFFFFF',
    foreground: '#2A2A2E',
    cursor: '#2A2A2E',
    cursorAccent: '#FFFFFF',
    selectionBackground: '#ADD6FF',
    white: '#6E6E73',
    brightWhite: '#3A3A3C',
    yellow: '#A16C00',
    brightYellow: '#8A5A00'
  })
})
