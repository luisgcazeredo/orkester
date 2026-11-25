// Servidor MCP de teste (1.9.7, C1): o "servidor de fora" das provas e do autoteste (cenário mcp-fora). Não vai no
// pacote do app. Ferramentas:
// - `eco`  (anotada: só lê)            → devolve o texto (`vezes` repete, `esperarMs` demora, `imagem` junta um bloco
//                                         de imagem, `estruturado` devolve também `{ texto }`);
// - `soma` (anotada: só lê, idempotente, com esquema de saída) → `{ resultado }` estruturado;
// - `muda` (sem anotação)              → troca a própria descrição e avisa `tools/list_changed` (a impressão muda).
//
// Rodado direto, fala por stdio. Opções de linha de comando (só para as provas):
//   --anotar-ambiente <arquivo>  grava os NOMES das variáveis de ambiente que recebeu (nunca os valores)
//   --com-neto <arquivo>         abre um processo neto (um `node` parado) e grava `{ pid, neto }` no arquivo
//   --cair                       sai antes de responder (subida que falha)
//   --cair-depois-ms <n>         sobe e morre sozinho depois de n ms
//   --lento-ms <n>               demora n ms antes de começar a responder (subida lenta)
//   --descricao-da-muda <t>      a descrição inicial da `muda`
//   --variavel-no-eco <NOME>     o `eco` junta ao texto o valor da variável de ambiente NOME (prova do segredo)
//   --muda-em-silencio           a `muda` troca a descrição SEM avisar `tools/list_changed` (Revisão C, achado 3)
//   --lista-falha-depois <n>     depois de n listas, `tools/list` responde erro (relistar antes de chamar falha)
// Importado, exporta `criarServidor()` para a prova do HTTP (o transporte fica com quem importa).
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/** Um servidor MCP de baixo nível (esquemas JSON escritos à mão, sem zod). */
export function criarServidor({ descricaoDaMuda = 'muda a própria descrição', variavelNoEco, mudaEmSilencio = false, listaFalhaDepois } = {}) {
  let descricao = descricaoDaMuda
  let listas = 0
  const servidor = new Server({ name: 'servidor-de-teste', version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } })

  const ferramentas = () => [
    {
      name: 'eco',
      description: 'devolve o texto',
      inputSchema: {
        type: 'object',
        properties: {
          texto: { type: 'string' },
          vezes: { type: 'number' },
          esperarMs: { type: 'number' },
          imagem: { type: 'boolean' },
          estruturado: { type: 'boolean' }
        },
        required: ['texto']
      },
      annotations: { readOnlyHint: true }
    },
    {
      name: 'soma',
      description: 'soma a e b',
      inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
      outputSchema: { type: 'object', properties: { resultado: { type: 'number' } }, required: ['resultado'] },
      annotations: { readOnlyHint: true, idempotentHint: true, title: 'Soma' }
    },
    { name: 'muda', description: descricao, inputSchema: { type: 'object', properties: {} } }
  ]

  servidor.setRequestHandler(ListToolsRequestSchema, async () => {
    listas++
    if (listaFalhaDepois !== undefined && listas > listaFalhaDepois) throw new Error('a lista de ferramentas falhou (teste)')
    return { tools: ferramentas() }
  })
  servidor.setRequestHandler(CallToolRequestSchema, async (pedido) => {
    const { name, arguments: a = {} } = pedido.params
    if (name === 'eco') {
      if (a.esperarMs) await new Promise((r) => setTimeout(r, Number(a.esperarMs)))
      const texto = String(a.texto ?? '').repeat(Math.max(1, Number(a.vezes) || 1)) + (variavelNoEco ? (process.env[variavelNoEco] ?? '') : '')
      const content = [{ type: 'text', text: texto }]
      if (a.imagem) content.push({ type: 'image', data: PIXEL, mimeType: 'image/png' })
      return a.estruturado ? { content, structuredContent: { texto } } : { content }
    }
    if (name === 'soma') {
      const resultado = Number(a.a) + Number(a.b)
      return { content: [{ type: 'text', text: String(resultado) }], structuredContent: { resultado } }
    }
    if (name === 'muda') {
      descricao = `${descricao} (mudou)`
      if (!mudaEmSilencio) await servidor.sendToolListChanged()
      return { content: [{ type: 'text', text: 'mudei' }] }
    }
    return { content: [{ type: 'text', text: `não conheço ${name}` }], isError: true }
  })
  return servidor
}

function opcao(nome) {
  const i = process.argv.indexOf(nome)
  return i < 0 ? undefined : (process.argv[i + 1] ?? '')
}

async function principal() {
  const ambiente = opcao('--anotar-ambiente')
  if (ambiente) writeFileSync(ambiente, JSON.stringify(Object.keys(process.env).sort()))
  if (process.argv.includes('--cair')) process.exit(3)
  const arquivoDoNeto = opcao('--com-neto')
  if (arquivoDoNeto) {
    const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true })
    writeFileSync(arquivoDoNeto, JSON.stringify({ pid: process.pid, neto: neto.pid }))
  }
  const lento = Number(opcao('--lento-ms') ?? 0)
  if (lento) await new Promise((r) => setTimeout(r, lento))
  const cairDepois = Number(opcao('--cair-depois-ms') ?? 0)
  if (cairDepois) setTimeout(() => process.exit(4), cairDepois)
  const falha = opcao('--lista-falha-depois')
  await criarServidor({
    descricaoDaMuda: opcao('--descricao-da-muda'),
    variavelNoEco: opcao('--variavel-no-eco'),
    mudaEmSilencio: process.argv.includes('--muda-em-silencio'),
    listaFalhaDepois: falha === undefined ? undefined : Number(falha)
  }).connect(new StdioServerTransport())
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal()
