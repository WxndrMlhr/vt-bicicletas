const { contextBridge, ipcRenderer } = require('electron');

// Aqui vamos expor, aos poucos, as funções que a interface (renderer)
// poderá chamar com segurança: cadastrar produto, criar pedido,
// imprimir na mini impressora, consultar estoque, etc.
contextBridge.exposeInMainWorld('erpAPI', {
  versaoApp: () => process.versions.electron,

  produtos: {
    listar: () => ipcRenderer.invoke('produtos:listar'),
    buscar: (termo) => ipcRenderer.invoke('produtos:buscar', termo),
    adicionar: (dados) => ipcRenderer.invoke('produtos:adicionar', dados),
    atualizar: (id, dados) => ipcRenderer.invoke('produtos:atualizar', id, dados),
    excluir: (id) => ipcRenderer.invoke('produtos:excluir', id),
    reajustar: (percentual, categoria) => ipcRenderer.invoke('produtos:reajustar', percentual, categoria),
    categorias: () => ipcRenderer.invoke('produtos:categorias'),
    alteracoes: () => ipcRenderer.invoke('produtos:alteracoes'),
    desfazer: (id) => ipcRenderer.invoke('produtos:desfazer', id)
  },

  backup: {
    fazer: () => ipcRenderer.invoke('backup:fazer'),
    listar: () => ipcRenderer.invoke('backup:listar'),
    restaurar: (arquivo) => ipcRenderer.invoke('backup:restaurar', arquivo),
    abrirPasta: () => ipcRenderer.invoke('backup:abrirPasta'),
    caminhos: () => ipcRenderer.invoke('backup:caminhos'),
    abrirDados: () => ipcRenderer.invoke('backup:abrirDados')
  },

  catalogo: {
    buscar: (termo) => ipcRenderer.invoke('catalogo:buscar', termo)
  },

  pedidos: {
    calcular: (itens, forma) => ipcRenderer.invoke('pedidos:calcular', itens, forma),
    salvar: (dados) => ipcRenderer.invoke('pedidos:salvar', dados),
    listar: () => ipcRenderer.invoke('pedidos:listar'),
    buscar: (id) => ipcRenderer.invoke('pedidos:buscar', id),
    cancelar: (id, motivo) => ipcRenderer.invoke('pedidos:cancelar', id, motivo),
    excluir: (id) => ipcRenderer.invoke('pedidos:excluir', id)
  },

  impressao: {
    imprimir: (pedidoId, opcoes) => ipcRenderer.invoke('impressao:imprimir', pedidoId, opcoes),
    listarImpressoras: () => ipcRenderer.invoke('impressao:listar')
  },

  relatorios: {
    gerar: (inicio, fim) => ipcRenderer.invoke('relatorios:gerar', inicio, fim)
  },

  clientes: {
    listar: () => ipcRenderer.invoke('clientes:listar'),
    buscar: (termo) => ipcRenderer.invoke('clientes:buscar', termo),
    adicionar: (dados) => ipcRenderer.invoke('clientes:adicionar', dados),
    atualizar: (id, dados) => ipcRenderer.invoke('clientes:atualizar', id, dados),
    excluir: (id) => ipcRenderer.invoke('clientes:excluir', id),
    ficha: (id) => ipcRenderer.invoke('clientes:ficha', id)
  },

  estoque: {
    listar: (filtro) => ipcRenderer.invoke('estoque:listar', filtro),
    movimentar: (dados) => ipcRenderer.invoke('estoque:movimentar', dados),
    ajustar: (id, saldo, motivo) => ipcRenderer.invoke('estoque:ajustar', id, saldo, motivo),
    definirMinimo: (id, minimo) => ipcRenderer.invoke('estoque:minimo', id, minimo),
    baixo: () => ipcRenderer.invoke('estoque:baixo'),
    historico: (id) => ipcRenderer.invoke('estoque:historico', id),
    resumo: () => ipcRenderer.invoke('estoque:resumo')
  },

  financeiro: {
    listar: (situacao) => ipcRenderer.invoke('financeiro:listar', situacao),
    darBaixa: (id) => ipcRenderer.invoke('financeiro:baixar', id),
    reabrir: (id) => ipcRenderer.invoke('financeiro:reabrir', id),
    excluir: (id) => ipcRenderer.invoke('financeiro:excluir', id),
    alterarVencimento: (id, data) => ipcRenderer.invoke('financeiro:vencimento', id, data),
    resumo: () => ipcRenderer.invoke('financeiro:resumo')
  }
});
