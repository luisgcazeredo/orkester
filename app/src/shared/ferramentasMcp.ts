// As ferramentas do servidor MCP do Orkester: nome, título e descrição, num lugar só.
//
// O servidor (mcp/orkester.ts) registra cada ferramenta com o texto daqui, e a página Conexões lista a partir daqui:
// o que o usuário lê na tela é exatamente o que o cliente MCP recebe, sem uma segunda cópia para esquecer de atualizar.
// A prova ferramentasMcp.prova.mts confere que toda ferramenta registrada no servidor tem entrada aqui, e vice-versa.

export interface FerramentaMcp {
  titulo: string
  descricao: string
}

export const FERRAMENTAS_MCP = {
  espacos: {
    titulo: 'Listar espaços',
    descricao:
      'Os espaços do Orkester, com quantos cartões cada um tem e se está aberto numa janela.'
  },
  quadro: {
    titulo: 'Ler o quadro',
    descricao:
      'O que há no andar à mostra: os cartões numerados, com o lugar e a situação de cada um.'
  },
  funcoes: {
    titulo: 'Listar funções',
    descricao:
      'Os papéis guardados, que o abrir_cartao usa pelo nome.'
  },
  ver_cartao: {
    titulo: 'Ler a tela de um cartão',
    descricao:
      'O que está na tela de um agente agora, e se ele está livre, trabalhando ou numa pergunta.'
  },
  abrir_cartao: {
    titulo: 'Abrir um agente no quadro',
    descricao:
      'Abre uma sessão nova. Com `funcao`, o motor, o modelo e o esforço saem do papel; sem ela, diga o agente. `modelo`/`esforco` mandam sobre o papel. Com `tarefa`, o agente entra trabalhando nessa tarefa do kanban do espaço (tarefa inexistente, na lixeira ou em Feito: erro, e nada abre). O cartão nasce solto: sem dono e sem corda, como os que o usuário cria pela tela.'
  },
  modelos: {
    titulo: 'Listar modelos',
    descricao:
      'Os modelos de Claude e Codex, os esforços que cada um aceita e os padrões. Use os ids em abrir_cartao.'
  },
  trocar_modelo: {
    titulo: 'Trocar o modelo de um cartão',
    descricao:
      'Troca o modelo e/ou o esforço de um agente que está livre: o cartão reabre e a conversa continua. Com ele ocupado, recusa. Veja os nomes na ferramenta modelos.'
  },
  partituras: {
    titulo: 'Listar times salvos',
    descricao:
      'As partituras guardadas, com quantos agentes, que funções e quantas cordas cada uma tem.'
  },
  subir_partitura: {
    titulo: 'Subir um time salvo',
    descricao:
      'Sobe uma partitura no andar à mostra. O time nasce do usuário: sem dono e sem corda para fora.'
  },
  importar_catalogo: {
    titulo: 'Importar fichas de time',
    descricao:
      'Lê as fichas .md de uma pasta (cabeçalho com nome, motor, nível, pasta) e as transforma em funções. Atualiza pelo nome em vez de duplicar, e não apaga nada.'
  },
  kanban: {
    titulo: 'Ler o kanban',
    descricao:
      'As tarefas do espaço por coluna, com número, etiquetas e quem trabalha em cada uma (e se está livre ou ocupado). Com `numero`, a tarefa inteira: descrição, delegação e últimos comentários.'
  },
  kanban_criar: {
    titulo: 'Criar uma tarefa no kanban',
    descricao:
      'Cria uma tarefa e devolve o número dela (#N). Sem `coluna`, o usuário cria em Demandas e um agente em Fazendo. Com `responsavel`, o agente entra na lista de quem trabalha nela e é avisado na caixa de entrada dele.'
  },
  kanban_mover: {
    titulo: 'Mover uma tarefa',
    descricao:
      'Leva a tarefa para outra coluna (pelo nome, sem caixa nem acento), no fim ou na posição pedida. Para "Com o Maestro" é delegar: só o usuário, e a demanda vai como pedido ao Maestro do espaço. A coluna final é do usuário e do Maestro.'
  },
  kanban_editar: {
    titulo: 'Editar uma tarefa',
    descricao:
      'Troca o título, a descrição ou as etiquetas de uma tarefa. Etiquetas com +a,-b põem e tiram; sem sinal, trocam a lista.'
  },
  kanban_atribuir: {
    titulo: 'Atribuir uma tarefa',
    descricao:
      'Põe um agente Claude ou Codex do espaço na lista de quem trabalha na tarefa ("ninguem" esvazia a lista). Ele é avisado na caixa de entrada; não vira pedido de trabalho.'
  },
  kanban_soltar: {
    titulo: 'Tirar alguém de uma tarefa',
    descricao:
      'Tira um agente da lista de quem trabalha na tarefa. Um agente sai sozinho sem `quem`; tirar outro é só do usuário e do Maestro.'
  },
  kanban_comentar: {
    titulo: 'Comentar numa tarefa',
    descricao:
      'Acrescenta um comentário à tarefa (os mais antigos saem depois de 50).'
  },
  kanban_apagar: {
    titulo: 'Apagar uma tarefa',
    descricao:
      'Manda a tarefa para a lixeira do kanban; a página Kanban recupera. Exige confirmar.'
  },
  fluxo_ver: {
    titulo: 'Ver os fluxos',
    descricao:
      'Sem `nome`, os fluxos do espaço: ligado ou não, gatilhos e a última execução. Com `nome`, um fluxo inteiro (nós e ligações); com `json`, o JSON que fluxo_criar e fluxo_editar recebem. Credencial aparece só pelo nome, nunca o valor.'
  },
  fluxo_criar: {
    titulo: 'Criar um fluxo',
    descricao:
      'Cria um fluxo a partir do JSON (o formato do fluxo_ver com `json`; cartões e colunas podem ir só pelo nome). Ele nasce desligado. Com Código, HTTP ou comando, só o usuário o liga, pela página Fluxos.'
  },
  fluxo_editar: {
    titulo: 'Editar um fluxo',
    descricao:
      'Troca o nome, os nós e as ligações de um fluxo pelo JSON mandado. Um fluxo com Código, HTTP ou comando editado por aqui fica desligado até o usuário religar pela página.'
  },
  fluxo_ligar: {
    titulo: 'Ligar um fluxo',
    descricao:
      'Liga um fluxo para ele disparar sozinho. Recusa o que tem Código, HTTP ou comando (só o usuário liga, pela página Fluxos, vendo esses nós) e o que ainda tem cartão ou coluna a escolher.'
  },
  fluxo_desligar: {
    titulo: 'Desligar um fluxo',
    descricao:
      'Desliga um fluxo: ele para de disparar e nada mais muda nele.'
  },
  fluxo_rodar: {
    titulo: 'Rodar um fluxo agora',
    descricao:
      'Roda o fluxo uma vez pelo gatilho Manual dele e devolve o que cada nó fez. Sem gatilho Manual, recusa; com Código, HTTP ou comando ainda não aprovado pelo usuário, também.'
  },
  fluxo_execucoes: {
    titulo: 'Últimas execuções de um fluxo',
    descricao:
      'As últimas execuções de um fluxo, com o resultado, o tempo e o nó que deu erro.'
  },
  fluxo_apagar: {
    titulo: 'Apagar um fluxo',
    descricao:
      'Apaga um fluxo e as execuções dele, para sempre. Exige confirmar.'
  }
} as const satisfies Record<string, FerramentaMcp>

export type NomeDeFerramentaMcp = keyof typeof FERRAMENTAS_MCP

/** O que vai no `registerTool` do servidor: título e descrição da ferramenta. */
export function metaDaFerramenta(nome: NomeDeFerramentaMcp): { title: string; description: string } {
  const f: FerramentaMcp = FERRAMENTAS_MCP[nome]
  return { title: f.titulo, description: f.descricao }
}

/** A primeira frase da descrição, para a lista da tela: o texto inteiro fica para o cliente MCP. */
export function descricaoCurta(descricao: string): string {
  const limpa = descricao.replace(/\s+/g, ' ').trim()
  const fim = limpa.search(/[.!?](\s|$)/)
  return fim < 0 ? limpa : limpa.slice(0, fim + 1)
}

/**
 * A lista inteira em Markdown (nome, título e a descrição completa de cada ferramenta), para o botão "Baixar a lista"
 * da página Conexões. Sai do mesmo registro que o servidor usa: não há segunda cópia para esquecer de atualizar.
 */
export function listaEmMarkdown(): string {
  const itens = Object.entries(FERRAMENTAS_MCP as Record<string, FerramentaMcp>)
  const corpo = itens.map(([nome, f]) => `## \`${nome}\` — ${f.titulo}\n\n${f.descricao.replace(/\s+/g, ' ').trim()}\n`)
  return [
    '# Ferramentas do MCP do Orkester',
    '',
    `O servidor MCP do Orkester tem ${itens.length} ferramentas. A lista sai do registro do próprio servidor, então é a da versão que gerou o arquivo.`,
    '',
    ...corpo
  ].join('\n')
}

export interface ItemDeFerramenta {
  nome: string
  titulo: string
  /** Primeira frase da descrição. */
  resumo: string
}

/** A lista que a tela mostra, na ordem em que o servidor as registra. */
export function listarFerramentas(): ItemDeFerramenta[] {
  return Object.entries(FERRAMENTAS_MCP as Record<string, FerramentaMcp>).map(([nome, f]) => ({
    nome,
    titulo: f.titulo,
    resumo: descricaoCurta(f.descricao)
  }))
}
