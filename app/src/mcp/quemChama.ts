// Quem está do outro lado do servidor MCP, e como as ferramentas de kanban montam o pedido. Puro (sem cano, sem
// stdout), para a prova poder exercitar sem subir o servidor.
//
// Por que existe (1.9.4, decisão 12.2 do Luís: agente só mexe no kanban do PRÓPRIO espaço): o servidor `orkester`
// fica no escopo do usuário, então todo Claude aberto num terminal do Orkester também o carrega, e o servidor herda
// o ambiente daquele terminal. Com a chave de usuário, esse agente alcançaria o kanban de qualquer espaço e ainda
// gravaria como `MCP · <chave>`. Então, no kanban, quem tem crachá fala **com o crachá**: o mesmo pedido do
// `ork kanban`, as mesmas regras (só o espaço dele) e o nome dele no histórico.

export type QuemChama = { tipo: 'agente'; cracha: string; pipe?: string } | { tipo: 'usuario' }

/** O que o Orkester põe no ambiente de todo terminal dele (ver main/instalarOrk.ts), além do crachá. */
const MARCAS_DE_TERMINAL = ['ORK_PIPE', 'ORK_CORREIO', 'ORK_TERMINAL'] as const

const valor = (ambiente: Readonly<Record<string, string | undefined>>, nome: string): string => (ambiente[nome] ?? '').trim()

/**
 * Com crachá = o agente daquele terminal (o app confere o crachá e recusa um inventado). Sem crachá e sem marca de
 * terminal = o usuário, pela chave. Marca de terminal **sem** crachá não vira usuário: apagar o crachá do ambiente
 * não pode ser o jeito de um agente ganhar o alcance do usuário.
 */
export function quemChama(ambiente: Readonly<Record<string, string | undefined>>): QuemChama {
  const cracha = valor(ambiente, 'ORK_CRACHA')
  if (cracha) {
    const pipe = valor(ambiente, 'ORK_PIPE')
    return pipe ? { tipo: 'agente', cracha, pipe } : { tipo: 'agente', cracha }
  }
  const marca = MARCAS_DE_TERMINAL.find((m) => valor(ambiente, m))
  if (marca) {
    throw new Error(
      `este servidor roda num terminal do Orkester (${marca}) mas sem crachá: recuso o kanban. Dentro do Orkester use \`ork kanban\`; o kanban de outro espaço é do usuário, pela página.`
    )
  }
  return { tipo: 'usuario' }
}

/**
 * A linha que vai pelo cano. Agente: só o crachá — **nunca** a chave junto, porque o app olha a chave primeiro e
 * o pedido viraria do usuário. Usuário: só a chave (`chave()` é chamada só aqui, para a falta dela só pesar em quem usa).
 * `texto` vazio não vai (o app lê ausente como vazio), e assim o pedido das ferramentas antigas fica como era.
 */
export function corpoDoPedido(
  quem: QuemChama,
  chave: () => string,
  comando: string,
  posicionais: string[],
  opcoes: Record<string, string | number | true>,
  texto = ''
): Record<string, unknown> {
  const resto = { comando, posicionais, opcoes, ...(texto ? { texto } : {}) }
  return quem.tipo === 'agente' ? { cracha: quem.cracha, ...resto } : { chave: chave(), ...resto }
}

/** Opções do kanban: o que não veio (`undefined`) ou veio vazio sai, e o `espaco` só vai quando foi dito. */
export function opcoesDoKanban(opcoes: Record<string, string | true | undefined>, espaco: string | undefined): Record<string, string | true> {
  const saida: Record<string, string | true> = {}
  for (const [nome, v] of Object.entries(opcoes)) if (v !== undefined && v !== '') saida[nome] = v
  if (espaco?.trim()) saida.espaco = espaco.trim()
  return saida
}

/**
 * O `kanban_editar`: diferencia "não mandou" (`undefined`, o campo fica como está) de "mandou vazio" (limpa).
 * O registro de verbos recusa opção vazia (`--descricao ""` = "falta o valor"), então o vazio viaja por caminhos
 * que ele aceita e que o `ork kanban` já entende:
 *  - descrição vazia → `--arquivo` com o conteúdo vazio (o `texto` do pedido vale como descrição, ver operacaoDoComando);
 *  - etiquetas vazias → `--etiqueta ","`, que `lerEtiquetas` lê como "troca a lista por nenhuma".
 * Título vazio segue como está e o app recusa (tarefa sem título não existe).
 */
export function pedidoDeEdicao(
  campos: { titulo?: string; descricao?: string; etiquetas?: string },
  espaco: string | undefined
): { opcoes: Record<string, string | true>; texto: string } {
  const opcoes: Record<string, string | true> = {}
  let texto = ''
  if (campos.titulo !== undefined) opcoes.titulo = campos.titulo
  if (campos.descricao !== undefined) {
    if (campos.descricao.trim()) opcoes.descricao = campos.descricao
    else {
      opcoes.arquivo = '(mcp: descrição vazia)'
      texto = ''
    }
  }
  if (campos.etiquetas !== undefined) opcoes.etiqueta = campos.etiquetas.trim() ? campos.etiquetas : ','
  if (espaco?.trim()) opcoes.espaco = espaco.trim()
  return { opcoes, texto }
}
