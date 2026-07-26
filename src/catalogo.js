const db = require('./db');

function buscarNoCatalogo(termo) {
  const like = `%${termo}%`;
  return db.prepare(`
    SELECT nome, categoria FROM produtos WHERE nome LIKE ?
    UNION
    SELECT nome, categoria FROM catalogo_referencia WHERE nome LIKE ?
    ORDER BY nome
    LIMIT 15
  `).all(like, like);
}

module.exports = { buscarNoCatalogo };
