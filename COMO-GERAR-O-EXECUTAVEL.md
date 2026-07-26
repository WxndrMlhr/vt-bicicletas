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

Vai aparecer uma pasta `instalador` com dois arquivos:

- **VT-Bicicletas-Instalador-1.0.0.exe** — instala o programa no computador,
  cria atalho na área de trabalho e no menu iniciar. É o que você quer usar.
- **VT-Bicicletas-Portatil-1.0.0.exe** — roda direto, sem instalar.
  Serve para levar num pen drive e usar em outro computador.

## Levando seus dados atuais para o programa instalado

O programa instalado guarda os dados em outro lugar (a pasta do projeto vira
somente-leitura depois de empacotado). Então:

1. Instale e abra o programa uma vez
2. Vá em **Backup** → botão **Abrir pasta dos dados**
3. Feche o programa
4. Copie o arquivo `vtbicicletas.db` da pasta antiga
   (`erp-loja\dados\vtbicicletas.db`) para dentro dessa pasta que abriu,
   substituindo o que estiver lá
5. Abra o programa de novo — seus produtos, pedidos e clientes estarão lá

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
2. Aumente a versão no `package.json` (ex: `1.0.0` para `1.0.1`)
3. Rode `npm run dist` de novo
4. Instale por cima — os dados não são apagados
