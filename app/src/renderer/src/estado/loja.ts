/**
 * O barril da loja: cada domínio mora em seu arquivo (estado/*.ts); quem importa daqui não muda.
 * Os módulos de estado/ se importam em ciclo (o nucleo chama terminais, rotinas e código; os outros chamam o nucleo).
 * É seguro só porque tudo que cruza módulos é função chamada em runtime. Regra: no topo de um módulo de estado/
 * (const com chamada, new, IIFE, registro) nada vem de outro módulo de estado/; só coisas locais ou de fora.
 */
export { NADA, quantosSelecionados, lerEstado, usarLoja, planoDe, planoAtual, andarAtual, pastaDoPlano, salvarAgora, salvarParaFechar, desfazer, refazer, escreverPaginaAtiva } from './nucleo'
export type { Ferramenta, Alvo, Selecao, EstadoUI, StatusDoAviso } from './nucleo'
export { iniciar, abrirNovaJanela, abrirEspaco, criarEspaco, renomearEspaco, apagarEspaco, prepararLeitura, alternarExplorador, adicionarRaizExplorador, removerRaizExplorador, alternarPastaExplorador, alternarLateral, definirTema, alternarLinhasDoCodigo, definirFuncoes, definirPartituras, salvarPartitura, subirPartitura, chaveDoAviso, anotarAvisoDoPrimeiroPedido, dispensarAvisoDoPrimeiroPedido, entregarPrimeiroPedido } from './espacos'
export { rotinasDoEspaco, criarRotina, mudarRotina, apagarRotina, alternarPausaDaRotina, testarRotina } from './rotinas'
export { criarBandaNoQuadro, membrosDaBandaAtual, trocarAgenteDoCartao, definirPresets } from './bandas'
export { abrirVistaAndares, irParaAndar, criarAndar, renomearAndar, definirStatusAndar, pousarAndar, apagarAndar } from './andares'
export { escolherFerramenta, definirEstiloDesenho, estaSelecionado, selecionar, selecionarVarios, selecionarTudo, selecionarPeloClique, focarItem, infoDaSelecao, editar, alternarMiniMapa, ZOOM_MIN, ZOOM_MAX, definirCamera, enquadrarNo } from './selecao'
export type { InfoSelecao } from './selecao'
export { acharNo, adicionarNo, atualizarNo, trazerParaFrente, enviarParaTras, definirCorNo, definirCorSelecao, definirTomPostIts, alternarTravaSelecao } from './nos'
export type { NovoNo } from './nos'
export { fragmentoDaSelecao, colarFragmento, duplicarSelecao, definirNota } from './copiar'
export type { Fragmento } from './copiar'
export { posicoesDaSelecao, posicoesDaColuna, moverItens, empurrarSelecao, apagarSelecao, apagar, agrupar, desagrupar, tirarDoGrupo, alinhar, distribuir } from './arranjo'
export type { Posicoes, Alinhamento } from './arranjo'
export { ligar, adicionarDesenho, definirCorDesenho, apagarDesenhosPerto } from './cordas'
export { pastaEhVigiavel, ARVORE_PRINCIPAL, arvoresDoTerminal, arvoreDoCodigo, moverColuna, assentarCodigos, juntarCodigosDoTerminal } from './codigo'
export { criarArvore, usarArvore, renomearArvore, desfazerArvore, mostrarArquivoNaArvore, fecharCodigosSoltos, entregarArquivos, contarArquivos, soltarCodigoDaColuna, contarCodigosSoltos, assentarColuna, alternarRecolhidoDoCodigo, contarCodigos, recolherCodigosDoTerminal, fecharCodigosDoTerminal, alternarCodigoSozinho } from './arvores'
