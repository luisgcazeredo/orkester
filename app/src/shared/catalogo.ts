// Catálogo: um time escrito como arquivos de texto vira funções no Orkester.
//
// Por que existe: as fichas do time nascem fora do app — escritas à mão, por outra sessão de agente, ou
// copiadas de um projeto para outro. Até aqui a única forma de instalá-las era mexer no arquivo de
// preferências com o app fechado, o que é frágil e não dá para fazer com o quadro aberto. Com isto, quem
// escreve a ficha entrega um `.md` e o `ork catalogo importar <pasta>` faz o resto, com o app rodando.
//
// Puro de propósito: ler arquivo é do processo principal, gravar preferência é da janela, e a decisão —
// o que esta ficha vira, com que motor e que nível — fica aqui, onde as provas alcançam.
import type { Funcao, PresetAgente } from './modelo.ts'

/** Uma ficha lida de um arquivo: o cabeçalho dela mais o corpo, que vira o prompt da função. */
export interface FichaDeCatalogo {
  arquivo: string
  nome: string
  /** Como veio escrito no cabeçalho ("Codex", "Claude e Codex", "Shell com Claude"). */
  motor: string
  /** Como veio escrito ("forte", "médio (forte em migração)", "não se aplica"). */
  nivel: string
  pasta?: string
  prompt: string
}

export type LeituraDeFicha = { ficha: FichaDeCatalogo } | { erro: string }

/** Tetos do que entra pela importação: é por aqui que arquivo de fora vira estado do app. */
export const MAX_FICHAS = 100
/** O prompt é digitado no terminal quando o cartão abre; as fichas do time têm menos de 3 KB. */
export const MAX_PROMPT = 20_000

const semAcento = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Lê uma ficha: cabeçalho entre `---` e, abaixo, o corpo que vira o prompt.
 *
 * O cabeçalho aceita `nome`, `motor`, `nivel` (ou `nível`) e `pasta`. Só `nome` é obrigatório: sem ele o
 * cartão não teria como ser chamado no `ork abrir --funcao`.
 */
export function lerFicha(arquivo: string, texto: string): LeituraDeFicha {
  const partes = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texto.replace(/^﻿/, ''))
  if (!partes) return { erro: `${arquivo}: não tem cabeçalho entre --- e ---` }
  const cabecalho = new Map<string, string>()
  for (const linha of partes[1].split(/\r?\n/)) {
    const corte = linha.indexOf(':')
    if (corte <= 0) continue
    cabecalho.set(semAcento(linha.slice(0, corte).trim()), linha.slice(corte + 1).trim())
  }
  const nome = (cabecalho.get('nome') ?? '').trim()
  if (!nome) return { erro: `${arquivo}: o cabeçalho não diz o nome` }
  if (nome.length > 80) return { erro: `${arquivo}: o nome tem mais de 80 caracteres` }
  if (partes[2].length > MAX_PROMPT) return { erro: `${arquivo}: o corpo tem ${partes[2].length} caracteres (o teto é ${MAX_PROMPT})` }
  return {
    ficha: {
      arquivo,
      nome,
      motor: cabecalho.get('motor') ?? '',
      nivel: cabecalho.get('nivel') ?? '',
      pasta: cabecalho.get('pasta') || undefined,
      prompt: partes[2].trim()
    }
  }
}

const MOTORES = [
  { agente: 'codex' as const, palavra: 'codex' },
  { agente: 'claude' as const, palavra: 'claude' },
  { agente: 'shell' as const, palavra: 'shell' }
]

/**
 * Os motores que a ficha pede.
 *
 * Duas formas, e a diferença entre elas é o separador:
 * - **"Codex e Claude"**, **"Codex, Claude"**: dois assentos, um por motor. É assim que se escreve um papel
 *   que existe duas vezes (o de Decisões, para um lado continuar quando o outro ficar sem tokens).
 * - **"Shell com Claude"**: um motor só. Sem separador não é lista; é descrição, e vale o mais específico
 *   que aparecer (codex, depois claude, depois shell).
 *
 * Sem motor reconhecido, devolve vazio — quem chamou decide o que fazer com isso.
 */
export function motoresDaFicha(motor: string): Array<'claude' | 'codex' | 'shell'> {
  const limpo = semAcento(motor)
  const pedacos = limpo.split(/\s*(?:,|\/|\be\b)\s*/).filter(Boolean)
  if (pedacos.length > 1) {
    const achados = pedacos.flatMap((pedaco) => {
      const m = MOTORES.find((x) => pedaco.includes(x.palavra))
      return m ? [m.agente] : []
    })
    const unicos = [...new Set(achados)]
    if (unicos.length > 1) return unicos
  }
  const unico = MOTORES.find((x) => limpo.includes(x.palavra))
  return unico ? [unico.agente] : []
}

const NIVEIS = ['forte', 'medio', 'rapido']

/** O nível que a ficha pede, pela primeira palavra conhecida ("médio (forte em migração)" é médio). */
export function nivelDaFicha(nivel: string): string | undefined {
  const limpo = semAcento(nivel)
  let achado: { palavra: string; onde: number } | undefined
  for (const palavra of NIVEIS) {
    const onde = limpo.indexOf(palavra)
    if (onde >= 0 && (!achado || onde < achado.onde)) achado = { palavra, onde }
  }
  return achado?.palavra
}

export interface EscolhaDePreset {
  preset?: PresetAgente
  /** Quando não deu para atender o pedido da ficha ao pé da letra. */
  aviso?: string
}

/**
 * O preset que atende motor + nível.
 *
 * O casamento é pelo nome do preset: motor é o `agente` dele, nível é a palavra no nome ("Claude forte").
 * Sem nível no nome de preset nenhum, cai no primeiro daquele motor — que é exatamente o que o `ork abrir`
 * faria — mas devolve um aviso, porque "caiu no primeiro" e "é o que você pediu" não são a mesma coisa e
 * quem lê o relatório precisa saber a diferença.
 */
export function presetParaFicha(presets: readonly PresetAgente[], motor: 'claude' | 'codex' | 'shell', nivel?: string): EscolhaDePreset {
  const doMotor = presets.filter((p) => p.agente === motor)
  if (!doMotor.length) return { aviso: `não há nenhum preset de ${motor}` }
  if (!nivel) return { preset: doMotor[0] }
  const certo = doMotor.find((p) => semAcento(p.nome).includes(nivel))
  if (certo) return { preset: certo }
  return { preset: doMotor[0], aviso: `nenhum preset de ${motor} com o nível "${nivel}"; usei "${doMotor[0].nome}"` }
}

export interface LinhaDoRelatorio {
  nome: string
  acao: 'criada' | 'atualizada' | 'igual'
  preset?: string
  aviso?: string
}

export interface CatalogoJuntado {
  funcoes: Funcao[]
  relatorio: LinhaDoRelatorio[]
}

/**
 * Junta as fichas com as funções que já existem: mesma função pelo **nome** é atualizada, não duplicada.
 *
 * Nada é apagado — uma importação que só tem metade das fichas não derruba a outra metade, porque a pasta
 * de onde elas vieram pode ser um pedaço do time, não o time inteiro.
 *
 * Ficha de motor `shell` não leva prompt: shell não é agente, e o que fosse digitado nele viraria comando.
 */
export function juntarCatalogo(
  funcoes: readonly Funcao[],
  fichas: readonly FichaDeCatalogo[],
  presets: readonly PresetAgente[],
  novoId: () => string
): CatalogoJuntado {
  const porNome = new Map(funcoes.map((f) => [f.nome.trim().toLowerCase(), f]))
  const relatorio: LinhaDoRelatorio[] = []

  for (const ficha of fichas) {
    const motores = motoresDaFicha(ficha.motor)
    const nivel = nivelDaFicha(ficha.nivel)
    // dois assentos: o nome do motor entra no nome da função, senão uma apagaria a outra
    const assentos = motores.length > 1 ? motores : motores.length === 1 ? [motores[0]] : []
    if (!assentos.length) {
      relatorio.push({ nome: ficha.nome, acao: 'igual', aviso: `motor "${ficha.motor}" não é claude, codex nem shell; pulei` })
      continue
    }

    for (const motor of assentos) {
      const nome = assentos.length > 1 ? `${ficha.nome} (${motor === 'claude' ? 'Claude' : motor === 'codex' ? 'Codex' : 'Shell'})` : ficha.nome
      const escolha = presetParaFicha(presets, motor, nivel)
      const chave = nome.trim().toLowerCase()
      const antes = porNome.get(chave)
      const nova: Funcao = {
        id: antes?.id ?? novoId(),
        nome,
        prompt: motor === 'shell' ? '' : ficha.prompt,
        ...(ficha.pasta ? { pasta: ficha.pasta } : {}),
        ...(escolha.preset ? { preset: escolha.preset.id } : {})
      }
      const igual =
        antes !== undefined &&
        antes.nome === nova.nome &&
        antes.prompt === nova.prompt &&
        (antes.pasta ?? undefined) === (nova.pasta ?? undefined) &&
        (antes.preset ?? undefined) === (nova.preset ?? undefined)
      porNome.set(chave, nova)
      relatorio.push({
        nome,
        acao: igual ? 'igual' : antes ? 'atualizada' : 'criada',
        preset: escolha.preset?.nome,
        aviso: escolha.aviso
      })
    }
  }

  return { funcoes: [...porNome.values()], relatorio }
}

/** O relatório como o agente lê na tela. */
export function textoDoRelatorio(relatorio: readonly LinhaDoRelatorio[]): string {
  if (!relatorio.length) return 'Nenhuma ficha para importar.'
  const conta = (acao: LinhaDoRelatorio['acao']): number => relatorio.filter((l) => l.acao === acao).length
  const linhas = relatorio.map((l) => `  ${l.nome} — ${l.acao}${l.preset ? ` · ${l.preset}` : ''}${l.aviso ? ` · ATENÇÃO: ${l.aviso}` : ''}`)
  return [`${conta('criada')} criada(s), ${conta('atualizada')} atualizada(s), ${conta('igual')} sem mudança:`, ...linhas].join('\n')
}
