const fs = require('fs');
const path = require('path');

// Mesma lógica do db.js: no app instalado, a pasta do .exe é somente-leitura,
// então os dados e os backups ficam na pasta de dados do usuário.
function pastaBase() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) return app.getPath('userData');
  } catch (e) {
    // fora do Electron — usa a pasta do projeto
  }
  return path.join(__dirname, '..');
}

// O mesmo desvio do db.js, pelo mesmo motivo: sem ele, um teste de backup
// copiaria e apagaria dentro da pasta da loja de verdade. As duas leituras
// têm de concordar, senão o backup salvaria um banco e o sistema usaria
// outro.
const PASTA_DADOS = process.env.ERP_DADOS
  ? path.resolve(process.env.ERP_DADOS)
  : path.join(pastaBase(), 'dados');
const PASTA_BACKUPS = path.join(PASTA_DADOS, 'backups');
const ARQUIVO_BANCO = path.join(PASTA_DADOS, 'vtbicicletas.db');
const MANTER = 30; // quantas cópias guardar

function garantirPasta() {
  if (!fs.existsSync(PASTA_BACKUPS)) fs.mkdirSync(PASTA_BACKUPS, { recursive: true });
}

function carimbo(comHora = false) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return comHora ? `${data}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` : data;
}

// Copia o banco. Uma cópia por dia no automático;
// no manual, inclui a hora para não sobrescrever a do dia.
function fazerBackup({ manual = false } = {}) {
  if (!fs.existsSync(ARQUIVO_BANCO)) return null;
  garantirPasta();

  const nome = manual
    ? `vtbicicletas_${carimbo(true)}_manual.db`
    : `vtbicicletas_${carimbo()}.db`;
  const destino = path.join(PASTA_BACKUPS, nome);

  // No automático, se a cópia de hoje já existe, não refaz.
  if (!manual && fs.existsSync(destino)) return null;

  fs.copyFileSync(ARQUIVO_BANCO, destino);
  limparAntigos();
  return { arquivo: nome, tamanho: fs.statSync(destino).size };
}

function listarBackups() {
  garantirPasta();
  return fs.readdirSync(PASTA_BACKUPS)
    .filter(a => a.endsWith('.db'))
    .map(a => {
      const info = fs.statSync(path.join(PASTA_BACKUPS, a));
      return {
        arquivo: a,
        tamanho: info.size,
        quando: info.mtime.toISOString(),
        manual: a.includes('_manual')
      };
    })
    .sort((x, y) => y.quando.localeCompare(x.quando));
}

// Mantém as cópias manuais e as MANTER automáticas mais recentes.
function limparAntigos() {
  const automaticos = listarBackups().filter(b => !b.manual);
  for (const antigo of automaticos.slice(MANTER)) {
    try {
      fs.unlinkSync(path.join(PASTA_BACKUPS, antigo.arquivo));
    } catch (e) {
      // se não der para apagar, segue a vida — não é crítico
    }
  }
}

// Antes de restaurar, guarda o banco atual como "antes-de-restaurar",
// para o caso de a pessoa se arrepender.
function restaurarBackup(arquivo) {
  const origem = path.join(PASTA_BACKUPS, arquivo);
  if (!fs.existsSync(origem)) throw new Error('Cópia não encontrada.');

  garantirPasta();
  if (fs.existsSync(ARQUIVO_BANCO)) {
    fs.copyFileSync(
      ARQUIVO_BANCO,
      path.join(PASTA_BACKUPS, `vtbicicletas_${carimbo(true)}_antes-de-restaurar.db`)
    );
  }

  fs.copyFileSync(origem, ARQUIVO_BANCO);
  // Limpa arquivos auxiliares do SQLite, que ficariam dessincronizados
  for (const extra of ['-wal', '-shm']) {
    const caminho = ARQUIVO_BANCO + extra;
    if (fs.existsSync(caminho)) {
      try { fs.unlinkSync(caminho); } catch (e) { /* ignora */ }
    }
  }
  return { restaurado: arquivo };
}

function pastaBackups() {
  garantirPasta();
  return PASTA_BACKUPS;
}

function caminhos() {
  return {
    dados: PASTA_DADOS,
    backups: PASTA_BACKUPS,
    banco: ARQUIVO_BANCO,
    bancoExiste: fs.existsSync(ARQUIVO_BANCO)
  };
}

module.exports = { fazerBackup, listarBackups, restaurarBackup, pastaBackups, caminhos };
