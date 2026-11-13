import { type Andar, type Espaco, type NoTerminal, type Plano } from '../../../shared/modelo'
import { type EspecTerminal } from '../../../shared/api'
import { cordasEfetivas } from '../../../shared/quadro/bandas'
import { estado, mudarEspaco } from './nucleo'

// ---------- terminais: os processos moram no processo principal ----------

/** Cartões fechados por um agente (`ork fechar`): o desfazer do usuário não os traz de volta. */
export const fechadosPorAgente = new Set<string>()
let firmaTerminais = ''
/** O pedaço de assinatura de cada cartão, guardado pela identidade do objeto (ver sincronizarTerminais). */
const assinaturas = new WeakMap<object, { pasta: string; texto: string }>()

function firmaDoCartao(n: { id: string; nome: string; agente: string; comando?: string; sessao?: string; criadoPor?: string }, pasta: string): string {
  const guardado = assinaturas.get(n)
  if (guardado && guardado.pasta === pasta) return guardado.texto
  const texto = [n.id, n.nome, n.agente, n.comando ?? '', pasta, n.sessao ?? '', n.criadoPor ?? ''].join('\u0001')
  assinaturas.set(n, { pasta, texto })
  return texto
}

/** Pasta onde os terminais de um plano abrem: a do andar (worktree) ou a do projeto. */
function pastaDe(espaco: Espaco, plano: Plano): string {
  return (plano !== espaco && (plano as Andar).git?.pasta) || espaco.pasta
}

/**
 * Manda ao processo principal os terminais do espaço (todos os andares) e as cordas, sempre que mudarem.
 * Ele cria os processos que faltam e encerra os dos cartões apagados.
 */
export function sincronizarTerminais(): void {
  const e = estado.espaco
  if (!e) return
  // Roda a cada mudança do espaço — inclusive a cada quadro de tela de um arrasto. Por isso a assinatura é
  // montada sem criar objeto nem serializar nada: o texto de cada cartão fica guardado pela identidade do
  // objeto (o estado é imutável, então um cartão mudado é um objeto novo) e num arrasto só o cartão movido
  // muda. A lista de verdade só é montada quando a assinatura muda.
  const partes: string[] = [e.id]
  // as cordas que o main recebe são as **efetivas**: as desenhadas mais as que a banda implica (todos os de
  // dentro da moldura entre si, e cada um com quem a banda está ligada). Assim o main segue com uma regra só
  // — corda é permissão — e não precisa saber o que é banda. Quando não há banda no plano, não custa nada.
  const efetivas = new Map<Plano, Array<[string, string]>>()
  for (const plano of [e, ...e.andares]) {
    const pastaDoPlano = pastaDe(e, plano)
    for (const n of plano.nos) if (n.tipo === 'terminal') partes.push(firmaDoCartao(n, n.pasta || pastaDoPlano))
    const lista = plano.nos.some((n) => n.tipo === 'banda')
      ? cordasEfetivas(plano)
      : plano.cordas.map((c) => [c.de, c.para] as [string, string])
    efetivas.set(plano, lista)
    // a lista efetiva entra na firma: arrastar um agente para dentro da moldura muda a permissão, e sem isto
    // a mudança não chegaria ao main (a firma de um cartão não inclui o lugar dele, de propósito)
    for (const [de, para] of lista) partes.push(`c\u0001${de}\u0001${para}`)
  }
  const firma = partes.join('\u0002')
  if (firma === firmaTerminais) return
  firmaTerminais = firma
  const especs: EspecTerminal[] = []
  const cordas: Array<[string, string]> = []
  for (const plano of [e, ...e.andares]) {
    for (const n of plano.nos) {
      if (n.tipo !== 'terminal') continue
      const { id, nome, agente, comando, sessao, criadoPor, funcao } = n
      especs.push({ id, nome, agente, comando, pasta: n.pasta || pastaDe(e, plano), sessao, criadoPor, funcao })
    }
    for (const par of efetivas.get(plano) ?? []) cordas.push(par)
  }
  window.ork.terminal.sincronizar(e.id, especs, cordas).then(anotarSessoes, () => (firmaTerminais = ''))
}

export function mudarTerminal(id: string, mudar: (n: NoTerminal) => NoTerminal): void {
  const trocar = (p: Plano): Plano =>
    p.nos.some((n) => n.id === id) ? { ...p, nos: p.nos.map((n) => (n.id === id && n.tipo === 'terminal' ? mudar(n) : n)) } : p
  mudarEspaco((e) => ({ ...e, ...trocar(e), andares: e.andares.map((a) => ({ ...a, ...trocar(a) })) }), false)
}

/** O processo principal descobriu a conversa (Codex) de cartões: fica salva para retomar. */
export function anotarSessoes(descobertas: Record<string, string>): void {
  for (const [id, sessao] of Object.entries(descobertas)) mudarTerminal(id, (n) => (n.sessao === sessao ? n : { ...n, sessao }))
}
