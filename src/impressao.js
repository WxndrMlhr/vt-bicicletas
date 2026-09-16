const path = require('path');
const { execFile } = require('child_process');
const { BrowserWindow } = require('electron');
const configuracoes = require('./configuracoes');
const dialogos = require('./dialogos');

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

  // Com diálogo, o cupom disputa a mesma tranca do "Salvar como" e da folha
  // A4: são todos modais da mesma janela, e dois deles abertos ao mesmo
  // tempo é o que fazia o sistema parar de aceitar teclado. Silencioso não
  // abre janela nenhuma, então passa direto.
  return silencioso
    ? mandarCupom(pedido, opcoes, salvo, silencioso)
    : dialogos.exclusivo('Imprimir cupom',
        () => mandarCupom(pedido, opcoes, salvo, silencioso));
}

// O pageSize do Electron fala em micra; o navegador mede em px de tela, que
// são 96 por polegada.
const MICRA_POR_PX = 25400 / 96;

// Sobra no fim do cupom, para o corte não comer a última linha.
//
// 8mm bastam, e há medida por trás: o layout de impressão é mais CURTO que o
// da tela (medido na POS80 da loja: 220mm de impressão contra 222,8mm que a
// tela informa), então a altura já sai com folga antes desta.
const SOBRA_MM = 8;

// Quando não dá para medir, um rolo de tamanho fixo. Sai papel em branco no
// fim, mas imprime — e não mandar tamanho nenhum é o caso que NÃO imprime.
const ALTURA_RESERVA_MICRA = 297 * 1000;

// Mede a altura do cupom montado.
//
// Espera as imagens antes de medir: a logo fica no alto e o QR do pix no pé,
// e medir antes de eles decodificarem dá folha curta demais — o fim do cupom
// sairia cortado, defeito pior que o que estamos consertando.
async function medirAlturaMicra(janela) {
  const px = await janela.webContents.executeJavaScript(`(async () => {
    await Promise.all(Array.from(document.images).map(
      img => img.complete ? null : img.decode().catch(() => null)));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return Math.ceil(Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight));
  })()`, true);
  return Math.round(Number(px) * MICRA_POR_PX);
}

// O tamanho de página que vai junto com a impressão silenciosa.
//
// Sem ele, quem responde "de que tamanho é a página?" é o diálogo do Windows.
// Silenciosa não abre diálogo, a térmica devolve papel "UNKNOWN", e o
// Chromium monta um documento de ZERO página: o trabalho entra na fila com 0
// bytes, o spooler descarta, e print() ainda chama de volta dizendo sucesso.
// O balcão dava o cupom por impresso e nada saía do papel.
function tamanhoDaPagina(larguraMM, alturaMicra) {
  const largura = Math.round((Number(larguraMM) || 72) * 1000);
  const altura = Math.round(Number(alturaMicra) || ALTURA_RESERVA_MICRA)
    + SOBRA_MM * 1000;
  return {
    width: largura,
    height: Math.min(Math.max(altura, 40 * 1000), 2000 * 1000)
  };
}

function mandarCupom(pedido, opcoes, salvo, silencioso) {
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
    janela.webContents.ipc.once('recibo:pronto', async () => {
      // Medir ainda vale o prazo curto da montagem: faz parte de preparar.
      let pageSize = null;
      if (silencioso) {
        try {
          pageSize = tamanhoDaPagina(larguraMM, await medirAlturaMicra(janela));
        } catch (erro) {
          pageSize = tamanhoDaPagina(larguraMM, ALTURA_RESERVA_MICRA);
        }
      }

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
      // Só na silenciosa: com diálogo, quem escolhe o papel é a pessoa.
      if (pageSize) opcoesImpressao.pageSize = pageSize;
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
      // O bloco de pagamento vai montado daqui: o cupom não precisa saber
      // desenhar QR, e o mesmo código serve para a folha A4.
      //
      // No balcão ele não sai. O cliente pagou na hora e está indo embora:
      // um QR de "pague por PIX" no comprovante dele não serve para nada —
      // serve no orçamento e no pedido a prazo, que é quem paga depois.
      //
      // A regra olha a forma de pagamento, e não a tela que mandou imprimir,
      // para a reimpressão pelo Histórico sair igual à primeira via. É o
      // mesmo documento; sair diferente conforme o caminho é defeito.
      //
      // A impressão de teste força `comPix` porque é justamente nela que se
      // confere a altura do cupom inteiro, com o QR no pé.
      const comPix = opcoes.comPix ?? (pedido.forma_pagamento !== 'balcao');

      let pagamento = null;
      if (comPix) {
        try {
          pagamento = require('./pagamento').dados();
        } catch (erro) {
          console.error('[impressao] cupom sem bloco de pagamento:', erro.message);
        }
      }
      janela.webContents.send('recibo:dados', pedido, { larguraMM, pagamento });
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
