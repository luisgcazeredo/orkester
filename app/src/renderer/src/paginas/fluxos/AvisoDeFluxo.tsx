import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Workflow, X } from 'lucide-react'
import { irParaPagina } from '../../casca/paginas'
import { usarLoja } from '../../estado/loja'
import { duracaoDoAviso, ehAvisoDeErro, esquerdaDoAviso, MAXIMO_DE_AVISOS } from './avisos'
import { apiDeFluxos } from './fluxosApi'
import '../../estilos/avisoDeFluxo.css'

// Aviso no canto da janela quando um agente ou cliente MCP cria, edita, liga, desliga ou apaga um fluxo, quando o motor
// desliga um fluxo (excesso, cartão sumido) e quando um fluxo ligado termina em erro. A frase vem pronta do main
// (`aoMudar(espacoId, aviso, tipo)`). Só os do espaço desta janela. O aviso comum some sozinho em poucos segundos; o de
// `tipo: 'erro'` (falha de fluxo ou fluxo desligado pelo motor) fica até ser fechado: quem decide é o tipo que o main
// manda, nunca o texto (o nó Avisar do usuário pode dizer "falhou"). No máximo 3 à vista. Com o editor aberto a pilha sai do
// canto de baixo e vai para baixo da barra do editor (ver o CSS), depois da barra de páginas, para não cobrir Salvar, "Voltar a editar" nem os ícones das páginas.
// Montado sempre (fica fora do pacote preguiçoso da página).

interface Aviso {
  n: number
  texto: string
  erro: boolean
}

/** A largura da barra de páginas, medida na tela (ela não tem tamanho fixo no CSS). */
const larguraDaBarra = (): number => document.querySelector('.barra-paginas')?.getBoundingClientRect().width ?? 0

let contador = 0

export function AvisoDeFluxo() {
  const espacoId = usarLoja((e) => e.espaco?.id)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const pilha = useRef<HTMLDivElement>(null)
  // a pilha começa depois da barra de páginas (no editor ela fica à esquerda, onde a barra está)
  useLayoutEffect(() => {
    pilha.current?.style.setProperty('--aviso-esquerda', `${esquerdaDoAviso(larguraDaBarra())}px`)
  })

  useEffect(() => {
    setAvisos([])
    if (!espacoId) return
    const relogios = new Set<ReturnType<typeof setTimeout>>()
    const soltar = apiDeFluxos().aoMudar((id, aviso, tipo) => {
      if (id !== espacoId || !aviso) return
      const n = ++contador
      setAvisos((a) => [...a, { n, texto: aviso, erro: ehAvisoDeErro(tipo) }].slice(-MAXIMO_DE_AVISOS))
      const duracao = duracaoDoAviso(tipo)
      if (duracao === null) return
      const t = setTimeout(() => {
        relogios.delete(t)
        setAvisos((a) => a.filter((x) => x.n !== n))
      }, duracao)
      relogios.add(t)
    })
    return () => {
      soltar()
      relogios.forEach(clearTimeout)
    }
  }, [espacoId])

  if (!avisos.length) return null
  return (
    <div ref={pilha} className="aviso-fluxo-pilha" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.n} className={`aviso-fluxo ${a.erro ? 'erro' : ''}`} data-aviso-fluxo>
          <Workflow size={14} className="aviso-fluxo-icone" />
          <span className="aviso-fluxo-texto">{a.texto}</span>
          <button type="button" className="aviso-fluxo-botao" onClick={() => irParaPagina('fluxos')}>
            Ver
          </button>
          <button type="button" className="aviso-fluxo-fechar" aria-label="Fechar aviso" onClick={() => setAvisos((x) => x.filter((y) => y.n !== a.n))}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
