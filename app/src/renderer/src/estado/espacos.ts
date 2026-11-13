import { type Funcao, type Partitura, type Tema } from '../../../shared/modelo'
import { type AvisoJanelas, type ResultadoDoPrimeiroPedido } from '../../../shared/api'
import { aplicarPartitura, MAX_PARTITURAS, partituraDe } from '../../../shared/quadro/partituras'
import { irParaAndar } from './andares'
import { atenderAgente } from './caixa'
import { agora, novoId } from './nos'
import { cancelarSalvamentoPendente, definir, estado, mudarEspaco, mudarPlano, NADA, planoAtual, registrarHistorico, salvando, salvarAgora, type StatusDoAviso, zerarHistorico } from './nucleo'
import { anotarDisparo } from './rotinas'
import { anotarSessoes } from './terminais'

// ---------- início e espaços ----------

export async function iniciar(): Promise<void> {
  window.ork.janelas.aoAvisar(receberAviso)
  window.ork.terminal.aoDescobrirSessao((id, sessao) => anotarSessoes({ [id]: sessao }))
  window.ork.agentes.aoPedir(atenderAgente)
  window.ork.rotinas.aoAcontecer(anotarDisparo)
  const [preferencias, janela, espacos, inicio] = await Promise.all([
    window.ork.dados.carregarPreferencias(),
    window.ork.dados.carregarEstado(),
    window.ork.dados.listarEspacos(),
    window.ork.janelas.inicio()
  ])
  definir({
    preferencias,
    espacos,
    lateralAberta: janela.lateralAberta,
    emOutrasJanelas: inicio.abertosEmOutras,
    explorador: { aberto: janela.explorador?.aberto ?? false, raizes: janela.explorador?.raizes ?? [], expandidas: [] }
  })
  // o espaço pedido para esta janela; senão o último usado, se estiver livre; senão o primeiro livre
  const livre = (id: string | null): boolean => !!id && espacos.some((e) => e.id === id) && !inicio.abertosEmOutras.includes(id)
  const ativo = [inicio.espacoId, janela.espacoAtivo, ...espacos.map((e) => e.id)].find(livre)
  if (ativo) await abrirEspaco(ativo)
  definir({ carregado: true })
}

/** O que as outras janelas (pelo processo principal) avisam. */
function receberAviso(aviso: AvisoJanelas): void {
  switch (aviso.tipo) {
    case 'lista':
      void window.ork.dados.listarEspacos().then((espacos) => definir({ espacos }))
      return
    case 'resumo':
      definir({ espacos: estado.espacos.map((r) => (r.id === aviso.resumo.id ? aviso.resumo : r)) })
      return
    case 'abertos':
      definir({ emOutrasJanelas: aviso.ids })
      return
    case 'renomear':
      if (estado.espaco?.id === aviso.espacoId) void renomearEspaco(aviso.espacoId, aviso.nome)
      return
    case 'preferencias':
      void window.ork.dados.carregarPreferencias().then((preferencias) => definir({ preferencias }))
  }
}

/** Abre uma janela nova (com o espaço pedido, ou com o primeiro livre). */
export function abrirNovaJanela(espacoId: string | null = null): void {
  void window.ork.janelas.nova(espacoId)
}

let pedidoDeAbertura = 0

export async function abrirEspaco(id: string, andarId?: string | null): Promise<void> {
  if (estado.espaco?.id === id) {
    if (andarId !== undefined) irParaAndar(andarId)
    return
  }
  // cliques rápidos em vários espaços: vale só o último
  const pedido = ++pedidoDeAbertura
  // não salvou: fica onde está (o aviso de erro aparece) para a mudança não se perder
  if (!(await salvarAgora())) return
  // aberto em outra janela: ela vem para a frente e esta fica como está
  if (pedido !== pedidoDeAbertura || !(await window.ork.janelas.reservar(id))) return
  const carregado = await window.ork.dados.carregarEspaco(id)
  if (!carregado || pedido !== pedidoDeAbertura) {
    // desistiu (outro clique veio depois, ou não carregou): devolve a reserva, se não for o que está à mostra
    if (estado.espaco?.id !== id) void window.ork.janelas.soltar(id)
    return
  }
  // o espaço de antes só é devolvido agora, depois de salvo e com o novo já carregado
  const anterior = estado.espaco?.id
  zerarHistorico()
  definir({
    espaco: carregado.espaco,
    notas: carregado.notas,
    selecao: NADA,
    editando: null,
    ferramenta: 'selecionar',
    vistaAndares: false
  })
  if (anterior && anterior !== id) void window.ork.janelas.soltar(anterior)
  if (andarId !== undefined) irParaAndar(andarId)
  salvarJanela()
}

export async function criarEspaco(nome: string, pasta: string): Promise<void> {
  const resumo = await window.ork.dados.criarEspaco(nome, pasta)
  definir({ espacos: [...estado.espacos, resumo] })
  await abrirEspaco(resumo.id)
}

export async function renomearEspaco(id: string, nome: string): Promise<void> {
  const limpo = nome.trim()
  if (!limpo) return
  if (estado.espaco?.id === id) {
    mudarEspaco((e) => ({ ...e, nome: limpo }), false)
    definir({ espacos: estado.espacos.map((r) => (r.id === id ? { ...r, nome: limpo } : r)) })
    return
  }
  // aberto em outra janela ou fechado: o processo principal cuida (e avisa todas as janelas)
  await window.ork.dados.renomearEspaco(id, limpo)
}

/** Apaga o espaço do app. Se era o aberto, abre outro (ou fica vazio). */
export async function apagarEspaco(id: string): Promise<void> {
  if (estado.espaco?.id === id) {
    cancelarSalvamentoPendente()
    await salvando
  }
  await window.ork.dados.apagarEspaco(id)
  const espacos = estado.espacos.filter((e) => e.id !== id)
  if (estado.espaco?.id === id) {
    definir({ espaco: null, notas: {}, espacos, selecao: NADA, editando: null })
    zerarHistorico()
    // o próximo livre (os abertos em outras janelas são delas)
    const livre = espacos.find((e) => !estado.emOutrasJanelas.includes(e.id))
    if (livre) await abrirEspaco(livre.id)
    else salvarJanela()
  } else definir({ espacos })
}

let salvandoJanela: Promise<void> = Promise.resolve()

function salvarJanela(): Promise<void> {
  const { aberto, raizes } = estado.explorador
  salvandoJanela = window.ork.dados
    .salvarEstado({
      versao: 1,
      espacoAtivo: estado.espaco?.id ?? null,
      lateralAberta: estado.lateralAberta,
      explorador: { aberto, raizes }
    })
    .catch(() => undefined)
  return salvandoJanela
}

/**
 * O processo principal só lista e lê pasta que está salva (no quadro ou no estado da janela): quem vai ler
 * espera por isto antes de pedir. Sem isso, a pasta recém-aberta é recusada na primeira leitura.
 */
export async function prepararLeitura(): Promise<void> {
  await Promise.all([salvarAgora(), salvandoJanela])
}

export function alternarExplorador(): void {
  definir({ explorador: { ...estado.explorador, aberto: !estado.explorador.aberto } })
  void salvarJanela()
}

/** Põe uma pasta no explorador. Devolve quando o estado já está salvo, para a leitura não ser recusada. */
export async function adicionarRaizExplorador(pasta: string): Promise<void> {
  const { raizes } = estado.explorador
  if (!raizes.includes(pasta)) {
    definir({ explorador: { ...estado.explorador, aberto: true, raizes: [...raizes, pasta] } })
  }
  await salvarJanela()
}

export function removerRaizExplorador(pasta: string): void {
  const explorador = estado.explorador
  definir({
    explorador: {
      ...explorador,
      raizes: explorador.raizes.filter((r) => r !== pasta),
      expandidas: explorador.expandidas.filter((p) => p !== pasta)
    }
  })
  void salvarJanela()
}

export function alternarPastaExplorador(caminho: string): void {
  const { expandidas } = estado.explorador
  definir({
    explorador: {
      ...estado.explorador,
      expandidas: expandidas.includes(caminho) ? expandidas.filter((p) => p !== caminho) : [...expandidas, caminho]
    }
  })
}

export function alternarLateral(): void {
  definir({ lateralAberta: !estado.lateralAberta })
  salvarJanela()
}

// Cada uma destas manda **só o campo que mexeu**: o principal junta com o disco. Mandar o objeto
// inteiro fazia a janela com a cópia velha apagar o que a outra tinha acabado de gravar.
export function definirTema(tema: Tema): void {
  definir({ preferencias: { ...estado.preferencias, tema } })
  void window.ork.dados.salvarPreferencias({ tema })
}

/** Presets de agente (o botão de terminal): ficam nas preferências, valem para todas as janelas. */
export function alternarLinhasDoCodigo(): void {
  const linhasDoCodigo = estado.preferencias.linhasDoCodigo === false
  definir({ preferencias: { ...estado.preferencias, linhasDoCodigo } })
  void window.ork.dados.salvarPreferencias({ linhasDoCodigo })
}

/** As funções (papéis) ficam nas preferências, como os presets: valem em todos os espaços. */
export function definirFuncoes(funcoes: Funcao[]): void {
  definir({ preferencias: { ...estado.preferencias, funcoes } })
  void window.ork.dados.salvarPreferencias({ funcoes })
}

/** As partituras (times salvos) moram nas preferências, como as funções: valem em todos os espaços. */
export function definirPartituras(partituras: Partitura[]): void {
  definir({ preferencias: { ...estado.preferencias, partituras } })
  void window.ork.dados.salvarPreferencias({ partituras })
}

/** Guarda como partitura os cartões escolhidos (ou todos os do andar, com `ids` nulo). */
export function salvarPartitura(nome: string, ids: string[] | null): string | null {
  const plano = planoAtual()
  if (!plano) return 'nenhum espaço aberto'
  const guardadas = estado.preferencias.partituras ?? []
  if (guardadas.length >= MAX_PARTITURAS) return `você já tem ${guardadas.length} partituras guardadas (o limite é ${MAX_PARTITURAS})`
  const feita = partituraDe(plano, estado.notas, nome, ids, { novoId, agora })
  if (typeof feita === 'string') return feita
  // mesmo nome: a partitura nova toma o lugar da velha, como um "salvar em cima"
  definirPartituras([...guardadas.filter((p) => p.nome.toLowerCase() !== feita.nome.toLowerCase()), feita])
  return null
}

/**
 * Sobe uma partitura no andar à mostra. `dono` é o cartão do agente que pediu; sem ele, o time é do usuário.
 *
 * **Quem sobe decide se entra no desfazer.** O time que o usuário sobe entra: um Ctrl+Z tira ele inteiro,
 * como qualquer cartão que ele põe no quadro. O time que um agente sobe fica fora, pela regra que já valia
 * para o `ork abrir`: são sessões vivas, e o desfazer do usuário não mata sessão de agente no meio do
 * trabalho (ver `aplicarInstantaneo`). Quem subiu fecha com `ork fechar`. Mexer em cartão que já existe
 * (mover, arrumar, nome, anotar) continua entrando no desfazer, mesmo vindo de agente.
 */
export function subirPartitura(
  partitura: Partitura,
  x: number,
  y: number,
  dono?: string
): { erro: string } | { ids: string[]; texto: string } {
  const plano = planoAtual()
  if (!plano) return { erro: 'nenhum espaço aberto' }
  const feito = aplicarPartitura(plano, estado.notas, partitura, x, y, {
    novoId,
    agora,
    funcoes: estado.preferencias.funcoes ?? [],
    presets: estado.preferencias.presets,
    dono
  })
  if ('erro' in feito) return feito
  if (!dono) registrarHistorico()
  definir({ notas: feito.notas })
  mudarPlano(() => feito.plano, false)
  definir({ selecao: { ...NADA, nos: feito.ids }, editando: null })
  // o prompt de cada função é entregue pelo processo principal, que sabe quando o agente ficou pronto
  for (const pedido of feito.pedidos) entregarPrimeiroPedido(pedido.id, pedido.texto)
  return { ids: feito.ids, texto: feito.texto }
}

/** Chave de um aviso: espaço + cartão, para que ids iguais em espaços diferentes nunca se misturem. */
export function chaveDoAviso(espacoId: string | undefined, cartaoId: string): string {
  return `${espacoId ?? ''}${cartaoId}`
}

export function existeTerminal(id: string): boolean {
  const e = estado.espaco
  return !!e && [e, ...e.andares].some((p) => p.nos.some((n) => n.tipo === 'terminal' && n.id === id))
}

/** Anota o aviso de um primeiro pedido não confirmado (nunca é chamada para um pedido que saiu). */
export function anotarAvisoDoPrimeiroPedido(espacoId: string, cartaoId: string, status: StatusDoAviso): void {
  // o espaço aberto é o único que dá para conferir: cartão apagado enquanto a resposta vinha não ganha aviso
  if (estado.espaco?.id === espacoId && !existeTerminal(cartaoId)) return
  definir({ avisosDoPrimeiroPedido: { ...estado.avisosDoPrimeiroPedido, [chaveDoAviso(espacoId, cartaoId)]: status } })
}

/**
 * Pedidos à espera da resposta do processo principal, por chave (espaço + cartão). Quem dispensa o aviso tira a
 * marca: a resposta que chegar depois não encontra a sua marca e não recria o selo.
 */
const pedidosEmVoo = new Map<string, symbol>()

/** Tira o aviso (dispensado pelo usuário, ou o pedido saiu). Só remove: não registra nada no lugar. */
export function dispensarAvisoDoPrimeiroPedido(espacoId: string, cartaoId: string): void {
  const chave = chaveDoAviso(espacoId, cartaoId)
  pedidosEmVoo.delete(chave)
  if (!(chave in estado.avisosDoPrimeiroPedido)) return
  const { [chave]: _tirado, ...resto } = estado.avisosDoPrimeiroPedido
  definir({ avisosDoPrimeiroPedido: resto })
}

/** Manda o primeiro pedido; se o processo principal não confirmar que saiu, o cartão ganha um selo de aviso. */
export function entregarPrimeiroPedido(
  id: string,
  texto: string,
  enviar: (id: string, texto: string) => Promise<ResultadoDoPrimeiroPedido> = window.ork.terminal.primeiroPedido
): void {
  const espacoId = estado.espaco?.id
  if (!espacoId) return
  const chave = chaveDoAviso(espacoId, id)
  const marca = Symbol(chave)
  pedidosEmVoo.set(chave, marca)
  // a marca some quando o usuário dispensa (ou outro pedido do mesmo cartão a troca): resposta sem marca é descartada
  const vale = (): boolean => pedidosEmVoo.get(chave) === marca
  enviar(id, texto)
    .then((r) => {
      if (!vale()) return
      pedidosEmVoo.delete(chave)
      if (r.status === 'saiu') dispensarAvisoDoPrimeiroPedido(espacoId, id)
      else anotarAvisoDoPrimeiroPedido(espacoId, id, r.status)
    })
    .catch((erro) => {
      // falha no canal: não dá para saber se algo foi digitado; o aviso próprio diz isso, sem fingir que saiu
      console.warn(`[orkester] primeiro pedido de "${id}": não deu para confirmar o envio`, erro)
      if (!vale()) return
      pedidosEmVoo.delete(chave)
      anotarAvisoDoPrimeiroPedido(espacoId, id, 'erro')
    })
}
