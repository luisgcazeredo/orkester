import { BrowserWindow, app, nativeImage } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pastaDoCorreio } from '../correio'
import { ehRecado } from '../../shared/correio'
import { sessaoPorId, telaDe } from '../terminais'
import { JANELA_BASE, compararBitmaps, relatarComparacao } from './comparar'

type ModoBase = 'gravar' | 'comparar' | null
const modoBase = (): ModoBase => {
  const m = (process.env.ORK_BASE ?? '').trim()
  if (m === '') return null
  if (m === 'gravar' || m === 'comparar') return m
  throw new Error(`ORK_BASE=${m} não existe: use gravar ou comparar`)
}
// Escala 1 só vale se for pedida antes de a janela nascer: este módulo é importado (index.ts) antes do `ready`.
// Num monitor a 125% a janela de 1280×800 sairia 1600×1000 em pixels reais; com isto sai 1280×800.
if (process.env.ORK_BASE?.trim() && process.argv.includes('--autoteste')) app.commandLine.appendSwitch('force-device-scale-factor', '1')

/** Base de capturas: .contexto/base-telas na raiz do projeto (fora do git), ou ORK_BASE_PASTA. */
const pastaDaBase = (): string => process.env.ORK_BASE_PASTA || join(app.getAppPath(), '..', '.contexto', 'base-telas')

/** Recados que sobraram na pasta do correio. Zero é o esperado: quem lê apaga. */
export function recadosNoCorreio(): number {
  try {
    return readdirSync(pastaDoCorreio()).filter((n) => ehRecado(n)).length
  } catch {
    return 0
  }
}

export type Resultado = [nome: string, ok: boolean, detalhe: string]

export function criarDriver(janela: BrowserWindow, pastaSaida: string) {
  const tela = janela.webContents
  const resultados: Resultado[] = []
  const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const js = <T>(codigo: string): Promise<T> => tela.executeJavaScript(codigo)
  const conferir = (nome: string, ok: boolean, detalhe = ''): void => {
    resultados.push([nome, ok, detalhe])
  }
  const capturar = async (): Promise<Electron.NativeImage> => {
    for (let tentativa = 1; ; tentativa++) {
      await esperar(400 * tentativa)
      try {
        return await tela.capturePage()
      } catch (erro) {
        if (tentativa === 4) throw erro
      }
    }
  }
  // ORK_BASE=gravar guarda a captura como base; ORK_BASE=comparar a confronta com ela. O nome do print
  // é o nome do arquivo da base: quem chama põe cenário e tema nele (ex.: 'casca-pagina-teste').
  const nomesDaRodada = new Set<string>()
  const printBase = async (modo: 'gravar' | 'comparar', nome: string, img: Electron.NativeImage): Promise<void> => {
    const pasta = pastaDaBase()
    const arquivo = join(pasta, `${nome}.png`)
    const indice = join(pasta, 'base.json')
    // dois prints com o mesmo nome se sobrescreveriam em silêncio (gravar) ou confrontariam a mesma base duas vezes
    if (nomesDaRodada.has(nome)) {
      conferir(`base: ${nome}`, false, 'nome de print repetido nesta rodada: ponha cenário e tema no nome')
      return
    }
    nomesDaRodada.add(nome)
    const escala = await js<number>('window.devicePixelRatio')
    if (escala !== 1) throw new Error(`base de telas pede escala 1; a janela está em ${escala} (o force-device-scale-factor não pegou)`)
    const { width, height } = img.getSize()
    if (width !== JANELA_BASE.largura || height !== JANELA_BASE.altura) {
      throw new Error(`base de telas pede janela ${JANELA_BASE.largura}x${JANELA_BASE.altura} em escala 1; a captura veio ${width}x${height}`)
    }
    if (modo === 'gravar') {
      mkdirSync(pasta, { recursive: true })
      writeFileSync(arquivo, img.toPNG())
      let base: { versao?: string; janela?: unknown; escala?: number; telas?: Record<string, { largura: number; altura: number }> } = {}
      try {
        base = JSON.parse(readFileSync(indice, 'utf8'))
      } catch {
        // primeira gravação
      }
      base.versao = app.getVersion()
      base.janela = { largura: JANELA_BASE.largura, altura: JANELA_BASE.altura }
      base.escala = escala
      base.telas = { ...(base.telas ?? {}), [nome]: { largura: width, altura: height } }
      writeFileSync(indice, JSON.stringify(base, null, 2) + '\n')
      conferir(`base gravada: ${nome}`, true, arquivo)
      return
    }
    if (!existsSync(arquivo)) {
      conferir(`base: ${nome}`, false, `sem base em ${arquivo} (rode antes com ORK_BASE=gravar)`)
      return
    }
    const velha = nativeImage.createFromBuffer(readFileSync(arquivo))
    const tamanho = velha.getSize()
    if (tamanho.width !== width || tamanho.height !== height) {
      conferir(`base: ${nome}`, false, `tamanho ${width}x${height} contra a base ${tamanho.width}x${tamanho.height}`)
      return
    }
    const c = compararBitmaps(
      { largura: width, altura: height, dados: velha.toBitmap() },
      { largura: width, altura: height, dados: img.toBitmap() }
    )
    const { ok, gravarDiferenca, detalhe: texto } = relatarComparacao(c)
    let detalhe = texto
    if (gravarDiferenca) {
      const saida = join(pastaSaida, `diferenca-${nome}.png`)
      writeFileSync(saida, nativeImage.createFromBitmap(Buffer.from(c.diferenca), { width, height }).toPNG())
      detalhe += ` — diferença em ${saida}`
    }
    conferir(`base: ${nome}`, ok, detalhe)
  }
  const print = async (nome: string): Promise<void> => {
    const modo = modoBase()
    if (modo) {
      // janela fixa só nos modos de base; sem ORK_BASE o print continua do tamanho que a janela tem
      const [l, a] = janela.getContentSize()
      if (janela.isMaximized() || janela.isFullScreen() || l !== JANELA_BASE.largura || a !== JANELA_BASE.altura) {
        if (janela.isFullScreen()) janela.setFullScreen(false)
        if (janela.isMaximized()) janela.unmaximize()
        // em tela com escala de 125% o Windows arredonda o tamanho da janela e sobram uns pixels: ajusta pela sobra
        let pedido: number[] = [JANELA_BASE.largura, JANELA_BASE.altura]
        for (let i = 0; i < 4; i++) {
          janela.setContentSize(pedido[0], pedido[1])
          await esperar(400)
          const [cl, ca] = janela.getContentSize()
          if (cl === JANELA_BASE.largura && ca === JANELA_BASE.altura) break
          pedido = [pedido[0] - (cl - JANELA_BASE.largura), pedido[1] - (ca - JANELA_BASE.altura)]
        }
      }
    }
    const img = await capturar()
    writeFileSync(join(pastaSaida, `autoteste-${nome}.png`), img.toPNG())
    if (modo) await printBase(modo, nome, img)
  }
  const aguardarCarga = async (): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      if (await js<boolean>('!!(window.__teste && window.__teste.loja.lerEstado().carregado)')) return
      await esperar(100)
    }
    throw new Error('o app não terminou de carregar')
  }
  const centroDe = (seletor: string): Promise<{ x: number; y: number } | null> =>
    js(`(() => { const r = document.querySelector(${JSON.stringify(seletor)})?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })()`)
  // Um arrasto de gente leva uns 300 ms e dezenas de eventos. Com 8 passos de 16 ms, a máquina ocupada
  // engolia os últimos e o cartão andava um pedaço só — foi assim que esta checagem caiu na rodada com
  // agentes de verdade. Mais passos, mais tempo entre eles, e uma pausa antes de soltar o botão: o
  // renderer precisa ter processado o último movimento antes do mouseUp, senão o arrasto termina onde parou.
  const arrastar = async (de: { x: number; y: number }, ate: { x: number; y: number }, teclas: ('shift' | 'control' | 'alt')[] = []): Promise<void> => {
    tela.sendInputEvent({ type: 'mouseMove', x: de.x, y: de.y, modifiers: teclas })
    tela.sendInputEvent({ type: 'mouseDown', x: de.x, y: de.y, button: 'left', clickCount: 1, modifiers: teclas })
    const passos = 12
    for (let i = 1; i <= passos; i++) {
      const x = Math.round(de.x + ((ate.x - de.x) * i) / passos)
      const y = Math.round(de.y + ((ate.y - de.y) * i) / passos)
      tela.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: [...teclas, 'leftbuttondown'] })
      await esperar(25)
    }
    await esperar(90)
    tela.sendInputEvent({ type: 'mouseUp', x: ate.x, y: ate.y, button: 'left', clickCount: 1, modifiers: teclas })
    await esperar(250)
  }
  const tecla = async (letra: string): Promise<void> => {
    tela.sendInputEvent({ type: 'keyDown', keyCode: letra, modifiers: ['control'] })
    tela.sendInputEvent({ type: 'keyUp', keyCode: letra, modifiers: ['control'] })
    await esperar(150)
  }
  const teclar = async (tecla: string): Promise<void> => {
    tela.sendInputEvent({ type: 'keyDown', keyCode: tecla })
    tela.sendInputEvent({ type: 'keyUp', keyCode: tecla })
    await esperar(120)
  }
  const digitar = async (texto: string): Promise<void> => {
    for (const letra of texto) tela.sendInputEvent({ type: 'char', keyCode: letra })
    await esperar(200)
  }
  const clicar = async (p: { x: number; y: number }): Promise<void> => {
    tela.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
    tela.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    tela.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    await esperar(250)
  }
  const clicarEm = async (seletor: string): Promise<boolean> => {
    const c = await centroDe(seletor)
    if (c) await clicar(c)
    return !!c
  }
  const telaNoApp = async (id: string): Promise<string> => {
    const s = sessaoPorId(id)
    return s ? telaDe(s, 300) : ''
  }
  const telaNoCartao = (id: string): Promise<string> =>
    js<string>(`(() => { const t = window.__terminais?.[${JSON.stringify(id)}]; if (!t) return ''
      const b = t.buffer.active; const linhas = []
      for (let y = 0; y < b.length; y++) linhas.push(b.getLine(y)?.translateToString(true) ?? '')
      return linhas.join('\\n') })()`)
  const aguardar = async (ler: () => Promise<string>, procurado: string | RegExp, ms = 20_000): Promise<string> => {
    let texto = ''
    for (const limite = Date.now() + ms; Date.now() < limite; await esperar(200)) {
      texto = await ler()
      if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
    }
    return texto
  }
  const comando = async (id: string, linha: string): Promise<void> => {
    const longe = await js<boolean | 'sumiu'>(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: ${JSON.stringify(id)} })
      if (document.querySelector('[data-no-id="${id}"] .terminal-xterm')) return false
      const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
      if (!n) return 'sumiu'
      L.definirCamera({ x: -n.x + 40, y: -n.y + 40, zoom: 1 }); return true })()`)
    if (longe === 'sumiu') throw new Error(`o cartão ${id} não está no plano à mostra: não dá para digitar nele`)
    await esperar(longe ? 900 : 250)
    await digitar(linha)
    await teclar('Return')
  }
  const comandoAte = async (id: string, linha: string, procurado: string | RegExp, ms = 8_000): Promise<string> => {
    let texto = ''
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      await comando(id, linha)
      texto = await aguardar(() => telaNoApp(id), procurado, ms)
      if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
    }
    return texto
  }
  const ultimas = (texto: string, n = 2): string => texto.split('\n').filter((l) => l.trim()).slice(-n).join(' | ')
  return { janela, tela, resultados, esperar, js, conferir, print, aguardarCarga, centroDe, arrastar, tecla, teclar, digitar, clicar, clicarEm, telaNoApp, telaNoCartao, aguardar, comando, comandoAte, ultimas }
}

export type Driver = ReturnType<typeof criarDriver>
export type Cenario = { nome: string; depende?: string; rodar: (driver: Driver) => Promise<void> }

/** O que os cenários dividem entre si: o que um grava (o chefe, o cartão solto…) o seguinte lê. */
export type Estado = {
  janela: BrowserWindow
  pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>
  pastaSaida: string
  pastaTerminais: string
  espacoTerminais: string
  presetShell: string
  chefe: string
  ajudante: { id: string; criadoPor: string; corda: boolean } | null
  solto: string
  frente2: BrowserWindow | undefined
}
