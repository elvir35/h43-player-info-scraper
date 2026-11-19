import {fetchTeam,teamId,httpsUrl,socialUrl,emailUrl,phoneUrl,type Team} from './api';
import {formattedText} from './editorial-format';
declare const __H43_PUBLIC_CONFIG__:{apiBaseUrl:string;clubCalendarUrl:string;clubContactUrl:string;registrationUrl:string;teamAliases:Record<string,string>;teamLabels:Record<string,string>;credentials?:'omit'|'same-origin'};
const config=__H43_PUBLIC_CONFIG__;
const source=(document.currentScript as HTMLScriptElement|null)?.src;
const assets=new URL('.',source||location.href);
const registryKey=Symbol.for('h43.team-pages.v1');
const global=window as unknown as Record<symbol,unknown>;
type NodeChild=Node|string|null;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',...children:NodeChild[]):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);if(cls)node.className=cls;
  for(const child of children)if(child!==null)node.append(child);return node;
}
function link(label:string,href:string,cls='h43-link'):HTMLAnchorElement{
  const a=el('a',cls,label);a.href=href;return a;
}
const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',weekday:'long',day:'numeric',month:'long'});
const timeFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit'});
const shortFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',day:'numeric',month:'short'});
function time(value:string,short=false):HTMLTimeElement{
  const date=new Date(value);const n=el('time','',`${(short?shortFormat:dateFormat).format(date)} · ${timeFormat.format(date)}`);n.dateTime=value;return n;
}
function section(title:string,id:string,eyebrow:string):HTMLElement{
  const s=el('section','h43-section',el('p','h43-eyebrow',eyebrow),el('h2','',title));s.id=id;return s;
}
function message(text:string):HTMLElement{return el('p','h43-muted',text);}
const matchDateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',weekday:'short',day:'numeric',month:'short'});
function matchIcon(kind:'clock'|'pin'):SVGSVGElement{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',kind==='clock'?'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0':'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0');svg.append(path);return svg;
}
const playedDateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',weekday:'short',day:'numeric',month:'short',year:'numeric'});
function playedMatchCard(m:Team['playedMatches'][number]):HTMLLIElement{
  const teamName='H43 Lund';
  const tag=el('span','h43-tag',m.homeAway==='home'?'Hemmamatch':m.homeAway==='away'?'Bortamatch':'Spelad match');
  const top=el('div','h43-fixture-top',el('p','h43-fixture-date',playedDateFormat.format(new Date(m.startsAt))),tag);
  const card=el('li','h43-fixture h43-played-fixture',top);
  if(m.homeAway!=='unknown'&&m.opponent){
    const names=m.homeAway==='home'?[teamName,m.opponent]:[m.opponent,teamName],scores=m.score?.split('–');
    const scoreboard=el('div','h43-scoreboard');scoreboard.setAttribute('role','group');scoreboard.setAttribute('aria-label',m.score?'Slutresultat':'Spelad match utan rapporterat resultat');
    for(const [i,name]of names.entries()){
      const side=el('span','h43-score-team',el('span','',name));
      scoreboard.append(el('div',`h43-score-row${(m.homeAway==='home'?i===0:i===1)?' h43-score-club':''}`,side,el('strong','h43-score-number',scores?.[i]??'–')));
    }
    card.append(scoreboard);
  }else{
    // An unidentified home side cannot safely assign the two scores to teams.
    card.append(el('h3','h43-fixture-opponent',m.opponent||'Motståndare meddelas'),el('p','h43-score-unknown',m.score||'–'));
    if(m.score)card.append(el('p','h43-result-note','Resultatet visas i ordningen hemmalag–bortalag.'));
  }
  if(!m.score)card.append(el('p','h43-result-note','Resultat saknas'));
  const kickoff=time(m.startsAt);kickoff.setAttribute('aria-label',kickoff.textContent!);kickoff.textContent=timeFormat.format(new Date(m.startsAt));
  card.append(el('div','h43-match-meta h43-played-meta',el('span','h43-match-time',matchIcon('clock'),kickoff),el('span','h43-match-location',matchIcon('pin'),m.location||'Spelplats saknas')));
  if(m.competition)card.append(el('p','h43-match-competition',m.competition));
  return card;
}
function matchCard(m:Team['upcomingMatches'][number]|Team['playedMatches'][number],next:boolean):HTMLLIElement{
  if(m.status==='played')return playedMatchCard(m);
  const date=new Date(m.startsAt),parts=matchDateFormat.formatToParts(date),part=(key:string)=>parts.find(p=>p.type===key)?.value||'';
  const dateBlock=el('div','h43-match-date',el('span','',part('weekday').replace('.','')),el('strong','',part('day')),el('span','',part('month').replace('.','')));dateBlock.setAttribute('aria-hidden','true');
  const kickoff=time(m.startsAt);kickoff.setAttribute('aria-label',kickoff.textContent!);kickoff.textContent=timeFormat.format(date);
  const meta=el('div','h43-match-meta',el('span','h43-match-time',matchIcon('clock'),kickoff),el('span','h43-match-location',matchIcon('pin'),m.location||'Spelplats meddelas'));
  const body=el('div','h43-match-body',el('h3',next?'h43-opponent':'h43-fixture-opponent',m.opponent||'Motståndare meddelas'),meta);
  if(m.competition)body.append(el('p','h43-match-competition',m.competition));
  const tag=el('span','h43-tag',m.homeAway==='home'?'Hemmamatch':m.homeAway==='away'?'Bortamatch':'Match');
  const top=el('div','h43-fixture-top',next?el('p','h43-next-label','NÄSTA MATCH'):el('p','h43-fixture-date',matchDateFormat.format(date)),tag);
  return el('li',`h43-fixture${next?' h43-next-fixture':''}`,top,next?el('div','h43-match-main',dateBlock,body):body);
}
type MatchFilter='upcoming'|'played';
type TabId='overview'|'match'|'calendar'|'contact';
function render(team:Team,uid:string,selected:TabId,onSelect:(id:TabId)=>void,matchFilter:MatchFilter,onMatchFilter:(id:MatchFilter)=>void):HTMLElement{
  const teamName=Object.hasOwn(config.teamLabels,team.id)?config.teamLabels[team.id]:team.name;
  const ui=el('article','h43-ui');ui.dataset.h43Ui='';ui.lang='sv';ui.setAttribute('aria-label',teamName);
  const hero=el('header','h43-hero');
  const privateImage=config.credentials==='same-origin'&&/^\/api\/admin\/v1\/teams\/[a-z0-9-]+\/images\/[a-f0-9-]{36}$/.test(team.welcome.heroImageUrl||'');
  const photo=httpsUrl(team.welcome.heroImageUrl)||(privateImage?new URL(team.welcome.heroImageUrl!,location.origin).href:null);
  const title=el('h1','',teamName);
  const intro=el('div','h43-intro',el('p','h43-eyebrow','VÅRA UNGDOMSLAG'),title,
    el('p','h43-hero-copy','Välkommen till laget'),
    team.season?el('p','h43-season',team.season):null);
  hero.append(el('div','h43-hero-inner',intro,link('Anmäl dig ↗',config.registrationUrl,'h43-button')));
  const nav=el('div','h43-nav');nav.setAttribute('role','tablist');
  nav.setAttribute('aria-label','Lagets innehåll');
  const welcome=section(team.welcome.title||'Välkommen till laget',`${uid}-overview`,'VÅRT LAG');
  if(photo){const figure=el('figure','h43-team-photo'),image=el('img','h43-team-image');image.alt=team.welcome.heroAlt||`Lagbild för ${teamName}`;image.referrerPolicy='no-referrer';image.decoding='async';image.addEventListener('error',()=>figure.remove());image.src=photo;figure.append(image);welcome.append(figure);}
  const socials=el('div','h43-social');for(const platform of ['instagram','tiktok'] as const){const url=socialUrl(team.social[platform],platform);if(url){const label=team.social[platform==='instagram'?'instagramLabel':'tiktokLabel'];const a=link((label||(platform==='instagram'?'Instagram':'TikTok'))+' ↗',url,'h43-social-link');a.target='_blank';a.rel='noopener noreferrer';socials.append(a);}}
  if(socials.childElementCount){const follow=el('aside','h43-follow',el('div','h43-follow-copy',el('h3','','Följ laget'),el('p','','Häng med oss på sociala medier.')),socials);follow.setAttribute('aria-label','Lagets sociala medier');welcome.append(follow);}
  welcome.append(formattedText(team.welcome.description||'Här hittar du lagets matcher och aktiviteter. Välj en flik ovan för att följa laget genom handbollssäsongen!','h43-description h43-formatted'));
  if(team.welcome.seasonMessage)welcome.append(el('aside','h43-editorial-note',el('h3','','Aktuellt i laget'),formattedText(team.welcome.seasonMessage,'h43-formatted')));
  const match=section('Kommande matcher',`${uid}-match`,'LAGETS MATCHER');match.classList.add('h43-match');
  const filters=el('div','h43-match-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Matchfilter');
  const matchBody=el('div','h43-match-results');matchBody.id=`${uid}-match-results`;
  const choices=new Map<MatchFilter,HTMLButtonElement>();
  function showMatches(filter:MatchFilter){
    for(const [id,button]of choices)button.setAttribute('aria-pressed',String(id===filter));
    match.querySelector('h2')!.textContent=filter==='played'?'Spelade matcher':'Kommande matcher';matchBody.replaceChildren();
    const unavailable=(filter==='played'?team.dataStatus.playedMatches:team.dataStatus.matches)==='unavailable';
    const matches=filter==='played'?team.playedMatches:team.upcomingMatches;
    if(unavailable||!matches.length){matchBody.append(message(unavailable?'Matchinformationen kan inte hämtas just nu.':filter==='played'?'Inga spelade matcher att visa just nu.':'Ingen kommande match att visa just nu.'));return;}
    if(filter==='played'){
      const list=el('ol','h43-fixtures h43-following-fixtures',...matches.map(m=>matchCard(m,false)));list.setAttribute('aria-label','Spelade matcher');matchBody.append(list);
    }else{
      const next=el('ol','h43-fixtures h43-next-list',matchCard(matches[0],true));next.setAttribute('aria-label','Nästa match');matchBody.append(next);
      if(matches.length>1){const following=el('ol','h43-fixtures h43-following-fixtures',...matches.slice(1).map(m=>matchCard(m,false)));following.start=2;following.setAttribute('aria-label','Fler kommande matcher');matchBody.append(el('h3','h43-following-title','Därefter'),following);}
    }
  }
  for(const [id,label]of [['upcoming','Kommande'],['played','Spelade']] as const){const button=el('button','h43-match-filter',label);button.type='button';button.dataset.matchFilter=id;button.setAttribute('aria-controls',matchBody.id);button.addEventListener('click',()=>{onMatchFilter(id);showMatches(id);});choices.set(id,button);filters.append(button);}
  match.append(filters,matchBody);showMatches(matchFilter);
  const calendar=section('På gång i laget',`${uid}-calendar`,'LAGKALENDERN');
  const events=team.dataStatus.calendar==='unavailable'?[]:team.upcomingEvents.slice(0,8);
  if(events.length){const list=el('ol','h43-events');for(const e of events){
    const kind={training:'Träning',match:'Match',other:'Aktivitet'}[e.type];
    const details=el('div','h43-event-body',el('div','h43-event-title',el('span',`h43-kind h43-kind-${e.type}`,kind),el('h3','',e.title)),
      time(e.startsAt,true),e.endsAt?el('span','h43-end',`–${timeFormat.format(new Date(e.endsAt))}`):null,
      e.location?el('p','h43-venue',e.location):null);
    list.append(el('li','h43-event',details));}calendar.append(list);
  }else calendar.append(message(team.dataStatus.calendar==='unavailable'?'Kalendern kan inte hämtas just nu.':'Inga kommande aktiviteter att visa just nu.'));
  calendar.append(link('Hela H43:s kalender ↗',config.clubCalendarUrl));
  const contact=section('Kontakt',`${uid}-contact`,'VI SES I HALLEN');

  if(team.contact.text)contact.append(formattedText(team.contact.text,'h43-editorial-note h43-formatted'));
  contact.append(el('p','h43-contact-copy','Nyfiken på handboll eller vill du komma i kontakt med laget?'));
  const contacts=el('div','h43-contact-grid');
  for(const person of team.contact.people){const email=emailUrl(person.email),phone=phoneUrl(person.phone);if(!email&&!phone)continue;
    const actions=el('div','h43-contact-actions');if(email)actions.append(link(person.email!,email,'h43-link'));if(phone)actions.append(link(person.phone!,phone,'h43-link'));
    contacts.append(el('section','h43-contact-card',el('h3','',person.name||'Kontaktperson'),actions));
  }
  if(contacts.childElementCount)contact.append(contacts);
  else contact.append(message('Lagets kontaktuppgifter är inte publicerade. Kontakta klubben för hjälp.'),link('Kontakta H43 Lund ↗',config.clubContactUrl,'h43-button h43-button-blue'));
  const panels:{id:TabId;label:string;node:HTMLElement;button:HTMLButtonElement}[]=[
    {id:'overview',label:'Översikt',node:welcome},{id:'match',label:'Matcher',node:match},
    {id:'calendar',label:'Kalender',node:calendar},
    {id:'contact',label:'Kontakt',node:contact}
  ].map(panel=>({...panel,button:el('button','h43-tab',panel.label)} as typeof panels[number]));
  const activate=(id:TabId,focus=false)=>{
    for(const panel of panels){const active=panel.id===id;panel.node.hidden=!active;panel.button.setAttribute('aria-selected',String(active));panel.button.tabIndex=active?0:-1;
      if(active&&focus){panel.button.focus({preventScroll:true});panel.button.scrollIntoView({block:'nearest',inline:'nearest'});}}
    onSelect(id);
  };
  for(const [index,panel] of panels.entries()){
    panel.node.classList.add('h43-tabpanel');panel.node.setAttribute('role','tabpanel');panel.node.setAttribute('aria-labelledby',`${uid}-tab-${panel.id}`);panel.node.tabIndex=0;
    panel.button.type='button';panel.button.id=`${uid}-tab-${panel.id}`;panel.button.setAttribute('role','tab');panel.button.setAttribute('aria-controls',panel.node.id);
    panel.button.addEventListener('click',()=>activate(panel.id));
    panel.button.addEventListener('keydown',event=>{
      let next:number;
      if(event.key==='ArrowRight')next=(index+1)%panels.length;else if(event.key==='ArrowLeft')next=(index+panels.length-1)%panels.length;
      else if(event.key==='Home')next=0;else if(event.key==='End')next=panels.length-1;else return;
      event.preventDefault();activate(panels[next].id,true);
    });nav.append(panel.button);
  }
  activate(selected);
  ui.addEventListener('click',event=>{
    const anchor=(event.target as Element).closest('a');if(anchor?.getAttribute('href')!==`#${uid}-contact`)return;
    event.preventDefault();activate('contact');contact.focus({preventScroll:true});contact.scrollIntoView({block:'start'});
  });
  const content=el('div','h43-content',...panels.map(panel=>panel.node));
  const portal=new URL(config.apiBaseUrl,location.href);portal.hostname=portal.hostname.replace(/^h43-youth-api-/,'h43-youth-admin-');portal.pathname='/';portal.search='';portal.hash='';
  portal.searchParams.set('team',Object.entries(config.teamAliases).find(([,id])=>id===team.id)?.[0]||team.id);
  const edit=link('Ledare – redigera lagsidan',portal.href,'h43-editor-link');
  const requestAccess=link('Kontakta Elvir','mailto:elvir.arslanovic@gmail.com?subject='+encodeURIComponent(`Behörighet till ${teamName}`),'h43-access-link');
  const leaders=el('div','h43-leader-access',edit,el('p','','Saknar du behörighet? ',requestAccess,'.'));
  const footer=el('footer','h43-footer',el('div','h43-footer-info',el('span','','H43 LUND HF'),el('span','','Matcher och kalender · Tider i svensk tid')),leaders);
  ui.append(hero,nav,content,footer);return ui;
}
function selectedTeam(host:HTMLElement):string{
  // Fixed embeds (including authenticated previews) cannot be overridden by URL input.
  if(host.hasAttribute('data-team-id'))return teamId(host.getAttribute('data-team-id'));
  const values=new URL(location.href).searchParams.getAll('team');
  if(values.length===0)throw new Error('missing-selection');
  if(values.length!==1)throw new Error('invalid-selection');
  try{const slug=teamId(values[0]);return teamId(Object.hasOwn(config.teamAliases,slug)?config.teamAliases[slug]:slug);}catch{throw new Error('invalid-selection');}
}
function start(){
  if(global[registryKey])return;global[registryKey]=true;
  const mounted=new Map<HTMLElement,()=>void>();const known=new WeakSet<HTMLElement>();let serial=0;
  function mount(host:HTMLElement){
    if(mounted.has(host))return;
    // The shadow boundary isolates styles in both directions from the Webnode theme.
    if(host.shadowRoot&&!known.has(host))return;
    const shadow=host.shadowRoot||host.attachShadow({mode:'open'});known.add(host);
    const css=el('link');css.rel='stylesheet';css.href=new URL('team-page.css',assets).href;
    const region=el('div','h43-root');region.setAttribute('aria-live','polite');region.setAttribute('aria-busy','true');
    shadow.replaceChildren(css,region);const uid=`h43-${++serial}`;let controller:AbortController|null=null;let last=0;let disposed=false;let loading=false;let selected:TabId='overview';let matchFilter:MatchFilter='upcoming';
    async function load(){
      if(loading||disposed)return;loading=true;last=Date.now();controller=new AbortController();
      const timeout=setTimeout(()=>controller?.abort(),15000);
      region.setAttribute('aria-busy','true');
      if(!region.childElementCount)region.append(el('p','h43-state','Hämtar lagets sida…'));
      try{const id=selectedTeam(host);const data=await fetchTeam(config.apiBaseUrl,id,controller.signal,config.credentials??'omit');
        if(!disposed){const focusedTab=shadow.activeElement?.getAttribute('role')==='tab';
          const focusedFilter=shadow.activeElement?.getAttribute('data-match-filter');
          region.replaceChildren(render(data,uid,selected,id=>{selected=id;},matchFilter,id=>{matchFilter=id;}));
          if(focusedFilter)region.querySelector<HTMLElement>(`[data-match-filter="${focusedFilter}"]`)?.focus({preventScroll:true});
          if(focusedTab)region.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});}
      }catch(cause){if(!disposed){const reason=cause instanceof Error?cause.message:'';const selection=['missing-selection','invalid-selection','not-found'].includes(reason);const retry=el('button','h43-button h43-button-blue','Försök igen');retry.type='button';retry.addEventListener('click',()=>void load());
        const error=el('div','h43-state',el('h2','',reason==='missing-selection'?'Välj ett lag':selection?'Laget hittades inte':'Lagsidan kan inte visas just nu'),el('p','',selection?'Välj laget via ungdomssidan.':'Kontrollera anslutningen och försök igen.'),selection?link('Till ungdomslagen ↗','https://www.h43lund.se/ungdom/'):retry);error.setAttribute('role','alert');region.replaceChildren(error);}}
      finally{clearTimeout(timeout);region.setAttribute('aria-busy','false');loading=false;}
    }
    const refresh=()=>{if(document.visibilityState==='visible'&&Date.now()-last>=300000)void load();};
    const interval=setInterval(refresh,300000);document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);
    mounted.set(host,()=>{disposed=true;controller?.abort();clearInterval(interval);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);});void load();
  }
  function scan(){for(const [host,dispose] of mounted)if(!host.isConnected){dispose();mounted.delete(host);}
    document.querySelectorAll<HTMLElement>('#h43-team-page[data-team-id],[data-h43-team-page][data-team-id],#h43-team-page[data-team-from-url],[data-h43-team-page][data-team-from-url]').forEach(mount);}
  scan();new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
