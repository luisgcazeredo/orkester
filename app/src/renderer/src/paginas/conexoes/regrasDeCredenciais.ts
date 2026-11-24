// Aba Credenciais de Conexões: as regras puras da tela (o que mostrar de uma credencial salva, como ler os domínios, o
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
  { id: 'basic', rotulo: 'Usuário e senha (Basic)', ajuda: 'Vai no cabeçalho Authorization, codificado como o HTTP Basic pede.', valor: '' }
]

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
}

export const FORMULARIO_VAZIO: Formulario = { nome: '', tipo: 'bearer', cabecalho: '', dominios: '', valor: '', usuario: '', senha: '' }

/** O valor que o main espera: o token, ou `usuario:senha`. */
export const valorDoFormulario = (f: Pick<Formulario, 'tipo' | 'valor' | 'usuario' | 'senha'>): string => (f.tipo === 'basic' ? `${f.usuario.trim()}:${f.senha}` : f.valor)

/** Os domínios já normalizados, ou o motivo (o primeiro que não vale). */
export function conferirDominios(texto: string): string[] | { erro: string } {
  const lista = dominiosDoTexto(texto)
  if (!lista.length) return { erro: 'diga pelo menos 1 domínio para onde a credencial pode ir (ex.: api.exemplo.com)' }
  if (lista.length > MAX_DOMINIOS) return { erro: `no máximo ${MAX_DOMINIOS} domínios por credencial` }
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
  if (!f.nome.trim()) return 'dê um nome à credencial'
  if (f.nome.trim().length > MAX_NOME_DA_CREDENCIAL) return `o nome passa de ${MAX_NOME_DA_CREDENCIAL} letras`
  if (f.tipo === 'cabecalho' && !f.cabecalho.trim()) return 'diga o nome do cabeçalho (ex.: X-Api-Key)'
  const ds = conferirDominios(f.dominios)
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

/** A frase depois de apagar: quais fluxos citavam o nome (não são mexidos; o próximo pedido deles dá erro claro). */
export function textoDoApagado(nome: string, usadaEm: readonly string[]): string {
  if (!usadaEm.length) return `A credencial "${nome}" foi apagada.`
  const lista = usadaEm.length > 5 ? `${usadaEm.slice(0, 5).join(', ')} e mais ${usadaEm.length - 5}` : usadaEm.join(', ')
  const um = usadaEm.length === 1
  return `A credencial "${nome}" foi apagada. ${um ? 'Este fluxo a citava' : 'Estes fluxos a citavam'}: ${lista}. ${um ? 'Ele não foi mexido' : 'Eles não foram mexidos'}: o próximo pedido dá o erro "credencial não existe".`
}

/** O aviso antes de apagar. */
export const avisoDoApagar = (nome: string): string =>
  `Apagar "${nome}"? O valor guardado some do Orkester e não dá para recuperar (guarde-o em outro lugar se ainda precisar). Os fluxos que citam esse nome continuam como estão e passam a dar erro no pedido.`

/** Por que a aba não deixa criar nem trocar valor. */
export const SEM_COFRE =
  'O cofre do sistema não está disponível neste PC. O Orkester só guarda credencial cifrada por ele e nunca grava o valor em texto puro, então aqui não dá para criar nem trocar valores. No Windows o cofre é o do próprio usuário (DPAPI); no Linux depende de um chaveiro instalado (como o GNOME Keyring ou o KWallet).'
