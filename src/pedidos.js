const db = require('./db');
const { listaDeCores } = require('./produtos');
const DadosCliente = require('./renderer/dados-cliente');

// Endereço, CEP, documento e telefone da venda a prazo. Nenhum é
// obrigatório: o que ficou em branco só não sai no papel. O que foi
// preenchido errado (CPF que não confere, CEP pela metade) é recusado aqui,
// venha a venda da tela de pedido ou de um orçamento aprovado — é a última
// porta, e por isso ela confere de novo o que a tela já conferiu.
//
// Fora da venda a prazo esses campos não existem na tela e são ignorados.
//
// O que foi digitado vai também para a ficha do cliente (ver
// clientes.clienteDaVenda). Roda dentro da transação do pedido: se o pedido
// falhar, a ficha volta junto.
//
// Devolve o cliente_id da venda, os dados como vão gravados no pedido e se
// eles valem (gravados = 1 só na venda a prazo).
function prepararCliente({ cliente, cliente_id, formaPagamento, dadosCliente }) {
  const vazio = { telefone: null, endereco: null, cep: null, documento_tipo: null, documento: null };
  if (formaPagamento !== 'prazo') return { cliente_id, dados: vazio, gravados: 0 };

  const digitados = dadosCliente || {};
  const lista = DadosCliente.problemas(digitados);
  if (lista.length > 0) throw new Error(DadosCliente.mensagemProblemas(lista));

  const id = require('./clientes').clienteDaVenda({ cliente, cliente_id, dados: digitados });
  return { cliente_id: id, dados: DadosCliente.normalizar(digitados), gravados: 1 };
}

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

// Preço digitado na tela vale sobre o da tabela: é o valor negociado naquele
// pedido, e só nele — o cadastro da peça em Produtos não muda. Vale zero
// (peça de brinde); vazio, negativo ou texto é ignorado e a tabela prevalece.
function precoDigitado(preco) {
  const n = Number(preco);
  return preco !== null && preco !== undefined && preco !== '' && Number.isFinite(n) && n >= 0
    ? +n.toFixed(2)
    : null;
}

// Calcula o pedido inteiro.
// itens = [{ produto_id, quantidade, preco?, cor? }]  — preco é o unitário
// digitado na tela, quando a pessoa trocou o valor da tabela só para este
// pedido; cor é a escolhida na linha, para peça que existe em várias cores.
// A mesma peça pode aparecer em mais de uma linha, uma por cor.
//
// Regra dos R$ 2.000: primeiro calcula o total com a forma de pagamento escolhida.
// Se esse total atingir R$ 2.000, o pedido é recalculado com o preço de retirada
// (o mais vantajoso), porque nessa faixa a entrega é grátis / retirada vale o desconto.
// Linha com preço digitado não entra nessa troca: o valor negociado fica como está.
function calcularPedido(itens, formaPagamento) {
  const buscarProduto = db.prepare('SELECT * FROM produtos WHERE id = ?');

  // O estoque é da peça, não da linha: cinco linhas de uma unidade da mesma
  // peça, cada uma de uma cor, pedem cinco da prateleira.
  const pedidoPorPeca = new Map();
  for (const { produto_id, quantidade } of itens) {
    pedidoPorPeca.set(produto_id, (pedidoPorPeca.get(produto_id) || 0) + quantidade);
  }

  function montar(forma) {
    const linhas = itens.map(({ produto_id, quantidade, preco, cor }) => {
      const produto = buscarProduto.get(produto_id);
      if (!produto) throw new Error(`Produto não encontrado: id ${produto_id}`);
      const preco_tabela = precoPorForma(produto, forma);
      const manual = precoDigitado(preco);
      const preco_unitario = manual ?? preco_tabela;
      return {
        produto_id: produto.id,
        nome: produto.nome,
        quantidade,
        preco_unitario,
        subtotal: +(preco_unitario * quantidade).toFixed(2),
        // Para a tela mostrar de onde veio o valor e qual era o da tabela
        preco_tabela,
        preco_manual: manual !== null,
        cor: (cor && String(cor).trim()) || null,
        cores: listaDeCores(produto.cores),
        // Informativo: quanto existe em estoque e se dá para atender
        estoque_atual: produto.estoque ?? 0,
        falta: pedidoPorPeca.get(produto_id) - (produto.estoque ?? 0),
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

  // Uma entrada por peça, mesmo que ela esteja em várias linhas (cores).
  const semEstoque = resultado.linhas.filter((l, i, todas) =>
    l.falta > 0 && todas.findIndex(o => o.produto_id === l.produto_id) === i);
  const semPrecoBalcao = resultado.linhas.filter(l => l.sem_preco_balcao);

  return {
    ...resultado,
    formaPagamento,
    descontoAcimaDe2k,
    semEstoque: semEstoque.map(l => ({
      nome: l.nome,
      pedido: pedidoPorPeca.get(l.produto_id),
      tem: l.estoque_atual,
      falta: l.falta
    })),
    semPrecoBalcao: semPrecoBalcao.map(l => l.nome)
  };
}

// Salva o pedido calculado no banco e devolve o id gerado.
// Junto disso: dá baixa no estoque e, se for a prazo, abre a conta a receber.
// dadosCliente = { telefone, endereco, cep, documento_tipo, documento } — só
// na venda a prazo, e todos opcionais (ver prepararCliente).
function salvarPedido({ cliente, cliente_id, dadosCliente, formaPagamento, linhas, total, vencimento, meioPagamento, parcelas }) {
  const estoque = require('./estoque');
  const financeiro = require('./financeiro');

  const inserirPedido = db.prepare(`
    INSERT INTO pedidos (cliente, cliente_id, forma_pagamento, total, meio_pagamento,
                         cliente_telefone, cliente_endereco, cliente_cep,
                         cliente_documento_tipo, cliente_documento, cliente_dados_gravados)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const inserirItem = db.prepare(`
    INSERT INTO pedido_itens (pedido_id, produto_id, nome, cor, quantidade, preco_unitario, subtotal)
    VALUES (@pedido_id, @produto_id, @nome, @cor, @quantidade, @preco_unitario, @subtotal)
  `);

  const transacao = db.transaction(() => {
    const preparo = prepararCliente({ cliente, cliente_id, formaPagamento, dadosCliente });
    cliente_id = preparo.cliente_id;
    const d = preparo.dados;

    const info = inserirPedido.run(
      cliente || null, cliente_id || null, formaPagamento, total, meioPagamento || null,
      d.telefone, d.endereco, d.cep, d.documento_tipo, d.documento, preparo.gravados
    );
    const pedido_id = info.lastInsertRowid;

    for (const linha of linhas) {
      // A linha carrega dados extras (estoque, falta) só para a tela avisar.
      // Aqui vai apenas o que a tabela guarda.
      inserirItem.run({
        pedido_id,
        produto_id: linha.produto_id,
        nome: linha.nome,
        cor: linha.cor || null,
        quantidade: linha.quantidade,
        preco_unitario: linha.preco_unitario,
        subtotal: linha.subtotal
      });
    }

    estoque.baixarPedido(pedido_id, linhas);

    if (formaPagamento === 'prazo') {
      // parcelas = [{ vencimento, valor }] — uma cobrança por parcela.
      // Sem parcelas informadas, cria uma cobrança única com o total.
      const lista = (parcelas && parcelas.length > 0)
        ? parcelas
        : [{ vencimento: vencimento || null, valor: total }];

      lista.forEach((parcela, i) => {
        financeiro.criarConta({
          pedido_id,
          cliente_id: cliente_id || null,
          cliente_nome: cliente || null,
          valor: parcela.valor,
          vencimento: parcela.vencimento || null,
          parcela: i + 1,
          total_parcelas: lista.length
        });
      });
    }

    return pedido_id;
  });

  return transacao();
}

// Regrava um pedido que já estava salvo.
//
// Editar não é criar outro pedido: o número é o mesmo, e o que mudou tem de
// valer também no estoque e no que o cliente deve. Por isso a versão antiga é
// desfeita antes da nova entrar — as peças voltam para a prateleira e as
// cobranças em aberto são refeitas.
//
// Parcela já paga não é tocada: o dinheiro entrou de verdade. Ela continua
// como está e o que sobra a cobrar é o total novo menos o que já foi pago.
function atualizarPedido(id, { cliente, cliente_id, dadosCliente, formaPagamento, linhas, total, meioPagamento, parcelas }) {
  const estoque = require('./estoque');
  const financeiro = require('./financeiro');

  const inserirItem = db.prepare(`
    INSERT INTO pedido_itens (pedido_id, produto_id, nome, cor, quantidade, preco_unitario, subtotal)
    VALUES (@pedido_id, @produto_id, @nome, @cor, @quantidade, @preco_unitario, @subtotal)
  `);

  const transacao = db.transaction(() => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) throw new Error(`Pedido #${id} não encontrado.`);
    if (pedido.cancelado) throw new Error(`O pedido #${id} está cancelado e não pode ser editado.`);
    if (!linhas || linhas.length === 0) throw new Error('O pedido precisa de pelo menos uma peça.');

    // Antes de mexer em estoque e cobrança: se o documento ou o CEP vieram
    // errados, nada muda.
    const preparo = prepararCliente({ cliente, cliente_id, formaPagamento, dadosCliente });
    cliente_id = preparo.cliente_id;
    const d = preparo.dados;

    // 1) Devolve ao estoque o que a versão anterior tinha baixado.
    const anteriores = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(id);
    for (const item of anteriores) {
      if (!item.produto_id) continue;
      estoque.registrarMovimentacao({
        produto_id: item.produto_id,
        tipo: 'entrada',
        quantidade: item.quantidade,
        motivo: `Edição do pedido #${id} — versão anterior`,
        pedido_id: id
      });
    }

    // 2) Troca os itens pelos da versão nova e baixa o estoque de novo.
    db.prepare('DELETE FROM pedido_itens WHERE pedido_id = ?').run(id);
    for (const linha of linhas) {
      inserirItem.run({
        pedido_id: id,
        produto_id: linha.produto_id,
        nome: linha.nome,
        cor: linha.cor || null,
        quantidade: linha.quantidade,
        preco_unitario: linha.preco_unitario,
        subtotal: linha.subtotal
      });
    }
    estoque.baixarPedido(id, linhas);

    db.prepare(`
      UPDATE pedidos
      SET cliente = ?, cliente_id = ?, forma_pagamento = ?, total = ?, meio_pagamento = ?,
          cliente_telefone = ?, cliente_endereco = ?, cliente_cep = ?,
          cliente_documento_tipo = ?, cliente_documento = ?, cliente_dados_gravados = ?
      WHERE id = ?
    `).run(
      cliente || null, cliente_id || null, formaPagamento, total,
      meioPagamento || pedido.meio_pagamento || null,
      d.telefone, d.endereco, d.cep, d.documento_tipo, d.documento, preparo.gravados, id
    );

    // 3) Cobranças.
    const contas = db.prepare('SELECT * FROM contas_receber WHERE pedido_id = ?').all(id);
    const pagas = contas.filter(c => c.pago);
    const jaPago = +pagas.reduce((soma, c) => soma + c.valor, 0).toFixed(2);
    db.prepare('DELETE FROM contas_receber WHERE pedido_id = ? AND pago = 0').run(id);

    let avisoConta = null;

    if (formaPagamento === 'prazo') {
      const aCobrar = +(total - jaPago).toFixed(2);

      if (aCobrar > 0) {
        const pedidas = (parcelas && parcelas.length > 0)
          ? parcelas
          : [{ vencimento: null, valor: aCobrar }];

        // Com parcela paga no meio, os valores pedidos pela tela não fecham
        // mais com o que falta: o restante é redividido pelas datas escolhidas.
        const valores = pagas.length > 0
          ? financeiro.dividirEmParcelas(aCobrar, pedidas.length)
          : pedidas.map(p => p.valor);

        pedidas.forEach((parcela, i) => {
          financeiro.criarConta({
            pedido_id: id,
            cliente_id: cliente_id || null,
            cliente_nome: cliente || null,
            valor: valores[i],
            vencimento: parcela.vencimento || null,
            parcela: pagas.length + i + 1,
            total_parcelas: pagas.length + pedidas.length
          });
        });
      }

      if (pagas.length > 0) {
        avisoConta = aCobrar > 0
          ? `${pagas.length} ${pagas.length === 1 ? 'parcela já paga (R$' : 'parcelas já pagas (R$'} ${jaPago.toFixed(2)}) ${pagas.length === 1 ? 'foi mantida' : 'foram mantidas'}. As cobranças em aberto foram refeitas sobre os R$ ${aCobrar.toFixed(2)} que faltam.`
          : `O pedido já tem R$ ${jaPago.toFixed(2)} pagos, valor igual ou maior que o total novo (R$ ${total.toFixed(2)}). Nenhuma cobrança em aberto foi criada — confira o financeiro para acertar a diferença.`;
      }
    } else if (pagas.length > 0) {
      avisoConta = `Esse pedido deixou de ser a prazo, mas ${pagas.length === 1 ? 'uma parcela já paga continua' : `${pagas.length} parcelas já pagas continuam`} registrada${pagas.length === 1 ? '' : 's'} (R$ ${jaPago.toFixed(2)}). Confira o financeiro.`;
    }

    return { pedido_id: id, avisoConta };
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

    // Remove as cobranças que ainda não foram pagas.
    // Parcela já paga não some sozinha — o dinheiro entrou de verdade,
    // então o acerto da devolução é uma decisão da loja.
    const contas = db.prepare('SELECT * FROM contas_receber WHERE pedido_id = ?').all(id);
    const pagas = contas.filter(c => c.pago);
    const emAberto = contas.filter(c => !c.pago);

    if (emAberto.length > 0) {
      db.prepare('DELETE FROM contas_receber WHERE pedido_id = ? AND pago = 0').run(id);
    }

    let avisoConta = null;
    if (pagas.length > 0) {
      const valorPago = pagas.reduce((soma, c) => soma + c.valor, 0);
      avisoConta = pagas.length === 1
        ? `Uma parcela desse pedido já estava paga (R$ ${valorPago.toFixed(2)}). Confira o financeiro para acertar a devolução.`
        : `${pagas.length} parcelas desse pedido já estavam pagas (R$ ${valorPago.toFixed(2)} no total). Confira o financeiro para acertar a devolução.`;
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

// Apaga o pedido de vez: some do histórico e dos relatórios.
// Serve para limpar registros de teste. Antes de apagar, devolve as peças
// ao estoque (se o pedido ainda não estava cancelado) e remove as cobranças.
function excluirPedido(id) {
  const estoque = require('./estoque');

  const transacao = db.transaction(() => {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) throw new Error(`Pedido #${id} não encontrado.`);

    const itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ?').all(id);

    // Pedido cancelado já devolveu as peças; devolver de novo duplicaria o estoque.
    if (!pedido.cancelado) {
      for (const item of itens) {
        if (!item.produto_id) continue;
        estoque.registrarMovimentacao({
          produto_id: item.produto_id,
          tipo: 'entrada',
          quantidade: item.quantidade,
          motivo: `Exclusão do pedido #${id}`,
          pedido_id: null
        });
      }
    }

    db.prepare('DELETE FROM contas_receber WHERE pedido_id = ?').run(id);
    db.prepare('UPDATE movimentacoes_estoque SET pedido_id = NULL WHERE pedido_id = ?').run(id);

    // Se o pedido nasceu de um orçamento, a proposta volta a ficar em aberto:
    // como a venda deixou de existir, ela não pode continuar apontando para ela.
    db.prepare(`
      UPDATE orcamentos SET pedido_id = NULL, situacao = 'aberto' WHERE pedido_id = ?
    `).run(id);

    db.prepare('DELETE FROM pedido_itens WHERE pedido_id = ?').run(id);
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(id);

    return { pedido_id: id, itensDevolvidos: pedido.cancelado ? 0 : itens.length };
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

  // Traz as cobranças do pedido, para o cupom mostrar as datas de pagamento.
  pedido.parcelas = db.prepare(`
    SELECT parcela, total_parcelas, valor, vencimento, pago
    FROM contas_receber
    WHERE pedido_id = ?
    ORDER BY (vencimento IS NULL), vencimento, parcela
  `).all(id);
  pedido.vencimento = pedido.parcelas.length ? pedido.parcelas[0].vencimento : null;

  // Contato do cliente, para o papel sair completo.
  // - Venda a prazo gravada com os campos novos: vale só o que foi digitado
  //   nela (o endereço de quando a venda foi feita). Campo deixado em branco
  //   fica em branco — não sai no papel.
  // - As demais (e as vendas a prazo de antes): telefone e endereço da ficha
  //   do cliente, como sempre foi. CEP e documento, só na venda a prazo.
  const c = pedido.cliente_id
    ? db.prepare('SELECT nome, telefone, endereco FROM clientes WHERE id = ?').get(pedido.cliente_id) || {}
    : {};
  pedido.cliente = pedido.cliente || c.nome || null;
  if (pedido.cliente_dados_gravados) {
    pedido.telefone = pedido.cliente_telefone;
    pedido.endereco = pedido.cliente_endereco;
    pedido.cep = pedido.cliente_cep;
    pedido.documento_tipo = pedido.cliente_documento_tipo;
    pedido.documento = pedido.cliente_documento;
  } else {
    pedido.telefone = c.telefone || null;
    pedido.endereco = c.endereco || null;
    pedido.cep = null;
    pedido.documento_tipo = null;
    pedido.documento = null;
  }
  pedido.documento_texto = DadosCliente.textoDocumento(pedido.documento_tipo, pedido.documento);

  return pedido;
}

module.exports = {
  calcularPedido,
  salvarPedido,
  atualizarPedido,
  cancelarPedido,
  excluirPedido,
  listarPedidos,
  buscarPedido
};
