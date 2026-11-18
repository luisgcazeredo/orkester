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
      'Abre uma sessão nova. Com `funcao`, o motor, o modelo e o esforço saem do papel; sem ela, diga o agente. `modelo`/`esforco` mandam sobre o papel. O cartão nasce solto: sem dono e sem corda, como os que o usuário cria pela tela.'
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
