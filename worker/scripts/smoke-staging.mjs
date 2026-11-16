import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {calendarYear} from "../dist/sources.js";

export function stagingOrigin(value){
  const url=new URL(value);
  assert.equal(url.protocol,"https:");assert.equal(url.username,"");assert.equal(url.password,"");
  assert.equal(url.port,"");assert.equal(url.pathname,"/");assert.equal(url.search,"");assert.equal(url.hash,"");
  assert.match(url.hostname,/^h43-youth-api-staging\.[a-z0-9-]+\.workers\.dev$/);
  return url.origin;
}
export function validateContract(value,expectedTeamId='p11'){
  const keys=(o,list)=>{assert.ok(o && typeof o==="object" && !Array.isArray(o));assert.deepEqual(Object.keys(o).sort(),list.sort());};
  const text=(s,max)=>assert.ok(s===null || typeof s==="string" && s.length<=max && !/[<>\u0000-\u0008]/.test(s));
  const timestamp=s=>assert.ok(s===null || typeof s==="string" && Number.isFinite(Date.parse(s)));
  assert.deepEqual(Object.keys(value).sort(),["apiVersion","id","name","season","welcome","roster","nextMatch","upcomingMatches","playedMatches","upcomingEvents","social","contact","dataStatus","freshness"].sort());
  assert.equal(value.apiVersion,"1");assert.match(expectedTeamId,/^[a-z0-9][a-z0-9-]{0,31}$/);assert.equal(value.id,expectedTeamId);assert.equal(typeof value.name,"string");
  assert.ok(value.season===null || typeof value.season==="string");
  keys(value.welcome,["title","description","heroImageUrl","heroAlt","seasonMessage"]);text(value.welcome.title,120);text(value.welcome.description,5000);text(value.welcome.heroAlt,160);text(value.welcome.seasonMessage,600);
  if(value.welcome.heroImageUrl!==null)assert.equal(new URL(value.welcome.heroImageUrl).protocol,"https:");
  assert.deepEqual(Object.keys(value.roster).sort(),["players","coaches","lastSyncedAt"].sort());
  for(const key of ["players","coaches"]){
    assert.ok(Array.isArray(value.roster[key]));
    for(const person of value.roster[key]){
      keys(person,['displayName',...(person.shirtNumber!==undefined?['shirtNumber']:[]),...(person.position!==undefined?['position']:[]),...(person.responsibility!==undefined?['responsibility']:[]),...(person.imageUrl!==undefined?['imageUrl']:[])]);if(person.imageUrl!==undefined){const photo=new URL(person.imageUrl);assert.equal(photo.protocol,'https:');assert.match(photo.pathname,/^\/api\/v1\/teams\/[a-z0-9-]+\/images\/[a-f0-9-]{36}$/);}if(person.shirtNumber!==undefined)assert.match(person.shirtNumber,/^[0-9]{1,3}$/);if(person.position!==undefined)text(person.position,60);if(person.responsibility!==undefined)text(person.responsibility,60);assert.equal(typeof person.displayName,"string");
      assert.ok(person.displayName.length>0 && person.displayName.length<=150);assert.ok(!/[<>\u0000-\u001f]/.test(person.displayName));
    }
  }
  timestamp(value.roster.lastSyncedAt);
  assert.ok(Array.isArray(value.upcomingEvents));assert.ok(value.upcomingEvents.length<=100);
  let previous="";
  for(const event of value.upcomingEvents){
    assert.deepEqual(Object.keys(event).sort(),["id","type","title","startsAt","endsAt","location","status"].sort());
    assert.ok(Number.isFinite(Date.parse(event.startsAt)));assert.ok(event.startsAt>=previous);previous=event.startsAt;
    assert.ok(["training","match","other"].includes(event.type));assert.ok(["scheduled","unknown"].includes(event.status));
    text(event.title,200);text(event.location,300);timestamp(event.endsAt);
  }
  assert.ok(Array.isArray(value.upcomingMatches)&&value.upcomingMatches.length<=100);
  previous="";
  for(const match of value.upcomingMatches){
    keys(match,["id","startsAt","opponent","homeAway","location","competition","status"]);
    timestamp(match.startsAt);assert.ok(match.startsAt>=previous);previous=match.startsAt;assert.ok(["home","away","unknown"].includes(match.homeAway));
    assert.equal(match.status,"scheduled");text(match.opponent,300);text(match.location,300);text(match.competition,300);
  }
  assert.ok(Array.isArray(value.playedMatches)&&value.playedMatches.length<=100);previous='9999';
  for(const match of value.playedMatches){keys(match,['id','startsAt','opponent','homeAway','location','competition','status','score']);timestamp(match.startsAt);assert.ok(match.startsAt<=previous);previous=match.startsAt;assert.equal(match.status,'played');assert.ok(['home','away','unknown'].includes(match.homeAway));text(match.opponent,300);text(match.location,300);text(match.competition,300);assert.ok(match.score===null||/^[0-9]{1,3}–[0-9]{1,3}$/.test(match.score));}
  assert.deepEqual(value.nextMatch,value.upcomingMatches[0]??null);
  assert.deepEqual(Object.keys(value.social).sort(),["instagram","instagramLabel","tiktok","tiktokLabel"]);
  assert.deepEqual(Object.keys(value.contact).sort(),["email","people","phone","text"]);text(value.contact.text,600);text(value.contact.phone,40);if(value.contact.phone!==null){assert.match(value.contact.phone,/^\+?[0-9][0-9 ()-]*[0-9]$/);assert.ok(value.contact.phone.replace(/[^0-9]/g,'').length>=7&&value.contact.phone.replace(/[^0-9]/g,'').length<=15);}assert.ok(Array.isArray(value.contact.people)&&value.contact.people.length<=20);for(const p of value.contact.people){keys(p,['name','email','phone']);text(p.name,120);text(p.email,254);text(p.phone,40);assert.ok(p.email||p.phone);}text(value.social.instagramLabel,40);text(value.social.tiktokLabel,40);
  assert.deepEqual(Object.keys(value.dataStatus).sort(),["calendar","matches","playedMatches","roster"]);
  assert.ok(["available","empty","stale","unavailable","withheld"].includes(value.dataStatus.roster));
  for(const source of ["calendar","matches","playedMatches"])assert.ok(["available","empty","unavailable"].includes(value.dataStatus[source]));
  for(const platform of ["instagram","tiktok"])if(value.social[platform]!==null){
    const url=new URL(value.social[platform]);assert.equal(url.protocol,"https:");
    assert.ok([platform+".com","www."+platform+".com"].includes(url.hostname));
  }
  text(value.contact.email,254);
  keys(value.freshness,["calendar","matches","scheduleCacheTtlSeconds"]);assert.equal(value.freshness.scheduleCacheTtlSeconds,300);
  for(const source of ["calendar","matches"]){keys(value.freshness[source],["lastFetchedAt","sourceUpdatedAt"]);timestamp(value.freshness[source].lastFetchedAt);assert.equal(value.freshness[source].sourceUpdatedAt,null);}
  const body=JSON.stringify(value);
  for(const field of ["sportadmin_group_id","source_url","observed_us","players_json","attempted_us","INGEST_TOKENS_JSON"])
    assert.ok(!body.includes(field),"Internal field exposed");
}
async function getJson(url,options={}){
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(30000),...options});
  const body=await response.text();assert.ok(Buffer.byteLength(body)<=256*1024,"Response too large");
  return {response,value:body ? JSON.parse(body) : null};
}
async function liveRoster(){
  const root=fileURLToPath(new URL("../../",import.meta.url));
  const code="import json\nfrom datetime import datetime,timezone\nfrom h43_scraper.youth_roster import TeamConfig,fetch_roster_html,parse_roster\nt=TeamConfig()\ns=parse_roster(fetch_roster_html(t),t,datetime.now(timezone.utc))\nprint(json.dumps({'players':list(s.players),'coaches':list(s.coaches)}))";
  const child=spawn(process.env.PYTHON || "python",["-c",code],{cwd:root,env:{...process.env,PYTHONPATH:root+"/src"},windowsHide:true});
  let output="";child.stdout.on("data",d=>output+=d);child.stderr.resume();
  const exit=await new Promise((ok,no)=>{child.on("error",no);child.on("exit",ok);});
  assert.equal(exit,0,"Live SportAdmin comparison failed (details omitted to protect names)");
  return JSON.parse(output);
}
function localKey(iso){
  const fmt=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  return fmt.format(new Date(iso));
}
async function compareSources(value){
  const [matches,calendar]=await Promise.all([
    getJson("https://h43-matches-api.vercel.app/api/matches"),getJson("https://calendar-api-black.vercel.app/api/calendar")]);
  assert.equal(matches.response.status,200);assert.equal(calendar.response.status,200);
  assert.ok(Array.isArray(matches.value));assert.ok(Array.isArray(calendar.value));
  const months=["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
  const now=localKey(new Date().toISOString());
  const upcoming=matches.value.filter(m=>m.team==="P11" && m.status==="upcoming").map(m=>{
    const parts=/^(\S+) (\d{4})$/.exec(m.month.toLowerCase());
    const day=/\b(\d{1,2})$/.exec(m.date)?.[1];
    const month=parts ? months.indexOf(parts[1])+1 : 0;
    return parts && month && day && /^\d\d:\d\d$/.test(m.time)
      ? `${parts[2]}-${String(month).padStart(2,"0")}-${day.padStart(2,"0")} ${m.time}` : null;
  }).filter(k=>k && k>now).sort();
  assert.notEqual(value.dataStatus.matches,"unavailable","Live matches unavailable");
  assert.notEqual(value.dataStatus.calendar,"unavailable","Live calendar unavailable");
  if(upcoming.length){assert.ok(value.nextMatch);assert.equal(localKey(value.nextMatch.startsAt),upcoming[0],"Next match is not the earliest live P11 fixture");}
  else assert.equal(value.nextMatch,null);
  assert.deepEqual(value.upcomingMatches.map(m=>localKey(m.startsAt)),upcoming.slice(0,100),"Dedicated P11 matches differ from live source");
  const clean=x=>typeof x==="string" ? x.normalize("NFC").replace(/\s+/gu," ").trim() : "";
  const refYear=Number(new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric"}).format(new Date()));
  const expectedEvents=calendar.value.filter(x=>x.team==="P11").map(x=>{
    const parts=/^(\S+) (\d{1,2})$/.exec(clean(x.date));const month=months.indexOf(clean(x.month).toLowerCase())+1;
    if(!parts || !month || !/^\d\d:\d\d$/.test(x.startTime))return null;
    const year=calendarYear(month,Number(parts[2]),parts[1],refYear);if(!year)return null;
    const start=`${year}-${String(month).padStart(2,"0")}-${parts[2].padStart(2,"0")} ${x.startTime}`;
    const type={"Träning":"training","Match":"match","Övrigt":"other"}[clean(x.type)];
    return start>now && type ? {start,type,title:clean(x.title)||clean(x.opponent)||clean(x.type),location:clean(x.location)||null,endTime:clean(x.endTime)||null} : null;
  }).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start)).slice(0,100);
  const actualEvents=value.upcomingEvents.map(x=>({start:localKey(x.startsAt),type:x.type,title:x.title,location:x.location,endTime:x.endsAt ? localKey(x.endsAt).slice(-5) : null}));
  const comparison=list=>list.map(x=>JSON.stringify(x)).sort();
  assert.deepEqual(comparison(actualEvents),comparison(expectedEvents),"Calendar projection differs from live P11 events");
  return {liveMatchRows:matches.value.filter(x=>x.team==="P11").length,liveCalendarRows:calendar.value.filter(x=>x.team==="P11").length};
}
export async function smokeStaging(base,{compareLive=true}={}){
  const origin=stagingOrigin(base);const url=origin+"/api/v1/teams/p11";
  const {response,value}=await getJson(url);assert.equal(response.status,200);validateContract(value);
  assert.match(response.headers.get("content-type"),/^application\/json/);
  assert.equal(response.headers.get("cache-control"),"no-store");assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  assert.ok(response.headers.get("content-security-policy"));assert.equal(response.headers.get("access-control-allow-credentials"),null);
  assert.notEqual(value.dataStatus.roster,"withheld","Staging publication authorization not established");
  assert.notEqual(value.dataStatus.roster,"unavailable","No synchronized staging roster");
  const unknown=await fetch(origin+"/api/v1/teams/not-a-configured-team");assert.equal(unknown.status,404);await unknown.body?.cancel();
  for(const method of ["POST","PUT","PATCH","DELETE"]){
    const r=await fetch(url,{method,redirect:"manual"});assert.equal(r.status,405);await r.body?.cancel();
  }
  const allowed=await fetch(url,{headers:{Origin:"https://www.h43lund.se"}});
  assert.equal(allowed.status,200);assert.equal(allowed.headers.get("access-control-allow-origin"),"https://www.h43lund.se");await allowed.body?.cancel();
  const denied=await fetch(url,{headers:{Origin:"https://untrusted.invalid"}});assert.equal(denied.status,403);await denied.body?.cancel();
  const preflight=await fetch(url,{method:"OPTIONS",headers:{Origin:"https://www.h43lund.se","Access-Control-Request-Method":"GET"}});assert.equal(preflight.status,204);
  const unauth=await fetch(origin+"/api/v1/internal/teams/p11/roster");assert.equal(unauth.status,401);await unauth.body?.cancel();
  let sources={};
  if(compareLive){
    const roster=await liveRoster();
    assert.deepEqual(value.roster.players.map(x=>x.displayName),roster.players,"Live player membership differs");
    assert.deepEqual(value.roster.coaches.map(x=>x.displayName),roster.coaches,"Live coach membership differs");
    sources=await compareSources(value);
  }
  return {status:"passed",url,checks:["contract","headers","unknown-team","unsupported-methods","cors","unauthenticated-ingestion",...(compareLive?["live-roster","live-schedules","chronological-next-match"]:[])],
    players:value.roster.players.length,coaches:value.roster.coaches.length,upcomingEvents:value.upcomingEvents.length,
    nextMatchAt:value.nextMatch?.startsAt ?? null,...sources};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  smokeStaging(process.argv[2]).then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(()=>{console.error("Staging smoke validation failed; no names, credentials or response bodies printed");process.exitCode=1;});
}
