// Carga da tabela de preços que vem junto com o programa.
//
// Antes, essa carga rodava a cada abertura e re-inseria tudo que estivesse
// faltando — o que fazia produto apagado de propósito voltar sozinho no dia
// seguinte. Agora ela acontece uma vez só, na primeira vez.
//
// Recebe o `db` por parâmetro de propósito: assim o db.js pode usar este
// módulo durante a própria criação do banco, sem require circular.

const { itens: itensIniciais, categorizar } = require('./dados-iniciais');
const { precosBalcao } = require('./dados-balcao');

function lerMarca(db) {
  const linha = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?')
    .get('catalogo_semeado');
  return linha ? linha.valor : null;
}

function marcar(db, valor) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES ('catalogo_semeado', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(valor);
}

function jaSemeado(db) {
  return lerMarca(db) === '1';
}

// Insere os produtos que ainda não existem (compara pelo nome) e preenche os
// preços de balcão que estiverem vazios. Não sobrescreve preço que a loja
// tenha ajustado, e não mexe em produto que já esteja cadastrado.
function semear(db, { forcar = false } = {}) {
  if (!forcar && jaSemeado(db)) return { novos: 0, balcao: 0, pulado: true };

  const existePorNome = db.prepare('SELECT 1 FROM produtos WHERE nome = ?');
  const inserirProduto = db.prepare(`
    INSERT INTO produtos (nome, categoria, preco_prazo, preco_vista, preco_vista_retirada)
    VALUES (?, ?, ?, ?, ?)
  `);
  const definirBalcao = db.prepare(
    'UPDATE produtos SET preco_balcao = ? WHERE nome = ? AND preco_balcao IS NULL'
  );

  const rodar = db.transaction(() => {
    let novos = 0;
    for (const [nome, prazo, vista, retirada] of itensIniciais) {
      if (!existePorNome.get(nome)) {
        inserirProduto.run(nome, categorizar(nome), prazo, vista, retirada);
        novos++;
      }
    }
    let balcao = 0;
    for (const [nome, preco] of precosBalcao) {
      if (definirBalcao.run(preco, nome).changes > 0) balcao++;
    }
    marcar(db, '1');
    return { novos, balcao, pulado: false };
  });

  return rodar();
}

// Decide o que fazer quando o programa abre.
//
//   já marcado                 -> não faz nada
//   banco que já tem produtos  -> só marca como semeado, sem mexer em nada.
//                                 É o caso de quem já usava o sistema: para
//                                 de re-inserir a cada abertura.
//   banco novo, vazio          -> carrega a tabela de preços, como sempre fez
function naAbertura(db) {
  if (lerMarca(db) !== null) return { acao: 'nada' };

  const total = db.prepare('SELECT COUNT(*) AS n FROM produtos').get().n;
  if (total > 0) {
    marcar(db, '1');
    return { acao: 'marcado', produtos: total };
  }

  return { acao: 'semeado', ...semear(db, { forcar: true }) };
}

module.exports = { semear, jaSemeado, naAbertura, totalDisponivel: itensIniciais.length };
