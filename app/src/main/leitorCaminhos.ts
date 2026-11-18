// Regras de caminho do Leitor de Markdown, puras (só `node:path`) para a prova rodar sem o Electron.
// O valor de `data-md` vem do texto de um arquivo: não é confiável. Aqui só se decide pelo texto; o main ainda
// confere o caminho REAL (links simbólicos) antes de ler.
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export const LIMITE_MD = 400 * 1024

const EXTENSAO_MD = /\.(md|markdown)$/i

export function ehMarkdown(nome: string): boolean {
  return EXTENSAO_MD.test(nome)
}

/** `alvo` está em `raiz` ou abaixo dela (só pelo texto, sem olhar o disco). Mesma pasta conta. */
export function estaEmBaixo(raiz: string, alvo: string): boolean {
  const r = relative(resolve(raiz), resolve(alvo))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/**
 * O que um link relativo de um .md aponta: `valor` resolvido a partir da pasta de `mdAtual`, ou null se não for um
 * .md dentro de `raiz` (absoluto, UNC, letra de disco, `\`, controle, `../` que sai da raiz, outra extensão).
 */
export function alvoDoLink(raiz: string, mdAtual: string, valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor || valor.length > 1024) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(valor) || valor.includes('\\')) return null
  if (valor.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(valor)) return null
  if (!ehMarkdown(valor)) return null
  const alvo = resolve(dirname(resolve(mdAtual)), valor)
  if (!estaEmBaixo(raiz, alvo) || !ehMarkdown(alvo)) return null
  return alvo
}

// No mailto, só estes campos passam: `attach`/`attachment` fazia clientes de e-mail antigos anexarem um arquivo local.
const CAMPOS_DO_MAILTO = new Set(['subject', 'body', 'cc', 'bcc'])

function limparMailto(url: URL): string {
  const campos = url.search
    .replace(/^\?/, '')
    .split('&')
    .filter((par) => {
      let nome = par.split('=')[0]
      try {
        nome = decodeURIComponent(nome)
      } catch {
        return false
      }
      return CAMPOS_DO_MAILTO.has(nome.trim().toLowerCase())
    })
  return `mailto:${url.pathname}${campos.length ? `?${campos.join('&')}` : ''}`
}

/** Só o que o navegador pode abrir: http, https e mailto, em qualquer caixa. Devolve o endereço normalizado. */
export function enderecoExterno(valor: unknown): string | null {
  if (typeof valor !== 'string' || !/^(https?|mailto):/i.test(valor.trim())) return null
  try {
    const url = new URL(valor.trim())
    return url.protocol === 'mailto:' ? limparMailto(url) : url.href
  } catch {
    return null
  }
}
