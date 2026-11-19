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

for(const width of [320,390,1440])test(`retired roster is never displayed or fetched from legacy responses at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});const data=fixture();
  data.roster.players[0].imageUrl='https://example.test/private-player.jpg';let imageRequests=0;
  await page.route('https://example.test/private-player.jpg',route=>{imageRequests++;return route.abort();});
  await mock(page,data);await open(page);
  await expect(page.getByRole('tab')).toHaveText(['Översikt','Matcher','Kalender','Kontakt']);
  await expect(page.getByRole('tab',{name:'Truppen',exact:true})).toHaveCount(0);
  for(const name of ['Översikt','Matcher','Kalender','Kontakt']){await tab(page,name);await expect(page.locator('.h43-ui')).not.toContainText('Testspelare');await expect(page.locator('.h43-ui')).not.toContainText('Testledare');}
  expect(imageRequests).toBe(0);expect(await page.locator('.h43-ui').evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
  await tab(page,'Översikt');await page.screenshot({path:info.outputPath(`without-roster-${width}.png`),fullPage:true});
});

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
test('Stockholm winter and summer time independent of browser timezone',async({page})=>{
  const data=fixture();data.upcomingEvents[0].startsAt='2026-07-15T12:30:00Z';
  await mock(page,data);await open(page);
  await expect(page.locator('.h43-match time').first()).toContainText('13:30');
  await expect(page.locator('.h43-event time').first()).toContainText('14:30');
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
    const data=fixture();if(kind==='mismatched')data.id='other';else delete data.welcome;
    return route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
  });await page.goto('/preview/p11/');await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.h43-names')).toHaveCount(0);
  await page.unroute(api+'**');await mock(page);await page.getByRole('button',{name:'Försök igen'}).click();await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
test('multiple teams and delayed insertion remain isolated and initialization is idempotent',async({page})=>{
  const requests=[];await page.route(api+'**',route=>{const id=route.request().url().split('/').pop();requests.push(id);return route.fulfill({json:fixture(id),headers:{'Access-Control-Allow-Origin':'*'}});});
  await open(page);await page.evaluate(()=>{const div=document.createElement('div');div.dataset.h43TeamPage='';div.dataset.teamId='f12';document.body.append(div);});
  await expect(page.getByRole('heading',{name:'H43 Lund F2014'})).toBeVisible();
  await page.addScriptTag({url:'/team-assets/v1.26.0/team-page.js'});
  expect(requests).toEqual(['p11','f12']);await expect(page.getByRole('heading',{level:1})).toHaveCount(2);
});
test('invalid team identifier never becomes an API request',async({page})=>{
  let invalidRequest=false;await mock(page);await open(page);
  page.on('request',request=>{if(request.url().includes('/teams/')&&!request.url().endsWith('/p11'))invalidRequest=true;});
  await page.evaluate(()=>{const div=document.createElement('div');div.dataset.h43TeamPage='';div.dataset.teamId='../admin';document.body.append(div);});
  await expect(page.getByRole('alert')).toBeVisible();expect(invalidRequest).toBe(false);
});
test('Webnode-style global CSS does not affect widget or leak outward',async({page})=>{
  await mock(page);await open(page);
  const before=await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontSize);
  await page.addStyleTag({content:'h1,h2,p,a,li,img{font-size:75px!important;color:red!important;display:block!important}*{box-sizing:content-box}'});
  const after=await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontSize);expect(after).toBe(before);
  await page.evaluate(()=>{const p=document.createElement('p');p.id='outside';p.textContent='Outside';document.body.append(p);});
  await expect(page.locator('#outside')).toHaveCSS('color','rgb(255, 0, 0)');
  await tab(page,'Kontakt');await expect(page.getByRole('heading',{name:'Kontakt',exact:true})).toBeInViewport();
});
for(const width of [320,390,768,1440])test(`responsive layout at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await mock(page);await open(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.h43-ui').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await expect(page.getByRole('link',{name:'Anmäl dig ↗'})).toBeVisible();await expect(page.getByRole('link',{name:'Anmäl dig ↗'})).toHaveAttribute('href','https://entry.sportadmin.se/groupsOverview?uid=fjtzIS');
  await expect(page.locator('.h43-badge')).toHaveCount(0);
  expect(await page.locator('.h43-hero').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(width<=600?205:155);
  await expect(page.locator('.h43-hero')).toHaveCSS('background-color','rgb(7, 45, 80)');
  for(const name of ['Matcher','Kalender','Kontakt','Översikt']){await tab(page,name);await expect(page.getByRole('tabpanel')).toHaveCount(1);}
});
test('tabs show one independent panel; matches and calendar do not mix',async({page})=>{
  await mock(page);await open(page);await expect(page.getByRole('tab')).toHaveCount(4);
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
  await page.locator('#h43-team-page').getByRole('tab',{name:'Kontakt'}).click();
  await expect(page.locator('#second').getByRole('tab',{name:'Översikt',selected:true})).toBeVisible();
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

const portraitSvg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1440"><rect width="720" height="1440" fill="#075da7"/><rect width="720" height="160" fill="#efc460"/><rect y="1280" width="720" height="160" fill="#efc460"/></svg>';
