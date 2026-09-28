// Dados do cliente na venda a prazo: endereço, CEP e um documento (CPF, CNPJ
// ou RG). Nenhum é obrigatório; o que for preenchido tem de estar certo.
//
// O mesmo arquivo serve às telas (window.DadosCliente) e ao processo principal
// (require): a tela confere enquanto a pessoa digita, e o processo principal
// confere de novo antes de gravar — um CPF errado não entra no banco por
// nenhum caminho, nem pela tela de orçamento.

(function (raiz) {

  const TIPOS = { cpf: 'CPF', cnpj: 'CNPJ', rg: 'RG' };

  const soDigitos = t => String(t ?? '').replace(/\D/g, '');

  // ---------- CEP ----------
  // "26.285-060", "26285060" e "26285-060" viram "26285-060".
  // Devolve null quando não tem 8 dígitos.
  function formatarCEP(texto) {
    const d = soDigitos(texto);
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
  }

  // ---------- CPF ----------
  function cpfValido(texto) {
    const d = soDigitos(texto);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digito = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
  }

  // ---------- CNPJ ----------
  // Desde julho de 2026 a Receita emite CNPJ com letras nas 12 primeiras
  // posições (os dois dígitos do fim continuam números). No cálculo, cada
  // caractere vale o código dele menos 48: "0"–"9" valem 0–9 como sempre, e
  // "A" vale 17, "B" 18... Assim o CNPJ antigo, só de números, continua
  // passando igual.
  const soCNPJ = t => String(t ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

  function cnpjValido(texto) {
    const c = soCNPJ(texto);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
    const valor = ch => ch.charCodeAt(0) - 48;
    const digito = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + valor(c[i]) * p, 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return digito(12) === Number(c[12]) && digito(13) === Number(c[13]);
  }

  // ---------- Documento ----------
  // RG não tem padrão nacional (muda de estado para estado), então só se
  // confere que tem número; ele fica como foi digitado, em maiúscula.
  function conferirDocumento(tipo, texto) {
    const bruto = String(texto ?? '').trim();
    if (!bruto) return { ok: false, erro: 'falta o documento' };

    if (tipo === 'cpf') {
      const d = soDigitos(bruto);
      if (d.length !== 11) return { ok: false, erro: 'o CPF tem 11 números' };
      if (!cpfValido(d)) return { ok: false, erro: 'esse CPF não confere — veja se não trocou algum número' };
      return { ok: true, valor: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` };
    }
    if (tipo === 'cnpj') {
      const c = soCNPJ(bruto);
      if (c.length !== 14) return { ok: false, erro: 'o CNPJ tem 14 caracteres' };
      if (!cnpjValido(c)) return { ok: false, erro: 'esse CNPJ não confere — veja se não trocou algum caractere' };
      return { ok: true, valor: `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` };
    }
    if (tipo === 'rg') {
      if (soDigitos(bruto).length < 5) return { ok: false, erro: 'o RG parece incompleto' };
      return { ok: true, valor: bruto.toUpperCase().replace(/\s+/g, ' ') };
    }
    return { ok: false, erro: 'escolha se é CPF, CNPJ ou RG' };
  }

  // Quem escolheu CPF e digitou 14 caracteres quis dizer CNPJ, e vice-versa.
  // RG não é adivinhado: só vale se a pessoa escolheu.
  function adivinharTipo(tipo, texto) {
    if (tipo === 'rg') return tipo;
    const c = soCNPJ(texto);
    if (c.length === 14) return 'cnpj';
    if (/^\d{11}$/.test(c)) return 'cpf';
    return tipo;
  }

  // "CPF 123.456.789-09", para o papel.
  function textoDocumento(tipo, documento) {
    if (!documento) return '';
    return TIPOS[tipo] ? `${TIPOS[tipo]} ${documento}` : documento;
  }

  // Nada é obrigatório: campo em branco só não sai no papel. O que não passa
  // é o que foi preenchido errado — um CPF que não confere ou um CEP pela
  // metade iriam para o pedido como se estivessem certos.
  // Devolve [{ campo, texto }], vazia quando está tudo certo.
  //   dados = { cep, documento_tipo, documento }
  function problemas(dados) {
    const lista = [];
    if (String(dados.cep ?? '').trim() && !formatarCEP(dados.cep)) {
      lista.push({ campo: 'cep', texto: 'CEP: tem 8 números.' });
    }
    if (String(dados.documento ?? '').trim()) {
      const doc = conferirDocumento(dados.documento_tipo, dados.documento);
      if (!doc.ok) lista.push({ campo: 'documento', texto: `Documento: ${doc.erro}.` });
    }
    return lista;
  }

  const mensagemProblemas = lista => lista.map(p => p.texto).join(' ');

  // Os dados como vão para o banco: CEP e documento formatados, o resto
  // aparado, e campo vazio vira null. Documento que não confere fica como
  // foi digitado — quem chega aqui já passou por problemas().
  function normalizar(dados) {
    const tipo = TIPOS[dados.documento_tipo] ? dados.documento_tipo : null;
    const doc = conferirDocumento(tipo, dados.documento);
    const bruto = String(dados.documento ?? '').trim();
    return {
      telefone: String(dados.telefone ?? '').trim() || null,
      endereco: String(dados.endereco ?? '').trim() || null,
      cep: formatarCEP(dados.cep) || (String(dados.cep ?? '').trim() || null),
      documento_tipo: bruto ? tipo : null,
      documento: doc.ok ? doc.valor : (bruto || null)
    };
  }

  const api = {
    TIPOS, formatarCEP, cpfValido, cnpjValido, conferirDocumento, adivinharTipo,
    textoDocumento, problemas, mensagemProblemas, normalizar
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.DadosCliente = api;
})(typeof window !== 'undefined' ? window : globalThis);
