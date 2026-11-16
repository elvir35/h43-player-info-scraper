import teamLabels from '../config/team-labels.json';
import teamSlugs from '../config/team-slugs.json';
import {formattedText} from '../frontend/src/editorial-format.ts';
const api='/api/admin/v1',main=document.getElementById('main'),status=document.getElementById('status');
let me,csrfToken,selected=null,view=null,dirty=false,busy=false,expired=false,form,previewFrame,noticeTimer,navigationObserver;
const fields={};let contactRows=[],rosterRows=[];
const teamLabel=team=>teamLabels[team.id]||team.name;
function el(tag,cls='',...children){const node=document.createElement(tag);if(cls)node.className=cls;for(const child of children)if(child!==null)node.append(child);return node;}
function button(label,action,cls=''){const node=el('button',cls,label);node.type='button';node.addEventListener('click',()=>run(action));return node;}
function dismissNotice(){clearTimeout(noticeTimer);status.replaceChildren();status.hidden=true;}
function notice(text,{persist=false}={}){
  clearTimeout(noticeTimer);status.hidden=false;
  const close=el('button','notice-dismiss','×');close.type='button';close.setAttribute('aria-label','Stäng meddelandet');close.addEventListener('click',dismissNotice);
  status.replaceChildren(el('span','notice-text',text),close);
  if(!persist){const expire=()=>{if(status.matches(':hover,:focus-within'))noticeTimer=setTimeout(expire,1000);else dismissNotice();};noticeTimer=setTimeout(expire,6500);}
}
function lock(){expired=true;const login=button('Logga in igen',()=>location.reload(),'primary');login.dataset.login='true';const banner=el('section','card lock',el('h1','','Sessionen har gått ut'),el('p','','Kopiera eventuell osparad text innan du loggar in igen och laddar om.'),login);if(form?.isConnected)main.prepend(banner);else main.replaceChildren(banner);}
async function request(path,method='GET',body){
  const headers={Accept:'application/json'};if(method!=='GET'){headers['X-CSRF-Token']=csrfToken;headers['X-H43-Roster-Images']='1';headers['Content-Type']=body instanceof Blob?'image/jpeg':'application/json';}
  const response=await fetch(api+path,{method,headers,credentials:'same-origin',cache:'no-store',redirect:'manual',...(body===undefined?{}:{body:body instanceof Blob?body:JSON.stringify(body)})}).catch(()=>{throw new Error('Anslutningen kunde inte verifieras. Logga in igen eller försök på nytt.');});
  if(response.status===401||response.type==='opaqueredirect'){lock();throw new Error('Sessionen har gått ut.');}
  if(!response.headers.get('Content-Type')?.includes('application/json'))throw new Error('Oväntat svar. Logga in igen.');
  const data=await response.json();if(!response.ok){const code=data.error?.code;throw new Error(({EDIT_CONFLICT:'Någon har ändrat innehållet. Ladda om laget innan du fortsätter. Dina osparade fält är kvar.',TEAM_NOT_AUTHORIZED:'Du saknar behörighet till laget.',USER_NOT_AUTHORIZED:'Du saknar behörighet till portalen.',CSRF_REJECTED:'Säkerhetskontrollen misslyckades. Logga in igen.',INVALID_SOCIAL_URL:'Ange en giltig Instagram- eller TikTok-profil.',IMAGE_TOO_LARGE:'Bilden är för stor.',INVALID_IMAGE:'Bildfilen kunde inte läsas.',IMAGE_DIMENSIONS:'Bilden har för stora dimensioner.',IMAGE_PROCESSING_UNAVAILABLE:'Bildtjänsten är tillfälligt otillgänglig. Försök igen senare. Den tidigare bilden är oförändrad.',IMAGE_UPLOADS_DISABLED:'Bilduppladdning är inte aktiverad.',INVALID_ROSTER_DETAILS:'Truppdetaljerna matchar inte aktuell trupp eller innehåller ogiltiga värden. Ladda om laget.',ROSTER_DETAILS_OUT_OF_SYNC:'Truppredigeringen har uppdaterats. Ladda om portalen innan du sparar.',INVALID_CONTACTS:'Varje kontaktperson behöver en mejladress eller ett telefonnummer. Högst 20 kontaktpersoner kan läggas till.',SELF_LOCKOUT_FORBIDDEN:'Du kan inte ta bort din egen administratörsåtkomst.',CONTACTS_OUT_OF_SYNC:'Kontaktredigeringen har uppdaterats. Ladda om portalen innan du sparar.',INVALID_PHONE:'Ange ett giltigt mobilnummer, till exempel 070-123 45 67 eller +46 70 123 45 67.',INVALID_CONTENT:'Texten innehåller otillåtna tecken eller är för lång.'})[code]||'Åtgärden kunde inte slutföras. Inga ändringar har publicerats.');}
  return data;
}
async function run(action){if(busy)return;busy=true;document.querySelectorAll('button:not(.notice-dismiss)').forEach(b=>b.disabled=true);try{await action();}catch(error){notice(error.message,{persist:true});if(!me&&!expired)main.replaceChildren(el('section','card lock',el('h1','','Portalen är inte tillgänglig'),el('p','',error.message),button('Försök logga in igen',()=>location.reload(),'primary')));}finally{busy=false;document.querySelectorAll('button:not(.notice-dismiss)').forEach(b=>b.disabled=expired&&!b.dataset.login);syncButtons();}}
function syncButtons(){const publish=document.getElementById('publish');if(publish)publish.disabled=busy||expired||dirty||!view?.canPublish;document.querySelectorAll('[data-requires-publish]').forEach(b=>b.disabled=busy||expired||!view?.canPublish);}
function changed(){document.getElementById('publish-confirmation')?.remove();dirty=true;const state=document.getElementById('edit-state');if(state)state.textContent='Osparade ändringar';syncButtons();}
function field(key,label,{multiline=false,max=200,type='text',help=''}={}){
  const input=el(multiline?'textarea':'input');input.name=key;input.setAttribute('aria-label',label);if(!multiline)input.type=type;else input.rows=key==='welcomeDescription'?6:3;input.maxLength=max;input.value=view.draft.content[key]||'';input.addEventListener('input',changed);fields[key]=input;
  if(!multiline)return el('label','field',el('span','',label),input,help?el('small','',help):null);
  const tools=el('div','format-tools');tools.setAttribute('role','group');tools.setAttribute('aria-label',`Formatering: ${label}`);
  const output=el('div','formatted-preview');const refresh=()=>output.replaceChildren(formattedText(input.value));input.addEventListener('input',refresh);refresh();
  function insert(before,after='',line=false){const start=input.selectionStart,end=input.selectionEnd,selected=input.value.slice(start,end)||'text';const prefix=line&&start>0&&input.value[start-1]!=='\n'?'\n':'';
    const replacement=prefix+before+selected.replace(line?/\n/g:/$^/,`\n${before}`)+after;
    if(input.value.length-(end-start)+replacement.length>max){notice('Texten är för lång.');return;}
    input.setRangeText(replacement,start,end,'select');input.focus();changed();refresh();}
  for(const [name,before,after,line]of [['Fet','**','**',false],['Kursiv','*','*',false],['Underrubrik','## ','',true],['Punktlista','- ','',true],['Numrerad lista','1. ','',true],['Länk','[','',false]])tools.append(button(name,()=>{
    if(name!=='Länk')return insert(before,after,line);
    const value=window.prompt('Ange en HTTPS-adress:','https://');if(value===null)return;
    let url;try{url=new URL(value);}catch{throw new Error('Ange en giltig HTTPS-adress.');}
    if(url.protocol!=='https:'||url.username||url.password||url.port||/[\s()<>]/.test(url.href))throw new Error('Ange en giltig HTTPS-adress utan inloggningsuppgifter.');
    insert('[',`](${url.href})`);
  }));
  return el('div','rich-field',el('label','field',el('span','',label),input,el('small','','Formatera markerad text med knapparna. Endast HTTPS-länkar stöds.')),tools,el('details','format-preview',el('summary','','Visa formaterad text'),output),help?el('p','muted',help):null);
}
function checkbox(label,value,change){const input=el('input');input.type='checkbox';input.checked=value;input.addEventListener('change',()=>change(input.checked));return {node:el('label','check',input,el('span','',label)),input};}
function readContact(row){return Object.fromEntries(Object.entries(row).map(([key,input])=>[key,input.value.trim()||null]));}
function values(){const c={...view.draft.content};for(const [key,input]of Object.entries(fields))c[key]=input.type==='checkbox'?input.checked:input.value.trim()||null;c.contacts=contactRows.map(readContact).filter(p=>p.name||p.email||p.phone);c.contactEmail=c.contacts[0]?.email??null;c.contactPhone=c.contacts[0]?.phone??null;const active=new Set(rosterRows.map(r=>r.memberKey));c.rosterDetails=[...(view.draft.content.rosterDetails||[]).filter(d=>!active.has(d.memberKey)),...rosterRows.map(r=>({memberKey:r.memberKey,imageId:r.imageId??null,shirtNumber:r.shirtNumber?.value.trim()||null,position:r.position?.value.trim()||null,responsibility:r.responsibility?.value.trim()||null})).filter(d=>d.imageId||d.shirtNumber||d.position||d.responsibility)];return c;}
function contactEditor(){
  const list=el('div','contact-editor-list');
  function draw(entries){contactRows=[];list.replaceChildren();for(const [index,person]of entries.entries()){
    const number=index+1,row={},box=el('fieldset','contact-editor-row',el('legend','',`Kontaktperson ${number}`));
    for(const [key,label,type,max]of [['name','Namn','text',120],['email','Mejladress','email',254],['phone','Mobilnummer','tel',40]]){const input=el('input');input.type=type;input.maxLength=max;input.value=person[key]||'';input.setAttribute('aria-label',`${label} för kontaktperson ${number}`);input.addEventListener('input',changed);row[key]=input;box.append(el('label','field',el('span','',label),input));}
    box.append(button('Ta bort kontaktperson',()=>{draw(contactRows.map(readContact).filter((_,i)=>i!==index));changed();}));contactRows.push(row);list.append(box);
  }}
  const initial=view.draft.content.contacts??(view.draft.content.contactEmail||view.draft.content.contactPhone?[{name:null,email:view.draft.content.contactEmail,phone:view.draft.content.contactPhone}]:[]);draw(initial.length?initial:[{}]);
  return el('details','card contact-section',el('summary','','Kontakt'),el('p','muted','Lägg till personer med namn, mejladress och mobilnummer. Varje person behöver minst en kontaktväg. Högst 20 personer. Uppgifterna visas offentligt efter publicering.'),list,button('Lägg till kontaktperson',()=>{if(contactRows.length>=20)throw new Error('Högst 20 kontaktpersoner kan läggas till.');draw([...contactRows.map(readContact),{}]);changed();contactRows.at(-1).name.focus();}),field('contactText','Kontakttext (valfritt)',{multiline:true,max:600}));
}

function imagePreview(id){const box=document.getElementById('image-box');if(!box)return;box.replaceChildren();if(id){const img=el('img','image-preview');img.src=`${api}/teams/${selected}/images/${id}`;img.alt=fields.heroAlt?.value||'Förhandsvisning av uppladdad lagbild';box.append(img);}}
async function convert(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Välj en JPEG-, PNG- eller WebP-bild under 10 MB.');
  const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw new Error('Originalbilden har för stora dimensioner.');
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));if(!blob||blob.size>2*1024*1024)throw new Error('Bilden är fortfarande för stor. Välj en mindre bild.');return blob;
  }finally{bitmap.close();}
}
async function upload(){const file=fields.upload.files[0];if(!file)return;notice('Förbereder och laddar upp bilden…');const normalized=await convert(file);
  const result=await request(`/teams/${selected}/images`,'POST',normalized);view.draft.content.heroImageId=result.id;changed();imagePreview(result.id);notice('Bilden är privat uppladdad. Spara utkastet innan du förhandsvisar eller publicerar.');}
async function save(){const c=values();delete c.upload;const result=await request(`/teams/${selected}/draft`,'PUT',{expectedVersion:view.draft.version,content:c});view.draft={version:result.version,content:c};dirty=false;document.getElementById('edit-state').textContent='Utkast sparat';notice('Utkastet är sparat. Webbplatsen är oförändrad.');syncButtons();}
function publishedConfirmation(team){
  dismissNotice();
  const heading=el('h2','','Publicerat!');heading.id='publish-confirmation-title';
  const link=el('a','button primary','Visa lagsidan ↗');
  const url=new URL('/lagsida/','https://www.h43lund.se');url.searchParams.set('team',teamSlugs[team.id]||team.id);
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
  const close=el('button','','Stäng');close.type='button';close.setAttribute('aria-label','Stäng publiceringsbekräftelsen');close.addEventListener('click',()=>{panel.remove();document.getElementById('publish')?.focus({preventScroll:true});});
  const panel=el('section','card publish-confirmation',heading,el('p','publish-team',`${teamLabel(team)} har uppdaterats.`),el('p','','Öppna lagsidan för att se det publicerade innehållet. Har du den redan öppen kan du behöva ladda om den.'),el('div','actions',link,close));
  panel.id='publish-confirmation';panel.tabIndex=-1;panel.setAttribute('role','status');panel.setAttribute('aria-labelledby',heading.id);
  main.querySelector('.editor-navigation').after(panel);panel.focus({preventScroll:true});panel.scrollIntoView({block:'start'});
}
async function publish(){if(dirty)throw new Error('Spara utkastet först.');document.getElementById('publish-confirmation')?.remove();const team=view.team;await request(`/teams/${selected}/publish`,'POST',{expectedVersion:view.draft.version,expectedPublishedId:view.published?.id||null});await openTeam(selected,true);publishedConfirmation(team);}
async function preview(){await save();const area=document.getElementById('preview-box');area.hidden=false;const shortcut=document.querySelector('[href="#preview-box"]');if(shortcut)shortcut.hidden=false;previewFrame=el('iframe','preview');previewFrame.title='Privat förhandsvisning av lagets utkast';previewFrame.src=`/teams/${selected}/preview`;area.replaceChildren(el('h2','','Privat förhandsvisning'),el('p','muted','Visar sparat utkast med aktuell SportAdmin-data. Detta publicerar ingenting.'),previewFrame);area.focus({preventScroll:true});area.scrollIntoView({block:'start'});}
async function readonly(){const area=document.getElementById('readonly');try{const data=await request(`/preview/teams/${selected}`);if(!area.isConnected)return;
  area.textContent=`Spelare: ${data.roster.players.length}\nLedare: ${data.roster.coaches.map(p=>p.displayName).join(', ')||'Ingen tillgänglig information'}\nKommande matcher: ${data.upcomingMatches.length}\nKommande aktiviteter: ${data.upcomingEvents.length}\nÄndra medlemskap och aktiviteter i SportAdmin.`;
}catch{if(area.isConnected)area.textContent='SportAdmin-data kan inte förhandsvisas just nu. Redaktionell text kan fortfarande sparas.';}}
function rosterEditor(){
  rosterRows=[];const box=el('details','card',el('summary','','Truppdetaljer'),el('p','muted','Namn och medlemskap hämtas från SportAdmin. Här kan du lägga till valfritt tröjnummer, position eller ledaruppgift. Spara, förhandsvisa och publicera som vanligt.'));
  if(view.roster?.lastSyncedAt)box.append(el('p','muted','Truppen synkroniserad: '+new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(view.roster.lastSyncedAt))));
  for(const [kind,title]of [['players','Spelare'],['coaches','Ledare']]){
    const list=el('div','roster-editor-list');box.append(el('h3','',title),list);
    const members=view.roster?.[kind]||[];if(!members.length)list.append(el('p','muted','Ingen synkroniserad trupp tillgänglig.'));
    for(const person of members){const item=el('fieldset','roster-editor-row',el('legend','',person.displayName));list.append(item);
      if(!person.memberKey){item.append(el('p','muted','Redigering blir tillgänglig efter nästa truppsynkronisering med verifierad medlemsidentitet.'));continue;}
      const stored=(view.draft.content.rosterDetails||[]).find(d=>d.memberKey===person.memberKey),row={memberKey:person.memberKey,imageId:stored?.imageId??null};
      for(const [key,label,max]of kind==='players'?[['shirtNumber','Tröjnummer',3],['position','Position',60]]:[['responsibility','Uppgift',60]]){
        const input=el('input');input.type='text';input.maxLength=max;input.value=stored?.[key]||'';input.setAttribute('aria-label',`${label} för ${person.displayName}`);if(key==='shirtNumber'){input.inputMode='numeric';input.pattern='[0-9]{1,3}';}input.addEventListener('input',changed);row[key]=input;item.append(el('label','field',label+' (valfritt)',input));
      }
      if(kind==='players'){
        const photo=el('div','player-upload-preview');
        const drawPhoto=()=>{photo.replaceChildren();if(row.imageId){const img=el('img','image-preview');img.src=`${api}/teams/${selected}/images/${row.imageId}`;img.alt=`Foto på ${person.displayName}`;photo.append(img);}};drawPhoto();
        const picker=el('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.setAttribute('aria-label',`Spelarbild för ${person.displayName}`);picker.disabled=!view.features?.imageUploads;
        picker.addEventListener('change',()=>run(async()=>{const file=picker.files[0];if(!file)return;try{notice('Förbereder och laddar upp spelarbilden…');const blob=await convert(file),uploaded=await request(`/teams/${selected}/images`,'POST',blob);row.imageId=uploaded.id;drawPhoto();changed();notice('Spelarbilden är privat uppladdad. Spara och publicera för att visa den på lagsidan.');}finally{picker.value='';}}));
        if(view.features?.imageUploads)item.append(el('label','field','Spelarbild (valfritt)',picker));
        item.append(photo,button('Ta bort spelarbild',()=>{row.imageId=null;drawPhoto();changed();}),el('small','muted','JPEG, PNG eller WebP, högst 10 MB. Publicera bara bilder som får visas på lagsidan. Bildbeskrivning skapas från spelarens namn.'));
      }
      if(kind==='coaches')item.append(el('small','muted','Till exempel Tränare, Lagledare eller Lagadministratör. Detta ändrar ingen inloggningsbehörighet.'));
      rosterRows.push(row);
    }
  }
  return box;
}
async function openTeam(id,force=false){
  if(dirty&&!force&&!confirm('Du har osparade ändringar. Vill du lämna dem?'))return;
  const result=await request(`/teams/${id}/content`);selected=id;view=result;dirty=false;for(const key of Object.keys(fields))delete fields[key];
  document.querySelectorAll('#teams button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.team===id)));
  form=el('form');form.addEventListener('submit',e=>e.preventDefault());
  const welcome=el('section','card',el('h2','','Välkomsttext'),field('welcomeTitle','Välkomstrubrik',{max:120,help:'Rubrik i fliken Översikt. Spara och publicera för att visa på lagsidan.'}),field('welcomeDescription','Introduktion',{multiline:true,max:5000,help:'Visas under Översikt. Formatering stöds; HTML stöds inte.'}),field('seasonMessage','Säsongsmeddelande (valfritt)',{multiline:true,max:600}));
  const picker=el('input');picker.type='file';picker.name='upload';picker.accept='image/jpeg,image/png,image/webp';picker.disabled=!view.features?.imageUploads;fields.upload=picker;picker.addEventListener('change',()=>run(upload));
  const image=el('section','card',el('h2','','Lagbild'),el('p','muted','JPEG, PNG eller WebP, högst 10 MB. Bilden förminskas i webbläsaren och kontrolleras igen på servern.'),picker,el('div','',null),field('heroAlt','Bildbeskrivning (valfritt)',{max:160,help:'Beskriv gärna bilden kort. Om fältet lämnas tomt används en automatisk beskrivning för laget.'}),
    button('Ta bort bilden ur utkastet',()=>{view.draft.content.heroImageId=null;fields.heroAlt.value='';changed();imagePreview(null);}));image.querySelector('div').id='image-box';
  if(!view.features?.imageUploads){image.replaceChildren(el('h2','','Lagbild'),el('p','muted','Bilduppladdning är inte aktiverad i denna version. Använd sociala medier för nya lagbilder.'));}
  const social=el('section','card',el('h2','','Sociala medier'),el('div','grid',field('instagramUrl','Instagram-profil',{max:2048,type:'url'}),field('instagramLabel','Instagram-länktext (valfritt)',{max:40})),el('div','grid',field('tiktokUrl','TikTok-profil',{max:2048,type:'url'}),field('tiktokLabel','TikTok-länktext (valfritt)',{max:40})));
  const contact=contactEditor(),rosterDetails=rosterEditor();
  const source=el('section','card',el('h2','','SportAdmin · endast läsning'),el('p','readonly','Hämtar…'));source.querySelector('p').id='readonly';
  const publishButton=button('Publicera',publish,'gold');publishButton.id='publish';const editState=el('p','muted','Utkast laddat');editState.id='edit-state';
  const toolbar=el('div','actions toolbar',button('Spara utkast',save,'primary'),button('Spara & förhandsvisa',preview),publishButton,button('Ladda om laget',()=>openTeam(id)),editState);
  const history=el('ul','history');for(const revision of view.history){const row=el('li','',el('div','',new Intl.DateTimeFormat('sv-SE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(revision.published_at)),el('small','',revision.published_by)),button('Återpublicera',async()=>{
    if(dirty)throw new Error('Spara eller ladda om ditt utkast innan återställning.');if(!confirm('Vill du publicera den här tidigare versionen?'))return;
    await request(`/teams/${selected}/rollback`,'POST',{expectedVersion:view.draft.version,expectedPublishedId:view.published?.id||null,revisionId:revision.id});await openTeam(selected,true);notice('Tidigare innehåll har publicerats som en ny version.');}));row.querySelector('button').dataset.requiresPublish='true';history.append(row);}
  const previewBox=el('section','card');previewBox.id='preview-box';previewBox.hidden=true;previewBox.tabIndex=-1;
  const historySection=el('details','card',el('summary','','Publiceringshistorik'),view.history.length?history:el('p','muted','Inga publiceringar ännu.'));
  const sections=[[welcome,'editor-welcome','Välkomsttext'],[image,'editor-image','Lagbild'],[social,'editor-social','Sociala medier'],[contact,'editor-contact','Kontakt'],[rosterDetails,'editor-roster','Truppdetaljer'],[source,'editor-source','SportAdmin'],[historySection,'editor-history','Publiceringshistorik'],[previewBox,'preview-box','Förhandsvisning']];
  const shortcuts=el('nav','section-nav');shortcuts.setAttribute('aria-label','Gå till avsnitt');
  function shortcut(id,label,hidden=false){const a=el('a','',label);a.href=`#${id}`;a.hidden=hidden;a.addEventListener('click',event=>{const target=document.getElementById(id);if(!target||target.hidden)return;event.preventDefault();if(target.tagName==='DETAILS')target.open=true;target.focus({preventScroll:true});target.scrollIntoView({block:'start'});});shortcuts.append(a);}
  for(const [node,id,label]of sections){node.id=id;node.tabIndex=-1;shortcut(id,label,node.hidden);}
  if(me.role==='admin')shortcut('editor-admin','Administration');
  form.append(welcome,image,social,contact,rosterDetails,source,historySection,previewBox,toolbar);
  const context=el('div','team-context',el('span','','Du redigerar lagsidan'),el('strong','',teamLabel(view.team)));context.setAttribute('role','region');context.setAttribute('aria-label','Aktuellt lag');
  const navigation=el('div','editor-navigation',context,shortcuts);
  main.replaceChildren(navigation,el('p','eyebrow','LAGETS INNEHÅLL'),el('h1','',teamLabel(view.team)),el('p','muted',view.published?'Publicerat innehåll finns. Utkast visas bara i portalen.':'Inget portalinnehåll har publicerats ännu.'),form);
  navigationObserver?.disconnect();navigationObserver=new ResizeObserver(()=>main.style.setProperty('--editor-navigation-height',`${navigation.getBoundingClientRect().height}px`));navigationObserver.observe(navigation);
  imagePreview(view.draft.content.heroImageId);syncButtons();void readonly();if(me.role==='admin')await permissions();
}
async function permissions(){
  const data=await request('/users'),label=teamLabel(view.team);
  const section=el('details','card administration',el('summary','',`Administration · ${label}`));
  section.id='editor-admin';section.tabIndex=-1;
  async function manage(path,method,body,message){
    if(dirty)throw new Error('Spara lagets utkast innan du ändrar behörigheter.');
    const globalOpen=!!document.querySelector('.global-users')?.open,inactiveOpen=!!document.querySelector('.inactive-users')?.open;
    await request(path,method,body);await openTeam(selected,true);
    document.querySelector('.global-users').open=globalOpen;document.querySelector('.inactive-users').open=inactiveOpen;
    const area=document.getElementById('editor-admin');area.open=true;area.scrollIntoView({block:'start'});notice(message);
  }
  const assigned=data.assignments.filter(a=>a.team_id===selected&&data.users.some(u=>u.email===a.email&&u.enabled));
  const teamSection=el('section','permission-team',el('p','eyebrow','ENDAST DET VALDA LAGET'),el('h2','',`Tränare för ${label}`));
  for(const row of assigned){const item=el('div','assignment-row',el('div','',el('strong','',row.email),el('p','muted',row.can_publish?'Kan redigera och publicera':'Kan redigera utkast')),
    button('Ta bort från laget',()=>{if(!confirm(`Ta bort ${row.email} från ${label}? Åtkomst till andra lag påverkas inte.`))return;return manage(`/teams/${selected}/assignments`,'PUT',{email:row.email,enabled:false,canPublish:false,expectedVersion:row.version},`Tränaren är borttagen från ${label}.`);}));teamSection.append(item);}
  if(!assigned.length)teamSection.append(el('p','muted','Inga tränare är tilldelade detta lag. Administratörer kan hantera alla lag.'));
  const target=el('select');target.setAttribute('aria-label','Tränare att tilldela laget');
  for(const user of data.users.filter(u=>u.role==='coach'&&u.enabled)){const option=el('option','',user.email);option.value=user.email;target.append(option);}
  const publish=checkbox('Får publicera',true,()=>{}),enabled=checkbox('Tilldelad laget',true,()=>{});
  const refreshAssignment=()=>{const row=data.assignments.find(a=>a.email===target.value&&a.team_id===selected);publish.input.checked=row?.can_publish===1;enabled.input.checked=!!row;};target.addEventListener('change',refreshAssignment);refreshAssignment();
  teamSection.append(el('h3','',`Tilldela eller ändra tränare för ${label}`),target,publish.node,enabled.node,button('Spara lagtilldelning',()=>{if(!target.value)throw new Error('Lägg till en aktiv tränare under Alla portalanvändare först.');const row=data.assignments.find(a=>a.email===target.value&&a.team_id===selected);return manage(`/teams/${selected}/assignments`,'PUT',{email:target.value,canPublish:publish.input.checked,enabled:enabled.input.checked,expectedVersion:row?.version||0},'Lagtilldelningen är sparad.');}));
  const displayName=el('input');displayName.value=view.team.name;displayName.maxLength=150;displayName.setAttribute('aria-label','Lagets visningsnamn');
  const settings=el('details','permission-settings',el('summary','',`Laginställningar · ${label}`),el('label','field','Lagets visningsnamn',displayName),button('Spara laginställningar',()=>manage(`/teams/${selected}/settings`,'PUT',{name:displayName.value,photoPublicationAllowed:view.team.photoPublicationAllowed,expectedVersion:view.team.configVersion},'Lagets inställningar är sparade.')));
  const global=el('details','global-users',el('summary','','Alla portalanvändare · gäller samtliga lag'),el('p','muted','Här hanteras konton för hela portalen. Lagbehörigheter visas på varje konto. Nya mejladresser måste också tillåtas i Cloudflare Access.'));
  const createEmail=el('input');createEmail.type='email';createEmail.placeholder='namn@example.se';createEmail.setAttribute('aria-label','Ny användares e-post');
  global.append(el('div','actions',createEmail,button('Lägg till tränare',()=>manage('/users','PUT',{email:createEmail.value,role:'coach',enabled:true,expectedVersion:0},'Användaren är sparad. Tilldela ett lag och kontrollera Cloudflare Access.'))));
  const inactive=el('details','inactive-users',el('summary','',`Borttagna eller inaktiva användare (${data.users.filter(u=>!u.enabled).length})`));
  for(const user of data.users){
    const row=el('article','user-card');row.setAttribute('aria-label',user.email);
    const teams=data.assignments.filter(a=>a.email===user.email).map(a=>teamLabel({id:a.team_id,name:a.team_id}));
    row.append(el('strong','user-email',user.email),el('p','muted',user.role==='admin'?'Administratör · alla lag':teams.length?`Lag: ${teams.join(', ')}`:'Inga lag tilldelade'));
    if(!user.enabled){row.append(el('span','account-status','Inaktiv · ingen portalåtkomst'),button('Återaktivera användare',()=>manage('/users','PUT',{email:user.email,role:user.role,enabled:true,expectedVersion:user.version},'Användaren är återaktiverad. Kontrollera lagtilldelningarna.')));inactive.append(row);continue;}
    const role=el('select');role.setAttribute('aria-label',`Roll för ${user.email}`);for(const value of ['coach','admin']){const option=el('option','',value==='admin'?'Administratör':'Tränare');option.value=value;role.append(option);}role.value=user.role;
    const actions=el('div','actions',role,button('Spara behörighet',()=>manage('/users','PUT',{email:user.email,role:role.value,enabled:true,expectedVersion:user.version},'Behörigheten är uppdaterad.')));
    if(user.email!==me.email)actions.append(button('Ta bort användare',()=>{if(!confirm(`Ta bort ${user.email} från hela portalen? Alla lagtilldelningar tas bort och inloggning spärras. Kontot kan återaktiveras; historiken sparas.`))return;return manage('/users/remove','POST',{email:user.email,expectedVersion:user.version},'Användaren är borttagen från portalen och alla lagtilldelningar.');},'danger'));
    row.append(actions);global.append(row);
  }
  global.append(inactive);section.append(teamSection,settings,global);main.append(section);
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function start(){const identity=await request('/me');me=identity.user;csrfToken=identity.csrfToken;
  const logout=el('a','','Logga ut');logout.href='/cdn-cgi/access/logout';document.getElementById('identity').replaceChildren(el('span','',me.email),logout);
  const result=await request('/teams');const menu=document.getElementById('teams');for(const team of result.teams){const item=button(teamLabel(team),()=>openTeam(team.id));item.dataset.team=team.id;menu.append(item);}
  if(result.teams.length)await openTeam(result.teams[0].id);else main.replaceChildren(el('section','card',el('h1','','Inga lag tilldelade'),el('p','','Kontakta administratören för att få lagbehörighet.')));
}
run(start);
