// Pastas que o usuário fixou no Leitor de Markdown. Puro de propósito (sem `node:`): a regra roda no processo
// principal e nas provas, e o caminho da pasta do usuário chega de fora.
import type { LeitorPreferencias } from './modelo.ts'

export const MAX_PASTAS_DO_LEITOR = 20
const MAX_CAMINHO = 1024

/** Barras iguais, sem barra no fim (menos na raiz), sem diferença de maiúsculas: só para comparar. */
function chave(caminho: string): string {
  const barras = caminho.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  const raiz = /^[a-z]:\/$/i.test(barras) || barras === '/'
  return (raiz ? barras : barras.replace(/\/$/, '')).toLowerCase()
}

/** O caminho da pasta do usuário é de Windows? Daí se tira a plataforma sem importar `node:os`. */
function ehWindows(casa: string): boolean {
  return /^[a-z]:[\\/]/i.test(casa.trim())
}

/** Raiz de disco: `C:\`, `C:`, `/`, `\`. */
function raizDeDisco(caminho: string): boolean {
  return /^[a-z]:\/?$/.test(chave(caminho)) || chave(caminho) === '/'
}

/** Rede ou prefixo de dispositivo: `\\srv\x`, `\\?\C:\`, `\\.\x`, `\\localhost\c$`, `//srv/x`. */
function deRedeOuDispositivo(caminho: string): boolean {
  return /^[\\/]{2}/.test(caminho)
}

/**
 * Primeira barreira, só pelo texto (a segunda é {@link pastaFixavelReal}, pelo caminho real). Aceita só caminho
 * absoluto e já aparado, sem `.` nem `..` entre as barras, sem rede/UNC/`\\?\`/`\\.\`, sem `\x` (relativo ao disco
 * atual), sem `:` fora da letra do disco e sem segmento terminado em ponto ou espaço (o Windows os apaga e o
 * caminho vira outro). Recusa a raiz do disco e a pasta do usuário inteira (uma subpasta dela vale).
 */
export function pastaFixavel(caminho: unknown, pastaDoUsuario: string): caminho is string {
  if (typeof caminho !== 'string') return false
  if (caminho.length === 0 || caminho.length > MAX_CAMINHO || caminho !== caminho.trim() || /[\0\r\n]/.test(caminho)) return false
  if (deRedeOuDispositivo(caminho)) return false
  const windows = ehWindows(pastaDoUsuario)
  const comLetra = /^[a-z]:[\\/]/i.test(caminho)
  if (windows ? !comLetra : !caminho.startsWith('/')) return false
  for (const seg of caminho.slice(comLetra ? 3 : 1).split(/[\\/]/)) {
    if (seg === '.' || seg === '..') return false
    if (windows && seg !== '' && (/[:<>"|?*]/.test(seg) || /[. ]$/.test(seg))) return false
  }
  if (raizDeDisco(caminho)) return false
  if (pastaDoUsuario && chave(caminho) === chave(pastaDoUsuario)) return false
  return true
}

/**
 * Segunda barreira, pelo caminho **real** (atalho, junção e `C:\.` já resolvidos). `real` é o caminho depois do
 * `realpath`; `casaReal` é o da pasta do usuário, também resolvido. Recusa raiz de disco, rede, a casa e **qualquer
 * ancestral dela** (`C:\Users` daria a casa dos outros usuários).
 */
export function pastaRealFixavel(real: string, casaReal: string): boolean {
  if (typeof real !== 'string' || real.length === 0 || deRedeOuDispositivo(real) || raizDeDisco(real)) return false
  const r = chave(real)
  const casa = chave(casaReal)
  return !(casa && (r === casa || casa.startsWith(`${r}/`)))
}

/** Devolve o caminho real da pasta; `null` se não existe ou não é pasta. Quem chama injeta `realpath` + `stat`. */
export type ResolverPasta = (caminho: string) => string | null

/**
 * A pasta pode ser fixada de verdade? Passa pela primeira barreira (texto) e depois pela segunda (caminho real).
 * Devolve o caminho real, ou `null` se recusada. Pura: o acesso ao disco chega por `resolver`.
 */
export function pastaFixavelReal(caminho: unknown, pastaDoUsuario: string, resolver: ResolverPasta): string | null {
  if (!pastaFixavel(caminho, pastaDoUsuario)) return null
  const real = resolver(caminho)
  if (real === null) return null
  return pastaRealFixavel(real, resolver(pastaDoUsuario) ?? pastaDoUsuario) ? real : null
}

/**
 * Raízes de **leitura** (listar, ler, vigiar) = as de abrir + as pastas fixadas que passam na regra real.
 * As fixadas nunca entram na lista de abrir (`shell.openPath`); `paraAbrir` não é alterada.
 */
export function raizesDeLeitura(paraAbrir: readonly string[], fixadas: readonly unknown[], pastaDoUsuario: string, resolver: ResolverPasta): string[] {
  const raizes = new Set(paraAbrir)
  for (const pasta of fixadas) if (pastaFixavelReal(pasta, pastaDoUsuario, resolver) !== null) raizes.add(pasta as string)
  return [...raizes]
}

/** O campo `leitor` das preferências é válido? Ausente (`undefined`) é válido: arquivo antigo não tem. */
export function leitorValido(leitor: unknown, pastaDoUsuario: string): leitor is LeitorPreferencias | undefined {
  if (leitor === undefined) return true
  if (typeof leitor !== 'object' || leitor === null) return false
  const pastas = (leitor as { pastas?: unknown }).pastas
  if (!Array.isArray(pastas) || pastas.length > MAX_PASTAS_DO_LEITOR) return false
  return pastas.every((p) => pastaFixavel(p, pastaDoUsuario))
}
