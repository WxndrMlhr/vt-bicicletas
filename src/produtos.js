const db = require('./db');

function buscarProdutos(termo) {
  return db.prepare(`
    SELECT * FROM produtos
    WHERE nome LIKE ? OR categoria LIKE ?
    ORDER BY nome
  `).all(`%${termo}%`, `%${termo}%`);
}

function listarProdutos() {
  return db.prepare('SELECT * FROM produtos ORDER BY nome').all();
}

function adicionarProduto({ nome, categoria, preco_prazo, preco_vista, preco_vista_retirada }) {
  const stmt = db.prepare(`
    INSERT INTO produtos (nome, categoria, preco_prazo, preco_vista, preco_vista_retirada)
    VALUES (@nome, @categoria, @preco_prazo, @preco_vista, @preco_vista_retirada)
  `);
  const info = stmt.run({ nome, categoria, preco_prazo, preco_vista, preco_vista_retirada });
  return info.lastInsertRowid;
}

function atualizarProduto(id, { nome, categoria, preco_prazo, preco_vista, preco_vista_retirada }) {
  const anterior = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
  if (!anterior) throw new Error('Peça não encontrada.');

  // Só registra no histórico se algum preço mudou de fato.
  const mudouPreco =
    anterior.preco_prazo !== preco_prazo ||
    anterior.preco_vista !== preco_vista ||
    anterior.preco_vista_retirada !== preco_vista_retirada;

  if (mudouPreco) {
    registrarAlteracao('individual', `Preço alterado: ${anterior.nome}`, [anterior]);
  }

  db.prepare(`
    UPDATE produtos
    SET nome = @nome,
        categoria = @categoria,
        preco_prazo = @preco_prazo,
        preco_vista = @preco_vista,
        preco_vista_retirada = @preco_vista_retirada
    WHERE id = @id
  `).run({ id, nome, categoria, preco_prazo, preco_vista, preco_vista_retirada });
}

function excluirProduto(id) {
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
}

// Calcula o preço de um produto conforme a forma de pagamento
// e aplica a regra especial para pedidos acima de R$ 2.000 (total do pedido).
function calcularPreco(produto, formaPagamento, totalPedido) {
  let preco;
  switch (formaPagamento) {
    case 'prazo':
      preco = produto.preco_prazo;
      break;
    case 'vista':
      preco = produto.preco_vista;
      break;
    case 'vista_retirada':
      preco = produto.preco_vista_retirada;
      break;
    default:
      throw new Error(`Forma de pagamento inválida: ${formaPagamento}`);
  }

  // Regra "acima de 2k": pedidos com total igual ou maior que R$ 2.000
  // usam o preço à vista com retirada em loja como referência,
  // mesmo que a forma de pagamento escolhida seja outra.
  // Se o produto não tiver preço de retirada cadastrado, usa o preço à vista normal.
  if (totalPedido !== undefined && totalPedido >= 2000) {
    const referencia = produto.preco_vista_retirada ?? produto.preco_vista;
    preco = Math.min(preco, referencia);
  }

  return preco;
}

// Guarda os preços atuais dos produtos antes de alterá-los,
// para que a alteração possa ser desfeita depois.
function registrarAlteracao(tipo, descricao, produtosAfetados) {
  const info = db.prepare(`
    INSERT INTO alteracoes_preco (tipo, descricao, quantidade) VALUES (?, ?, ?)
  `).run(tipo, descricao, produtosAfetados.length);

  const alteracao_id = info.lastInsertRowid;
  const guardar = db.prepare(`
    INSERT INTO alteracoes_preco_itens
      (alteracao_id, produto_id, preco_prazo, preco_vista, preco_vista_retirada)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const p of produtosAfetados) {
    guardar.run(alteracao_id, p.id, p.preco_prazo, p.preco_vista, p.preco_vista_retirada);
  }
  return alteracao_id;
}

function listarAlteracoes(limite = 20) {
  return db.prepare(`
    SELECT * FROM alteracoes_preco
    ORDER BY id DESC
    LIMIT ?
  `).all(limite);
}

// Devolve os preços exatos que existiam antes da alteração.
const desfazerAlteracao = db.transaction((id) => {
  const alteracao = db.prepare('SELECT * FROM alteracoes_preco WHERE id = ?').get(id);
  if (!alteracao) throw new Error('Alteração não encontrada.');
  if (alteracao.desfeito) throw new Error('Essa alteração já foi desfeita.');

  const itens = db.prepare('SELECT * FROM alteracoes_preco_itens WHERE alteracao_id = ?').all(id);
  const restaurar = db.prepare(`
    UPDATE produtos
    SET preco_prazo = ?, preco_vista = ?, preco_vista_retirada = ?
    WHERE id = ?
  `);

  for (const i of itens) {
    restaurar.run(i.preco_prazo, i.preco_vista, i.preco_vista_retirada, i.produto_id);
  }

  db.prepare('UPDATE alteracoes_preco SET desfeito = 1 WHERE id = ?').run(id);
  return { restaurados: itens.length, descricao: alteracao.descricao };
});

// Reajusta preços em percentual.
// percentual: 10 aumenta 10%, -5 baixa 5%.
// categoria vazia = todos os produtos.
// Arredonda para centavos.
const reajustarPrecos = db.transaction((percentual, categoria = '') => {
  const fator = 1 + (percentual / 100);
  if (fator <= 0) throw new Error('Percentual inválido.');

  const onde = categoria ? 'WHERE categoria = ?' : '';
  const params = categoria ? [categoria] : [];

  const afetados = db.prepare(`SELECT * FROM produtos ${onde}`).all(...params);
  if (afetados.length === 0) return { afetados: 0, percentual, categoria: categoria || 'todas' };

  const sinal = percentual > 0 ? '+' : '';
  registrarAlteracao(
    'massa',
    `Reajuste de ${sinal}${percentual}% em ${categoria || 'todas as peças'}`,
    afetados
  );

  db.prepare(`
    UPDATE produtos SET
      preco_prazo = ROUND(preco_prazo * ${fator}, 2),
      preco_vista = ROUND(preco_vista * ${fator}, 2),
      preco_vista_retirada = CASE
        WHEN preco_vista_retirada IS NULL THEN NULL
        ELSE ROUND(preco_vista_retirada * ${fator}, 2)
      END
    ${onde}
  `).run(...params);

  return { afetados: afetados.length, percentual, categoria: categoria || 'todas' };
});

function listarCategorias() {
  return db.prepare(`
    SELECT categoria, COUNT(*) AS quantidade
    FROM produtos
    WHERE categoria IS NOT NULL AND categoria <> ''
    GROUP BY categoria
    ORDER BY categoria
  `).all();
}

module.exports = {
  listarProdutos,
  buscarProdutos,
  adicionarProduto,
  atualizarProduto,
  excluirProduto,
  reajustarPrecos,
  listarAlteracoes,
  desfazerAlteracao,
  listarCategorias,
  calcularPreco
};
