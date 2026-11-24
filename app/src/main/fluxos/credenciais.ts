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
  CredencialParaPedido,
  ListaDeCredenciais,
  ResultadoDaCredencial,
  ResultadoDoApagar
} from '../../shared/fluxos/credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ARQUIVO_VAZIO, apagarCredencial, conferirDestino, credencialNaoExiste, criarCredencial, editarCredencial, lerArquivoDeCredenciais, montarCabecalho, paraMostrar, trocarValorDaCredencial, visivel } from '../../shared/fluxos/credenciais.ts'

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
  /** Fluxos (de qualquer espaço) que citam a credencial pelo nome, para a tela avisar ao apagar. Opcional. */
  usadaEm?: (nome: string) => string[]
  novoId?: () => string
  agora?: () => string
}

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

    editar(id: unknown, mudancas: unknown): ResultadoDaCredencial {
      return mudar(false, (a) => editarCredencial(a, id, mudancas, { agora }))
    },

    /** Apaga do cofre. Os fluxos que a citam não mudam: o próximo pedido deles dá "credencial X não existe". */
    apagar(id: unknown): ResultadoDoApagar {
      const r = mudar(false, (a) => apagarCredencial(a, id))
      if ('erro' in r) return r
      let usadaEm: string[] = []
      try {
        usadaEm = dep.usadaEm?.(r.credencial.nome) ?? []
      } catch {
        // não saber quem usa não impede apagar
      }
      return { ok: true, usadaEm }
    },

    /**
     * Para o nó HTTP (S5), no main, na hora do pedido: confere https e domínio, abre o valor e monta o cabeçalho.
     * `ocultar` vai para o `ctx.ocultar` do executor, que troca esses textos por `•••` em tudo o que a execução guarda.
     */
    paraPedido(nome: string, url: string): CredencialParaPedido | { erro: string } {
      const credencial = ler().arquivo.itens.find((c) => c.nome === nome)
      if (!credencial) return { erro: credencialNaoExiste(nome) }
      const destino = conferirDestino(credencial, url)
      if (destino) return { erro: destino }
      if (!cifraDisponivel()) return { erro: `credencial ${nome}: ${SEM_CIFRA}` }
      let valor: string
      try {
        valor = dep.cifra.decryptString(Buffer.from(credencial.cifrado, 'base64'))
      } catch {
        return { erro: `credencial ${nome}: não consegui abrir o valor neste computador; troque o valor em Conexões` }
      }
      return montarCabecalho(credencial, valor)
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
}
