import type { Tema } from './temas.ts'
// O que fica salvo em disco. Toda mudança de formato sobe a `versao` e ganha uma migração.

export type Agente = 'claude' | 'codex' | 'shell'

/**
 * Uma função (papel) que um agente pode ter: o que ele é, escrito uma vez e reaproveitado. O cartão nasce
 * com o nome da função e recebe o prompt dela como primeiro pedido, em vez de nascer vazio.
 */
export interface Funcao {
  id: string
  nome: string
  /** O que o agente é e o que se espera dele. Vai como primeiro pedido assim que o cartão fica pronto. */
  prompt: string
  /** Pasta própria de quem nasce nesta função; vazia, vale a do espaço. */
  pasta?: string
  /** Preset preferido (id). Sem ele, a função usa o preset que o usuário escolher na hora. */
  preset?: string
}

/**
 * Uma peça de partitura: o cartão como ele vai subir de novo. O lugar é relativo ao canto de cima à
 * esquerda do arranjo salvo, para a partitura caber em qualquer canto de qualquer espaço.
 */
export type PecaDePartitura = {
  x: number
  y: number
  largura: number
  altura: number
  cor?: string
  /** Peças com o mesmo número sobem agrupadas (o grupo do quadro, renumerado ao salvar). */
  grupo?: number
} & (
  | {
      tipo: 'terminal'
      nome: string
      agente: Agente
      /** Linha digitada ao abrir, guardada como estava: a partitura não depende de preset nenhum. */
      comando: string
      /** Nome da função (papel). O prompt vem da função na hora de subir, nunca de uma cópia velha. */
      funcao?: string
    }
  | { tipo: 'texto'; texto: string; tamanhoFonte: number; mono: boolean }
  | { tipo: 'postit'; texto: string; corPostIt: CorPostIt }
  /** A moldura de uma banda: sem ela, um time montado em banda subiria sem as permissões que a banda dá. */
  | { tipo: 'banda'; nome: string }
)

/**
 * Partitura: um time salvo — os agentes com as funções e os comandos deles, os recados (textos e post-its),
 * as cordas entre os agentes e os grupos — para subir inteiro num espaço novo.
 *
 * **Pasta não entra de propósito.** A partitura é o time, não o projeto: cada cartão abre na pasta do espaço
 * onde ele subiu (ou na pasta da função, se ela tiver uma). Um caminho salvo de outro projeto subiria o time
 * inteiro mexendo na pasta errada.
 */
export interface Partitura {
  id: string
  nome: string
  criadaEm: string
  /** Tamanho do arranjo, para a janela achar um canto livre do tamanho certo. */
  largura: number
  altura: number
  pecas: PecaDePartitura[]
  /** Cordas entre as peças, pelo índice em `pecas` (a corda é a permissão de dois agentes se falarem). */
  cordas: Array<[number, number]>
}

export interface PresetAgente {
  id: string
  nome: string
  agente: Agente
  /** Linha de comando digitada quando o terminal abre (vazia = só o shell). */
  comando: string
}

interface NoBase {
  id: string
  x: number
  y: number
  largura: number
  altura: number
  /** Ordem de empilhamento: maior fica por cima. */
  z: number
  criadoEm: string
  /** Cor do cartão (destaque no terminal e nos cartões; cor do texto no texto solto; tom do post-it). */
  cor?: string
  /** Travado: não move, não redimensiona e não apaga até destravar. */
  travado?: boolean
  /** Grupo (como o "agrupar" do Canva): itens com o mesmo grupo são selecionados e movidos juntos. */
  grupo?: string
}

export interface NoTerminal extends NoBase {
  tipo: 'terminal'
  nome: string
  agente: Agente
  comando: string
  /** Pasta própria; sem ela, a pasta do espaço. */
  pasta?: string
  /** Conversa do agente, para retomar ao reabrir (Claude: escolhida ao criar; Codex: descoberta depois). */
  sessao?: string
  /** Cartão do agente que abriu este pelo `ork abrir` (só ele pode fechar). */
  criadoPor?: string
  /** Nome da função com que este cartão nasceu, para você e as partituras saberem o papel dele. */
  funcao?: string
  /** false: o usuário fechou o cartão de código deste agente, então ele não nasce mais sozinho. */
  codigoSozinho?: boolean
  /**
   * Para onde o usuário arrastou a árvore principal de arquivos deste agente (pela bolinha das ligações), em
   * relação ao lugar padrão — à direita dele, alinhada pelo topo. Guardado aqui, e não em cada cartão, porque
   * é a árvore que anda: o arquivo que chegar depois nasce no lugar novo.
   */
  codigoDesloc?: { x: number; y: number }
  /**
   * Árvores de código além da principal. Servem para separar os arquivos por assunto — o agente cria uma por
   * frente de trabalho e diz "leia os arquivos da árvore X". A principal não fica nesta lista.
   */
  arvores?: ArvoreDeCodigo[]
  /** Em qual árvore nascem os próximos arquivos deste agente. Vazio: a principal. */
  arvoreAtiva?: string
}

/** Um ramo de arquivos de um agente, com nome, do jeito de um mapa mental. */
export interface ArvoreDeCodigo {
  id: string
  nome: string
  /** Para onde o usuário arrastou esta árvore, em relação ao lugar padrão dela. */
  desloc?: { x: number; y: number }
}

export type CorPostIt = 'amarelo' | 'rosa' | 'azul' | 'verde' | 'roxo'

export interface NoPostIt extends NoBase {
  tipo: 'postit'
  /** Nome do arquivo .md dentro de `notas/` do espaço. */
  arquivo: string
  cor: CorPostIt
}

export interface NoTexto extends NoBase {
  tipo: 'texto'
  texto: string
  tamanhoFonte: number
  mono: boolean
  cor?: string
}

export interface NoArquivo extends NoBase {
  tipo: 'arquivo'
  caminho: string
  nomeExibido: string
}

/** Árvore de arquivos de uma pasta, navegável no quadro. */
export interface NoPasta extends NoBase {
  tipo: 'pasta'
  caminho: string
  /** Subpastas abertas (caminhos completos). */
  expandidas: string[]
}

/** Uma entrada da lista de um visor: um arquivo que o agente gravou. */
export interface ArquivoDoVisor {
  caminho: string
  /** Quando foi gravado pela última vez (ms desde 1970). */
  em: number
  /** O arquivo foi apagado do disco; fica na lista, riscado, como histórico. */
  sumiu?: boolean
}

/**
 * Visor de código: **um por agente e por árvore**, ao lado dele, com a lista dos arquivos que o agente mexeu
 * (o mais novo em cima) e o diff ou o conteúdo do que está à mostra. Quem tem `arquivos` é visor.
 *
 * Sem `terminal` é o cartão de **um** arquivo, aberto à mão ("Ver o código no quadro" do explorador): sem
 * lista, sem acompanhar ninguém. Quadro salvo antes do visor tinha um cartão por arquivo; `migrarCodigos`
 * (shared/quadro/visor.ts) junta esses cartões em um visor ao abrir o espaço. Os campos novos são opcionais,
 * então uma versão velha que abra um quadro já migrado vê um cartão comum mostrando o arquivo exibido.
 */
export interface NoCodigo extends NoBase {
  tipo: 'codigo'
  /** Terminal acompanhado; sem ele, é o cartão de um arquivo só (ver acima). */
  terminal?: string
  /**
   * O arquivo à mostra agora. No visor, é um dos da lista; o corte em 50 nunca o tira. Vazio só enquanto o agente
   * ainda não gravou nada.
   */
  caminho?: string
  /** O que mudou desde o último commit, ou o arquivo inteiro. */
  modo: 'diff' | 'conteudo'
  /** Só o cabeçalho à mostra, para não espalhar o quadro. */
  recolhido?: boolean
  /** Tamanho de antes de recolher, para o cartão voltar ao que era. */
  alturaAberta?: number
  larguraAberta?: number
  /**
   * O visor está na posição que o app arruma, ao lado do agente. Arrastar para longe tira dela, mas o visor
   * continua sendo do agente e recebendo arquivos. Só decide **posição**.
   */
  automatico?: boolean
  /** Só para ler quadro antigo (lugar do cartão na coluna). O visor não usa; a migração apaga. */
  ordem?: number
  /** Árvore do agente a que este cartão pertence. Vazio: a árvore principal. */
  arvore?: string
  /** Os arquivos do visor, o mais novo primeiro (no máximo `MAX_NA_LISTA`). Ter a lista = ser visor. */
  arquivos?: ArquivoDoVisor[]
  /** `false`: o visor está fixo no arquivo escolhido e não troca sozinho. Ausente = acompanha o mais novo. */
  seguindo?: boolean
}

/**
 * Banda: um grupo de agentes, desenhado como uma moldura no quadro. Quem está dentro dela fala com todos os
 * outros de dentro, e a corda desenhada na banda vale para cada um deles — é o que evita desenhar seis
 * cordas à mão para um time de quatro.
 *
 * **Não há lista de membros de propósito:** é a moldura que diz quem é do time. O cartão que você arrasta
 * para dentro entra, o que você tira sai, e o que está escrito na tela é sempre a verdade — uma lista
 * guardada poderia discordar do que se vê.
 */
export interface NoBanda extends NoBase {
  tipo: 'banda'
  nome: string
}

/** Navegador dentro do quadro. */
export interface NoPortal extends NoBase {
  tipo: 'portal'
  url: string
}

/** Imagem colada (print): o arquivo mora em `imagens/` do espaço. */
export interface NoImagem extends NoBase {
  tipo: 'imagem'
  /** Nome do arquivo .png dentro de `imagens/` do espaço. */
  arquivo: string
}

export interface EntradaPasta {
  nome: string
  caminho: string
  ehPasta: boolean
}

export type No = NoTerminal | NoPostIt | NoTexto | NoArquivo | NoPasta | NoPortal | NoImagem | NoCodigo | NoBanda

/** Ligação entre dois terminais: é a permissão de um agente falar com o outro pelo `ork`. */
export interface Corda {
  id: string
  de: string
  para: string
  criadoEm: string
}

type FerramentaDesenho = 'lapis' | 'retangulo' | 'seta'
/** O que a barra de desenho escolhe: uma forma ou a borracha (que apaga traços). */
export type PincelDesenho = FerramentaDesenho | 'borracha'

export interface Desenho {
  id: string
  ferramenta: FerramentaDesenho
  /** Lápis: todos os pontos; retângulo e seta: início e fim. Coordenadas do quadro. */
  pontos: Array<[number, number]>
  cor: string
  espessura: number
  z: number
  grupo?: string
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

/** O conteúdo de um nível do quadro: o térreo (o próprio espaço) e cada andar têm o seu. */
export interface Plano {
  camera: Camera
  nos: No[]
  cordas: Corda[]
  desenhos: Desenho[]
}

/** Quando uma rotina dispara. `cada` conta do disparo anterior; os outros são hora do dia. */
export type QuandoDaRotina =
  | { tipo: 'cada'; minutos: number }
  | { tipo: 'diario'; hora: number; minuto: number }
  /** `dia`: 0 = domingo … 6 = sábado. */
  | { tipo: 'semanal'; dia: number; hora: number; minuto: number }

/** O que aconteceu na última vez que a rotina venceu. */
export type ResultadoDaRotina = 'rodou' | 'ocupado' | 'pergunta' | 'encerrado' | 'sem-cartao' | 'nao-enviou'

/**
 * Rotina: um pedido (ou comando) digitado num cartão de hora em hora, todo dia ou toda semana. O que só o
 * app sabe fazer, e é por isso que ela existe aqui em vez de numa tarefa do Windows: **se o terminal estiver
 * ocupado, numa pergunta ou encerrado, ela pula a vez** em vez de escrever no meio do trabalho de alguém.
 *
 * Roda enquanto o espaço está aberto numa janela — é a janela que manda as rotinas ao processo principal, e
 * é ele que conta o tempo e digita.
 */
export interface Rotina {
  id: string
  nome: string
  /** Cartão de terminal onde ela digita. */
  terminal: string
  texto: string
  quando: QuandoDaRotina
  /** Quando ela vence de novo (ISO). */
  proxima: string
  pausada?: boolean
  /** Quantas vezes já foi digitada de verdade (as puladas não contam). */
  vezes: number
  ultima?: { em: string; resultado: ResultadoDaRotina }
}

export type EstadoAndar = 'trabalhando' | 'travado' | 'revisao' | 'pronto'

/**
 * Andar: um nível dentro do espaço, com quadro próprio. Com git, ganha um ramo e uma pasta isolada
 * (git worktree) para mexer sem tocar no projeto principal; depois é "pousado" (juntado) ou apagado.
 */
export interface Andar extends Plano {
  id: string
  nome: string
  criadoEm: string
  git: null | {
    ramo: string
    /** Pasta do worktree, onde os terminais deste andar abrem. */
    pasta: string
    /** Ramo do projeto principal quando o andar nasceu. */
    ramoBase: string
  }
  status?: { texto: string; estado: EstadoAndar }
}

export interface Espaco extends Plano {
  versao: 1
  id: string
  nome: string
  /** Pasta do projeto: onde os terminais abrem. */
  pasta: string
  cor: string
  icone: string
  criadoEm: string
  abertoEm: string
  andares: Andar[]
  /** Andar à mostra; null = térreo. */
  andarAtivo: string | null
  /** Rotinas deste espaço (de qualquer andar). Campo novo: espaço antigo não tem nenhuma. */
  rotinas?: Rotina[]
}

interface ResumoAndar {
  id: string
  nome: string
  ramo: string | null
  estado?: EstadoAndar
}

export interface ResumoEspaco {
  id: string
  nome: string
  cor: string
  icone: string
  pasta: string
  terminais: number
  andares: ResumoAndar[]
}

/** Situação do git de um andar, lida na hora (não fica salva). */
export interface SituacaoAndar {
  /** Commits do andar que o principal ainda não tem. */
  commitsAFrente: number
  /** Arquivos mudados no andar e ainda fora de commit. */
  alterados: number
  /** Arquivos mudados no projeto principal e ainda fora de commit (atrapalham juntar). */
  alteradosNoPrincipal: number
  ramoPrincipal: string
  /** Ramo de onde o andar nasceu. */
  ramoBase: string
  /** O principal está sem ramo aberto (HEAD solto): juntar fica bloqueado. */
  destacado: boolean
}

export interface ResultadoGit {
  ok: boolean
  mensagem: string
  arquivos?: string[]
}

/** O id de um tema: derivado do registro em `temas.ts`. Os valores já gravados, 'escuro' e 'claro', continuam válidos. */
export type { Tema } from './temas.ts'

export interface Preferencias {
  versao: 1
  tema: Tema
  presets: PresetAgente[]
  /** Campo novo: sem ele, não há nenhuma função guardada. */
  funcoes?: Funcao[]
  /** Times salvos, para subir de novo. Campo novo: arquivo antigo não tem nenhum. */
  partituras?: Partitura[]
  corPostItPadrao: CorPostIt
  /** false esconde as linhas entre o agente e os cartões de código dele. Campo novo: sem ele, mostra. */
  linhasDoCodigo?: boolean
  /** Leitor de Markdown: pastas absolutas que o usuário fixou (até 20). Campo novo: arquivo antigo não tem. */
  leitor?: LeitorPreferencias
}

export interface LeitorPreferencias {
  pastas: string[]
}

export interface EstadoJanela {
  versao: 1
  espacoAtivo: string | null
  lateralAberta: boolean
  /** Barra da direita: as pastas que o usuário deixou abertas ali. Campo novo: arquivo antigo não tem. */
  explorador?: { aberto: boolean; raizes: string[] }
}

export interface EspacoCarregado {
  espaco: Espaco
  /** Conteúdo de cada post-it, pelo nome do arquivo. */
  notas: Record<string, string>
}

export const PRESETS_PADRAO: PresetAgente[] = [
  { id: 'claude', nome: 'Claude Code', agente: 'claude', comando: 'claude' },
  { id: 'codex', nome: 'Codex', agente: 'codex', comando: 'codex' },
  { id: 'shell', nome: 'PowerShell', agente: 'shell', comando: '' }
]
