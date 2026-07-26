const db = require('./db');

// As datas chegam no formato 'AAAA-MM-DD' (o mesmo dos campos <input type="date">).
// O banco guarda criado_em como 'AAAA-MM-DD HH:MM:SS', então comparar
// com date(criado_em) resolve certinho o dia inteiro.

function resumoPeriodo(dataInicio, dataFim) {
  const linha = db.prepare(`
    SELECT
      COUNT(*)               AS quantidade_pedidos,
      COALESCE(SUM(total),0) AS faturamento,
      COALESCE(AVG(total),0) AS ticket_medio
    FROM pedidos
    WHERE cancelado = 0 AND date(criado_em) BETWEEN ? AND ?
  `).get(dataInicio, dataFim);

  const itensVendidos = db.prepare(`
    SELECT COALESCE(SUM(i.quantidade),0) AS total_itens
    FROM pedido_itens i
    JOIN pedidos p ON p.id = i.pedido_id
    WHERE p.cancelado = 0 AND date(p.criado_em) BETWEEN ? AND ?
  `).get(dataInicio, dataFim);

  return {
    quantidade_pedidos: linha.quantidade_pedidos,
    faturamento: +linha.faturamento.toFixed(2),
    ticket_medio: +linha.ticket_medio.toFixed(2),
    total_itens: itensVendidos.total_itens
  };
}

function vendasPorDia(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      date(criado_em) AS dia,
      COUNT(*)        AS pedidos,
      SUM(total)      AS faturamento
    FROM pedidos
    WHERE cancelado = 0 AND date(criado_em) BETWEEN ? AND ?
    GROUP BY date(criado_em)
    ORDER BY dia
  `).all(dataInicio, dataFim);
}

function maisVendidos(dataInicio, dataFim, limite = 15) {
  return db.prepare(`
    SELECT
      i.nome,
      SUM(i.quantidade) AS quantidade,
      SUM(i.subtotal)   AS faturamento
    FROM pedido_itens i
    JOIN pedidos p ON p.id = i.pedido_id
    WHERE p.cancelado = 0 AND date(p.criado_em) BETWEEN ? AND ?
    GROUP BY i.nome
    ORDER BY quantidade DESC, faturamento DESC
    LIMIT ?
  `).all(dataInicio, dataFim, limite);
}

function porFormaPagamento(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      forma_pagamento,
      COUNT(*)   AS pedidos,
      SUM(total) AS faturamento
    FROM pedidos
    WHERE cancelado = 0 AND date(criado_em) BETWEEN ? AND ?
    GROUP BY forma_pagamento
    ORDER BY faturamento DESC
  `).all(dataInicio, dataFim);
}

function porCategoria(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      COALESCE(pr.categoria, 'Sem categoria') AS categoria,
      SUM(i.quantidade) AS quantidade,
      SUM(i.subtotal)   AS faturamento
    FROM pedido_itens i
    JOIN pedidos p  ON p.id = i.pedido_id
    LEFT JOIN produtos pr ON pr.id = i.produto_id
    WHERE p.cancelado = 0 AND date(p.criado_em) BETWEEN ? AND ?
    GROUP BY categoria
    ORDER BY faturamento DESC
  `).all(dataInicio, dataFim);
}

// Junta tudo numa chamada só, para a tela não precisar de várias idas e vindas.
function relatorioCompleto(dataInicio, dataFim) {
  return {
    periodo: { inicio: dataInicio, fim: dataFim },
    resumo: resumoPeriodo(dataInicio, dataFim),
    porDia: vendasPorDia(dataInicio, dataFim),
    maisVendidos: maisVendidos(dataInicio, dataFim),
    formasPagamento: porFormaPagamento(dataInicio, dataFim),
    categorias: porCategoria(dataInicio, dataFim)
  };
}

module.exports = { relatorioCompleto };
