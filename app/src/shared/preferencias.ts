// Como duas janelas gravam as preferências sem apagar o trabalho uma da outra. Puro de propósito: é o que
// as provas conseguem testar fora do app.
import type { Preferencias } from './modelo.ts'

/** O que uma janela manda gravar: só os campos que ela mexeu. */
export type PreferenciasParciais = Partial<Omit<Preferencias, 'versao'>>

/** Os campos que uma janela pode gravar. Fora desta lista nada entra, nem por engano nem de propósito. */
const CAMPOS = ['tema', 'presets', 'funcoes', 'partituras', 'corPostItPadrao', 'linhasDoCodigo'] as const

/**
 * Junta o que a janela mexeu com o que já está no disco — **campo por campo**.
 *
 * Antes cada janela mandava o objeto inteiro, montado a partir da própria cópia. Quem gravasse com cópia
 * velha apagava o que a outra janela tinha acabado de pôr: criar uma função numa janela e trocar o tema na
 * outra perdia a função (achado na revisão de 10/11/2026). Com o time de agentes, que é multi-janela por
 * natureza, isso deixaria de ser raro — daí a correção vir antes dos agentes.
 *
 * `undefined` não apaga nada: campo ausente é campo que a janela não mexeu, não campo que ela zerou.
 */
export function juntarPreferencias(disco: Preferencias, parcial: PreferenciasParciais): Preferencias {
  const juntas = { ...disco, versao: 1 as const }
  for (const campo of CAMPOS) {
    const valor = parcial[campo]
    if (valor !== undefined) (juntas as Record<string, unknown>)[campo] = valor
  }
  return juntas
}
