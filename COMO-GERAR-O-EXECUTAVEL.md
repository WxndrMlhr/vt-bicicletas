# Como gerar o programa instalável — VT Bicicletas

## Antes de começar

Rode estes comandos **na pasta do projeto** (a que tem o `package.json`).
Confira sempre que o terminal termina com `\vt-bicicletas>` ou o nome da sua pasta.

## Passo 1 — Instalar o que falta

```powershell
npm install
```

Isso baixa o `electron-builder`, que é a ferramenta que monta o instalador.

## Passo 2 — Gerar o executável

```powershell
npm run dist
```

Demora alguns minutos na primeira vez (baixa uns 100 MB de componentes do Windows).

## Passo 3 — Onde ficaram os arquivos

Vai aparecer uma pasta `instalador` com dois arquivos, com o número da
versão que está no `package.json` no nome:

- **VT-Bicicletas-Instalador-1.12.0.exe** (~82 MB) — instala o programa no
  computador, cria atalho na área de trabalho e no menu iniciar. É o que você
  quer usar.
- **VT-Bicicletas-Portatil-1.12.0.exe** (~82 MB) — roda direto, sem instalar.
  Serve para levar num pen drive e usar em outro computador.

O `.blockmap` e os `.yml` que aparecem junto são sobra do gerador. Não precisa
levar nenhum deles.

## Levando seus dados atuais para o outro computador

O programa instalado guarda os dados em outro lugar: a pasta onde o `.exe` fica
instalado é somente-leitura depois de empacotado. O banco fica aqui:

```
%APPDATA%\vt-bicicletas\dados\vtbicicletas.db
```

**Repare no nome da pasta: `vt-bicicletas`, com hífen e minúsculo.** Não é
"VT Bicicletas". O nome bonito vale para o atalho e para a pasta de instalação;
a pasta de dados usa o outro. Procurar pelo nome errado é o jeito mais fácil de
achar que os dados sumiram.

Atalho para chegar lá: **Win + R**, colar `%APPDATA%\vt-bicicletas\dados` e
Enter. Ou, dentro do sistema: **Backup → Abrir pasta dos dados**.

### O passo a passo

1. **Feche o ERP nos dois computadores.** Isto não é formalidade: o banco
   trabalha em modo WAL, e com o programa aberto as últimas vendas ainda estão
   no arquivo `vtbicicletas.db-wal`, fora do `.db`. Fechando, o SQLite despeja
   o WAL dentro do banco e um arquivo só passa a bastar
2. Copie o `vtbicicletas.db` da pasta acima
3. No computador novo, instale e **abra o programa uma vez**, depois feche.
   É essa primeira abertura que cria a pasta `dados`
4. Cole o `.db` em `%APPDATA%\vt-bicicletas\dados\`, por cima do que estiver lá
5. **Apague o `vtbicicletas.db-wal` e o `vtbicicletas.db-shm` dessa pasta**, se
   existirem. Eles são o rascunho do banco antigo; deixados ali junto do banco
   novo, o SQLite tenta juntar os dois
6. Abra o programa

### Um caminho mais seguro que copiar à mão

A tela **Backup** já faz isso certo, inclusive a limpeza do passo 5, e ainda
guarda uma cópia `_antes-de-restaurar.db` caso você escolha a errada:

1. Leve um arquivo da subpasta `dados\backups\` — eles já vêm com a data no
   nome, como `vtbicicletas_2026-09-09.db`
2. No computador novo, instale, abra uma vez, feche
3. Cole o arquivo dentro de `%APPDATA%\vt-bicicletas\dados\backups\`
4. Abra o ERP → **Backup** → o arquivo aparece na lista → **Voltar para esta**

Uma ressalva: a lista da tela mostra a **data de modificação do arquivo**, não a
data escrita no nome. Cópia entre computadores costuma carimbar tudo com a data
de hoje, e aí todas as linhas ficam iguais. Nesse caso, use o **tamanho** para
se achar — o mais recente é o maior.

### Como saber se deu certo

Não olhe os preços. Uma instalação nova já vem com a tabela de preços da VT
dentro, então os preços parecem certos **mesmo com o banco vazio**.

Olhe **Clientes** e **Pedidos**. Instalação de fábrica vem sem cliente nenhum.
Se a tela de Clientes estiver vazia, o banco não entrou.

## Problemas comuns

**Erro de `better-sqlite3` / NODE_MODULE_VERSION**
```powershell
npm run rebuild
npm run dist
```

**O Windows Defender avisa que o programa é de origem desconhecida**
Normal — o executável não tem assinatura digital (que é paga).
Clique em "Mais informações" e depois em "Executar assim mesmo".
Para não ver esse aviso, seria preciso comprar um certificado de assinatura.

**Antivírus bloqueia a geração**
Alguns antivírus travam a criação de `.exe`. Se acontecer, pause o antivírus
durante o `npm run dist`.

## Atualizando o programa depois

Quando quiser mudar algo no sistema:
1. Altere os arquivos em `src`
2. **Aumente a versão no `package.json`** (ex: `1.12.0` para `1.12.1`). Sem isso o
   arquivo sai com o mesmo nome e você não distingue qual é o novo
3. Rode `npm run dist` de novo
4. Na loja, feche o ERP e instale por cima

**Em atualização não se mexe no banco.** O instalador troca só o programa, em
`Programs\VT Bicicletas`, e não encosta em `%APPDATA%\vt-bicicletas\dados`.
Copiar banco é coisa de troca de computador, uma vez só — restaurar uma cópia
antiga num update joga fora as vendas feitas desde aquela cópia.

A instalação é **por usuário**: o update tem de ser feito no mesmo login do
Windows que instalou.
