import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extrairContextoRestante } from '../espera'
import { linhaDeComando, sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const orkPresets = (e: Estado): Cenario[] => [
    {
      nome: 'ork-presets',
      depende: 'ork-heranca',
      rodar: async (d) => {
        const { pastaTerminais } = e
        const { esperar, js, print, centroDe, tecla, digitar, clicar, conferir } = d
    const clicarEm = async (seletor: string): Promise<boolean> => {
      const c = await centroDe(seletor)
      if (c) await clicar(c)
      return !!c
    }
    await clicarEm('.barra-ferramentas button[title="Terminal"]')
    const abriuEditor = (await clicarEm('.menu-terminal-editar')) && (await clicarEm('.preset-novo'))
    await clicarEm('.preset-linha:last-child .preset-nome')
    await tecla('A')
    await digitar('Claude Opus')
    await clicarEm('.preset-linha:last-child .preset-comando')
    await tecla('A')
    await digitar('claude --model opus')
    await print('presets')
    await clicarEm('.dialogo-acoes .primario')
    const opus = await js<string>(
      `window.__teste.loja.lerEstado().preferencias.presets.find((p) => p.nome === 'Claude Opus')?.comando ?? ''`
    )
    await clicarEm('.barra-ferramentas button[title="Terminal"]')
    const botaoOpus = await js<{ x: number; y: number } | null>(`(() => {
      const b = [...document.querySelectorAll('.menu-terminal button')].find((x) => x.textContent?.trim() === 'Claude Opus')
      const r = b?.getBoundingClientRect(); return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })()`)
    if (botaoOpus) await clicar(botaoOpus)
    const noOpus = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Claude Opus')?.id ?? ''`)
    await esperar(300)
    const linhaOpus = sessaoPorId(noOpus) ? linhaDeComando(sessaoPorId(noOpus)!.espec) : ''
    conferir(
      'preset novo "Claude Opus" pelo diálogo abre com o comando certo',
      abriuEditor && opus === 'claude --model opus' && /^claude --model opus --session-id [0-9a-f-]{36}$/.test(linhaOpus),
      `preset: ${opus || 'não gravou'} · linha: ${linhaOpus || 'sem processo'}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${noOpus}' })`)

    // retomar a conversa: o Claude nasce com o id escolhido e volta com --resume; o Codex volta com `codex resume`
    const pastaClaudeTeste = join(tmpdir(), `orkester-autoteste-claude-${Date.now()}`)
    process.env.CLAUDE_CONFIG_DIR = pastaClaudeTeste
    const conversa = randomUUID()
    const especClaude = { id: randomUUID(), nome: 'C', agente: 'claude' as const, comando: 'claude --model opus', pasta: pastaTerminais, sessao: conversa }
    const inicial = linhaDeComando(especClaude)
    mkdirSync(join(pastaClaudeTeste, 'projects', 'qualquer'), { recursive: true })
    writeFileSync(join(pastaClaudeTeste, 'projects', 'qualquer', `${conversa}.jsonl`), '{}\n')
    const retomada = linhaDeComando(especClaude)
    const codex = linhaDeComando({ ...especClaude, agente: 'codex', comando: 'codex --no-daemon' })
    // o preset do usuário é só `codex`: o `--no-daemon` entra sozinho, senão o cartão fala com um servidor
    // compartilhado que guarda o ambiente (e o crachá) de quando nasceu
    const codexSimples = linhaDeComando({ ...especClaude, agente: 'codex', comando: 'codex', sessao: undefined })
    delete process.env.CLAUDE_CONFIG_DIR
    const claudeNovo = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: L.lerEstado().preferencias.presets.find((p) => p.agente === 'claude') }, 1600, 300)
      return L.planoAtual().nos.find((n) => n.id === id).sessao ?? '' })()`)
    conferir(
      'retomar conversa: Claude --session-id e depois --resume; Codex resume',
      inicial === `claude --model opus --session-id ${conversa}` &&
        retomada === `claude --model opus --resume ${conversa}` &&
        codex === `codex resume ${conversa} --no-daemon` &&
        codexSimples === 'codex --no-daemon' &&
        /^[0-9a-f-]{36}$/.test(claudeNovo),
      `${inicial} · ${retomada} · ${codex} · ${codexSimples} · cartão novo: ${claudeNovo ? 'com id' : 'sem id'}`
    )

    // o leitor de contexto por fora: prova os formatos conhecidos sem gastar conta de agente. O rodapé de verdade
    // (Claude e Codex) só é exercitado no bloco opcional abaixo
    const exemplos: Array<[string, number | null]> = [
      ["Context left until auto-compact: 23%", 23],
      ["  ? for shortcuts                                    17% context left", 17],
      ["tokens remaining: 8%", 8],
      ["PS C:\Users\ana> echo 50%", null],
      ["for shortcuts · context left", null]
    ]
    const erradas = exemplos.filter(([tela, esperado]) => extrairContextoRestante(tela) !== esperado)
    conferir(
      "leitor de contexto: lê os formatos conhecidos e não adivinha no resto",
      erradas.length === 0,
      erradas.map(([tela]) => `${tela} → ${extrairContextoRestante(tela)}`).join(" | ")
    )

    // opcional (gasta um pouco da conta): `ORK_AGENTES_DE_VERDADE=1 npm run autoteste` abre um Claude e um Codex de
    // verdade pelo `ork`, na pasta do app; a resposta (uma conta) não aparece no texto do pedido
      },
    },
]
