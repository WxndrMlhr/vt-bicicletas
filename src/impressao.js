const path = require('path');
const { BrowserWindow } = require('electron');

// Imprime um pedido abrindo uma janela oculta com o layout do cupom
// e mandando para a impressora do Windows (a mini impressora USB).
//
// opcoes:
//   silencioso = true  -> imprime direto na impressora padrão, sem diálogo
//   silencioso = false -> abre a janela de impressão do Windows
//   nomeImpressora     -> nome exato da impressora (opcional)
function imprimirPedido(pedido, { silencioso = false, nomeImpressora = '' } = {}) {
  return new Promise((resolve, reject) => {
    const janela = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-recibo.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    let jaResolveu = false;
    const finalizar = (erro, resultado) => {
      if (jaResolveu) return;
      jaResolveu = true;
      if (!janela.isDestroyed()) janela.destroy();
      erro ? reject(erro) : resolve(resultado);
    };

    // A tela do recibo avisa quando terminou de montar o conteúdo.
    janela.webContents.ipc.once('recibo:pronto', () => {
      const opcoes = {
        silent: silencioso,
        printBackground: false,
        margins: { marginType: 'none' }
      };
      if (nomeImpressora) opcoes.deviceName = nomeImpressora;

      janela.webContents.print(opcoes, (sucesso, motivoFalha) => {
        if (!sucesso && motivoFalha !== 'cancelled') {
          finalizar(new Error(motivoFalha || 'Falha ao imprimir'));
        } else {
          finalizar(null, { impresso: sucesso, motivo: motivoFalha || null });
        }
      });
    });

    janela.webContents.once('did-finish-load', () => {
      janela.webContents.send('recibo:dados', pedido);
    });

    janela.loadFile(path.join(__dirname, 'renderer', 'recibo.html'))
      .catch(finalizar);

    // Rede de segurança: se algo travar, não deixa a janela pendurada.
    setTimeout(() => finalizar(new Error('Tempo esgotado ao preparar a impressão')), 20000);
  });
}

// Lista as impressoras instaladas no computador, para o usuário escolher.
async function listarImpressoras() {
  const janela = BrowserWindow.getAllWindows()[0];
  if (!janela) return [];
  return await janela.webContents.getPrintersAsync();
}

module.exports = { imprimirPedido, listarImpressoras };
