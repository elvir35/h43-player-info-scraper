import {ApiError, fail, MAX_RESPONSE, optionalText, plain, safeUrl, slug, socialUrl} from "./validation";
import {schedules, type SourceTeam} from "./sources";
import {published,content,publicContent,publicImage,retiredImage,uuid} from './editorial';

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_API_ENABLED: string;
  IMAGES?: R2Bucket;
  RATE_LIMITER?: {limit(options:{key:string}):Promise<{success:boolean}>};
}
type Team = SourceTeam & {
  name: string; group_id: string; publication_authorized: number | null;
  welcome_title: string | null; welcome_description: string | null; hero_image_url: string | null;
  instagram_url: string | null; tiktok_url: string | null; contact_email: string | null;
  observed_at: string | null; observed_us: number | null; players_json: string | null; coaches_json: string | null;
  sync_status: string | null;
};
const TEAM_SQL = `SELECT t.*, s.starts_on, s.ends_on,
  s.welcome_title, s.welcome_description, s.hero_image_url, s.instagram_url, s.tiktok_url, s.contact_email
  FROM teams t LEFT JOIN team_seasons s ON s.team_id=t.id AND s.season=t.current_season
  WHERE t.id=?1 AND t.enabled=1`;
async function teamRow(env:Env, id:string):Promise<Team> {
  const row = await env.DB.prepare(TEAM_SQL).bind(id).first<Team>();
  if (!row) fail(404,"TEAM_NOT_FOUND");
  return row;
}
async function publicTeam(env:Env,row:Team,origin:string) {
  try {
    const schedule = await schedules(row,env.ENVIRONMENT,origin);
    const email = typeof row.contact_email==="string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(row.contact_email)
      ? plain(row.contact_email,254) : null;
    const description = row.welcome_description == null ? null : row.welcome_description.replace(/\r\n/g,"\n");
    if (description && /[<>\u0000-\u0008\u000b-\u001f\u007f]/.test(description)) fail();
    const head=await published(env.DB,row.id);
    const editorial=head?content(JSON.parse(head.content_json)):null;
    const editable=head&&editorial?publicContent(editorial,row.id,origin,head.photo_publication_allowed===1):{
      welcome:{title:optionalText(row.welcome_title,120),description:description?.slice(0,5000)??null,heroImageUrl:safeUrl(row.hero_image_url),seasonMessage:null,heroAlt:null},
      social:{instagram:socialUrl(row.instagram_url,'instagram'),tiktok:socialUrl(row.tiktok_url,'tiktok'),instagramLabel:null,tiktokLabel:null},contact:{email,phone:null,text:null,people:email?[{name:null,email,phone:null}]:[]}};
    if(editorial?.heroImageId&&await retiredImage(env.DB,editorial.heroImageId)){editable.welcome.heroImageUrl=null;editable.welcome.heroAlt=null;}
    return {apiVersion:"1",id:row.id,name:plain(row.name,150),season:row.current_season === "current" ? null : row.current_season,
      welcome:editable.welcome,
      roster:{players:[],coaches:[],lastSyncedAt:null},nextMatch:schedule.nextMatch,upcomingMatches:schedule.upcomingMatches,playedMatches:schedule.playedMatches,upcomingEvents:schedule.upcomingEvents,
      social:editable.social,contact:editable.contact,
      dataStatus:{roster:"withheld",calendar:schedule.calendarStatus,matches:schedule.matchesStatus,playedMatches:schedule.playedMatchesStatus},
      freshness:{calendar:{lastFetchedAt:schedule.calendarFetchedAt,sourceUpdatedAt:null},
        matches:{lastFetchedAt:schedule.matchesFetchedAt,sourceUpdatedAt:null},scheduleCacheTtlSeconds:300}};
  } catch (error) {
    if (error instanceof ApiError) fail(503,"INVALID_TEAM_CONFIGURATION");
    throw error;
  }
}
function headers():Headers {
  return new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"});
}
function json(value:unknown,status:number,h:Headers) {
  const text = JSON.stringify(value).replace(/[<>&]/g,c=>({"<":"\\u003c",">":"\\u003e","&":"\\u0026"}[c]!));
  if (new TextEncoder().encode(text).length>MAX_RESPONSE) fail(503,"RESPONSE_TOO_LARGE");
  return new Response(text,{status,headers:h});
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const h = headers();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const internal = url.pathname.startsWith("/api/v1/internal/");
    let status = 500;
    try {
      if (url.protocol!=="https:" && env.ENVIRONMENT!=="development") fail(400,"HTTPS_REQUIRED");
      const media=/^\/api\/v1\/teams\/([^/]+)\/images\/([a-f0-9-]+)$/.exec(url.pathname);
      const match = media?['',undefined,media[1],undefined]:/^\/api\/v1\/(internal\/)?teams\/([^/]+)(?:\/(roster|failure|refresh))?$/.exec(url.pathname);
      if (!match || (!!match[1]!==internal) || (!internal && match[3])) fail(404,"NOT_FOUND");
      const id = slug(match[2]!);
      if (url.search) fail(400,"QUERY_NOT_SUPPORTED");
      const allowed = internal ? match[3]==="roster" ? ["GET","PUT"] : ["POST"] : ["GET","OPTIONS"];
      if (internal && !match[3]) fail(404,"NOT_FOUND");
      if (!allowed.includes(request.method)) { h.set("Allow",allowed.join(", ")); fail(405,"METHOD_NOT_ALLOWED"); }
      if (!internal) {
        const origin=request.headers.get("Origin");
        h.set("Vary","Origin");
        if (origin) {
          if (!(env.ALLOWED_ORIGINS ?? "").split(",").includes(origin)) fail(403,"ORIGIN_FORBIDDEN");
          h.set("Access-Control-Allow-Origin",origin);
        }
        if (request.method==="OPTIONS") {
          if (request.headers.get("Access-Control-Request-Method") && request.headers.get("Access-Control-Request-Method")!=="GET") fail(405,"METHOD_NOT_ALLOWED");
          if (request.headers.get("Access-Control-Request-Headers")) fail(403,"HEADERS_FORBIDDEN");
          h.set("Access-Control-Allow-Methods","GET");
          status=204; return new Response(null,{status,headers:h});
        }
        if (env.PUBLIC_API_ENABLED!=="true") fail(503,"PUBLIC_API_DISABLED");
      }
      // Native per-location rate limiting is approximate, not authentication.
      if (!env.RATE_LIMITER && env.ENVIRONMENT!=="development") fail(503,"RATE_LIMITER_UNAVAILABLE");
      if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({key:`${internal?"ingest":"read"}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`})).success) {
        h.set("Retry-After","60"); fail(429,"RATE_LIMITED");
      }
      // Retired permanently: existing ingestion credentials cannot read or restore rosters.
      if (internal) fail(410,"ROSTER_RETIRED");
      if(media){const image=await publicImage(env.DB,env.IMAGES,id,uuid(media[2]));status=image.status;const imageHeaders=new Headers(h);for(const [k,v] of image.headers)imageHeaders.set(k,v);return new Response(image.body,{status,headers:imageHeaders});}
      const row = await teamRow(env,id);
      const result=await publicTeam(env,row,url.origin);
      status=200; return json(result,status,h);
    } catch(error) {
      status=error instanceof ApiError ? error.status : 503;
      const code=error instanceof ApiError ? error.code : "SERVICE_UNAVAILABLE";
      return json({error:{code,requestId}},status,h);
    } finally {
      console.info(JSON.stringify({requestId,status,route:internal?"internal":"public",method:request.method}));
    }
  }
} satisfies ExportedHandler<Env>;
