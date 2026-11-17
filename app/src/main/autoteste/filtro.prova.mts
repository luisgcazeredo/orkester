import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { apagarChromiumDaRodada, escolherCenarios } from './filtro.ts'

const todos = [
  { nome: 'ork' },
  { nome: 'ork-conexoes', depende: 'ork' },
  { nome: 'ork-quadro', depende: 'ork-conexoes' },
  { nome: 'rotinas' },
  { nome: 'casca-paginas' }
]
const nomes = (l: { nome: string }[]): string[] => l.map((c) => c.nome)

test('filtro vazio roda tudo', () => {
  assert.deepEqual(nomes(escolherCenarios(todos, '').selecionados), nomes(todos))
  assert.deepEqual(nomes(escolherCenarios(todos, undefined).selecionados), nomes(todos))
})

test('`ork` casa só com o cenário ork, não com os que contêm "ork"', () => {
  const r = escolherCenarios(todos, 'ork')
  assert.deepEqual(nomes(r.selecionados), ['ork'])
  assert.deepEqual(r.semPar, [])
})

test('lista separada por vírgula, com espaço e maiúscula, e dependência em cadeia', () => {
  const r = escolherCenarios(todos, ' Rotinas , ork-quadro ')
  assert.deepEqual(nomes(r.selecionados), ['ork', 'ork-conexoes', 'ork-quadro', 'rotinas'])
  assert.deepEqual(r.semPar, [])
})

test('nome sem par é devolvido (o autoteste falha por ele), mesmo com outros que casam', () => {
  assert.deepEqual(escolherCenarios(todos, 'matriz-menus').semPar, ['matriz-menus'])
  assert.equal(escolherCenarios(todos, 'matriz-menus').selecionados.length, 0)
  const r = escolherCenarios(todos, 'rotinas,matriz-menus')
  assert.deepEqual(nomes(r.selecionados), ['rotinas'])
  assert.deepEqual(r.semPar, ['matriz-menus'])
})

test('pedaço de nome não casa mais (antes era includes)', () => {
  assert.deepEqual(escolherCenarios(todos, 'casca').semPar, ['casca'])
})

test('pedido em `aguardando` é adiado com aviso, não é semPar; o que não existe e não espera continua semPar', () => {
  const r = escolherCenarios(todos, 'rotinas,menus-dialogos', ['menus-dialogos'])
  assert.deepEqual(nomes(r.selecionados), ['rotinas'])
  assert.deepEqual(r.adiados, ['menus-dialogos'])
  assert.deepEqual(r.semPar, [])
  const r2 = escolherCenarios(todos, 'menus-dialogos,outro', ['menus-dialogos'])
  assert.deepEqual(r2.adiados, ['menus-dialogos'])
  assert.deepEqual(r2.semPar, ['outro'])
  // aguardando que já existe vira cenário normal
  const r3 = escolherCenarios(todos, 'rotinas', ['rotinas'])
  assert.deepEqual(nomes(r3.selecionados), ['rotinas'])
  assert.deepEqual(r3.adiados, [])
})

test('apagarChromiumDaRodada apaga só a pasta do próprio pid', () => {
  const base = mkdtempSync(join(tmpdir(), 'prova-chromium-'))
  const minha = join(base, 'orkester-autoteste-chromium-4242')
  const alheia = join(base, 'orkester-autoteste-chromium-4243')
  const doApp = join(base, 'Orkester')
  for (const p of [minha, alheia, doApp]) {
    mkdirSync(p)
    writeFileSync(join(p, 'x'), '1')
  }
  assert.equal(apagarChromiumDaRodada(alheia, 4242), 'recusada')
  assert.equal(apagarChromiumDaRodada(doApp, 4242), 'recusada')
  assert.equal(apagarChromiumDaRodada(minha, 4242), 'apagada')
  assert.equal(existsSync(minha), false)
  assert.equal(existsSync(alheia), true)
  assert.equal(existsSync(doApp), true)
})
