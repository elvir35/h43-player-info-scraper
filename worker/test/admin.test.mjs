import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import jpeg from 'jpeg-js';
import adminWorker,{cleanup} from '../dist/admin.js';
const origin='http://localhost:8788',issuer='https://synthetic-h43.cloudflareaccess.com',audience='synthetic-admin-audience';
let mf,db,publicWorker,privateKey,jwk,tokens,csrfTokens;
const initial=()=>({welcomeTitle:null,welcomeDescription:null,seasonMessage:null,heroImageId:null,heroAlt:null,photoPublicationConfirmed:false,instagramUrl:null,instagramLabel:null,tiktokUrl:null,tiktokLabel:null,contactEmail:null,contactText:null});
async function jwt(user='coach',claims={},options={}){return new SignJWT({email:`${user}@example.test`,type:'app',...claims}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(options.issuer||issuer).setAudience(options.audience||audience).setSubject(options.subject||user).setIssuedAt().setExpirationTime(options.exp||'1h').sign(privateKey);}
before(async()=>{
  const pair=await generateKeyPair('RS256');privateKey=pair.privateKey;jwk={...await exportJWK(pair.publicKey),kid:'fixture',alg:'RS256',use:'sig'};
  const options={workers:[{name:'admin',modules:true,scriptPath:'dist/admin.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],
    d1Databases:{DB:'shared-phase5'},r2Buckets:{IMAGES:'phase5-private'},serviceBindings:{PUBLIC_API:'public',ASSETS:()=>new Response('<!doctype html><title>Fixture portal</title>',{headers:{'Content-Type':'text/html'}})},bindings:{ENVIRONMENT:'development',ADMIN_ENABLED:'true',IMAGE_UPLOADS_ENABLED:'true',ADMIN_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,CSRF_SECRET:'synthetic-local-csrf-key-32-characters-minimum',PUBLIC_API_ORIGIN:'https://public.test'},
    outboundService:request=>{if(request.url===issuer+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});throw new Error('Unexpected admin outbound');}},
    {name:'public',modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-07-30',d1Databases:{DB:'shared-phase5'},r2Buckets:{IMAGES:'phase5-private'},bindings:{ENVIRONMENT:'development',PUBLIC_API_ENABLED:'true',ALLOWED_ORIGINS:''},outboundService:()=>Response.json([])}]};
  options.workers.push({...options.workers[0],name:'admin-text',r2Buckets:undefined,bindings:{...options.workers[0].bindings,IMAGE_UPLOADS_ENABLED:'false'}});
  mf=new Miniflare(options);
  db=await mf.getD1Database('DB','admin');publicWorker=await mf.getWorker('public');
  for(const file of ['0001_teams_and_snapshots.sql','0002_p11_configuration.sql','0003_current_team_mode.sql','0004_coach_editorial.sql','0005_image_content_type.sql','0006_retire_youth_roster.sql']){
    const sql=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');for(const statement of sql.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
  }
});
after(async()=>await mf?.dispose());
async function req(path,method='GET',body,user='coach',extra={}){
  const headers={};if(user)headers['Cf-Access-Jwt-Assertion']=tokens[user]??user;
  if(method!=='GET'){headers.Origin=origin;headers['X-CSRF-Token']=csrfTokens[user]??'';headers['Content-Type']='application/json';}
  Object.assign(headers,extra);return mf.dispatchFetch(origin+path,{method,headers,...(body===undefined?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)})});
}
const path=(action='content',team='p11')=>`/api/admin/v1/teams/${team}/${action}`;
async function value(action='content',team='p11',user='coach'){const r=await req(path(action,team),'GET',undefined,user);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function publicValue(){const response=await publicWorker.fetch('https://public.test/api/v1/teams/p11');assert.equal(response.status,200);return response.json();}
beforeEach(async()=>{
  for(const table of ['retired_roster_images','admin_audit','team_content_state','team_content_revisions','team_images','admin_team_assignments','admin_users','roster_sync_status','team_roster_snapshots','team_seasons','teams'])await db.prepare('DELETE FROM '+table).run();
  for(const id of ['p11','p12']){
    await db.prepare('INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season) VALUES(?1,?2,?2,?3,?)').bind(id,id.toUpperCase(),id==='p11'?'378673':'999','current').run();
    await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized) VALUES(?1,'current','','',1)").bind(id).run();
    await db.prepare("INSERT INTO team_content_state(team_id,season,draft_json,updated_at) VALUES(?1,'current',?2,?3)").bind(id,JSON.stringify(initial()),new Date().toISOString()).run();
  }
  for(const [email,role] of [['admin@example.test','admin'],['coach@example.test','coach'],['other@example.test','coach']])await db.prepare('INSERT INTO admin_users(email,role) VALUES(?1,?2)').bind(email,role).run();
  await db.prepare("INSERT INTO admin_team_assignments(email,team_id,can_publish) VALUES('coach@example.test','p11',1)").run();
  tokens={admin:await jwt('admin'),coach:await jwt('coach'),other:await jwt('other')};csrfTokens={};
  for(const user of ['admin','coach','other']){const r=await req('/api/admin/v1/me','GET',undefined,user);assert.equal(r.status,200,await r.clone().text());csrfTokens[user]=(await r.json()).csrfToken;}
});
test('unauthenticated API and assets reject forged email headers',async()=>{
  for(const p of ['/','/app.js',path(),'/teams/p11/preview'])assert.equal((await req(p,'GET',undefined,null,{'Cf-Access-Authenticated-User-Email':'admin@example.test'})).status,401);
  assert.equal((await req('/api/admin/v1/me','GET',undefined,'garbage')).status,401);
});

test('team landing query preserves authentication and never authorizes another team',async()=>{
  assert.equal((await req('/?team=p2015')).status,200);
  assert.equal((await req('/?team=p2014')).status,200);
  assert.equal((await req('/?team=p2015','GET',undefined,null)).status,401);
  assert.equal((await req(path('content','p12'))).status,403);
  for(const url of ['/?team=p2015&team=p2014','/?team=p2015&redirect=https://bad.test','/?team=%3Cscript%3E','/app.js?team=p2015','/api/admin/v1/teams?team=p2014'])assert.equal((await req(url)).status,400);
});
test('expired, wrong issuer/audience and unauthorized identities are rejected',async()=>{
  for(const token of [await jwt('coach',{}, {exp:1}),await jwt('coach',{}, {audience:'wrong'}),await jwt('coach',{}, {issuer:'https://wrong.cloudflareaccess.com'}),await jwt('coach',{type:'service'})])assert.equal((await req('/api/admin/v1/me','GET',undefined,token)).status,401);
  assert.equal((await req('/api/admin/v1/me','GET',undefined,await jwt('unknown'))).status,403);
  assert.equal((await req('/api/admin/v1/me','GET',undefined,await jwt('coach',{}, {subject:'different-person'}))).status,403);
});
test('P11 coach sees one team and every cross-team operation is forbidden',async()=>{
  assert.deepEqual((await (await req('/api/admin/v1/teams')).json()).teams.map(t=>t.id),['p11']);
  for(const [action,method,body] of [['content','GET'],['draft','PUT',{}],['publish','POST',{}],['rollback','POST',{}],['images','POST','bad']])assert.equal((await req(path(action,'p12'),method,body)).status,403);
  assert.equal((await req('/api/admin/v1/preview/teams/p12')).status,403);assert.equal((await req('/teams/p12/preview')).status,403);
});
test('CSRF requires exact origin, same-site metadata and session-bound token',async()=>{
  const body={expectedVersion:0,content:initial()};
  for(const headers of [{'X-CSRF-Token':''},{Origin:'https://evil.test'},{'Sec-Fetch-Site':'cross-site'},{'X-CSRF-Token':csrfTokens.admin}])assert.equal((await req(path('draft'),'PUT',body,'coach',headers)).status,403);
  assert.equal((await req(path('draft'),'PUT',body)).status,200);
});
test('optional mobile survives draft/publish/reload and legacy revisions remain valid',async()=>{
  const legacy=await value();assert.equal(legacy.draft.content.contactPhone,null);
  for(const invalid of ['javascript:alert(1)','+46;1234567','0701234\n567','123','<b>0701234567</b>',123456789])assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:{...initial(),contactPhone:invalid}})).status,422);
  const c={...initial(),contactEmail:'lag@example.test',contactPhone:'+46 70 123 45 67'};assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:c})).status,200);assert.equal((await publicValue()).contact.phone,null);
  assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,200);assert.equal((await publicValue()).contact.phone,c.contactPhone);assert.equal((await value()).draft.content.contactPhone,c.contactPhone);
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:2,content:{...c,contactPhone:null}})).status,200);assert.equal((await req(path('publish'),'POST',{expectedVersion:3,expectedPublishedId:(await value()).published.id})).status,200);assert.equal((await publicValue()).contact.phone,null);
});
test('named contact lists preserve legacy data, publish together and can be removed',async()=>{
  const people=[{name:'Anna Exempel',email:'anna@example.test',phone:'070-123 45 67'},{name:'Bo Exempel',email:'bo@example.test',phone:null}];
  const c={...initial(),contacts:people,contactEmail:people[0].email,contactPhone:people[0].phone};assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:c})).status,200);assert.deepEqual((await value()).draft.content.contacts,people);assert.deepEqual((await publicValue()).contact.people,[]);
  assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,200);assert.deepEqual((await publicValue()).contact.people,people);
  for(const contacts of [[{name:'Only name',email:null,phone:null}],Array(21).fill(people[0]),[{...people[0],role:'admin'}],[{...people[0],name:'<script>bad</script>'}],[{...people[0],phone:'javascript:alert(1)'}]])assert.equal((await req(path('draft'),'PUT',{expectedVersion:2,content:{...c,contacts}})).status,422);
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:2,content:{...c,contactEmail:'other@example.test'}})).status,422);
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:2,content:{...c,contacts:[],contactEmail:null,contactPhone:null}})).status,200);assert.equal((await req(path('publish'),'POST',{expectedVersion:3,expectedPublishedId:(await value()).published.id})).status,200);assert.deepEqual((await publicValue()).contact.people,[]);
});
test('HTML, unsafe social URLs, extra privilege fields and malformed/oversized JSON reject',async()=>{
  for(const patch of [{welcomeTitle:'<script>alert(1)</script>'},{instagramUrl:'https://instagram.com.evil.test/x'},{tiktokUrl:'javascript:alert(1)'},{contactEmail:'x@y.se?body=bad'},{role:'admin'}])assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:{...initial(),...patch}})).status,422);
  assert.equal((await req(path('draft'),'PUT','{')).status,400);assert.equal((await req(path('draft'),'PUT',' '.repeat(65537))).status,413);
});
test('draft preview never modifies public content; publishing atomically creates history/audit',async()=>{
  const c={...initial(),welcomeTitle:'Hej P11',welcomeDescription:'Text med Å Ä Ö',seasonMessage:'Säsongsmeddelande',contactEmail:'team@example.test'};
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:c})).status,200);
  assert.equal((await publicValue()).welcome.title,null);
  const preview=await req('/api/admin/v1/preview/teams/p11');assert.equal(preview.status,200);assert.equal((await preview.json()).welcome.title,'Hej P11');assert.equal((await publicValue()).welcome.title,null);
  const r=await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null});assert.equal(r.status,200,await r.clone().text());
  const published=await publicValue();assert.equal(published.welcome.title,'Hej P11');assert.equal(published.welcome.seasonMessage,'Säsongsmeddelande');assert.equal(published.contact.email,'team@example.test');
  const view=await value();assert.equal(view.history.length,1);assert.equal(view.draft.version,2);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM admin_audit WHERE action='content_published'").first()).n,1);
});
test('concurrent drafts have one winner and stale publication cannot overwrite',async()=>{
  const body={expectedVersion:0,content:initial()};const results=await Promise.all([req(path('draft'),'PUT',body),req(path('draft'),'PUT',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await req(path('publish'),'POST',{expectedVersion:0,expectedPublishedId:null})).status,409);
});
test('publish failure rolls back revision, head and audit together',async()=>{
  await db.prepare("CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit WHEN NEW.action='content_published' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
  try{assert.equal((await req(path('publish'),'POST',{expectedVersion:0,expectedPublishedId:null})).status,503);assert.equal((await db.prepare('SELECT count(*) AS n FROM team_content_revisions').first()).n,0);assert.equal((await value()).published,null);}
  finally{await db.prepare('DROP TRIGGER reject_audit').run();}
});
test('rollback creates a new revision without touching roster or another team',async()=>{
  let r=await (await req(path('publish'),'POST',{expectedVersion:0,expectedPublishedId:null})).json();const old=r.revisionId;
  await req(path('draft'),'PUT',{expectedVersion:1,content:{...initial(),welcomeTitle:'Ny text'}});
  r=await (await req(path('publish'),'POST',{expectedVersion:2,expectedPublishedId:old})).json();assert.equal((await publicValue()).welcome.title,'Ny text');
  const restored=await req(path('rollback'),'POST',{expectedVersion:3,expectedPublishedId:r.revisionId,revisionId:old});assert.equal(restored.status,200,await restored.clone().text());
  assert.equal((await publicValue()).welcome.title,null);assert.equal((await value()).history.length,3);
  assert.equal((await req(path('rollback'),'POST',{expectedVersion:4,expectedPublishedId:(await restored.json()).revisionId,revisionId:crypto.randomUUID()})).status,404);
});
const photo=()=>jpeg.encode({width:2,height:2,data:Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])},80).data;
test('coach publishes images without separate approval or description; drafts stay private and removal hides old image',async()=>{
  const upload=await req(path('images'),'POST',photo(),'coach',{'Content-Type':'image/jpeg'});assert.equal(upload.status,200);const image=await upload.json();
  assert.equal((await req(path('images/'+image.id))).status,200);assert.equal((await req(path('images/'+image.id,'p12'),'GET',undefined,'admin')).status,404);
  const c={...initial(),heroImageId:image.id};
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:c})).status,200);
  assert.equal((await publicWorker.fetch(`https://public.test/api/v1/teams/p11/images/${image.id}`)).status,404);
  assert.equal((await value()).team.photoPublicationAllowed,false);
  assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,200);
  const publicData=await publicValue(),url=publicData.welcome.heroImageUrl;assert.ok(url);assert.equal(publicData.welcome.heroAlt,null);
  const r=await publicWorker.fetch(url);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  await req(path('draft'),'PUT',{expectedVersion:2,content:initial()});
  assert.equal((await req(path('publish'),'POST',{expectedVersion:3,expectedPublishedId:(await value()).published.id})).status,200);
  assert.equal((await publicValue()).welcome.heroImageUrl,null);assert.equal((await publicWorker.fetch(url)).status,404);
});

test('coach without publishing access cannot publish an uploaded image',async()=>{
  const upload=await req(path('images'),'POST',photo(),'coach',{'Content-Type':'image/jpeg'});const image=await upload.json();
  await req(path('draft'),'PUT',{expectedVersion:0,content:{...initial(),heroImageId:image.id}});
  await db.prepare("UPDATE admin_team_assignments SET can_publish=0 WHERE email='coach@example.test'").run();
  assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,403);
  assert.equal((await publicWorker.fetch(`https://public.test/api/v1/teams/p11/images/${image.id}`)).status,404);
});

test('WebP publication uses recorded MIME type and legacy JPEG remains supported',async()=>{
  const id=crypto.randomUUID(),key=`teams/p11/${id}.webp`;const bytes=new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80]);
  await (await mf.getR2Bucket('IMAGES','admin')).put(key,bytes);
  await db.prepare("INSERT INTO team_images(id,team_id,season,object_key,width,height,bytes,state,created_by,created_at,content_type) VALUES(?1,'p11','current',?2,1,1,12,'ready','coach@example.test',?3,'image/webp')").bind(id,key,new Date().toISOString()).run();
  assert.equal((await req(path('images/'+id))).headers.get('Content-Type'),'image/webp');assert.equal((await publicWorker.fetch(`https://public.test/api/v1/teams/p11/images/${id}`)).status,404);
  await req(path('draft'),'PUT',{expectedVersion:0,content:{...initial(),heroImageId:id,heroAlt:'Approved fixture',photoPublicationConfirmed:true}});
  await req(path('settings'),'PUT',{expectedVersion:0,photoPublicationAllowed:true},'admin');assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,200);
  const r=await publicWorker.fetch((await publicValue()).welcome.heroImageUrl);assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/webp');assert.match(r.headers.get('Content-Disposition'),/\.webp/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('invalid formats, truncated JPEG and oversized upload fail without ready image',async()=>{
  assert.equal((await req(path('images'),'POST','<svg/>','coach',{'Content-Type':'image/svg+xml'})).status,415);
  assert.equal((await req(path('images'),'POST',new Uint8Array([255,216,255,217]),'coach',{'Content-Type':'image/jpeg'})).status,422);
  assert.equal((await req(path('images'),'POST',new Uint8Array(2*1024*1024+1),'coach',{'Content-Type':'image/jpeg'})).status,413);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM team_images WHERE state='ready'").first()).n,0);
});
test('large dimensions are rejected and normalized JPEG strips source comments',async()=>{
  const oversized=Buffer.from(photo()),marker=oversized.indexOf(Buffer.from([255,192]));assert.ok(marker>0);oversized.writeUInt16BE(65535,marker+5);oversized.writeUInt16BE(65535,marker+7);
  assert.equal((await req(path('images'),'POST',oversized,'coach',{'Content-Type':'image/jpeg'})).status,422);
  const withComments=jpeg.encode({width:2,height:2,data:jpeg.decode(photo(),{useTArray:true}).data,comments:['GPS_LOCATION_MUST_NOT_PERSIST']},80).data;
  const upload=await req(path('images'),'POST',withComments,'coach',{'Content-Type':'image/jpeg'});assert.equal(upload.status,200);const id=(await upload.json()).id;
  const output=Buffer.from(await (await req(path('images/'+id))).arrayBuffer());assert.ok(!output.includes(Buffer.from('GPS_LOCATION_MUST_NOT_PERSIST')));
});
test('coach cannot escalate role/assignment/photo permissions; admin changes are audited',async()=>{
  assert.equal((await req('/api/admin/v1/users','PUT',{email:'coach@example.test',role:'admin',enabled:true,expectedVersion:1})).status,403);
  assert.equal((await req(path('assignments'),'PUT',{email:'coach@example.test',canPublish:true,enabled:true,expectedVersion:0})).status,403);
  assert.equal((await req(path('settings'),'PUT',{photoPublicationAllowed:true,expectedVersion:0})).status,403);
  const r=await req('/api/admin/v1/users','PUT',{email:'new@example.test',role:'coach',enabled:true,expectedVersion:0},'admin');assert.equal(r.status,200,await r.clone().text());
  const assigned=await req(path('assignments'),'PUT',{email:'new@example.test',canPublish:true,enabled:true,expectedVersion:0},'admin');assert.equal(assigned.status,200,await assigned.clone().text());
});
test('revoked publishing rights reject stale authenticated client; admin responses are no-store',async()=>{
  await db.prepare("UPDATE admin_team_assignments SET can_publish=0 WHERE email='coach@example.test'").run();assert.equal((await req(path('publish'),'POST',{expectedVersion:0,expectedPublishedId:null})).status,403);
  await db.prepare("UPDATE admin_users SET enabled=0 WHERE email='coach@example.test'").run();assert.equal((await req(path())).status,403);
  const me=await req('/api/admin/v1/me','GET',undefined,'admin');assert.equal(me.headers.get('cache-control'),'no-store');assert.equal(me.headers.get('access-control-allow-origin'),null);
});
test('unused image cleanup retains draft/history references and blocks claimed images',async()=>{
  const ids=[];for(let i=0;i<3;i++){const r=await req(path('images'),'POST',photo(),'coach',{'Content-Type':'image/jpeg'});assert.equal(r.status,200);ids.push((await r.json()).id);}
  await req(path('draft'),'PUT',{expectedVersion:0,content:{...initial(),heroImageId:ids[0],heroAlt:'Historical photo',photoPublicationConfirmed:true}});
  await req(path('settings'),'PUT',{expectedVersion:0,photoPublicationAllowed:true},'admin');
  await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null});
  await req(path('draft'),'PUT',{expectedVersion:2,content:{...initial(),heroImageId:ids[1],heroAlt:'Draft'}});
  await db.prepare("UPDATE team_images SET created_at='2000-01-01T00:00:00Z'").run();
  const bucket=await mf.getR2Bucket('IMAGES','admin');await cleanup({DB:db,IMAGES:bucket});
  assert.equal((await db.prepare('SELECT count(*) AS n FROM team_images').first()).n,2);
  assert.equal((await req(path('images/'+ids[0]))).status,200);assert.equal((await req(path('images/'+ids[2]))).status,404);
  await db.prepare("UPDATE team_images SET state='deleting' WHERE id=?1").bind(ids[1]).run();
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:3,content:{...initial(),heroImageId:ids[1]}})).status,409);
});
test('failed R2 upload never produces a ready/public image and disabled admin fails closed',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({keys:[jwk]});
  const env={DB:db,ENVIRONMENT:'development',ADMIN_ENABLED:'true',IMAGE_UPLOADS_ENABLED:'true',ADMIN_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:audience,CSRF_SECRET:'synthetic-local-csrf-key-32-characters-minimum',IMAGES:{put:async()=>{throw new Error('synthetic-storage-failure');},delete:async()=>{}}};
  try{const request=new Request(origin+path('images'),{method:'POST',headers:{'Cf-Access-Jwt-Assertion':tokens.coach,Origin:origin,'X-CSRF-Token':csrfTokens.coach,'Content-Type':'image/jpeg'},body:photo()});
    const r=await adminWorker.fetch(request,env);assert.equal(r.status,503);assert.equal((await db.prepare("SELECT count(*) AS n FROM team_images WHERE state='ready'").first()).n,0);
    const disabled=await adminWorker.fetch(new Request(origin+'/'),{...env,ADMIN_ENABLED:'false'});assert.equal(disabled.status,503);
  }finally{globalThis.fetch=original;}
});

test('text-only portal rejects uploads before decoding and preserves text workflow without R2',async()=>{
 const worker=await mf.getWorker('admin-text');const headers={'Cf-Access-Jwt-Assertion':tokens.coach,Origin:origin,'X-CSRF-Token':csrfTokens.coach,'Content-Type':'image/jpeg'};
 const before=await value();const r=await worker.fetch(origin+path('images'),{method:'POST',headers,body:'invalid bytes'});assert.equal(r.status,503);assert.equal((await r.json()).error.code,'IMAGE_UPLOADS_DISABLED');
 assert.equal((await db.prepare('SELECT count(*) n FROM team_images').first()).n,0);
 const view=await (await worker.fetch(origin+path(),{headers})).json();assert.equal(view.features.imageUploads,false);
 const c={...before.draft.content,welcomeTitle:'Text utan bilder'};headers['Content-Type']='application/json';
 assert.equal((await worker.fetch(origin+path('draft'),{method:'PUT',headers,body:JSON.stringify({expectedVersion:before.draft.version,content:c})})).status,200);
 c.heroImageId=crypto.randomUUID();assert.equal((await worker.fetch(origin+path('draft'),{method:'PUT',headers,body:JSON.stringify({expectedVersion:before.draft.version+1,content:c})})).status,503);
 assert.equal((await value()).draft.content.heroImageId,null);
});

test('removing a portal user disables every team, retains authored history and supports reactivation',async()=>{
  await db.prepare("INSERT INTO admin_team_assignments(email,team_id,can_publish) VALUES('coach@example.test','p12',1)").run();
  await req(path('draft'),'PUT',{expectedVersion:0,content:initial()});await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null});
  const before=await db.prepare("SELECT version FROM admin_users WHERE email='coach@example.test'").first();
  const removed=await req('/api/admin/v1/users/remove','POST',{email:'coach@example.test',expectedVersion:before.version},'admin');assert.equal(removed.status,200);
  assert.equal((await req('/api/admin/v1/me')).status,403);
  assert.equal((await db.prepare("SELECT count(*) n FROM admin_team_assignments WHERE email='coach@example.test'").first()).n,0);
  assert.equal((await db.prepare("SELECT count(*) n FROM team_content_revisions WHERE published_by='coach@example.test'").first()).n,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM admin_audit WHERE action='user_removed'").first()).n,1);
  assert.equal((await req('/api/admin/v1/users','PUT',{email:'coach@example.test',role:'coach',enabled:true,expectedVersion:before.version+1},'admin')).status,200);
  assert.equal((await req('/api/admin/v1/me')).status,200);assert.deepEqual((await (await req('/api/admin/v1/teams')).json()).teams,[]);
});
test('removal rejects non-admin, self-removal, stale versions and malformed input without removing assignments',async()=>{
  const payload={email:'coach@example.test',expectedVersion:1};
  assert.equal((await req('/api/admin/v1/users/remove','POST',payload)).status,403);
  assert.equal((await req('/api/admin/v1/users/remove','POST',{email:'admin@example.test',expectedVersion:1},'admin')).status,422);
  assert.equal((await req('/api/admin/v1/users/remove','POST',{...payload,expectedVersion:999},'admin')).status,409);
  assert.equal((await req('/api/admin/v1/users/remove','POST',{...payload,email:"' OR 1=1 --"},'admin')).status,422);
  assert.equal((await req('/api/admin/v1/users/remove','POST',{...payload,role:'admin'},'admin')).status,422);
  assert.equal((await req('/api/admin/v1/users/remove','PUT',payload,'admin')).status,405);
  assert.equal((await req('/api/admin/v1/users/remove','POST',payload,'admin',{'X-CSRF-Token':'invalid'})).status,403);
  assert.equal((await db.prepare("SELECT enabled FROM admin_users WHERE email='coach@example.test'").first()).enabled,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM admin_team_assignments WHERE email='coach@example.test'").first()).n,1);
  assert.equal((await db.prepare("SELECT count(*) n FROM admin_audit WHERE action='user_removed'").first()).n,0);
});

async function rosterFixture(){
  const player=crypto.randomUUID(),leader=crypto.randomUUID(),other=crypto.randomUUID();
  const sql="INSERT INTO team_roster_snapshots(team_id,season,observed_at,observed_us,players_json,coaches_json,group_id) VALUES(?1,'current',?2,?3,?4,?5,?6)";
  await db.prepare(sql).bind('p11',new Date().toISOString(),Date.now()*1000,JSON.stringify([{name:'Testspelare',sourceId:'100',memberKey:player}]),JSON.stringify([{name:'Testledare',sourceId:'200',memberKey:leader}]),'378673').run();
  await db.prepare(sql).bind('p12',new Date().toISOString(),Date.now()*1000,JSON.stringify([{name:'Other',sourceId:'100',memberKey:other}]),'[]','999').run();return {player,leader,other};
}

const portraitSave=(version,details,headers={'X-H43-Roster-Images':'1'})=>req(path('draft'),'PUT',{expectedVersion:version,content:{...initial(),rosterDetails:details}},'coach',headers);
const detailPhoto=(memberKey,imageId)=>({memberKey,imageId,shirtNumber:null,position:null,responsibility:null});
async function uploadPortrait(){const r=await req(path('images'),'POST',photo(),'coach',{'Content-Type':'image/jpeg'});assert.equal(r.status,200);return (await r.json()).id;}

test('retired roster is absent from editor and preview; legacy clients cannot save roster details',async()=>{
  const ids=await rosterFixture();
  const state=await value();assert.deepEqual(state.roster,{players:[],coaches:[],lastSyncedAt:null});
  const preview=await (await req('/api/admin/v1/preview/teams/p11')).json();assert.deepEqual(preview.roster,{players:[],coaches:[],lastSyncedAt:null});
  const result=await portraitSave(0,[detailPhoto(ids.player,crypto.randomUUID())]);assert.equal(result.status,410);
  assert.equal((await value()).draft.version,0);
});

test('migration records draft and historical portraits; direct images stay blocked after rollback and reference removal',async()=>{
  const ids=await rosterFixture(),portrait=await uploadPortrait(),draftPortrait=await uploadPortrait();
  const legacy={...initial(),heroImageId:portrait,heroAlt:'Private player',rosterDetails:[detailPhoto(ids.player,portrait)]};
  const revision=crypto.randomUUID();
  await db.prepare("INSERT INTO team_content_revisions(id,team_id,season,content_json,published_by,published_at) VALUES(?,'p11','current',?,'coach@example.test',?)").bind(revision,JSON.stringify(legacy),new Date().toISOString()).run();
  await db.prepare("UPDATE team_content_state SET published_revision_id=?,draft_json=? WHERE team_id='p11'").bind(revision,JSON.stringify({...legacy,rosterDetails:[detailPhoto(ids.player,draftPortrait)]})).run();
  const migration=await readFile(new URL('../migrations/0006_retire_youth_roster.sql',import.meta.url),'utf8');
  for(const statement of migration.split(';').filter(s=>s.trim()).slice(1))await db.prepare(statement).run();
  const recorded=(await db.prepare('SELECT image_id FROM retired_roster_images ORDER BY image_id').all()).results.map(r=>r.image_id);
  assert.deepEqual(recorded,[portrait,draftPortrait].sort());
  const publicUrl=id=>`https://public.test/api/v1/teams/p11/images/${id}`;
  assert.equal((await publicWorker.fetch(publicUrl(portrait))).status,404);assert.equal((await req(path('images/'+draftPortrait))).status,404);
  const editor=await value();assert.deepEqual(editor.draft.content.rosterDetails,[]);assert.equal(editor.draft.content.heroImageId,null);assert.equal(editor.published.content.heroImageId,null);
  const pub=await publicValue();assert.equal(pub.welcome.heroImageUrl,null);assert.equal(pub.welcome.heroAlt,null);assert.ok(!JSON.stringify(pub).includes('Private player'));
  const restored=await req(path('rollback'),'POST',{expectedVersion:0,expectedPublishedId:revision,revisionId:revision});assert.equal(restored.status,200);
  assert.equal((await value()).draft.content.heroImageId,null);assert.deepEqual((await value()).draft.content.rosterDetails,[]);
  await db.prepare("DELETE FROM team_content_revisions WHERE id<> (SELECT published_revision_id FROM team_content_state WHERE team_id='p11')").run();
  for(const id of recorded)assert.equal((await publicWorker.fetch(publicUrl(id))).status,404);
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:1,content:{...initial(),heroImageId:portrait}})).status,422);
});

test('roster retirement preserves named contacts, team image upload and publication',async()=>{
  await rosterFixture();const imageId=await uploadPortrait();
  const c={...initial(),heroImageId:imageId,contactEmail:'contact@example.test',contacts:[{name:'Kontaktperson',email:'contact@example.test',phone:null}]};
  assert.equal((await req(path('draft'),'PUT',{expectedVersion:0,content:c})).status,200);
  assert.equal((await req(path('publish'),'POST',{expectedVersion:1,expectedPublishedId:null})).status,200);
  const v=await publicValue();assert.deepEqual(v.contact.people,c.contacts);assert.equal((await publicWorker.fetch(v.welcome.heroImageUrl)).status,200);assert.deepEqual(v.roster.players,[]);
});
