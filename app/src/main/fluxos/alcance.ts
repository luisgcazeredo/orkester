// O alcance de um fluxo feito por agente, nó a nó. Puro (sem Electron): quem está ligado a quem vem de fora, para a
// prova rodar no Node. O `ork fluxo` (main/fluxos/verbos.ts) usa `prenderFluxoAoAlcance` ao gravar, e o motor usa
// `vereditoDoAlcance` a cada disparo, porque a corda pode sair e o cartão pode fechar depois de gravado.
//
// Vale para o fluxo cujo último autor de conteúdo é um agente (`agenteDoFluxo`). O usuário "adota" o fluxo editando-o
// pela página (o `editadoPor` passa a ser ele, sem id de cartão).
import type { EventoDeAutomacao, VereditoDoAlcance } from '../../shared/automacoes'
import type { FluxoExportado, FluxoGravado, NoDoFluxo, Referencia } from '../../shared/fluxos/formato'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { agenteDaRegra, nomeNoCabecalho } from '../../shared/automacoes.ts'
// @ts-expect-error idem
import { CATALOGO } from '../../shared/fluxos/nos.ts'
// @ts-expect-error idem
import { gatilhoQueCasa } from '../motorDeAutomacoes.ts'

/** O agente que responde pelo conteúdo do fluxo: quem o editou por último, senão quem o criou. Usuário ou MCP: nenhum. */
export const agenteDoFluxo = (f: Pick<FluxoGravado, 'criadoPor' | 'editadoPor'>): string | undefined => agenteDaRegra({ criadaPor: f.criadoPor, editadaPor: f.editadoPor })

/**
 * Campos de cartão que o alcance não confere (`tipo:campo`): o filtro de responsável do Consultar de tarefas só lê o
 * kanban, que o agente já lê inteiro pelo `ork kanban`.
 */
const FORA_DO_ALCANCE = new Set(['orkester.consultar:responsavel'])

/** Os campos de cartão do nó (recado, gatilhos de entrega e de parada, comando, consultar), com o que apontam. */
function cartoesDoNo(no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>): { campo: string; ref: Referencia }[] {
  const saida: { campo: string; ref: Referencia }[] = []
  for (const r of CATALOGO[no.tipo].referencias) {
    if (r.de !== 'cartao' || FORA_DO_ALCANCE.has(`${no.tipo}:${r.campo}`)) continue
    const ref = no.ajustes[r.campo] as Referencia | undefined
    if (ref) saida.push({ campo: r.campo, ref })
  }
  return saida
}

const PAPEL: Record<string, string> = {
  para: 'para quem vai o recado',
  entregaPara: 'para quem vai a entrega',
  de: 'de quem é a entrega vigiada',
  agente: 'quem o gatilho vigia',
  terminal: 'o shell do comando',
  // o mesmo campo em outro nó (chave `tipo:campo`, vale antes da do campo)
  'orkester.consultar:agente': 'o agente consultado'
}

export interface AlcanceAoGravar {
  agente: string
  /** Os cartões ligados ao agente agora (cordas e os que ele abriu). */
  alcance: ReadonlySet<string>
  /** O Maestro vivo do espaço agora. */
  maestro?: string
  nome(id: string): string
}

/**
 * Ao gravar por agente: todo cartão que um nó cita (já resolvido para o espaço) precisa estar ao alcance do `ork` dele,
 * ou ser ele mesmo. "A escolher" (`id: ''`) passa (o fluxo não liga assim). `maestro` vale o de agora; sem Maestro
 * aberto, passa e é conferido no disparo. Recado sem `entregaPara` ganha o próprio agente, como no `ork pedir`.
 * Devolve o fluxo (com essa entrega preenchida) ou o motivo da recusa.
 */
export function prenderFluxoAoAlcance<F extends Pick<FluxoExportado, 'nos'>>(fluxo: F, ctx: AlcanceAoGravar): F | string {
  const nos: NoDoFluxo[] = []
  for (const no of fluxo.nos) {
    for (const { campo, ref } of cartoesDoNo(no)) {
      const id = ref.id === 'maestro' ? ctx.maestro : ref.id
      if (!id || id === ctx.agente || ctx.alcance.has(id)) continue
      return (
        `nó "${nomeNoCabecalho(no.nome)}", ${PAPEL[`${no.tipo}:${campo}`] ?? PAPEL[campo] ?? campo}: "${nomeNoCabecalho(ctx.nome(id))}" não está ligado a você por corda. ` +
        'Fluxo feito por agente só cita quem o seu `ork` alcança (veja `ork quem`); nada mudou'
      )
    }
    if (no.tipo === 'orkester.recado' && !no.ajustes.entregaPara) {
      nos.push({ ...no, ajustes: { ...no.ajustes, entregaPara: { id: ctx.agente, nome: ctx.nome(ctx.agente) } } })
    } else nos.push(no)
  }
  return { ...fluxo, nos }
}

export interface AlcanceNoDisparo {
  /** Os ids ligados ao agente agora, ou `null` se ele não tem sessão aberta. */
  alcanceDe(agente: string): ReadonlySet<string> | null
  /** O cartão do agente não existe mais no quadro do espaço. */
  saiuDoQuadro(agente: string): boolean
  /** `maestro` → o Maestro vivo; um id → ele mesmo. */
  destino(id: string): string | undefined
  nome(id: string): string
}

/** Os cartões cujo conteúdo o evento leva (o texto de uma entrega é de quem entregou e de quem recebeu). */
function cartoesDoEvento(e: EventoDeAutomacao): string[] {
  if (e.tipo === 'entrega') return [e.de, e.para].filter((x): x is string => !!x)
  if (e.tipo === 'parou') return [e.agente]
  return []
}

/** Tarefa com expressão leva algo do evento para o kanban; texto fixo não leva nada de ninguém. */
const tarefaLevaEvento = (no: NoDoFluxo): boolean =>
  no.tipo === 'orkester.tarefa' && [no.ajustes.titulo, no.ajustes.descricao].some((t) => typeof t === 'string' && t.includes('{{'))

/**
 * No disparo (e no "Rodar fluxo"), para o fluxo de agente. Só vale para o que leva algo do evento ou fala em nome do
 * agente: **recado**, e **tarefa com expressão**. Comando, avisar, Código e HTTP passam (o usuário os viu ao ligar).
 *  - agente sem sessão: pula (o fluxo continua ligado); com recado e o cartão fora do quadro: desliga ("cartão sumiu");
 *  - o gatilho que disparou vigia um cartão fora do alcance: pula;
 *  - o evento é de um cartão fora do alcance (gatilho "qualquer"): o fluxo não o vê (`ignorar`, sem linha);
 *  - o destino de um recado, ou quem recebe a entrega dele, saiu do alcance: pula.
 */
export function vereditoDoAlcance(fluxo: FluxoGravado, e: EventoDeAutomacao, ctx: AlcanceNoDisparo): VereditoDoAlcance {
  const agente = agenteDoFluxo(fluxo)
  if (!agente) return null
  const recados = fluxo.nos.filter((n) => n.tipo === 'orkester.recado')
  if (!recados.length && !fluxo.nos.some(tarefaLevaEvento)) return null
  const quem = nomeNoCabecalho(ctx.nome(agente))
  const alcance = ctx.alcanceDe(agente)
  if (!alcance) {
    if (recados.length && ctx.saiuDoQuadro(agente)) return { pular: `desligado: "${quem}", o agente do fluxo, saiu do quadro`, desligar: true }
    return { pular: `pulado: fora do alcance — "${quem}", o agente do fluxo, está sem sessão (o fluxo continua ligado)` }
  }
  const ve = (id: string): boolean => id === agente || alcance.has(id)
  const fora = (id: string, papel: string): { pular: string } => ({
    pular: `pulado: fora do alcance de "${quem}" — ${papel} "${nomeNoCabecalho(ctx.nome(id))}" não está ligado a ele por corda (o fluxo continua ligado)`
  })
  if (e.tipo !== 'teste') {
    const gatilho = gatilhoQueCasa(fluxo, e)
    if (gatilho) {
      for (const { ref } of cartoesDoNo(gatilho)) if (ref.id && !ve(ref.id)) return fora(ref.id, `o gatilho "${nomeNoCabecalho(gatilho.nome)}" vigia`)
    }
    if (cartoesDoEvento(e).some((id) => !ve(id))) return 'ignorar'
  }
  for (const no of recados) {
    const a = no.ajustes as { para: Referencia; entregaPara?: Referencia }
    const para = a.para.id ? ctx.destino(a.para.id) : undefined
    if (para && !ve(para)) return fora(para, `o recado "${nomeNoCabecalho(no.nome)}" vai para`)
    const entrega = ctx.destino(a.entregaPara?.id || 'maestro')
    if (entrega && !ve(entrega)) return fora(entrega, `a entrega do recado "${nomeNoCabecalho(no.nome)}" volta para`)
  }
  return null
}
