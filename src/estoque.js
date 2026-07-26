const db = require('./db');

// Registra uma movimentação e atualiza o saldo do produto.
// tipo: 'entrada' (compra, devolução) ou 'saida' (venda, perda, ajuste)
const registrar = db.transaction(({ produto_id, tipo, quantidade, motivo, pedido_id }) => {
  if (quantidade <= 0) throw new Error('A quantidade precisa ser maior que zero.');

  db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, motivo, pedido_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(produto_id, tipo, quantidade, motivo || null, pedido_id || null);

  const sinal = tipo === 'entrada' ? '+' : '-';
  db.prepare(`UPDATE produtos SET estoque = estoque ${sinal} ? WHERE id = ?`)
    .run(quantidade, produto_id);
});

function registrarMovimentacao(dados) {
  registrar(dados);
  return db.prepare('SELECT id, nome, estoque FROM produtos WHERE id = ?').get(dados.produto_id);
}

// Dá baixa de todos os itens de um pedido de uma vez.
const baixarPedido = db.transaction((pedido_id, linhas) => {
  for (const linha of linhas) {
    if (!linha.produto_id) continue;
    registrar({
      produto_id: linha.produto_id,
      tipo: 'saida',
      quantidade: linha.quantidade,
      motivo: `Venda - pedido #${pedido_id}`,
      pedido_id
    });
  }
});

// Define o saldo exato (contagem física), gerando a movimentação da diferença.
function ajustarSaldo(produto_id, novoSaldo, motivo) {
  const produto = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) throw new Error('Produto não encontrado.');

  const diferenca = novoSaldo - produto.estoque;
  if (diferenca === 0) return produto;

  return registrarMovimentacao({
    produto_id,
    tipo: diferenca > 0 ? 'entrada' : 'saida',
    quantidade: Math.abs(diferenca),
    motivo: motivo || 'Ajuste de contagem'
  });
}

function definirEstoqueMinimo(produto_id, minimo) {
  db.prepare('UPDATE produtos SET estoque_minimo = ? WHERE id = ?').run(minimo, produto_id);
}

function listarEstoque(filtro = '') {
  const like = `%${filtro}%`;
  return db.prepare(`
    SELECT id, nome, categoria, estoque, estoque_minimo, preco_vista
    FROM produtos
    WHERE nome LIKE ? OR categoria LIKE ?
    ORDER BY nome
  `).all(like, like);
}

// Produtos que bateram ou passaram do mínimo definido.
function estoqueBaixo() {
  return db.prepare(`
    SELECT id, nome, categoria, estoque, estoque_minimo
    FROM produtos
    WHERE estoque_minimo > 0 AND estoque <= estoque_minimo
    ORDER BY (estoque - estoque_minimo), nome
  `).all();
}

function historicoProduto(produto_id, limite = 30) {
  return db.prepare(`
    SELECT * FROM movimentacoes_estoque
    WHERE produto_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(produto_id, limite);
}

function resumoEstoque() {
  const r = db.prepare(`
    SELECT
      COUNT(*)                                   AS itens_cadastrados,
      COALESCE(SUM(estoque),0)                   AS pecas_em_estoque,
      COALESCE(SUM(estoque * preco_vista),0)     AS valor_estoque,
      SUM(CASE WHEN estoque <= 0 THEN 1 ELSE 0 END) AS zerados
    FROM produtos
  `).get();
  return {
    itens_cadastrados: r.itens_cadastrados,
    pecas_em_estoque: r.pecas_em_estoque,
    valor_estoque: +r.valor_estoque.toFixed(2),
    zerados: r.zerados,
    abaixo_minimo: estoqueBaixo().length
  };
}

module.exports = {
  registrarMovimentacao,
  baixarPedido,
  ajustarSaldo,
  definirEstoqueMinimo,
  listarEstoque,
  estoqueBaixo,
  historicoProduto,
  resumoEstoque
};
