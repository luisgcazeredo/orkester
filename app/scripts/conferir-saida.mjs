// Confere que o app **sai** quando a última janela fecha, e que ele não deixa a pasta do correio para trás.
//
// Por que um script e não um cenário do autoteste: o autoteste roda *dentro* do app e usa a janela como
// bancada, então ele não pode fechar a última — é justamente a transição que ninguém exercitava. Em
// 10/11/2026 o Luís fechou a janela e o processo ficou vivo, sem janela e sem ícone, impedindo até a
// instalação da atualização; a suíte inteira passava nesse build. Isto é o portão que faltava.
//
// Roda contra o app **empacotado** (release/win-unpacked), porque é o que o usuário instala, e com uma
// pasta de dados própria (ORK_DADOS), para não encostar nos espaços de verdade.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const app = join(import.meta.dirname, '..')
const exe = join(app, 'release', 'win-unpacked', 'Orkester.exe')
const PRAZO = 20_000
const ABRIR = 12_000

if (process.platform !== 'win32') {
  console.log('conferir-saida: só roda no Windows; pulei.')
  process.exit(0)
}
if (!existsSync(exe)) {
  console.error(`conferir-saida: não achei o app empacotado em ${exe}`)
  process.exit(1)
}

const dados = mkdtempSync(join(tmpdir(), 'orkester-saida-'))
// a variável tem de **sumir**, não ficar vazia: no Windows, definida-e-vazia ainda faz o Electron rodar em
// modo Node, e aí o app sobe sem janela nenhuma (foi assim que este script reprovou a si mesmo na estreia)
const ambiente = { ...process.env, ORK_DADOS: dados }
delete ambiente.ELECTRON_RUN_AS_NODE
const filho = spawn(exe, [], { env: ambiente, detached: false, stdio: 'ignore' })

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const vivo = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (erro) {
    return erro.code === 'EPERM'
  }
}

let saiuSozinho = false
filho.on('exit', () => (saiuSozinho = true))

/** A pasta de correio deste processo (o nome leva o pid, ver shared/correio.ts). */
const pastaDoCorreio = () => join(tmpdir(), `orkester-correio-${filho.pid}`)

async function conferir() {
  // 1. esperar o app abrir a janela
  const limite = Date.now() + ABRIR
  let temJanela = false
  while (Date.now() < limite && !saiuSozinho) {
    await esperar(500)
    const saida = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-Process -Id ${filho.pid} -ErrorAction SilentlyContinue).MainWindowHandle`],
      { encoding: 'utf8', windowsHide: true }
    ).trim()
    if (saida && saida !== '0') {
      temJanela = true
      break
    }
  }
  if (!temJanela) throw new Error('o app não abriu janela nenhuma em 12 s')

  // 2. fechar a janela como o usuário fecha (WM_CLOSE, sem /F)
  execFileSync('taskkill', ['/PID', String(filho.pid)], { windowsHide: true, stdio: 'ignore' })

  // 3. ele tem de sair sozinho
  const ateQuando = Date.now() + PRAZO
  while (Date.now() < ateQuando && vivo(filho.pid)) await esperar(250)
  if (vivo(filho.pid)) {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(filho.pid)], { windowsHide: true, stdio: 'ignore' })
    } catch {
      // já era
    }
    throw new Error(`a janela fechou e o processo continuou vivo depois de ${PRAZO / 1000} s`)
  }

  // 4. e não deixa os recados dos agentes no disco
  const correio = pastaDoCorreio()
  if (existsSync(correio)) {
    const quantos = readdirSync(correio).length
    throw new Error(`a pasta do correio ficou em ${correio} (${quantos} arquivo(s))`)
  }

  // 5. nem o endereço do cano (1.3): é por ele existir que o servidor MCP acha que o Orkester está aberto, e
  // um arquivo velho faria o cliente tentar um cano morto em vez de dizer "abra o app"
  const cano = join(dados, 'cano.json')
  if (existsSync(cano)) throw new Error(`o endereço do cano ficou em ${cano} depois de o app sair`)
}

try {
  await conferir()
  console.log('conferir-saida: fechou a janela e o app saiu sozinho, sem deixar correio nem endereço de cano no disco.')
} catch (erro) {
  console.error(`conferir-saida: ${erro instanceof Error ? erro.message : erro}`)
  process.exitCode = 1
} finally {
  rmSync(dados, { recursive: true, force: true })
}
