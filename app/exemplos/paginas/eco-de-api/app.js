// Eco de API — página de exemplo do Orkester para as APIs que a página enxerga (docs/paginas.md). Ela nunca vê a chave:
// chama pelo nome "eco" (o manifesto sugere uma API para httpbin.org com esse nome, e a API que você marca no aceite
// passa a atendê-lo) e diz o caminho; o Orkester põe o host (um domínio da API) e a chave, e devolve só
// { status, tipo, corpo }. Nenhuma rede própria, nenhum script inline, nenhum innerHTML.
//
// Se o httpbin.org estiver fora do ar, a reserva é o postman-echo.com: troque o host no manifesto.json (e nos domínios da
// API de teste) e atualize a página; os caminhos /get, /post, /headers e /redirect-to são os mesmos.
'use strict'

const $ = (id) => document.getElementById(id)
// o nome que a página chama: o da API, ou um que ela atende (o "encaixe" sugerido no manifesto)
const NOME = 'eco'
// o destino do redirecionamento: é para fora dos domínios da API de propósito (o Orkester não segue)
const DESTINO_DE_FORA = 'https://example.com'

function mostrar(resumo, classe, corpo) {
  $('resumo').textContent = resumo
  $('resumo').className = classe
  $('corpo').hidden = !corpo
  $('corpo').textContent = corpo ?? ''
}

// o corpo chega como texto; se for JSON, mostra bonito
function bonito(texto) {
  try {
    return JSON.stringify(JSON.parse(texto), null, 2)
  } catch {
    return texto
  }
}

function conta(texto, trecho) {
  return texto.split(trecho).length - 1
}

async function pedir(rotulo, pedido, comentar) {
  const botoes = [...document.querySelectorAll('button')]
  botoes.forEach((b) => (b.disabled = true))
  mostrar(`${rotulo}: pedindo…`, 'suave')
  try {
    const r = await orkPagina.api.pedir(NOME, pedido)
    const extra = comentar ? comentar(r) : ''
    mostrar(`${rotulo}: status ${r.status} (${r.tipo || 'sem tipo'}).${extra ? ` ${extra}` : ''}`, r.status >= 200 && r.status < 300 ? 'ok' : 'suave', r.corpo ? bonito(r.corpo) : '(corpo vazio)')
  } catch (erro) {
    // o Orkester explica o motivo: a página não enxerga a API, a API ou a página só lê, limite por minuto…
    mostrar(`${rotulo}: não deu. ${erro.message}`, 'erro')
  } finally {
    botoes.forEach((b) => (b.disabled = false))
  }
}

$('ler').addEventListener('click', () => {
  void pedir('Leitura', { metodo: 'GET', caminho: '/get', consulta: { origem: 'orkester', teste: 1 } }, (r) =>
    conta(r.corpo, 'orkester') ? 'O serviço devolveu a consulta que você mandou.' : ''
  )
})

$('escrever').addEventListener('click', () => {
  const mensagem = $('mensagem').value.trim() || 'olá'
  void pedir('Escrita', { metodo: 'POST', caminho: '/post', corpo: { mensagem } }, (r) =>
    conta(r.corpo, mensagem) ? 'O eco devolveu o seu texto: ele foi escrito do outro lado.' : ''
  )
})

$('token').addEventListener('click', () => {
  void pedir('Cabeçalhos', { metodo: 'GET', caminho: '/headers' }, (r) => {
    const n = conta(r.corpo, '•••')
    return n ? `O valor da chave voltaria aqui e apareceu ${n}× como •••.` : 'Nenhum ••• apareceu: a página enxerga a API?'
  })
})

$('redirecionar').addEventListener('click', () => {
  void pedir('Redirecionamento', { metodo: 'GET', caminho: '/redirect-to', consulta: { url: DESTINO_DE_FORA, status_code: 302 } }, (r) =>
    r.status >= 300 && r.status < 400 ? 'O serviço mandou ir para outro site e o Orkester não foi: a página recebe o 3xx.' : ''
  )
})

// ---------------------------------------------------------------- cores do app

function seguirTema({ tokens }) {
  for (const [nome, valor] of Object.entries(tokens)) {
    if (nome.startsWith('--') && typeof valor === 'string') document.documentElement.style.setProperty(nome, valor)
  }
}

async function iniciar() {
  orkPagina.ao('tema', seguirTema)
  const eu = await orkPagina.eu()
  $('titulo').textContent = eu.nome
  const apis = await orkPagina.api.disponiveis()
  const eco = apis.find((a) => a.nome.toLowerCase() === NOME || (a.atende ?? []).includes(NOME))
  $('encaixe').textContent = eco
    ? `Usando a API “${eco.nome}” (${eco.dominios.join(', ')}): ${eco.escrita ? 'lê e escreve' : 'só lê, então o POST vai ser recusado'}.`
    : apis.length
      ? `Esta página enxerga ${apis.map((a) => a.nome).join(', ')}, mas nenhuma atende “${NOME}”: marque a certa em Conexões › Páginas.`
      : 'Esta página não enxerga nenhuma API: marque uma em Conexões › Páginas e os botões passam a funcionar.'
}

iniciar().catch((erro) => mostrar(erro.message, 'erro'))
