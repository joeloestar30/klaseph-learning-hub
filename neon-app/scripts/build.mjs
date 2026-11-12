import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
try { loadEnvFile('.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const clientSource = await readFile(new URL('../src/client.js', import.meta.url), 'utf8');
const neonClientEntry = fileURLToPath(import.meta.resolve('@neondatabase/neon-js'));
const config = {
  NEON_AUTH_URL: process.env.NEON_AUTH_URL || '',
  NEON_DATA_API_URL: process.env.NEON_DATA_API_URL || '',
  DEMO_MODE: process.env.DEMO_MODE === 'true'
};
for (const key of ['NEON_AUTH_URL', 'NEON_DATA_API_URL']) {
  if (!config[key]) { if (!config.DEMO_MODE) throw new Error(`${key} is required. See .env.example.`); continue; }
  const url = new URL(config[key]);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error(`${key} must be a public HTTPS endpoint without credentials or query parameters.`);
}
await mkdir('dist', { recursive: true });
await build({stdin:{contents:clientSource,resolveDir:appRoot,sourcefile:'client.js'}, alias:{'@neondatabase/neon-js':neonClientEntry}, outfile:'dist/neon-client.js', bundle:true, format:'iife', platform:'browser', target:'es2022', minify:true});
for (const name of ['index.html','app.js','auth-enhancements.js','onboarding-persistence.js','mobile-enhancements.js','neon-onboarding.js','observability.js','cloud-data.js','classroom-operations.js','access-management.js','styles.css','auth-enhancements.css','mobile-enhancements.css','manifest.json','sw.js','_headers']) {
  await cp(name, `dist/${name}`);
}
await cp('assets', 'dist/assets', {recursive:true});
await cp('ellna.js', 'dist/ellna.js');
await cp('ellna.css', 'dist/ellna.css');
await writeFile('dist/config.js', `window.KLASEPH_CONFIG = ${JSON.stringify(config)};\n`);
console.log(`Built dist/ (${config.DEMO_MODE ? 'LOCAL DEMO' : 'Neon cloud'}).`);
