import { ipcMain } from 'electron'
import { modeloEfetivo } from '../shared/modelos'
import { CANAIS_PANORAMA, type AcaoNaRotina, type AgenteDoPanorama, type Panorama, type RotinaDoPanorama } from '../shared/api'
import { lerPadraoDoMotor } from './modelos'
import { idsDosEspacos, rotinasSalvas } from './dados'
import { caixa, situacaoNaTela } from './espera'
import { tarefasDosAgentesDo } from './kanban'
import { donoDe } from './janelas'
import { agirNaRotina, rotinasDoRelogio } from './rotinas'
import { sessaoPorId, telaDe, todasAsSessoes } from './terminais'

// Visão de todos os espaços para as páginas Agentes e Rotinas. SÓ LEITURA, exceto as ações de rotina. Os agentes vêm
// das sessões que o processo principal já tem (de qualquer janela); as rotinas, do relógio (espaços com janela) ou
// do disco (espaços sem janela, onde nada corre). Nada daqui digita em agente nem mexe no quadro.

const ACOES: readonly AcaoNaRotina[] = ['pausar', 'ligar', 'testar']

async function agentes(): Promise<AgenteDoPanorama[]> {
  const vivas = todasAsSessoes().filter((s) => !s.fim)
  // o kanban de cada espaço uma vez só (1.9.5, S5: "#N título" no card da página Agentes)
  const tarefas = new Map([...new Set(vivas.map((s) => s.espacoId))].map((id) => [id, tarefasDosAgentesDo(id)]))
  return Promise.all(
    vivas.map(async (s) => ({
      id: s.id,
      espacoId: s.espacoId,
      nome: s.espec.nome,
      funcao: s.espec.funcao,
      agente: s.espec.agente,
      // o que o processo roda (campos do cartão por cima do comando), não só os campos; vazio = padrão do motor
      ...modeloEfetivo(s.espec.agente, s.espec.comando, s.espec.modelo, s.espec.esforco),
      padraoDoMotor: lerPadraoDoMotor(s.espec.agente),
      situacao: situacaoNaTela(s, await telaDe(s, 80)),
      fila: caixa.resumo(s.id).fila,
      tarefas: tarefas.get(s.espacoId)?.[s.id] ?? []
    }))
  )
}

function rotinas(): RotinaDoPanorama[] {
  return idsDosEspacos().flatMap((espacoId) => {
    const viva = rotinasDoRelogio(espacoId)
    const semJanela = donoDe(espacoId) === undefined
    const lista = viva ?? (semJanela ? rotinasSalvas(espacoId).rotinas : [])
    // cartão sem sessão (andar ainda não montado, por exemplo): o nome vem do disco, com janela ou sem
    return lista.map((r) => ({
      ...r,
      espacoId,
      nomeDoCartao: sessaoPorId(r.terminal)?.espec.nome ?? rotinasSalvas(espacoId).nomes[r.terminal] ?? null
    }))
  })
}

export function registrarPanorama(): void {
  ipcMain.handle(CANAIS_PANORAMA.ler, async (_evento, opcoes: unknown): Promise<Panorama> => ({
      // a página Rotinas não usa os agentes: pede sem eles e não paga a leitura da tela de cada sessão
      agentes: (opcoes as { agentes?: unknown } | undefined)?.agentes === false ? [] : await agentes(),
      rotinas: rotinas()
    }))
  ipcMain.handle(CANAIS_PANORAMA.rotina, (_evento, espacoId: unknown, id: unknown, acao: unknown) => {
    if (typeof espacoId !== 'string' || typeof id !== 'string' || !ACOES.includes(acao as AcaoNaRotina)) return 'erro'
    return agirNaRotina(espacoId, id, acao as AcaoNaRotina)
  })
}
