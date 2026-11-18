// Portais: o navegador embutido (reserva para quando o PC não tem Chrome nem Edge) roda numa partição própria do
// Electron, e é nela que os logins ficam guardados. A página Conexões lista essas partições e deixa limpar o login.
//
// Puro de propósito: o principal lê os cookies da sessão e passa só o que importa para cá (domínio e se persiste);
// o que vira "tem login guardado" e "quais sites" é decidido aqui, onde a prova alcança. O valor de um cookie
// nunca entra neste módulo — nem a tela nem o IPC o recebem.

/** As partições que o app usa. A limpeza só aceita estas: o nome vem da janela e não vale como caminho livre. */
export const PARTICOES_DE_PORTAL = [{ particao: 'persist:portal', nome: 'Navegador embutido' }] as const

export type ParticaoDePortal = (typeof PARTICOES_DE_PORTAL)[number]['particao']

export function particaoConhecida(particao: unknown): particao is ParticaoDePortal {
  return PARTICOES_DE_PORTAL.some((p) => p.particao === particao)
}

/** O pouco que se sabe de um cookie para decidir isto: o domínio e se ele sobrevive ao fechar o app. */
export interface CookieResumido {
  domain?: string
  /** Cookie de sessão morre ao fechar o navegador; o que persiste é o que "mantém o login". */
  session?: boolean
}

export interface ResumoDePortal {
  particao: string
  nome: string
  /** Há cookie persistente (o que mantém um login entre aberturas). */
  temLogin: boolean
  /** Sites com cookie guardado, sem repetir e sem o ponto inicial, em ordem alfabética. */
  sites: string[]
  /** Quantos cookies há ao todo. */
  cookies: number
}

const MAX_SITES = 50

export function resumirPortal(particao: string, nome: string, cookies: CookieResumido[]): ResumoDePortal {
  const sites = new Set<string>()
  let temLogin = false
  for (const c of cookies) {
    const site = (c.domain ?? '').replace(/^\./, '').trim().toLowerCase()
    if (site) sites.add(site)
    if (c.session === false) temLogin = true
  }
  return {
    particao,
    nome,
    temLogin,
    sites: [...sites].sort().slice(0, MAX_SITES),
    cookies: cookies.length
  }
}
