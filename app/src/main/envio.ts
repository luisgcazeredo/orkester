/**
 * Decide se um pedido digitado **saiu** do campo de entrada (compositor) do agente depois do Enter.
 *
 * Por que não basta "a tela mudou" nem "está trabalhando": o eco da própria colagem e o redesenho do
 * compositor mexem na tela e renovam `ultimaSaida` mesmo quando o Enter foi engolido. Isso deu confirmação
 * falsa de envio.
 *
 * Por que a POSIÇÃO e não "o texto aparece nas últimas linhas": depois de enviado, o pedido continua na tela,
 * como histórico (eco `> texto`). O compositor fica sempre no pé da tela; o histórico sobe. Então:
 * mesmo lugar (a contar do pé) que antes do Enter = continua no compositor; sumiu = saiu; em outro lugar
 * = pode ser histórico ou o compositor que ganhou uma linha de rodapé — isso não é prova de nada.
 */

const LINHAS_OLHADAS = 12

/** Marcas que os agentes põem no lugar de uma colagem grande. */
const COLAGEM_RESUMIDA = /\[(pasted|colado|image)[^\]\n]*\]/i

const limpar = (t: string): string => t.replace(/[│║┃╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim()

/** Fim do pedido, em minúsculas e sem quebras: é o que mais provavelmente aparece inteiro numa linha. */
function marcaDoPedido(texto: string): string {
  return limpar(texto).slice(-24).toLowerCase()
}

/**
 * Distância, contada a partir do pé da tela (0 = última linha com texto), da última linha que mostra o
 * pedido (o fim dele, ou a marca de colagem resumida). -1 se não aparece.
 */
function distanciaDoPedido(tela: string, marca: string): number {
  const linhas = tela.split('\n').map((l) => limpar(l).toLowerCase()).filter(Boolean).slice(-LINHAS_OLHADAS)
  for (let i = linhas.length - 1; i >= 0; i--) {
    const achou = (marca.length >= 4 && linhas[i].includes(marca)) || COLAGEM_RESUMIDA.test(linhas[i])
    if (achou) return linhas.length - 1 - i
  }
  return -1
}

/**
 * Ambiente dos cartões do Claude: sem a sugestão de próxima mensagem ("fantasma" no campo). O binário (2.1.323) lê
 * `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION` e só o valor falso desliga; `false` é o que o leitor dele converte em
 * booleano. Lido no código do binário; a confirmação por execução (turno longo) está na prova real.
 */
export const AMBIENTE_DO_CLAUDE: Record<string, string> = { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false' }

type EvidenciaDeEnvio = 'saiu' | 'ficou' | 'indeterminado'

/**
 * O sinal com que o Claude Code (❯) e o Codex (›) abrem o campo de entrada — e cada mensagem no histórico —,
 * no começo da linha **ou colado no fim da régua** (`────❯`). Medido em 13/11/2026 (Claude Code
 * 2.1.323): a linha do campo vinha colada na régua, e sem isto o "campo" lido era o eco do pedido no histórico —
 * daí `ficou` para um texto que tinha saído. A régua tem 10 ou mais `─`.
 */
const SINAL_NO_MEIO = /(?:^\s*|─{10,}\s*)[❯›]\s?/g

/** Resposta do agente (`●`) ou fim de turno (`✻ … for 5s`): se vem depois de um `❯`, aquele `❯` é histórico. */
const RESPOSTA_NA_LINHA = /^●|^\s*✻\s+\S+\s+for\s+\d/
const RESPOSTA_NO_MEIO_DA_LINHA = /\s{2,}●\s|\s{2,}✻\s+\S+\s+for\s+\d/

/**
 * Junta as linhas que o xterm marcou como continuação (`isWrapped`) na linha de cima — **menos** as que começam com
 * o sinal do campo (❯ ›) ou do rodapé (⏵): essas são linhas novas que só vieram marcadas assim porque a anterior
 * (a régua) tem a largura inteira do terminal. Juntá-las escondia o campo dentro da régua.
 */
export function juntarLinhasDaTela(linhas: Array<{ texto: string; continuacao: boolean }>): string[] {
  const saida: string[] = []
  for (const { texto, continuacao } of linhas) {
    if (continuacao && saida.length && !/^\s*[❯›⏵]/.test(texto)) saida[saida.length - 1] += texto
    else saida.push(texto)
  }
  return saida
}

/**
 * O que está escrito no campo de entrada do agente, em minúsculas e sem quebras; null se a tela não mostra
 * um campo reconhecível. O campo começa na **última** linha com ❯ (Claude) ou › (Codex) — no começo da linha ou
 * colado no fim da régua — e vai até o pé da tela (o histórico usa o mesmo sinal, mas o campo é sempre o de baixo).
 * Um ❯ seguido de resposta do agente (`●`) ou de fim de turno (`✻ … for 3s`) é histórico, não campo: devolve null.
 *
 * Por que (12/11/2026): a regra da posição a contar do pé errava com fichas longas no Claude Code 2.1.322 —
 * depois do envio, o texto inteiro aparece no histórico e às vezes cai na mesma altura em que estava no campo.
 * O app dizia "ficou" de um pedido que tinha saído, e na caixa de entrada isso faz quem mandou repetir.
 */
export function campoNaTela(tela: string): string | null {
  const linhas = tela.split('\n')
  for (let k = linhas.length - 1; k >= 0; k--) {
    const achados = [...linhas[k].matchAll(SINAL_NO_MEIO)]
    if (!achados.length) continue
    const ultimo = achados[achados.length - 1]
    const resto = linhas[k].slice((ultimo.index ?? 0) + ultimo[0].length)
    const embaixo = linhas.slice(k + 1)
    if (RESPOSTA_NO_MEIO_DA_LINHA.test(resto) || embaixo.some((l) => RESPOSTA_NA_LINHA.test(l))) return null
    // até o pé da tela, rodapé incluído: cortar na primeira linha em branco perdia o fim de uma ficha com
    // parágrafos (o Codex mostra o texto inteiro no campo), e é pelo fim que o pedido é reconhecido. O rodapé
    // não atrapalha: aqui só se pergunta se o pedido está no campo.
    return limpar([resto, ...embaixo].join(' ')).toLowerCase()
  }
  return null
}

const campoTemPedido = (campo: string, marca: string): boolean =>
  (marca.length >= 4 && campo.includes(marca)) || COLAGEM_RESUMIDA.test(campo)

/**
 * - 'ficou': o pedido continua onde estava, no compositor. Nunca vira 'saiu', nem com agente "trabalhando".
 * - 'saiu': sumiu da tela; ou o agente passou a trabalhar agora sem o pedido continuar no lugar; ou apareceu
 *   uma pergunta nova e o pedido não continua no lugar.
 * - 'indeterminado': não dá para separar compositor de histórico. Não confirma, e quem chama não deve
 *   tratar como "não enviado" a ponto de mandar de novo.
 */
export function evidenciaDeEnvio(p: {
  texto: string
  antes: string
  depois: string
  ocupadoAntes: boolean
  ocupadoDepois: boolean
  perguntaNova: boolean
}): EvidenciaDeEnvio {
  const marca = marcaDoPedido(p.texto)

  // Primeiro, o próprio campo de entrada, quando a tela o mostra: é a prova direta.
  const campoDepois = campoNaTela(p.depois)
  if (campoDepois !== null) {
    if (campoTemPedido(campoDepois, marca)) return 'ficou'
    // O campo não tem mais o pedido. Só é "saiu" se ele esteve lá (ou se o campo de antes nem aparecia):
    // um campo que nunca recebeu a colagem e continua vazio não prova envio nenhum.
    const campoAntes = campoNaTela(p.antes)
    if (campoAntes === null || campoTemPedido(campoAntes, marca)) return 'saiu'
    // O campo nunca mostrou o pedido: não dá para dizer que saiu, e muito menos que "ficou" (não está lá).
    // "Ficou" faz quem mandou repetir; só é dito com o pedido visível no campo.
    return 'indeterminado'
  }

  const antes = distanciaDoPedido(p.antes, marca)
  const depois = distanciaDoPedido(p.depois, marca)

  if (depois === -1) {
    // Sumiu. Sem ter visto o pedido antes, só aceita se há outro sinal de que o agente o recebeu.
    if (antes !== -1) return 'saiu'
    return p.perguntaNova || (!p.ocupadoAntes && p.ocupadoDepois) ? 'saiu' : 'indeterminado'
  }
  // Ainda aparece. Se está onde estava no compositor, ficou, qualquer que seja o resto.
  if (antes !== -1 && depois === antes) return 'ficou'
  // Aparece em outro lugar, ou não foi visto antes: histórico ou compositor deslocado. Só o agente ter
  // começado a trabalhar agora (e não estar assim antes) é prova de que recebeu.
  if (!p.ocupadoAntes && p.ocupadoDepois && antes !== -1) return 'saiu'
  return 'indeterminado'
}

/** A marca deste texto (o fim dele, ou a colagem resumida) está no campo de entrada que a tela mostra. */
export function marcaNoCampo(tela: string, texto: string): boolean {
  const campo = campoNaTela(tela)
  return campo !== null && campoTemPedido(campo, marcaDoPedido(texto))
}

export type ResultadoDoEnvio = 'saiu' | 'ficou' | 'incerto'

type DependenciasDoEnvio = {
  texto: string
  shell: boolean
  /** escreve a colagem no processo; só é chamada DEPOIS de a tela de referência ter sido lida */
  escreverColagem: () => void
  /** escreve o Enter no processo */
  escrever: (dados: string) => void
  /** últimas linhas da tela */
  tela: () => Promise<string>
  /** há um diálogo esperando resposta? */
  emPergunta: () => Promise<boolean>
  esperar: (ms: number) => Promise<void>
  ocupado: (tela: string) => boolean
  prazoDaColagemMs?: number
  prazoDoEnterMs?: number
  /** quanto tempo a tela precisa ficar parada depois de a colagem aparecer, antes do Enter (0 = não espera) */
  assentarMs?: number
  /** quantos Enter no máximo (padrão 6: o Codex recém-aberto chegou a precisar de 4) */
  tentativasDeEnter?: number
  /** só na retomada: true = o usuário voltou ao campo (ou o destino ocupou); não aperta mais Enter */
  interromper?: () => boolean
}

/**
 * Espera a tela ficar parada por `quieto` ms seguidos (no máximo `teto` ms).
 *
 * Medido com agentes de verdade num PTY (12/11/2026): no Claude Code 2.1.322, Enter ~50 ms depois de a colagem
 * aparecer é engolido e 500 ms depois é aceito. No **Codex no Windows**, a colagem chega como uma enxurrada de
 * teclas e ele vai "digitando" o texto; com quatro agentes subindo juntos, ~4 mil letras levaram dezenas de
 * segundos, e um Enter no meio disso vira **quebra de linha** no campo, não envio — foram os 6 Enters da
 * 1.4.5, todos viraram linhas em branco. Por isso o teto é longo: enquanto a tela muda, o texto ainda está
 * chegando, e Enter nenhum vai.
 */
async function esperarTelaParar(d: Pick<DependenciasDoEnvio, 'tela' | 'esperar'>, quieto: number, teto: number): Promise<void> {
  let anterior = await d.tela()
  let mudouEm = Date.now()
  for (const limite = Date.now() + teto; Date.now() < limite; ) {
    await d.esperar(200)
    const agora = await d.tela()
    if (agora !== anterior) {
      anterior = agora
      mudouEm = Date.now()
    } else if (Date.now() - mudouEm >= quieto) {
      return
    }
  }
}

/**
 * Escreve a colagem, espera ela aparecer, aperta Enter e confirma que o pedido saiu.
 * Sem sinal de que a colagem chegou, **não aperta Enter** (devolve 'ficou').
 */
export async function confirmarEnvio(d: DependenciasDoEnvio): Promise<ResultadoDoEnvio> {
  // A tela de referência vem ANTES de a colagem ser escrita: o PTY pode renderizar o texto antes da primeira
  // leitura, e aí "a tela mudou" nunca seria visto (e o Enter nunca iria).
  const antesDaColagem = await d.tela()
  // **Uma colagem só, nunca repetida.** Em 12/11/2026 os cartões recém-abertos (Claude Code 2.1.322, Codex)
  // guardaram a colagem e só a mostraram vários segundos depois. Com 1,5 s de prazo o app desistia sem Enter
  // (1.4.1); colando de novo quando a tela não mudava (1.4.2), as duas apareceram juntas, duplicadas. O
  // agente pode demorar, mas o que foi escrito chega: então espera mais, e não escreve de novo.
  d.escreverColagem()
  await d.esperar(120)
  // "Chegou" = o pedido está **no campo de entrada**, quando a tela mostra um campo reconhecível (Claude ❯,
  // Codex ›). Só "a tela mudou" não basta: medido em 12/11/2026, o Claude terminando a resposta anterior
  // segurou a colagem por ~25 s enquanto a linha de status mudava ("Churned for 5s · done"); o app tomou isso
  // pela colagem, apertou Enter num campo vazio e concluiu "ficou" de um recado que entrou depois.
  // Sem campo reconhecível (shell, tela desconhecida), vale a tela ter mudado, como antes.
  const marca = marcaDoPedido(d.texto)
  let chegou = false
  let telaMudou = false
  // a tela já mostrava um campo reconhecível antes da colagem: daqui em diante, uma leitura sem campo é redesenho
  let viuCampo = campoNaTela(antesDaColagem) !== null
  // 60 s: o agente pode segurar a colagem bastante. Medido em 12/11/2026: com vários agentes subindo juntos,
  // o Claude Code mostra a tela de pronto e só processa a entrada quando termina de subir (passou de 8 s); e
  // logo depois de responder, chegou a segurar um recado por ~35 s
  for (const limite = Date.now() + (d.prazoDaColagemMs ?? 60_000); Date.now() < limite; await d.esperar(150)) {
    const agora = await d.tela()
    if (agora === antesDaColagem) continue
    telaMudou = true
    const campo = campoNaTela(agora)
    if (campo !== null) viuCampo = true
    // Sem campo nesta leitura: num shell (que não tem campo) a tela ter mudado basta; num agente, é só um
    // redesenho — logo depois de responder, o Claude esconde o campo por um instante, e tomar isso pela
    // colagem levava o Enter para um campo vazio (12/11/2026).
    if (campo === null ? d.shell || !viuCampo : campoTemPedido(campo, marca)) {
      chegou = true
      break
    }
  }
  // agente cuja tela nunca mostrou um campo reconhecível (outra versão, outro agente): vale a tela ter mudado
  if (!chegou && !viuCampo && telaMudou) chegou = true
  // O pedido não apareceu no campo: **sem Enter**. Com o campo reconhecido mostrando outra coisa (a sugestão
  // fantasma, o rascunho do usuário), a tela mexer não prova nada, e um Enter mandaria o que não é nosso (revisão
  // 13/11/2026). O Enter de reserva por "a tela mudou" ficou só para o campo nunca reconhecido (acima).
  if (!chegou) return 'ficou'
  // a colagem apareceu: deixa o agente terminar de desenhá-la antes do Enter (um Enter no meio se perde)
  const quieto = d.assentarMs ?? 1500
  if (quieto > 0) await esperarTelaParar(d, quieto, 60_000)

  const r = await apertarEnter(d, marca, quieto)
  // `sem-marca` aqui = `interromper` antes do 1º Enter (o usuário voltou ao campo): a colagem está lá, não foi enviada
  return r === 'sem-marca' ? 'ficou' : r
}

/**
 * Retoma um envio que deu `ficou` (1.5.1): a colagem foi escrita e o agente a mostrou tarde demais, depois de o
 * prazo acabar. **Só aperta Enter com a marca do recado no campo de entrada** — sem campo reconhecível, ou com
 * outro texto lá (o do usuário), não faz nada e devolve `sem-marca`. Quem chama garante que o usuário não tem
 * rascunho e que o destino está livre.
 */
export async function retomarEnvio(d: Omit<DependenciasDoEnvio, 'escreverColagem'>): Promise<ResultadoDoEnvio | 'sem-marca'> {
  if (d.shell) return 'sem-marca'
  const marca = marcaDoPedido(d.texto)
  const noCampo = (tela: string): boolean => {
    const campo = campoNaTela(tela)
    return campo !== null && campoTemPedido(campo, marca)
  }
  if (!noCampo(await d.tela())) return 'sem-marca'
  const quieto = d.assentarMs ?? 1500
  if (quieto > 0) await esperarTelaParar(d, quieto, 15_000)
  // a tela mexeu enquanto se esperava: confere de novo antes de apertar
  if (!noCampo(await d.tela()) || d.interromper?.()) return 'sem-marca'
  return apertarEnter(d, marca, quieto)
}

async function apertarEnter(d: Omit<DependenciasDoEnvio, 'escreverColagem'>, marca: string, quieto: number): Promise<ResultadoDoEnvio | 'sem-marca'> {
  let ultima: ResultadoDoEnvio = 'incerto'
  let antesDoPrimeiro: string | undefined
  // Enter de novo é seguro: o texto não é reescrito, e Enter num campo vazio não faz nada no Claude nem no
  // Codex. Cada tentativa espera 5 s: o Claude leva 1,5–2 s para mostrar que recebeu, e com 2 s de prazo o
  // app às vezes concluía "ficou" de um pedido que tinha saído.
  for (let tentativa = 1; tentativa <= (d.tentativasDeEnter ?? 6); tentativa++) {
    // antes de cada Enter de novo, a tela parada de novo: o anterior pode ter caído no meio do texto chegando
    if (tentativa > 1 && quieto > 0) await esperarTelaParar(d, quieto, 15_000)
    const antesDesteEnter = await d.tela()
    // Enter de novo só com o pedido ainda no campo. Saiu (ou o campo agora tem outra coisa — o usuário pode ter
    // começado a escrever), um Enter a mais enviaria o que não é nosso: para por aqui e decide pela prova.
    if (tentativa > 1 && !d.shell) {
      const campo = campoNaTela(antesDesteEnter)
      if (campo !== null && !campoTemPedido(campo, marca)) {
        const prova = evidenciaDeEnvio({
          texto: d.texto,
          antes: antesDoPrimeiro ?? antesDesteEnter,
          depois: antesDesteEnter,
          ocupadoAntes: d.ocupado(antesDoPrimeiro ?? antesDesteEnter),
          ocupadoDepois: d.ocupado(antesDesteEnter),
          perguntaNova: false
        })
        return prova === 'saiu' ? 'saiu' : 'incerto'
      }
    }
    // A prova compara com a tela de antes do **primeiro** Enter, quando o pedido estava no campo. Comparando
    // com a de antes de cada tentativa, um primeiro Enter aceito (o Claude respondeu em 7 s, depois do prazo
    // desta olhada) deixava as seguintes com o campo já vazio dos dois lados, e o "saiu" nunca era visto.
    antesDoPrimeiro ??= antesDesteEnter
    const antes = d.shell ? antesDesteEnter : antesDoPrimeiro
    const perguntavaAntes = await d.emPergunta()
    // última conferência do usuário, imediatamente antes de CADA Enter (inclusive o primeiro): a leitura da tela e da
    // pergunta acima levam centenas de ms, e o usuário pode ter começado a digitar nelas
    if (d.interromper?.()) return tentativa === 1 ? 'sem-marca' : 'incerto'
    d.escrever('\r')
    ultima = 'incerto'
    for (const limite = Date.now() + (d.prazoDoEnterMs ?? 5000); Date.now() < limite; await d.esperar(150)) {
      const emPergunta = await d.emPergunta()
      const depois = await d.tela()
      // shell: responde na hora, então a tela mudar basta (o eco do comando é a prova)
      if (d.shell) {
        if (emPergunta || depois !== antes) return 'saiu'
        ultima = 'ficou'
        continue
      }
      const prova = evidenciaDeEnvio({
        texto: d.texto,
        antes,
        depois,
        ocupadoAntes: d.ocupado(antes),
        ocupadoDepois: d.ocupado(depois),
        perguntaNova: emPergunta && !perguntavaAntes
      })
      if (prova === 'saiu') return 'saiu'
      ultima = prova === 'ficou' ? 'ficou' : 'incerto'
    }
  }
  return ultima
}

/**
 * Resultado de uma rotina a partir do envio. `incerto` conta como `rodou`: o texto pode ter saído, e
 * `nao-enviou` faria a rotina repetir e duplicar o pedido. Só `ficou` (comprovadamente não saiu) é `nao-enviou`.
 * O `incerto` fica anotado no registro (ver `registroDoEnvio`).
 */
export function resultadoDaRotina(r: ResultadoDoEnvio): 'rodou' | 'nao-enviou' {
  return r === 'ficou' ? 'nao-enviou' : 'rodou'
}

/** O que anotar no registro depois de um envio sem usuário na linha (rotina, primeiro pedido de um cartão). */
export function registroDoEnvio(origem: 'rotina' | 'primeiro-pedido', r: ResultadoDoEnvio): { comando: string; alerta: string | null } {
  if (r === 'saiu') return { comando: origem, alerta: null }
  if (r === 'incerto') {
    return { comando: `${origem}-incerto`, alerta: `${origem}: não deu para confirmar o envio; pode ter saído, não repetir sem ver a tela` }
  }
  return { comando: `${origem}-nao-enviado`, alerta: `${origem}: o texto ficou escrito no campo de entrada e NÃO foi enviado` }
}

// ---------- a tela do agente recém-aberto, sem Electron (1.5.3) ----------

/** As últimas `quantas` linhas com texto, sem espaços no fim. */
const ultimasComTexto = (tela: string, quantas: number): string[] =>
  tela
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .slice(-quantas)

/**
 * A oferta de atualização do Codex e o que vem dela: colar **nesta tela instala o Codex** (13/11/2026: a ficha caiu na
 * oferta e o Codex rodou `npm install -g @openai/codex` sozinho). Nada é colado nem apertado enquanto estiver aí.
 */
const TELA_DE_ATUALIZACAO = /update available|updating codex|update ran successfully|update now|enter continue|press enter to continue|npm install -g @openai\/codex/i

/** O campo do Codex pronto: o placeholder dele ou o "N% context left" do rodapé. */
const MARCA_DO_CODEX_PRONTO = /ask codex|\bcontext left\b|for shortcuts/i

/** A última linha com texto é o prompt do PowerShell: o agente saiu (ou nunca abriu). */
export function agenteSaiuParaOShell(tela: string): boolean {
  const ultima = ultimasComTexto(tela, 1)[0] ?? ''
  return /^PS .*>\s*$/.test(ultima)
}

/**
 * A TUI do Codex está desenhada e pronta para receber colagem: o campo visível e **nenhum** sinal da oferta de
 * atualização nas últimas linhas (a parte de cima da TUI pode citar "update available" no histórico; o que vale é o pé).
 */
export function tuiDoCodexPronta(tela: string): boolean {
  const pe = ultimasComTexto(tela, 8).join('\n')
  if (TELA_DE_ATUALIZACAO.test(pe) || agenteSaiuParaOShell(tela)) return false
  return MARCA_DO_CODEX_PRONTO.test(ultimasComTexto(tela, 12).join('\n'))
}

/** Há uma tela de atualização do Codex no pé (oferta, instalando ou "Update ran successfully"). */
export function telaDeAtualizacaoDoCodex(tela: string): boolean {
  return TELA_DE_ATUALIZACAO.test(ultimasComTexto(tela, 8).join('\n'))
}

/**
 * O rodapé do Claude Code diz que há comando em segundo plano (`1 shell`, `2 shells`, `1 monitor`, `still running`):
 * ele está livre para digitar, mas só **esperando** o comando. Só o pé da tela conta (3 linhas).
 */
export function emSegundoPlano(tela: string): boolean {
  return /\b\d+\s+(?:shell|monitor|background task|local agent)s?\b|still running/i.test(ultimasComTexto(tela, 3).join('\n'))
}

/**
 * Rodapés e perguntas de diálogo (confiança na pasta, servidores MCP, permissão de ferramenta, atualização,
 * sim/não). Olhando só o fim da tela: o texto da conversa pode citar essas palavras.
 */
export const DIALOGO =
  /enter to confirm|enter confirm|esc not now|↑\/↓ choose|esc to cancel|esc to reject|enter continue|press enter to continue|update now|update available|new version available|atualiza[çc][ãa]o dispon[íi]vel|updating codex|update ran successfully|trust this folder|do you trust|do you want to proceed|\(y\/n\)|\[y\/n\]/i
/** Agente desenhado e esperando o primeiro pedido (Claude Code e Codex). */
const PRONTO = /for shortcuts|context left|ask codex|try "write a test for <filepath>"|auto mode on \(shift\+tab to cycle\)/i

export type EstadoDeProntidao = 'pronto' | 'confirmar' | 'saiu' | 'desconhecido' | 'esperar'

/**
 * Uma leitura da tela de um agente recém-aberto (já parada há ≥3 s): pode receber a ficha? Pura, para ter prova.
 * - `saiu`: o app abriu o agente e a tela voltou ao prompt do PowerShell. Nada é colado, nenhum Enter num shell.
 * - `confirmar`: diálogo no pé (confiança, MCP, **oferta de atualização do Codex**): nada é colado nem apertado.
 * - `pronto`: Claude, a marca de pronto; **Codex, a TUI pronta (campo, sem oferta) em duas leituras iguais seguidas**
 *   (`anterior` é a leitura de antes; devolvida em `anterior` para a próxima chamada).
 * - `desconhecido`: parada há mais de 6 s numa tela que não reconheço (09/11/2026: digitar em cima dela já perdeu pedido).
 */
export function lerProntidao(p: {
  agente: 'claude' | 'codex' | 'shell'
  lancouAgente: boolean
  tela: string
  /** `DIALOGO` no pé da tela (`janelaDeDialogo`, de caixa.ts: sem eco de ferramenta nem citações) */
  emDialogo: boolean
  anterior: string | null
  quietoMs: number
}): { estado: EstadoDeProntidao; anterior: string | null } {
  const { tela } = p
  if (p.lancouAgente && p.agente !== 'shell' && agenteSaiuParaOShell(tela)) return { estado: 'saiu', anterior: null }
  if (p.emDialogo) return { estado: 'confirmar', anterior: null }
  if (p.agente === 'codex') {
    if (tuiDoCodexPronta(tela)) return p.anterior === tela ? { estado: 'pronto', anterior: tela } : { estado: 'esperar', anterior: tela }
  } else if (PRONTO.test(tela)) {
    return { estado: 'pronto', anterior: null }
  }
  // Quieto, sem a marca de pronto e sem diálogo conhecido: uma tela que eu não sei ler. Reconhecer mais frases ajuda,
  // mas nunca vai acabar — cada versão de cada agente inventa uma tela nova. A regra que não envelhece: **não se
  // digita numa tela que não foi reconhecida**, e quem pediu fica sabendo.
  if (p.quietoMs > 6000 && tela.trim() && !agenteSaiuParaOShell(tela)) return { estado: 'desconhecido', anterior: null }
  return { estado: 'esperar', anterior: null }
}
