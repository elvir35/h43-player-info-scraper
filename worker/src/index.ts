import {identify,project} from './roster-details';
import {ApiError, fail, instant, MAX_RESPONSE, names, object, optionalText, plain, requestJson, safeUrl, slug, snapshot, socialUrl} from "./validation";
import {schedules, type SourceTeam} from "./sources";
import {published,content,publicContent,publicImage,uuid} from './editorial';

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_API_ENABLED: string;
  INGEST_TOKENS_JSON?: string; // secret: team -> array of SHA-256 credential digests
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
const TEAM_SQL = `SELECT t.*, s.starts_on, s.ends_on, s.publication_authorized, s.calendar_year, s.calendar_month,
  s.welcome_title, s.welcome_description, s.hero_image_url, s.instagram_url, s.tiktok_url, s.contact_email,
  r.observed_at, r.observed_us, r.players_json, r.coaches_json, a.status AS sync_status
  FROM teams t LEFT JOIN team_seasons s ON s.team_id=t.id AND s.season=t.current_season
  LEFT JOIN team_roster_snapshots r ON r.team_id=t.id AND r.season=t.current_season AND r.group_id=t.group_id
  LEFT JOIN roster_sync_status a ON a.team_id=t.id AND a.season=t.current_season
  WHERE t.id=?1 AND t.enabled=1`;
async function teamRow(env:Env, id:string):Promise<Team> {
  const row = await env.DB.prepare(TEAM_SQL).bind(id).first<Team>();
  if (!row) fail(404,"TEAM_NOT_FOUND");
  return row;
}
function checkSeason(row:Team):string {
  if (!row.current_season || row.starts_on === null || row.ends_on === null) fail(409,"SOURCE_NOT_CONFIGURED");
  return row.current_season;
}
function checkTime(value:unknown, team:Team) {
  const parsed = instant(value);
  const ms = parsed.us / 1000;
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ms));
  if (ms > Date.now()+300000 || ms < Date.now()-86400000
      || (team.starts_on && today < team.starts_on) || (team.ends_on && today > team.ends_on)) fail(422,"INVALID_OBSERVATION_TIME");
  return parsed;
}
async function credential(request:Request, env:Env, teamId:string):Promise<void> {
  if (request.headers.has("origin")) fail(403,"BROWSER_INGESTION_FORBIDDEN");
  const token = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) fail(401,"UNAUTHORIZED");
  let config: Record<string,string[]>;
  try {
    const raw: unknown = JSON.parse(env.INGEST_TOKENS_JSON ?? "null");
    if (!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error();
    config = raw as Record<string,string[]>;
    if (Object.entries(config).some(([key,list])=> !/^[a-z0-9][a-z0-9-]{0,31}$/.test(key)
        || !Array.isArray(list) || list.length<1 || list.length>2 || list.some(v=>!(/^[a-f0-9]{64}$/.test(v))))) throw new Error();
  } catch { return fail(503,"INGESTION_UNAVAILABLE"); }
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,"0")).join("");
  const scopes:string[] = [];
  for (const [id,hashes] of Object.entries(config)) {
    for (const hash of hashes) {
      let difference = 0;
      for (let i=0;i<64;i++) difference |= hash.charCodeAt(i)^digest.charCodeAt(i);
      if (difference===0) scopes.push(id);
    }
  }
  if (!scopes.length) fail(401,"UNAUTHORIZED");
  if (!scopes.includes(teamId)) fail(403,"TEAM_FORBIDDEN");
}
function internalSnapshot(row:Team) {
  if (!row.observed_at) return null;
  return {schema_version:1,team:{id:row.id,name:row.sportadmin_team_name,sportadmin_group_id:row.group_id,
    source_url:`https://h43lund.web.sportadmin.se/grupp/?ID=${row.group_id}`},observed_at:row.observed_at,
    players:names(JSON.parse(row.players_json!),true).map(({memberKey,...m})=>m),coaches:names(JSON.parse(row.coaches_json!),true).map(({memberKey,...m})=>m)};
}
async function ingest(request:Request,env:Env,row:Team) {
  const season = checkSeason(row);
  const envelope = object(await requestJson(request),["season","snapshot","expectedObservedAt"]);
  if (envelope.season!==season) fail(409,"SEASON_CONFLICT");
  const value = snapshot(envelope.snapshot);
  const expected = envelope.expectedObservedAt === null ? null : instant(envelope.expectedObservedAt).us;
  if (value.team.id!==row.id || value.team.name!==row.sportadmin_team_name || value.team.sportadmin_group_id!==row.group_id) fail(403,"SOURCE_MAPPING_FORBIDDEN");
  const at = checkTime(value.observed_at,row);
  const players = JSON.stringify(identify(value.players,row.players_json?names(JSON.parse(row.players_json),true):[])), coaches = JSON.stringify(identify(value.coaches,row.coaches_json?names(JSON.parse(row.coaches_json),true):[]));
  // A single UPSERT atomically compares the expected version, checks freshness,
  // and replaces both complete arrays. It never modifies another team/season.
  const result = await env.DB.prepare(`INSERT INTO team_roster_snapshots
      (team_id,season,observed_at,observed_us,players_json,coaches_json,group_id)
      SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE
        EXISTS (SELECT 1 FROM teams WHERE id=?1 AND current_season=?2 AND group_id=?7 AND enabled=1)
        AND ((?8 IS NULL AND NOT EXISTS (SELECT 1 FROM team_roster_snapshots WHERE team_id=?1 AND season=?2))
          OR EXISTS (SELECT 1 FROM team_roster_snapshots WHERE team_id=?1 AND season=?2 AND observed_us=?8 AND observed_us<?4))
      ON CONFLICT(team_id,season) DO UPDATE SET observed_at=excluded.observed_at,observed_us=excluded.observed_us,
        players_json=excluded.players_json,coaches_json=excluded.coaches_json
      WHERE team_roster_snapshots.observed_us=?8 AND team_roster_snapshots.observed_us<excluded.observed_us
        AND team_roster_snapshots.group_id=excluded.group_id`)
    .bind(row.id,season,at.iso,at.us,players,coaches,row.group_id,expected).run();
  if (result.meta.changes!==1) fail(409,"SNAPSHOT_CONFLICT");
  // Reporting is independent of authoritative snapshot content. If reporting
  // fails, retain the committed roster; never restore old names as compensation.
  await report(env,row,at.us,value.players.length || value.coaches.length ? "success":"empty");
  return {status:value.players.length || value.coaches.length ? "success":"empty"};
}
async function report(env:Env,row:Team,us:number,status:string) {
  await env.DB.prepare(`INSERT INTO roster_sync_status(team_id,season,attempted_us,status) VALUES(?1,?2,?3,?4)
    ON CONFLICT(team_id,season) DO UPDATE SET attempted_us=excluded.attempted_us,status=excluded.status
    WHERE excluded.attempted_us>roster_sync_status.attempted_us`)
    .bind(row.id,row.current_season,us,status).run();
}
async function publicTeam(env:Env,row:Team,origin:string) {
  try {
    const authorized = row.publication_authorized===1;
    const players = authorized && row.observed_at ? names(JSON.parse(row.players_json!),true) : [];
    const coaches = authorized && row.observed_at ? names(JSON.parse(row.coaches_json!),true) : [];
    const lastSynced = authorized ? row.observed_at : null;
    const status = !authorized ? "withheld" : !row.observed_at ? "unavailable" : row.sync_status==="failed"
      || Date.now()-Number(row.observed_us)/1000>43200000 ? "stale" : players.length || coaches.length ? "available":"empty";
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
    return {apiVersion:"1",id:row.id,name:plain(row.name,150),season:row.current_season === "current" ? null : row.current_season,
      welcome:editable.welcome,
      roster:{players:project(players,editorial?.rosterDetails??[],'players',`${origin}/api/v1/teams/${row.id}/images`),coaches:project(coaches,editorial?.rosterDetails??[],'coaches'),lastSyncedAt:lastSynced},nextMatch:schedule.nextMatch,upcomingMatches:schedule.upcomingMatches,playedMatches:schedule.playedMatches,upcomingEvents:schedule.upcomingEvents,
      social:editable.social,contact:editable.contact,
      dataStatus:{roster:status,calendar:schedule.calendarStatus,matches:schedule.matchesStatus,playedMatches:schedule.playedMatchesStatus},
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
      if (internal) await credential(request,env,id);
      if(media){const image=await publicImage(env.DB,env.IMAGES,id,uuid(media[2]));status=image.status;const imageHeaders=new Headers(h);for(const [k,v] of image.headers)imageHeaders.set(k,v);return new Response(image.body,{status,headers:imageHeaders});}
      const row = await teamRow(env,id);
      let result:unknown;
      if (!internal) result=await publicTeam(env,row,url.origin);
      else if (match[3]==="roster" && request.method==="GET") result={season:row.current_season,snapshot:internalSnapshot(row)};
      else if (match[3]==="roster") result=await ingest(request,env,row);
      else if (match[3]==="failure") {
        checkSeason(row);
        const body=object(await requestJson(request),["season","attemptedAt"]);
        if (body.season!==row.current_season) fail(409,"SEASON_CONFLICT");
        await report(env,row,checkTime(body.attemptedAt,row).us,"failed");
        result={status:"recorded"};
      } else {
        object(await requestJson(request),[]);
        await env.DB.prepare("UPDATE teams SET cache_version=cache_version+1 WHERE id=?1").bind(id).run();
        result={status:"invalidated"};
      }
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
