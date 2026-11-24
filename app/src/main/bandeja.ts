/// <reference types="electron-vite/node" />
/**
 * Bandeja (Fluxos, 1.9.6): a cola com o `Tray` do Electron. As regras (quando ficar, quando sair, o texto) estão
 * em `regrasDaBandeja.ts`, com prova.
 *
 * Quem liga as pontas é o `index.ts`: `iniciarBandeja` com o "abrir" (reabre a sessão) e o "sair" (o caminho de
 * sempre, com o prazo de 5 s). Quem conta os ligados é o motor dos Fluxos: `contarLigadosCom(() =>
 * motor.fluxosLigados())`. Até alguém contar, são 0 e o app sai como sempre saiu.
 */
import { Menu, Tray, nativeImage, type NativeImage } from 'electron'
// a imagem vai junto do bundle (out/), então serve no app instalado e no de dev; o .png de build/ não é empacotado
import caminhoDoIcone from '../../build/icon.png?asset&asarUnpack'
import { criarBandeja, type Bandeja, type IconeDaBandeja } from './regrasDaBandeja'

let contarLigados: () => number = () => 0
let bandeja: Bandeja | null = null

/** O motor dos Fluxos diz como contar os fluxos ligados (de todos os espaços). */
export function contarLigadosCom(contar: () => number): void {
  contarLigados = contar
}

/** Imagem do ícone, no tamanho da bandeja. Vazia = sem ícone visível: a regra trata como "não deu" e sai. */
function imagem(): NativeImage | null {
  const original = nativeImage.createFromPath(caminhoDoIcone)
  if (original.isEmpty()) return null
  // 16 px em 100%; as outras escalas para não borrar com o Windows em 125% ou 150%
  const img = nativeImage.createEmpty()
  for (const escala of [1, 1.25, 1.5, 2]) {
    const lado = Math.round(16 * escala)
    img.addRepresentation({ scaleFactor: escala, buffer: original.resize({ width: lado, height: lado, quality: 'best' }).toPNG() })
  }
  return img.isEmpty() ? null : img
}

function criarIcone(texto: string, aoAbrir: () => void, aoSair: () => void): IconeDaBandeja | null {
  const img = imagem()
  if (!img) return null
  const tray = new Tray(img)
  tray.setToolTip(texto)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir', click: aoAbrir },
      { type: 'separator' },
      { label: 'Sair', click: aoSair }
    ])
  )
  tray.on('click', aoAbrir)
  return {
    mudarTexto: (t) => tray.setToolTip(t),
    balao: (titulo, conteudo) => tray.displayBalloon({ title: titulo, content: conteudo, iconType: 'info' }),
    destruir: () => {
      if (!tray.isDestroyed()) tray.destroy()
    }
  }
}

export function iniciarBandeja(pontas: { abrir: () => void; sair: () => void }): Bandeja {
  bandeja = criarBandeja({
    contar: () => contarLigados(),
    criarIcone,
    abrir: pontas.abrir,
    sair: pontas.sair,
    repetir: (fn, ms) => {
      const t = setInterval(fn, ms)
      // o relógio da bandeja não segura o processo vivo: quem segura são os agentes e o próprio ícone
      t.unref()
      return () => clearInterval(t)
    }
  })
  return bandeja
}

/**
 * Os ligados mudaram (ligar/desligar por `ork`, MCP, motor ou janela): com o app na bandeja, o ícone se atualiza
 * e, se chegou a 0, o app sai já, sem esperar a próxima recontagem (que de todo modo vem em até 3 s).
 */
export function avisarLigadosMudaram(): void {
  bandeja?.recontar()
}
