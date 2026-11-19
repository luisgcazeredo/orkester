import { memo, useEffect, useRef, useState } from 'react'
import { FileCode, Folder, Mail, PanelBottom, Paperclip, TriangleAlert } from 'lucide-react'
import { chaveDoAviso, dispensarAvisoDoPrimeiroPedido, usarLoja } from '../estado/loja'
import { carregarCaixas, MOTIVO_CURTO, usarCaixa } from '../estado/caixas'
import type { NoTerminal } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { CorpoXterm } from '../terminal/CorpoXterm'
import { abrirMenu } from '../ui/MenuContexto'
import { anexarArquivosAoPrompt, anexarPastaAoPrompt } from '../ui/anexar'
import { itensDoCodigoDoTerminal } from '../ui/menus'
import { rotuloModelo } from '../../../shared/modelos'
import { COR_AGENTE, ICONE_AGENTE } from './icones'
import { abrirKanban } from '../paginas/abrir'
import { ligarTarefasNoQuadro, usarTarefasDoCartao } from '../paginas/kanban/tarefasNoQuadro'

const TEXTO_DO_AVISO = {
  ficou: 'O primeiro pedido foi escrito no campo do agente e NÃO foi enviado.',
  incerto: 'Não deu para confirmar o primeiro pedido: pode ter saído. Veja a tela antes de repetir.',
  'nao-pronto': 'O agente não ficou pronto (talvez esteja perguntando algo): o primeiro pedido NÃO foi digitado.',
  'sem-sessao': 'O primeiro pedido NÃO foi digitado: não há processo para este cartão.',
  erro: 'Falha na comunicação ao enviar o primeiro pedido: não dá para saber se saiu. Veja a tela antes de repetir.'
} as const

/** Fora da tela por este tempo, o cartão para de desenhar (o processo segue rodando). */
const DESCARREGAR_DEPOIS = window.ork.autoteste ? 1500 : 20_000

function pastaCurta(pasta: string): string {
  const partes = pasta.split(/[\\/]/).filter(Boolean)
  return partes.length > 2 ? `…\\${partes.slice(-2).join('\\')}` : pasta
}

/** Visível no quadro (com uma margem); ficou fora por um tempo, deixa de estar "montado". */
function usarMontado(alvo: React.RefObject<HTMLDivElement | null>): boolean {
  const [montado, setMontado] = useState(true)
  useEffect(() => {
    const el = alvo.current
    const quadro = el?.closest('.quadro')
    if (!el || !quadro) return
    let tempo: ReturnType<typeof setTimeout> | null = null
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (tempo) clearTimeout(tempo)
        tempo = null
        if (entrada.isIntersecting) setMontado(true)
        else tempo = setTimeout(() => setMontado(false), DESCARREGAR_DEPOIS)
      },
      { root: quadro, rootMargin: '300px' }
    )
    observador.observe(el)
    return () => {
      observador.disconnect()
      if (tempo) clearTimeout(tempo)
    }
  }, [alvo])
  return montado
}

interface Props {
  no: NoTerminal
  selecionado: Marca
  pastaDoEspaco: string
  indice: number
}

/** O cartão do terminal no quadro: cabeçalho, o terminal de verdade e o rodapé com a pasta. */
export const PecaTerminal = memo(function PecaTerminal({ no, selecionado, pastaDoEspaco, indice }: Props) {
  const Icone = ICONE_AGENTE[no.agente]
  const pasta = no.pasta || pastaDoEspaco
  const corpo = useRef<HTMLDivElement>(null)
  const montado = usarMontado(corpo)
  const ativo = selecionado === 'sozinho'
  const espacoId = usarLoja((e) => e.espaco?.id)
  const aviso = usarLoja((e) => e.avisosDoPrimeiroPedido[chaveDoAviso(e.espaco?.id, no.id)])
  const caixa = usarCaixa(no.id)
  useEffect(() => carregarCaixas(espacoId), [espacoId])
  const tarefas = usarTarefasDoCartao(no.id)
  useEffect(() => ligarTarefasNoQuadro(espacoId), [espacoId])
  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <header className="terminal-cabecalho" data-arrasta>
        <Icone size={13} style={{ color: COR_AGENTE[no.agente] }} strokeWidth={2.2} />
        <span className="terminal-nome">{no.nome}</span>
        <span className="terminal-indice">{indice}</span>
        {rotuloModelo(no) && (
          <span className="terminal-selo" data-teste="rotulo-modelo" title="Modelo e esforço deste agente">
            {rotuloModelo(no)}
          </span>
        )}
        {no.criadoPor && <span className="terminal-selo" title="Aberto por um agente pelo ork">agente</span>}
        {tarefas && tarefas.length > 0 && (
          <button
            className="terminal-selo terminal-selo-tarefa"
            data-teste="tarefa-do-cartao"
            title={`Trabalhando em ${tarefas.map((t) => `#${t.numero} ${t.titulo}`).join(' · ')}. Clique para abrir no Kanban.`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => abrirKanban({ numero: tarefas[0].numero })}
          >
            #{tarefas[0].numero}
            {tarefas.length > 1 ? ` +${tarefas.length - 1}` : ''}
          </button>
        )}
        {aviso && (
          <button
            className="terminal-selo terminal-selo-aviso"
            data-teste="aviso-primeiro-pedido"
            title={`${TEXTO_DO_AVISO[aviso]} Clique para dispensar.`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => espacoId && dispensarAvisoDoPrimeiroPedido(espacoId, no.id)}
          >
            <TriangleAlert size={10} /> pedido?
          </button>
        )}
        {caixa && caixa.fila > 0 && (
          <button
            className={`terminal-selo terminal-selo-caixa ${caixa.motivo === 'rascunho' ? 'terminal-selo-aviso' : ''}`}
            data-teste="caixa-do-cartao"
            title={
              `${caixa.fila === 1 ? '1 recado esperando' : `${caixa.fila} recados esperando`} para entrar neste terminal ` +
              `(de ${[...new Set(caixa.de)].join(', ')}).` +
              (caixa.motivo ? ` Agora: ${MOTIVO_CURTO[caixa.motivo]}.` : '') +
              ' O Orkester digita um de cada vez, quando o agente está livre e você não está escrevendo aqui.' +
              (caixa.motivo === 'rascunho' ? ' Se você já limpou o campo, clique para liberar.' : '')
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => window.ork.terminal.liberarCaixa(no.id)}
          >
            <Mail size={10} /> {caixa.fila}
          </button>
        )}
      </header>
      <div className={`terminal-corpo ${ativo ? 'rolavel' : ''}`} ref={corpo} data-sem-arrasto={ativo ? '' : undefined}>
        {montado ? <CorpoXterm id={no.id} ativo={ativo} /> : <div className="terminal-descarregado">fora da tela · o processo continua</div>}
        {/* sem estar selecionado, o terminal não pega o mouse: arrasta o cartão de qualquer ponto e a roda move o quadro */}
        {!ativo && <div className="terminal-escudo" data-escudo />}
      </div>
      <footer className="terminal-rodape" data-arrasta>
        <Folder size={11} />
        <span title={pasta}>{pastaCurta(pasta)}</span>
        <button
          className="botao-mini"
          title="Anexar arquivo ou pasta ao prompt (escreve o caminho na linha do agente)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            abrirMenu(caixa.left, caixa.top, [
              { rotulo: 'Arquivo…', acao: () => void anexarArquivosAoPrompt(no.id) },
              { rotulo: 'Pasta…', acao: () => void anexarPastaAoPrompt(no.id) }
            ])
          }}
        >
          <Paperclip size={12} />
        </button>
        <button
          className="botao-mini"
          title="Os cartões de código deste agente: abrir, recolher todos, fechar todos"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            abrirMenu(caixa.left, caixa.top, itensDoCodigoDoTerminal(no))
          }}
        >
          <FileCode size={12} />
        </button>
        <PanelBottom size={12} className="terminal-alternar" />
      </footer>
      <span className="porta porta-esquerda" data-porta={no.id} title="Arraste até outro terminal para ligar" />
      <span className="porta porta-direita" data-porta={no.id} title="Arraste até outro terminal para ligar" />
    </MolduraNo>
  )
})
