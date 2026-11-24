// Fluxos (1.9.6): os 3 fluxos de exemplo que todo espaço ganha uma vez, desligados, na pasta "Exemplos". Mostram como
// montar (gatilho → ação, com expressão). As colunas saem do papel no kanban do espaço: a final (`final: true`) e a de
// entrada (`papel: 'entrada'`). Sem nomes nem caminhos pessoais (repositório público). Puro: roda no Node.
import type { Coluna } from '../kanban'
import type { FluxoExportado, NoDoFluxo, Referencia } from './tipos'

export const PASTA_DE_EXEMPLOS = 'Exemplos'

const no = (id: string, nome: string, tipo: NoDoFluxo['tipo'], posicao: [number, number], ajustes: Record<string, unknown>): NoDoFluxo => ({
  id,
  nome,
  tipo,
  versaoDoTipo: 1,
  posicao,
  ajustes
})

const fluxo = (nome: string, nos: NoDoFluxo[]): FluxoExportado => ({
  orkester: 'fluxo',
  versao: 1,
  nome,
  nos,
  ligacoes: [{ de: nos[0].id, saida: 0, para: nos[1].id }]
})

const MAESTRO: Referencia = { id: 'maestro', nome: 'Maestro' }
const GATILHO: [number, number] = [0, 0]
const ACAO: [number, number] = [320, 0]

/**
 * Os 3 exemplos para as colunas deste espaço. Sem coluna final, o gatilho fica "a escolher" (o fluxo não liga até o
 * usuário escolher); sem coluna de entrada, a tarefa vai para a padrão do kanban.
 */
export function exemplos(colunas: readonly Pick<Coluna, 'id' | 'nome' | 'final' | 'papel'>[]): FluxoExportado[] {
  const final = colunas.find((c) => c.final)
  const entrada = colunas.find((c) => c.papel === 'entrada')
  const nomeDoFinal = (final?.nome ?? 'Pronto').slice(0, 40)
  return [
    fluxo('Tarefa pronta avisa o Maestro', [
      no('gatilho', `Tarefa entrou em ${nomeDoFinal}`, 'gatilho.kanban', GATILHO, {
        paraColuna: final ? { id: final.id, nome: final.nome } : { id: '', nome: nomeDoFinal },
        por: 'qualquer'
      }),
      no('recado', 'Recado ao Maestro', 'orkester.recado', ACAO, {
        para: MAESTRO,
        texto: `A tarefa #{{ numero }} ({{ titulo }}) entrou em ${nomeDoFinal}. Revise se falta algo nela.`,
        juntarEvento: false
      })
    ]),
    fluxo('Agente parou numa pergunta', [
      no('gatilho', 'Parou numa pergunta', 'gatilho.parou', GATILHO, { como: ['pergunta'] }),
      no('recado', 'Recado ao Maestro', 'orkester.recado', ACAO, {
        para: MAESTRO,
        texto: '{{ agenteNome }} parou numa pergunta e está esperando resposta.',
        juntarEvento: false
      })
    ]),
    fluxo('Revisão de fim de dia', [
      no('gatilho', 'Todo dia às 18h', 'gatilho.relogio', GATILHO, { quando: { tipo: 'diario', hora: 18, minuto: 0 } }),
      no('tarefa', 'Tarefa de revisão', 'orkester.tarefa', ACAO, {
        titulo: 'Revisar o que ficou aberto hoje',
        ...(entrada ? { coluna: { id: entrada.id, nome: entrada.nome } } : {})
      })
    ])
  ]
}
