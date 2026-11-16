import {names,type Member,fail} from './validation';
import type {RosterDetail} from './editorial';
export function identify(incoming:Member[],previous:Member[]):Member[]{
  return incoming.map(member=>{if(!member.sourceId)return member;
    const old=previous.find(p=>p.sourceId===member.sourceId&&p.name===member.name);
    return {...member,memberKey:old?.memberKey??crypto.randomUUID()};});
}
export function project(members:Member[],details:RosterDetail[],kind:'players'|'coaches',imageBase=''){
  return members.map(member=>{const detail=member.memberKey?details.find(d=>d.memberKey===member.memberKey):undefined;
    return {displayName:member.name,...(kind==='players'?{...(detail?.imageId&&imageBase?{imageUrl:`${imageBase}/${detail.imageId}`} : {}),...(detail?.shirtNumber?{shirtNumber:detail.shirtNumber}:{}),...(detail?.position?{position:detail.position}:{})}:detail?.responsibility?{responsibility:detail.responsibility}:{})};});
}
export async function editableRoster(db:D1Database,team:string,season:string){
  const row=await db.prepare(`SELECT r.players_json,r.coaches_json,r.observed_us,r.observed_at FROM team_roster_snapshots r JOIN teams t ON t.id=r.team_id AND t.group_id=r.group_id AND t.current_season=r.season WHERE r.team_id=?1 AND r.season=?2 AND t.enabled=1`).bind(team,season).first<{players_json:string;coaches_json:string;observed_us:number;observed_at:string}>();
  return {version:row?.observed_us??null,lastSyncedAt:row?.observed_at??null,
    players:row?names(JSON.parse(row.players_json),true):[],coaches:row?names(JSON.parse(row.coaches_json),true):[]};
}
export function validateDetails(details:RosterDetail[],previous:RosterDetail[],roster:Awaited<ReturnType<typeof editableRoster>>){
  let changed=false;
  for(const detail of details){const old=previous.find(d=>d.memberKey===detail.memberKey);if(old&&JSON.stringify(old)===JSON.stringify(detail))continue;
    changed=true;const player=roster.players.some(m=>m.memberKey===detail.memberKey),coach=roster.coaches.some(m=>m.memberKey===detail.memberKey);
    if(player===coach||player&&detail.responsibility||coach&&(detail.shirtNumber||detail.position||detail.imageId))fail(422,'INVALID_ROSTER_DETAILS');
  }
  return changed;
}
