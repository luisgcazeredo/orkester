/**
 * Preload das páginas "+" (1.9.5): expõe só `window.orkPagina`. Nada fica guardado aqui além dos ouvintes de evento;
 * cada chamada vai ao main por `pagina:chamar`, que confere chave geral, página, permissão, tamanho e taxa. Antes de
 * enviar, o tamanho e o tipo já são conferidos aqui, e no máximo 8 chamadas esperam resposta ao mesmo tempo: o que
 * passa disso é recusado sem cruzar o IPC (revisão 195, item 2).
 *
 * **Roda em todo frame da página** (o main liga `nodeIntegrationInSubFrames` só para isto; com o sandbox não há Node
 * em frame nenhum). A primeira coisa, em cada frame, é tirar o WebRTC do mundo da página (`desligarWebRtc`), antes de
 * qualquer script dela. O iframe `about:blank`, onde o Electron não roda preload, a CSP `sandbox` deixa de outra
 * origem: a página não alcança o global dele. O `orkPagina` e os ouvintes só existem no frame principal.
 *
 * Só um import de valor, `conferirDaPagina` (puro, só deste preload, vai embutido): o preload roda em sandbox (só
 * `require('electron')`), e um módulo dividido com o preload da janela viraria um pedaço compartilhado que o sandbox
 * não carrega.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { ApiOrkPagina, CANAIS_ORK_PAGINA, EventosDaPagina, METODOS_API_MCP_DA_PAGINA } from '../shared/api'
import { TETOS_NO_PRELOAD, conferirAntesDeEnviar, desligarWebRtc } from './conferirDaPagina'

try {
  contextBridge.executeInMainWorld({ func: desligarWebRtc })
} catch {
  // sem o mundo da página (frame já fechando): não há o que desligar; a política do guest (sem UDP) segue valendo
}

// o tipo amarra estes textos aos de shared/api.ts: mudou lá, não compila aqui
const C: typeof CANAIS_ORK_PAGINA = { chamar: 'pagina:chamar', ouvir: 'pagina:ouvir', evento: 'pagina:evento' }
// (1.9.7) idem para os métodos de api e mcp (o preload só importa tipos de shared/api.ts: roda em sandbox)
const M: typeof METODOS_API_MCP_DA_PAGINA = {
  apiDisponiveis: 'api-disponiveis',
  mcpDisponiveis: 'mcp-disponiveis',
  apiPedir: 'api-pedir',
  mcpFerramentas: 'mcp-ferramentas',
  mcpChamar: 'mcp-chamar'
}
const EVENTOS: ReadonlyArray<keyof EventosDaPagina> = ['recado', 'quadro', 'tema']

let emVoo = 0

async function chamar<T>(metodo: string, ...args: unknown[]): Promise<T> {
  const conferido = conferirAntesDeEnviar(metodo, args)
  if (!conferido.ok) throw new Error(conferido.erro)
  if (emVoo >= TETOS_NO_PRELOAD.emVoo) throw new Error('chamadas demais esperando resposta: espere as anteriores')
  emVoo++
  try {
    const r = (await ipcRenderer.invoke(C.chamar, metodo, ...conferido.args)) as { ok?: boolean; valor?: unknown; erro?: unknown } | null
    if (!r || r.ok !== true) throw new Error(typeof r?.erro === 'string' ? r.erro : 'a chamada falhou')
    return r.valor as T
  } finally {
    emVoo--
  }
}

const ouvintes = new Map<string, Set<(dados: unknown) => void>>()
/** O guest da página é o topo da árvore dele: subframe (iframe da página) não ganha API nem ouvinte. */
const framePrincipal = window.top === window

if (framePrincipal) ipcRenderer.on(C.evento, (_evento, tipo: unknown, dados: unknown) => {
  for (const fn of ouvintes.get(String(tipo)) ?? []) {
    try {
      fn(dados)
    } catch {
      // erro do ouvinte da página não derruba os outros
    }
  }
})

const api: ApiOrkPagina = {
  eu: () => chamar('eu'),
  quadro: { resumo: () => chamar('quadro') },
  agentes: () => chamar('agentes'),
  recado: (agenteId, texto) => chamar('recado', agenteId, texto),
  dados: {
    ler: (chave) => chamar('dados-ler', chave),
    gravar: (chave, valor) => chamar('dados-gravar', chave, valor),
    apagar: (chave) => chamar('dados-apagar', chave),
    chaves: () => chamar('dados-chaves')
  },
  local: { ler: (caminho) => chamar('local-ler', caminho) },
  api: {
    disponiveis: () => chamar(M.apiDisponiveis),
    pedir: (nome, pedido) => chamar(M.apiPedir, nome, pedido)
  },
  mcp: {
    disponiveis: () => chamar(M.mcpDisponiveis),
    ferramentas: (nome) => chamar(M.mcpFerramentas, nome),
    chamar: (nome, ferramenta, argumentos) => chamar(M.mcpChamar, nome, ferramenta, argumentos)
  },
  ao(evento, fn) {
    if (!EVENTOS.includes(evento) || typeof fn !== 'function') throw new Error('evento desconhecido: use "recado", "quadro" ou "tema"')
    let lista = ouvintes.get(evento)
    if (!lista) {
      lista = new Set()
      ouvintes.set(evento, lista)
      ipcRenderer.send(C.ouvir, evento, true)
    }
    const ouvinte = fn as (dados: unknown) => void
    lista.add(ouvinte)
    return () => {
      const atual = ouvintes.get(evento)
      if (!atual?.delete(ouvinte) || atual.size) return
      ouvintes.delete(evento)
      ipcRenderer.send(C.ouvir, evento, false)
    }
  }
}

if (framePrincipal) contextBridge.exposeInMainWorld('orkPagina', api)
