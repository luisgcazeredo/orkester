import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { juntarPreferencias } from './preferencias.ts'

const disco = {
  versao: 1 as const,
  tema: 'escuro' as const,
  presets: [{ id: 'claude', nome: 'Claude Code', agente: 'claude' as const, comando: 'claude' }],
  corPostItPadrao: 'amarelo' as const,
  funcoes: [{ nome: 'Revisor', prompt: 'revise', cor: '#007AFF' }],
  partituras: [{ nome: 'Time', pecas: [], cordas: [], criadoEm: 1 }]
}

test('gravar um campo não apaga o que a outra janela pôs', () => {
  // o caso real: janela A criou a função, janela B troca o tema com a cópia velha na mão
  const juntas = juntarPreferencias(disco as never, { tema: 'claro' })
  assert.equal(juntas.tema, 'claro')
  assert.deepEqual(juntas.funcoes, disco.funcoes)
  assert.deepEqual(juntas.partituras, disco.partituras)
  assert.deepEqual(juntas.presets, disco.presets)
})

test('campo ausente não zera; campo presente substitui', () => {
  const semNada = juntarPreferencias(disco as never, {})
  assert.deepEqual(semNada, disco)
  const comFuncoes = juntarPreferencias(disco as never, { funcoes: [] })
  assert.deepEqual(comFuncoes.funcoes, [])
  assert.deepEqual(comFuncoes.partituras, disco.partituras)
})

test('undefined explícito também não apaga', () => {
  const juntas = juntarPreferencias(disco as never, { funcoes: undefined, tema: 'claro' })
  assert.deepEqual(juntas.funcoes, disco.funcoes)
  assert.equal(juntas.tema, 'claro')
})

test('campo de fora da lista não entra, e a versão é sempre 1', () => {
  const juntas = juntarPreferencias({ ...disco, versao: 9 } as never, { bisbilhoteiro: true } as never)
  assert.equal(juntas.versao, 1)
  assert.equal('bisbilhoteiro' in juntas, false)
})

test('false é valor, não ausência: linhasDoCodigo desliga', () => {
  const juntas = juntarPreferencias(disco as never, { linhasDoCodigo: false })
  assert.equal(juntas.linhasDoCodigo, false)
})
