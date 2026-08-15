# VT Bicicletas — Sistema de gestão

Programa de balcão para loja de peças de bicicleta. Monta orçamentos em PDF,
registra pedidos, imprime cupom em mini impressora térmica, controla estoque,
clientes, contas a receber e gera relatórios de venda.

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
├── configuracoes.js     dados da loja e ajustes de impressão, em chave/valor
├── catalogo-inicial.js  carga única da tabela de preços que vem com o programa
├── dados-iniciais.js    tabela de preços carregada na primeira execução
├── produtos.js          cadastro, reajuste de preços e histórico de alterações
├── pedidos.js           cálculo do pedido, regras de preço e cancelamento
├── orcamentos.js        propostas ao cliente e conversão em pedido
├── documento-pdf.js     mecanismo comum das folhas A4 (salvar em PDF / imprimir)
├── orcamento-pdf.js     a folha A4 do orçamento
├── pedido-pdf.js        a folha A4 do pedido
├── estoque.js           entradas, saídas, contagem e alerta de mínimo
├── clientes.js          cadastro e ficha com histórico de compras
├── financeiro.js        contas a receber dos pedidos a prazo
├── relatorios.js        consultas de faturamento e mais vendidos
├── impressao.js         envio do cupom para a impressora do sistema
├── backup.js            cópias automáticas do banco, com rotação e restauração
└── renderer/            telas (HTML), estilo compartilhado e imagens
    └── tela-pedido.js   peças comuns do balcão, do atacado e do orçamento
```

## Regras de negócio

**Pedido em montagem não se perde.** Sair da tela de venda para cadastrar uma
peça em Produtos e voltar não zera o que já estava montado: o balcão, o pedido
atacado e o orçamento guardam o rascunho e o repõem quando a tela reabre, com
uma faixa avisando e um botão para descartar. O rascunho vale por 12 horas.

**Pedido salvo pode ser editado.** Em Pedidos, o botão "Editar pedido" reabre a
venda na tela de atacado. Gravar substitui o pedido no mesmo número: as peças da
versão anterior voltam ao estoque, as novas são baixadas e as cobranças em
aberto são refeitas. Parcela já paga não é mexida — o dinheiro entrou de
verdade, então ela é preservada e o que sobra a cobrar é o total novo menos o
que já foi pago. Pedido cancelado não pode ser editado.

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

**Orçamento não é venda.** Enquanto o cliente não aprova, a proposta não mexe em
nada: não reserva nem baixa estoque, não abre cobrança e não entra no faturamento.
Ele guarda os preços do dia em que foi feito e tem uma data de validade (7 dias
por padrão); vencida, aparece como **Vencido** e pode ser prorrogada.

**Aprovar gera o pedido.** Ao aprovar, o orçamento vira um pedido com os preços
que estavam na proposta — mesmo que a tabela tenha mudado depois — e aí sim valem
as regras normais: baixa de estoque e, se for a prazo, as parcelas em *A receber*.
Depois disso a proposta fica travada para alteração. Se o pedido gerado for
excluído, o orçamento volta a ficar em aberto.

## Papéis que o sistema emite

São três saídas diferentes, para usos diferentes:

| Papel | Onde sai | Para quê |
|---|---|---|
| **Cupom do pedido** | mini impressora térmica (72mm) | comprovante rápido no balcão |
| **Pedido em A4** | PDF ou impressora comum | via para arquivar, mandar ao cliente ou entregar com a mercadoria |
| **Orçamento em A4** | PDF ou impressora comum | proposta antes da venda |

As duas folhas A4 são geradas pelo mesmo mecanismo (`documento-pdf.js`) e usam o
mesmo estilo (`renderer/documento.css`), então saem com a mesma cara. São montadas
a partir do que está gravado no banco, e não da tela — o papel entregue ao cliente
é sempre igual ao que está no sistema. As pastas sugeridas são
`Documentos\Orçamentos VT Bicicletas` e `Documentos\Pedidos VT Bicicletas`.

**O PDF do pedido pode ser baixado ao formalizar** (no Balcão e no Pedido atacado)
ou depois, pela tela **Pedidos**. A folha traz os itens, o total, a forma de
pagamento, as parcelas com vencimento e situação, e campos de assinatura — serve
também como comprovante de entrega. Pedido cancelado continua podendo ser baixado,
mas a folha sai marcada como **PEDIDO CANCELADO**.

## Configurações

A tela **Configurações** guarda o que muda de instalação para instalação:

- **Dados da loja** — nome, lema, endereço, cidade, telefone e CNPJ.
- **Impressora do cupom** — qual impressora usar, a largura do papel e se
  imprime direto ou abre a janela do Windows. Tem botão de página de teste.

Sobre a largura: o que se configura é a **largura útil de impressão**, que não é
a do papel. Papel de 80mm imprime ~72mm; papel de 58mm imprime ~48mm. O botão
**Detectar pelo driver** pergunta ao Windows quais papéis a impressora aceita e
sugere a medida — o Electron não expõe essa informação, então ela vem do WMI.
Como os nomes de papel são texto livre do fabricante, a detecção é uma sugestão:
a escolha final é sempre manual.

A **tabela de preços** que vem junto com o programa é carregada uma vez só, na
primeira execução. Antes ela era reaplicada a cada abertura, o que fazia produto
apagado de propósito voltar sozinho no dia seguinte.

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
