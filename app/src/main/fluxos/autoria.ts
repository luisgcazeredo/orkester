// A autoria de um fluxo em texto, para a origem do recado ("vem de um fluxo, criado pelo usuário…") e para o aviso no
// canto da janela. "Fluxo" é masculino: criado/editado. (`autoriaDe`, de shared/automacoes.ts, é o das Automações da
// 1.9.6, feminino, e não serve aqui.) Puro: a `autoria.prova` roda no Node.
import type { CriadaPor, EditadaPor } from '../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { nomeNoCabecalho, NOME_DO_USUARIO } from '../../shared/automacoes.ts'

const pessoa = (c: CriadaPor | EditadaPor | undefined): string => (!c || (!c.id && c.nome === NOME_DO_USUARIO) ? 'pelo usuário' : `por "${nomeNoCabecalho(c.nome)}"`)
const mesma = (a: CriadaPor | EditadaPor | undefined, b: CriadaPor | EditadaPor | undefined): boolean => pessoa(a) === pessoa(b) && (a?.id ?? '') === (b?.id ?? '')

/** "criado pelo usuário", `criado por "Construtor"`, `criado pelo usuário e editado por "Construtor"`. */
export function autoriaDoFluxo(f: { criadoPor?: CriadaPor; editadoPor?: EditadaPor }): string {
  const criado = `criado ${pessoa(f.criadoPor)}`
  return f.editadoPor && !mesma(f.editadoPor, f.criadoPor) ? `${criado} e editado ${pessoa(f.editadoPor)}` : criado
}
