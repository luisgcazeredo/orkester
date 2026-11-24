// Fluxos (1.9.6): o nó Código (plano §4). Cada execução roda numa BrowserWindow NOVA, escondida e destruída no fim:
//
// - `webPreferences`: sandbox, contextIsolation, sem nodeIntegration, SEM PRELOAD (não alcança o `ipcRenderer`), sem
//   devTools, sem diálogos, partição `fluxo-codigo` (sem `persist:`). O id do webContents vai para `recusarRemetente`
//   (main/ipcSeguro.ts): mesmo que algo chegasse ao IPC, nenhum canal do `ipcMain` atende;
// - a sessão passa pela receita das páginas "+" (`endurecerSessao`, main/sandbox.ts) e o `webRequest` cancela tudo o que
//   não for `ork-codigo://<execId>/` pedido pelo próprio webContents daquela execução. WebRTC: política sem UDP;
// - o esquema `ork-codigo` (só nesta sessão) serve `index.html` (CSP `default-src 'none'; script-src ork-codigo:;
//   connect-src ork-codigo:`), `inicio.js` (o invólucro), `codigo.js` (o código do usuário como ARQUIVO: sem eval, sem
//   inline) e `entrada.json`, e recebe `POST saida`. Toda resposta leva a CSP (um Worker herdaria a do script dele);
// - o invólucro troca fetch, XMLHttpRequest, WebSocket, RTCPeerConnection, require… por funções que lançam um erro claro
//   (a trava de verdade é a CSP + o webRequest; isto é só para a mensagem);
// - limites: 5 s (depois `forcefullyCrashRenderer` + `destroy`), memória do processo lida em `app.getAppMetrics()` a
//   cada 200 ms (acima de 256 MB, derruba), saída conferida no main (JSON, lista, até 1000 itens e 5 MB), entrada até
//   5 MB, no máximo 2 Códigos ao mesmo tempo.
//
// API para o usuário: `$input.all()/first()/last()`, `itens`, `$('Nome').all()/first()/last()` (só nós que rodaram no
// caminho até aqui), `console.log` (vai para o `log`), `return` da lista e `throw` (vira erro com a mensagem).
//
// Sem import do Electron em tempo de execução: `BrowserWindow`, `session` e `app` vêm de quem cria a ação (o index),
// para a prova rodar no Node com um Electron de mentira.
import { randomUUID } from 'node:crypto'
import { Script } from 'node:vm'
import type { App, BrowserWindow as JanelaDoElectron, BrowserWindowConstructorOptions, CustomScheme, Session, WebContents } from 'electron'
import type { AcoesDoFluxo } from '../../shared/fluxos/executor'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_BYTES_DA_LISTA, MAX_BYTES_DE_LOG, MAX_ITENS, MAX_LINHAS_DE_LOG } from '../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { endurecerSessao } from '../sandbox.ts'
// @ts-expect-error idem
import { liberarRemetente, recusarRemetente } from '../ipcSeguro.ts'

export const ESQUEMA_DO_CODIGO = 'ork-codigo'
export const PARTICAO_DO_CODIGO = 'fluxo-codigo'
/** Vai na lista ÚNICA de `protocol.registerSchemesAsPrivileged` (main/area.ts, `registrarEsquemas`), antes do ready. */
export const ESQUEMA_PRIVILEGIADO_DO_CODIGO: CustomScheme = {
  scheme: ESQUEMA_DO_CODIGO,
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}
export const PRAZO_DO_CODIGO = 5000
export const MEMORIA_MAXIMA_MB = 256
export const INTERVALO_DA_MEMORIA = 200
export const MAX_ENTRADA = MAX_BYTES_DA_LISTA
export const MAX_CODIGOS_AO_MESMO_TEMPO = 2
/** Folga do `POST saida` sobre os 5 MB dos itens (o log e o envelope). */
const MAX_POST = MAX_BYTES_DA_LISTA + 64 * 1024

export const CSP_DO_CODIGO = "default-src 'none'; script-src ork-codigo:; connect-src ork-codigo:; base-uri 'none'; form-action 'none'"

// ---------------------------------------------------------------- o que a janela recebe

/**
 * O invólucro. Roda antes do código do usuário: guarda o `fetch` só para si (entrada e saída), tira a rede do resto,
 * junta o `console.log` (50 linhas, 2 KB) e chama o código com `$input`, `$`, `itens` e `console`. Uma saída só.
 */
export const INVOLUCRO = `'use strict';
(() => {
  const BASE = 'ork-codigo://' + location.host + '/';
  const buscar = window.fetch.bind(window);
  const paraTexto = JSON.stringify, deTexto = JSON.parse;
  const linhas = [];
  let bytes = 0;
  const emTexto = (v) => {
    if (typeof v === 'string') return v;
    try { const t = paraTexto(v); return t === undefined ? String(v) : t; } catch (e) { return String(v); }
  };
  const registrar = (...a) => {
    if (linhas.length >= ${MAX_LINHAS_DE_LOG} || bytes >= ${MAX_BYTES_DE_LOG}) return;
    let t = a.map(emTexto).join(' ');
    if (t.length > ${MAX_BYTES_DE_LOG} - bytes) t = t.slice(0, ${MAX_BYTES_DE_LOG} - bytes);
    linhas.push(t);
    bytes += t.length;
  };
  const consoleDoCodigo = Object.freeze({ log: registrar, info: registrar, warn: registrar, error: registrar, debug: registrar });
  const proibido = (nome) => function () {
    throw new Error(nome + ' não existe no nó Código: ele não tem rede, disco nem ork (para a internet, use o nó HTTP)');
  };
  for (const nome of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource',
    'RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate',
    'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts', 'require', 'open', 'alert', 'confirm', 'prompt', 'print']) {
    try { Object.defineProperty(window, nome, { value: proibido(nome), writable: false, configurable: false }); } catch (e) {}
  }
  try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { value: proibido('sendBeacon'), writable: false, configurable: false }); } catch (e) {}
  let enviado = false;
  const enviar = async (corpo) => {
    if (enviado) return;
    enviado = true;
    let texto;
    try { texto = paraTexto(corpo); } catch (e) {
      texto = paraTexto({ ok: false, erro: 'a saída do Código não é JSON simples (' + (e && e.message) + ')', log: linhas });
    }
    await buscar(BASE + 'saida', { method: 'POST', body: texto });
  };
  const copia = (v) => (v === undefined ? undefined : deTexto(paraTexto(v)));
  const leitor = (lista) => Object.freeze({
    all: () => copia(lista),
    first: () => copia(lista[0]),
    last: () => copia(lista[lista.length - 1])
  });
  window.addEventListener('error', (ev) => { enviar({ ok: false, erro: String(ev.message || 'erro no Código'), log: linhas }); });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    enviar({ ok: false, erro: String(r && r.message !== undefined ? r.message : r), log: linhas });
  });
  const rodar = async (codigo) => {
    try {
      const entrada = await (await buscar(BASE + 'entrada.json')).json();
      const anteriores = entrada.anteriores;
      const $ = (nome) => {
        if (typeof nome !== 'string' || !Object.prototype.hasOwnProperty.call(anteriores, nome)) {
          throw new Error('o nó "' + nome + '" não rodou antes deste no caminho');
        }
        return leitor(anteriores[nome]);
      };
      const saida = await codigo(leitor(entrada.itens), $, copia(entrada.itens), consoleDoCodigo);
      await enviar({ ok: true, itens: saida === undefined ? null : saida, log: linhas });
    } catch (e) {
      await enviar({ ok: false, erro: String(e && e.message !== undefined ? e.message : e), log: linhas });
    }
  };
  Object.defineProperty(window, '__orkCodigo', { value: Object.freeze({ rodar }), writable: false, configurable: false });
})();
`

const PARAMETROS = '$input, $, itens, console'

/** O `codigo.js`: o código do usuário dentro de uma função assíncrona (dá para usar `await` e `return`). */
export const arquivoDoCodigo = (codigo: string): string => `window.__orkCodigo.rodar(async function (${PARAMETROS}) {\n${codigo}\n});\n`

const INDEX = '<!doctype html><meta charset="utf-8"><title>Código</title><script src="inicio.js"></script><script src="codigo.js"></script>\n'

/** Confere a sintaxe no main, antes de abrir janela: o erro volta com a linha do código do usuário. */
export function erroDeSintaxe(codigo: string): string | null {
  try {
    new Script(`(async function (${PARAMETROS}) {\n${codigo}\n})`, { filename: 'codigo.js' })
    return null
  } catch (e) {
    const linha = /codigo\.js:(\d+)/.exec(e instanceof Error ? (e.stack ?? '') : '')?.[1]
    const onde = linha && Number(linha) > 1 ? ` (linha ${Number(linha) - 1})` : ''
    return `erro de sintaxe no Código${onde}: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ---------------------------------------------------------------- as execuções e o esquema

export interface ExecucaoDoCodigo {
  arquivos: Map<string, { corpo: string; tipo: string }>
  /** O webContents da janela desta execução (o único que pode pedir `ork-codigo://<execId>/`). */
  webContentsId?: number
  /** Chamado uma vez com o texto do `POST saida` (ou null, se passou do teto). */
  aoReceber: (texto: string | null) => void
  recebeu?: true
}

export function criarExecucao(codigo: string, entrada: string, aoReceber: ExecucaoDoCodigo['aoReceber']): ExecucaoDoCodigo {
  return {
    arquivos: new Map([
      ['/index.html', { corpo: INDEX, tipo: 'text/html; charset=utf-8' }],
      ['/inicio.js', { corpo: INVOLUCRO, tipo: 'text/javascript; charset=utf-8' }],
      ['/codigo.js', { corpo: arquivoDoCodigo(codigo), tipo: 'text/javascript; charset=utf-8' }],
      ['/entrada.json', { corpo: entrada, tipo: 'application/json' }]
    ]),
    aoReceber
  }
}

/** O `webRequest` deixa passar? Só `ork-codigo://<execId>/…` de uma execução viva, pedido pelo webContents dela. */
export function pedidoPermitido(url: string, webContentsId: number | undefined, execucoes: ReadonlyMap<string, ExecucaoDoCodigo>): boolean {
  let alvo: URL
  try {
    alvo = new URL(url)
  } catch {
    return false
  }
  if (alvo.protocol !== `${ESQUEMA_DO_CODIGO}:`) return false
  const exec = execucoes.get(alvo.hostname)
  return !!exec && webContentsId !== undefined && exec.webContentsId === webContentsId
}

const cabecalhos = (tipo: string): Record<string, string> => ({
  'content-type': tipo,
  'content-security-policy': CSP_DO_CODIGO,
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store'
})

async function lerComTeto(pedido: Request, teto: number): Promise<string | null> {
  if (!pedido.body) return ''
  const leitor = pedido.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.byteLength
    if (total > teto) {
      await leitor.cancel().catch(() => {})
      return null
    }
    partes.push(value)
  }
  return Buffer.concat(partes).toString('utf8')
}

/** O `protocol.handle('ork-codigo')` da sessão do Código. */
export async function servirCodigo(pedido: Request, execucoes: ReadonlyMap<string, ExecucaoDoCodigo>): Promise<Response> {
  let url: URL
  try {
    url = new URL(pedido.url)
  } catch {
    return new Response(null, { status: 400, headers: cabecalhos('text/plain') })
  }
  const exec = execucoes.get(url.hostname)
  if (!exec) return new Response('não', { status: 404, headers: cabecalhos('text/plain') })
  if (url.pathname === '/saida') {
    if (pedido.method !== 'POST') return new Response(null, { status: 405, headers: cabecalhos('text/plain') })
    const texto = await lerComTeto(pedido, MAX_POST)
    if (!exec.recebeu) {
      exec.recebeu = true
      exec.aoReceber(texto)
    }
    return new Response(null, { status: 204, headers: cabecalhos('text/plain') })
  }
  if (pedido.method !== 'GET') return new Response(null, { status: 405, headers: cabecalhos('text/plain') })
  const arquivo = exec.arquivos.get(url.pathname)
  if (!arquivo) return new Response('não', { status: 404, headers: cabecalhos('text/plain') })
  return new Response(arquivo.corpo, { status: 200, headers: cabecalhos(arquivo.tipo) })
}

/** O que a janela mandou, conferido: `{ itens, log }` ou o erro (do usuário ou da saída). */
export function lerSaida(texto: string | null): { itens: unknown[]; log: string[] } | { erro: string } {
  if (texto === null) return { erro: `a saída do Código passa de ${Math.round(MAX_BYTES_DA_LISTA / 1024 / 1024)} MB` }
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { erro: 'a saída do Código não é JSON' }
  }
  if (!bruto || typeof bruto !== 'object') return { erro: 'a saída do Código não é JSON' }
  const s = bruto as { ok?: unknown; itens?: unknown; erro?: unknown; log?: unknown }
  const log = Array.isArray(s.log) ? s.log.slice(0, MAX_LINHAS_DE_LOG).map((l) => String(l).slice(0, MAX_BYTES_DE_LOG)) : []
  if (s.ok !== true) return { erro: String(s.erro ?? 'erro no Código').slice(0, 500) || 'erro no Código' }
  if (!Array.isArray(s.itens)) return { erro: 'o Código precisa devolver uma lista (return [{ json: {...} }] ou return [{...}])' }
  if (s.itens.length > MAX_ITENS) return { erro: `o Código devolveu ${s.itens.length} itens; o máximo é ${MAX_ITENS}` }
  if (Buffer.byteLength(JSON.stringify(s.itens)) > MAX_BYTES_DA_LISTA) {
    return { erro: `a saída do Código passa de ${Math.round(MAX_BYTES_DA_LISTA / 1024 / 1024)} MB` }
  }
  return { itens: s.itens, log }
}

// ---------------------------------------------------------------- a janela

export interface DependenciasDoCodigo {
  BrowserWindow: new (opcoes: BrowserWindowConstructorOptions) => JanelaDoElectron
  session: { fromPartition: (particao: string) => Session }
  app: Pick<App, 'getAppMetrics'>
  /** Padrão `PRAZO_DO_CODIGO` e `MEMORIA_MAXIMA_MB`; a prova encurta. */
  prazoMs?: number
  memoriaMaximaMb?: number
}

export const OPCOES_DA_JANELA: BrowserWindowConstructorOptions = {
  show: false,
  width: 320,
  height: 240,
  skipTaskbar: true,
  focusable: false,
  paintWhenInitiallyHidden: false,
  webPreferences: {
    partition: PARTICAO_DO_CODIGO,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
    devTools: false,
    spellcheck: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webgl: false,
    plugins: false,
    images: false,
    navigateOnDragDrop: false,
    backgroundThrottling: false,
    disableDialogs: true,
    autoplayPolicy: 'document-user-activation-required'
  }
}

/** As travas de navegação de um webContents do Código (idempotente; também serve ao `web-contents-created`). */
function travar(conteudo: WebContents): void {
  conteudo.setWindowOpenHandler(() => ({ action: 'deny' }))
  conteudo.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  const naoSair = (evento: { preventDefault: () => void }, url: string): void => {
    if (!url.startsWith(`${ESQUEMA_DO_CODIGO}://`)) evento.preventDefault()
  }
  conteudo.on('will-navigate', naoSair)
  conteudo.on('will-redirect', naoSair)
  conteudo.on('will-frame-navigate', (d) => naoSair(d, d.url))
  conteudo.on('will-prevent-unload', (evento) => evento.preventDefault())
}

/**
 * O porteiro do Código: no máximo N ao mesmo tempo (cada um é um processo de renderer) e nenhuma janela abre numa sessão
 * que já foi usada sem ter sido limpa (plano §4: partição não persistente LIMPA depois de cada uso).
 *
 * A partição é uma só (`fluxo-codigo`): uma por execução criaria uma Session nova a cada Código, e o Electron não solta
 * sessões até o app fechar — um Relógio rodando o dia todo encheria a memória. Então: quem termina deixa a sessão
 * "suja"; enquanto ela está suja ninguém entra; quando a última da vez termina, a sessão é limpa e só então a fila anda.
 * Duas que rodam JUNTAS dividem a sessão, mas cada uma tem a sua origem (UUID) e o webRequest só deixa cada webContents
 * ler a própria execução. Se a limpeza falha, quem estava esperando tenta de novo; se falhar outra vez, aquele Código dá
 * erro (melhor que abrir numa sessão suja), e o próximo tenta outra vez.
 */
export function criarPorteiro(maximo: number, limpar: () => Promise<void>): <T>(fazer: () => Promise<T>) => Promise<T> {
  let rodando = 0
  let suja = false
  let limpeza: Promise<void> | null = null
  const esperando: (() => void)[] = []
  const acordarTodos = (): void => esperando.splice(0).forEach((acordar) => acordar())
  const limparAgora = (): Promise<void> => {
    limpeza ??= limpar()
      .then(() => {
        suja = false
      })
      .finally(() => {
        limpeza = null
        acordarTodos()
      })
    return limpeza
  }
  return async (fazer) => {
    for (;;) {
      if (limpeza) await limpeza.catch(() => {})
      else if (suja && rodando === 0) {
        try {
          await limparAgora()
        } catch (e) {
          throw new Error(`não consegui limpar a sessão do Código antes de rodar (${e instanceof Error ? e.message : String(e)})`)
        }
      } else if (!suja && rodando < maximo) break
      else await new Promise<void>((ok) => esperando.push(ok))
    }
    rodando++
    try {
      return await fazer()
    } finally {
      rodando--
      suja = true
      // a última da vez limpa; uma falha aqui fica para quem entrar depois (ele tenta de novo antes de abrir)
      if (rodando === 0) limparAgora().catch(() => {})
    }
  }
}

export interface MotorDoCodigo {
  /** A ação `codigo` do executor (`acoes.codigo`). */
  acao: AcoesDoFluxo['codigo']
  /** Para o `web-contents-created` do index: true = era do Código e as travas foram postas. */
  guardar: (conteudo: WebContents) => boolean
}

/** Cria o motor do nó Código. Chamar depois do `ready` (a sessão é preparada no primeiro uso). */
export function criarAcaoCodigo(dep: DependenciasDoCodigo): MotorDoCodigo {
  const prazoMs = dep.prazoMs ?? PRAZO_DO_CODIGO
  const memoriaKb = (dep.memoriaMaximaMb ?? MEMORIA_MAXIMA_MB) * 1024
  const execucoes = new Map<string, ExecucaoDoCodigo>()
  let sessao: Session | null = null
  /** Tudo o que a sessão guarda: armazenamento (cookies, localStorage, IndexedDB, cache storage, service workers…), cache HTTP e cache de código. */
  const limparSessao = async (): Promise<void> => {
    if (!sessao) return
    await sessao.clearStorageData()
    await sessao.clearCache()
    await sessao.clearCodeCaches({})
  }
  const fila = criarPorteiro(MAX_CODIGOS_AO_MESMO_TEMPO, limparSessao)

  const preparar = (): Session => {
    if (sessao) return sessao
    const ses = dep.session.fromPartition(PARTICAO_DO_CODIGO)
    endurecerSessao(ses)
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (detalhes, responder) => {
      responder({ cancel: !pedidoPermitido(detalhes.url, detalhes.webContentsId, execucoes) })
    })
    if (!ses.protocol.isProtocolHandled(ESQUEMA_DO_CODIGO)) {
      ses.protocol.handle(ESQUEMA_DO_CODIGO, (pedido) => servirCodigo(pedido, execucoes))
    }
    sessao = ses
    return ses
  }

  const guardar = (conteudo: WebContents): boolean => {
    if (!sessao || conteudo.session !== sessao) return false
    travar(conteudo)
    return true
  }

  const rodarUmaVez = (codigo: string, entrada: string, sinal: AbortSignal): Promise<{ itens: unknown[]; log: string[] }> =>
    new Promise((resolver, rejeitar) => {
      preparar()
      const execId = randomUUID()
      let janela: JanelaDoElectron | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let vigia: ReturnType<typeof setInterval> | undefined
      let acabou = false

      const terminar = (resultado: { itens: unknown[]; log: string[] } | { erro: string }, derrubar: boolean): void => {
        if (acabou) return
        acabou = true
        clearTimeout(timer)
        clearInterval(vigia)
        sinal.removeEventListener('abort', aoAbortar)
        execucoes.delete(execId)
        const j = janela
        if (j && !j.isDestroyed()) {
          try {
            // laço infinito: o renderer não responde a nada, então o processo é derrubado antes de fechar a janela
            if (derrubar && !j.webContents.isDestroyed()) j.webContents.forcefullyCrashRenderer()
          } catch {
            // já caiu
          }
          j.destroy()
        }
        if ('erro' in resultado) rejeitar(new Error(resultado.erro))
        else resolver(resultado)
      }
      const aoAbortar = (): void => terminar({ erro: 'a execução acabou antes do Código' }, true)

      const exec = criarExecucao(codigo, entrada, (texto) => terminar(lerSaida(texto), false))
      execucoes.set(execId, exec)
      if (sinal.aborted) return aoAbortar()
      sinal.addEventListener('abort', aoAbortar, { once: true })
      timer = setTimeout(() => terminar({ erro: `o Código passou de ${prazoMs / 1000} s e foi parado` }, true), prazoMs)

      try {
        janela = new dep.BrowserWindow(OPCOES_DA_JANELA)
      } catch (e) {
        return terminar({ erro: `não consegui abrir o Código (${e instanceof Error ? e.message : String(e)})` }, false)
      }
      const conteudo = janela.webContents
      const id = conteudo.id
      recusarRemetente(id)
      conteudo.once('destroyed', () => liberarRemetente(id))
      exec.webContentsId = id
      travar(conteudo)
      conteudo.on('render-process-gone', (_e, detalhes) => {
        const memoria = detalhes.reason === 'oom' ? ' (memória)' : ''
        terminar({ erro: `o Código caiu${memoria}: ${detalhes.reason}` }, false)
      })
      conteudo.on('did-fail-load', (_e, codigoDoErro, descricao, _url, principal) => {
        if (principal) terminar({ erro: `o Código não carregou (${codigoDoErro} ${descricao})` }, true)
      })
      vigia = setInterval(() => {
        try {
          if (conteudo.isDestroyed()) return
          const pid = conteudo.getOSProcessId()
          const m = dep.app.getAppMetrics().find((x) => x.pid === pid)
          if (m && m.memory.workingSetSize > memoriaKb) {
            terminar({ erro: `o Código passou de ${memoriaKb / 1024} MB de memória e foi parado` }, true)
          }
        } catch {
          // a leitura falhou: o prazo ainda vale
        }
      }, INTERVALO_DA_MEMORIA)
      conteudo.loadURL(`${ESQUEMA_DO_CODIGO}://${execId}/index.html`).catch(() => {
        // o did-fail-load (ou o prazo) cuida
      })
    })

  const acao: AcoesDoFluxo['codigo'] = async (ajustes, itens, ctx) => {
    const codigo = typeof ajustes.codigo === 'string' ? ajustes.codigo : ''
    const sintaxe = erroDeSintaxe(codigo)
    if (sintaxe) throw new Error(sintaxe)
    const entrada = JSON.stringify({ itens, anteriores: ctx.anteriores })
    if (Buffer.byteLength(entrada) > MAX_ENTRADA) {
      throw new Error(`a entrada do Código (itens + nós anteriores) passa de ${Math.round(MAX_ENTRADA / 1024 / 1024)} MB`)
    }
    return fila(() => rodarUmaVez(codigo, entrada, ctx.sinal))
  }

  return { acao, guardar }
}
