const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const versionFile = path.join(root, 'VERSION');
const jsFile = path.join(root, 'frontend', 'js', 'version.js');
const pkgFile = path.join(root, 'package.json');

const parte = String(process.argv[2] || 'patch').toLowerCase();
const atual = fs.readFileSync(versionFile, 'utf8').trim() || '0.0.0';
const [maior, menor, correcao] = atual.split('.').map((n) => Number(n) || 0);

let proxima = [maior, menor, correcao];
if (parte === 'major') proxima = [maior + 1, 0, 0];
else if (parte === 'minor') proxima = [maior, menor + 1, 0];
else proxima = [maior, menor, correcao + 1];

const numero = proxima.join('.');
const released = new Date().toISOString().slice(0, 10);

fs.writeFileSync(versionFile, numero + '\n');

let js = fs.readFileSync(jsFile, 'utf8');
js = js.replace(/number:\s*'[^']*'/, `number: '${numero}'`);
js = js.replace(/released:\s*'[^']*'/, `released: '${released}'`);
fs.writeFileSync(jsFile, js);

const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = numero;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

process.stdout.write(numero + '\n');
