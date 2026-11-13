import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { regrasDoCodex, acharGitDoPerfil, ofertaDeAtualizacao, pularEstaMarcado, proximoPassoDaOferta, resolverOferta, GIT_SO_LEITURA } = await import(new URL('./codex-regras.ts', import.meta.url).href)

const GIT = 'C:\\Users\\alguem\\AppData\\Local\\Programs\\Git\\cmd\\git.exe'

test('regras: o git do perfil entra com a barra dobrada; sem git, só o nome', () => {
  const com = regrasDoCodex(GIT)
  assert.ok(com.includes('"C:\\\\Users\\\\alguem\\\\AppData\\\\Local\\\\Programs\\\\Git\\\\cmd\\\\git.exe"'))
  assert.ok(!regrasDoCodex(null).includes('git.exe'))
  for (const sub of GIT_SO_LEITURA) assert.ok(com.includes(`"${sub}"`))
  for (const proibido of ['"config"', '"remote"', '"credential"', '"push"', '"commit"', '"branch"', '"grep"', '"diff"', '"log"', '"show"']) {
    const padroes = com.split('\n').filter((l: string) => l.includes('pattern ='))
    assert.ok(padroes.every((l: string) => !l.includes(proibido)), `${proibido} não pode estar nos padrões`)
  }
})

test('acharGitDoPerfil: acha pelo ambiente em tempo de execução, sem caminho fixo', () => {
  const existe = (c: string): boolean => c === 'D:\\L\\Programs\\Git\\cmd\\git.exe'
  assert.equal(acharGitDoPerfil({ LOCALAPPDATA: 'D:\\L' }, 'C:\\Users\\x', existe), 'D:\\L\\Programs\\Git\\cmd\\git.exe')
  assert.equal(acharGitDoPerfil({}, 'C:\\Users\\x', () => false), null)
})

test('execpolicy do Codex (se houver): git de leitura → allow; push/config → sem regra; ork → allow', (t) => {
  const achou = spawnSync('codex', ['--version'], { shell: true, encoding: 'utf8' })
  if (achou.status !== 0) return t.skip('codex não está instalado')
  const pasta = mkdtempSync(join(tmpdir(), 'orkester-regras-'))
  try {
    const arquivo = join(pasta, 'orkester.rules')
    writeFileSync(arquivo, regrasDoCodex(GIT))
    const decisao = (...cmd: string[]): string => {
      const r = spawnSync('codex', ['execpolicy', 'check', '--rules', `"${arquivo}"`, '--', ...cmd.map((c) => `"${c}"`)], { shell: true, encoding: 'utf8' })
      assert.equal(r.status, 0, `${cmd.join(' ')}: ${r.stderr}`)
      const json = JSON.parse(r.stdout)
      return json.decision ?? 'sem-regra'
    }
    assert.equal(decisao('git', 'status'), 'allow')
    assert.equal(decisao('git', 'rev-parse', 'HEAD'), 'allow')
    assert.equal(decisao('git', 'ls-files'), 'allow')
    assert.equal(decisao('git', '--version'), 'allow')
    assert.equal(decisao(GIT, 'status', '--short'), 'allow')
    assert.equal(decisao('ork', 'quem'), 'allow')
    assert.equal(decisao('git', 'push'), 'sem-regra')
    assert.equal(decisao('git', 'config', 'user.name'), 'sem-regra')
    assert.equal(decisao('git', 'remote', '-v'), 'sem-regra')
    assert.equal(decisao(GIT, 'push'), 'sem-regra')
    for (const perigoso of [['branch', '-D', 'x'], ['grep', '-O', 'sh', 'x'], ['diff', '--output=x'], ['diff', '--stat', '--output=x'], ['log', '--output=x'], ['show', '--output=x']]) {
      assert.equal(decisao('git', ...perigoso), 'sem-regra', perigoso.join(' '))
      assert.equal(decisao(GIT, ...perigoso), 'sem-regra', 'git.exe ' + perigoso.join(' '))
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

const oferta = '✨ Update available! 0.167.2 -> 0.170.0\n\n› 1. Update now (runs `npm install -g @openai/codex`)\n  2. Skip\n  3. Skip until next version\n\n  Press enter to continue'

test('atualização ao abrir: reconhece a oferta; só aperta Enter com "Skip" marcado, nunca em "Update now"', () => {
  assert.equal(ofertaDeAtualizacao(oferta), true)
  assert.equal(ofertaDeAtualizacao('› 1. Yes, continue\n  2. No'), false)
  assert.equal(pularEstaMarcado(oferta), false, 'marcado em Update now: não aperta')
  assert.equal(pularEstaMarcado(oferta.replace('› 1. Update now', '  1. Update now').replace('  2. Skip\n', '› 2. Skip\n')), true)
  assert.equal(pularEstaMarcado('sem opção marcada'), false)
})

// ---- 1.5.2: a oferta real (duas opções na mesma linha) e o Esc ----

const ofertaReal = readFileSync(new URL('./fixtures/codex-oferta-skip-na-mesma-linha.txt', import.meta.url), 'utf8')
const ofertaEmUpdate = ofertaReal.replace('›', ' ').replace('  1. Update now', '› 1. Update now')

test('oferta real: o › está no meio da linha, na opção 2 (Skip) → marcado em pular; com o cursor em Update now → não', () => {
  assert.equal(ofertaDeAtualizacao(ofertaReal), true)
  assert.equal(pularEstaMarcado(ofertaReal), true)
  assert.equal(pularEstaMarcado(ofertaEmUpdate), false)
  assert.equal(proximoPassoDaOferta(ofertaReal, true), 'esc', 'o rodapé diz "esc skip"')
  assert.equal(proximoPassoDaOferta(ofertaReal, false), 'enter', 'sem Esc, lê o cursor: em Skip → Enter')
  assert.equal(proximoPassoDaOferta(ofertaEmUpdate, false), 'seta', 'em Update now → desce, nunca Enter')
  assert.equal(proximoPassoDaOferta('nada a ver', true), 'nada')
})

function terminalDeMentira(inicial: string, aoEscrever: (dados: string, tela: { atual: string }) => void) {
  const tela = { atual: inicial }
  const escritos: string[] = []
  const enterComUpdateMarcado: string[] = []
  return {
    escritos,
    enterComUpdateMarcado,
    d: {
      tela: async () => tela.atual,
      escrever: (dados: string) => {
        if (dados === '\r' && !pularEstaMarcado(tela.atual)) enterComUpdateMarcado.push(tela.atual)
        escritos.push(dados)
        aoEscrever(dados, tela)
      },
      esperar: async () => {}
    }
  }
}

test('oferta: Esc resolve; nenhum Enter e nenhuma seta', async () => {
  const t = terminalDeMentira(ofertaReal, (dados, tela) => {
    if (dados === '\x1b') tela.atual = '› 1. Yes, continue\n  2. No'
  })
  assert.deepEqual(await resolverOferta(t.d), ['esc'])
  assert.deepEqual(t.escritos, ['\x1b'])
})

test('oferta: Esc ignorado e cursor em Skip → só Esc e Enter', async () => {
  const t = terminalDeMentira(ofertaReal, (dados, tela) => {
    if (dados === '\r') tela.atual = 'pronto'
  })
  assert.deepEqual(await resolverOferta(t.d), ['esc', 'enter'])
  assert.deepEqual(t.escritos, ['\x1b', '\r'])
  assert.deepEqual(t.enterComUpdateMarcado, [])
})

test('oferta: Esc ignorado e cursor em Update now → seta, relê, e só então Enter; nunca Enter com Update now marcado', async () => {
  const t = terminalDeMentira(ofertaEmUpdate, (dados, tela) => {
    if (dados === '\x1b[B') tela.atual = ofertaReal
    if (dados === '\r') tela.atual = 'pronto'
  })
  assert.deepEqual(await resolverOferta(t.d), ['esc', 'seta', 'enter'])
  assert.deepEqual(t.escritos, ['\x1b', '\x1b[B', '\r'])
  assert.deepEqual(t.enterComUpdateMarcado, [])
  // a seta não move nada: não insiste, não aperta Enter
  const preso = terminalDeMentira(ofertaEmUpdate, () => {})
  const passos = await resolverOferta(preso.d)
  assert.ok(!passos.includes('enter'))
  assert.deepEqual(preso.enterComUpdateMarcado, [])
  assert.ok(preso.escritos.filter((x) => x === '\x1b[B').length <= 1)
})
