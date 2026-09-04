const db = require('./db');

function buscarNoCatalogo(termo) {
  // É esta a busca que o orçamento chama a cada tecla. Sem acento dos dois
  // lados: "camara" tem de trazer "Câmara de ar".
  const like = `%${db.semAcento(termo)}%`;
  return db.prepare(`
    SELECT nome, categoria FROM produtos WHERE sem_acento(nome) LIKE ?
    UNION
    SELECT nome, categoria FROM catalogo_referencia WHERE sem_acento(nome) LIKE ?
    ORDER BY nome
    LIMIT 15
  `).all(like, like);
}

module.exports = { buscarNoCatalogo };
