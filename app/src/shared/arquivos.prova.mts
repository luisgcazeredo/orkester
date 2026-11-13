import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { caminhoRelativo, criarFiltro, destinosDoAviso, pastaVigiavel, temCaraDeSegredo, textoDoAnexo, textoDosAnexos, valeSeguir } from './arquivos.ts'

// Caminhos crus (String.raw) porque é assim que o Windows entrega, com barra invertida e espaço no meio.
const PASTA = String.raw`C:\Users\ana\Meus Projetos\orkester\app`
const dentro = (resto: string): string => `${PASTA}\u005C${resto}`

test('caminho relativo sai com barra para frente e ignora maiúscula', () => {
  assert.equal(caminhoRelativo(PASTA, dentro(String.raw`src\main\codigo.ts`)), 'src/main/codigo.ts')
  assert.equal(caminhoRelativo(PASTA.toLowerCase(), dentro('src/App.tsx')), 'src/App.tsx')
  assert.equal(caminhoRelativo(PASTA, PASTA), null)
  assert.equal(caminhoRelativo(PASTA, String.raw`C:\Windows\System32\drivers\etc\hosts`), null)
})

test('anexo: @relativo para o agente, caminho inteiro quando tem espaço', () => {
  const codigo = dentro(String.raw`src\main\codigo.ts`)
  assert.equal(textoDoAnexo(codigo, PASTA, 'claude'), '@src/main/codigo.ts')
  assert.equal(textoDoAnexo(codigo, PASTA, 'codex'), '@src/main/codigo.ts')
  // o shell não tem @: vai o caminho, entre aspas por causa do espaço de "Meus Projetos"
  assert.equal(textoDoAnexo(codigo, PASTA, 'shell'), `"${codigo}"`)
  // relativo com espaço quebraria o completar do @: vai o caminho inteiro
  const comEspaco = dentro(String.raw`src\meu arquivo.ts`)
  assert.equal(textoDoAnexo(comEspaco, PASTA, 'claude'), `"${comEspaco}"`)
  // fora da pasta do agente não existe relativo
  assert.equal(textoDoAnexo(String.raw`D:\exports\lista.csv`, PASTA, 'claude'), String.raw`D:\exports\lista.csv`)
})

test('vários anexos saem separados, com espaço no fim para continuar digitando', () => {
  assert.equal(textoDosAnexos([dentro('a.ts'), dentro('b.ts')], PASTA, 'claude'), '@a.ts @b.ts ')
  assert.equal(textoDosAnexos([], PASTA, 'claude'), '')
})

test('segredo: nome de credencial sim, código com "token" no meio da palavra não', () => {
  const segredos = ['.env', '.env.local', '.mcp.json', 'google-conta-servico.json', 'id_ed25519', 'chave.pem', 'access_token.json', 'senhas.txt', 'client-secret.yml']
  for (const nome of segredos) assert.equal(temCaraDeSegredo(dentro(nome)), true, nome)
  for (const nome of ['tokenizer.ts', 'secretaria.md', 'ambiente.ts', 'index.html']) {
    assert.equal(temCaraDeSegredo(dentro(nome)), false, nome)
  }
})

test('seguir: código sim; build, binário, temporário e segredo não', () => {
  assert.equal(valeSeguir('src/main/codigo.ts'), true)
  assert.equal(valeSeguir('docs/README.md'), true)
  assert.equal(valeSeguir('.claude/agents/n8n.md'), false) // pasta de ferramenta, ignorada desde a 1.5.5
  assert.equal(valeSeguir(String.raw`src\main\codigo.ts`), true)
  assert.equal(valeSeguir('node_modules/react/index.js'), false)
  assert.equal(valeSeguir('.git/index'), false)
  assert.equal(valeSeguir('out/main/index.js'), false)
  assert.equal(valeSeguir('public/logo.png'), false)
  assert.equal(valeSeguir('src/codigo.ts.tmp'), false)
  assert.equal(valeSeguir('package-lock.json'), false)
  assert.equal(valeSeguir('.env'), false)
  assert.equal(valeSeguir(''), false)
})

test('release e .asar: nunca entra, em qualquer pasta', () => {
  assert.equal(valeSeguir('release/win-unpacked/resources/app.asar'), false)
  assert.equal(valeSeguir('release/win-unpacked/Orkester.exe'), false)
  assert.equal(valeSeguir('qualquer/coisa/app.asar'), false)
  assert.equal(valeSeguir('qualquer/coisa/app.asar/dentro/index.js'), false)
  assert.equal(valeSeguir(String.raw`x\Default_App.ASAR\a.js`), false)
  assert.equal(valeSeguir('src/release-notes.md'), true)
  assert.equal(valeSeguir('docs/asar.md'), true)
})

const NL = String.fromCharCode(10)

test('filtro: release e .asar nunca descem, nem com "!" no .orkignore', () => {
  for (const f of [criarFiltro(), criarFiltro(['!release/', '!*.asar', '!**/app.asar/'].join(NL))]) {
    assert.equal(f.desce('a/app.asar'), false)
    assert.equal(f.desce('Default_App.ASAR'), false)
    assert.equal(f.segue('a/app.asar/x.js'), false)
    assert.equal(f.segue('a/app.asar'), false)
  }
  assert.equal(criarFiltro().desce('release'), false)
  assert.equal(criarFiltro().desce('release/win-unpacked'), false)
  assert.equal(criarFiltro().desce('src'), true)
})

test('filtro: o segredo não volta com "!" no .orkignore', () => {
  const f = criarFiltro(['!.env', '!*.pem'].join(NL))
  assert.equal(f.segue('.env'), false)
  assert.equal(f.segue('chaves/a.pem'), false)
})

test('filtro: recados do time e ruído saem; papéis do time e código ficam', () => {
  const f = criarFiltro()
  for (const r of [
    '.contexto/a.md', 'x.log', 'logs/y.log', 'ENTREGA-y.md', 'entrega-1.md', 'tarefa-y.md', 'time/handoff-z.md', 'time/tarefa-3.md', '.contexto/154-entrega.md', 'time/evidencia-1.txt', 'time/resultado-2.md', '.claude/settings.json'
  ]) {
    assert.equal(f.segue(r), false, r)
  }
  for (const r of ['time/01-maestro.md', 'src/main/codigo.ts', 'docs/README.md', 'src/entrega.ts', 'src/pages/entrega-pedido.tsx', 'tarefa-api/x.ts', 'notas/formato-de-entrega.md', 'a/handoff-x.md', 'ordem/entrega-1.md']) {
    assert.equal(f.segue(r), true, r)
  }
  assert.equal(f.desce('.contexto'), false)
  assert.equal(f.desce('time'), true)
})

test('filtro: .orkignore muda o resultado, com a sintaxe do .gitignore', () => {
  const f = criarFiltro(['# meu', 'docs/', '*.md', '!LEIAME.md', '!release/'].join(NL))
  assert.equal(f.desce('docs'), false)
  assert.equal(f.segue('docs/a.ts'), false)
  assert.equal(f.segue('notas.md'), false)
  assert.equal(f.segue('LEIAME.md'), true)
  assert.equal(f.desce('release'), true) // religou um padrão do app
  assert.equal(f.segue('release/build.ts'), true)
  assert.equal(criarFiltro().desce('docs'), true)
  assert.equal(criarFiltro().segue('docs/a.ts'), true)
  assert.equal(criarFiltro().desce('release'), false)
})

test('filtro: barra invertida, vazio e caminho estranho', () => {
  const f = criarFiltro('docs/')
  assert.equal(f.segue(['docs', 'a.ts'].join(String.fromCharCode(92))), false)
  assert.equal(f.segue(''), false)
  assert.equal(f.segue('../fora.ts'), false)
  assert.equal(f.desce(''), false)
})

test('pastaVigiavel recusa casa, raiz e pastas de sistema, e aceita projeto', () => {
  const casa = 'C:\u005CUsers\u005Cluis'
  assert.equal(pastaVigiavel('C:\u005CUsers\u005Cluis\u005Cprojetos\u005Cmeuapp', casa), true)
  assert.equal(pastaVigiavel(casa, casa), false)
  assert.equal(pastaVigiavel(casa + '\u005C', casa), false)
  assert.equal(pastaVigiavel('C:\u005C', casa), false)
  assert.equal(pastaVigiavel('C:', casa), false)
  assert.equal(pastaVigiavel('/', casa), false)
  assert.equal(pastaVigiavel(casa + '\u005CDownloads', casa), false)
  assert.equal(pastaVigiavel(casa + '\u005CAppData\u005CLocal', casa), false)
  assert.equal(pastaVigiavel('C:\u005CWindows', casa), false)
  // uma pasta dentro de uma recusada continua valendo: o projeto é que manda
  assert.equal(pastaVigiavel(casa + '\u005CDownloads\u005Cprojeto', casa), true)
  assert.equal(pastaVigiavel(casa + '\u005CAppData\u005CLocal\u005CTemp\u005Cteste-123', casa), true)
})

test('destino do aviso: uma vez por janela e rótulo, mesmo com assinatura repetida', () => {
  // recarregar a página deixa as assinaturas da página velha com o mesmo id de janela; a nova se soma
  const assinaturas = [
    { rotulo: 'C:/projeto', janela: 1 },
    { rotulo: 'C:/projeto', janela: 1 },
    { rotulo: 'C:/projeto', janela: 2 },
    { rotulo: 'C:/outro', janela: 1 }
  ]
  assert.deepEqual(destinosDoAviso(assinaturas), [
    { rotulo: 'C:/projeto', janela: 1 },
    { rotulo: 'C:/projeto', janela: 2 },
    { rotulo: 'C:/outro', janela: 1 }
  ])
})

test('destino do aviso: rótulos diferentes da mesma pasta são destinos diferentes', () => {
  // a janela pode ter escrito o caminho de dois jeitos; o rótulo é a chave com que o preload entrega
  const assinaturas = [
    { rotulo: 'C:/projeto', janela: 1 },
    { rotulo: 'C:\u005Cprojeto', janela: 1 }
  ]
  assert.equal(destinosDoAviso(assinaturas).length, 2)
  assert.deepEqual(destinosDoAviso([]), [])
})
