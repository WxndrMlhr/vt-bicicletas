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

    if (!mesmasPecas) {
      tbody.innerHTML = linhas.map(montarLinha).join('');
      return;
    }

    const focado = document.activeElement;

    linhas.forEach((linha, i) => {
      const tr = atuais[i];
      const partes = celulas ? celulas(linha) : {};

      for (const nome of Object.keys(partes)) {
        const celula = tr.querySelector(`[data-c="${nome}"]`);
        // Só mexe no que mudou: escrever igual por cima faz a tela piscar.
        if (celula && celula.innerHTML !== partes[nome]) celula.innerHTML = partes[nome];
      }

      // O campo de quantidade é o único que a pessoa digita, então só é
      // corrigido quando não é ele que está em uso — senão o número pularia
      // embaixo do dedo de quem está escrevendo.
      const campo = tr.querySelector('input.qtd');
      if (campo && campo !== focado && campo.value !== String(linha.quantidade)) {
        campo.value = linha.quantidade;
      }
    });
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

  window.TelaPedido = { pintarItens, criarRascunho, avisarRascunho };
})();
