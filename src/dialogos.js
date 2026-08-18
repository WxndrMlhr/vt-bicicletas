const { BrowserWindow } = require('electron');

// Um diálogo do Windows por vez. Nunca dois.
//
// POR QUE ISTO EXISTE
//
// Diálogo do Windows — "Salvar como", "Imprimir" — é MODAL: enquanto está
// aberto, a janela dona dele não aceita teclado nem mouse. Isso é normal e
// esperado, desde que haja exatamente um.
//
// O problema aparece com dois. Duas chamadas quase juntas — dois cliques no
// mesmo botão, ou um botão de PDF numa tela e um de imprimir noutra —
// abrem dois diálogos presos à MESMA janela. O Windows mostra um só; o
// outro fica esperando atrás, sem barra de tarefas e sem como ser
// encontrado. A pessoa responde o que vê, e a janela continua bloqueada
// pelo que não vê.
//
// O sintoma é "o sistema travou, não consigo digitar". E não passa: o
// diálogo invisível nunca vai ser respondido, então só fechar o programa
// resolve.
//
// Tentei consertar antes garantindo que o diálogo se prendesse a uma janela
// VISÍVEL. Estava certo e não era suficiente: tratava ONDE o diálogo se
// prende, não QUANTOS podem existir. Este arquivo trata o quantos, que é a
// causa de verdade.
//
// A escolha de recusar em vez de enfileirar é deliberada: uma fila faria o
// segundo diálogo pular na tela minutos depois, quando a pessoa já esqueceu
// que pediu — e "Salvar como" aparecendo do nada é assustador. Recusar com
// mensagem clara, e trazer a janela para a frente, mostra à pessoa o que
// ela precisa responder.

// Quanto tempo um diálogo pode ficar "aberto" antes de assumirmos que ele
// já morreu sem avisar.
//
// Sem esta válvula, um diálogo que nunca responde deixaria a tranca fechada
// para sempre, e imprimir pararia de funcionar até reiniciar. Dez minutos é
// mais do que qualquer pessoa leva para escolher uma pasta, e menos do que
// um turno de trabalho.
const LIMITE_ABANDONO = 10 * 60 * 1000;

let aberto = null;          // { oque, quando }

// A janela que pode ser dona de um diálogo.
//
// Tem de ser VISÍVEL. As folhas A4 e o cupom são montados em janelas
// ocultas, e elas aparecem em getAllWindows() enquanto existem — às vezes
// na frente da principal. Diálogo presso a uma delas abre invisível.
function janelaVisivel() {
  return BrowserWindow.getAllWindows()
    .find(j => !j.isDestroyed() && j.isVisible()) || null;
}

// Traz a janela para a frente antes de abrir o diálogo, para ele não nascer
// atrás de outro programa.
function trazerParaFrente(janela) {
  if (!janela || janela.isDestroyed()) return;
  try {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  } catch (e) {
    // Janela sumindo no meio do caminho não é motivo para atrapalhar.
  }
}

function estaOcupado() {
  if (!aberto) return false;
  if (Date.now() - aberto.quando > LIMITE_ABANDONO) {
    console.warn(
      `[dialogos] "${aberto.oque}" está aberto há mais de ` +
      `${LIMITE_ABANDONO / 60000} minutos; assumindo que morreu e liberando.`
    );
    aberto = null;
    return false;
  }
  return true;
}

// Roda `fn` com a garantia de que nenhum outro diálogo está aberto.
//
// `fn` recebe a janela visível (ou null, quando não há nenhuma — aí o
// diálogo deve abrir solto, que é melhor que preso numa janela escondida).
async function exclusivo(oque, fn) {
  if (estaOcupado()) {
    trazerParaFrente(janelaVisivel());
    const erro = new Error(
      `Já existe uma janela do Windows aberta (${aberto.oque}). ` +
      'Responda ou feche ela antes de pedir outra.'
    );
    erro.ocupado = true;
    throw erro;
  }

  aberto = { oque, quando: Date.now() };
  const janela = janelaVisivel();
  trazerParaFrente(janela);
  try {
    return await fn(janela);
  } finally {
    // No finally, e não depois do await: exceção no meio não pode deixar a
    // tranca fechada.
    aberto = null;
  }
}

// Para os testes e para diagnóstico.
const oQueEstaAberto = () => (estaOcupado() ? aberto.oque : null);

module.exports = { exclusivo, janelaVisivel, oQueEstaAberto, LIMITE_ABANDONO };
