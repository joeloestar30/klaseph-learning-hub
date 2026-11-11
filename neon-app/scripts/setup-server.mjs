// Temporary, loopback-only transfer surface for the Neon SQL editor.
// Never deployed or included in the production build.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const routes={'/schema':'database/schema.sql','/import':'.migration/import.sql'};
createServer(async(req,res)=>{
  if (!routes[req.url]) return res.writeHead(404).end();
  const value=(await readFile(routes[req.url],'utf8')).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}).end(`<title>Neon setup SQL</title><h1>Prepared setup SQL</h1><p>${req.url === '/schema' ? 'Schema and access rules' : 'Existing account and classroom migration'} — ${value.length} characters</p><button onclick="navigator.clipboard.writeText(document.querySelector('textarea').value).then(()=>document.querySelector('p').textContent='Copied SQL to clipboard')">Copy prepared SQL</button><textarea aria-label="SQL source" readonly>${value}</textarea>`);
}).listen(4174,'127.0.0.1',()=>console.log('Setup transfer: http://127.0.0.1:4174'));
