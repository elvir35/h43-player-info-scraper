import {fail,object,plain,socialUrl,slug} from './validation';
export type RosterDetail={imageId:string|null;memberKey:string;shirtNumber:string|null;position:string|null;responsibility:string|null};
export type ContactPerson={name:string|null;email:string|null;phone:string|null};
export type Content={rosterDetails:RosterDetail[];welcomeTitle:string|null;welcomeDescription:string|null;seasonMessage:string|null;heroImageId:string|null;heroAlt:string|null;photoPublicationConfirmed:boolean;instagramUrl:string|null;instagramLabel:string|null;tiktokUrl:string|null;tiktokLabel:string|null;contacts:ContactPerson[];contactEmail:string|null;contactPhone:string|null;contactText:string|null};
export const CONTENT_KEYS=['welcomeTitle','welcomeDescription','seasonMessage','heroImageId','heroAlt','photoPublicationConfirmed','instagramUrl','instagramLabel','tiktokUrl','tiktokLabel','contactEmail','contactPhone','contactText','contacts','rosterDetails'];
export function uuid(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))fail(422,'INVALID_IDENTIFIER');return value;}
export function email(value:unknown):string{if(typeof value!=='string'||value.length>254||!/^[-a-z0-9._+]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value))fail(422,'INVALID_EMAIL');return value.toLowerCase();}
function phone(value:unknown):string|null{if(value===null||value===undefined||value==='')return null;if(typeof value!=='string')fail(422,'INVALID_PHONE');const s=value.trim(),digits=s.replace(/[^0-9]/g,'');if(!s)return null;if(s.length>40||!/^\+?[0-9][0-9 ()-]*[0-9]$/.test(s)||digits.length<7||digits.length>15)fail(422,'INVALID_PHONE');return s;}
export function integer(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<0)fail(422,'INVALID_VERSION');return Number(value);}
function optional(value:unknown,max:number,multiline=false):string|null{
  if(value===null||value==='')return null;
  if(typeof value!=='string')fail();const text=value.normalize('NFC').replace(/\r\n/g,'\n').trim();
  if(text.length>max||/[<>\u0000-\u0008\u000b-\u001f\u007f]/u.test(text)||(!multiline&&/[\n\t]/.test(text)))fail(422,'INVALID_CONTENT');return text||null;
}
export function content(value:unknown):Content{
  const c=object(value,CONTENT_KEYS.filter(k=>!['contactPhone','contacts','rosterDetails'].includes(k)||(value&&typeof value==='object'&&Object.hasOwn(value,k))));const profile=(key:string,platform:'instagram'|'tiktok')=>{const s=optional(c[key],2048);if(s&&!socialUrl(s,platform))fail(422,'INVALID_SOCIAL_URL');return s;};
  if(typeof c.photoPublicationConfirmed!=='boolean')fail();
  const legacyEmail=c.contactEmail===null||c.contactEmail===''?null:email(c.contactEmail),legacyPhone=phone(c.contactPhone);
  let contacts:ContactPerson[];
  if(Object.hasOwn(c,'contacts')){
    if(!Array.isArray(c.contacts)||c.contacts.length>20)fail(422,'INVALID_CONTACTS');
    contacts=c.contacts.map(value=>{const row=object(value,['name','email','phone']);const person={name:optional(row.name,120),email:row.email===null||row.email===''?null:email(row.email),phone:phone(row.phone)};if(!person.email&&!person.phone)fail(422,'INVALID_CONTACTS');return person;});
    if(legacyEmail!==(contacts[0]?.email??null)||legacyPhone!==(contacts[0]?.phone??null))fail(422,'CONTACTS_OUT_OF_SYNC');
  }else contacts=legacyEmail||legacyPhone?[{name:null,email:legacyEmail,phone:legacyPhone}]:[];

  const rawDetails=c.rosterDetails??[];if(!Array.isArray(rawDetails)||rawDetails.length>300)fail(422,'INVALID_ROSTER_DETAILS');const keys=new Set<string>();
  const rosterDetails:RosterDetail[]=rawDetails.map(value=>{const d=object(value,['memberKey','shirtNumber','position','responsibility',...(value&&typeof value==='object'&&Object.hasOwn(value,'imageId')?['imageId']:[])]),key=uuid(d.memberKey);
    if(keys.has(key))fail(422,'INVALID_ROSTER_DETAILS');keys.add(key);
    const shirtNumber=optional(d.shirtNumber,3);if(shirtNumber&&!/^[0-9]{1,3}$/.test(shirtNumber))fail(422,'INVALID_ROSTER_DETAILS');
    return {imageId:d.imageId==null?null:uuid(d.imageId),memberKey:key,shirtNumber,position:optional(d.position,60),responsibility:optional(d.responsibility,60)};});
  // Accept legacy revisions but never expose or republish their retired overlays.
  return {rosterDetails:[],welcomeTitle:optional(c.welcomeTitle,120),welcomeDescription:optional(c.welcomeDescription,5000,true),seasonMessage:optional(c.seasonMessage,600,true),
    heroImageId:c.heroImageId===null?null:uuid(c.heroImageId),heroAlt:optional(c.heroAlt,160),photoPublicationConfirmed:c.photoPublicationConfirmed,
    instagramUrl:profile('instagramUrl','instagram'),instagramLabel:optional(c.instagramLabel,40),tiktokUrl:profile('tiktokUrl','tiktok'),tiktokLabel:optional(c.tiktokLabel,40),
    contacts,contactEmail:legacyEmail,contactPhone:legacyPhone,contactText:optional(c.contactText,600,true)};
}
export function emptyContent():Content{return content(Object.fromEntries(CONTENT_KEYS.map(k=>[k,k==='photoPublicationConfirmed'?false:['contacts','rosterDetails'].includes(k)?[]:null])));}
export function publicContent(c:Content,teamId:string,origin:string,photosAllowed:boolean){
  return {welcome:{title:c.welcomeTitle,description:c.welcomeDescription,seasonMessage:c.seasonMessage,heroAlt:c.heroAlt,
    heroImageUrl:c.heroImageId?`${origin}/api/v1/teams/${slug(teamId)}/images/${uuid(c.heroImageId)}`:null},
    social:{instagram:c.instagramUrl,tiktok:c.tiktokUrl,instagramLabel:c.instagramLabel,tiktokLabel:c.tiktokLabel},contact:{email:c.contactEmail,phone:c.contactPhone,text:c.contactText,people:c.contacts}};
}
export async function published(db:D1Database,teamId:string){
  return db.prepare(`SELECT r.content_json, s.photo_publication_allowed FROM teams t JOIN team_content_state s ON s.team_id=t.id AND s.season=t.current_season
    JOIN team_content_revisions r ON r.id=s.published_revision_id AND r.team_id=s.team_id AND r.season=s.season WHERE t.id=?1 AND t.enabled=1`).bind(teamId).first<{content_json:string;photo_publication_allowed:number}>();
}
export async function publicImage(db:D1Database,bucket:R2Bucket|undefined,teamId:string,imageId:string):Promise<Response>{
  const row=await db.prepare(`SELECT i.object_key,i.content_type FROM teams t
    JOIN team_content_state s ON s.team_id=t.id AND s.season=t.current_season
    JOIN team_content_revisions r ON r.id=s.published_revision_id AND r.team_id=s.team_id AND r.season=s.season
    JOIN team_images i ON i.team_id=s.team_id AND i.season=s.season AND i.id=?2 AND i.state='ready'
    WHERE t.id=?1 AND t.enabled=1 AND json_extract(r.content_json,'$.heroImageId')=i.id
      AND NOT EXISTS(SELECT 1 FROM retired_roster_images WHERE image_id=i.id)
      AND NOT EXISTS(SELECT 1 FROM team_content_state old,json_each(old.draft_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=i.id)
      AND NOT EXISTS(SELECT 1 FROM team_content_revisions old,json_each(old.content_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=i.id)`)
    .bind(slug(teamId),uuid(imageId)).first<{object_key:string;content_type:string}>();
  if(!row||!bucket)fail(404,'IMAGE_NOT_FOUND');const image=await bucket.get(row.object_key);if(!image)fail(404,'IMAGE_NOT_FOUND');
  return new Response(image.body,{headers:{'Content-Type':row.content_type,'Content-Length':String(image.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'",'Content-Disposition':`inline; filename="${imageId}.${row.content_type==='image/webp'?'webp':'jpg'}"`}});
}

export async function retiredImage(db:D1Database,id:string){
  return !!await db.prepare(`SELECT 1 AS blocked WHERE EXISTS(SELECT 1 FROM retired_roster_images WHERE image_id=?1)
    OR EXISTS(SELECT 1 FROM team_content_state s,json_each(s.draft_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=?1)
    OR EXISTS(SELECT 1 FROM team_content_revisions r,json_each(r.content_json,'$.rosterDetails') d WHERE json_extract(d.value,'$.imageId')=?1)`)
    .bind(id).first();
}
