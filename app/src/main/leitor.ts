// O que o Leitor de Markdown pede ao sistema: listar os .md de uma raiz, ler um, resolver um link relativo,
// vigiar o arquivo aberto e abrir um endereço no navegador. SÓ LEITURA: nada aqui grava no disco.
//
// O renderer não é de confiança (o texto do arquivo manda no `data-md`): toda chamada manda a raiz junto, a raiz
// precisa ser uma das raízes de leitura do quadro (pasta do espaço, andares, cartões, pastas fixadas) e o arquivo
// precisa estar dentro dela pelo caminho REAL, checado antes de qualquer leitura.
import { ipcMain, shell } from 'electron'
import { closeSync, openSync, readSync, realpathSync, statSync, watch, type FSWatcher } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { CANAIS_LEITOR, type ArvoreMd, type TextoMd } from '../shared/api'
import { raizesDoQuadro } from './dados'
import { alvoDoLink, ehMarkdown, enderecoExterno, estaEmBaixo, LIMITE_MD } from './leitorCaminhos'

const MAX_ARQUIVOS = 3000
const MAX_PASTAS = 6000
const MAX_PROFUNDIDADE = 10
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'dist', 'out', 'build'])

function real(caminho: string): string | null {
  try {
    return realpathSync.native(caminho)
  } catch {
    return null
  }
}

/** A raiz pedida é uma das raízes de leitura do quadro? Devolve o caminho real dela. */
function raizReal(raiz: unknown): string | null {
  if (typeof raiz !== 'string' || !raiz) return null
  const alvo = real(raiz)
  if (!alvo) return null
  return raizesDoQuadro().some((r) => real(r) === alvo) ? alvo : null
}

/** `caminho` é um .md dentro da raiz pelo caminho real (link simbólico para fora não passa)? Devolve o real. */
function mdDentro(raizRealizada: string, caminho: unknown): string | null {
  if (typeof caminho !== 'string' || !ehMarkdown(caminho)) return null
  const alvo = real(caminho)
  return alvo && ehMarkdown(alvo) && estaEmBaixo(raizRealizada, alvo) ? alvo : null
}

async function arvore(raiz: unknown): Promise<ArvoreMd> {
  const base = raizReal(raiz)
  if (!base) return { arquivos: [], cortado: false, erro: 'pasta não está no quadro' }
  const arquivos: string[] = []
  let pastas = 0
  let cortado = false
  // Largura primeiro: o que está perto da raiz aparece mesmo que a pasta seja enorme.
  let fila: Array<{ caminho: string; fundo: number }> = [{ caminho: base, fundo: 0 }]
  varredura: while (fila.length) {
    const proxima: typeof fila = []
    for (const { caminho, fundo } of fila) {
      if (++pastas > MAX_PASTAS) {
        cortado = true
        break varredura // teto de pastas: para de ler o resto
      }
      let itens
      try {
        itens = await readdir(caminho, { withFileTypes: true })
      } catch {
        continue
      }
      // Dirent não segue link simbólico: link para pasta ou arquivo não aparece (nem sai da raiz por ele).
      for (const item of itens) {
        if (item.isDirectory()) {
          if (item.name.startsWith('.') || PASTAS_IGNORADAS.has(item.name)) continue
          if (fundo >= MAX_PROFUNDIDADE) {
            cortado = true // pasta funda demais: o usuário fica sabendo que há mais
            continue
          }
          proxima.push({ caminho: join(caminho, item.name), fundo: fundo + 1 })
        } else if (item.isFile() && ehMarkdown(item.name)) {
          if (arquivos.length >= MAX_ARQUIVOS) {
            cortado = true
            break varredura // teto de arquivos: nenhuma outra pasta é lida
          }
          arquivos.push(relative(base, join(caminho, item.name)).split(sep).join('/'))
        }
      }
    }
    fila = proxima
  }
  arquivos.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { arquivos, cortado }
}

function lerMd(raiz: unknown, caminho: unknown): TextoMd {
  const vazio = (erro: string, extra: Partial<TextoMd> = {}): TextoMd => ({
    caminho: typeof caminho === 'string' ? caminho : '', conteudo: '', tamanho: 0, grande: false, erro, ...extra
  })
  const base = raizReal(raiz)
  if (!base) return vazio('essa pasta não está no quadro')
  const alvo = mdDentro(base, caminho)
  if (!alvo) return vazio('esse arquivo não é um .md dentro da pasta')
  let descritor: number | null = null
  try {
    const info = statSync(alvo)
    if (!info.isFile()) return vazio('isso não é um arquivo')
    if (info.size > LIMITE_MD) return { caminho: alvo, conteudo: '', tamanho: info.size, grande: true }
    descritor = openSync(alvo, 'r')
    const buffer = Buffer.alloc(info.size)
    const lidos = readSync(descritor, buffer, 0, info.size, 0)
    return { caminho: alvo, conteudo: buffer.subarray(0, lidos).toString('utf8').replace(/^﻿/, ''), tamanho: info.size, grande: false }
  } catch (erro) {
    return vazio(erro instanceof Error ? erro.message : 'não consegui ler')
  } finally {
    if (descritor !== null) closeSync(descritor)
  }
}

/** Link relativo de dentro de um .md: resolve a partir do arquivo aberto, confere a raiz e só então lê. */
function lerLink(raiz: unknown, mdAtual: unknown, valor: unknown): TextoMd {
  const base = raizReal(raiz)
  const atual = base ? mdDentro(base, mdAtual) : null
  const alvo = base && atual ? alvoDoLink(base, atual, valor) : null
  if (!alvo) return { caminho: '', conteudo: '', tamanho: 0, grande: false, erro: 'esse link não aponta para um .md desta pasta' }
  return lerMd(raiz, alvo)
}

// ---- vigia do arquivo aberto: uma por janela, olhando a pasta dele (editor que salva trocando o arquivo
// derruba a vigia do arquivo, a da pasta não) ----

interface Vigia {
  observador: FSWatcher
  relogio: NodeJS.Timeout | null
}
const vigias = new Map<number, Vigia>()
const janelasLigadas = new Set<number>()

function soltar(janela: number): void {
  const v = vigias.get(janela)
  if (!v) return
  v.observador.close()
  if (v.relogio) clearTimeout(v.relogio)
  vigias.delete(janela)
}

function vigiar(sender: Electron.WebContents, raiz: unknown, caminho: unknown): void {
  soltar(sender.id)
  const base = raizReal(raiz)
  const alvo = base ? mdDentro(base, caminho) : null
  if (!alvo) return
  if (!janelasLigadas.has(sender.id)) {
    janelasLigadas.add(sender.id)
    sender.once('destroyed', () => {
      soltar(sender.id)
      janelasLigadas.delete(sender.id)
    })
  }
  const nome = basename(alvo).toLowerCase()
  try {
    const vigia: Vigia = {
      relogio: null,
      observador: watch(dirname(alvo), (_tipo, quem) => {
        if (!quem || String(quem).toLowerCase() !== nome) return
        if (vigia.relogio) return
        vigia.relogio = setTimeout(() => {
          vigia.relogio = null
          if (!sender.isDestroyed()) sender.send(CANAIS_LEITOR.aviso, alvo)
        }, 200)
      })
    }
    vigia.observador.on('error', () => soltar(sender.id))
    vigias.set(sender.id, vigia)
  } catch {
    // pasta que sumiu: o Leitor segue mostrando o que já leu
  }
}

export function registrarLeitor(): void {
  ipcMain.handle(CANAIS_LEITOR.arvore, (_e, raiz: unknown): Promise<ArvoreMd> => arvore(raiz))
  ipcMain.handle(CANAIS_LEITOR.ler, (_e, raiz: unknown, caminho: unknown): TextoMd => lerMd(raiz, caminho))
  ipcMain.handle(CANAIS_LEITOR.lerLink, (_e, raiz: unknown, mdAtual: unknown, valor: unknown): TextoMd => lerLink(raiz, mdAtual, valor))
  ipcMain.on(CANAIS_LEITOR.vigiar, (e, raiz: unknown, caminho: unknown) => vigiar(e.sender, raiz, caminho))
  ipcMain.on(CANAIS_LEITOR.pararDeVigiar, (e) => soltar(e.sender.id))
  // O renderer não manda o que abre: o main revalida o esquema (o `data-externo` veio do texto do arquivo).
  ipcMain.handle(CANAIS_LEITOR.externo, async (_e, endereco: unknown): Promise<boolean> => {
    const url = enderecoExterno(endereco)
    if (!url) return false
    await shell.openExternal(url)
    return true
  })
}
