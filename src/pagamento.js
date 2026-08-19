const configuracoes = require('./configuracoes');
const pix = require('./pix');
const qrcode = require('./qrcode');

// O bloco "Dados para pagamento" que vai no fim dos papéis.
//
// Monta aqui, no processo principal, e entrega pronto para a página do
// documento. A página não precisa saber montar código PIX nem desenhar QR —
// e o gerador de QR não precisa existir dentro de cada folha.
//
// Sem chave cadastrada, devolve null e o bloco simplesmente não sai. É de
// propósito: papel com um quadrado vazio escrito "PIX" é pior que papel sem
// nada.

// O QR entra como SVG dentro do próprio documento, não como arquivo. Assim
// o PDF fica com o desenho em vetor — que amplia sem borrar e imprime nítido
// em qualquer resolução.
function dados({ valor = null, txid = '***' } = {}) {
  const c = configuracoes.tudo();
  if (!c.pix_chave || !c.pix_nome) return null;

  let codigo;
  try {
    codigo = pix.gerar({
      chave: c.pix_chave,
      nome: c.pix_nome,
      // Só a cidade, sem o estado. O campo aceita 15 caracteres e
      // "NOVA IGUACU / RJ" tem 16 — cortar no limite deixaria
      // "NOVA IGUACU / R" no código, que parece defeito para quem olha.
      cidade: String(c.loja_cidade || 'BRASIL').split(/[\/\-–]/)[0].trim(),
      valor,
      txid
    });
  } catch (erro) {
    // Chave mal cadastrada não pode derrubar a impressão do pedido inteiro.
    // O papel sai sem o bloco, e o erro fica no log para quem cuida do
    // sistema achar depois.
    console.error('[pagamento] não consegui montar o PIX:', erro.message);
    return null;
  }

  const matriz = qrcode.gerar(codigo.texto);

  return {
    texto: codigo.texto,
    chave: codigo.chave,
    tipoDaChave: codigo.tipoDaChave,
    nome: codigo.nome,
    instituicao: c.pix_instituicao || '',
    recado: c.pix_recado || '',
    valor,
    // Dois tamanhos: o A4 tem espaço de sobra, o cupom não.
    qrGrande: qrcode.paraSVG(matriz, { modulo: 4, margem: 4 }),
    qrPequeno: qrcode.paraSVG(matriz, { modulo: 3, margem: 3 }),
    // Quantos módulos tem de lado, contando a margem branca. O cupom usa
    // isso para calcular um tamanho em milímetros que caia em número
    // inteiro de pontos da impressora térmica — senão o desenho borra.
    modulos: matriz.length,
    modulosComMargem: matriz.length + 6
  };
}

module.exports = { dados };
