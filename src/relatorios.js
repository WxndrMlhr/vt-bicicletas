const db = require('./db');

// As datas chegam no formato 'AAAA-MM-DD' (o mesmo dos campos <input type="date">).
// O banco guarda criado_em como 'AAAA-MM-DD HH:MM:SS', então comparar
// com date(criado_em) resolve certinho o dia inteiro.

// O relatório é do ATACADO. A venda de balcão fica de fora.
//
// São dois negócios diferentes dentro da mesma loja: a peça avulsa que sai no
// balcão e o pedido do cliente que revende. Somados num total só, o número
// não descreve nenhum dos dois — e é o segundo que se acompanha de perto,
// porque é dele que vêm as contas a receber.
//
// 'balcao' é a forma que a tela do Balcão grava; o Pedido atacado usa
// prazo, vista e vista_retirada, e só essas três.
const SO_ATACADO = "forma_pagamento <> 'balcao'";

// Filtro que vale para toda consulta deste arquivo: atacado, não cancelado,
// dentro do período.
const DO_PERIODO = `cancelado = 0 AND ${SO_ATACADO} AND date(criado_em) BETWEEN ? AND ?`;

function resumoPeriodo(dataInicio, dataFim) {
  const linha = db.prepare(`
    SELECT
      COUNT(*)               AS quantidade_pedidos,
      COALESCE(SUM(total),0) AS faturamento,
      COALESCE(AVG(total),0) AS ticket_medio
    FROM pedidos
    WHERE ${DO_PERIODO}
  `).get(dataInicio, dataFim);

  return {
    quantidade_pedidos: linha.quantidade_pedidos,
    faturamento: +linha.faturamento.toFixed(2),
    ticket_medio: +linha.ticket_medio.toFixed(2)
  };
}

function vendasPorDia(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      date(criado_em) AS dia,
      COUNT(*)        AS pedidos,
      SUM(total)      AS faturamento
    FROM pedidos
    WHERE ${DO_PERIODO}
    GROUP BY date(criado_em)
    ORDER BY dia
  `).all(dataInicio, dataFim);
}

function porFormaPagamento(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      forma_pagamento,
      COUNT(*)   AS pedidos,
      SUM(total) AS faturamento
    FROM pedidos
    WHERE ${DO_PERIODO}
    GROUP BY forma_pagamento
    ORDER BY faturamento DESC
  `).all(dataInicio, dataFim);
}

// Quem comprou no período, do maior para o menor gasto.
//
// Agrupa pelo nome gravado na venda, que é o que vai no papel. Pedido lançado
// sem nome entra todo junto como "Consumidor": é melhor uma linha honesta de
// avulsos do que um punhado de linhas em branco.
function porCliente(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      COALESCE(NULLIF(TRIM(cliente), ''), 'Consumidor') AS cliente,
      COUNT(*)             AS pedidos,
      SUM(total)           AS faturamento,
      MAX(date(criado_em)) AS ultima_compra
    FROM pedidos
    WHERE ${DO_PERIODO}
    GROUP BY COALESCE(NULLIF(TRIM(cliente), ''), 'Consumidor')
    ORDER BY faturamento DESC, cliente
  `).all(dataInicio, dataFim);
}

// O período escrito como se fala: "Dia 07/10/2026", "Outubro de 2026",
// "Ano de 2026" ou, quando não fecha um mês nem um ano, "De ... a ...".
//
// Mora aqui e não na folha do relatório porque dois lugares precisam da
// mesma frase: o título impresso e o nome do arquivo PDF.
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function diaBR(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function tituloPeriodo(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return 'Período';
  if (dataInicio === dataFim) return `Dia ${diaBR(dataInicio)}`;

  const [anoI, mesI, diaI] = dataInicio.split('-').map(Number);
  const [anoF, mesF, diaF] = dataFim.split('-').map(Number);

  // Dia 0 do mês seguinte é o último dia deste mês. Em UTC para o fuso
  // não empurrar a data para o dia anterior.
  const ultimoDia = new Date(Date.UTC(anoF, mesF, 0)).getUTCDate();

  if (anoI === anoF && mesI === 1 && diaI === 1 && mesF === 12 && diaF === 31) {
    return `Ano de ${anoI}`;
  }
  if (anoI === anoF && mesI === mesF && diaI === 1 && diaF === ultimoDia) {
    const mes = MESES[mesI - 1];
    return `${mes[0].toUpperCase()}${mes.slice(1)} de ${anoI}`;
  }
  return `De ${diaBR(dataInicio)} a ${diaBR(dataFim)}`;
}

// Junta tudo numa chamada só, para a tela não precisar de várias idas e vindas.
function relatorioCompleto(dataInicio, dataFim) {
  return {
    periodo: {
      inicio: dataInicio,
      fim: dataFim,
      titulo: tituloPeriodo(dataInicio, dataFim)
    },
    resumo: resumoPeriodo(dataInicio, dataFim),
    porDia: vendasPorDia(dataInicio, dataFim),
    formasPagamento: porFormaPagamento(dataInicio, dataFim),
    clientes: porCliente(dataInicio, dataFim)
  };
}

module.exports = { relatorioCompleto, tituloPeriodo };
