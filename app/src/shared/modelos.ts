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

/** O valor de uma flag `chave=valor` do `-c` do Codex, sem aspas; `undefined` se a chave é outra. */
function valorDoConfig(texto: string, chave: string): string | undefined {
  const t = semAspas(texto)
  const i = t.indexOf('=')
  if (i < 0 || t.slice(0, i).trim() !== chave) return undefined
  return semAspas(t.slice(i + 1).trim())
}

/** Lê o modelo e o esforço escritos numa linha de comando do motor (a última flag vale). Mesmos formatos que `aplicarModelo` tira. */
function lerDaLinha(agente: 'claude' | 'codex', linha: string): Escolha {
  const pedacos = linha.match(PEDACO) ?? []
  if (pedacos[0] === undefined || !eOMotor(pedacos[0], agente)) return {}
  let m: string | undefined
  let e: string | undefined
  const resto = pedacos.slice(1)
  for (let i = 0; i < resto.length; i++) {
    const p = resto[i]
    const proximo = i + 1 < resto.length ? resto[i + 1] : undefined
    if (agente === 'claude') {
      if (p === '--model' && proximo !== undefined) { m = semAspas(proximo); i++ }
      else if (p.startsWith('--model=')) m = semAspas(p.slice('--model='.length))
      else if (p === '--effort' && proximo !== undefined) { e = semAspas(proximo); i++ }
      else if (p.startsWith('--effort=')) e = semAspas(p.slice('--effort='.length))
      continue
    }
    if ((p === '-m' || p === '--model') && proximo !== undefined) { m = semAspas(proximo); i++; continue }
    if (p.startsWith('--model=')) { m = semAspas(p.slice('--model='.length)); continue }
    if (/^-m[^-\s]/.test(p)) { m = semAspas(p.slice(2)); continue }
    const configJunto = /^(?:--config=|-c(?=\S))(.*)$/.exec(p)
    let config: string | undefined
    if (configJunto) config = configJunto[1]
    else if ((p === '-c' || p === '--config') && proximo !== undefined) { config = proximo; i++ }
    if (config === undefined) continue
    m = valorDoConfig(config, 'model') ?? m
    e = valorDoConfig(config, 'model_reasoning_effort') ?? e
  }
  const esforco = esforcoValido(e) && (agente === 'codex' || ESFORCOS_CLAUDE.includes(e)) ? e : undefined
  return { ...(modeloValido(m) ? { modelo: m } : {}), ...(esforco ? { esforco } : {}) }
}

/**
 * O modelo e o esforço que o processo roda de fato: lê da linha que sai de `aplicarModelo` (campos do cartão por
 * cima do que está escrito no comando), com o mesmo parser. O que nenhum dos dois diz fica de fora (vale o padrão
 * do motor). Shell não tem modelo.
 */
export function modeloEfetivo(agente: Agente, comando: string | undefined, modelo?: string, esforco?: Esforco): { modelo?: string; esforco?: Esforco } {
  if (agente === 'shell') return {}
  // sem comando (quem chama só tem os campos), valem os campos; com comando, vale só o que o processo roda: um
  // comando que não começa pelo motor passa sem mexida, então os campos não chegam a ele
  if (!comando?.trim()) {
    const e = esforcoValido(esforco) && (agente === 'codex' || ESFORCOS_CLAUDE.includes(esforco)) ? esforco : undefined
    return { ...(modeloValido(modelo) ? { modelo } : {}), ...(e ? { esforco: e } : {}) }
  }
  return lerDaLinha(agente, aplicarModelo(agente, comando.trim(), modelo, esforco))
}

/** O que o próprio motor roda quando o cartão não diz (as chaves de modelo e esforço do config dele). */
export interface PadraoDoMotor {
  modelo?: string
  esforco?: Esforco
}

function padraoValido(agente: 'claude' | 'codex', modelo: unknown, esforco: unknown): PadraoDoMotor {
  const e = esforcoValido(esforco) && (agente === 'codex' || ESFORCOS_CLAUDE.includes(esforco)) ? esforco : undefined
  return { ...(modeloValido(modelo) ? { modelo } : {}), ...(e ? { esforco: e } : {}) }
}

/** `~/.claude/settings.json` (texto): só as chaves `model` e `effortLevel`. JSON ruim ou valor fora do formato = sem padrão. */
export function padraoDoClaude(json: string): PadraoDoMotor {
  try {
    const c: unknown = JSON.parse(json)
    if (typeof c !== 'object' || c === null || Array.isArray(c)) return {}
    const o = c as Record<string, unknown>
    return padraoValido('claude', o.model, o.effortLevel)
  } catch {
    return {}
  }
}

/** `~/.codex/config.toml` (texto): só `model` e `model_reasoning_effort`, no topo do arquivo (antes da 1ª `[tabela]`). */
export function padraoDoCodex(toml: string): PadraoDoMotor {
  const valores: Record<string, string> = {}
  for (const linha of toml.split(/\r?\n/)) {
    const t = linha.trim()
    if (t.startsWith('[')) break
    const m = /^(model|model_reasoning_effort)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*(?:#.*)?$/.exec(t)
    if (m) valores[m[1]] = m[2] ?? m[3]
  }
  return padraoValido('codex', valores.model, valores.model_reasoning_effort)
}

export interface ParteDoRotulo {
  texto: string
  /** Veio do padrão do motor, não de uma escolha: a tela mostra em tom suave. */
  padrao: boolean
}

export const TEXTO_PADRAO = 'padrão'

/**
 * As partes do rótulo do cartão. Com `agente`, é o que o processo roda (`modeloEfetivo`): o que não está dito vira
 * `padrão` (`opus · padrão`, `padrão · medium`, só `padrão`), nunca vazio; shell não tem rótulo. Sem `agente` é o
 * rótulo antigo, só dos campos (funções e partituras não têm comando): vazio sem nada.
 */
export function partesDoRotulo(no: { agente?: Agente; comando?: string; modelo?: string; esforco?: Esforco; padraoDoMotor?: PadraoDoMotor }): ParteDoRotulo[] {
  if (no.agente === undefined) {
    return [modeloValido(no.modelo) ? no.modelo : undefined, esforcoValido(no.esforco) ? no.esforco : undefined]
      .filter((t): t is string => Boolean(t))
      .map((texto) => ({ texto, padrao: false }))
  }
  if (no.agente === 'shell') return []
  const { modelo, esforco } = modeloEfetivo(no.agente, no.comando, no.modelo, no.esforco)
  // o que o config do motor diz entra entre parênteses; sem ele, o `padrão` seco de sempre
  const dele = padraoValido(no.agente, no.padraoDoMotor?.modelo, no.padraoDoMotor?.esforco)
  const padraoDe = (x?: string): string => (x ? `${TEXTO_PADRAO} (${x})` : TEXTO_PADRAO)
  if (!modelo && !esforco) {
    const lido = [dele.modelo, dele.esforco].filter(Boolean).join(' · ')
    return [{ texto: padraoDe(lido), padrao: true }]
  }
  return [
    { texto: modelo ?? padraoDe(dele.modelo), padrao: !modelo },
    { texto: esforco ?? padraoDe(dele.esforco), padrao: !esforco }
  ]
}

/** O rótulo do cartão como texto: `opus · xhigh`. Ver `partesDoRotulo` para o que muda com `agente`. */
export function rotuloModelo(no: { agente?: Agente; comando?: string; modelo?: string; esforco?: Esforco; padraoDoMotor?: PadraoDoMotor }): string {
  return partesDoRotulo(no).map((p) => p.texto).join(' · ')
}
