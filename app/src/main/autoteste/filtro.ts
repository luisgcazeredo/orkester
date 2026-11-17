// Escolha dos cenários pelo ORK_CENARIOS. Puro (sem electron): a prova importa este arquivo.
// O casamento é por nome EXATO: `ork` é o cenário `ork`, não os 11 que têm "ork" no nome. Quem quiser
// vários passa a lista (`ork,ork-correio`). O que o cenário pedido depende (`depende`) entra em cadeia.
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { basename } from 'node:path'

export interface CenarioFiltravel {
  nome: string
  depende?: string
}

export interface Escolha<T extends CenarioFiltravel> {
  selecionados: T[]
  /** nomes pedidos que não são nenhum cenário: o autoteste tem de FALHAR por eles, nunca "passar com 0". */
  semPar: string[]
  /** pedidos que ainda não existem mas estão em `aguardando` (outra tarefa vai criá-los): pulados com AVISO, não reprovam. */
  adiados: string[]
}

export function nomesPedidos(bruto: string | undefined): string[] {
  return (bruto ?? '')
    .split(',')
    .map((nome) => nome.trim().toLocaleLowerCase())
    .filter(Boolean)
}

export function escolherCenarios<T extends CenarioFiltravel>(cenarios: T[], bruto: string | undefined, aguardando: string[] = []): Escolha<T> {
  const filtro = nomesPedidos(bruto)
  if (!filtro.length) return { selecionados: cenarios, semPar: [], adiados: [] }
  const existentes = new Set(cenarios.map((cenario) => cenario.nome.toLocaleLowerCase()))
  const esperados = new Set(aguardando.map((nome) => nome.toLocaleLowerCase()))
  const ausentes = filtro.filter((nome) => !existentes.has(nome))
  const adiados = ausentes.filter((nome) => esperados.has(nome))
  const semPar = ausentes.filter((nome) => !esperados.has(nome))
  const pedidos = new Set(cenarios.filter((cenario) => filtro.includes(cenario.nome.toLocaleLowerCase())).map((cenario) => cenario.nome))
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const cenario of cenarios) {
      if (pedidos.has(cenario.nome) && cenario.depende && !pedidos.has(cenario.depende)) {
        pedidos.add(cenario.depende)
        mudou = true
      }
    }
  }
  return { selecionados: cenarios.filter((cenario) => pedidos.has(cenario.nome)), semPar, adiados }
}

/**
 * Apaga a pasta do Chromium DESTA rodada (`orkester-autoteste-chromium-<pid>`). `app.exit` não dispara
 * `process.on('exit')`, então o autoteste chama isto antes de sair. Só mexe se o nome for exatamente o do
 * próprio pid: nunca a de outra rodada, nunca a do app.
 * No Windows o próprio Chromium ainda segura arquivos da pasta (GPUCache…) enquanto o processo vive: o rm
 * de dentro falha. Então, se sobrou, um filho solto espera este pid morrer e apaga.
 * 'apagada' = sumiu agora · 'depois' = um filho apaga quando o processo sair · 'recusada' = nome não é o desta rodada.
 */
export function apagarChromiumDaRodada(pasta: string, pid: number): 'apagada' | 'depois' | 'recusada' {
  if (basename(pasta) !== `orkester-autoteste-chromium-${pid}`) return 'recusada'
  try {
    rmSync(pasta, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    // segue para o filho
  }
  if (!existsSync(pasta)) return 'apagada'
  const roteiro = `const [pid, pasta] = process.argv.slice(1);
    const vivo = () => { try { process.kill(Number(pid), 0); return true } catch (e) { return e.code === 'EPERM' } };
    let n = 0;
    const t = setInterval(() => {
      if (vivo() && ++n < 120) return;
      try { require('node:fs').rmSync(pasta, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {}
      clearInterval(t)
    }, 500)`
  spawn(process.execPath, ['-e', roteiro, String(pid), pasta], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }).unref()
  return 'depois'
}
