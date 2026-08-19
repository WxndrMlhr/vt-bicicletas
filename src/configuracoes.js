const db = require('./db');

// Tudo que muda de uma loja para outra fica aqui, e não no código: nome,
// endereço e telefone que saem nos papéis, e os ajustes da impressora.
//
// Os padrões abaixo são os da VT Bicicletas, então quem já usa o sistema não
// percebe diferença nenhuma. Numa instalação nova, é só trocar na tela de
// Configurações — nenhum arquivo precisa ser editado.

const PADROES = {
  // --- Dados da loja (saem no cupom, no orçamento e no pedido) ---
  loja_nome: 'V.T. BICICLETAS',
  loja_lema: 'O seu fornecedor completo de peças',
  loja_endereco: 'R. Antônio Pacheco, 40 - Carmari',
  loja_cidade: 'Nova Iguaçu / RJ',
  loja_telefone: '(21) 98332-0678',
  loja_documento: '',            // CNPJ/CPF, opcional

  // --- Impressão do cupom (mini impressora térmica) ---
  // Largura ÚTIL de impressão, que não é a largura do papel:
  // papel de 80mm imprime ~72mm; papel de 58mm imprime ~48mm.
  impressao_largura_mm: '72',
  impressao_impressora: '',      // vazio = usa a padrão do Windows
  impressao_silenciosa: '0',     // '1' imprime direto, sem o diálogo do Windows

  // --- Dados para pagamento (saem no fim do orçamento, do pedido e do cupom) ---
  // Ficam aqui, e não escritos nos documentos, para trocar de chave não
  // depender de mexer no código. Vazio em qualquer um deles faz o bloco
  // inteiro sumir do papel.
  pix_chave: '21983320678',
  // O nome que aparece no aplicativo de quem paga. O padrão do PIX aceita
  // 25 caracteres, e "Francilene Cascaes Malheiro" tem 27 — por isso o
  // nome do meio vai abreviado, senão o corte cairia no meio da palavra.
  pix_nome: 'Francilene C Malheiro',
  pix_instituicao: 'Mercado Pago',
  pix_recado: '',                // "avisar no WhatsApp depois de pagar", por exemplo

  // --- Controle interno ---
  catalogo_semeado: '0'          // se a tabela de preços inicial já foi carregada
};

const lerUma = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?');
const gravarUma = db.prepare(`
  INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
  ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
`);

function obter(chave) {
  const linha = lerUma.get(chave);
  if (linha && linha.valor !== null) return linha.valor;
  return PADROES[chave] ?? null;
}

function obterNumero(chave) {
  const n = Number(obter(chave));
  return Number.isFinite(n) ? n : Number(PADROES[chave]);
}

function obterBooleano(chave) {
  return obter(chave) === '1';
}

function definir(chave, valor) {
  gravarUma.run(chave, valor === null || valor === undefined ? '' : String(valor));
  return { chave, valor: obter(chave) };
}

// Grava várias de uma vez. Chave desconhecida é ignorada de propósito,
// para a tela não conseguir sujar a tabela com lixo.
const definirVarias = db.transaction((dados) => {
  const gravadas = [];
  for (const [chave, valor] of Object.entries(dados || {})) {
    if (!(chave in PADROES)) continue;
    gravarUma.run(chave, valor === null || valor === undefined ? '' : String(valor));
    gravadas.push(chave);
  }
  return gravadas;
});

// Devolve o conjunto completo, já com os padrões preenchidos onde falta.
function tudo() {
  const salvas = Object.fromEntries(
    db.prepare('SELECT chave, valor FROM configuracoes').all().map(l => [l.chave, l.valor])
  );
  const resultado = {};
  for (const chave of Object.keys(PADROES)) {
    resultado[chave] = (salvas[chave] !== undefined && salvas[chave] !== null)
      ? salvas[chave]
      : PADROES[chave];
  }
  return resultado;
}

// O pedaço que os papéis usam. Separado de propósito: o documento não precisa
// saber de impressora nem de controle interno.
function dadosDaLoja() {
  const c = tudo();
  return {
    nome: c.loja_nome,
    lema: c.loja_lema,
    endereco: c.loja_endereco,
    cidade: c.loja_cidade,
    telefone: c.loja_telefone,
    documento: c.loja_documento
  };
}

function opcoesDeImpressao() {
  return {
    larguraMM: obterNumero('impressao_largura_mm'),
    impressora: obter('impressao_impressora'),
    silenciosa: obterBooleano('impressao_silenciosa')
  };
}

function restaurarPadroes() {
  // O controle interno não volta atrás: recarregar a tabela de preços da VT
  // numa loja que já apagou os produtos seria um estrago, não um reset.
  const preservar = obter('catalogo_semeado');
  db.prepare('DELETE FROM configuracoes').run();
  gravarUma.run('catalogo_semeado', preservar);
  return tudo();
}

module.exports = {
  PADROES,
  obter,
  obterNumero,
  obterBooleano,
  definir,
  definirVarias,
  tudo,
  dadosDaLoja,
  opcoesDeImpressao,
  restaurarPadroes
};
