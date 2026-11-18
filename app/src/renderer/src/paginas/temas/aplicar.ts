// O que a página Temas guarda e aplica, carregado na partida do app (a casca importa este módulo; a página em si é
// preguiçosa). Mantém o arquivo de temas desta janela, o rascunho em edição e dois <style> no <head>:
//   #ork-plugins-css   o CSS dos plugins ligados, RE-GERADO das declarações validadas (cssDosPlugins)
//   #ork-tema-usuario  as cores do tema do usuário em uso (ou do rascunho), também re-geradas (cssDoTemaDoUsuario)
// Nenhum texto colado pela pessoa chega ao <style>: só o que passou pela validação.
import { useSyncExternalStore } from 'react'
import { cssDosPlugins } from '../../../../shared/cssPlugin'
import type { Tema } from '../../../../shared/temas'
import {
  ARQUIVO_DE_TEMAS_VAZIO,
  cssDoTemaDoUsuario,
  type ArquivoDeTemas,
  type OperacaoDeTemas,
  type ResultadoDeTemas,
  type TemaDoUsuario
} from '../../../../shared/temasUsuario'

interface EstadoDosTemas {
  arquivo: ArquivoDeTemas
  /** O tema do usuário em edição nesta janela (as mudanças aparecem na hora, antes de salvar). */
  rascunho: TemaDoUsuario | null
}

let estado: EstadoDosTemas = { arquivo: ARQUIVO_DE_TEMAS_VAZIO, rascunho: null }
const ouvintes = new Set<() => void>()

function estilo(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    document.head.appendChild(el)
  }
  return el
}

/** O tema do usuário que vale nesta janela: o rascunho, se houver; senão o ativo do arquivo. */
export function temaDoUsuarioEmUso(e: EstadoDosTemas = estado): TemaDoUsuario | null {
  return e.rascunho ?? e.arquivo.temas.find((t) => t.id === e.arquivo.ativo) ?? null
}

function aplicarNoDocumento(): void {
  // os plugins primeiro e o tema do usuário depois (o seletor dele é mais forte de qualquer jeito)
  const plugins = cssDosPlugins(estado.arquivo.plugins)
  const tema = cssDoTemaDoUsuario(temaDoUsuarioEmUso())
  const p = estilo('ork-plugins-css')
  const t = estilo('ork-tema-usuario')
  if (p.textContent !== plugins) p.textContent = plugins
  if (t.textContent !== tema) t.textContent = tema
}

function definir(parcial: Partial<EstadoDosTemas>): void {
  estado = { ...estado, ...parcial }
  aplicarNoDocumento()
  ouvintes.forEach((o) => o())
}

export function lerEstadoDosTemas(): EstadoDosTemas {
  return estado
}

export function usarTemas<T>(seletor: (e: EstadoDosTemas) => T): T {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => void ouvintes.delete(o)
    },
    () => seletor(estado)
  )
}

/** As cores do tema do usuário que o terminal deve seguir, se a base dele for o tema em tela. */
export function usarCoresDoTerminal(base: Tema): TemaDoUsuario['cores'] | null {
  return usarTemas((e) => {
    const t = temaDoUsuarioEmUso(e)
    return t && t.base === base ? t.cores : null
  })
}

async function recarregar(): Promise<void> {
  const arquivo = await window.ork.temas.ler()
  // o rascunho desta janela continua em edição, a não ser que o tema dele tenha sido apagado em outra
  const rascunho = estado.rascunho && arquivo.temas.some((t) => t.id === estado.rascunho!.id) ? estado.rascunho : null
  definir({ arquivo, rascunho })
}

/** Pede uma mudança ao processo principal (que valida e grava) e aplica o resultado. */
export async function pedir(operacao: OperacaoDeTemas): Promise<ResultadoDeTemas> {
  const r = await window.ork.temas.aplicar(operacao)
  if (r.ok) definir({ arquivo: r.arquivo })
  return r
}

export function definirRascunho(rascunho: TemaDoUsuario | null): void {
  definir({ rascunho })
}

let iniciado = false
/** Lê o arquivo e passa a ouvir as outras janelas. Uma vez por janela (o Fast Refresh reexecuta o módulo). */
export function iniciarTemas(): void {
  if (iniciado || typeof window === 'undefined' || !window.ork?.temas) return
  iniciado = true
  // o autoteste limpa o que criou pelo mesmo caminho da página (assim o <style> desta janela acompanha)
  if (window.ork.autoteste) Object.assign(window, { __temas: { pedir, definirRascunho, lerEstadoDosTemas } })
  window.ork.janelas.aoAvisar((aviso) => {
    if (aviso.tipo === 'temas') void recarregar()
  })
  void recarregar().catch((e) => console.error('não consegui ler os temas', e))
}
