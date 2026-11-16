export type State = "available"|"empty"|"unavailable";
export type RosterState = State|"withheld"|"stale";
export type Activity = {id:string;type:"training"|"match"|"other";title:string;startsAt:string;endsAt:string|null;location:string|null;status:"scheduled"|"unknown"};
export type Match = {id:string;startsAt:string;opponent:string|null;homeAway:"home"|"away"|"unknown";location:string|null;competition:string|null;status:"scheduled"};
export type PlayedMatch=Omit<Match,'status'> & {status:'played';score:string|null};
export type ContactPerson={name:string|null;email:string|null;phone:string|null};
export type RosterPerson={imageUrl?:string;displayName:string;shirtNumber?:string;position?:string;responsibility?:string};
export type Team = {
  id:string;name:string;season:string|null;welcome:{title:string|null;description:string|null;heroImageUrl:string|null;heroAlt:string|null;seasonMessage:string|null};
  roster:{players:RosterPerson[];coaches:RosterPerson[];lastSyncedAt:string|null};
  nextMatch:Match|null;upcomingMatches:Match[];playedMatches:PlayedMatch[];upcomingEvents:Activity[];social:{instagram:string|null;tiktok:string|null;instagramLabel:string|null;tiktokLabel:string|null};contact:{email:string|null;phone:string|null;text:string|null;people:ContactPerson[]};
  dataStatus:{roster:RosterState;calendar:State;matches:State;playedMatches:State};
};
export function teamId(value:string|null):string {
  if(!value || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(value))throw new Error("Invalid team");
  return value;
}
function record(v:unknown):Record<string,unknown>{
  if(!v || typeof v!=="object" || Array.isArray(v))throw new Error("Invalid record");
  return v as Record<string,unknown>;
}
function text(v:unknown,max:number):string {
  // Text may contain HTML-like characters: it is always rendered with textContent.
  if(typeof v!=="string" || v.length>max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(v))throw new Error("Invalid text");
  return v;
}
function nullable(v:unknown,max:number):string|null{return v===null ? null : text(v,max);}
function date(v:unknown):string {
  const s=text(v,40);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(s) || !Number.isFinite(Date.parse(s))
    || new Date(s).toISOString().slice(0,19)!==s.slice(0,19))throw new Error("Invalid date");
  return s;
}
function choice<T extends string>(v:unknown,values:readonly T[]):T {
  if(!values.includes(v as T))throw new Error("Invalid state");return v as T;
}
function people(v:unknown):{displayName:string}[]{
  if(!Array.isArray(v)||v.length>300)throw new Error("Invalid names");
  return v.map(p=>{const name=text(record(p).displayName,150);if(!name.trim())throw new Error("Empty name");const row=record(p);const shirtNumber=nullable(row.shirtNumber??null,3);if(shirtNumber&&!/^[0-9]{1,3}$/.test(shirtNumber))throw new Error('Invalid shirt number');const position=nullable(row.position??null,60),responsibility=nullable(row.responsibility??null,60);const imageUrl=nullable(row.imageUrl??null,2048);return {displayName:name,...(imageUrl?{imageUrl}:{}),...(shirtNumber?{shirtNumber}:{}),...(position?{position}:{}),...(responsibility?{responsibility}:{})};});
}
export function validateTeam(value:unknown,expectedId:string):Team {
  const r=record(value);
  if(r.apiVersion!=="1" || r.id!==expectedId)throw new Error("Mismatched API response");
  const w=record(r.welcome),roster=record(r.roster),social=record(r.social),contact=record(r.contact),state=record(r.dataStatus);
  if(!Array.isArray(r.upcomingEvents)||r.upcomingEvents.length>100)throw new Error("Invalid calendar");
  const activities=r.upcomingEvents.map(value=>{
    const e=record(value);return {id:text(e.id,100),type:choice(e.type,["training","match","other"]),title:text(e.title,200),
      startsAt:date(e.startsAt),endsAt:e.endsAt===null?null:date(e.endsAt),location:nullable(e.location,300),status:choice(e.status,["scheduled","unknown"])};
  });
  const parseMatch=(value:unknown):Match=>{const m=record(value);return {id:text(m.id,100),startsAt:date(m.startsAt),opponent:nullable(m.opponent,300),
    homeAway:choice(m.homeAway,["home","away","unknown"]),location:nullable(m.location,300),competition:nullable(m.competition,300),status:choice(m.status,["scheduled"])};};
  const rawPeople=contact.people===undefined?(contact.email||contact.phone?[{name:null,email:contact.email??null,phone:contact.phone??null}]:[]):contact.people;
  if(!Array.isArray(rawPeople)||rawPeople.length>20)throw new Error('Invalid contacts');
  const contactPeople=rawPeople.map(value=>{const p=record(value);return {name:nullable(p.name,120),email:nullable(p.email,254),phone:nullable(p.phone,40)};});
  const match=r.nextMatch===null?null:parseMatch(r.nextMatch);
  // Preserve compatibility with the previous API during an API-only rollback.
  const rawMatches=r.upcomingMatches===undefined?(match?[match]:[]):r.upcomingMatches;
  if(!Array.isArray(rawMatches)||rawMatches.length>100)throw new Error("Invalid matches");
  const upcomingMatches=rawMatches.map(parseMatch);
  const rawPlayed=r.playedMatches??[];if(!Array.isArray(rawPlayed)||rawPlayed.length>100)throw new Error('Invalid played matches');
  const playedMatches:PlayedMatch[]=rawPlayed.map(value=>{const m=record(value);if(m.status!=='played')throw new Error('Invalid played status');
    const score=m.score===null?null:text(m.score,12);if(score!==null&&!/^[0-9]{1,3}–[0-9]{1,3}$/.test(score))throw new Error('Invalid score');
    return {...parseMatch({...m,status:'scheduled'}),status:'played',score};});
  return {id:expectedId,name:text(r.name,150),season:nullable(r.season,40),
    welcome:{title:nullable(w.title,120),description:nullable(w.description,5000),heroImageUrl:nullable(w.heroImageUrl,2048),heroAlt:nullable(w.heroAlt??null,160),seasonMessage:nullable(w.seasonMessage??null,600)},
    roster:{players:people(roster.players),coaches:people(roster.coaches),lastSyncedAt:roster.lastSyncedAt===null?null:date(roster.lastSyncedAt)},
    nextMatch:match,upcomingMatches,playedMatches,upcomingEvents:activities,social:{instagram:nullable(social.instagram,2048),tiktok:nullable(social.tiktok,2048),instagramLabel:nullable(social.instagramLabel??null,40),tiktokLabel:nullable(social.tiktokLabel??null,40)},contact:{email:nullable(contact.email,254),phone:nullable(contact.phone??null,40),text:nullable(contact.text??null,600),people:contactPeople},
    dataStatus:{roster:choice(state.roster,["available","empty","unavailable","withheld","stale"]),calendar:choice(state.calendar,["available","empty","unavailable"]),matches:choice(state.matches,["available","empty","unavailable"]),playedMatches:choice(state.playedMatches??"unavailable",["available","empty","unavailable"])}};
}
export function httpsUrl(value:string|null):string|null {
  if(!value)return null;
  try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port ? u.href:null;}catch{return null;}
}
export function socialUrl(value:string|null,platform:"instagram"|"tiktok"):string|null {
  const href=httpsUrl(value);if(!href)return null;const u=new URL(href);
  const path=platform==="instagram"?/^\/[\w.]+\/?$/:/^\/@[\w.]+\/?$/;
  return [platform+".com","www."+platform+".com"].includes(u.hostname)&&!u.search&&!u.hash&&path.test(u.pathname)?href:null;
}
export function emailUrl(value:string|null):string|null {
  return value&&/^[\p{L}\p{N}._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/iu.test(value)?"mailto:"+encodeURIComponent(value).replace(/%40/g,"@"):null;
}
export function phoneUrl(value:string|null):string|null{if(!value||value.length>40||!/^\+?[0-9][0-9 ()-]*[0-9]$/.test(value))return null;const digits=value.replace(/[^0-9]/g,'');return digits.length>=7&&digits.length<=15?'tel:'+(value.startsWith('+')?'+':'')+digits:null;}
export async function fetchTeam(base:string,id:string,signal:AbortSignal,credentials:RequestCredentials='omit'):Promise<Team>{
  const response=await fetch(`${base}/teams/${encodeURIComponent(teamId(id))}`,{signal,mode:"cors",credentials,cache:"no-store",redirect:"error",headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(response.status===404?"not-found":"network");
  if(!response.headers.get("content-type")?.includes("application/json"))throw new Error("Invalid content type");
  const reader=response.body?.getReader();if(!reader)throw new Error("Missing response");
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const item=await reader.read();if(item.done)break;length+=item.value.length;
    if(length>256*1024){await reader.cancel();throw new Error("Response too large");}chunks.push(item.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return validateTeam(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),id);
}
