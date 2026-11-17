import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { gitSeguro } = await import(new URL('./gitSeguro.ts', import.meta.url).href)

const aqui = (...p: string[]) => join(...p).replace(/\\/g, '/')

/** Repositório com um arquivo comitado e mudado, e a config armada para executar um script que cria a marca. */
function armar(): { pasta: string; marca: (nome: string) => string; limpar: () => void; cru: (...a: string[]) => string } {
  const pasta = mkdtempSync(join(tmpdir(), 'ork-git-prova-'))
  const cru = (...a: string[]): string => execFileSync('git', a, { cwd: pasta, encoding: 'utf8' })
  cru('init', '-q')
  cru('config', 'user.email', 'a@b.c')
  cru('config', 'user.name', 'prova')
  writeFileSync(join(pasta, 'a.txt'), 'um\n')
  cru('add', 'a.txt')
  cru('commit', '-q', '-m', 'um')
  writeFileSync(join(pasta, 'a.txt'), 'um\ndois\n')
  const marca = (nome: string) => aqui(pasta, `marca-${nome}`)
  const script = (nome: string, corpo: string) => {
    const caminho = aqui(pasta, `${nome}.sh`)
    writeFileSync(caminho, `#!/bin/sh\necho x > "${marca(nome)}"\n${corpo}\n`)
    return caminho
  }
  // fsmonitor responde "tudo mudou" (sem erro) depois de deixar a marca
  cru('config', 'core.fsmonitor', script('fsmonitor', 'printf "\\0"'))
  cru('config', 'diff.external', script('externo', 'exit 0'))
  cru('config', 'diff.prova.textconv', script('textconv', 'cat "$1"'))
  cru('config', 'filter.prova.clean', script('filtro', 'cat'))
  writeFileSync(join(pasta, '.gitattributes'), '*.txt diff=prova filter=prova\n')
  return { pasta, marca, limpar: () => rmSync(pasta, { recursive: true, force: true }), cru }
}

test('controle: sem o endurecimento, o git do repositório de fora executa o fsmonitor', () => {
  const r = armar()
  try {
    r.cru('status', '--porcelain')
    assert.ok(existsSync(r.marca('fsmonitor')), 'o controle precisa criar a marca, senão a prova não prova nada')
    r.cru('-c', 'core.fsmonitor=false', 'diff', 'HEAD', '--ext-diff')
    r.cru('-c', 'core.fsmonitor=false', 'diff', 'HEAD', '--no-ext-diff', '--textconv')
    for (const nome of ['externo', 'textconv', 'filtro']) assert.ok(existsSync(r.marca(nome)), `controle: ${nome} devia executar sem o endurecimento`)
  } finally {
    r.limpar()
  }
})

test('diff pelo gitSeguro: fsmonitor, diff.external, textconv e filtro não executam', async () => {
  const r = armar()
  try {
    const d = await gitSeguro(r.pasta, ['diff', 'HEAD', '--no-color', '-U3', '--', join(r.pasta, 'a.txt')])
    assert.equal(d.codigo, 0, d.erro)
    assert.match(d.saida, /\+dois/, 'o diff continua útil')
    for (const nome of ['fsmonitor', 'externo', 'textconv', 'filtro']) {
      assert.equal(existsSync(r.marca(nome)), false, `${nome} executou`)
    }
  } finally {
    r.limpar()
  }
})

test('status e rev-parse pelo gitSeguro também não executam nada', async () => {
  const r = armar()
  try {
    const s = await gitSeguro(r.pasta, ['status', '--porcelain'])
    assert.equal(s.codigo, 0, s.erro)
    assert.match(s.saida, /a\.txt/)
    assert.equal((await gitSeguro(r.pasta, ['rev-parse', '--show-toplevel'])).codigo, 0)
    for (const nome of ['fsmonitor', 'externo', 'textconv', 'filtro']) {
      assert.equal(existsSync(r.marca(nome)), false, `${nome} executou`)
    }
  } finally {
    r.limpar()
  }
})

test('hook não executa (merge cria commit e dispararia pre-merge-commit/post-merge)', async () => {
  const r = armar()
  try {
    r.cru('config', 'core.fsmonitor', 'false')
    r.cru('commit', '-q', '-am', 'dois')
    r.cru('checkout', '-q', '-b', 'outro')
    writeFileSync(join(r.pasta, 'b.txt'), 'b\n')
    r.cru('add', 'b.txt')
    r.cru('commit', '-q', '-m', 'b', '--no-verify')
    r.cru('checkout', '-q', '-')
    writeFileSync(join(r.pasta, 'c.txt'), 'c\n')
    r.cru('add', 'c.txt')
    r.cru('commit', '-q', '-m', 'c', '--no-verify')
    const hook = aqui(r.pasta, '.git', 'hooks', 'post-merge')
    writeFileSync(hook, `#!/bin/sh\necho x > "${r.marca('hook')}"\n`, { mode: 0o755 })
    const m = await gitSeguro(r.pasta, ['merge', '--no-ff', '--no-edit', '-m', 'junta', 'outro'])
    assert.equal(m.codigo, 0, m.erro)
    assert.equal(existsSync(r.marca('hook')), false, 'hook executou')
  } finally {
    r.limpar()
  }
})

test('config de sistema vale: arquivo CRLF editado mostra 1 linha mudada (core.autocrlf do sistema)', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ork-git-crlf-'))
  const sistema = join(pasta, 'sistema.gitconfig')
  writeFileSync(sistema, '[core]\n\tautocrlf = true\n')
  const antes = process.env.GIT_CONFIG_SYSTEM
  const antesNo = process.env.GIT_CONFIG_NOSYSTEM
  process.env.GIT_CONFIG_SYSTEM = sistema
  delete process.env.GIT_CONFIG_NOSYSTEM
  const repo = join(pasta, 'r')
  try {
    execFileSync('git', ['init', '-q', repo])
    const cru = (...a: string[]): string => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: process.env })
    cru('config', 'user.email', 'a@b.c')
    cru('config', 'user.name', 'prova')
    // comita em LF (como o repositório guarda) e faz o checkout em CRLF
    writeFileSync(join(repo, 'a.txt'), Array.from({ length: 30 }, (_, i) => `linha ${i}`).join('\n') + '\n')
    cru('-c', 'core.autocrlf=false', 'add', 'a.txt')
    cru('-c', 'core.autocrlf=false', 'commit', '-q', '-m', 'um')
    rmSync(join(repo, 'a.txt'))
    cru('checkout', '--', 'a.txt')
    const crlf = Array.from({ length: 30 }, (_, i) => `linha ${i}`).join('\r\n') + '\r\n'
    assert.equal(readFileSync(join(repo, 'a.txt'), 'utf8'), crlf, 'o checkout precisa sair em CRLF (a config de sistema vale)')
    writeFileSync(join(repo, 'a.txt'), crlf + 'nova\r\n')
    const d = await gitSeguro(repo, ['diff', 'HEAD', '--no-color', '-U0', '--', 'a.txt'])
    assert.equal(d.codigo, 0, d.erro)
    const mudadas = d.saida.split('\n').filter((l: string) => /^[+-][^+-]/.test(l))
    assert.equal(mudadas.length, 1, `só 1 linha mudada, veio:\n${d.saida}`)
  } finally {
    if (antes === undefined) delete process.env.GIT_CONFIG_SYSTEM
    else process.env.GIT_CONFIG_SYSTEM = antes
    if (antesNo !== undefined) process.env.GIT_CONFIG_NOSYSTEM = antesNo
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('clone parcial: a busca preguiçosa não roda o uploadpack do config (controle roda)', async () => {
  const pasta = mkdtempSync(join(tmpdir(), 'ork-git-lazy-'))
  try {
    const g = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8' })
    const origem = join(pasta, 'origem')
    execFileSync('git', ['init', '-q', origem])
    g(origem, 'config', 'user.email', 'a@b.c')
    g(origem, 'config', 'user.name', 'prova')
    g(origem, 'config', 'uploadpack.allowFilter', 'true')
    g(origem, 'config', 'uploadpack.allowAnySHA1InWant', 'true')
    writeFileSync(join(origem, 'a.txt'), 'um\n')
    g(origem, 'add', 'a.txt')
    g(origem, 'commit', '-q', '-m', 'um')
    const clone = join(pasta, 'clone')
    execFileSync('git', ['-c', 'protocol.file.allow=always', 'clone', '-q', '--filter=blob:none', '--no-checkout', pathToFileURL(origem).href, clone])
    // com --no-checkout o blob de HEAD falta; agora o config aponta o uploadpack para o script-marca
    const marca = aqui(pasta, 'marca-uploadpack')
    const script = aqui(pasta, 'up.sh')
    writeFileSync(script, `#!/bin/sh\necho x > "${marca}"\nexec git-upload-pack "$@"\n`, { mode: 0o755 })
    g(clone, 'config', 'remote.origin.uploadpack', script)
    g(clone, 'config', 'protocol.file.allow', 'always')
    writeFileSync(join(clone, 'a.txt'), 'um\ndois\n')
    const d = await gitSeguro(clone, ['diff', 'HEAD', '--no-color', '--', 'a.txt'])
    assert.equal(existsSync(marca), false, 'uploadpack executou pelo gitSeguro')
    assert.notEqual(d.codigo, 0, 'sem rede, o blob que falta não vem')
    // controle: o git cru, sem a variável, busca o blob e executa o programa
    try {
      g(clone, 'diff', 'HEAD', '--', 'a.txt')
    } catch {
      /* só importa a marca */
    }
    assert.ok(existsSync(marca), 'o controle precisa criar a marca, senão a prova não prova nada')
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
