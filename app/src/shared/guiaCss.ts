// Guia de CSS (1.9.4): a lista de tokens que a página Temas mostra sai do PRÓPRIO tokens.css, não de uma lista
// escrita à mão. Puro de propósito (a janela passa o texto do arquivo; a prova lê o mesmo arquivo no Node).
//
// Convenção de tokens.css, dentro de um bloco: um comentário sozinho na linha abre um grupo ("título: para que
// serve"); o comentário no fim da linha de um token diz para que ele serve. Cada token conta uma vez, no primeiro
// bloco em que aparece (o `.tema-escuro` vem primeiro e é o descrito; Claro e OLED só trocam os valores).
// Node executa as provas TypeScript diretamente e precisa da extensão nos imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { validarCssDePlugin } from './cssPlugin.ts'
// @ts-expect-error idem.
import { TEMAS, type Tema } from './temas.ts'

/** Do que o valor do token depende: da base (escuro, claro, OLED), da cor de destaque, ou de nada. */
export type MudaCom = 'base' | 'destaque' | 'fixo'

export interface TokenDoGuia {
  token: string
  descricao: string
  mudaCom: MudaCom
}

export interface GrupoDoGuia {
  titulo: string
  descricao: string
  tokens: TokenDoGuia[]
}

const COMENTARIO_SOZINHO = /^\s*\/\*\s*(.*?)\s*\*\/\s*$/
const DECLARACAO = /^\s*(--[a-z0-9_-]+)\s*:[^;]*;\s*(?:\/\*\s*(.*?)\s*\*\/)?\s*$/i

function mudaCom(seletor: string): MudaCom {
  if (seletor.includes('.destaque-')) return 'destaque'
  if (seletor.includes('.tema-')) return 'base'
  return 'fixo'
}

/** Primeira letra maiúscula (o comentário do CSS é escrito em minúscula). */
const comMaiuscula = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Lê tokens.css e devolve os grupos na ordem em que aparecem, cada token uma vez. */
export function lerGuiaDosTokens(css: string): GrupoDoGuia[] {
  const grupos: GrupoDoGuia[] = []
  const vistos = new Set<string>()
  let seletor = ''
  let dentro = false
  let emComentarioLongo = false
  let grupo: GrupoDoGuia | null = null

  const grupoChamado = (titulo: string, descricao: string): GrupoDoGuia => {
    const existente = grupos.find((g) => g.titulo === titulo)
    if (existente) return existente
    const novo = { titulo, descricao, tokens: [] }
    grupos.push(novo)
    return novo
  }

  for (const linha of css.split(/\r?\n/)) {
    if (!dentro) {
      // fora de bloco: pula comentários longos e junta o seletor (pode vir em várias linhas) até a "{"
      if (emComentarioLongo) {
        if (linha.includes('*/')) emComentarioLongo = false
        continue
      }
      if (/^\s*\/\*/.test(linha)) {
        if (!linha.includes('*/')) emComentarioLongo = true
        continue
      }
      const abre = linha.indexOf('{')
      if (abre < 0) {
        seletor += linha
        continue
      }
      seletor = (seletor + linha.slice(0, abre)).trim()
      dentro = true
      grupo = null
      continue
    }
    if (/^\s*\}/.test(linha)) {
      dentro = false
      seletor = ''
      continue
    }
    const comentario = COMENTARIO_SOZINHO.exec(linha)
    if (comentario) {
      const texto = comentario[1]
      const doisPontos = texto.indexOf(':')
      const titulo = comMaiuscula((doisPontos < 0 ? texto : texto.slice(0, doisPontos)).trim())
      const descricao = doisPontos < 0 ? '' : comMaiuscula(texto.slice(doisPontos + 1).trim())
      grupo = grupoChamado(titulo, descricao)
      continue
    }
    const d = DECLARACAO.exec(linha)
    if (!d || vistos.has(d[1])) continue
    vistos.add(d[1])
    const destino = grupo ?? grupoChamado('Outros', '')
    destino.tokens.push({ token: d[1], descricao: comMaiuscula(d[2]?.trim() ?? ''), mudaCom: mudaCom(seletor) })
  }
  return grupos.filter((g) => g.tokens.length)
}

/** Os tokens do exemplo do guia: o destaque (o que mais se troca) e o fundo. */
export const TOKENS_DO_EXEMPLO = ['--destaque', '--destaque-forte', '--quadro-fundo'] as const

/**
 * O exemplo pronto para copiar: um bloco da base em tela com os valores que valem agora (a pessoa troca os
 * valores e cola). Passa na validação de plugin; a prova confere isso para cada base.
 */
export function exemploDePlugin(base: Tema, valores: Readonly<Record<string, string>>): string {
  const nome = TEMAS.find((t) => t.id === base)?.rotulo ?? base
  const linhas = TOKENS_DO_EXEMPLO.filter((t) => valores[t]).map((t) => `  ${t}: ${valores[t]};`)
  return `/* troque os valores: só a base ${nome} muda (use :root para todas) */\n.tema-${base} {\n${linhas.join('\n')}\n}\n`
}

/** O exemplo passa na validação? (A janela só oferece "copiar" se passar; a prova confere que passa.) */
export function exemploValido(texto: string): boolean {
  return validarCssDePlugin(texto).ok
}
