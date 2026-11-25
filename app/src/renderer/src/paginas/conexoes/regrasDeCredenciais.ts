// Aba APIs de Conexões (era Credenciais até a 1.9.7; o Segredo é listado em Conexões › MCP): as regras puras da tela (o que mostrar de uma credencial salva, como ler os domínios, o
// que falta para criar, o texto do apagar). Sem React e sem DOM: a `credenciais.prova` roda no Node. A validação de
// verdade é do main (`shared/fluxos/credenciais.ts`, a mesma que `criarCredencial` aplica); aqui ela só é repetida
// antes da viagem para dizer em português o que arrumar, usando as mesmas funções.
import type { CredencialVisivel, TipoDeCredencial } from '../../../../shared/fluxos/credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { dominioValido, MAX_DOMINIOS, MAX_NOME_DA_CREDENCIAL, valorValido } from '../../../../shared/fluxos/credenciais.ts'

export const TIPOS: ReadonlyArray<{ id: TipoDeCredencial; rotulo: string; ajuda: string; valor: string }> = [
  { id: 'bearer', rotulo: 'Token (Bearer)', ajuda: 'Vai no cabeçalho Authorization como "Bearer <token>".', valor: 'O token, sem a palavra Bearer' },
  { id: 'cabecalho', rotulo: 'Cabeçalho próprio', ajuda: 'Vai num cabeçalho com o nome que a API pede (ex.: X-Api-Key).', valor: 'O valor do cabeçalho' },
  { id: 'basic', rotulo: 'Usuário e senha (Basic)', ajuda: 'Vai no cabeçalho Authorization, codificado como o HTTP Basic pede.', valor: '' },
  // (1.9.7, C4) a chave de um servidor MCP de fora (variável de ambiente): sem domínio, nunca vai em cabeçalho nem pedido
  { id: 'segredo', rotulo: 'Segredo, sem domínio', ajuda: 'Um valor só para variável de ambiente de servidor MCP de fora. Nunca vai em cabeçalho nem em pedido HTTP.', valor: 'O valor da variável' }
]

/** Os tipos que vão num cabeçalho HTTP: o que o nó HTTP e o aceite de uma página oferecem (o Segredo fica só no MCP). */
export const TIPOS_DE_CABECALHO: readonly TipoDeCredencial[] = ['bearer', 'cabecalho', 'basic']

/** O que fica à mostra depois de salva: nunca o valor; no máximo os 4 últimos caracteres. */
export const mascaraDoValor = (c: Pick<CredencialVisivel, 'fim'>): string => (c.fim ? `••••${c.fim}` : '••••••••')

/** "Cabeçalho X-Api-Key", "Token (Bearer)", "Usuário e senha (Basic)". */
export function rotuloDoTipo(c: Pick<CredencialVisivel, 'tipo' | 'cabecalho'>): string {
  if (c.tipo === 'cabecalho') return `Cabeçalho ${c.cabecalho ?? ''}`.trim()
  return TIPOS.find((t) => t.id === c.tipo)?.rotulo ?? c.tipo
}

/** Domínios digitados um por linha (ou separados por vírgula ou espaço), sem os vazios. */
export const dominiosDoTexto = (texto: string): string[] =>
  texto
    .split(/[\s,;]+/)
    .map((d) => d.trim())
    .filter(Boolean)

export interface Formulario {
  nome: string
  tipo: TipoDeCredencial
  cabecalho: string
  /** Um por linha. */
  dominios: string
  /** `bearer` e `cabecalho`. */
  valor: string
  /** `basic`. */
  usuario: string
  senha: string
  /** (1.9.7) `true`: a API só lê (GET, HEAD). Não vale no Segredo. */
  soLeitura: boolean
}

/** API nova nasce "só lê" (1.9.7): escrever é escolha explícita. */
export const FORMULARIO_VAZIO: Formulario = { nome: '', tipo: 'bearer', cabecalho: '', dominios: '', valor: '', usuario: '', senha: '', soLeitura: true }

/** Uma API é toda credencial que vai em cabeçalho; o Segredo (variável de ambiente de servidor MCP) não é API. */
export const ehApi = (c: Pick<CredencialVisivel, 'tipo'>): boolean => c.tipo !== 'segredo'

/** O selo do cartão: "só lê" ou, em vermelho, "lê e escreve" (API sem o campo, da 1.9.6, lê e escreve). */
export const seloDaEscrita = (c: Pick<CredencialVisivel, 'soLeitura'>): { texto: string; perigo: boolean } =>
  c.soLeitura ? { texto: 'só lê', perigo: false } : { texto: 'lê e escreve', perigo: true }

/** "A API" ou "O segredo": como a tela chama a credencial numa frase. */
export const oQueE = (c: Pick<CredencialVisivel, 'tipo'>): { artigo: string; nome: string } => (ehApi(c) ? { artigo: 'A API', nome: 'API' } : { artigo: 'O segredo', nome: 'Segredo' })

/** O cabeçalho de servidor MCP usa uma API, mas o "só lê" não se aplica ali. */
export const NOTA_DO_MCP_NA_ESCRITA = 'No cabeçalho de um servidor MCP isso não vale: o MCP sempre faz POST, e o que muda coisas é escolhido por ferramenta.'

/** O aviso fixo do campo Nome ao editar. */
export const AVISO_DO_RENOMEAR = 'Mudar o nome faz as páginas e os fluxos que chamam pelo nome antigo pararem até você ajustar.'

/** O valor que o main espera: o token, ou `usuario:senha`. */
export const valorDoFormulario = (f: Pick<Formulario, 'tipo' | 'valor' | 'usuario' | 'senha'>): string => (f.tipo === 'basic' ? `${f.usuario.trim()}:${f.senha}` : f.valor)

/** Segredo não tem domínio: a lista vai vazia e o campo nem aparece. */
export const semDominio = (tipo: TipoDeCredencial): boolean => tipo === 'segredo'

/** Os domínios de um formulário: `[]` no Segredo, senão os de `conferirDominios`. */
export const dominiosDoFormulario = (f: Pick<Formulario, 'tipo' | 'dominios'>): string[] | { erro: string } => (semDominio(f.tipo) ? [] : conferirDominios(f.dominios))

/** Os domínios já normalizados, ou o motivo (o primeiro que não vale). */
export function conferirDominios(texto: string): string[] | { erro: string } {
  const lista = dominiosDoTexto(texto)
  if (!lista.length) return { erro: 'diga pelo menos 1 domínio para onde a API pode ir (ex.: api.exemplo.com)' }
  if (lista.length > MAX_DOMINIOS) return { erro: `no máximo ${MAX_DOMINIOS} domínios por API` }
  const saida: string[] = []
  for (const d of lista) {
    const r = dominioValido(d)
    if (typeof r !== 'string') return r
    if (!saida.includes(r)) saida.push(r)
  }
  return saida
}

/** O que falta para criar (a primeira coisa), ou `null`. O main revalida tudo. */
export function faltaParaCriar(f: Formulario): string | null {
  if (!f.nome.trim()) return semDominio(f.tipo) ? 'dê um nome ao segredo' : 'dê um nome à API'
  if (f.nome.trim().length > MAX_NOME_DA_CREDENCIAL) return `o nome passa de ${MAX_NOME_DA_CREDENCIAL} letras`
  if (f.tipo === 'cabecalho' && !f.cabecalho.trim()) return 'diga o nome do cabeçalho (ex.: X-Api-Key)'
  const ds = dominiosDoFormulario(f)
  if ('erro' in ds) return ds.erro
  if (f.tipo === 'basic' && !f.usuario.trim()) return 'diga o usuário'
  if (f.tipo === 'basic' && f.usuario.includes(':')) return 'o usuário não pode ter ":"'
  const v = valorValido(valorDoFormulario(f), f.tipo)
  return typeof v === 'string' ? null : v.erro
}

/** O que falta para guardar um valor novo (a troca de valor), ou `null`. */
export function faltaParaTrocarValor(tipo: TipoDeCredencial, f: Pick<Formulario, 'valor' | 'usuario' | 'senha'>): string | null {
  if (tipo === 'basic' && !f.usuario.trim()) return 'diga o usuário'
  if (tipo === 'basic' && f.usuario.includes(':')) return 'o usuário não pode ter ":"'
  const v = valorValido(valorDoFormulario({ tipo, ...f }), tipo)
  return typeof v === 'string' ? null : v.erro
}

const listaCurta = (itens: readonly string[]): string => (itens.length > 5 ? `${itens.slice(0, 5).join(', ')} e mais ${itens.length - 5}` : itens.join(', '))

/**
 * A frase depois de apagar. `usadaEm` vem do main: fluxos (pelo nome), páginas e servidores que a usavam. Ninguém é
 * mexido; o próximo pedido deles dá erro claro. `artigo`: "A API", "O segredo".
 */
export function textoDoApagado(nome: string, usadaEm: readonly string[], artigo = 'A API'): string {
  const feito = `${artigo} "${nome}" foi ${artigo.startsWith('O ') ? 'apagado' : 'apagada'}.`
  if (!usadaEm.length) return feito
  const um = usadaEm.length === 1
  return `${feito} Quem usava: ${listaCurta(usadaEm)}. ${um ? 'Não foi mexido' : 'Não foram mexidos'}: o próximo pedido dá o erro "não existe".`
}

/** A frase depois de renomear (`usadaEm`: quem chamava pelo nome antigo), ou `null` se ninguém usava. */
export function textoDoRenomeado(antigo: string, novo: string, usadaEm: readonly string[]): string | null {
  if (!usadaEm.length) return null
  return `"${antigo}" agora se chama "${novo}". Quem chamava pelo nome antigo para até você ajustar: ${listaCurta(usadaEm)}.`
}

/** O título da confirmação de apagar: `Apagar a API "X"?` ou `Apagar o segredo "X"?` (`artigo`: "A API", "O segredo"). */
export const tituloDoApagar = (nome: string, artigo: string): string => `Apagar ${artigo.charAt(0).toLowerCase()}${artigo.slice(1)} "${nome}"?`

/**
 * O corpo da confirmação de apagar (1.9.7): sem repetir a pergunta do título, direto no que acontece. `usadaEm` é quem
 * usa agora (`credenciais.quemUsa`); a lista vai nos `detalhes` do diálogo, como no "Apagar coluna" do kanban.
 */
export function avisoDoApagar(usadaEm: readonly string[]): string {
  const perde = 'O valor guardado some do Orkester e não dá para recuperar (guarde-o em outro lugar se ainda precisar).'
  if (!usadaEm.length) return `${perde} Nada usa agora.`
  return `${perde} ${usadaEm.length === 1 ? 'Este usa e não é mexido: o próximo pedido dele dá erro' : 'Estes usam e não são mexidos: o próximo pedido deles dá erro'}:`
}

/** No Editar: o que acontece com quem chama pelo nome antigo, antes do Salvar (`usadaEm` `null` = ainda não sei). */
export function avisoDoRenomear(mudouONome: boolean, usadaEm: readonly string[] | null): { texto: string; perigo: boolean } {
  if (!mudouONome || usadaEm === null) return { texto: AVISO_DO_RENOMEAR, perigo: false }
  if (!usadaEm.length) return { texto: 'Nada usa esta API agora: mudar o nome não quebra nada.', perigo: false }
  return { texto: `Vão parar até você ajustar: ${listaCurta(usadaEm)}.`, perigo: true }
}

/** Por que a aba não deixa criar nem trocar valor. */
export const SEM_COFRE =
  'O cofre do sistema não está disponível neste PC. O Orkester só guarda API e segredo cifrados por ele e nunca grava o valor em texto puro, então aqui não dá para criar nem trocar valores. No Windows o cofre é o do próprio usuário (DPAPI); no Linux depende de um chaveiro instalado (como o GNOME Keyring ou o KWallet).'
