# Deploy na Hostinger (app Node.js)

A tela de upload da Hostinger exige um projeto Node.js reconhecido. O pacote é um app **Express**.

## 1. Gerar o ZIP

```
npm run hostinger
```

Arquivo para enviar: `dist/campanha-hostinger.zip`

Na raiz do ZIP existem `package.json` e `server.js` (obrigatório para a Hostinger aceitar).

## 2. Upload

1. Arraste `dist/campanha-hostinger.zip` em **Faça upload dos arquivos do seu app**.
2. Se pedir framework: **Express** (ou **Other**).
3. Node.js: **20**.
4. Comando de start: `npm start` (ou `node server.js`).
5. Sem comando de build (deixe vazio).
6. Diretório de saída: vazio ou `.`

## 3. Variáveis de ambiente no hPanel

```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon
```

O `env.js` já vai no ZIP (gerado do `.env` local). As variáveis do hPanel têm prioridade.

## 4. SSL

Ative o SSL gratuito no domínio. O app escuta HTTP na porta `PORT` da Hostinger; o HTTPS fica no proxy deles.
