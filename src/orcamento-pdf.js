const { criarGerador, nomeSeguro } = require('./documento-pdf');

// O documento do orçamento em folha A4. O desenho fica em
// renderer/orcamento-doc.html; a mecânica de gerar/imprimir é a compartilhada.

function nomeArquivo(orcamento) {
  const numero = String(orcamento.id ?? 0).padStart(4, '0');
  const cliente = nomeSeguro(orcamento.cliente);
  return cliente ? `Orcamento-${numero}-${cliente}.pdf` : `Orcamento-${numero}.pdf`;
}

const gerador = criarGerador({
  pagina: 'orcamento-doc.html',
  pasta: 'Orçamentos VT Bicicletas',
  titulo: 'Salvar orçamento em PDF',
  nomeArquivo
});

module.exports = {
  salvarComoPDF: gerador.salvarComoPDF,
  imprimirOrcamento: gerador.imprimir,
  abrirPastaOrcamentos: gerador.abrirPasta,
  pastaSugerida: gerador.pastaSugerida
};
