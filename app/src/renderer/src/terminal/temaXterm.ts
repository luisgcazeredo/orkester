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

/**
 * O tema do xterm com as cores do tema do usuário (1.9.3). Só o corpo e o texto do terminal mexem nele: sem
 * `--terminal-corpo` nem `--terminal-texto` trocados, volta o tema de fábrica sem mudança (os valores acima).
 * As cores chegam já validadas (#rrggbb) de `shared/temasUsuario.ts`.
 */
export function temaXtermComCores(base: string, cores: Readonly<Record<string, string | undefined>> | null | undefined): ITheme | undefined {
  const deFabrica = TEMAS_XTERM[base]
  const corpo = cores?.['--terminal-corpo']
  const texto = cores?.['--terminal-texto']
  if (!corpo && !texto) return deFabrica
  return {
    ...deFabrica,
    ...(corpo ? { background: corpo, cursorAccent: corpo } : {}),
    ...(texto ? { foreground: texto, cursor: texto } : {})
  }
}
