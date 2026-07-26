const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Onde fica a pasta de dados.
//
// Rodando pelo código (npm start): dentro do projeto, fácil de achar.
// Rodando como programa instalado: na pasta de dados do usuário, porque
// a pasta onde o .exe fica instalado é somente-leitura no Windows.
function pastaBase() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) return app.getPath('userData');
  } catch (e) {
    // fora do Electron (scripts, testes) — usa a pasta do projeto
  }
  return path.join(__dirname, '..');
}

const pastaDados = path.join(pastaBase(), 'dados');
if (!fs.existsSync(pastaDados)) fs.mkdirSync(pastaDados, { recursive: true });

const dbPath = path.join(pastaDados, 'vtbicicletas.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT,
    preco_prazo REAL NOT NULL,
    preco_vista REAL NOT NULL,
    preco_vista_retirada REAL,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS catalogo_referencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente TEXT,
    forma_pagamento TEXT NOT NULL,
    total REAL NOT NULL,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pedido_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER,
    nome TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    preco_unitario REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );
`);

// Semeia o catálogo de referência só na primeira vez (tabela vazia).
// Isso não é o estoque da loja — é uma lista de nomenclatura de peças
// pra ajudar a preencher o cadastro de produto mais rápido.
const totalReferencia = db.prepare('SELECT COUNT(*) AS total FROM catalogo_referencia').get().total;
if (totalReferencia === 0) {
  const inserir = db.prepare('INSERT INTO catalogo_referencia (nome, categoria) VALUES (?, ?)');
  const itens = [
    // Roda livre / catraca
    ['Roda Livre 14 dentes', 'Transmissão'],
    ['Roda Livre 16 dentes', 'Transmissão'],
    ['Roda Livre 18 dentes', 'Transmissão'],
    ['Roda Livre Shimano 6v', 'Transmissão'],
    ['Roda Livre Shimano 7v', 'Transmissão'],
    ['Catraca Shimano 7v', 'Transmissão'],
    ['Catraca Shimano 8v', 'Transmissão'],
    ['Catraca Shimano 9v', 'Transmissão'],
    // Corrente
    ['Corrente 1/2x1/8', 'Transmissão'],
    ['Corrente Shimano 7/8v', 'Transmissão'],
    ['Corrente Shimano 9v', 'Transmissão'],
    // Pneu
    ['Pneu Aro 26', 'Rodas'],
    ['Pneu Aro 29', 'Rodas'],
    ['Pneu Aro 20 BMX', 'Rodas'],
    ['Pneu Speed 700c', 'Rodas'],
    // Câmara de ar
    ['Câmara de Ar Aro 26', 'Rodas'],
    ['Câmara de Ar Aro 29', 'Rodas'],
    ['Câmara de Ar Aro 20', 'Rodas'],
    // Freios
    ['Pastilha de Freio a Disco', 'Freios'],
    ['Sapata de Freio V-Brake', 'Freios'],
    ['Manete de Freio', 'Freios'],
    ['Disco de Freio 160mm', 'Freios'],
    ['Disco de Freio 180mm', 'Freios'],
    // Câmbio
    ['Câmbio Dianteiro Shimano', 'Transmissão'],
    ['Câmbio Traseiro Shimano', 'Transmissão'],
    // Selim e guidão
    ['Selim Confort', 'Acessórios'],
    ['Guidão MTB Reto', 'Acessórios'],
    ['Manopla Emborrachada', 'Acessórios'],
    // Pedal
    ['Pedal Plataforma', 'Acessórios'],
    ['Pedal Clip', 'Acessórios'],
    // Rodas / cubo
    ['Cubo Dianteiro', 'Rodas'],
    ['Cubo Traseiro', 'Rodas'],
    ['Aro Aero 26', 'Rodas'],
    ['Raio Inox', 'Rodas'],
    // Suspensão
    ['Garfo de Suspensão', 'Suspensão'],
    // Segurança / acessórios
    ['Capacete Ciclismo', 'Acessórios'],
    ['Cadeado de Bicicleta', 'Acessórios'],
    ['Suporte de Garrafa', 'Acessórios']
  ];
  const inserirTodos = db.transaction((lista) => {
    for (const [nome, categoria] of lista) inserir.run(nome, categoria);
  });
  inserirTodos(itens);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    endereco TEXT,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,            -- 'entrada' ou 'saida'
    quantidade INTEGER NOT NULL,
    motivo TEXT,
    pedido_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS contas_receber (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER,
    cliente_id INTEGER,
    cliente_nome TEXT,
    valor REAL NOT NULL,
    vencimento TEXT,
    pago INTEGER NOT NULL DEFAULT 0,
    pago_em TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS alteracoes_preco (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,          -- 'massa' ou 'individual'
    descricao TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    desfeito INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS alteracoes_preco_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alteracao_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    preco_prazo REAL,
    preco_vista REAL,
    preco_vista_retirada REAL,
    FOREIGN KEY (alteracao_id) REFERENCES alteracoes_preco(id)
  );
`);

// Migrações: adiciona colunas novas em bancos que já existiam,
// sem apagar nada do que já está gravado.
function garantirColuna(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (!colunas.some(c => c.name === coluna)) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

garantirColuna('produtos', 'estoque', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('produtos', 'estoque_minimo', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('pedidos', 'cliente_id', 'INTEGER');
garantirColuna('pedidos', 'cancelado', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('pedidos', 'cancelado_em', 'TEXT');
garantirColuna('pedidos', 'motivo_cancelamento', 'TEXT');

// Carrega automaticamente a tabela de preços da VT Bicicletas.
// Só insere os itens que ainda não existem (compara pelo nome),
// então pode rodar toda vez que o app abre, sem duplicar nada.
const { itens: itensIniciais, categorizar } = require('./dados-iniciais');

const existePorNome = db.prepare('SELECT 1 FROM produtos WHERE nome = ?');
const inserirProduto = db.prepare(`
  INSERT INTO produtos (nome, categoria, preco_prazo, preco_vista, preco_vista_retirada)
  VALUES (?, ?, ?, ?, ?)
`);

const carregarIniciais = db.transaction(() => {
  let novos = 0;
  for (const [nome, prazo, vista, retirada] of itensIniciais) {
    if (!existePorNome.get(nome)) {
      inserirProduto.run(nome, categorizar(nome), prazo, vista, retirada);
      novos++;
    }
  }
  return novos;
});

const novosProdutos = carregarIniciais();
if (novosProdutos > 0) {
  console.log(`[VT Bicicletas] ${novosProdutos} produtos da tabela de preços carregados.`);
}

module.exports = db;
