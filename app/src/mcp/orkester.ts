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
    throw new Error('falta a chave: ponha ORK_CHAVE na configuração deste servidor (gere uma em Configurações, no Orkester)')
  }
  return k
}

/** Um pedido pelo cano, no mesmo formato do `ork`, com chave no lugar do crachá. */
function pedir(comando: string, posicionais: string[] = [], opcoes: Record<string, string | number | true> = {}): Promise<string> {
  return new Promise((resolver, recusar) => {
    let conexao: ReturnType<typeof connect>
    try {
      conexao = connect(enderecoDoCano())
    } catch (erro) {
      return recusar(erro instanceof Error ? erro : new Error(String(erro)))
    }
    let recebido = ''
    const desistir = setTimeout(() => {
      conexao.destroy()
      recusar(new Error('o Orkester não respondeu em 30 s'))
    }, PRAZO)
    conexao.setEncoding('utf8')
    conexao.on('connect', () => conexao.write(`${JSON.stringify({ chave: chave(), comando, posicionais, opcoes })}\n`))
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
    title: 'Listar espaços',
    description: 'Os espaços do Orkester, com quantos cartões cada um tem e se está aberto numa janela.',
    inputSchema: {}
  },
  () => rodar('espacos')
)

servidor.registerTool(
  'quadro',
  {
    title: 'Ler o quadro',
    description: 'O que há no andar à mostra: os cartões numerados, com o lugar e a situação de cada um.',
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('quadro', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'funcoes',
  {
    title: 'Listar funções',
    description: 'Os papéis guardados, que o abrir_cartao usa pelo nome.',
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('funcoes', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'ver_cartao',
  {
    title: 'Ler a tela de um cartão',
    description: 'O que está na tela de um agente agora, e se ele está livre, trabalhando ou numa pergunta.',
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
    title: 'Abrir um agente no quadro',
    description:
      'Abre uma sessão nova. Com `funcao`, o motor, o modelo e o esforço saem do papel; sem ela, diga o agente. `modelo`/`esforco` mandam sobre o papel. O cartão nasce solto: sem dono e sem corda, como os que o usuário cria pela tela.',
    inputSchema: {
      agente: z.enum(['claude', 'codex', 'shell']).optional().describe('Só é necessário sem `funcao`.'),
      funcao: z.string().optional().describe('Nome de um papel guardado (veja a ferramenta funcoes).'),
      preset: z.string().optional().describe('Força um preset pelo nome, por exemplo "Claude Code".'),
      nome: z.string().optional().describe('Nome do cartão. Sem isto, vale o nome do papel.'),
      pasta: z.string().optional().describe('Pasta do agente, relativa à do espaço. Sem isto, vale a do espaço ou a do papel.'),
      modelo: z.string().optional().describe('Modelo (veja a ferramenta modelos), por exemplo "opus" ou "sonnet". Fora da lista abre com aviso.'),
      esforco: z.enum(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']).optional().describe('Esforço de raciocínio. O Claude vai de low a max; ultra é só do Codex.'),
      espaco
    }
  },
  ({ agente, funcao, preset, nome, pasta, modelo, esforco, espaco: ondeEspaco }) =>
    rodar('abrir', agente ? [agente] : [], {
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
    title: 'Listar modelos',
    description: 'Os modelos de Claude e Codex, os esforços que cada um aceita e os padrões. Use os ids em abrir_cartao.',
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('modelos', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'trocar_modelo',
  {
    title: 'Trocar o modelo de um cartão',
    description:
      'Troca o modelo e/ou o esforço de um agente que está livre: o cartão reabre e a conversa continua. Com ele ocupado, recusa. Veja os nomes na ferramenta modelos.',
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
    title: 'Listar times salvos',
    description: 'As partituras guardadas, com quantos agentes, que funções e quantas cordas cada uma tem.',
    inputSchema: { espaco }
  },
  ({ espaco: nome }) => rodar('partitura', [], nome ? { espaco: nome } : {})
)

servidor.registerTool(
  'subir_partitura',
  {
    title: 'Subir um time salvo',
    description: 'Sobe uma partitura no andar à mostra. O time nasce do usuário: sem dono e sem corda para fora.',
    inputSchema: { nome: z.string().describe('Nome da partitura.'), espaco }
  },
  ({ nome, espaco: ondeEspaco }) => rodar('partitura', ['usar', nome], ondeEspaco ? { espaco: ondeEspaco } : {})
)

servidor.registerTool(
  'importar_catalogo',
  {
    title: 'Importar fichas de time',
    description:
      'Lê as fichas .md de uma pasta (cabeçalho com nome, motor, nível, pasta) e as transforma em funções. Atualiza pelo nome em vez de duplicar, e não apaga nada.',
    inputSchema: { pasta: z.string().describe('Pasta das fichas, relativa à do espaço.'), espaco }
  },
  ({ pasta, espaco: ondeEspaco }) => rodar('catalogo', ['importar', pasta], ondeEspaco ? { espaco: ondeEspaco } : {})
)

// sem `await` no topo: o bundler do principal pode gerar CommonJS, onde isso não existe
servidor.connect(new StdioServerTransport()).catch((erro: unknown) => {
  console.error('orkester-mcp: não consegui abrir a conversa com o cliente', erro)
  process.exit(1)
})
