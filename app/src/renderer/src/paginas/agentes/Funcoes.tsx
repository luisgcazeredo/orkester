import { useState } from 'react'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import type { Funcao } from '../../../../shared/modelo'
import { MODELOS_PADRAO, esforcosDoMotor, modeloValido, type Esforco } from '../../../../shared/modelos'
import { definirFuncoes, lerEstado } from '../../estado/loja'

// Funções (papéis): o que um agente é, escrito uma vez e reaproveitado. O cartão nasce com o nome da função
// e recebe o prompt dela como primeiro pedido, em vez de nascer vazio esperando você explicar tudo de novo.
// Os agentes também usam, pelo `ork abrir --funcao "Papel"` e `ork funcoes`.

export function EditorDeFuncoes() {
  const doEstado = (): Funcao[] => (lerEstado().preferencias.funcoes ?? []).map((f) => ({ ...f }))
  const [lista, setLista] = useState<Funcao[]>(doEstado)
  const mudar = (id: string, parcial: Partial<Funcao>): void =>
    setLista((l) => l.map((f) => (f.id === id ? { ...f, ...parcial } : f)))
  // o motor da função é o do preset dela; sem preset, vale o geral (claude) — `ultra` só passa com preset de Codex
  const presets = lerEstado().preferencias.presets
  const niveis = (f: Funcao) => {
    const agente = presets.find((p) => p.id === f.preset)?.agente
    if (agente === 'claude' || agente === 'codex') return esforcosDoMotor(agente, f.modelo, MODELOS_PADRAO)
    // sem preset o motor só se decide na hora de abrir: só vale o que os dois aceitam (sem `ultra`)
    const doCodex = esforcosDoMotor('codex', f.modelo, MODELOS_PADRAO)
    return esforcosDoMotor('claude', f.modelo, MODELOS_PADRAO).filter((n) => doCodex.includes(n))
  }
  const esforcoOk = (f: Funcao): boolean => f.esforco === undefined || niveis(f).includes(f.esforco)
  // nome repetido quebraria o `--funcao "Nome"`, que é como o agente fala dela
  const nomes = lista.map((f) => f.nome.trim().toLowerCase())
  const problema = (f: Funcao): string | null => {
    if (!f.nome.trim()) return 'sem nome'
    if (nomes.filter((n) => n === f.nome.trim().toLowerCase()).length > 1) return 'nome repetido'
    if (!f.prompt.trim()) return 'prompt vazio'
    if (f.modelo !== undefined && !modeloValido(f.modelo)) return 'modelo inválido'
    if (!esforcoOk(f)) return 'esforço não vale para este modelo/motor'
    return null
  }
  const culpada = lista.find((f) => problema(f) !== null)
  const valida = !culpada
  const aviso = culpada ? `${culpada.nome.trim() ? `“${culpada.nome.trim()}”` : `Função ${lista.indexOf(culpada) + 1}`}: ${problema(culpada)}` : null

  function salvar(): void {
    if (!valida) return
    definirFuncoes(lista.map((f) => ({ ...f, nome: f.nome.trim().slice(0, 80), prompt: f.prompt.trim() })))
  }

  async function escolherPasta(id: string): Promise<void> {
    const pasta = await window.ork.dados.escolherPasta()
    if (pasta) mudar(id, { pasta })
  }

  return (
    <div className="editor-pagina" data-editor="funcoes">
      <p className="dialogo-texto suave">
        O prompt vai como primeiro pedido assim que o agente fica pronto. A pasta é opcional: sem ela, vale a do
        espaço. Os agentes abrem uma função com <code>ork abrir claude --funcao &quot;Nome&quot;</code>.
      </p>
      <div className="funcoes">
        {lista.map((f) => (
          <div key={f.id} className={`funcao-linha${problema(f) ? ' funcao-invalida' : ''}`} data-funcao={f.id} title={problema(f) ?? undefined}>
            <div className="funcao-topo">
              <input
                className="funcao-nome"
                value={f.nome}
                placeholder="Nome do papel (ex.: Revisor)"
                onChange={(e) => mudar(f.id, { nome: e.target.value })}
              />
              <input
                className="preset-modelo"
                value={f.modelo ?? ''}
                placeholder="modelo"
                title="Modelo (ex.: opus, sonnet, gpt-5.6-terra). Vazio: o do comando ou o padrão do motor."
                spellCheck={false}
                onChange={(e) => mudar(f.id, { modelo: e.target.value.trim() || undefined })}
              />
              <select
                className="preset-esforco"
                value={f.esforco ?? ''}
                title="Esforço de raciocínio"
                onChange={(e) => mudar(f.id, { esforco: (e.target.value || undefined) as Esforco | undefined })}
              >
                <option value="">esforço</option>
                {niveis(f).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button className="funcao-pasta" title={f.pasta ? `Pasta própria: ${f.pasta}` : 'Pasta própria desta função (vazio: a do espaço)'} onClick={() => void escolherPasta(f.id)}>
                <FolderOpen size={14} />
                <span>{f.pasta ? f.pasta.split(/[/\\]/).filter(Boolean).slice(-1)[0] : 'pasta do espaço'}</span>
              </button>
              <button className="preset-apagar" title="Apagar função" onClick={() => setLista((l) => l.filter((x) => x.id !== f.id))}>
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              className="funcao-prompt"
              value={f.prompt}
              rows={9}
              placeholder="O que ele é, o que se espera dele, o que não fazer…"
              onChange={(e) => mudar(f.id, { prompt: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="dialogo-acoes">
        <button
          className="preset-novo"
          onClick={() => setLista((l) => [...l, { id: crypto.randomUUID(), nome: '', prompt: '' }])}
        >
          <Plus size={14} /> Nova função
        </button>
        <span className="espaco-flex" />
        {aviso && (
          <span className="funcao-aviso" role="status">
            {aviso}
          </span>
        )}
        <button onClick={() => setLista(doEstado())}>Desfazer alterações</button>
        <button className="primario" disabled={!valida} onClick={salvar}>
          Salvar
        </button>
      </div>
    </div>
  )
}
