import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// A versão vai para dentro do bundle: o título da janela a mostra, para o usuário saber se a atualização
// pegou sem precisar abrir nada. Vem do package.json, que é a fonte única — digitar duas vezes é divergir.
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        // cli.js: o comando `ork` que os agentes rodam nos terminais do app (fala com o app pelo pipe)
        input: { index: resolve('src/main/index.ts'), cli: resolve('src/cli/ork.ts') }
      }
    }
  },
  preload: {},
  renderer: {
    define: { __VERSAO__: JSON.stringify(version) },
    plugins: [react()]
  }
})
