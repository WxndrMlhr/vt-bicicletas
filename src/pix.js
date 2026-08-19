// O "copia e cola" do PIX, e o conteúdo do QR.
//
// O padrão é o BR Code do Banco Central, que por sua vez segue o EMV MPM:
// o texto inteiro é uma sequência de campos no formato ID + TAMANHO + VALOR,
// onde o ID tem 2 dígitos e o TAMANHO tem 2 dígitos. Campos podem conter
// outros campos dentro (é o caso do 26 e do 62).
//
// Exemplo de leitura:
//   00 02 01     campo 00, tamanho 02, valor "01"
//   52 04 0000   campo 52, tamanho 04, valor "0000"
//
// Referência: Manual do BR Code, Banco Central do Brasil.

// Cada campo tem um limite de tamanho no padrão. Estourar não dá erro de
// montagem — dá QR que o banco recusa na hora de pagar, que é pior, porque
// só se descobre com o cliente na frente.
const LIMITE = {
  chave: 77,
  nome: 25,
  cidade: 15,
  descricao: 72,
  txid: 25
};

// Monta um campo. O tamanho é contado em CARACTERES e vem com dois dígitos.
function campo(id, valor) {
  const v = String(valor);
  if (v.length > 99) {
    throw new Error(`O campo ${id} tem ${v.length} caracteres e o máximo é 99.`);
  }
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

// CRC-16/CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF, sem inversão.
//
// É o que fecha o BR Code. Um dígito errado aqui e o aplicativo do banco
// diz "QR inválido" — não é um detalhe que dá para deixar passar.
function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Tira acento e deixa em maiúscula.
//
// O padrão aceita só um subconjunto do ASCII nos campos de nome e cidade.
// "Nova Iguaçu" com cedilha faz alguns aplicativos mostrarem caractere
// estranho no lugar do nome de quem recebe.
const semAcento = (t) => String(t ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7E]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

// Deixa a chave no formato que o padrão espera.
//
// Telefone precisa de +55 e DDD — "21983320678" sozinho não é chave válida.
// CPF e CNPJ vão só com os dígitos. E-mail e chave aleatória vão como estão.
// CPF e telefone celular têm os MESMOS 11 dígitos, e não dá para
// distinguir pelo formato. O que separa os dois é o dígito verificador:
// CPF tem conta de conferência, número de telefone não tem. Um telefone
// que por acaso passe nessa conta é possível, mas raro — e para esse caso
// existe o parâmetro `tipo`, que manda mais que o palpite.
function pareceCPF(n) {
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (const [ate, peso] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(n[i]) * (peso - i);
    let d = (soma * 10) % 11;
    if (d === 10) d = 0;
    if (d !== Number(n[ate])) return false;
  }
  return true;
}

// Os DDDs que existem no Brasil. Serve para não chamar de telefone um
// número de 11 dígitos que começa com algo impossível.
const DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

function arrumarChave(chave, tipo = null) {
  const bruta = String(chave ?? '').trim();
  if (!bruta) throw new Error('Informe a chave PIX.');

  // Quando o tipo vem dito, ele decide — sem adivinhação.
  if (tipo === 'telefone') {
    const n = bruta.replace(/\D/g, '');
    return { chave: n.startsWith('55') && n.length > 11 ? '+' + n : '+55' + n, tipo: 'telefone' };
  }
  if (tipo === 'cpf' || tipo === 'cnpj') {
    return { chave: bruta.replace(/\D/g, ''), tipo: tipo.toUpperCase() };
  }

  if (bruta.includes('@')) return { chave: bruta.toLowerCase(), tipo: 'e-mail' };

  // Chave aleatória: 32 hexadecimais, com ou sem hífen.
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(bruta)) {
    return { chave: bruta.toLowerCase(), tipo: 'aleatória' };
  }

  const numeros = bruta.replace(/\D/g, '');

  if (bruta.startsWith('+')) return { chave: '+' + numeros, tipo: 'telefone' };
  if (numeros.length === 13 && numeros.startsWith('55')) {
    return { chave: '+' + numeros, tipo: 'telefone' };
  }
  if (numeros.length === 14) return { chave: numeros, tipo: 'CNPJ' };

  if (numeros.length === 11) {
    // O CPF ganha do telefone quando a conta de conferência fecha: número
    // de telefone que passa nela é raro, CPF que não passa é erro de
    // digitação, e mandar PIX para a chave errada não tem volta.
    if (pareceCPF(numeros)) return { chave: numeros, tipo: 'CPF' };
    if (DDD.has(Number(numeros.slice(0, 2))) && numeros[2] === '9') {
      return { chave: '+55' + numeros, tipo: 'telefone' };
    }
    return { chave: numeros, tipo: 'CPF' };
  }

  throw new Error(
    `Não reconheci "${bruta}" como chave PIX. ` +
    'Use CPF, CNPJ, telefone com DDD, e-mail ou chave aleatória.'
  );
}

// Monta o código.
//
// `valor` fica de fora quando não vier: QR sem valor deixa o cliente digitar
// quanto vai pagar, que é o que serve para um cartaz no balcão. Com valor,
// serve para um pedido específico.
function gerar({ chave, nome, cidade, valor = null, descricao = '', txid = '***' }) {
  const k = arrumarChave(chave);

  const nomeLimpo = semAcento(nome).slice(0, LIMITE.nome);
  const cidadeLimpa = semAcento(cidade).slice(0, LIMITE.cidade) || 'BRASIL';
  if (!nomeLimpo) throw new Error('Informe o nome de quem recebe.');
  if (k.chave.length > LIMITE.chave) {
    throw new Error(`A chave tem ${k.chave.length} caracteres e o máximo é ${LIMITE.chave}.`);
  }

  // Campo 26: os dados do PIX propriamente ditos.
  const dentro26 = campo('00', 'BR.GOV.BCB.PIX') + campo('01', k.chave)
    + (descricao ? campo('02', semAcento(descricao).slice(0, LIMITE.descricao)) : '');

  const partes = [
    campo('00', '01'),                       // versão do formato
    campo('26', dentro26),
    campo('52', '0000'),                     // ramo de atividade: não informado
    campo('53', '986'),                      // moeda: real
    ...(valor != null && Number(valor) > 0
      ? [campo('54', Number(valor).toFixed(2))]
      : []),
    campo('58', 'BR'),
    campo('59', nomeLimpo),
    campo('60', cidadeLimpa),
    campo('62', campo('05', semAcento(txid).slice(0, LIMITE.txid) || '***'))
  ];

  // O campo 63 entra com tamanho 04 ANTES de calcular, e o CRC é calculado
  // sobre o texto inteiro já incluindo "6304". É assim no padrão.
  const semCrc = partes.join('') + '6304';
  return {
    texto: semCrc + crc16(semCrc),
    chave: k.chave,
    tipoDaChave: k.tipo,
    nome: nomeLimpo,
    cidade: cidadeLimpa,
    // Avisa quando o nome não coube, para quem cadastrou poder encurtar
    // do jeito que preferir em vez de aceitar um corte no meio da palavra.
    nomeFoiCortado: semAcento(nome).length > LIMITE.nome
  };
}

// Lê um código de volta, em campos. Serve para conferir o que foi montado.
function ler(texto) {
  const campos = {};
  let i = 0;
  while (i + 4 <= texto.length) {
    const id = texto.slice(i, i + 2);
    const tam = Number(texto.slice(i + 2, i + 4));
    if (!Number.isFinite(tam)) break;
    campos[id] = texto.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  return campos;
}

// Confere se um código está íntegro: o CRC do fim tem de bater com o
// cálculo sobre tudo que veio antes.
function conferir(texto) {
  if (typeof texto !== 'string' || texto.length < 8) return false;
  const corpo = texto.slice(0, -4);
  const informado = texto.slice(-4).toUpperCase();
  return corpo.endsWith('6304') && crc16(corpo) === informado;
}

module.exports = { gerar, ler, conferir, crc16, arrumarChave, semAcento, LIMITE };
