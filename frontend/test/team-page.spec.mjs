import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../worker/package.json',import.meta.url));
const {test,expect}=require('@playwright/test');
const birthYearLabels=JSON.parse(await readFile(new URL('../../config/team-labels.json',import.meta.url),'utf8'));
const api='https://h43-youth-api-staging.elvir-arslanovic.workers.dev/api/v1/teams/';
const fixture=(id='p11')=>{const data={apiVersion:'1',id,name:`H43 Lund ${id.toUpperCase()}`,season:null,welcome:{title:null,description:null,heroImageUrl:null},
  roster:{players:[{displayName:'Testspelare Å Ä Ö'},{displayName:'Testspelare Två'}],coaches:[{displayName:'Testledare Öberg'}],lastSyncedAt:'2026-11-11T12:00:00Z'},
  nextMatch:{id:'m1',startsAt:'2026-11-15T12:30:00Z',opponent:'Testmotståndare',homeAway:'away',location:'Testhall',competition:'Testserie',status:'scheduled'},
  upcomingEvents:Array.from({length:9},(_,i)=>({id:`e${i}`,type:i%2?'training':'match',title:`Testaktivitet ${i+1}`,startsAt:'2026-11-15T12:30:00Z',endsAt:'2026-11-15T13:30:00Z',location:'Testhall',status:'unknown'})),
  social:{instagram:null,tiktok:null},contact:{email:null},dataStatus:{roster:'available',calendar:'available',matches:'available'}};
  data.upcomingMatches=[data.nextMatch,{...data.nextMatch,id:'m2',startsAt:'2026-11-22T12:30:00Z',opponent:'Andra testmotståndaren'}];return data;};
async function mock(page,data=fixture()){
  await page.route(api+'**',route=>route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}}));
}
async function open(page){await page.goto('/preview/p11/');await expect(page.getByRole('heading',{level:1})).toBeVisible();}
async function tab(page,name){await page.getByRole('tab',{name,exact:true}).click();}

test('coach footer links to the selected team and provides an access-request email on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const [id,slug] of [['p11','p2015'],['f12','f2014'],['f14','f2012-2013']]){
    await mock(page,fixture(id));await page.goto('/preview/shared/?team='+slug);
    const edit=page.getByRole('link',{name:'Ledare – redigera lagsidan',exact:true});await expect(edit).toHaveAttribute('href','https://h43-youth-admin-staging.elvir-arslanovic.workers.dev/?team='+slug);
    const contact=page.getByRole('link',{name:'Kontakta Elvir',exact:true});await expect(contact).toHaveAttribute('href',/^mailto:elvir\.arslanovic@gmail\.com\?subject=/);
    await expect(page.getByText('Saknar du behörighet?',{exact:false})).toBeVisible();expect(await page.locator('.h43-ui').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  }
});
test('named contact cards keep each persons email and phone grouped safely',async({page},testInfo)=>{
  const data=fixture();data.contact={email:'first@example.test',phone:null,people:[{name:'Anna Exempel',email:'first@example.test',phone:'070-123 45 67'},{name:'<img src=x onerror=alert(1)>',email:'second@example.test',phone:null}]};await mock(page,data);await open(page);await tab(page,'Kontakt');
  const cards=page.locator('.h43-contact-card');await expect(cards).toHaveCount(2);await expect(cards.nth(0).getByRole('heading',{name:'Anna Exempel',exact:true})).toBeVisible();await expect(cards.nth(0).getByRole('link',{name:'070-123 45 67',exact:true})).toHaveAttribute('href','tel:0701234567');await expect(cards.nth(1)).toContainText('<img');await expect(cards.nth(1).locator('img')).toHaveCount(0);await expect(page.getByRole('tabpanel',{name:'Kontakt',exact:true}).locator('a[href^="mailto:"]')).toHaveCount(2);
  await page.screenshot({path:testInfo.outputPath('named-contacts-desktop.png'),fullPage:true});await page.setViewportSize({width:320,height:844});await page.screenshot({path:testInfo.outputPath('named-contacts-mobile.png'),fullPage:true});expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
});
test('squad groups players and coaches while contact has one email and telephone action',async({page})=>{
  const data=fixture();data.contact={email:'lag@example.test',phone:'+46 70 123 45 67',text:'Kontakta oss om träningen.'};await mock(page,data);await open(page);
  await tab(page,'Truppen');const squad=page.getByRole('tabpanel',{name:'Truppen',exact:true});await expect(squad.getByRole('heading',{name:'Spelare',exact:true})).toBeVisible();await expect(squad.getByRole('heading',{name:'Ledare',exact:true})).toBeVisible();await expect(squad.locator('.h43-coaches')).toContainText('Testledare Öberg');
  await tab(page,'Kontakt');const contact=page.getByRole('tabpanel',{name:'Kontakt',exact:true});await expect(contact.locator('.h43-coaches')).toHaveCount(0);await expect(contact.getByText('Testledare Öberg')).toHaveCount(0);await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(1);await expect(contact.getByRole('link',{name:'+46 70 123 45 67',exact:true})).toHaveAttribute('href','tel:+46701234567');
});
test('contact works with phone only and rejects executable telephone values',async({page})=>{
  const data=fixture();data.contact={email:null,phone:'070-123 45 67'};await mock(page,data);await open(page);await tab(page,'Kontakt');await expect(page.getByRole('link',{name:'070-123 45 67',exact:true})).toHaveAttribute('href','tel:0701234567');await expect(page.getByRole('link',{name:'Kontakta H43 Lund ↗'})).toHaveCount(0);
  data.contact.phone='javascript:alert(1)';await mock(page,data);await page.reload();await expect(page.getByRole('tab',{name:'Kontakt',exact:true})).toBeVisible();await tab(page,'Kontakt');await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);await expect(page.getByRole('link',{name:'Kontakta H43 Lund ↗'})).toBeVisible();
});
for(const width of [320,390,1440])test(`team photo is uncropped below welcome heading at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1100});const data=fixture();data.welcome={title:'Vårt lag',description:'Välkommen till handbollen.',heroImageUrl:'https://example.test/team-photo.svg',heroAlt:'Hela testlaget'};data.social.instagram='https://www.instagram.com/h43lund/';
  await page.route('https://example.test/team-photo.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#075da7"/><rect width="1600" height="80" fill="#efc460"/><rect y="820" width="1600" height="80" fill="#efc460"/></svg>'}));
  await mock(page,data);await open(page);const photo=page.getByRole('img',{name:'Hela testlaget',exact:true});await expect(photo).toBeVisible();await expect(photo).toHaveCSS('object-fit','contain');await expect(photo).toHaveCSS('opacity','1');await expect(page.locator('.h43-hero img')).toHaveCount(0);
  expect(await photo.evaluate(img=>img.complete&&img.naturalWidth===1600&&img.naturalHeight===900)).toBe(true);
  const heading=await page.getByRole('heading',{name:'Vårt lag',exact:true}).boundingBox(),image=await photo.boundingBox(),social=await page.locator('.h43-follow').boundingBox();expect(heading.y+heading.height).toBeLessThan(image.y);expect(image.y+image.height).toBeLessThan(social.y);expect(image.height).toBeLessThanOrEqual(520);
  expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await tab(page,'Matcher');await expect(photo).toBeHidden();
});
for(const width of [390,1440])test(`social cards lead overview and contact has one email link at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const data=fixture();data.welcome.description='Lång introduktion. '.repeat(150);data.contact.email='team@example.test';data.social={instagram:'https://www.instagram.com/h43lund/',tiktok:'https://www.tiktok.com/@h43lund'};
  await mock(page,data);await open(page);const overview=page.getByRole('tabpanel',{name:'Översikt',exact:true});
  await expect(overview.getByRole('heading',{name:'Följ laget',exact:true})).toBeVisible();const instagram=overview.getByRole('link',{name:'Instagram ↗',exact:true});await expect(instagram).toBeVisible();await expect(instagram).toHaveAttribute('target','_blank');await expect(instagram).toHaveAttribute('rel','noopener noreferrer');
  const card=await overview.locator('.h43-follow').boundingBox(),intro=await overview.locator('.h43-description').boundingBox();expect(card.y+card.height).toBeLessThanOrEqual(intro.y);expect(card.y+card.height).toBeLessThan(1000);
  expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath('overview-social.png'),fullPage:false});
  await tab(page,'Kontakt');const contact=page.getByRole('tabpanel',{name:'Kontakt',exact:true});await expect(contact.locator('a[href^="mailto:"]')).toHaveCount(1);await expect(contact.getByRole('link',{name:data.contact.email,exact:true})).toHaveAttribute('href','mailto:team@example.test');await expect(contact.locator('.h43-social')).toHaveCount(0);
});

test('editorial heading, season message and contacts render with safe formatting',async({page})=>{
  const data=fixture();data.welcome.title='Välkommen till vårt lag';data.welcome.description='**Gemenskap** och *handboll*\n\n- Träna\n- Ha roligt\n\n[Läs mer](https://www.h43lund.se/)';
  data.welcome.seasonMessage='## Träningstider\nTisdagar och fredagar';data.contact={email:'p11@example.test',text:'**Frågor?**\nKontakta oss. [Fel](javascript:alert(1)) <img src=x onerror=alert(1)>'};
  await mock(page,data);await open(page);
  await expect(page.getByRole('heading',{level:2,name:data.welcome.title})).toBeVisible();await expect(page.locator('.h43-description strong')).toHaveText('Gemenskap');await expect(page.locator('.h43-description em')).toHaveText('handboll');await expect(page.locator('.h43-description li')).toHaveCount(2);
  await expect(page.getByRole('heading',{name:'Träningstider',exact:true})).toBeVisible();await expect(page.getByText('Tisdagar och fredagar',{exact:true})).toBeVisible();
  await tab(page,'Kontakt');await expect(page.getByRole('link',{name:'p11@example.test',exact:true})).toHaveAttribute('href','mailto:p11@example.test');await expect(page.locator('.h43-editorial-note strong')).toHaveText('Frågor?');
  await expect(page.locator('.h43-editorial-note img')).toHaveCount(0);await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);await expect(page.getByRole('tabpanel',{name:'Kontakt',exact:true}).locator('.h43-editorial-note')).toContainText('<img');
});
test('renders separate names, null editorial fields and eight events',async({page})=>{
  await mock(page);await open(page);
  await expect(page.locator('.h43-names')).toContainText('Testspelare Å Ä Ö');
  await expect(page.locator('.h43-names')).not.toContainText('Testledare');
  await expect(page.locator('.h43-coaches')).toContainText('Testledare Öberg');
  await expect(page.locator('.h43-event')).toHaveCount(8);
  await expect(page.locator('.h43-team-image')).toHaveCount(0);
  await expect(page.locator('.h43-social')).toHaveCount(0);
  await tab(page,'Kontakt');
  await expect(page.getByRole('link',{name:'Kontakta H43 Lund ↗'})).toHaveAttribute('href','https://www.h43lund.se/kontakt/');
  await expect(page.locator('.h43-ui img')).toHaveCount(0);
  await expect(page.locator('.h43-season')).toHaveCount(0);
  await tab(page,'Kalender');await expect(page.locator('.h43-events')).toBeVisible();
  await expect(page.getByText('Status ej bekräftad',{exact:true})).toHaveCount(0);
});
test('Stockholm winter and summer time independent of browser timezone',async({page})=>{
  const data=fixture();data.upcomingEvents[0].startsAt='2026-07-15T12:30:00Z';
  await mock(page,data);await open(page);
  await expect(page.locator('.h43-match time').first()).toContainText('13:30');
  await expect(page.locator('.h43-event time').first()).toContainText('14:30');
});
test('empty and unavailable sections have distinct states',async({page})=>{
  const data=fixture();data.nextMatch=null;data.upcomingMatches=[];data.upcomingEvents=[];data.roster.players=[];data.roster.coaches=[];data.dataStatus={roster:'empty',calendar:'empty',matches:'empty'};
  await mock(page,data);await open(page);
  await expect(page.locator('.h43-match')).toContainText('Ingen kommande match');
  await tab(page,'Kalender');
  await expect(page.getByText('Inga kommande aktiviteter att visa just nu.')).toBeVisible();
  await tab(page,'Truppen');
  await expect(page.getByText('Inga spelare att visa just nu.')).toBeVisible();
  data.dataStatus={roster:'unavailable',calendar:'unavailable',matches:'unavailable'};await page.reload();
  await tab(page,'Kalender');
  await expect(page.getByText('Kalendern kan inte hämtas just nu.')).toBeVisible();
});
test('scraped and editorial HTML stays text; invalid links and images rejected',async({page})=>{
  const data=fixture();const attack='<img src=x onerror="window.h43Xss=true">';
  data.roster.players[0].displayName=attack;data.welcome.title=attack;data.welcome.description='<script>window.h43Xss=true</script>';
  data.social={instagram:'javascript:alert(1)',tiktok:'https://tiktok.com.evil.test/@x'};data.welcome.heroImageUrl='javascript:alert(1)';data.contact.email='a@b.se?body=evil';
  data.internalSecret='DO-NOT-RENDER';await mock(page,data);await open(page);
  await expect(page.locator('.h43-names')).toContainText(attack);
  await expect(page.locator('.h43-ui script,.h43-team-image,.h43-social')).toHaveCount(0);
  expect(await page.evaluate(()=>window.h43Xss)).toBeUndefined();
  await expect(page.locator('.h43-ui')).not.toContainText('DO-NOT-RENDER');
});
test('valid configured content, social links and contact render without embed scripts',async({page})=>{
  const data=fixture();data.welcome={title:'Välkommen till vårt testlag',description:'Rad ett\nRad två',heroImageUrl:'https://example.test/missing.jpg'};
  data.season='2026/27';data.social={instagram:'https://www.instagram.com/h43lund/',tiktok:'https://www.tiktok.com/@h43lund'};data.contact.email='lag@example.se';
  await page.route('https://example.test/**',route=>route.abort());await mock(page,data);await open(page);
  await expect(page.getByText('Välkommen till vårt testlag')).toBeVisible();
  await expect(page.locator('.h43-team-image')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Instagram ↗'})).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.getByRole('link',{name:'TikTok ↗'})).toHaveAttribute('href',data.social.tiktok);
  await tab(page,'Kontakt');
  await expect(page.getByRole('link',{name:'lag@example.se',exact:true})).toHaveAttribute('href','mailto:lag@example.se');
  await expect(page.getByRole('tabpanel',{name:'Kontakt'}).locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
});
for(const kind of ['malformed','mismatched','oversized','http','network'])test(`fails safely for ${kind} responses and retries`,async({page})=>{
  await page.route(api+'**',route=>{
    if(kind==='network')return route.abort();
    if(kind==='http')return route.fulfill({status:503,body:'Unavailable',headers:{'Access-Control-Allow-Origin':'*'}});
    if(kind==='oversized')return route.fulfill({contentType:'application/json',body:' '.repeat(256*1024+1),headers:{'Access-Control-Allow-Origin':'*'}});
    const data=fixture();if(kind==='mismatched')data.id='other';else delete data.roster;
    return route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
  });await page.goto('/preview/p11/');await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.h43-names')).toHaveCount(0);
  await page.unroute(api+'**');await mock(page);await page.getByRole('button',{name:'Försök igen'}).click();await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
test('multiple teams and delayed insertion remain isolated and initialization is idempotent',async({page})=>{
  const requests=[];await page.route(api+'**',route=>{const id=route.request().url().split('/').pop();requests.push(id);return route.fulfill({json:fixture(id),headers:{'Access-Control-Allow-Origin':'*'}});});
  await open(page);await page.evaluate(()=>{const div=document.createElement('div');div.dataset.h43TeamPage='';div.dataset.teamId='f12';document.body.append(div);});
  await expect(page.getByRole('heading',{name:'H43 Lund F2014'})).toBeVisible();
  await page.addScriptTag({url:'/team-assets/v1.25.0/team-page.js'});
  expect(requests).toEqual(['p11','f12']);await expect(page.getByRole('heading',{level:1})).toHaveCount(2);
});
test('invalid team identifier never becomes an API request',async({page})=>{
  let invalidRequest=false;await mock(page);await open(page);
  page.on('request',request=>{if(request.url().includes('/teams/')&&!request.url().endsWith('/p11'))invalidRequest=true;});
  await page.evaluate(()=>{const div=document.createElement('div');div.dataset.h43TeamPage='';div.dataset.teamId='../admin';document.body.append(div);});
  await expect(page.getByRole('alert')).toBeVisible();expect(invalidRequest).toBe(false);
});
test('refresh picks up removals and a subsequent outage clears the view',async({page})=>{
  await page.clock.install();const data=fixture();let fail=false;
  await page.route(api+'**',route=>fail?route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'}}):route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}}));
  await open(page);await expect(page.locator('.h43-names li')).toHaveCount(2);
  await tab(page,'Truppen');
  data.roster.players.pop();await page.clock.fastForward(300001);await expect(page.locator('.h43-names li')).toHaveCount(1);
  await expect(page.getByRole('tab',{name:'Truppen',selected:true})).toBeFocused();await expect(page.locator('.h43-names')).toBeVisible();
  fail=true;await page.clock.fastForward(300001);await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.h43-names li')).toHaveCount(0);
});
test('Webnode-style global CSS does not affect widget or leak outward',async({page})=>{
  await mock(page);await open(page);
  const before=await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontSize);
  await page.addStyleTag({content:'h1,h2,p,a,li,img{font-size:75px!important;color:red!important;display:block!important}*{box-sizing:content-box}'});
  const after=await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontSize);expect(after).toBe(before);
  await page.evaluate(()=>{const p=document.createElement('p');p.id='outside';p.textContent='Outside';document.body.append(p);});
  await expect(page.locator('#outside')).toHaveCSS('color','rgb(255, 0, 0)');
  await tab(page,'Truppen');await expect(page.getByRole('heading',{name:'Truppen'})).toBeInViewport();
});
for(const width of [320,390,768,1440])test(`responsive layout at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await mock(page);await open(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.h43-ui').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await expect(page.getByRole('link',{name:'Anmäl dig ↗'})).toBeVisible();await expect(page.getByRole('link',{name:'Anmäl dig ↗'})).toHaveAttribute('href','https://entry.sportadmin.se/groupsOverview?uid=fjtzIS');
  await expect(page.locator('.h43-badge')).toHaveCount(0);
  expect(await page.locator('.h43-hero').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(width<=600?205:155);
  await expect(page.locator('.h43-hero')).toHaveCSS('background-color','rgb(7, 45, 80)');
  for(const name of ['Matcher','Kalender','Truppen','Kontakt','Översikt']){await tab(page,name);await expect(page.getByRole('tabpanel')).toHaveCount(1);}
});
test('tabs show one independent panel; matches and calendar do not mix',async({page})=>{
  await mock(page);await open(page);await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tabpanel')).toHaveCount(1);await expect(page.locator('.h43-match')).toBeHidden();
  await tab(page,'Matcher');await expect(page.locator('.h43-fixture')).toHaveCount(2);await expect(page.locator('.h43-opponent')).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toContainText('Testaktivitet');await expect(page.locator('.h43-events')).toBeHidden();
  await tab(page,'Kalender');await expect(page.locator('.h43-events')).toBeVisible();await expect(page.getByRole('tabpanel')).not.toContainText('Testmotståndare');
  await expect(page.locator('.h43-match')).toBeHidden();
  await tab(page,'Kontakt');await expect(page.getByRole('tab',{name:'Kontakt',selected:true})).toBeVisible();
  await expect(page.locator('.h43-coaches')).toBeHidden();await expect(page.locator('.h43-names')).toBeHidden();
});
test('tab keyboard navigation, ARIA relationships and team isolation',async({page})=>{
  await mock(page);await open(page);const first=page.getByRole('tab',{name:'Översikt'});await first.focus();
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Matcher',selected:true})).toBeFocused();
  await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Kontakt',selected:true})).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(first).toBeFocused();await page.keyboard.press('ArrowLeft');await expect(page.getByRole('tab',{name:'Kontakt',selected:true})).toBeFocused();
  await page.keyboard.press('Home');await expect(first).toBeFocused();
  const panel=page.getByRole('tabpanel');expect(await panel.getAttribute('aria-labelledby')).toBe(await first.getAttribute('id'));
  expect(await first.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'));
  await page.evaluate(()=>{const div=document.createElement('div');div.id='second';div.dataset.h43TeamPage='';div.dataset.teamId='p11';document.body.append(div);});
  await expect(page.locator('#second').getByRole('tab',{name:'Översikt',selected:true})).toBeVisible();
  await page.locator('#h43-team-page').getByRole('tab',{name:'Truppen'}).click();
  await expect(page.locator('#second').getByRole('tab',{name:'Översikt',selected:true})).toBeVisible();
});
test('real staging API integration and screenshot',async({page,request},testInfo)=>{
  test.skip(process.env.H43_REAL_API!=='1','Explicit network integration check');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|Refused to/i.test(message.text()))errors.push(message.text());});
  const response=await request.get(api+'p11');expect(response.status()).toBe(200);const data=await response.json();
  await open(page);await expect(page.locator('.h43-names li')).toHaveCount(data.roster.players.length);await expect(page.locator('.h43-coaches li')).toHaveCount(data.roster.coaches.length);
  if(data.nextMatch)await expect(page.locator('.h43-opponent')).toHaveText(data.nextMatch.opponent||'Motståndare meddelas');
  await expect(page.locator('.h43-event')).toHaveCount(Math.min(8,data.upcomingEvents.length));
  await tab(page,'Truppen');await expect(page.getByRole('tabpanel',{name:'Truppen',exact:true}).locator('.h43-coaches li')).toHaveCount(data.roster.coaches.length);
  await tab(page,'Kontakt');await expect(page.getByRole('tabpanel',{name:'Kontakt',exact:true}).locator('.h43-coaches')).toHaveCount(0);await expect(page.locator('a[href^="tel:"]')).toHaveCount(data.contact.people.filter(person=>person.phone).length);await tab(page,'Översikt');
  await expect(page.locator('.h43-hero img')).toHaveCount(0);
  if(data.welcome.heroImageUrl){await expect(page.locator('.h43-team-image')).toBeVisible();await expect(page.locator('.h43-team-image')).toHaveCSS('object-fit','contain');}
  if(data.social.instagram||data.social.tiktok)await expect(page.getByRole('heading',{name:'Följ laget',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('p11-social-overview.png'),fullPage:false});
  await tab(page,'Kontakt');await expect(page.getByRole('tabpanel',{name:'Kontakt'}).locator('a[href^="mailto:"]')).toHaveCount(data.contact.people.filter(person=>person.email).length);await tab(page,'Översikt');
  expect(errors).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('p11-desktop.png'),fullPage:true});
  await tab(page,'Matcher');await expect(page.locator('.h43-fixture')).toHaveCount(data.upcomingMatches?.length??(data.nextMatch?1:0));
  await page.screenshot({path:testInfo.outputPath('p11-matches.png'),fullPage:true});
  await page.getByRole('button',{name:'Spelade',exact:true}).click();await expect(page.locator('.h43-fixture')).toHaveCount(data.playedMatches.length);await expect(page.locator('.h43-next-fixture')).toHaveCount(0);await page.screenshot({path:testInfo.outputPath('p11-played-matches.png'),fullPage:true});
  await tab(page,'Kalender');await expect(page.locator('.h43-events')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('p11-calendar.png'),fullPage:true});
  await tab(page,'Översikt');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath('p11-mobile.png'),fullPage:true});
});
test('published Webnode shared host with new release substituted only in this browser',async({page},testInfo)=>{
  test.skip(process.env.H43_WEBNODE_CHECK!=='1','Explicit published-host check');
  await page.route('https://www.h43lund.se/lagsida/**',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/\/team-assets\/v\d+\.\d+\.\d+\//g,'/team-assets/v1.25.0/')});
  });
  await page.goto('https://www.h43lund.se/lagsida/?team=f2014');const root=page.locator('#h43-team-page');await expect(root.getByRole('heading',{level:1})).toHaveText('H43 Lund F2014');
  await expect(root.getByRole('tab',{name:'Översikt',selected:true})).toBeVisible();
  const cookies=page.getByRole('button',{name:'Acceptera endast nödvändiga',exact:true});if(await cookies.count())await cookies.click();
  for(const name of ['Matcher','Kalender','Truppen','Kontakt']){
    await root.getByRole('tab',{name,exact:true}).click();await expect(root.getByRole('tabpanel')).toHaveCount(1);
  }
  await page.setViewportSize({width:390,height:844});await root.getByRole('tab',{name:'Kalender'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('webnode-tabs-mobile.png'),fullPage:true});
  await root.getByRole('tab',{name:'Kontakt',exact:true}).click();await expect(root.getByRole('tab',{name:'Kontakt',selected:true})).toBeVisible();
});


test('shared page selects query team while fixed embeds cannot be overridden',async({page})=>{
  const requested=[];await page.route(api+'**',route=>{const id=route.request().url().split('/').pop();requested.push(id);return route.fulfill({json:fixture(id),headers:{'Access-Control-Allow-Origin':'*'}});});
  await page.goto('/preview/shared/?team=f12');await expect(page.getByRole('heading',{name:'H43 Lund F2014',exact:true})).toBeVisible();expect(requested).toEqual(['f12']);
  await page.goto('/preview/p11/?team=f12');await expect(page.getByRole('heading',{name:'H43 Lund P2015',exact:true})).toBeVisible();expect(requested).toEqual(['f12','p11']);
});
for(const query of ['', '?team=../admin','?team=%3Cscript%3E','?team=p11&team=f12','?team='])test(`shared page rejects ambiguous or invalid selection ${query}`,async({page})=>{
  let requests=0;await page.route(api+'**',route=>{requests++;return route.abort();});await page.goto('/preview/shared/'+query);await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('link',{name:'Till ungdomslagen ↗'})).toHaveAttribute('href','https://www.h43lund.se/ungdom/');expect(requests).toBe(0);
});
test('shared page unknown team has a clear directory fallback',async({page})=>{
  await page.route(api+'**',route=>route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':'*'}}));await page.goto('/preview/shared/?team=unknown');await expect(page.getByRole('heading',{name:'Laget hittades inte',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Till ungdomslagen ↗'})).toBeVisible();
});

test('youth directory links all eleven teams to the shared page and filters accessibly',async({page},info)=>{
  const html=await readFile(new URL('../youth-teams.html',import.meta.url),'utf8');
  await page.route('https://cdn.sportadmin.se/**',route=>route.abort());await page.setContent(html);
  const cards=page.locator('.h43y__card');await expect(cards).toHaveCount(11);await expect(page.locator('.h43y__summary-number').first()).toHaveText('11');
  const ids=['f2011','p2011-2012','f2012-2013','f2014','p2014','f2015','p2015','f2016','p2016','f2017','p2017'];
  for(const [index,id]of ids.entries()){await expect(cards.nth(index)).toHaveAttribute('href',`/lagsida/?team=${id}`);expect(await cards.nth(index).getAttribute('target')).toBeNull();}
  await page.getByRole('button',{name:'Flickor',exact:true}).click();await expect(page.locator('.h43y__card:visible')).toHaveCount(6);await expect(page.getByRole('button',{name:'Flickor',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Pojkar',exact:true}).click();await expect(page.locator('.h43y__card:visible')).toHaveCount(5);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Alla',exact:true}).click();await expect(page.locator('.h43y__card:visible')).toHaveCount(11);
});

test('real shared staging page loads every onboarded team with its own roster',async({page,request},info)=>{
  test.skip(process.env.H43_ALL_TEAMS!=='1','Explicit all-team staging check');test.setTimeout(180000);
  const teams=JSON.parse(await readFile(new URL('../../config/youth-teams.json',import.meta.url),'utf8'));
  const slugs=JSON.parse(await readFile(new URL('../../config/team-slugs.json',import.meta.url),'utf8'));
  for(const team of teams){
    const response=await request.get(api+team.id);expect(response.status()).toBe(200);const data=await response.json();expect(data.dataStatus.roster).toBe('available');
    await page.goto(`/preview/shared/?team=${slugs[team.id]}`);await expect(page.getByRole('heading',{level:1})).toHaveText(birthYearLabels[team.id]);await tab(page,'Truppen');await expect(page.locator('.h43-names li')).toHaveCount(data.roster.players.length);await expect(page.locator('.h43-coaches li')).toHaveCount(data.roster.coaches.length);
    await tab(page,'Matcher');expect(await page.locator('.h43-opponent,.h43-fixture-opponent').allTextContents()).toEqual(data.upcomingMatches.map(m=>m.opponent||'Motståndare meddelas'));expect(await page.locator('.h43-fixture .h43-tag').allTextContents()).toEqual(data.upcomingMatches.map(m=>m.homeAway==='home'?'Hemmamatch':m.homeAway==='away'?'Bortamatch':'Match'));
    if(team.id==='f12'){await page.screenshot({path:info.outputPath('shared-f12-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('shared-f12-mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1100});}
  }
});

for(const width of [390,1440])test(`match cards keep chronological dates, accessible times and responsive layout at ${width}px`,async({page},info)=>{
  const data=fixture();data.upcomingMatches[1].homeAway='home';data.upcomingMatches[1].opponent='Långt testmotståndarnamn med Å Ä Ö';data.upcomingMatches.push({...data.nextMatch,id:'m3',startsAt:'2026-11-29T12:30:00Z',opponent:null,location:null,homeAway:'unknown',competition:null});
  await page.setViewportSize({width,height:1000});await mock(page,data);await open(page);await tab(page,'Matcher');
  const cards=page.locator('.h43-fixture'),next=page.locator('.h43-next-fixture'),following=page.locator('.h43-following-fixtures .h43-fixture');await expect(cards).toHaveCount(3);await expect(next).toContainText('NÄSTA MATCH');await expect(next.locator('.h43-tag')).toHaveText('Bortamatch');await expect(following.first().locator('.h43-tag')).toHaveText('Hemmamatch');await expect(following.last()).toContainText('Motståndare meddelas');await expect(following.last()).toContainText('Spelplats meddelas');await expect(following.last().locator('.h43-tag')).toHaveText('Match');
  expect(await cards.locator('time').evaluateAll(nodes=>nodes.map(n=>n.dateTime))).toEqual(data.upcomingMatches.map(m=>m.startsAt));await expect(next.locator('time')).toHaveAttribute('aria-label','söndag 15 november · 13:30');await expect(next.locator('time')).toHaveText('13:30');
  await expect(next).toHaveCSS('background-color','rgb(7, 45, 80)');await expect(following.first()).toHaveCSS('background-color','rgb(255, 255, 255)');
  const boxes=await following.evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
  if(width>600){expect(boxes[0].y).toBe(boxes[1].y);expect(boxes[1].x).toBeGreaterThan(boxes[0].x);}else expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(await page.locator('.h43-ui').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath(`match-cards-${width}.png`),fullPage:true});
  data.upcomingMatches=[data.nextMatch];await page.reload();await tab(page,'Matcher');await expect(page.locator('.h43-fixture')).toHaveCount(1);await expect(page.getByRole('heading',{name:'Därefter',exact:true})).toHaveCount(0);
});


test('birth-year URLs resolve every cohort to its original team without changing the URL',async({page})=>{
  const slugs=JSON.parse(await readFile(new URL('../../config/team-slugs.json',import.meta.url),'utf8'));const requested=[];
  await page.route(api+'**',route=>{const id=route.request().url().split('/').pop();requested.push(id);return route.fulfill({json:fixture(id),headers:{'Access-Control-Allow-Origin':'*'}});});
  for(const [id,slug]of Object.entries(slugs)){
    await page.goto(`/preview/shared/?team=${slug}`);await expect(page.getByRole('heading',{level:1})).toHaveText(birthYearLabels[id]);await expect(page.locator('.h43-ui')).toHaveAttribute('aria-label',birthYearLabels[id]);expect(new URL(page.url()).searchParams.get('team')).toBe(slug);expect(requested.at(-1)).toBe(id);
  }
  await page.goto('/preview/p11/?team=f2014');await expect(page.getByRole('heading',{level:1})).toHaveText('H43 Lund P2015');expect(requested.at(-1)).toBe('p11');
});

for(const width of [320,390,600])test(`long roster names remain whole words on mobile at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const data=fixture();data.roster.players=[{displayName:'Testperson Långström Svensson'},{displayName:'Testperson Alexandersson'},{displayName:'Testperson Söderberg Lindholm'}];
  data.roster.coaches=[{displayName:'Testledare Alexandersson Österberg'}];
  await mock(page,data);await open(page);await page.addStyleTag({content:'html,body,#h43-team-page{hyphens:auto;word-break:break-all}'});await tab(page,'Truppen');
  const rows=page.locator('.h43-names li');await expect(rows).toHaveText(data.roster.players.map(p=>p.displayName));
  const boxes=await rows.evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();const text=node.querySelector('.h43-person-name').firstChild;const words=[...text.textContent.matchAll(/\S+/g)].map(word=>{const range=document.createRange();range.setStart(text,word.index);range.setEnd(text,word.index+word[0].length);return range.getClientRects().length;});return {left:rect.left,width:rect.width,words,overflow:node.scrollWidth>node.clientWidth,hyphens:getComputedStyle(node).hyphens};}));
  for(const box of boxes){expect(box.left).toBe(boxes[0].left);expect(box.width).toBe(boxes[0].width);expect(box.overflow).toBe(false);expect(box.hyphens).toBe('none');expect(box.words.every(lines=>lines===1)).toBe(true);}
  await expect(page.locator('.h43-coaches li')).toHaveCSS('hyphens','none');expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('mobile-roster.png'),fullPage:true});
});

for(const width of [390,1440])test(`upcoming and played match filters use separate cards at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});const data=fixture();data.playedMatches=[{...data.nextMatch,id:'played1',status:'played',startsAt:'2026-11-01T12:30:00Z',opponent:'Played opponent',score:'21–19'},{...data.nextMatch,id:'played2',status:'played',startsAt:'2026-10-25T12:30:00Z',opponent:'Older played opponent',score:null}];data.dataStatus.playedMatches='available';
  await mock(page,data);await open(page);await tab(page,'Matcher');const filter=page.getByRole('group',{name:'Matchfilter'});
  await expect(filter.getByRole('button',{name:'Kommande',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.h43-next-fixture')).toBeVisible();
  await filter.getByRole('button',{name:'Spelade',exact:true}).click();await expect(filter.getByRole('button',{name:'Spelade',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.h43-fixture')).toHaveCount(2);await expect(page.locator('.h43-next-fixture')).toHaveCount(0);await expect(page.locator('.h43-fixture').first()).toContainText('Played opponent');await expect(page.locator('.h43-score-row').nth(0)).toContainText('Played opponent21');await expect(page.locator('.h43-score-row').nth(1)).toContainText('H43 Lund19');await expect(page.getByText('Resultat saknas',{exact:true})).toBeVisible();await expect(page.getByText('Testmotståndare',{exact:true})).toHaveCount(0);
  await tab(page,'Kalender');await tab(page,'Matcher');await expect(filter.getByRole('button',{name:'Spelade',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('played-matches.png'),fullPage:true});
  await filter.getByRole('button',{name:'Kommande',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.h43-next-fixture')).toBeVisible();expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
});
test('played filter has honest empty, unavailable and legacy API fallback states',async({page})=>{
  const data=fixture();data.playedMatches=[];data.dataStatus.playedMatches='empty';await mock(page,data);await open(page);await tab(page,'Matcher');await page.getByRole('button',{name:'Spelade',exact:true}).click();await expect(page.getByText('Inga spelade matcher att visa just nu.',{exact:true})).toBeVisible();
  delete data.playedMatches;delete data.dataStatus.playedMatches;await mock(page,data);await page.reload();await tab(page,'Matcher');await page.getByRole('button',{name:'Spelade',exact:true}).click();await expect(page.getByText('Matchinformationen kan inte hämtas just nu.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Kommande',exact:true}).click();await expect(page.locator('.h43-next-fixture')).toBeVisible();
});
test('played match filter survives periodic refresh and preserves keyboard focus',async({page})=>{
  await page.clock.install();const data=fixture();data.playedMatches=[{...data.nextMatch,status:'played',score:null}];data.dataStatus.playedMatches='available';await mock(page,data);await open(page);await tab(page,'Matcher');await page.getByRole('button',{name:'Spelade',exact:true}).click();await page.clock.fastForward(300001);await expect(page.getByRole('button',{name:'Spelade',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Spelade',exact:true})).toBeFocused();await expect(page.locator('.h43-next-fixture')).toHaveCount(0);
});

test('played scoreboards assign home and away scores correctly and preserve unknown orientation',async({page})=>{
  const data=fixture();data.playedMatches=[{...data.nextMatch,status:'played',homeAway:'home',score:'0–0',opponent:'Home draw opponent'},{...data.nextMatch,status:'played',homeAway:'away',score:'26–23',opponent:'Away opponent'},{...data.nextMatch,status:'played',homeAway:'unknown',score:'21–19',opponent:'Unmapped opponent'}];data.dataStatus.playedMatches='available';
  await mock(page,data);await open(page);await tab(page,'Matcher');await page.getByRole('button',{name:'Spelade',exact:true}).click();const cards=page.locator('.h43-played-fixture');
  await expect(page.getByRole('heading',{level:1})).toHaveText('H43 Lund P2015');await expect(page.locator('.h43-score-club .h43-score-team > span')).toHaveText(['H43 Lund','H43 Lund']);
  await expect(cards.nth(0).locator('.h43-score-row').first()).toContainText('H43 Lund0');await expect(cards.nth(0).locator('.h43-score-row').last()).toContainText('Home draw opponent0');
  await expect(cards.nth(1).locator('.h43-score-row').first()).toContainText('Away opponent26');await expect(cards.nth(1).locator('.h43-score-row').last()).toContainText('H43 Lund23');
  await expect(cards.nth(2).locator('.h43-scoreboard')).toHaveCount(0);await expect(cards.nth(2)).toContainText('Resultatet visas i ordningen hemmalag–bortalag.');await expect(cards.nth(2).locator('.h43-score-unknown')).toHaveText('21–19');
});

test('optional roster details render as text and do not change names or membership',async({page})=>{
  const data=fixture();data.roster.players[0]={displayName:'Testspelare Å Ä Ö',shirtNumber:'01',position:'Målvakt'};data.roster.coaches[0]={displayName:'Testledare Öberg',responsibility:'Lagadministratör'};
  await mock(page,data);await open(page);await tab(page,'Truppen');await expect(page.locator('.h43-person-detail')).toHaveText(['#01 · Målvakt','Lagadministratör']);await expect(page.locator('.h43-names li')).toHaveCount(2);
});

for(const width of [320,390,1440])test(`optional player photo is accessible and safe at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});const data=fixture();data.roster.players[0].imageUrl='https://example.test/portrait.png';
  await page.route('https://example.test/portrait.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="72" height="144"><rect width="72" height="144" fill="#075da7"/><rect width="72" height="16" fill="#efc460"/><rect y="128" width="72" height="16" fill="#efc460"/></svg>'}));await mock(page,data);await open(page);await tab(page,'Truppen');
  await expect(page.getByRole('img',{name:'Foto på Testspelare Å Ä Ö',exact:true})).toBeVisible();await expect(page.locator('img.h43-player-photo')).toHaveCSS('object-fit','contain');await page.screenshot({path:info.outputPath('full-player-photo.png'),fullPage:true});await expect(page.locator('.h43-names li')).toHaveCount(2);expect(await page.locator('.h43-ui').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
});
test('failed portrait load falls back to the name and unsafe photo URLs are ignored',async({page})=>{
  const data=fixture();data.roster.players[0].imageUrl='https://example.test/missing.png';data.roster.players[1].imageUrl='javascript:alert(1)';await page.route('https://example.test/missing.png',route=>route.fulfill({status:404}));await mock(page,data);await open(page);await tab(page,'Truppen');await expect(page.locator('img.h43-player-photo')).toHaveCount(0);await expect(page.locator('.h43-player-photo-trigger')).toHaveCount(0);await expect(page.getByRole('img',{name:'Bild saknas',exact:true})).toHaveCount(2);await expect(page.locator('.h43-person-name').first()).toHaveText('Testspelare Å Ä Ö');
});

for(const width of [320,390,1440])test(`players without photos keep names and no-image icons at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:1000});await mock(page);await open(page);await tab(page,'Truppen');
  await expect(page.getByRole('img',{name:'Bild saknas',exact:true})).toHaveCount(2);await expect(page.locator('.h43-names .h43-person-name')).toHaveText(['Testspelare Å Ä Ö','Testspelare Två']);await expect(page.locator('.h43-coaches .h43-photo-placeholder')).toHaveCount(0);expect(await page.locator('.h43-ui').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('no-player-photo.png'),fullPage:true});
});

const portraitSvg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1440"><rect width="720" height="1440" fill="#075da7"/><rect width="720" height="160" fill="#efc460"/><rect y="1280" width="720" height="160" fill="#efc460"/></svg>';
for(const width of [320,390,1440])test(`player photo dialog enlarges the whole image and supports keyboard dismissal at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});const data=fixture();data.roster.players[0].imageUrl='https://example.test/enlarge.svg';
  await page.route('https://example.test/enlarge.svg',route=>route.fulfill({contentType:'image/svg+xml',body:portraitSvg}));await mock(page,data);await open(page);await tab(page,'Truppen');
  const trigger=page.getByRole('button',{name:'Visa större bild av Testspelare Å Ä Ö',exact:true});await trigger.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Spelarbild: Testspelare Å Ä Ö',exact:true}),close=dialog.getByRole('button',{name:'Stäng bild',exact:true});await expect(dialog).toBeVisible();await expect(close).toBeFocused();
  const image=dialog.getByRole('img',{name:'Foto på Testspelare Å Ä Ö',exact:true});await expect(image).toHaveCSS('object-fit','contain');await expect.poll(()=>image.evaluate(i=>i.complete&&i.naturalHeight===1440)).toBe(true);
  const r=await dialog.boundingBox(),photo=await image.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(900);expect(photo.height).toBeGreaterThan(72);
  await page.keyboard.press('Tab');await expect(trigger).not.toBeFocused();await page.keyboard.press('Shift+Tab');await expect(close).toBeFocused();
  await image.click();await expect(dialog).toBeVisible();await page.screenshot({path:info.outputPath('enlarged-player-photo.png')});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');await expect(dialog).toBeVisible();await close.click();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  await trigger.click();await expect(dialog).toBeVisible();await page.mouse.click(2,2);await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test('player photo dialog reports revoked images safely and refresh removes an open portrait',async({page})=>{
  await page.clock.install();const data=fixture();data.roster.players[0].imageUrl='https://example.test/revoked.svg';let images=0;
  await page.route('https://example.test/revoked.svg',route=>++images===1?route.fulfill({contentType:'image/svg+xml',body:portraitSvg}):route.fulfill({status:404}));await mock(page,data);await open(page);await tab(page,'Truppen');
  const trigger=page.getByRole('button',{name:'Visa större bild av Testspelare Å Ä Ö',exact:true});await expect.poll(()=>page.locator('img.h43-player-photo').evaluate(i=>i.complete&&i.naturalHeight>0)).toBe(true);await trigger.click();
  const dialog=page.getByRole('dialog');await page.route('https://example.test/revoked.svg?removed=1',route=>route.fulfill({status:404}));await dialog.locator('img').evaluate(i=>{i.src='https://example.test/revoked.svg?removed=1';});await expect(dialog.getByText('Bilden kan inte visas just nu.',{exact:true})).toBeVisible();await expect(dialog.getByRole('heading',{name:'Testspelare Å Ä Ö',exact:true})).toBeVisible();
  data.roster.players.splice(0,1);await page.clock.fastForward(300001);await expect(dialog).toHaveCount(0);await expect(page.locator('.h43-names li')).toHaveCount(1);await page.getByRole('tab',{name:'Kontakt',exact:true}).click();await expect(page.getByRole('tab',{name:'Kontakt',exact:true})).toHaveAttribute('aria-selected','true');
});
