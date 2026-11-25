// MCP de fora (1.9.7, Revisão C achado 1 e reconferência R1/R3): matar a ÁRVORE de um servidor stdio e CONFERIR que
// ela morreu, sem nunca matar processo alheio e sem segurar a saída do app.
//
// Antes, o cliente chamava `taskkill /T /F` e ignorava o resultado. Se o taskkill falhava (negado, bloqueado por um
// sandbox) ou se o `cmd` raiz já tinha morrido (servidor que caiu: o `/T` de um pid morto não acha os filhos), o node e
// os netos ficavam vivos e a conexão contava como fechada.
//
// Regras:
// - **Só se mata o que é conferidamente nosso** (R3). A raiz é nossa se ainda é o processo filho do Node (`raizNossa`:
//   enquanto o Node segura o handle do filho, o Windows não reaproveita o pid) ou se pid + hora de nascimento batem
//   com o anotado. Os descendentes saem só de pids conferidos, pelo pai e nascidos depois dele; com a raiz já morta
//   (fora da lista), os filhos dela nascidos depois da subida também. `taskkill /T` só numa raiz conferida.
// - **Reserva:** quem segue vivo morre por pid (`process.kill`, TerminateProcess), também conferido antes.
// - **A resposta diz se tudo morreu (conferido) e quem sobrou.** Sem lista do sistema: não conferido.
// - **Saída do app (síncrona, R1):** um `taskkill` só para todas as raízes vivas e nossas (prazo curto); a lista do
//   sistema só se precisar (taskkill falhou, raiz que não é mais filho, restos, conhecido ainda de pé), com prazo
//   curto. O pior caso cabe com folga no prazo duro de 5 s do `sairDoApp`.
import { execFile, spawnSync } from 'node:child_process'
import { join } from 'node:path'

export interface Processo {
  pid: number
  pai: number
  /** Quando nasceu, em ms (0 = desconhecido: nunca conta como nosso). */
  nasceu: number
}

/** O que o sistema operacional oferece (trocável nas provas). */
export interface SistemaDeProcessos {
  /** Todos os processos; `null` = não deu para listar (ou passou do prazo). */
  listar(): Promise<Processo[] | null>
  listarJa(prazoMs: number): Processo[] | null
  /** `taskkill /PID raiz /T /F`; `true` = terminou sem erro. */
  matarArvore(raiz: number): Promise<boolean>
  /** Um `taskkill` só para várias raízes, síncrono e com prazo. */
  matarArvoresJa(raizes: readonly number[], prazoMs: number): boolean
  /** Mata um processo só, pelo pid (reserva). */
  matarUm(pid: number): void
  /** O pid existe (pode ser outro processo com o mesmo pid). */
  existe(pid: number): boolean
}

/** Uma árvore a matar. */
export interface AlvoDaArvore {
  raiz: number
  /** Quando a raiz foi aberta (ms, antes do spawn). */
  desde: number
  /** A raiz ainda é o nosso processo filho (o Node segura o handle: o pid não foi reaproveitado). */
  raizNossa: boolean
  /** Os processos vistos antes (pid + quando nasceram). */
  conhecidos?: readonly Processo[]
}

export interface ResultadoDaMorte {
  /** Todos os nossos morreram, conferido. */
  conferido: boolean
  /** Os pids que seguem vivos. */
  sobraram: number[]
  /** Os mesmos, com a hora de nascimento (para tentar de novo sem confundir com pid reaproveitado). */
  restos: Processo[]
  /** O taskkill falhou (ou não pôde ser usado) e a reserva por pid entrou. */
  reserva: boolean
}

/** Folga entre o relógio do Node e o do sistema. */
const FOLGA_MS = 2000
/** Mesmo processo: o mesmo pid e a mesma hora de nascimento (com folga de arredondamento). */
const MESMA_HORA_MS = 1000
const ESPERA_MS = 3000
/** Saída do app: prazo de cada passo síncrono (taskkill em lote e lista). Pior caso ≈ 2 × isto + 0,5 s. */
export const PRAZO_NA_SAIDA_MS = 1200
const PRAZO_DA_LISTA_MS = 8000

const sistemaRaiz = (): string => process.env.SystemRoot || process.env.windir || 'C:\\Windows'
const TASKKILL = (): string => join(sistemaRaiz(), 'System32', 'taskkill.exe')
const POWERSHELL = (): string => join(sistemaRaiz(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
// pid, pai e FILETIME (100 ns desde 1601) de cada processo, um por linha
const COMANDO_LISTA =
  'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $(if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 })" }'
const ARGS_LISTA = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', COMANDO_LISTA]
const DE_1601_A_1970_MS = 11_644_473_600_000n

/** Lê a saída da lista (Windows: "pid pai filetime"; outros: "pid pai lstart..."). */
export function lerLista(texto: string, windows = process.platform === 'win32'): Processo[] | null {
  const lista: Processo[] = []
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const m = /^(\d+)\s+(\d+)\s*(.*)$/.exec(linha)
    if (!m) continue
    let nasceu = 0
    if (windows) {
      if (/^\d+$/.test(m[3]) && m[3] !== '0') nasceu = Number(BigInt(m[3]) / 10_000n - DE_1601_A_1970_MS)
    } else if (m[3]) {
      const t = Date.parse(m[3])
      nasceu = Number.isFinite(t) ? t : 0
    }
    lista.push({ pid: Number(m[1]), pai: Number(m[2]), nasceu })
  }
  return lista.length ? lista : null
}

/**
 * O `taskkill` saiu com erro: foi falha de verdade ou só corrida? O `/T` mata de baixo para cima, e o `cmd /c` raiz
 * sai sozinho quando o filho dele morre; aí o taskkill não acha mais a raiz ("não há ocorrência da tarefa") e sai com
 * 128 (prova #127: sob carga, metade das vezes). O código não separa isso de "acesso negado" (negado + sumido também dá
 * 128), então decide o texto, linha a linha (as linhas sem número, como "Razão: …", não contam):
 * - toda linha com número cita o pid do próprio app como pai ("processo filho de PID <app>"): o taskkill ACHOU a raiz
 *   viva, então o `/T` já tinha varrido a árvore dela, e só a raiz sumiu no meio (R4, Revisor #127). "O processo X não
 *   foi encontrado" não cita pai: a raiz já tinha saído antes, o `/T` não varreu nada e órfãos podem seguir vivos;
 *   erro num descendente também não cita o app. Nos dois casos: falha (lista + reserva);
 * - e todo outro número dessas linhas é de processo que não existe mais (negado: o pid segue vivo → falha).
 * Sem nenhuma linha com número: falha.
 */
export function soFalhaDeQuemSumiu(saidaDeErro: string, existe: (pid: number) => boolean, proprio = process.pid): boolean {
  const linhas = saidaDeErro
    .split(/\r?\n/)
    .map((l) => [...l.matchAll(/\d+/g)].map((m) => Number(m[0])))
    .filter((ns) => ns.length > 0)
  return linhas.length > 0 && linhas.every((ns) => ns.includes(proprio) && ns.every((p) => p === proprio || (p > 0 && !existe(p))))
}

export function sistemaDoNode(): SistemaDeProcessos {
  const windows = process.platform === 'win32'
  const [prog, args] = windows ? [POWERSHELL(), ARGS_LISTA] : ['ps', ['-A', '-o', 'pid=,ppid=,lstart=']]
  return {
    listar: () =>
      new Promise((pronto) => {
        execFile(prog, args, { windowsHide: true, timeout: PRAZO_DA_LISTA_MS, maxBuffer: 8 * 1024 * 1024 }, (erro, saida) => pronto(erro ? null : lerLista(String(saida), windows)))
      }),
    listarJa: (prazoMs) => {
      const r = spawnSync(prog, args, { windowsHide: true, timeout: prazoMs, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' })
      return r.status === 0 ? lerLista(r.stdout, windows) : null
    },
    matarArvore: (raiz) =>
      new Promise((pronto) => {
        if (!windows) {
          pronto(matarPorPid(raiz))
          return
        }
        execFile(TASKKILL(), ['/PID', String(raiz), '/T', '/F'], { windowsHide: true, timeout: 10_000, encoding: 'latin1' }, (erro, _saida, saidaDeErro) =>
          // erro com código numérico = o taskkill rodou e saiu ≠ 0 (prazo e falha ao abrir não contam)
          pronto(!erro || (typeof erro.code === 'number' && !erro.killed && soFalhaDeQuemSumiu(String(saidaDeErro), existePid)))
        )
      }),
    matarArvoresJa: (raizes, prazoMs) => {
      if (!raizes.length) return true
      if (!windows) return raizes.map(matarPorPid).every(Boolean)
      const args = [...raizes.flatMap((r) => ['/PID', String(r)]), '/T', '/F']
      const r = spawnSync(TASKKILL(), args, { windowsHide: true, timeout: prazoMs, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe'], encoding: 'latin1' })
      if (r.status === 0) return true
      // passou do prazo (status null) é falha; saiu com código: só corrida se todo pid citado no erro já sumiu
      return r.status !== null && !r.error && soFalhaDeQuemSumiu(r.stderr, existePid)
    },
    matarUm: (pid) => void matarPorPid(pid),
    existe: existePid
  }
}

function existePid(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function matarPorPid(pid: number): boolean {
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

const mesmo = (a: Processo, b: Processo): boolean => a.pid === b.pid && a.nasceu > 0 && b.nasceu > 0 && Math.abs(a.nasceu - b.nasceu) < MESMA_HORA_MS

/** O mesmo processo de antes (pid e quando nasceu) está na lista? */
const aindaNaLista = (lista: readonly Processo[], p: Processo): boolean => lista.some((x) => mesmo(x, p))

/** A raiz está conferida como nossa nesta lista (ou pelo handle do filho)? Só então vale `taskkill /T` nela. */
export function raizConferida(lista: readonly Processo[] | null, alvo: AlvoDaArvore): boolean {
  if (alvo.raizNossa) return true
  if (!lista) return false
  const r = lista.find((p) => p.pid === alvo.raiz)
  return !!r && (alvo.conhecidos ?? []).some((k) => mesmo(k, r))
}

/**
 * Os processos da árvore que são conferidamente nossos na lista: a raiz (se conferida), os conhecidos que batem
 * (pid + hora), e os descendentes deles (pelo pai, nascidos depois do pai). Com a raiz fora da lista (morta, o pid
 * livre), os filhos que apontam para ela e nasceram depois da subida também.
 */
export function nossos(lista: readonly Processo[], alvo: AlvoDaArvore): Processo[] {
  const achados = new Map<number, Processo>()
  const raiz = lista.find((p) => p.pid === alvo.raiz)
  if (raiz && raiz.nasceu > 0 && raizConferida(lista, alvo)) achados.set(raiz.pid, raiz)
  for (const k of alvo.conhecidos ?? []) {
    const x = lista.find((p) => mesmo(p, k))
    if (x) achados.set(x.pid, x)
  }
  const fila = [...achados.values()]
  if (!raiz) {
    // a raiz morreu e ninguém tem o pid dela: quem aponta para ela e nasceu depois da subida é filho dela
    for (const p of lista) {
      if (p.pai === alvo.raiz && p.nasceu >= alvo.desde - FOLGA_MS && !achados.has(p.pid)) {
        achados.set(p.pid, p)
        fila.push(p)
      }
    }
  }
  while (fila.length) {
    const pai = fila.shift() as Processo
    for (const p of lista) {
      if (p.pai !== pai.pid || p.pid === pai.pid || achados.has(p.pid) || p.nasceu <= 0 || p.nasceu < pai.nasceu - FOLGA_MS) continue
      achados.set(p.pid, p)
      fila.push(p)
    }
  }
  return [...achados.values()]
}

const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
/** Espera síncrona curta (a saída do app não tem laço de eventos para esperar). */
function pausaJa(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Mata a árvore e confere (fechar um servidor: assíncrono, não segura nada). */
export async function matarEConferir(sis: SistemaDeProcessos, alvo: AlvoDaArvore): Promise<ResultadoDaMorte> {
  // a lista ANTES do taskkill: com a raiz viva, a árvore inteira
  const antes = await sis.listar()
  const alvos = antes ? nossos(antes, alvo) : []
  let reserva = true
  if (raizConferida(antes, alvo)) reserva = !(await sis.matarArvore(alvo.raiz))
  if (!antes) {
    // sem lista: só a raiz que ainda é nosso filho dá para matar; os filhos ficam sem conferência
    if (alvo.raizNossa && sis.existe(alvo.raiz)) sis.matarUm(alvo.raiz)
    await esperarSumir(sis, [alvo.raiz])
    const sobrou = alvo.raizNossa && sis.existe(alvo.raiz)
    return { conferido: false, sobraram: sobrou ? [alvo.raiz] : [], restos: [], reserva }
  }
  await esperarSumir(sis, alvos.map((p) => p.pid), reserva ? 300 : ESPERA_MS)
  let lista = await sis.listar()
  let vivos = lista ? alvos.filter((p) => aindaNaLista(lista as Processo[], p)) : alvos.filter((p) => sis.existe(p.pid))
  if (vivos.length) {
    reserva = true
    for (const p of vivos) sis.matarUm(p.pid)
    await esperarSumir(sis, vivos.map((p) => p.pid))
    lista = await sis.listar()
    vivos = lista ? vivos.filter((p) => aindaNaLista(lista as Processo[], p)) : vivos.filter((p) => sis.existe(p.pid))
  }
  return { conferido: !!lista && !vivos.length, sobraram: vivos.map((p) => p.pid), restos: vivos, reserva }
}

/**
 * Saída do app (síncrona, com prazo: R1). 1) um `taskkill` em lote nas raízes que ainda são nossos filhos; 2) a lista
 * do sistema só se precisar; 3) reserva por pid nos conferidos; sem 2ª lista (confere pelo pid, que acabou de ser
 * conferido). Pior caso ≈ 2 × `prazoMs` + 0,5 s.
 */
export function matarEConferirJa(sis: SistemaDeProcessos, alvos: readonly AlvoDaArvore[], prazoMs = PRAZO_NA_SAIDA_MS): ResultadoDaMorte {
  if (!alvos.length) return { conferido: true, sobraram: [], restos: [], reserva: false }
  const filhos = alvos.filter((a) => a.raizNossa && sis.existe(a.raiz)).map((a) => a.raiz)
  const taskkillOk = sis.matarArvoresJa(filhos, prazoMs)
  // os conhecidos que o taskkill matou podem levar alguns ms para sumir: até 300 ms antes de decidir listar
  const conhecidosDePe = (): boolean => alvos.some((a) => (a.conhecidos ?? []).some((p) => p.pid !== a.raiz && sis.existe(p.pid)))
  if (taskkillOk) {
    const ate = Date.now() + 300
    while (conhecidosDePe() && Date.now() < ate) pausaJa(20)
  }
  const precisaLista = !taskkillOk || alvos.some((a) => !a.raizNossa) || conhecidosDePe()
  if (!precisaLista) return { conferido: true, sobraram: [], restos: [], reserva: false }
  const lista = sis.listarJa(prazoMs)
  if (!lista) {
    // sem lista: só os que ainda são nossos filhos (pelo handle) morrem por pid
    for (const r of filhos) if (sis.existe(r)) sis.matarUm(r)
    pausaJa(200)
    const sobraram = filhos.filter((r) => sis.existe(r))
    return { conferido: false, sobraram, restos: [], reserva: true }
  }
  const vivos = new Map<number, Processo>()
  for (const a of alvos) for (const p of nossos(lista, a)) if (sis.existe(p.pid)) vivos.set(p.pid, p)
  for (const p of vivos.values()) sis.matarUm(p.pid)
  const fim = Date.now() + 500
  while ([...vivos.keys()].some((p) => sis.existe(p)) && Date.now() < fim) pausaJa(25)
  const restos = [...vivos.values()].filter((p) => sis.existe(p.pid))
  return { conferido: !restos.length, sobraram: restos.map((p) => p.pid), restos, reserva: !taskkillOk || vivos.size > 0 }
}

async function esperarSumir(sis: SistemaDeProcessos, pids: readonly number[], ms = ESPERA_MS): Promise<void> {
  const fim = Date.now() + ms
  while (pids.some((p) => sis.existe(p)) && Date.now() < fim) await pausa(50)
}
