// Confere o pacote recém-gerado em release/win-unpacked antes de ele virar instalador.
//
// Existe por causa de um defeito que escapou para a 1.0.0: o `ork` dos agentes é um arquivo fora do .asar
// (os agentes rodam o Node do Electron, que não lê de dentro do pacote), mas o bundler separa o que o
// `cli.js` tem em comum com o processo principal num `chunks/`, e só o `cli.js` estava sendo desempacotado.
// No app instalado, todo `ork` morria com "Cannot find module './chunks/...'". O autoteste não pega isto:
// ele roda o app compilado, não o app empacotado.
//
// A conferência é a mais simples possível: roda o `ork` do pacote com o Node e exige que ele chegue a
// reclamar do que deve reclamar — que não está dentro do app. Um erro de módulo faltando reprova.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const app = join(import.meta.dirname, '..')
const pacote = join(app, 'release', 'win-unpacked', 'resources', 'app.asar.unpacked')
const cli = join(pacote, 'out', 'main', 'cli.js')

if (!existsSync(cli)) {
  console.error(`conferir-pacote: não achei o ork desempacotado em ${cli}`)
  process.exit(1)
}

// sem ORK_PIPE o ork tem de recusar por estar fora do app; o que não pode é falhar em carregar
const r = spawnSync(process.execPath, [cli, 'quem'], {
  encoding: 'utf8',
  env: { ...process.env, ORK_PIPE: '' }
})
const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`

if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(saida)) {
  console.error('conferir-pacote: o ork do pacote não carrega — falta arquivo fora do .asar.')
  console.error(saida.trim())
  console.error('Conserto: acrescente o que falta em build.asarUnpack no package.json.')
  process.exit(1)
}

if (r.status === null) {
  console.error('conferir-pacote: o ork do pacote não chegou a rodar.')
  console.error(saida.trim())
  process.exit(1)
}

console.log('conferir-pacote: o ork do pacote carrega e responde.')

// ---------- o servidor MCP (1.3) ----------
//
// Mesma classe de defeito, mesmo portão. O `mcp.js` é copiado do lado do `cli.js` para a pasta de dados, e
// a configuração que o usuário cola no cliente aponta para essa cópia. Se ele ficar preso dentro do .asar,
// a cópia nunca acontece e a configuração aponta para um arquivo que não existe — e o autoteste passa,
// porque roda o build, não o pacote. Aqui: ele tem de existir fora do .asar, carregar no Node puro (como o
// cliente o roda) e responder ao aperto de mão do protocolo MCP.
const mcp = join(pacote, 'out', 'main', 'mcp.js')
if (!existsSync(mcp)) {
  console.error(`conferir-pacote: não achei o servidor MCP desempacotado em ${mcp}`)
  console.error('Conserto: "out/main/mcp.js" em build.asarUnpack no package.json.')
  process.exit(1)
}
const aperto = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'conferir-pacote', version: '0' } }
})
const m = spawnSync(process.execPath, [mcp], { encoding: 'utf8', input: `${aperto}\n`, timeout: 15_000, env: { ...process.env, ORK_CHAVE: '' } })
const saidaMcp = `${m.stdout ?? ''}${m.stderr ?? ''}`
if (/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/.test(saidaMcp)) {
  console.error('conferir-pacote: o servidor MCP do pacote não carrega — falta arquivo fora do .asar.')
  console.error(saidaMcp.trim())
  process.exit(1)
}
const respostaMcp = (m.stdout ?? '')
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  })
  .find((x) => x?.id === 1)
if (respostaMcp?.result?.serverInfo?.name !== 'orkester') {
  console.error('conferir-pacote: o servidor MCP do pacote não respondeu ao aperto de mão.')
  console.error(saidaMcp.trim().slice(0, 600))
  process.exit(1)
}
// e diz a versão do app, que vem do package.json no build (na 1.3.0 ela estava digitada no código)
const { version } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
if (respostaMcp.result.serverInfo.version !== version) {
  console.error(`conferir-pacote: o servidor MCP diz versão ${respostaMcp.result.serverInfo.version}, e o app é ${version}.`)
  process.exit(1)
}
console.log(`conferir-pacote: o servidor MCP do pacote carrega e responde ao aperto de mão (versão ${version}).`)
