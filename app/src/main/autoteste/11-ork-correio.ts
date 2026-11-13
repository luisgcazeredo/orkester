import { Cenario, Estado, recadosNoCorreio } from './util'

export const orkCorreio = (e: Estado): Cenario[] => [
    {
      // O correio: o segundo canal do `ork`, por arquivo, para o agente cujo sandbox recusa pipe.
      //
      // Medido em 09/11/2026: o sandbox do Codex no Windows recusa pipe (`connect EPERM`) em read-only e em
      // workspace-write, mas deixa ler e escrever na pasta temporária — que é a mesma que o app vê. Sem este
      // canal, o Codex recebe pedidos mas não usa o `ork`: metade do app não existe para ele.
      //
      // O cenário força o correio com ORK_SEM_PIPE=1 em vez de esperar um Codex de verdade aparecer. Um
      // canal que só um agente usa, e que ninguém testa, é um canal que apodrece em silêncio — e a nossa
      // suíte roda com shell, onde o pipe sempre funciona.
      nome: 'ork-correio',
      depende: 'ork',
      rodar: async (d) => {
        const { chefe } = e
        const { js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d

    // o mesmo verbo pelos dois canais tem de dar a mesma resposta: é o que faz do correio um canal, e não
    // um caminho paralelo com regras próprias
    await comando(chefe, 'cls; ork quem')
    const peloPipe = await aguardar(() => telaNoApp(chefe), 'Você é "PowerShell"')
    // `cls` antes: sem limpar, a resposta do `ork quem` de cima já satisfaz a espera e a checagem passa
    // sem o comando ter rodado — passou assim em 09/11/2026, e uma checagem que passa à toa é pior do que
    // nenhuma, porque dá a impressão de cobertura
    const correio = await comandoAte(
      chefe,
      'cls; $env:ORK_SEM_PIPE=1; ork quem; Remove-Item Env:\\ORK_SEM_PIPE',
      'Você é "PowerShell"',
      30_000
    )
    conferir(
      'ork pelo correio responde o mesmo que pelo pipe',
      correio.includes('Você é "PowerShell"') && peloPipe.includes('Você é "PowerShell"'),
      ultimas(correio, 2)
    )

    // e um verbo que mexe no quadro, não só um que lê: o correio atravessa até a janela como o pipe
    await comandoAte(
      chefe,
      '$env:ORK_SEM_PIPE=1; ork anotar "RECADO-PELO-CORREIO"; Remove-Item Env:\\ORK_SEM_PIPE',
      /Anotei|anotado/i,
      30_000
    )
    const anotado = await js<boolean>(
      `window.__teste.loja.planoAtual().nos.some((n) => n.tipo === 'texto' && n.texto.includes('RECADO-PELO-CORREIO'))`
    )
    conferir('verbo que mexe no quadro também vai pelo correio', anotado, anotado ? 'o texto apareceu no quadro' : 'nada no quadro')

    // O caso de verdade: o cano **quebrado**, não desligado por variável. Foi aqui que o conserto falhou na
    // primeira vez — o `ork` só caía no correio em dois códigos de erro, o sandbox do Codex devolveu um
    // terceiro, e o agente ouviu "não consegui falar com o app" com o app aberto na frente dele. Com o
    // ORK_PIPE apontando para um cano que não existe, a resposta tem de vir igual, pelo correio.
    const canoQuebrado = await comandoAte(
      chefe,
      // guarda e devolve o valor: apagar a variável deixaria o shell sem `ork` pelo resto do cenário
      'cls; $ork=$env:ORK_PIPE; $env:ORK_PIPE="\\\\.\\pipe\\orkester-cano-que-nao-existe"; ork quem; $env:ORK_PIPE=$ork',
      /Você é "PowerShell"|não consegui falar/,
      30_000
    )
    conferir(
      'cano quebrado cai no correio sozinho, qualquer que seja o erro',
      canoQuebrado.includes('Você é "PowerShell"'),
      ultimas(canoQuebrado, 2)
    )

    // a pasta do correio não guarda conversa: pedido e resposta são apagados ao serem lidos
    const naPasta = recadosNoCorreio()
    conferir('o correio não deixa recado para trás', naPasta === 0, naPasta === 0 ? 'pasta limpa' : `${naPasta} recado(s) esquecido(s)`)
      },
    },
]
