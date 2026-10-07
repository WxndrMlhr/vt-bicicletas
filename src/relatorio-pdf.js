const { criarGerador } = require('./documento-pdf');

// O relatório de vendas em folha A4 — para arquivar e para mandar pelo
// WhatsApp. O desenho fica em renderer/relatorio-doc.html; a mecânica é a
// compartilhada com o pedido e o orçamento.
//
// Só PDF: a impressão do relatório sai em cupom, pelo impressao.js, porque a
// impressora da loja é térmica de 80mm (ver renderer/relatorio-cupom.html).

// Nome do arquivo em data ISO, e não no título em português: assim a pasta
// fica em ordem de período sozinha, sem depender do nome do mês.
function nomeArquivo(relatorio) {
  const { inicio, fim } = relatorio.periodo || {};
  if (!inicio || !fim) return 'Relatorio.pdf';
  return inicio === fim
    ? `Relatorio-${inicio}.pdf`
    : `Relatorio-${inicio}-a-${fim}.pdf`;
}

const gerador = criarGerador({
  pagina: 'relatorio-doc.html',
  pasta: 'Relatórios VT Bicicletas',
  titulo: 'Salvar relatório em PDF',
  nomeArquivo
});

module.exports = {
  salvarComoPDF: gerador.salvarComoPDF,
  abrirPastaRelatorios: gerador.abrirPasta,
  pastaSugerida: gerador.pastaSugerida
};
