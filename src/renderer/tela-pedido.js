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
  //   montarLinha -> (linha) => HTML de um <tr data-linha="ID"> completo
  //   celulas     -> (linha) => { nomeDaCelula: html } das partes que mudam;
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
    function pintarCelulas(tr, linha) {
      const partes = celulas ? celulas(linha) : {};
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
      tbody.querySelectorAll('tr[data-linha]').forEach((tr, i) => pintarCelulas(tr, linhas[i]));
      return;
    }

    const focado = document.activeElement;

    linhas.forEach((linha, i) => {
      const tr = atuais[i];
      pintarCelulas(tr, linha);

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
    });
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

  window.TelaPedido = { pintarItens, criarRascunho, avisarRascunho, ligarSetas, precoParaCampo, precoDoCampo };
})();
