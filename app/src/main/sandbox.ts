// A receita de sessão fechada, a mesma para as páginas "+" (main/paginas.ts) e para o nó Código dos fluxos
// (main/fluxos/codigo.ts): nenhuma permissão (câmera, microfone, notificação, tela, HID, serial, USB), nenhum download
// e sem corretor ortográfico (que manda texto para fora). A rede e o protocolo de cada um ficam com quem chama.
//
// Sem import do Electron em tempo de execução: só o tipo da sessão.
import type { Session } from 'electron'

/** Fecha a sessão. `aoBarrarDownload` é avisado a cada download cancelado (as páginas contam para o autoteste). */
export function endurecerSessao(ses: Session, aoBarrarDownload?: () => void): void {
  ses.setPermissionRequestHandler((_conteudo, _permissao, responder) => responder(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  ses.setDisplayMediaRequestHandler((_pedido, responder) => responder(null))
  ses.setSpellCheckerEnabled(false)
  ses.on('will-download', (evento, item) => {
    aoBarrarDownload?.()
    evento.preventDefault()
    item.cancel()
  })
  ses.on('select-hid-device', (evento, _d, responder) => {
    evento.preventDefault()
    responder('')
  })
  ses.on('select-serial-port', (evento, _l, _w, responder) => {
    evento.preventDefault()
    responder('')
  })
  ses.on('select-usb-device', (evento, _d, responder) => {
    evento.preventDefault()
    responder()
  })
}
