// Fluxos: o selo da aprovação dos nós sensíveis (Código, HTTP e comando; plano §3, "Regra de sensível").
//
// Ao ligar (ou rodar) um fluxo sensível, o usuário vê cada nó sensível inteiro; o main guarda em `aprovado.nos` o hash
// de `assinaturaDoNo` de cada um e, em `aprovado.selo`, um HMAC disso com uma chave que só o app tem. O motor não roda
// fluxo sensível com selo ausente ou errado: pega o agente que edita o `.json` direto no disco.
// A chave nasce uma vez (32 bytes aleatórios) e fica cifrada pelo cofre do sistema (`safeStorage`; no Windows, o DPAPI
// da conta). Não é barreira absoluta: o mesmo usuário do Windows consegue decifrá-la (§12).
// Sem import do Electron em tempo de execução: o cofre e a gravação vêm de quem cria o selo (a prova roda no Node).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { FluxoGravado, NoDoFluxo } from '../../shared/fluxos/formato'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { assinaturaDoNo, jsonCanonico, locaisDoFluxo, nosSensiveis } from '../../shared/fluxos/formato.ts'

/** A parte do `safeStorage` do Electron que o selo usa. */
export interface CofreDoSistema {
  isEncryptionAvailable(): boolean
  encryptString(texto: string): Buffer
  decryptString(cifrado: Buffer): string
}

export interface DependenciasDoSelo {
  cofre: CofreDoSistema
  /** Onde a chave cifrada fica (`~/.orkester/fluxos-selo.json`). */
  arquivo: string
  gravarJsonAtomico: (destino: string, valor: unknown, guardarRuim: boolean) => void
}

export type Aprovado = NonNullable<FluxoGravado['aprovado']>

export interface Selo {
  /** Sem cofre do sistema não há chave: fluxo sensível não liga nem roda. */
  disponivel(): boolean
  /** A aprovação dos nós sensíveis do fluxo como estão agora. Lança sem cofre. */
  aprovar(espaco: string, fluxo: Pick<FluxoGravado, 'id' | 'nos' | 'rede'>, agora: Date): Aprovado
  /** Fluxo não sensível: sempre `true`. Sensível: aprovado, com os mesmos nós sensíveis, sem mudança e selo certo. */
  conferir(espaco: string, fluxo: Pick<FluxoGravado, 'id' | 'nos' | 'aprovado' | 'rede'>): boolean
}

/** O hash que vai em `aprovado.nos` (sha-256 da assinatura). */
export const hashDoNo = (no: Pick<NoDoFluxo, 'tipo' | 'versaoDoTipo' | 'ajustes'>): string => createHash('sha256').update(assinaturaDoNo(no)).digest('hex')

/** Os nós sensíveis que mudaram desde a aprovação (novos, alterados); a confirmação os marca. */
export function nosMudados(fluxo: Pick<FluxoGravado, 'nos' | 'aprovado'>): string[] {
  const aprovados = fluxo.aprovado?.nos ?? {}
  return nosSensiveis(fluxo)
    .filter((n) => aprovados[n.id] !== hashDoNo(n))
    .map((n) => n.id)
}

/** O selo com uma chave já em mãos (puro). */
export function seloComChave(chave: () => Buffer | null): Selo {
  // os endereços locais permitidos entram no selo (veredito 196): incluir, tirar ou trocar um sem nova aprovação = o
  // selo não confere. Sem nenhum, o texto assinado é o de antes (as aprovações já gravadas continuam valendo); o selo
  // de um fluxo com a antiga "rede interna liberada" deixa de conferir (o formato novo a lê como lista vazia).
  const assinar = (k: Buffer, espaco: string, id: string, em: string, nos: Record<string, string>, locais: string[]): string =>
    createHmac('sha256', k)
      .update(jsonCanonico({ espaco, fluxo: id, em, nos, ...(locais.length ? { rede: { locaisPermitidos: locais } } : {}) }))
      .digest('hex')
  return {
    disponivel: () => chave() !== null,
    aprovar(espaco, fluxo, agora) {
      const k = chave()
      if (!k) throw new Error('o cofre do sistema não está disponível: fluxo com Código, HTTP ou comando não pode ser aprovado')
      const nos = Object.fromEntries(nosSensiveis(fluxo).map((n) => [n.id, hashDoNo(n)]))
      const em = agora.toISOString()
      return { em, nos, selo: assinar(k, espaco, fluxo.id, em, nos, locaisDoFluxo(fluxo)) }
    },
    conferir(espaco, fluxo) {
      const sensiveis = nosSensiveis(fluxo)
      if (!sensiveis.length) return true
      const a = fluxo.aprovado
      const k = chave()
      if (!a || !k || typeof a.selo !== 'string' || !a.nos || typeof a.nos !== 'object') return false
      // os mesmos nós sensíveis, sem mudança (um nó sensível novo ou trocado pede outra aprovação)
      if (Object.keys(a.nos).length !== sensiveis.length || nosMudados(fluxo).length) return false
      const certo = Buffer.from(assinar(k, espaco, fluxo.id, String(a.em), a.nos, locaisDoFluxo(fluxo)), 'hex')
      const visto = Buffer.from(a.selo, 'hex')
      return visto.length === certo.length && timingSafeEqual(visto, certo)
    }
  }
}

/** O selo do app: a chave é lida (ou criada) do arquivo cifrado na primeira vez que precisa. */
export function criarSelo(dep: DependenciasDoSelo): Selo {
  let chave: Buffer | null | undefined
  const obter = (): Buffer | null => {
    if (chave !== undefined) return chave
    if (!dep.cofre.isEncryptionAvailable()) return null // sem guardar: o cofre pode ficar disponível depois
    let ruim = false
    if (existsSync(dep.arquivo)) {
      try {
        const x = JSON.parse(readFileSync(dep.arquivo, 'utf8')) as { versao?: unknown; cifrado?: unknown }
        const k = Buffer.from(dep.cofre.decryptString(Buffer.from(String(x.cifrado), 'base64')), 'base64')
        if (x.versao === 1 && k.length === 32) return (chave = k)
      } catch {
        // ilegível ou de outra conta: uma chave nova; as aprovações velhas deixam de valer (os sensíveis desligam)
      }
      ruim = true
    }
    const nova = randomBytes(32)
    dep.gravarJsonAtomico(dep.arquivo, { versao: 1, cifrado: dep.cofre.encryptString(nova.toString('base64')).toString('base64') }, ruim)
    return (chave = nova)
  }
  return seloComChave(obter)
}
