import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as CliqueReact } from 'react'
import { ArrowLeft, BookOpen, X } from 'lucide-react'
import { CATALOGO } from '../../../../shared/fluxos/nos'
import type { TipoDeNo } from './contrato'
import { ANCORA_PRIMEIROS_PASSOS, indiceDaAncora, trechoDoNo } from './trechoDoGuia'
import '../../estilos/fluxos-doc.css'

// Documentação de um nó (T6): uma janela no próprio editor com o trecho do guia daquele nó e, no botão "Guia inteiro", o guia
// todo, embutido no app (como o "Guia completo" das páginas "+", `PainelMais.tsx`): vale também no app instalado, que não
// tem a pasta docs/. O texto do guia só é baixado ao abrir. Quem pede (o botão "Documentação" do painel do nó e a busca de
// nós do editor) chama `abrirDocDoNo(tipo)`; o botão "Guia dos fluxos" da página chama `abrirGuiaDosFluxos()`, que abre o
// guia inteiro já numa âncora ("Primeiros passos"). A janela é montada sempre, na casca (dialogos.ts), e só desenha com pedido.

/** Com `tipo`, o trecho de um nó; sem, o guia inteiro na `ancora`. `vez` remonta a janela a cada pedido. */
type Pedido = { tipo: TipoDeNo; vez: number } | { tipo?: undefined; ancora: string; vez: number }
let pedido: Pedido | null = null
let vezes = 0
/** Quem tinha o foco ao abrir: ele volta ao fechar, senão o Esc seguinte (que fecha o painel do nó) cai no vazio. */
let devolverFoco: HTMLElement | null = null
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

function abrir(novo: Pedido): void {
  const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null
  // na escolha de nó, o teclado (setas, Enter, Esc) mora na busca, não no "?" clicado
  devolverFoco = antes?.closest('[data-escolha-de-no]')?.querySelector<HTMLElement>('input') ?? antes
  pedido = novo
  avisar()
}

/** Abre a janela com o trecho do nó. */
export const abrirDocDoNo = (tipo: TipoDeNo): void => abrir({ tipo, vez: ++vezes })

/** Abre o guia inteiro, rolado até a âncora (por padrão, "Primeiros passos"). */
export const abrirGuiaDosFluxos = (ancora: string = ANCORA_PRIMEIROS_PASSOS): void => abrir({ ancora, vez: ++vezes })

const fechar = (): void => {
  pedido = null
  avisar()
  const alvo = devolverFoco
  devolverFoco = null
  if (alvo?.isConnected) alvo.focus({ preventScroll: true })
}

export function DocDoNoDialogo() {
  const p = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => void ouvintes.delete(o)
    },
    () => pedido
  )
  if (!p) return null
  return p.tipo ? <Janela key={p.vez} tipo={p.tipo} /> : <Janela key={p.vez} ancoraInicial={p.ancora} />
}

/** Carrega o guia e o renderiza uma vez, ao abrir (o markdown-it e o texto não entram no pacote inicial). */
function usarGuia(): { md: string; html: (texto: string) => string } | 'erro' | null {
  const [guia, setGuia] = useState<{ md: string; html: (texto: string) => string } | 'erro' | null>(null)
  useEffect(() => {
    let vivo = true
    void Promise.all([import('../../../../shared/markdown'), import('../../../../../../docs/fluxos.pt-BR.md?raw')]).then(
      ([{ renderizarMarkdown }, m]: [typeof import('../../../../shared/markdown'), { default: string }]) => vivo && setGuia({ md: m.default, html: renderizarMarkdown }),
      () => vivo && setGuia('erro')
    )
    return () => void (vivo = false)
  }, [])
  return guia
}

/** Com `tipo`, abre no trecho do nó; sem, abre no guia inteiro, rolado até a `ancoraInicial`. */
function Janela({ tipo, ancoraInicial }: { tipo?: TipoDeNo; ancoraInicial?: string }) {
  const guia = usarGuia()
  const [inteiro, setInteiro] = useState(!tipo)
  /** O link de âncora clicado (`#campos-padrão-fichas`); o `vez` faz o mesmo link rolar de novo. */
  const [ancora, setAncora] = useState<{ href: string; vez: number } | null>(ancoraInicial ? { href: ancoraInicial, vez: 0 } : null)
  const corpo = useRef<HTMLDivElement>(null)
  const rotulo = tipo ? (CATALOGO[tipo]?.rotulo ?? tipo) : ''

  // Esc fecha só esta janela: na captura, antes do painel do nó e do editor de trás
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      fechar()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])

  const trecho = tipo && guia && guia !== 'erro' ? trechoDoNo(guia.md, tipo) : null
  const html = guia && guia !== 'erro' ? guia.html(inteiro || trecho === null ? guia.md : trecho) : ''

  // no guia inteiro, a tela vai até o título do link de âncora clicado ou, sem link, até o título do nó
  useEffect(() => {
    if (!inteiro || !html) return
    const titulos = [...(corpo.current?.querySelectorAll('h1, h2, h3, h4, h5, h6') ?? [])]
    const alvo = ancora
      ? titulos[indiceDaAncora(titulos.map((h) => h.textContent ?? ''), ancora.href)]
      : tipo && titulos.find((h) => h.tagName === 'H3' && h.textContent?.includes(tipo))
    alvo?.scrollIntoView({ block: 'start' })
  }, [inteiro, html, tipo, ancora])

  // link de âncora do guia: os títulos renderizados não têm id, então o app abre o guia inteiro e rola até o título
  // (e o endereço da janela não muda). Os outros links (externo, outro .md) seguem como estão.
  const noClique = (e: CliqueReact): void => {
    const href = (e.target as Element).closest?.('a[href^="#"]')?.getAttribute('href')
    if (!href) return
    e.preventDefault()
    setAncora((a) => ({ href, vez: (a?.vez ?? 0) + 1 }))
    setInteiro(true)
  }

  return (
    <div className="dialogo-fundo" onPointerDown={fechar}>
      <div className="dialogo dialogo-doc-no" role="dialog" aria-modal="true" aria-label={tipo ? `Documentação: ${rotulo}` : 'Guia dos fluxos'} onPointerDown={(e) => e.stopPropagation()} data-doc-do-no={tipo ?? 'guia'}>
        <h3>{inteiro ? 'Guia dos fluxos' : `Documentação: ${rotulo}`}</h3>
        <div className="doc-no-corpo" ref={corpo}>
          {guia === null && <p className="suave">Abrindo…</p>}
          {guia === 'erro' && (
            <p className="suave" role="alert">
              Não consegui abrir o guia.
            </p>
          )}
          {tipo && guia && guia !== 'erro' && !inteiro && trecho === null && <p className="suave doc-no-aviso">O guia ainda não tem um trecho só para este nó; segue o guia inteiro.</p>}
          {html && <div className="md-corpo doc-no-md" data-doc-do-no-texto onClick={noClique} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
        <div className="dialogo-acoes">
          {guia && guia !== 'erro' && trecho !== null && (
            <button type="button" onClick={() => (setAncora(null), setInteiro((v) => !v))} data-doc-do-no-guia>
              {inteiro ? (
                <>
                  <ArrowLeft size={13} /> Só este nó
                </>
              ) : (
                <>
                  <BookOpen size={13} /> Guia inteiro
                </>
              )}
            </button>
          )}
          <span className="espaco-flex" />
          <button type="button" autoFocus onClick={fechar} data-doc-do-no-fechar>
            <X size={13} /> Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
