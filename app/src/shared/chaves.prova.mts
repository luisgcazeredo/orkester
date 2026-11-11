import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { COFRE_VAZIO, MAX_CHAVES, configuracoesDoMcp, chavePorSegredo, cofreValido, criarChave, marcarUso, paraMostrar, redigir, revogarChave, segredoBemFormado } from './chaves.ts'

/** O erro de uma criação, quando houve. Sem isto o TypeScript não deixa ler `.erro` da união. */
const erroDe = (r: { erro?: string } | object): string => ('erro' in r && typeof r.erro === 'string' ? r.erro : '')
const impressaoDe = (s: string): string => createHash('sha256').update(s).digest('hex')
const instante = '2026-11-11T12:00:00.000Z'

function ambiente(semente = 1) {
  let n = semente
  return {
    sortear: () => String(n++).padStart(64, 'a'),
    impressaoDe,
    novoId: () => `chave-${n}`,
    agora: () => instante
  }
}

const criada = (cofre = COFRE_VAZIO, nome = 'Claude Desktop', amb = ambiente()) => {
  const r = criarChave(cofre, nome, amb)
  assert.ok(!('erro' in r), 'erro' in r ? r.erro : '')
  return r
}

test('o segredo volta uma vez e o cofre guarda só a impressão digital', () => {
  const r = criada()
  assert.ok(segredoBemFormado(r.segredo))
  assert.equal(r.cofre.chaves.length, 1)
  assert.equal(JSON.stringify(r.cofre).includes(r.segredo), false, 'o segredo não pode estar no cofre')
  assert.equal(r.chave.impressao, impressaoDe(r.segredo))
  assert.equal(r.chave.comeco, r.segredo.slice(0, 10))
})

test('a chave é achada pelo segredo, e só pelo certo', () => {
  const r = criada()
  assert.equal(chavePorSegredo(r.cofre, r.segredo, impressaoDe)?.id, r.chave.id)
  assert.equal(chavePorSegredo(r.cofre, 'ork_' + 'b'.repeat(64), impressaoDe), undefined)
  assert.equal(chavePorSegredo(r.cofre, 'qualquer coisa', impressaoDe), undefined)
  assert.equal(chavePorSegredo(r.cofre, undefined, impressaoDe), undefined)
})

test('revogada não responde mais, e o registro fica', () => {
  const r = criada()
  const depois = revogarChave(r.cofre, r.chave.id, instante)
  assert.equal(chavePorSegredo(depois, r.segredo, impressaoDe), undefined)
  assert.equal(depois.chaves.length, 1, 'revogar marca, não apaga: o rastro de quem teve acesso continua')
  assert.equal(depois.chaves[0].revogadaEm, instante)
})

test('nome: obrigatório, único entre as vivas, e livre de novo depois de revogar', () => {
  assert.match(erroDe(criarChave(COFRE_VAZIO, '   ', ambiente())), /dê um nome/)
  const r = criada()
  assert.match(erroDe(criarChave(r.cofre, 'claude desktop', ambiente(9))), /já existe/)
  const revogada = revogarChave(r.cofre, r.chave.id, instante)
  assert.ok(!('erro' in criarChave(revogada, 'Claude Desktop', ambiente(9))))
})

test('teto de chaves vivas', () => {
  let cofre = COFRE_VAZIO
  for (let i = 0; i < MAX_CHAVES; i++) cofre = criada(cofre, `cliente ${i}`, ambiente(i + 1)).cofre
  assert.match(erroDe(criarChave(cofre, 'mais uma', ambiente(99))), /revogue alguma/)
})

test('a tela nunca vê a impressão digital, e o segredo aparece cortado', () => {
  const r = criada()
  const mostrado = paraMostrar(r.cofre)[0] as Record<string, unknown>
  assert.equal('impressao' in mostrado, false)
  assert.equal(mostrado.nome, 'Claude Desktop')
  assert.match(redigir(r.segredo), /^ork_.{6}…$/)
  assert.equal(redigir('nada disso'), '(chave inválida)')
})

test('cofre inválido é recusado, e o uso fica registrado', () => {
  assert.equal(cofreValido(COFRE_VAZIO), true)
  assert.equal(cofreValido({ versao: 2, chaves: [] }), false)
  assert.equal(cofreValido({ versao: 1, chaves: [{ id: 'x' }] }), false)
  const r = criada()
  assert.equal(marcarUso(r.cofre, r.chave.id, '2026-11-12T00:00:00.000Z').chaves[0].usadaEm, '2026-11-12T00:00:00.000Z')
})

test('configuração pronta: o caminho do Windows sai certo em cada formato', () => {
  const segredo = 'ork_' + 'c'.repeat(64)
  const mcp = { comando: String.raw`C:\Program Files\nodejs\node.exe`, args: [String.raw`C:\Users\ana\.orkester\bin\cli\mcp.js`] }
  const c = configuracoesDoMcp(segredo, mcp)

  // JSON: a barra invertida tem de voltar intacta depois de ler
  const lido = JSON.parse(c.json)
  assert.equal(lido.mcpServers.orkester.command, mcp.comando)
  assert.deepEqual(lido.mcpServers.orkester.args, mcp.args)
  assert.equal(lido.mcpServers.orkester.env.ORK_CHAVE, segredo)

  // TOML: string literal, sem escape — o mesmo formato que o config.toml do Codex já usa
  assert.match(c.codex, /^\[mcp_servers\.orkester\]$/m)
  assert.ok(c.codex.includes(String.raw`command = 'C:\Program Files\nodejs\node.exe'`))
  assert.ok(c.codex.includes(`ORK_CHAVE = '${segredo}'`))

  // Claude Code: escopo de usuário, a chave no -e, e o caminho com espaço entre aspas
  assert.ok(c.claudeCode.startsWith(`claude mcp add orkester -s user -e ORK_CHAVE=${segredo} -- `), c.claudeCode)
  assert.ok(c.claudeCode.includes(`"${mcp.comando}" "${mcp.args[0]}"`), c.claudeCode)
})

test('configuração sem Node no sistema leva as variáveis extras', () => {
  const c = configuracoesDoMcp('ork_' + 'd'.repeat(64), { comando: 'C:/app/Orkester.exe', args: ['C:/x/mcp.js'], env: { ELECTRON_RUN_AS_NODE: '1' } })
  assert.equal(JSON.parse(c.json).mcpServers.orkester.env.ELECTRON_RUN_AS_NODE, '1')
  assert.ok(c.claudeCode.includes('-e ELECTRON_RUN_AS_NODE=1'))
  assert.throws(() => configuracoesDoMcp('ork_' + 'e'.repeat(64), { comando: "C:/o'brien/node.exe", args: [] }), /aspas simples/)
})
