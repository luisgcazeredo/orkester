// Antes do electron-builder: apaga release/win-unpacked e release/win-unpacked.tmp.
// Se o Orkester instalado estiver aberto e segurando um arquivo do pacote, o erro cru do electron-builder
// (EBUSY no meio do build) vira uma mensagem clara.
// Uso: node scripts/limpar-pacote.mjs [pasta-release]   (a pasta é só para teste; o padrão é ../release)
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const release = process.argv[2] ? resolve(process.argv[2]) : join(import.meta.dirname, '..', 'release')

for (const nome of ['win-unpacked', 'win-unpacked.tmp']) {
  try {
    rmSync(join(release, nome), { recursive: true, force: true, maxRetries: 3, retryDelay: 300 })
  } catch (erro) {
    if (erro?.code === 'EBUSY' || erro?.code === 'EPERM') {
      console.error('feche o Orkester: um arquivo do pacote está em uso')
      console.error(`(${erro.code}: ${erro.path ?? join(release, nome)})`)
      process.exit(1)
    }
    throw erro
  }
}
