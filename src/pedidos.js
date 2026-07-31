const db = require('./db');

// Retorna o preço de um produto para uma forma de pagamento específica.
// Se o produto não tiver preço de retirada cadastrado, cai para o preço à vista.
// No balcão (varejo), se a peça não tiver preço próprio, cai para o preço à vista
// e a tela avisa — melhor vender com aviso do que travar o atendimento.
function precoPorForma(produto, forma) {
  switch (forma) {
    case 'prazo':
      return produto.preco_prazo;
    case 'vista':
      return produto.preco_vista;
    case 'vista_retirada':
      return produto.preco_vista_retirada ?? produto.preco_vista;
    case 'balcao':
      return produto.preco_balcao ?? produto.preco_vista;
    default:
      throw new Error(`Forma de pagamento inválida: ${forma}`);
  }
}

// Calcula o pedido inteiro.
// itens = [{ produto_id, quantidade }]
//
// Regra dos R$ 2.000: primeiro calcula o total com a forma de pagamento escolhida.
// Se esse total atingir R$ 2.000, o pedido é recalculado com o preço de retirada
// (o mais vantajoso), porque nessa faixa a entrega é grátis / retirada vale o desconto.
function calcularPedido(itens, formaPagamento) {
  const buscarProduto = db.prepare('SELECT * FROM produtos WHERE id = ?');

  function montar(forma) {
    const linhas = itens.map(({ produto_id, quantidade }) => {
      const produto = buscarProduto.get(produto_id);
      if (!produto) throw new Error(`Produto não encontrado: id ${produto_id}`);
      const preco_unitario = precoPorForma(produto, forma);
      return {
        produto_id: produto.id,
        nome: produto.nome,
        quantidade,
        preco_unitario,
        subtotal: +(preco_unitario * quantidade).toFixed(2),
        // Informativo: quanto existe em estoque e se dá para atender
        estoque_atual: produto.estoque ?? 0,
        falta: quantidade - (produto.estoque ?? 0),
        // Marca quando a peça não tem preço de balcão e caiu para o à vista
        sem_preco_balcao: forma === 'balcao' && produto.preco_balcao == null
      };
    });
    const total = +linhas.reduce((soma, l) => soma + l.subtotal, 0).toFixed(2);
    return { linhas, total };
  }

  let resultado = montar(formaPagamento);
  let descontoAcimaDe2k = false;

  // Regra dos R$ 2.000: vale só para pagamento à vista.
  // Pedido a prazo mantém o preço a prazo, mesmo passando de 2 mil —
  // o preço de retirada é uma condição de pagamento à vista.
  if (formaPagamento === 'vista' && resultado.total >= 2000) {
    const comRetirada = montar('vista_retirada');
    if (comRetirada.total < resultado.total) {
      resultado = comRetirada;
      descontoAcimaDe2k = true;
    }
  }

  const semEstoque = resultado.linhas.filter(l => l.falta > 0);
  const semPrecoBalcao = resultado.linhas.filter(l => l.sem_preco_balcao);

  return {
    ...resultado,
    formaPagamento,
    descontoAcimaDe2k,
    semEstoque: semEstoque.map(l => ({
      nome: l.nome,
      pedido: l.quantidade,
      tem: l.estoque_atual,
      falta: l.falta
    })),
    semPrecoBalcao: semPrecoBalcao.map(l => l.nome)
  };
}

// Salva o pedido calculado no banco e devolve o id gerado.
// Junto disso: dá baixa no estoque e, se for a prazo, abre a conta a receber.
function salvarPedido({ cliente, cliente_id, formaPagamento, linhas, total, vencimento, meioPagamento }) {
  const estoque = require('./estoque');
  const financeiro = require('./financeiro');

  const inserirPedido = db.prepare(
    `INSERT INTO pedidos (cliente, cliente_id, forma_pagamento, total, meio_pagamento)
     VALUES (?, ?, ?, ?, ?)`
  );
  const inserirItem = db.prepare(`
    INSERT INTO pedido_itens (pedido_id, produto_id, nome, quantidade, preco_unitario, subtotal)
    VALUES (@pedido_id, @produto_id, @nome, @quantidade, @preco_unitario, @subtotal)
  `);

  const transacao = db.transaction(() => {
    const info = inserirPedido.run(cliente || null, cliente_id || null, formaPagamento, total, meioPagamento || null);
    const pedido_id = info.lastInsertRowid;

    for (const linha of linhas) {
      // A linha carrega dados extras (estoque, falta) só para a tela avisar.
      // Aqui vai apenas o que a tabela guarda.
      inserirItem.run({
        pedido_id,
        produto_id: linha.produto_id,
        nome: linha.nome,
        quantidade: linha.quantidade,
        preco_unitario: linha.preco_unitario,
        subtotal: linha.subtotal
      });
    }

    estoque.baixarPedido(pedido_id, linhas);

    if (formaPagamento === 'prazo') {
      financeiro.criarConta({
        pedido_id,
        cliente_id: cliente_id || null,
        cliente_nome: cliente || null,
        valor: total,
        vencimento: vencimento || null
      });
    }

    return pedido_id;
  });

  return transacao();
}

// Cancela um pedido desfazendo tudo que ele causou:
// devolve as peças ao estoque e remove a conta a receber em aberto.
// O pedido não é apagado — fica marcado como cancelado, para o histórico
// continuar contando a verdade sobre o que aconteceu na loja.
function cancelarPedido(id, motivo) {
  const estoque = require('./estoque');

  const transacao = db.transaction(() => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) throw new Error(`Pedido #${id} não encontrado.`);
    if (pedido.cancelado) throw new Error(`O pedido #${id} já está cancelado.`);

    const itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(id);

    // Devolve cada peça ao estoque
    for (const item of itens) {
      if (!item.produto_id) continue;
      estoque.registrarMovimentacao({
        produto_id: item.produto_id,
        tipo: 'entrada',
        quantidade: item.quantidade,
        motivo: `Cancelamento do pedido #${id}`,
        pedido_id: id
      });
    }

    // Remove a cobrança, se ainda não foi paga
    const conta = db.prepare('SELECT * FROM contas_receber WHERE pedido_id = ?').get(id);
    let avisoConta = null;
    if (conta) {
      if (conta.pago) {
        avisoConta = 'A conta desse pedido já estava paga. Confira o financeiro para acertar a devolução.';
      } else {
        db.prepare('DELETE FROM contas_receber WHERE pedido_id = ?').run(id);
      }
    }

    db.prepare(`
      UPDATE pedidos
      SET cancelado = 1,
          cancelado_em = datetime('now','localtime'),
          motivo_cancelamento = ?
      WHERE id = ?
    `).run(motivo || null, id);

    return { pedido_id: id, itensDevolvidos: itens.length, avisoConta };
  });

  return transacao();
}

function listarPedidos() {
  return db.prepare('SELECT * FROM pedidos ORDER BY id DESC LIMIT 100').all();
}

function buscarPedido(id) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!pedido) return null;
  pedido.itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(id);
  return pedido;
}

module.exports = {
  calcularPedido,
  salvarPedido,
  cancelarPedido,
  listarPedidos,
  buscarPedido
};
