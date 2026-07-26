const db = require('./db');

function listarClientes() {
  return db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id AND p.cancelado = 0) AS total_pedidos,
           (SELECT COALESCE(SUM(p.total),0) FROM pedidos p WHERE p.cliente_id = c.id AND p.cancelado = 0) AS total_comprado
    FROM clientes c
    ORDER BY c.nome
  `).all();
}

function buscarClientes(termo) {
  const like = `%${termo}%`;
  return db.prepare(`
    SELECT * FROM clientes
    WHERE nome LIKE ? OR telefone LIKE ?
    ORDER BY nome
    LIMIT 20
  `).all(like, like);
}

function adicionarCliente({ nome, telefone, endereco, observacoes }) {
  const info = db.prepare(`
    INSERT INTO clientes (nome, telefone, endereco, observacoes)
    VALUES (?, ?, ?, ?)
  `).run(nome, telefone || null, endereco || null, observacoes || null);
  return info.lastInsertRowid;
}

function atualizarCliente(id, { nome, telefone, endereco, observacoes }) {
  db.prepare(`
    UPDATE clientes
    SET nome = ?, telefone = ?, endereco = ?, observacoes = ?
    WHERE id = ?
  `).run(nome, telefone || null, endereco || null, observacoes || null, id);
}

function excluirCliente(id) {
  // Desvincula os pedidos antes de remover, para não perder o histórico de vendas.
  db.prepare('UPDATE pedidos SET cliente_id = NULL WHERE cliente_id = ?').run(id);
  db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
}

// Ficha do cliente: dados + pedidos + o que ainda está em aberto.
function fichaCliente(id) {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!cliente) return null;

  cliente.pedidos = db.prepare(`
    SELECT id, criado_em, forma_pagamento, total, cancelado
    FROM pedidos
    WHERE cliente_id = ?
    ORDER BY id DESC
    LIMIT 30
  `).all(id);

  const totais = db.prepare(`
    SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS total
    FROM pedidos WHERE cliente_id = ? AND cancelado = 0
  `).get(id);

  const emAberto = db.prepare(`
    SELECT COALESCE(SUM(valor),0) AS valor
    FROM contas_receber
    WHERE cliente_id = ? AND pago = 0
  `).get(id);

  cliente.total_pedidos = totais.pedidos;
  cliente.total_comprado = +totais.total.toFixed(2);
  cliente.em_aberto = +emAberto.valor.toFixed(2);
  return cliente;
}

module.exports = {
  listarClientes,
  buscarClientes,
  adicionarCliente,
  atualizarCliente,
  excluirCliente,
  fichaCliente
};
