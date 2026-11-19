import {authenticate,csrf,mutation,type Actor,type AuthEnv} from './admin-auth';
import {ApiError,fail,object,plain,requestJson,slug,MAX_RESPONSE} from './validation';
import {content,email,integer,uuid,publicContent,retiredImage,type Content} from './editorial';
import {normalizeJpeg,normalizeWithImages} from './admin-images';
export {normalizeWithImages} from './admin-images';
interface Env extends AuthEnv{ASSETS:Fetcher;IMAGES?:R2Bucket;IMAGE_PROCESSOR?:ImagesBinding;IMAGE_UPLOADS_ENABLED?:string;PUBLIC_API:Fetcher;PUBLIC_API_ORIGIN:string;RATE_LIMITER?:{limit(options:{key:string}):Promise<{success:boolean}>};}
type State={team_id:string;name:string;season:string;draft_json:string;draft_version:number;published_revision_id:string|null;photo_publication_allowed:number;config_version:number;};
const authority=(publish=false)=>`EXISTS(SELECT 1 FROM admin_users u WHERE u.email=?1 AND u.access_subject=?2 AND u.enabled=1 AND
 (u.role='admin' OR EXISTS(SELECT 1 FROM admin_team_assignments a WHERE a.email=u.email AND a.team_id=?3 ${publish?'AND a.can_publish=1':''})))`;
const current=`EXISTS(SELECT 1 FROM teams t WHERE t.id=?3 AND t.enabled=1 AND t.current_season=?4)`;
const imageValid=(parameter:number)=>`(?${parameter} IS NULL OR EXISTS(SELECT 1 FROM team_images i WHERE i.id=?${parameter} AND i.team_id=?3 AND i.season=?4 AND i.state='ready'))`;
const rosterImagesValid=(parameter:number)=>`NOT EXISTS(SELECT 1 FROM json_each(?${parameter},'$.rosterDetails') d
  WHERE json_extract(d.value,'$.imageId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM team_images i
    WHERE i.id=json_extract(d.value,'$.imageId') AND i.team_id=?3 AND i.season=?4 AND i.state='ready'))`;
async function team(env:Env,actor:Actor,id:string,publish=false):Promise<State>{
  const row=await env.DB.prepare(`SELECT s.*,t.name FROM team_content_state s JOIN teams t ON t.id=s.team_id AND t.current_season=s.season
    WHERE s.team_id=?3 AND t.enabled=1 AND ${authority(publish)}`).bind(actor.email,actor.subject,id).first<State>();
  if(!row)fail(403,'TEAM_NOT_AUTHORIZED');return row;
}
function admin(actor:Actor){if(actor.role!=='admin')fail(403,'ADMIN_REQUIRED');}
function stamp(){return new Date().toISOString();}
function audit(env:Env,actor:Actor,action:string,state:State|null,revision:string|null,condition='1',values:unknown[]=[]){
  return env.DB.prepare(`INSERT INTO admin_audit(id,actor_email,action,team_id,season,revision_id,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE ${condition}`).bind(crypto.randomUUID(),actor.email,action,state?.team_id??null,state?.season??null,revision,stamp(),...values);
}
function checked(results:D1Result[],index=0){if(results[index].meta.changes!==1)fail(409,'EDIT_CONFLICT');}
async function source(env:Env,id:string){
  if(!env.PUBLIC_API||!env.PUBLIC_API_ORIGIN)fail(503,'PREVIEW_SOURCE_UNAVAILABLE');
  const response=await env.PUBLIC_API.fetch(new Request(`${env.PUBLIC_API_ORIGIN}/api/v1/teams/${id}`,{headers:{Accept:'application/json'}}));
  if(!response.ok)fail(503,'PREVIEW_SOURCE_UNAVAILABLE');const raw=await response.text();if(new TextEncoder().encode(raw).length>MAX_RESPONSE)fail(503,'PREVIEW_SOURCE_UNAVAILABLE');
  const value=JSON.parse(raw) as Record<string,unknown>;if(value.id!==id||value.apiVersion!=='1')fail(503,'PREVIEW_SOURCE_UNAVAILABLE');return value;
}
async function safeContent(env:Env,raw:string){
  const c=content(JSON.parse(raw));
  if(c.heroImageId&&await retiredImage(env.DB,c.heroImageId)){c.heroImageId=null;c.heroAlt=null;}
  return c;
}
async function getContent(env:Env,actor:Actor,state:State){
  const revisions=await env.DB.prepare('SELECT id,published_at,published_by,restored_from FROM team_content_revisions WHERE team_id=?1 AND season=?2 ORDER BY published_at DESC,rowid DESC LIMIT 50').bind(state.team_id,state.season).all();
  const head=state.published_revision_id?await env.DB.prepare('SELECT content_json,published_at,published_by FROM team_content_revisions WHERE id=?1 AND team_id=?2 AND season=?3').bind(state.published_revision_id,state.team_id,state.season).first<{content_json:string;published_at:string;published_by:string}>():null;
  const permission=actor.role==='admin'?true:!!(await env.DB.prepare('SELECT can_publish FROM admin_team_assignments WHERE email=?1 AND team_id=?2').bind(actor.email,state.team_id).first<{can_publish:number}>())?.can_publish;
  return {roster:{lastSyncedAt:null,players:[],coaches:[]},team:{id:state.team_id,name:state.name,season:state.season,photoPublicationAllowed:state.photo_publication_allowed===1,configVersion:state.config_version},
    draft:{version:state.draft_version,content:await safeContent(env,state.draft_json)},published:head?{id:state.published_revision_id,content:await safeContent(env,head.content_json),at:head.published_at,by:head.published_by}:null,
    canPublish:permission,features:{imageUploads:env.IMAGE_UPLOADS_ENABLED==='true'&&!!env.IMAGES&&(!!env.IMAGE_PROCESSOR||env.ENVIRONMENT==='development')},history:revisions.results};
}
async function save(env:Env,actor:Actor,state:State,value:unknown,supportsPortraits=false){
  const body=object(value,['expectedVersion','content']);const version=integer(body.expectedVersion),c=content(body.content);
  if((body.content as Content).rosterDetails?.length)fail(410,'ROSTER_RETIRED');
  if(c.heroImageId&&await retiredImage(env.DB,c.heroImageId))fail(422,'IMAGE_RETIRED');
  if(env.IMAGE_UPLOADS_ENABLED!=='true'&&c.heroImageId!==content(JSON.parse(state.draft_json)).heroImageId)fail(503,'IMAGE_UPLOADS_DISABLED');
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE team_content_state SET draft_json=?6,draft_version=draft_version+1,updated_by=?1,updated_at=?7
      WHERE team_id=?3 AND season=?4 AND draft_version=?5 AND ${authority()} AND ${current} AND ${imageValid(8)} AND ${rosterImagesValid(6)}`)
      .bind(actor.email,actor.subject,state.team_id,state.season,version,JSON.stringify(c),stamp(),c.heroImageId),
    audit(env,actor,'draft_saved',state,null,'changes()=1')]);checked(results);return {version:version+1};
}
async function publish(env:Env,actor:Actor,state:State,value:unknown,rollback=false){
  const body=object(value,rollback?['expectedVersion','expectedPublishedId','revisionId']:['expectedVersion','expectedPublishedId']);
  const version=integer(body.expectedVersion),expected=body.expectedPublishedId===null?null:uuid(body.expectedPublishedId);
  let c=await safeContent(env,state.draft_json),restored:string|null=null;
  if(rollback){restored=uuid(body.revisionId);const revision=await env.DB.prepare('SELECT content_json FROM team_content_revisions WHERE id=?1 AND team_id=?2 AND season=?3').bind(restored,state.team_id,state.season).first<{content_json:string}>();if(!revision)fail(404,'REVISION_NOT_FOUND');c=await safeContent(env,revision.content_json);}
  const id=crypto.randomUUID(),at=stamp();
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO team_content_revisions(id,team_id,season,content_json,published_by,published_at,previous_id,restored_from)
      SELECT ?7,?3,?4,?8,?1,?9,published_revision_id,?10 FROM team_content_state
      WHERE team_id=?3 AND season=?4 AND draft_version=?5 AND published_revision_id IS ?6 AND ${authority(true)} AND ${current} AND ${imageValid(11)} AND ${rosterImagesValid(8)}
      AND draft_json=?12`)
      .bind(actor.email,actor.subject,state.team_id,state.season,version,expected,id,JSON.stringify(c),at,restored,c.heroImageId,state.draft_json),
    env.DB.prepare(`UPDATE team_content_state SET published_revision_id=?1,draft_json=?2,draft_version=draft_version+1,updated_by=?3,updated_at=?4
      WHERE team_id=?5 AND season=?6 AND EXISTS(SELECT 1 FROM team_content_revisions r WHERE r.id=?1 AND r.team_id=?5 AND r.season=?6)`)
      .bind(id,JSON.stringify(c),actor.email,at,state.team_id,state.season),
    audit(env,actor,rollback?'content_rolled_back':'content_published',state,id,'EXISTS(SELECT 1 FROM team_content_state WHERE team_id=?8 AND season=?9 AND published_revision_id=?10)',[state.team_id,state.season,id])
  ]);checked(results);return {revisionId:id,version:version+1,publishedAt:at};
}
async function upload(request:Request,env:Env,actor:Actor,state:State){
  if(env.IMAGE_UPLOADS_ENABLED!=='true'||!env.IMAGES)fail(503,'IMAGE_UPLOADS_DISABLED');
  if(request.headers.get('Content-Type')!=='image/jpeg')fail(415,'JPEG_REQUIRED');
  if(Number(request.headers.get('Content-Length')??0)>2*1024*1024)fail(413,'IMAGE_TOO_LARGE');
  if(!env.IMAGE_PROCESSOR&&env.ENVIRONMENT!=='development')fail(503,'IMAGE_PROCESSING_UNAVAILABLE');
  const normalized=env.IMAGE_PROCESSOR?await normalizeWithImages(request.body,env.IMAGE_PROCESSOR):await normalizeJpeg(request.body);
  const id=crypto.randomUUID(),key=`teams/${state.team_id}/${id}.${normalized.contentType==='image/webp'?'webp':'jpg'}`;
  const created=await env.DB.batch([
    env.DB.prepare(`INSERT INTO team_images(id,team_id,season,object_key,width,height,bytes,state,created_by,created_at,content_type)
      SELECT ?5,?3,?4,?6,?7,?8,?9,'pending',?1,?10,?11 WHERE ${authority()} AND ${current}`)
      .bind(actor.email,actor.subject,state.team_id,state.season,id,key,normalized.width,normalized.height,normalized.bytes.length,stamp(),normalized.contentType),
    audit(env,actor,'image_reserved',state,null,'changes()=1')]);checked(created);
  try{
    if(!env.IMAGES)fail(503,'IMAGE_STORAGE_UNAVAILABLE');await env.IMAGES.put(key,normalized.bytes,{httpMetadata:{contentType:normalized.contentType}});
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE team_images SET state='ready' WHERE team_id=?3 AND season=?4 AND id=?5 AND state='pending' AND ${authority()} AND ${current}`)
        .bind(actor.email,actor.subject,state.team_id,state.season,id),audit(env,actor,'image_uploaded',state,null,'changes()=1')]);checked(results);
  }catch(error){await env.IMAGES?.delete(key).catch(()=>{});throw error;}
  return {id,url:`/api/admin/v1/teams/${state.team_id}/images/${id}`,width:normalized.width,height:normalized.height};
}
async function image(env:Env,state:State,id:string){
  if(await retiredImage(env.DB,uuid(id)))fail(404,'IMAGE_NOT_FOUND');
  const row=await env.DB.prepare("SELECT object_key,content_type FROM team_images WHERE team_id=?1 AND season=?2 AND id=?3 AND state='ready'").bind(state.team_id,state.season,uuid(id)).first<{object_key:string;content_type:string}>();
  if(!row||!env.IMAGES)fail(404,'IMAGE_NOT_FOUND');const object=await env.IMAGES.get(row.object_key);if(!object)fail(404,'IMAGE_NOT_FOUND');
  return new Response(object.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(object.size)}});
}
async function users(request:Request,env:Env,actor:Actor){
  admin(actor);
  if(request.method==='GET')return {users:(await env.DB.prepare('SELECT email,role,enabled,version FROM admin_users ORDER BY email LIMIT 500').all()).results,
    assignments:(await env.DB.prepare('SELECT email,team_id,can_publish,version FROM admin_team_assignments ORDER BY team_id,email LIMIT 1000').all()).results};
  if(request.method!=='PUT')fail(405,'METHOD_NOT_ALLOWED');
  const b=object(await requestJson(request),['email','role','enabled','expectedVersion']);const target=email(b.email),version=integer(b.expectedVersion);
  if(!['admin','coach'].includes(String(b.role))||typeof b.enabled!=='boolean')fail();
  if(target===actor.email&&(b.role!=='admin'||!b.enabled))fail(422,'SELF_LOCKOUT_FORBIDDEN');
  const guard="EXISTS(SELECT 1 FROM admin_users WHERE email=?5 AND access_subject=?6 AND role='admin' AND enabled=1)";
  const query=version===0?`INSERT INTO admin_users(email,role,enabled,version) SELECT ?1,?2,?3,1 WHERE ?4=0 AND ${guard} AND NOT EXISTS(SELECT 1 FROM admin_users WHERE email=?1)`
    :`UPDATE admin_users SET role=?2,enabled=?3,version=version+1 WHERE email=?1 AND version=?4 AND ${guard}`;
  const results=await env.DB.batch([env.DB.prepare(query).bind(target,b.role,b.enabled?1:0,version,actor.email,actor.subject),audit(env,actor,'user_permissions_changed',null,null,'changes()=1')]);checked(results);
  return {version:version+1};
}
async function removeUser(request:Request,env:Env,actor:Actor){
  admin(actor);if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
  const b=object(await requestJson(request),['email','expectedVersion']),target=email(b.email),version=integer(b.expectedVersion);
  if(target===actor.email)fail(422,'SELF_LOCKOUT_FORBIDDEN');
  const operation=crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE admin_users SET enabled=0,version=version+1 WHERE email=?1 AND version=?2
      AND EXISTS(SELECT 1 FROM admin_users WHERE email=?3 AND access_subject=?4 AND role='admin' AND enabled=1)`)
      .bind(target,version,actor.email,actor.subject),
    env.DB.prepare(`INSERT INTO admin_audit(id,actor_email,action,created_at) SELECT ?1,?2,'user_removed',?3 WHERE changes()=1`)
      .bind(operation,actor.email,stamp()),
    env.DB.prepare('DELETE FROM admin_team_assignments WHERE email=?1 AND EXISTS(SELECT 1 FROM admin_audit WHERE id=?2)')
      .bind(target,operation)
  ]);checked(results);return {version:version+1};
}
async function assignment(request:Request,env:Env,actor:Actor,state:State){
  admin(actor);const b=object(await requestJson(request),['email','canPublish','enabled','expectedVersion']);const target=email(b.email),version=integer(b.expectedVersion);
  if(typeof b.canPublish!=='boolean'||typeof b.enabled!=='boolean')fail();
  const guard="EXISTS(SELECT 1 FROM admin_users WHERE email=?1 AND access_subject=?2 AND role='admin' AND enabled=1)";
  const query=b.enabled?`INSERT INTO admin_team_assignments(email,team_id,can_publish,version)
    SELECT ?5,?3,?6,1 WHERE ?7=0 AND ${guard} AND EXISTS(SELECT 1 FROM admin_users WHERE email=?5 AND role='coach' AND enabled=1)
    ON CONFLICT(email,team_id) DO UPDATE SET can_publish=excluded.can_publish,version=admin_team_assignments.version+1 WHERE admin_team_assignments.version=?7`
    :`DELETE FROM admin_team_assignments WHERE email=?5 AND team_id=?3 AND version=?7 AND ${guard}`;
  // Use a separate bound UPDATE for versioned assignments; every mutation rechecks current admin authority.
  const selected=b.enabled&&version>0?`UPDATE admin_team_assignments SET can_publish=?6,version=version+1 WHERE email=?5 AND team_id=?3 AND version=?7 AND ${guard}`:query;
  const results=await env.DB.batch([env.DB.prepare(selected).bind(actor.email,actor.subject,state.team_id,state.season,target,b.canPublish?1:0,version),audit(env,actor,'team_assignment_changed',state,null,'changes()=1')]);checked(results);return {status:'saved'};
}
async function settings(request:Request,env:Env,actor:Actor,state:State){
  admin(actor);const raw=await requestJson(request);const b=object(raw,raw&&typeof raw==='object'&&'name' in raw?['photoPublicationAllowed','expectedVersion','name']:['photoPublicationAllowed','expectedVersion']);if(typeof b.photoPublicationAllowed!=='boolean')fail();const version=integer(b.expectedVersion),name=b.name===undefined?state.name:plain(b.name,150);
  const results=await env.DB.batch([env.DB.prepare(`UPDATE team_content_state SET photo_publication_allowed=?5,config_version=config_version+1 WHERE team_id=?3 AND season=?4 AND config_version=?6
    AND EXISTS(SELECT 1 FROM admin_users WHERE email=?1 AND access_subject=?2 AND role='admin' AND enabled=1) AND ${current}`)
    .bind(actor.email,actor.subject,state.team_id,state.season,b.photoPublicationAllowed?1:0,version),
    env.DB.prepare('UPDATE teams SET name=?1 WHERE id=?2 AND changes()=1').bind(name,state.team_id),audit(env,actor,'team_settings_changed',state,null,'changes()=1')]);checked(results);return {version:version+1};
}
export async function cleanup(env:Env){
  if(!env.IMAGES)return;
  const cutoff=new Date(Date.now()-7*86400000).toISOString();
  await env.DB.prepare(`UPDATE team_images SET state='deleting' WHERE id IN (SELECT i.id FROM team_images i WHERE i.created_at<?1 AND i.state IN ('pending','ready')
    AND NOT EXISTS(SELECT 1 FROM team_content_state s WHERE json_extract(s.draft_json,'$.heroImageId')=i.id OR EXISTS(SELECT 1 FROM json_each(s.draft_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=i.id))
    AND NOT EXISTS(SELECT 1 FROM team_content_revisions r WHERE json_extract(r.content_json,'$.heroImageId')=i.id OR EXISTS(SELECT 1 FROM json_each(r.content_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=i.id)) LIMIT 100)`).bind(cutoff).run();
  const rows=await env.DB.prepare("SELECT id,object_key FROM team_images WHERE state='deleting' LIMIT 100").all<{id:string;object_key:string}>();
  for(const row of rows.results){await env.IMAGES.delete(row.object_key);await env.DB.prepare("DELETE FROM team_images WHERE id=?1 AND state='deleting'").bind(row.id).run();}
}
function security(headers:Headers,html=false){headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Content-Security-Policy',html?"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'":"default-src 'none'; frame-ancestors 'self'");headers.set('Cross-Origin-Resource-Policy','same-origin');}
function response(value:unknown){const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>MAX_RESPONSE)fail(503,'RESPONSE_TOO_LARGE');return new Response(text,{headers:{'Content-Type':'application/json; charset=utf-8'}});}
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const requestId=crypto.randomUUID();let status=503;
    try{
      const url=new URL(request.url);
      const teamLanding=request.method==='GET'&&url.pathname==='/'&&url.searchParams.size===1&&/^[a-z0-9][a-z0-9-]{0,31}$/.test(url.searchParams.get('team')||'');
      if(url.search&&!teamLanding)fail(400,'QUERY_NOT_SUPPORTED');
      if(!env.RATE_LIMITER&&env.ENVIRONMENT!=='development')fail(503,'RATE_LIMITER_UNAVAILABLE');
      if(env.RATE_LIMITER&&!(await env.RATE_LIMITER.limit({key:'ip:'+(request.headers.get('CF-Connecting-IP')??'unknown')})).success)fail(429,'RATE_LIMITED');
      const actor=await authenticate(request,env);
      if(!env.RATE_LIMITER&&env.ENVIRONMENT!=='development')fail(503,'RATE_LIMITER_UNAVAILABLE');
      if(env.RATE_LIMITER&&!(await env.RATE_LIMITER.limit({key:actor.subject})).success)fail(429,'RATE_LIMITED');
      if(!['GET','PUT','POST'].includes(request.method))fail(405,'METHOD_NOT_ALLOWED');
      if(request.method!=='GET')await mutation(request,actor,env);
      let result:Response;
      if(url.pathname==='/api/admin/v1/me'&&request.method==='GET')result=response({user:{email:actor.email,role:actor.role},csrfToken:await csrf(actor,env)});
      else if(url.pathname==='/api/admin/v1/teams'&&request.method==='GET'){
        const rows=await env.DB.prepare(`SELECT t.id,t.name FROM teams t WHERE t.enabled=1 AND ${authority().replace('a.team_id=?3','a.team_id=t.id')} ORDER BY t.name LIMIT 200`).bind(actor.email,actor.subject).all();
        result=response({teams:rows.results});
      }else if(url.pathname==='/api/admin/v1/users')result=response(await users(request,env,actor));
      else if(url.pathname==='/api/admin/v1/users/remove')result=response(await removeUser(request,env,actor));
      else {
        const route=/^\/api\/admin\/v1\/teams\/([^/]+)\/(content|draft|publish|rollback|images|assignments|settings)(?:\/([a-f0-9-]+))?$/.exec(url.pathname);
        const preview=/^\/api\/admin\/v1\/preview\/teams\/([^/]+)$/.exec(url.pathname);
        const page=/^\/teams\/([^/]+)\/preview$/.exec(url.pathname);
        if(route||preview||page){
          const id=slug((route||preview||page)![1]);const state=await team(env,actor,id,route?.[2]==='publish'||route?.[2]==='rollback');
          if(preview&&request.method==='GET'){
            const c=await safeContent(env,state.draft_json);const data={...await source(env,id),...publicContent(c,id,env.ADMIN_ORIGIN,true)};
            (data as Record<string,any>).roster={players:[],coaches:[],lastSyncedAt:null};
            (data as Record<string,any>).dataStatus.roster='withheld';
            if(c.heroImageId){const asset=await env.DB.prepare("SELECT id FROM team_images WHERE id=?1 AND team_id=?2 AND season=?3 AND state='ready'").bind(c.heroImageId,id,state.season).first();if(!asset)fail(409,'IMAGE_NOT_READY');data.welcome.heroImageUrl=`/api/admin/v1/teams/${id}/images/${c.heroImageId}`;}
            result=response(data);
          }else if(page&&request.method==='GET')result=new Response(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Förhandsvisning</title></head><body><div id="h43-team-page" data-team-id="${id}"></div><script src="/preview-assets/team-page.js" defer></script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});
          else if(route){
            const action=route[2],imageId=route[3];
            if(imageId&&action!=='images')fail(404,'NOT_FOUND');
            if(action==='content'&&request.method==='GET')result=response(await getContent(env,actor,state));
            else if(action==='draft'&&request.method==='PUT')result=response(await save(env,actor,state,await requestJson(request),request.headers.get('X-H43-Roster-Images')==='1'));
            else if((action==='publish'||action==='rollback')&&request.method==='POST')result=response(await publish(env,actor,state,await requestJson(request),action==='rollback'));
            else if(action==='images'&&imageId&&request.method==='GET')result=await image(env,state,imageId);
            else if(action==='images'&&!imageId&&request.method==='POST')result=response(await upload(request,env,actor,state));
            else if(action==='assignments'&&!imageId&&request.method==='PUT')result=response(await assignment(request,env,actor,state));
            else if(action==='settings'&&!imageId&&request.method==='PUT')result=response(await settings(request,env,actor,state));
            else fail(405,'METHOD_NOT_ALLOWED');
          }else fail(405,'METHOD_NOT_ALLOWED');
        }else if(request.method==='GET'&&!url.pathname.startsWith('/api/')&&env.ASSETS)result=await env.ASSETS.fetch(request);
        else fail(404,'NOT_FOUND');
      }
      const headers=new Headers(result.headers);security(headers,headers.get('Content-Type')?.includes('text/html'));status=result.status;return new Response(result.body,{status:result.status,headers});
    }catch(error){status=error instanceof ApiError?error.status:503;const result=response({error:{code:error instanceof ApiError?error.code:'SERVICE_UNAVAILABLE',requestId}});security(result.headers);return new Response(result.body,{status,headers:result.headers});}
    finally{console.info(JSON.stringify({requestId,status,component:'admin',method:request.method}));}
  },
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(cleanup(env));}
} satisfies ExportedHandler<Env>;
