import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PASTA_DADOS } from '../dados'
import { Cenario, Estado } from './util'

export const orkMcp = (_e: Estado): Cenario[] => [
    {
      // A chave e o MCP (1.3): um cliente de fora mexendo no quadro sem ter cartão nele. O caminho inteiro, de
      // verdade: a chave nasce pela janela, o app publica o endereço do cano, o mcp.js do build sobe como
      // processo filho e fala o protocolo MCP, e o que ele faz chega no quadro como se fosse o usuário — sem
      // dono e sem corda. E a chave revogada é recusada na hora, não na próxima vez que o app abrir.
      nome: 'ork-mcp',
      depende: 'ork',
      rodar: async (d) => {
        const { esperar, js, conferir } = d

    const nomeDoEspaco = await js<string>('window.__teste.loja.lerEstado().espaco.nome')
    const criada = await js<{ segredo?: string; erro?: string }>("window.ork.chaves.criar('Autoteste MCP')")
    conferir('a chave nasce pela janela e o segredo volta uma vez', !!criada.segredo && /^ork_[0-9a-f]{64}$/.test(criada.segredo), criada.erro ?? 'ok')

    let cano: { pipe?: string; pid?: number } = {}
    try {
      cano = JSON.parse(readFileSync(join(PASTA_DADOS, 'cano.json'), 'utf8'))
    } catch {
      // cai na conferência abaixo
    }
    conferir('o app publica o endereço do cano enquanto vive', cano.pid === process.pid && typeof cano.pipe === 'string', JSON.stringify(cano).slice(0, 80))

    // o mcp.js do build, rodando como o cliente o rodaria: processo separado, só com a chave e a pasta de dados
    const ambiente: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ORK_DADOS: PASTA_DADOS, ORK_CHAVE: criada.segredo ?? '' }
    const filho = spawn(process.execPath, [join(app.getAppPath(), 'out', 'main', 'mcp.js')], { env: ambiente, stdio: ['pipe', 'pipe', 'pipe'] })
    let recebido = ''
    filho.stdout.setEncoding('utf8')
    filho.stdout.on('data', (parte: string) => (recebido += parte))
    let proximoId = 1
    const chamarMcp = async (metodo: string, params: unknown, ms = 20_000): Promise<{ result?: any; error?: any }> => {
      const id = proximoId++
      filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: metodo, params })}\n`)
      for (const limite = Date.now() + ms; Date.now() < limite; await esperar(100)) {
        const achada = recebido
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            try {
              return JSON.parse(l)
            } catch {
              return null
            }
          })
          .find((m) => m?.id === id)
        if (achada) return achada
      }
      return { error: { message: `sem resposta para ${metodo}` } }
    }
    const ferramenta = async (nome: string, args: Record<string, unknown>): Promise<{ erro: boolean; texto: string }> => {
      const r = await chamarMcp('tools/call', { name: nome, arguments: args })
      return { erro: !!r.result?.isError || !!r.error, texto: r.result?.content?.[0]?.text ?? r.error?.message ?? '' }
    }

    try {
      const init = await chamarMcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'autoteste', version: '0' } })
      filho.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
      const lista = await chamarMcp('tools/list', {})
      const nomes: string[] = (lista.result?.tools ?? []).map((t: { name: string }) => t.name)
      conferir(
        'o servidor MCP do build sobe, faz o aperto de mão e lista as ferramentas',
        init.result?.serverInfo?.name === 'orkester' && ['quadro', 'abrir_cartao', 'subir_partitura', 'importar_catalogo'].every((n) => nomes.includes(n)),
        nomes.join(', ') || JSON.stringify(init.error ?? lista.error)
      )

      const quadro = await ferramenta('quadro', { espaco: nomeDoEspaco })
      conferir('pela chave, o cliente lê o quadro', !quadro.erro && quadro.texto.includes(nomeDoEspaco), quadro.texto.split('\n').slice(0, 2).join(' | '))

      const abriu = await ferramenta('abrir_cartao', { agente: 'shell', nome: 'Pelo MCP', espaco: nomeDoEspaco })
      await esperar(800)
      const cartao = await js<{ criadoPor: string | null; cordas: number } | null>(`(() => {
        const p = window.__teste.loja.planoAtual()
        const n = p.nos.find((x) => x.tipo === 'terminal' && x.nome === 'Pelo MCP'); if (!n) return null
        return { criadoPor: n.criadoPor ?? null, cordas: p.cordas.filter((c) => c.de === n.id || c.para === n.id).length } })()`)
      conferir(
        'abrir pela chave: o cartão nasce do usuário, sem dono e sem corda',
        !abriu.erro && !!cartao && cartao.criadoPor === null && cartao.cordas === 0,
        `${abriu.texto} · ${cartao ? `dono:${cartao.criadoPor ?? 'nenhum'} · cordas:${cartao.cordas}` : 'o cartão não apareceu'}`
      )

      // o usuário enxerga qualquer cartão: a corda é permissão entre agentes, não entre ele e o quadro dele
      let viu = { erro: true, texto: '' }
      for (let tentativa = 0; tentativa < 8 && viu.erro; tentativa++) {
        viu = await ferramenta('ver_cartao', { cartao: 'Pelo MCP', espaco: nomeDoEspaco })
        if (viu.erro) await esperar(1000)
      }
      conferir('ver_cartao lê a tela de um cartão sem corda nenhuma com ele', !viu.erro && viu.texto.includes('"Pelo MCP"'), viu.texto.split('\n')[0])

      // o caso de uso que motivou isto: "me manda as fichas e eu monto" — importar e subir, de fora
      // fora da pasta vigiada, pelo mesmo motivo do cenário do catálogo
      const fichas = join(tmpdir(), `orkester-autoteste-fichas-mcp-${process.pid}`)
      mkdirSync(fichas, { recursive: true })
      writeFileSync(join(fichas, 'vigia.md'), '---\nnome: Vigia do MCP\nmotor: Shell\nnivel: forte\n---\nFique de olho.\n')
      const importou = await ferramenta('importar_catalogo', { pasta: fichas, espaco: nomeDoEspaco })
      const funcao = await js<boolean>("(window.__teste.loja.lerEstado().preferencias.funcoes ?? []).some((f) => f.nome === 'Vigia do MCP')")
      conferir('importar_catalogo pela chave transforma a ficha em função', !importou.erro && funcao, importou.texto.split('\n')[0])

      await js(`(() => { const L = window.__teste.loja
        const n = L.planoAtual().nos.find((x) => x.tipo === 'terminal' && x.nome === 'Pelo MCP')
        if (n) L.salvarPartitura('Dupla do MCP', [n.id]) })()`)
      const subiu = await ferramenta('subir_partitura', { nome: 'Dupla do MCP', espaco: nomeDoEspaco })
      await esperar(800)
      const time = await js<Array<{ nome: string; dono: string | null }>>(`(() => window.__teste.loja.planoAtual().nos
        .filter((x) => x.tipo === 'terminal' && x.nome.startsWith('Pelo MCP'))
        .map((x) => ({ nome: x.nome, dono: x.criadoPor ?? null })))()`)
      conferir(
        'subir_partitura pela chave: o time sobe do usuário, sem dono',
        !subiu.erro && time.length === 2 && time.every((t) => t.dono === null),
        `${subiu.texto.split('\n')[0]} · ${time.map((t) => `${t.nome}:${t.dono ?? 'sem dono'}`).join(', ')}`
      )
      const inventada = await ferramenta('subir_partitura', { nome: 'Fanfarra', espaco: nomeDoEspaco })
      conferir('partitura que não existe é recusada dizendo quais existem', inventada.erro && /Dupla do MCP/.test(inventada.texto), inventada.texto)

      await js(`(async () => {
        const k = (await window.ork.chaves.listar()).find((x) => x.nome === 'Autoteste MCP')
        if (k) await window.ork.chaves.revogar(k.id) })()`)
      const depois = await ferramenta('quadro', { espaco: nomeDoEspaco })
      conferir('a chave revogada é recusada na hora', depois.erro && /revogada|inválida/.test(depois.texto), depois.texto)

      const usos = await js<{ usada: boolean; revogada: boolean } | null>(`(async () => {
        const k = (await window.ork.chaves.listar()).find((x) => x.nome === 'Autoteste MCP')
        return k ? { usada: !!k.usadaEm, revogada: !!k.revogadaEm } : null })()`)
      conferir('o cofre registra o uso e guarda a revogada (não apaga o rastro)', !!usos?.usada && !!usos?.revogada, JSON.stringify(usos))
    } finally {
      filho.kill()
      // o quadro e as preferências voltam ao que eram: os cartões, a partitura e a função deste cenário saem
      await js(`(() => { const L = window.__teste.loja
        for (const n of L.planoAtual().nos.filter((x) => x.tipo === 'terminal' && x.nome.startsWith('Pelo MCP'))) L.apagar({ tipo: 'no', id: n.id })
        const p = L.lerEstado().preferencias
        L.definirPartituras((p.partituras ?? []).filter((x) => x.nome !== 'Dupla do MCP'))
        L.definirFuncoes((p.funcoes ?? []).filter((f) => f.nome !== 'Vigia do MCP')) })()`)
      await esperar(300)
    }
      }
    },
]
