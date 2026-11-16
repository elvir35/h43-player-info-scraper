import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadBuildTarget} from '../../frontend/scripts/build-target.mjs';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));const {build}=require('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));const target=await loadBuildTarget(fileURLToPath(new URL('../../frontend/',import.meta.url)));const dist=root+target.dist;await mkdir(dist+'/preview-assets',{recursive:true});
for(const name of ['index.html','app.css'])await copyFile(root+name,dist+'/'+name);
await build({entryPoints:[root+'app.js'],outfile:dist+'/app.js',bundle:true,format:'iife',target:'es2022',minify:true});
const configuration=target.configuration;
const teamSlugs=JSON.parse(await readFile(root+'../config/team-slugs.json','utf8'));
configuration.teamAliases=Object.fromEntries(Object.entries(teamSlugs).map(([id,slug])=>[slug,id]));
configuration.teamLabels=JSON.parse(await readFile(root+'../config/team-labels.json','utf8'));
await build({entryPoints:[root+'../frontend/src/team-page.ts'],outfile:dist+'/preview-assets/team-page.js',bundle:true,format:'iife',target:'es2022',minify:true,
  define:{__H43_PUBLIC_CONFIG__:JSON.stringify({...configuration,apiBaseUrl:'/api/admin/v1/preview',credentials:'same-origin'})}});
await build({entryPoints:[root+'../frontend/src/team-page.css'],outfile:dist+'/preview-assets/team-page.css',minify:true});
console.log('Built private admin assets and shared draft-preview widget; no deployment');
