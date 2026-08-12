const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erpAPI', {
  // Recebe os dados do pedido e os ajustes de impressão (largura do papel).
  aoReceberRecibo: (callback) => {
    ipcRenderer.on('recibo:dados', (evento, pedido, opcoes) => callback(pedido, opcoes || {}));
  },
  // Avisa o processo principal que o recibo terminou de montar.
  reciboPronto: () => ipcRenderer.send('recibo:pronto')
});
