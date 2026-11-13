// R7-EXCECAO: o tema do xterm fica em TS, e não em token de CSS.
//
// O `ITheme` do xterm pede cor concreta (string de cor), e estes valores não coincidem com nenhum token do
// CSS (o fundo escuro do terminal aqui é #1A1A1E, o token `--terminal-corpo` é #16181d). Lê-los do CSS em
// tempo de execução mudaria o momento em que a cor chega ao xterm, e a R7 não muda comportamento. Fica num
// lugar só, indexado pelo id do tema (ver `shared/temas.ts`); tema sem entrada aqui usa o padrão do xterm.
// A varredura de cor da R7 aceita este arquivo como exceção.
import type { ITheme } from '@xterm/xterm'

export const TEMAS_XTERM: Record<string, ITheme> = {
  escuro: { background: '#1A1A1E', foreground: '#E6E6E6', cursor: '#E6E6E6', cursorAccent: '#1A1A1E', selectionBackground: '#264F78' },
  claro: {
    background: '#FFFFFF',
    foreground: '#2A2A2E',
    cursor: '#2A2A2E',
    cursorAccent: '#FFFFFF',
    selectionBackground: '#ADD6FF',
    // as cores claras do padrão somem no fundo branco
    white: '#6E6E73',
    brightWhite: '#3A3A3C',
    yellow: '#A16C00',
    brightYellow: '#8A5A00'
  }
}
