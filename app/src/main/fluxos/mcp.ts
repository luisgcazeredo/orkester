// Fluxos (1.9.7, C3a): a ação do nó "Ferramenta MCP" (`fora.mcp`). Quem fala com o servidor é o registro do MCP de
// fora (`main/mcpFora/registro.ts`): ele só chama ferramenta APROVADA (a impressão que mudou bloqueia, com "reveja em
// Conexões"), respeita a pausa e o login pendente, e devolve o resultado já com os segredos do servidor em •••.
//
// Aqui: os argumentos do nó (um objeto JSON com `{{ }}`) montados para o item, do texto ANTES das expressões (como o
// corpo JSON do HTTP: o valor dentro de aspas entra escapado, fora entra como valor JSON); os segredos do servidor
// registrados no `ctx.ocultar` (entrada, saída, erro e log da execução saem com •••); e a saída por chamada
// `{ texto, estruturado?, erro }`. O nó é sensível (catálogo): o agente cria e edita, mas só o usuário liga.
import type { AcoesDoFluxo } from '../../shared/fluxos/executor'
import type { RegistroMcpFora } from '../mcpFora/registro'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { comContexto } from '../../shared/fluxos/executor.ts'
// @ts-expect-error idem
import { corpoJson } from '../../shared/fluxos/rede.ts'

export interface DependenciasDoMcp {
  /** O registro do app (`registroMcpFora`, de `main/mcpFora`), por função: lido só na hora da chamada. */
  registro: () => Pick<RegistroMcpFora, 'chamar' | 'segredosDe' | 'resumo'>
}

/** Erro do nó, com a mensagem que aparece na execução (o executor ainda passa o `ocultar` nela). */
class ErroDoMcp extends Error {}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Os argumentos do nó para este item: o texto do nó ANTES das expressões, com elas escapadas. */
export function argumentosParaItem(modelo: string, json: Record<string, unknown>, contexto?: Parameters<typeof comContexto>[1]): Record<string, unknown> {
  const montado = corpoJson(modelo || '{}', comContexto(json, contexto))
  if (typeof montado !== 'string') throw new ErroDoMcp(montado.erro.replace('o corpo JSON', 'os argumentos'))
  const valor: unknown = JSON.parse(montado || '{}')
  if (!ehObjeto(valor)) throw new ErroDoMcp('os argumentos precisam ser um objeto JSON ({ ... })')
  return valor
}

/** A ação `mcp` dos fluxos. Uma chamada por item; a saída do item é `{ texto, estruturado?, erro }`. */
export function criarAcaoMcp(dep: DependenciasDoMcp): AcoesDoFluxo['mcp'] {
  return async (ajustes, item, ctx) => {
    const { servidor, ferramenta } = ajustes
    if (!servidor.id) throw new ErroDoMcp(`escolha o servidor MCP no nó (o "${servidor.nome}" não está ligado a um cadastro de Conexões › MCP)`)
    const registro = dep.registro()
    const modelo = (ctx.no.ajustes as { argumentos?: unknown }).argumentos
    const argumentos = argumentosParaItem(typeof modelo === 'string' ? modelo : ajustes.argumentos, item.json, ctx.contexto)
    const nome = registro.resumo(servidor.id)?.nome ?? servidor.nome
    // os segredos que o servidor já tem (de uma subida anterior) e, depois da chamada, os da subida desta
    const ocultarDoServidor = (): void => registro.segredosDe(servidor.id).forEach(ctx.ocultar)
    ocultarDoServidor()
    try {
      const r = await registro.chamar(servidor.id, ferramenta, argumentos, { sinal: ctx.sinal })
      ocultarDoServidor()
      return {
        texto: r.texto,
        ...(r.estruturado !== undefined ? { estruturado: r.estruturado } : {}),
        erro: r.erro,
        ...(r.omitidos ? { omitidos: r.omitidos } : {})
      }
    } catch (e) {
      ocultarDoServidor()
      if (ctx.sinal.aborted) throw new ErroDoMcp(`${nome}: a execução acabou antes da resposta`)
      const mensagem = e instanceof Error ? e.message : String(e)
      throw new ErroDoMcp(mensagem.startsWith(nome) || mensagem.includes(` ${nome} `) ? mensagem : `${nome}: ${mensagem}`)
    }
  }
}
