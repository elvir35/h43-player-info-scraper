import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {validateContract} from './smoke-staging.mjs';

export function productionOrigin(value){
  const u=new URL(value);
  assert.equal(u.protocol,'https:');assert.equal(u.username,'');assert.equal(u.password,'');
  assert.equal(u.port,'');assert.equal(u.pathname,'/');assert.equal(u.search,'');assert.equal(u.hash,'');
  assert.match(u.hostname,/^h43-youth-api-production\.[a-z0-9-]+\.workers\.dev$/);
  return u.origin;
}
export async function smokeProduction(value){
  const origin=productionOrigin(value),teams=JSON.parse(await readFile(new URL('../../config/youth-teams.json',import.meta.url),'utf8'));
  const get=async(path,options={})=>{const r=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000),...options});const body=await r.text();assert(Buffer.byteLength(body)<=256*1024);return {r,body};};
  const results=[],images=new Set();
  for(const team of teams){
    const {r,body}=await get('/api/v1/teams/'+team.id);assert.equal(r.status,200);
    assert.match(r.headers.get('content-type'),/^application\/json/);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert(r.headers.get('content-security-policy'));
    const data=JSON.parse(body);validateContract(data,team.id);assert(['available','stale','empty'].includes(data.dataStatus.roster));
    assert(!body.includes('-staging.'));for(const key of ['calendar','matches','playedMatches'])assert(['available','empty'].includes(data.dataStatus[key]));
    for(const image of [data.welcome.heroImageUrl,...data.roster.players.map(p=>p.imageUrl)].filter(Boolean)){assert.equal(new URL(image).origin,origin);images.add(image);}
    results.push({team:team.id,players:data.roster.players.length,leaders:data.roster.coaches.length,events:data.upcomingEvents.length,upcoming:data.upcomingMatches.length,played:data.playedMatches.length});
  }
  for(const url of images){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^image\/(jpeg|webp)$/);assert.equal(r.headers.get('cache-control'),'no-store');await r.arrayBuffer();}
  assert.equal((await get('/api/v1/teams/unconfigured-team')).r.status,404);
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await get('/api/v1/teams/p11',{method})).r.status,405);
  for(const [originHeader,expected] of [['https://www.h43lund.se',200],['https://h43lund.se',200],['http://localhost:3000',403],['https://untrusted.invalid',403]]){
    const {r}=await get('/api/v1/teams/p11',{headers:{Origin:originHeader}});assert.equal(r.status,expected);if(expected===200)assert.equal(r.headers.get('access-control-allow-origin'),originHeader);assert.equal(r.headers.get('access-control-allow-credentials'),null);
  }
  assert.equal((await get('/api/v1/teams/p11',{method:'OPTIONS',headers:{Origin:'https://www.h43lund.se','Access-Control-Request-Method':'GET'}})).r.status,204);
  for(const token of [null,'invalid-production-credential'])assert.equal((await get('/api/v1/internal/teams/p11/roster',{method:'PUT',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:'{}'})).r.status,401);
  const admin=origin.replace('h43-youth-api-production.','h43-youth-admin-production.');
  for(const path of ['/','/app.js','/api/admin/v1/me']){const r=await fetch(admin+path,{redirect:'manual'});assert.equal(r.status,302);const login=new URL(r.headers.get('location'));assert.match(login.hostname,/^[a-z0-9-]+\.cloudflareaccess\.com$/);await r.body?.cancel();}
  return {status:'passed',origin,teams:results,publicImages:images.size,checks:['contract','team-data','chronological-matches','private-field-projection','image-origin-and-delivery','unknown-team','read-only-methods','cors','no-store','unauthorized-ingestion','admin-access-redirects']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))smokeProduction(process.argv[2]).then(async result=>{if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}).catch(()=>{console.error('Production smoke failed; names, tokens and response bodies suppressed');process.exitCode=1;});
