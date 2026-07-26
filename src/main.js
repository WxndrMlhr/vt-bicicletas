const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const produtos = require('./produtos');
const catalogo = require('./catalogo');
const pedidos = require('./pedidos');
const impressao = require('./impressao');
const relatorios = require('./relatorios');
const clientes = require('./clientes');
const estoque = require('./estoque');
const financeiro = require('./financeiro');
const backup = require('./backup');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    title: 'VT Bicicletas',
    icon: path.join(__dirname, 'renderer', 'icone.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'pedidos.html'));

  // Descomente a linha abaixo se precisar diagnosticar algum erro na interface
  // win.webContents.openDevTools();
}

ipcMain.handle('produtos:listar', () => produtos.listarProdutos());

ipcMain.handle('produtos:buscar', (event, termo) => produtos.buscarProdutos(termo));

ipcMain.handle('produtos:adicionar', (event, dadosProduto) =>
  produtos.adicionarProduto(dadosProduto)
);

ipcMain.handle('produtos:atualizar', (event, id, dadosProduto) =>
  produtos.atualizarProduto(id, dadosProduto)
);

ipcMain.handle('produtos:excluir', (event, id) => produtos.excluirProduto(id));

ipcMain.handle('produtos:reajustar', (e, percentual, categoria) =>
  produtos.reajustarPrecos(percentual, categoria)
);

ipcMain.handle('produtos:categorias', () => produtos.listarCategorias());

ipcMain.handle('produtos:alteracoes', () => produtos.listarAlteracoes());

ipcMain.handle('produtos:desfazer', (e, id) => produtos.desfazerAlteracao(id));

// --- Backup ---
ipcMain.handle('backup:fazer', () => backup.fazerBackup({ manual: true }));
ipcMain.handle('backup:listar', () => backup.listarBackups());
ipcMain.handle('backup:abrirPasta', () => shell.openPath(backup.pastaBackups()));
ipcMain.handle('backup:caminhos', () => backup.caminhos());
ipcMain.handle('backup:abrirDados', () => shell.openPath(backup.caminhos().dados));
ipcMain.handle('backup:restaurar', (e, arquivo) => {
  const r = backup.restaurarBackup(arquivo);
  // O app precisa reiniciar para abrir o banco restaurado.
  app.relaunch();
  setTimeout(() => app.exit(0), 400);
  return r;
});

ipcMain.handle('catalogo:buscar', (event, termo) => catalogo.buscarNoCatalogo(termo));

ipcMain.handle('pedidos:calcular', (event, itens, forma) =>
  pedidos.calcularPedido(itens, forma)
);

ipcMain.handle('pedidos:salvar', (event, dados) => pedidos.salvarPedido(dados));

ipcMain.handle('pedidos:listar', () => pedidos.listarPedidos());

ipcMain.handle('pedidos:buscar', (event, id) => pedidos.buscarPedido(id));

ipcMain.handle('pedidos:cancelar', (e, id, motivo) => pedidos.cancelarPedido(id, motivo));

ipcMain.handle('impressao:imprimir', (event, pedidoId, opcoes) => {
  const pedido = pedidos.buscarPedido(pedidoId);
  if (!pedido) throw new Error(`Pedido #${pedidoId} não encontrado`);
  return impressao.imprimirPedido(pedido, opcoes || {});
});

ipcMain.handle('impressao:listar', () => impressao.listarImpressoras());

ipcMain.handle('relatorios:gerar', (event, inicio, fim) =>
  relatorios.relatorioCompleto(inicio, fim)
);

// --- Clientes ---
ipcMain.handle('clientes:listar', () => clientes.listarClientes());
ipcMain.handle('clientes:buscar', (e, termo) => clientes.buscarClientes(termo));
ipcMain.handle('clientes:adicionar', (e, dados) => clientes.adicionarCliente(dados));
ipcMain.handle('clientes:atualizar', (e, id, dados) => clientes.atualizarCliente(id, dados));
ipcMain.handle('clientes:excluir', (e, id) => clientes.excluirCliente(id));
ipcMain.handle('clientes:ficha', (e, id) => clientes.fichaCliente(id));

// --- Estoque ---
ipcMain.handle('estoque:listar', (e, filtro) => estoque.listarEstoque(filtro || ''));
ipcMain.handle('estoque:movimentar', (e, dados) => estoque.registrarMovimentacao(dados));
ipcMain.handle('estoque:ajustar', (e, id, saldo, motivo) => estoque.ajustarSaldo(id, saldo, motivo));
ipcMain.handle('estoque:minimo', (e, id, minimo) => estoque.definirEstoqueMinimo(id, minimo));
ipcMain.handle('estoque:baixo', () => estoque.estoqueBaixo());
ipcMain.handle('estoque:historico', (e, id) => estoque.historicoProduto(id));
ipcMain.handle('estoque:resumo', () => estoque.resumoEstoque());

// --- Financeiro ---
ipcMain.handle('financeiro:listar', (e, situacao) => financeiro.listarContas(situacao));
ipcMain.handle('financeiro:baixar', (e, id) => financeiro.darBaixa(id));
ipcMain.handle('financeiro:reabrir', (e, id) => financeiro.reabrirConta(id));
ipcMain.handle('financeiro:excluir', (e, id) => financeiro.excluirConta(id));
ipcMain.handle('financeiro:vencimento', (e, id, data) => financeiro.alterarVencimento(id, data));
ipcMain.handle('financeiro:resumo', () => financeiro.resumoFinanceiro());

app.whenReady().then(() => {
  // Cópia de segurança do dia, feita assim que o app abre.
  try {
    const feito = backup.fazerBackup();
    if (feito) console.log(`[VT Bicicletas] Backup do dia criado: ${feito.arquivo}`);
  } catch (erro) {
    console.error('[VT Bicicletas] Não foi possível fazer o backup:', erro.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
