import type { Agente } from './modelo.ts'
// Modelo e esforço por agente: contrato e montagem da linha de comando. Puro (sem disco, sem Electron).
// Modelo e esforço viram texto digitado no PowerShell, então TODO valor passa por `modeloValido` / `esforcoValido`
// antes de entrar numa linha: o que não passa é ignorado aqui (defesa em profundidade; quem recebe o valor do
// usuário deve recusar com erro claro antes de chegar até aqui).

export type Esforco = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

export const ESFORCOS: readonly Esforco[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
/** Os níveis que o Claude Code aceita em `--effort`; `ultra` é só do Codex. */
const ESFORCOS_CLAUDE: readonly Esforco[] = ['low', 'medium', 'high', 'xhigh', 'max']

export interface ModeloDisponivel {
  id: string
  nome?: string
  /** Níveis que este modelo aceita; sem isto vale o conjunto geral do motor. */
  esforcos?: Esforco[]
  padrao?: Esforco
}

type NivelDeAtalho = 'forte' | 'medio' | 'rapido'

export interface ListaDeModelos {
  claude: ModeloDisponivel[]
  codex: ModeloDisponivel[]
  atalhos: Record<'claude' | 'codex', Partial<Record<NivelDeAtalho, { modelo: string; esforco?: Esforco }>>>
}

export const MODELOS_PADRAO: ListaDeModelos = {
  claude: [
    { id: 'fable', nome: 'Fable (o mais novo)' },
    { id: 'opus', nome: 'Opus (o mais novo)' },
    { id: 'sonnet', nome: 'Sonnet (o mais novo)' },
    { id: 'haiku', nome: 'Haiku (o mais novo)' }
  ],
  codex: [{ id: 'gpt-5.6-terra' }, { id: 'gpt-5.6-luna' }],
  atalhos: {
    claude: {
      forte: { modelo: 'opus', esforco: 'xhigh' },
      medio: { modelo: 'sonnet', esforco: 'high' },
      rapido: { modelo: 'haiku', esforco: 'medium' }
    },
    codex: {
      forte: { modelo: 'gpt-5.6-terra', esforco: 'xhigh' },
      medio: { modelo: 'gpt-5.6-terra', esforco: 'medium' },
      rapido: { modelo: 'gpt-5.6-luna', esforco: 'low' }
    }
  }
}

const FORMATO_DO_MODELO = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,79}$/

/** Formato fechado: letras, números e `. _ : - [ ]`, até 80 caracteres, sem espaço, aspas, `;`, `$` ou `(`. */
export function modeloValido(id: unknown): id is string {
  return typeof id === 'string' && FORMATO_DO_MODELO.test(id)
}

export function esforcoValido(e: unknown): e is Esforco {
  return typeof e === 'string' && (ESFORCOS as readonly string[]).includes(e)
}

/** Os níveis que o motor aceita para o modelo: os do modelo na lista, se constarem; senão o conjunto geral do motor. */
export function esforcosDoMotor(agente: Agente, modelo: string | undefined, lista: ListaDeModelos): Esforco[] {
  if (agente === 'shell') return []
  const geral = agente === 'claude' ? ESFORCOS_CLAUDE : ESFORCOS
  const achado = modelo ? lista[agente].find((m) => m.id === modelo) : undefined
  const proprios = achado?.esforcos?.filter(esforcoValido)
  return proprios && proprios.length ? [...proprios] : [...geral]
}

interface Escolha {
  modelo?: string
  esforco?: Esforco
}

/** Cada campo resolve sozinho: pedido > função > preset. Valor inválido é como ausente (cai para o próximo). */
export function resolverModelo(pedido?: Escolha, funcao?: Escolha, preset?: Escolha): Escolha {
  const fontes = [pedido, funcao, preset]
  const modelo = fontes.map((f) => f?.modelo).find(modeloValido)
  const esforco = fontes.map((f) => f?.esforco).find(esforcoValido)
  return { ...(modelo !== undefined ? { modelo } : {}), ...(esforco !== undefined ? { esforco } : {}) }
}

const PEDACO = /(?:"[^"]*"|'[^']*'|\S)+/g

function eOMotor(primeiro: string, agente: 'claude' | 'codex'): boolean {
  const base = primeiro.replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|ps1)$/i, '').toLowerCase()
  return base === agente
}

const semAspas = (s: string): string => s.replace(/^(["'])(.*)\1$/, '$2')

/**
 * Põe modelo e esforço na linha do agente: tira a flag antiga do mesmo assunto e põe a nova logo depois do
 * comando do motor (nunca empilha). Só mexe no que foi dado e é válido; o resto da linha fica como estava.
 * Shell, comando vazio ou que não começa com o motor: devolve igual.
 */
export function aplicarModelo(agente: Agente, comando: string, modelo?: string, esforco?: Esforco): string {
  if (agente === 'shell') return comando
  const pedacos = comando.match(PEDACO) ?? []
  const motor = pedacos[0]
  if (motor === undefined || !eOMotor(motor, agente)) return comando
  const m = modeloValido(modelo) ? modelo : undefined
  const e = esforcoValido(esforco) && (agente === 'codex' || ESFORCOS_CLAUDE.includes(esforco)) ? esforco : undefined
  if (!m && !e) return comando

  const resto = pedacos.slice(1)
  const mantidos: string[] = []
  for (let i = 0; i < resto.length; i++) {
    const p = resto[i]
    if (agente === 'claude') {
      if (m && (p === '--model' || p.startsWith('--model='))) { if (p === '--model') i++; continue }
      if (e && (p === '--effort' || p.startsWith('--effort='))) { if (p === '--effort') i++; continue }
    } else {
      if (m && (p === '-m' || p === '--model')) { i++; continue }
      if (m && (p.startsWith('--model=') || /^-m[^-\s]/.test(p))) continue
      const configJunto = /^(?:--config=|-c(?=\S))(.*)$/.exec(p)
      const chave = (valor: string): string => semAspas(valor).split('=')[0].trim()
      if (configJunto) {
        const k = chave(configJunto[1])
        if ((m && k === 'model') || (e && k === 'model_reasoning_effort')) continue
      } else if ((p === '-c' || p === '--config') && i + 1 < resto.length) {
        const k = chave(resto[i + 1])
        if ((m && k === 'model') || (e && k === 'model_reasoning_effort')) { i++; continue }
      }
    }
    mantidos.push(p)
  }

  const novos: string[] = []
  if (agente === 'claude') {
    if (m) novos.push('--model', m)
    if (e) novos.push('--effort', e)
  } else {
    if (m) novos.push('-m', m)
    if (e) novos.push('-c', `model_reasoning_effort=${e}`)
  }
  return [motor, ...novos, ...mantidos].join(' ')
}

/** O rótulo do cartão: `opus · xhigh`, só o modelo ou só o esforço quando é o que há; vazio sem nada. */
export function rotuloModelo(no: { modelo?: string; esforco?: Esforco }): string {
  return [modeloValido(no.modelo) ? no.modelo : undefined, esforcoValido(no.esforco) ? no.esforco : undefined].filter(Boolean).join(' · ')
}
