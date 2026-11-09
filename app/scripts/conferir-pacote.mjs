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
import { existsSync } from 'node:fs'
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
