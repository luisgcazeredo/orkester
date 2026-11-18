import type { Partitura } from '../../../shared/modelo'
import { planoAtual, subirPartitura } from '../estado/loja'
import { centroDaTela } from '../quadro/geometria'
import { avisar as avisarRecado } from './Perguntas'

// Partituras (times salvos): a lista, o renomear e o apagar moram na página Agentes (paginas/agentes). Aqui ficou só
// o "subir", que o menu do Terminal também usa e por isso não pode puxar a página.

/** Sobe a partitura no meio da tela (o arranjo desce sozinho se o lugar estiver ocupado). */
export function subirPartituraNoCentro(partitura: Partitura): void {
  const plano = planoAtual()
  if (!plano) return
  const centro = centroDaTela(plano.camera)
  const feito = subirPartitura(partitura, centro.x - partitura.largura / 2, centro.y - partitura.altura / 2)
  if ('erro' in feito) void avisarRecado('Partitura', feito.erro)
}
