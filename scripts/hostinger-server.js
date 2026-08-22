const express = require('express');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

function envJs() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  return `window.__ENV = ${JSON.stringify({
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key
  })};\n`;
}

const app = express();

app.get('/env.js', (req, res) => {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(envJs());
    return;
  }
  res.sendFile(path.join(ROOT, 'env.js'));
});

app.use(express.static(ROOT, { index: 'index.html' }));

app.use((req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Campanha ouvindo na porta ${PORT}`);
});
