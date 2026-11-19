import { createElement, useEffect, useRef, useState, type JSX } from 'react'
import { AppWindow } from 'lucide-react'
import { trocarPaginasExtras, type Pagina } from '../../casca/paginas'
import { enderecoDaPagina, exigirOk, idNaCasca, mensagemDeErro, particaoDaPagina, type PaginaInstalada } from './contrato'
import { abrirProposta } from './DialogoAceite'
import { apiPaginas, aoMudarPaginas, esquecerQueda, iniciarEstadoDasPaginas, lerPaginas, recarregarPaginas, usarPaginas } from './estado'
import { iconeLucide } from './Icone'
import { AvisoDaMoldura, Moldura } from './Moldura'
import { inicialDe, resolverIcone, textoDaQueda, textoDeDesligada, textoDePendencia } from './textos'

// Uma página extra na casca: a moldura do app e, dentro dela, o webview isolado. O webview só leva `src`, `partition`
// e a classe: SEM `allowpopups`, `webpreferences`, `preload` ou `nodeintegration` (o main força o preload e as opções
// no `will-attach-webview` e recusa o resto). A página não fica montada ao sair (sem `manterMontada`): o webview
// descarrega e a partição em memória vai junto.

interface Visor extends HTMLElement {
  reload(): void
}

function Visor({ id, aoFalhar }: { id: string; aoFalhar: (motivo: string) => void }) {
  const visor = useRef<Visor>(null)
  useEffect(() => {
    const v = visor.current
    if (!v) return
    const falhou = (e: Event): void => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & { errorCode: number; errorDescription: string; isMainFrame: boolean }
      if (isMainFrame && errorCode !== -3) aoFalhar(errorDescription || `erro ${errorCode}`) // -3: carga abortada (recarregar), não é falha
    }
    v.addEventListener('did-fail-load', falhou)
    return () => v.removeEventListener('did-fail-load', falhou)
  }, [aoFalhar])
  return createElement('webview', { ref: visor, className: 'extra-visor', src: enderecoDaPagina(id), partition: particaoDaPagina(id) })
}

function Corpo({ p }: { p: PaginaInstalada }) {
  const { quedas } = usarPaginas()
  const [carga, setCarga] = useState(0)
  const [falha, setFalha] = useState('')
  const [erro, setErro] = useState('')
  // Toda carga relê a lista antes de montar o webview: o `listar` do main confere a cópia (mudou fora? pede
  // permissão nova?) e a moldura mostra o aviso em vez de abrir uma página que não foi aceita assim.
  const [conferida, setConferida] = useState(false)
  useEffect(() => {
    let vivo = true
    setConferida(false)
    void recarregarPaginas().finally(() => vivo && setConferida(true))
    return () => {
      vivo = false
    }
  }, [carga])
  const recarregar = (): void => {
    esquecerQueda(p.id)
    setFalha('')
    setCarga((n) => n + 1)
  }

  async function religar(): Promise<void> {
    try {
      const api = apiPaginas()
      if (api) exigirOk(await api.religar(p.id))
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    await recarregarPaginas()
  }

  const api = apiPaginas()
  const pendencia = textoDePendencia(p.pendente)
  const queda = quedas.get(p.id)
  let conteudo: JSX.Element
  if (pendencia && api) conteudo = <AvisoDaMoldura texto={pendencia} botao="Rever" aoClicar={() => void abrirProposta(() => api.rever(p.id), 'Rever página')} />
  else if (p.desligada) conteudo = <AvisoDaMoldura texto={textoDeDesligada(p.desligada.motivo)} botao="Religar" aoClicar={() => void religar()} />
  else if (queda) conteudo = <AvisoDaMoldura texto={textoDaQueda(p.nome, queda)} botao="Recarregar" aoClicar={recarregar} perigo />
  else if (falha) conteudo = <AvisoDaMoldura texto={`A página não carregou: ${falha}.`} botao="Recarregar" aoClicar={recarregar} />
  else if (!conferida) conteudo = <p className="suave extra-vazio">Abrindo…</p>
  else conteudo = <Visor key={carga} id={p.id} aoFalhar={setFalha} />

  const podeRecarregar = !pendencia && !p.desligada
  return (
    <Moldura pagina={p} aoRecarregar={podeRecarregar ? recarregar : undefined}>
      {conteudo}
      {erro && (
        <p className="extra-erro" role="alert">
          {erro}
        </p>
      )}
    </Moldura>
  )
}

export function PaginaExtra({ id }: { id: string }) {
  const { lista, erro } = usarPaginas()
  const p = lista?.ligadas ? lista.paginas.find((x) => x.id === id) : undefined
  if (!p)
    return (
      <div className="extra-moldura">
        <p className="suave extra-vazio" role="status">
          {erro || (lista ? 'Esta página não está mais disponível.' : 'Lendo…')}
        </p>
      </div>
    )
  return <Corpo key={p.id} p={p} />
}

// ---------- registro na casca ----------

// Um componente por id, guardado: a casca monta a página pelo `Componente`, e trocá-lo a cada leitura da lista remontaria
// o webview. A `Pagina` também fica guardada enquanto nome e ícone não mudam (a barra só redesenha quando muda algo).
const componentes = new Map<string, () => JSX.Element>()
const naCasca = new Map<string, { chave: string; pagina: Pagina }>()

function componenteDe(id: string): () => JSX.Element {
  let c = componentes.get(id)
  if (!c) {
    c = () => <PaginaExtra id={id} />
    componentes.set(id, c)
  }
  return c
}

function paginaDaCasca(p: PaginaInstalada): Pagina {
  const chave = JSON.stringify([p.nome, p.icone])
  const guardada = naCasca.get(p.id)
  if (guardada?.chave === chave) return guardada.pagina
  const r = resolverIcone(p.icone, p.nome)
  const lucide = r.tipo === 'lucide' ? iconeLucide(r.nome) : undefined
  const pagina: Pagina = {
    id: idNaCasca(p.id),
    titulo: p.nome,
    icone: lucide ?? AppWindow,
    nativa: false,
    imagem: r.tipo === 'imagem' ? r.src : undefined,
    inicial: lucide || r.tipo === 'imagem' ? undefined : inicialDe(p.nome),
    Componente: componenteDe(p.id)
  }
  naCasca.set(p.id, { chave, pagina })
  return pagina
}

function sincronizar(): void {
  const { lista } = lerPaginas()
  const extras = lista?.ligadas ? lista.paginas.map(paginaDaCasca) : []
  try {
    trocarPaginasExtras(extras)
  } catch (e) {
    console.error('páginas extras: não deu para pôr na barra', e)
  }
}

// ---------- cores do tema para o evento `tema` das páginas ----------

/** Os tokens que a página recebe para seguir as cores do app: só cor, fonte e raio (nada de estado da janela). */
export const TOKENS_DO_TEMA = [
  '--texto', '--texto-suave', '--texto-sobre-destaque', '--painel', '--painel-alto', '--quadro-fundo', '--borda', '--borda-suave',
  '--hover', '--destaque', '--destaque-forte', '--destaque-claro', '--perigo', '--atencao', '--vivo', '--fonte-interface',
  '--fonte-mono', '--raio', '--raio-pequeno', '--raio-grande'
] as const

let ultimoTema = ''

/** Lê os tokens do tema em uso (classes `.tema-*`/`.destaque-*` no `.app` + temas e plugins do usuário) e manda ao main se mudaram. */
function mandarTema(): void {
  const api = apiPaginas()
  const app = document.querySelector('.app')
  if (!api || !app || !lerPaginas().lista?.ligadas) return
  const estilo = getComputedStyle(app)
  const tokens: Record<string, string> = {}
  for (const t of TOKENS_DO_TEMA) {
    const v = estilo.getPropertyValue(t).trim()
    if (v) tokens[t] = v
  }
  const texto = JSON.stringify(tokens)
  if (texto === ultimoTema) return
  ultimoTema = texto
  api.tema(tokens)
}

let temporizadorDoTema: ReturnType<typeof setTimeout> | null = null
function agendarTema(): void {
  if (temporizadorDoTema) clearTimeout(temporizadorDoTema)
  temporizadorDoTema = setTimeout(mandarTema, 150)
}

/** O tema muda pela classe do `.app` ou pelos `<style>` que os temas do usuário põem no `<head>`: segue os dois. */
function seguirTema(): void {
  const observador = new MutationObserver(agendarTema)
  observador.observe(document.head, { childList: true, subtree: true, characterData: true })
  const app = document.querySelector('.app')
  if (app) observador.observe(app, { attributes: true, attributeFilter: ['class', 'style'] })
  // a lista chega depois (chave ligada) ou uma página nova abre: manda de novo (o main repassa às abertas)
  aoMudarPaginas(() => {
    ultimoTema = ''
    agendarTema()
  })
  agendarTema()
}

let iniciado = false

/** Liga UMA vez (a barra de páginas chama ao montar): lê o registro do main e mantém a barra e a casca em dia. */
export function iniciarPaginasExtras(): void {
  if (iniciado || !apiPaginas()) return
  iniciado = true
  aoMudarPaginas(sincronizar)
  iniciarEstadoDasPaginas()
  seguirTema()
}
