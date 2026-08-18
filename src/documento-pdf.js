const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog, shell, app } = require('electron');

// Máquina de gerar documento em folha A4: abre a página do desenho numa janela
// invisível, entrega os dados e pede o PDF (ou manda para a impressora).
// Quem usa isso são o orcamento-pdf.js e o pedido-pdf.js — a diferença entre
// eles é só a página do desenho e o nome do arquivo.

const TEMPO_LIMITE = 20000;

// A impressão espera a pessoa responder o diálogo do Windows, então
// tem uma folga bem maior que a montagem do documento.
const TEMPO_LIMITE_IMPRESSAO = 5 * 60 * 1000;

// Quem cuida de não deixar dois diálogos do Windows abertos ao mesmo tempo,
// e de prendê-los sempre numa janela visível. O porquê está lá dentro.
const dialogos = require('./dialogos');

// Abre a janela oculta, manda os dados e devolve quando a página avisar
// que terminou de montar. Quem chama é responsável por destruir a janela.
function prepararDocumento(pagina, dados) {
  return new Promise((resolve, reject) => {
    const janela = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload-documento.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    let resolvido = false;
    const falhar = (erro) => {
      if (resolvido) return;
      resolvido = true;
      if (!janela.isDestroyed()) janela.destroy();
      reject(erro);
    };

    janela.webContents.ipc.once('documento:pronto', () => {
      if (resolvido) return;
      resolvido = true;
      resolve(janela);
    });

    janela.webContents.once('did-finish-load', () => {
      janela.webContents.send('documento:dados', dados);
    });

    janela.loadFile(path.join(__dirname, 'renderer', pagina)).catch(falhar);

    setTimeout(() => falhar(new Error('Tempo esgotado ao montar o documento.')), TEMPO_LIMITE);
  });
}

// Tira do nome do arquivo tudo que o Windows não aceita.
function nomeSeguro(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// Pasta sugerida dentro de Documentos.
// Se por algum motivo não der para criar, cai para a área de trabalho.
function pastaEmDocumentos(nomePasta) {
  try {
    const pasta = path.join(app.getPath('documents'), nomePasta);
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
    return pasta;
  } catch (e) {
    try {
      return app.getPath('desktop');
    } catch (e2) {
      return app.getPath('userData');
    }
  }
}

// Monta o par salvar/imprimir para um tipo de documento.
//
//   pagina      -> arquivo em renderer/ que desenha a folha
//   pasta       -> nome da pasta sugerida dentro de Documentos
//   titulo      -> título da janela "Salvar como"
//   nomeArquivo -> função que recebe os dados e devolve o nome do .pdf
function criarGerador({ pagina, pasta, titulo, nomeArquivo }) {
  const pastaSugerida = () => pastaEmDocumentos(pasta);

  // Salva o documento em PDF.
  // A janela de "Salvar como" abre antes de montar a folha: se a pessoa
  // desistir, nada é gerado à toa.
  //
  // opcoes:
  //   caminho      -> salva direto nesse arquivo, sem perguntar
  //   abrirDepois  -> abre o PDF no leitor do Windows quando terminar
  async function salvarComoPDF(dados, { caminho = '', abrirDepois = true } = {}) {
    let destino = caminho;

    if (!destino) {
      const opcoesDialogo = {
        title: titulo,
        defaultPath: path.join(pastaSugerida(), nomeArquivo(dados)),
        filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      };
      const escolha = await dialogos.exclusivo(titulo, (pai) => (pai
        ? dialog.showSaveDialog(pai, opcoesDialogo)
        : dialog.showSaveDialog(opcoesDialogo)));
      if (escolha.canceled || !escolha.filePath) return { cancelado: true };
      destino = escolha.filePath;
    }

    if (!destino.toLowerCase().endsWith('.pdf')) destino += '.pdf';

    const janela = await prepararDocumento(pagina, dados);
    try {
      // Quem manda na margem é o @page do documento.css (preferCSSPageSize),
      // por isso as margens aqui vão zeradas — senão somariam com as do CSS.
      const pdf = await janela.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      fs.writeFileSync(destino, pdf);
    } finally {
      if (!janela.isDestroyed()) janela.destroy();
    }

    if (abrirDepois) shell.openPath(destino);

    return { cancelado: false, caminho: destino, arquivo: path.basename(destino) };
  }

  // Manda o mesmo documento para uma impressora de folha A4
  // (a mini impressora de cupom é usada só pelo impressao.js).
  // tempoLimite existe para os testes conseguirem exercitar a rede de
  // segurança sem esperar os cinco minutos reais.
  async function imprimir(dados, {
    silencioso = false, nomeImpressora = '', tempoLimite = TEMPO_LIMITE_IMPRESSAO
  } = {}) {
    const fazer = async () => {
      const janela = await prepararDocumento(pagina, dados);
      return mandarParaImpressora(janela, { silencioso, nomeImpressora, tempoLimite });
    };

    // Impressão silenciosa não abre janela do Windows, então não disputa a
    // tranca. Com diálogo, disputa: ele é tão modal quanto o "Salvar como",
    // e dois modais na mesma janela é o que travava o sistema.
    return silencioso ? fazer() : dialogos.exclusivo(`Imprimir — ${titulo}`, fazer);
  }

  function mandarParaImpressora(janela, { silencioso, nomeImpressora, tempoLimite }) {
    return new Promise((resolve, reject) => {
      // A margem também vem do @page do documento — 'none' evita
      // que a impressora acrescente a dela por cima.
      const opcoes = {
        silent: silencioso,
        printBackground: true,
        margins: { marginType: 'none' }
      };
      if (nomeImpressora) opcoes.deviceName = nomeImpressora;

      let terminou = false;
      const finalizar = (erro, resultado) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(rede);
        if (!janela.isDestroyed()) janela.destroy();
        erro ? reject(erro) : resolve(resultado);
      };

      // Rede de segurança: se o print() nunca chamar de volta (acontece
      // quando o diálogo do Windows é fechado de um jeito estranho), a janela
      // oculta ficaria viva para sempre — e janela oculta pendurada é o que
      // fazia o "Salvar como" seguinte abrir invisível e travar o app.
      const rede = setTimeout(
        () => finalizar(null, { impresso: false, motivo: 'sem-resposta' }),
        tempoLimite
      );

      janela.webContents.print(opcoes, (sucesso, motivoFalha) => {
        if (!sucesso && motivoFalha && motivoFalha !== 'cancelled') {
          finalizar(new Error(motivoFalha));
        } else {
          finalizar(null, { impresso: sucesso, motivo: motivoFalha || null });
        }
      });
    });
  }

  const abrirPasta = () => shell.openPath(pastaSugerida());

  return { salvarComoPDF, imprimir, abrirPasta, pastaSugerida };
}

module.exports = { criarGerador, nomeSeguro };
