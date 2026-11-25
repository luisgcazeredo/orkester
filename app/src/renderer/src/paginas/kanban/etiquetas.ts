// Kanban (página, 1.9.7): campos do painel (a Pasta no Enter; as etiquetas aceitam várias de uma vez, separadas por vírgula, `a, b, c`),
// e o aviso "N tarefas organizadas · Desfazer" do menu ⋯ da coluna. Puro (sem DOM, sem React): a `etiquetas.prova`
// roda no Node.
// @ts-expect-error o Node roda TypeScript direto e exige a extensão
import { LIMITES_DO_KANBAN, normalizar } from '../../../../shared/kanban.ts'

export interface EtiquetasSeparadas {
  /** As que entram (na ordem digitada, sem as repetidas nem as que a tarefa já tem), cada uma com até 24 letras. */
  novas: string[]
  /** O que avisar ao lado do campo (cortada, de fora pelo limite), ou null. */
  aviso: string | null
}

/**
 * Separa `a, b, c` pela vírgula. Respeita os limites do kanban: até 8 etiquetas na tarefa (contando as que ela já
 * tem) e até 24 letras cada (a mais longa é cortada). Repetidas (sem caixa nem acento) entram uma vez só.
 */
export function separarEtiquetas(texto: string, atuais: readonly string[]): EtiquetasSeparadas {
  const max = LIMITES_DO_KANBAN.etiquetas as number
  const tamanho = LIMITES_DO_KANBAN.etiqueta as number
  const vistas = new Set(atuais.map(normalizar))
  const novas: string[] = []
  const cortadas: string[] = []
  const deFora: string[] = []
  for (const parte of texto.split(',')) {
    let e = parte.replace(/\s+/g, ' ').trim()
    if (!e) continue
    if ([...e].length > tamanho) {
      e = [...e].slice(0, tamanho).join('').trim()
      cortadas.push(e)
    }
    if (vistas.has(normalizar(e))) continue
    vistas.add(normalizar(e))
    if (atuais.length + novas.length >= max) deFora.push(e)
    else novas.push(e)
  }
  const avisos: string[] = []
  if (cortadas.length) avisos.push(`cortada${cortadas.length > 1 ? 's' : ''} em ${tamanho} letras: ${cortadas.join(', ')}`)
  if (deFora.length) avisos.push(`a tarefa tem no máximo ${max} etiquetas; ficou de fora: ${deFora.join(', ')}`)
  return { novas, aviso: avisos.length ? avisos.join('; ') : null }
}

/**
 * O campo Pasta do painel: o que gravar. `undefined` = nada (igual à pasta de agora, ou o mesmo valor já foi mandado e
 * ainda não voltou: o Enter grava e o blur logo depois não manda de novo); `null` = tirar da pasta (campo vazio).
 */
export function pastaParaGravar(digitado: string, atual: string | undefined, enviada: string | null): string | null | undefined {
  const nova = digitado.trim()
  if (nova === (atual ?? '') || nova === enviada) return undefined
  return nova || null
}

/**
 * O aviso depois de organizar. 1ª abertura: "Feito organizado por versão". Senão diz para onde foi: `1 tarefa → pasta
 * "cliente-a"`, `2 tarefas → pasta "1.9.7"` e, com várias pastas, `5 tarefas → 3 pastas`. Sem o destino (`pastas`
 * vazio), só "N tarefas organizadas".
 */
export function textoDoOrganizado(quantas: number, inicial: { coluna: string } | null = null, pastas: readonly string[] = []): string {
  if (inicial) return `${inicial.coluna} organizado por versão`
  const tarefas = quantas === 1 ? '1 tarefa' : `${quantas} tarefas`
  if (pastas.length === 1) return `${tarefas} → pasta "${pastas[0]}"`
  if (pastas.length > 1) return `${tarefas} → ${pastas.length} pastas`
  return quantas === 1 ? '1 tarefa organizada' : `${quantas} tarefas organizadas`
}
