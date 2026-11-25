/**
 * Páginas "+" (1.9.5) — o núcleo no processo principal. O desenho está em `.contexto/195-S1-desenho.md`; as regras
 * puras (manifesto, árvore, CSP, endereços, cota, taxa) em `shared/paginas.ts`.
 *
 * Em uma frase: a página é uma pasta copiada para `~/.orkester/paginas/<id>/`, servida por `ork-pagina://<id>/` de um
 * mapa em memória conferido pelo hash do aceite, num `<webview>` com partição própria em memória, preload mínimo e
 * nenhuma permissão do Chromium; tudo o que ela pede ao Orkester passa por `conferir` aqui, a cada chamada.
 *
 * Dono do registro (`paginas.json`): este arquivo. A janela só lista, propõe e decide (CANAIS_PAGINAS, protegidos pelo
 * ipcSeguro); a página só fala por `pagina:chamar` no `guest.ipc` dela, que a janela nem alcança.
 */
import { app, BrowserWindow, dialog, ipcMain, session, type IpcMainInvokeEvent, type Session, type WebContents, type WebFrameMain, type WebPreferences } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { closeSync, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  CANAIS_ORK_PAGINA,
  CANAIS_PAGINAS,
  METODOS_API_MCP_DA_PAGINA,
  type AcessosDaPagina,
  type AgenteParaPagina,
  type PedidoDaPagina,
  type PropostaDePagina,
  type RespostaDaProposta,
  type ResultadoDePaginas,
  type ResumoDePagina,
  type ResumoDoQuadroParaPagina,
  type SugestaoDePagina
} from '../shared/api'
import {
  LIMITES,
  anotarQueda,
  bytesDe,
  cabecalhosDaPagina,
  caminhoServivel,
  criarBalde,
  criarDescarga,
  decidirResposta,
  gravarDado,
  hostsDe,
  ID_DE_PAGINA,
  lerDados,
  lerPermissao,
  lerRegistro,
  limparTextoDoRecado,
  navegacaoPermitida,
  novasPermissoes,
  permissoesEfetivas,
  permissoesPedidas,
  urlLocal,
  urlPermitida,
  validarArvore,
  validarManifesto,
  type EntradaDaArvore,
  type IconeDePagina,
  type ManifestoDePagina,
  type MotivoDeQueda,
  type PaginaRegistrada,
  type RegistroDePaginas,
  type Resultado,
  type SituacaoDaEscrita
} from '../shared/paginas'
import {
  bloqueioDasFichas,
  conferirAcessos,
  paginaDepoisDoAceite,
  sugestoesDe,
  usosDe,
  type ContextoDosAcessos,
  type ServidorConhecido
} from '../shared/paginasAcessos'
import { PASTA_DADOS, idsDosEspacos, resumosDosEspacos } from './dados'
import { cofreDeCredenciais } from './fluxos'
import { registroMcpFora } from './mcpFora'
import { apisDoCofre, criarApiDasPaginas, criarCorte, type CorteDosPedidos, type PaginaParaApi, type RedeDaApi } from './paginasApi'
import { avisar, avisarTodas, espacoDaJanela } from './janelas'
import { cordasDoEspaco, sessaoPorId, sessoesDoEspaco, telaDe, type Sessao } from './terminais'
import { caixa, situacaoNaTela } from './espera'
import { endurecerSessao } from './sandbox'

const AUTOTESTE = process.argv.includes('--autoteste')
const PASTA_PAGINAS = join(PASTA_DADOS, 'paginas')
const PASTA_DADOS_DAS_PAGINAS = join(PASTA_DADOS, 'paginas-dados')
const ARQUIVO_REGISTRO = join(PASTA_DADOS, 'paginas.json')
/** O preload da página vem do main, nunca do atributo do webview. */
const PRELOAD_DA_PAGINA = join(__dirname, '../preload/pagina.js')
const PARTICAO = /^pagina-([a-z][a-z0-9-]{1,31})$/
const PROPOSTA_VALE = 10 * 60_000

const falha = <T>(erro: string): Resultado<T> => ({ ok: false, erro })
const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * DNS prefetch desligado no app inteiro (revisão 195, item 3). `<link rel="dns-prefetch" href="//<dado>.x.com">` não é
 * pedido HTTP: não passa pela CSP nem pelo `webRequest`, e no Electron 44 vira consulta de DNS de verdade (o
 * `NetworkHintsHandlerImpl` do Electron herda o `PrefetchDNS` do Chromium; só o preconnect foi trocado por evento).
 * Com `local`, o nome do host seria o dado lido do PC. Não há chave por sessão nem em `webPreferences`; a do Blink
 * (`dnsPrefetchingEnabled`) é aplicada depois das preferências a cada atualização, em todo renderer. O custo é só a
 * dica de DNS (latência) nos portais. Tem de rodar antes do `ready`: este módulo é importado no começo do main.
 * Só no autoteste, `ORK_AUTOTESTE_SEM_TRAVA_DNS=1` deixa a trava de fora para o cenário mostrar o furo.
 */
if (!(AUTOTESTE && process.env.ORK_AUTOTESTE_SEM_TRAVA_DNS === '1')) app.commandLine.appendSwitch('blink-settings', 'dnsPrefetchingEnabled=false')

// ================================================================ o registro

let registro: RegistroDePaginas | null = null
/** Registro de uma versão mais nova: nada é gravado por cima (e as páginas ficam desligadas). */
let soLeitura: string | undefined

function reg(): RegistroDePaginas {
  if (registro) return registro
  let texto: string | null = null
  try {
    texto = readFileSync(ARQUIVO_REGISTRO, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') texto = ''
  }
  const lido = lerRegistro(texto)
  if (lido.estado === 'ruim') {
    try {
      copyFileSync(ARQUIVO_REGISTRO, `${ARQUIVO_REGISTRO}.ruim`)
    } catch {
      // sem arquivo para guardar
    }
  }
  if (lido.estado === 'versao-maior') soLeitura = 'o registro das páginas é de uma versão mais nova do Orkester: nada muda aqui até atualizar o app'
  registro = lido.registro
  return registro
}

const paginaDe = (id: string): PaginaRegistrada | undefined => reg().paginas.find((p) => p.id === id)
const efetivasDe = (p: PaginaRegistrada): string[] => permissoesEfetivas(p.pedidas, p.aceitas, p.recusadas)

/** Aplica a mudança, grava (tmp + rename) e avisa as janelas. Lança se o registro é só leitura. */
function mudar(fn: (r: RegistroDePaginas) => RegistroDePaginas): void {
  if (soLeitura) throw new Error(soLeitura)
  const novo = fn(reg())
  mkdirSync(PASTA_DADOS, { recursive: true })
  const temporario = `${ARQUIVO_REGISTRO}.${process.pid}.tmp`
  writeFileSync(temporario, JSON.stringify(novo, null, 2), 'utf8')
  renameSync(temporario, ARQUIVO_REGISTRO)
  registro = novo
  avisarTodas({ tipo: 'paginas' })
}

const mudarPagina = (id: string, fn: (p: PaginaRegistrada) => PaginaRegistrada): void =>
  mudar((r) => ({ ...r, paginas: r.paginas.map((p) => (p.id === id ? fn(p) : p)) }))

/** A página pode rodar agora? (chave geral, registrada, não desligada) */
function ativa(id: string): PaginaRegistrada | null {
  const r = reg()
  if (!r.ligadas || soLeitura) return null
  const p = paginaDe(id)
  return p && !p.desligada ? p : null
}

// ================================================================ ler uma pasta

interface Arvore {
  entradas: EntradaDaArvore[]
  mapa: Map<string, Buffer>
  arquivos: number
  bytes: number
  /** caminho|tamanho|mtime de cada entrada: muda quando alguém mexe na pasta */
  assinatura: string
}

/** Só a lista (`lstat`, sem ler conteúdo): entradas e a assinatura. É o que `listar` usa para ver se a cópia mudou. */
function listarArvore(raiz: string): Resultado<{ entradas: EntradaDaArvore[]; assinatura: string }> {
  let st
  try {
    st = lstatSync(raiz)
  } catch {
    return falha('a pasta não existe')
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return falha('escolha uma pasta (não um atalho)')
  const entradas: EntradaDaArvore[] = []
  const marcas: string[] = []
  const teto = LIMITES.arquivos * 2
  const andar = (dir: string, rel: string, nivel: number): void => {
    for (const nome of readdirSync(dir)) {
      if (entradas.length > teto) return
      const caminho = rel ? `${rel}/${nome}` : nome
      const s = lstatSync(join(dir, nome))
      const tipo: EntradaDaArvore['tipo'] = s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'pasta' : s.isFile() ? 'arquivo' : 'outro'
      entradas.push({ caminho, tipo, bytes: tipo === 'arquivo' ? s.size : 0 })
      marcas.push(`${caminho}|${tipo}|${s.size}|${s.mtimeMs}`)
      if (tipo === 'pasta' && nivel <= LIMITES.profundidade) andar(join(dir, nome), caminho, nivel + 1)
    }
  }
  try {
    andar(raiz, '', 1)
  } catch (e) {
    return falha(`não consegui ler a pasta: ${mensagem(e)}`)
  }
  if (entradas.length > teto) return falha(`a pasta tem mais de ${LIMITES.arquivos} arquivos`)
  return { ok: true, valor: { entradas, assinatura: marcas.sort().join('\n') } }
}

/**
 * Lê a pasta inteira para a memória, sem seguir link (`lstat`) e sem executar nada. Cada arquivo é aberto e o
 * `fstat` do que foi aberto tem de bater com o `lstat` (trocado por link no meio = recusa).
 */
function lerArvore(raiz: string): Resultado<Arvore> {
  const lista = listarArvore(raiz)
  if (!lista.ok) return lista
  const { entradas, assinatura } = lista.valor
  const v = validarArvore(entradas)
  if (!v.ok) return v
  const mapa = new Map<string, Buffer>()
  for (const e of entradas) {
    if (e.tipo !== 'arquivo') continue
    const caminho = join(raiz, ...e.caminho.split('/'))
    let fd: number | null = null
    try {
      const antes = lstatSync(caminho)
      fd = openSync(caminho, 'r')
      const aberto = fstatSync(fd)
      if (antes.isSymbolicLink() || !aberto.isFile() || aberto.size !== e.bytes || (antes.ino && aberto.ino && antes.ino !== aberto.ino)) {
        return falha(`"${e.caminho}" mudou durante a leitura`)
      }
      const buf = Buffer.alloc(aberto.size)
      for (let lido = 0; lido < buf.length; ) {
        const n = readSync(fd, buf, lido, buf.length - lido, lido)
        if (n <= 0) return falha(`"${e.caminho}" mudou durante a leitura`)
        lido += n
      }
      mapa.set(e.caminho, buf)
    } catch (erro) {
      return falha(`não consegui ler "${e.caminho}": ${mensagem(erro)}`)
    } finally {
      if (fd !== null) closeSync(fd)
    }
  }
  return { ok: true, valor: { entradas, mapa, arquivos: v.valor.arquivos, bytes: v.valor.bytes, assinatura } }
}

function hashDaArvore(mapa: Map<string, Buffer>): string {
  const h = createHash('sha256')
  for (const caminho of [...mapa.keys()].sort()) {
    const b = mapa.get(caminho)!
    h.update(`${caminho}\n${b.length}\n`)
    h.update(b)
  }
  return h.digest('hex')
}

function manifestoDaArvore(arvore: Arvore): Resultado<ManifestoDePagina> {
  const bruto = arvore.mapa.get('manifesto.json')!
  if (bruto.length > 64 * 1024) return falha('o manifesto.json passa de 64 KB')
  let json: unknown
  try {
    json = JSON.parse(bruto.toString('utf8').replace(/^﻿/, ''))
  } catch (e) {
    return falha(`o manifesto.json não é JSON válido: ${mensagem(e).slice(0, 120)}`)
  }
  return validarManifesto(json)
}

function iconeDaArvore(m: ManifestoDePagina, arvore: Arvore): Resultado<IconeDePagina | null> {
  if (!m.icone) return { ok: true, valor: null }
  if (m.icone.startsWith('lucide:')) return { ok: true, valor: { tipo: 'lucide', nome: m.icone.slice(7) } }
  const arquivo = arvore.mapa.get(m.icone)
  if (!arquivo) return falha(`o ícone "${m.icone}" não está na pasta`)
  if (arquivo.length > LIMITES.icone) return falha(`o ícone passa de ${LIMITES.icone / 1024} KB`)
  const png = m.icone.toLowerCase().endsWith('.png')
  if (png && arquivo.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return falha('o ícone .png não é um PNG')
  return { ok: true, valor: { tipo: 'imagem', dataUrl: `data:image/${png ? 'png' : 'svg+xml'};base64,${arquivo.toString('base64')}` } }
}

const mesmaPasta = (a: string, b: string): boolean => {
  const x = resolve(a)
  const y = resolve(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

const pastaDaCopia = (id: string): string => join(PASTA_PAGINAS, id)

// ================================================================ propostas e aceite

interface PropostaGuardada extends PropostaDePagina {
  hash: string
  criadaEm: number
}

const propostas = new Map<string, PropostaGuardada>()

function guardarProposta(p: Omit<PropostaGuardada, 'token' | 'criadaEm'>): PropostaDePagina {
  for (const [token, antiga] of propostas) if (Date.now() - antiga.criadaEm > PROPOSTA_VALE) propostas.delete(token)
  while (propostas.size >= 4) propostas.delete(propostas.keys().next().value!)
  const token = randomBytes(16).toString('hex')
  propostas.set(token, { ...p, token, criadaEm: Date.now() })
  const { hash: _hash, ...visivel } = { ...p, token }
  return visivel
}

/** Lê a pasta escolhida e monta a proposta (nova ou atualização). `idEsperado`: "Atualizar da pasta". */
function proporDaPasta(pasta: string, idEsperado?: string): RespostaDaProposta {
  if (soLeitura) return { ok: false, erro: soLeitura }
  if (!reg().ligadas) return { ok: false, erro: 'Ligue "Páginas próprias" antes, em Configurações › Conexões › Páginas.' }
  const lida = lerArvore(pasta)
  if (!lida.ok) return lida
  const m = manifestoDaArvore(lida.valor)
  if (!m.ok) return m
  const manifesto = m.valor
  if (idEsperado && manifesto.id !== idEsperado) return { ok: false, erro: `a pasta agora é da página "${manifesto.id}", não de "${idEsperado}"` }
  const icone = iconeDaArvore(manifesto, lida.valor)
  if (!icone.ok) return icone
  const existente = paginaDe(manifesto.id)
  if (existente && !mesmaPasta(existente.origem, pasta)) {
    return { ok: false, erro: `já existe uma página "${manifesto.id}" vinda de outra pasta (${existente.origem}); remova-a antes` }
  }
  if (!existente && reg().paginas.length >= LIMITES.paginas) return { ok: false, erro: `já há ${LIMITES.paginas} páginas instaladas` }
  const pedidas = permissoesPedidas(manifesto)
  const proposta = guardarProposta({
    tipo: existente ? 'atualizacao' : 'nova',
    manifesto,
    icone: icone.valor,
    origem: resolve(pasta),
    arquivos: lida.valor.arquivos,
    bytes: lida.valor.bytes,
    pedidas,
    novas: existente ? novasPermissoes(pedidas, existente.aceitas, existente.recusadas) : pedidas,
    ...acessosDaProposta(manifesto, pedidas, existente),
    ...(existente ? { versaoAntes: existente.versao } : {}),
    hash: hashDaArvore(lida.valor.mapa)
  })
  return { ok: true, proposta }
}

/** Proposta para reaceitar a cópia como ela está (mudou fora do app, ou o manifesto pede permissão nova). */
function proporRever(id: string): RespostaDaProposta {
  const p = paginaDe(id)
  if (!p) return { ok: false, erro: 'página não instalada' }
  if (soLeitura) return { ok: false, erro: soLeitura }
  const lida = lerArvore(pastaDaCopia(id))
  if (!lida.ok) return { ok: false, erro: `a cópia da página está com problema: ${lida.erro}. Remova e adicione de novo.` }
  const m = manifestoDaArvore(lida.valor)
  if (!m.ok) return m
  if (m.valor.id !== id) return { ok: false, erro: 'o manifesto da cópia agora tem outro id: remova e adicione de novo' }
  const icone = iconeDaArvore(m.valor, lida.valor)
  if (!icone.ok) return icone
  const hash = hashDaArvore(lida.valor.mapa)
  const mudouFora = hash !== p.hash
  const pedidas = permissoesPedidas(m.valor)
  return {
    ok: true,
    proposta: guardarProposta({
      tipo: 'rever',
      manifesto: m.valor,
      icone: icone.valor,
      origem: pastaDaCopia(id),
      arquivos: lida.valor.arquivos,
      bytes: lida.valor.bytes,
      pedidas,
      // mudou fora = aceite de novo (tudo o que não foi revogado); senão, só a diferença
      novas: novasPermissoes(pedidas, mudouFora ? [] : p.aceitas, p.recusadas),
      ...acessosDaProposta(m.valor, pedidas, p),
      versaoAntes: p.versao,
      ...(mudouFora ? { mudouFora: true } : {}),
      hash
    })
  }
}

/** Grava a árvore numa pasta nova, confere a cópia e troca de nome: a página velha só sai quando a nova está boa. */
function instalarCopia(id: string, arvore: Arvore, hash: string): void {
  mkdirSync(PASTA_PAGINAS, { recursive: true })
  const sufixo = randomBytes(4).toString('hex')
  const nova = join(PASTA_PAGINAS, `.novo-${id}-${sufixo}`)
  const velha = join(PASTA_PAGINAS, `.velho-${id}-${sufixo}`)
  try {
    mkdirSync(nova)
    for (const [caminho, buf] of arvore.mapa) {
      const destino = join(nova, ...caminho.split('/'))
      mkdirSync(dirname(destino), { recursive: true })
      writeFileSync(destino, buf)
    }
    const conferida = lerArvore(nova)
    if (!conferida.ok || hashDaArvore(conferida.valor.mapa) !== hash) throw new Error('a cópia não bateu com a pasta de origem')
    let tinhaVelha = false
    try {
      renameSync(pastaDaCopia(id), velha)
      tinhaVelha = true
    } catch {
      // primeira instalação
    }
    renameSync(nova, pastaDaCopia(id))
    if (tinhaVelha) rmSync(velha, { recursive: true, force: true })
  } catch (e) {
    rmSync(nova, { recursive: true, force: true })
    throw e
  }
}

/**
 * (1.9.7) O que o diálogo precisa para as seções "APIs/MCPs que esta página enxerga": as sugestões do manifesto, os
 * acessos de antes (atualizar/rever) e, se a página pede `rede`/`local`, o motivo de não poder enxergar nada.
 */
function acessosDaProposta(
  m: ManifestoDePagina,
  pedidas: readonly string[],
  existente: PaginaRegistrada | undefined
): Pick<PropostaDePagina, 'sugestoes' | 'acessosAntes' | 'semAcessos'> {
  const sugestoes = sugestoesDe(m)
  const semAcessos = bloqueioDasFichas(pedidas)
  return {
    ...(sugestoes.length ? { sugestoes } : {}),
    ...(existente?.acessos ? { acessosAntes: existente.acessos } : {}),
    ...(semAcessos ? { semAcessos } : {})
  }
}

/** (1.9.7) Os servidores de fora como os acessos os veem: id, nome e o "diz que só lê" das ferramentas conhecidas. */
function servidoresConhecidos(): ServidorConhecido[] {
  return registroMcpFora.listar().map((s) => ({
    id: s.id,
    nome: s.nome,
    ...(s.situacao === 'precisa-login' ? { precisaLogin: true } : {}),
    ferramentas: registroMcpFora.ferramentas(s.id).map((f) => ({ nome: f.nome, dizQueSoLe: f.anotacoes?.readOnlyHint === true }))
  }))
}

/** (1.9.7) APIs (do cofre, só metadados) e servidores de agora, para conferir acessos; `bloqueio` se pede rede/local. */
function contextoDosAcessos(bloqueio?: string): ContextoDosAcessos {
  return { apis: apisDoCofre(cofreDeCredenciais), servidores: servidoresConhecidos(), ...(bloqueio ? { bloqueio } : {}) }
}

/** (1.9.7) A página como a API das páginas a lê, a cada chamada: os acessos e o bloqueio por `rede`/`local`. */
const paraApi = (p: PaginaRegistrada): PaginaParaApi => ({ id: p.id, acessos: p.acessos, bloqueio: bloqueioDasFichas(p.pedidas) })

/**
 * (1.9.7) Os acessos que o aceite manda, conferidos contra a versão proposta. Ausente (undefined/null) = ausente: em
 * atualizar/rever ficam os de antes.
 */
function acessosDoAceite(prop: PropostaGuardada, bruto: unknown): Resultado<AcessosDaPagina | undefined> {
  if (bruto === undefined || bruto === null) return { ok: true, valor: undefined }
  const ctx = contextoDosAcessos(bloqueioDasFichas(prop.pedidas))
  return conferirAcessos(bruto, ctx)
}

/** (1.9.7) Para o aviso ao apagar ou renomear uma API: "Página <nome>" das que a enxergam. */
export function paginasQueUsamCredencial(credencialId: string): string[] {
  return reg()
    .paginas.filter((p) => (p.acessos?.api ?? []).some((a) => a.apiId === credencialId))
    .map((p) => `Página ${p.nome}`)
}

function aceitarProposta(token: string, acessosPedidos?: unknown): ResultadoDePaginas & { id?: string } {
  const prop = propostas.get(String(token))
  if (!prop || Date.now() - prop.criadaEm > PROPOSTA_VALE) {
    propostas.delete(String(token))
    return { ok: false, erro: 'a proposta expirou: escolha a pasta de novo' }
  }
  // acesso errado não gasta a proposta: o diálogo corrige e aceita de novo
  const acessos = acessosDoAceite(prop, acessosPedidos)
  if (!acessos.ok) return acessos
  propostas.delete(String(token))
  if (soLeitura) return { ok: false, erro: soLeitura }
  if (!reg().ligadas) return { ok: false, erro: 'as páginas próprias estão desligadas' }
  // a pasta é lida de novo: o que se copia tem de ser exatamente o que o usuário viu na proposta
  const lida = lerArvore(prop.origem)
  if (!lida.ok) return lida
  if (hashDaArvore(lida.valor.mapa) !== prop.hash) return { ok: false, erro: 'a pasta mudou depois da proposta: escolha de novo' }
  const id = prop.manifesto.id
  const existente = paginaDe(id)
  if (prop.tipo === 'nova' && existente) return { ok: false, erro: `a página "${id}" já foi instalada` }
  if (prop.tipo !== 'nova' && !existente) return { ok: false, erro: `a página "${id}" não está mais instalada` }
  try {
    if (prop.tipo !== 'rever') instalarCopia(id, lida.valor, prop.hash)
  } catch (e) {
    return { ok: false, erro: `não consegui copiar a página: ${mensagem(e)}` }
  }
  const agora = Date.now()
  try {
    // o merge é puro (shared/paginasAcessos.ts): acessos ausentes em atualizar/rever = os de antes, intactos
    if (!existente) mudar((r) => ({ ...r, paginas: [...r.paginas, paginaDepoisDoAceite(undefined, prop, acessos.valor, agora)] }))
    else mudarPagina(id, (p) => paginaDepoisDoAceite(p, prop, acessos.valor, agora))
  } catch (e) {
    return { ok: false, erro: mensagem(e) }
  }
  pendentes.delete(id)
  descarregar(id)
  recarregarAbertas(id)
  return { ok: true, id }
}

// ================================================================ carga (o que a página serve)

interface Carga {
  hash: string
  mapa: Map<string, Buffer>
}

/** Árvore conferida de cada página carregada: o protocolo serve só daqui, nunca do disco. */
const carregadas = new Map<string, Carga>()
/** Página que não carregou por precisar de revisão: a moldura mostra o motivo. */
const pendentes = new Map<string, NonNullable<ResumoDePagina['pendente']>>()
/** Assinatura → hash da cópia, para `listar` não reler 5 MB a cada vez. */
const conferidas = new Map<string, { assinatura: string; hash: string }>()

function descarregar(id: string): void {
  carregadas.delete(id)
  conferidas.delete(id)
}

/** Anota a pendência e avisa as janelas só quando ela muda (o will-attach pode tentar várias vezes). */
function marcarPendente(id: string, pendente: NonNullable<ResumoDePagina['pendente']>): void {
  if (JSON.stringify(pendentes.get(id)) === JSON.stringify(pendente)) return
  pendentes.set(id, pendente)
  avisarTodas({ tipo: 'paginas' })
}

/** Lê e confere a cópia (hash do aceite, manifesto sem permissão nova). Síncrono: o will-attach decide na hora. */
function carregar(id: string): Resultado<Carga> {
  const p = ativa(id)
  if (!p) return falha('página desligada ou não instalada')
  const ja = carregadas.get(id)
  if (ja && ja.hash === p.hash) return { ok: true, valor: ja }
  const lida = lerArvore(pastaDaCopia(id))
  const hash = lida.ok ? hashDaArvore(lida.valor.mapa) : ''
  if (lida.ok) conferidas.set(id, { assinatura: lida.valor.assinatura, hash })
  if (!lida.ok || hash !== p.hash) {
    marcarPendente(id, { motivo: 'mudou-fora', novas: [] })
    return falha('a página mudou fora do Orkester')
  }
  const m = manifestoDaArvore(lida.valor)
  if (!m.ok) return m
  const pedidas = permissoesPedidas(m.valor)
  const novas = novasPermissoes(pedidas, p.aceitas, p.recusadas)
  if (novas.length) {
    marcarPendente(id, { motivo: 'permissao-nova', novas })
    return falha('a página pede permissão nova')
  }
  pendentes.delete(id)
  const carga = { hash, mapa: lida.valor.mapa }
  carregadas.set(id, carga)
  return { ok: true, valor: carga }
}

/** Para `listar`: a cópia ainda é a aceita? Relê o conteúdo só se a assinatura (tamanhos e datas) mudou. */
function pendenciaDe(p: PaginaRegistrada): ResumoDePagina['pendente'] {
  const conhecida = pendentes.get(p.id)
  if (conhecida) return conhecida
  const cache = conferidas.get(p.id)
  const lista = listarArvore(pastaDaCopia(p.id))
  if (!lista.ok) return { motivo: 'mudou-fora', novas: [] }
  let hash = cache && cache.assinatura === lista.valor.assinatura ? cache.hash : null
  if (hash === null) {
    const lida = lerArvore(pastaDaCopia(p.id))
    if (!lida.ok) return { motivo: 'mudou-fora', novas: [] }
    hash = hashDaArvore(lida.valor.mapa)
    conferidas.set(p.id, { assinatura: lida.valor.assinatura, hash })
  }
  return hash === p.hash ? undefined : { motivo: 'mudou-fora', novas: [] }
}

// ================================================================ sessão, protocolo e webview

/** Sessão → id da página. Montado só aqui, em `prepararSessao`: a identidade nunca vem de algo que a página mande. */
const paginaDaSessao = new Map<Session, string>()
let downloadsBarrados = 0

function prepararSessao(id: string): Session {
  // sem `persist:` (decisão 3a do Luís): o que ficar no navegador some ao sair. Com a CSP `sandbox` (origem opaca),
  // localStorage, IndexedDB e cookies nem abrem; o armazenamento da página é o orkPagina.dados
  const ses = session.fromPartition(`pagina-${id}`)
  if (paginaDaSessao.get(ses) === id) return ses
  paginaDaSessao.set(ses, id)
  // a mesma receita do nó Código dos fluxos (main/sandbox.ts)
  endurecerSessao(ses, () => void downloadsBarrados++)
  // a lista de hosts é lida a cada pedido: revogar `rede` corta na hora (a CSP muda na próxima carga)
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (detalhes, responder) => {
    const p = ativa(id)
    responder({ cancel: !p || !urlPermitida(detalhes.url, id, hostsDe(efetivasDe(p))) })
  })
  if (!ses.protocol.isProtocolHandled('ork-pagina')) {
    ses.protocol.handle('ork-pagina', (pedido) => servir(id, pedido))
  }
  return ses
}

function servir(id: string, pedido: { url: string; method: string }): Response {
  if (pedido.method !== 'GET') return new Response(null, { status: 405 })
  const p = ativa(id)
  const carga = p ? carregar(id) : null
  if (!p || !carga?.ok) return new Response('página indisponível', { status: 404 })
  const caminho = caminhoServivel(pedido.url, id)
  const corpo = caminho === null ? undefined : carga.valor.mapa.get(caminho)
  if (!corpo || caminho === null) return new Response('não encontrado', { status: 404, headers: cabecalhosDaPagina(id, [], 'x.txt') })
  return new Response(new Uint8Array(corpo), { status: 200, headers: cabecalhosDaPagina(id, hostsDe(efetivasDe(p)), caminho) })
}

export const ehParticaoDePagina = (particao: unknown): boolean => typeof particao === 'string' && PARTICAO.test(particao)

/**
 * O ramo da página no `will-attach-webview` da janela. true = pode anexar (as preferências já foram forçadas).
 * Só aceita `src="ork-pagina://<id>/index.html"` com `partition="pagina-<id>"`, página ligada e cópia conferida.
 */
export function anexarPagina(preferencias: WebPreferences, parametros: Record<string, string>): boolean {
  const id = PARTICAO.exec(String(parametros.partition))?.[1]
  if (!id || parametros.src !== `ork-pagina://${id}/index.html`) return false
  if (!carregar(id).ok) return false
  prepararSessao(id)
  const prefs = preferencias as WebPreferences & Record<string, unknown>
  delete prefs.preloadURL
  delete prefs.enableBlinkFeatures
  delete prefs.disableBlinkFeatures
  prefs.preload = PRELOAD_DA_PAGINA
  prefs.sandbox = true
  prefs.contextIsolation = true
  prefs.nodeIntegration = false
  // Não liga Node (o sandbox acima não deixa, em frame nenhum): só leva o preload aos iframes da página, para tirar o
  // WebRTC do global de cada um antes do script dela (um `srcdoc` com `<script src>`, por exemplo). Lá ele não expõe
  // nada; a API e os canais são só do frame principal (o main confere em `chamar` e `ouvir`). O `about:blank`, que o
  // Electron pula, a CSP `sandbox` deixa de outra origem: a página não alcança.
  prefs.nodeIntegrationInSubFrames = true
  prefs.nodeIntegrationInWorker = false
  prefs.webSecurity = true
  prefs.allowRunningInsecureContent = false
  prefs.webviewTag = false
  prefs.navigateOnDragDrop = false
  prefs.disableDialogs = true
  prefs.spellcheck = false
  prefs.experimentalFeatures = false
  prefs.plugins = false
  prefs.javascript = true
  return true
}

/**
 * O ramo da página no `web-contents-created` (pela sessão). true = era página e os guardas foram postos: nada de
 * janela nova, e navegação só dentro do próprio id. false = não é página (o portal segue com o dele).
 */
export function guardarPagina(conteudo: WebContents): boolean {
  const id = paginaDaSessao.get(conteudo.session)
  if (!id) return false
  conteudo.setWindowOpenHandler(() => ({ action: 'deny' }))
  // WebRTC não passa pela CSP nem pelo webRequest (decisão do Maestro: página "+" não usa WebRTC). O preload tira
  // `RTC*` de todo frame em que roda; o iframe `about:blank`, onde ele não roda, é de outra origem por causa da CSP
  // `sandbox` (ver cspDaPagina), e a página não alcança o global dele. Aqui, a segunda trava: sem UDP, sem STUN e
  // sem TURN por UDP no guest inteiro.
  conteudo.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  conteudo.on('will-navigate', (evento, url) => {
    if (!navegacaoPermitida(url, id)) evento.preventDefault()
  })
  conteudo.on('will-frame-navigate', (detalhes) => {
    if (!navegacaoPermitida(detalhes.url, id)) detalhes.preventDefault()
  })
  conteudo.on('will-redirect', (evento, url) => {
    if (!navegacaoPermitida(url, id)) evento.preventDefault()
  })
  // um `beforeunload` da página não segura a janela do app
  conteudo.on('will-prevent-unload', (evento) => evento.preventDefault())
  return true
}

// ================================================================ as páginas abertas

interface Aberta {
  id: string
  guest: WebContents
  host: WebContents
  ouvindo: Set<string>
  ultimoQuadro?: string
  /** sonda de vida pendente desde */
  sondaDesde?: number
  semResposta?: NodeJS.Timeout
  cpuAlta: number
  /** a vigia derrubou por este motivo (o render-process-gone que vem depois o usa) */
  derrubada?: MotivoDeQueda
  /** (1.9.7) corta os pedidos `api`/`mcp` em curso: ao fechar, recarregar ou esvaziar a página (revisão A2) */
  corte: CorteDosPedidos
}

const abertas = new Map<number, Aberta>()
/** Cores do tema de cada janela (id do webContents), para o evento `tema`. */
const temas = new Map<number, Record<string, string>>()
/** Respostas de agente esperando a página abrir: `<id>|<espaço>` → mensagens (só em memória). */
const respostasNaFila = new Map<string, Array<{ de: { id: string; nome: string }; texto: string; em: number }>>()

const abertasDa = (id: string): Aberta[] => [...abertas.values()].filter((a) => a.id === id && !a.guest.isDestroyed())

function enviar(a: Aberta, tipo: string, dados: unknown): void {
  if (!a.guest.isDestroyed()) a.guest.send(CANAIS_ORK_PAGINA.evento, tipo, dados)
}

function recarregarAbertas(id: string): void {
  for (const a of abertasDa(id)) {
    // o pedido do documento velho não sobrevive à recarga (revogar, aceitar de novo): corta antes
    a.corte.cortar()
    a.guest.reload()
  }
}

/**
 * Desligar, desligar a chave geral ou remover: o main tira a página da tela na hora (`about:blank`), sem esperar o
 * renderer desmontar o webview, e um `wss` que ela já tinha aberto cai junto (revisão 195, sugestão 6). O `loadURL`
 * do main não passa pelo `will-navigate`; o `did-fail-load` -3 (carga abortada) a moldura já ignora.
 */
function esvaziarAbertas(id: string): void {
  for (const a of abertasDa(id)) {
    // desligar, remover ou chave geral: um POST em curso não termina depois (revisão A2)
    a.corte.cortar()
    void a.guest.loadURL('about:blank').catch(() => {})
  }
}

/** A janela anexou um webview: se é página, liga o canal dela, os eventos e a vigia. */
export function paginaAnexada(guest: WebContents): void {
  const id = paginaDaSessao.get(guest.session)
  const host = guest.hostWebContents
  if (!id || !host) return
  const a: Aberta = { id, guest, host, ouvindo: new Set(), cpuAlta: 0, corte: criarCorte() }
  abertas.set(guest.id, a)
  // o preload também roda nos iframes da página (só para tirar o WebRTC): canal só do frame principal
  const doFramePrincipal = (quadro: WebFrameMain | null | undefined): boolean =>
    !!quadro && quadro.processId === guest.mainFrame.processId && quadro.routingId === guest.mainFrame.routingId
  guest.ipc.handle(CANAIS_ORK_PAGINA.chamar, async (evento, metodo: unknown, ...args: unknown[]) => {
    try {
      if (!doFramePrincipal(evento.senderFrame)) throw new Error('chamada fora da página')
      return { ok: true, valor: await chamar(a, String(metodo), args) }
    } catch (e) {
      return { ok: false, erro: mensagem(e).slice(0, 300) }
    }
  })
  guest.ipc.on(CANAIS_ORK_PAGINA.ouvir, (evento, qual: unknown, ligar: unknown) => {
    if (!doFramePrincipal(evento.senderFrame)) return
    if (qual !== 'recado' && qual !== 'quadro' && qual !== 'tema') return
    if (ligar !== true) return void a.ouvindo.delete(qual)
    a.ouvindo.add(qual)
    if (qual === 'tema' && temas.has(host.id)) enviar(a, 'tema', { tokens: temas.get(host.id) })
    if (qual === 'recado') entregarRespostasGuardadas(a)
    if (qual === 'quadro') a.ultimoQuadro = undefined
    ligarRelogio()
  })
  guest.on('unresponsive', () => {
    if (a.semResposta) return
    a.semResposta = setTimeout(() => derrubar(a, 'travou'), 5000)
  })
  guest.on('responsive', () => {
    if (a.semResposta) clearTimeout(a.semResposta)
    a.semResposta = undefined
  })
  guest.on('render-process-gone', (_evento, detalhes) => {
    const motivo = a.derrubada ?? (detalhes.reason === 'oom' ? 'memoria' : detalhes.reason === 'clean-exit' ? null : 'caiu')
    a.derrubada = undefined
    if (motivo) anotarQuedaDe(a, motivo)
  })
  guest.once('destroyed', () => {
    if (a.semResposta) clearTimeout(a.semResposta)
    a.corte.cortar()
    abertas.delete(guest.id)
    // sair da página descarrega: nada do navegador dela fica para a próxima vez (nem na memória). A cópia conferida
    // também sai (até 5 MB por página); reabrir relê o disco e confere o hash de novo. Os dados vão já ao disco.
    if (abertasDa(id).length) return
    void session.fromPartition(`pagina-${id}`).clearStorageData().catch(() => {})
    carregadas.delete(id)
    descarga.ja(id)
  })
  ligarRelogio()
}

function derrubar(a: Aberta, motivo: MotivoDeQueda): void {
  if (a.guest.isDestroyed() || a.derrubada) return
  a.derrubada = motivo
  try {
    a.guest.forcefullyCrashRenderer()
  } catch {
    a.derrubada = undefined
  }
}

function anotarQuedaDe(a: Aberta, motivo: MotivoDeQueda): void {
  a.sondaDesde = undefined
  a.cpuAlta = 0
  try {
    if (paginaDe(a.id)) mudarPagina(a.id, (p) => anotarQueda(p, motivo, Date.now()))
  } catch {
    // registro só leitura: a moldura ainda recebe o aviso
  }
  avisar(a.host, { tipo: 'pagina-caiu', id: a.id, motivo })
}

// ---------------------------------------------------------------- o relógio (vigia e eventos de quadro)

const VIGIA_MS = 5000
const MEMORIA_KB = 400 * 1024
const CPU_ALTA = 90
const CPU_ALTA_MS = 30_000
/** Mundo isolado só da sonda de vida (o 999 é do preload). */
const MUNDO_DA_SONDA = 1001

let relogio: NodeJS.Timeout | null = null
let passos = 0

function ligarRelogio(): void {
  if (relogio || !abertas.size) return
  relogio = setInterval(() => void passo(), 1000)
  relogio.unref?.()
}

async function passo(): Promise<void> {
  if (!abertas.size) {
    if (relogio) clearInterval(relogio)
    relogio = null
    return
  }
  passos++
  if (passos % (VIGIA_MS / 1000) === 0) vigiar()
  // ler as telas para o resumo pode passar de 1 s: um passo não atropela o outro
  if (mandando) return
  mandando = true
  try {
    await mandarQuadros()
  } finally {
    mandando = false
  }
}

let mandando = false

/** Travada (sonda sem resposta em 5 s), memória acima de 400 MB, CPU acima de 90% por 30 s: derruba. */
function vigiar(): void {
  const metricas = app.getAppMetrics()
  const agora = Date.now()
  for (const a of abertas.values()) {
    if (a.guest.isDestroyed() || a.derrubada || a.guest.isCrashed()) continue
    const pid = a.guest.getOSProcessId()
    const m = metricas.find((x) => x.pid === pid)
    if (m && m.memory.workingSetSize > MEMORIA_KB) {
      derrubar(a, 'memoria')
      continue
    }
    a.cpuAlta = m && m.cpu.percentCPUUsage > CPU_ALTA ? a.cpuAlta + VIGIA_MS : 0
    if (a.cpuAlta >= CPU_ALTA_MS) {
      derrubar(a, 'cpu')
      continue
    }
    // o `unresponsive` do Chromium só vem com entrada do usuário; a sonda pega o laço infinito sem ninguém mexer
    if (a.sondaDesde !== undefined) {
      if (agora - a.sondaDesde >= VIGIA_MS) derrubar(a, 'travou')
      continue
    }
    a.sondaDesde = agora
    a.guest
      .executeJavaScriptInIsolatedWorld(MUNDO_DA_SONDA, [{ code: '1' }])
      .then(() => (a.sondaDesde = undefined))
      .catch(() => (a.sondaDesde = undefined))
  }
}

async function mandarQuadros(): Promise<void> {
  const porEspaco = new Map<string | null, Promise<ResumoDoQuadroParaPagina>>()
  for (const a of abertas.values()) {
    if (!a.ouvindo.has('quadro') || a.guest.isDestroyed()) continue
    const p = ativa(a.id)
    if (!p || !efetivasDe(p).includes('quadro')) continue
    const espaco = espacoDaJanela(a.host.id)
    if (!porEspaco.has(espaco)) porEspaco.set(espaco, resumoDoQuadro(espaco))
    const resumo = await porEspaco.get(espaco)!
    const texto = JSON.stringify(resumo)
    if (texto === a.ultimoQuadro) continue
    a.ultimoQuadro = texto
    enviar(a, 'quadro', resumo)
  }
}

// ================================================================ a API orkPagina (no main)

const agora = (): number => Date.now()
const baldeGeral = criarBalde(20, 1000, agora)
const baldeQuadro = criarBalde(2, 1000, agora)
const baldeAgentes = criarBalde(2, 1000, agora)
const baldeLocal = criarBalde(2, 1000, agora)
const baldeGravar = criarBalde(10, 1000, agora)
const baldeRecadoPorAgente = criarBalde(1, 10_000, agora)
const baldeRecadoPorHora = criarBalde(30, 3_600_000, agora)

/**
 * (1.9.7) A `api` das páginas: 60 pedidos por minuto por página, 20 s, 2 MB e o registro dos últimos 100. O cofre é
 * lido na hora de cada pedido (o `cofreDeCredenciais` de main/fluxos nasce quando aquele módulo carrega).
 */
const apiDasPaginas = criarApiDasPaginas({
  cofre: {
    paraPedidoPorId: (id, url, metodo) => cofreDeCredenciais.paraPedidoPorId(id, url, metodo),
    listar: () => cofreDeCredenciais.listar()
  },
  // (C5a) o registro dos servidores de fora, lido na hora de cada chamada (mesmo motivo do cofre)
  mcp: {
    servidores: () => registroMcpFora.listar().map((s) => ({ id: s.id, nome: s.nome, ...(s.situacao === 'precisa-login' ? { precisaLogin: true } : {}) })),
    ferramentasConhecidas: (id) => registroMcpFora.ferramentas(id),
    ferramentasParaUso: (id) => registroMcpFora.ferramentasParaUso(id),
    chamar: (id, ferramenta, argumentos, opcoes) => registroMcpFora.chamar(id, ferramenta, argumentos, opcoes),
    segredosDe: (id) => registroMcpFora.segredosDe(id)
  }
})

function nomeDoEspaco(espacoId: string | null): { id: string; nome: string } | null {
  if (!espacoId) return null
  const e = resumosDosEspacos().find((x) => x.id === espacoId)
  return e ? { id: e.id, nome: e.nome } : null
}

async function agenteParaPagina(s: Sessao): Promise<AgenteParaPagina> {
  return {
    id: s.id,
    nome: s.espec.nome,
    motor: s.espec.agente,
    ...(s.espec.funcao ? { funcao: s.espec.funcao } : {}),
    situacao: s.processo ? situacaoNaTela(s, await telaDe(s, 80)) : 'encerrado',
    fila: caixa.resumo(s.id).fila
  }
}

/** Nomes e situação dos agentes do espaço e as cordas entre eles. Nada de tela, caminho ou nota. */
async function resumoDoQuadro(espacoId: string | null): Promise<ResumoDoQuadroParaPagina> {
  if (!espacoId) return { espaco: null, agentes: [], cordas: [] }
  const agentes = await Promise.all(sessoesDoEspaco(espacoId).map(agenteParaPagina))
  const ids = new Set(agentes.map((x) => x.id))
  return { espaco: nomeDoEspaco(espacoId), agentes, cordas: cordasDoEspaco(espacoId).filter(([de, para]) => ids.has(de) && ids.has(para)) }
}

/** Chave geral, página ativa e carregada, janela viva e (se pedida) a permissão efetiva. A cada chamada. */
function conferir(a: Aberta, permissao?: 'quadro' | 'recado' | 'local'): PaginaRegistrada {
  const p = ativa(a.id)
  if (!p) throw new Error('a página está desligada')
  if (!carregadas.has(a.id)) throw new Error('a página precisa ser revista')
  if (a.host.isDestroyed()) throw new Error('a janela fechou')
  if (permissao) {
    const efetivas = efetivasDe(p)
    const tem = permissao === 'local' ? efetivas.some((f) => f.startsWith('local:')) : efetivas.includes(permissao)
    if (!tem) throw new Error(`a página não tem a permissão "${permissao}"`)
  }
  return p
}

const exigir = (ok: boolean, erro: string): void => {
  if (!ok) throw new Error(erro)
}

async function chamar(a: Aberta, metodo: string, args: unknown[]): Promise<unknown> {
  exigir(baldeGeral.tirar(a.id), 'chamadas demais: espere um pouco')
  const espacoId = (): string | null => espacoDaJanela(a.host.id)
  switch (metodo) {
    case 'eu': {
      const p = conferir(a)
      return { id: p.id, nome: p.nome, versao: p.versao, permissoes: efetivasDe(p), espaco: nomeDoEspaco(espacoId()) }
    }
    case 'quadro': {
      conferir(a, 'quadro')
      exigir(baldeQuadro.tirar(a.id), 'quadro.resumo: no máximo 2 por segundo')
      return resumoDoQuadro(espacoId())
    }
    case 'agentes': {
      const p = conferir(a, 'recado')
      exigir(baldeAgentes.tirar(a.id), 'agentes: no máximo 2 por segundo')
      const espaco = espacoId()
      const ligados = p.cordas.filter((c) => c.espacoId === espaco).map((c) => sessaoPorId(c.cartaoId)).filter((s): s is Sessao => !!s && s.espacoId === espaco && !s.fim)
      return Promise.all(ligados.map(agenteParaPagina))
    }
    case 'recado': {
      const p = conferir(a, 'recado')
      const [agenteId, texto] = args
      exigir(typeof agenteId === 'string' && agenteId.length <= 64, 'agente inválido')
      exigir(typeof texto === 'string' && texto.length <= LIMITES.recadoBytes && bytesDe(texto) <= LIMITES.recadoBytes, `o recado passa de ${LIMITES.recadoBytes / 1024} KB`)
      const limpo = limparTextoDoRecado(texto as string)
      exigir(limpo.length > 0, 'o recado está vazio')
      const espaco = espacoId()
      exigir(!!espaco && p.cordas.some((c) => c.espacoId === espaco && c.cartaoId === agenteId), 'este agente não está ligado à página')
      const alvo = sessaoPorId(agenteId as string)
      exigir(!!alvo && alvo.espacoId === espaco && !alvo.fim && !!alvo.processo, 'o agente não está rodando')
      exigir(alvo!.espec.agente === 'claude' || alvo!.espec.agente === 'codex', 'recado só vai para agente Claude ou Codex')
      exigir(baldeRecadoPorAgente.tirar(`${a.id}|${agenteId}`), 'um recado por agente a cada 10 segundos')
      exigir(baldeRecadoPorHora.tirar(a.id), 'no máximo 30 recados por hora')
      const r = caixa.enfileirar({ tipo: 'pagina', de: null, deNome: p.nome, para: alvo!.id, texto: limpo })
      void caixa.rodada()
      return { posicao: r.posicao }
    }
    case 'dados-ler': {
      conferir(a)
      const [k] = args
      const dados = dadosDe(a.id)
      return typeof k === 'string' && Object.hasOwn(dados, k) ? dados[k] : null
    }
    case 'dados-chaves':
      conferir(a)
      return Object.keys(dadosDe(a.id))
    case 'dados-gravar': {
      conferir(a)
      exigir(baldeGravar.tirar(a.id), 'dados.gravar: no máximo 10 por segundo')
      const r = gravarDado(dadosDe(a.id), args[0], args[1])
      if (!r.ok) throw new Error(r.erro)
      gravarDados(a.id, r.valor)
      return null
    }
    case 'dados-apagar': {
      conferir(a)
      exigir(baldeGravar.tirar(a.id), 'dados.apagar: no máximo 10 por segundo')
      const atuais = { ...dadosDe(a.id) }
      if (typeof args[0] === 'string' && Object.hasOwn(atuais, args[0])) {
        delete atuais[args[0]]
        gravarDados(a.id, atuais)
      }
      return null
    }
    case 'local-ler': {
      const p = conferir(a, 'local')
      exigir(baldeLocal.tirar(a.id), 'local.ler: no máximo 2 por segundo')
      const url = urlLocal(args[0], efetivasDe(p))
      if (!url.ok) throw new Error(url.erro)
      return lerLocal(url.valor)
    }
    // (1.9.7) os acessos lidos agora: desmarcar uma API, um servidor ou uma ferramenta vale já na próxima chamada
    case METODOS_API_MCP_DA_PAGINA.apiDisponiveis:
      return apiDasPaginas.disponiveis(paraApi(conferir(a)))
    case METODOS_API_MCP_DA_PAGINA.mcpDisponiveis:
      return apiDasPaginas.mcpDisponiveis(paraApi(conferir(a)))
    case METODOS_API_MCP_DA_PAGINA.mcpFerramentas:
      return apiDasPaginas.mcpFerramentas(paraApi(conferir(a)), args[0])
    case METODOS_API_MCP_DA_PAGINA.mcpChamar:
      return apiDasPaginas.mcpChamar(paraApi(conferir(a)), args[0], args[1], args[2], a.corte.sinal())
    case METODOS_API_MCP_DA_PAGINA.apiPedir:
      return apiDasPaginas.pedir(paraApi(conferir(a)), args[0], args[1], a.corte.sinal())
    default:
      throw new Error('chamada desconhecida')
  }
}

// ---------------------------------------------------------------- dados da página (1 MB, fora da pasta servida)

const dadosEmMemoria = new Map<string, Record<string, unknown>>()
const arquivoDeDados = (id: string): string => join(PASTA_DADOS_DAS_PAGINAS, `${id}.json`)

function dadosDe(id: string): Record<string, unknown> {
  const ja = dadosEmMemoria.get(id)
  if (ja) return ja
  let dados: Record<string, unknown> = {}
  try {
    const texto = readFileSync(arquivoDeDados(id), 'utf8')
    if (bytesDe(texto) <= LIMITES.dadosBytes * 2) dados = lerDados(JSON.parse(texto))
  } catch {
    // primeira vez, ou arquivo quebrado: começa vazio
  }
  dadosEmMemoria.set(id, dados)
  return dados
}

/**
 * Gravar = memória na hora (ler já vê) + disco depois, pela descarga: assíncrono, o último ganha, no mínimo 2 s entre
 * duas escritas e no máximo 1 MB por minuto por página (revisão 195, item 4). Ao fechar a última aba da página grava
 * já; ao sair do app, síncrono (`before-quit`). Se o app cair, perde no máximo o que estava esperando a vez.
 */
function gravarDados(id: string, dados: Record<string, unknown>): void {
  dadosEmMemoria.set(id, dados)
  descarga.marcar(id, dados)
}

let escritas = 0

async function escreverDados(id: string, texto: string, situacao: () => SituacaoDaEscrita): Promise<void> {
  await mkdir(PASTA_DADOS_DAS_PAGINAS, { recursive: true })
  const temporario = `${arquivoDeDados(id)}.${process.pid}.${++escritas}.tmp`
  try {
    await writeFile(temporario, texto, 'utf8')
    if (situacao() !== 'vale') return void (await rm(temporario, { force: true }))
    await rename(temporario, arquivoDeDados(id))
  } catch (e) {
    await rm(temporario, { force: true }).catch(() => {})
    throw e
  }
  // removida enquanto escrevia: o arquivo que este rename recriou sai também
  if (situacao() === 'apagar') await rm(arquivoDeDados(id), { force: true })
}

function escreverDadosAgora(id: string, texto: string): void {
  mkdirSync(PASTA_DADOS_DAS_PAGINAS, { recursive: true })
  const temporario = `${arquivoDeDados(id)}.${process.pid}.saida.tmp`
  writeFileSync(temporario, texto, 'utf8')
  renameSync(temporario, arquivoDeDados(id))
}

const descarga = criarDescarga(escreverDados, {
  agora: () => Date.now(),
  agendar: (fn, ms) => {
    const t = setTimeout(fn, ms)
    t.unref?.()
    return t
  },
  cancelar: (t) => clearTimeout(t as NodeJS.Timeout)
})

/** Página removida: esquece memória, escrita pendente e arquivo de dados. */
function apagarDados(id: string): void {
  descarga.esquecer(id)
  dadosEmMemoria.delete(id)
  rmSync(arquivoDeDados(id), { force: true })
}

// ---------------------------------------------------------------- local (só GET, pelo main, numa porta aceita)

/** Recusa com motivo próprio (passa direto pelo catch de lerLocal). */
class ErroLocal extends Error {}

async function lerLocal(url: string): Promise<{ status: number; tipo: string; texto: string }> {
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), LIMITES.localMs)
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: controle.signal, headers: { accept: 'application/json, text/plain;q=0.9, */*;q=0.1' } })
    const tipo = (r.headers.get('content-type') ?? '').slice(0, 100)
    if (/event-stream/i.test(tipo)) {
      controle.abort()
      throw new ErroLocal('resposta em fluxo (event-stream) não é aceita')
    }
    const partes: Uint8Array[] = []
    let total = 0
    const leitor = r.body?.getReader()
    while (leitor) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.length
      if (total > LIMITES.localBytes) {
        controle.abort()
        throw new ErroLocal(`a resposta passa de ${LIMITES.localBytes / 1024 / 1024} MB`)
      }
      partes.push(value)
    }
    return { status: r.status, tipo, texto: Buffer.concat(partes).toString('utf8') }
  } catch (e) {
    if (e instanceof ErroLocal) throw e
    throw new Error(controle.signal.aborted ? 'o serviço local não respondeu em 5 s' : 'o serviço local não respondeu')
  } finally {
    clearTimeout(prazo)
  }
}

// ---------------------------------------------------------------- respostas de agente

function entregarRespostasGuardadas(a: Aberta): void {
  const p = ativa(a.id)
  if (!p || !efetivasDe(p).includes('recado')) return
  const chave = `${a.id}|${espacoDaJanela(a.host.id)}`
  const fila = respostasNaFila.get(chave)
  if (!fila?.length) return
  respostasNaFila.delete(chave)
  for (const msg of fila) enviar(a, 'recado', msg)
}

/** `ork pagina responder`: entrega já à página aberta no espaço do agente, ou guarda (≤ 20, ≤ 256 KB) até ela abrir. */
export function responderAPagina(eu: Sessao, quem: string, texto: string): string {
  const r = decidirResposta(reg().paginas, String(quem ?? ''), { espacoId: eu.espacoId, id: eu.id })
  if (!r.ok) throw new Error(r.erro)
  const p = r.valor
  if (!reg().ligadas) throw new Error('As páginas próprias estão desligadas no Orkester.')
  if (p.desligada) throw new Error(`A página "${p.nome}" está desligada.`)
  if (!efetivasDe(p).includes('recado')) throw new Error(`A página "${p.nome}" não tem a permissão de recado.`)
  const corpo = String(texto ?? '').replace(/\u0000/g, '')
  if (!corpo.trim()) throw new Error('falta o texto: ork pagina responder "<página>" "texto" (ou --arquivo resposta.md)')
  if (bytesDe(corpo) > LIMITES.respostaBytes) throw new Error(`a resposta passa de ${LIMITES.respostaBytes / 1024} KB: resuma, ou ponha o detalhe num arquivo e mande o caminho`)
  const msg = { de: { id: eu.id, nome: eu.espec.nome }, texto: corpo, em: Date.now() }
  const ouvindo = abertasDa(p.id).filter((a) => a.ouvindo.has('recado') && espacoDaJanela(a.host.id) === eu.espacoId)
  if (ouvindo.length) {
    for (const a of ouvindo) enviar(a, 'recado', msg)
    return `Entregue à página "${p.nome}".`
  }
  const chave = `${p.id}|${eu.espacoId}`
  const fila = [...(respostasNaFila.get(chave) ?? []), msg]
  while (fila.length > LIMITES.filaDeRespostas || bytesDe(JSON.stringify(fila)) > LIMITES.filaDeRespostasBytes) fila.shift()
  respostasNaFila.set(chave, fila)
  return `A página está fechada: guardei (${fila.length} na fila).`
}

// ================================================================ o que a janela pede (Conexões, moldura, aceite)

/** (R5 S2) As sugestões `api`/`mcp` do manifesto da cópia aceita, por hash (a cópia só muda com novo aceite). */
const sugestoesDaCopia = new Map<string, { hash: string; sugestoes: SugestaoDePagina[] }>()

function sugestoesDaPagina(p: PaginaRegistrada): SugestaoDePagina[] {
  const guardada = sugestoesDaCopia.get(p.id)
  if (guardada && guardada.hash === p.hash) return guardada.sugestoes
  let sugestoes: SugestaoDePagina[] = []
  try {
    const bruto = readFileSync(join(pastaDaCopia(p.id), 'manifesto.json'))
    if (bruto.length <= 64 * 1024) {
      const m = validarManifesto(JSON.parse(bruto.toString('utf8').replace(/^﻿/, '')))
      if (m.ok) sugestoes = sugestoesDe(m.valor)
    }
  } catch {
    // cópia sumida ou manifesto ilegível: sem sugestões (a pendência já avisa o resto)
  }
  sugestoesDaCopia.set(p.id, { hash: p.hash, sugestoes })
  return sugestoes
}

/** (1.9.7) `ctx`: APIs e servidores lidos uma vez por lista (os `usos` com nome e "sumiu"). */
function resumir(p: PaginaRegistrada, ctx: ContextoDosAcessos = contextoDosAcessos()): ResumoDePagina {
  const espacos = resumosDosEspacos()
  const pendente = pendenciaDe(p)
  const ultima = p.quedas[p.quedas.length - 1]
  // só quando a cópia ainda é a aceita: se mudou fora, o manifesto lido não é o que o Luís aceitou
  const sugestoes = pendente ? [] : sugestoesDaPagina(p)
  return {
    id: p.id,
    nome: p.nome,
    versao: p.versao,
    descricao: p.descricao,
    icone: p.icone,
    origem: p.origem,
    pedidas: p.pedidas,
    aceitas: p.aceitas,
    recusadas: p.recusadas,
    ...(pendente ? { pendente } : {}),
    ...(p.desligada ? { desligada: p.desligada } : {}),
    cordas: p.cordas.map((c) => ({
      ...c,
      espacoNome: espacos.find((e) => e.id === c.espacoId)?.nome ?? '(espaço apagado)',
      cartaoNome: sessaoPorId(c.cartaoId)?.espec.nome ?? '(cartão fechado)'
    })),
    ...(ultima ? { ultimaQueda: ultima } : {}),
    ...(p.acessos ? { acessos: p.acessos, usos: usosDe(p.acessos, ctx.apis, ctx.servidores) } : {}),
    ...(sugestoes.length ? { sugestoes } : {})
  }
}

const tentar = (fn: () => void): ResultadoDePaginas => {
  try {
    fn()
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagem(e) }
  }
}

const idValido = (id: unknown): id is string => typeof id === 'string' && ID_DE_PAGINA.test(id)

function exigirPagina(id: unknown): PaginaRegistrada {
  if (!idValido(id) || !paginaDe(id)) throw new Error('página não instalada')
  return paginaDe(id)!
}

/**
 * (1.9.7) O cartão da página troca o que ela enxerga: conferido (existe, escrita ≤ teto da API, `atende` único, nada
 * com rede/local); depois corta os pedidos em curso e recarrega a página aberta. Só pelo ipcMain (ipcSeguro) e pelo
 * autoteste: a página não tem como chamar isto.
 */
function definirAcessos(id: unknown, acessos: unknown): void {
  const p = exigirPagina(id)
  const conferidos = conferirAcessos(acessos ?? {}, contextoDosAcessos(bloqueioDasFichas(p.pedidas)))
  if (!conferidos.ok) throw new Error(conferidos.erro)
  const novos = conferidos.valor.api || conferidos.valor.mcp ? conferidos.valor : undefined
  mudarPagina(p.id, ({ acessos: _antes, ...x }) => ({ ...x, ...(novos ? { acessos: novos } : {}) }))
  recarregarAbertas(p.id)
}

function exigirPermissaoPedida(p: PaginaRegistrada, permissao: unknown): string {
  if (typeof permissao !== 'string' || !lerPermissao(permissao) || !p.pedidas.includes(permissao)) throw new Error('permissão desconhecida para esta página')
  return permissao
}

/** Tokens do tema mandados pela janela: só `--nome: valor` curtos (vão à página como dado). */
function lerTokens(bruto: unknown): Record<string, string> | null {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null
  const saida: Record<string, string> = {}
  for (const [k, v] of Object.entries(bruto).slice(0, 300)) {
    if (/^--[A-Za-z0-9-]{1,80}$/.test(k) && typeof v === 'string' && v.length <= 200 && !/[<>{};\\]/.test(v)) saida[k] = v
  }
  return saida
}

/** Pasta que o autoteste injeta no lugar do diálogo nativo (só com --autoteste). */
let pastaDoTeste: string | null = null
/** O cenário "paginas" (autoteste/27-paginas.ts) põe a pasta da fixture aqui; só vale com --autoteste. */
const VARIAVEL_DA_PASTA_DE_TESTE = 'ORK_AUTOTESTE_PASTA_DA_PAGINA'

/**
 * Exemplos que vão embutidos no app: no pacote, `resources/exemplos/paginas/<nome>` (package.json `build.extraResources`);
 * no desenvolvimento, `app/exemplos/paginas/<nome>`. A janela manda só o NOME de um desta lista; o caminho é montado aqui
 * e a pasta passa pelo MESMO funil do "Escolher pasta…" (varredura sem executar, manifesto, proposta, aceite, cópia
 * conferida de novo). Nada é instalado sem o aceite.
 */
const EXEMPLOS_DE_PAGINA: readonly string[] = ['resumo-do-espaco', 'eco-de-api']

function pastaDoExemplo(nome: unknown): string | null {
  if (typeof nome !== 'string' || !EXEMPLOS_DE_PAGINA.includes(nome)) return null
  const base = app.isPackaged ? join(process.resourcesPath, 'exemplos', 'paginas') : join(app.getAppPath(), 'exemplos', 'paginas')
  return join(base, nome)
}

export function registrarPaginas(): void {
  ipcMain.handle(CANAIS_PAGINAS.listar, () => ({
    ligadas: reg().ligadas,
    paginas: ((ctx) => reg().paginas.map((p) => resumir(p, ctx)))(contextoDosAcessos()),
    ...(soLeitura ? { soLeitura } : {})
  }))

  ipcMain.handle(CANAIS_PAGINAS.escolherPasta, async (evento: IpcMainInvokeEvent): Promise<RespostaDaProposta> => {
    if (!reg().ligadas) return { ok: false, erro: 'Ligue "Páginas próprias" antes, em Configurações › Conexões › Páginas.' }
    let pasta: string | undefined
    // autoteste: a pasta vem do cenário (paginasNoTeste.usarPasta, uma vez; ou a variável de ambiente do cenário "paginas")
    const doTeste = AUTOTESTE ? (pastaDoTeste ?? process.env[VARIAVEL_DA_PASTA_DE_TESTE] ?? null) : null
    if (doTeste) {
      pasta = doTeste
      pastaDoTeste = null
    } else {
      const janela = BrowserWindow.fromWebContents(evento.sender)
      const opcoes = { title: 'Escolha a pasta da página', properties: ['openDirectory' as const] }
      const r = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes)
      if (r.canceled || !r.filePaths[0]) return { ok: false, erro: '', cancelado: true }
      pasta = r.filePaths[0]
    }
    return proporDaPasta(pasta)
  })

  ipcMain.handle(CANAIS_PAGINAS.adicionarExemplo, (_e, nome: unknown): RespostaDaProposta => {
    const pasta = pastaDoExemplo(nome)
    return pasta ? proporDaPasta(pasta) : { ok: false, erro: 'exemplo desconhecido' }
  })
  ipcMain.handle(CANAIS_PAGINAS.aceitar, (_e, token: unknown, acessos: unknown) => aceitarProposta(String(token), acessos))
  ipcMain.handle(CANAIS_PAGINAS.recusar, (_e, token: unknown) => void propostas.delete(String(token)))
  ipcMain.handle(CANAIS_PAGINAS.rever, (_e, id: unknown): RespostaDaProposta => (idValido(id) ? proporRever(id) : { ok: false, erro: 'página não instalada' }))
  ipcMain.handle(CANAIS_PAGINAS.atualizar, (_e, id: unknown): RespostaDaProposta => {
    if (!idValido(id) || !paginaDe(id)) return { ok: false, erro: 'página não instalada' }
    return proporDaPasta(paginaDe(id)!.origem, id)
  })

  ipcMain.handle(CANAIS_PAGINAS.revogar, (_e, id: unknown, permissao: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      const f = exigirPermissaoPedida(p, permissao)
      mudarPagina(p.id, (x) => ({ ...x, aceitas: x.aceitas.filter((a) => a !== f), recusadas: [...new Set([...x.recusadas, f])] }))
      // `rede`: o webRequest já corta agora; a CSP nova vem na recarga
      recarregarAbertas(p.id)
    })
  )
  ipcMain.handle(CANAIS_PAGINAS.permitirDeNovo, (_e, id: unknown, permissao: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      const f = exigirPermissaoPedida(p, permissao)
      mudarPagina(p.id, (x) => ({ ...x, aceitas: [...new Set([...x.aceitas, f])], recusadas: x.recusadas.filter((r) => r !== f) }))
      recarregarAbertas(p.id)
    })
  )

  // (1.9.7) O cartão da página troca o que ela enxerga: conferido (existe, escrita ≤ teto da API, `atende` único, nada
  // com rede/local); corta os pedidos em curso e recarrega a página aberta
  ipcMain.handle(CANAIS_PAGINAS.definirAcessos, (_e, id: unknown, acessos: unknown) => tentar(() => definirAcessos(id, acessos)))
  ipcMain.handle(CANAIS_PAGINAS.pedidos, (_e, id: unknown): PedidoDaPagina[] => (idValido(id) ? apiDasPaginas.pedidos(id) : []))

  ipcMain.handle(CANAIS_PAGINAS.ligarCorda,(_e, id: unknown, espacoId: unknown, cartaoId: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      if (typeof espacoId !== 'string' || !idsDosEspacos().includes(espacoId)) throw new Error('espaço desconhecido')
      const s = typeof cartaoId === 'string' ? sessaoPorId(cartaoId) : undefined
      if (!s || s.espacoId !== espacoId) throw new Error('o cartão não está rodando neste espaço')
      if (s.espec.agente !== 'claude' && s.espec.agente !== 'codex') throw new Error('só cartão de Claude ou Codex se liga a uma página')
      if (p.cordas.some((c) => c.espacoId === espacoId && c.cartaoId === s.id)) return
      if (p.cordas.length >= LIMITES.cordas) throw new Error(`no máximo ${LIMITES.cordas} cordas por página`)
      mudarPagina(p.id, (x) => ({ ...x, cordas: [...x.cordas, { espacoId, cartaoId: s.id }] }))
    })
  )
  ipcMain.handle(CANAIS_PAGINAS.desligarCorda, (_e, id: unknown, espacoId: unknown, cartaoId: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      mudarPagina(p.id, (x) => ({ ...x, cordas: x.cordas.filter((c) => !(c.espacoId === espacoId && c.cartaoId === cartaoId)) }))
    })
  )

  ipcMain.handle(CANAIS_PAGINAS.chaveGeral, (_e, ligar: unknown) =>
    tentar(() => {
      mudar((r) => ({ ...r, ligadas: ligar === true }))
      if (ligar === true) return
      for (const id of [...carregadas.keys()]) descarregar(id)
      for (const id of new Set([...abertas.values()].map((a) => a.id))) esvaziarAbertas(id)
    })
  )
  ipcMain.handle(CANAIS_PAGINAS.religar, (_e, id: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      // religar zera a contagem de quedas: as três próximas em 10 min desligam de novo
      mudarPagina(p.id, ({ desligada: _d, ...x }) => ({ ...x, quedas: [] }))
    })
  )
  ipcMain.handle(CANAIS_PAGINAS.desligar, (_e, id: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      mudarPagina(p.id, (x) => ({ ...x, desligada: { motivo: 'usuario', em: Date.now() } }))
      descarregar(p.id)
      esvaziarAbertas(p.id)
    })
  )
  ipcMain.handle(CANAIS_PAGINAS.remover, (_e, id: unknown) =>
    tentar(() => {
      const p = exigirPagina(id)
      mudar((r) => ({ ...r, paginas: r.paginas.filter((x) => x.id !== p.id) }))
      descarregar(p.id)
      esvaziarAbertas(p.id)
      pendentes.delete(p.id)
      for (const chave of [...respostasNaFila.keys()]) if (chave.startsWith(`${p.id}|`)) respostasNaFila.delete(chave)
      rmSync(pastaDaCopia(p.id), { recursive: true, force: true })
      apagarDados(p.id)
      apiDasPaginas.esquecer(p.id)
      void session.fromPartition(`pagina-${p.id}`).clearStorageData().catch(() => {})
    })
  )

  // sair do app: o que a descarga ainda não pôs no disco vai agora, síncrono (o `app.exit` do prazo duro não passa aqui)
  app.on('before-quit', () => descarga.encerrar(escreverDadosAgora))

  ipcMain.on(CANAIS_PAGINAS.tema, (evento, bruto: unknown) => {
    const tokens = lerTokens(bruto)
    if (!tokens) return
    temas.set(evento.sender.id, tokens)
    for (const a of abertas.values()) if (a.host.id === evento.sender.id && a.ouvindo.has('tema')) enviar(a, 'tema', { tokens })
  })
}

// ================================================================ autoteste

/**
 * Só com --autoteste: o cenário injeta a pasta no lugar do diálogo nativo (`usarPastaNoTeste`) ou instala direto
 * (`instalarNoTeste`), e lê o que a página gravou e as quedas. O renderer continua sem mandar caminho.
 */
export const paginasNoTeste = {
  usarPasta(pasta: string): void {
    if (AUTOTESTE) pastaDoTeste = pasta
  },
  ligar(ligar: boolean): void {
    if (AUTOTESTE) mudar((r) => ({ ...r, ligadas: ligar }))
  },
  /**
   * (1.9.7) `acessos`: o que o aceite marca (as APIs e os MCPs que a página enxerga).
   */
  instalar(pasta: string, acessos?: AcessosDaPagina): ResultadoDePaginas & { id?: string } {
    if (!AUTOTESTE) return { ok: false, erro: 'só no autoteste' }
    const r = proporDaPasta(pasta)
    return r.ok ? aceitarProposta(r.proposta.token, acessos) : r
  },
  /** (1.9.7) O mesmo que o cartão faz em Conexões › Páginas. */
  definirAcessos(id: string, acessos: AcessosDaPagina): ResultadoDePaginas {
    if (!AUTOTESTE) return { ok: false, erro: 'só no autoteste' }
    return tentar(() => definirAcessos(id, acessos))
  },
  /** (1.9.7) O servidor falso no lugar da internet para a `api` das páginas. Fora do autoteste, lança. */
  trocarRedeDaApi(rede: RedeDaApi): void {
    apiDasPaginas.trocarRedeNoTeste(rede)
  },
  pedidos: (id: string): PedidoDaPagina[] => (AUTOTESTE ? apiDasPaginas.pedidos(id) : []),
  dados: (id: string): Record<string, unknown> => (AUTOTESTE ? { ...dadosDe(id) } : {}),
  pagina: (id: string): PaginaRegistrada | undefined => (AUTOTESTE ? paginaDe(id) : undefined),
  abertas: (id: string): WebContents[] => (AUTOTESTE ? abertasDa(id).map((a) => a.guest) : []),
  downloadsBarrados: (): number => downloadsBarrados,
  remover(id: string): void {
    if (!AUTOTESTE || !paginaDe(id)) return
    mudar((r) => ({ ...r, paginas: r.paginas.filter((x) => x.id !== id) }))
    descarregar(id)
    rmSync(pastaDaCopia(id), { recursive: true, force: true })
    apagarDados(id)
    apiDasPaginas.esquecer(id)
  }
}
