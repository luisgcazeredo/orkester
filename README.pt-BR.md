<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/orkester-escuro.png">
  <img src="docs/orkester.png" alt="Orkester" height="80">
</picture>

**Um time de agentes de código num quadro infinito — e você desenha quem fala com quem.**

![versão](https://img.shields.io/badge/vers%C3%A3o-1.0.1-4060e8)
![plataforma](https://img.shields.io/badge/plataforma-Windows%2011%20x64-4060e8)

[English](README.md) · Português

Claude Code, Codex e PowerShell rodam de verdade dentro dos cartões, ao lado de post-its, arquivos e
desenhos. A linha que você traça entre dois cartões é a permissão para um agente falar com o outro.

---

## Por quê

Um agente de código dá conta de uma tarefa por vez, e dá conta bem. Quando o trabalho cresce, a saída de
todo mundo é a mesma: abrir mais terminais. Aí o gargalo deixa de ser o agente e passa a ser você — meia
dúzia de janelas iguais, nenhuma sabe o que a outra está fazendo, e o único jeito de um agente aproveitar o
trabalho do outro é você copiar e colar entre as duas.

O Orkester troca essa pilha de janelas por um quadro. Cada terminal vira um cartão com nome, lugar e função;
você desenha uma corda entre dois cartões e, a partir dela, os agentes se falam sozinhos. O arranjo que antes
existia só na sua cabeça vira uma coisa visível, que se salva e se repete no projeto seguinte.

Três ideias seguram o resto:

- **O quadro é o estado.** Posição, nome, grupo e ligação não são enfeite — é por eles que o app decide quem
  alcança quem. Arrastar um cartão para dentro de um grupo *é* colocá-lo no time.
- **A corda é a permissão.** Um agente só conversa com quem está ligado a ele. Nada de agente solto mandando
  recado para o quadro inteiro.
- **O agente tem mão.** Dentro de qualquer terminal do quadro existe o comando `ork`: com ele o agente abre
  sessões novas, delega, lê a tela de quem está ligado a ele, organiza o quadro e monta o próprio time. Fora
  do app, o comando recusa rodar.

## O que faz

| | |
|---|---|
| **Terminais de verdade** | Claude Code, Codex ou PowerShell dentro do cartão, com rolagem, zoom e cópia. Continuam vivos ao trocar de espaço e retomam a conversa ao reabrir o app. |
| **Delegação** | Um agente abre outro já com contexto, espera a resposta, lê a tela, responde menus e fecha o que abriu. |
| **Funções** | Nome + prompt + pasta. O agente nasce sabendo o papel dele em vez de nascer vazio. |
| **Bandas** | Grupos desenhados como moldura: quem está dentro fala com todos os de dentro. |
| **Partituras** | Times inteiros salvos — agentes, funções, recados, cordas, bandas — que sobem de uma vez num espaço novo, em qualquer projeto. |
| **Rotinas** | Um pedido digitado num cartão a cada X minutos, todo dia ou toda semana. Se o terminal estiver ocupado, parado numa pergunta ou encerrado, a rotina pula a vez em vez de escrever no meio do trabalho. |
| **Andares** | Cópias isoladas do repositório por `git worktree`, para dois times mexerem no mesmo projeto sem se atropelar. |
| **Árvores de código** | Os arquivos que o agente toca viram cartões ao lado dele, com o diff do git, agrupados por frente de trabalho. |
| **Várias janelas** | Cada espaço abre na sua janela, e o app reabre as que estavam abertas, onde estavam. |
| **O resto do quadro** | Post-its em `.md`, textos, anexos, navegador embutido, desenho à mão livre, desfazer de tudo, temas claro e escuro. |

## Baixar

**[Baixar o instalador →](https://github.com/luisgcazeredo/orkester/releases/latest)**

Um arquivo só, `Orkester-Instalador-1.0.1.exe` (119 MB). É só rodar: ele instala para o teu usuário — sem pedir
administrador — e põe o atalho **Orkester** na área de trabalho e no menu Iniciar. Precisa de **Windows 11
x64** e de mais nada.

Duas coisas para saber antes de rodar:

- **O Windows vai avisar.** O instalador não é assinado digitalmente, então o SmartScreen mostra "O Windows
  protegeu o computador". Clique em **Mais informações → Executar assim mesmo**. Se isso te incomodar — e é
  um incômodo justo —, compile você mesmo a partir do código; as instruções estão abaixo.
- **Os agentes não vêm junto.** O Orkester roda os terminais; `claude` e `codex` são ferramentas separadas,
  com contas próprias, instaladas por você. Sem nenhuma das duas, os cartões de PowerShell funcionam igual.

Os teus quadros ficam em `%USERPROFILE%\.orkester` — o quadro em JSON e os post-its em `.md`, legíveis fora
do app — e não são apagados ao desinstalar.

Histórico de versões: [CHANGELOG.md](CHANGELOG.md).

## Compilar do código

Precisa de **Node 24** e **Windows 11 x64**.

```powershell
git clone https://github.com/luisgcazeredo/orkester.git
cd orkester/app
npm install
npm run instalar   # gera o instalador e instala o app neste PC
```

Para desenvolver:

```powershell
npm run dev        # app com recarga automática
npm run provas     # testes dos módulos puros
npm run autoteste  # dirige o app de verdade com mouse e teclado, confere tudo e fecha (0 = passou)
```

## O comando `ork`

Dentro de qualquer terminal do quadro, o agente tem um comando próprio:

```text
ork quem                      quem é você e quem está ligado a você
ork abrir claude|codex|shell  sessão nova ao lado, já ligada
ork pedir <nome> "…"          manda um pedido e espera a resposta
ork ver <nome>                lê a tela dele sem mandar nada
ork banda criar "Nome" …      põe uma moldura em volta de agentes: todos se falam
ork partitura usar "Nome"     sobe um time salvo ao seu lado
```

São seis de cerca de vinte e cinco verbos. **A referência completa está em
[`docs/ork.pt-BR.md`](docs/ork.pt-BR.md).**

## Por dentro

Electron · React · TypeScript · xterm.js · node-pty.

O cálculo do quadro mora em módulos puros, cobertos por testes que rodam em Node sem abrir o app. Em cima
deles, o autoteste abre o app de verdade, monta um quadro, mexe com mouse e teclado e confere o resultado na
tela. Hoje: **126 provas** e **149 checagens** em 14 cenários.

```text
app/src/shared/    regras puras do quadro (bandas, partituras, trocar, rotinas, janelas, arquivos)
app/src/main/      processo principal: terminais, verbos do `ork`, dados em disco, autoteste
app/src/renderer/  o quadro em React
app/src/cli/       o comando `ork` que o agente chama
docs/              a referência do `ork`
```

## Estado

Versão **1.0.1**, lançada em 09/11/2026 e em uso diário no Windows. Só Windows 11 x64 — nada no código
impede outro sistema de propósito, mas nada foi testado fora dele.

## Licença

Ainda sem licença: o código está aqui para ser lido, não para ser reaproveitado. Se você quiser usar alguma
parte, abra uma issue e peça.

---

Projeto pessoal de [@luisgcazeredo](https://github.com/luisgcazeredo), feito para o uso dele. Não há promessa
de suporte nem de compatibilidade entre versões.
