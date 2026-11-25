// Fluxos (1.9.6): o cofre das credenciais do nó HTTP (plano §4). Um arquivo global, `~/.orkester/credenciais.json`,
// com cada valor cifrado pelo cofre do sistema (`safeStorage`: no Windows, o DPAPI da conta do usuário). As regras
// (validar, montar o arquivo, domínios, cabeçalho) estão em `shared/fluxos/credenciais.ts`; aqui, só disco e cifra.
//
// - Sem `safeStorage.isEncryptionAvailable()`, criar e trocar valor são RECUSADOS: nunca se grava texto puro.
// - O IPC (a página Conexões) só recebe metadados: id, nome, tipo, cabeçalho, domínios, os 4 últimos e as datas.
// - O valor só é aberto em `paraPedido`, no main, na hora de um pedido HTTP que passou por `conferirDestino`.
// - Não há verbo de `ork` nem ferramenta MCP para credencial; o Código não as recebe; fluxo e execução só levam o nome.
//
// Sem import do Electron em tempo de execução: o `safeStorage`, o `ipcMain` e a gravação atômica vêm de quem registra
// (`registrarCredenciais`), para a prova rodar no Node.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
// @ts-expect-error idem
import { CANAIS_CREDENCIAIS } from '../../shared/api.ts'
import type {
  ArquivoDeCredenciais,
  CredencialGuardada,
  CredencialParaPedido,
  ListaDeCredenciais,
  ResultadoDaCredencial,
  ResultadoDoApagar
} from '../../shared/fluxos/credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ARQUIVO_VAZIO, apagarCredencial, conferirDestino, conferirMetodo, credencialNaoExiste, criarCredencial, editarCredencial, hostPermitido, lerArquivoDeCredenciais, montarCabecalho, paraMostrar, trocarValorDaCredencial, visivel } from '../../shared/fluxos/credenciais.ts'

/** A parte do `safeStorage` do Electron que o cofre usa. */
export interface Cifra {
  isEncryptionAvailable: () => boolean
  encryptString: (texto: string) => Buffer
  decryptString: (cifrado: Buffer) => string
}

export interface DependenciasDasCredenciais {
  /** A pasta de dados (`PASTA_DADOS` de `main/dados.ts`); o arquivo é `credenciais.json` dentro dela. */
  pasta: string
  cifra: Cifra
  /** `main/dados.ts`: temporário + `rename`; com `guardarRuim`, copia o atual para `.ruim` antes. */
  gravarJsonAtomico: (destino: string, valor: unknown, guardarRuim: boolean) => void
  /**
   * Quem usa a credencial, para a tela avisar ao apagar: fluxos (pelo nome) e, na 1.9.7, servidores MCP de fora e
   * páginas (pelo id). Opcional.
   */
  usadaEm?: (nome: string, id: string) => string[]
  novoId?: () => string
  agora?: () => string
}

/** (1.9.7) A credencial ligada a um encaixe de página foi apagada. */
export const CREDENCIAL_LIGADA_SUMIU = 'a credencial ligada a este encaixe não existe mais: ligue outra em Configurações › Conexões › Páginas'

/** (1.9.7) A credencial citada por um servidor MCP de fora foi apagada. */
export const CREDENCIAL_DO_SERVIDOR_SUMIU = 'uma credencial deste servidor não existe mais: escolha outra em Configurações › Conexões › MCP'

const SEM_CIFRA =
  'o cofre do sistema não está disponível para cifrar credenciais; sem ele o Orkester não grava o valor (nunca em texto puro)'

export function criarCofreDeCredenciais(dep: DependenciasDasCredenciais) {
  const arquivo = join(dep.pasta, 'credenciais.json')
  const novoId = dep.novoId ?? randomUUID
  const agora = dep.agora ?? (() => new Date().toISOString())

  function ler(): { arquivo: ArquivoDeCredenciais; ruim: boolean } {
    if (!existsSync(arquivo)) return { arquivo: ARQUIVO_VAZIO, ruim: false }
    try {
      return lerArquivoDeCredenciais(JSON.parse(readFileSync(arquivo, 'utf8')))
    } catch {
      // ilegível: a lista aparece vazia e a próxima gravação guarda antes uma cópia `.ruim`
      return { arquivo: ARQUIVO_VAZIO, ruim: true }
    }
  }

  const cifraDisponivel = (): boolean => {
    try {
      return dep.cifra.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  const ambiente = () => ({
    cifrar: (valor: string) => dep.cifra.encryptString(valor).toString('base64'),
    novoId,
    agora
  })

  /** Abre o valor cifrado. O erro nunca cita o valor. */
  function decifrar(credencial: CredencialGuardada): { valor: string } | { erro: string } {
    if (!cifraDisponivel()) return { erro: `credencial ${credencial.nome}: ${SEM_CIFRA}` }
    try {
      return { valor: dep.cifra.decryptString(Buffer.from(credencial.cifrado, 'base64')) }
    } catch {
      return { erro: `credencial ${credencial.nome}: não consegui abrir o valor neste computador; troque o valor em Conexões` }
    }
  }

  /**
   * Confere https, domínio e (1.9.7) o método, abre o valor e monta o cabeçalho. O erro nunca cita o valor. Sem
   * `metodo`, não confere o "só lê" (o cabeçalho de servidor MCP HTTP: o MCP sempre faz POST e protege por ferramenta).
   */
  function abrir(credencial: CredencialGuardada, url: string, metodo?: string): CredencialParaPedido | { erro: string } {
    const destino = conferirDestino(credencial, url)
    if (destino) return { erro: destino }
    const naoLe = conferirMetodo(credencial, metodo)
    if (naoLe) return { erro: naoLe }
    const aberto = decifrar(credencial)
    if ('erro' in aberto) return aberto
    return montarCabecalho(credencial, aberto.valor)
  }

  /** Roda uma operação sobre o arquivo e grava. Erro do disco ou da cifra vira `{ erro }`, sem citar o valor. */
  function mudar(
    precisaCifra: boolean,
    op: (a: ArquivoDeCredenciais) => { arquivo: ArquivoDeCredenciais; credencial: import('../../shared/fluxos/credenciais').CredencialGuardada } | { erro: string }
  ): ResultadoDaCredencial {
    if (precisaCifra && !cifraDisponivel()) return { erro: SEM_CIFRA }
    try {
      const lido = ler()
      const feito = op(lido.arquivo)
      if ('erro' in feito) return { erro: feito.erro }
      dep.gravarJsonAtomico(arquivo, feito.arquivo, lido.ruim)
      return { ok: true, credencial: visivel(feito.credencial) }
    } catch (e) {
      return { erro: `não consegui gravar a credencial (${e instanceof Error ? e.name : 'erro'})` }
    }
  }

  return {
    /** Só metadados. */
    listar(): ListaDeCredenciais {
      return { itens: paraMostrar(ler().arquivo), cifraDisponivel: cifraDisponivel() }
    },

    criar(pedido: unknown): ResultadoDaCredencial {
      return mudar(true, (a) => criarCredencial(a, pedido, ambiente()))
    },

    trocarValor(id: unknown, valor: unknown): ResultadoDaCredencial {
      return mudar(true, (a) => trocarValorDaCredencial(a, id, valor, ambiente()))
    },

    /**
     * Com nome novo, devolve `usadaEm`: quem citava o nome antigo (a tela avisa que param até serem ajustados). Não
     * saber quem usa não impede editar.
     */
    editar(id: unknown, mudancas: unknown): ResultadoDaCredencial {
      const antes = ler().arquivo.itens.find((c) => c.id === id)
      const r = mudar(false, (a) => editarCredencial(a, id, mudancas, { agora }))
      if ('erro' in r || !antes || r.credencial.nome === antes.nome) return r
      let usadaEm: string[] = []
      try {
        usadaEm = dep.usadaEm?.(antes.nome, antes.id) ?? []
      } catch {
        // idem
      }
      return { ...r, usadaEm }
    },

    /** Apaga do cofre. Os fluxos que a citam não mudam: o próximo pedido deles dá "credencial X não existe". */
    apagar(id: unknown): ResultadoDoApagar {
      const r = mudar(false, (a) => apagarCredencial(a, id))
      if ('erro' in r) return r
      let usadaEm: string[] = []
      try {
        usadaEm = dep.usadaEm?.(r.credencial.nome, r.credencial.id) ?? []
      } catch {
        // não saber quem usa não impede apagar
      }
      return { ok: true, usadaEm }
    },

    /**
     * (1.9.7) Quem usa a credencial agora (fluxos, páginas e servidores), SEM mexer em nada: a tela lista antes de
     * apagar e antes de renomear. Não conseguir calcular vira `{ erro }` (a tela falha fechado, como o apagar coluna).
     */
    quemUsa(id: unknown): ResultadoDoApagar {
      const c = typeof id === 'string' ? ler().arquivo.itens.find((x) => x.id === id) : undefined
      if (!c) return { erro: 'essa credencial não existe mais' }
      try {
        return { ok: true, usadaEm: dep.usadaEm?.(c.nome, c.id) ?? [] }
      } catch {
        return { erro: 'não consegui conferir quem usa' }
      }
    },

    /**
     * Para o nó HTTP (S5), no main, na hora do pedido: confere https e domínio, abre o valor e monta o cabeçalho.
     * `ocultar` vai para o `ctx.ocultar` do executor, que troca esses textos por `•••` em tudo o que a execução guarda.
     */
    paraPedido(nome: string, url: string, metodo?: string): CredencialParaPedido | { erro: string } {
      const credencial = ler().arquivo.itens.find((c) => c.nome === nome)
      if (!credencial) return { erro: credencialNaoExiste(nome) }
      return abrir(credencial, url, metodo)
    },

    /**
     * (1.9.7) O mesmo `paraPedido`, achando pelo id: é como as páginas "+" guardam a ligação de um encaixe (renomear a
     * credencial não quebra a página). Mesmas travas: https, domínio da credencial, cifra.
     */
    paraPedidoPorId(id: string, url: string, metodo?: string): CredencialParaPedido | { erro: string } {
      const credencial = ler().arquivo.itens.find((c) => c.id === id)
      if (!credencial) return { erro: CREDENCIAL_LIGADA_SUMIU }
      return abrir(credencial, url, metodo)
    },

    /**
     * (1.9.7) A credencial `id` cobre TODOS os `hosts` (domínios dela, regra `*.dominio`)? null = cobre; senão, o motivo.
     * Só metadados: não abre o valor.
     */
    cobre(id: string, hosts: readonly string[]): string | null {
      const credencial = ler().arquivo.itens.find((c) => c.id === id)
      if (!credencial) return CREDENCIAL_LIGADA_SUMIU
      const fora = hosts.filter((h) => !hostPermitido(h, credencial.dominios))
      if (!hosts.length || fora.length) return `a credencial ${credencial.nome} não cobre ${fora.join(', ') || 'nenhum host'} (domínios dela: ${credencial.dominios.join(', ')})`
      return null
    },

    /**
     * (1.9.7) O valor de uma credencial do tipo `segredo`, por id, para a variável de ambiente de um servidor MCP stdio
     * (`main/mcpFora/registro.ts`, na hora de subir). Outro tipo é recusado: credencial com domínio não sai do https.
     */
    segredoPorId(id: string): { valor: string } | { erro: string } {
      const credencial = ler().arquivo.itens.find((c) => c.id === id)
      if (!credencial) return { erro: CREDENCIAL_DO_SERVIDOR_SUMIU }
      if (credencial.tipo !== 'segredo') return { erro: `credencial ${credencial.nome}: só uma do tipo segredo vai para variável de ambiente` }
      return decifrar(credencial)
    },

    /** Credenciais com este nome existem? (para o motor avisar antes de ligar um fluxo; não abre nada). */
    existe(nome: string): boolean {
      return ler().arquivo.itens.some((c) => c.nome === nome)
    }
  }
}

export type CofreDeCredenciais = ReturnType<typeof criarCofreDeCredenciais>

/** Os canais da página Conexões. Só a janela do app chega aqui (o `ipcSeguro` recusa os outros remetentes). */
export function registrarCredenciais(ipc: Pick<IpcMain, 'handle'>, cofre: CofreDeCredenciais): void {
  ipc.handle(CANAIS_CREDENCIAIS.listar, () => cofre.listar())
  ipc.handle(CANAIS_CREDENCIAIS.criar, (_e, pedido: unknown) => cofre.criar(pedido))
  ipc.handle(CANAIS_CREDENCIAIS.trocarValor, (_e, id: unknown, valor: unknown) => cofre.trocarValor(id, valor))
  ipc.handle(CANAIS_CREDENCIAIS.editar, (_e, id: unknown, mudancas: unknown) => cofre.editar(id, mudancas))
  ipc.handle(CANAIS_CREDENCIAIS.apagar, (_e, id: unknown) => cofre.apagar(id))
  ipc.handle(CANAIS_CREDENCIAIS.quemUsa, (_e, id: unknown) => cofre.quemUsa(id))
}
