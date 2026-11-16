export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const MAX_REQUEST = 64 * 1024;
export const MAX_RESPONSE = 256 * 1024;
export const MAX_UPSTREAM = 2 * 1024 * 1024;
export function fail(status = 422, code = "INVALID_PAYLOAD"): never { throw new ApiError(status, code); }
export function slug(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(value)) fail(400, "INVALID_TEAM_ID");
  return value;
}
export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const o = value as Record<string, unknown>;
  if (Object.keys(o).length !== keys.length || keys.some(k => !Object.hasOwn(o, k))) fail();
  return o;
}
export function plain(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.length)
      || value !== value.normalize("NFC") || /[<>\u0000-\u001f\u007f]/u.test(value)) fail();
  return value;
}
export type Member={name:string;sourceId?:string;memberKey?:string};
export function names(value: unknown,stored=false): Member[] {
  if (!Array.isArray(value) || value.length > 300) fail();const ids=new Set<string>();const keys=new Set<string>();
  return value.map(item => {
    const raw=item as Record<string,unknown>;const fields=['name',...(raw&&Object.hasOwn(raw,'sourceId')?['sourceId']:[]),...(stored&&raw&&Object.hasOwn(raw,'memberKey')?['memberKey']:[])];
    const row=object(item,fields),name=plain(row.name,150);if(name.replace(/\s+/gu,' ').trim()!==name)fail();
    const member:Member={name};
    if(row.sourceId!==undefined){const id=plain(row.sourceId,12);if(!/^[0-9]{1,12}$/.test(id)||ids.has(id))fail();ids.add(id);member.sourceId=id;}
    if(row.memberKey!==undefined){const key=plain(row.memberKey,36);if(!member.sourceId||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key)||keys.has(key))fail();keys.add(key);member.memberKey=key;}
    return member;
  });
}
// Preserve Python's microseconds: millisecond rounding would break compare-and-swap.
export function instant(value: unknown): {iso: string; us: number} {
  if (typeof value !== "string") fail();
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/.exec(value);
  if (!m) fail();
  const ms = Date.parse(m[1] + "Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19) !== m[1]) fail();
  const micros = (m[2] ?? "").padEnd(6,"0");
  const us = ms * 1000 + Number(micros);
  if (!Number.isSafeInteger(us)) fail();
  return {iso: `${m[1]}.${micros}Z`, us};
}
export type Snapshot = {
  schema_version: 1;
  team: {id: string; name: string; sportadmin_group_id: string; source_url: string};
  observed_at: string;
  players: Member[];
  coaches: Member[];
};
export function snapshot(value: unknown): Snapshot {
  const o = object(value, ["schema_version", "team", "observed_at", "players", "coaches"]);
  if (o.schema_version !== 1) fail();
  const t = object(o.team, ["id", "name", "sportadmin_group_id", "source_url"]);
  const id = slug(plain(t.id, 32));
  const group = plain(t.sportadmin_group_id, 12);
  if (!/^\d{1,12}$/.test(group) || t.source_url !== `https://h43lund.web.sportadmin.se/grupp/?ID=${group}`) fail();
  return {schema_version: 1, team: {id, name: plain(t.name,150), sportadmin_group_id: group, source_url: t.source_url as string},
    observed_at: instant(o.observed_at).iso, players: names(o.players), coaches: names(o.coaches)};
}
export async function boundedText(body: ReadableStream<Uint8Array> | null, limit: number): Promise<string> {
  if (!body) fail(400,"INVALID_JSON");
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { await reader.cancel(); fail(413,"PAYLOAD_TOO_LARGE"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  try { return new TextDecoder("utf-8", {fatal: true, ignoreBOM: false}).decode(bytes); }
  catch { return fail(400,"INVALID_ENCODING"); }
}
export async function requestJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") fail(415,"JSON_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST)) fail(413,"PAYLOAD_TOO_LARGE");
  const text = await boundedText(request.body, MAX_REQUEST);
  try { return JSON.parse(text); } catch { return fail(400,"INVALID_JSON"); }
}
export function safeUrl(value: unknown, hosts?: string[]): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || (hosts && !hosts.includes(u.hostname))) return null;
    return u.href;
  } catch { return null; }
}
export function socialUrl(value: unknown, platform: "instagram"|"tiktok"): string | null {
  const result = safeUrl(value, [platform + ".com", "www." + platform + ".com"]);
  if (!result) return null;
  const u = new URL(result);
  if (u.search || u.hash || !(platform === "instagram" ? /^\/[\w.]+\/?$/ : /^\/@[\w.]+\/?$/).test(u.pathname)) return null;
  return result;
}
export function optionalText(value: unknown, max: number): string | null {
  if (value == null || value === "") return null;
  return plain(value, max);
}
