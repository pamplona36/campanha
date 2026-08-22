const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FRONT = path.join(ROOT, 'frontend');
const OUT = path.join(ROOT, 'dist', 'hostinger');

const IGNORAR = new Set([
  'server.js',
  'certs',
  '.env',
  'env.js',
  '.htaccess',
  'env.example.js'
]);

function loadEnvFile(filePath, dest) {
  if (!fs.existsSync(filePath)) return dest;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!dest[key]) dest[key] = value;
  }
  return dest;
}

function copiar(origem, destino) {
  const nome = path.basename(origem);
  if (IGNORAR.has(nome)) return;
  const stat = fs.statSync(origem);
  if (stat.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const item of fs.readdirSync(origem)) {
      copiar(path.join(origem, item), path.join(destino, item));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
}

function limparPasta(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function escreverEnvJs() {
  const env = loadEnvFile(path.join(FRONT, '.env'), loadEnvFile(path.join(ROOT, '.env'), {}));
  const url = (env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const key = env.SUPABASE_ANON_KEY || '';
  fs.writeFileSync(path.join(OUT, 'env.js'), `window.__ENV = ${JSON.stringify({
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key
  }, null, 2)};\n`);
  return url.includes('supabase.co') && !url.includes('SEU-PROJETO') && key.length > 20;
}

function escreverAppNode() {
  const versao = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim() || '1.0.0';
  const pkg = {
    name: 'campanha',
    version: versao,
    private: true,
    description: 'Controle de entrega de materiais de campanha',
    engines: { node: '20.x' },
    scripts: {
      start: 'node server.js'
    },
    dependencies: {
      express: '^4.21.2'
    }
  };
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.copyFileSync(path.join(ROOT, 'scripts', 'hostinger-server.js'), path.join(OUT, 'server.js'));
}

function compactar() {
  const dist = path.join(ROOT, 'dist');
  const zip = path.join(dist, 'campanha-hostinger.zip');
  const tgz = path.join(dist, 'campanha-hostinger.tar.gz');
  for (const arquivo of [zip, tgz]) {
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  }

  const zipado = spawnSync('tar', ['-a', '-cf', zip, '-C', OUT, '.'], { stdio: 'inherit' });
  if (zipado.status !== 0) {
    throw new Error('Falha ao criar o ZIP. Confira se o comando tar está disponível.');
  }

  const tarball = spawnSync('tar', ['-czf', tgz, '-C', OUT, '.'], { stdio: 'inherit' });
  if (tarball.status !== 0) {
    console.warn('Aviso: não foi possível criar o .tar.gz. Use o .zip.');
    return { zip, tgz: null };
  }
  return { zip, tgz };
}

limparPasta(OUT);
copiar(FRONT, OUT);
const envOk = escreverEnvJs();
escreverAppNode();
fs.copyFileSync(path.join(ROOT, 'VERSION'), path.join(OUT, 'VERSION'));

const pacote = compactar();
console.log(`Pasta: ${OUT}`);
console.log(`ZIP:   ${pacote.zip}`);
if (pacote.tgz) console.log(`TGZ:   ${pacote.tgz}`);
if (envOk) console.log('env.js gerado a partir do arquivo .env local.');
else console.log('Aviso: preencha as variáveis SUPABASE_URL e SUPABASE_ANON_KEY no hPanel.');
console.log('Na Hostinger: envie campanha-hostinger.zip (framework Express / Node 20).');
