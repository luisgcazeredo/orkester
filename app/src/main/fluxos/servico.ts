// Fluxos: as regras do main sobre o disco (página, `ork` e MCP passam por aqui). Sem Electron: o disco, o selo, quem é
// dono de que espaço, o motor e os avisos vêm de quem cria o serviço (main/fluxos/index.ts), para a prova rodar no Node.
//
// Quem pode o quê:
//  - gravar, apagar, ligar, mover, pastas e rodar: a janela dona do espaço ou um espaço sem janela (`exigirDono`);
//  - fluxo sensível (Código, HTTP ou comando): agente e cliente MCP gravam, mas ele fica DESLIGADO; ligar, só o usuário,
//    com `mostrado` igual ao que está no disco, e aí o selo é refeito. Um nó sensível mudado desde a aprovação desliga
//    o fluxo ao gravar (qualquer autor);
//  - o motor não roda sensível com selo ausente ou errado (ele chama `desligar` com `mudou-sem-aprovacao`).
import type { AutorDaMudanca } from '../../shared/automacoes'
import type { ListaDeFluxos, ResumoDeFluxo } from '../../shared/api'
import type { Execucao, FluxoGravado, MotivoDoDesligado } from '../../shared/fluxos/formato'
import type { Coluna } from '../../shared/kanban'
import type { DiscoDeFluxos } from './disco'
import type { Selo } from './selo'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { criadaPorDe, MAX_POR_HORA, nomeNoCabecalho, podeMexerNoEspaco, porHoraDoHorario } from '../../shared/automacoes.ts'
// @ts-expect-error idem
import { assinaturaDoMostrado, ehSensivel, faltaParaLigar, fluxoNovo, lerExportado, locaisDoFluxo, MAX_LOCAIS_PERMITIDOS, resolverReferencias } from '../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { canonizarPermitido } from '../../shared/fluxos/rede.ts'
// @ts-expect-error idem
import { ehGatilho, usaColuna } from '../../shared/fluxos/nos.ts'

/** Um aviso de falha por fluxo a cada 10 min (1b.5). */
export const INTERVALO_DO_AVISO_DE_FALHA = 10 * 60_000
export const O_FLUXO_MUDOU = 'o fluxo mudou enquanto você confirmava; confira de novo'
export const SO_O_USUARIO_LIGA = 'fluxo com Código, HTTP ou comando: só o usuário liga, na página Fluxos, vendo cada um desses nós'

export const REDE_SO_PELA_PAGINA = 'os endereços locais permitidos só mudam pela página Fluxos, pelo usuário: o "rede" do JSON foi ignorado (ficou como estava)'
export const DESLIGADO_PELA_REDE = 'desligado: os endereços locais permitidos mudaram; ligue de novo para confirmar'

/**
 * O "rede" que veio no JSON: `undefined` = não mexe (fica o do disco); `{ locaisPermitidos: [...] }` = a lista
 * inteira, canônica e em ordem (`host:porta` que `autoridadeLocal` aceita); `null`, `false` ou lista vazia = nenhum.
 * Outra coisa é erro — inclusive o antigo `{ internaLiberada }`, que nunca vira permissão.
 */
export function redePedida(bruto: unknown): string[] | undefined {
  const r = bruto && typeof bruto === 'object' ? (bruto as { rede?: unknown }).rede : undefined
  if (r === undefined) return undefined
  if (r === null || r === false) return []
  const lista = typeof r === 'object' && Object.keys(r).length === 1 ? (r as { locaisPermitidos?: unknown }).locaisPermitidos : undefined
  if (Array.isArray(lista) && lista.length <= MAX_LOCAIS_PERMITIDOS) {
    const saida = new Set<string>()
    for (const x of lista) {
      const c = canonizarPermitido(x)
      if (!c) throw new Error(`"rede" inválida: ${JSON.stringify(String(x).slice(0, 80))} não é um endereço local que possa ser permitido (use host:porta, como localhost:5678 ou 192.168.0.10:80)`)
      saida.add(c)
    }
    return [...saida].sort()
  }
  throw new Error(`"rede" inválida: use { "locaisPermitidos": ["localhost:5678"] } (até ${MAX_LOCAIS_PERMITIDOS}) ou false`)
}

/**
 * O que `gravar` devolve: o fluxo gravado; se algo do JSON foi ignorado, o porquê (vai ao agente/MCP); e, se o gravar
 * desligou um fluxo que estava ligado, o motivo em `desligado` ("desligado: …", D8).
 */
export type FluxoGravadoComAviso = FluxoGravado & { aviso?: string; desligado?: string }

/** O motivo de um gravar do usuário que desliga porque um nó sensível mudou (D8). */
export const DESLIGADO_POR_NO_SENSIVEL = 'desligado: um nó sensível mudou; ligue de novo para aprovar'

export interface DependenciasDoServico {
  disco: DiscoDeFluxos
  selo: Selo
  /** O id do `webContents` da janela que tem o espaço aberto; `undefined` = sem janela. */
  donoDe(espaco: string): number | undefined
  /** Colunas do kanban do espaço (exemplos e referências). */
  colunas(espaco: string): readonly Coluna[]
  /** Cartões do espaço (referências de um fluxo colado). */
  cartoes(espaco: string): readonly { id: string; nome: string }[]
  /** O fluxo passou a ligado: a conta da hora dele recomeça (motor). */
  zerarTaxa(espaco: string, id: string): void
  /** "Rodar fluxo" pelo motor (na fila do espaço). */
  rodarAgora(espaco: string, id: string, conferir: (f: FluxoGravado) => boolean): Promise<{ ok: true; execucao: Execucao } | { ok: false; motivo: string }>
  /** A lista do espaço mudou; `aviso` = frase para o canto da janela. */
  mudou(espaco: string, aviso?: string, tipo?: 'erro'): void
  execucaoMudou(espaco: string, fluxo: string, execucao: string): void
  /** Uma falha de fluxo ligado (com janela, no canto; sem, notificação do sistema). */
  avisarFalha(espaco: string, texto: string): void
  agora(): Date
  novoId(): string
}

export type Ok<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

const falhou = (e: unknown): { ok: false; erro: string } => ({ ok: false, erro: e instanceof Error ? e.message : String(e) })
const nomeDoAutor = (a: AutorDaMudanca): string => (a.tipo === 'usuario' ? 'Você' : `"${a.nome}"`)
const MOTIVOS: Record<MotivoDoDesligado, string> = {
  excesso: 'disparou demais',
  'cartao-sumiu': 'um cartão dele sumiu do quadro',
  'mudou-sem-aprovacao': 'um nó com Código, HTTP ou comando mudou sem a sua aprovação',
  'coluna-sumiu': 'uma coluna dele saiu do kanban'
}
const RAZOES_DO_RODAR: Record<string, string> = {
  'nao-existe': 'esse fluxo não existe',
  'fluxo-mudou': O_FLUXO_MUDOU,
  'sem-manual': 'o fluxo não tem um gatilho Manual: ponha um para rodar daqui',
  'sem-aprovacao': 'fluxo com Código, HTTP ou comando: confirme os nós antes de rodar'
}

export function resumoDeFluxo(f: FluxoGravado, ultima?: ResumoDeFluxo['ultima']): ResumoDeFluxo {
  return {
    id: f.id,
    nome: f.nome,
    ligado: f.ligado,
    ...(f.pasta ? { pasta: f.pasta } : {}),
    criadoEm: f.criadoEm,
    ...(f.criadoPor ? { criadoPor: f.criadoPor } : {}),
    ...(f.editadoPor ? { editadoPor: f.editadoPor } : {}),
    nos: f.nos.length,
    gatilhos: f.nos.filter((n) => ehGatilho(n.tipo)).map((n) => n.tipo),
    sensivel: ehSensivel(f),
    limite: { ...f.limite },
    ...(f.desligadoPor ? { desligadoPor: f.desligadoPor } : {}),
    ...(ultima ? { ultima } : {})
  }
}

/** O teto que os nós Relógio pedem, subindo o atual se for preciso (até 30). */
function tetoPara(f: Pick<FluxoGravado, 'nos' | 'limite'>): number {
  const pedem = f.nos.filter((n) => n.tipo === 'gatilho.relogio').map((n) => porHoraDoHorario((n.ajustes as { quando: Parameters<typeof porHoraDoHorario>[0] }).quando))
  return Math.min(MAX_POR_HORA, Math.max(f.limite.porHora, ...pedem))
}

/**
 * O resultado que a lista mostra: o executor só diz ok/erro; um recado que não achou destino vira `sem-destino` (o nó
 * rodou, mas nada chegou a ninguém).
 */
export function resultadoParaGuardar(e: Execucao): Execucao['resultado'] {
  if (e.resultado !== 'ok') return e.resultado
  return Object.values(e.nos).some((n) => n.recado?.startsWith('sem-destino')) ? 'sem-destino' : 'ok'
}

export function criarServicoDeFluxos(d: DependenciasDoServico) {
  const ultimaFalha = new Map<string, number>()

  function exigirDono(espaco: string, remetente: number | undefined): void {
    if (remetente !== undefined && !podeMexerNoEspaco(d.donoDe(espaco), remetente)) throw new Error('este espaço está aberto em outra janela: mexa nos fluxos dele por lá')
  }

  function lerOuFalhar(espaco: string, id: string): FluxoGravado {
    const f = d.disco.ler(espaco, id)
    if (!f) throw new Error('esse fluxo não existe')
    return f
  }

  function gravarNoDisco(espaco: string, f: FluxoGravado): FluxoGravado {
    const r = d.disco.gravar(espaco, f)
    if (!r.ok) throw new Error(r.motivo)
    return r.valor
  }

  /** A lista da página. Na primeira vez do espaço, os 3 exemplos (desligados, na pasta Exemplos). */
  function listar(espaco: string): ListaDeFluxos {
    try {
      d.disco.criarExemplos(espaco, d.colunas(espaco), d.agora())
    } catch {
      // sem exemplos não é erro: a lista sai do mesmo jeito
    }
    const l = d.disco.listar(espaco)
    return {
      pastas: l.indice.pastas,
      fluxos: l.fluxos.map((f) => resumoDeFluxo(f, l.ultimas[f.id])),
      invalidos: l.invalidos.map((i) => ({ arquivo: i.arquivo, motivo: i.motivo }))
    }
  }

  /**
   * Cria (`id: null`) ou troca nome, nós e ligações. O resto (ligado, pasta, autor, aprovação) é do main. Desliga quando:
   * um agente ou cliente MCP grava um fluxo sensível; um nó sensível mudou desde a aprovação; falta escolher algo; a lista de
   * endereços locais permitidos mudou. `rede` só muda pelo usuário numa janela (`remetente`): agente, MCP e `ork` de fora
   * mantêm o do disco, e o retorno traz o aviso.
   */
  function gravar(espaco: string, id: string | null, bruto: unknown, autor: AutorDaMudanca, remetente?: number): FluxoGravadoComAviso {
    exigirDono(espaco, remetente)
    const rede = redePedida(bruto)
    const mudaRede = autor.tipo === 'usuario' && remetente !== undefined
    const lido = lerExportado(bruto)
    if (!lido.ok) throw new Error(lido.motivo)
    const corpo = resolverReferencias(lido.fluxo, { cartoes: d.cartoes(espaco), colunas: d.colunas(espaco) })
    const quem = criadaPorDe(autor)
    let f: FluxoGravado
    if (id === null) {
      f = fluxoNovo(corpo, { id: d.novoId(), agora: d.agora(), autor: quem })
    } else {
      const antes = lerOuFalhar(espaco, id)
      f = { ...antes, nome: corpo.nome, nos: corpo.nos, ligacoes: corpo.ligacoes, editadoPor: { ...quem, em: d.agora().toISOString() } }
      f.limite = { porHora: tetoPara(f) }
    }
    const redeAntes = JSON.stringify(locaisDoFluxo(f))
    if (mudaRede && rede !== undefined) {
      if (rede.length) f.rede = { locaisPermitidos: rede }
      else delete f.rede
    }
    // o primeiro motivo que desliga o fluxo ligado volta no retorno (D8); o do selo também fica no disco, para a lista
    let desligado: string | undefined
    const desligar = (motivo: string, doDisco?: MotivoDoDesligado): void => {
      f.ligado = false
      desligado = motivo
      if (doDisco) f.desligadoPor = { motivo: doDisco, em: d.agora().toISOString() }
    }
    // incluir, tirar ou trocar um endereço local desliga até a confirmação (que mostra a lista, e o selo a inclui)
    if (f.ligado && JSON.stringify(locaisDoFluxo(f)) !== redeAntes) desligar(DESLIGADO_PELA_REDE, 'mudou-sem-aprovacao')
    if (f.ligado && ehSensivel(f)) {
      const seloConfere = d.selo.conferir(espaco, f)
      if (autor.tipo !== 'usuario') desligar('desligado: tem Código, HTTP ou comando, e só o usuário liga', seloConfere ? undefined : 'mudou-sem-aprovacao')
      else if (!seloConfere) desligar(DESLIGADO_POR_NO_SENSIVEL, 'mudou-sem-aprovacao')
    }
    const falta = f.ligado ? faltaParaLigar(f) : null
    if (falta) desligar(`desligado: ${falta}`)
    const gravado = gravarNoDisco(espaco, f)
    const verbo = id === null ? 'criou' : 'editou'
    d.mudou(espaco, autor.tipo === 'usuario' ? undefined : `${nomeDoAutor(autor)} ${verbo} o fluxo "${nomeNoCabecalho(gravado.nome)}" (${gravado.ligado ? 'ligado' : 'desligado'}).`)
    return { ...gravado, ...(rede !== undefined && !mudaRede ? { aviso: REDE_SO_PELA_PAGINA } : {}), ...(desligado ? { desligado } : {}) }
  }

  /** Liga ou desliga. Ligar sensível: só o usuário, com `mostrado` igual ao disco; o selo é refeito. */
  function ligar(espaco: string, id: string, ligado: boolean, autor: AutorDaMudanca, mostrado?: unknown, remetente?: number): FluxoGravado {
    exigirDono(espaco, remetente)
    const f = lerOuFalhar(espaco, id)
    const antes = f.ligado
    if (ligado) {
      // a coluna que saiu do kanban também impede (D1); cartão não: o agente pode voltar com outro id e o gravar acha pelo nome
      const falta = faltaParaLigar(f, { colunas: d.colunas(espaco) })
      if (falta) throw new Error(falta)
      if (ehSensivel(f)) {
        if (autor.tipo !== 'usuario') throw new Error(SO_O_USUARIO_LIGA)
        if (mostrado !== assinaturaDoMostrado(f)) throw new Error(O_FLUXO_MUDOU)
        f.aprovado = d.selo.aprovar(espaco, f, d.agora())
      }
      delete f.desligadoPor
    }
    f.ligado = ligado
    const gravado = gravarNoDisco(espaco, f)
    if (ligado && !antes) d.zerarTaxa(espaco, id)
    d.mudou(espaco, autor.tipo === 'usuario' ? undefined : `${nomeDoAutor(autor)} ${ligado ? 'ligou' : 'desligou'} o fluxo "${nomeNoCabecalho(gravado.nome)}".`)
    return gravado
  }

  /** "Rodar fluxo" pelo gatilho Manual. Sensível sem aprovação: o `mostrado` certo aprova (o usuário viu os nós). */
  async function rodar(espaco: string, id: string, mostrado?: unknown, remetente?: number): Promise<string> {
    exigirDono(espaco, remetente)
    const f = lerOuFalhar(espaco, id)
    if (ehSensivel(f) && !d.selo.conferir(espaco, f)) {
      if (mostrado !== assinaturaDoMostrado(f)) throw new Error(RAZOES_DO_RODAR['sem-aprovacao'])
      gravarNoDisco(espaco, { ...f, aprovado: d.selo.aprovar(espaco, f, d.agora()) })
    }
    // o que roda é o que está no disco na vez dele: um nó sensível trocado no meio não roda
    const assinatura = assinaturaDoMostrado(f)
    const r = await d.rodarAgora(espaco, id, (relido) => assinaturaDoMostrado(relido) === assinatura)
    if (!r.ok) throw new Error(RAZOES_DO_RODAR[r.motivo] ?? r.motivo)
    return r.execucao.id
  }

  function apagar(espaco: string, id: string, autor: AutorDaMudanca, remetente?: number): void {
    exigirDono(espaco, remetente)
    const f = d.disco.ler(espaco, id)
    const r = d.disco.apagar(espaco, id)
    if (!r.ok) throw new Error(r.motivo)
    d.mudou(espaco, autor.tipo === 'usuario' || !f ? undefined : `${nomeDoAutor(autor)} apagou o fluxo "${nomeNoCabecalho(f.nome)}".`)
  }

  function naPasta<T>(espaco: string, remetente: number | undefined, fazer: () => { ok: true; valor: T } | { ok: false; motivo: string }): T {
    exigirDono(espaco, remetente)
    const r = fazer()
    if (!r.ok) throw new Error(r.motivo)
    d.mudou(espaco)
    return r.valor
  }

  /** Motor: desliga com o motivo e avisa. */
  function desligar(espaco: string, id: string, motivo: MotivoDoDesligado): void {
    try {
      const f = d.disco.ler(espaco, id)
      if (!f || !f.ligado) return
      gravarNoDisco(espaco, { ...f, ligado: false, desligadoPor: { motivo, em: d.agora().toISOString() } })
      d.mudou(espaco, `O fluxo "${nomeNoCabecalho(f.nome)}" foi desligado: ${MOTIVOS[motivo]}.`, 'erro')
    } catch {
      // não deu para gravar: o motor tenta de novo no próximo disparo
    }
  }

  /**
   * Colunas que saíram do kanban (D1). Os fluxos ligados que usam alguma desligam (`coluna-sumiu`), com um aviso na
   * janela; devolve a frase "usada pelos fluxos …" para quem apagou (`ork kanban coluna apagar`, a tela), ou `null`.
   * Avisa, não impede: a coluna já saiu.
   */
  function colunasSairam(espaco: string, colunas: readonly { id: string; nome: string }[]): string | null {
    const frases: string[] = []
    let desligouAlgum = false
    const fluxos = d.disco.listar(espaco).fluxos
    const nomes = (l: string[]): string => l.map((n) => `"${nomeNoCabecalho(n)}"`).join(', ')
    for (const c of colunas) {
      const usam = fluxos.filter((f) => f.nos.some((n) => usaColuna(n, c.id)))
      if (!usam.length) continue
      const desligados: string[] = []
      for (const f of usam) {
        if (!f.ligado) continue
        try {
          gravarNoDisco(espaco, { ...f, ligado: false, desligadoPor: { motivo: 'coluna-sumiu', em: d.agora().toISOString() } })
          desligados.push(f.nome)
        } catch {
          // não gravou: o fluxo segue ligado, mas o gatilho dele não casa com coluna nenhuma (não dispara)
        }
      }
      desligouAlgum ||= desligados.length > 0
      frases.push(
        `a coluna "${nomeNoCabecalho(c.nome)}" era usada pel${usam.length === 1 ? 'o fluxo' : 'os fluxos'} ${nomes(usam.map((f) => f.nome))}` +
          (desligados.length ? ` (desligado${desligados.length === 1 ? '' : 's'}: ${nomes(desligados)}, a coluna saiu do kanban)` : '')
      )
    }
    if (!frases.length) return null
    const texto = `Atenção: ${frases.join('; ')}. Escolha outra coluna nesses fluxos.`
    d.mudou(espaco, texto, desligouAlgum ? 'erro' : undefined)
    return texto
  }

  /** Os fluxos (ligados ou não) que usam a coluna, cada um uma vez: a tela do kanban lista antes de apagar (D1). */
  function quemUsaColuna(espaco: string, colunaId: string): { id: string; nome: string }[] {
    const vistos = new Set<string>()
    const usam: { id: string; nome: string }[] = []
    for (const f of d.disco.listar(espaco).fluxos) {
      if (vistos.has(f.id) || !f.nos.some((n) => usaColuna(n, colunaId))) continue
      vistos.add(f.id)
      usam.push({ id: f.id, nome: nomeNoCabecalho(f.nome) })
    }
    return usam
  }

  /** Motor: guarda a execução, avisa as janelas e, se um fluxo ligado falhou, avisa o usuário (1 vez a cada 10 min). */
  function registrar(espaco: string, execucao: Execucao, detalhe?: string): void {
    const e: Execucao = { ...execucao, resultado: resultadoParaGuardar(execucao), ...(detalhe ? { detalhe } : {}) }
    try {
      d.disco.gravarExecucao(espaco, e)
    } catch {
      // a execução é registro: não derruba o motor
    }
    d.execucaoMudou(espaco, e.fluxo, e.id)
    d.mudou(espaco)
    if (e.modo !== 'gatilho' || e.resultado !== 'erro') return
    const chave = `${espaco}|${e.fluxo}`
    const agora = d.agora().getTime()
    const ultima = ultimaFalha.get(chave)
    if (ultima !== undefined && agora - ultima < INTERVALO_DO_AVISO_DE_FALHA) return
    ultimaFalha.set(chave, agora)
    const f = d.disco.ler(espaco, e.fluxo)
    const noComErro = e.caminho.find((id) => e.nos[id]?.estado === 'erro')
    const onde = noComErro ? f?.nos.find((n) => n.id === noComErro)?.nome : undefined
    const porque = (noComErro ? e.nos[noComErro]?.erro : undefined) ?? e.detalhe
    const nome = nomeNoCabecalho(f?.nome ?? e.fluxo)
    d.avisarFalha(espaco, `Fluxo "${nome}" falhou${onde ? ` em "${nomeNoCabecalho(onde)}"` : ''}${porque ? `: ${porque}` : ''}`.slice(0, 300))
  }

  return {
    exigirDono,
    listar,
    ler: (espaco: string, id: string): FluxoGravado | null => d.disco.ler(espaco, id),
    gravar,
    ligar,
    rodar,
    apagar,
    mover: (espaco: string, id: string, pasta: string | null, remetente?: number) => naPasta(espaco, remetente, () => d.disco.mover(espaco, id, pasta)),
    criarPasta: (espaco: string, nome: string, pai: string | null, remetente?: number) => naPasta(espaco, remetente, () => d.disco.criarPasta(espaco, nome, pai ?? undefined)),
    renomearPasta: (espaco: string, id: string, nome: string, remetente?: number) => naPasta(espaco, remetente, () => d.disco.renomearPasta(espaco, id, nome)),
    apagarPasta: (espaco: string, id: string, remetente?: number) => naPasta(espaco, remetente, () => d.disco.apagarPasta(espaco, id)),
    execucoes: (espaco: string, id: string, limite?: number) => d.disco.execucoes(espaco, id, limite),
    execucao: (espaco: string, id: string, execId: string) => d.disco.execucao(espaco, id, execId),
    desligar,
    colunasSairam,
    quemUsaColuna,
    registrar,
    falhou
  }
}

export type ServicoDeFluxos = ReturnType<typeof criarServicoDeFluxos>
