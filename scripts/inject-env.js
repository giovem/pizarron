/**
 * Sustituye en pizarron.html los placeholders por variables de entorno.
 * Uso: en Cloudflare Pages define SUPABASE_URL y SUPABASE_ANON_KEY; el build ejecuta este script.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'pizarron.html');
let html = fs.readFileSync(htmlPath, 'utf8');

function escapeJsStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
const url = escapeJsStr(process.env.SUPABASE_URL || '');
const key = escapeJsStr(process.env.SUPABASE_ANON_KEY || '');

html = html.replace(/__SUPABASE_URL__/g, url);
html = html.replace(/__SUPABASE_ANON_KEY__/g, key);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Inyectadas variables de entorno en pizarron.html');
