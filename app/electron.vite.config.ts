import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// A versão vai para dentro do bundle: o título da janela a mostra, para o usuário saber se a atualização
// pegou sem precisar abrir nada. Vem do package.json, que é a fonte única — digitar duas vezes é divergir.
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    define: { __VERSAO__: JSON.stringify(version) },
    build: {
      rolldownOptions: {
        // cli.js: o comando `ork` que os agentes rodam nos terminais do app (fala com o app pelo pipe)
        // mcp.js: o servidor MCP que um cliente de fora sobe para mexer no quadro, com uma chave de usuário
        input: { index: resolve('src/main/index.ts'), cli: resolve('src/cli/ork.ts'), mcp: resolve('src/mcp/orkester.ts') }
      }
    }
  },
  preload: {
    build: {
      rolldownOptions: {
        // index.js: o preload da janela (window.ork) · pagina.js: o das páginas "+" (window.orkPagina), posto pelo main
        input: { index: resolve('src/preload/index.ts'), pagina: resolve('src/preload/pagina.ts') }
      }
    }
  },
  renderer: {
    define: { __VERSAO__: JSON.stringify(version) },
    plugins: [react()],
    // o guia das páginas próprias (`docs/paginas.pt-BR.md?raw`, PainelMais) mora fora de app/: o servidor de dev recusa (403) o que
    // está fora da lista. Ao trocar a lista os padrões somem, então vão junto: app/ (inclui node_modules) e só a pasta docs.
    server: { fs: { allow: [resolve('.'), resolve('../docs')] } }
  }
})
