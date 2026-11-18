import hljs from 'highlight.js/lib/core'
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Folder, FolderPlus, Pin, PinOff, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact, type MouseEvent as CliqueReact } from 'react'
import type { TextoMd } from '../../../../shared/api'
import { renderizarMarkdown } from '../../../../shared/markdown'
import '../../arquivos/realce' // registra as línguas no highlight.js (o núcleo vem vazio)
import { definirPastasDoLeitor, lerEstado, usarLoja } from '../../estado/loja'
import { buscarPorNome, caminhoAbsoluto, juntarRaizes, mesmaPasta, montarArvore, nomeDaPasta, paisDe, relativoAberto, type NoDaArvore } from './arvore'
import { acoesDoLeitor } from './atalhos'
import { AVISO_FORA_DAS_PASTAS, aoChegarPedido, haPedidoPendente, pegarPedido, raizDoCaminho, vigiaAindaVale } from './pedido'

/**
 * Leitor de Markdown: SÓ LÊ. À esquerda, as raízes (pasta do espaço e pastas fixadas) e a árvore dos .md; à
 * direita, o arquivo formatado. O texto do arquivo não é de confiança: o HTML sai de `renderizarMarkdown`
 * (HTML cru vira texto) e o clique em link é tratado aqui, com o principal conferindo raiz e esquema de novo.
 */

const KB = 1024

// `hljs.highlight(...).value` é escapado; língua que o núcleo não registrou lança, e o markdown.ts cai no texto puro.
const realcar = (codigo: string, lingua: string): string => hljs.highlight(codigo, { language: lingua, ignoreIllegals: true }).value

interface Aberto {
  raiz: string
  /** Caminho real devolvido pelo principal. */
  caminho: string
}

interface Documento extends Aberto {
  html: string
  grande: boolean
  tamanho: number
  erro?: string
}

// O Leitor desmonta ao trocar de página: o que o usuário estava lendo fica aqui para voltar do mesmo jeito.
const memoria: { raiz: string | null; aberto: Aberto | null; historico: Aberto[]; busca: string; abertas: string[] } = {
  raiz: null,
  aberto: null,
  historico: [],
  busca: '',
  abertas: []
}

function paraDocumento(raiz: string, t: TextoMd): Documento {
  return {
    raiz,
    caminho: t.caminho,
    html: t.erro || t.grande ? '' : renderizarMarkdown(t.conteudo, { realcar }),
    grande: t.grande,
    tamanho: t.tamanho,
    erro: t.erro
  }
}

function Ramo({ nos, nivel, abertas, aberto, aoAlternar, aoAbrir }: {
  nos: NoDaArvore[]
  nivel: number
  abertas: Set<string>
  aberto: string | null
  aoAlternar: (caminho: string) => void
  aoAbrir: (caminho: string) => void
}) {
  return (
    <>
      {nos.map((no) =>
        no.tipo === 'pasta' ? (
          <div key={no.caminho}>
            <button
              type="button"
              className="leitor-item leitor-pasta"
              style={{ paddingLeft: 8 + nivel * 14 }}
              data-pasta={no.caminho}
              aria-expanded={abertas.has(no.caminho)}
              onClick={() => aoAlternar(no.caminho)}
            >
              {abertas.has(no.caminho) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={14} />
              <span>{no.nome}</span>
            </button>
            {abertas.has(no.caminho) && <Ramo nos={no.filhos} nivel={nivel + 1} abertas={abertas} aberto={aberto} aoAlternar={aoAlternar} aoAbrir={aoAbrir} />}
          </div>
        ) : (
          <button
            key={no.caminho}
            type="button"
            className={`leitor-item leitor-arquivo ${no.caminho === aberto ? 'ativo' : ''}`}
            style={{ paddingLeft: 8 + nivel * 14 + 18 }}
            data-caminho={no.caminho}
            aria-current={no.caminho === aberto ? 'true' : undefined}
            onClick={() => aoAbrir(no.caminho)}
          >
            <FileText size={14} />
            <span>{no.nome}</span>
          </button>
        )
      )}
    </>
  )
}

export function Leitor() {
  const espacos = usarLoja((e) => e.espacos) // o Leitor é geral: lista as pastas de TODOS os espaços, não só a do aberto
  const fixadasDaLoja = usarLoja((e) => e.preferencias.leitor?.pastas)
  // fonte única: as fixadas vêm só da loja (sem cópia local que fique velha ao sair do Leitor e voltar)
  const fixadas = useMemo(() => fixadasDaLoja ?? [], [fixadasDaLoja])

  const raizes = useMemo(() => {
    return juntarRaizes(espacos.map((e) => e.pasta), fixadas)
  }, [espacos, fixadas])

  const [raiz, setRaiz] = useState<string | null>(memoria.raiz)
  const raizAtual = raizes.find((r) => raiz && mesmaPasta(r.caminho, raiz))?.caminho ?? raizes[0]?.caminho ?? null

  const [arquivos, setArquivos] = useState<string[]>([])
  const [cortado, setCortado] = useState(false)
  const [erroDaArvore, setErroDaArvore] = useState<string | null>(null)
  const [carregandoArvore, setCarregandoArvore] = useState(false)
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(memoria.abertas))
  const [busca, setBusca] = useState(memoria.busca)
  const [doc, setDoc] = useState<Documento | null>(null)
  const [historico, setHistorico] = useState<Aberto[]>(memoria.historico)
  const [aviso, setAviso] = useState<string | null>(null)
  const campoBusca = useRef<HTMLInputElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const pedido = useRef(0) // só a última leitura vale (resposta atrasada de outro arquivo não troca a tela)
  const vigia = useRef(0) // só a última releitura da vigia vale
  const docRef = useRef<Documento | null>(null)
  docRef.current = doc

  useEffect(() => {
    memoria.raiz = raizAtual
    memoria.busca = busca
    memoria.abertas = [...abertas]
    memoria.historico = historico
  }, [raizAtual, busca, abertas, historico])

  // a árvore da raiz escolhida
  useEffect(() => {
    if (!raizAtual) return
    let vivo = true
    setCarregandoArvore(true)
    void window.ork.leitor.arvore(raizAtual).then((r) => {
      if (!vivo) return
      setArquivos(r.arquivos)
      setCortado(r.cortado)
      setErroDaArvore(r.erro ?? null)
      setCarregandoArvore(false)
    })
    return () => {
      vivo = false
    }
  }, [raizAtual])

  const ler = useCallback(async (raizDoArquivo: string, caminho: string, link?: { de: string; valor: string }): Promise<Documento | null> => {
    const numero = ++pedido.current
    const t = link ? await window.ork.leitor.lerLink(raizDoArquivo, link.de, link.valor) : await window.ork.leitor.ler(raizDoArquivo, caminho)
    if (numero !== pedido.current) return null
    return paraDocumento(raizDoArquivo, t)
  }, [])

  const mostrar = useCallback((novo: Documento, guardarAnterior: boolean) => {
    const atual = docRef.current
    if (guardarAnterior && atual?.caminho && atual.caminho !== novo.caminho) setHistorico((h) => [...h.slice(-49), { raiz: atual.raiz, caminho: atual.caminho }])
    setDoc(novo)
    setAviso(null)
    if (corpo.current) corpo.current.scrollTop = 0
  }, [])

  const abrir = useCallback(async (raizDoArquivo: string, caminho: string, guardarAnterior = true) => {
    const novo = await ler(raizDoArquivo, caminho)
    if (!novo) return
    if (novo.erro && !novo.caminho) setAviso(novo.erro)
    else mostrar(novo, guardarAnterior)
  }, [ler, mostrar])

  // o que estava aberto ao sair da página volta ao entrar
  useEffect(() => {
    // um pedido do visor ganha de "voltar ao que estava aberto": com pedido na fila, não reabre a memória
    if (memoria.aberto && !haPedidoPendente()) void abrir(memoria.aberto.raiz, memoria.aberto.caminho, false)
  }, [abrir])
  // "abrir no Leitor" vindo do visor de código: o pedido espera aqui até o Leitor montar (ou chega com ele montado).
  // Vem depois do efeito acima de propósito: se os dois abrirem ao mesmo tempo, o último pedido (este) é o que vale.
  const raizesRef = useRef(raizes)
  raizesRef.current = raizes
  useEffect(() => {
    const atender = (): void => {
      const p = pegarPedido()
      if (!p) return
      const daRaiz = raizDoCaminho(raizesRef.current.map((r) => r.caminho), p.de)
      if (!daRaiz) {
        pedido.current++ // uma leitura antiga ainda em voo não pode apagar este aviso nem trocar o arquivo
        setAviso(AVISO_FORA_DAS_PASTAS) // não fixa pasta sozinho
        // o pedido recusado não apaga o que estava aberto: sem arquivo em tela, volta o da memória, com o aviso por cima
        const antes = memoria.aberto
        if (!docRef.current && antes) {
          void ler(antes.raiz, antes.caminho).then((novo) => {
            if (novo && !(novo.erro && !novo.caminho)) setDoc(novo)
          })
        }
        return
      }
      setRaiz(daRaiz)
      setBusca('')
      // o alvo do link é resolvido e conferido pelo principal (`lerLink`), como no clique dentro do Leitor
      void (p.link ? ler(daRaiz, '', { de: p.de, valor: p.link }) : ler(daRaiz, p.de)).then((novo) => {
        if (!novo) return
        if (novo.erro && !novo.caminho) setAviso(novo.erro)
        else mostrar(novo, false)
      })
    }
    atender()
    return aoChegarPedido(atender)
  }, [ler, mostrar])

  useEffect(() => {
    if (doc) memoria.aberto = { raiz: doc.raiz, caminho: doc.caminho } // doc nulo = ainda lendo; quem fecha de verdade zera (desafixar)
    // abre a árvore até o arquivo (só se ele é da raiz em tela)
    if (doc && raizAtual && mesmaPasta(doc.raiz, raizAtual)) {
      const ao = relativoAberto(raizAtual, doc.caminho, arquivos)
      if (ao) setAbertas((s) => (paisDe(ao).every((p) => s.has(p)) ? s : new Set([...s, ...paisDe(ao)])))
    }
  }, [doc, raizAtual, arquivos])

  // recarrega quando o arquivo aberto muda no disco (a vigia é do principal, uma por janela)
  const caminhoVigiado = doc?.caminho ?? null
  const raizVigiada = doc?.raiz ?? null
  useEffect(() => {
    if (!caminhoVigiado || !raizVigiada) return
    return window.ork.leitor.vigiar(raizVigiada, caminhoVigiado, () => {
      const posicao = corpo.current?.scrollTop ?? 0
      // contador próprio: a vigia não cancela uma abertura em voo, e só aplica se o arquivo vigiado ainda é o mostrado
      const n = ++vigia.current
      void window.ork.leitor.ler(raizVigiada, caminhoVigiado).then((t) => {
        if (n !== vigia.current || !vigiaAindaVale(docRef.current, { raiz: raizVigiada, caminho: caminhoVigiado })) return
        setDoc(paraDocumento(raizVigiada, t))
        requestAnimationFrame(() => corpo.current && (corpo.current.scrollTop = posicao))
      })
    })
  }, [caminhoVigiado, raizVigiada])

  const voltar = useCallback(() => {
    const anterior = historico[historico.length - 1]
    if (!anterior) return
    setHistorico((h) => h.slice(0, -1))
    void abrir(anterior.raiz, anterior.caminho, false)
  }, [historico, abrir])

  useEffect(() => {
    acoesDoLeitor.voltar = voltar
    acoesDoLeitor.buscar = () => {
      campoBusca.current?.focus()
      campoBusca.current?.select()
    }
    // Esc fecha primeiro o aviso, depois limpa a busca
    acoesDoLeitor.limparBusca = () => {
      if (aviso) {
        setAviso(null)
        return true
      }
      if (!busca) return false
      setBusca('')
      return true
    }
    return () => {
      acoesDoLeitor.voltar = () => {}
      acoesDoLeitor.buscar = () => {}
      acoesDoLeitor.limparBusca = () => false
    }
  }, [voltar, busca, aviso])

  const arvore = useMemo(() => montarArvore(arquivos), [arquivos])
  const achados = useMemo(() => buscarPorNome(arquivos, busca), [arquivos, busca])
  const buscando = busca.trim() !== ''

  function alternarPasta(caminho: string): void {
    setAbertas((s) => {
      const novo = new Set(s)
      if (!novo.delete(caminho)) novo.add(caminho)
      return novo
    })
  }

  // "aberto" na árvore: caminho relativo do arquivo em tela, se ele é da raiz em tela
  const ativoNaArvore = useMemo(() => {
    if (!doc || !raizAtual || !mesmaPasta(doc.raiz, raizAtual)) return null
    return relativoAberto(raizAtual, doc.caminho, arquivos)
  }, [doc, raizAtual, arquivos])

  function escolherRaiz(caminho: string): void {
    if (raizAtual && mesmaPasta(caminho, raizAtual)) return
    setRaiz(caminho)
    setBusca('')
  }

  // Gravações em fila, cada uma partindo da lista que a loja tem NA HORA de gravar (não da lista da renderização):
  // dois "Desafixar" seguidos rápido não deixam a primeira pasta voltar.
  const filaDeGravacao = useRef<Promise<unknown>>(Promise.resolve())
  function gravarFixadas(alterar: (atuais: string[]) => string[], quandoFalhar: () => Promise<string>): Promise<boolean> {
    const vez = filaDeGravacao.current.then(async () => {
      try {
        await definirPastasDoLeitor(alterar(lerEstado().preferencias.leitor?.pastas ?? []))
        return true
      } catch {
        setAviso(await quandoFalhar())
        return false
      }
    })
    filaDeGravacao.current = vez
    return vez
  }
  const AVISO_PASTA_RECUSADA = 'O Orkester não aceitou essa pasta (precisa existir, não ser de rede nem a pasta do usuário inteira).'

  /** O principal valida a lista inteira: se desafixar falha, a causa pode ser OUTRA fixada que sumiu do disco. Diz qual. */
  async function avisoDaFalhaAoDesafixar(caminho: string): Promise<string> {
    const outras = (lerEstado().preferencias.leitor?.pastas ?? []).filter((p) => !mesmaPasta(p, caminho))
    const sumidas: string[] = []
    for (const p of outras) {
      const r = await window.ork.leitor.arvore(p).catch(() => ({ erro: 'falhou' }))
      if (r.erro) sumidas.push(nomeDaPasta(p))
    }
    return sumidas.length
      ? `Não deu para desafixar: a pasta fixada "${sumidas.join('", "')}" não existe mais. Desafixe essa primeiro.`
      : 'Não deu para desafixar essa pasta agora. Tente de novo.'
  }

  async function fixarPasta(): Promise<void> {
    const escolhida = await window.ork.dados.escolherPasta()
    if (!escolhida) return
    if (raizes.some((r) => mesmaPasta(r.caminho, escolhida))) {
      setAviso('Essa pasta já está na lista.')
      escolherRaiz(escolhida)
      return
    }
    if (await gravarFixadas((atuais) => (atuais.some((p) => mesmaPasta(p, escolhida)) ? atuais : [...atuais, escolhida]), async () => AVISO_PASTA_RECUSADA)) {
      setAviso(null)
      setRaiz(escolhida)
    }
  }

  async function desafixar(caminho: string): Promise<void> {
    if (await gravarFixadas((atuais) => atuais.filter((p) => !mesmaPasta(p, caminho)), () => avisoDaFalhaAoDesafixar(caminho))) {
      if (raizAtual && mesmaPasta(raizAtual, caminho)) setRaiz(null)
      if (doc && mesmaPasta(doc.raiz, caminho)) {
        setDoc(null)
        memoria.aberto = null
        setHistorico((h) => h.filter((a) => !mesmaPasta(a.raiz, caminho)))
      }
    }
  }

  async function seguirLink(a: HTMLElement): Promise<void> {
    const externo = a.dataset.externo
    const md = a.dataset.md
    const atual = docRef.current
    if (externo) {
      if (!(await window.ork.leitor.externo(externo))) setAviso('Esse endereço não pôde ser aberto.')
    } else if (md && atual) {
      const novo = await ler(atual.raiz, '', { de: atual.caminho, valor: md })
      if (!novo) return
      if (novo.erro && !novo.caminho) setAviso(novo.erro)
      else mostrar(novo, true)
    }
  }

  function aoClicarNoTexto(e: CliqueReact<HTMLElement>): void {
    const a = (e.target as Element).closest('a')
    if (!a) return
    e.preventDefault() // nunca deixa a janela navegar (âncora `#x` e link morto também ficam aqui)
    void seguirLink(a as HTMLElement)
  }

  function aoTeclarNoTexto(e: TeclaReact<HTMLElement>): void {
    if (e.key !== 'Enter') return
    const a = (e.target as Element).closest('a')
    if (!a) return
    e.preventDefault()
    void seguirLink(a as HTMLElement)
  }

  const nomeDoDoc = doc?.caminho ? doc.caminho.split(/[\\/]/).pop() : null

  return (
    <div className="leitor" data-leitor>
      <aside className="leitor-lateral" aria-label="Arquivos Markdown">
        <div className="leitor-raizes" role="list">
          {raizes.map((r) => (
            <div key={r.caminho} className={`leitor-raiz ${raizAtual && mesmaPasta(r.caminho, raizAtual) ? 'ativo' : ''}`} role="listitem">
              <button type="button" className="leitor-raiz-nome" data-raiz={r.caminho} data-fixada={r.fixada} title={r.caminho} onClick={() => escolherRaiz(r.caminho)}>
                <Folder size={14} />
                <span>{nomeDaPasta(r.caminho)}</span>
                {!r.fixada && <em>espaço</em>}
              </button>
              {r.fixada && (
                <button type="button" className="leitor-desafixar" title="Desafixar esta pasta" aria-label={`Desafixar ${nomeDaPasta(r.caminho)}`} onClick={() => void desafixar(r.caminho)}>
                  <PinOff size={13} />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="leitor-fixar" onClick={() => void fixarPasta()}>
            <FolderPlus size={14} />
            <span>Fixar pasta…</span>
          </button>
        </div>
        <label className="leitor-busca">
          <Search size={14} />
          <input
            ref={campoBusca}
            className="leitor-busca-campo"
            type="text"
            value={busca}
            placeholder="Buscar por nome (Ctrl+F)"
            spellCheck={false}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="leitor-arvore" role="tree">
          {!raizAtual && <p className="leitor-vazio">Abra um espaço ou fixe uma pasta para ler os arquivos .md dela.</p>}
          {raizAtual && carregandoArvore && <p className="leitor-vazio">Lendo a pasta…</p>}
          {erroDaArvore && <p className="leitor-vazio">{erroDaArvore}</p>}
          {raizAtual && !carregandoArvore && !erroDaArvore && arquivos.length === 0 && <p className="leitor-vazio">Nenhum arquivo .md nesta pasta.</p>}
          {buscando
            ? achados.length === 0
              ? !carregandoArvore && <p className="leitor-vazio">Nada com esse nome.</p>
              : achados.map((caminho) => (
                  <button
                    key={caminho}
                    type="button"
                    className={`leitor-item leitor-arquivo leitor-achado ${caminho === ativoNaArvore ? 'ativo' : ''}`}
                    data-caminho={caminho}
                    title={caminho}
                    onClick={() => raizAtual && void abrir(raizAtual, caminhoAbsoluto(raizAtual, caminho))}
                  >
                    <FileText size={14} />
                    <span>{caminho.slice(caminho.lastIndexOf('/') + 1)}</span>
                    {caminho.includes('/') && <em>{caminho.slice(0, caminho.lastIndexOf('/'))}</em>}
                  </button>
                ))
            : raizAtual && (
                <Ramo
                  nos={arvore}
                  nivel={0}
                  abertas={abertas}
                  aberto={ativoNaArvore}
                  aoAlternar={alternarPasta}
                  aoAbrir={(caminho) => void abrir(raizAtual, caminhoAbsoluto(raizAtual, caminho))}
                />
              )}
          {cortado && <p className="leitor-vazio" data-cortado>A pasta é grande: mostrei só os primeiros arquivos.</p>}
        </div>
      </aside>

      <section className="leitor-leitura">
        <header className="leitor-topo">
          <button type="button" className="leitor-voltar" title="Voltar (Alt+←)" aria-label="Voltar" disabled={historico.length === 0} onClick={voltar}>
            <ArrowLeft size={16} />
          </button>
          <span className="leitor-titulo" title={doc?.caminho}>{nomeDoDoc ?? 'Leitor de Markdown'}</span>
          {raizAtual && fixadas.some((p) => mesmaPasta(p, raizAtual)) && <Pin size={13} className="leitor-pino" aria-label="Pasta fixada" />}
        </header>
        {aviso && (
          <div className="leitor-aviso leitor-aviso-fechavel" role="status" data-tipo="aviso">
            <span>{aviso}</span>
            <button type="button" className="leitor-voltar" title="Fechar o aviso (Esc)" aria-label="Fechar o aviso" onClick={() => setAviso(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="leitor-corpo" ref={corpo}>
          {!doc && <p className="leitor-vazio leitor-vazio-grande">Escolha um arquivo .md na lista para ler.</p>}
          {doc?.erro && (
            <div className="leitor-aviso" role="status" data-tipo="erro">
              Não consegui mostrar este arquivo: {doc.erro}
            </div>
          )}
          {doc?.grande && (
            <div className="leitor-aviso" role="status" data-tipo="grande">
              Este arquivo tem {Math.round(doc.tamanho / KB)} KB, mais que o limite de 400 KB do Leitor. Não mostrei o conteúdo.
            </div>
          )}
          {doc && !doc.erro && !doc.grande && (
            <article
              className="md-corpo"
              data-arquivo={nomeDoDoc}
              onClick={aoClicarNoTexto}
              onKeyDown={aoTeclarNoTexto}
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
