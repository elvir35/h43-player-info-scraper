import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin=process.argv[2];
if(!/^https:\/\/h43-youth-api-staging\.[a-z0-9-]+\.workers\.dev$/.test(origin||''))throw new Error('Staging origin required');
const releases=new URL('../releases/',import.meta.url);
for(const version of (await readdir(releases)).filter(v=>/^v\d+\.\d+\.\d+$/.test(v))){
const manifest=JSON.parse(await readFile(new URL(version+'/manifest.json',releases),'utf8'));
for(const [name,file] of Object.entries(manifest.files)){
  const r=await fetch(`${origin}/team-assets/${version}/${name}`,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);
  assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.match(r.headers.get('cache-control'),/max-age=31536000.*immutable/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,file.bytes);
  assert.equal('sha384-'+createHash('sha384').update(bytes).digest('base64'),file.integrity);
}
}
const preview=await fetch(origin+'/preview/p11/');assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'no-store');
assert.match(preview.headers.get('content-security-policy'),/script-src 'self'/);assert.match(await preview.text(),/data-team-id="p11"/);
for(const path of ['/api/v1/teams/p11','/api/unknown']){
  const r=await fetch(origin+path);assert.equal(r.status,path.endsWith('/p11')?200:404);
  assert.match(r.headers.get('content-type'),/application\/json/);assert.equal(r.headers.get('cache-control'),'no-store');
}
console.log('PASS staging preview, immutable asset hashes/CORS/headers, and API route precedence/no-store');
