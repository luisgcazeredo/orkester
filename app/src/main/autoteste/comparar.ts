// Comparador de capturas do autoteste. Puro (sem Electron, sem disco): a prova roda no Node.

/** Imagem crua: 4 bytes por pixel (RGBA ou BGRA, tanto faz desde que as duas sejam do mesmo tipo). */
export type Bitmap = { largura: number; altura: number; dados: Uint8Array | Uint8ClampedArray }

/** Janela fixa das capturas de base: sem isso a base muda a cada tamanho de tela. */
export const JANELA_BASE = { largura: 1280, altura: 800 } as const
/** Acima disto (em % de pixels diferentes) a comparação reprova. */
export const LIMITE_PERCENTUAL = 0.5
/** Diferença máxima por canal (0–255) que ainda conta como o mesmo pixel: serrilhado e antialias do compositor. */
export const TOLERANCIA_CANAL = 8

export type Comparacao = {
  total: number
  diferentes: number
  percentual: number
  /** Mesmo tamanho da entrada, em BGRA: vermelho onde mudou, o resto esmaecido. */
  diferenca: Uint8Array
}

function conferirBitmap(b: Bitmap, nome: string): void {
  if (!Number.isInteger(b.largura) || !Number.isInteger(b.altura) || b.largura <= 0 || b.altura <= 0) {
    throw new Error(`bitmap ${nome} com tamanho inválido (${b.largura}x${b.altura})`)
  }
  if (b.dados.length !== b.largura * b.altura * 4) {
    throw new Error(`bitmap ${nome}: ${b.dados.length} bytes para ${b.largura}x${b.altura} (esperava ${b.largura * b.altura * 4})`)
  }
}

/** Conta os pixels que mudaram além da tolerância. Tamanhos diferentes são recusados, não comparados. */
export function compararBitmaps(a: Bitmap, b: Bitmap, tolerancia = TOLERANCIA_CANAL): Comparacao {
  conferirBitmap(a, 'A')
  conferirBitmap(b, 'B')
  if (a.largura !== b.largura || a.altura !== b.altura) {
    throw new Error(`tamanhos diferentes: ${a.largura}x${a.altura} contra ${b.largura}x${b.altura}`)
  }
  const total = a.largura * a.altura
  const diferenca = new Uint8Array(total * 4)
  let diferentes = 0
  for (let p = 0; p < total; p++) {
    const i = p * 4
    const mudou =
      Math.abs(a.dados[i] - b.dados[i]) > tolerancia ||
      Math.abs(a.dados[i + 1] - b.dados[i + 1]) > tolerancia ||
      Math.abs(a.dados[i + 2] - b.dados[i + 2]) > tolerancia ||
      Math.abs(a.dados[i + 3] - b.dados[i + 3]) > tolerancia
    if (mudou) {
      diferentes++
      // vermelho vivo em BGRA (o formato de toBitmap do Electron)
      diferenca[i] = 0
      diferenca[i + 1] = 0
      diferenca[i + 2] = 255
      diferenca[i + 3] = 255
    } else {
      const cinza = (a.dados[i] + a.dados[i + 1] + a.dados[i + 2]) / 3
      const claro = Math.round(255 - (255 - cinza) * 0.25)
      diferenca[i] = claro
      diferenca[i + 1] = claro
      diferenca[i + 2] = claro
      diferenca[i + 3] = 255
    }
  }
  return { total, diferentes, percentual: (diferentes / total) * 100, diferenca }
}

/** Reprova acima do limite (por padrão 0,5%). */
export function dentroDoLimite(c: Comparacao, limite = LIMITE_PERCENTUAL): boolean {
  return c.percentual <= limite
}

/** O que o relatório diz de um print: aprova/reprova, o texto com a % e se a imagem de diferença deve ser gravada (sempre que há pixel diferente). */
export function relatarComparacao(c: Comparacao, limite = LIMITE_PERCENTUAL): { ok: boolean; detalhe: string; gravarDiferenca: boolean } {
  return {
    ok: dentroDoLimite(c, limite),
    detalhe: `${c.percentual.toFixed(3)}% (${c.diferentes} px) — limite ${limite}%`,
    gravarDiferenca: c.diferentes > 0
  }
}
