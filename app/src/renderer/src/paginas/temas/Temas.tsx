import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, FileUp, Palette, Pencil, Plus, RotateCcw, Trash2, Puzzle } from 'lucide-react'
import { TEMAS, type Tema } from '../../../../shared/temas'
import { GRUPOS_DE_TOKENS, TOKENS_EDITAVEIS, normalizarHex, type TemaDoUsuario, type TokenEditavel } from '../../../../shared/temasUsuario'
import { definirTema, usarLoja } from '../../estado/loja'
import { confirmar } from '../../ui/Perguntas'
import { definirRascunho, lerEstadoDosTemas, pedir, usarTemas } from './aplicar'
import '../../estilos/temas.css'

// Temas (página geral, 1.9.3): os temas de fábrica e os do usuário em cartões com prévia; duplicar um tema e mudar as
// cores com efeito na hora (o rascunho é aplicado na janela antes de salvar); e os plugins de CSS, que só redefinem
// tokens. Tudo o que grava passa pelo processo principal (main/temas.ts), que valida de novo.

const NOME_DE_FABRICA: Record<string, string> = { escuro: 'Escuro', claro: 'Claro' }
/** As amostras de cada cartão: as cores que mais aparecem. */
const AMOSTRAS: TokenEditavel[] = ['--quadro-fundo', '--painel', '--texto', '--destaque', '--perigo']

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// ---------------------------------------------------------------- cores da base (para o editor)

let tela: CanvasRenderingContext2D | null = null
/** Qualquer cor que o navegador entenda vira #rrggbb (o seletor de cor só aceita assim). */
function paraHex(valor: string): string {
  const direto = normalizarHex(valor)
  if (direto) return direto
  tela ??= document.createElement('canvas').getContext('2d')
  if (!tela) return '#000000'
  tela.fillStyle = '#000000'
  tela.fillStyle = valor
  return normalizarHex(tela.fillStyle) ?? '#000000'
}

/** As cores que valem na raiz sem o tema do usuário: as de fábrica com os plugins ligados. */
function coresDaBase(): Record<string, string> {
  const raiz = document.querySelector('.app')
  if (!raiz) return {}
  const folha = (document.getElementById('ork-tema-usuario') as HTMLStyleElement | null)?.sheet
  if (folha) folha.disabled = true
  try {
    const cs = getComputedStyle(raiz)
    return Object.fromEntries(TOKENS_EDITAVEIS.map((t) => [t, paraHex(cs.getPropertyValue(t).trim())]))
  } finally {
    if (folha) folha.disabled = false
  }
}

// ---------------------------------------------------------------- cartões

interface Cartao {
  id: string
  nome: string
  base: Tema
  cores: TemaDoUsuario['cores']
  doUsuario: boolean
}

function Previa({ base, cores }: { base: Tema; cores: TemaDoUsuario['cores'] }) {
  // a prévia é desenhada com a classe do tema e as cores trocadas por cima: os tokens resolvem para aquele tema
  return (
    <div className={`temas-previa tema-${base}`} style={cores as CSSProperties} aria-hidden>
      <span className="temas-previa-lateral" />
      <span className="temas-previa-painel">
        <span className="temas-previa-linha" />
        <span className="temas-previa-linha curta" />
        <span className="temas-previa-botao" />
      </span>
      <span className="temas-amostras">
        {AMOSTRAS.map((t) => (
          <span key={t} className="temas-amostra" data-token={t} />
        ))}
      </span>
    </div>
  )
}

function CartaoDeTema({ c, emUso, aoUsar, aoDuplicar, aoEditar }: { c: Cartao; emUso: boolean; aoUsar: () => void; aoDuplicar: () => void; aoEditar?: () => void }) {
  return (
    <article className={`temas-cartao ${emUso ? 'em-uso' : ''}`} data-tema-cartao={c.id} aria-current={emUso ? 'true' : undefined}>
      <Previa base={c.base} cores={c.cores} />
      <div className="temas-cartao-nome">
        <b>{c.nome}</b>
        <span className="suave">{c.doUsuario ? `seu · base ${NOME_DE_FABRICA[c.base] ?? c.base}` : 'de fábrica'}</span>
      </div>
      <div className="temas-cartao-acoes">
        <button type="button" data-acao="usar" className={emUso ? 'em-uso' : 'primario'} disabled={emUso} onClick={aoUsar}>
          {emUso ? <Check size={13} /> : null} {emUso ? 'Em uso' : 'Usar'}
        </button>
        <button type="button" data-acao="duplicar" title={`Duplicar "${c.nome}" e editar a cópia`} onClick={aoDuplicar}>
          <Copy size={13} /> Duplicar
        </button>
        {aoEditar && (
          <button type="button" data-acao="editar" title={`Editar "${c.nome}"`} onClick={aoEditar}>
            <Pencil size={13} /> Editar
          </button>
        )}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- editor

function CampoDeCor({ token, rotulo, valor, trocado, aoMudar, aoVoltar }: { token: string; rotulo: string; valor: string; trocado: boolean; aoMudar: (hex: string) => void; aoVoltar: () => void }) {
  const [texto, definirTexto] = useState(valor)
  useEffect(() => {
    definirTexto(valor)
  }, [valor])
  const invalido = normalizarHex(texto) === null
  return (
    <div className={`temas-cor ${trocado ? 'trocada' : ''}`} data-token={token}>
      <span className="temas-cor-rotulo">{rotulo}</span>
      <input type="color" value={valor} aria-label={`${rotulo}: escolher cor`} onChange={(e) => aoMudar(e.target.value)} />
      <input
        type="text"
        value={texto}
        spellCheck={false}
        maxLength={7}
        aria-label={`${rotulo}: cor em hex`}
        aria-invalid={invalido}
        onChange={(e) => {
          definirTexto(e.target.value)
          const hex = normalizarHex(e.target.value)
          if (hex) aoMudar(hex)
        }}
      />
      <button type="button" className="temas-icone" title="Voltar à cor da base" aria-label={`${rotulo}: voltar à cor da base`} disabled={!trocado} onClick={aoVoltar}>
        <RotateCcw size={13} />
      </button>
    </div>
  )
}

function Editor({ rascunho, salvo, temaEmTela }: { rascunho: TemaDoUsuario; salvo: TemaDoUsuario | undefined; temaEmTela: Tema }) {
  const plugins = usarTemas((e) => e.arquivo.plugins)
  const [erro, definirErro] = useState('')
  const naBase = rascunho.base === temaEmTela
  // a base é lida da raiz (com os plugins); muda quando o tema em tela ou os plugins mudam
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => (naBase ? coresDaBase() : {}), [naBase, temaEmTela, plugins])
  // ao abrir (ou trocar de tema em edição), o editor vem para a vista: ele nasce abaixo dos cartões
  const caixa = useRef<HTMLElement>(null)
  useEffect(() => {
    void caixa.current?.scrollIntoView({ block: 'nearest' })
  }, [rascunho.id])
  const pendente = !salvo || salvo.nome !== rascunho.nome.trim() || JSON.stringify(salvo.cores) !== JSON.stringify(rascunho.cores)

  const mudar = (parcial: Partial<TemaDoUsuario>): void => definirRascunho({ ...rascunho, ...parcial })
  const trocarCor = (token: TokenEditavel, hex: string | null): void => {
    const cores = { ...rascunho.cores }
    if (hex === null || hex === base[token]) delete cores[token]
    else cores[token] = hex
    // ordem estável (a do editor), para o "pendente" não acusar mudança só por ordem
    mudar({ cores: Object.fromEntries(TOKENS_EDITAVEIS.filter((t) => cores[t]).map((t) => [t, cores[t]])) })
  }

  async function salvar(): Promise<void> {
    definirErro('')
    const r = await pedir({ tipo: 'salvarTema', tema: { id: rascunho.id, nome: rascunho.nome, base: rascunho.base, cores: rascunho.cores } })
    if (!r.ok) return definirErro(r.erro)
    const novo = r.arquivo.temas.find((t) => t.id === rascunho.id)
    definirRascunho(novo ? { ...novo, cores: { ...novo.cores } } : null)
  }

  async function apagar(): Promise<void> {
    const r = await confirmar({
      titulo: `Apagar o tema "${salvo?.nome ?? rascunho.nome}"?`,
      mensagem: 'O app volta ao tema de fábrica. Não dá para desfazer.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Apagar', valor: 'apagar', perigo: true }
      ]
    })
    if (r.botao !== 'apagar') return
    const res = await pedir({ tipo: 'apagarTema', id: rascunho.id })
    if (!res.ok) return definirErro(res.erro)
    definirRascunho(null)
  }

  return (
    <section ref={caixa} className="temas-editor" data-tema-editor={rascunho.id} aria-label={`Editar o tema ${rascunho.nome}`}>
      <div className="temas-editor-topo">
        <label className="temas-campo">
          <span className="suave">Nome</span>
          <input value={rascunho.nome} maxLength={60} aria-label="Nome do tema" onChange={(e) => mudar({ nome: e.target.value })} />
        </label>
        <span className="suave temas-editor-nota">
          {pendente ? 'As mudanças já aparecem nesta janela; salve para guardar.' : 'Tudo salvo.'} Base: {NOME_DE_FABRICA[rascunho.base] ?? rascunho.base}.
        </span>
        <div className="temas-acoes temas-editor-acoes">
          <button type="button" className="primario" data-acao="salvar" disabled={!pendente || !rascunho.nome.trim()} onClick={() => void salvar()}>
            Salvar
          </button>
          <button
            type="button"
            data-acao="descartar"
            onClick={() => definirRascunho(null)}
            title={pendente ? 'Desfaz as mudanças não salvas e fecha o editor' : 'Fecha o editor'}
          >
            {pendente ? 'Descartar' : 'Fechar'}
          </button>
          <button type="button" className="perigo" data-acao="apagar" disabled={!salvo} onClick={() => void apagar()}>
            <Trash2 size={13} /> Apagar
          </button>
        </div>
      </div>
      {naBase ? (
        <div className="temas-grupos">
          {GRUPOS_DE_TOKENS.map((g) => (
            <fieldset key={g.id} className="temas-grupo" data-grupo={g.id}>
              <legend>{g.rotulo}</legend>
              {g.tokens.map(([token, rotulo]) => (
                <CampoDeCor
                  key={token}
                  token={token}
                  rotulo={rotulo}
                  valor={rascunho.cores[token] ?? base[token] ?? '#000000'}
                  trocado={!!rascunho.cores[token]}
                  aoMudar={(hex) => trocarCor(token, hex)}
                  aoVoltar={() => trocarCor(token, null)}
                />
              ))}
            </fieldset>
          ))}
        </div>
      ) : (
        <p className="suave temas-texto">
          Este tema parte do {NOME_DE_FABRICA[rascunho.base] ?? rascunho.base}, e a janela está no {NOME_DE_FABRICA[temaEmTela] ?? temaEmTela}. Volte ao{' '}
          {NOME_DE_FABRICA[rascunho.base] ?? rascunho.base} para ver e mudar as cores.{' '}
          <button type="button" onClick={() => definirTema(rascunho.base)}>
            Voltar ao {NOME_DE_FABRICA[rascunho.base] ?? rascunho.base}
          </button>
        </p>
      )}
      {erro && (
        <p className="temas-erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- plugins

function Plugins() {
  const plugins = usarTemas((e) => e.arquivo.plugins)
  const [nome, definirNome] = useState('')
  const [texto, definirTexto] = useState('')
  const [recusa, definirRecusa] = useState('')
  const [aviso, definirAviso] = useState('')

  async function adicionar(): Promise<void> {
    definirRecusa('')
    definirAviso('')
    const r = await pedir({ tipo: 'adicionarPlugin', nome: nome.trim() || 'Plugin', texto })
    if (!r.ok) return definirRecusa(r.erro)
    const p = r.arquivo.plugins.find((x) => x.id === r.id)
    definirAviso(`Plugin "${p?.nome ?? nome}" adicionado e ligado (${p?.blocos.reduce((n, b) => n + b.declaracoes.length, 0) ?? 0} token(s)).`)
    definirNome('')
    definirTexto('')
  }

  async function importar(): Promise<void> {
    definirRecusa('')
    definirAviso('')
    try {
      const r = await window.ork.temas.escolherCss()
      if (!r) return
      if ('erro' in r) return definirRecusa(r.erro)
      definirTexto(r.texto)
      if (!nome.trim()) definirNome(r.nome)
    } catch (e) {
      definirRecusa(`não consegui abrir o arquivo: ${mensagemDe(e)}`)
    }
  }

  async function agir(op: Parameters<typeof pedir>[0]): Promise<void> {
    const r = await pedir(op)
    definirRecusa(r.ok ? '' : r.erro)
  }

  async function apagar(id: string, nomeDoPlugin: string): Promise<void> {
    const r = await confirmar({
      titulo: `Apagar o plugin "${nomeDoPlugin}"?`,
      mensagem: 'As cores voltam ao que eram sem ele.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Apagar', valor: 'apagar', perigo: true }
      ]
    })
    if (r.botao === 'apagar') await agir({ tipo: 'apagarPlugin', id })
  }

  return (
    <section className="temas-secao" data-temas-secao="plugins">
      <h3 className="temas-secao-titulo">
        <Puzzle size={15} /> Plugins de CSS
      </h3>
      <p className="suave temas-texto">
        Um plugin só troca tokens (as variáveis de cor e medida do app), dentro de <code>:root</code>, <code>.tema-escuro</code> ou <code>.tema-claro</code>. Nada de
        regra de estilo, <code>url(</code>, <code>@import</code> ou fonte de fora: o Orkester confere e recusa com o motivo. O que é aplicado é refeito a partir dos
        tokens aceitos, não o texto colado. Na lista, o de baixo vence.
      </p>
      <form
        className="temas-plugin-novo"
        onSubmit={(e) => {
          e.preventDefault()
          void adicionar()
        }}
      >
        <input value={nome} maxLength={60} placeholder="Nome do plugin" aria-label="Nome do plugin" onChange={(e) => definirNome(e.target.value)} />
        <textarea
          value={texto}
          spellCheck={false}
          rows={5}
          placeholder={'.tema-escuro {\n  --destaque: #e05a00;\n}'}
          aria-label="CSS do plugin"
          onChange={(e) => definirTexto(e.target.value)}
        />
        <div className="temas-acoes">
          <button type="button" data-acao="importar" onClick={() => void importar()}>
            <FileUp size={13} /> Escolher arquivo .css…
          </button>
          <button type="submit" className="primario" data-acao="adicionar" disabled={!texto.trim()}>
            <Plus size={13} /> Adicionar
          </button>
        </div>
      </form>
      {recusa && (
        <p className="temas-erro" role="alert" data-plugin-recusa>
          Recusado: {recusa}
        </p>
      )}
      {aviso && <p className="suave temas-texto" role="status">{aviso}</p>}
      <div className="temas-lista">
        {plugins.map((p, i) => (
          <div key={p.id} className={`temas-linha ${p.ligado ? '' : 'desligado'}`} data-plugin={p.id}>
            <label className="temas-ligado" title={p.ligado ? 'Desligar' : 'Ligar'}>
              <input type="checkbox" checked={p.ligado} aria-label={`Plugin ${p.nome} ligado`} onChange={(e) => void agir({ tipo: 'ligarPlugin', id: p.id, ligado: e.target.checked })} />
            </label>
            <div className="temas-linha-dados">
              <span className="temas-linha-nome">{p.nome}</span>
              <span className="suave temas-linha-detalhe">
                {p.blocos.reduce((n, b) => n + b.declaracoes.length, 0)} token(s) em {[...new Set(p.blocos.map((b) => b.seletor))].join(', ')}
              </span>
            </div>
            <button type="button" className="temas-icone" title="Subir (aplica antes)" aria-label={`Subir o plugin ${p.nome}`} disabled={i === 0} onClick={() => void agir({ tipo: 'moverPlugin', id: p.id, passo: -1 })}>
              <ArrowUp size={13} />
            </button>
            <button type="button" className="temas-icone" title="Descer (aplica depois, vence)" aria-label={`Descer o plugin ${p.nome}`} disabled={i === plugins.length - 1} onClick={() => void agir({ tipo: 'moverPlugin', id: p.id, passo: 1 })}>
              <ArrowDown size={13} />
            </button>
            <button type="button" className="temas-icone perigo" title={`Apagar o plugin "${p.nome}"`} aria-label={`Apagar o plugin ${p.nome}`} onClick={() => void apagar(p.id, p.nome)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {!plugins.length && <p className="suave temas-vazio">Nenhum plugin ainda.</p>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- página

export function Temas() {
  const temaEmTela = usarLoja((e) => e.preferencias.tema)
  const arquivo = usarTemas((e) => e.arquivo)
  const rascunho = usarTemas((e) => e.rascunho)
  const [erro, definirErro] = useState('')

  const ativo = arquivo.temas.find((t) => t.id === arquivo.ativo)
  // em uso: o tema do usuário ativo, se a base dele é o tema em tela; senão o de fábrica das preferências
  const emUso = rascunho && rascunho.base === temaEmTela ? rascunho.id : ativo && ativo.base === temaEmTela ? ativo.id : temaEmTela

  const cartoes: Cartao[] = [
    ...TEMAS.map((t) => ({ id: t.id, nome: NOME_DE_FABRICA[t.id] ?? t.rotulo, base: t.id, cores: {}, doUsuario: false })),
    ...arquivo.temas.map((t) => ({ ...(rascunho?.id === t.id ? rascunho : t), doUsuario: true }))
  ]

  /** Antes de trocar de tema, o rascunho com mudança não salva pede confirmação. */
  async function largarRascunho(): Promise<boolean> {
    const r = lerEstadoDosTemas().rascunho
    if (!r) return true
    const salvo = lerEstadoDosTemas().arquivo.temas.find((t) => t.id === r.id)
    const pendente = !salvo || salvo.nome !== r.nome.trim() || JSON.stringify(salvo.cores) !== JSON.stringify(r.cores)
    if (pendente) {
      const resposta = await confirmar({
        titulo: `Descartar as mudanças de "${r.nome}"?`,
        mensagem: 'O tema em edição tem mudanças não salvas.',
        botoes: [
          { rotulo: 'Continuar editando', valor: 'cancelar', primario: true },
          { rotulo: 'Descartar', valor: 'descartar', perigo: true }
        ]
      })
      if (resposta.botao !== 'descartar') return false
    }
    definirRascunho(null)
    return true
  }

  async function usar(c: Cartao): Promise<void> {
    if (!(await largarRascunho())) return
    definirErro('')
    definirTema(c.base)
    const r = await pedir({ tipo: 'usar', id: c.doUsuario ? c.id : null })
    if (!r.ok) definirErro(r.erro)
  }

  async function editar(c: Cartao): Promise<void> {
    if (rascunho?.id === c.id) return
    if (!(await largarRascunho())) return
    await usar(c)
    const t = lerEstadoDosTemas().arquivo.temas.find((x) => x.id === c.id)
    if (t) definirRascunho({ ...t, cores: { ...t.cores } })
  }

  async function duplicar(c: Cartao): Promise<void> {
    if (!(await largarRascunho())) return
    definirErro('')
    const r = await pedir({ tipo: 'salvarTema', tema: { nome: `${c.nome} (cópia)`.slice(0, 60), base: c.base, cores: { ...c.cores } } })
    if (!r.ok || !r.id) return definirErro(r.ok ? 'não consegui criar a cópia' : r.erro)
    const novo = r.arquivo.temas.find((t) => t.id === r.id)
    definirTema(c.base)
    const u = await pedir({ tipo: 'usar', id: r.id! })
    if (!u.ok) return definirErro(u.erro)
    if (novo) definirRascunho({ ...novo, cores: { ...novo.cores } })
  }

  return (
    <div className="temas" data-pagina-geral="temas">
      <header className="temas-cabecalho">
        <h2>Temas</h2>
        <p className="suave">As cores do app. Duplique um tema para mudar as cores: a mudança aparece na hora, e o terminal acompanha.</p>
      </header>
      <div className="temas-corpo">
        <section className="temas-secao" data-temas-secao="temas">
          <h3 className="temas-secao-titulo">
            <Palette size={15} /> Temas
          </h3>
          <div className="temas-grade">
            {cartoes.map((c) => (
              <CartaoDeTema
                key={c.id}
                c={c}
                emUso={emUso === c.id}
                aoUsar={() => void usar(c)}
                aoDuplicar={() => void duplicar(c)}
                aoEditar={c.doUsuario ? () => void editar(c) : undefined}
              />
            ))}
          </div>
          {erro && (
            <p className="temas-erro" role="alert">
              {erro}
            </p>
          )}
          {rascunho && <Editor rascunho={rascunho} salvo={arquivo.temas.find((t) => t.id === rascunho.id)} temaEmTela={temaEmTela} />}
        </section>
        <Plugins />
      </div>
    </div>
  )
}
