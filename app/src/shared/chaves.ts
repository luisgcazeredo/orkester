// Chaves de usuário: como um programa de fora fala com o quadro.
//
// Até aqui, só quem tinha **crachá** falava com o app, e crachá é emitido para um cartão — ou seja, só os
// agentes que o próprio Orkester abriu. Um cliente MCP (o Claude do usuário, o Codex, outra sessão) não tem
// cartão nenhum, e a única forma de montar um quadro de fora era escrever no arquivo de preferências com o
// app fechado. A chave resolve isso: quem a apresenta age **como o usuário**, não como agente — vê o quadro
// inteiro, porque a corda é a permissão entre agentes, não entre o dono e o quadro dele.
//
// O que a chave **não** é: fronteira contra programa local. Quem roda como o usuário já lê `~/.orkester`
// (e a chave de SSH dele, aliás). O que ela compra é intenção explícita, nome, revogação e rastro de quem
// fez o quê. Está escrito assim no README porque o contrário seria vender segurança que não existe.
//
// Puro de propósito: sortear e embaralhar é do processo principal, guardar é dele também; a decisão —
// o que é uma chave válida, qual registro responde por este segredo — fica aqui, onde as provas alcançam.

/** Uma chave guardada. O segredo **não** mora aqui: só a impressão digital dele. */
export interface ChaveGuardada {
  id: string
  /** Como o usuário chamou ("Claude Desktop", "notebook do trabalho"). */
  nome: string
  /** Impressão digital do segredo. Sem isto, perder o arquivo seria entregar as chaves. */
  impressao: string
  /** Começo do segredo, para a tela mostrar qual é qual sem guardar o resto. */
  comeco: string
  criadaEm: string
  usadaEm?: string
  revogadaEm?: string
}

export interface CofreDeChaves {
  versao: 1
  chaves: ChaveGuardada[]
}

export const MAX_CHAVES = 20
export const MAX_NOME_DA_CHAVE = 60
/** O prefixo diz de onde a chave veio quando ela aparece num log ou numa configuração colada. */
export const PREFIXO = 'ork_'
/** Em hex: 32 bytes de sorteio. */
export const TAMANHO_DO_SEGREDO = 64

export const COFRE_VAZIO: CofreDeChaves = { versao: 1, chaves: [] }

/** O formato de um segredo: prefixo mais 64 caracteres hexadecimais. */
export function segredoBemFormado(segredo: unknown): segredo is string {
  return typeof segredo === 'string' && new RegExp(`^${PREFIXO}[0-9a-f]{${TAMANHO_DO_SEGREDO}}$`).test(segredo)
}

/** Como a chave aparece na tela e nos avisos: nunca inteira. */
export function redigir(segredo: string): string {
  return segredoBemFormado(segredo) ? `${segredo.slice(0, PREFIXO.length + 6)}…` : '(chave inválida)'
}

export function cofreValido(cofre: unknown): cofre is CofreDeChaves {
  const c = cofre as CofreDeChaves
  return (
    c?.versao === 1 &&
    Array.isArray(c.chaves) &&
    c.chaves.length <= MAX_CHAVES &&
    c.chaves.every(
      (k) =>
        typeof k?.id === 'string' &&
        typeof k.nome === 'string' &&
        k.nome.length <= MAX_NOME_DA_CHAVE &&
        typeof k.impressao === 'string' &&
        k.impressao.length > 0 &&
        typeof k.comeco === 'string' &&
        typeof k.criadaEm === 'string'
    )
  )
}

export interface AmbienteDasChaves {
  /** 32 bytes sorteados, em hex. */
  sortear: () => string
  /** Impressão digital do segredo (sha-256 em hex, no principal). */
  impressaoDe: (segredo: string) => string
  novoId: () => string
  agora: () => string
}

export type CriacaoDeChave = { cofre: CofreDeChaves; chave: ChaveGuardada; segredo: string } | { erro: string }

/**
 * Cria uma chave. O segredo volta **uma vez**: o cofre guarda só a impressão digital, então ninguém — nem o
 * app, nem eu — consegue mostrá-lo de novo depois. Quem perder gera outra e revoga a antiga.
 */
export function criarChave(cofre: CofreDeChaves, nome: string, amb: AmbienteDasChaves): CriacaoDeChave {
  const limpo = nome.trim().slice(0, MAX_NOME_DA_CHAVE)
  if (!limpo) return { erro: 'dê um nome à chave: é por ele que você vai saber qual revogar' }
  const vivas = cofre.chaves.filter((k) => !k.revogadaEm)
  if (vivas.length >= MAX_CHAVES) return { erro: `já há ${vivas.length} chaves; revogue alguma antes de criar outra` }
  if (vivas.some((k) => k.nome.toLowerCase() === limpo.toLowerCase())) {
    return { erro: `já existe uma chave chamada "${limpo}"` }
  }
  const segredo = `${PREFIXO}${amb.sortear()}`
  if (!segredoBemFormado(segredo)) return { erro: 'o sorteio não produziu uma chave bem formada' }
  const chave: ChaveGuardada = {
    id: amb.novoId(),
    nome: limpo,
    impressao: amb.impressaoDe(segredo),
    comeco: segredo.slice(0, PREFIXO.length + 6),
    criadaEm: amb.agora()
  }
  return { cofre: { ...cofre, chaves: [...cofre.chaves, chave] }, chave, segredo }
}

/** Qual chave responde por este segredo. Revogada não responde, e malformado nem é procurado. */
export function chavePorSegredo(cofre: CofreDeChaves, segredo: unknown, impressaoDe: (s: string) => string): ChaveGuardada | undefined {
  if (!segredoBemFormado(segredo)) return undefined
  const impressao = impressaoDe(segredo)
  return cofre.chaves.find((k) => !k.revogadaEm && k.impressao === impressao)
}

/** Revogar é marcar, não apagar: o registro continua contando a história de quem teve acesso e até quando. */
export function revogarChave(cofre: CofreDeChaves, id: string, agora: string): CofreDeChaves {
  return { ...cofre, chaves: cofre.chaves.map((k) => (k.id === id && !k.revogadaEm ? { ...k, revogadaEm: agora } : k)) }
}

export function marcarUso(cofre: CofreDeChaves, id: string, agora: string): CofreDeChaves {
  return { ...cofre, chaves: cofre.chaves.map((k) => (k.id === id ? { ...k, usadaEm: agora } : k)) }
}

/** O que a janela mostra: tudo menos a impressão digital, que não serve para ninguém olhar. */
export function paraMostrar(cofre: CofreDeChaves): Array<Omit<ChaveGuardada, 'impressao'>> {
  return cofre.chaves.map(({ impressao: _impressao, ...resto }) => resto)
}

/** Como subir o servidor MCP nesta máquina: o Node e o arquivo, ambos com caminho absoluto. */
export interface ComandoDoMcp {
  comando: string
  args: string[]
  /** Variáveis além da chave (ex.: ELECTRON_RUN_AS_NODE quando não há Node no sistema e quem roda é o app). */
  env?: Record<string, string>
}

export interface ConfiguracoesDoMcp {
  /** Uma linha para colar no terminal: registra o servidor no Claude Code, para todos os projetos. */
  claudeCode: string
  /** O bloco para o `.mcp.json` de um projeto ou para a configuração do Claude Desktop. */
  json: string
  /** O bloco para o `~/.codex/config.toml`. */
  codex: string
}

/**
 * A configuração pronta para colar, em cada cliente. Puro de propósito: é aqui que mora o erro clássico de
 * caminho do Windows — barra invertida que o JSON precisa escapar e o TOML não pode (em string literal) —
 * e as provas olham exatamente isso.
 */
export function configuracoesDoMcp(segredo: string, mcp: ComandoDoMcp, nome = 'orkester'): ConfiguracoesDoMcp {
  const env = { ORK_CHAVE: segredo, ...(mcp.env ?? {}) }

  const aspas = (t: string): string => `"${t.replace(/"/g, '\\"')}"`
  const claudeCode = [
    'claude mcp add',
    nome,
    '-s user',
    ...Object.entries(env).map(([k, v]) => `-e ${k}=${v}`),
    '--',
    aspas(mcp.comando),
    ...mcp.args.map(aspas)
  ].join(' ')

  const json = JSON.stringify({ mcpServers: { [nome]: { command: mcp.comando, args: mcp.args, env } } }, null, 2)

  // string literal do TOML ('...'): sem escape nenhum, que é o que caminho do Windows precisa. Aspas simples
  // dentro dela não têm como entrar — e caminho com aspas simples não existe na prática; se existir, recusa.
  const literal = (t: string): string => {
    if (t.includes("'")) throw new Error(`o caminho tem aspas simples e não cabe no TOML: ${t}`)
    return `'${t}'`
  }
  const codex = [
    `[mcp_servers.${nome}]`,
    `command = ${literal(mcp.comando)}`,
    `args = [${mcp.args.map(literal).join(', ')}]`,
    `env = { ${Object.entries(env).map(([k, v]) => `${k} = ${literal(v)}`).join(', ')} }`
  ].join('\n')

  return { claudeCode, json, codex }
}
