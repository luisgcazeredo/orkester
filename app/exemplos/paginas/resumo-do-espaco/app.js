// Resumo do espaço — página de exemplo do Orkester. Usa só `window.orkPagina` (docs/paginas.md): nenhuma rede, nenhum
// script inline, nenhum innerHTML. Tudo o que vem do app entra na tela por textContent.
'use strict'

const $ = (id) => document.getElementById(id)

const SITUACOES = {
  livre: 'livre',
  trabalhando: 'trabalhando',
  pergunta: 'esperando resposta',
  encerrado: 'encerrado'
}

let ligados = new Set()
let buscandoLigados = false
let ultimoResumo = null
let assinaturaDosLigados = ''

function aviso(texto) {
  $('situacao').textContent = texto
}

function elemento(tag, classe, texto) {
  const el = document.createElement(tag)
  if (classe) el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

// ---------------------------------------------------------------- agentes ao vivo

function mostrarQuadro(resumo) {
  ultimoResumo = resumo
  $('espaco').textContent = resumo.espaco ? `Espaço: ${resumo.espaco.nome}` : 'Esta janela ainda não tem um espaço aberto.'
  $('sem-agentes').hidden = resumo.agentes.length > 0
  $('agentes').replaceChildren(
    ...resumo.agentes.map((a) => {
      const item = elemento('li', 'agente')
      item.dataset.situacao = a.situacao
      item.append(elemento('span', 'ponto'))
      const texto = elemento('div', 'agente-texto')
      texto.append(elemento('strong', '', a.nome))
      const detalhe = [a.motor, a.funcao, SITUACOES[a.situacao] ?? a.situacao]
      if (a.fila > 0) detalhe.push(`${a.fila} na fila`)
      texto.append(elemento('span', 'suave', detalhe.filter(Boolean).join(' · ')))
      item.append(texto)
      if (ligados.has(a.id)) item.append(elemento('span', 'selo', 'ligado'))
      return item
    })
  )
}

// ---------------------------------------------------------------- recado ao agente ligado

async function atualizarLigados() {
  if (buscandoLigados) return
  buscandoLigados = true
  try {
    const lista = await orkPagina.agentes()
    ligados = new Set(lista.map((a) => a.id))
    // só refaz a lista do <select> se mudou: refazer a cada consulta fecharia a lista aberta
    const assinatura = lista.map((a) => `${a.id}|${a.nome}`).join('\n')
    if (assinatura !== assinaturaDosLigados) {
      assinaturaDosLigados = assinatura
      const atual = $('destino').value
      $('destino').replaceChildren(
        ...lista.map((a) => {
          const opcao = elemento('option', '', a.nome)
          opcao.value = a.id
          return opcao
        })
      )
      if (ligados.has(atual)) $('destino').value = atual
      if (ultimoResumo) mostrarQuadro(ultimoResumo)
    }
    $('mandar').disabled = lista.length === 0
    if (lista.length === 0) aviso('Nenhum agente ligado a esta página. Use “Ligar a agente…” no topo dela.')
  } catch (erro) {
    ligados = new Set()
    assinaturaDosLigados = ''
    $('destino').replaceChildren()
    $('mandar').disabled = true
    aviso(erro.message)
  } finally {
    buscandoLigados = false
  }
}

function anotarNaConversa(quem, texto, recebido) {
  const item = elemento('li', recebido ? 'msg recebida' : 'msg enviada')
  item.append(elemento('strong', '', quem), elemento('p', '', texto))
  $('conversa').append(item)
  item.scrollIntoView({ block: 'nearest' })
}

$('form-recado').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const para = $('destino').value
  const texto = $('texto').value.trim()
  if (!para || !texto) return
  const nome = $('destino').selectedOptions[0]?.textContent ?? 'agente'
  $('mandar').disabled = true
  try {
    const { posicao } = await orkPagina.recado(para, texto)
    anotarNaConversa(`Você → ${nome}`, texto, false)
    $('texto').value = ''
    aviso(`Recado na caixa do agente (posição ${posicao}).`)
  } catch (erro) {
    aviso(erro.message)
  } finally {
    $('mandar').disabled = !$('destino').value
  }
})

// ---------------------------------------------------------------- nota (guardada em orkPagina.dados)

let guardando = null

async function carregarNota() {
  try {
    const nota = await orkPagina.dados.ler('nota')
    if (typeof nota === 'string') $('nota').value = nota
  } catch (erro) {
    aviso(erro.message)
  }
}

$('nota').addEventListener('input', () => {
  clearTimeout(guardando)
  guardando = setTimeout(async () => {
    try {
      await orkPagina.dados.gravar('nota', $('nota').value)
      aviso('Nota guardada.')
    } catch (erro) {
      aviso(erro.message)
    }
  }, 600)
})

// ---------------------------------------------------------------- cores do app

// O app manda os tokens do tema em uso (`--painel`, `--texto`…); o estilo.css só lê `var(--x, padrão)`.
function seguirTema({ tokens }) {
  for (const [nome, valor] of Object.entries(tokens)) {
    if (nome.startsWith('--') && typeof valor === 'string') document.documentElement.style.setProperty(nome, valor)
  }
}

// ---------------------------------------------------------------- começo

async function iniciar() {
  orkPagina.ao('tema', seguirTema)
  orkPagina.ao('recado', (r) => anotarNaConversa(`${r.de.nome} → você`, r.texto, true))
  const eu = await orkPagina.eu()
  $('titulo').textContent = eu.nome
  if (eu.permissoes.includes('quadro')) {
    mostrarQuadro(await orkPagina.quadro.resumo())
    orkPagina.ao('quadro', (resumo) => {
      mostrarQuadro(resumo)
      void atualizarLigados()
    })
  } else {
    $('espaco').textContent = 'Sem a permissão “quadro”: não consigo mostrar os agentes.'
  }
  if (eu.permissoes.includes('recado')) {
    await atualizarLigados()
    // ligar ou desligar um agente no topo da página não muda o quadro: confere de tempos em tempos (o limite é 2 por segundo)
    setInterval(() => void atualizarLigados(), 5000)
  } else {
    $('mandar').disabled = true
    aviso('Sem a permissão “recado”: não consigo mandar recados.')
  }
  await carregarNota()
}

iniciar().catch((erro) => aviso(erro.message))
