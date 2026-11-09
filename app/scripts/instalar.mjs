// Instala (ou atualiza) o Orkester neste PC a partir do instalador gerado em release/.
// Rodar com `npm run instalar` (gera o instalador antes). Os dados em ~/.orkester não são tocados.
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const app = join(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
const instalador = join(app, 'release', `Orkester-Instalador-${version}.exe`)
if (!readdirSync(join(app, 'release')).includes(`Orkester-Instalador-${version}.exe`)) {
  console.error(`Instalador não encontrado: ${instalador}`)
  process.exit(1)
}

// com o app aberto a atualização falha; fechar à força perderia o que não foi salvo, então só avisa
const aberto = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Orkester.exe', '/NH'], { encoding: 'utf8' })
if (aberto.includes('Orkester.exe')) {
  console.error('O Orkester está aberto. Feche o app e rode de novo.')
  process.exit(1)
}

console.log(`Instalando ${instalador} ...`)
const r = spawnSync(instalador, ['/S'], { stdio: 'inherit' })
if (r.status !== 0) {
  console.error(`O instalador terminou com código ${r.status}`)
  process.exit(r.status ?? 1)
}
console.log('Instalado. Abra pelo atalho "Orkester" na área de trabalho ou no menu Iniciar.')

// Fica só o instalador desta versão: é ele que sobe para o release, e os antigos não servem para nada
// (cada um tem ~150 MB, e em poucas semanas a pasta passou de 4 GB).
const atuais = [`Orkester-Instalador-${version}.exe`, `Orkester-Instalador-${version}.exe.blockmap`]
let apagados = 0
let bytes = 0
for (const nome of readdirSync(join(app, 'release'))) {
  if (!/^Orkester-Instalador-.*\.exe(\.blockmap)?$/.test(nome) || atuais.includes(nome)) continue
  const caminho = join(app, 'release', nome)
  try {
    bytes += statSync(caminho).size
    rmSync(caminho, { force: true })
    apagados++
  } catch {
    // em uso por outro programa: fica para a próxima
  }
}
if (apagados) console.log(`${apagados} instalador(es) antigo(s) apagado(s), ${Math.round(bytes / 1024 / 1024)} MB livres.`)
