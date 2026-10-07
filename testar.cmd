@echo off
rem ============================================================
rem  VT Bicicletas - AMBIENTE DE TESTE
rem
rem  Abre o mesmo programa da loja, mas com um banco SEPARADO:
rem
rem      %APPDATA%\vt-bicicletas-teste\dados
rem
rem  Tudo que for feito aqui - venda, orcamento, cliente, ajuste
rem  de preco, exclusao - fica so neste banco. O sistema da loja
rem  (%APPDATA%\vt-bicicletas\dados) nao e tocado.
rem
rem  A janela de teste abre com "AMBIENTE DE TESTE" no titulo.
rem
rem  Para comecar de novo com uma copia fresca dos dados da loja,
rem  rode:  testar.cmd --copiar-da-loja
rem ============================================================

setlocal
set "ERP_DADOS=%APPDATA%\vt-bicicletas-teste\dados"
set "LOJA=%APPDATA%\vt-bicicletas\dados\vtbicicletas.db"

if not exist "%ERP_DADOS%" mkdir "%ERP_DADOS%"

if /i "%~1"=="--copiar-da-loja" (
  if not exist "%LOJA%" (
    echo Nao achei o banco da loja em "%LOJA%".
    echo O teste vai abrir com um banco novo, so com a tabela de precos.
  ) else (
    echo Copiando os dados da loja para o ambiente de teste...
    copy /y "%LOJA%" "%ERP_DADOS%\vtbicicletas.db" >nul
  )
)

echo.
echo  Abrindo o VT Bicicletas em AMBIENTE DE TESTE
echo  Banco: %ERP_DADOS%
echo.

cd /d "%~dp0"
call npx electron .

endlocal
