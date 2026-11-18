import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
// Node executa as provas TypeScript diretamente e precisa da extensão neste import de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ESFORCOS, MODELOS_PADRAO, esforcoValido, esforcosDoMotor, modeloValido, type Esforco, type ListaDeModelos, type ModeloDisponivel } from '../shared/modelos.ts'
import type { Agente } from '../shared/modelo'

// Lista de modelos de cada motor, sem ficar velha: o cache do próprio Codex + um arquivo opcional do usuário
// (`~/.orkester/modelos.json`, o app não grava nele), caindo em `MODELOS_PADRAO`. Os dois arquivos são
// tratados como NÃO confiáveis: tamanho máximo, JSON inválido vira padrão, e todo id passa em `modeloValido`
// (o id acaba digitado no PowerShell).

const MAX_CACHE = 8 * 1024 * 1024
const MAX_OVERRIDE = 256 * 1024
const MAX_MODELOS = 100

const eObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

function esforcosDe(x: unknown): Esforco[] | undefined {
  if (!Array.isArray(x)) return undefined
  const v = [...new Set(x.filter(esforcoValido))]
  return v.length ? v : undefined
}

function textoCurto(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() && x.length <= 80 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(x) ? x.trim() : undefined
}

function doCache(cache: unknown): ModeloDisponivel[] {
  const lista = eObjeto(cache) && Array.isArray(cache.models) ? cache.models.slice(0, MAX_MODELOS * 4) : []
  const saida: ModeloDisponivel[] = []
  for (const m of lista) {
    if (!eObjeto(m) || m.visibility !== 'list' || !modeloValido(m.slug) || saida.some((s) => s.id === m.slug)) continue
    const niveis = Array.isArray(m.supported_reasoning_levels)
      ? esforcosDe(m.supported_reasoning_levels.map((n) => (eObjeto(n) ? n.effort : undefined)))
      : undefined
    saida.push({
      id: m.slug,
      ...(textoCurto(m.display_name) ? { nome: textoCurto(m.display_name) } : {}),
      ...(niveis ? { esforcos: niveis } : {}),
      ...(esforcoValido(m.default_reasoning_level) ? { padrao: m.default_reasoning_level } : {})
    })
    if (saida.length >= MAX_MODELOS) break
  }
  return saida
}

function doOverride(lista: unknown): ModeloDisponivel[] | undefined {
  if (!Array.isArray(lista)) return undefined
  const saida: ModeloDisponivel[] = []
  for (const m of lista.slice(0, MAX_MODELOS)) {
    if (!eObjeto(m) || !modeloValido(m.id) || saida.some((s) => s.id === m.id)) continue
    const esforcos = esforcosDe(m.esforcos)
    saida.push({
      id: m.id,
      ...(textoCurto(m.nome) ? { nome: textoCurto(m.nome) } : {}),
      ...(esforcos ? { esforcos } : {}),
      ...(esforcoValido(m.padrao) ? { padrao: m.padrao } : {})
    })
  }
  return saida.length ? saida : undefined
}

/** Junta as fontes (puro): override do usuário > cache do Codex > padrão do app. Cada motor e cada atalho decidem sozinhos. */
export function juntarModelos(cacheCodex: unknown, override: unknown): ListaDeModelos {
  const o = eObjeto(override) ? override : {}
  const codexDoCache = doCache(cacheCodex)
  // os padrões forte/médio/rápido são internos (só traduzem ficha antiga na importação): não há override
  const atalhos: ListaDeModelos['atalhos'] = MODELOS_PADRAO.atalhos
  return {
    claude: doOverride(o.claude) ?? MODELOS_PADRAO.claude,
    codex: doOverride(o.codex) ?? (codexDoCache.length ? codexDoCache : MODELOS_PADRAO.codex),
    atalhos
  }
}

function lerJson(caminho: string, maximo: number): unknown {
  try {
    if (!existsSync(caminho) || statSync(caminho).size > maximo) return undefined
    return JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    return undefined
  }
}

/** Lê os dois arquivos na hora (são pequenos e o Codex os atualiza sozinho). Nunca lança. */
export function lerModelos(casa: string = homedir()): ListaDeModelos {
  return juntarModelos(
    lerJson(join(casa, '.codex', 'models_cache.json'), MAX_CACHE),
    lerJson(join(casa, '.orkester', 'modelos.json'), MAX_OVERRIDE)
  )
}

/**
 * Confere modelo e esforço pedidos antes de abrir. `erro`: recusa clara. `aviso`: abre, mas o modelo não está na
 * lista (a lista nunca bloqueia modelo novo). `agente` indefinido (vem do preset da função): só o formato.
 */
export function conferirModelo(
  agente: Agente | undefined,
  modelo: unknown,
  esforco: unknown,
  lista: ListaDeModelos
): { erro?: string; aviso?: string } {
  if (modelo !== undefined && !modeloValido(modelo)) {
    return { erro: `modelo inválido: só letras, números e . _ : - [ ] (até 80 caracteres), sem espaço nem aspas` }
  }
  if (esforco !== undefined && !esforcoValido(esforco)) {
    return { erro: `esforço inválido "${String(esforco).slice(0, 40)}": use ${ESFORCOS.join(', ')}` }
  }
  if (agente === 'shell' && (modelo !== undefined || esforco !== undefined)) {
    return { erro: 'shell não tem modelo nem esforço' }
  }
  if (agente !== 'claude' && agente !== 'codex') return {}
  if (esforco !== undefined) {
    const aceitos = esforcosDoMotor(agente, modelo, lista)
    if (!aceitos.includes(esforco as Esforco)) {
      return { erro: `${agente}${modelo ? ` com ${modelo}` : ''} não aceita o esforço ${String(esforco)}; aceita: ${aceitos.join(', ')}` }
    }
  }
  if (modelo !== undefined && !lista[agente].some((m) => m.id === modelo)) {
    return { aviso: `o modelo "${modelo}" não está na lista de ${agente} (\`ork modelos\`); abri mesmo assim, e se ele não existir o ${agente} vai reclamar na tela` }
  }
  return {}
}

/** O texto de `ork modelos`. */
export function textoDosModelos(lista: ListaDeModelos): string {
  const bloco = (agente: 'claude' | 'codex'): string[] =>
    lista[agente].map((m) => {
      const niveis = esforcosDoMotor(agente, m.id, lista).join('/')
      return `  ${m.id}${m.nome && m.nome !== m.id ? ` — ${m.nome}` : ''} · esforço: ${niveis}${m.padrao ? ` (padrão ${m.padrao})` : ''}`
    })
  return [
    'Claude (aliases sempre apontam para o mais novo):',
    ...bloco('claude'),
    'Codex:',
    ...bloco('codex'),
    '',
    'Sem --modelo/--esforco o agente abre com o que a função ou o preset dizem; sem nada disso, com o padrão do próprio Claude/Codex.',
    'Use: ork abrir claude --modelo opus --esforco high. Modelo fora desta lista abre com aviso; o esforço precisa ser um dos acima.'
  ].join('\n')
}

/** `--modelo` e `--esforco` de um pedido do `ork`: devolve os valores limpos ou lança o erro claro. */
export function modeloDasOpcoes(
  opcoes: Record<string, string | number | true>,
  agente: Agente | undefined,
  lista: ListaDeModelos = lerModelos()
): { modelo?: string; esforco?: Esforco } {
  const campo = (nome: string): string | undefined => {
    const v = opcoes[nome]
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !v.trim()) throw new Error(`falta o valor de --${nome}`)
    return v.trim()
  }
  const modelo = campo('modelo')
  const esforco = campo('esforco')
  const r = conferirModelo(agente, modelo, esforco, lista)
  if (r.erro) throw new Error(r.erro)
  return { ...(modelo !== undefined ? { modelo } : {}), ...(esforco !== undefined ? { esforco: esforco as Esforco } : {}) }
}

/** O trecho que a resposta do `ork abrir` ganha: o que foi aplicado e o aviso, se houver. Vazio sem nada a dizer. */
export function textoDoModelo(modelo: string | undefined, esforco: Esforco | undefined, aviso: string | undefined): string {
  const usado = [modelo, esforco].filter(Boolean).join(' · ')
  return `${usado ? ` Modelo: ${usado}.` : ''}${aviso ? ` Aviso: ${aviso}.` : ''}`
}
