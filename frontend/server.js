const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FRONTEND_DIR = __dirname;
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));
loadEnvFile(path.join(FRONTEND_DIR, '.env'));

const PORT = Number(process.env.PORT || 8080);
const HTTPS_ON = !/^(0|false|off|no)$/i.test(String(process.env.HTTPS ?? '1'));
const HTTP_PORT = Number(process.env.HTTP_PORT || 0);

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pem': 'application/x-pem-file'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveEnv(res) {
  const payload = `window.__ENV = ${JSON.stringify({
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  })};\n`;
  send(res, 200, payload, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store'
  });
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (relative.startsWith('.env') || relative.includes('..') || relative.startsWith('certs/')) return null;
  const full = path.normalize(path.join(FRONTEND_DIR, relative));
  if (!full.startsWith(FRONTEND_DIR)) return null;
  return full;
}

function handleRequest(req, res) {
  const urlPath = req.url || '/';

  if (urlPath.split('?')[0] === '/env.js') {
    serveEnv(res);
    return;
  }

  const filePath = safeFile(urlPath);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

function ipsLocais() {
  const lista = ['localhost', '127.0.0.1'];
  const nets = os.networkInterfaces();
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      const family = item.family === 4 || item.family === 'IPv4';
      if (family && !item.internal) lista.push(item.address);
    }
  }
  return [...new Set(lista)];
}

function carregarCertificado() {
  const keyEnv = process.env.SSL_KEY;
  const certEnv = process.env.SSL_CERT;
  if (keyEnv && certEnv && fs.existsSync(keyEnv) && fs.existsSync(certEnv)) {
    return {
      key: fs.readFileSync(keyEnv),
      cert: fs.readFileSync(certEnv)
    };
  }

  const dir = path.join(FRONTEND_DIR, 'certs');
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  let selfsigned;
  try {
    selfsigned = require('selfsigned');
  } catch {
    throw new Error('Instale a dependência: npm install');
  }

  fs.mkdirSync(dir, { recursive: true });
  const hosts = ipsLocais();
  const altNames = hosts.map((host) => (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
      ? { type: 7, ip: host }
      : { type: 2, value: host }
  ));
  const pems = selfsigned.generate([{ name: 'commonName', value: 'Campanha' }], {
    days: 825,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }]
  });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

function urlsHttps() {
  return ipsLocais().map((host) => `https://${host}:${PORT}`);
}

function iniciarHttpRedirect() {
  const origem = HTTP_PORT || (PORT === 8080 ? 8081 : 8080);
  if (!origem || origem === PORT) return;
  const redirect = http.createServer((req, res) => {
    const host = String(req.headers.host || `localhost:${origem}`).replace(/:\d+$/, `:${PORT}`);
    const location = `https://${host}${req.url || '/'}`;
    res.writeHead(301, { Location: location });
    res.end();
  });
  redirect.listen(origem, '0.0.0.0', () => {
    console.log(`HTTP redireciona para HTTPS em http://localhost:${origem}`);
  });
}

function avisar() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Aviso: defina SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env');
  }
}

if (!HTTPS_ON) {
  http.createServer(handleRequest).listen(PORT, '0.0.0.0', () => {
    avisar();
    console.log(`Frontend em http://localhost:${PORT}`);
  });
} else {
  const tls = carregarCertificado();
  https.createServer(tls, handleRequest).listen(PORT, '0.0.0.0', () => {
    avisar();
    console.log('Frontend HTTPS:');
    for (const url of urlsHttps()) console.log(`  ${url}`);
    console.log('Na primeira vez, aceite o aviso do certificado no navegador.');
  });
  iniciarHttpRedirect();
}
