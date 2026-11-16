/**
 * Visor de código: um por agente e por árvore, com a lista dos arquivos que o agente mexeu.
 *
 * Tudo aqui é função pura (sem relógio, sem sorteio, sem disco): quem chama passa o instante. A loja só aplica
 * o resultado e as provas rodam sem Electron.
 *
 * Risco aceito (B2a, item 1): abrir na 1.7.0 um quadro já migrado pode perder o histórico do visor. A 1.7.0 não conhece
 * `arquivos`; cada arquivo novo vira cartão velho, o visor (`automatico`) desce uma posição na coluna e, no 13º, sai do
 * quadro levando a lista (até 50) e o fixo. Não quebra, e os arquivos novos voltam pela migração. O `.bak` antes da 1ª
 * gravação migrada fica para a B2b.
 *
 * O que muda em disco: `NoCodigo` ganha `arquivos` e `seguindo` (opcionais). Quadro antigo tem um cartão por
 * arquivo; `migrarCodigos` junta esses cartões em um visor. Ela é idempotente porque só olha cartão com
 * `terminal` e **sem** `arquivos`: o que ela produz já tem `arquivos`, então a segunda rodada não acha nada.
 */
import type { ArquivoDoVisor, No, NoCodigo, Plano } from '../modelo'

/** Quantos arquivos ficam na lista de um visor. Passando disso, sai o mais velho. */
export const MAX_NA_LISTA = 50
/** A árvore que todo agente tem desde sempre (a mesma de `estado/codigo.ts`); no disco é o campo `arvore` ausente. */
export const ARVORE_PRINCIPAL = 'principal'
/** Tamanho de um visor aberto, e do bloquinho quando ele está recolhido. */
export const VISOR_ABERTO = { largura: 860, altura: 460 }
export const VISOR_RECOLHIDO = { largura: 300, altura: 30 }

export const ehVisor = (no: No): no is NoCodigo & { arquivos: ArquivoDoVisor[] } =>
  no.tipo === 'codigo' && Array.isArray(no.arquivos)

/** Chave de um visor: o agente e a árvore dele. `principal` e ausente são a mesma árvore. */
const chave = (no: NoCodigo): string => `${no.terminal}\u0000${no.arvore && no.arvore !== ARVORE_PRINCIPAL ? no.arvore : ''}`

/** A ordem da coluna de antes do visor (a de `arrumarColuna`): `ordem`, depois o mais novo primeiro; `id` desempata. */
function naOrdemDaColuna(a: NoCodigo, b: NoCodigo): number {
  const pa = a.ordem ?? Number.MAX_SAFE_INTEGER
  const pb = b.ordem ?? Number.MAX_SAFE_INTEGER
  return pa - pb || b.criadoEm.localeCompare(a.criadoEm) || a.id.localeCompare(b.id)
}

/** Corta em `max` tirando os mais antigos, mas **nunca** o arquivo à mostra (`exibido`): sai o mais antigo dos outros. */
function cortar(arquivos: ArquivoDoVisor[], max: number, exibido?: string): ArquivoDoVisor[] {
  let sobra = arquivos.length - Math.max(1, max)
  if (sobra <= 0) return arquivos
  const saem = new Set<number>()
  for (let i = arquivos.length - 1; i >= 0 && sobra > 0; i--) {
    if (arquivos[i]!.caminho === exibido) continue
    saem.add(i)
    sobra--
  }
  return arquivos.filter((_, i) => !saem.has(i))
}

/**
 * Junta os cartões soltos de um agente numa lista, na ordem dada, sem repetir caminho: a posição é a da primeira
 * vez, mas o `em` é o **maior** do caminho (a lista mostra "há X min" do uso mais recente).
 */
function listaDeCartoes(cartoes: NoCodigo[], ja: ArquivoDoVisor[] = []): ArquivoDoVisor[] {
  const lista = ja.map((a) => ({ ...a }))
  const por = new Map(lista.map((a) => [a.caminho, a]))
  for (const c of cartoes) {
    if (!c.caminho) continue
    const em = Date.parse(c.criadoEm) || 0
    const ex = por.get(c.caminho)
    if (ex) {
      if (em > ex.em) ex.em = em
      continue
    }
    const novo: ArquivoDoVisor = { caminho: c.caminho, em }
    por.set(c.caminho, novo)
    lista.push(novo)
  }
  return lista
}

/** O visor que nasce de um grupo de cartões antigos do mesmo agente e da mesma árvore (já na ordem da coluna). */
function visorDoGrupo(cartoes: NoCodigo[]): NoCodigo {
  // posição e aparência vêm do primeiro cartão da coluna; sem coluna (todos arrastados para fora), do primeiro
  const base = cartoes.find((c) => c.automatico) ?? cartoes[0]!
  // o arquivo à mostra é o do cartão que estava aberto; se todos estavam recolhidos, o de maior `criadoEm`
  const comCaminho = cartoes.filter((c) => c.caminho)
  const exibido =
    comCaminho.find((c) => !c.recolhido) ??
    comCaminho.reduce<NoCodigo | undefined>((m, c) => (!m || c.criadoEm.localeCompare(m.criadoEm) > 0 ? c : m), undefined)
  const recolhido = (exibido ?? base).recolhido === true
  const { ordem: _ordem, caminho: _caminho, ...resto } = base
  const visor: NoCodigo = {
    ...resto,
    modo: (exibido ?? base).modo,
    recolhido,
    largura: recolhido ? VISOR_RECOLHIDO.largura : VISOR_ABERTO.largura,
    altura: recolhido ? VISOR_RECOLHIDO.altura : VISOR_ABERTO.altura,
    larguraAberta: VISOR_ABERTO.largura,
    alturaAberta: VISOR_ABERTO.altura,
    arquivos: cortar(listaDeCartoes(cartoes), MAX_NA_LISTA, exibido?.caminho)
  }
  delete visor.seguindo // ausente = acompanha
  if (exibido?.caminho) visor.caminho = exibido.caminho
  return visor
}

/**
 * Quadro salvo antes do visor → quadro com visores. Pura e idempotente.
 *
 * Cada grupo de cartões de código com `terminal` (agente + árvore) vira **um** visor, inclusive os que o usuário
 * arrastou para fora da coluna. A lista sai da ordem da coluna, sem repetir caminho; cartão sem `caminho` só
 * some. O visor herda o id, a posição e a cor do primeiro cartão da coluna, o modo e o arquivo à mostra do
 * cartão que estava aberto, e nasce seguindo (campo `seguindo` ausente). Cartão sem `terminal` (um arquivo aberto
 * à mão), ou cujo `terminal` não existe mais no plano, não é tocado: fica como cartão de um arquivo.
 *
 * Se já existe um visor do mesmo agente e árvore (por exemplo, uma versão velha criou cartão novo depois da
 * migração), os cartões soltos entram na lista dele, sem repetir, e somem; a lista fica ordenada por `em`, do mais
 * novo para o mais velho.
 *
 * Nada a migrar → devolve o próprio `plano` (mesma referência), para a loja saber que não precisa regravar.
 */
export function migrarCodigos(plano: Plano): Plano {
  const terminais = new Set(plano.nos.filter((n) => n.tipo === 'terminal').map((n) => n.id))
  const antigos = new Map<string, NoCodigo[]>()
  const visores = new Map<string, NoCodigo>()
  for (const n of plano.nos) {
    if (n.tipo !== 'codigo' || !n.terminal || !terminais.has(n.terminal)) continue
    if (ehVisor(n)) {
      if (!visores.has(chave(n))) visores.set(chave(n), n)
    } else {
      const grupo = antigos.get(chave(n))
      if (grupo) grupo.push(n)
      else antigos.set(chave(n), [n])
    }
  }
  if (antigos.size === 0) return plano

  const troca = new Map<string, NoCodigo>()
  const some = new Set<string>()
  for (const [k, grupo] of antigos) {
    const ordenado = [...grupo].sort(naOrdemDaColuna)
    const existente = visores.get(k)
    if (existente) {
      const lista = listaDeCartoes(ordenado, existente.arquivos).sort((a, b) => b.em - a.em)
      troca.set(existente.id, { ...existente, arquivos: cortar(lista, MAX_NA_LISTA, existente.caminho) })
      for (const c of ordenado) some.add(c.id)
    } else {
      const visor = visorDoGrupo(ordenado)
      troca.set(visor.id, visor)
      for (const c of ordenado) if (c.id !== visor.id) some.add(c.id)
    }
  }
  return {
    ...plano,
    nos: plano.nos.flatMap((n) => (troca.has(n.id) ? [troca.get(n.id)!] : some.has(n.id) ? [] : [n]))
  }
}

/**
 * O agente gravou `caminho`: ele sobe ao **topo** da lista sem repetir (a entrada velha some, e um "apagado"
 * antigo deixa de valer), e a lista corta em `max` sem nunca tirar o que está à mostra. Não troca o que está à mostra — quem decide é
 * `exibidoDepois`, depois da espera de 2 s — exceto quando ainda não havia nada à mostra.
 */
export function anotarNoVisor(no: NoCodigo, caminho: string, em: number, max: number = MAX_NA_LISTA): NoCodigo {
  const resto = (no.arquivos ?? []).filter((a) => a.caminho !== caminho)
  const arquivos = cortar([{ caminho, em }, ...resto], max, no.caminho)
  return no.caminho === undefined ? { ...no, arquivos, caminho } : { ...no, arquivos }
}

/**
 * O que o visor deve mostrar quando a espera termina e `chegou` é o arquivo mais novo. Seguindo (o padrão),
 * é o que chegou; fixo (`seguindo === false`), continua o que já estava.
 */
export const exibidoDepois = (no: NoCodigo, chegou: string): string | undefined => (no.seguindo === false ? no.caminho : chegou)

/** O arquivo foi apagado do disco: continua na lista, marcado. Arquivo que nunca esteve na lista não entra. */
export function marcarApagado(no: NoCodigo, caminho: string): NoCodigo {
  if (!no.arquivos?.some((a) => a.caminho === caminho && !a.sumiu)) return no
  return { ...no, arquivos: no.arquivos.map((a) => (a.caminho === caminho ? { ...a, sumiu: true } : a)) }
}

/** Para voltar a seguir: tira o `seguindo: false` e mostra o mais novo da lista. */
export function seguirDeNovo(no: NoCodigo): NoCodigo {
  const { seguindo: _seguindo, ...resto } = no
  const topo = no.arquivos?.[0]?.caminho
  return topo === undefined ? resto : { ...resto, caminho: topo }
}

/** O usuário clicou num arquivo da lista. O mais novo volta a seguir; qualquer outro **fixa** o visor nele. */
export function escolherNoVisor(no: NoCodigo, caminho: string): NoCodigo {
  if (no.arquivos?.[0]?.caminho === caminho) return seguirDeNovo(no)
  return { ...no, caminho, seguindo: false }
}

/**
 * Tira da lista os arquivos pedidos (o agente os entregou a outro). Se um deles era o que estava à mostra, passa a
 * mostrar o mais novo que sobrou — ou nada, se a lista esvaziou.
 */
export function tirarDoVisor(no: NoCodigo, caminhos: string[]): NoCodigo {
  const saem = new Set(caminhos)
  const arquivos = (no.arquivos ?? []).filter((a) => !saem.has(a.caminho))
  if (arquivos.length === (no.arquivos ?? []).length) return no
  if (no.caminho === undefined || !saem.has(no.caminho)) return { ...no, arquivos }
  const { caminho: _caminho, ...resto } = no
  return arquivos[0] ? { ...resto, arquivos, caminho: arquivos[0].caminho } : { ...resto, arquivos }
}

/**
 * Junta entradas (de outro visor) na lista de `destino`, sem repetir caminho: vale a entrada de maior `em`. A lista
 * volta ao mais novo primeiro, corta em `MAX_NA_LISTA` sem tirar o que está à mostra, e um visor sem nada à mostra
 * passa a mostrar o primeiro.
 */
export function juntarNoVisor(destino: NoCodigo, entradas: ArquivoDoVisor[]): NoCodigo {
  const por = new Map((destino.arquivos ?? []).map((a) => [a.caminho, { ...a }]))
  for (const e of entradas) {
    const ex = por.get(e.caminho)
    if (!ex || e.em > ex.em) por.set(e.caminho, { ...e })
  }
  const lista = [...por.values()].sort((a, b) => b.em - a.em)
  const arquivos = cortar(lista, MAX_NA_LISTA, destino.caminho)
  return destino.caminho === undefined && arquivos[0] ? { ...destino, arquivos, caminho: arquivos[0].caminho } : { ...destino, arquivos }
}

/** `migrarCodigos` no térreo e em cada andar do espaço. Nada a migrar → o próprio espaço (mesma referência). */
export function migrarEspaco<E extends Plano & { andares: Plano[] }>(espaco: E): E {
  const terreo = migrarCodigos(espaco)
  const andares = espaco.andares.map((a) => {
    const m = migrarCodigos(a)
    return m === a ? a : { ...a, nos: m.nos }
  })
  if (terreo === espaco && andares.every((a, i) => a === espaco.andares[i])) return espaco
  return { ...espaco, nos: terreo.nos, andares }
}

/**
 * `ork arvore dar`: os `caminhos` saem das listas de todos os visores de `origem` e entram no topo do visor
 * **principal** de `destino` (que já existe). A marca de apagado vai junto, e o arquivo sai das outras árvores do
 * destino para não ficar repetido. Nada a entregar ou destino sem principal → os próprios `nos`.
 */
export function entregarEntreVisores(nos: No[], origem: string, destino: string, caminhos: string[], em: number): No[] {
  const principal = nos.find((n) => ehVisor(n) && n.terminal === destino && (!n.arvore || n.arvore === ARVORE_PRINCIPAL))
  if (!principal || principal.tipo !== 'codigo') return nos
  const dele = nos.flatMap((n) => (ehVisor(n) && n.terminal === origem ? n.arquivos : []))
  const entradas = caminhos.flatMap((c, i) => {
    const velha = dele.find((a) => a.caminho === c)
    return velha ? [{ caminho: c, em: em + i, ...(velha.sumiu ? { sumiu: true } : {}) }] : []
  })
  if (!entradas.length) return nos
  const saem = entradas.map((e) => e.caminho)
  return nos.map((n) => {
    if (n.tipo !== 'codigo' || !ehVisor(n)) return n
    if (n.terminal === origem) return tirarDoVisor(n, saem)
    if (n.terminal !== destino) return n
    return n.id === principal.id ? juntarNoVisor(n, entradas) : tirarDoVisor(n, saem)
  })
}
