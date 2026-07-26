const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erpAPI', {
  // Recebe os dados do pedido enviados pelo processo principal.
  aoReceberRecibo: (callback) => {
    ipcRenderer.on('recibo:dados', (evento, pedido) => callback(pedido));
  },
  // Avisa o processo principal que o recibo terminou de montar.
  reciboPronto: () => ipcRenderer.send('recibo:pronto')
});
