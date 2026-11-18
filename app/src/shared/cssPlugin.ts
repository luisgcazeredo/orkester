// Plugins de CSS (1.9.3): um plugin só redefine tokens (custom properties) dos temas. Nada de regra de estilo,
// nada de at-rule, nada que carregue coisa de fora (`url(`, `@import`, `@font-face`, `image-set`) e nada que já
// foi código (`expression`). Puro de propósito: o processo principal valida aqui, a prova roda no Node, e o CSS
// que a janela aplica é sempre o texto RE-GERADO a partir das declarações aceitas (`cssDosPlugins`), nunca o
// texto que a pessoa colou.
//
// A regra é de lista branca: seletor só os conhecidos, nome só `--token`, valor só com os caracteres e as
// funções da lista. O que não está na lista é recusado com o motivo, em português, para a tela mostrar.
// Node executa as provas TypeScript diretamente e precisa da extensão nos imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { TEMAS } from './temas.ts'

/** Um bloco aceito: o seletor (já normalizado) e as declarações, na ordem em que vieram. */
export interface BlocoCss {
  seletor: string
  declaracoes: Array<[nome: string, valor: string]>
}

export type ResultadoDoCss = { ok: true; blocos: BlocoCss[] } | { ok: false; motivo: string }

/** Teto do texto colado ou importado. Um tema inteiro cabe com folga em 8 KB. */
export const TAMANHO_MAXIMO_DO_CSS = 64 * 1024
/** Teto de declarações por plugin. */
export const DECLARACOES_MAXIMAS = 400
const VALOR_MAXIMO = 200

/** Os seletores aceitos: `:root` (vale em todos os temas) e `.tema-<id>` de cada tema registrado. */
export const SELETORES_CONHECIDOS: readonly string[] = [':root', ...TEMAS.map((t) => `.tema-${t.id}`)]

/** Funções que um valor pode usar: cor, conta e referência a outro token. Nenhuma carrega nada. */
const FUNCOES_ACEITAS = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'var', 'calc', 'min', 'max', 'clamp'
])

/**
 * Palavras recusadas em qualquer lugar do texto, mesmo em comentário (é mais simples e mais seguro recusar do
 * que adivinhar o que o navegador leria). A barra invertida é recusada antes (ver `validarCssDePlugin`), então
 * nenhum escape consegue montar estas palavras.
 */
const PROIBIDAS: Array<[RegExp, string]> = [
  [/@import/i, '"@import" não é aceito: plugin não carrega outro arquivo'],
  [/@font-face/i, '"@font-face" não é aceito: plugin não traz fonte de fora'],
  [/url\s*\(/i, '"url(" não é aceito: plugin só muda cores e medidas, não carrega nada de fora'],
  [/image-set/i, '"image-set" não é aceito: plugin não carrega imagem'],
  [/expression/i, '"expression" não é aceito: plugin não roda código'],
  [/@/, 'regra com "@" não é aceita: só blocos de tokens (--nome: valor)'],
  [/</, 'o caractere "<" não é aceito']
]

const NOME_DE_TOKEN = /^--[a-z0-9][a-z0-9_-]{0,63}$/i
/** Caracteres de um valor (fora de aspas): letras, dígitos, espaço e a pontuação de cor e conta. */
const CARACTERES_DO_VALOR = /^[a-z0-9#%.,+\-*/() \t]*$/i
/** Dentro de aspas (nome de fonte): letras, dígitos, espaço, ponto, hífen e sublinhado. */
const TEXTO_ENTRE_ASPAS = /'[a-z0-9 ._-]*'|"[a-z0-9 ._-]*"/gi

const falha = (motivo: string): ResultadoDoCss => ({ ok: false, motivo })

/** Um valor aceito, ou o motivo da recusa. */
export function motivoDoValor(nome: string, valor: string): string | null {
  if (!valor) return `${nome}: valor vazio`
  if (valor.length > VALOR_MAXIMO) return `${nome}: valor longo demais (mais de ${VALOR_MAXIMO} caracteres)`
  // no texto colado os comentários já saíram; no temas.json mexido à mão, um "/*" no valor engoliria o resto do CSS
  if (valor.includes('/*') || valor.includes('*/')) return `${nome}: "/*" e "*/" (comentário) não são aceitos num valor`
  const semAspas = valor.replace(TEXTO_ENTRE_ASPAS, ' ')
  if (/['"]/.test(semAspas)) return `${nome}: aspas fora do lugar (só nome de fonte entre aspas, sem pontuação)`
  if (!CARACTERES_DO_VALOR.test(semAspas)) {
    const ruim = [...semAspas].find((c) => !CARACTERES_DO_VALOR.test(c)) ?? '?'
    return `${nome}: caractere "${ruim}" não é aceito num valor (";", "{", "}", "!" e "\\" ficam de fora)`
  }
  let profundidade = 0
  for (const c of semAspas) {
    if (c === '(') profundidade++
    else if (c === ')' && --profundidade < 0) return `${nome}: parêntese fechado sem abrir`
  }
  if (profundidade !== 0) return `${nome}: parêntese aberto sem fechar`
  for (const m of semAspas.matchAll(/([a-z0-9_-]+)\s*\(/gi)) {
    const funcao = m[1].toLowerCase()
    if (!FUNCOES_ACEITAS.has(funcao)) return `${nome}: a função "${funcao}(" não é aceita (só cor, conta e var())`
  }
  return null
}

/**
 * A regra de uma declaração, a MESMA na entrada (texto colado) e na leitura do disco (`blocosValidos`): nome só
 * `--token`, valor pela lista branca de `motivoDoValor`, nenhuma palavra proibida, nenhuma barra invertida.
 */
export function motivoDaDeclaracao(nome: string, valor: string): string | null {
  if (!NOME_DE_TOKEN.test(nome)) return `"${nome.slice(0, 60)}" não é aceito: só tokens (nomes que começam com --), nenhuma propriedade de estilo`
  if (valor.includes('\\')) return `${nome}: barra invertida ("\\") não é aceita`
  const proibida = PROIBIDAS.find(([p]) => p.test(valor))
  if (proibida) return `${nome}: ${proibida[1]}`
  return motivoDoValor(nome, valor)
}

/** O seletor normalizado, se for um conhecido (ou uma lista deles separada por vírgula). */
function seletorAceito(bruto: string): string | null {
  const partes = bruto.split(',').map((s) => s.trim().replace(/\s+/g, ' '))
  if (!partes.length || partes.some((p) => !SELETORES_CONHECIDOS.includes(p))) return null
  return [...new Set(partes)].join(', ')
}

/**
 * Valida o texto de um plugin. Aceita só `seletor { --token: valor; ... }`, com seletor conhecido. Devolve as
 * declarações aceitas ou o primeiro motivo de recusa.
 */
export function validarCssDePlugin(texto: unknown): ResultadoDoCss {
  if (typeof texto !== 'string') return falha('o plugin tem de ser texto')
  if (texto.length > TAMANHO_MAXIMO_DO_CSS) return falha(`texto grande demais (mais de ${TAMANHO_MAXIMO_DO_CSS / 1024} KB)`)
  if (texto.includes('\\')) return falha('barra invertida ("\\") não é aceita: escapes podem esconder palavras proibidas')
  for (const [padrao, motivo] of PROIBIDAS) if (padrao.test(texto)) return falha(motivo)

  // comentários saem (não chegam ao CSS aplicado); comentário sem fim é recusado
  let limpo = ''
  for (let i = 0; i < texto.length; ) {
    const abre = texto.indexOf('/*', i)
    if (abre < 0) {
      limpo += texto.slice(i)
      break
    }
    const fecha = texto.indexOf('*/', abre + 2)
    if (fecha < 0) return falha('comentário aberto ("/*") sem fechar')
    limpo += texto.slice(i, abre) + ' '
    i = fecha + 2
  }

  const blocos: BlocoCss[] = []
  let total = 0
  let i = 0
  while (i < limpo.length) {
    const abre = limpo.indexOf('{', i)
    if (abre < 0) {
      if (limpo.slice(i).trim()) return falha('texto fora de um bloco: use seletor { --token: valor; }')
      break
    }
    const cabeca = limpo.slice(i, abre)
    if (/[};]/.test(cabeca)) return falha('"}" ou ";" fora do lugar, antes de um bloco')
    const seletor = seletorAceito(cabeca)
    if (!seletor) {
      return falha(`seletor "${cabeca.trim().slice(0, 60)}" não é aceito: use ${SELETORES_CONHECIDOS.join(', ')}`)
    }
    const fecha = limpo.indexOf('}', abre + 1)
    if (fecha < 0) return falha(`bloco "${seletor}" sem "}"`)
    const corpo = limpo.slice(abre + 1, fecha)
    if (corpo.includes('{')) return falha(`"{" fora do lugar dentro do bloco "${seletor}" (bloco dentro de bloco não é aceito)`)

    const declaracoes: BlocoCss['declaracoes'] = []
    for (const parte of corpo.split(';')) {
      if (!parte.trim()) continue
      const doisPontos = parte.indexOf(':')
      if (doisPontos < 0) return falha(`"${parte.trim().slice(0, 60)}" não é uma declaração --token: valor`)
      const nome = parte.slice(0, doisPontos).trim()
      const valor = parte.slice(doisPontos + 1).trim()
      const motivo = motivoDaDeclaracao(nome, valor)
      if (motivo) return falha(motivo)
      declaracoes.push([nome, valor])
      if (++total > DECLARACOES_MAXIMAS) return falha(`declarações demais (mais de ${DECLARACOES_MAXIMAS})`)
    }
    if (declaracoes.length) blocos.push({ seletor, declaracoes })
    i = fecha + 1
  }
  if (!total) return falha('nenhuma declaração encontrada: escreva algo como .tema-escuro { --destaque: #e05a00; }')
  return { ok: true, blocos }
}

/**
 * Os blocos guardados no disco são lidos como não confiáveis: cada um passa pela mesma regra de novo. Devolve os
 * blocos válidos, ou `null` se algum não for (o plugin inteiro cai: aplicar metade seria pior).
 */
export function blocosValidos(blocos: unknown): BlocoCss[] | null {
  if (!Array.isArray(blocos) || !blocos.length) return null
  const aceitos: BlocoCss[] = []
  let total = 0
  for (const b of blocos) {
    const seletor = typeof b?.seletor === 'string' ? seletorAceito(b.seletor) : null
    if (!seletor || !Array.isArray(b.declaracoes) || !b.declaracoes.length) return null
    const declaracoes: BlocoCss['declaracoes'] = []
    for (const d of b.declaracoes) {
      if (!Array.isArray(d) || d.length !== 2) return null
      const [nome, valor] = d
      if (typeof nome !== 'string' || typeof valor !== 'string' || motivoDaDeclaracao(nome, valor)) return null
      declaracoes.push([nome, valor])
    }
    total += declaracoes.length
    if (total > DECLARACOES_MAXIMAS) return null
    aceitos.push({ seletor, declaracoes })
  }
  return aceitos
}

/**
 * Seletor do CSS aplicado. Os tokens dos temas moram em `.tema-<id>` (na `.app`), então `:root` sozinho não
 * venceria lá dentro: o `:root` do plugin vira `:root, .app.app`, e `.tema-x` vira `.app.app.tema-x`. A
 * especificidade dobrada é de propósito: o plugin vence o `tokens.css` sem depender da ordem em que o CSS
 * carrega, e o tema de um tema específico vence o `:root` do plugin. O tema do usuário fica um degrau acima
 * (ver `cssDoTemaDoUsuario` em temasUsuario.ts).
 */
function seletorAplicado(seletor: string): string {
  return seletor
    .split(', ')
    .map((s) => (s === ':root' ? ':root, .app.app' : `.app.app${s}`))
    .join(', ')
}

/** O CSS que a janela aplica: re-gerado das declarações aceitas, na ordem dos plugins (o de baixo vence). */
export function cssDosPlugins(plugins: ReadonlyArray<{ ligado: boolean; blocos: BlocoCss[] }>): string {
  const linhas: string[] = []
  for (const p of plugins) {
    if (!p.ligado) continue
    const blocos = blocosValidos(p.blocos)
    if (!blocos) continue
    for (const b of blocos) {
      linhas.push(`${seletorAplicado(b.seletor)} {`)
      for (const [nome, valor] of b.declaracoes) linhas.push(`  ${nome}: ${valor};`)
      linhas.push('}')
    }
  }
  return linhas.join('\n')
}
