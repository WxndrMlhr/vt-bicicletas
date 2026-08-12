const { criarGerador, nomeSeguro } = require('./documento-pdf');

// O documento do pedido em folha A4 — a via para arquivar, mandar para o
// cliente ou entregar junto com a mercadoria. É outra coisa do cupom da mini
// impressora (impressao.js), que continua igual.

function nomeArquivo(pedido) {
  const numero = String(pedido.id ?? 0).padStart(4, '0');
  const cliente = nomeSeguro(pedido.cliente);
  return cliente ? `Pedido-${numero}-${cliente}.pdf` : `Pedido-${numero}.pdf`;
}

const gerador = criarGerador({
  pagina: 'pedido-doc.html',
  pasta: 'Pedidos VT Bicicletas',
  titulo: 'Salvar pedido em PDF',
  nomeArquivo
});

module.exports = {
  salvarComoPDF: gerador.salvarComoPDF,
  imprimirPedidoA4: gerador.imprimir,
  abrirPastaPedidos: gerador.abrirPasta,
  pastaSugerida: gerador.pastaSugerida
};
