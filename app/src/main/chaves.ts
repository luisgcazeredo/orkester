// O cofre das chaves de usuário, em disco. A decisão do que é uma chave válida está em shared/chaves.ts;
// aqui só o que precisa do sistema: sortear, calcular a impressão digital, ler e gravar o arquivo.
//
// O arquivo guarda **impressão digital, nunca o segredo**: perder o arquivo não entrega acesso a ninguém,
// e nem o app consegue mostrar uma chave de novo depois de criada. Quem perder a sua gera outra e revoga a
// velha — que é como funciona em qualquer lugar que leve chave a sério.
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CANAIS_CHAVES } from '../shared/api'
import { listaEmMarkdown } from '../shared/ferramentasMcp'
import {
  COFRE_VAZIO,
  chavePorSegredo,
  cofreValido,
  criarChave,
  marcarUso,
  paraMostrar,
  revogarChave,
  type ChaveGuardada,
  type CofreDeChaves
} from '../shared/chaves'
import { PASTA_DADOS } from './dados'

const arquivo = (): string => join(PASTA_DADOS, 'chaves.json')

const impressaoDe = (segredo: string): string => createHash('sha256').update(segredo).digest('hex')

function ler(): CofreDeChaves {
  try {
    if (!existsSync(arquivo())) return COFRE_VAZIO
    const lido: unknown = JSON.parse(readFileSync(arquivo(), 'utf8'))
    return cofreValido(lido) ? lido : COFRE_VAZIO
  } catch {
    // arquivo ilegível não derruba o app nem apaga nada: o cofre só aparece vazio até alguém olhar
    return COFRE_VAZIO
  }
}

function gravar(cofre: CofreDeChaves): void {
  writeFileSync(arquivo(), JSON.stringify(cofre, null, 2))
}

const ambiente = {
  sortear: () => randomBytes(32).toString('hex'),
  impressaoDe,
  novoId: () => randomUUID(),
  agora: () => new Date().toISOString()
}

/** Cria e grava. O segredo volta aqui **uma única vez**: depois disto nem o app o conhece. */
export function criar(nome: string): { segredo: string; nome: string } | { erro: string } {
  const feito = criarChave(ler(), typeof nome === 'string' ? nome : '', ambiente)
  if ('erro' in feito) return feito
  gravar(feito.cofre)
  return { segredo: feito.segredo, nome: feito.chave.nome }
}

export function listar(): Array<Omit<ChaveGuardada, 'impressao'>> {
  return paraMostrar(ler())
}

export function revogar(id: string): void {
  gravar(revogarChave(ler(), String(id), new Date().toISOString()))
}

/**
 * Quem está falando, se for uma chave válida. Marca o uso de passagem: é o que faz a tela conseguir dizer
 * "esta chave não é usada desde outubro" na hora de decidir o que revogar.
 */
export function usuarioPorChave(segredo: unknown): ChaveGuardada | undefined {
  const cofre = ler()
  const chave = chavePorSegredo(cofre, segredo, impressaoDe)
  if (!chave) return undefined
  try {
    gravar(marcarUso(cofre, chave.id, new Date().toISOString()))
  } catch {
    // não conseguir anotar o uso não pode impedir o trabalho
  }
  return chave
}

/** O diálogo de salvar do sistema; o texto é gerado aqui, do registro, e a tela não manda conteúdo nenhum. */
async function salvarListaDeFerramentas(evento: Electron.IpcMainInvokeEvent): Promise<{ caminho: string } | { erro: string } | null> {
  const janela = BrowserWindow.fromWebContents(evento.sender)
  const opcoes = {
    title: 'Salvar a lista de ferramentas do MCP',
    defaultPath: join(app.getPath('documents'), 'ferramentas-mcp-orkester.md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  }
  const r = await (janela ? dialog.showSaveDialog(janela, opcoes) : dialog.showSaveDialog(opcoes))
  if (r.canceled || !r.filePath) return null
  try {
    writeFileSync(r.filePath, listaEmMarkdown(), 'utf8')
    return { caminho: r.filePath }
  } catch (e) {
    return { erro: `não consegui gravar: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function registrarChaves(): void {
  ipcMain.handle(CANAIS_CHAVES.salvarLista, (evento) => salvarListaDeFerramentas(evento))
  ipcMain.handle(CANAIS_CHAVES.listar, () => listar())
  ipcMain.handle(CANAIS_CHAVES.criar, (_e, nome: string) => criar(nome))
  ipcMain.handle(CANAIS_CHAVES.revogar, (_e, id: string) => revogar(id))
}
