// Fluxos no main: o disco, o selo, o serviço (regras), o motor (main/motorDeAutomacoes.ts) e as ações reais dos nós
// Orkester (recado, tarefa, comando, avisar), que vieram de main/automacoes.ts (apagado). Código e HTTP chegam na onda
// 2 (S4 e S5): até lá, o executor marca esses nós com erro "ainda não roda aqui".
//
// O motor dispara em todo espaço com fluxo ligado, com ou sem janela. Espaço que não foi aberto desde que o app subiu
// não tem sessão: o recado dá `sem-destino` e o avisar vira notificação do sistema.
import { app, BrowserWindow, ipcMain, Notification, safeStorage, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CANAIS_FLUXOS } from '../../shared/api'
import { nomeNoCabecalho, semMarcasDoOrkester, type NomesDaFrase } from '../../shared/automacoes'
import type { AcoesDoFluxo } from '../../shared/fluxos/executor'
import type { FluxoGravado } from '../../shared/fluxos/formato'
import { valorNoRecado } from '../../shared/fluxos/nos'
import { fichaDeAgente, fichaDeEspaco, fichaDeFluxo, fichaDeTarefa, resumoDoItem, type FichaDeAgente, type FichaDeTarefa } from '../../shared/fluxos/fichas'
import { textoDoResultado } from '../../shared/rotinas'
import { gravarJsonAtomico, idsDosEspacos, lerEspacoSalvo, PASTA_DADOS, rotinasSalvas } from '../dados'
import { autoriaDoFluxo } from './autoria'
import { EnvioCancelado } from '../envio'
import { caixa, dispararNoTerminal, situacao } from '../espera'
import { tirarEventos } from '../eventosDeAutomacao'
import { donoDe } from '../janelas'
import { aoSairemColunas, aplicarNoKanban, colunasDoKanban, maestroDo, tarefasDoKanban } from '../kanban'
import { criarMotor, type FontesDasFichas } from '../motorDeAutomacoes'
import { sessaoPorId, sessoesDoEspaco } from '../terminais'
import { avisarLigadosMudaram, contarLigadosCom } from '../bandeja'
import { consultar, type FontesDaConsulta } from './consulta'
import { criarCofreDeCredenciais } from './credenciais'
import { criarDiscoDeFluxos } from './disco'
import { criarAcaoCodigo } from './codigo'
import { criarAcaoHttp } from './http'
import { registrarIpcDosFluxos } from './ipc'
import { criarSelo } from './selo'
import { criarServicoDeFluxos } from './servico'
import { foraDoAlcance } from './verbos'

/**
 * Digitar não espera para sempre: passado isto (ou abortado o sinal que o motor manda, com o prazo da trava global),
 * o envio para na hora, sem mais nenhuma tecla (`EnvioCancelado`).
 */
export const PRAZO_DE_DIGITAR = 20_000

// ---------- quem é quem ----------

function pastaDoEspaco(espacoId: string): string {
  // só espaço que existe: um id inventado não cria pasta nenhuma
  if (typeof espacoId !== 'string' || !idsDosEspacos().includes(espacoId)) throw new Error('espaço não encontrado')
  return join(PASTA_DADOS, 'espacos', espacoId)
}

function nomesDoEspaco(espacoId: string): NomesDaFrase & { agentes: Record<string, string> } {
  const agentes: Record<string, string> = { ...rotinasSalvas(espacoId).nomes }
  for (const s of sessoesDoEspaco(espacoId)) agentes[s.id] = s.espec.nome
  const colunas: Record<string, string> = {}
  for (const c of colunasDoKanban(espacoId)) colunas[c.id] = c.nome
  return { agentes, colunas }
}

/** `maestro` → o Maestro vivo do espaço agora; um id → ele mesmo. */
const resolverDestino = (espacoId: string, d: string): string | undefined => (d === 'maestro' ? maestroDo(espacoId)?.id : d)

// "criado pelo usuário", "criado por <agente>": ver autoria.ts

// ---------- as fichas (shared/fluxos/fichas.ts) ----------

/** A tarefa `numero` do kanban do espaço como ficha; `null` = não existe (ou está na lixeira). */
export function fichaDaTarefaNoEspaco(espacoId: string, numero: number): FichaDeTarefa | null {
  const { colunas, tarefas } = tarefasDoKanban(espacoId)
  const t = tarefas.find((x) => x.numero === numero)
  return t ? fichaDeTarefa(t, colunas) : null
}

/** O andar do cartão pelo espaço salvo: `null` = térreo (ou o cartão ainda não está no arquivo). */
function andarDoCartao(espacoId: string, cartaoId: string): { id: string; nome: string } | null {
  const andar = lerEspacoSalvo(espacoId)?.andares.find((a) => a.nos.some((n) => n.id === cartaoId))
  return andar ? { id: andar.id, nome: andar.nome } : null
}

/** O agente aberto no espaço como ficha (situação lida da tela agora); `null` = não está aberto neste espaço. */
export async function fichaDoAgenteNoEspaco(espacoId: string, cartaoId: string): Promise<FichaDeAgente | null> {
  const s = sessaoPorId(cartaoId)
  if (!s || s.espacoId !== espacoId || s.fim) return null
  const sit = s.processo ? await situacao(s) : 'encerrado'
  return fichaDeAgente({ no: s.espec, situacao: sit, andar: andarDoCartao(espacoId, s.id), fila: caixa.resumo(s.id).fila, tarefas: tarefasDoKanban(espacoId).tarefas })
}

/** O `$fluxo` e o `$espaco` das expressões. */
function contextoDoFluxo(espacoId: string, fluxo: FluxoGravado): ReturnType<FontesDasFichas['contexto']> {
  const lista = disco.listar(espacoId)
  return {
    $fluxo: fichaDeFluxo(fluxo, { pastas: lista.indice.pastas, autoria: autoriaDoFluxo(fluxo), ultima: lista.ultimas[fluxo.id] ?? null }),
    $espaco: fichaDeEspaco({ id: espacoId, nome: lerEspacoSalvo(espacoId)?.nome ?? '' })
  }
}

const NOTA_VALIDA = /^[\w-]{1,80}\.md$/

/** O mundo do nó Consultar (main/fluxos/consulta.ts): tudo pedido com o id do espaço do fluxo, só leitura. */
const fontesDaConsulta: FontesDaConsulta = {
  kanban: tarefasDoKanban,
  espaco: (espacoId) => lerEspacoSalvo(espacoId),
  abertos: (espacoId) =>
    Promise.all(
      sessoesDoEspaco(espacoId)
        .filter((s) => !s.fim)
        .map(async (s) => ({ no: s.espec, situacao: s.processo ? await situacao(s) : ('encerrado' as const), fila: caixa.resumo(s.id).fila }))
    ),
  textoDaNota: (espacoId, arquivo) => {
    if (!NOTA_VALIDA.test(arquivo)) return ''
    try {
      return readFileSync(join(pastaDoEspaco(espacoId), 'notas', arquivo), 'utf8')
    } catch {
      return ''
    }
  },
  fluxos: (espacoId) => {
    const l = disco.listar(espacoId)
    return { fluxos: l.fluxos, pastas: l.indice.pastas, ultimas: l.ultimas }
  },
  execucoes: (espacoId, fluxoId, limite) => disco.execucoes(espacoId, fluxoId, limite),
  maestro: (espacoId) => maestroDo(espacoId)?.id,
  autoria: autoriaDoFluxo
}

// ---------- avisos às janelas ----------

function paraAsJanelas(canal: string, ...args: unknown[]): void {
  for (const j of BrowserWindow.getAllWindows()) {
    if (!j.isDestroyed() && !j.webContents.isDestroyed()) j.webContents.send(canal, ...args)
  }
}

/** Uma frase ao usuário: no canto da janela do espaço; sem janela, notificação do sistema. */
function avisarUsuario(espacoId: string, texto: string, tipo?: 'erro'): 'janela' | 'notificacao' | 'nenhum' {
  if (donoDe(espacoId) !== undefined) {
    paraAsJanelas(CANAIS_FLUXOS.mudou, espacoId, texto, tipo)
    return 'janela'
  }
  if (!Notification.isSupported()) return 'nenhum'
  new Notification({ title: 'Orkester', body: texto }).show()
  return 'notificacao'
}

// ---------- as ações (um conjunto por execução) ----------

// o "O que aconteceu" do recado: `resumoDoItem` (shared/fluxos/fichas.ts), só os campos simples, sem as fichas

/** O nó Código (S4). O main/index.ts usa o `guardar` no web-contents-created. */
export const motorDoCodigo = criarAcaoCodigo({ BrowserWindow, session, app })

function acoesDoFluxo(espacoId: string, fluxo: FluxoGravado, cadeia: string[]): Partial<AcoesDoFluxo> {
  const nomeDoFluxo = nomeNoCabecalho(fluxo.nome)
  return {
    // S4: janela isolada por execução (a sessão nasce no 1º uso)
    codigo: motorDoCodigo.acao,
    // S5: por execução, só com os endereços locais que o usuário permitiu neste fluxo (veredito 196)
    http: criarAcaoHttp({ cofre: cofreDeCredenciais, locaisPermitidos: fluxo.rede?.locaisPermitidos ?? [] }),
    // só leitura, e só deste espaço
    consultar: (a) => consultar(fontesDaConsulta, espacoId, fluxo, a),
    recado(a, item) {
      const semDestino = (porque: string): Record<string, unknown> => ({ para: '', paraNome: a.para.nome, resultado: `sem-destino: ${porque}` })
      const alvoId = resolverDestino(espacoId, a.para.id)
      if (!alvoId) return semDestino('não há Maestro aberto neste espaço')
      const alvo = sessaoPorId(alvoId)
      if (!alvo || alvo.espacoId !== espacoId || alvo.fim) return semDestino('o cartão de destino não está aberto no espaço')
      if (alvo.espec.agente === 'shell') return semDestino(`"${alvo.espec.nome}" é um shell: recado só vai a Claude ou Codex`)
      if (!alvo.processo) return semDestino(`"${alvo.espec.nome}" está encerrado`)
      const entregaId = resolverDestino(espacoId, a.entregaPara?.id ?? 'maestro')
      const entrega = entregaId && entregaId !== alvoId ? sessaoPorId(entregaId) : undefined
      // o texto já vem resolvido (os valores do item passaram por `valorNoRecado`); nada imita uma marca do Orkester
      const partes = [semMarcasDoOrkester(a.texto)]
      if (a.juntarEvento) partes.push(`O que aconteceu:${valorNoRecado(`${resumoDoItem(item)}\n`)}`)
      if (entrega && !entrega.fim) partes.push(`Se for trabalho, ao terminar entregue com \`ork entregar\` (vai para "${nomeNoCabecalho(entrega.espec.nome)}").`)
      else if (entregaId !== alvoId) partes.push('Se for trabalho, deixe o resultado na sua tela: quem deveria receber a entrega não está aberto agora.')
      const r = caixa.enfileirar({ tipo: 'fluxo', de: null, deNome: nomeDoFluxo, autoria: autoriaDoFluxo(fluxo), para: alvoId, texto: partes.join('\n\n') })
      if (entrega) {
        void r.fim.then((fim) => {
          const quem = sessaoPorId(entrega.id)
          if ((fim === 'entregue' || fim === 'incerto') && quem && !quem.fim) caixa.abrirPendencia(entrega.id, alvoId)
        })
      }
      void caixa.rodada()
      return { para: alvoId, paraNome: alvo.espec.nome, resultado: 'na-fila', posicao: r.posicao }
    },

    async comando(a, _item, ctx) {
      const s = sessaoPorId(a.terminal.id)
      if (!s || s.espacoId !== espacoId) throw new Error(`o cartão shell "${a.terminal.nome}" não está aberto no espaço`)
      // só shell do mesmo espaço: roda na pasta e com a permissão daquele shell, sem elevar nada
      if (s.espec.agente !== 'shell') throw new Error(`"${s.espec.nome}" não é um shell: comando só num cartão shell`)
      const sinal = AbortSignal.any([ctx.sinal, AbortSignal.timeout(PRAZO_DE_DIGITAR)])
      let r: Awaited<ReturnType<typeof dispararNoTerminal>>
      try {
        r = await dispararNoTerminal(s.id, a.comando, sinal)
      } catch (e) {
        if (e instanceof EnvioCancelado) throw new Error(`"${s.espec.nome}" não confirmou o comando a tempo: parei de digitar (confira o shell: ele pode ter rodado ou ficado escrito no prompt)`)
        throw e
      }
      if (sinal.aborted && r === 'nao-enviou') throw new Error(`"${s.espec.nome}": cancelado antes de digitar`)
      if (r === 'nao-enviou') throw new Error(`${textoDoResultado(r)} ("${s.espec.nome}")`)
      return { terminal: s.id, terminalNome: s.espec.nome, resultado: textoDoResultado(r) }
    },

    avisar(a) {
      const texto = `Fluxo "${nomeDoFluxo}" (${autoriaDoFluxo(fluxo)}): ${semMarcasDoOrkester(a.texto).replace(/\s+/g, ' ').trim()}`
      const onde = avisarUsuario(espacoId, texto)
      if (onde === 'nenhum') throw new Error('sem janela do espaço e sem notificação do sistema')
      return { avisado: onde }
    },

    tarefa(a) {
      const colunas = colunasDoKanban(espacoId)
      const coluna = a.coluna ? colunas.find((c) => c.id === a.coluna!.id) : undefined
      if (a.coluna && !coluna) throw new Error(`a coluna "${a.coluna.nome}" não existe mais no kanban`)
      // o movimento vai marcado: nenhum fluxo dispara nele (a cadeia segue para o laço)
      const por = { nome: `Fluxo "${fluxo.nome}"`.slice(0, 80), automacao: { id: fluxo.id, cadeia } }
      // "Com o Maestro" não aceita tarefa nascendo nela: cria na entrada e move (é assim que se delega)
      const delegar = coluna?.papel === 'delegar'
      const criada = aplicarNoKanban(espacoId, { tipo: 'criar', titulo: a.titulo, ...(a.descricao ? { descricao: a.descricao } : {}), ...(coluna && !delegar ? { coluna: coluna.id } : {}) }, por)
      if (!criada.ok) throw new Error(criada.erro)
      if (delegar && criada.numero !== undefined) {
        const movida = aplicarNoKanban(espacoId, { tipo: 'mover', numero: criada.numero, coluna: coluna!.id }, por)
        if (!movida.ok) throw new Error(`#${criada.numero} criada, mas não delegada: ${movida.erro}`)
      }
      // delegada: o Maestro foi alcançado (o motor guarda a cadeia nele, anti-laço, como no recado)
      const para = delegar ? (resolverDestino(espacoId, 'maestro') ?? '') : ''
      const tarefa = criada.numero !== undefined ? fichaDaTarefaNoEspaco(espacoId, criada.numero) : null
      return { numero: criada.numero ?? null, titulo: a.titulo, coluna: coluna?.id ?? '', tarefa, ...(para ? { para } : {}) }
    }
  }
}

// ---------- montagem ----------

const disco = criarDiscoDeFluxos({ pastaDoEspaco, gravarJsonAtomico })
const selo = criarSelo({ cofre: safeStorage, arquivo: join(PASTA_DADOS, 'fluxos-selo.json'), gravarJsonAtomico })

/**
 * Os fluxos (de qualquer espaço) cujo nó HTTP cita a credencial pelo nome, como "Espaço · Fluxo": a tela avisa ao
 * apagar. Os fluxos não mudam; o próximo pedido deles dá "credencial X não existe".
 */
function fluxosQueUsam(nome: string): string[] {
  const chave = nome.toLocaleLowerCase('pt-BR')
  const achados: string[] = []
  for (const espacoId of idsDosEspacos()) {
    for (const f of listaDoMotor(espacoId)) {
      const usa = f.nos.some((n) => n.tipo === 'fora.http' && typeof n.ajustes.credencial === 'string' && n.ajustes.credencial.toLocaleLowerCase('pt-BR') === chave)
      if (usa) achados.push(f.nome)
    }
  }
  return achados
}

/** As credenciais globais (S6): o IPC é registrado em main/index.ts; a ação HTTP (S5) usa o mesmo cofre. */
export const cofreDeCredenciais = criarCofreDeCredenciais({ pasta: PASTA_DADOS, cifra: safeStorage, gravarJsonAtomico, usadaEm: fluxosQueUsam })

const listaDoMotor = (espacoId: string): FluxoGravado[] => {
  try {
    return disco.listar(espacoId).fluxos
  } catch {
    return []
  }
}

// o serviço e o motor se citam (o motor registra pelo serviço; o serviço roda e zera a taxa pelo motor)
let motor: ReturnType<typeof criarMotor>

export const servicoDeFluxos = criarServicoDeFluxos({
  disco,
  selo,
  donoDe,
  colunas: colunasDoKanban,
  cartoes: (espacoId) => Object.entries(nomesDoEspaco(espacoId).agentes).map(([id, nome]) => ({ id, nome })),
  zerarTaxa: (e, id) => motor.zerarTaxa(e, id),
  rodarAgora: (e, id, conferir) => motor.rodarAgora(e, id, { conferir }),
  mudou: (e, aviso, tipo) => {
    paraAsJanelas(CANAIS_FLUXOS.mudou, e, aviso, tipo)
    // ligar, desligar (usuário, agente ou motor), gravar e apagar passam por aqui: a bandeja reconta (S7)
    avisarLigadosMudaram()
  },
  execucaoMudou: (e, fluxo, execucao) => paraAsJanelas(CANAIS_FLUXOS.execucaoMudou, e, fluxo, execucao),
  avisarFalha: (e, texto) => void avisarUsuario(e, texto, 'erro'),
  agora: () => new Date(),
  novoId: randomUUID
})

motor = criarMotor({
  agora: () => Date.now(),
  espacos: idsDosEspacos,
  fluxos: listaDoMotor,
  cartoes: (espacoId) => sessoesDoEspaco(espacoId).map((s) => ({ id: s.id, nome: s.espec.nome, agente: s.espec.agente })),
  situacao: async (id) => {
    const s = sessaoPorId(id)
    return s && !s.fim ? situacao(s) : null
  },
  nome: (id) => sessaoPorId(id)?.espec.nome ?? 'cartão que sumiu',
  acoes: (espacoId, fluxo, ctx) => acoesDoFluxo(espacoId, fluxo, ctx.cadeia),
  desligar: servicoDeFluxos.desligar,
  registrar: servicoDeFluxos.registrar,
  nomes: nomesDoEspaco,
  tirarEventos,
  destino: resolverDestino,
  foraDoAlcance,
  fichas: { tarefa: fichaDaTarefaNoEspaco, agente: fichaDoAgenteNoEspaco, contexto: contextoDoFluxo },
  conferirSelo: (espacoId, fluxo) => selo.conferir(espacoId, fluxo)
})

/** Quantos fluxos ligados há (a bandeja, S7). */
export const fluxosLigados = (): number => motor.fluxosLigados()

let relogio: ReturnType<typeof setInterval> | null = null

export function registrarFluxos(): void {
  // a bandeja conta os ligados pelo motor: sem isto ela conta 0 e o app sai ao fechar a última janela com fluxo ligado
  contarLigadosCom(fluxosLigados)
  registrarIpcDosFluxos(ipcMain, servicoDeFluxos)
  // coluna apagada no kanban (ork, MCP ou tela): os fluxos ligados que a usam desligam, e quem apagou fica sabendo (D1)
  aoSairemColunas(servicoDeFluxos.colunasSairam)
  relogio = setInterval(() => void motor.passo(), 1000)
  relogio.unref?.()
}

/** Para o motor (o app fechando). O que está rodando termina sozinho; nada novo dispara. */
export function pararFluxos(): void {
  if (relogio) clearInterval(relogio)
  relogio = null
}
