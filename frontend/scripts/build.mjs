import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile,cp,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadBuildTarget} from './build-target.mjs';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));
const {build}=require('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const version='1.24.0';
const target=await loadBuildTarget(root);
const configuration=target.configuration;const dist=root+target.dist,archives=root+target.releases;
const teamSlugs=JSON.parse(await readFile(root+'../config/team-slugs.json','utf8'));
configuration.teamAliases=Object.fromEntries(Object.entries(teamSlugs).map(([id,slug])=>[slug,id]));
configuration.teamLabels=JSON.parse(await readFile(root+'../config/team-labels.json','utf8'));
const release=`team-assets/v${version}`;
const dir=root+target.build+'/'+release;
await mkdir(dir,{recursive:true});
await build({entryPoints:[root+'src/team-page.ts'],outfile:dir+'/team-page.js',bundle:true,format:'iife',target:'es2022',minify:true,
  define:{__H43_PUBLIC_CONFIG__:JSON.stringify(configuration)},legalComments:'none'});
await build({entryPoints:[root+'src/team-page.css'],outfile:dir+'/team-page.css',minify:true});
await copyFile(root+'../assets/h43-badge.png',dir+'/h43-badge.png');
const manifest={version,environment:configuration.environment,files:{}};
for(const name of ['team-page.js','team-page.css','h43-badge.png']){
  const bytes=await readFile(dir+'/'+name);manifest.files[name]={bytes:bytes.length,integrity:'sha384-'+createHash('sha384').update(bytes).digest('base64')};
}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const archive=archives+'/v'+version;
let frozen;
try{frozen=JSON.parse(await readFile(archive+'/manifest.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(frozen&&JSON.stringify(frozen)!==JSON.stringify(manifest))throw new Error('Released assets are immutable. Bump the release version before changing bytes/configuration.');
if(process.argv.includes('--freeze')){await mkdir(archive,{recursive:true});await cp(dir,archive,{recursive:true});}
// Retain every frozen release in a clean checkout so old pinned Webnode embeds keep working.
await mkdir(archives,{recursive:true});
for(const entry of await readdir(archives,{withFileTypes:true}))if(entry.isDirectory()&&/^v\d+\.\d+\.\d+$/.test(entry.name)){
  await mkdir(dist+'/team-assets/'+entry.name,{recursive:true});await cp(archives+'/'+entry.name,dist+'/team-assets/'+entry.name,{recursive:true});
}
await mkdir(dist+'/'+release,{recursive:true});await cp(dir,dist+'/'+release,{recursive:true});
await mkdir(dist+'/preview/p11',{recursive:true});
const snippet=`<div id="h43-team-page" data-team-id="p11"></div>\n<link rel="stylesheet" href="/${release}/team-page.css">\n<script src="/${release}/team-page.js" defer></script>`;
await writeFile(dist+'/preview/p11/index.html',`<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>H43 Lund P11 – ${target.environment}</title><link rel="stylesheet" href="/preview/preview.css"></head>
<body><div class="preview-notice">H43 LUND · ${target.environment.toUpperCase()} · Förhandsvisning med SportAdmin-data</div><main>${snippet}<noscript>Aktivera JavaScript för att visa lagets sida.</noscript></main></body></html>`);
await mkdir(dist+'/preview/shared',{recursive:true});
await writeFile(dist+'/preview/shared/index.html',`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>H43 Lund – välj lag</title><link rel="stylesheet" href="/preview/preview.css"></head><body><main>${snippet.replace('data-team-id="p11"','data-team-from-url')}</main></body></html>`);
await mkdir(dist+'/preview',{recursive:true});
await writeFile(dist+'/preview/preview.css','html{background:#e5ebf0}body{margin:0;padding:24px;font-family:system-ui,sans-serif}.preview-notice{max-width:1280px;margin:0 auto 16px;color:#526579;font-size:11px;letter-spacing:.08em}main{max-width:1280px;margin:auto}@media(max-width:600px){body{padding:10px}}');
await writeFile(dist+'/_headers',`/team-assets/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
/preview/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self' ${new URL(configuration.apiBaseUrl).origin}; base-uri 'none'; object-src 'none'; frame-ancestors 'self'
`);
console.log(`Built ${target.environment} v${version}; JS ${manifest.files['team-page.js'].bytes} bytes; CSS ${manifest.files['team-page.css'].bytes} bytes`);
