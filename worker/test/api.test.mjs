import {before,after,beforeEach,test} from "node:test";
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {Miniflare} from "miniflare";
import worker from "../dist/index.js";
import {stockholmInstant,calendarYear} from "../dist/sources.js";

const token=randomBytes(32).toString("base64url");
const hash=createHash("sha256").update(token).digest("hex");
let mf,db,epoch=0,calendar=[],matches=[],upstreamBad=false,sourceCalls=0;
const currentYear=new Date().getUTCFullYear();
const currentMonth=Number(new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",month:"2-digit"}).format(new Date()));
const season="test-season";
before(async()=>{
  mf=new Miniflare({modules:true,scriptPath:"dist/index.js",compatibilityDate:"2026-07-30",
    d1Databases:{DB:"h43-test-only"},bindings:{ENVIRONMENT:"development",PUBLIC_API_ENABLED:"true",
      ALLOWED_ORIGINS:"https://www.h43lund.se,http://localhost:3000",INGEST_TOKENS_JSON:JSON.stringify({p11:[hash]})},
    outboundService:async request=>{
      sourceCalls++;
      if(upstreamBad) return new Response("not JSON",{status:502});
      if(!["h43-matches-api.vercel.app","calendar-api-black.vercel.app"].includes(new URL(request.url).hostname)) throw new Error("Unexpected outbound request");
      return Response.json(request.url.includes("/matches")?matches:calendar);
    }});
  db=await mf.getD1Database("DB");
  for(const file of ["0001_teams_and_snapshots.sql","0002_p11_configuration.sql","0003_current_team_mode.sql","0004_coach_editorial.sql"]){
    const sql=await readFile(new URL("../migrations/"+file,import.meta.url),"utf8");
    for(const statement of sql.split(";").filter(s=>s.trim())) await db.prepare(statement).run();
  }
});
after(async()=>{await mf?.dispose();});
beforeEach(async()=>{
  epoch++;calendar=[];matches=[];upstreamBad=false;sourceCalls=0;
  await db.batch(["DELETE FROM team_content_state","DELETE FROM roster_sync_status","DELETE FROM team_roster_snapshots","DELETE FROM team_seasons","DELETE FROM teams"].map(s=>db.prepare(s)));
  for(const [id,name,group] of [["p11","P11","378673"],["other","Synthetic Other","999"]]){
    await db.prepare("INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season,cache_version) VALUES(?1,?2,?2,?3,?4,?5)").bind(id,name,group,season,epoch*100).run();
    await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized,calendar_year,calendar_month) VALUES(?1,?2,?3,?4,1,?5,?6)")
      .bind(id,season,`${currentYear}-01-01`,`${currentYear+1}-12-31`,currentYear,currentMonth).run();
  }
});
const time=(offset=0)=>new Date(Date.now()-60000+offset).toISOString();
const snapshot=(at=time(),players=[{name:"Åsa Öberg"}],coaches=[{name:"Coach Exempel"}])=>({schema_version:1,
  team:{id:"p11",name:"P11",sportadmin_group_id:"378673",source_url:"https://h43lund.web.sportadmin.se/grupp/?ID=378673"},
  observed_at:at,players,coaches});
function request(path="/api/v1/teams/p11",method="GET",body,auth=false,headers={}){
  const h={...headers};
  if(auth)h.Authorization=`Bearer ${token}`;
  if(body!==undefined)h["Content-Type"]="application/json";
  return mf.dispatchFetch("https://api.test"+path,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const put=(value,expectedObservedAt=null,path="p11",extra={})=>request(`/api/v1/internal/teams/${path}/roster`,"PUT",{season,snapshot:value,expectedObservedAt,...extra},true);
async function publicValue(){const r=await request();assert.equal(r.status,200);return r.json();}
function displayDate(days=1){
  const d=new Date(Date.now()+days*86400000);
  const parts=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"long",day:"2-digit",weekday:"short"}).formatToParts(d);
  const get=t=>parts.find(p=>p.type===t).value;
  const local=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  const weekday=["sön","mån","tis","ons","tor","fre","lör"][new Date(local+"T12:00:00Z").getUTCDay()];
  return {date:`${weekday} ${get("day")}`,month:get("month"),year:get("year")};
}
function event(days=1,startTime="17:00"){
  const d=displayDate(days);return {team:"P11",date:d.date,month:d.month,startTime,endTime:"18:30",location:"Synthetic Hall",type:"Träning",title:"",opponent:"",homeAway:"",meetingTime:"",info:"must never be exposed"};
}
function match(days=1,time="17:00",status="upcoming"){
  const d=displayDate(days);return {team:"P11",date:d.date,month:`${d.month.toUpperCase()} ${d.year}`,time,hall:"Synthetic Hall",home:"H43 Lund HF",away:"Synthetic Opponent",score:"",logo:"https://unneeded.invalid",status};
}

test("migrations seed only verified P11 identity; no fabricated roster",async()=>{
  assert.equal((await db.prepare("SELECT count(*) AS n FROM team_roster_snapshots").first()).n,0);
  assert.equal((await publicValue()).roster.lastSyncedAt,null);
});
test("valid snapshot persists and public projection is explicit names-only",async()=>{
  assert.equal((await put(snapshot())).status,200);
  const r=await request();const value=await r.json();
  assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");
  assert.equal(r.headers.get("x-content-type-options"),"nosniff");
  assert.deepEqual(value.roster.players,[{displayName:"Åsa Öberg"}]);
  assert.deepEqual(value.roster.coaches,[{displayName:"Coach Exempel"}]);
  assert.deepEqual(Object.keys(value).sort(),["apiVersion","id","name","season","welcome","roster","nextMatch","upcomingMatches","playedMatches","upcomingEvents","social","contact","dataStatus","freshness"].sort());
  const text=JSON.stringify(value);
  for(const forbidden of ["378673","sportadmin_group_id","source_url","observed_us","players_json","attempted_us",token,hash,"sync_status"])assert.ok(!text.includes(forbidden),forbidden);
  assert.deepEqual(value.welcome,{title:null,description:null,heroImageUrl:null,seasonMessage:null,heroAlt:null});
});
test("real Python HTTP adapter synchronizes the Phase 2 fixture into local D1",async()=>{
  const origin=await mf.ready;
  const root=fileURLToPath(new URL("../../",import.meta.url));
  const code=`import os\nfrom pathlib import Path\nfrom h43_scraper.cloudflare import CloudflareRosterStore\nfrom h43_scraper.youth_roster import TeamConfig,synchronize\nstore=CloudflareRosterStore(os.environ['H43_API_URL'],os.environ['H43_INGEST_TOKEN'],allow_local_http=True)\nhtml=Path('tests/fixtures/sportadmin_youth_sample.html').read_text(encoding='utf-8')\nresult=synchronize(TeamConfig(),store,fetch=lambda _:html)\nprint(result.status)\nraise SystemExit(0 if result.status=='success' else 1)`;
  const child=spawn(process.env.PYTHON || "python",["-c",code],{cwd:root,env:{...process.env,H43_API_URL:origin.origin,H43_INGEST_TOKEN:token,PYTHONPATH:root+"/src",NO_PROXY:"localhost,127.0.0.1"},windowsHide:true});
  let stdout="",stderr="";child.stdout.on("data",d=>stdout+=d);child.stderr.on("data",d=>stderr+=d);
  const exit=await new Promise((resolve,reject)=>{child.on("error",reject);child.on("exit",resolve);});
  assert.equal(exit,0,stderr+stdout);
  const value=await publicValue();assert.equal(value.roster.players.length,2);assert.equal(value.roster.coaches.length,1);
});
test("unknown and SQL-shaped team IDs cannot escape parameterized lookups",async()=>{
  assert.equal((await request("/api/v1/teams/unknown")).status,404);
  assert.equal((await request("/api/v1/teams/p11%27%20OR%201=1--")).status,400);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM teams").first()).n,2);
});
test("unauthenticated and invalid credentials cannot ingest or read private data",async()=>{
  const path="/api/v1/internal/teams/p11/roster";
  assert.equal((await request(path,"PUT",{snapshot:snapshot()})).status,401);
  assert.equal((await request(path)).status,401);
  assert.equal((await request(path,"PUT",{},false,{Authorization:`Bearer ${randomBytes(32).toString("base64url")}`})).status,401);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM team_roster_snapshots").first()).n,0);
});
test("credential scope and payload mapping prevent cross-team/source updates",async()=>{
  assert.equal((await put(snapshot(),null,"other")).status,403);
  const wrong=snapshot();wrong.team.id="other";
  assert.equal((await put(wrong)).status,403);
  const source=snapshot();source.team.sportadmin_group_id="999";source.team.source_url="https://h43lund.web.sportadmin.se/grupp/?ID=999";
  assert.equal((await put(source)).status,403);
});
test("future teams use configuration and cannot inherit P11 names",async()=>{
  await put(snapshot());
  const response=await request("/api/v1/teams/other");assert.equal(response.status,200);
  const value=await response.json();assert.equal(value.id,"other");assert.deepEqual(value.roster.players,[]);
});
test("browser-origin ingestion is forbidden even with a valid credential",async()=>{
  assert.equal((await request("/api/v1/internal/teams/p11/roster","GET",undefined,true,{Origin:"https://www.h43lund.se"})).status,403);
});
test("malformed JSON, oversized chunks and extra payload fields are rejected",async()=>{
  const headers={Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
  const path="https://api.test/api/v1/internal/teams/p11/roster";
  assert.equal((await mf.dispatchFetch(path,{method:"PUT",headers,body:"{"})).status,400);
  assert.equal((await mf.dispatchFetch(path,{method:"PUT",headers,body:"x".repeat(65537)})).status,413);
  assert.equal((await put(snapshot(),null,"p11",{admin:true})).status,422);
  const v=snapshot();v.players[0].image_url="https://not-needed.invalid";
  assert.equal((await put(v)).status,422);
});
test("streamed requests enforce limits even without Content-Length",async()=>{
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(40000));controller.enqueue(new Uint8Array(40000));controller.close();}});
  const result=await mf.dispatchFetch("https://api.test/api/v1/internal/teams/p11/roster",{method:"PUT",duplex:"half",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:stream});
  assert.equal(result.status,413);
});
test("public response limit fails closed instead of returning an oversized roster",async()=>{
  const fake={id:"p11",name:"P11",publication_authorized:1,current_season:null,
    observed_at:time(),observed_us:Date.now()*1000,cache_version:0,sync_status:"success",
    players_json:JSON.stringify(Array.from({length:300},()=>({name:"漢".repeat(150)}))),
    coaches_json:JSON.stringify(Array.from({length:300},()=>({name:"漢".repeat(150)})))};
  const result=await worker.fetch(new Request("https://test/api/v1/teams/p11"),{ENVIRONMENT:"development",PUBLIC_API_ENABLED:"true",ALLOWED_ORIGINS:"",
    DB:{prepare(sql){return {bind(){return this;},async first(){return sql.includes('r.content_json')?null:fake;}}}}});
  assert.equal(result.status,503);assert.equal((await result.json()).error.code,"RESPONSE_TOO_LARGE");
});
for(const attack of ["<script>alert(1)</script>",'<img src=x onerror="alert(1)">',"Namn\nAnnat"]){
  test("XSS or non-normalized name is rejected: "+JSON.stringify(attack),async()=>{
    assert.equal((await put(snapshot(time(),[{name:attack}],[]))).status,422);
  });
}
test("SQL metacharacters in a valid name are stored as data, not SQL",async()=>{
  const name="O'Connor'); DROP TABLE teams;--";
  assert.equal((await put(snapshot(time(),[{name}],[]))).status,200);
  assert.equal((await publicValue()).roster.players[0].displayName,name);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM teams").first()).n,2);
});
test("same-name people remain distinct and Unicode is preserved",async()=>{
  assert.equal((await put(snapshot(time(),[{name:"Björn Äng"},{name:"Björn Äng"}],[]))).status,200);
  assert.equal((await publicValue()).roster.players.length,2);
});
test("empty snapshots and automatic removal are immediately reflected without a roster cache",async()=>{
  const first=snapshot();assert.equal((await put(first)).status,200);
  await publicValue();
  assert.equal((await put(snapshot(time(1000),[],[]),first.observed_at)).status,200);
  const v=await publicValue();assert.deepEqual(v.roster.players,[]);assert.deepEqual(v.roster.coaches,[]);assert.equal(v.dataStatus.roster,"empty");
});
test("replay, stale expected version and out-of-order observations cannot overwrite newer data",async()=>{
  const first=snapshot();assert.equal((await put(first)).status,200);
  assert.equal((await put(first,first.observed_at)).status,409);
  assert.equal((await put(snapshot(time(-1000)),first.observed_at)).status,409);
  assert.equal((await put(snapshot(time(1000)),null)).status,409);
  assert.equal((await put(snapshot(time(2000)),time(-500))).status,409);
  assert.equal((await publicValue()).roster.players.length,1);
});
test("microsecond versions are compared without millisecond rounding",async()=>{
  const base=time().slice(0,19);
  const a=snapshot(base+".123001Z"), b=snapshot(base+".123002Z",[],[]);
  assert.equal((await put(a)).status,200);
  assert.equal((await put(b,a.observed_at)).status,200);
  assert.equal((await put(a,b.observed_at)).status,409);
});
test("concurrent writes with one expected version have exactly one winner",async()=>{
  const a=snapshot();await put(a);
  const responses=await Promise.all([put(snapshot(time(1000),[],[]),a.observed_at),put(snapshot(time(2000)),a.observed_at)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test("future and very old timestamps are rejected",async()=>{
  assert.equal((await put(snapshot(new Date(Date.now()+600000).toISOString()))).status,422);
  assert.equal((await put(snapshot(new Date(Date.now()-2*86400000).toISOString()))).status,422);
});
test("season transition does not inherit old data or accept a stale season envelope",async()=>{
  const first=snapshot();await put(first);
  await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized) VALUES('p11','next',?1,?2,1)").bind(`${currentYear}-01-01`,`${currentYear+1}-12-31`).run();
  await db.prepare("UPDATE teams SET current_season='next' WHERE id='p11'").run();
  assert.deepEqual((await publicValue()).roster.players,[]);
  assert.equal((await put(snapshot(time(1000)))).status,409);
});
test("failure reports mark roster stale without modifying valid membership",async()=>{
  const first=snapshot();await put(first);
  assert.equal((await request("/api/v1/internal/teams/p11/failure","POST",{season,attemptedAt:time(1000)},true)).status,200);
  const v=await publicValue();assert.equal(v.dataStatus.roster,"stale");assert.equal(v.roster.players.length,1);
});
test("publication is withheld until configured and withdrawal is immediate",async()=>{
  await put(snapshot());await db.prepare("UPDATE team_seasons SET publication_authorized=0 WHERE team_id='p11'").run();
  const v=await publicValue();assert.equal(v.dataStatus.roster,"withheld");assert.deepEqual(v.roster.players,[]);assert.equal(v.roster.lastSyncedAt,null);
});
test("CORS is exact, no credentials, and is not authentication",async()=>{
  const good=await request(undefined,"GET",undefined,false,{Origin:"https://www.h43lund.se"});
  assert.equal(good.status,200);assert.equal(good.headers.get("access-control-allow-origin"),"https://www.h43lund.se");assert.equal(good.headers.get("access-control-allow-credentials"),null);
  assert.equal((await request(undefined,"GET",undefined,false,{Origin:"https://www.h43lund.se.evil.invalid"})).status,403);
  assert.equal((await request(undefined,"OPTIONS",undefined,false,{Origin:"https://www.h43lund.se","Access-Control-Request-Method":"PUT"})).status,405);
  assert.equal((await request(undefined,"OPTIONS",undefined,false,{Origin:"https://www.h43lund.se","Access-Control-Request-Method":"GET"})).status,204);
});
for(const method of ["POST","PUT","PATCH","DELETE","HEAD"]){
  test("public API rejects "+method,async()=>assert.equal((await request(undefined,method)).status,405));
}
test("invalid social URLs never reach the public response",async()=>{
  await db.prepare("UPDATE team_seasons SET instagram_url=?1,tiktok_url=?2 WHERE team_id='p11'").bind("javascript:alert(1)","https://www.tiktok.com.evil.invalid/@club").run();
  assert.deepEqual((await publicValue()).social,{instagram:null,tiktok:null,instagramLabel:null,tiktokLabel:null});
  await db.prepare("UPDATE team_seasons SET instagram_url=?1,tiktok_url=?2 WHERE team_id='p11'").bind("https://www.instagram.com/h43lund/","https://www.tiktok.com/@h43lund").run();
  assert.equal((await publicValue()).social.tiktok,"https://www.tiktok.com/@h43lund");
});
test("empty calendar and no future match are successful empty sources",async()=>{
  const v=await publicValue();assert.deepEqual(v.upcomingEvents,[]);assert.equal(v.nextMatch,null);
  assert.deepEqual(v.upcomingMatches,[]);
  assert.equal(v.dataStatus.calendar,"empty");assert.equal(v.dataStatus.matches,"empty");
});
test("schedule adapter filters exact team, sorts times, skips cancelled/postponed and withholds raw info",async()=>{
  calendar=[event(1,"18:00"),event(1,"16:00"),{...event(1,"15:00"),team:"P110"}];
  matches=[match(1,"18:00"),match(1,"14:00","cancelled"),match(1,"13:00","postponed"),match(1,"17:00")];
  const v=await publicValue();
  assert.equal(v.upcomingEvents.length,2);assert.ok(v.upcomingEvents[0].startsAt<v.upcomingEvents[1].startsAt);
  assert.ok(v.nextMatch.startsAt.includes("T16:00")||v.nextMatch.startsAt.includes("T15:00"));
  assert.equal(v.nextMatch.opponent,"Synthetic Opponent");
  assert.ok(!JSON.stringify(v).includes("must never be exposed"));
});

test("matches and calendar remain separate, exact-team filtered and independently available",async()=>{
  calendar=[{...event(),title:"P11 calendar only"},{...event(),team:"P110",title:"Wrong calendar team"},{...event(),team:"Synthetic Other",title:"Other calendar team"}];
  matches=[{...match(3),away:"Later dedicated match"},{...match(2),away:"Earlier dedicated match"},
    {...match(1),team:"P110",away:"Wrong match team"},{...match(1),team:"Synthetic Other",away:"Other match team"},match(-1),match(1,"17:00","played")];
  const value=await publicValue();assert.equal(value.upcomingEvents.length,1);assert.equal(value.upcomingEvents[0].title,"P11 calendar only");
  assert.deepEqual(value.upcomingMatches.map(m=>m.opponent),["Earlier dedicated match","Later dedicated match"]);
  assert.deepEqual(value.nextMatch,value.upcomingMatches[0]);
  const other=await (await request('/api/v1/teams/other')).json();assert.equal(other.upcomingEvents[0].title,'Other calendar team');assert.equal(other.upcomingMatches[0].opponent,'Other match team');
  calendar={invalid:true};await db.prepare("UPDATE teams SET cache_version=cache_version+1 WHERE id='p11'").run();
  const partial=await publicValue();assert.equal(partial.dataStatus.calendar,'unavailable');assert.equal(partial.upcomingMatches.length,2);
});
test("malformed upstream data is unavailable, not a successful empty feed",async()=>{
  calendar={events:[]};matches=[{team:"P11",status:"upcoming",date:"nonsense"}];
  const v=await publicValue();assert.equal(v.dataStatus.calendar,"unavailable");assert.equal(v.dataStatus.matches,"unavailable");
});
test("calendar resolves weekday/day/month without requiring a manual year setting",async()=>{
  await db.prepare("UPDATE team_seasons SET calendar_year=NULL,calendar_month=NULL WHERE team_id='p11'").run();
  calendar=[event()];assert.equal((await publicValue()).dataStatus.calendar,"available");
});
test("current-team mode synchronizes and serves schedules without a season or date boundaries",async()=>{
  await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized) VALUES('p11','current','','',1)").run();
  await db.prepare("UPDATE teams SET current_season='current' WHERE id='p11'").run();
  calendar=[event()];matches=[match()];
  const r=await request("/api/v1/internal/teams/p11/roster","PUT",{season:"current",snapshot:snapshot(),expectedObservedAt:null},true);
  assert.equal(r.status,200);
  const v=await publicValue();assert.equal(v.season,null);assert.equal(v.roster.players.length,1);
  assert.equal(v.dataStatus.calendar,"available");assert.equal(v.dataStatus.matches,"available");
});
test("calendar year resolution handles December/January and rejects invalid dates",()=>{
  assert.equal(calendarYear(12,31,"ons",2026),2025);
  assert.equal(calendarYear(1,1,"fre",2026),2027);
  assert.equal(calendarYear(2,30,"mån",2026),null);
});
test("schedule TTL reuses data; authenticated generation change bypasses all old keys",async()=>{
  await publicValue();const firstCalls=sourceCalls;assert.equal(firstCalls,2);
  await publicValue();assert.equal(sourceCalls,firstCalls);
  assert.equal((await request("/api/v1/internal/teams/p11/refresh","POST",{})).status,401);
  assert.equal((await request("/api/v1/internal/teams/p11/refresh","POST",{},true)).status,200);
  await publicValue();assert.equal(sourceCalls,firstCalls+2);
});
test("source errors do not stop valid roster delivery",async()=>{
  await put(snapshot());upstreamBad=true;const v=await publicValue();
  assert.equal(v.roster.players.length,1);assert.equal(v.dataStatus.matches,"unavailable");
});
test("Stockholm DST conversion rejects ambiguous and nonexistent local times",()=>{
  assert.equal(stockholmInstant(2026,1,15,"17:00"),"2026-01-15T16:00:00.000Z");
  assert.equal(stockholmInstant(2026,7,15,"17:00"),"2026-07-15T15:00:00.000Z");
  assert.equal(stockholmInstant(2026,3,29,"02:30"),null);
  assert.equal(stockholmInstant(2026,10,25,"02:30"),null);
});
test("rate limiting and database errors return generic errors without internals",async()=>{
  const limited=await worker.fetch(new Request("https://test/api/v1/teams/p11"),{
    ENVIRONMENT:"development",PUBLIC_API_ENABLED:"true",ALLOWED_ORIGINS:"",RATE_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(limited.status,429);
  const broken=await worker.fetch(new Request("https://test/api/v1/teams/p11"),{
    ENVIRONMENT:"development",PUBLIC_API_ENABLED:"true",ALLOWED_ORIGINS:"",DB:{prepare(){throw new Error("SECRET_DB_DETAILS");}}});
  assert.equal(broken.status,503);assert.ok(!(await broken.text()).includes("SECRET_DB_DETAILS"));
  const unguarded=await worker.fetch(new Request("https://test/api/v1/teams/p11"),{ENVIRONMENT:"production",PUBLIC_API_ENABLED:"true",ALLOWED_ORIGINS:""});
  assert.equal(unguarded.status,503);assert.equal((await unguarded.json()).error.code,"RATE_LIMITER_UNAVAILABLE");
});


test('reviewed team registry filters calendar and dedicated matches independently for every team',async()=>{
  const teams=JSON.parse(await readFile(new URL('../../config/youth-teams.json',import.meta.url),'utf8'));
  for(const team of teams){
    if(team.id!=='p11'){
      await db.prepare('INSERT INTO teams(id,name,sportadmin_team_name,group_id,current_season,cache_version) VALUES(?,?,?,?,?,?)').bind(team.id,team.name,team.sportadminTeamName,team.groupId,season,epoch*100).run();
      await db.prepare("INSERT INTO team_seasons(team_id,season,starts_on,ends_on,publication_authorized,calendar_year,calendar_month) VALUES(?,?,?, ?,1,?,?)").bind(team.id,season,`${currentYear}-01-01`,`${currentYear+1}-12-31`,currentYear,currentMonth).run();
    }
  }
  calendar=teams.map(t=>({...event(),team:t.sportadminTeamName,title:`${t.id}-calendar`}));
  matches=teams.map(t=>({...match(),team:t.sportadminTeamName,away:`${t.id}-opponent`}));
  for(const team of teams){
    const response=await request(`/api/v1/teams/${team.id}`);assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.id,team.id);assert.deepEqual(data.upcomingEvents.map(e=>e.title),[`${team.id}-calendar`]);assert.deepEqual(data.upcomingMatches.map(m=>m.opponent),[`${team.id}-opponent`]);assert.equal(data.nextMatch.opponent,`${team.id}-opponent`);
  }
});


for(const [home,away,opponent,homeAway]of [
 ['H43 Lund HF 1','Synthetic Opponent','Synthetic Opponent','home'],
 ['Synthetic Opponent','H43 Lund HF 2','Synthetic Opponent','away'],
 ['H43 Lund HF 3','Synthetic Opponent','Synthetic Opponent','home'],
 ['  H43   Lund HF 2  ','Synthetic Opponent','Synthetic Opponent','home'],
 ['H43 Lund HF 1','H43 Lund HF 2',null,'unknown'],
 ['Other H43 Lund HF 1','Synthetic Opponent',null,'unknown'],
 ['H43 Lund HF 2 Other','Synthetic Opponent',null,'unknown'],
 ['Match','Synthetic Opponent','Synthetic Opponent','unknown'],
 ['Match','',null,'unknown'],
 ['Match','Match',null,'unknown'],
 ['Unidentified club','Synthetic Opponent',null,'unknown'],
])test(`match side identity: ${home} / ${away}`,async()=>{
 matches=[{...match(),home,away}];const data=await publicValue();assert.equal(data.nextMatch.opponent,opponent);assert.equal(data.nextMatch.homeAway,homeAway);
});

test('explicit played matches use the dedicated feed, newest first, safe results and exact team isolation',async()=>{
  matches=[{...match(-2,'17:00','played'),away:'Older result',score:'21 - 19'},
    {...match(-1,'17:00','played'),away:'Latest result',score:''},match(2),match(-1,'14:00','upcoming'),
    {...match(-1,'12:00','played'),team:'P110',away:'Wrong team'},match(-1,'13:00','cancelled'),match(1,'15:00','played')];
  const v=await publicValue();assert.deepEqual(v.playedMatches.map(m=>m.opponent),['Latest result','Older result']);
  assert.deepEqual(v.playedMatches.map(m=>m.score),[null,'21–19']);assert.ok(v.playedMatches.every(m=>m.status==='played'));
  assert.equal(v.upcomingMatches.length,1);assert.equal(v.nextMatch.status,'scheduled');assert.equal(v.nextMatch.score,undefined);
  assert.equal(v.dataStatus.playedMatches,'available');assert.deepEqual((await (await request('/api/v1/teams/other')).json()).playedMatches,[]);
  matches=[{...match(-1,'17:00','played'),score:'<script>alert(1)</script>'}];await db.prepare("UPDATE teams SET cache_version=cache_version+1 WHERE id='p11'").run();
  const onlyPlayed=await publicValue();assert.equal(onlyPlayed.nextMatch,null);assert.equal(onlyPlayed.dataStatus.matches,'empty');assert.equal(onlyPlayed.dataStatus.playedMatches,'available');assert.equal(onlyPlayed.playedMatches[0].score,null);
  upstreamBad=true;await db.prepare("UPDATE teams SET cache_version=cache_version+1 WHERE id='p11'").run();const failed=await publicValue();assert.deepEqual(failed.playedMatches,[]);assert.equal(failed.dataStatus.playedMatches,'unavailable');
});
test('played match history is bounded to the latest hundred and accepts zero scores',async()=>{
  matches=Array.from({length:110},(_,i)=>({...match(-1,'17:00','played'),away:`Opponent ${i}`,score:'0 - 0'}));
  const v=await publicValue();assert.equal(v.playedMatches.length,100);assert.equal(v.playedMatches[0].score,'0–0');assert.equal(v.upcomingMatches.length,0);
});

test('source member identities retain keys only for continuous unchanged members and never leak publicly',async()=>{
  const read=async()=>JSON.parse((await db.prepare("SELECT players_json FROM team_roster_snapshots WHERE team_id='p11'").first()).players_json);
  let at=time();assert.equal((await put(snapshot(at,[{name:'Same Name',sourceId:'100'},{name:'Same Name',sourceId:'101'}]))).status,200);
  const initial=await read();assert.notEqual(initial[0].memberKey,initial[1].memberKey);assert.ok(initial[0].memberKey);
  let next=time(1000);assert.equal((await put(snapshot(next,[{name:'Same Name',sourceId:'101'},{name:'Same Name',sourceId:'100'}]),at)).status,200);assert.equal((await read())[0].memberKey,initial[1].memberKey);
  at=next;next=time(2000);await put(snapshot(next,[{name:'Renamed',sourceId:'100'}]),at);const renamed=await read();assert.notEqual(renamed[0].memberKey,initial[0].memberKey);
  at=next;next=time(3000);await put(snapshot(next,[]),at);at=next;next=time(4000);await put(snapshot(next,[{name:'Same Name',sourceId:'101'}]),at);assert.notEqual((await read())[0].memberKey,initial[1].memberKey);
  const value=await publicValue();assert.deepEqual(value.roster.players,[{displayName:'Same Name'}]);
  const internal=await (await request('/api/v1/internal/teams/p11/roster','GET',undefined,true)).json();assert.equal(internal.snapshot.players[0].sourceId,'101');assert.equal(internal.snapshot.players[0].memberKey,undefined);
  const invalid={...snapshot(time(5000)),players:[{name:'One',sourceId:'1',memberKey:crypto.randomUUID()}]};assert.equal((await put(invalid,next)).status,422);
  assert.equal((await put(snapshot(time(5000),[{name:'One',sourceId:'1'},{name:'Two',sourceId:'1'}]),next)).status,422);
});
