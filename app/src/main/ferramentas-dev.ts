import { app, type BrowserWindow } from 'electron'

/**
 * Ferramentas de quem desenvolve o app (autoteste e medição de memória). Elas não vão para o GitHub: quem baixa
 * o código só precisa compilar e usar. O `import.meta.glob` eager resolve na hora do build — se a pasta/arquivo
 * existe, entra no bundle exatamente como entrava antes (import estático); se não existe, vem vazio e o app
 * compila igual, sem essas ferramentas.
 */
type Autoteste = (janela: BrowserWindow, pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>) => Promise<void>

const autotestes = import.meta.glob<{ rodarAutoteste: Autoteste }>('./autoteste/index.ts', { eager: true })
const medicoes = import.meta.glob<{ rodarMedicao: () => Promise<void> }>('./medir.ts', { eager: true })

const SEM_FERRAMENTA = 'Esta versão do Orkester não traz as ferramentas de desenvolvimento (autoteste e medição).'

/** Sem as ferramentas: avisa e sai com erro, em vez de rejeitar uma promessa que ninguém espera (o app ficaria pendurado). */
function semFerramenta(): void {
  console.error(SEM_FERRAMENTA)
  app.exit(1)
}

export async function rodarAutoteste(janela: BrowserWindow, pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>): Promise<void> {
  const modulo = Object.values(autotestes)[0]
  if (!modulo) return semFerramenta()
  return modulo.rodarAutoteste(janela, pedirSalvamento)
}

export async function rodarMedicao(): Promise<void> {
  const modulo = Object.values(medicoes)[0]
  if (!modulo) return semFerramenta()
  return modulo.rodarMedicao()
}
