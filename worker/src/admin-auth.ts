import {createRemoteJWKSet,jwtVerify} from 'jose';
import {fail} from './validation';
import {email} from './editorial';
export interface AuthEnv{DB:D1Database;ENVIRONMENT:string;ADMIN_ORIGIN:string;ACCESS_ISSUER:string;ACCESS_AUD:string;CSRF_SECRET?:string;ADMIN_ENABLED:string;}
export type Actor={email:string;subject:string;role:'admin'|'coach';iat:number;exp:number;version:number};
const keys=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(request:Request,env:AuthEnv):Promise<Actor>{
  if(env.ADMIN_ENABLED!=='true'||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER)||!env.ACCESS_AUD||!env.CSRF_SECRET||env.CSRF_SECRET.length<32)fail(503,'ADMIN_NOT_CONFIGURED');
  const origin=new URL(env.ADMIN_ORIGIN);const local=env.ENVIRONMENT==='development'&&['localhost','127.0.0.1'].includes(origin.hostname);
  if((origin.protocol!=='https:'&&!local)||new URL(request.url).origin!==origin.origin||origin.pathname!=='/')fail(403,'ADMIN_ORIGIN_FORBIDDEN');
  const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>16384)fail(401,'AUTHENTICATION_REQUIRED');
  let verified;
  try{let jwks=keys.get(env.ACCESS_ISSUER);if(!jwks){jwks=createRemoteJWKSet(new URL('/cdn-cgi/access/certs',env.ACCESS_ISSUER),{timeoutDuration:5000,cacheMaxAge:600000,cooldownDuration:30000});keys.set(env.ACCESS_ISSUER,jwks);}
    const {payload}=await jwtVerify(token,jwks,{issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['sub','email','iat','exp','type'],clockTolerance:0});
    if(payload.type!=='app'||typeof payload.sub!=='string'||!payload.sub||typeof payload.iat!=='number'||typeof payload.exp!=='number'||payload.iat>Date.now()/1000+30||payload.exp<=payload.iat)throw new Error();
    verified={email:email(payload.email),subject:payload.sub,iat:payload.iat,exp:payload.exp};
  }catch{fail(401,'AUTHENTICATION_REQUIRED');}
  await env.DB.batch([
    env.DB.prepare('UPDATE admin_users SET access_subject=?1 WHERE email=?2 AND enabled=1 AND access_subject IS NULL').bind(verified.subject,verified.email),
    env.DB.prepare("INSERT INTO admin_audit(id,actor_email,action,created_at) SELECT ?1,?2,'identity_bound',?3 WHERE changes()=1").bind(crypto.randomUUID(),verified.email,new Date().toISOString())]);
  const row=await env.DB.prepare('SELECT role,version FROM admin_users WHERE email=?1 AND access_subject=?2 AND enabled=1').bind(verified.email,verified.subject).first<{role:'admin'|'coach';version:number}>();
  if(!row)fail(403,'USER_NOT_AUTHORIZED');return {...verified,...row};
}
export async function csrf(actor:Actor,env:AuthEnv):Promise<string>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.CSRF_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const message=[env.ADMIN_ORIGIN,env.ACCESS_ISSUER,actor.subject,actor.email,actor.iat,actor.exp].join('\n');
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function mutation(request:Request,actor:Actor,env:AuthEnv){
  if(request.headers.get('Origin')!==new URL(env.ADMIN_ORIGIN).origin||!['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))fail(403,'CSRF_REJECTED');
  const supplied=request.headers.get('X-CSRF-Token')??'',expected=await csrf(actor,env);let difference=supplied.length^expected.length;
  for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(supplied.charCodeAt(i)||0);
  if(difference)fail(403,'CSRF_REJECTED');
}
