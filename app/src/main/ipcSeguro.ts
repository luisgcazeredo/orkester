/**
 * Guarda central do IPC do app (1.9.5). Todo canal do `ipcMain` (terminal, dados, git, área de transferência…)
 * passa a conferir **quem chama**: só o renderer de uma janela do app (`getType() === 'window'`). Portal e página "+"
 * são `webview`: um renderer deles comprometido não chama `terminal:escrever` (= rodar comando no PC).
 *
 * Instalada uma vez, antes do primeiro `registrar*`, ela embrulha `handle`/`handleOnce`/`on`/`once`/`prepend*` da instância
 * `ipcMain` — handlers futuros entram protegidos sem lembrar de nada. Os canais `pagina:*` não passam por aqui: moram
 * no `guest.ipc` de cada página (main/paginas.ts), que é outra instância.
 *
 * Sem import do Electron em tempo de execução: a prova (ipcSeguro.prova.mts) roda no Node com um ipc de mentira.
 */
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

type Remetente = { sender?: { getType?: () => string; id?: number } | null } | null | undefined

/**
 * webContents do tipo `'window'` que NÃO são janela do app: a janela escondida do nó Código dos fluxos
 * (main/fluxos/codigo.ts). Ela já nasce sem preload (não alcança o `ipcRenderer`); esta é a segunda trava.
 */
const recusados = new Set<number>()

/** Nenhum canal do `ipcMain` atende este webContents (até `liberarRemetente`, quando ele for destruído). */
export function recusarRemetente(webContentsId: number): void {
  recusados.add(webContentsId)
}

export function liberarRemetente(webContentsId: number): void {
  recusados.delete(webContentsId)
}

/** O remetente é uma janela do app? Remetente sem `getType`, que falha, de outro tipo ou recusado: não. */
export function remetenteDaJanela(evento: Remetente): boolean {
  try {
    const sender = evento?.sender
    if (sender?.getType?.() !== 'window') return false
    return !(typeof sender.id === 'number' && recusados.has(sender.id))
  } catch {
    return false
  }
}

type Ouvinte = (evento: IpcMainEvent, ...args: unknown[]) => void
type Atendente = (evento: IpcMainInvokeEvent, ...args: unknown[]) => unknown

/** O pedaço do `ipcMain` que a guarda embrulha (a prova passa um objeto com estes métodos). */
export type IpcEmbrulhavel = Pick<IpcMain, 'handle' | 'handleOnce' | 'on' | 'once' | 'addListener' | 'removeListener' | 'off'>

const instalados = new WeakSet<object>()

/**
 * Embrulha os métodos da instância. `removeListener`/`off` acham o embrulho do ouvinte original (quem tirar um
 * ouvinte continua tirando). `avisar` recebe cada recusa uma vez por canal e tipo de remetente (sem inundar o log).
 */
export function instalarIpcSeguro(ipc: IpcEmbrulhavel, avisar: (texto: string) => void = (t) => console.warn(t)): void {
  if (instalados.has(ipc)) return
  instalados.add(ipc)
  const avisados = new Set<string>()
  const recusar = (canal: string, evento: Remetente): void => {
    let tipo = 'desconhecido'
    try {
      tipo = evento?.sender?.getType?.() ?? 'desconhecido'
    } catch {
      // fica "desconhecido"
    }
    const chave = `${canal}|${tipo}`
    if (avisados.has(chave)) return
    avisados.add(chave)
    avisar(`[ipcSeguro] recusado: canal "${canal}" chamado por um remetente "${tipo}" (só janela do app fala com o app)`)
  }

  const handle = ipc.handle.bind(ipc)
  const handleOnce = ipc.handleOnce.bind(ipc)
  const on = ipc.on.bind(ipc)
  const once = ipc.once.bind(ipc)
  const removeListener = ipc.removeListener.bind(ipc)
  const embrulhos = new WeakMap<Ouvinte, Ouvinte>()

  const guardarAtendente = (canal: string, fn: Atendente): Atendente =>
    function (this: unknown, evento, ...args) {
      if (!remetenteDaJanela(evento)) {
        recusar(canal, evento)
        throw new Error('canal recusado')
      }
      return fn.call(this, evento, ...args)
    }
  const guardarOuvinte = (canal: string, fn: Ouvinte): Ouvinte => {
    const existente = embrulhos.get(fn)
    if (existente) return existente
    const embrulho: Ouvinte = function (this: unknown, evento, ...args) {
      if (!remetenteDaJanela(evento)) return recusar(canal, evento)
      fn.call(this, evento, ...args)
    }
    embrulhos.set(fn, embrulho)
    return embrulho
  }

  const alvo = ipc as unknown as Record<string, unknown>
  alvo.handle = (canal: string, fn: Atendente) => handle(canal, guardarAtendente(canal, fn))
  alvo.handleOnce = (canal: string, fn: Atendente) => handleOnce(canal, guardarAtendente(canal, fn))
  alvo.on = (canal: string, fn: Ouvinte) => on(canal, guardarOuvinte(canal, fn))
  alvo.addListener = alvo.on
  alvo.once = (canal: string, fn: Ouvinte) => once(canal, guardarOuvinte(canal, fn))
  alvo.removeListener = (canal: string, fn: Ouvinte) => removeListener(canal, embrulhos.get(fn) ?? fn)
  alvo.off = alvo.removeListener
  // o EventEmitter também põe ouvinte pela frente: embrulhado igual, para nenhum caminho de registro ficar de fora
  for (const nome of ['prependListener', 'prependOnceListener'] as const) {
    const original = alvo[nome]
    if (typeof original !== 'function') continue
    const ligado = (original as (canal: string, fn: Ouvinte) => unknown).bind(ipc)
    alvo[nome] = (canal: string, fn: Ouvinte) => ligado(canal, guardarOuvinte(canal, fn))
  }
}
