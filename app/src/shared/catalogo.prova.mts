import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_PROMPT, juntarCatalogo, lerFicha, motoresDaFicha, nivelDaFicha, presetParaFicha, textoDoRelatorio } from './catalogo.ts'

const PRESETS = [
  { id: 'claude-medio', nome: 'Claude médio', agente: 'claude' as const, comando: 'claude --model sonnet' },
  { id: 'claude-forte', nome: 'Claude forte', agente: 'claude' as const, comando: 'claude --model opus' },
  { id: 'claude-rapido', nome: 'Claude rápido', agente: 'claude' as const, comando: 'claude --model haiku' },
  { id: 'codex-forte', nome: 'Codex forte', agente: 'codex' as const, comando: 'codex' },
  { id: 'shell', nome: 'PowerShell', agente: 'shell' as const, comando: '' }
]

const ficha = (cabecalho: string, corpo = 'Você é alguém.'): string => `---\n${cabecalho}\n---\n${corpo}\n`

let proximo = 0
const novoId = (): string => `novo-${++proximo}`

test('ficha: cabeçalho vira campos e o corpo vira o prompt', () => {
  const r = lerFicha('20-revisor.md', ficha('nome: Revisor\nmotor: Codex\nnivel: forte', 'Você é o Revisor.\n\n## O que olha\nTudo.'))
  assert.ok('ficha' in r)
  assert.equal(r.ficha.nome, 'Revisor')
  assert.equal(r.ficha.motor, 'Codex')
  assert.equal(r.ficha.prompt, 'Você é o Revisor.\n\n## O que olha\nTudo.')
})

test('ficha: aceita "nível" com acento, lê pasta, e recusa o que não dá para usar', () => {
  const comAcento = lerFicha('f.md', ficha('nome: Curador\nmotor: Claude\nnível: médio\npasta: C:/cerebro'))
  assert.ok('ficha' in comAcento)
  assert.equal(comAcento.ficha.nivel, 'médio')
  assert.equal(comAcento.ficha.pasta, 'C:/cerebro')

  assert.ok('erro' in lerFicha('f.md', 'sem cabeçalho nenhum'))
  assert.ok('erro' in lerFicha('f.md', ficha('motor: Claude')))

  // o prompt é digitado no terminal quando o cartão abre: colar um livro ali não é importar, é acidente
  const gigante = lerFicha('g.md', ficha('nome: Gigante\nmotor: Claude', 'x'.repeat(MAX_PROMPT + 1)))
  assert.ok('erro' in gigante)
  assert.match(gigante.erro, /o teto é/)
})

test('motor: separador faz dois assentos; "com" é descrição de um só', () => {
  // o papel de Decisões existe duas vezes, para um lado seguir quando o outro ficar sem tokens
  assert.deepEqual(motoresDaFicha('Codex e Claude (dois assentos, mesmo perfil)'), ['codex', 'claude'])
  assert.deepEqual(motoresDaFicha('Claude, Codex'), ['claude', 'codex'])
  // "Shell com Claude" é um cartão só: quem manda é o mais específico
  assert.deepEqual(motoresDaFicha('Shell com Claude'), ['claude'])
  assert.deepEqual(motoresDaFicha('Codex'), ['codex'])
  assert.deepEqual(motoresDaFicha('Shell'), ['shell'])
  assert.deepEqual(motoresDaFicha('MeuMotor'), [])
})

test('nível: vale a primeira palavra conhecida', () => {
  assert.equal(nivelDaFicha('médio (forte em migração)'), 'medio')
  assert.equal(nivelDaFicha('rápido a médio'), 'rapido')
  assert.equal(nivelDaFicha('não se aplica'), undefined)
})

test('preset: casa pelo nome; sem o nível pedido, cai no primeiro e avisa', () => {
  assert.equal(presetParaFicha(PRESETS, 'claude', 'forte').preset?.id, 'claude-forte')
  const semNivel = presetParaFicha(PRESETS, 'codex', 'rapido')
  assert.equal(semNivel.preset?.id, 'codex-forte')
  assert.match(semNivel.aviso ?? '', /nível "rapido"/)
  assert.equal(presetParaFicha([], 'claude', 'forte').preset, undefined)
})

test('juntar: cria, atualiza pelo nome e não duplica', () => {
  const fichas = [
    { arquivo: 'a.md', nome: 'Revisor', motor: 'Codex', nivel: 'forte', prompt: 'Revise.' },
    { arquivo: 'b.md', nome: 'Escriba', motor: 'Claude', nivel: 'rápido', prompt: 'Registre.' }
  ]
  const primeira = juntarCatalogo([], fichas, PRESETS, novoId)
  assert.equal(primeira.funcoes.length, 2)
  assert.deepEqual(primeira.relatorio.map((l) => l.acao), ['criada', 'criada'])
  assert.equal(primeira.funcoes[0].preset, 'codex-forte')

  const deNovo = juntarCatalogo(primeira.funcoes, fichas, PRESETS, novoId)
  assert.equal(deNovo.funcoes.length, 2)
  assert.deepEqual(deNovo.relatorio.map((l) => l.acao), ['igual', 'igual'])
  assert.equal(deNovo.funcoes[0].id, primeira.funcoes[0].id, 'o id tem de continuar o mesmo')

  const mudada = juntarCatalogo(primeira.funcoes, [{ ...fichas[0], prompt: 'Revise melhor.' }], PRESETS, novoId)
  assert.deepEqual(mudada.relatorio.map((l) => l.acao), ['atualizada'])
  assert.equal(mudada.funcoes.length, 2, 'importar uma ficha não derruba as outras funções')
})

test('juntar: dois assentos viram duas funções com o motor no nome', () => {
  const r = juntarCatalogo([], [{ arquivo: 'd.md', nome: 'Decisões', motor: 'Codex e Claude', nivel: 'forte', prompt: 'Decida.' }], PRESETS, novoId)
  assert.deepEqual(r.funcoes.map((f) => f.nome), ['Decisões (Codex)', 'Decisões (Claude)'])
  assert.deepEqual(r.funcoes.map((f) => f.preset), ['codex-forte', 'claude-forte'])
})

test('juntar: shell não leva prompt, e pasta vai junto', () => {
  const r = juntarCatalogo(
    [],
    [
      { arquivo: 'p.md', nome: 'Prova', motor: 'Shell', nivel: 'não se aplica', prompt: 'isto seria digitado como comando' },
      { arquivo: 'c.md', nome: 'Curador', motor: 'Claude', nivel: 'médio', pasta: 'C:/cerebro', prompt: 'Grave.' }
    ],
    PRESETS,
    novoId
  )
  assert.equal(r.funcoes[0].prompt, '')
  assert.equal(r.funcoes[1].pasta, 'C:/cerebro')
})

test('juntar: motor desconhecido não entra e aparece no relatório', () => {
  const r = juntarCatalogo([], [{ arquivo: 'x.md', nome: 'Alguém', motor: 'GPT caseiro', nivel: 'forte', prompt: 'oi' }], PRESETS, novoId)
  assert.equal(r.funcoes.length, 0)
  assert.match(textoDoRelatorio(r.relatorio), /não é claude, codex nem shell/)
})
