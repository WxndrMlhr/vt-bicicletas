const db = require('./db');

function criarConta({ pedido_id, cliente_id, cliente_nome, valor, vencimento }) {
  const info = db.prepare(`
    INSERT INTO contas_receber (pedido_id, cliente_id, cliente_nome, valor, vencimento)
    VALUES (?, ?, ?, ?, ?)
  `).run(pedido_id || null, cliente_id || null, cliente_nome || null, valor, vencimento || null);
  return info.lastInsertRowid;
}

// situacao: 'abertas' | 'pagas' | 'vencidas' | 'todas'
function listarContas(situacao = 'abertas') {
  const hoje = new Date().toISOString().slice(0, 10);
  let filtro = '';
  const params = [];

  if (situacao === 'abertas') {
    filtro = 'WHERE pago = 0';
  } else if (situacao === 'pagas') {
    filtro = 'WHERE pago = 1';
  } else if (situacao === 'vencidas') {
    filtro = 'WHERE pago = 0 AND vencimento IS NOT NULL AND vencimento < ?';
    params.push(hoje);
  }

  return db.prepare(`
    SELECT * FROM contas_receber
    ${filtro}
    ORDER BY (vencimento IS NULL), vencimento, id
  `).all(...params);
}

function darBaixa(id) {
  db.prepare(`
    UPDATE contas_receber
    SET pago = 1, pago_em = datetime('now','localtime')
    WHERE id = ?
  `).run(id);
}

function reabrirConta(id) {
  db.prepare('UPDATE contas_receber SET pago = 0, pago_em = NULL WHERE id = ?').run(id);
}

function excluirConta(id) {
  db.prepare('DELETE FROM contas_receber WHERE id = ?').run(id);
}

function alterarVencimento(id, vencimento) {
  db.prepare('UPDATE contas_receber SET vencimento = ? WHERE id = ?').run(vencimento || null, id);
}

function resumoFinanceiro() {
  const hoje = new Date().toISOString().slice(0, 10);

  const aberto = db.prepare(
    'SELECT COUNT(*) AS qtd, COALESCE(SUM(valor),0) AS valor FROM contas_receber WHERE pago = 0'
  ).get();

  const vencido = db.prepare(`
    SELECT COUNT(*) AS qtd, COALESCE(SUM(valor),0) AS valor
    FROM contas_receber
    WHERE pago = 0 AND vencimento IS NOT NULL AND vencimento < ?
  `).get(hoje);

  const recebidoMes = db.prepare(`
    SELECT COALESCE(SUM(valor),0) AS valor
    FROM contas_receber
    WHERE pago = 1 AND strftime('%Y-%m', pago_em) = strftime('%Y-%m', 'now', 'localtime')
  `).get();

  const proximos7 = db.prepare(`
    SELECT COALESCE(SUM(valor),0) AS valor
    FROM contas_receber
    WHERE pago = 0 AND vencimento IS NOT NULL
      AND vencimento BETWEEN ? AND date(?, '+7 day')
  `).get(hoje, hoje);

  return {
    aberto_qtd: aberto.qtd,
    aberto_valor: +aberto.valor.toFixed(2),
    vencido_qtd: vencido.qtd,
    vencido_valor: +vencido.valor.toFixed(2),
    recebido_mes: +recebidoMes.valor.toFixed(2),
    proximos_7_dias: +proximos7.valor.toFixed(2)
  };
}

module.exports = {
  criarConta,
  listarContas,
  darBaixa,
  reabrirConta,
  excluirConta,
  alterarVencimento,
  resumoFinanceiro
};
