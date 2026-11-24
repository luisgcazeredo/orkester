// Formulários das ações Orkester (recado, tarefa, comando, avisar e consultar). Seletores tirados das Automações da 1.9.6.
import { MAX_AVISO, MAX_COMANDO, MAX_DESCRICAO, MAX_TEXTO, MAX_TITULO } from '../../../../../shared/automacoes'
import type { OperacaoDaConsulta, RecursoDaConsulta } from '../../../../../shared/fluxos/tipos'
import { MAX_LIMITE_DA_CONSULTA, OPERACOES_DA_CONSULTA } from '../../../../../shared/fluxos/nos'
import { Campo, NOTA_DE_EXPRESSAO, ref, SeletorDeCartao, SeletorDeColuna, sem, texto, type PropsDoFormulario } from './comum'
import { camposDoNo, limiteDoNo, limiteMaximo, notaDoNo, recursoEOperacao, RECURSOS, ROTULO_DO_RECURSO, rotuloDaOperacao, temLimite, trocarOperacao, trocarRecurso, type CampoDoFiltro } from './consulta'

const umaLinha = (t: string): string => t.replace(/[\r\n]+/g, ' ')

export function FormRecado({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  return (
    <>
      <Campo rotulo="Para" nota={ctx.shells.length > 0 ? 'Shells não recebem recado (o texto seria rodado como comando): para um shell, use o nó Comando no shell.' : undefined}>
        <SeletorDeCartao rotulo="Quem recebe" valor={ref(ajustes.para)} ctx={ctx} maestro somenteLer={somenteLer} mudar={(r) => mudar({ ...ajustes, para: r ?? { id: 'maestro', nome: 'Maestro' } })} />
      </Campo>
      <Campo rotulo="Texto" nota={NOTA_DE_EXPRESSAO}>
        <textarea
          aria-label="Texto do recado"
          rows={4}
          maxLength={MAX_TEXTO}
          placeholder="O recado, como o agente vai ler"
          value={texto(ajustes.texto)}
          disabled={somenteLer}
          onChange={(e) => mudar({ ...ajustes, texto: e.target.value })}
        />
      </Campo>
      <label className="ed-marcar">
        <input type="checkbox" checked={ajustes.juntarEvento === true} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, juntarEvento: e.target.checked })} />
        juntar um resumo do que disparou o fluxo
      </label>
      <Campo rotulo="A entrega dele volta para">
        <SeletorDeCartao
          rotulo="Entrega volta para"
          valor={ref(ajustes.entregaPara) ?? { id: 'maestro', nome: 'Maestro' }}
          ctx={ctx}
          maestro
          somenteLer={somenteLer}
          mudar={(r) => mudar(sem({ ...ajustes, entregaPara: r && r.id !== 'maestro' ? r : undefined }))}
        />
      </Campo>
    </>
  )
}

export function FormTarefa({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  return (
    <>
      <Campo rotulo="Título" nota={NOTA_DE_EXPRESSAO}>
        <input aria-label="Título da tarefa" maxLength={MAX_TITULO} placeholder="Título da tarefa" value={texto(ajustes.titulo)} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, titulo: umaLinha(e.target.value) })} />
      </Campo>
      <Campo rotulo="Descrição (opcional)">
        <textarea
          aria-label="Descrição da tarefa"
          rows={3}
          maxLength={MAX_DESCRICAO}
          value={texto(ajustes.descricao)}
          disabled={somenteLer}
          onChange={(e) => mudar(sem({ ...ajustes, descricao: e.target.value || undefined }))}
        />
      </Campo>
      <Campo rotulo="Coluna">
        <SeletorDeColuna rotulo="Coluna" valor={ref(ajustes.coluna)} ctx={ctx} qualquer="a de entrada (Demandas)" somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, coluna: r }))} />
      </Campo>
    </>
  )
}

export function FormComando({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  const terminal = ref(ajustes.terminal)
  return (
    <>
      <Campo rotulo="No shell">
        <SeletorDeCartao
          rotulo="Cartão shell"
          valor={terminal && (terminal.id || terminal.nome) ? terminal : undefined}
          ctx={ctx}
          shells="so"
          somenteLer={somenteLer}
          mudar={(r) => mudar({ ...ajustes, terminal: r ?? { id: '', nome: '' } })}
        />
      </Campo>
      {!ctx.shells.length && <p className="suave ed-nota">Nenhum cartão shell neste espaço.</p>}
      <Campo rotulo="Comando" nota="Texto fixo de uma linha: nada do item entra no comando ({{ }} não vale aqui).">
        <input
          className="ed-mono"
          aria-label="Comando"
          maxLength={MAX_COMANDO}
          placeholder="O comando"
          value={texto(ajustes.comando)}
          disabled={somenteLer}
          onChange={(e) => mudar({ ...ajustes, comando: umaLinha(e.target.value) })}
        />
      </Campo>
      <p className="ed-aviso-sensivel" role="note">
        Comando é sensível: o fluxo só liga com a sua confirmação, vendo o comando inteiro. Shell ocupado na hora = perde a vez.
      </p>
    </>
  )
}

export function FormAvisar({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  return (
    <Campo rotulo="Aviso" nota={<>Aparece no canto da janela do espaço; sem janela, numa notificação do Windows. {NOTA_DE_EXPRESSAO}</>}>
      <input aria-label="Texto do aviso" maxLength={MAX_AVISO} placeholder="O aviso, uma linha" value={texto(ajustes.texto)} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, texto: umaLinha(e.target.value) })} />
    </Campo>
  )
}

// ---------------------------------------------------------------- Consultar o Orkester (T4)

const aoPassoDe = (valor: string): string | undefined => (valor.trim() ? valor : undefined)

/** O que cada filtro é: texto (com `{{ }}` onde vale), coluna, cartão, lista de opções ou caixa. Tudo sai de `consulta.ts`. */
function FiltroDaConsulta({ c, ajustes, ctx, mudar, somenteLer }: { c: CampoDoFiltro } & PropsDoFormulario) {
  const dele = ajustes[c.campo]
  const poe = (v: unknown): void => mudar(sem({ ...ajustes, [c.campo]: v }))
  if (c.tipo === 'marcar')
    return (
      <label className="ed-marcar">
        <input type="checkbox" checked={dele === true} disabled={somenteLer} onChange={(e) => poe(e.target.checked ? true : undefined)} data-consulta-filtro={c.campo} />
        {c.qualquer}
      </label>
    )
  return (
    <Campo rotulo={c.rotulo} nota={c.expressao ? NOTA_DE_EXPRESSAO : undefined}>
      {c.tipo === 'texto' && (
        <input aria-label={c.rotulo} maxLength={c.max} placeholder={c.dica} value={texto(dele)} disabled={somenteLer} onChange={(e) => poe(aoPassoDe(umaLinha(e.target.value)))} data-consulta-filtro={c.campo} />
      )}
      {c.tipo === 'coluna' && <SeletorDeColuna rotulo={c.rotulo} valor={ref(dele)} ctx={ctx} qualquer={c.qualquer} somenteLer={somenteLer} mudar={poe} />}
      {c.tipo === 'cartao' && <SeletorDeCartao rotulo={c.rotulo} valor={ref(dele)} ctx={ctx} qualquer={c.qualquer} maestro shells="junto" somenteLer={somenteLer} mudar={poe} />}
      {c.tipo === 'opcoes' && (
        <select aria-label={c.rotulo} value={texto(dele)} disabled={somenteLer} onChange={(e) => poe(aoPassoDe(e.target.value))} data-consulta-filtro={c.campo}>
          <option value="">{c.qualquer}</option>
          {c.opcoes?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </Campo>
  )
}

export function FormConsultar(props: PropsDoFormulario) {
  const { ajustes, mudar, somenteLer } = props
  const { recurso, operacao } = recursoEOperacao(ajustes)
  const operacoes = OPERACOES_DA_CONSULTA[recurso]
  const maximo = limiteMaximo(recurso)
  return (
    <>
      <Campo rotulo="O que consultar" nota="Só lê, e só o espaço deste fluxo.">
        <select aria-label="Recurso" value={recurso} disabled={somenteLer} onChange={(e) => mudar(trocarRecurso(ajustes, e.target.value as RecursoDaConsulta))} data-consulta-recurso>
          {RECURSOS.map((r) => (
            <option key={r} value={r}>
              {ROTULO_DO_RECURSO[r]}
            </option>
          ))}
        </select>
      </Campo>
      {operacoes.length > 1 && (
        <Campo rotulo="Quantas">
          <select aria-label="Operação" value={operacao} disabled={somenteLer} onChange={(e) => mudar(trocarOperacao(ajustes, e.target.value as OperacaoDaConsulta))} data-consulta-operacao>
            {operacoes.map((o) => (
              <option key={o} value={o}>
                {rotuloDaOperacao(recurso, o)}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {camposDoNo(ajustes).map((c) => (
        <FiltroDaConsulta key={`${recurso}:${operacao}:${c.campo}`} c={c} {...props} />
      ))}
      {temLimite(ajustes) && (
        <Campo rotulo="No máximo" nota={`De 1 a ${maximo} itens${recurso === 'execucao' ? '' : `; se chegar mais de um item, a soma das consultas para em ${MAX_LIMITE_DA_CONSULTA}`}.`}>
          <input
            type="number"
            aria-label="Limite de itens"
            className="ed-numero"
            min={1}
            max={maximo}
            value={limiteDoNo(ajustes)}
            disabled={somenteLer}
            onChange={(e) => mudar({ ...ajustes, limite: Math.min(maximo, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
            data-consulta-limite
          />
        </Campo>
      )}
      <p className="suave ed-nota">{notaDoNo(ajustes)}</p>
    </>
  )
}
