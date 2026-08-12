const path = require('path');
const { execFile } = require('child_process');
const { BrowserWindow } = require('electron');
const configuracoes = require('./configuracoes');

const TEMPO_MONTAGEM = 20000;              // montar o cupom
const TEMPO_IMPRESSAO = 5 * 60 * 1000;     // esperar a resposta do diálogo

// Imprime um pedido abrindo uma janela oculta com o layout do cupom
// e mandando para a impressora do Windows (a mini impressora USB).
//
// O que não vier nas opções sai da tela de Configurações:
//   silencioso     -> imprime direto, sem o diálogo do Windows
//   nomeImpressora -> impressora fixa (vazio = a padrão do Windows)
//   larguraMM      -> largura ÚTIL de impressão (72 para papel de 80mm,
//                     48 para papel de 58mm)
function imprimirPedido(pedido, opcoes = {}) {
  const salvo = configuracoes.opcoesDeImpressao();
  const silencioso = opcoes.silencioso ?? salvo.silenciosa;
  const nomeImpressora = opcoes.nomeImpressora ?? salvo.impressora;
  const larguraMM = opcoes.larguraMM ?? salvo.larguraMM;
  // tempoLimite existe para os testes exercitarem a rede de segurança.
  const tempoImpressao = opcoes.tempoLimite ?? TEMPO_IMPRESSAO;

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
    let redeDeSeguranca = null;
    const finalizar = (erro, resultado) => {
      if (jaResolveu) return;
      jaResolveu = true;
      clearTimeout(redeDeSeguranca);
      if (!janela.isDestroyed()) janela.destroy();
      erro ? reject(erro) : resolve(resultado);
    };

    // Rede de segurança da MONTAGEM: se o cupom não ficar pronto, não deixa
    // a janela oculta pendurada. Vale só até o conteúdo montar — depois disso
    // o prazo é outro, porque a impressão espera a pessoa responder o diálogo.
    redeDeSeguranca = setTimeout(
      () => finalizar(new Error('Tempo esgotado ao preparar a impressão')),
      TEMPO_MONTAGEM
    );

    // A tela do recibo avisa quando terminou de montar o conteúdo.
    janela.webContents.ipc.once('recibo:pronto', () => {
      // Montou: troca o prazo curto pelo longo, senão um diálogo de impressão
      // aberto por mais de 20 segundos fazia a janela morrer no meio.
      clearTimeout(redeDeSeguranca);
      redeDeSeguranca = setTimeout(
        () => finalizar(null, { impresso: false, motivo: 'sem-resposta' }),
        tempoImpressao
      );

      const opcoesImpressao = {
        silent: silencioso,
        printBackground: false,
        margins: { marginType: 'none' }
      };
      if (nomeImpressora) opcoesImpressao.deviceName = nomeImpressora;

      janela.webContents.print(opcoesImpressao, (sucesso, motivoFalha) => {
        if (!sucesso && motivoFalha !== 'cancelled') {
          finalizar(new Error(motivoFalha || 'Falha ao imprimir'));
        } else {
          finalizar(null, { impresso: sucesso, motivo: motivoFalha || null });
        }
      });
    });

    janela.webContents.once('did-finish-load', () => {
      janela.webContents.send('recibo:dados', pedido, { larguraMM });
    });

    janela.loadFile(path.join(__dirname, 'renderer', 'recibo.html'))
      .catch(finalizar);
  });
}

// Lista as impressoras instaladas no computador, para o usuário escolher.
async function listarImpressoras() {
  const janela = BrowserWindow.getAllWindows()[0];
  if (!janela) return [];
  return await janela.webContents.getPrintersAsync();
}

// Pergunta ao Windows quais tamanhos de papel o driver da impressora aceita.
//
// O Electron não expõe isso (o getPrintersAsync só devolve nome, status e
// modelo do driver), então a informação vem do WMI. Os nomes são texto livre
// do fabricante — em impressora térmica costumam trazer a medida dentro,
// tipo "80(72.1) x 297mm", e é daí que a largura é deduzida.
//
// Isso é uma sugestão, não uma verdade: a tela sempre deixa o usuário
// escolher na mão.
function papeisDaImpressora(nome) {
  return new Promise((resolve) => {
    if (!nome) return resolve({ papeis: [], sugestaoMM: null });

    // -EncodedCommand evita qualquer problema de aspas com o nome da
    // impressora, que pode ter espaço, parêntese e acento.
    const script = `
      $ErrorActionPreference = 'Stop'
      $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq ${JSON.stringify(nome).replace(/"/g, "'")} }
      if ($p -and $p.PrinterPaperNames) { $p.PrinterPaperNames -join "\`n" }
    `;
    const codificado = Buffer.from(script, 'utf16le').toString('base64');

    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', codificado],
      { timeout: 10000, windowsHide: true },
      (erro, saida) => {
        if (erro) return resolve({ papeis: [], sugestaoMM: null });

        const papeis = String(saida).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        resolve({ papeis, sugestaoMM: deduzirLargura(papeis) });
      });
  });
}

// Tenta achar a largura útil olhando os nomes de papel do driver.
//
// "80(72.1) x 297mm" -> o número entre parênteses é a área imprimível: 72
// "58 x 297mm"       -> 58mm de papel, que imprime ~48
// Sem nada reconhecível, devolve null e a tela pergunta.
function deduzirLargura(papeis) {
  for (const nome of papeis) {
    const comUtil = nome.match(/(\d{2,3})\s*\(\s*(\d{2,3})(?:[.,]\d+)?\s*\)/);
    if (comUtil) return Math.round(Number(comUtil[2]));
  }
  for (const nome of papeis) {
    const larguras = (nome.match(/(\d{2,3})\s*(?:mm)?\s*[x×]/i) || [])[1];
    const n = Number(larguras);
    if (n === 80) return 72;
    if (n === 58) return 48;
    if (n === 76) return 72;
  }
  return null;
}

module.exports = { imprimirPedido, listarImpressoras, papeisDaImpressora };
