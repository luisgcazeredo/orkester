// O editor de um fluxo (F2): nós e ligações numa área própria, com a geometria e o reducer puros de `editor/`. Não
// reaproveita o `Quadro.tsx` (preso à loja global, plano §1). O editor mexe num rascunho em memória: só o Salvar grava,
// e um fluxo ligado roda o que está salvo. Sair com o rascunho não salvo pede confirmação.
//
// Gestos: arrastar o fundo anda; Shift+arrastar seleciona por área; roda do mouse anda e Ctrl+roda dá zoom; arrastar a
// bolinha de saída até um nó liga; soltar no vazio abre a busca de nós já ligada; duplo clique abre o painel do nó.
// Teclas (editor/teclas.ts): Del, Ctrl+Z/Y, Ctrl+A, F2, Enter, Tab, 1, Ctrl+S, Esc. Copiar e colar pelos eventos
// `copy` e `paste`, com o JSON de `exportar` (o mesmo do `ork fluxo ver --json`).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent as PE } from 'react'
import { ArrowLeft, History, Maximize, Network, X, Minus, Play, Plus, Redo2, Save, ShieldAlert, TriangleAlert, Undo2 } from 'lucide-react'
import type { Execucao, FluxoExportado, FluxoGravado, Ligacao, NoDoFluxo, TipoDeNo } from '../../../../shared/fluxos/tipos'
import { CATALOGO, ehGatilho, faltaDoNo } from '../../../../shared/fluxos/nos'
import { colarNoFluxo, ehSensivel, faltaParaLigar, noSensivel, proximoIdDeNo } from '../../../../shared/fluxos/formato'
import { confirmar } from '../../ui/Perguntas'
import { guardarSaida } from '../../casca/paginas'
import { apiDoEditor } from './editor/api'
import { buscarNos, grupoDoNo } from './editor/busca'
import { deslocamentoLivre, deslocamentoParaColar, lerColagem, nomeAoColar, textoParaCopiar } from './editor/colar'
import {
  ALTURA_BASE,
  alvoDaLigacao,
  caixaEntre,
  caixaDoNoDoFluxo,
  curvaDaLigacao,
  curvaEntreNos,
  enquadrarNos,
  uniao,
  GRADE,
  medidasDoNo,
  noCentradoNaTela,
  naGrade,
  noEm,
  nosNaArea,
  portaDeEntrada,
  portaDeSaida,
  portasDeSaida,
  raioNoQuadro,
  telaParaQuadro,
  trazerAVista,
  zoomEm,
  type Caixa,
  type Ponto
} from './editor/geometria'
import { comoFluxo, estadoInicial, estaSujo, podeDesfazer, podeRefazer, recusaDeAdicionar, recusaDeLigar, recusaDeNome, reduzir, type EstadoDoEditor } from './editor/estado'
import { decidirTecla, type AcaoDaTecla } from './editor/teclas'
import { confirmarLigar } from './ConfirmarLigar'
import { descreverNosSensiveis } from './ligarSensivel'
import { PainelDoNo } from './PainelDoNo'
import { Execucoes } from './Execucoes'
import { FaixaDaExecucao, ItensNasLigacoes } from './execucoes/Desenho'
import { classeDaLigacao } from './execucoes/textos'
import { ICONES, usarContextoDoEspaco } from './nos'
import { espacoDasReferencias } from './nos/comum'
import { ContextoDaRede, type RedeDoFluxo } from './nos/Http'
import { faltaDeRede, mesmaLista, rotuloDaRede } from './nos/redeLocal'
import { abrirDocDoNo } from './DocDoNo'
import '../../estilos/fluxos-editor.css'

const erroDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const NOME_DO_NOVO = 'Fluxo novo'

// Rascunho não salvo aberto (para quem troca de página saber; a casca pode perguntar antes).
let rascunhoAberto = false
export const haRascunhoNaoSalvo = (): boolean => rascunhoAberto

const digitando = (alvo: EventTarget | null): boolean => {
  const el = alvo as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

type Gesto =
  | { tipo: 'andar'; inicio: Ponto; camera: { x: number; y: number } }
  | { tipo: 'mover'; inicio: Ponto; posicoes: Record<string, [number, number]>; mexeu: boolean; clicado: string; jaSelecionado: boolean }
  | { tipo: 'area'; inicio: Ponto; somar: boolean }
  | { tipo: 'ligar'; de: string; saida: number }

interface Busca {
  /** Onde o nó novo entra (no quadro). A escolha em si é sempre o painel da direita. */
  quadro: Ponto
  ligarDe?: { no: string; saida: number }
  /** Muda a cada abertura: abrir de outro lugar começa com a busca limpa. */
  vez: number
}

type Aviso = { texto: string; tom: 'ok' | 'perigo' | 'neutro' }

export interface PropsDoEditor {
  espacoId: string
  /** `null` = fluxo novo (ganha id no primeiro Salvar). */
  fluxoId: string | null
  /** O espaço é o desta janela; senão, só olhar. */
  editavel: boolean
  /** Volta para a lista (já confirmado, se havia rascunho). */
  aoSair: () => void
  /** Uma execução aberta (F3): pinta os nós e mostra os itens no painel. */
  execucao?: Execucao | null
  /** O fluxo ganhou id (primeiro Salvar) ou mudou no disco: a lista relê. */
  aoGravar?: (id: string) => void
  /** Rodar fluxo começou uma execução (a F3 abre). */
  aoRodar?: (execucaoId: string) => void
  /** A execução pedida (id), mesmo enquanto ainda lê; `execucao` é o detalhe dela, quando chega. */
  execucaoAberta?: string | null
  /** Por que a execução pedida não abriu (texto pronto do `usarExecucaoAberta`). */
  erroDaExecucao?: string | null
  /** Abrir (id) ou fechar (`null`) uma execução, pela aba Execuções ou pela faixa. */
  aoAbrirExecucao?: (execucaoId: string | null) => void
}

export function Editor({ espacoId, fluxoId, editavel, aoSair, execucao = null, aoGravar, aoRodar, execucaoAberta = null, erroDaExecucao = null, aoAbrirExecucao }: PropsDoEditor) {
  const [est, despachar] = useReducer(reduzir, undefined, () => estadoInicial({ nome: NOME_DO_NOVO, nos: [], ligacoes: [] }))
  const estRef = useRef<EstadoDoEditor>(est)
  estRef.current = est
  const [id, setId] = useState<string | null>(fluxoId)
  const [gravado, setGravado] = useState<FluxoGravado | null>(null)
  const [carregando, setCarregando] = useState(!!fluxoId)
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ligacaoMarcada, setLigacaoMarcada] = useState<Ligacao | null>(null)
  const [painel, setPainel] = useState<string | null>(null)
  // a aba Execuções (decisão do Maestro): a lista fica ao lado do quadro e o rascunho segue editável
  const [aba, setAba] = useState<'fluxo' | 'execucoes'>('fluxo')
  const [busca, setBusca] = useState<Busca | null>(null)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [provisoria, setProvisoria] = useState<{ de: Ponto; ate: Ponto } | null>(null)
  const [area, setArea] = useState<Caixa | null>(null)
  const gesto = useRef<Gesto | null>(null)
  /** O último toque num nó: o 2º toque no mesmo nó, logo depois, abre o popup dele. */
  const ultimoToque = useRef<{ id: string; t: number } | null>(null)
  const colou = useRef(false)
  // o id que este editor já tem na tela: a lista passar o id que o primeiro Salvar acabou de criar não relê o fluxo
  const idNaTela = useRef<string | null>(null)
  const mouse = useRef<Ponto | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const ctx = usarContextoDoEspaco(espacoId)
  const somenteLer = !editavel
  // rede local (1.9.6, #91): a lista de endereços (`host:porta`) que o HTTP deste fluxo pode chamar no computador ou na
  // rede do usuário. Permitir e tirar moram no nó HTTP; o selo do topo lista e tira. Fora do desfazer; vai junto no
  // Salvar e só vale para o usuário (o main ignora `rede` vindo de agente). O que está no disco vem do `gravado`: se não
  // pegou, o rascunho segue "não salvo".
  const [locais, setLocais] = useState<string[]>([])
  const locaisNoDisco = useMemo(() => gravado?.rede?.locaisPermitidos ?? [], [gravado])
  const [redeAberta, setRedeAberta] = useState(false)
  const listaDaRede = useRef<HTMLDivElement>(null)
  const seloDaRede = useRef<HTMLButtonElement>(null)
  // aberta, a lista recebe o foco (o Esc dela vale) e fecha com um clique fora dela e fora do selo
  useEffect(() => {
    if (!redeAberta) return
    listaDaRede.current?.focus({ preventScroll: true })
    const fora = (e: globalThis.PointerEvent): void => {
      const alvo = e.target as Node
      if (!listaDaRede.current?.contains(alvo) && !seloDaRede.current?.contains(alvo)) setRedeAberta(false)
    }
    window.addEventListener('pointerdown', fora, true)
    return () => window.removeEventListener('pointerdown', fora, true)
  }, [redeAberta])
  const redeMudou = !mesmaLista(locais, locaisNoDisco)
  const sujo = estaSujo(est) || redeMudou
  const sujoRef = useRef(sujo)
  sujoRef.current = sujo
  const { camera } = est

  useEffect(() => {
    rascunhoAberto = sujo
    return () => {
      rascunhoAberto = false
    }
  }, [sujo])

  const avisar = useCallback((texto: string, tom: Aviso['tom'] = 'neutro'): void => setAviso({ texto, tom }), [])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), aviso.tom === 'perigo' ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const tamanhoDaArea = (): { largura: number; altura: number } => {
    const r = areaRef.current?.getBoundingClientRect()
    return { largura: r?.width || 800, altura: r?.height || 500 }
  }

  // abrir ou fechar a coluna das execuções muda a largura da área: se o fluxo, que cabia, deixou de caber, enquadra de novo
  const abaAntes = useRef(aba)
  useEffect(() => {
    if (abaAntes.current === aba) return
    abaAntes.current = aba
    const s = estRef.current
    const todos = uniao(s.nos.map(caixaDoNoDoFluxo))
    if (todos && trazerAVista(todos, s.camera, tamanhoDaArea()) !== s.camera) despachar({ tipo: 'camera', camera: enquadrarNos(s.nos, tamanhoDaArea()) })
  }, [aba])

  // ---------------------------------------------------------------- ler

  useEffect(() => {
    if (fluxoId && fluxoId === idNaTela.current) return
    let vivo = true
    idNaTela.current = fluxoId
    setId(fluxoId)
    setPainel(null)
    setBusca(null)
    colou.current = false
    if (!fluxoId) {
      despachar({ tipo: 'carregar', fluxo: { nome: NOME_DO_NOVO, nos: [], ligacoes: [] }, camera: { x: 0, y: 0, zoom: 1 } })
      setGravado(null)
      setLocais([])
      setRedeAberta(false)
      setCarregando(false)
      // D2: o foco vai para o desenho, para o Ctrl+V do "Também dá para colar" valer sem clicar antes
      raiz.current?.focus({ preventScroll: true })
      return
    }
    setCarregando(true)
    apiDoEditor()
      .ler(espacoId, fluxoId)
      .then(
        (f) => {
          if (!vivo) return
          setCarregando(false)
          if (!f) return setErroDeLeitura('Esse fluxo não existe mais (foi apagado aqui, em outra janela ou por um agente).')
          setErroDeLeitura(null)
          setGravado(f)
          setLocais([...(f.rede?.locaisPermitidos ?? [])])
          setRedeAberta(false)
          despachar({ tipo: 'carregar', fluxo: f, camera: enquadrarNos(f.nos, tamanhoDaArea()) })
          // o foco estava no nome clicado na lista, que saiu da tela: vai para o desenho (se não foi para outro lugar)
          if (!raiz.current?.contains(document.activeElement)) raiz.current?.focus({ preventScroll: true })
        },
        (e: unknown) => {
          if (!vivo) return
          setCarregando(false)
          setErroDeLeitura(erroDe(e))
        }
      )
    return () => {
      vivo = false
    }
  }, [espacoId, fluxoId])

  /** Relê só os dados do disco (ligado, autor) sem mexer no rascunho. */
  const relerGravado = async (alvo: string): Promise<void> => {
    try {
      const f = await apiDoEditor().ler(espacoId, alvo)
      if (f) setGravado(f)
    } catch {
      /* o aviso do Salvar já disse o que importa */
    }
  }

  // ---------------------------------------------------------------- salvar, ligar, rodar, sair

  async function salvar(): Promise<string | null> {
    if (somenteLer || ocupado) return null
    const enviado = { nome: est.nome, nos: est.nos, ligacoes: est.ligacoes }
    // a rede vai sempre com a lista da tela (vazia = nenhum endereço local; sem a chave, o main não mexe). Igual ao disco
    // não muda nada; qualquer mudança na lista desliga o fluxo ligado até a confirmação.
    const corpo: FluxoExportado & { rede: { locaisPermitidos: string[] } } = { ...comoFluxo(est), rede: { locaisPermitidos: [...locais] } }
    const desligaPelaRede = !!gravado?.ligado && redeMudou
    setOcupado(true)
    try {
      const r = await apiDoEditor().gravar(espacoId, id, corpo)
      if (!r.ok) {
        avisar(`Não salvou: ${r.erro}`, 'perigo')
        return null
      }
      despachar({ tipo: 'marcarSalvo', de: enviado })
      idNaTela.current = r.id
      setId(r.id)
      // D8: o main diz por que desligou (nó sensível mudou, rede liberada…); sem isso, o texto da rede que a tela já sabe
      let texto = r.desligado ? `Salvo. ${r.desligado}` : desligaPelaRede ? 'Salvo. O fluxo ficou desligado: a lista de endereços locais mudou, e ligar pede a sua confirmação de novo.' : 'Salvo.'
      if (colou.current && gravado?.ligado) {
        const d = await apiDoEditor().ligar(espacoId, r.id, false)
        texto = d.ok ? 'Salvo. O fluxo ficou desligado porque recebeu nós colados: confira e ligue de novo.' : `Salvo, mas não desligou: ${d.erro}`
      }
      colou.current = false
      await relerGravado(r.id)
      aoGravar?.(r.id)
      avisar(texto, 'ok')
      return r.id
    } catch (e) {
      avisar(`Não salvou: ${erroDe(e)}`, 'perigo')
      return null
    } finally {
      setOcupado(false)
    }
  }

  /** Ligar e Rodar valem para o que está salvo: com rascunho, oferece salvar antes. Devolve o id, ou `null`. */
  async function salvoAntes(verbo: string): Promise<string | null> {
    if (!sujo && id) return id
    const r = await confirmar({
      titulo: `${verbo} o fluxo`,
      mensagem: `O fluxo ${verbo === 'Ligar' ? 'ligado' : 'rodado'} é o que está salvo, e há mudanças não salvas.`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'nao' },
        { rotulo: `Salvar e ${verbo.toLowerCase()}`, valor: 'sim', primario: true }
      ]
    })
    return r.botao === 'sim' ? salvar() : null
  }

  async function alternarLigado(): Promise<void> {
    if (somenteLer || ocupado) return
    const ligar = !gravado?.ligado
    if (ligar) {
      const falta = faltaParaLigar({ nos: [...est.nos] })
      if (falta) return avisar(`Não liga: ${falta}`, 'perigo')
    }
    const alvo = ligar ? await salvoAntes('Ligar') : id
    if (!alvo) return
    setOcupado(true)
    try {
      // sensível: a confirmação nó por nó (F4) sobre o que está no disco, não sobre o rascunho
      const lido = ligar ? await apiDoEditor().ler(espacoId, alvo) : null
      if (ligar && !lido) return avisar('Não liga: o fluxo não está mais no disco.', 'perigo')
      const mostrado = lido && ehSensivel(lido) ? await confirmarLigar(lido) : undefined
      if (mostrado === null) return
      const r = await apiDoEditor().ligar(espacoId, alvo, ligar, mostrado)
      if (!r.ok) avisar(`Não ${ligar ? 'ligou' : 'desligou'}: ${r.erro}`, 'perigo')
      else avisar(ligar ? 'Ligado: dispara sozinho a partir de agora.' : 'Desligado.', 'ok')
      await relerGravado(alvo)
      aoGravar?.(alvo)
    } catch (e) {
      avisar(erroDe(e), 'perigo')
    } finally {
      setOcupado(false)
    }
  }

  async function rodar(): Promise<void> {
    if (somenteLer || ocupado) return
    if (!est.nos.some((n) => n.tipo === 'gatilho.manual')) return avisar('Para rodar daqui, ponha um gatilho Manual: o Rodar fluxo entra por ele.', 'perigo')
    const alvo = await salvoAntes('Rodar')
    if (!alvo) return
    setOcupado(true)
    try {
      // sensível com nó ainda não aprovado (ou mudado desde a aprovação): a mesma confirmação, sobre o que está no disco
      const lido = await apiDoEditor().ler(espacoId, alvo)
      if (!lido) return avisar('Não rodou: o fluxo não está mais no disco.', 'perigo')
      // a lista de endereços locais também entra no que se aprova: desligado com ela, a tela não sabe se já foi aprovada e pergunta
      const pendente = ehSensivel(lido) && ((!lido.ligado && !!lido.rede?.locaisPermitidos?.length) || (await descreverNosSensiveis(lido)).some((n) => n.estado !== 'igual'))
      const mostrado = pendente ? await confirmarLigar(lido, 'rodar') : undefined
      if (mostrado === null) return
      const r = await apiDoEditor().rodar(espacoId, alvo, mostrado)
      if (!r.ok) avisar(`Não rodou: ${r.erro}`, 'perigo')
      else {
        // o rodar só volta com a execução terminada: o resultado aparece na faixa do alto, não precisa de aviso
        setAba('execucoes')
        aoRodar?.(r.execucao)
      }
    } catch (e) {
      avisar(erroDe(e), 'perigo')
    } finally {
      setOcupado(false)
    }
  }

  /** Com rascunho não salvo, pergunta: `true` = pode sair (salvou ou descartou); `false` = fica. */
  async function podeSair(): Promise<boolean> {
    if (!sujo || !editavel) return true
    const r = await confirmar({
      titulo: 'Sair do editor',
      mensagem: 'Há mudanças não salvas neste fluxo.',
      botoes: [
        { rotulo: 'Continuar editando', valor: 'ficar' },
        { rotulo: 'Descartar', valor: 'descartar', perigo: true },
        { rotulo: 'Salvar e sair', valor: 'salvar', primario: true }
      ]
    })
    if (r.botao === 'salvar') return !!(await salvar())
    return r.botao === 'descartar'
  }
  const podeSairRef = useRef(podeSair)
  podeSairRef.current = podeSair

  async function sair(): Promise<void> {
    if (await podeSair()) aoSair()
  }

  // Trocar de página ou de espaço com rascunho: a casca pergunta a esta guarda; ela segura, pergunta e, se a pessoa deixar, refaz.
  useEffect(() => {
    let liberado = false
    const soltar = guardarSaida({
      trocar: (refazer) => {
        if (liberado || !sujoRef.current || !editavel) return true
        void podeSairRef.current().then((pode) => {
          if (!pode) return
          // libera só durante o refazer: ele confere a guarda antes de esperar qualquer coisa; se a troca falhar depois
          // (não salvou, não reservou o espaço), a próxima saída pergunta de novo
          liberado = true
          try {
            refazer()
          } finally {
            liberado = false
          }
        })
        return false
      },
      pendente: () => editavel && sujoRef.current,
      nome: () => estRef.current.nome || NOME_DO_NOVO
    })
    return soltar
  }, [editavel])

  // ---------------------------------------------------------------- nós

  /** Põe um nó do `tipo` no ponto (ligado à saída, se veio de uma); abre o painel quando ele tem o que ajustar. */
  function adicionar(tipo: TipoDeNo, b: Busca): void {
    const motivo = recusaDeAdicionar(est)
    if (motivo) return avisar(motivo, 'perigo')
    const novoId = proximoIdDeNo(new Set(est.nos.map((n) => n.id)))
    const { altura } = medidasDoNo(tipo)
    const posicao: [number, number] = [naGrade(b.quadro.x), naGrade(b.quadro.y - (b.ligarDe ? altura / 2 : 0))]
    if (b.ligarDe) {
      const provavel: NoDoFluxo = { id: novoId, nome: novoId, tipo, versaoDoTipo: 1, posicao, ajustes: {} }
      const recusa = recusaDeLigar({ nos: [...est.nos, provavel], ligacoes: est.ligacoes }, b.ligarDe.no, b.ligarDe.saida, novoId)
      if (recusa) return avisar(recusa, 'perigo')
    }
    despachar({ tipo: 'adicionarNo', no: tipo, posicao, id: novoId, ligarDe: b.ligarDe })
    setBusca(null)
    setLigacaoMarcada(null)
    if (tipo !== 'gatilho.manual') setPainel(novoId)
    raiz.current?.focus()
  }

  const centroDaVista = (): Ponto => {
    const t = tamanhoDaArea()
    return telaParaQuadro({ x: t.largura / 2, y: t.altura / 2 }, camera)
  }

  function abrirBusca(quadro?: Ponto, ligarDe?: Busca['ligarDe']): void {
    if (somenteLer) return
    const p = quadro ?? (() => {
      const c = centroDaVista()
      return { x: c.x - 100, y: c.y - ALTURA_BASE / 2 }
    })()
    setBusca({ quadro: p, ligarDe, vez: Date.now() })
  }

  /** A escolha a partir de uma saída: o nó novo nasce à direita do nó, na altura da saída, e já ligado a ela. */
  function abrirBuscaDaSaida(no: NoDoFluxo, saida: number): void {
    const c = caixaDoNoDoFluxo(no)
    abrirBusca({ x: c.x + c.largura + 80, y: portaDeSaida(no, saida)!.y }, { no: no.id, saida })
  }

  /** D2: fechar a lista da rede local pelo X ou Esc tira o botão focado da tela; o foco volta ao desenho (Ctrl+S, Ctrl+V). */
  function fecharRede(): void {
    setRedeAberta(false)
    raiz.current?.focus({ preventScroll: true })
  }

  /** Permitir ou tirar um endereço local: muda o rascunho; com o fluxo ligado, avisa que salvar o desliga até confirmar. */
  function mudarRede(autoridade: string, permitir: boolean): void {
    if (somenteLer) return
    setLocais((l) => (permitir ? (l.includes(autoridade) ? l : [...l, autoridade]) : l.filter((a) => a !== autoridade)))
    if (!permitir && locais.length <= 1) fecharRede()
    const feito = permitir ? `${autoridade} permitido neste fluxo` : `Permissão de ${autoridade} tirada`
    avisar(gravado?.ligado ? `${feito}. Vale ao salvar; o fluxo ligado fica desligado até você confirmar de novo.` : `${feito}. Vale ao salvar.`, gravado?.ligado ? 'perigo' : 'neutro')
  }
  const redeDoFluxo: RedeDoFluxo = { locais, permitir: somenteLer ? null : (a) => mudarRede(a, true), tirar: somenteLer ? null : (a) => mudarRede(a, false) }

  function fecharPainel(): void {
    setPainel(null)
    raiz.current?.focus({ preventScroll: true })
  }

  function apagarMarcados(): void {
    if (somenteLer) return
    if (ligacaoMarcada) {
      despachar({ tipo: 'desligar', ...ligacaoMarcada })
      setLigacaoMarcada(null)
      return
    }
    if (!est.selecao.length) return
    if (painel && est.selecao.includes(painel)) setPainel(null)
    despachar({ tipo: 'apagar', ids: est.selecao })
  }

  // ---------------------------------------------------------------- teclas

  function executar(a: AcaoDaTecla): void {
    switch (a) {
      case 'apagar':
        return apagarMarcados()
      case 'desfazer':
        return despachar({ tipo: 'desfazer' })
      case 'refazer':
        return despachar({ tipo: 'refazer' })
      case 'selecionarTudo':
        setLigacaoMarcada(null)
        return despachar({ tipo: 'selecionarTudo' })
      case 'renomear':
        return setRenomeando(est.selecao[0] ?? null)
      case 'salvar':
        return void salvar()
      case 'buscar': {
        const so = est.selecao.length === 1 ? est.nos.find((n) => n.id === est.selecao[0]) : undefined
        return so ? abrirBuscaDaSaida(so, 0) : abrirBusca()
      }
      case 'fechar':
        if (busca) return setBusca(null)
        if (renomeando) return setRenomeando(null)
        if (painel) return fecharPainel()
        setLigacaoMarcada(null)
        return despachar({ tipo: 'selecionar', ids: [] })
      case 'abrirPainel':
        return setPainel(est.selecao[0] ?? null)
      case 'enquadrar':
        return despachar({ tipo: 'camera', camera: enquadrarNos(est.nos, tamanhoDaArea()) })
    }
  }

  function aoTeclar(e: KeyboardEvent): void {
    const a = decidirTecla(e, {
      digitando: digitando(e.target),
      editavel,
      temSelecao: est.selecao.length > 0,
      temLigacao: !!ligacaoMarcada,
      umNo: est.selecao.length === 1,
      camadaAberta: !!busca || !!renomeando || !!painel
    })
    if (!a) return
    // Esc dentro de um campo do painel só tira o foco dele, não fecha nada
    if (a === 'fechar' && digitando(e.target) && !busca && !renomeando) {
      ;(e.target as HTMLElement).blur()
      // dentro do popup do nó, o foco fica no popup (o próximo Esc fecha ele); fora, volta ao editor
      ;((e.target as HTMLElement).closest<HTMLElement>('[data-painel-do-no]') ?? raiz.current)?.focus({ preventScroll: true })
      e.preventDefault()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    executar(a)
  }

  // ---------------------------------------------------------------- copiar e colar

  useEffect(() => {
    // com o foco no popup do nó ou na escolha, copiar e colar não mexem no quadro de trás
    const dentro = (): boolean =>
      !!raiz.current && raiz.current.contains(document.activeElement) && !digitando(document.activeElement) && !document.activeElement?.closest('[data-painel-do-no], [data-escolha-de-no]')
    const copiar = (e: ClipboardEvent): void => {
      const s = estRef.current
      // sem seleção, copia o fluxo inteiro (o único que leva o nome junto ao colar num fluxo novo)
      if (!dentro() || !s.nos.length) return
      e.preventDefault()
      const sel = s.selecao.length ? s.selecao : undefined
      e.clipboardData?.setData('text/plain', textoParaCopiar(s, sel))
      setAviso({ texto: !sel ? 'Fluxo inteiro copiado.' : sel.length === 1 ? '1 nó copiado.' : `${sel.length} nós copiados.`, tom: 'ok' })
    }
    const colar = (e: ClipboardEvent): void => {
      if (!dentro() || !editavel) return
      e.preventDefault()
      const s = estRef.current
      const c = lerColagem(e.clipboardData?.getData('text/plain') ?? '', { cartoes: [...ctx.agentes, ...ctx.shells], colunas: ctx.colunas })
      if (!c.ok) return setAviso({ texto: `Nada colado: ${c.motivo}.`, tom: 'perigo' })
      const cabe = colarNoFluxo({ nos: [...s.nos], ligacoes: [...s.ligacoes] }, { nos: c.nos, ligacoes: c.ligacoes })
      if (typeof cabe === 'string') return setAviso({ texto: `Nada colado: ${cabe}.`, tom: 'perigo' })
      const cam = s.camera
      const t = tamanhoDaArea()
      const alvo = mouse.current ?? telaParaQuadro({ x: t.largura / 2, y: t.altura / 2 }, cam)
      // sugestão 6: o fluxo inteiro colado num "Novo fluxo" ainda vazio e sem nome leva junto o nome dele; nós soltos, não
      const levaNome = nomeAoColar(c, { salvo: !!idNaTela.current, nos: s.nos.length, nome: s.nome }, NOME_DO_NOVO)
      if (levaNome) despachar({ tipo: 'renomearFluxo', nome: levaNome })
      despachar({ tipo: 'colar', nos: c.nos, ligacoes: c.ligacoes, deslocar: deslocamentoLivre(c.nos, s.nos, deslocamentoParaColar(c.nos, alvo, GRADE)) })
      colou.current = true
      setLigacaoMarcada(null)
      const partes = [c.nos.length === 1 ? '1 nó colado' : `${c.nos.length} nós colados`]
      if (c.incompletos) partes.push(c.incompletos === 1 ? '1 com Falta (ajuste a completar)' : `${c.incompletos} com Falta (ajustes a completar)`)
      setAviso({ texto: `${partes.join(', ')}.${levaNome ? ` O fluxo ficou com o nome "${levaNome}".` : ''}${gravado?.ligado ? ' Ao salvar, o fluxo fica desligado até você conferir e ligar de novo.' : ''}`, tom: 'ok' })
    }
    document.addEventListener('copy', copiar)
    document.addEventListener('paste', colar)
    return () => {
      document.removeEventListener('copy', copiar)
      document.removeEventListener('paste', colar)
    }
    // centroDaVista lê a câmera do estado de agora pelo estRef; os outros vêm das dependências
  }, [editavel, ctx, gravado?.ligado])

  // ---------------------------------------------------------------- gestos na área

  const pontoNaTela = (e: { clientX: number; clientY: number }): Ponto => {
    const r = areaRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  // roda do mouse: anda; Ctrl+roda: zoom no ponteiro (o ouvinte não é passivo para poder segurar a rolagem)
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const roda = (e: WheelEvent): void => {
      // a roda em cima da escolha de nó rola a lista dela, não anda o desenho
      if ((e.target as HTMLElement).closest('[data-escolha-de-no]')) return
      e.preventDefault()
      const cam = estRef.current.camera
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        despachar({ tipo: 'camera', camera: zoomEm(cam, cam.zoom * Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top }) })
      } else despachar({ tipo: 'camera', camera: { ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY } })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [carregando])

  function comecar(e: PE, g: Gesto): void {
    gesto.current = g
    areaRef.current?.setPointerCapture(e.pointerId)
    raiz.current?.focus({ preventScroll: true })
  }

  function noFundo(e: PE<HTMLDivElement>): void {
    if (e.button !== 0 && e.button !== 1) return
    setBusca(null)
    setLigacaoMarcada(null)
    setRenomeando(null)
    const tela = pontoNaTela(e)
    if (e.button === 0 && e.shiftKey) return comecar(e, { tipo: 'area', inicio: telaParaQuadro(tela, camera), somar: true })
    if (e.button === 0 && est.selecao.length) despachar({ tipo: 'selecionar', ids: [] })
    comecar(e, { tipo: 'andar', inicio: tela, camera: { x: camera.x, y: camera.y } })
  }

  function noNo(e: PE, no: NoDoFluxo): void {
    if (e.button !== 0) return
    e.stopPropagation()
    // duplo clique pelo pointerdown: o 1º toque captura o ponteiro na área, e aí o dblclick do navegador vai para a área,
    // não para o nó (mesma causa do "+" do fluxo vazio)
    const antes = ultimoToque.current
    ultimoToque.current = { id: no.id, t: e.timeStamp }
    if (antes && antes.id === no.id && e.timeStamp - antes.t < 400 && !e.shiftKey) {
      ultimoToque.current = null
      setBusca(null)
      setPainel(no.id)
      return
    }
    setBusca(null)
    setLigacaoMarcada(null)
    const jaSelecionado = est.selecao.includes(no.id)
    if (e.shiftKey) {
      despachar({ tipo: 'selecionar', ids: jaSelecionado ? est.selecao.filter((x) => x !== no.id) : [...est.selecao, no.id] })
      return
    }
    const ids = jaSelecionado ? est.selecao : [no.id]
    if (!jaSelecionado) despachar({ tipo: 'selecionar', ids })
    if (painel && painel !== no.id) setPainel(no.id)
    raiz.current?.focus({ preventScroll: true })
    if (somenteLer) return
    const posicoes: Record<string, [number, number]> = {}
    for (const n of est.nos) if (ids.includes(n.id)) posicoes[n.id] = [n.posicao[0], n.posicao[1]]
    comecar(e, { tipo: 'mover', inicio: telaParaQuadro(pontoNaTela(e), camera), posicoes, mexeu: false, clicado: no.id, jaSelecionado })
  }

  function naPorta(e: PE, no: NoDoFluxo, saida: number): void {
    if (e.button !== 0 || somenteLer) return
    e.stopPropagation()
    setBusca(null)
    const de = portaDeSaida(no, saida)!
    setProvisoria({ de, ate: de })
    comecar(e, { tipo: 'ligar', de: no.id, saida })
  }

  function aoMover(e: PE<HTMLDivElement>): void {
    const tela = pontoNaTela(e)
    const p = telaParaQuadro(tela, camera)
    mouse.current = p
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'andar') {
      despachar({ tipo: 'camera', camera: { ...camera, x: g.camera.x + tela.x - g.inicio.x, y: g.camera.y + tela.y - g.inicio.y } })
    } else if (g.tipo === 'mover') {
      const dx = p.x - g.inicio.x
      const dy = p.y - g.inicio.y
      if (!g.mexeu && Math.hypot(dx * camera.zoom, dy * camera.zoom) < 3) return
      g.mexeu = true
      const posicoes: Record<string, [number, number]> = {}
      for (const [i, [x, y]] of Object.entries(g.posicoes)) posicoes[i] = e.altKey ? [Math.round(x + dx), Math.round(y + dy)] : [naGrade(x + dx), naGrade(y + dy)]
      despachar({ tipo: 'mover', posicoes, gesto: true })
    } else if (g.tipo === 'area') {
      setArea(caixaEntre(g.inicio, p))
    } else if (g.tipo === 'ligar') {
      setProvisoria((v) => (v ? { ...v, ate: p } : v))
    }
  }

  function aoSoltar(e: PE<HTMLDivElement>): void {
    const g = gesto.current
    gesto.current = null
    if (areaRef.current?.hasPointerCapture(e.pointerId)) areaRef.current.releasePointerCapture(e.pointerId)
    if (!g) return
    const p = telaParaQuadro(pontoNaTela(e), camera)
    if (g.tipo === 'mover') {
      if (g.mexeu) despachar({ tipo: 'fimDoGesto' })
      else if (g.jaSelecionado && est.selecao.length > 1) despachar({ tipo: 'selecionar', ids: [g.clicado] })
    } else if (g.tipo === 'area') {
      const caixa = caixaEntre(g.inicio, p)
      setArea(null)
      if (caixa.largura > 2 || caixa.altura > 2) despachar({ tipo: 'selecionar', ids: nosNaArea(est.nos, caixa), somar: g.somar })
    } else if (g.tipo === 'ligar') {
      setProvisoria(null)
      const alvo = alvoDaLigacao(est.nos, p, raioNoQuadro(camera.zoom, 16), g.de)
      if (alvo) {
        const recusa = recusaDeLigar(est, g.de, g.saida, alvo)
        if (recusa) avisar(`Não liga: ${recusa}.`, 'perigo')
        else despachar({ tipo: 'ligar', de: g.de, saida: g.saida, para: alvo })
        return
      }
      const sob = noEm(est.nos, p)
      if (sob === g.de) return
      if (sob) return avisar('Gatilho não recebe ligação: ele é o começo do fluxo.', 'perigo')
      abrirBusca({ x: p.x, y: p.y }, { no: g.de, saida: g.saida })
    }
  }

  // ---------------------------------------------------------------- desenho

  const porId = useMemo(() => new Map(est.nos.map((n) => [n.id, n])), [est.nos])
  const saidasLigadas = useMemo(() => new Set(est.ligacoes.map((l) => `${l.de}:${l.saida}`)), [est.ligacoes])
  const nomesDosNos = useMemo(() => Object.fromEntries(est.nos.map((n) => [n.id, n.nome])), [est.nos])
  const faltas = useMemo(() => {
    const m = new Map<string, string>()
    // a regra é a do Motor (#82): validador, "a escolher" e coluna/cartão que saiu do espaço
    const espaco = espacoDasReferencias(ctx)
    for (const n of est.nos) {
      // e a rede local (#91): HTTP para endereço local ainda não permitido neste fluxo (ou recusado) mostra Falta
      const falta = faltaDoNo(n, espaco) ?? (n.tipo === 'fora.http' ? faltaDeRede(typeof n.ajustes.url === 'string' ? n.ajustes.url : '', locais) : null)
      if (falta) m.set(n.id, falta)
    }
    return m
  }, [est.nos, ctx, locais])
  const noDoPainel = painel ? porId.get(painel) : undefined
  const ligado = !!gravado?.ligado
  const mesmo = (a: Ligacao | null, b: Ligacao): boolean => !!a && a.de === b.de && a.saida === b.saida && a.para === b.para

  if (erroDeLeitura)
    return (
      <div className="ed ed-erro-geral" data-fluxo-editor>
        <p>{erroDeLeitura}</p>
        <button type="button" className="ed-botao" onClick={aoSair}>
          <ArrowLeft size={14} /> Voltar à lista
        </button>
      </div>
    )

  const tamanhoDaGrade = GRADE * camera.zoom
  return (
    <div className="ed" ref={raiz} tabIndex={-1} onKeyDown={aoTeclar} data-fluxo-editor={id ?? 'novo'}>
      <header className="ed-topo">
        <button type="button" className="ed-botao" onClick={() => void sair()} title="Voltar à lista de fluxos">
          <ArrowLeft size={14} /> Fluxos
        </button>
        <input
          className="ed-nome-do-fluxo"
          aria-label="Nome do fluxo"
          value={est.nome}
          maxLength={80}
          disabled={somenteLer}
          placeholder="Nome do fluxo"
          onChange={(e) => despachar({ tipo: 'renomearFluxo', nome: e.target.value })}
          onBlur={() => despachar({ tipo: 'fimDoGesto' })}
        />
        {sujo && editavel && <span className="ed-sujo">não salvo</span>}
        {somenteLer && <span className="ed-selo">outro espaço: só olhar</span>}
        <div className="ed-abas" role="tablist" aria-label="Fluxo ou execuções">
          <button type="button" role="tab" aria-selected={aba === 'fluxo'} className={`ed-aba ${aba === 'fluxo' ? 'ativa' : ''}`} onClick={() => setAba('fluxo')} data-aba-do-editor="fluxo">
            Fluxo
          </button>
          <button type="button" role="tab" aria-selected={aba === 'execucoes'} className={`ed-aba ${aba === 'execucoes' ? 'ativa' : ''}`} onClick={() => setAba('execucoes')} data-aba-do-editor="execucoes">
            <History size={14} /> Execuções
          </button>
        </div>
        <span className="ed-cresce" />
        {locais.length > 0 && (
          <button
            ref={seloDaRede}
            type="button"
            className="ed-botao ed-selo-rede"
            aria-expanded={redeAberta}
            title="Endereços do seu computador ou da sua rede que o HTTP deste fluxo pode chamar"
            onClick={() => setRedeAberta((a) => !a)}
            data-selo-rede={locais.length}
          >
            <Network size={14} /> {rotuloDaRede(locais.length)}
          </button>
        )}
        {editavel && (
          <>
            <button type="button" className="ed-icone" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!podeDesfazer(est)} onClick={() => despachar({ tipo: 'desfazer' })}>
              <Undo2 size={16} />
            </button>
            <button type="button" className="ed-icone" title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={!podeRefazer(est)} onClick={() => despachar({ tipo: 'refazer' })}>
              <Redo2 size={16} />
            </button>
            <button type="button" className="ed-botao" title="Adicionar nó (Tab)" onClick={() => executar('buscar')} data-mais-no>
              <Plus size={14} /> Nó
            </button>
            <button type="button" className="ed-botao" title="Roda o que está salvo, pelo gatilho Manual" disabled={ocupado} onClick={() => void rodar()}>
              <Play size={14} /> Rodar fluxo
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={ligado}
              className={`ed-interruptor ${ligado ? 'ligado' : ''}`}
              disabled={ocupado || (!id && !est.nos.length)}
              title={ligado ? 'Ligado: dispara sozinho. Clique para desligar.' : 'Desligado. Clique para ligar.'}
              onClick={() => void alternarLigado()}
            >
              <span className="ed-interruptor-bola" />
              {ligado ? 'Ligado' : 'Desligado'}
            </button>
            <button type="button" className="ed-botao primario" title="Salvar (Ctrl+S)" disabled={ocupado || (!sujo && !!id)} onClick={() => void salvar()}>
              <Save size={14} /> Salvar
            </button>
          </>
        )}
      </header>
      {execucao && <FaixaDaExecucao execucao={execucao} nomesDosNos={nomesDosNos} aoFechar={() => aoAbrirExecucao?.(null)} />}
      {redeAberta && locais.length > 0 && (
        <div className="ed-rede-local" ref={listaDaRede} tabIndex={-1} role="dialog" aria-label="Rede local deste fluxo" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), fecharRede())} data-lista-rede>
          <div className="ed-rede-topo">
            <strong>{rotuloDaRede(locais.length)}</strong>
            <button type="button" className="ed-icone" aria-label="Fechar a lista" title="Fechar (Esc)" onClick={fecharRede}>
              <X size={14} />
            </button>
          </div>
          <p className="ed-rede-texto">
            O HTTP deste fluxo pode chamar estes endereços do seu computador ou da sua rede local. Qualquer outro endereço local é
            recusado. Para permitir um novo, abra o nó HTTP que o usa.
          </p>
          <ul className="ed-rede-lista">
            {locais.map((a) => (
              <li key={a} data-rede-endereco={a}>
                <span className="ed-mono">{a}</span>
                {!somenteLer && (
                  <button type="button" className="ed-botao" onClick={() => mudarRede(a, false)} data-rede-tirar={a}>
                    Tirar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!somenteLer && <p className="ed-rede-texto suave">Mudar a lista vale ao salvar; um fluxo ligado fica desligado até você confirmar de novo.</p>}
        </div>
      )}
      {aviso && (
        <div className={`ed-aviso tom-${aviso.tom}`} role={aviso.tom === 'perigo' ? 'alert' : 'status'}>
          {aviso.texto}
        </div>
      )}
      <div className={`ed-corpo ${aba === 'execucoes' ? 'com-lado' : ''}`}>
        <div
          className="ed-area"
          ref={areaRef}
          style={{ backgroundSize: `${tamanhoDaGrade}px ${tamanhoDaGrade}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }}
          onPointerDown={noFundo}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          onPointerLeave={() => (mouse.current = null)}
          onDoubleClick={(e) => {
            // com o ponteiro capturado no 1º toque, o navegador entrega à área o duplo clique dado num nó: abre esse nó (sem
            // depender do 2º toque do noNo); no vazio, abre a escolha de nó
            const p = telaParaQuadro(pontoNaTela(e), camera)
            if (e.target !== areaRef.current || painel) return
            const sob = noEm(est.nos, p)
            if (sob) {
              setBusca(null)
              setPainel(sob)
            } else abrirBusca(p)
          }}
          data-carregando={carregando ? '' : undefined}
        >
          <div className="ed-camada" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
            <svg className="ed-ligacoes" aria-hidden>
              {est.ligacoes.map((l) => {
                const d = curvaEntreNos(porId.get(l.de), l.saida, porId.get(l.para))
                if (!d) return null
                const marcada = mesmo(ligacaoMarcada, l)
                return (
                  <g key={`${l.de}:${l.saida}:${l.para}`} className={`ed-ligacao ${marcada ? 'marcada' : ''} ${classeDaLigacao(l, execucao)}`}>
                    <path
                      className="ed-ligacao-toque"
                      d={d}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        e.stopPropagation()
                        raiz.current?.focus({ preventScroll: true })
                        setLigacaoMarcada(l)
                        despachar({ tipo: 'selecionar', ids: [] })
                      }}
                    />
                    <path className="ed-ligacao-linha" d={d} />
                  </g>
                )
              })}
              <ItensNasLigacoes nos={est.nos} ligacoes={est.ligacoes} execucao={execucao} />
              {provisoria && <path className="ed-ligacao-linha provisoria" d={curvaDaLigacao(provisoria.de, provisoria.ate)} />}
            </svg>
            {est.nos.map((no) => (
              <NoNaTela
                key={no.id}
                no={no}
                selecionado={est.selecao.includes(no.id)}
                falta={faltas.get(no.id)}
                estado={execucao?.nos[no.id]?.estado}
                renomeando={renomeando === no.id}
                somenteLer={somenteLer}
                recusaDeNome={(nome) => recusaDeNome(est, no.id, nome)}
                aoRenomear={(nome) => {
                  setRenomeando(null)
                  if (nome !== null) despachar({ tipo: 'renomearNo', id: no.id, nome })
                  raiz.current?.focus({ preventScroll: true })
                }}
                aoApertar={(e) => noNo(e, no)}
                aoApertarPorta={(e, s) => naPorta(e, no, s)}
                aoAbrir={() => setPainel(no.id)}
                saidaLivre={(i) => editavel && !provisoria && !saidasLigadas.has(`${no.id}:${i}`)}
                aoMais={(i) => abrirBuscaDaSaida(no, i)}
              />
            ))}
            {area && <div className="ed-area-selecao" style={{ left: area.x, top: area.y, width: area.largura, height: area.altura }} />}
          </div>
          {!carregando && !est.nos.length && (
            // o pointerdown para aqui: se chegasse ao noFundo da área, ele captura o ponteiro na área (setPointerCapture) e o
            // Chromium manda o click para a área, não para o botão; o "+" só abria pelo teclado ou pelo "+ Nó" de cima
            <div className="ed-vazio" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              {editavel ? (
                <button
                  type="button"
                  className="ed-primeiro"
                  onClick={(e) => {
                    // o nó nasce onde está o "+"
                    const r = e.currentTarget.querySelector('.ed-primeiro-mais')!.getBoundingClientRect()
                    abrirBusca(noCentradoNaTela(pontoNaTela({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), camera))
                  }}
                  data-primeiro-no
                >
                  <span className="ed-primeiro-mais" aria-hidden>
                    <Plus size={36} strokeWidth={1.5} />
                  </span>
                  <span className="ed-primeiro-texto">Adicionar o primeiro nó</span>
                  <span className="suave">Um fluxo começa por um gatilho: o que faz ele disparar.</span>
                </button>
              ) : (
                <p>Um fluxo começa por um gatilho: o que faz ele disparar.</p>
              )}
              <p className="suave">Também dá para colar (Ctrl+V) um fluxo copiado do Orkester ou de <code>ork fluxo ver --json</code>.</p>
            </div>
          )}
          {carregando && <p className="ed-vazio suave">Lendo o fluxo…</p>}
          {busca && <EscolhaDeNo key={busca.vez} busca={busca} aoEscolher={(t) => adicionar(t, busca)} aoFechar={() => (setBusca(null), raiz.current?.focus({ preventScroll: true }))} />}
          <div className="ed-zoom" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="ed-icone" title="Diminuir" aria-label="Diminuir" onClick={() => despachar({ tipo: 'camera', camera: zoomEm(camera, camera.zoom / 1.2, centroNaTela(tamanhoDaArea())) })}>
              <Minus size={14} />
            </button>
            <span className="suave">{Math.round(camera.zoom * 100)}%</span>
            <button type="button" className="ed-icone" title="Aumentar" aria-label="Aumentar" onClick={() => despachar({ tipo: 'camera', camera: zoomEm(camera, camera.zoom * 1.2, centroNaTela(tamanhoDaArea())) })}>
              <Plus size={14} />
            </button>
            <button type="button" className="ed-icone" title="Mostrar tudo (1)" aria-label="Mostrar tudo" onClick={() => executar('enquadrar')}>
              <Maximize size={14} />
            </button>
          </div>
        </div>
        {noDoPainel && (
          <ContextoDaRede.Provider value={redeDoFluxo}>
            <PainelDoNo
              no={noDoPainel}
              ctx={ctx}
              somenteLer={somenteLer}
              execucao={execucao?.nos[noDoPainel.id] ?? null}
              recusaDeNome={(nome) => recusaDeNome(est, noDoPainel.id, nome)}
              aoRenomear={(nome) => despachar({ tipo: 'renomearNo', id: noDoPainel.id, nome })}
              aoAjustar={(m) => despachar({ tipo: 'ajustar', id: noDoPainel.id, ...m })}
              aoFechar={fecharPainel}
            />
          </ContextoDaRede.Provider>
        )}
        {aba === 'execucoes' && (
          <aside className="ed-lado" data-lado-execucoes>
            {erroDaExecucao && (
              <p className="exec-erro" role="alert">
                {erroDaExecucao}
              </p>
            )}
            <Execucoes espacoId={espacoId} fluxoId={id} abertaId={execucaoAberta} aoAbrir={(e) => aoAbrirExecucao?.(e)} nomesDosNos={nomesDosNos} />
          </aside>
        )}
      </div>
    </div>
  )
}

const centroNaTela = (t: { largura: number; altura: number }): Ponto => ({ x: t.largura / 2, y: t.altura / 2 })

// ---------------------------------------------------------------- um nó

function NoNaTela({ no, selecionado, falta, estado, renomeando, somenteLer, recusaDeNome, aoRenomear, aoApertar, aoApertarPorta, aoAbrir, saidaLivre, aoMais }: {
  no: NoDoFluxo
  selecionado: boolean
  falta: string | undefined
  estado: 'ok' | 'erro' | 'nao-rodou' | undefined
  renomeando: boolean
  somenteLer: boolean
  recusaDeNome: (nome: string) => string | null
  /** `null` = desistiu. */
  aoRenomear: (nome: string | null) => void
  aoApertar: (e: PE) => void
  aoApertarPorta: (e: PE, saida: number) => void
  aoAbrir: () => void
  /** A saída não tem ligação e dá para editar: mostra o "+" dela. */
  saidaLivre: (saida: number) => boolean
  aoMais: (saida: number) => void
}) {
  const def = CATALOGO[no.tipo]
  const Icone = ICONES[no.tipo]
  const caixa = caixaDoNoDoFluxo(no)
  const entrada = portaDeEntrada(no)
  const saidas = portasDeSaida(no)
  const rotulos = def.saidas.length > 1 ? def.saidas : null
  const classes = ['ed-no', `cat-${def.categoria}`, ehGatilho(no.tipo) ? 'gatilho' : '', selecionado ? 'selecionado' : '', estado ? `exec-${estado}` : ''].filter(Boolean).join(' ')
  return (
    <div
      className={classes}
      style={{ left: caixa.x, top: caixa.y, width: caixa.largura, height: caixa.altura }}
      data-no={no.id}
      data-tipo={no.tipo}
      onPointerDown={aoApertar}
      onDoubleClick={(e) => {
        e.stopPropagation()
        aoAbrir()
      }}
    >
      <span className={`ed-no-icone cat-${def.categoria}`} aria-hidden>
        <Icone size={16} />
      </span>
      <span className="ed-no-textos">
        {renomeando ? <Renomear nome={no.nome} recusa={recusaDeNome} aoTerminar={aoRenomear} /> : <span className="ed-no-nome" title={no.nome}>{no.nome}</span>}
        <span className="ed-no-tipo">{def.rotulo}</span>
      </span>
      <span className="ed-no-selos">
        {falta && (
          <span className="ed-no-falta" title={`Falta: ${falta}`} aria-label={`Falta: ${falta}`}>
            <TriangleAlert size={13} />
          </span>
        )}
        {noSensivel(no) && (
          <span className="ed-no-sensivel" title="Sensível: só liga com a sua confirmação" aria-label="Sensível">
            <ShieldAlert size={13} />
          </span>
        )}
      </span>
      {entrada && <span className="ed-porta entrada" style={{ left: entrada.x - caixa.x, top: entrada.y - caixa.y }} aria-hidden />}
      {saidas.map((p, i) => (
        <span
          key={i}
          className={`ed-porta saida ${rotulos ? `saida-${i}` : ''}`}
          style={{ left: p.x - caixa.x, top: p.y - caixa.y }}
          title={somenteLer ? undefined : rotulos ? `Saída "${rotulos[i]}": arraste até um nó para ligar` : 'Arraste até um nó para ligar'}
          onPointerDown={(e) => aoApertarPorta(e, i)}
        >
          {rotulos && <span className="ed-porta-rotulo">{rotulos[i]}</span>}
        </span>
      ))}
      {saidas.map((p, i) =>
        saidaLivre(i) ? (
          <button
            key={`mais-${i}`}
            type="button"
            className="ed-mais-saida"
            style={{ left: p.x - caixa.x, top: p.y - caixa.y }}
            title={rotulos ? `Adicionar um nó depois de "${rotulos[i]}"` : 'Adicionar um nó depois deste'}
            aria-label={rotulos ? `Adicionar um nó depois de "${rotulos[i]}"` : `Adicionar um nó depois de ${no.nome}`}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              aoMais(i)
            }}
            data-mais-da-saida={i}
          >
            <Plus size={12} />
          </button>
        ) : null
      )}
    </div>
  )
}

function Renomear({ nome, recusa, aoTerminar }: { nome: string; recusa: (nome: string) => string | null; aoTerminar: (nome: string | null) => void }) {
  const [valor, setValor] = useState(nome)
  const motivo = valor.trim() === nome ? null : recusa(valor)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="ed-no-renomear"
      aria-label="Novo nome do nó"
      aria-invalid={!!motivo}
      title={motivo ?? undefined}
      value={valor}
      maxLength={70}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setValor(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') aoTerminar(motivo || valor.trim() === nome ? null : valor.trim())
        if (e.key === 'Escape') aoTerminar(null)
      }}
      onBlur={() => aoTerminar(motivo || valor.trim() === nome ? null : valor.trim())}
    />
  )
}

// ---------------------------------------------------------------- busca de nós

/** A escolha de nó: painel que desliza da direita, busca no topo, grupos, setas + Enter, Esc fecha. */
function EscolhaDeNo({ busca, aoEscolher, aoFechar }: { busca: Busca; aoEscolher: (t: TipoDeNo) => void; aoFechar: () => void }) {
  const [texto, setTexto] = useState('')
  const [marcado, setMarcado] = useState(0)
  const tipos = useMemo(() => buscarNos(texto, { semGatilho: !!busca.ligarDe }), [texto, busca.ligarDe])
  useEffect(() => setMarcado(0), [texto])
  const lista = useRef<HTMLUListElement>(null)
  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [marcado])
  let grupo = ''
  return (
    <div
      className="ed-escolha"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Esc com o foco num item ou no X (no campo, o onKeyDown dele já fecha)
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          aoFechar()
        }
      }}
      role="dialog"
      aria-label="Adicionar nó"
      data-escolha-de-no
    >
      <header className="ed-escolha-topo">
        <h3>{busca.ligarDe ? 'Que nó vem depois?' : 'Adicionar nó'}</h3>
        <button type="button" className="ed-icone" title="Fechar (Esc)" aria-label="Fechar a escolha de nó" onClick={aoFechar}>
          <X size={16} />
        </button>
      </header>
      <input
        autoFocus
        className="ed-busca-campo"
        aria-label="Buscar nó"
        placeholder="Buscar nó (relógio, recado, Se, HTTP…)"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setMarcado((m) => Math.min(tipos.length - 1, m + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setMarcado((m) => Math.max(0, m - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (tipos[marcado]) aoEscolher(tipos[marcado])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            aoFechar()
          }
        }}
      />
      <ul className="ed-busca-lista" ref={lista} role="listbox" aria-label="Tipos de nó">
        {tipos.map((t, i) => {
          const def = CATALOGO[t]
          const Icone = ICONES[t]
          const g = grupoDoNo(t)
          const titulo = !texto && g !== grupo ? g : null
          grupo = g
          return (
            <li key={t} role="presentation">
              {titulo && <span className="ed-busca-grupo">{titulo}</span>}
              {i === marcado && (
                // irmão do item (botão dentro de botão não vale): abre a documentação sem escolher o nó
                <button
                  type="button"
                  className="ed-doc-do-no"
                  title={`O que o nó ${def.rotulo} faz`}
                  aria-label={`Documentação do nó ${def.rotulo}`}
                  onClick={() => abrirDocDoNo(t)}
                  data-doc-do-no={t}
                >
                  ?
                </button>
              )}
              <button
                type="button"
                role="option"
                aria-selected={i === marcado}
                className={i === marcado ? 'marcado' : ''}
                onMouseEnter={() => setMarcado(i)}
                onClick={() => aoEscolher(t)}
                data-tipo-de-no={t}
              >
                <span className={`ed-no-icone cat-${def.categoria}`} aria-hidden>
                  <Icone size={16} />
                </span>
                <span className="ed-busca-textos">
                  <span>{def.rotulo}</span>
                  <span className="suave" title={def.descricao}>
                    {def.descricao}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {!tipos.length && <li className="suave ed-nota">Nenhum nó com esse nome.</li>}
      </ul>
    </div>
  )
}
