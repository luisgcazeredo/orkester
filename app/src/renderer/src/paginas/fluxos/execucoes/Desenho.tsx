import { X } from 'lucide-react'
import type { Execucao, Ligacao, NoDoFluxo } from '../../../../../shared/fluxos/tipos'
import { portaDeEntrada, portaDeSaida } from '../editor/geometria'
import { duracaoEmTexto, marcasDosNos, motivoDaExecucao, quandoFoi, resumoDosNos, rotuloDaLigacao, textoDoResultado } from './textos'
import '../../../estilos/fluxos-execucoes.css'

// O que o editor precisa para mostrar uma execução aberta (F3), em duas peças:
//  - `<ItensNasLigacoes>`: dentro do `<svg className="ed-ligacoes">`, escreve no meio de cada ligação quantos itens
//    passaram por ela ("3 itens", "0 itens");
//  - `<FaixaDaExecucao>`: a faixa do alto, com o resumo da execução e o botão de fechá-la (voltar a editar).
// Os nós pintados (verde, vermelho, cinza), o "cortado" e o `log` do Código o editor já mostra pelo `estado` e pelo painel.

/** O ponto no meio da curva de uma ligação: a curva é simétrica, então é a média das duas portas. */
function meioDaLigacao(de: NoDoFluxo | undefined, saida: number, para: NoDoFluxo | undefined): { x: number; y: number } | null {
  const a = de ? portaDeSaida(de, saida) : null
  const b = para ? portaDeEntrada(para) : null
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
}

const LARGURA_POR_LETRA = 6.2

export function ItensNasLigacoes({ nos, ligacoes, execucao }: { nos: readonly NoDoFluxo[]; ligacoes: readonly Ligacao[]; execucao: Pick<Execucao, 'nos'> | null | undefined }) {
  if (!execucao) return null
  const porId = new Map(nos.map((n) => [n.id, n]))
  return (
    <g className="exec-itens" aria-hidden>
      {ligacoes.map((l) => {
        const texto = rotuloDaLigacao(l, execucao)
        const meio = texto === null ? null : meioDaLigacao(porId.get(l.de), l.saida, porId.get(l.para))
        if (texto === null || !meio) return null
        const largura = texto.length * LARGURA_POR_LETRA + 12
        return (
          <g key={`${l.de}:${l.saida}:${l.para}`} className="exec-item" transform={`translate(${meio.x} ${meio.y})`} data-itens-da-ligacao={`${l.de}:${l.saida}:${l.para}`}>
            <rect x={-largura / 2} y={-9} width={largura} height={18} rx={9} />
            <text textAnchor="middle" dominantBaseline="central">
              {texto}
            </text>
          </g>
        )
      })}
    </g>
  )
}

export function FaixaDaExecucao({ execucao, nomesDosNos, aoFechar }: { execucao: Execucao; nomesDosNos?: Readonly<Record<string, string>>; aoFechar: () => void }) {
  const res = textoDoResultado(execucao.resultado)
  const nos = resumoDosNos(execucao)
  const marcas = marcasDosNos(execucao)
  const noComErro = execucao.caminho.find((id) => execucao.nos[id]?.estado === 'erro')
  const motivo = motivoDaExecucao({ resultado: execucao.resultado, detalhe: execucao.detalhe, erro: noComErro ? execucao.nos[noComErro]?.erro : undefined, noComErro }, nomesDosNos)
  return (
    <div className="exec-faixa" role="status" data-faixa-da-execucao={execucao.id}>
      <span className={`exec-resultado ${res.tom}`}>{res.texto}</span>
      <span>
        Execução de {quandoFoi(execucao.inicio)} · {duracaoEmTexto(execucao.ms)}
      </span>
      <span className="suave">
        {nos.ok} ok{nos.erro ? ` · ${nos.erro} com erro` : ''}
        {nos.naoRodou ? ` · ${nos.naoRodou} sem rodar` : ''}
        {marcas.cortados ? ` · ${marcas.cortados} cortado${marcas.cortados > 1 ? 's' : ''}` : ''}
        {marcas.comLog ? ` · ${marcas.comLog} com log` : ''}
      </span>
      {motivo && <span className={`exec-motivo ${res.tom}`}>{motivo}</span>}
      <span className="exec-flex" />
      <button type="button" className="exec-fechar" onClick={aoFechar} data-fechar-execucao>
        <X size={14} /> Voltar a editar
      </button>
    </div>
  )
}
