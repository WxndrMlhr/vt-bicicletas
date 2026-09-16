// Tira o embrulho que o Electron põe em erro vindo do processo principal.
//
// O processo principal escreve mensagem para a pessoa ler ("Já existe uma
// janela do Windows aberta"), mas ao atravessar o canal ela chega como
// "Error invoking remote method 'impressao:imprimir': Error: Já existe...".
// Mostrar isso num alert entrega o nome do canal a quem só queria saber por
// que o botão não funcionou.
//
// Fica aqui porque o menu.js é carregado por todas as telas de verdade — as
// três que não o carregam são as folhas de impressão, que não têm botão.
window.motivo = function (e) {
  return String(e?.message ?? e ?? '')
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:Uncaught\s+)?Error:\s*/, '')
    .trim() || 'Não deu para concluir. Tente de novo.';
};

// Aviso e pergunta desenhados NA PÁGINA, no lugar de alert() e confirm().
//
// POR QUE ISTO EXISTE
//
// O alert() e o confirm() do navegador são modais do Windows: enquanto um
// deles está na tela, a janela dona dele não aceita teclado nem mouse. Isso
// seria aceitável se eles estivessem sempre visíveis — mas não estão.
//
// Basta a janela principal ganhar o foco por outro caminho (a impressão
// terminando, um clique na barra de tarefas, outro programa passando na
// frente) para a caixa ir parar ATRÁS dela. A pessoa vê o sistema normal,
// clica, digita, e nada responde: o teclado está preso por uma caixa que
// ela não consegue ver nem alcançar. Só fechando o programa.
//
// É o mesmo problema que o dialogos.js resolveu para o "Salvar como" e o
// "Imprimir", que são diálogos do processo principal. Estes aqui nascem no
// lado da tela, e por isso escaparam daquela correção.
//
// Desenhados em HTML, ficam sempre dentro da janela: não há como sumirem
// atrás dela, e o Esc sempre alcança.

// Um aviso que some sozinho. Não interrompe: a pessoa lê e continua.
window.avisar = function (texto, tipo = 'certo') {
  texto = window.motivo(texto);
  let el = document.getElementById('aviso-flutuante');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-flutuante';
    el.style.cssText =
      'position:fixed; bottom:1.2rem; right:1.4rem; z-index:210; max-width:420px;' +
      'box-shadow:0 8px 24px rgba(22,25,31,0.18);';
    document.body.appendChild(el);
  }
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  el.style.display = 'block';
  clearTimeout(el._t);
  // Erro fica mais tempo: é o que a pessoa precisa ler até o fim.
  el._t = setTimeout(() => { el.style.display = 'none'; }, tipo === 'erro' ? 6000 : 3400);
};

// Pergunta de sim ou não. Devolve PROMESSA — quem chama precisa de await,
// diferente do confirm(), que devolvia o valor na hora.
window.perguntar = function (texto, { sim = 'Confirmar', nao = 'Cancelar', perigo = false } = {}) {
  return new Promise(resolve => {
    const fundo = document.createElement('div');
    fundo.className = 'pergunta-fundo';
    fundo.innerHTML =
      '<div class="pergunta-caixa">' +
      '<div class="texto"></div>' +
      '<div class="acoes">' +
      '<button class="neutro" data-nao></button>' +
      `<button class="${perigo ? 'perigo' : ''}" data-sim></button>` +
      '</div></div>';

    const caixa = fundo.firstElementChild;
    caixa.querySelector('.texto').textContent = texto;
    caixa.querySelector('[data-nao]').textContent = nao;
    caixa.querySelector('[data-sim]').textContent = sim;

    let respondido = false;
    const fechar = (valor) => {
      if (respondido) return;
      respondido = true;
      document.removeEventListener('keydown', naTecla, true);
      fundo.remove();
      resolve(valor);
    };
    // Na captura: a cobertura barra o mouse, mas o Tab ainda alcança o que
    // está atrás. Pegando a tecla antes, o Enter não aciona a pergunta E o
    // botão escondido ao mesmo tempo.
    const naTecla = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fechar(true); }
    };

    caixa.querySelector('[data-nao]').addEventListener('click', () => fechar(false));
    caixa.querySelector('[data-sim]').addEventListener('click', () => fechar(true));
    // Clicar fora é desistir; clicar dentro não pode fechar sem querer.
    fundo.addEventListener('click', e => { if (e.target === fundo) fechar(false); });
    document.addEventListener('keydown', naTecla, true);

    document.body.appendChild(fundo);
    caixa.querySelector('[data-sim]').focus();
  });
};

// Monta a barra lateral em todas as telas e marca a página atual.
(function () {
  const paginas = [
    { arquivo: 'balcao.html',     rotulo: 'Balcão' },
    { arquivo: 'pedidos.html',    rotulo: 'Pedido atacado' },
    { arquivo: 'orcamentos.html', rotulo: 'Orçamentos' },
    { arquivo: 'historico.html',  rotulo: 'Pedidos' },
    { arquivo: 'clientes.html',   rotulo: 'Clientes' },
    { arquivo: 'produtos.html',   rotulo: 'Produtos' },
    { arquivo: 'estoque.html',    rotulo: 'Estoque' },
    { arquivo: 'financeiro.html', rotulo: 'A receber' },
    { arquivo: 'relatorios.html', rotulo: 'Relatórios' },
    { arquivo: 'backup.html',     rotulo: 'Backup' },
    { arquivo: 'configuracoes.html', rotulo: 'Configurações' }
  ];

  const atual = location.pathname.split('/').pop() || 'pedidos.html';

  const links = paginas.map(p =>
    `<a href="${p.arquivo}"${p.arquivo === atual ? ' class="ativo"' : ''}>${p.rotulo}</a>`
  ).join('');

  document.write(`
    <aside class="menu">
      <div class="menu-marca">
        <img src="logo.png" alt="VT Bicicletas">
        <div class="desc">Controle da loja</div>
      </div>
      <nav>${links}</nav>
      <div class="menu-rodape">
        Nova Iguaçu / RJ
        <span class="versao" id="menu-versao"></span>
      </div>
    </aside>
  `);

  // A versão fica à vista, e não escondida numa tela de diagnóstico: no
  // suporte a primeira pergunta é sempre "qual versão você está usando?".
  //
  // Preenchida depois porque o menu é escrito com document.write, que é
  // síncrono, e a versão vem por IPC.
  window.erpAPI?.versao?.()
    .then(v => {
      const el = document.getElementById('menu-versao');
      if (el) el.textContent = 'v' + v;
    })
    .catch(() => { /* sem a versão o menu continua servindo */ });
})();
