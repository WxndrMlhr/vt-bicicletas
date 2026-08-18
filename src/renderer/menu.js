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
      <div class="menu-rodape">Nova Iguaçu / RJ</div>
    </aside>
  `);
})();
