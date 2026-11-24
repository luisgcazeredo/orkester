// Formulários dos nós: o que todos usam. O contexto do espaço (agentes, shells, colunas), os seletores (tirados das
// Automações da 1.9.6), o horário e a lista nome → valor. Os ajustes chegam do rascunho, que pode ter vindo de uma
// colagem tolerante: cada leitura aqui é defensiva (`texto`, `ref`, `lista`) e nunca quebra a tela.
import { useMemo, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import type { AgenteDoKanban, Coluna } from '../../../../../shared/kanban'
import type { QuandoDaRotina } from '../../../../../shared/modelo'
import type { ParNomeValor, Referencia } from '../../../../../shared/fluxos/tipos'
import { referenciaExiste } from '../../../../../shared/fluxos/nos'
import { usarKanban } from '../../kanban/usarKanban'

export interface ContextoDoEspaco {
  agentes: AgenteDoKanban[]
  shells: AgenteDoKanban[]
  colunas: Coluna[]
  /** O kanban do espaço já chegou. Antes disso as listas estão vazias e nada pode ser dado como apagado. */
  carregado: boolean
}

const VAZIO: ContextoDoEspaco = { agentes: [], shells: [], colunas: [], carregado: false }

export function usarContextoDoEspaco(espacoId: string | undefined): ContextoDoEspaco {
  const { leitura } = usarKanban(espacoId)
  return useMemo(() => {
    if (!leitura) return VAZIO
    return {
      agentes: leitura.agentes.filter((a) => a.agente !== 'shell'),
      shells: leitura.agentes.filter((a) => a.agente === 'shell'),
      colunas: leitura.arquivo.colunas,
      carregado: true
    }
  }, [leitura])
}

/**
 * O espaço para as regras de referência do shared (`faltaDoNo`, `referenciaExiste`). `undefined` enquanto o kanban não
 * chegou: aí nenhuma coluna ou cartão é dado como apagado.
 */
export const espacoDasReferencias = (ctx: ContextoDoEspaco): { cartoes: AgenteDoKanban[]; colunas: Coluna[] } | undefined =>
  ctx.carregado ? { cartoes: [...ctx.agentes, ...ctx.shells], colunas: ctx.colunas } : undefined

/** O id existia e saiu do espaço (a regra é a do Motor: `referenciaExiste`). */
const apagadaNoEspaco = (valor: Referencia | undefined, de: 'cartao' | 'coluna', ctx: ContextoDoEspaco): boolean => {
  const espaco = espacoDasReferencias(ctx)
  return !!valor?.id && !!espaco && !referenciaExiste(valor, de, espaco)
}

/** As props de todo formulário: os ajustes do nó (já defensivos no uso), o contexto e `mudar` com os ajustes novos. */
export interface PropsDoFormulario {
  ajustes: Record<string, unknown>
  ctx: ContextoDoEspaco
  mudar: (ajustes: Record<string, unknown>) => void
  /** Espaço de outra janela: só olhar. */
  somenteLer: boolean
}

// ---------------------------------------------------------------- leitura defensiva

export const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
export const ref = (v: unknown): Referencia | undefined => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  return o && typeof o.id === 'string' && typeof o.nome === 'string' ? { id: o.id, nome: o.nome } : undefined
}
export const lista = <T,>(v: unknown, ler: (x: Record<string, unknown>) => T): T[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)).map(ler) : []
export const pares = (v: unknown): ParNomeValor[] => lista(v, (x) => ({ nome: texto(x.nome), valor: texto(x.valor) }))

/** Ajustes sem as chaves `undefined` (o campo opcional que voltou a "qualquer" sai do JSON). */
export const sem = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

// ---------------------------------------------------------------- peças

export function Campo({ rotulo, nota, children }: { rotulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <label className="ed-campo">
      <span className="ed-campo-rotulo">{rotulo}</span>
      {children}
      {nota && <span className="ed-campo-nota suave">{nota}</span>}
    </label>
  )
}

/** Cartão "a escolher" (o nome não bateu com nada deste espaço): aparece como opção marcada até o usuário trocar. */
const valorDaRef = (r: Referencia | undefined): string => (r ? (r.id ? r.id : `?${r.nome}`) : '')

/**
 * Seletor de cartão do espaço. `qualquer`: o texto da opção vazia (ausente = obrigatório). `maestro`: o Maestro vivo do
 * espaço (o destino padrão do recado). `shells`: `'junto'` põe os shells num grupo à parte, `'so'` mostra só eles.
 */
export function SeletorDeCartao({ valor, mudar, ctx, rotulo, qualquer, maestro, shells, somenteLer }: {
  valor: Referencia | undefined
  mudar: (r: Referencia | undefined) => void
  ctx: ContextoDoEspaco
  rotulo: string
  qualquer?: string
  maestro?: boolean
  shells?: 'junto' | 'so'
  somenteLer: boolean
}) {
  const principais = shells === 'so' ? ctx.shells : ctx.agentes
  const todos = [...ctx.agentes, ...ctx.shells]
  const escolher = (id: string): void => {
    if (!id) return mudar(undefined)
    if (id === 'maestro') return mudar({ id: 'maestro', nome: 'Maestro' })
    if (id.startsWith('?')) return
    const a = todos.find((x) => x.id === id)
    mudar(a ? { id: a.id, nome: a.nome } : undefined)
  }
  const atual = valorDaRef(valor)
  const conhecido = !valor || valor.id === 'maestro' || todos.some((a) => a.id === valor.id)
  const apagado = apagadaNoEspaco(valor, 'cartao', ctx)
  return (
    <select
      aria-label={rotulo}
      value={atual}
      disabled={somenteLer}
      onChange={(e) => escolher(e.target.value)}
      data-a-escolher={valor && !valor.id ? '' : undefined}
      data-apagada={apagado ? '' : undefined}
    >
      {qualquer !== undefined ? <option value="">{qualquer}</option> : !valor && <option value="">(escolha)</option>}
      {maestro && <option value="maestro">o Maestro</option>}
      {valor && !conhecido && <option value={atual}>{valor.id ? (apagado ? `${valor.nome} (apagado)` : valor.nome) : `${valor.nome} (a escolher)`}</option>}
      {principais.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nome}
        </option>
      ))}
      {shells === 'junto' && ctx.shells.length > 0 && (
        <optgroup label="shells">
          {ctx.shells.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

export function SeletorDeColuna({ valor, mudar, ctx, rotulo, qualquer, somenteLer }: {
  valor: Referencia | undefined
  mudar: (r: Referencia | undefined) => void
  ctx: ContextoDoEspaco
  rotulo: string
  qualquer?: string
  somenteLer: boolean
}) {
  const atual = valorDaRef(valor)
  const conhecida = !valor || ctx.colunas.some((c) => c.id === valor.id)
  const apagada = apagadaNoEspaco(valor, 'coluna', ctx)
  return (
    <select
      aria-label={rotulo}
      value={atual}
      disabled={somenteLer}
      data-a-escolher={valor && !valor.id ? '' : undefined}
      data-apagada={apagada ? '' : undefined}
      onChange={(e) => {
        const c = ctx.colunas.find((x) => x.id === e.target.value)
        if (e.target.value.startsWith('?')) return
        mudar(c ? { id: c.id, nome: c.nome } : undefined)
      }}
    >
      {qualquer !== undefined ? <option value="">{qualquer}</option> : !valor?.nome && <option value="">(escolha)</option>}
      {valor && valor.nome && !conhecida && <option value={atual}>{valor.id ? (apagada ? `${valor.nome} (apagada)` : valor.nome) : `${valor.nome} (a escolher)`}</option>}
      {ctx.colunas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  )
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
/** Ao escolher "a cada…", um intervalo curto que já dá para ver funcionando. */
const MINUTOS_AO_ESCOLHER_CADA = 15

/** O horário de um relógio (o seletor das Automações da 1.9.6). */
export function Horario({ q, mudar, minimo, somenteLer }: { q: QuandoDaRotina; mudar: (q: QuandoDaRotina) => void; minimo: number; somenteLer: boolean }) {
  const hhmm = q.tipo === 'cada' ? '09:00' : `${String(q.hora).padStart(2, '0')}:${String(q.minuto).padStart(2, '0')}`
  const comHora = (v: string): { hora: number; minuto: number } => {
    const [h, m] = v.split(':').map((n) => Number(n) || 0)
    return { hora: h, minuto: m }
  }
  return (
    <div className="ed-linha">
      <select
        aria-label="Frequência"
        value={q.tipo}
        disabled={somenteLer}
        onChange={(e) => {
          const t = e.target.value as QuandoDaRotina['tipo']
          mudar(t === 'cada' ? { tipo: 'cada', minutos: MINUTOS_AO_ESCOLHER_CADA } : t === 'diario' ? { tipo: 'diario', ...comHora(hhmm) } : { tipo: 'semanal', dia: 1, ...comHora(hhmm) })
        }}
      >
        <option value="cada">a cada…</option>
        <option value="diario">todo dia às…</option>
        <option value="semanal">toda semana…</option>
      </select>
      {q.tipo === 'cada' && (
        <>
          <input
            type="number"
            aria-label="Minutos"
            className="ed-numero"
            min={minimo}
            max={7 * 24 * 60}
            value={q.minutos}
            disabled={somenteLer}
            onChange={(e) => mudar({ tipo: 'cada', minutos: Math.max(minimo, Number(e.target.value) || minimo) })}
          />
          <span className="suave">min</span>
        </>
      )}
      {q.tipo === 'semanal' && (
        <select aria-label="Dia da semana" value={q.dia} disabled={somenteLer} onChange={(e) => mudar({ ...q, dia: Number(e.target.value) })}>
          {DIAS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      )}
      {q.tipo !== 'cada' && <input type="time" aria-label="Hora" value={hhmm} disabled={somenteLer} onChange={(e) => mudar({ ...q, ...comHora(e.target.value) })} />}
    </div>
  )
}

/** Lista editável de pares nome → valor (Definir, consulta e cabeçalhos do HTTP). */
export function ListaDePares({ itens, mudar, rotuloNome, rotuloValor, somenteLer, max }: {
  itens: ParNomeValor[]
  mudar: (itens: ParNomeValor[]) => void
  rotuloNome: string
  rotuloValor: string
  somenteLer: boolean
  max: number
}) {
  const trocar = (i: number, p: Partial<ParNomeValor>): void => mudar(itens.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="ed-pares">
      {itens.map((p, i) => (
        <div key={i} className="ed-par">
          <input aria-label={`${rotuloNome} ${i + 1}`} placeholder={rotuloNome} value={p.nome} disabled={somenteLer} onChange={(e) => trocar(i, { nome: e.target.value })} />
          <input aria-label={`${rotuloValor} ${i + 1}`} placeholder={rotuloValor} value={p.valor} disabled={somenteLer} onChange={(e) => trocar(i, { valor: e.target.value })} />
          {!somenteLer && (
            <button type="button" className="ed-icone" title="Tirar" aria-label={`Tirar ${p.nome || 'linha'}`} onClick={() => mudar(itens.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      {!somenteLer && itens.length < max && (
        <button type="button" className="ed-botao-leve" onClick={() => mudar([...itens, { nome: '', valor: '' }])}>
          <Plus size={14} /> {rotuloNome}
        </button>
      )}
    </div>
  )
}

/** A nota sobre expressões, nos campos em que elas valem. */
export const NOTA_DE_EXPRESSAO = (
  <>
    Aceita <code>{'{{ campo }}'}</code> do item que chega (ex.: <code>{'{{ titulo }}'}</code>).
  </>
)
