// O servidor MCP do Orkester: é por aqui que um cliente de fora — o Claude do usuário, o Codex, outra
// sessão de agente — mexe no quadro sem ter um cartão nele.
//
// O cliente liga este programa sozinho e conversa com ele pela entrada e saída padrão. Por isso: **nunca
// escreva no stdout** fora do protocolo; o stdout é o fio da conversa, e texto solto ali derruba a conexão.
// Para depurar, console.error.
//
// Ele não fala com o quadro direto: manda o mesmo pedido que o `ork` manda, pelo mesmo cano, com uma
// **chave de usuário** no lugar do crachá. Quem apresenta a chave age como o usuário — sem dono, sem corda
// — e o app decide o que isso pode fazer (ver main/comandos.ts). Aqui não há regra de permissão nenhuma:
// seria o lugar errado, porque este processo roda na máquina de quem o chamou.
//
// Uma ferramenta por ação, não uma genérica "rodar comando": o cliente libera ou pergunta pelo **nome** da
// ferramenta, então ler o quadro pode ficar liberado enquanto abrir um agente continua pedindo o OK.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { metaDaFerramenta } from '../shared/ferramentasMcp'
import { corpoDoPedido, opcoesDoKanban, pedidoDeEdicao, quemChama, type QuemChama } from './quemChama'

const PASTA = process.env.ORK_DADOS || join(homedir(), '.orkester')
const CANO = join(PASTA, 'cano.json')
const PRAZO = 30_000

interface Resposta {
  ok: boolean
  saida?: string
  erro?: string
}

/** O endereço do cano muda a cada execução do app, e o arquivo só existe enquanto ele está aberto. */
function enderecoDoCano(): string {
  if (!existsSync(CANO)) {
    throw new Error('o Orkester não está aberto nesta máquina (ou é outra versão): abra o app e tente de novo')
  }
  const { pipe } = JSON.parse(readFileSync(CANO, 'utf8')) as { pipe?: string }
  if (!pipe) throw new Error('o arquivo do cano existe mas não diz o endereço; feche e abra o Orkester')
  return pipe
}

function chave(): string {
  const k = (process.env.ORK_CHAVE ?? '').trim()
  if (!k) {
    throw new Error('falta a chave: ponha ORK_CHAVE na configuração deste servidor (gere uma no Orkester, em Configurações › Conexões › Chaves)')
  }
  return k
}

/**
 * Um pedido pelo cano, no mesmo formato do `ork`: com a chave (o usuário) ou, nas ferramentas de kanban, com o
 * crachá do agente em cujo terminal este servidor roda (ver quemChama.ts), pelo cano do app que abriu o agente.
 */
function pedir(
  comando: string,
  posicionais: string[] = [],
  opcoes: Record<string, string | number | true> = {},
  quem: QuemChama = { tipo: 'usuario' },
  texto = ''
): Promise<string> {
  return new Promise((resolver, recusar) => {
    let conexao: ReturnType<typeof connect>
    let linha: string
    try {
      linha = `${JSON.stringify(corpoDoPedido(quem, chave, comando, posicionais, opcoes, texto))}\n`
      conexao = connect(quem.tipo === 'agente' && quem.pipe ? quem.pipe : enderecoDoCano())
    } catch (erro) {
      return recusar(erro instanceof Error ? erro : new Error(String(erro)))
    }
    let recebido = ''
    const desistir = setTimeout(() => {
      conexao.destroy()
      recusar(new Error('o Orkester não respondeu em 30 s'))
    }, PRAZO)
    conexao.setEncoding('utf8')
    conexao.on('connect', () => conexao.write(linha))
    conexao.on('data', (parte: string) => {
      recebido += parte
      const fim = recebido.indexOf('\n')
      if (fim < 0) return
      clearTimeout(desistir)
      conexao.destroy()
      try {
        const resposta = JSON.parse(recebido.slice(0, fim)) as Resposta
        if (!resposta.ok) return recusar(new Error(resposta.erro ?? 'o Orkester recusou sem dizer por quê'))
        resolver(resposta.saida ?? '')
      } catch {
        recusar(new Error('o Orkester respondeu algo que não dá para ler'))
      }
    })
    conexao.on('error', (erro: NodeJS.ErrnoException) => {
      clearTimeout(desistir)
      recusar(
        erro.code === 'ENOENT'
          ? new Error('o Orkester fechou desde a última vez; abra o app e tente de novo')
          : new Error(`não consegui falar com o Orkester (${erro.code ?? erro.message})`)
      )
    })
  })
}

const servidor = new McpServer({ name: 'orkester', version: __VERSAO__ })

const texto = (t: string): { content: Array<{ type: 'text'; text: string }> } => ({ content: [{ type: 'text', text: t || '(sem resposta)' }] })
const falha = (e: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } => ({
  content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
  isError: true
})

/** Toda ferramenta passa por aqui: erro vira texto marcado, nunca derruba o servidor. */
const rodar = async (comando: string, posicionais: string[] = [], opcoes: Record<string, string | number | true> = {}) => {
  try {
    return texto(await pedir(comando, posicionais, opcoes))
  } catch (e) {
    return falha(e)
  }
}

const espaco = z.string().optional().describe('Nome do espaço. Sem isto, vale o único que estiver aberto numa janela.')

servidor.registerTool(
  'espacos',
  {
    ...metaDaFerramenta('espacos'),
    inputSchema: {}
  },
  () => rodar('espacos')
)

servidor.registerTool(
  'quadro',
  {
    ...metaDaFerramenta('quadro'),
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('quadro', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'funcoes',
  {
    ...metaDaFerramenta('funcoes'),
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('funcoes', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'ver_cartao',
  {
    ...metaDaFerramenta('ver_cartao'),
    inputSchema: {
      cartao: z.string().describe('Nome do cartão (ou o começo dele).'),
      linhas: z.number().int().min(1).max(2000).optional().describe('Quantas linhas do fim da tela. Padrão 50.'),
      espaco
    }
  },
  ({ cartao, linhas, espaco: nome }) =>
    rodar('ver', [cartao], { ...(linhas ? { linhas } : {}), ...(nome ? { espaco: nome } : {}) })
)

servidor.registerTool(
  'abrir_cartao',
  {
    ...metaDaFerramenta('abrir_cartao'),
    inputSchema: {
      agente: z.enum(['claude', 'codex', 'shell']).optional().describe('Só é necessário sem `funcao`.'),
      funcao: z.string().optional().describe('Nome de um papel guardado (veja a ferramenta funcoes).'),
      preset: z.string().optional().describe('Força um preset pelo nome, por exemplo "Claude Code".'),
      nome: z.string().optional().describe('Nome do cartão. Sem isto, vale o nome do papel.'),
      pasta: z.string().optional().describe('Pasta do agente, relativa à do espaço. Sem isto, vale a do espaço ou a do papel.'),
      modelo: z.string().optional().describe('Modelo (veja a ferramenta modelos), por exemplo "opus" ou "sonnet". Fora da lista abre com aviso.'),
      esforco: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional().describe('Esforço de raciocínio. O Claude vai de low a max; ultra é só do Codex.'),
      tarefa: z.number().int().min(1).optional().describe('Número de uma tarefa do kanban do espaço (o N de #N): o agente aberto entra trabalhando nela.'),
      espaco
    }
  },
  ({ agente, funcao, preset, nome, pasta, modelo, esforco, tarefa, espaco: ondeEspaco }) =>
    rodar('abrir', agente ? [agente] : [], {
      ...(tarefa ? { tarefa: String(tarefa) } : {}),
      ...(funcao ? { funcao } : {}),
      ...(preset ? { preset } : {}),
      ...(nome ? { nome } : {}),
      ...(pasta ? { pasta } : {}),
      ...(modelo ? { modelo } : {}),
      ...(esforco ? { esforco } : {}),
      ...(ondeEspaco ? { espaco: ondeEspaco } : {})
    })
)

servidor.registerTool(
  'modelos',
  {
    ...metaDaFerramenta('modelos'),
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('modelos', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'trocar_modelo',
  {
    ...metaDaFerramenta('trocar_modelo'),
    inputSchema: {
      cartao: z.string().describe('Nome do cartão (ou o começo dele).'),
      modelo: z.string().optional().describe('Modelo novo, por exemplo "sonnet".'),
      esforco: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional().describe('Esforço novo. ultra é só do Codex.'),
      espaco
    }
  },
  ({ cartao, modelo, esforco, espaco: ondeEspaco }) =>
    rodar('modelo', modelo ? [cartao, modelo] : [cartao], { ...(esforco ? { esforco } : {}), ...(ondeEspaco ? { espaco: ondeEspaco } : {}) })
)

servidor.registerTool(
  'partituras',
  {
    ...metaDaFerramenta('partituras'),
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('partitura', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'subir_partitura',
  {
    ...metaDaFerramenta('subir_partitura'),
    inputSchema: { nome: z.string().describe('Nome da partitura.'), espaco }
  },
  ({ nome, espaco: ondeEspaco }) => rodar('partitura', ['usar', nome], ondeEspaco ? { espaco: ondeEspaco } : {})
)

servidor.registerTool(
  'importar_catalogo',
  {
    ...metaDaFerramenta('importar_catalogo'),
    inputSchema: { pasta: z.string().describe('Pasta das fichas, relativa à do espaço.'), espaco }
  },
  ({ pasta, espaco: ondeEspaco }) => rodar('catalogo', ['importar', pasta], ondeEspaco ? { espaco: ondeEspaco } : {})
)

// ---------- kanban (1.9.4): o mesmo `ork kanban <ação>`; as colunas ficam na página e no `ork` ----------

const numero = z.number().int().min(1).describe('Número da tarefa (o N de #N).')
const comEspaco = opcoesDoKanban
const espacoDoKanban = z
  .string()
  .optional()
  .describe('Nome do espaço. Sem isto, vale o único aberto numa janela. Num terminal do Orkester você age como o seu agente e só alcança o próprio espaço (não mande isto).')

/**
 * O kanban age como quem chama (decisão 12.2 do Luís): num terminal do Orkester, como aquele agente, com o crachá
 * dele (o app aplica as regras do `ork kanban`: só o espaço dele, o nome dele no histórico); fora, como o usuário.
 * Quem é se decide a cada chamada, pelo ambiente que este servidor herdou (ver quemChama.ts).
 */
const rodarKanban = async (posicionais: string[], opcoes: Record<string, string | true>, textoDoPedido = '') => {
  try {
    return texto(await pedir('kanban', posicionais, opcoes, quemChama(process.env), textoDoPedido))
  } catch (e) {
    return falha(e)
  }
}

servidor.registerTool(
  'kanban',
  {
    ...metaDaFerramenta('kanban'),
    inputSchema: {
      numero: numero.optional(),
      coluna: z.string().optional().describe('Só esta coluna (nome, sem caixa nem acento).'),
      responsavel: z.string().optional().describe('Só as em que este agente trabalha; "ninguem" = sem ninguém trabalhando.'),
      etiqueta: z.string().optional().describe('Só as com esta etiqueta.'),
      espaco: espacoDoKanban
    }
  },
  ({ numero: n, coluna, responsavel, etiqueta, espaco: ondeEspaco }) =>
    rodarKanban(n ? ['ver', String(n)] : ['ver'], comEspaco({ coluna, para: responsavel, etiqueta }, ondeEspaco))
)

servidor.registerTool(
  'kanban_criar',
  {
    ...metaDaFerramenta('kanban_criar'),
    inputSchema: {
      titulo: z.string().describe('Título curto (até 120 letras).'),
      descricao: z.string().optional().describe('Markdown, até 8 KB.'),
      coluna: z.string().optional().describe('Coluna onde nasce. Sem isto, a primeira.'),
      responsavel: z.string().optional().describe('Nome do agente (Claude ou Codex) do espaço.'),
      etiquetas: z.array(z.string()).optional().describe('Até 8, de até 24 letras.'),
      espaco: espacoDoKanban
    }
  },
  ({ titulo, descricao, coluna, responsavel, etiquetas, espaco: ondeEspaco }) =>
    rodarKanban(['criar', titulo], comEspaco({ descricao, coluna, para: responsavel, etiqueta: etiquetas?.join(',') }, ondeEspaco))
)

servidor.registerTool(
  'kanban_mover',
  {
    ...metaDaFerramenta('kanban_mover'),
    inputSchema: {
      numero,
      coluna: z.string().describe('Coluna de destino.'),
      posicao: z.union([z.enum(['topo', 'fim']), z.number().int().min(1)]).optional().describe('topo, fim (padrão) ou a posição (1 = topo).'),
      espaco: espacoDoKanban
    }
  },
  ({ numero: n, coluna, posicao, espaco: ondeEspaco }) =>
    rodarKanban(['mover', String(n), coluna], comEspaco({ posicao: posicao === undefined ? undefined : String(posicao) }, ondeEspaco))
)

servidor.registerTool(
  'kanban_editar',
  {
    ...metaDaFerramenta('kanban_editar'),
    inputSchema: {
      numero,
      titulo: z.string().optional(),
      descricao: z.string().optional().describe('Markdown, até 8 KB. "" apaga a descrição; sem isto, fica como está.'),
      etiquetas: z.string().optional().describe('"+a,-b" põe a e tira b; "a,b" troca a lista; "" tira todas.'),
      espaco: espacoDoKanban
    }
  },
  ({ numero: n, titulo, descricao, etiquetas, espaco: ondeEspaco }) => {
    // vazio limpa (descrição, etiquetas); ausente não mexe — ver pedidoDeEdicao
    const { opcoes, texto: conteudo } = pedidoDeEdicao({ titulo, descricao, etiquetas }, ondeEspaco)
    return rodarKanban(['editar', String(n)], opcoes, conteudo)
  }
)

servidor.registerTool(
  'kanban_atribuir',
  {
    ...metaDaFerramenta('kanban_atribuir'),
    inputSchema: { numero, responsavel: z.string().describe('Nome do agente, ou "ninguem".'), espaco: espacoDoKanban }
  },
  ({ numero: n, responsavel, espaco: ondeEspaco }) => rodarKanban(['atribuir', String(n), responsavel], comEspaco({}, ondeEspaco))
)

servidor.registerTool(
  'kanban_soltar',
  {
    ...metaDaFerramenta('kanban_soltar'),
    inputSchema: {
      numero,
      quem: z.string().optional().describe('Nome do agente que sai da lista. Sem isto, sai você (só num terminal do Orkester).'),
      espaco: espacoDoKanban
    }
  },
  ({ numero: n, quem, espaco: ondeEspaco }) => rodarKanban(['soltar', String(n), ...(quem?.trim() ? [quem] : [])], comEspaco({}, ondeEspaco))
)

servidor.registerTool(
  'kanban_comentar',
  {
    ...metaDaFerramenta('kanban_comentar'),
    inputSchema: { numero, texto: z.string().describe('O comentário (até 2 KB).'), espaco: espacoDoKanban }
  },
  ({ numero: n, texto: comentario, espaco: ondeEspaco }) => rodarKanban(['comentar', String(n), comentario], comEspaco({}, ondeEspaco))
)

servidor.registerTool(
  'kanban_apagar',
  {
    ...metaDaFerramenta('kanban_apagar'),
    inputSchema: { numero, confirmar: z.literal(true).describe('Precisa ser true: a tarefa vai para a lixeira.'), espaco: espacoDoKanban }
  },
  ({ numero: n, espaco: ondeEspaco }) => rodarKanban(['apagar', String(n)], comEspaco({ confirmar: true }, ondeEspaco))
)

// ---------- fluxos: o mesmo `ork fluxo <ação>`; como o kanban, age como quem chama (crachá ou chave) ----------

const nomeDoFluxo = z.string().describe('Nome do fluxo (ou o começo dele).')
const corpoDoFluxo = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe('O fluxo: o JSON do fluxo_ver com `json` (orkester, versao, nome, nos, ligacoes), como objeto ou texto.')
const espacoDoFluxo = z
  .string()
  .optional()
  .describe('Nome do espaço. Sem isto, vale o único aberto numa janela. Num terminal do Orkester você age como o seu agente e só alcança o próprio espaço (não mande isto).')

const rodarFluxo = async (posicionais: string[], opcoes: Record<string, string | number | true | undefined>, espaco?: string, corpo?: unknown) => {
  try {
    const textoDoPedido = corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
    const limpas: Record<string, string | number | true> = {}
    for (const [k, v] of Object.entries(opcoes)) if (v !== undefined && v !== '') limpas[k] = v
    if (espaco?.trim()) limpas.espaco = espaco.trim()
    return texto(await pedir('fluxo', posicionais, limpas, quemChama(process.env), textoDoPedido))
  } catch (e) {
    return falha(e)
  }
}

servidor.registerTool(
  'fluxo_ver',
  {
    ...metaDaFerramenta('fluxo_ver'),
    inputSchema: {
      nome: nomeDoFluxo.optional(),
      json: z.boolean().optional().describe('Com `nome`: devolve o JSON (o formato de fluxo_criar e fluxo_editar).'),
      espaco: espacoDoFluxo
    }
  },
  ({ nome, json, espaco: ondeEspaco }) => rodarFluxo(nome?.trim() ? ['ver', nome] : ['listar'], { json: json && nome?.trim() ? true : undefined }, ondeEspaco)
)

servidor.registerTool(
  'fluxo_criar',
  {
    ...metaDaFerramenta('fluxo_criar'),
    inputSchema: { fluxo: corpoDoFluxo, pasta: z.string().optional().describe('Nome de uma pasta que já existe na página Fluxos.'), espaco: espacoDoFluxo }
  },
  ({ fluxo, pasta, espaco: ondeEspaco }) => rodarFluxo(['criar'], { pasta }, ondeEspaco, fluxo)
)

servidor.registerTool(
  'fluxo_editar',
  {
    ...metaDaFerramenta('fluxo_editar'),
    inputSchema: { nome: nomeDoFluxo, fluxo: corpoDoFluxo, espaco: espacoDoFluxo }
  },
  ({ nome, fluxo, espaco: ondeEspaco }) => rodarFluxo(['editar', nome], {}, ondeEspaco, fluxo)
)

servidor.registerTool(
  'fluxo_ligar',
  {
    ...metaDaFerramenta('fluxo_ligar'),
    inputSchema: { nome: nomeDoFluxo, espaco: espacoDoFluxo }
  },
  ({ nome, espaco: ondeEspaco }) => rodarFluxo(['ligar', nome], {}, ondeEspaco)
)

servidor.registerTool(
  'fluxo_desligar',
  {
    ...metaDaFerramenta('fluxo_desligar'),
    inputSchema: { nome: nomeDoFluxo, espaco: espacoDoFluxo }
  },
  ({ nome, espaco: ondeEspaco }) => rodarFluxo(['desligar', nome], {}, ondeEspaco)
)

servidor.registerTool(
  'fluxo_rodar',
  {
    ...metaDaFerramenta('fluxo_rodar'),
    inputSchema: { nome: nomeDoFluxo, espaco: espacoDoFluxo }
  },
  ({ nome, espaco: ondeEspaco }) => rodarFluxo(['rodar', nome], {}, ondeEspaco)
)

servidor.registerTool(
  'fluxo_execucoes',
  {
    ...metaDaFerramenta('fluxo_execucoes'),
    inputSchema: { nome: nomeDoFluxo, n: z.number().int().min(1).max(50).optional().describe('Quantas, das mais novas. Padrão 10.'), espaco: espacoDoFluxo }
  },
  ({ nome, n, espaco: ondeEspaco }) => rodarFluxo(['execucoes', nome], { n: n === undefined ? undefined : String(n) }, ondeEspaco)
)

servidor.registerTool(
  'fluxo_apagar',
  {
    ...metaDaFerramenta('fluxo_apagar'),
    inputSchema: { nome: nomeDoFluxo, confirmar: z.literal(true).describe('Precisa ser true: o fluxo e as execuções dele somem para sempre.'), espaco: espacoDoFluxo }
  },
  ({ nome, espaco: ondeEspaco }) => rodarFluxo(['apagar', nome], { confirmar: true }, ondeEspaco)
)

// sem `await` no topo: o bundler do principal pode gerar CommonJS, onde isso não existe
servidor.connect(new StdioServerTransport()).catch((erro: unknown) => {
  console.error('orkester-mcp: não consegui abrir a conversa com o cliente', erro)
  process.exit(1)
})
