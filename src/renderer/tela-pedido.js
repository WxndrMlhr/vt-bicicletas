// Peças comuns das três telas que montam pedido: balcão, atacado e orçamento.
//
// Elas nasceram com os mesmos dois problemas, e a correção é a mesma nas três,
// então mora aqui em vez de estar copiada em cada arquivo.

(function () {

  // ---------- Tabela de itens ----------
  //
  // O jeito antigo redesenhava a tabela inteira (tbody.innerHTML = ...) a cada
  // alteração de quantidade. Como o recálculo é assíncrono, esse redesenho
  // acontecia com a pessoa ainda no campo: o <input> em uso saía do DOM, o foco
  // caía no <body> e o teclado parava de funcionar até clicar em algo de novo.
  //
  // Agora a linha só é recriada quando o conjunto de peças muda de verdade —
  // entrou ou saiu peça. Enquanto é só a quantidade que muda, as células são
  // atualizadas uma a uma e o campo em uso não é tocado.
  //
  //   vazio       -> HTML da linha "nenhuma peça ainda"
  //   montarLinha -> (linha, i) => HTML de um <tr data-linha="ID"> completo
  //   celulas     -> (linha, i) => { nomeDaCelula: html } das partes que mudam;
  //                  cada uma casa com um <td data-c="nomeDaCelula">
  function pintarItens(tbody, linhas, { vazio, montarLinha, celulas }) {
    if (!linhas || linhas.length === 0) {
      tbody.innerHTML = vazio;
      return;
    }

    const atuais = Array.from(tbody.querySelectorAll('tr[data-linha]'));
    const mesmasPecas =
      atuais.length === linhas.length &&
      atuais.every((tr, i) => tr.dataset.linha === String(linhas[i].produto_id));

    // Cada célula lembra o HTML que recebeu. Comparar com o innerHTML não
    // serve: o navegador devolve "R$&nbsp;38,00" para o "R$ 38,00" que foi
    // escrito, a comparação falhava sempre e a célula era reescrita a cada
    // recálculo — o que engolia o clique num botão dentro dela.
    function pintarCelulas(tr, linha, i) {
      const partes = celulas ? celulas(linha, i) : {};
      for (const nome of Object.keys(partes)) {
        const celula = tr.querySelector(`[data-c="${nome}"]`);
        if (!celula) continue;
        // Só mexe no que mudou: escrever igual por cima faz a tela piscar.
        if (celula.__pintado !== partes[nome]) {
          celula.innerHTML = partes[nome];
          celula.__pintado = partes[nome];
        }
      }
    }

    if (!mesmasPecas) {
      tbody.innerHTML = linhas.map(montarLinha).join('');
      // A linha recém-montada já nasce com as células certas; registra isso
      // para o próximo recálculo não reescrever à toa.
      tbody.querySelectorAll('tr[data-linha]').forEach((tr, i) => pintarCelulas(tr, linhas[i], i));
      return;
    }

    const focado = document.activeElement;

    linhas.forEach((linha, i) => {
      const tr = atuais[i];
      pintarCelulas(tr, linha, i);

      // Os campos que a pessoa digita (quantidade e, no atacado, o preço) só
      // são corrigidos quando não é neles que ela está — senão o número
      // pularia embaixo do dedo de quem está escrevendo.
      const campo = tr.querySelector('input.qtd');
      if (campo && campo !== focado && campo.value !== String(linha.quantidade)) {
        campo.value = linha.quantidade;
      }
      const preco = tr.querySelector('input.preco');
      if (preco && preco !== focado) {
        const texto = precoParaCampo(linha.preco_unitario);
        if (preco.value !== texto) preco.value = texto;
      }
      const cor = tr.querySelector('select.cor');
      if (cor) {
        if (cor !== focado && cor.value !== (linha.cor || '')) cor.value = linha.cor || '';
        cor.classList.toggle('sem-cor', !linha.cor);
      }
    });
  }

  // ---------- Cor da linha ----------
  //
  // Peça que existe em várias cores (kit, manopla, aro...) é cadastrada uma
  // vez só, com a lista de cores em Produtos. No pedido cada linha escolhe a
  // sua cor, e a mesma peça pode aparecer em várias linhas — cinco kits em
  // cinco cores são cinco linhas do mesmo kit.
  //
  // As linhas são identificadas pela posição (data-i), não pelo produto_id,
  // justamente porque a mesma peça pode se repetir.
  const escaparCor = t => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  // Uma unidade a mais da peça: soma na linha dela que ainda está sem cor
  // (peça sem cores cadastradas nunca tem cor, então continua somando como
  // sempre somou). Se todas as linhas dela já têm cor, abre uma linha nova.
  function adicionarPeca(itens, produto_id, nome) {
    const existente = itens.find(i => i.produto_id === produto_id && !i.cor);
    if (existente) existente.quantidade += 1;
    else itens.push({ produto_id, nome, quantidade: 1 });
  }

  // Troca a cor da linha i. Se já existe outra linha da mesma peça nessa cor,
  // as duas viram uma só, somando as quantidades. Devolve a lista nova.
  function trocarCor(itens, i, cor) {
    const item = itens[i];
    if (!item) return itens;
    const alvo = itens.findIndex((o, n) =>
      n !== i && o.produto_id === item.produto_id && (o.cor || '') === (cor || ''));
    if (alvo >= 0) {
      itens[alvo].quantidade += item.quantidade;
      return itens.filter((_, n) => n !== i);
    }
    if (cor) item.cor = cor;
    else delete item.cor;
    return itens;
  }

  // "+ outra cor": uma linha nova da mesma peça logo abaixo, com uma unidade
  // e a cor em branco. Preço negociado vai junto — é a mesma peça.
  function outraCor(itens, i) {
    const item = itens[i];
    if (!item) return itens;
    const nova = { produto_id: item.produto_id, nome: item.nome, quantidade: 1 };
    if (item.preco !== undefined) nova.preco = item.preco;
    itens.splice(i + 1, 0, nova);
    return itens;
  }

  // O seletor que vai embaixo do nome da peça. Peça sem cores cadastradas não
  // ganha nada. Cor gravada que saiu da lista continua aparecendo, para o
  // pedido antigo reabrir do jeito que foi feito.
  function seletorCor(l, i) {
    const cores = l.cores || [];
    if (cores.length === 0 && !l.cor) return '';
    const opcoes = l.cor && !cores.includes(l.cor) ? [...cores, l.cor] : cores;
    return `
      <div class="linha-cor">
        <select class="cor${l.cor ? '' : ' sem-cor'}" data-i="${i}" title="Cor desta linha">
          <option value="">Escolha a cor…</option>
          ${opcoes.map(c => `<option value="${escaparCor(c)}"${c === l.cor ? ' selected' : ''}>${escaparCor(c)}</option>`).join('')}
        </select>
        <button type="button" class="outra-cor" data-outra-cor="${i}" title="Mais desta peça, em outra cor">+ outra cor</button>
      </div>`;
  }

  // Linhas de peça com cores em que ninguém escolheu a cor.
  function linhasSemCor(linhas) {
    return (linhas || []).filter(l => (l.cores || []).length > 0 && !l.cor);
  }

  // Antes de gravar: linha sem cor passa, mas só com a pessoa sabendo.
  // Devolve true para seguir, false para voltar e escolher.
  async function confirmarCores(linhas) {
    const semCor = linhasSemCor(linhas);
    if (semCor.length === 0) return true;
    const quantas = semCor.length === 1 ? 'Uma linha está' : `${semCor.length} linhas estão`;
    return await window.perguntar(
      `${quantas} sem a cor escolhida:\n\n` +
      semCor.map(l => `• ${l.nome}`).join('\n') +
      '\n\nGravar assim mesmo?',
      { sim: 'Gravar sem cor', nao: 'Voltar e escolher' }
    );
  }

  // ---------- Campo de preço ----------
  //
  // O preço é digitado como se escreve no papel: "34,50". Um <input
  // type="number"> depende do idioma do sistema para aceitar vírgula ou ponto,
  // então o campo é de texto e a conversão é feita aqui, nos dois sentidos.
  function precoParaCampo(valor) {
    return (Number(valor) || 0).toFixed(2).replace('.', ',');
  }

  // Devolve o número digitado, ou null se o campo está vazio ou não é número.
  // Aceita "34,50", "34.50", "1.234,50" e "1.200" (ponto seguido de três
  // dígitos, sem vírgula, é milhar — como se escreve preço de bicicleta).
  function precoDoCampo(texto) {
    let t = String(texto ?? '').replace(/[R$\s]/g, '');
    if (t === '') return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? +n.toFixed(2) : null;
  }

  // ---------- Rascunho ----------
  //
  // A navegação do sistema é por link comum: sair de "Pedido atacado" para
  // cadastrar uma peça em "Produtos" recarrega a página e o pedido em montagem
  // ia junto. Aqui ele fica guardado e volta sozinho quando a tela reabre.
  //
  // Fica no localStorage (funciona em página file:// dentro do Electron) e é
  // por máquina, que é o que interessa: é a mesma pessoa, no mesmo balcão,
  // terminando o mesmo pedido.
  function criarRascunho(nome, { validadeHoras = 12 } = {}) {
    const chave = `vt:rascunho:${nome}`;

    return {
      salvar(dados) {
        try {
          localStorage.setItem(chave, JSON.stringify({ em: Date.now(), dados }));
        } catch (e) {
          // Sem rascunho o sistema continua funcionando; não vale travar a venda.
        }
      },

      ler() {
        try {
          const cru = localStorage.getItem(chave);
          if (!cru) return null;
          const { em, dados } = JSON.parse(cru);
          // Rascunho velho não serve: preço, estoque e peça podem ter mudado.
          if (!em || Date.now() - em > validadeHoras * 3600 * 1000) {
            localStorage.removeItem(chave);
            return null;
          }
          return dados;
        } catch (e) {
          return null;
        }
      },

      limpar() {
        try { localStorage.removeItem(chave); } catch (e) {}
      }
    };
  }

  // Faixa amarela de "voltamos o que você estava montando", com o botão de
  // descartar. Aparece acima do conteúdo, sem empurrar o layout das telas.
  function avisarRascunho(texto, aoDescartar) {
    const faixa = document.createElement('div');
    faixa.className = 'faixa-rascunho';
    faixa.innerHTML = `
      <span>${texto}</span>
      <button type="button" class="neutro mini" id="btn-descartar-rascunho">Descartar e começar do zero</button>
    `;
    const conteudo = document.querySelector('main.conteudo');
    const depoisDo = conteudo.querySelector('.subtitulo-pagina') || conteudo.querySelector('.titulo-pagina');
    depoisDo.insertAdjacentElement('afterend', faixa);

    faixa.querySelector('#btn-descartar-rascunho').addEventListener('click', () => {
      faixa.remove();
      aoDescartar();
    });
    return faixa;
  }

  // ---------- Setas na lista de sugestões ----------
  //
  // A lista nasceu só de mouse: para escolher, era preciso largar o teclado e
  // clicar. Aqui as setas ↑ ↓ andam pela lista, Enter escolhe o que está
  // marcado e Esc fecha.
  //
  // Nada fica marcado antes de a pessoa apertar a seta. No campo de cliente ela
  // costuma digitar um nome novo que ainda não existe, e um item pré-marcado
  // faria o Enter trocar o que ela acabou de escrever.
  //
  //   campo      -> o <input> onde se digita
  //   caixa      -> a <div class="sugestoes"> logo abaixo dele
  //   aoEscolher -> (elemento .sugestao escolhido) => o mesmo que o clique faz
  function ligarSetas(campo, caixa, aoEscolher) {
    let marcado = -1;

    const opcoes = () => caixa.querySelectorAll('.sugestao[data-id]');

    function marcar(i) {
      const lista = opcoes();
      if (lista.length === 0) { marcado = -1; return; }
      marcado = Math.max(0, Math.min(i, lista.length - 1));
      lista.forEach((o, n) => o.classList.toggle('marcada', n === marcado));
      lista[marcado].scrollIntoView({ block: 'nearest' });
    }

    // Cada busca redesenha a lista inteira; a marca da lista anterior não vale
    // mais, senão o Enter escolheria a linha errada.
    new MutationObserver(() => { marcado = -1; }).observe(caixa, { childList: true });

    campo.addEventListener('keydown', (e) => {
      const lista = opcoes();
      if (caixa.style.display === 'none' || lista.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        marcar(marcado + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        marcar(marcado < 0 ? lista.length - 1 : marcado - 1);
      } else if (e.key === 'Enter') {
        // Sem nada marcado o Enter continua sendo o de antes: quem digitou um
        // cliente novo e apertou Enter não pode ver o nome virar outro.
        if (marcado < 0) return;
        e.preventDefault();
        aoEscolher(lista[marcado]);
        marcado = -1;
      } else if (e.key === 'Escape') {
        caixa.style.display = 'none';
        marcado = -1;
      }
    });
  }

  // ---------- Datas das parcelas ----------
  //
  // Mudou a data de uma parcela, as seguintes andam junto, contando a partir
  // dela no intervalo escolhido. As anteriores ficam como estão.
  //
  // "Mensal" é o mesmo dia no mês seguinte (10/10, 10/11, 10/12), e não 30
  // dias corridos — com 30 dias o vencimento escorregava um dia a cada mês
  // de 31. Semanal e quinzenal são dias corridos (7 e 15).
  //
  // Dia que não existe no mês cai no último dia dele: quem paga todo dia 31
  // vence em 28/02 (ou 29) e volta para 31/03.
  const MENSAL = 30;

  // "AAAA-MM-DD" do campo de data, lido como dia local — new Date("2026-10-10")
  // seria meia-noite em UTC, que no Brasil ainda é o dia 9.
  function lerData(iso) {
    const [a, m, d] = String(iso ?? '').split('-').map(Number);
    return a && m && d ? new Date(a, m - 1, d) : null;
  }

  function paraISO(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // A data `vezes` intervalos depois de `iso`.
  function somarIntervalo(iso, intervalo, vezes) {
    const base = lerData(iso);
    if (!base) return null;
    if (intervalo === MENSAL) {
      const alvo = new Date(base.getFullYear(), base.getMonth() + vezes, 1);
      const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
      alvo.setDate(Math.min(base.getDate(), ultimoDia));
      return paraISO(alvo);
    }
    base.setDate(base.getDate() + intervalo * vezes);
    return paraISO(base);
  }

  // Vencimentos de um parcelamento novo. A primeira parcela vence na data que
  // a pessoa escolheu para ela ou, sem escolha, um intervalo depois de hoje.
  function datasDasParcelas(quantidade, intervalo, primeira) {
    const inicio = lerData(primeira) ? primeira : somarIntervalo(paraISO(new Date()), intervalo, 1);
    return Array.from({ length: quantidade }, (_, i) => somarIntervalo(inicio, intervalo, i));
  }

  // Mudou a quantidade de parcelas: as datas que já existem ficam, e as
  // parcelas novas seguem a última data preenchida.
  function estenderDatas(datas, quantidade, intervalo) {
    const resultado = datas.slice(0, quantidade);
    let ultima = -1;
    resultado.forEach((d, i) => { if (lerData(d)) ultima = i; });
    for (let j = resultado.length; j < quantidade; j++) {
      resultado.push(ultima >= 0
        ? somarIntervalo(resultado[ultima], intervalo, j - ultima)
        : datasDasParcelas(quantidade, intervalo, null)[j]);
    }
    return resultado;
  }

  // A pessoa escolheu a data da parcela i: as seguintes contam a partir dela.
  function seguirData(parcelas, i, intervalo) {
    const base = parcelas[i] && parcelas[i].vencimento;
    if (!lerData(base)) return;
    for (let j = i + 1; j < parcelas.length; j++) {
      parcelas[j].vencimento = somarIntervalo(base, intervalo, j - i);
    }
  }

  // Põe as datas novas nos campos sem redesenhar a tabela: o campo em que a
  // pessoa está digitando não pode sair debaixo do dedo (o "change" da data
  // dispara no meio da digitação, a cada parte do dia/mês/ano que fecha).
  // O campo que mudou pisca, para ver o que andou.
  function mostrarDatas(tabela, parcelas) {
    tabela.querySelectorAll('input.venc-parcela').forEach(campo => {
      const valor = (parcelas[Number(campo.dataset.i)] || {}).vencimento || '';
      if (campo === document.activeElement || campo.value === valor) return;
      campo.value = valor;
      campo.classList.remove('seguiu');
      void campo.offsetWidth; // reinicia a animação
      campo.classList.add('seguiu');
    });
  }

  // ---------- Dados do cliente (endereço, CEP, documento, telefone) ----------
  //
  // O mesmo bloco de campos no pedido a prazo, na aprovação do orçamento a
  // prazo e na ficha do cliente. Nenhum campo é obrigatório. Quem confere
  // CPF, CNPJ e CEP é o dados-cliente.js, que a tela precisa carregar antes
  // deste arquivo.
  const PLACEHOLDER_DOC = { cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', rg: 'Número do RG' };

  function camposCliente(prefixo) {
    const id = campo => `${prefixo}-${campo}`;
    return `
      <div class="dados-cliente" data-prefixo="${prefixo}">
        <div class="dc-endereco">
          <label class="campo" for="${id('endereco')}">Endereço</label>
          <input type="text" id="${id('endereco')}" data-campo="endereco" autocomplete="off"
                 placeholder="Rua, número, bairro, cidade">
        </div>
        <div class="dc-cep">
          <label class="campo" for="${id('cep')}">CEP</label>
          <input type="text" id="${id('cep')}" data-campo="cep" inputmode="numeric" maxlength="10"
                 autocomplete="off" placeholder="00000-000">
        </div>
        <div class="dc-documento">
          <label class="campo" for="${id('documento')}">Documento</label>
          <div class="doc-junto">
            <select data-campo="documento_tipo" aria-label="Tipo de documento">
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="rg">RG</option>
            </select>
            <input type="text" id="${id('documento')}" data-campo="documento" autocomplete="off"
                   placeholder="${PLACEHOLDER_DOC.cpf}">
          </div>
        </div>
        <div class="dc-telefone">
          <label class="campo" for="${id('telefone')}">Telefone</label>
          <input type="text" id="${id('telefone')}" data-campo="telefone" autocomplete="off"
                 placeholder="(21) 90000-0000">
        </div>
        <div class="dc-aviso"></div>
      </div>`;
  }

  const campoDe = (bloco, campo) => bloco.querySelector(`[data-campo="${campo}"]`);

  function lerCamposCliente(bloco) {
    const dados = {};
    for (const campo of ['telefone', 'endereco', 'cep', 'documento_tipo', 'documento']) {
      dados[campo] = campoDe(bloco, campo).value.trim();
    }
    return dados;
  }

  function preencherCamposCliente(bloco, dados = {}) {
    for (const campo of ['telefone', 'endereco', 'cep', 'documento']) {
      campoDe(bloco, campo).value = dados[campo] || '';
    }
    campoDe(bloco, 'documento_tipo').value = dados.documento_tipo || 'cpf';
    campoDe(bloco, 'documento').placeholder = PLACEHOLDER_DOC[campoDe(bloco, 'documento_tipo').value];
    marcarProblemas(bloco, []);
  }

  // Pinta os campos preenchidos errado e escreve o porquê embaixo do bloco.
  // lista = [{ campo, texto }], como devolve DadosCliente.problemas.
  function marcarProblemas(bloco, lista, { focar = false } = {}) {
    bloco.querySelectorAll('input.invalido').forEach(c => c.classList.remove('invalido'));
    lista.forEach(p => campoDe(bloco, p.campo).classList.add('invalido'));
    bloco.querySelector('.dc-aviso').textContent = DadosCliente.mensagemProblemas(lista);
    if (focar && lista.length) campoDe(bloco, lista[0].campo).focus();
  }

  // Arruma CEP e documento quando a pessoa sai do campo, e avisa na hora se
  // o CPF/CNPJ não confere — melhor descobrir agora do que na hora de salvar.
  // aoMudar() é chamado a cada alteração (para o rascunho).
  function ligarCamposCliente(bloco, aoMudar = () => {}) {
    const tipo = campoDe(bloco, 'documento_tipo');
    const doc = campoDe(bloco, 'documento');
    const cep = campoDe(bloco, 'cep');

    function conferirDoc() {
      const texto = doc.value.trim();
      if (!texto) { doc.classList.remove('invalido'); return; }
      tipo.value = DadosCliente.adivinharTipo(tipo.value, texto);
      doc.placeholder = PLACEHOLDER_DOC[tipo.value];
      const r = DadosCliente.conferirDocumento(tipo.value, texto);
      if (r.ok) doc.value = r.valor;
      doc.classList.toggle('invalido', !r.ok);
      bloco.querySelector('.dc-aviso').textContent = r.ok ? '' : `Documento: ${r.erro}.`;
    }

    doc.addEventListener('blur', conferirDoc);
    tipo.addEventListener('change', () => {
      doc.placeholder = PLACEHOLDER_DOC[tipo.value];
      conferirDoc();
      aoMudar();
    });
    cep.addEventListener('blur', () => {
      const certo = DadosCliente.formatarCEP(cep.value);
      if (certo) cep.value = certo;
      cep.classList.toggle('invalido', !!cep.value.trim() && !certo);
    });
    bloco.addEventListener('input', (e) => {
      e.target.classList.remove('invalido');
      aoMudar();
    });
  }

  window.TelaPedido = {
    pintarItens, criarRascunho, avisarRascunho, ligarSetas, precoParaCampo, precoDoCampo,
    adicionarPeca, trocarCor, outraCor, seletorCor, linhasSemCor, confirmarCores,
    datasDasParcelas, estenderDatas, seguirData, mostrarDatas,
    camposCliente, lerCamposCliente, preencherCamposCliente, marcarProblemas, ligarCamposCliente
  };
})();
