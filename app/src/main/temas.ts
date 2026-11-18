// Temas do usuário e plugins de CSS (1.9.3): o arquivo `temas.json` na pasta de dados e os canais da página Temas.
// A decisão do que vale está em shared/temasUsuario.ts e shared/cssPlugin.ts; aqui só disco, diálogo e aviso.
// O arquivo é lido como não confiável (alguém pode tê-lo editado à mão): passa pela validação a cada leitura.
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { CANAIS_TEMAS } from '../shared/api'
import { TAMANHO_MAXIMO_DO_CSS } from '../shared/cssPlugin'
import { aplicarOperacao, lerArquivoDeTemas, type ArquivoDeTemas, type ResultadoDeTemas } from '../shared/temasUsuario'
import { PASTA_DADOS } from './dados'
import { avisarTodas } from './janelas'

const arquivo = (): string => join(PASTA_DADOS, 'temas.json')

function ler(): ArquivoDeTemas {
  try {
    return lerArquivoDeTemas(JSON.parse(readFileSync(arquivo(), 'utf8')))
  } catch {
    // sem arquivo (primeira vez) ou ilegível: começa vazio; o arquivo ruim só é trocado na próxima gravação,
    // que antes guarda uma cópia dele em `temas.json.ruim`
    return lerArquivoDeTemas(null)
  }
}

/** O arquivo no disco não é JSON (mexido à mão e quebrado): guarda uma cópia `.ruim` antes de a gravação o trocar. */
function guardarSeQuebrado(destino: string): void {
  let texto: string
  try {
    texto = readFileSync(destino, 'utf8')
  } catch {
    return // não existe: nada a guardar
  }
  try {
    JSON.parse(texto)
  } catch {
    copyFileSync(destino, `${destino}.ruim`)
  }
}

/** Grava num temporário e troca de nome: um desligamento no meio não corrompe o arquivo. */
function gravar(conteudo: ArquivoDeTemas): void {
  const destino = arquivo()
  const temporario = `${destino}.${process.pid}.tmp`
  guardarSeQuebrado(destino)
  try {
    writeFileSync(temporario, JSON.stringify(conteudo, null, 2), 'utf8')
    renameSync(temporario, destino)
  } catch (e) {
    rmSync(temporario, { force: true }) // o temporário não fica para trás
    throw e
  }
}

async function escolherCss(evento: Electron.IpcMainInvokeEvent): Promise<{ nome: string; texto: string } | { erro: string } | null> {
  const janela = BrowserWindow.fromWebContents(evento.sender)
  const r = await dialog.showOpenDialog(janela!, { properties: ['openFile'], filters: [{ name: 'CSS', extensions: ['css'] }] })
  if (r.canceled || !r.filePaths[0]) return null
  const caminho = r.filePaths[0]
  try {
    if (statSync(caminho).size > TAMANHO_MAXIMO_DO_CSS) return { erro: `arquivo grande demais (mais de ${TAMANHO_MAXIMO_DO_CSS / 1024} KB)` }
    return { nome: basename(caminho, extname(caminho)).slice(0, 60), texto: readFileSync(caminho, 'utf8') }
  } catch (e) {
    return { erro: `não consegui ler o arquivo: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function registrarTemas(): void {
  ipcMain.handle(CANAIS_TEMAS.ler, (): ArquivoDeTemas => ler())
  // lê, aplica e grava de uma vez (síncrono): duas janelas não se atropelam
  ipcMain.handle(CANAIS_TEMAS.aplicar, (evento, operacao: unknown): ResultadoDeTemas => {
    const r = aplicarOperacao(ler(), operacao, randomUUID)
    if (!r.ok) return r
    try {
      gravar(r.arquivo)
    } catch (e) {
      return { ok: false, erro: `não consegui gravar: ${e instanceof Error ? e.message : String(e)}` }
    }
    avisarTodas({ tipo: 'temas' }, evento.sender)
    return r
  })
  ipcMain.handle(CANAIS_TEMAS.escolherCss, (evento) => escolherCss(evento))
}
