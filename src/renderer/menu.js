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
