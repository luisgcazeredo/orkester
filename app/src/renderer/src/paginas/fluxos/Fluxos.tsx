import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, FolderOpen, Plus, Search } from 'lucide-react'
import { abrirEspaco, usarLoja } from '../../estado/loja'
import { podeSairAgora } from '../../casca/paginas'
import { avisar, confirmar, perguntarTexto } from '../../ui/Perguntas'
import type { PastaDeFluxos, Resultado, ResumoDeFluxo } from './contrato'
import { apiDeFluxos } from './fluxosApi'
import { Editor } from './Editor'
import { usarExecucaoAberta } from './execucoes/usarExecucoes'
import { Lista } from './Lista'
import { Pastas } from './Pastas'
import { confirmarLigar } from './ConfirmarLigar'
import { abrirGuiaDosFluxos } from './DocDoNo'
import { aoChegarPedidoDeFluxos, pegarPedidoDeFluxos } from './pedido'
import { fluxosDaVista, MAX_NOME_DA_PASTA, motivoSemCriarPasta, nomeDePastaInvalido, subpastasDe, type Vista } from './textos'
import { usarFluxos } from './usarFluxos'
import '../../estilos/fluxos.css'

// Fluxos (1.9.6): a lista, por espaço, com pastas de até 3 níveis. Cada fluxo liga gatilhos a ações. Clicar no nome (ou
// "Novo fluxo") troca a lista pelo editor (Editor.tsx), que volta para cá pelo `aoSair`.
// Criar, mover, ligar e apagar só no espaço aberto nesta janela (o main recusa gravação de janela que não é dona); os
// outros espaços aparecem só para leitura. As travas (cadeia, teto por hora, regra de sensível) são do processo
// principal e valem também para fluxo criado por agente.

const erroDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** O botão que abre o guia dos fluxos em "Primeiros passos" (no topo da página e no vazio). */
const BotaoGuia = () => (
  <button type="button" className="fluxo-botao" title="Como montar, testar e ligar um fluxo, passo a passo" onClick={() => abrirGuiaDosFluxos()} data-fluxos-guia>
    <BookOpen size={14} /> Guia dos fluxos
  </button>
)

/** O vazio do espaço sem nenhum fluxo (em qualquer vista): como começar, em três linhas, e o guia. */
const ComoComecar = () => (
  <>
    <p>Nenhum fluxo neste espaço ainda. Para começar:</p>
    <ol className="fluxo-comecar">
      <li>
        <b>Novo fluxo</b> abre o editor. O <b>+</b> do meio põe o primeiro nó: o gatilho, o que faz o fluxo disparar.
      </li>
      <li>Arraste da bolinha de saída de um nó para pôr o próximo, já ligado. Clique duplo num nó abre os ajustes dele.</li>
      <li>
        <b>Salvar</b>, <b>Rodar fluxo</b> para testar e o interruptor para ligar.
      </li>
    </ol>
    <BotaoGuia />
  </>
)

export function Fluxos() {
  const espacos = usarLoja((e) => e.espacos)
  const atualId = usarLoja((e) => e.espaco?.id)
  const [escolhido, setEscolhido] = useState<string | undefined>(atualId)
  // a página abre (e volta) no espaço desta janela: trocou o espaço aberto aqui, ela acompanha
  useEffect(() => {
    if (atualId) setEscolhido(atualId)
  }, [atualId])
  useEffect(() => {
    if (!escolhido || !espacos.some((e) => e.id === escolhido)) setEscolhido(atualId ?? espacos[0]?.id)
  }, [atualId, escolhido, espacos])
  const espacoId = escolhido
  const { lista, erro, recarregar } = usarFluxos(espacoId)
  const editavel = !!espacoId && espacoId === atualId
  const outroEspaco = !!espacoId && espacoId !== atualId

  const [vista, setVista] = useState<Vista>({ tipo: 'todos' })
  const [busca, setBusca] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  // o fluxo aberto no editor (id null = novo); vale só para o espaço em que foi aberto. `vez` remonta o editor a cada abertura.
  const [aberto, setAberto] = useState<{ espacoId: string; id: string | null; vez: number } | null>(null)
  const editorAberto = aberto && aberto.espacoId === espacoId ? aberto : null
  // a execução aberta no editor (F3): vale para o fluxo aberto; abrir outro fluxo, ou sair, a fecha
  const [execAberta, setExecAberta] = useState<string | null>(null)
  const abrirNoEditor = (id: string | null): void => {
    setExecAberta(null)
    if (espacoId) setAberto((a) => ({ espacoId, id, vez: (a?.vez ?? 0) + 1 }))
  }
  // Pedidos de fora (D11): a Paleta abre um fluxo pelo nome; o clique no ícone "Fluxos" da barra volta do editor à lista. Os dois passam
  // pela guarda de rascunho do editor (`podeSairAgora`): com mudanças não salvas ela pergunta e, se a pessoa deixar, refaz o pedido.
  const lerPedido = useRef<() => void>(() => undefined)
  lerPedido.current = () => {
    const p = pegarPedidoDeFluxos()
    if (!p) return
    const fazer = (): void => {
      setExecAberta(null)
      if (p.tipo === 'lista') {
        setAberto(null)
        recarregar()
        return
      }
      setEscolhido(p.espacoId)
      setAberto((a) => ({ espacoId: p.espacoId, id: p.fluxoId, vez: (a?.vez ?? 0) + 1 }))
    }
    if (p.tipo === 'lista' && !editorAberto) return
    if (podeSairAgora(fazer)) fazer()
  }
  useEffect(() => {
    lerPedido.current()
    return aoChegarPedidoDeFluxos(() => lerPedido.current())
  }, [])
  const { execucao, erro: erroDaExecucao } = usarExecucaoAberta(espacoId, editorAberto?.id ?? null, editorAberto ? execAberta : null)
  useEffect(() => {
    setVista({ tipo: 'todos' })
    setBusca('')
  }, [espacoId])
  // a pasta aberta foi apagada (aqui, por agente ou em outra janela): volta para "Todos"
  useEffect(() => {
    if (lista && vista.tipo === 'pasta' && !lista.pastas.some((p) => p.id === vista.id)) setVista({ tipo: 'todos' })
  }, [lista, vista])

  const pastas = lista?.pastas ?? []
  const fluxos = lista?.fluxos ?? []
  const visiveis = useMemo(() => fluxosDaVista(fluxos, vista, busca, pastas), [fluxos, vista, busca, pastas])
  const buscando = busca.trim().length > 0

  /** Pede a mudança ao main; recusa (resposta ou exceção) vira aviso, e a lista é relida de qualquer jeito. */
  async function pedir(rotulo: string, fazer: (api: ReturnType<typeof apiDeFluxos>, espaco: string) => Promise<Resultado>): Promise<void> {
    if (!espacoId) return
    try {
      const r = await fazer(apiDeFluxos(), espacoId)
      if (!r.ok) await avisar('Fluxos', `${rotulo}: ${r.erro}`)
    } catch (e) {
      await avisar('Fluxos', `${rotulo}: ${erroDe(e)}`)
    }
    recarregar()
  }

  const acoesDaLista = {
    abrir: (f: ResumoDeFluxo): void => abrirNoEditor(f.id),
    ligar: async (f: ResumoDeFluxo): Promise<void> => {
      // fluxo sensível só liga com a confirmação nó por nó (F4), sobre o que está no disco; cancelar não liga
      if (!f.ligado && f.sensivel) {
        if (!espacoId) return
        const lido = await apiDeFluxos()
          .ler(espacoId, f.id)
          .catch(() => null)
        if (!lido) {
          await avisar('Fluxos', 'Não liguei: não consegui ler esse fluxo do disco.')
          return recarregar()
        }
        const mostrado = await confirmarLigar(lido)
        if (mostrado === null) return
        return pedir('Não liguei', (api, esp) => api.ligar(esp, f.id, true, mostrado))
      }
      await pedir('Não consegui mudar esse fluxo', (api, esp) => api.ligar(esp, f.id, !f.ligado))
    },
    apagar: async (f: ResumoDeFluxo): Promise<void> => {
      const r = await confirmar({
        titulo: 'Apagar fluxo',
        mensagem: `Apagar "${f.nome}"? As execuções dele vão junto.`,
        botoes: [
          { rotulo: 'Cancelar', valor: 'nao' },
          { rotulo: 'Apagar', valor: 'sim', perigo: true }
        ]
      })
      if (r.botao === 'sim') await pedir('Não apaguei', (api, esp) => api.apagar(esp, f.id))
    },
    mover: (f: ResumoDeFluxo, pasta: string | null): void => void pedir('Não movi', (api, esp) => api.mover(esp, f.id, pasta)),
    arrastar: setArrastando
  }

  async function novaPasta(pai: string | null): Promise<void> {
    const semCriar = motivoSemCriarPasta(pastas, pai)
    if (semCriar) return void (await avisar('Fluxos', `Não dá para criar a pasta: ${semCriar}.`))
    const nome = await perguntarTexto('Nova pasta', 'Nome da pasta', '', 'Criar', MAX_NOME_DA_PASTA)
    if (nome === null) return
    const falta = nomeDePastaInvalido(nome, pastas, pai)
    if (falta) return void (await avisar('Fluxos', `Não criei a pasta: ${falta}.`))
    await pedir('Não criei a pasta', (api, esp) => api.criarPasta(esp, nome.trim(), pai))
  }

  async function renomearPasta(p: PastaDeFluxos): Promise<void> {
    const nome = await perguntarTexto('Renomear pasta', 'Novo nome', p.nome, 'Renomear', MAX_NOME_DA_PASTA)
    if (nome === null || nome.trim() === p.nome) return
    const falta = nomeDePastaInvalido(nome, pastas, p.pai ?? null, p.id)
    if (falta) return void (await avisar('Fluxos', `Não renomeei a pasta: ${falta}.`))
    await pedir('Não renomeei a pasta', (api, esp) => api.renomearPasta(esp, p.id, nome.trim()))
  }

  async function apagarPasta(p: PastaDeFluxos): Promise<void> {
    // o main apaga a pasta e as de dentro; os fluxos de todas elas sobem para "Sem pasta"
    const ids = new Set([p.id])
    for (const id of ids) for (const s of subpastasDe(pastas, id)) ids.add(s.id)
    const subpastas = ids.size - 1
    const dentro = fluxos.filter((f) => f.pasta && ids.has(f.pasta)).length
    const junto = subpastas ? ` e ${subpastas === 1 ? 'a subpasta dela' : `as ${subpastas} subpastas dela`}` : ''
    const r = await confirmar({
      titulo: 'Apagar pasta',
      mensagem: `Apagar a pasta "${p.nome}"${junto}?${dentro ? ` ${dentro === 1 ? 'O fluxo de dentro fica' : `Os ${dentro} fluxos de dentro ficam`} em "Sem pasta".` : ''}`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'nao' },
        { rotulo: 'Apagar', valor: 'sim', perigo: true }
      ]
    })
    if (r.botao === 'sim') await pedir('Não apaguei a pasta', (api, esp) => api.apagarPasta(esp, p.id))
  }

  function soltarEm(pasta: string | null): void {
    const f = fluxos.find((x) => x.id === arrastando)
    setArrastando(null)
    if (f && (f.pasta ?? null) !== pasta) acoesDaLista.mover(f, pasta)
  }

  const vazio = buscando
    ? 'Nenhum fluxo com esse nome.'
    : !lista
      ? 'Lendo…'
      : !fluxos.length
        ? <ComoComecar />
        : vista.tipo === 'raiz'
          ? 'Nenhum fluxo fora de pasta.'
          : 'Nenhum fluxo nesta pasta. Arraste um até ela, ou use o seletor de pasta na linha do fluxo.'

  if (editorAberto && espacoId)
    return (
      <Editor
        key={`${espacoId}:${editorAberto.vez}`}
        espacoId={espacoId}
        fluxoId={editorAberto.id}
        editavel={editavel}
        aoSair={() => {
          setAberto(null)
          setExecAberta(null)
          recarregar()
        }}
        execucao={execucao}
        execucaoAberta={execAberta}
        erroDaExecucao={erroDaExecucao}
        aoAbrirExecucao={setExecAberta}
        aoRodar={(id) => setExecAberta(id)}
        aoGravar={(id) => {
          setAberto((a) => (a ? { ...a, id } : a))
          recarregar()
        }}
      />
    )

  return (
    <div className="pagina-geral" data-pagina-geral="fluxos">
      <header className="pagina-cabecalho">
        <h2>Fluxos</h2>
        <p className="suave">
          Um fluxo liga um <b>gatilho</b> (uma tarefa que muda de coluna, uma entrega, um agente que parou, a hora ou o botão Rodar fluxo) a uma sequência de
          ações: um recado, uma tarefa nova, um aviso, um Código, um pedido HTTP, uma ferramenta MCP ou um comando no shell. Código, HTTP, MCP e comando só ligam depois da sua
          confirmação. Cada espaço tem os seus fluxos, e cada um tem teto por hora e nunca dispara de novo numa cadeia que ele mesmo começou.
        </p>
        <div className="fluxo-barra" data-fluxos-barra>
          <span className="suave">Espaço:</span>
          <select aria-label="Espaço" value={espacoId ?? ''} onChange={(e) => setEscolhido(e.target.value)}>
            {espacos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {e.id === atualId ? ' (aberto aqui)' : ''}
              </option>
            ))}
          </select>
          <label className="fluxo-busca">
            <Search size={14} aria-hidden />
            <input type="search" aria-label="Buscar fluxo" placeholder="Buscar fluxo" value={busca} onChange={(e) => setBusca(e.target.value)} data-fluxos-busca />
          </label>
          <span className="fluxo-flex" />
          <BotaoGuia />
          <button className="fluxo-botao" disabled={!editavel} title={editavel ? 'Criar um fluxo no editor' : 'Só no espaço aberto nesta janela'} onClick={() => abrirNoEditor(null)} data-fluxos-novo>
            <Plus size={14} /> Novo fluxo
          </button>
          {outroEspaco && (
            <button className="fluxo-botao" onClick={() => void abrirEspaco(espacoId)} data-fluxos-abrir-aqui>
              <FolderOpen size={14} /> Abrir este espaço aqui
            </button>
          )}
        </div>
      </header>
      <div className="pagina-corpo">
        {outroEspaco && (
          <p className="fluxo-faixa" role="status" data-fluxos-so-leitura>
            Só leitura: este espaço não está aberto nesta janela, então aqui você só vê os fluxos dele.
          </p>
        )}
        {erro && (
          <p className="fluxo-faixa perigo" role="alert">
            Não consegui ler os fluxos: {erro}
          </p>
        )}
        {lista && lista.invalidos.length > 0 && (
          <div className="fluxo-faixa perigo" role="alert" data-fluxos-invalidos>
            {lista.invalidos.length === 1 ? 'Um arquivo de fluxo não passou na leitura' : `${lista.invalidos.length} arquivos de fluxo não passaram na leitura`}; eles não rodam e não são apagados sozinhos:
            <ul>
              {lista.invalidos.map((i) => (
                <li key={i.arquivo}>
                  <b>{i.nome || i.arquivo}</b>: {i.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!espacos.length && <p className="suave pagina-vazio">Nenhum espaço ainda.</p>}
        {espacoId && (
          <div className="fluxo-layout">
            <Pastas
              pastas={pastas}
              fluxos={fluxos}
              vista={vista}
              aoEscolher={(v) => {
                setBusca('')
                setVista(v)
              }}
              editavel={editavel}
              arrastando={arrastando !== null}
              aoSoltar={soltarEm}
              aoNova={(pai) => void novaPasta(pai)}
              aoRenomear={(p) => void renomearPasta(p)}
              aoApagar={(p) => void apagarPasta(p)}
            />
            <section className="fluxo-conteudo" data-fluxos-fluxos>
              <h3 className="pagina-grupo-titulo">
                {buscando ? 'Resultado da busca' : vista.tipo === 'todos' ? 'Todos os fluxos' : vista.tipo === 'raiz' ? 'Sem pasta' : (pastas.find((p) => p.id === vista.id)?.nome ?? 'Pasta')}
                <span className="suave pagina-grupo-nota">{visiveis.length === 1 ? '1 fluxo' : `${visiveis.length} fluxos`}</span>
              </h3>
              <Lista fluxos={visiveis} pastas={pastas} comPasta={buscando || vista.tipo === 'todos' || (vista.tipo === 'pasta' && subpastasDe(pastas, vista.id).length > 0)} editavel={editavel} vazio={vazio} acoes={acoesDaLista} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
