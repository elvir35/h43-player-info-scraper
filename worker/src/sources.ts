import {boundedText, MAX_UPSTREAM, plain} from "./validation";

export const MATCHES_URL = "https://h43-matches-api.vercel.app/api/matches";
export const CALENDAR_URL = "https://calendar-api-black.vercel.app/api/calendar";
export const SCHEDULE_TTL = 300;
const months = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];
// Version normalized matches independently so older projections are bypassed at rollout.
const MATCH_PROJECTION_VERSION = 3;
const weekdays = ["sön","mån","tis","ons","tor","fre","lör"];
export type SourceTeam = {
  id: string; current_season: string | null; sportadmin_team_name: string;
  starts_on: string | null; ends_on: string | null;
  calendar_year: number | null; calendar_month: number | null; cache_version: number;
};
type Event = {id: string; type: string; title: string; startsAt: string; endsAt: string | null;
  location: string | null; status: string};
type Match = {id: string; startsAt: string; opponent: string | null; homeAway: string;
  location: string | null; competition: string | null; status: string; score?: string | null};
type Feed<T> = {items: T[]; fetchedAt: string | null; status: "available"|"empty"|"unavailable"};

// Match possible UTC offsets against Intl's Stockholm rules. Reject skipped or
// ambiguous local times rather than silently picking a DST interpretation.
export function stockholmInstant(year: number, month: number, day: number, time: string): string | null {
  if (!/^\d\d:\d\d$/.test(time)) return null;
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59 || year < 2000 || year > 2100) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const target = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")} ${time}`;
  const fmt = new Intl.DateTimeFormat("sv-SE", {timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  const candidates = [60,120].map(offset => wall - offset * 60000).filter(ms => fmt.format(ms) === target);
  return candidates.length === 1 ? new Date(candidates[0]).toISOString() : null;
}
function sourceText(value: unknown, max = 300): string {
  return plain(typeof value === "string" ? value.normalize("NFC").replace(/\s+/gu," ").trim() : value, max, true);
}
export function calendarYear(month: number, day: number, weekday: string, referenceYear: number): number | null {
  // The supplied rolling calendar omits year but supplies weekday/day/month.
  // Resolve only an unambiguous nearby year; never invent a season date range.
  const valid = [referenceYear-1,referenceYear,referenceYear+1].filter(year=>{
    const date = new Date(Date.UTC(year,month-1,day));
    return date.getUTCMonth()===month-1 && date.getUTCDate()===day && weekdays[date.getUTCDay()]===weekday;
  });
  return valid.length===1 ? valid[0] : null;
}
function dateOf(row: Record<string, unknown>, calendar: boolean, team: SourceTeam): string | null {
  const match = /^(sön|mån|tis|ons|tor|fre|lör) (\d{1,2})$/.exec(sourceText(row.date));
  const monthText = sourceText(row.month).toLocaleLowerCase("sv-SE");
  const parts = /^(\S+)(?: (\d{4}))?$/.exec(monthText);
  if (!match || !parts) throw new Error("Invalid display date");
  const month = months.indexOf(parts[1]) + 1;
  const day = Number(match[2]);
  const referenceYear = Number(new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Stockholm",year:"numeric"}).format(new Date()));
  const year = parts[2] ? Number(parts[2]) : calendar
    ? team.calendar_year && month===team.calendar_month ? team.calendar_year : calendarYear(month,day,match[1],referenceYear)
    : null;
  if (!month || !year) throw new Error("Unresolved calendar date");
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || weekdays[date.getUTCDay()] !== match[1]) throw new Error("Invalid day");
  const time = sourceText(calendar ? row.startTime : row.time);
  if (!time) return null; // Unknown start is not midnight or all-day.
  const result = stockholmInstant(year, month, day, time);
  if (!result) throw new Error("Invalid or ambiguous time");
  return result;
}
function inSeason(iso: string, team: SourceTeam): boolean {
  const localDate = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(iso));
  return (!team.starts_on || localDate >= team.starts_on) && (!team.ends_on || localDate <= team.ends_on);
}
async function identifier(prefix: string, fields: unknown[]): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fields)));
  return prefix + "-" + [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,24);
}
async function normalize(rows: unknown, kind: "calendar"|"matches", team: SourceTeam): Promise<(Event|Match)[]> {
  if (!Array.isArray(rows) || rows.length > 5000 || rows.some(r=>!r || typeof r!=="object" || Array.isArray(r) || typeof r.team!=="string")) throw new Error("Invalid feed");
  const result: (Event|Match)[] = [];
  for (const row of rows as Record<string,unknown>[]) {
    if (row.team !== team.sportadmin_team_name) continue;
    const state = sourceText(row.status ?? "").toLowerCase();
    if (["cancelled","canceled","postponed","inställd","uppskjuten"].includes(state)) continue;
    if (kind === "calendar" && state === "played") continue;
    if (kind === "matches" && !["upcoming","played"].includes(state)) throw new Error("Unknown match state");
    const startsAt = dateOf(row, kind === "calendar", team);
    if (!startsAt || !inSeason(startsAt, team)) continue;
    if (kind === "calendar") {
      const type = ({"Träning":"training","Match":"match","Övrigt":"other"} as Record<string,string>)[sourceText(row.type)];
      if (!type) throw new Error("Unknown event type");
      const title = sourceText(row.title,200) || sourceText(row.opponent,200) || sourceText(row.type);
      let endsAt: string | null = null;
      const end = sourceText(row.endTime);
      if (end) {
        const local = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(startsAt));
        const [y,m,d] = local.split("-").map(Number);
        endsAt = stockholmInstant(y,m,d,end);
        if (!endsAt || endsAt <= startsAt) throw new Error("Invalid end time");
      }
      const location = sourceText(row.location) || null;
      result.push({id: await identifier("event",[team.id,startsAt,type,title,location]), type,title,startsAt,endsAt,location,
        status: state === "scheduled" ? "scheduled" : "unknown"});
    } else {
      const home = sourceText(row.home), away = sourceText(row.away);
      // Match exact club identity plus a squad number, not arbitrary H43 substrings.
      const clubSide=(name:string)=>/^H43 Lund(?: HF)?(?: [1-9][0-9]{0,2})?$/i.test(name.replace(/\s+/g,' ').trim());
      const isHome = clubSide(home), isAway = clubSide(away);
      const other=isHome!==isAway?(isHome?away:home):null;
      // P10's generic event label identifies no home side; away still names the opponent.
      const opponent=other&&other!=='Match'?other:home==='Match'&&away&&away!=='Match'&&!isAway?away:null;
      const location = sourceText(row.hall) || null;
      const score=typeof row.score=== "string" ? /^([0-9]{1,3})\s*[-–:]\s*([0-9]{1,3})$/.exec(row.score.trim()) : null;
      result.push({id: await identifier("match",[team.id,startsAt,home,away,location]), startsAt,
        opponent,
        homeAway: isHome !== isAway ? (isHome ? "home" : "away") : "unknown", location,
        competition: typeof row.competition === "string" ? sourceText(row.competition) || null : null,
        status:state === "played" ? "played" : "scheduled",...(state === "played" ? {score:score?`${Number(score[1])}–${Number(score[2])}`:null}:{})});
    }
  }
  return result.sort((a,b)=>a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}
export function cacheKey(team: SourceTeam, environment: string, kind: string, origin: string): Request {
  return new Request(`${origin}/__h43_schedule/v1/${encodeURIComponent(environment)}/${team.id}/${encodeURIComponent(team.current_season ?? "none")}/${team.cache_version}/${team.calendar_year}-${team.calendar_month}/${kind}${kind === "matches" ? `-projection-${MATCH_PROJECTION_VERSION}` : ""}`);
}
async function load(kind: "matches"|"calendar", team: SourceTeam, environment: string, origin: string): Promise<Feed<Event|Match>> {
  const unavailable = {items:[], fetchedAt:null, status:"unavailable"} as const;
  if (!team.current_season) return {...unavailable,items:[]};
  try {
    const key = cacheKey(team,environment,kind,origin);
    const cached = await caches.default.match(key);
    if (cached) {
      const value = await cached.json<Feed<Event|Match>>();
      if (value.fetchedAt && Date.now() - Date.parse(value.fetchedAt) < SCHEDULE_TTL * 1000) return value;
    }
    const response = await fetch(kind === "matches" ? MATCHES_URL : CALENDAR_URL,
      {redirect:"manual",signal:AbortSignal.timeout(8000),headers:{Accept:"application/json"}});
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Source failure");
    const raw = JSON.parse(await boundedText(response.body,MAX_UPSTREAM));
    const items = await normalize(raw,kind,team);
    const value: Feed<Event|Match> = {items,fetchedAt:new Date().toISOString(),status:items.length ? "available":"empty"};
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).length > MAX_UPSTREAM) throw new Error("Source too large");
    await caches.default.put(key,new Response(json,{headers:{"Cache-Control":`max-age=${SCHEDULE_TTL}`,"Content-Type":"application/json"}}));
    return value;
  } catch { return {...unavailable,items:[]}; }
}
export async function schedules(team: SourceTeam, environment: string, origin: string) {
  const [calendar,matches] = await Promise.all([load("calendar",team,environment,origin),load("matches",team,environment,origin)]);
  const now = new Date().toISOString();
  const upcomingMatches = (matches.items as Match[]).filter(m=>m.status==="scheduled"&&m.startsAt>now).slice(0,100);
  const playedMatches = (matches.items as Match[]).filter(m=>m.status==="played"&&m.startsAt<=now).sort((a,b)=>b.startsAt.localeCompare(a.startsAt)||a.id.localeCompare(b.id)).slice(0,100);
  return {
    upcomingEvents: (calendar.items as Event[]).filter(e=>e.startsAt>now).slice(0,100),
    nextMatch: upcomingMatches[0] ?? null,
    upcomingMatches,playedMatches,
    playedMatchesStatus:matches.status === "unavailable" ? "unavailable" : playedMatches.length ? "available":"empty",
    calendarStatus: calendar.status === "unavailable" ? "unavailable" : calendar.items.some(e=>e.startsAt>now) ? "available":"empty",
    matchesStatus: matches.status === "unavailable" ? "unavailable" : upcomingMatches.length ? "available":"empty",
    calendarFetchedAt: calendar.fetchedAt, matchesFetchedAt: matches.fetchedAt
  };
}
