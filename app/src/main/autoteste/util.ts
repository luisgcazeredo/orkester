import { BrowserWindow } from 'electron'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pastaDoCorreio } from '../correio'
import { ehRecado } from '../../shared/correio'
import { sessaoPorId, telaDe } from '../terminais'

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
  const print = async (nome: string): Promise<void> => {
    for (let tentativa = 1; ; tentativa++) {
      await esperar(400 * tentativa)
      try {
        writeFileSync(join(pastaSaida, `autoteste-${nome}.png`), (await tela.capturePage()).toPNG())
        return
      } catch (erro) {
        if (tentativa === 4) throw erro
      }
    }
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
  const arrastar = async (de: { x: number; y: number }, ate: { x: number; y: number }): Promise<void> => {
    tela.sendInputEvent({ type: 'mouseMove', x: de.x, y: de.y })
    tela.sendInputEvent({ type: 'mouseDown', x: de.x, y: de.y, button: 'left', clickCount: 1 })
    const passos = 12
    for (let i = 1; i <= passos; i++) {
      const x = Math.round(de.x + ((ate.x - de.x) * i) / passos)
      const y = Math.round(de.y + ((ate.y - de.y) * i) / passos)
      tela.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: ['leftbuttondown'] })
      await esperar(25)
    }
    await esperar(90)
    tela.sendInputEvent({ type: 'mouseUp', x: ate.x, y: ate.y, button: 'left', clickCount: 1 })
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
