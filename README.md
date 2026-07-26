# VT Bicicletas — Sistema de gestão

Programa de balcão para loja de peças de bicicleta. Registra pedidos, imprime cupom
em mini impressora térmica, controla estoque, clientes, contas a receber e gera
relatórios de venda.

Feito em Electron com banco local SQLite — roda offline, num computador só.

## Como rodar

Precisa do [Node.js](https://nodejs.org) instalado (versão LTS).

```bash
npm install
npm start
```

Se der erro de `NODE_MODULE_VERSION` no `better-sqlite3`:

```bash
npm run rebuild
```

## Como gerar o programa instalável

```bash
npm run dist
```

Gera na pasta `instalador` um instalador para Windows e uma versão portátil.
Veja `COMO-GERAR-O-EXECUTAVEL.md` para os detalhes e problemas comuns.

## Estrutura

```
src/
├── main.js              processo principal do Electron, registra os canais de comunicação
├── preload.js           ponte segura entre as telas e o banco
├── db.js                conexão SQLite, criação das tabelas e migrações
├── dados-iniciais.js    tabela de preços carregada na primeira execução
├── produtos.js          cadastro, reajuste de preços e histórico de alterações
├── pedidos.js           cálculo do pedido, regras de preço e cancelamento
├── estoque.js           entradas, saídas, contagem e alerta de mínimo
├── clientes.js          cadastro e ficha com histórico de compras
├── financeiro.js        contas a receber dos pedidos a prazo
├── relatorios.js        consultas de faturamento e mais vendidos
├── impressao.js         envio do cupom para a impressora do sistema
├── backup.js            cópias automáticas do banco, com rotação e restauração
└── renderer/            telas (HTML), estilo compartilhado e imagens
```

## Regras de negócio

**Três preços por peça.** Cada produto tem valor a prazo, à vista, e à vista com
retirada em loja. A forma de pagamento escolhida no pedido define qual é usado.

**Acima de R$ 2.000.** Quando o total do pedido atinge R$ 2.000, todos os itens
passam para o preço de retirada, independente da forma de pagamento — junto com
entrega grátis.

**Pedido a prazo gera cobrança.** Ao salvar, o sistema cria automaticamente uma
conta a receber com o vencimento informado.

**Venda dá baixa no estoque.** Salvar o pedido desconta as peças. Se o estoque
não cobrir a quantidade, o sistema avisa mas não impede a venda — a contagem
pode estar atrasada em relação à prateleira.

**Cancelamento estorna tudo.** Cancelar um pedido devolve as peças ao estoque,
remove a cobrança em aberto e tira o valor do faturamento. O pedido continua no
histórico, marcado como cancelado.

## Onde ficam os dados

Tudo num arquivo SQLite só:

- Rodando pelo código: `dados/vtbicicletas.db`
- Programa instalado: pasta de dados do usuário (veja o caminho na tela **Backup**)

O app faz uma cópia por dia ao abrir, mantendo as últimas 30 em `dados/backups`.

**Os dados não são versionados** — o `.gitignore` bloqueia a pasta `dados`, porque
ela contém informação de clientes e histórico de vendas.

## Limitações conhecidas

- Não emite documento fiscal. O cupom é um comprovante interno.
- Sem controle de acesso: quem abre o programa vê e altera tudo.
- Um computador por vez, sem sincronização entre máquinas.
- Os backups ficam no mesmo computador — copie a pasta para um pen drive
  periodicamente.
