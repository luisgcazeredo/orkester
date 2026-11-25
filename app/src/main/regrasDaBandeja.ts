/**
 * Bandeja (Fluxos, 1.9.6): as regras, sem Electron, para a prova rodar com `node --test`. A cola com o `Tray`
 * fica em `bandeja.ts`.
 *
 * Com fluxo ligado, fechar a última janela não encerra o app: ele fica na bandeja (os agentes seguem vivos e os
 * fluxos seguem disparando). Sem fluxo ligado, ou no autoteste e na medição, sai como sempre saiu.
 * Decisão do Luís (23/11, 11.2): com o app na bandeja, quando o último fluxo ligado é desligado, ele sai sozinho.
 *
 * A lição do incidente de 10/11 (app vivo sem janela e sem ícone) manda em tudo aqui: **na dúvida, sai.** Contar
 * os ligados deu erro, o ícone não nasceu, a imagem veio vazia: sai pelo caminho de sempre, com o prazo de 5 s.
 */

export type DecisaoAoFechar = 'bandeja' | 'sair'

export function decidirAoFecharUltima(e: { ligados: number; autoteste: boolean; medindo: boolean }): DecisaoAoFechar {
  if (e.autoteste || e.medindo) return 'sair'
  return Number.isFinite(e.ligados) && e.ligados > 0 ? 'bandeja' : 'sair'
}

/** "3 agentes seguem abertos" (1.9.7, D2). Vazio com 0 ou conta estranha: o que não se sabe não se diz. */
export function textoDosAgentesAbertos(agentes: number): string {
  if (!Number.isFinite(agentes) || agentes < 1) return ''
  const n = Math.floor(agentes)
  return n === 1 ? '1 agente segue aberto' : `${n} agentes seguem abertos`
}

/** O texto do ícone (dica ao passar o mouse): quantos fluxos estão ligados e, se houver, quantos agentes seguem abertos. */
export function textoDaBandeja(ligados: number, agentes = 0): string {
  const abertos = textoDosAgentesAbertos(agentes)
  return `Orkester · ${ligados} ${ligados === 1 ? 'fluxo ligado' : 'fluxos ligados'}${abertos ? ` · ${abertos}` : ''}`
}

export const BALAO_DA_BANDEJA = {
  titulo: 'O Orkester continua aberto',
  texto: 'Há fluxos ligados, então os agentes seguem rodando aqui na bandeja. Clique no ícone para abrir; "Sair" encerra tudo.'
}

/** O balão da 1ª vez: diz quantos agentes seguem abertos quando se sabe; sem a conta, o texto de sempre. */
export function textoDoBalao(agentes = 0): string {
  const abertos = textoDosAgentesAbertos(agentes)
  return abertos ? `Há fluxos ligados: ${abertos} aqui na bandeja. Clique no ícone para abrir; "Sair" encerra tudo.` : BALAO_DA_BANDEJA.texto
}

/** De quanto em quanto a bandeja reconta os ligados (o ícone e a saída sozinha não dependem de quem desligou). */
export const PASSO_DA_BANDEJA = 3000

/** O ícone, do jeito que a bandeja precisa dele. `bandeja.ts` faz com o `Tray`; a prova, com um falso. */
export interface IconeDaBandeja {
  mudarTexto(texto: string): void
  balao(titulo: string, texto: string): void
  destruir(): void
}

export interface DependenciasDaBandeja {
  /** Quantos fluxos ligados há em todos os espaços (o motor: `fluxosLigados()`). Pode lançar: aí conta como erro. */
  contar(): number
  /** Quantos agentes (não shell) estão vivos agora. Opcional; se faltar ou lançar, a bandeja só não fala deles. */
  agentes?(): number
  /**
   * Cria o ícone com o texto e o menu (Abrir / Sair). Lança se não conseguir; devolver `null` também é falha.
   * `aoAbrir` e `aoSair` são os itens do menu (e o clique no ícone é Abrir).
   */
  criarIcone(texto: string, aoAbrir: () => void, aoSair: () => void): IconeDaBandeja | null
  /** Reabre as janelas da sessão. */
  abrir(): void
  /** O caminho de sempre da saída (o do `window-all-closed`, com o prazo duro de 5 s). */
  sair(): void
  /** Relógio injetável: devolve como cancelar. */
  repetir(fn: () => void, ms: number): () => void
}

export interface Bandeja {
  /**
   * Antes de soltar a última janela: se for para ficar na bandeja, cria o ícone **já**, enquanto ainda há janela
   * (o app nunca fica um instante vivo sem janela e sem ícone). Devolve a decisão. Pode ser chamada de novo.
   */
  preparar(opcoes: { autoteste: boolean; medindo: boolean }): DecisaoAoFechar
  /** A última janela fechou: vai para a bandeja (ícone, balão na 1ª vez, recontagem) ou sai. */
  entrar(opcoes: { autoteste: boolean; medindo: boolean }): DecisaoAoFechar
  /** Os ligados podem ter mudado (ligar/desligar por `ork`, MCP, motor ou janela): reconta agora. */
  recontar(): void
  /** Uma janela voltou (Abrir, atalho, Ctrl+Shift+N): o ícone some e a bandeja deixa de valer. */
  voltou(): void
  /**
   * O app foi para a bandeja e nenhuma janela voltou? Continua `true` durante a saída pela bandeja: é o que diz ao
   * `index.ts` para não gravar a sessão de janelas vazia (a da hora em que a última janela fechou é a que vale).
   */
  ativa(): boolean
  /** A saída já começou (pela bandeja, pelos ligados a 0 ou porque não deu para ficar). */
  saindo(): boolean
  /** Há ícone na tela agora? */
  temIcone(): boolean
}

export function criarBandeja(d: DependenciasDaBandeja): Bandeja {
  let icone: IconeDaBandeja | null = null
  let naBandeja = false
  let saindo = false
  let jaMostrouBalao = false
  let pararRelogio: (() => void) | null = null
  let ultimoTexto = ''

  const contar = (): number | null => {
    try {
      const n = d.contar()
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
    } catch {
      return null
    }
  }

  const contarAgentes = (): number => {
    try {
      const n = d.agentes ? d.agentes() : 0
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    } catch {
      return 0
    }
  }

  function soltarIcone(): void {
    pararRelogio?.()
    pararRelogio = null
    const i = icone
    icone = null
    ultimoTexto = ''
    try {
      i?.destruir()
    } catch {
      /* o ícone já morreu: nada a fazer */
    }
  }

  /** Sai uma vez só, pelo caminho de sempre. O ícone some antes, para não ficar fantasma no relógio do Windows. */
  function sairDeVez(): void {
    if (saindo) return
    saindo = true
    pararRelogio?.()
    pararRelogio = null
    soltarIcone()
    d.sair()
  }

  function abrir(): void {
    if (saindo) return
    d.abrir()
  }

  /** Cria o ícone se ainda não há. `false`: não deu (quem chama sai). */
  function garantirIcone(ligados: number): boolean {
    if (icone) return true
    try {
      const texto = textoDaBandeja(ligados, contarAgentes())
      icone = d.criarIcone(texto, abrir, sairDeVez)
      ultimoTexto = icone ? texto : ''
    } catch {
      icone = null
    }
    return icone !== null
  }

  function decidir(o: { autoteste: boolean; medindo: boolean }): { decisao: DecisaoAoFechar; ligados: number } {
    const ligados = contar()
    if (ligados === null) return { decisao: 'sair', ligados: 0 }
    return { decisao: decidirAoFecharUltima({ ligados, ...o }), ligados }
  }

  function recontar(): void {
    if (!naBandeja || saindo) return
    const ligados = contar()
    // erro ao contar com o app na bandeja: o ícone está lá e o "Sair" funciona; não derruba os agentes por um tropeço
    if (ligados === null) return
    if (ligados === 0) {
      sairDeVez()
      return
    }
    const texto = textoDaBandeja(ligados, contarAgentes())
    if (icone && texto !== ultimoTexto) {
      try {
        icone.mudarTexto(texto)
        ultimoTexto = texto
      } catch {
        /* a dica não é crítica */
      }
    }
  }

  return {
    preparar(o) {
      if (saindo) return 'sair'
      const { decisao, ligados } = decidir(o)
      if (decisao === 'sair') return 'sair'
      return garantirIcone(ligados) ? 'bandeja' : 'sair'
    },
    entrar(o) {
      if (saindo) return 'sair'
      const { decisao, ligados } = decidir(o)
      if (decisao === 'sair' || !garantirIcone(ligados)) {
        // o ícone de um `preparar` anterior não pode ficar: a saída é pelo caminho de sempre
        sairDeVez()
        return 'sair'
      }
      naBandeja = true
      if (!jaMostrouBalao) {
        jaMostrouBalao = true
        try {
          icone?.balao(BALAO_DA_BANDEJA.titulo, textoDoBalao(contarAgentes()))
        } catch {
          /* o balão é só aviso */
        }
      }
      recontar()
      if (!saindo && !pararRelogio) pararRelogio = d.repetir(recontar, PASSO_DA_BANDEJA)
      return saindo ? 'sair' : 'bandeja'
    },
    recontar,
    voltou() {
      if (saindo) return
      naBandeja = false
      soltarIcone()
    },
    ativa: () => naBandeja,
    saindo: () => saindo,
    temIcone: () => icone !== null
  }
}
