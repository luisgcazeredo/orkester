// MCP de fora (1.9.7, C2): a instância do app. Os fluxos (C3a, nó `fora.mcp`) e as páginas (C5a, permissão `mcp`)
// importam `registroMcpFora` daqui; o main/index.ts registra os canais da janela e mata as árvores na saída.
//
// O cofre entra por função: `main/fluxos/index.ts` cria o cofre e (no C3a) importa este arquivo, e assim nenhum dos
// dois usa o outro antes de os dois módulos terminarem de carregar.
import { BrowserWindow, dialog } from 'electron'
import { gravarJsonAtomico, PASTA_DADOS } from '../dados'
import { cofreDeCredenciais } from '../fluxos'
import { criarImportador } from './importar'
import { criarRegistroMcpFora } from './registro'

export const registroMcpFora = criarRegistroMcpFora({
  pasta: PASTA_DADOS,
  cofre: () => cofreDeCredenciais,
  gravarJsonAtomico
})

export const importadorMcpFora = criarImportador({
  registro: registroMcpFora,
  cofre: () => cofreDeCredenciais,
  escolherArquivo: async () => {
    const janela = BrowserWindow.getFocusedWindow()
    const opcoes: Electron.OpenDialogOptions = {
      title: 'Importar servidores MCP (.mcp.json)',
      properties: ['openFile'],
      filters: [{ name: 'Configuração MCP', extensions: ['json'] }]
    }
    const r = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes)
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  }
})
