// Markdown -> HTML do Leitor. Parte pura (sem DOM, sem Electron), para a prova rodar no Node.
// Segurança em camadas: HTML cru do arquivo vira texto (`html: false`); só passa link http(s), mailto, âncora
// `#` e caminho relativo; e nenhum link sai com `href` para fora: o clique é tratado pelo app a partir de
// `data-externo` (abrir no navegador) e `data-md` (abrir outro .md no próprio Leitor). A CSP do renderer é a
// segunda camada.
import MarkdownIt from 'markdown-it'
// Node executa as provas TypeScript diretamente e precisa da extensão neste import.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { escaparHtml, linguaDe } from './realce.ts'

/** Realça um bloco de código: devolve o HTML já escapado e colorido, ou null para sair só escapado. */
export type Realcador = (codigo: string, lingua: string) => string | null

export interface OpcoesMarkdown {
  /** Realce de sintaxe dos blocos de código. Fica de fora da parte pura porque o highlight.js mora no renderer. */
  realcar?: Realcador
}

const TEM_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i
const EXTENSAO_MD = /\.(md|markdown)$/i

type TipoLink = { tipo: 'externo'; valor: string } | { tipo: 'md'; valor: string } | { tipo: 'ancora'; valor: string } | { tipo: 'nenhum' }

function classificarLink(href: string): TipoLink {
  const url = href.trim()
  if (!url) return { tipo: 'nenhum' }
  if (url.startsWith('#')) return { tipo: 'ancora', valor: url }
  if (url.startsWith('//')) return { tipo: 'nenhum' }
  if (TEM_ESQUEMA.test(url)) {
    return /^(https?|mailto):/i.test(url) ? { tipo: 'externo', valor: url } : { tipo: 'nenhum' }
  }
  // Relativo: só interessa o que aponta para outro .md (o resto não tem para onde ir dentro do Leitor).
  const caminho = url.split('#')[0].split('?')[0]
  // Decodifica primeiro e só então valida (o decode pode revelar `\\`, `C:` ou `//`). O valor entregue é o da
  // PRIMEIRA decodificação; as seguintes só espiam: se `%255C` virasse caminho perigoso numa segunda leitura,
  // é link morto.
  let decodificado: string
  try {
    decodificado = decodeURIComponent(caminho)
  } catch {
    return { tipo: 'nenhum' } // percent-encoding quebrado: link morto
  }
  let espia = decodificado
  for (let etapa = 0; etapa < 4; etapa++) {
    if (!caminhoRelativoSeguro(espia)) return { tipo: 'nenhum' }
    let proximo: string
    try {
      proximo = decodeURIComponent(espia)
    } catch {
      break // `%` solto no nome (ex.: `100%.md`): não há nova leitura possível
    }
    if (proximo === espia) break
    espia = proximo
  }
  return EXTENSAO_MD.test(decodificado) ? { tipo: 'md', valor: decodificado } : { tipo: 'nenhum' }
}

/** Relativo de verdade: sem absoluto, UNC, letra de disco, esquema, `//`, `\` nem caracteres de controle. `../` passa. */
function caminhoRelativoSeguro(c: string): boolean {
  if (!c) return false
  if (c.startsWith('/') || c.includes('\\')) return false // absoluto, `//`, UNC e barra invertida
  if (TEM_ESQUEMA.test(c)) return false // `C:`, `file:`, qualquer esquema
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(c)) return false
  return true
}

function criarLeitor(opcoes: OpcoesMarkdown): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false })
  // Dupla trava: mesmo que a regra de link mude, a validação da própria lib só aceita estes esquemas.
  md.validateLink = (url) => {
    const u = url.trim()
    return !TEM_ESQUEMA.test(u) || /^(https?|mailto):/i.test(u)
  }

  md.renderer.rules.link_open = (tokens, i) => {
    const href = String(tokens[i].attrGet('href') ?? '')
    const alvo = classificarLink(href)
    switch (alvo.tipo) {
      case 'externo':
        return `<a class="md-link" data-externo="${md.utils.escapeHtml(alvo.valor)}" role="link" tabindex="0">`
      case 'md':
        return `<a class="md-link" data-md="${md.utils.escapeHtml(alvo.valor)}" role="link" tabindex="0">`
      case 'ancora':
        return `<a class="md-link" href="${md.utils.escapeHtml(alvo.valor)}">`
      default:
        return '<a class="md-link md-link-morto">'
    }
  }

  // Imagem: a CSP não deixa carregar imagem de fora e o caminho relativo não resolve no Leitor; vira o texto.
  md.renderer.rules.image = (tokens, i, _o, _e, self) => {
    const alt = self.renderInlineAsText(tokens[i].children ?? [], md.options, {})
    return `<span class="md-imagem">${escaparHtml(alt || 'imagem')}</span>`
  }

  md.renderer.rules.fence = (tokens, i) => {
    const t = tokens[i]
    const info = t.info.trim().split(/\s+/)[0] ?? ''
    // Só nomes de língua conhecidos entram na classe; o resto do texto da cerca não chega ao HTML.
    const lingua = info ? linguaDe(`x.${info.toLowerCase()}`) : null
    let corpo: string | null = null
    if (lingua && opcoes.realcar) {
      try {
        corpo = opcoes.realcar(t.content, lingua)
      } catch {
        corpo = null
      }
    }
    const classe = lingua ? ` language-${lingua}` : ''
    return `<pre class="md-codigo"><code class="hljs${classe}">${corpo ?? escaparHtml(t.content)}</code></pre>\n`
  }
  md.renderer.rules.code_block = (tokens, i) =>
    `<pre class="md-codigo"><code class="hljs">${escaparHtml(tokens[i].content)}</code></pre>\n`

  // A tabela vai dentro de uma caixa que rola de lado, para não estourar o visor.
  md.renderer.rules.table_open = () => '<div class="md-tabela"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

  return md
}

const leitorPadrao = criarLeitor({})

/** Renderiza o Markdown em HTML seguro. Sem `opcoes.realcar`, blocos de código saem só escapados. */
export function renderizarMarkdown(texto: string, opcoes: OpcoesMarkdown = {}): string {
  const md = opcoes.realcar ? criarLeitor(opcoes) : leitorPadrao
  return md.render(texto)
}
