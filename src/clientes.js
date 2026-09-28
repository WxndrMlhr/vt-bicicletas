const db = require('./db');
const { normalizar } = require('./renderer/dados-cliente');

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
  // Nome de gente é o que mais tem acento — e é o que se digita com
  // pressa. "jose" tem de achar "José". Telefone não leva acento e vai
  // como está.
  // Documento também acha, digitado com ou sem os pontos.
  const like = `%${termo}%`;
  const semAcento = `%${db.semAcento(termo)}%`;
  const doc = String(termo).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return db.prepare(`
    SELECT * FROM clientes
    WHERE sem_acento(nome) LIKE ? OR telefone LIKE ?
       OR (length(?) >= 4 AND
           REPLACE(REPLACE(REPLACE(REPLACE(UPPER(documento), '.', ''), '-', ''), '/', ''), ' ', '') LIKE ?)
    ORDER BY nome
    LIMIT 20
  `).all(semAcento, like, doc, `%${doc}%`);
}

function adicionarCliente(dados) {
  const d = normalizar(dados);
  const info = db.prepare(`
    INSERT INTO clientes (nome, telefone, endereco, cep, documento_tipo, documento, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(String(dados.nome).trim(), d.telefone, d.endereco, d.cep, d.documento_tipo, d.documento,
         dados.observacoes || null);
  return info.lastInsertRowid;
}

// Campo que não veio (undefined) fica como estava: quem chama sem saber
// do CEP ou do documento não os apaga sem querer.
function atualizarCliente(id, dados) {
  const atual = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!atual) throw new Error('Cliente não encontrado.');
  const valer = campo => dados[campo] === undefined ? atual[campo] : dados[campo];
  const d = normalizar({
    telefone: valer('telefone'),
    endereco: valer('endereco'),
    cep: valer('cep'),
    documento_tipo: valer('documento_tipo'),
    documento: valer('documento')
  });
  db.prepare(`
    UPDATE clientes
    SET nome = ?, telefone = ?, endereco = ?, cep = ?, documento_tipo = ?, documento = ?, observacoes = ?
    WHERE id = ?
  `).run(String(valer('nome')).trim(), d.telefone, d.endereco, d.cep, d.documento_tipo, d.documento,
         valer('observacoes') || null, id);
}

// Cliente de uma venda: o que foi digitado na tela do pedido vai para a
// ficha dele, para aparecer sozinho da próxima vez.
//
// - Cliente escolhido da lista (cliente_id): a ficha recebe o que foi
//   preenchido. Campo deixado em branco não apaga o que a ficha já tinha.
// - Nome digitado sem escolher da lista: se já existe cliente com o mesmo
//   documento, é ele (a pessoa só não clicou na sugestão). Senão a venda
//   fica só com o nome, como sempre foi — cliente novo é cadastrado em
//   Clientes, não criado sozinho a cada nome digitado.
//
// Devolve o cliente_id que a venda deve usar (ou null).
function clienteDaVenda({ cliente, cliente_id, dados }) {
  const d = normalizar(dados || {});
  const preenchidos = {};
  for (const campo of ['telefone', 'endereco', 'cep', 'documento_tipo', 'documento']) {
    if (d[campo]) preenchidos[campo] = d[campo];
  }

  if (cliente_id) {
    if (Object.keys(preenchidos).length > 0) atualizarCliente(cliente_id, preenchidos);
    return cliente_id;
  }

  if (!String(cliente ?? '').trim() || !d.documento) return null;

  const mesmo = db.prepare('SELECT id FROM clientes WHERE documento = ?').get(d.documento);
  if (!mesmo) return null;
  atualizarCliente(mesmo.id, preenchidos);
  return mesmo.id;
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
  fichaCliente,
  clienteDaVenda
};
