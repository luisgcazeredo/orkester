// Kanban do espaço (1.9.4): o arquivo `kanban.json` na pasta do espaço, os canais da página e o `ork kanban`.
// A decisão do que vale está em shared/kanban.ts; aqui só disco, quem é quem, aviso às janelas e à caixa.
//
// Dono dos dados = processo principal, não a janela (diferente do quadro): ler → aplicar → gravar é síncrono aqui,
// então dois agentes mexendo juntos não se atropelam e o MCP mexe num espaço sem janela aberta.
import { ipcMain } from 'electron'
import { copyFileSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CANAIS_KANBAN } from '../shared/api'
import {
  acaoDoKanban,
  aplicarOperacao,
  escolherMaestro,
  lerArquivoDoKanban,
  opcaoTexto,
  operacaoDoComando,
  textoDaTarefa,
  textoDoKanban,
  type AgenteDoKanban,
  type ArquivoDoKanban,
  type AvisoDoKanban,
  type LeituraDoKanban,
  type Pessoa,
  type Quem,
  type RegrasDoKanban,
  type ResultadoDoKanban
} from '../shared/kanban'
import { idsDosEspacos, PASTA_DADOS } from './dados'
import { caixa, situacaoNaTela } from './espera'
import { avisarTodas, exigirDono } from './janelas'
import { sessaoPorId, sessoesDoEspaco, telaDe } from './terminais'

/**
 * As permissões que o Luís ainda está decidindo (desenho 1.9.4, seção 12), num lugar só. Trocar aqui muda o
 * `ork`, o MCP e a página juntos.
 *  - 12.1 atribuir: só avisa o responsável pela caixa (`[ork · kanban]`); não vira pedido. Mudar isso é trocar o
 *    `avisar` abaixo por um `porNaCaixa(..., 'pedido', ...)`.
 *  - 12.2 `agenteEmOutroEspaco`: `nada` = o agente só vê e mexe no kanban do próprio espaço; `ler` = lê os outros.
 *  - 12.3 `apagar`: `qualquer` agente do espaço apaga (vai para a lixeira); `autor` = só quem criou ou o usuário.
 *  - K3 `feito`: quem leva para a coluna final. `maestro` (decisão do Luís, 19/11) = o usuário e o agente de função
 *    Maestro do espaço; `usuario` = só o usuário (página ou MCP).
 */
export const PERMISSOES_DO_KANBAN: { agenteEmOutroEspaco: 'nada' | 'ler' } & RegrasDoKanban = {
  agenteEmOutroEspaco: 'nada',
  apagar: 'qualquer',
  feito: 'maestro'
}

/** O usuário pela tela. Sem id: não é agente, não tem "eu" nem recebe aviso. */
const USUARIO: Quem = { nome: 'Usuário' }

// ---------- disco ----------

function arquivoDo(espacoId: string): string {
  // só espaço que existe: um id inventado não cria pasta nenhuma
  if (typeof espacoId !== 'string' || !idsDosEspacos().includes(espacoId)) throw new Error('espaço não encontrado')
  return join(PASTA_DADOS, 'espacos', espacoId, 'kanban.json')
}

function ler(espacoId: string): ReturnType<typeof lerArquivoDoKanban> {
  let texto: string
  try {
    texto = readFileSync(arquivoDo(espacoId), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return lerArquivoDoKanban(null) // nasce na 1ª gravação
    throw e
  }
  try {
    return lerArquivoDoKanban(JSON.parse(texto))
  } catch {
    // ilegível: começa vazio; o arquivo ruim só é trocado na próxima gravação, que antes guarda uma cópia `.ruim`
    return { ...lerArquivoDoKanban(null), ruim: true }
  }
}

/** Grava num temporário e troca de nome: um desligamento no meio não corrompe o arquivo. */
function gravar(espacoId: string, conteudo: ArquivoDoKanban, guardarRuim: boolean): void {
  const destino = arquivoDo(espacoId)
  const temporario = `${destino}.${process.pid}.tmp`
  if (guardarRuim) {
    try {
      copyFileSync(destino, `${destino}.ruim`)
    } catch {
      // não existia: nada a guardar
    }
  }
  try {
    writeFileSync(temporario, JSON.stringify(conteudo, null, 2), 'utf8')
    renameSync(temporario, destino)
  } catch (e) {
    rmSync(temporario, { force: true }) // o temporário não fica para trás
    throw e
  }
}

// ---------- quem é quem ----------

/** Os agentes vivos do espaço (sem situação: para resolver nomes). */
function agentesDo(espacoId: string): AgenteDoKanban[] {
  return sessoesDoEspaco(espacoId).map((s) => ({ id: s.id, nome: s.espec.nome, agente: s.espec.agente }))
}

/** Com situação e fila, como a página Agentes os vê (`main/panorama.ts`). */
async function agentesComSituacao(espacoId: string): Promise<AgenteDoKanban[]> {
  return Promise.all(
    sessoesDoEspaco(espacoId).map(async (s) => ({
      id: s.id,
      nome: s.espec.nome,
      agente: s.espec.agente,
      situacao: s.processo ? situacaoNaTela(s, await telaDe(s, 80)) : ('encerrado' as const),
      fila: caixa.resumo(s.id).fila
    }))
  )
}

/**
 * O Maestro do espaço: cartão vivo (com processo) de Claude ou Codex cuja função é Maestro (regra em
 * `escolherMaestro`; shell nunca). É a quem a coluna "Com o Maestro" delega e quem, pela regra `feito`, também pode
 * levar à coluna final.
 */
export function maestroDo(espacoId: string): Pessoa | null {
  return escolherMaestro(
    sessoesDoEspaco(espacoId).map((s) => ({
      id: s.id,
      nome: s.espec.nome,
      funcao: s.espec.funcao,
      criadoPor: s.espec.criadoPor,
      agente: s.espec.agente,
      vivo: !!s.processo && !s.fim
    }))
  )
}

// ---------- aplicar ----------

/** Quem pôs uma demanda na caixa do Maestro: o usuário, sem pendência (de `null`: ninguém espera `ork entregar`). */
const DE_NOME_DO_PEDIDO = 'Usuário (kanban)'

/**
 * O que está na caixa por tarefa delegada (`<espaço>#<n>`): o pedido ainda não digitado e o aviso de retirada ainda
 * na fila. Some quando o recado sai da fila (entregue, cancelado ou sem destino). Só em memória, como a caixa.
 */
type NaFilaDaTarefa = { pedido?: { para: string; id: string }; retirada?: { para: string; id: string } }
const naFila = new Map<string, NaFilaDaTarefa>()

function lembrar(chave: string, qual: 'pedido' | 'retirada', para: string, r: { id: string; fim: Promise<unknown> }): void {
  naFila.set(chave, { ...naFila.get(chave), [qual]: { para, id: r.id } })
  void r.fim.then(() => {
    const atual = naFila.get(chave)
    if (atual?.[qual]?.id !== r.id) return
    const resto: NaFilaDaTarefa = { ...atual, [qual]: undefined }
    if (resto.pedido || resto.retirada) naFila.set(chave, resto)
    else naFila.delete(chave)
  })
}

/** Tira da fila o recado lembrado (se ainda não foi digitado). true = tirado. */
function cancelarNaFila(chave: string, qual: 'pedido' | 'retirada', para: string): boolean {
  const lembrado = naFila.get(chave)?.[qual]
  return !!lembrado && lembrado.para === para && caixa.cancelar(para, lembrado.id)
}

/**
 * Recado na caixa: `kanban` é aviso (sem pendência, sem recibo, atrás de entregas e pedidos); `pedido` é a demanda
 * delegada ao Maestro, com `de: null` (o usuário). Um de cada vez, só com o destino livre. Devolve o nome de quem
 * vai receber, ou null se o cartão não está rodando (ou se nada precisou ir).
 *  - retirada: o pedido desta tarefa ainda na fila sai dela, e o Maestro nem fica sabendo; já entregue, vai o aviso;
 *  - pedido de novo (delegou, retirou, delegou): uma retirada ainda na fila sai (chegaria depois do pedido novo, que
 *    passa na frente dos avisos, e o cancelaria) e um pedido antigo ainda na fila também (não vai duas vezes);
 *  - pedido nunca vai a um shell (o PowerShell executaria cada linha); `escolherMaestro` já não elege shell.
 */
function porNaCaixa(espacoId: string, aviso: AvisoDoKanban, por: Quem): string | null {
  const alvo = sessaoPorId(aviso.para)
  if (!alvo || alvo.fim || !alvo.processo) return null
  const chave = aviso.numero === undefined ? null : `${espacoId}#${aviso.numero}`
  if (aviso.tipo === 'pedido') {
    if (alvo.espec.agente === 'shell') return null
    if (chave) {
      cancelarNaFila(chave, 'retirada', aviso.para)
      cancelarNaFila(chave, 'pedido', aviso.para)
    }
    const r = caixa.enfileirar({ tipo: 'pedido', de: null, deNome: DE_NOME_DO_PEDIDO, para: aviso.para, texto: aviso.texto })
    if (chave) lembrar(chave, 'pedido', aviso.para, r)
    return alvo.espec.nome
  }
  if (aviso.retirada && chave && cancelarNaFila(chave, 'pedido', aviso.para)) return null
  const r = caixa.enfileirar({ tipo: 'kanban', de: por.id ?? null, deNome: por.nome, para: aviso.para, texto: aviso.texto })
  if (aviso.retirada && chave) lembrar(chave, 'retirada', aviso.para, r)
  return alvo.espec.nome
}

/**
 * Lê, aplica e grava de uma vez (síncrono até a gravação): dois pedidos não se atropelam. Avisa as janelas
 * (`exceto` = a que pediu, que já tem o resultado) e põe os recados que a mudança gerou na caixa de cada um.
 */
export function aplicarNoKanban(espacoId: string, operacao: unknown, por: Quem, exceto?: Electron.WebContents): ResultadoDoKanban & { avisados?: string[] } {
  const lido = ler(espacoId)
  if (lido.soLeitura) return { ok: false, erro: lido.soLeitura }
  const r = aplicarOperacao(lido.arquivo, operacao, {
    por,
    agora: Date.now(),
    agentes: agentesDo(espacoId),
    maestro: maestroDo(espacoId),
    regras: PERMISSOES_DO_KANBAN
  })
  if (!r.ok) return r
  try {
    gravar(espacoId, r.arquivo, !!lido.ruim)
  } catch (e) {
    return { ok: false, erro: `não consegui gravar o kanban: ${e instanceof Error ? e.message : String(e)}` }
  }
  avisarTodas({ tipo: 'kanban', espacoId }, exceto)
  if (!r.avisos?.length) return r
  const avisados = r.avisos.map((a) => porNaCaixa(espacoId, a, por)).filter((n): n is string => !!n)
  void caixa.rodada()
  return { ...r, avisados }
}

export async function lerKanban(espacoId: string): Promise<LeituraDoKanban> {
  const lido = ler(espacoId)
  const agentes = await agentesComSituacao(espacoId)
  const m = maestroDo(espacoId)
  const visto = m ? agentes.find((a) => a.id === m.id) : undefined
  const maestro = m ? { id: m.id, nome: m.nome, situacao: visto?.situacao ?? ('livre' as const), fila: visto?.fila ?? 0 } : null
  return { arquivo: lido.arquivo, agentes, maestro, ...(lido.soLeitura ? { soLeitura: lido.soLeitura } : {}) }
}

export function registrarKanban(): void {
  ipcMain.handle(CANAIS_KANBAN.ler, (_evento, espacoId: unknown): Promise<LeituraDoKanban> => lerKanban(String(espacoId)))
  ipcMain.handle(CANAIS_KANBAN.aplicar, (evento, espacoId: unknown, operacao: unknown): ResultadoDoKanban => {
    try {
      // a página só mexe no espaço da própria janela
      exigirDono(evento, String(espacoId))
      return aplicarNoKanban(String(espacoId), operacao, USUARIO, evento.sender)
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : String(e) }
    }
  })
}

// ---------- o `ork kanban` (agente e chave de usuário) ----------

export { acaoDoKanban }

/**
 * Um `ork kanban …` já validado pelo registro. `por` é o agente (com id) ou o cliente MCP (sem id). `texto` é o
 * conteúdo do `--arquivo`, que o `ork` lê do lado de quem chamou (vale como descrição ou comentário).
 */
export async function rodarKanban(
  espacoId: string,
  por: Quem,
  pos: string[],
  opcoes: Record<string, string | number | true>,
  texto: string
): Promise<string> {
  const acao = acaoDoKanban(pos)
  const resto = pos.slice(1)
  if (acao === 'ver') {
    const { arquivo: kanban } = ler(espacoId)
    const agentes = await agentesComSituacao(espacoId)
    if (resto[0]) return textoDaTarefa(kanban, resto[0], agentes)
    return textoDoKanban(kanban, agentes, { coluna: opcaoTexto(opcoes.coluna), para: opcaoTexto(opcoes.para), etiqueta: opcaoTexto(opcoes.etiqueta) }, por.id)
  }
  const r = aplicarNoKanban(espacoId, operacaoDoComando(acao, resto, opcoes, texto), por)
  if (!r.ok) throw new Error(r.erro)
  return r.avisados?.length ? `${r.texto} Na caixa de: ${r.avisados.map((n) => `"${n}"`).join(', ')}.` : r.texto
}
