const db = require('./db');
const pedidos = require('./pedidos');

// Orçamento = proposta escrita para o cliente.
// Diferença para o pedido: não dá baixa no estoque e não abre conta a receber.
// Nada acontece na loja até o cliente aprovar — aí o orçamento vira pedido.

const VALIDADE_PADRAO_DIAS = 7;

function dataISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hojeISO() {
  return dataISO(new Date());
}

// Data sugerida de validade quando a tela não manda nenhuma.
function validadePadrao(dias = VALIDADE_PADRAO_DIAS) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return dataISO(d);
}

// Os preços do orçamento saem da mesma regra do pedido (inclusive a dos R$ 2.000),
// para o cliente não receber uma proposta com valor diferente do que vai pagar.
function calcularOrcamento(itens, formaPagamento) {
  return pedidos.calcularPedido(itens, formaPagamento);
}

// Um orçamento em aberto que passou da validade não é "recusado" —
// só venceu. A situação gravada continua 'aberto'; quem calcula isso é aqui.
function situacaoEfetiva(orcamento) {
  if (orcamento.situacao !== 'aberto') return orcamento.situacao;
  if (orcamento.validade && orcamento.validade < hojeISO()) return 'expirado';
  return 'aberto';
}

const inserirItem = () => db.prepare(`
  INSERT INTO orcamento_itens (orcamento_id, produto_id, nome, quantidade, preco_unitario, subtotal)
  VALUES (@orcamento_id, @produto_id, @nome, @quantidade, @preco_unitario, @subtotal)
`);

// A linha vinda da tela carrega dados extras (estoque, falta) só para o aviso.
// Aqui vai apenas o que a tabela guarda.
function gravarItens(orcamento_id, linhas) {
  const inserir = inserirItem();
  for (const linha of linhas) {
    inserir.run({
      orcamento_id,
      produto_id: linha.produto_id ?? null,
      nome: linha.nome,
      quantidade: linha.quantidade,
      preco_unitario: linha.preco_unitario,
      subtotal: linha.subtotal
    });
  }
}

function salvarOrcamento({
  cliente, cliente_id, telefone, formaPagamento, linhas, total, validade, observacoes
}) {
  if (!linhas || linhas.length === 0) {
    throw new Error('O orçamento precisa de pelo menos uma peça.');
  }

  const inserir = db.prepare(`
    INSERT INTO orcamentos
      (cliente, cliente_id, telefone, forma_pagamento, total, validade, observacoes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transacao = db.transaction(() => {
    const info = inserir.run(
      cliente || null,
      cliente_id || null,
      telefone || null,
      formaPagamento,
      total,
      validade || validadePadrao(),
      observacoes || null
    );
    const orcamento_id = info.lastInsertRowid;
    gravarItens(orcamento_id, linhas);
    return orcamento_id;
  });

  return transacao();
}

// Reescreve um orçamento que ainda está em aberto.
// Depois de virar pedido ele não muda mais — senão a proposta deixaria de
// bater com a venda que já foi registrada.
function atualizarOrcamento(id, {
  cliente, cliente_id, telefone, formaPagamento, linhas, total, validade, observacoes
}) {
  if (!linhas || linhas.length === 0) {
    throw new Error('O orçamento precisa de pelo menos uma peça.');
  }

  const transacao = db.transaction(() => {
    const atual = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!atual) throw new Error(`Orçamento #${id} não encontrado.`);
    if (atual.pedido_id) {
      throw new Error(`O orçamento #${id} já virou o pedido #${atual.pedido_id} e não pode mais ser alterado.`);
    }

    db.prepare(`
      UPDATE orcamentos
      SET cliente = ?, cliente_id = ?, telefone = ?, forma_pagamento = ?,
          total = ?, validade = ?, observacoes = ?
      WHERE id = ?
    `).run(
      cliente || null,
      cliente_id || null,
      telefone || null,
      formaPagamento,
      total,
      validade || validadePadrao(),
      observacoes || null,
      id
    );

    db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id = ?').run(id);
    gravarItens(id, linhas);
    return id;
  });

  return transacao();
}

function listarOrcamentos(filtro = 'todos') {
  const lista = db.prepare(`
    SELECT o.*,
           (SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id) AS total_itens
    FROM orcamentos o
    ORDER BY o.id DESC
    LIMIT 300
  `).all();

  const comSituacao = lista.map(o => ({ ...o, situacao_efetiva: situacaoEfetiva(o) }));
  if (!filtro || filtro === 'todos') return comSituacao;
  return comSituacao.filter(o => o.situacao_efetiva === filtro);
}

function buscarOrcamento(id) {
  const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
  if (!orcamento) return null;

  orcamento.itens = db.prepare(
    'SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY id'
  ).all(id);
  orcamento.situacao_efetiva = situacaoEfetiva(orcamento);

  // Endereço e telefone vêm da ficha do cliente quando ele é cadastrado —
  // assim o documento sai completo sem redigitar nada.
  if (orcamento.cliente_id) {
    const c = db.prepare('SELECT nome, telefone, endereco FROM clientes WHERE id = ?')
      .get(orcamento.cliente_id);
    if (c) {
      orcamento.cliente = orcamento.cliente || c.nome;
      orcamento.telefone = orcamento.telefone || c.telefone;
      orcamento.endereco = c.endereco;
    }
  }

  return orcamento;
}

// 'aberto' | 'aprovado' | 'recusado'.
// Marcar como aprovado aqui é só anotação: quem registra a venda de verdade
// é o converterEmPedido.
function definirSituacao(id, situacao) {
  const validas = ['aberto', 'aprovado', 'recusado'];
  if (!validas.includes(situacao)) {
    throw new Error(`Situação inválida: ${situacao}`);
  }
  const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
  if (!orcamento) throw new Error(`Orçamento #${id} não encontrado.`);
  if (orcamento.pedido_id && situacao !== 'aprovado') {
    throw new Error(`O orçamento #${id} já virou o pedido #${orcamento.pedido_id}.`);
  }
  db.prepare('UPDATE orcamentos SET situacao = ? WHERE id = ?').run(situacao, id);
  return { id, situacao };
}

// Renova a validade de um orçamento que venceu, sem refazer a proposta.
function prorrogar(id, novaValidade) {
  const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
  if (!orcamento) throw new Error(`Orçamento #${id} não encontrado.`);
  const data = novaValidade || validadePadrao();
  db.prepare('UPDATE orcamentos SET validade = ?, situacao = ? WHERE id = ?')
    .run(data, 'aberto', id);
  return { id, validade: data };
}

// Cliente aprovou: o orçamento vira pedido.
// Os preços gravados no orçamento são mantidos, mesmo que a tabela tenha
// mudado depois — foi esse valor que a loja prometeu.
// A partir daqui valem as regras normais do pedido: baixa de estoque e,
// se for a prazo, as contas a receber.
function converterEmPedido(id, { parcelas, meioPagamento } = {}) {
  const orcamento = buscarOrcamento(id);
  if (!orcamento) throw new Error(`Orçamento #${id} não encontrado.`);
  if (orcamento.pedido_id) {
    throw new Error(`O orçamento #${id} já virou o pedido #${orcamento.pedido_id}.`);
  }
  if (orcamento.itens.length === 0) {
    throw new Error(`O orçamento #${id} não tem nenhuma peça.`);
  }

  const pedido_id = pedidos.salvarPedido({
    cliente: orcamento.cliente,
    cliente_id: orcamento.cliente_id,
    formaPagamento: orcamento.forma_pagamento,
    linhas: orcamento.itens.map(i => ({
      produto_id: i.produto_id,
      nome: i.nome,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      subtotal: i.subtotal
    })),
    total: orcamento.total,
    meioPagamento: meioPagamento || null,
    parcelas: orcamento.forma_pagamento === 'prazo' ? parcelas : null
  });

  db.prepare(`
    UPDATE orcamentos SET situacao = 'aprovado', pedido_id = ? WHERE id = ?
  `).run(pedido_id, id);

  return { orcamento_id: id, pedido_id };
}

// Apaga a proposta. O pedido gerado a partir dela, se existir, continua —
// a venda aconteceu de verdade e não some junto com o papel.
function excluirOrcamento(id) {
  const transacao = db.transaction(() => {
    const orcamento = db.prepare('SELECT * FROM orcamentos WHERE id = ?').get(id);
    if (!orcamento) throw new Error(`Orçamento #${id} não encontrado.`);
    db.prepare('DELETE FROM orcamento_itens WHERE orcamento_id = ?').run(id);
    db.prepare('DELETE FROM orcamentos WHERE id = ?').run(id);
    return { orcamento_id: id, pedido_id: orcamento.pedido_id || null };
  });
  return transacao();
}

function resumoOrcamentos() {
  const lista = listarOrcamentos('todos');
  const somar = f => +lista.filter(f).reduce((s, o) => s + o.total, 0).toFixed(2);
  return {
    abertos: lista.filter(o => o.situacao_efetiva === 'aberto').length,
    valor_aberto: somar(o => o.situacao_efetiva === 'aberto'),
    expirados: lista.filter(o => o.situacao_efetiva === 'expirado').length,
    aprovados: lista.filter(o => o.situacao_efetiva === 'aprovado').length,
    valor_aprovado: somar(o => o.situacao_efetiva === 'aprovado'),
    recusados: lista.filter(o => o.situacao_efetiva === 'recusado').length
  };
}

module.exports = {
  calcularOrcamento,
  salvarOrcamento,
  atualizarOrcamento,
  listarOrcamentos,
  buscarOrcamento,
  definirSituacao,
  prorrogar,
  converterEmPedido,
  excluirOrcamento,
  resumoOrcamentos,
  validadePadrao
};
