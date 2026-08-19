// Gerador de QR Code, sem depender de nada.
//
// POR QUE ESCRITO À MÃO
//
// O projeto tem UMA dependência (o banco de dados) e a ideia é continuar
// assim: cada biblioteca a mais é mais 200 KB no instalador e mais uma
// coisa que pode quebrar numa atualização. E principalmente: a chave PIX da
// loja não pode sair daqui para serviço nenhum de fora. Gerador de QR na
// internet é o caminho mais fácil e o mais errado — a chave e o nome de
// quem recebe iriam junto no pedido.
//
// O QUE ELE FAZ E O QUE NÃO FAZ
//
// Faz: modo byte, correção de erro nível M, versões 1 a 20. Isso cobre até
// 669 caracteres, e um código PIX tem cerca de 150.
//
// Não faz: os outros modos (numérico, alfanumérico, kanji) nem os outros
// níveis de correção. Não precisam existir para o que o sistema usa, e cada
// um seria mais tabela para conferir.
//
// Referência: ISO/IEC 18004.

// ---------------------------------------------------------------- GF(256)
//
// A correção de erro do QR trabalha num corpo finito de 256 elementos, onde
// somar é ou-exclusivo e multiplicar passa por logaritmo. As duas tabelas
// abaixo são o log e o antilog desse corpo, com polinômio 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function tabelas() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Polinômio gerador para `grau` bytes de correção.
function gerador(grau) {
  let p = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++) {
      novo[j] ^= mul(p[j], 1);
      novo[j + 1] ^= mul(p[j], EXP[i]);
    }
    p = novo;
  }
  return p;
}

// Os bytes de correção de um bloco.
function correcao(dados, quantos) {
  const g = gerador(quantos);
  const resto = new Array(quantos).fill(0);
  for (const byte of dados) {
    const fator = byte ^ resto[0];
    resto.shift();
    resto.push(0);
    if (fator !== 0) {
      for (let i = 0; i < quantos; i++) resto[i] ^= mul(g[i + 1], fator);
    }
  }
  return resto;
}

// ------------------------------------------------------------- as tabelas
//
// Por versão, no nível M: quantos bytes de correção cada bloco leva, e como
// os bytes de dados se dividem em blocos. Dois grupos porque a partir de
// certas versões os blocos não têm todos o mesmo tamanho.
//
//   [ correçãoPorBloco, blocosG1, dadosPorBlocoG1, blocosG2, dadosPorBlocoG2 ]
const NIVEL_M = {
  1:  [10, 1, 16, 0, 0],
  2:  [16, 1, 28, 0, 0],
  3:  [26, 1, 44, 0, 0],
  4:  [18, 2, 32, 0, 0],
  5:  [24, 2, 43, 0, 0],
  6:  [16, 4, 27, 0, 0],
  7:  [18, 4, 31, 0, 0],
  8:  [22, 2, 38, 2, 39],
  9:  [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
  13: [22, 8, 37, 1, 38],
  14: [24, 4, 40, 5, 41],
  15: [24, 5, 41, 5, 42],
  16: [28, 7, 45, 3, 46],
  17: [28, 10, 46, 1, 47],
  18: [26, 9, 43, 4, 44],
  19: [26, 3, 44, 11, 45],
  20: [26, 3, 41, 13, 42]
};

// Onde ficam os quadrados de alinhamento, por versão.
const ALINHAMENTO = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
  15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
  18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90]
};

const capacidade = (v) => {
  const [, b1, d1, b2, d2] = NIVEL_M[v];
  return b1 * d1 + b2 * d2;
};

const tamanho = (v) => v * 4 + 17;

// --------------------------------------------------------------- os bits

class Bits {
  constructor() { this.lista = []; }
  por(valor, quantos) {
    for (let i = quantos - 1; i >= 0; i--) this.lista.push((valor >> i) & 1);
  }
  get comprimento() { return this.lista.length; }
}

// Monta os bytes de dados: modo, tamanho, conteúdo, terminador e enchimento.
function montarDados(bytes, versao) {
  const total = capacidade(versao);
  const bits = new Bits();

  bits.por(0b0100, 4);                          // modo byte
  bits.por(bytes.length, versao <= 9 ? 8 : 16); // quantos bytes vêm
  for (const b of bytes) bits.por(b, 8);

  // Terminador: até quatro zeros, ou menos se já estiver no limite.
  const sobra = total * 8 - bits.comprimento;
  bits.por(0, Math.min(4, Math.max(0, sobra)));
  // Completa o byte.
  while (bits.comprimento % 8 !== 0) bits.lista.push(0);

  const dados = [];
  for (let i = 0; i < bits.comprimento; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits.lista[i + j];
    dados.push(b);
  }
  // Enchimento até encher a versão, alternando os dois bytes do padrão.
  const enchimento = [0xec, 0x11];
  let n = 0;
  while (dados.length < total) dados.push(enchimento[n++ % 2]);
  return dados;
}

// Divide em blocos, calcula a correção de cada um e intercala.
//
// Intercalar é o que faz um risco no papel estragar um pedaço de cada
// bloco em vez de destruir um bloco inteiro — e bloco parcialmente
// danificado é bloco que a correção consegue recuperar.
function montarCodewords(dados, versao) {
  const [ecPorBloco, b1, d1, b2, d2] = NIVEL_M[versao];
  const blocos = [];
  let i = 0;
  for (let n = 0; n < b1; n++) { blocos.push(dados.slice(i, i + d1)); i += d1; }
  for (let n = 0; n < b2; n++) { blocos.push(dados.slice(i, i + d2)); i += d2; }

  const ec = blocos.map(b => correcao(b, ecPorBloco));

  const saida = [];
  const maiorDado = Math.max(...blocos.map(b => b.length));
  for (let c = 0; c < maiorDado; c++) {
    for (const b of blocos) if (c < b.length) saida.push(b[c]);
  }
  for (let c = 0; c < ecPorBloco; c++) {
    for (const b of ec) saida.push(b[c]);
  }
  return saida;
}

// ------------------------------------------------------------- a matriz

// Marca os desenhos fixos: os três alvos dos cantos, as réguas, os
// quadrados de alinhamento e os espaços reservados da informação.
function esqueleto(versao) {
  const n = tamanho(versao);
  const m = Array.from({ length: n }, () => new Array(n).fill(null));
  const fixo = Array.from({ length: n }, () => new Array(n).fill(false));

  const por = (l, c, v) => { m[l][c] = v; fixo[l][c] = true; };

  // Alvo de canto, com a faixa branca em volta.
  const alvo = (l0, c0) => {
    for (let l = -1; l <= 7; l++) {
      for (let c = -1; c <= 7; c++) {
        const L = l0 + l, C = c0 + c;
        if (L < 0 || L >= n || C < 0 || C >= n) continue;
        const borda = (l >= 0 && l <= 6 && (c === 0 || c === 6))
          || (c >= 0 && c <= 6 && (l === 0 || l === 6));
        const miolo = l >= 2 && l <= 4 && c >= 2 && c <= 4;
        por(L, C, borda || miolo ? 1 : 0);
      }
    }
  };
  alvo(0, 0); alvo(0, n - 7); alvo(n - 7, 0);

  // Réguas: linha e coluna 6, alternando.
  for (let i = 8; i < n - 8; i++) {
    por(6, i, i % 2 === 0 ? 1 : 0);
    por(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Quadrados de alinhamento, menos onde bateriam nos alvos de canto.
  const pos = ALINHAMENTO[versao];
  for (const l0 of pos) {
    for (const c0 of pos) {
      const perto = (l0 <= 8 && c0 <= 8)
        || (l0 <= 8 && c0 >= n - 9) || (l0 >= n - 9 && c0 <= 8);
      if (perto) continue;
      for (let l = -2; l <= 2; l++) {
        for (let c = -2; c <= 2; c++) {
          const anel = Math.max(Math.abs(l), Math.abs(c));
          por(l0 + l, c0 + c, anel === 1 ? 0 : 1);
        }
      }
    }
  }

  // O módulo que é sempre preto.
  por(n - 8, 8, 1);

  // Lugares da informação de formato: ficam reservados agora e preenchidos
  // depois, quando a máscara já estiver escolhida.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { fixo[8][i] = true; fixo[i][8] = true; }
  }
  for (let i = 0; i < 8; i++) {
    fixo[8][n - 1 - i] = true;
    fixo[n - 1 - i][8] = true;
  }

  // Da versão 7 em diante há ainda a informação de versão, em dois blocos.
  if (versao >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        fixo[i][n - 11 + j] = true;
        fixo[n - 11 + j][i] = true;
      }
    }
  }

  return { m, fixo, n };
}

// Percorre os módulos livres na ordem do padrão: colunas de duas em duas,
// da direita para a esquerda, subindo e descendo em ziguezague. A coluna 6
// é pulada porque ali mora a régua.
function* caminho(n, fixo) {
  let subindo = true;
  let col = n - 1;
  while (col > 0) {
    // A régua ocupa a coluna 6 inteira. Ela é PULADA, e todas as colunas
    // à esquerda andam uma casa junto — não basta trocar a 6 pela 5, senão
    // os pares seguintes saem deslocados e o código vira ruído.
    if (col === 6) col--;
    for (let k = 0; k < n; k++) {
      const l = subindo ? n - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (!fixo[l][c]) yield [l, c];
      }
    }
    subindo = !subindo;
    col -= 2;
  }
}

const MASCARAS = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0
];

// BCH(15,5) da informação de formato, e o embaralhamento final do padrão.
function bitsDeFormato(mascara) {
  const dados = (0b00 << 3) | mascara;      // 00 = nível M
  let v = dados << 10;
  for (let i = 4; i >= 0; i--) {
    if ((v >> (i + 10)) & 1) v ^= 0b10100110111 << i;
  }
  return ((dados << 10) | v) ^ 0b101010000010010;
}

// BCH(18,6) da informação de versão, para a versão 7 em diante.
function bitsDeVersao(versao) {
  let v = versao << 12;
  for (let i = 5; i >= 0; i--) {
    if ((v >> (i + 12)) & 1) v ^= 0b1111100100101 << i;
  }
  return (versao << 12) | v;
}

function escreverFormato(m, n, mascara) {
  const bits = bitsDeFormato(mascara);
  const b = (i) => (bits >> i) & 1;

  // CUIDADO COM LINHA E COLUNA AQUI.
  //
  // A primeira cópia sobe pela COLUNA 8 e segue pela LINHA 8; a segunda faz
  // o contrário. Já escrevi isto transposto uma vez: o código ficava
  // perfeito no papel, passava em toda conferência que eu fazia, e nenhum
  // celular conseguia ler. A informação de formato é o primeiro dado que o
  // leitor procura — sem ela ele não sabe a máscara e desiste antes de
  // olhar o conteúdo.
  //
  // Primeira cópia: coluna 8 de cima para baixo, depois linha 8 da direita
  // para a esquerda.
  for (let i = 0; i <= 5; i++) m[i][8] = b(i);
  m[7][8] = b(6);
  m[8][8] = b(7);
  m[8][7] = b(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = b(i);

  // Segunda cópia: linha 8 na ponta direita, e coluna 8 na ponta de baixo.
  for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = b(i);
  for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = b(i);

  // O módulo que é sempre escuro fica logo acima da segunda cópia vertical.
  m[n - 8][8] = 1;
}

function escreverVersao(m, n, versao) {
  if (versao < 7) return;
  const bits = bitsDeVersao(versao);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >> i) & 1;
    const l = Math.floor(i / 3);
    const c = i % 3;
    m[l][n - 11 + c] = bit;
    m[n - 11 + c][l] = bit;
  }
}

// As quatro penalidades do padrão. Quanto menor, melhor a máscara.
function penalidade(m, n) {
  let p = 0;

  // 1: sequências de cinco ou mais iguais, na linha e na coluna.
  for (let i = 0; i < n; i++) {
    for (const linha of [true, false]) {
      let igual = 1;
      for (let j = 1; j < n; j++) {
        const a = linha ? m[i][j - 1] : m[j - 1][i];
        const b = linha ? m[i][j] : m[j][i];
        if (a === b) { igual++; }
        else { if (igual >= 5) p += 3 + (igual - 5); igual = 1; }
      }
      if (igual >= 5) p += 3 + (igual - 5);
    }
  }

  // 2: blocos 2x2 de uma cor só.
  for (let l = 0; l < n - 1; l++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[l][c];
      if (v === m[l][c + 1] && v === m[l + 1][c] && v === m[l + 1][c + 1]) p += 3;
    }
  }

  // 3: o desenho que imita o alvo de canto (1011101 com quatro claros ao lado).
  const alvoA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const alvoB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const bate = (pega, i, j, alvo) => {
    for (let k = 0; k < 11; k++) if (pega(i, j + k) !== alvo[k]) return false;
    return true;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      if (bate((a, b) => m[a][b], i, j, alvoA)) p += 40;
      if (bate((a, b) => m[a][b], i, j, alvoB)) p += 40;
      if (bate((a, b) => m[b][a], i, j, alvoA)) p += 40;
      if (bate((a, b) => m[b][a], i, j, alvoB)) p += 40;
    }
  }

  // 4: desequilíbrio entre claro e escuro.
  let escuros = 0;
  for (let l = 0; l < n; l++) for (let c = 0; c < n; c++) escuros += m[l][c];
  const porcento = (escuros * 100) / (n * n);
  p += Math.floor(Math.abs(porcento - 50) / 5) * 10;

  return p;
}

// A menor versão que aguenta o texto.
function versaoParaCaber(bytes) {
  for (let v = 1; v <= 20; v++) {
    const cabecalho = 4 + (v <= 9 ? 8 : 16);
    if (Math.ceil((cabecalho + bytes.length * 8) / 8) <= capacidade(v)) return v;
  }
  throw new Error(
    `Texto grande demais para QR: ${bytes.length} bytes, e o limite aqui é ` +
    `${capacidade(20)}.`
  );
}

// Gera a matriz. Devolve um array de arrays com 0 (claro) e 1 (escuro).
function gerar(texto, { versao = null } = {}) {
  const bytes = Array.from(Buffer.from(String(texto), 'utf8'));
  const v = versao || versaoParaCaber(bytes);
  if (!NIVEL_M[v]) throw new Error(`Versão de QR fora do que este gerador faz: ${v}.`);

  const codewords = montarCodewords(montarDados(bytes, v), v);

  // Escreve os dados uma vez; a máscara é aplicada depois, em cópias.
  const base = esqueleto(v);
  const bits = [];
  for (const b of codewords) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

  let n = 0;
  for (const [l, c] of caminho(base.n, base.fixo)) {
    base.m[l][c] = n < bits.length ? bits[n] : 0;
    n++;
  }

  // Escolhe a máscara com menor penalidade.
  let melhor = null;
  for (let mascara = 0; mascara < 8; mascara++) {
    const m = base.m.map(linha => linha.slice());
    for (let l = 0; l < base.n; l++) {
      for (let c = 0; c < base.n; c++) {
        if (!base.fixo[l][c] && MASCARAS[mascara](l, c)) m[l][c] ^= 1;
      }
    }
    escreverFormato(m, base.n, mascara);
    escreverVersao(m, base.n, v);

    const p = penalidade(m, base.n);
    if (!melhor || p < melhor.p) melhor = { m, p, mascara };
  }

  melhor.m.versao = v;
  melhor.m.mascara = melhor.mascara;
  return melhor.m;
}

// Lê os módulos de dados de volta, na mesma ordem em que foram escritos.
//
// Existe para o teste: se o que sai daqui não for igual ao que entrou, algum
// passo entre o ziguezague, a máscara e a intercalação está errado. Não
// corrige erro — só desfaz o caminho.
// Lê a informação de formato de volta DA MATRIZ, como um leitor de verdade
// faria: pega os 15 módulos, desfaz o embaralhamento e separa nível e
// máscara. Devolve null se as duas cópias não concordarem.
//
// Existe porque confiar na variável guardada esconde justamente o erro que
// derruba o leitor — foi assim que um formato transposto passou batido.
function lerFormato(m) {
  const n = m.length;

  const copia1 = [];
  for (let i = 0; i <= 5; i++) copia1.push(m[i][8]);
  copia1.push(m[7][8], m[8][8], m[8][7]);
  for (let i = 9; i <= 14; i++) copia1.push(m[8][14 - i]);

  const copia2 = [];
  for (let i = 0; i <= 7; i++) copia2.push(m[8][n - 1 - i]);
  for (let i = 8; i <= 14; i++) copia2.push(m[n - 15 + i][8]);

  const juntar = (bits) => bits.reduce((v, b, i) => v | (b << i), 0);
  const a = juntar(copia1);
  const b = juntar(copia2);
  if (a !== b) return null;

  const limpo = a ^ 0b101010000010010;
  const dados = limpo >> 10;
  return { nivel: dados >> 3, mascara: dados & 0b111, iguais: true };
}

function lerCodewords(m) {
  const n = m.length;
  const versao = m.versao;
  const base = esqueleto(versao);
  // A máscara vem do código, não da variável — é o que o leitor faz.
  const formato = lerFormato(m);
  const mascara = formato ? formato.mascara : m.mascara;

  const bits = [];
  for (const [l, c] of caminho(n, base.fixo)) {
    let bit = m[l][c];
    if (MASCARAS[mascara](l, c)) bit ^= 1;
    bits.push(bit);
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }

  // Desfaz a intercalação. O que está na matriz não é o texto em ordem: é
  // um byte de cada bloco, em rodízio. Sem desfazer isso, a leitura devolve
  // os bytes certos na ordem errada — e parece que o gerador está quebrado
  // quando não está.
  const [, b1, d1, b2, d2] = NIVEL_M[versao];
  const tamanhos = [...Array(b1).fill(d1), ...Array(b2).fill(d2)];
  const blocos = tamanhos.map(() => []);
  const maior = Math.max(...tamanhos);
  let i = 0;
  for (let c = 0; c < maior; c++) {
    for (let b = 0; b < blocos.length; b++) {
      if (c < tamanhos[b]) blocos[b].push(bytes[i++]);
    }
  }
  return [].concat(...blocos);
}

// A matriz como SVG, para entrar no documento sem virar arquivo de imagem.
//
// `margem` é a faixa branca em volta, que o padrão exige: sem ela o leitor
// não acha as bordas. Quatro módulos é o mínimo.
function paraSVG(m, { modulo = 4, margem = 4, cor = '#000' } = {}) {
  const n = m.length;
  const lado = (n + margem * 2) * modulo;

  let caminhos = '';
  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      if (!m[l][c]) continue;
      caminhos += `M${(c + margem) * modulo} ${(l + margem) * modulo}h${modulo}v${modulo}h-${modulo}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" ` +
    `viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#fff"/>` +
    `<path d="${caminhos}" fill="${cor}"/></svg>`;
}

const paraDataURI = (m, opcoes) =>
  'data:image/svg+xml;base64,' + Buffer.from(paraSVG(m, opcoes)).toString('base64');

module.exports = {
  gerar, paraSVG, paraDataURI, lerCodewords, lerFormato,
  capacidade, tamanho, versaoParaCaber,
  bitsDeFormato, bitsDeVersao, correcao, NIVEL_M
};
