const { contextBridge, ipcRenderer } = require('electron');

// Ponte das folhas A4 (orcamento-doc.html, pedido-doc.html) com o processo
// principal. Só duas coisas: receber os dados e avisar que terminou de montar.
contextBridge.exposeInMainWorld('erpAPI', {
  aoReceberDocumento: (callback) => {
    ipcRenderer.on('documento:dados', (evento, dados) => callback(dados));
  },
  documentoPronto: () => ipcRenderer.send('documento:pronto')
});
