# Páginas próprias ("+"): o guia de quem constrói

[English](paginas.md) · Português

[//]: # (Fontes: app/src/shared/paginas.ts, app/src/main/paginas.ts, app/src/preload/pagina.ts, app/src/preload/conferirDaPagina.ts, app/src/renderer/src/paginas/extra/*, app/exemplos/paginas/resumo-do-espaco/. Este arquivo aparece dentro do app em "+" → "Guia completo", pelo Markdown do Leitor, que mostra HTML cru como texto: nada de comentário HTML aqui, use esta forma.)

Uma **página própria** é uma pasta com uma tela web (HTML, CSS e JavaScript) que entra na barra da esquerda do
Orkester pelo botão **+** e abre ali dentro, ao lado das páginas do app. Ela pode mostrar os agentes do espaço ao
vivo, mandar recados a agentes que você ligou a ela, guardar dados próprios, falar com sites que ela declarar ou ler
um serviço do seu próprio PC, sempre só com o que você permitiu. Ela roda isolada: não lê seus arquivos, não abre
programas, não vê a tela dos terminais.

Este guia é o contrato inteiro: a linguagem, a pasta, o manifesto, a API `window.orkPagina`, as permissões, os
limites e o porquê deles, receitas prontas, como depurar e como pedir a um agente para criar uma.

> **Experimental.** A chave geral **Páginas próprias** vem desligada de fábrica.

## Índice

1. [O que dá para fazer](#o-que-dá-para-fazer)
2. [A linguagem: HTML, CSS e JavaScript puro](#a-linguagem-html-css-e-javascript-puro)
3. [Do zero até aparecer na barra](#do-zero-até-aparecer-na-barra)
4. [A pasta da página](#a-pasta-da-página)
5. [O manifesto, campo a campo](#o-manifesto-campo-a-campo)
6. [Permissões](#permissões)
7. [A API `window.orkPagina`](#a-api-windoworkpagina)
8. [Eventos](#eventos)
9. [Seguir o tema do app](#seguir-o-tema-do-app)
10. [Guardar dados](#guardar-dados)
11. [Rede, CORS e a origem `null`](#rede-cors-e-a-origem-null)
12. [Ler um serviço do seu PC (`local`)](#ler-um-serviço-do-seu-pc-local)
13. [Falar com um agente](#falar-com-um-agente)
14. [Todos os limites numa tabela](#todos-os-limites-numa-tabela)
15. [O que não dá, e por quê](#o-que-não-dá-e-por-quê)
16. [Receitas](#receitas)
17. [Depurar](#depurar)
18. [Atualizar, desligar e remover](#atualizar-desligar-e-remover)
19. [Pedir a um agente para criar](#pedir-a-um-agente-para-criar)
20. [Como o app isola a página](#como-o-app-isola-a-página)

## O que dá para fazer

Ideias que cabem no contrato:

- **Painel do time**: quem está livre, trabalhando ou parado numa pergunta, quantos recados esperam na fila de cada
  um, quem está ligado a quem (permissão `quadro`).
- **Botões que mandam pedidos prontos** a um agente ("rode a suíte", "resuma o dia") e mostram a resposta dele
  (permissão `recado`).
- **Checklists, notas, metas da semana, contadores**, guardados com a página (sem permissão nenhuma: todo mundo
  tem 1 MB de dados).
- **Mostrar dados de uma API pública ou sua** (status de deploy, issues abertas, cotação, clima), desde que o
  servidor aceite CORS (permissão `rede`).
- **Ler um serviço que roda no seu PC** (um servidor de desenvolvimento, um coletor de métricas), só leitura
  (permissão `local`).
- **Juntar as coisas acima**: um painel que mostra o time e manda um pedido ao agente certo.

O que **não** dá (ler arquivo, rodar comando, ver a tela dos terminais, abrir janela, baixar) está em
[O que não dá, e por quê](#o-que-não-dá-e-por-quê). Para essas coisas, a página pede a um agente com `recado`, e o
agente faz com as ferramentas dele.

## A linguagem: HTML, CSS e JavaScript puro

- **Sem build e sem servidor.** O Orkester serve os arquivos da pasta como estão: `index.html` é a entrada, e o
  resto você carrega por caminho relativo (`<script src="app.js">`, `<link rel="stylesheet" href="estilo.css">`,
  `<img src="img/logo.png">`).
- **JavaScript moderno do Chromium do Electron**: `async/await`, `fetch`, `class`, módulos ES
  (`<script type="module" src="app.js">` e `import './outro.js'` funcionam, e `.mjs` é aceito), `<canvas>`, SVG,
  `<dialog>`, CSS moderno (grid, variáveis, `:has()`).
- **Nada de script inline.** `<script>…</script>` dentro do HTML, `onclick="…"` e `javascript:` não rodam. Todo
  JavaScript vai em arquivo próprio, e eventos se ligam com `addEventListener`. `style="…"` inline pode.
- **Nada de `eval`**, `new Function` ou `setTimeout("texto")`: a política não tem `unsafe-eval`. Isso também barra
  WebAssembly.
- **Bibliotecas: só se o arquivo vier na pasta.** Não dá para carregar de CDN (o `script-src` aceita só a própria
  página). Baixe o arquivo pronto (o `.min.js` ou o módulo ES), ponha numa subpasta (`vendor/`) e carregue por caminho
  relativo. Antes, confira três coisas: (1) a biblioteca não usa `eval`/`new Function` (procure "CSP" na documentação
  dela; algumas têm uma versão "CSP-safe"), (2) não usa `localStorage`, cookies nem IndexedDB (dão erro aqui, veja
  [Guardar dados](#guardar-dados)), (3) não usa Web Worker (bloqueado). Biblioteca de gráfico que desenha em
  `<canvas>` ou SVG, utilitários de data e frameworks pequenos sem compilador de template em tempo de execução
  costumam servir.
- **TypeScript, JSX, Svelte, Vue com template**: compile antes, fora do Orkester, e ponha só a saída (`.js`, `.css`)
  na pasta. Tire os `.map`: essa extensão não é aceita e recusa a pasta inteira.
- **Fontes**: só `.woff2` da pasta ou `data:`. Sem Google Fonts por link. Use `var(--fonte-interface)` para seguir
  a fonte do app.
- **Várias telas**: links para outros `.html` da mesma pasta funcionam (`<a href="config.html">`) e a API continua
  disponível. Link para fora da pasta não navega.

## Do zero até aparecer na barra

1. **Ligue as páginas.** Na engrenagem (**Configurações**) › **Conexões** › aba **Páginas**, ligue **Ligar páginas próprias (experimental)**. O app
   avisa: "Páginas próprias rodam código de fora dentro do Orkester, isoladas do seu PC. Só adicione páginas que você
   ou seu time escreveram." (Clicar no **+** com a chave desligada também oferece **Ligar páginas**, com o mesmo
   aviso.)

2. **Crie a pasta** em qualquer lugar do seu disco, por exemplo `minhas-paginas/ola/`, com dois arquivos:

   `manifesto.json`

   ```json
   {
     "formato": 1,
     "id": "ola",
     "nome": "Olá",
     "versao": "1.0.0",
     "descricao": "Minha primeira página.",
     "icone": "lucide:Sparkles",
     "permissoes": { "quadro": true }
   }
   ```

   `index.html`

   ```html
   <!doctype html>
   <html lang="pt-BR">
   <head>
     <meta charset="utf-8">
     <link rel="stylesheet" href="estilo.css">
   </head>
   <body>
     <h1 id="titulo">Olá</h1>
     <ul id="agentes"></ul>
     <p id="situacao"></p>
     <script src="app.js"></script>
   </body>
   </html>
   ```

   `estilo.css`

   ```css
   body { margin: 0; padding: 16px; font-family: var(--fonte-interface, system-ui);
          background: var(--painel, #1b1d23); color: var(--texto, #e8e8ea); }
   ```

   `app.js`

   ```js
   const $ = (id) => document.getElementById(id)

   orkPagina.ao('tema', ({ tokens }) => {
     for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v)
   })

   function mostrar(resumo) {
     $('agentes').replaceChildren(...resumo.agentes.map((a) => {
       const li = document.createElement('li')
       li.textContent = `${a.nome} — ${a.situacao}`
       return li
     }))
   }

   async function iniciar() {
     const eu = await orkPagina.eu()
     $('titulo').textContent = `${eu.nome} · ${eu.espaco?.nome ?? 'sem espaço'}`
     mostrar(await orkPagina.quadro.resumo())
     orkPagina.ao('quadro', mostrar)
   }

   iniciar().catch((e) => { $('situacao').textContent = e.message })
   ```

3. **Adicione.** Clique no **+** na barra da esquerda → **Escolher pasta…** → escolha `ola/`. O app lê a pasta
   **sem executar nada** e mostra o diálogo de aceite: ícone, nome, versão, descrição, pasta de origem, quantos
   arquivos e quanto pesa, e cada permissão em português claro. Clique em **Adicionar e permitir**.
4. **Pronto.** O ícone aparece na barra da esquerda. Clique nele: a página abre dentro de uma moldura do app com o
   nome, a versão, **Ligar a agente…**, recarregar e o atalho para as permissões.
5. **Mudou o código?** Edite a pasta original e use **Atualizar da pasta** (em Configurações › Conexões › Páginas, no cartão da página). Veja
   [Atualizar, desligar e remover](#atualizar-desligar-e-remover).

Se o app recusar a pasta, o aviso diz qual arquivo e qual regra. As regras estão logo abaixo.

## A pasta da página

```text
minha-pagina/
  manifesto.json      obrigatório, na raiz
  index.html          obrigatório, na raiz: a entrada
  app.js  estilo.css  icone.svg  vendor/…  img/…
```

O app confere a pasta inteira antes de copiar ou carregar qualquer coisa. O primeiro problema recusa tudo e diz qual
arquivo.

| O quê | Regra |
|---|---|
| Arquivos | no máximo 200 |
| Tamanho total | no máximo 5 MB |
| Um arquivo | no máximo 2 MB (`manifesto.json`: 64 KB; ícone: 32 KB) |
| Profundidade | no máximo 4 pastas acima de um arquivo (`a/b/c/d/x.js` vale; `a/b/c/d/e/x.js` não) |
| Atalhos | nenhum: link simbólico ou junção em qualquer ponto recusa a pasta |
| Nomes | cada trecho do caminho com `A–Z a–z 0–9 . _ -`, até 64 caracteres, começando por letra ou número, sem terminar em `.`. Sem espaço, acento, `~` ou `%`. Nomes reservados do Windows (`CON`, `NUL`, `COM1`…, com qualquer extensão) são recusados. Arquivo começado por ponto (`.gitignore`, `.DS_Store`) também recusa a pasta |
| Extensões | `.html` `.js` `.mjs` `.css` `.json` `.svg` `.png` `.jpg` `.jpeg` `.webp` `.gif` `.woff2` `.txt` `.md`. Qualquer outra (`.map`, `.ts`, `.ttf`, `.ico`, `.wasm`, `.mp3`…) recusa a pasta |
| Páginas instaladas | no máximo 20 |

Na aceitação, o app **copia** a pasta para `~/.orkester/paginas/<id>/` (ou para a pasta de dados de `ORK_DADOS`, se
estiver definida) e serve a página dessa cópia, da memória, pelo endereço `ork-pagina://<id>/`. Use sempre caminho
relativo. Não há como alcançar um arquivo fora da pasta.

Dica: mantenha a pasta de **trabalho** (com `.git`, fontes TypeScript, testes) separada da pasta **da página**
(só o que vai ser servido). Uma pasta `dist/` ou `pagina/` dentro do projeto resolve.

## O manifesto, campo a campo

`manifesto.json` é estrito: chave desconhecida, tipo errado ou valor fora da regra recusa a pasta, dizendo o motivo.

```json
{
  "formato": 1,
  "id": "resumo-do-espaco",
  "nome": "Resumo do espaço",
  "versao": "1.0.0",
  "descricao": "Mostra os agentes do espaço e manda um recado ao ligado.",
  "icone": "icone.svg",
  "permissoes": { "quadro": true, "recado": true }
}
```

| Chave | Obrigatória | Regra |
|---|---|---|
| `formato` | sim | sempre `1` |
| `id` | sim | de 2 a 32 caracteres: `a–z`, `0–9` e `-`, começando por letra. É a identidade da página: a atualização, os dados guardados e as ligações dependem dele. Não mude depois de publicar |
| `nome` | sim | de 1 a 30 caracteres, sem espaço no começo ou no fim, sem aspas, crase, colchetes, `<` `>`, `\`, caracteres de controle ou invisíveis (largura zero, marcas de direção…) e sem espaço que não seja o comum. Aparece na barra, na moldura e no cabeçalho dos recados |
| `versao` | sim | `N.N.N`, só números (`1.0.0`, `2.13.4`) |
| `descricao` | não | até 200 caracteres. Aparece no aceite e em Configurações › Conexões |
| `icone` | não | `lucide:<Nome>` da lista abaixo, ou um `.svg`/`.png` da pasta de até 32 KB. Vazio: a inicial do nome. SVG é mostrado como imagem, então script dentro dele nunca roda |
| `permissoes` | não | objeto com `quadro`, `recado`, `rede`, `local` (veja [Permissões](#permissões)). Sem ele, a página não pede nada |

Ícones `lucide:` aceitos: `LayoutDashboard` `Gauge` `ListChecks` `ListTodo` `Kanban` `Calendar` `CalendarDays`
`Clock` `Timer` `Bell` `Inbox` `Mail` `MessageSquare` `MessagesSquare` `Notebook` `NotebookPen` `BookOpen` `FileText`
`Folder` `Database` `Server` `Globe` `ChartBar` `ChartLine` `ChartPie` `Activity` `Star` `Sparkles` `Rocket` `Zap`
`Wrench` `Users` `Bot` `Terminal` `Code` `Package` `Target` `Flag` `Compass` `Lightbulb` `Puzzle` `Palette`
`Newspaper` `House`.

## Permissões

A página começa sem nada. O manifesto **pede**; você aceita no diálogo (tudo ou nada: **Adicionar e permitir** ou
**Cancelar**); cada uma pode ser revogada depois.

| No manifesto | A página pode | Como aparece no aceite |
|---|---|---|
| `"quadro": true` | ler nome, motor, função, situação e tamanho da fila dos agentes **do espaço da janela**, e as cordas entre eles. Nunca a tela deles, caminhos, notas ou arquivos | ver nomes e situação dos agentes deste espaço (nada da tela deles, nada dos seus arquivos) |
| `"recado": true` | ver os agentes que **você** ligou a ela, mandar recados a eles e receber as respostas. Os agentes podem agir com base no que leem | mandar recados aos agentes que você ligar a ela — eles podem trabalhar a partir disso |
| `"rede": ["api.exemplo.com"]` | falar com esses hosts por `https` e `wss` (até 5) | falar com api.exemplo.com: o que ela mostra pode vir de lá e o que ela guarda pode ir para lá |
| `"local": { "porta": 7788, "caminhos": ["/api/dados"] }` | fazer `GET`, só leitura, em `http://127.0.0.1:<porta>` nesses caminhos (1 a 5), pelo app. **Aparece em vermelho** | ler 127.0.0.1:7788/api/dados… deste PC, só leitura |

Sempre, peça o que pedir: **1 MB de dados próprios**. Nunca: ler arquivos, abrir programas, câmera, microfone,
localização, notificações, área de transferência, USB, captura de tela, downloads, janelas novas.

**Regras de `rede`.** Nomes DNS exatos, em minúsculas, com pelo menos um ponto: sem `https://`, sem caminho, sem
porta, sem curinga (`*.x.com`), sem IP, sem `localhost`, e nada terminado em `.local` `.lan` `.internal` `.intranet`
`.home` `.corp` `.arpa` `.test` `.invalid` `.example`. Sem repetir. Subdomínio não vem junto: `api.x.com` não libera
`x.com`. Cada host é uma permissão própria (dá para revogar um só).

**Regras de `local`.** Uma porta só (1 a 65535). Caminhos começam por `/`, só com `A–Z a–z 0–9 . _ ~ -` e `/`, até
128 caracteres, sem `..` nem `//`. Ou exato (`/api/dados`) ou prefixo terminado em `/` (`/api/` libera tudo abaixo).
Aponte só para rotas que **não mudam nada**.

**`local` e `rede` não andam juntos.** Uma página que lê algo do seu PC não pode ter por onde mandar isso para a
internet. O manifesto com as duas é recusado.

### Quando o manifesto muda

A cada carga, o app compara a cópia com o que você aceitou:

- **Permissão ou host novo** (nem aceito, nem revogado) → a página não carrega. A moldura diz "Pede permissão nova: …"
  com **Rever**, e o diálogo mostra só a diferença.
- **Os arquivos da cópia são diferentes do aceito** (alguém mexeu em `~/.orkester/paginas/<id>/` por fora, agente
  inclusive) → a página não carrega: "A página mudou fora do Orkester", com **Rever**.
- **Pede menos** do que antes → carrega, e a lista de aceitas encolhe.
- **Permissão revogada** continua revogada: a página não a pede de novo a cada carga. Volta só com **Permitir de
  novo** em Configurações › Conexões.

Em Configurações › Conexões › Páginas, cada página lista as permissões com **Revogar** e **Permitir de novo**. Vale na próxima chamada (em
`rede`, a conexão é cortada na hora), e a página aberta é recarregada.

## A API `window.orkPagina`

É a única ponte entre a página e o app. Existe só no frame principal (um `<iframe>` da página não a recebe).

Toda chamada vai ao app, que confere **a cada chamada**: a chave geral, se a página está instalada, ligada e
conferida, e a permissão. Toda chamada devolve uma `Promise`. Falha = promessa rejeitada com um `Error` de mensagem
curta, em português, sem pilha (mostre `erro.message` na tela). No máximo **20 chamadas por segundo** somando tudo, e
no máximo **8 esperando resposta ao mesmo tempo** (a nona é recusada na hora: "chamadas demais esperando resposta").

### `eu()` — quem sou eu

Não precisa de permissão.

```js
const eu = await orkPagina.eu()
// {
//   id: 'resumo-do-espaco', nome: 'Resumo do espaço', versao: '1.0.0',
//   permissoes: ['quadro', 'recado'],          // o que vale AGORA (pedido, aceito e não revogado)
//   espaco: { id: '…', nome: 'Meu projeto' }   // o espaço da janela, ou null
// }
if (!eu.permissoes.includes('quadro')) mostrarAviso('Sem a permissão "quadro".')
```

As fichas em `permissoes` são `quadro`, `recado`, `rede:<host>` e `local:<porta><caminho>`. Use isso para esconder o
que a página não pode fazer, em vez de esperar o erro.

### `quadro.resumo()` — os agentes do espaço

Precisa de `quadro`. No máximo 2 por segundo (para acompanhar ao vivo, use o [evento `quadro`](#eventos)).

```js
const r = await orkPagina.quadro.resumo()
// {
//   espaco: { id, nome } | null,
//   agentes: [ { id, nome, motor, funcao?, situacao, fila }, … ],
//   cordas: [ [deId, paraId], … ]
// }
for (const a of r.agentes) console.log(a.nome, a.situacao, a.fila)
```

| Campo | O quê |
|---|---|
| `id` | id do cartão (o mesmo que `recado` espera) |
| `nome` | nome do cartão |
| `motor` | `claude`, `codex` ou `shell` |
| `funcao` | nome da função do agente, se tiver (ex.: `Maestro`) |
| `situacao` | `livre`, `trabalhando`, `pergunta` (parado num menu ou pergunta) ou `encerrado` |
| `fila` | quantos recados esperam na caixa de entrada dele |

`cordas` são os pares de agentes ligados entre si, só entre agentes da lista. O espaço é **o da janela em que a
página está aberta**: trocar de espaço na janela troca o resumo.

### `agentes()` — os agentes ligados a esta página

Precisa de `recado`. No máximo 2 por segundo. Devolve, no mesmo formato acima, só os agentes que **você ligou a esta
página neste espaço** e que estão vivos. É a lista de destinos possíveis de `recado`.

```js
const ligados = await orkPagina.agentes()
if (!ligados.length) mostrarAviso('Ligue um agente pelo botão "Ligar a agente…" no topo da página.')
```

Ligar e desligar um agente na moldura não dispara evento: se a página precisa acompanhar, consulte de tempos em
tempos (o exemplo consulta a cada 5 s).

### `recado(agenteId, texto)` — mandar um pedido a um agente

Precisa de `recado` **e** de uma ligação com aquele agente neste espaço.

```js
try {
  const { posicao } = await orkPagina.recado(ligados[0].id, 'Rode os testes e me diga quantos falharam.')
  mostrarAviso(`Na caixa do agente (posição ${posicao}).`)
} catch (e) {
  mostrarAviso(e.message) // ex.: "um recado por agente a cada 10 segundos"
}
```

- Texto de até 4 KB, não vazio.
- Só agente **Claude ou Codex**, e ele precisa estar rodando.
- No máximo **1 recado por agente a cada 10 s** e **30 por hora** por página.
- Devolve `{ posicao }`: o lugar na caixa de entrada do agente. O recado espera atrás dos pedidos pendentes e só
  chega quando o agente está livre.
- A resposta não volta pela promessa: chega depois, pelo evento `recado`. Veja
  [Falar com um agente](#falar-com-um-agente).

### `dados.ler / gravar / apagar / chaves` — guardar coisas

Não precisam de permissão. Detalhes em [Guardar dados](#guardar-dados).

```js
await orkPagina.dados.gravar('tarefas', [{ texto: 'Revisar PR', feito: false }])
const tarefas = (await orkPagina.dados.ler('tarefas')) ?? []   // null se não existe
const chaves = await orkPagina.dados.chaves()                   // ['tarefas', …]
await orkPagina.dados.apagar('tarefas')
```

### `local.ler(caminho)` — ler um serviço do seu PC

Precisa de `local`. No máximo 2 por segundo. Detalhes em [Ler um serviço do seu PC](#ler-um-serviço-do-seu-pc-local).

```js
const r = await orkPagina.local.ler('/api/dados?janela=24h')
// { status: 200, tipo: 'application/json', texto: '{"ok":true,…}' }
if (r.status === 200) mostrar(JSON.parse(r.texto))
```

### `ao(evento, fn)` — escutar

Assina um evento e devolve a função que cancela. Evento desconhecido **lança erro na hora** (não é promessa).

```js
const parar = orkPagina.ao('quadro', (resumo) => mostrar(resumo))
// …
parar()
```

### Mensagens de erro que você vai ver

| Mensagem | O que fazer |
|---|---|
| `a página não tem a permissão "quadro"` (ou `recado`, `local`) | peça no manifesto, ou a permissão foi revogada em Configurações › Conexões |
| `chamadas demais: espere um pouco` | passou de 20 por segundo; espace as chamadas |
| `quadro.resumo: no máximo 2 por segundo` (e parecidas) | use o evento em vez de consultar em laço |
| `chamadas demais esperando resposta: espere as anteriores` | mais de 8 em voo; espere com `await` |
| `este agente não está ligado à página` | ligue pelo **Ligar a agente…** da moldura, neste espaço |
| `o agente não está rodando` | o cartão foi encerrado; abra-o de novo |
| `recado só vai para agente Claude ou Codex` | terminal de shell não recebe recado |
| `um recado por agente a cada 10 segundos` / `no máximo 30 recados por hora` | limite de taxa |
| `o recado está vazio` / `o recado passa de 4 KB` | ajuste o texto |
| `chave inválida: …` / `o valor passa de 256 KB` / `os dados da página passariam de 1 MB` | veja Guardar dados |
| `o caminho "…" não está entre os aceitos` | o caminho de `local.ler` não está no manifesto |
| `o serviço local não respondeu em 5 s` | o serviço está parado ou lento |
| `a página precisa ser revista` / `a página está desligada` | resolva em Configurações › Conexões (Rever, Religar) |

## Eventos

| Evento | Quando chega | `fn` recebe | Precisa |
|---|---|---|---|
| `'quadro'` | quando o resumo muda (o app confere a cada segundo e só manda se mudou, inclusive ao trocar de espaço) | o mesmo objeto de `quadro.resumo()` | `quadro` |
| `'recado'` | um agente respondeu com `ork pagina responder` | `{ de: { id, nome }, texto, em }` (`em` = milissegundos desde 1970) | `recado` |
| `'tema'` | ao assinar (assim que a janela tiver mandado as cores) e a cada mudança de tema | `{ tokens: { '--texto': '…', … } }` | nada |

Assinar `'quadro'` não manda o estado atual na hora: chame `quadro.resumo()` uma vez no começo e depois escute.
Assinar `'recado'` entrega as respostas que chegaram enquanto a página estava fechada.

## Seguir o tema do app

O evento `tema` traz 20 variáveis CSS do tema em uso (Escuro, Claro, OLED, a cor de destaque e os temas do usuário):

| Token | Para quê |
|---|---|
| `--texto` `--texto-suave` `--texto-sobre-destaque` | cor de texto normal, secundário e sobre a cor de destaque |
| `--painel` `--painel-alto` `--quadro-fundo` | fundos (painel, painel elevado, fundo do quadro) |
| `--borda` `--borda-suave` `--hover` | bordas e realce ao passar o mouse |
| `--destaque` `--destaque-forte` `--destaque-claro` | a cor de destaque e variações |
| `--perigo` `--atencao` `--vivo` | vermelho, amarelo, verde de estado |
| `--fonte-interface` `--fonte-mono` | fontes |
| `--raio` `--raio-pequeno` `--raio-grande` | arredondamento dos cantos |

Aplique no `:root` e escreva o CSS com valor de reserva, que aparece até o primeiro evento chegar (e num navegador
comum, fora do app):

```js
orkPagina.ao('tema', ({ tokens }) => {
  for (const [nome, valor] of Object.entries(tokens)) {
    if (nome.startsWith('--')) document.documentElement.style.setProperty(nome, valor)
  }
})
```

```css
body   { background: var(--painel, #1b1d23); color: var(--texto, #e8e8ea);
         font-family: var(--fonte-interface, system-ui, sans-serif); }
button { background: var(--destaque, #4060e8); color: var(--texto-sobre-destaque, #fff);
         border: 0; border-radius: var(--raio, 8px); }
.suave { color: var(--texto-suave, #9a9ca5); }
```

## Guardar dados

`orkPagina.dados` é o armazenamento da página. Não precisa de permissão.

- **Chave**: de 1 a 64 caracteres, `a–z 0–9 . _ -`, começando por letra ou número. **Só minúsculas**:
  `minhaNota` é recusada; use `minha-nota`.
- **Valor**: qualquer coisa que o JSON represente (texto, número, booleano, `null`, lista, objeto), até 256 KB por
  chave. O valor passa por JSON ida e volta: `Date` vira texto, `Map`/`Set`/função somem. `undefined` é recusado.
- **Total**: até 1 MB e 200 chaves por página.
- **Taxa**: até 10 gravações ou apagamentos por segundo.
- `ler` de chave que não existe devolve `null`.
- **Onde fica**: `~/.orkester/paginas-dados/<id>.json`, fora da pasta servida. A gravação vale na hora para `ler`
  e vai ao disco depois, em segundo plano (no mínimo 2 s entre duas escritas, o último valor ganha); ao fechar a
  página e ao sair do app vai na hora. Se o app cair, perde no máximo o que esperava a vez.
- **Por página, não por espaço.** Se quiser separar por espaço, ponha o id do espaço na chave:
  `` `notas.${eu.espaco.id}` `` (o id só tem letras, números e hífen).
- `localStorage`, `sessionStorage`, IndexedDB e cookies **não funcionam** (dão `SecurityError`): a página roda com
  origem opaca. Veja [Como o app isola a página](#como-o-app-isola-a-página).
- **Remover** a página apaga os dados dela. Atualizar não apaga.

Para gravar enquanto a pessoa digita, espere ela parar (o exemplo espera 600 ms):

```js
let espera
campo.addEventListener('input', () => {
  clearTimeout(espera)
  espera = setTimeout(() => orkPagina.dados.gravar('nota', campo.value).catch(mostrarErro), 600)
})
```

## Rede, CORS e a origem `null`

Com `rede`, a página usa `fetch`, `WebSocket` (`wss://`) e `<img src="https://…">` para os hosts aceitos, como um site
chama outro. Três coisas para saber:

1. **Só `https` e `wss`, na porta padrão, sem usuário e senha na URL.** `http:`, IP, outra porta e qualquer host fora
   da lista são cancelados antes de sair (o erro é genérico: `TypeError: Failed to fetch`).
2. **A origem da página é `null`.** O pedido sai com `Origin: null`. O servidor precisa responder com CORS aceitando
   isso: `Access-Control-Allow-Origin: *` (ou `null`) e, para pedidos com cabeçalhos próprios ou métodos diferentes
   de `GET`/`POST` simples, responder o preflight `OPTIONS`. Devolver `ork-pagina://<id>` **não** funciona. Muitas
   APIs públicas já mandam `*`; a sua, você configura.
3. **O app não faz proxy** nem afrouxa isso. Se a chamada falha com erro de rede numa página que tem a permissão, olhe
   primeiro o CORS do servidor (abra a mesma URL no navegador com o DevTools e veja os cabeçalhos).

**Chaves de API.** Tudo o que está na pasta é legível por quem tem a pasta. Não ponha segredo nos arquivos. Se a API
precisa de chave, peça-a na tela e guarde em `orkPagina.dados` (fica só neste PC, em
`~/.orkester/paginas-dados/<id>.json`, em texto), ou use um serviço seu que guarde a chave do lado dele.

Cookies não são guardados (origem opaca, armazenamento só em memória), então login por cookie em outro site não
funciona: use token no cabeçalho `Authorization`.

## Ler um serviço do seu PC (`local`)

Para o que roda na sua máquina (um servidor de desenvolvimento, um coletor de métricas, um script seu), a página não
fala direto: ela pede ao app, que faz um `GET http://127.0.0.1:<porta><caminho>` e devolve o texto.

```json
"permissoes": { "local": { "porta": 7788, "caminhos": ["/api/status", "/api/metricas/"] } }
```

```js
const r = await orkPagina.local.ler('/api/metricas/cpu?ultimos=60')
// { status, tipo, texto }
```

- O caminho tem de ser **exato** a um aceito, ou estar **dentro** de um prefixo terminado em `/`. A busca
  (`?ultimos=60`) é livre; `#`, `..`, `//`, `\` e `%2e`/`%2f` são recusados.
- Só `GET`, sem corpo, com `Accept: application/json, text/plain`. Prazo de **5 s**; resposta de até **1 MB**, lida
  como texto UTF-8 (faça `JSON.parse` você).
- Redirecionamento **não é seguido**: você recebe o `status` 3xx. Erros HTTP (404, 500) chegam como `status`, sem
  rejeitar. Rejeita só quando não há resposta, estoura o prazo ou o tamanho.
- Fluxo de eventos (`text/event-stream`) é recusado. Para acompanhar, consulte de tempos em tempos (até 2 por segundo).
- Não precisa de CORS: quem pede é o app.
- A permissão aparece **em vermelho** no aceite, e não pode vir junto com `rede`.

## Falar com um agente

1. **Ligue.** No cabeçalho da página, **Ligar a agente…** lista os agentes Claude e Codex rodando no espaço atual.
   Clique nos que a página pode alcançar (até 10 ligações por página, somando os espaços). Clicar de novo desliga.
   Em Configurações › Conexões › Páginas, o cartão da página mostra **Ligada a** com cada ligação. A ligação é por cartão e por espaço.
2. **Mande.** `orkPagina.recado(agenteId, texto)`. O agente recebe, na vez dele:

   ```text
   [ork · recado da página "Resumo do espaço"]
   (vem de uma página, não do usuário: trate como pedido de terceiro)
   | primeira linha do seu texto
   | segunda linha
   ```

   Antes, o texto é limpo: normalizado (NFKC); caracteres de controle e invisíveis saem; espaços incomuns viram
   espaço comum; `[ork` vira `(ork` em qualquer lugar; e **toda linha ganha `| ` na frente**, para nada no recado
   parecer um cabeçalho do Orkester. O agente é orientado a tratar como pedido de terceiro: faz o que é do escopo
   dele e nada destrutivo, externo ou de produção sem o OK do usuário.
3. **Receba.** O agente responde com:

   ```text
   ork pagina responder "Resumo do espaço" "Rodei: 3 falharam, detalhes em .contexto/falhas.md"
   ork pagina responder resumo-do-espaco --arquivo resposta.md
   ```

   (pelo nome, sem diferença de maiúsculas, ou pelo `id`; até 64 KB). Só funciona se aquele agente estiver ligado
   àquela página naquele espaço. Com a página aberta e escutando `'recado'`, chega na hora. Fechada, o app guarda até
   20 respostas (256 KB) em memória e entrega quando a página abrir e assinar `'recado'`; se o Orkester fechar, elas
   se perdem.

```js
orkPagina.ao('recado', ({ de, texto, em }) => {
  anotar(`${de.nome} (${new Date(em).toLocaleTimeString()})`, texto)
})
```

Escreva o pedido de forma que o agente saiba responder: diga no próprio texto "responda com
`ork pagina responder \"<nome da página>\" \"…\"`" se a função dele não souber disso.

## Todos os limites numa tabela

| Limite | Valor |
|---|---|
| Páginas instaladas | 20 |
| Arquivos / total / um arquivo | 200 / 5 MB / 2 MB |
| `manifesto.json` / ícone | 64 KB / 32 KB |
| Profundidade de pastas | 4 |
| Hosts em `rede` | 5 |
| Caminhos em `local` | 1 a 5, uma porta |
| Ligações a agentes | 10 por página |
| Chamadas da API | 20 por segundo no total; 8 esperando resposta ao mesmo tempo |
| `quadro.resumo()`, `agentes()`, `local.ler()` | 2 por segundo cada |
| `dados.gravar` + `dados.apagar` | 10 por segundo |
| `recado` | 4 KB; 1 por agente a cada 10 s; 30 por hora |
| Resposta de agente | 64 KB; até 20 guardadas (256 KB) com a página fechada |
| Dados | 256 KB por chave; 1 MB e 200 chaves no total |
| `local.ler` | 5 s; 1 MB de resposta |
| Memória da página | 400 MB (acima disso, é fechada) |
| CPU | acima de 90% por 30 s, é fechada |
| Travada | sem responder por 5 s, é fechada |
| Quedas | 3 em 10 minutos desligam a página até você religar |
| Proposta de aceite | vale 10 minutos |

## O que não dá, e por quê

| Não dá | Por quê |
|---|---|
| Ler ou gravar arquivos do PC, rodar comandos | a página é código de fora; o PC fica fora do alcance. Peça a um agente com `recado` |
| Ver a tela ou o histórico dos terminais | pode ter segredo, caminho e código. O resumo do quadro dá só nome e situação |
| `<script>` inline, `onclick=""`, `eval`, `new Function` | é o que injeção de código usa; a política aceita só os arquivos da pasta |
| Carregar script ou fonte de CDN | o que roda é o que você aceitou no diálogo, conferido por hash; um script de fora mudaria sem você ver |
| `localStorage`, IndexedDB, cookies | a página roda com origem opaca (isso fecha o caminho para o WebRTC e para iframes). O armazenamento é `orkPagina.dados` |
| Web Worker, Service Worker, WebAssembly | `worker-src 'none'` e sem `unsafe-eval` |
| `<iframe>` com conteúdo, `window.open`, `target="_blank"`, navegar para fora da pasta | uma página não pode carregar outra coisa no lugar dela nem abrir janelas |
| Downloads, `alert`/`confirm`/`prompt` | downloads são cancelados e diálogos do navegador estão desligados. Use `<dialog>` |
| Enviar formulário | o `submit` dispara para o seu script (chame `preventDefault()`), mas nunca envia |
| Câmera, microfone, localização, notificações, área de transferência, USB, Bluetooth, tela cheia | todos os pedidos de permissão do navegador são negados |
| WebRTC | passaria por fora das regras de rede; as interfaces `RTC…` são tiradas antes do seu script rodar |
| `http:`, IP, `localhost` direto | só `https`/`wss` para hosts declarados; para o seu PC use `local`, que passa pelo app |
| `rede` e `local` juntos | o que a página lê do seu PC não pode ter por onde sair |
| Agente instalar ou aceitar a página | só você adiciona e aceita, pelo diálogo nativo do app |

## Receitas

Cada receita é uma pasta completa: `manifesto.json`, `index.html` (só estrutura, carregando `estilo.css` e
`app.js`) e `app.js`. O `estilo.css` pode ser o do passo a passo acima. Em todas, o que vem do app entra na tela por
`textContent`, nunca por `innerHTML`.

### 1. Painel do time (permissão `quadro`)

Mostra cada agente com a situação, a fila e contadores por situação, ao vivo.

```json
{ "formato": 1, "id": "painel-do-time", "nome": "Painel do time", "versao": "1.0.0",
  "icone": "lucide:Users", "permissoes": { "quadro": true } }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <h1 id="espaco">…</h1>
  <p id="contagem" class="suave"></p>
  <table><thead><tr><th>Agente</th><th>Motor</th><th>Função</th><th>Situação</th><th>Fila</th></tr></thead>
    <tbody id="linhas"></tbody></table>
  <p id="erro"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)
const NOMES = { livre: 'livre', trabalhando: 'trabalhando', pergunta: 'esperando resposta', encerrado: 'encerrado' }

function celula(texto) { const td = document.createElement('td'); td.textContent = texto; return td }

function mostrar({ espaco, agentes }) {
  $('espaco').textContent = espaco ? espaco.nome : 'Sem espaço aberto'
  const conta = {}
  for (const a of agentes) conta[a.situacao] = (conta[a.situacao] ?? 0) + 1
  $('contagem').textContent = Object.entries(conta).map(([s, n]) => `${n} ${NOMES[s] ?? s}`).join(' · ') || 'Nenhum agente'
  $('linhas').replaceChildren(...agentes.map((a) => {
    const tr = document.createElement('tr')
    tr.dataset.situacao = a.situacao
    tr.append(celula(a.nome), celula(a.motor), celula(a.funcao ?? '—'), celula(NOMES[a.situacao] ?? a.situacao), celula(String(a.fila)))
    return tr
  }))
}

orkPagina.ao('tema', ({ tokens }) => Object.entries(tokens).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)))
orkPagina.quadro.resumo().then(mostrar).catch((e) => { $('erro').textContent = e.message })
orkPagina.ao('quadro', mostrar)
```

```css
tr[data-situacao="trabalhando"] td:nth-child(4) { color: var(--vivo, #3fb950); }
tr[data-situacao="pergunta"]    td:nth-child(4) { color: var(--atencao, #d29922); }
tr[data-situacao="encerrado"]   td:nth-child(4) { color: var(--texto-suave, #9a9ca5); }
```

### 2. Checklist com dados (sem permissão)

```json
{ "formato": 1, "id": "checklist", "nome": "Checklist", "versao": "1.0.0", "icone": "lucide:ListChecks" }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <form id="nova"><input id="texto" placeholder="Nova tarefa" maxlength="200"><button>Adicionar</button></form>
  <ul id="lista"></ul>
  <p id="erro"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)
let itens = []

async function salvar() {
  try { await orkPagina.dados.gravar('itens', itens) } catch (e) { $('erro').textContent = e.message }
}

function desenhar() {
  $('lista').replaceChildren(...itens.map((item, i) => {
    const li = document.createElement('li')
    const caixa = document.createElement('input')
    caixa.type = 'checkbox'
    caixa.checked = item.feito
    caixa.addEventListener('change', () => { item.feito = caixa.checked; salvar() })
    const texto = document.createElement('span')
    texto.textContent = item.texto
    const apagar = document.createElement('button')
    apagar.textContent = '×'
    apagar.addEventListener('click', () => { itens.splice(i, 1); desenhar(); salvar() })
    li.append(caixa, texto, apagar)
    return li
  }))
}

$('nova').addEventListener('submit', (ev) => {
  ev.preventDefault() // o formulário nunca envia; sem isto, nada acontece
  const texto = $('texto').value.trim()
  if (!texto) return
  itens.push({ texto, feito: false })
  $('texto').value = ''
  desenhar()
  salvar()
})

orkPagina.dados.ler('itens').then((v) => { itens = Array.isArray(v) ? v : []; desenhar() })
```

### 3. Página que lê uma API (permissão `rede`)

As últimas versões de um repositório público do GitHub. A API do GitHub responde com
`Access-Control-Allow-Origin: *`, então aceita a origem `null`. Sem chave, o GitHub limita a 60 consultas por hora
por IP: consulte ao abrir, não em laço.

```json
{ "formato": 1, "id": "versoes", "nome": "Versões", "versao": "1.0.0", "icone": "lucide:Package",
  "permissoes": { "rede": ["api.github.com"] } }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <form id="busca"><input id="repo" placeholder="dono/repositorio"><button>Ver</button></form>
  <ol id="versoes"></ol>
  <p id="erro"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)

async function carregar(repo) {
  $('erro').textContent = ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return void ($('erro').textContent = 'Use dono/repositorio')
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`)
    const versoes = await r.json()
    $('versoes').replaceChildren(...versoes.map((v) => {
      const li = document.createElement('li')
      li.textContent = `${v.tag_name} — ${new Date(v.published_at).toLocaleDateString('pt-BR')}`
      return li
    }))
    await orkPagina.dados.gravar('repo', repo)
  } catch (e) {
    $('erro').textContent = e.message // "Failed to fetch" = host fora de "rede" ou CORS do servidor
  }
}

$('busca').addEventListener('submit', (ev) => { ev.preventDefault(); carregar($('repo').value.trim()) })
orkPagina.dados.ler('repo').then((repo) => { if (repo) { $('repo').value = repo; carregar(repo) } })
```

### 4. Página que conversa com um agente (permissão `recado`)

Botões com pedidos prontos e a conversa embaixo. Antes de usar, ligue um agente pelo **Ligar a agente…**.

```json
{ "formato": 1, "id": "pedidos-prontos", "nome": "Pedidos prontos", "versao": "1.0.0",
  "icone": "lucide:MessagesSquare", "permissoes": { "recado": true } }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <label>Agente <select id="destino"></select></label>
  <div id="botoes">
    <button data-pedido="Rode a suíte de testes e responda só quantos passaram e quantos falharam.">Rodar testes</button>
    <button data-pedido="Resuma em 5 linhas o que você fez hoje.">Resumo do dia</button>
  </div>
  <ol id="conversa"></ol>
  <p id="aviso"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)
const COMO_RESPONDER = '\n\nResponda com: ork pagina responder "Pedidos prontos" "<sua resposta>"'

function anotar(quem, texto) {
  const li = document.createElement('li')
  const b = document.createElement('strong')
  b.textContent = quem
  const p = document.createElement('p')
  p.textContent = texto
  li.append(b, p)
  $('conversa').append(li)
}

async function atualizarDestinos() {
  try {
    const ligados = await orkPagina.agentes()
    const atual = $('destino').value
    $('destino').replaceChildren(...ligados.map((a) => Object.assign(document.createElement('option'), { value: a.id, textContent: `${a.nome} (${a.situacao})` })))
    if (ligados.some((a) => a.id === atual)) $('destino').value = atual
    $('aviso').textContent = ligados.length ? '' : 'Ligue um agente pelo botão "Ligar a agente…" no topo.'
  } catch (e) {
    $('aviso').textContent = e.message
  }
}

$('botoes').addEventListener('click', async (ev) => {
  const pedido = ev.target.closest('button')?.dataset.pedido
  const para = $('destino').value
  if (!pedido || !para) return
  try {
    const { posicao } = await orkPagina.recado(para, pedido + COMO_RESPONDER)
    anotar('Você', pedido)
    $('aviso').textContent = `Na caixa do agente, posição ${posicao}.`
  } catch (e) {
    $('aviso').textContent = e.message
  }
})

orkPagina.ao('recado', ({ de, texto }) => anotar(de.nome, texto))
atualizarDestinos()
setInterval(atualizarDestinos, 5000) // ligar/desligar na moldura não gera evento
```

### 5. Página que lê um servidor local, só leitura (permissão `local`)

Um serviço seu em `127.0.0.1:7788` que responde `GET /api/status` com JSON
(`{ "fila": 3, "ultimoErro": null }`). A página consulta a cada 5 s.

```json
{ "formato": 1, "id": "status-local", "nome": "Status local", "versao": "1.0.0", "icone": "lucide:Server",
  "permissoes": { "local": { "porta": 7788, "caminhos": ["/api/status"] } } }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <h1>Status local</h1>
  <dl><dt>Fila</dt><dd id="fila">—</dd><dt>Último erro</dt><dd id="ultimo-erro">—</dd></dl>
  <p id="aviso" class="suave"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)

async function consultar() {
  try {
    const r = await orkPagina.local.ler('/api/status')
    if (r.status !== 200) throw new Error(`o serviço respondeu ${r.status}`)
    const dados = JSON.parse(r.texto)
    $('fila').textContent = String(dados.fila)
    $('ultimo-erro').textContent = dados.ultimoErro ?? 'nenhum'
    $('aviso').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`
  } catch (e) {
    $('aviso').textContent = e.message // "o serviço local não respondeu" = ele está parado
  }
}

consultar()
setInterval(consultar, 5000)
```

Do lado do serviço, não precisa de CORS (quem pede é o app). Faça a rota só ler: a permissão promete "só leitura" a
quem aceita.

### 6. Painel que delega ao agente certo (permissões `quadro` e `recado`)

Junta as receitas 1 e 4: mostra o time e, ao clicar num agente **ligado** e livre, manda um pedido.

```json
{ "formato": 1, "id": "delegar", "nome": "Delegar", "versao": "1.0.0", "icone": "lucide:Target",
  "permissoes": { "quadro": true, "recado": true } }
```

```html
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="estilo.css"></head>
<body>
  <textarea id="pedido" rows="3" maxlength="2000" placeholder="O que fazer?"></textarea>
  <ul id="agentes"></ul>
  <p id="aviso"></p>
  <script src="app.js"></script>
</body></html>
```

```js
const $ = (id) => document.getElementById(id)
let ligados = new Set()

async function lerLigados() {
  try { ligados = new Set((await orkPagina.agentes()).map((a) => a.id)) } catch { ligados = new Set() }
}

function mostrar({ agentes }) {
  $('agentes').replaceChildren(...agentes.map((a) => {
    const li = document.createElement('li')
    const botao = document.createElement('button')
    botao.textContent = `${a.nome} · ${a.situacao}${a.fila ? ` · ${a.fila} na fila` : ''}`
    botao.disabled = !ligados.has(a.id) || a.situacao === 'encerrado'
    botao.title = ligados.has(a.id) ? 'Mandar o pedido' : 'Não ligado a esta página'
    botao.addEventListener('click', async () => {
      const texto = $('pedido').value.trim()
      if (!texto) return
      try {
        const { posicao } = await orkPagina.recado(a.id, texto)
        $('aviso').textContent = `Mandado a ${a.nome} (posição ${posicao}).`
        $('pedido').value = ''
      } catch (e) {
        $('aviso').textContent = e.message
      }
    })
    li.append(botao)
    return li
  }))
}

async function iniciar() {
  await lerLigados()
  let ultimo = await orkPagina.quadro.resumo()
  mostrar(ultimo)
  orkPagina.ao('quadro', (r) => { ultimo = r; mostrar(r) })
  setInterval(async () => { await lerLigados(); mostrar(ultimo) }, 5000)
}

iniciar().catch((e) => { $('aviso').textContent = e.message })
```

## Depurar

Não há DevTools para as páginas: o app não tem menu nem atalho que o abra, e `console.log` não aparece em lugar
nenhum. O que funciona:

- **Mostre os erros na própria página.** Toda chamada que falha rejeita com uma mensagem legível. Tenha uma linha de
  status (`<p id="situacao" role="status">`) e escreva `erro.message` nela, como o exemplo faz. Para pegar o que
  escapa:

  ```js
  window.addEventListener('error', (e) => { $('situacao').textContent = `Erro: ${e.message}` })
  window.addEventListener('unhandledrejection', (e) => { $('situacao').textContent = `Erro: ${e.reason?.message ?? e.reason}` })
  ```

- **Monte o layout num navegador comum** com um `orkPagina` de mentira, e só depois teste no Orkester, onde valem as
  permissões e a política de verdade. Ponha isto num `falso-ork.js` carregado antes do `app.js` (no Orkester ele não
  substitui nada, porque `orkPagina` já existe; mesmo assim, tire antes de entregar):

  ```js
  // falso-ork.js: só para o navegador comum
  if (!window.orkPagina) {
    const dados = new Map()
    window.orkPagina = {
      eu: async () => ({ id: 'teste', nome: 'Teste', versao: '0.0.0', permissoes: ['quadro', 'recado'], espaco: { id: 'e1', nome: 'Espaço de teste' } }),
      quadro: { resumo: async () => ({ espaco: { id: 'e1', nome: 'Espaço de teste' }, cordas: [],
        agentes: [{ id: 'a1', nome: 'Maestro', motor: 'claude', funcao: 'Maestro', situacao: 'livre', fila: 0 },
                  { id: 'a2', nome: 'Revisor', motor: 'codex', situacao: 'trabalhando', fila: 2 }] }) },
      agentes: async () => [{ id: 'a1', nome: 'Maestro', motor: 'claude', situacao: 'livre', fila: 0 }],
      recado: async () => ({ posicao: 1 }),
      dados: { ler: async (k) => dados.get(k) ?? null, gravar: async (k, v) => void dados.set(k, v),
               apagar: async (k) => void dados.delete(k), chaves: async () => [...dados.keys()] },
      local: { ler: async () => ({ status: 200, tipo: 'application/json', texto: '{}' }) },
      ao: () => () => {}
    }
  }
  ```

  No navegador comum não há a política do Orkester: um `<script>` inline que funciona lá **não** roda no app. Se usar
  módulos ES, abra a pasta por um servidor estático qualquer (módulos não carregam por `file://`).
- **Quando nada acontece**, confira nesta ordem: script inline (não roda), host fora de `rede` ou CORS do servidor
  (erro de rede genérico), permissão revogada em Configurações › Conexões, chave de dados com maiúscula, formulário sem
  `preventDefault()`.
- **Página fechada pelo app** ("travou", "estourou memória", "usou CPU demais", "caiu sozinha"): procure laço
  infinito, `setInterval` curto demais ou lista que só cresce. A moldura oferece **Recarregar**; Configurações › Conexões mostra a
  última queda.

## Atualizar, desligar e remover

Tudo no cartão da página, em **Configurações** › **Conexões** › aba **Páginas**:

- **Atualizar da pasta**: relê a pasta de onde a página veio e mostra o que mudou. Se a versão nova não pede
  permissão nova, é aplicada na hora e as páginas abertas recarregam; senão, o diálogo mostra só as novas. O mesmo
  `id` vindo da mesma pasta é atualização; vindo de outra pasta é recusado ("remova-a antes"). Mudar o `id` no
  manifesto e atualizar também é recusado. Subir a `versao` não é obrigatório, mas ajuda (o diálogo mostra
  "Versão 1.0.0 → 1.1.0").
- **Edite sempre a pasta original.** Mexer na cópia (`~/.orkester/paginas/<id>/`) faz a página "mudar fora do
  Orkester" e ela só volta com **Rever**.
- **Desligar / Religar**: tira da barra e para de carregar, sem apagar nada.
- **Remover** (com confirmação): apaga a cópia, os dados, o estado do navegador e as ligações. A pasta original não
  é tocada.
- **Revogar / Permitir de novo**: por permissão, na lista **Permissões** do cartão.
- Desligar a chave geral tira todas as páginas da barra na hora; nada carrega até ligar de novo.

A página **descarrega ao sair dela**: clicar em outra página da barra fecha a sua, e voltar carrega do zero. O que
precisa durar vai em `orkPagina.dados`.

A lista de páginas e o que você aceitou ficam em `~/.orkester/paginas.json`. Se ele foi escrito por uma versão mais
nova do Orkester, fica intacto e todas as páginas ficam desligadas até você atualizar o app.

## Pedir a um agente para criar

**Pelo +.** Clique no **+** → **Pedir a um agente para criar**, descreva a página e clique em **Pedir ao Maestro**.
Vira uma demanda "Criar página: …" no Kanban do espaço, com as instruções de entrega (pasta, manifesto, este guia, e
que o agente não instala nada), movida para **Com o Maestro**. Sem Maestro aberto no espaço, ela fica em Demandas, e
você arrasta para **Com o Maestro** quando abrir um. Quando o agente disser o caminho da pasta, volte ao **+** →
**Escolher pasta…**.

**Direto num terminal.** Num cartão Claude ou Codex, peça algo assim:

```text
Crie uma página "+" do Orkester na pasta paginas/metas/ deste projeto, seguindo o guia
docs/paginas.md do repositório do Orkester (contrato completo da API window.orkPagina).
A página: metas da semana, com caixa de marcar, guardadas em orkPagina.dados; peça só
as permissões que usar. Regras: manifesto.json e index.html na raiz; JS e CSS em arquivos
próprios (script inline não roda); nada de CDN, eval, localStorage ou innerHTML com dado
de fora; só extensões aceitas. Não instale nem aceite a página: me diga o caminho da pasta.
```

O agente não consegue adicionar nem aceitar a página: isso é só seu, pelo diálogo do app. Se ele mexer na cópia já
instalada, a página para de carregar até você **Rever**.

## Como o app isola a página

Para quem quer saber o que acontece por baixo:

- **Processo próprio, nada guardado.** Cada página roda num `<webview>` com partição própria só em memória,
  `sandbox` e `contextIsolation` ligados e Node desligado. A única ponte é `window.orkPagina`. Ao sair da página, o
  estado do navegador dela é apagado.
- **Origem opaca.** A política inclui `sandbox allow-scripts allow-forms` (sem `allow-same-origin`), então
  `self.origin` é `"null"`, `localStorage`/IndexedDB/cookies dão `SecurityError` e todo iframe que a página criar
  ganha outra origem, fora do alcance dela. Os arquivos da própria página continuam carregando porque o app responde
  com `Access-Control-Allow-Origin: *`.
- **Servida da memória.** Na carga, o app lê a cópia uma vez, confere com o hash aceito e serve dessa leitura. Truque
  de caminho (`..`, `%2f`, `\`, `//`, `:`) dá 404. Só `GET`.
- **Política fixa em toda resposta** (um `<meta>` de CSP no seu HTML só aperta, nunca afrouxa). Com `ORIGEM` =
  `ork-pagina://<id>` e os hosts aceitos como `R`:

  ```text
  default-src 'none'; script-src ORIGEM; style-src ORIGEM 'unsafe-inline';
  img-src ORIGEM data: blob: https://R; font-src ORIGEM data:;
  connect-src ORIGEM https://R wss://R; media-src ORIGEM blob:;
  worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none';
  base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-forms
  ```

  Mais `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` e uma
  `Permissions-Policy` que nega câmera, microfone, geolocalização, USB, serial, HID, Bluetooth, área de transferência,
  captura de tela, pagamento e tela cheia.
- **Rede filtrada fora da página também**, em todo pedido: só o endereço da própria página, `https`/`wss` para os
  hosts aceitos (porta padrão, sem usuário e senha) e `data:`/`blob:`. Revogar `rede` corta na hora.
- **Sem WebRTC e sem dica de DNS.** As interfaces `RTC…` são tiradas de todo frame antes de qualquer script da página,
  o UDP fica desligado para ela e o DNS prefetch fica desligado no app.
- **Nenhuma permissão do Chromium**, downloads cancelados, `window.open` negado, navegação só dentro de
  `ork-pagina://<id>/`, `alert`/`confirm`/`prompt` desligados, `beforeunload` ignorado.
- **Canais internos fechados.** O app recusa toda chamada interna que não venha de uma janela dele, e a API da página
  só atende o frame principal.
- **Vigia.** A cada 5 s o app confere cada página aberta: sem responder a uma sonda por 5 s ("travou"), memória acima
  de 400 MB, CPU acima de 90% por 30 s, ou queda do processo → a página é fechada e o app segue. Três quedas em 10
  minutos desligam a página até você usar **Religar**.
- **A moldura é do app.** O nome, a versão e os botões em cima da página são desenhados pela janela, fora do
  `<webview>`: a página não consegue imitá-los.

## Experimente o exemplo

1. Ligue as páginas (Configurações › Conexões › aba **Páginas** → **Ligar páginas próprias**).
2. **+** → **Resumo do espaço** (exemplo pronto) → **Adicionar e permitir**. O código dele está em
   [`app/exemplos/paginas/resumo-do-espaco/`](../app/exemplos/paginas/resumo-do-espaco/) no repositório: é um bom
   ponto de partida para copiar.
3. Na moldura da página, **Ligar a agente…** → escolha um agente Claude ou Codex do espaço.
4. Escreva um recado e envie; peça ao agente para responder com `ork pagina responder "Resumo do espaço" "…"`.
