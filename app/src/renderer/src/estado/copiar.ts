import { type Corda, type Desenho, type No, type NoPostIt } from '../../../shared/modelo'
import { proximoZ } from '../../../shared/quadro/geometria'
import { agora, novoId } from './nos'
import { agendarSalvar, definir, estado, mudarPlano, planoAtual, registrarHistorico } from './nucleo'

// ---------- copiar, colar e duplicar ----------

/** Pedaço do quadro: cartões, traços, as ligações entre eles e o texto dos post-its. */
export interface Fragmento {
  nos: No[]
  desenhos: Desenho[]
  cordas: Corda[]
  notas: Record<string, string>
}

export function fragmentoDaSelecao(): Fragmento | null {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return null
  const nos = plano.nos.filter((n) => s.nos.includes(n.id))
  const desenhos = plano.desenhos.filter((d) => s.desenhos.includes(d.id))
  if (!nos.length && !desenhos.length) return null
  const ids = new Set(nos.map((n) => n.id))
  const notas: Record<string, string> = {}
  for (const n of nos) if (n.tipo === 'postit') notas[n.arquivo] = estado.notas[n.arquivo] ?? ''
  return { nos, desenhos, cordas: plano.cordas.filter((c) => ids.has(c.de) && ids.has(c.para)), notas }
}

/**
 * Põe uma cópia do fragmento no quadro, deslocada de (dx, dy), por cima de tudo, e a seleciona.
 * Ids, grupos e arquivos de post-it são novos; a cópia nasce destravada.
 */
export function colarFragmento(f: Fragmento, dx: number, dy: number, sufixoTerminal = ''): void {
  const plano = planoAtual()
  if (!plano) return
  registrarHistorico()
  const ids = new Map<string, string>()
  // só vira grupo na cópia o grupo que veio com dois itens ou mais (um item de dentro de um grupo vem solto)
  const membros = new Map<string, number>()
  for (const i of [...f.nos, ...f.desenhos]) if (i.grupo) membros.set(i.grupo, (membros.get(i.grupo) ?? 0) + 1)
  const grupos = new Map<string, string>()
  const grupoNovo = (g?: string): string | undefined => {
    if (!g || (membros.get(g) ?? 0) < 2) return undefined
    if (!grupos.has(g)) grupos.set(g, novoId())
    return grupos.get(g)
  }
  let z = proximoZ(plano)
  const notas = { ...estado.notas }
  const nos = [...f.nos]
    .sort((a, b) => a.z - b.z)
    .map((n) => {
      const id = novoId()
      ids.set(n.id, id)
      const copia = { ...n, id, x: n.x + dx, y: n.y + dy, z: z++, criadoEm: agora(), travado: false, grupo: grupoNovo(n.grupo) } as No
      if (copia.tipo === 'postit') {
        copia.arquivo = `${id}.md`
        notas[copia.arquivo] = f.notas[(n as NoPostIt).arquivo] ?? ''
      }
      // a cópia é outra conversa e é do usuário: não leva a sessão nem quem a abriu
      if (copia.tipo === 'terminal') {
        copia.nome += sufixoTerminal
        copia.sessao = copia.agente === 'claude' ? novoId() : undefined
        copia.criadoPor = undefined
      }
      return copia
    })
  // cartão de código copiado junto com o agente passa a acompanhar a cópia dele; copiado sozinho, fica
  // sem agente e volta a seguir a pasta (apontar para o id antigo seria uma ligação morta)
  for (const copia of nos) if (copia.tipo === 'codigo' && copia.terminal) copia.terminal = ids.get(copia.terminal)
  const desenhos: Desenho[] = f.desenhos.map((d) => ({
    ...d,
    id: novoId(),
    z: z++,
    grupo: grupoNovo(d.grupo),
    pontos: d.pontos.map(([x, y]) => [x + dx, y + dy] as [number, number])
  }))
  const cordas: Corda[] = f.cordas
    .filter((c) => ids.has(c.de) && ids.has(c.para))
    .map((c) => ({ ...c, id: novoId(), de: ids.get(c.de)!, para: ids.get(c.para)!, criadoEm: agora() }))
  definir({ notas })
  mudarPlano((p) => ({ ...p, nos: [...p.nos, ...nos], desenhos: [...p.desenhos, ...desenhos], cordas: [...p.cordas, ...cordas] }), false)
  definir({ selecao: { nos: nos.map((n) => n.id), desenhos: desenhos.map((d) => d.id), corda: null }, editando: null })
}

/** Cópia da seleção ao lado do original (Ctrl+D). */
export function duplicarSelecao(): void {
  const f = fragmentoDaSelecao()
  if (f) colarFragmento(f, 40, 40, ' (cópia)')
}

export function definirNota(arquivo: string, texto: string): void {
  registrarHistorico(`nota:${arquivo}`)
  definir({ notas: { ...estado.notas, [arquivo]: texto } })
  agendarSalvar()
}
