// Loopback-only synthetic integration harness. Never deploy this Node server.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));const {Miniflare}=require('miniflare');
const {generateKeyPair,exportJWK,SignJWT}=await import(pathToFileURL(require.resolve('jose')).href);
const root=fileURLToPath(new URL('../../',import.meta.url)),origin='http://127.0.0.1:3001',issuer='https://local-fixture.cloudflareaccess.com';
process.chdir(root+'worker'); // Keep workerd module paths inside its module root on Windows.
const pair=await generateKeyPair('RS256'),jwk={...await exportJWK(pair.publicKey),kid:'local',alg:'RS256'};
const tokens={};async function token(role,expired=false){return new SignJWT({email:`${role}@example.test`,type:'app'}).setProtectedHeader({alg:'RS256',kid:'local'}).setIssuer(issuer).setAudience('local-admin-only').setSubject(role).setIssuedAt().setExpirationTime(expired?1:'2h').sign(pair.privateKey);}
for(const role of ['admin','coach','other'])tokens[role]=await token(role);
async function asset(request,folder){let path=new URL(request.url).pathname;if(path==='/')path='/index.html';const base=resolve(root,folder),file=resolve(base,'.'+path);
  if(!file.startsWith(base+sep))return new Response('Not found',{status:404});try{return new Response(await readFile(file),{headers:{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'}[extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}
const mf=new Miniflare({workers:[{name:'admin',modules:true,scriptPath:root+'worker/dist/admin.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'admin-local-fixture'},r2Buckets:{IMAGES:'private-local-fixture'},serviceBindings:{PUBLIC_API:'public',ASSETS:request=>asset(request,'admin/dist')},
  bindings:{ENVIRONMENT:'development',ADMIN_ENABLED:'true',IMAGE_UPLOADS_ENABLED:'true',ADMIN_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:'local-admin-only',CSRF_SECRET:'local-fixture-only-not-a-real-credential-32-bytes',PUBLIC_API_ORIGIN:'https://public.test'},
  outboundService:request=>request.url===issuer+'/cdn-cgi/access/certs'?Response.json({keys:[jwk]}):new Response('Unavailable',{status:503})},
 {name:'public',modules:true,scriptPath:root+'worker/dist/index.js',compatibilityDate:'2026-07-30',d1Databases:{DB:'admin-local-fixture'},r2Buckets:{IMAGES:'private-local-fixture'},bindings:{ENVIRONMENT:'development',PUBLIC_API_ENABLED:'true',ALLOWED_ORIGINS:''},outboundService:()=>Response.json([])}]});
const db=await mf.getD1Database('DB','admin'),publicWorker=await mf.getWorker('public');
for(const name of ['0001_teams_and_snapshots.sql','0002_p11_configuration.sql','0003_current_team_mode.sql','0004_coach_editorial.sql','0005_image_content_type.sql']){
  for(const statement of (await readFile(root+'worker/migrations/'+name,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(statement).run();
}
const empty=()=>({welcomeTitle:null,welcomeDescription:null,seasonMessage:null,heroImageId:null,heroAlt:null,photoPublicationConfirmed:false,instagramUrl:null,instagramLabel:null,tiktokUrl:null,tiktokLabel:null,contactEmail:null,contactText:null});
async function seed(){for(const table of ['admin_audit','team_content_state','team_content_revisions','team_images','admin_team_assignments','admin_users','roster_sync_status','team_roster_snapshots','team_seasons','teams'])await db.prepare('DELETE FROM '+table).run();
  for(const id of ['p11','p12']){await db.prepare("INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season) VALUES(?1,?2,?3,'378673','current')").bind(id,'H43 Lund '+id.toUpperCase(),id.toUpperCase()).run();await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized) VALUES(?1,'current','','',1)").bind(id).run();await db.prepare("INSERT INTO team_content_state(team_id,season,draft_json,updated_at) VALUES(?1,'current',?2,?3)").bind(id,JSON.stringify(empty()),new Date().toISOString()).run();}
  await db.prepare("INSERT INTO team_roster_snapshots(team_id,season,observed_at,observed_us,players_json,coaches_json,group_id) VALUES('p11','current',?1,?2,?3,?4,'378673')").bind(new Date().toISOString(),Date.now()*1000,JSON.stringify([{name:'Testspelare Åsa',sourceId:'100',memberKey:'11111111-1111-4111-8111-111111111111'}]),JSON.stringify([{name:'Testledare Öberg',sourceId:'200',memberKey:'22222222-2222-4222-8222-222222222222'}])).run();
  for(const role of ['admin','coach','other'])await db.prepare('INSERT INTO admin_users(email,role) VALUES(?1,?2)').bind(role+'@example.test',role==='admin'?'admin':'coach').run();
  await db.prepare("INSERT INTO admin_team_assignments(email,team_id,can_publish) VALUES('coach@example.test','p11',1)").run();tokens.coach=await token('coach');
}await seed();
const server=createServer(async(req,res)=>{try{
  const role=['admin','coach','other','anonymous'].includes(req.headers['x-test-identity'])?req.headers['x-test-identity']:'coach';const url=new URL(req.url,origin);
  if(url.pathname==='/__test/reset'&&req.method==='POST'){await seed();res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
  if(url.pathname==='/__test/expire'&&req.method==='POST'){tokens.coach=await token('coach',true);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
  let response;
  if(url.pathname==='/__test/public-widget')response=new Response('<!doctype html><html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="h43-team-page" data-team-id="p11"></div><script src="/team-assets/v1.24.0/team-page.js" defer></script></body></html>',{headers:{'Content-Type':'text/html'}});
  else if(url.pathname.startsWith('/__public/'))response=await publicWorker.fetch('https://public.test'+url.pathname.slice('/__public'.length));
  else if(url.pathname.startsWith('/team-assets/'))response=await asset(new Request(url),'frontend/dist');
  else{const headers=new Headers();for(const [name,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(name,value);if(role!=='anonymous')headers.set('Cf-Access-Jwt-Assertion',tokens[role]);else headers.delete('Cf-Access-Jwt-Assertion');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    response=await mf.dispatchFetch(url.href,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":{"code":"LOCAL_HARNESS_ERROR"}}');}});
server.listen(3001,'127.0.0.1',()=>console.log('Synthetic local portal only: '+origin+' (coach@example.test); no live account/resource access'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{server.close();await mf.dispose();process.exit(0);});
