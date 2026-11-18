import { memo, useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js/lib/core'
import { ChevronsDownUp, ChevronsUpDown, Code2, FileCode, GitCompare, BookOpen, History, Pin, Radio, RefreshCw, WrapText } from 'lucide-react'
import type { MudancaArquivo } from '../../../shared/api'
import { caminhoRelativo, nomeDoArquivo } from '../../../shared/arquivos'
import { escaparHtml, linguaDe } from '../../../shared/realce'
import type { NoCodigo } from '../../../shared/modelo'
import { ehVisor } from '../../../shared/quadro/visor'
import { realcarLinhas } from '../arquivos/realce'
import {
  alternarRecolhidoDoCodigo,
  arvoresDoTerminal,
  atualizarNo,
  escolherArquivoDoVisor,
  pastaDoPlano,
  planoDe,
  seguirVisor,
  usarLoja
} from '../estado/loja'
import { irParaPagina } from '../casca/paginas'
import { pedirEIr } from '../paginas/leitor/pedido'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { abrirMenu } from '../ui/MenuContexto'

// O cartão que mostra o código. Ele não pergunta nada ao agente. Tem duas caras: o **visor** de um agente (uma
// lista de arquivos à esquerda, mais novo primeiro, e o arquivo escolhido à direita) e o cartão de **um arquivo**
// só (sem lista), que é o que o explorador abre.

/** "agora", "há 5 min", "há 2 h", "há 3 d": a idade de uma entrada da lista. */
export function haQuanto(em: number, agora: number): string {
  const s = Math.max(0, Math.round((agora - em) / 1000))
  if (s < 45) return 'agora'
  const min = Math.round(s / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.round(h / 24)} d`
}

type Tipo = 'mais' | 'menos' | 'trecho' | 'igual'

interface Carga {
  /** Já com o realce: cada linha é HTML de uma linha só (ver shared/realce.ts). */
  linhas: Array<{ html: string; tipo: Tipo }>
  erro: string | null
  aviso: string | null
  truncado: boolean
  /** É um diff de verdade (e não o arquivo inteiro): muda o que a canaleta da esquerda mostra. */
  patch: boolean
  /** O texto cru do arquivo inteiro (só fora do diff): é o que o `.md` formatado lê. */
  texto: string | null
}

const VAZIO: Carga = { linhas: [], erro: null, aviso: null, truncado: false, patch: false, texto: null }

const EH_MD = /\.(md|markdown)$/i

/** Realce dos blocos do Markdown: só `hljs.highlight(...).value` (que escapa); língua que o hljs não tem sai escapada. */
function realcarBloco(codigo: string, lingua: string): string | null {
  const nome = linguaDe(`x.${lingua}`) ?? lingua
  if (!hljs.getLanguage(nome)) return null
  try {
    return hljs.highlight(codigo, { language: nome, ignoreIllegals: true }).value
  } catch {
    return null
  }
}

/** O que aparece na canaleta da esquerda no modo diff. */
const SINAL: Record<Tipo, string> = { mais: '+', menos: '−', trecho: '', igual: '' }

/**
 * Recolher encolhe o cartão de verdade (não só esconde o conteúdo): era o pedido de não espalhar o quadro.
 * Quem faz é a loja, porque ela também arruma a coluna em volta.
 */
export function alternarRecolhido(no: NoCodigo): void {
  alternarRecolhidoDoCodigo(no.id)
}

/** Separa o patch do git em linhas com tipo. O cabeçalho do arquivo não interessa: o cartão já diz o nome. */
function lerPatch(patch: string): Array<{ texto: string; tipo: Tipo }> {
  return patch
    .split('\n')
    .filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(l))
    .map((texto) => {
      if (texto.startsWith('@@')) return { texto, tipo: 'trecho' as const }
      if (texto.startsWith('+')) return { texto: texto.slice(1), tipo: 'mais' as const }
      if (texto.startsWith('-')) return { texto: texto.slice(1), tipo: 'menos' as const }
      return { texto: texto.replace(/^ /, ''), tipo: 'igual' as const }
    })
}

function realcarTudo(texto: string, caminho: string): Carga['linhas'] {
  return realcarLinhas(texto, caminho).map((html) => ({ html, tipo: 'igual' as const }))
}

/**
 * Realce no diff: o texto vai inteiro ao realçador (de uma vez, para comentário e texto com crase não
 * perderem a cor na virada de linha) e o cabeçalho `@@` entra em branco, que não é código e confundiria o
 * tokenizador. Linha removida e a que a substituiu convivem no mesmo texto — às vezes isso desalinha uma
 * cor, e é um preço pequeno para ver o diff colorido.
 */
function realcarDiff(linhas: Array<{ texto: string; tipo: Tipo }>, caminho: string): Carga['linhas'] {
  const html = realcarLinhas(linhas.map((l) => (l.tipo === 'trecho' ? '' : l.texto)).join('\n'), caminho)
  return linhas.map((l, i) => ({
    tipo: l.tipo,
    html: l.tipo === 'trecho' ? escaparHtml(l.texto) : html[i] ?? escaparHtml(l.texto)
  }))
}

export const Codigo = memo(function Codigo({ no, selecionado }: { no: NoCodigo; selecionado: Marca }) {
  const pasta = usarLoja((e) => {
    if (!e.espaco) return ''
    const alvo = no.terminal ? planoDe(e.espaco).nos.find((n) => n.id === no.terminal) : undefined
    return (alvo?.tipo === 'terminal' ? alvo.pasta : undefined) || pastaDoPlano(e.espaco)
  })
  const nomeDoTerminal = usarLoja((e) => {
    if (!e.espaco || !no.terminal) return null
    const alvo = planoDe(e.espaco).nos.find((n) => n.id === no.terminal)
    return alvo?.tipo === 'terminal' ? alvo.nome : null
  })
  const nomeDaArvore = usarLoja((e) => {
    if (!e.espaco || !no.terminal || !ehVisor(no)) return ''
    const alvo = planoDe(e.espaco).nos.find((n) => n.id === no.terminal)
    if (alvo?.tipo !== 'terminal') return ''
    return arvoresDoTerminal(alvo).find((a) => a.id === (no.arvore ?? 'principal'))?.nome || 'principal'
  })
  const visor = ehVisor(no)
  const lista = ehVisor(no) ? no.arquivos : []
  const [agoraMs, definirAgora] = useState(() => Date.now())
  // a idade das entradas ("há 5 min") se atualiza sozinha, mas só enquanto o visor está aberto
  useEffect(() => {
    if (!visor || no.recolhido) return
    definirAgora(Date.now())
    const t = setInterval(() => definirAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [visor, no.recolhido])
  const [recentes, definirRecentes] = useState<MudancaArquivo[]>([])
  const [carga, definirCarga] = useState<Carga>(VAZIO)
  const [rodada, definirRodada] = useState(0)
  const alvoDaCarga = useRef<string | null>(null)
  // `.md` no modo arquivo sai formatado; "ver código" vale para o arquivo em que foi pedido
  const [verCodigo, definirVerCodigo] = useState<string | null>(null)

  const alvo = no.caminho ?? null
  const apagado = !!lista.find((a) => a.caminho === alvo)?.sumiu

  // a lista do botão de histórico: os arquivos que a pasta já tem
  useEffect(() => {
    if (!pasta || visor) return
    let vivo = true
    void window.ork.codigo.recentes(pasta).then((lista) => vivo && definirRecentes(lista))
    return () => {
      vivo = false
    }
  }, [pasta, visor])

  // vigia a pasta só para reler quando o arquivo deste cartão muda (quem abre cartão novo é a loja)
  useEffect(() => {
    if (!pasta || visor) return
    return window.ork.codigo.vigiar(pasta, (mudanca) => {
      definirRecentes((lista) => {
        const outros = lista.filter((m) => m.caminho !== mudanca.caminho)
        return mudanca.sumiu ? outros : [mudanca, ...outros].slice(0, 30)
      })
      if (mudanca.caminho === no.caminho) definirRodada((r) => r + 1)
    })
  }, [pasta, no.caminho, visor])

  useEffect(() => {
    // outro arquivo: a carga do anterior não fica na tela até a nova chegar
    if (alvoDaCarga.current !== alvo) {
      alvoDaCarga.current = alvo
      definirCarga(VAZIO)
    }
    // recolhido não lê nada: o bloquinho fica só com o nome e para de custar leitura de disco
    if (no.recolhido || !alvo) return definirCarga(VAZIO)
    // arquivo que sumiu do disco continua na lista, mas não há o que ler
    if (apagado) return definirCarga({ ...VAZIO, aviso: 'este arquivo foi apagado do disco' })
    let vivo = true
    const guardar = (c: Carga): void => {
      if (vivo) definirCarga(c)
    }
    const mostrarArquivo = async (aviso: string | null): Promise<void> => {
      const t = await window.ork.codigo.ler(alvo)
      guardar({
        linhas: t.erro ? [] : realcarTudo(t.conteudo, alvo),
        erro: t.erro ?? null,
        aviso,
        truncado: t.truncado,
        patch: false,
        texto: t.erro ? null : t.conteudo
      })
    }
    if (no.modo === 'conteudo') {
      void mostrarArquivo(null)
      return () => {
        vivo = false
      }
    }
    void window.ork.codigo.diff(alvo).then(async (d) => {
      if (d.erro) return guardar({ ...VAZIO, erro: d.erro })
      if (d.patch) {
        return guardar({ linhas: realcarDiff(lerPatch(d.patch), alvo), erro: null, aviso: null, truncado: false, patch: true, texto: null })
      }
      // nada para comparar (pasta sem git, arquivo novo, ou sem mudança): mostra o arquivo e diz por quê
      await mostrarArquivo(
        d.semGit
          ? 'pasta sem git: mostrando o arquivo inteiro'
          : d.novo
            ? 'arquivo novo: o git ainda não tem com o que comparar'
            : 'igual ao último commit'
      )
    })
    return () => {
      vivo = false
    }
  }, [alvo, apagado, no.modo, no.recolhido, rodada])

  const quebra = no.quebra !== false
  // só o arquivo inteiro (modo conteúdo) é formatado; o diff é sempre código
  const ehMd = !!alvo && EH_MD.test(alvo) && no.modo === 'conteudo' && carga.texto !== null && !carga.patch
  const querFormatado = ehMd && verCodigo !== alvo
  // o markdown-it só é baixado quando um .md vai ser formatado (fora do pacote inicial)
  const [renderizador, definirRenderizador] = useState<typeof import('../../../shared/markdown').renderizarMarkdown | null>(null)
  // formatado só com o renderizador pronto: enquanto carrega (ou se o import falhar) o código fica à mostra
  const formatado = querFormatado && renderizador !== null
  useEffect(() => {
    if (!querFormatado || renderizador) return
    let vivo = true
    import('../../../shared/markdown').then(
      (m) => vivo && definirRenderizador(() => m.renderizarMarkdown),
      () => undefined
    )
    return () => {
      vivo = false
    }
  }, [querFormatado, renderizador])
  const htmlMd = useMemo(
    () => (formatado && renderizador !== null && carga.texto !== null ? renderizador(carga.texto, { realcar: realcarBloco }) : ''),
    [formatado, renderizador, carga.texto]
  )

  /** Clique no Markdown formatado: nada navega a janela. Externo abre pelo main, que revalida http/https. */
  const aoClicarMd = (e: React.MouseEvent): void => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault()
    const externo = a.getAttribute('data-externo')
    const md = a.getAttribute('data-md')
    // o main revalida (http, https e mailto limpo): mesma regra e mesma função do Leitor
    if (externo) void window.ork.leitor.externo(externo)
    // o Leitor resolve e confere o alvo no principal (lerLink); aqui só vai o pedido
    else if (md && alvo) abrirNoLeitor(md)
  }

  /** Troca para a página do Leitor e pede o arquivo (ou o link relativo clicado dentro dele). */
  function abrirNoLeitor(link?: string): void {
    if (!alvo) return
    pedirEIr({ de: alvo, link }, irParaPagina)
  }

  const nome = alvo ? nomeDoArquivo(alvo) : visor ? 'nenhum arquivo ainda' : 'esperando o agente gravar'
  const relativo = alvo ? caminhoRelativo(pasta, alvo) ?? alvo : ''
  const semArrasto = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() }

  // recolhido é um bloquinho com o nome do arquivo e um só botão: abrir
  if (no.recolhido) {
    return (
      <MolduraNo no={no} selecionado={selecionado} className="recolhido" aoClicarDuasVezes={() => alternarRecolhido(no)}>
        <div className="cartao-ferramenta">
          <header className="cartao-ferramenta-cabecalho" data-arrasta title={alvo ?? pasta}>
            <FileCode size={13} />
            <span className="cartao-ferramenta-titulo">{nome}</span>
            {visor && <span className="codigo-contagem">{lista.length === 1 ? '1 arquivo' : `${lista.length} arquivos`}</span>}
            <button className="botao-mini" title="Abrir" {...semArrasto} onClick={() => alternarRecolhido(no)}>
              <ChevronsUpDown size={12} />
            </button>
          </header>
        </div>
      </MolduraNo>
    )
  }

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho" data-arrasta>
          <FileCode size={13} />
          <span className="cartao-ferramenta-titulo" title={alvo ?? pasta}>
            {visor ? `${nomeDoTerminal ?? 'código'} · ${nomeDaArvore}` : nome}
          </span>
          {visor && (
            <button
              className={`botao-mini codigo-seguir${no.seguindo === false ? '' : ' ligado'}`}
              title={
                no.seguindo === false
                  ? 'Fixo neste arquivo — clique para voltar a seguir o que o agente gravar'
                  : 'Seguindo o agente: mostra o arquivo mais novo'
              }
              disabled={no.seguindo !== false}
              {...semArrasto}
              onClick={() => seguirVisor(no.id)}
            >
              {no.seguindo === false ? <Pin size={12} /> : <Radio size={12} />}
            </button>
          )}
          {!visor && (
            <button
              className="botao-mini"
              title="Arquivos mexidos por último nesta pasta"
              disabled={!recentes.length}
              {...semArrasto}
              onClick={(e) => {
                const caixa = e.currentTarget.getBoundingClientRect()
                abrirMenu(
                  caixa.left,
                  caixa.bottom,
                  recentes.slice(0, 12).map((m) => ({
                    rotulo: caminhoRelativo(pasta, m.caminho) ?? nomeDoArquivo(m.caminho),
                    marcado: m.caminho === alvo,
                    acao: () => atualizarNo(no.id, { caminho: m.caminho }, false)
                  }))
                )
              }}
            >
              <History size={12} />
            </button>
          )}
          {alvo && EH_MD.test(alvo) && !apagado && (
            <button
              className="botao-mini codigo-abrir-leitor"
              data-abrir-leitor
              title="Abrir no Leitor"
              aria-label="Abrir no Leitor"
              {...semArrasto}
              onClick={() => abrirNoLeitor()}
            >
              <BookOpen size={12} />
            </button>
          )}
          {ehMd && (
            <button
              className="botao-mini"
              title={querFormatado ? 'Ver o código do Markdown' : 'Ver formatado'}
              {...semArrasto}
              onClick={() => definirVerCodigo(querFormatado ? alvo : null)}
            >
              {querFormatado ?<Code2 size={12} /> : <FileCode size={12} />}
            </button>
          )}
          {!formatado && (
            <button
              className={`botao-mini${quebra ? ' ativo' : ''}`}
              title={quebra ? 'Quebra de linha ligada — voltar à rolagem para os lados' : 'Rolagem para os lados — quebrar as linhas'}
              {...semArrasto}
              onClick={() => atualizarNo(no.id, { quebra: !quebra }, false)}
            >
              <WrapText size={12} />
            </button>
          )}
          <button
            className="botao-mini"
            title={no.modo === 'diff' ? 'Mostrando o que mudou — ver o arquivo inteiro' : 'Mostrando o arquivo — ver o que mudou'}
            {...semArrasto}
            onClick={() => atualizarNo(no.id, { modo: no.modo === 'diff' ? 'conteudo' : 'diff' }, false)}
          >
            {no.modo === 'diff' ? <GitCompare size={12} /> : <FileCode size={12} />}
          </button>
          <button className="botao-mini" title="Reler agora" {...semArrasto} onClick={() => definirRodada((r) => r + 1)}>
            <RefreshCw size={12} />
          </button>
          <button className="botao-mini" title="Recolher (fica só o nome)" {...semArrasto} onClick={() => alternarRecolhido(no)}>
            <ChevronsDownUp size={12} />
          </button>
        </header>
        <div className={visor ? 'codigo-visor' : 'codigo-um'}>
          {visor && (
            <ul className="codigo-lista rolavel" data-sem-arrasto aria-label="Arquivos do agente">
              {lista.length === 0 && <li className="codigo-lista-vazia">—</li>}
              {lista.map((a, i) => {
                const novo = no.seguindo === false && i === 0 && a.caminho !== alvo
                return (
                  <li key={a.caminho}>
                    <button
                      className={`codigo-item${a.caminho === alvo ? ' ativo' : ''}${a.sumiu ? ' sumiu' : ''}`}
                      title={caminhoRelativo(pasta, a.caminho) ?? a.caminho}
                      onClick={() => escolherArquivoDoVisor(no.id, a.caminho)}
                    >
                      <span className="codigo-item-nome">{nomeDoArquivo(a.caminho)}</span>
                      {novo && <span className="codigo-novo" title="chegou arquivo novo" />}
                      <span className="codigo-item-idade">{a.sumiu ? 'apagado' : haQuanto(a.em, agoraMs)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="codigo-corpo rolavel" data-sem-arrasto>
          {!alvo ? (
            visor ? <p className="codigo-aviso">Nenhum arquivo ainda. O que o agente gravar aparece aqui.</p> : null
          ) : carga.erro ? (
            <p className="codigo-aviso">{carga.erro}</p>
          ) : (
            <>
              {carga.aviso && <p className="codigo-aviso">{carga.aviso}</p>}
              {formatado ? (
                <div className="codigo-md" onClick={aoClicarMd} dangerouslySetInnerHTML={{ __html: htmlMd }} />
              ) : (
                <pre className={`codigo-linhas${quebra ? ' quebra' : ''}`}>
                  {carga.linhas.map((linha, i) => (
                    <div key={i} className={`codigo-linha ${linha.tipo}`}>
                      {/* no arquivo inteiro, a canaleta é o número da linha; no diff, o sinal do que mudou */}
                      <span className="codigo-numero">{carga.patch ? SINAL[linha.tipo] : i + 1}</span>
                      <code dangerouslySetInnerHTML={{ __html: linha.html }} />
                    </div>
                  ))}
                </pre>
              )}
              {carga.truncado && <p className="codigo-aviso">arquivo grande: só o começo está à mostra</p>}
            </>
          )}
          </div>
        </div>
        <footer className="cartao-ferramenta-rodape" data-arrasta title={alvo ?? ''}>
          <span className="codigo-caminho">{relativo || (visor ? '' : pasta)}</span>
          {visor && <span className="codigo-fonte">{no.seguindo === false ? 'fixo' : 'seguindo'}</span>}
          {nomeDoTerminal && !visor && <span className="codigo-fonte">{nomeDoTerminal}</span>}
        </footer>
      </div>
    </MolduraNo>
  )
})
