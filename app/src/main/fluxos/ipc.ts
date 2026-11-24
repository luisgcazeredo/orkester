// Fluxos: os canais da página (`window.ork.fluxos`). Cada um passa o remetente ao serviço, que confere se a janela é
// dona do espaço (ou se o espaço não tem janela). Nada aqui decide regra: está tudo em servico.ts.
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { CANAIS_FLUXOS, type FluxoGravadoOk, type FluxoRodado, type ListaDeFluxos, type ResultadoDeFluxo } from '../../shared/api'
import type { Execucao, FluxoGravado, ResumoDaExecucao } from '../../shared/fluxos/formato'
import type { ServicoDeFluxos } from './servico'

const USUARIO = { tipo: 'usuario' } as const
const texto = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''))

export function registrarIpcDosFluxos(ipcMain: IpcMain, s: ServicoDeFluxos): void {
  /** Uma mudança: `{ ok: true }` ou o motivo. */
  const mudar =
    (fazer: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown) =>
    (e: IpcMainInvokeEvent, ...args: unknown[]): ResultadoDeFluxo => {
      try {
        fazer(e, ...args)
        return { ok: true }
      } catch (erro) {
        return s.falhou(erro)
      }
    }

  ipcMain.handle(CANAIS_FLUXOS.listar, (_e, espaco: unknown): ListaDeFluxos => {
    try {
      return s.listar(texto(espaco))
    } catch {
      return { pastas: [], fluxos: [], invalidos: [] }
    }
  })
  ipcMain.handle(CANAIS_FLUXOS.ler, (_e, espaco: unknown, id: unknown): FluxoGravado | null => {
    try {
      return s.ler(texto(espaco), texto(id))
    } catch {
      return null
    }
  })
  ipcMain.handle(CANAIS_FLUXOS.gravar, (e, espaco: unknown, id: unknown, fluxo: unknown): FluxoGravadoOk => {
    try {
      const g = s.gravar(texto(espaco), id === null ? null : texto(id), fluxo, USUARIO, e.sender.id)
      return { ok: true, id: g.id, ...(g.desligado ? { desligado: g.desligado } : {}) }
    } catch (erro) {
      return s.falhou(erro)
    }
  })
  ipcMain.handle(CANAIS_FLUXOS.apagar, mudar((e, espaco, id) => s.apagar(texto(espaco), texto(id), USUARIO, e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.ligar, mudar((e, espaco, id, ligado, mostrado) => s.ligar(texto(espaco), texto(id), ligado === true, USUARIO, mostrado, e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.mover, mudar((e, espaco, id, pasta) => s.mover(texto(espaco), texto(id), pasta === null ? null : texto(pasta), e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.criarPasta, mudar((e, espaco, nome, pai) => s.criarPasta(texto(espaco), texto(nome), pai === null || pai === undefined ? null : texto(pai), e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.renomearPasta, mudar((e, espaco, id, nome) => s.renomearPasta(texto(espaco), texto(id), texto(nome), e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.apagarPasta, mudar((e, espaco, id) => s.apagarPasta(texto(espaco), texto(id), e.sender.id)))
  ipcMain.handle(CANAIS_FLUXOS.rodar, async (e, espaco: unknown, id: unknown, mostrado: unknown): Promise<FluxoRodado> => {
    try {
      return { ok: true, execucao: await s.rodar(texto(espaco), texto(id), mostrado, e.sender.id) }
    } catch (erro) {
      return s.falhou(erro)
    }
  })
  ipcMain.handle(CANAIS_FLUXOS.execucoes, (_e, espaco: unknown, id: unknown, limite: unknown): ResumoDaExecucao[] => {
    try {
      return s.execucoes(texto(espaco), texto(id), typeof limite === 'number' ? limite : undefined)
    } catch {
      return []
    }
  })
  ipcMain.handle(CANAIS_FLUXOS.execucao, (_e, espaco: unknown, id: unknown, execId: unknown): Execucao | null => {
    try {
      return s.execucao(texto(espaco), texto(id), texto(execId))
    } catch {
      return null
    }
  })
}
