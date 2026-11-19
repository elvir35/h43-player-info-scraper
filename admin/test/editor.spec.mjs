import {createRequire} from 'node:module';const require=createRequire(new URL('../../worker/package.json',import.meta.url));const {test,expect}=require('@playwright/test');

test('team deep links select the requested authorized team after login',async({page})=>{
  await page.setExtraHTTPHeaders({'X-Test-Identity':'admin'});
  await page.goto('/?team=p2014');await expect(page.getByRole('heading',{name:'H43 Lund P2014',exact:true})).toBeVisible();await expect(page.locator('#teams button[aria-current="true"]')).toHaveText('H43 Lund P2014');
  await page.goto('/?team=p2015');await expect(page.getByRole('heading',{name:'H43 Lund P2015',exact:true})).toBeVisible();
});

test('unassigned team deep link offers access contact without opening another team',async({page,request})=>{
  const contentRequests=[];page.on('request',r=>{if(/\/teams\/[^/]+\/content$/.test(new URL(r.url()).pathname))contentRequests.push(r.url());});
  await page.goto('/?team=p2014');await expect(page.getByRole('heading',{name:'Du saknar behörighet till det valda laget',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'elvir.arslanovic@gmail.com',exact:true})).toHaveAttribute('href',/^mailto:elvir\.arslanovic@gmail\.com/);expect(contentRequests).toEqual([]);expect((await request.get('/api/admin/v1/teams/p12/content')).status()).toBe(403);
  await page.getByRole('button',{name:'H43 Lund P2015',exact:true}).click();await expect(page.getByRole('heading',{name:'H43 Lund P2015',exact:true})).toBeVisible();
});

test('coach without assigned teams sees the access request address',async({page})=>{
  await page.setExtraHTTPHeaders({'X-Test-Identity':'other'});await page.goto('/');await expect(page.getByRole('heading',{name:'Inga lag tilldelade',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'elvir.arslanovic@gmail.com',exact:true})).toBeVisible();
});
test('text-only launch hides uploads and saves editorial content',async({page})=>{
  await page.route('**/api/admin/v1/teams/p11/content',async route=>{const response=await route.fetch();const data=await response.json();data.features={imageUploads:false};await route.fulfill({response,json:data});});
  await open(page);await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByText('Bilduppladdning är inte aktiverad i denna version.',{exact:false})).toBeVisible();
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Text utan bilder');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');
});
test.beforeEach(async({request})=>{await request.post('/__test/reset');});

test('retired roster has no editing, upload or navigation controls; contacts and preview remain usable',async({page,request})=>{
  await open(page);await expect(page.getByRole('navigation',{name:'Gå till avsnitt'}).getByRole('link',{name:'Truppdetaljer',exact:true})).toHaveCount(0);
  await expect(page.locator('#editor-roster')).toHaveCount(0);await expect(page.getByText('Testspelare Åsa',{exact:false})).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(1);
  const content=await (await request.get('/api/admin/v1/teams/p11/content')).json();expect(content.roster).toEqual({players:[],coaches:[],lastSyncedAt:null});
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();
  const preview=page.frameLocator('iframe');await expect(preview.getByRole('tab')).toHaveText(['Översikt','Matcher','Kalender','Kontakt']);
});
test('coach adds named contact persons, publishes and removes one',async({page,request})=>{
  await open(page);await page.getByLabel('Namn för kontaktperson 1',{exact:true}).fill('Anna Exempel');await page.getByLabel('Mejladress för kontaktperson 1',{exact:true}).fill('anna@example.test');await page.getByLabel('Mobilnummer för kontaktperson 1',{exact:true}).fill('070-123 45 67');
  await page.getByRole('button',{name:'Lägg till kontaktperson',exact:true}).click();await page.getByLabel('Namn för kontaktperson 2',{exact:true}).fill('Bo Exempel');await page.getByLabel('Mejladress för kontaktperson 2',{exact:true}).fill('bo@example.test');
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();const preview=page.frameLocator('iframe');await preview.getByRole('tab',{name:'Kontakt',exact:true}).click();await expect(preview.locator('.h43-contact-card')).toHaveCount(2);await expect(preview.getByRole('heading',{name:'Anna Exempel',exact:true})).toBeVisible();expect((await (await request.get('/__public/api/v1/teams/p11')).json()).contact.people).toEqual([]);
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');expect((await (await request.get('/__public/api/v1/teams/p11')).json()).contact.people.map(p=>p.name)).toEqual(['Anna Exempel','Bo Exempel']);
  await page.getByRole('navigation',{name:'Gå till avsnitt'}).getByRole('link',{name:'Kontakt',exact:true}).click();await page.getByRole('group',{name:'Kontaktperson 1',exact:true}).getByRole('button',{name:'Ta bort kontaktperson',exact:true}).click();await expect(page.getByLabel('Namn för kontaktperson 1',{exact:true})).toHaveValue('Bo Exempel');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');expect((await (await request.get('/__public/api/v1/teams/p11')).json()).contact.people.map(p=>p.name)).toEqual(['Bo Exempel']);
});
test('formatting toolbar previews and publishes safe formatted editorial text',async({page,request})=>{
  await open(page);const description=page.getByLabel('Introduktion',{exact:true});await description.fill('Handboll med gemenskap');await description.press('ControlOrMeta+A');
  const tools=page.getByRole('group',{name:'Formatering: Introduktion',exact:true});await tools.getByRole('button',{name:'Fet',exact:true}).click();await expect(description).toHaveValue('**Handboll med gemenskap**');
  await description.fill('**Gemenskap**\n\n- Träning\n- Matcher\n\n[Läs mer](https://www.h43lund.se/)');
  const editor=page.locator('.rich-field').filter({has:description});await editor.getByText('Visa formaterad text',{exact:true}).click();await expect(editor.locator('strong')).toHaveText('Gemenskap');await expect(editor.locator('li')).toHaveCount(2);
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Välkommen till P11');await page.getByLabel('Säsongsmeddelande (valfritt)',{exact:true}).fill('**Träningstider**\nTisdagar');await page.getByLabel('Mejladress för kontaktperson 1',{exact:true}).fill('p11@example.test');await page.getByLabel('Mobilnummer för kontaktperson 1',{exact:true}).fill('+46 70 123 45 67');await page.getByLabel('Kontakttext (valfritt)',{exact:true}).fill('**Hör av dig!**');
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();const preview=page.frameLocator('iframe');await expect(preview.getByRole('heading',{level:2,name:'Välkommen till P11'})).toBeVisible();await expect(preview.locator('strong').filter({hasText:'Träningstider'})).toBeVisible();await preview.getByRole('tab',{name:'Kontakt',exact:true}).click();await expect(preview.getByRole('link',{name:'p11@example.test',exact:true})).toBeVisible();await expect(preview.getByRole('link',{name:'+46 70 123 45 67',exact:true})).toHaveAttribute('href','tel:+46701234567');await expect(preview.getByRole('tabpanel',{name:'Kontakt',exact:true}).locator('.h43-coaches')).toHaveCount(0);await expect(preview.getByRole('tab',{name:'Truppen',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');const published=await (await request.get('/__public/api/v1/teams/p11')).json();expect(published.welcome.seasonMessage).toBe('**Träningstider**\nTisdagar');expect(published.contact.text).toBe('**Hör av dig!**');expect(published.contact.phone).toBe('+46 70 123 45 67');await expect(page.getByLabel('Mobilnummer för kontaktperson 1',{exact:true})).toHaveValue('+46 70 123 45 67');
});
async function open(page){await page.goto('/');await page.getByRole('navigation',{name:'Gå till avsnitt'}).getByRole('link',{name:'Kontakt',exact:true}).click();await expect(page.getByRole('heading',{name:'H43 Lund P2015',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Spara utkast',exact:true})).toBeEnabled();}
async function adminRequest(request,path,body){const headers={'X-Test-Identity':'admin'};const me=await (await request.get('/api/admin/v1/me',{headers})).json();return request.put('/api/admin/v1'+path,{headers:{...headers,Origin:'http://127.0.0.1:3001','X-CSRF-Token':me.csrfToken},data:body});}
test('coach saves, previews and publishes with shared frontend rendering',async({page,request,context},info)=>{
  await open(page);await expect(page.locator('#teams button')).toHaveCount(1);await expect(page.locator('#teams button')).toHaveText('H43 Lund P2015');await expect(page.getByRole('heading',{name:'SportAdmin · endast läsning'})).toBeVisible();
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Välkommen till P11');await page.getByLabel('Introduktion',{exact:true}).fill('Handboll med Å, Ä och Ö.');await page.getByLabel('Säsongsmeddelande (valfritt)',{exact:true}).fill('Vi ses i hallen!');
  await page.getByLabel('Mejladress för kontaktperson 1',{exact:true}).fill('p11@example.test');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');
  expect((await (await request.get('/__public/api/v1/teams/p11')).json()).welcome.title).toBeNull();
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();const preview=page.frameLocator('iframe');await expect(preview.getByText('Välkommen till P11',{exact:true})).toBeVisible();await expect(preview.getByText('Vi ses i hallen!',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');
  const publicPage=await context.newPage();await publicPage.route('https://h43-youth-api-staging.elvir-arslanovic.workers.dev/api/v1/teams/p11',async route=>route.fulfill({json:await (await request.get('/__public/api/v1/teams/p11')).json(),headers:{'Access-Control-Allow-Origin':'*'}}));
  await publicPage.goto('/__test/public-widget');await expect(publicPage.getByText('Välkommen till P11',{exact:true})).toBeVisible();await expect(publicPage.getByText('Vi ses i hallen!',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('coach-editor-desktop.png'),fullPage:true});
});
test('invalid content stays unpublished and edit conflicts preserve typed values',async({page,request})=>{
  await open(page);await page.getByLabel('Välkomstrubrik',{exact:true}).fill('<script>bad</script>');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('otillåtna');
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Mitt osparade utkast');
  const me=await (await request.get('/api/admin/v1/me')).json();const current=await (await request.get('/api/admin/v1/teams/p11/content')).json();
  await request.put('/api/admin/v1/teams/p11/draft',{headers:{Origin:'http://127.0.0.1:3001','X-CSRF-Token':me.csrfToken},data:{expectedVersion:current.draft.version,content:{...current.draft.content,welcomeTitle:'En annan ändring'}}});
  await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Någon har ändrat');await expect(page.getByLabel('Välkomstrubrik',{exact:true})).toHaveValue('Mitt osparade utkast');
});
test('admin UI can assign a team; P11 coach cannot view P12',async({page,request})=>{
  await page.setExtraHTTPHeaders({'X-Test-Identity':'admin'});await open(page);await expect(page.locator('#teams button')).toHaveCount(2);
  await page.getByText('Administration · H43 Lund P2015',{exact:true}).click();await page.getByLabel('Tränare att tilldela laget',{exact:true}).selectOption('other@example.test');await page.getByLabel('Tilldelad laget',{exact:true}).check();await page.getByRole('button',{name:'Spara lagtilldelning',exact:true}).click();await expect(page.locator('#status')).toContainText('Lagtilldelningen är sparad');
  expect((await request.get('/api/admin/v1/teams/p12/content')).status()).toBe(403);
});
test('uploaded photo stays private until authorized publication and can be removed',async({page,request})=>{
  await open(page);const jpeg=require('jpeg-js');const bytes=jpeg.encode({width:2,height:2,data:Buffer.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])},80).data;
  await page.locator('input[name=upload]').setInputFiles({name:'team.jpg',mimeType:'image/jpeg',buffer:bytes});await expect(page.locator('#status')).toContainText('Bilden är privat uppladdad');
  await expect(page.getByLabel('Bildbeskrivning (valfritt)',{exact:true})).toHaveValue('');
  await expect(page.getByText('Jag bekräftar att tillstånd finns för att publicera denna lagbild.',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');
  const draft=await (await request.get('/api/admin/v1/teams/p11/content')).json();expect((await request.get('/__public/api/v1/teams/p11/images/'+draft.draft.content.heroImageId)).status()).toBe(404);
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();const photoPreview=page.frameLocator('iframe');await expect(photoPreview.locator('.h43-team-image')).toBeVisible();await expect(photoPreview.locator('.h43-team-image')).toHaveAttribute('alt', 'Lagbild för H43 Lund P2015');await expect(photoPreview.locator('.h43-team-image')).toHaveCSS('object-fit','contain');await expect(photoPreview.locator('.h43-hero img')).toHaveCount(0);
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');
  expect((await request.get('/__public/api/v1/teams/p11/images/'+draft.draft.content.heroImageId)).status()).toBe(200);
  await page.getByRole('button',{name:'Ta bort bilden ur utkastet',exact:true}).click();await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');expect((await request.get('/__public/api/v1/teams/p11/images/'+draft.draft.content.heroImageId)).status()).toBe(404);
});
test('expired session rejects saving and leaves text available to copy',async({page,request})=>{
  await open(page);await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Text att behålla');await request.post('/__test/expire');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sessionen har gått ut'})).toBeVisible();await expect(page.getByLabel('Välkomstrubrik',{exact:true})).toHaveValue('Text att behålla');
});
test('mobile portal has no horizontal overflow',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await open(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Mobilt välkommen');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.locator('#status')).toContainText('Utkastet är sparat');
  await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#publish-confirmation')).toContainText('Publicerat!');
  await page.screenshot({path:info.outputPath('coach-editor-mobile.png'),fullPage:true});
});

for(const width of [390,1440])test(`section anchors, collapsed contacts and automatic preview navigation at ${width}px`,async({page,request},info)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');
  const nav=page.getByRole('navigation',{name:'Gå till avsnitt'}),contact=page.locator('#editor-contact');
  await expect(nav).toBeVisible();await expect(contact).not.toHaveAttribute('open','');await expect(page.getByLabel('Namn för kontaktperson 1',{exact:true})).toBeHidden();
  for(const [label,id]of [['Lagbild','editor-image'],['Sociala medier','editor-social'],['SportAdmin','editor-source'],['Publiceringshistorik','editor-history'],['Kontakt','editor-contact']]){
    await nav.getByRole('link',{name:label,exact:true}).click();await expect(page.locator('#'+id)).toBeFocused();await expect(page.locator('#'+id)).toBeInViewport();
  }
  await page.getByLabel('Namn för kontaktperson 1',{exact:true}).fill('Anna Exempel');await page.getByLabel('Mejladress för kontaktperson 1',{exact:true}).fill('anna@example.test');await page.getByRole('button',{name:'Lägg till kontaktperson',exact:true}).click();await page.getByLabel('Mejladress för kontaktperson 2',{exact:true}).fill('bo@example.test');
  await contact.locator('summary').first().click();await expect(page.getByLabel('Mejladress för kontaktperson 2',{exact:true})).toBeHidden();
  await nav.getByRole('link',{name:'Kontakt',exact:true}).click();await expect(page.getByLabel('Mejladress för kontaktperson 2',{exact:true})).toHaveValue('bo@example.test');
  await page.getByRole('button',{name:'Spara & förhandsvisa',exact:true}).click();const preview=page.locator('#preview-box');await expect(preview).toBeFocused();await expect(preview.getByRole('heading',{name:'Privat förhandsvisning',exact:true})).toBeInViewport();await expect(preview.locator('iframe')).toBeVisible();
  expect((await (await request.get('/__public/api/v1/teams/p11')).json()).contact.people).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('preview-navigation.png')});
  await nav.getByRole('link',{name:'Välkomsttext',exact:true}).click();await expect(page.locator('#editor-welcome')).toBeFocused();await nav.getByRole('link',{name:'Förhandsvisning',exact:true}).click();await expect(preview).toBeFocused();
});

for(const width of [390,1440])test(`team administration is clearly scoped and removes incorrect accounts at ${width}px`,async({page,request},info)=>{
  await page.setViewportSize({width,height:1000});await page.setExtraHTTPHeaders({'X-Test-Identity':'admin'});await open(page);
  await expect(page.getByRole('region',{name:'Aktuellt lag'})).toContainText('H43 Lund P2015');
  await page.getByRole('button',{name:'H43 Lund P2014',exact:true}).click();
  await expect(page.getByRole('region',{name:'Aktuellt lag'})).toContainText('H43 Lund P2014');
  await page.getByText('Administration · H43 Lund P2014',{exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tränare för H43 Lund P2014',exact:true})).toBeVisible();
  await expect(page.getByText('Inga tränare är tilldelade detta lag.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'H43 Lund P2015',exact:true}).click();
  await page.getByText('Administration · H43 Lund P2015',{exact:true}).click();
  await expect(page.locator('.permission-team')).toContainText('coach@example.test');
  const global=page.locator('.global-users');await expect(global).not.toHaveAttribute('open','');
  await global.locator('summary').first().click();
  const account=page.getByRole('article',{name:'other@example.test',exact:true});await expect(account).toContainText('Inga lag tilldelade');
  page.once('dialog',dialog=>dialog.dismiss());await account.getByRole('button',{name:'Ta bort användare',exact:true}).click();await expect(account).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await account.getByRole('button',{name:'Ta bort användare',exact:true}).click();await expect(page.locator('#status')).toContainText('Användaren är borttagen');
  await expect(global.locator(':scope > .user-card')).toHaveCount(2);
  await page.locator('.inactive-users > summary').click();await expect(account).toContainText('Inaktiv · ingen portalåtkomst');
  await expect(account.getByRole('button',{name:'Återaktivera användare',exact:true})).toBeVisible();
  expect((await request.get('/api/admin/v1/me',{headers:{'X-Test-Identity':'other'}})).status()).toBe(403);
  await page.locator('.global-users > summary').click();await page.locator('.permission-team').scrollIntoViewIfNeeded();
  await expect(page.getByRole('region',{name:'Aktuellt lag'})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('team-administration.png')});
  await global.locator('summary').first().click();await account.getByRole('button',{name:'Återaktivera användare',exact:true}).click();await expect(page.locator('#status')).toContainText('Användaren är återaktiverad');
  expect((await request.get('/api/admin/v1/me',{headers:{'X-Test-Identity':'other'}})).status()).toBe(200);
});

for(const width of [390,1440])test(`navigation remains visible and notifications dismiss at ${width}px`,async({page},info)=>{
  await page.clock.install();await page.setViewportSize({width,height:900});await open(page);
  const status=page.locator('#status'),nav=page.getByRole('navigation',{name:'Gå till avsnitt'});
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Sparat meddelande');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(status).toContainText('Utkastet är sparat');
  await page.getByRole('button',{name:'Stäng meddelandet',exact:true}).click();await expect(status).toBeHidden();
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Automatisk stängning');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(status).toBeVisible();await page.mouse.move(0,0);await page.clock.fastForward(7000);await expect(status).toBeHidden();
  await page.getByLabel('Välkomstrubrik',{exact:true}).fill('<script>bad</script>');await page.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(status).toContainText('otillåtna');await page.clock.fastForward(10000);await expect(status).toBeVisible();await page.getByRole('button',{name:'Stäng meddelandet',exact:true}).click();
  await nav.getByRole('link',{name:'SportAdmin',exact:true}).click();await expect(nav).toBeInViewport();await expect(page.getByRole('region',{name:'Aktuellt lag'})).toBeInViewport();
  const teamRect=await page.getByRole('region',{name:'Aktuellt lag'}).boundingBox(),navRect=await nav.boundingBox();expect(navRect.y).toBeGreaterThanOrEqual(teamRect.y+teamRect.height-1);
  await nav.getByRole('link',{name:'Välkomsttext',exact:true}).click();const section=await page.locator('#editor-welcome').boundingBox(),sticky=await page.locator('.editor-navigation').boundingBox();expect(section.y).toBeGreaterThanOrEqual(sticky.y+sticky.height-1);
  await nav.getByRole('link',{name:'SportAdmin',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('sticky-navigation.png')});
});

for(const width of [390,1440])test(`publish confirmation is prominent, persistent and links the correct public birth-year page at ${width}px`,async({page},info)=>{
  await page.clock.install();await page.setViewportSize({width,height:1000});await page.setExtraHTTPHeaders({'X-Test-Identity':'admin'});await open(page);
  for(const [team,slug]of [['P2015','p2015'],['P2014','p2014']]){
    await page.getByRole('button',{name:`H43 Lund ${team}`,exact:true}).click();await page.getByRole('button',{name:'Publicera',exact:true}).click();
    const confirmation=page.locator('#publish-confirmation');await expect(confirmation).toBeInViewport();await expect(confirmation).toBeFocused();await expect(confirmation).toContainText(`H43 Lund ${team} har uppdaterats.`);await expect(page.locator('#status')).toBeHidden();
    const link=confirmation.getByRole('link',{name:'Visa lagsidan ↗',exact:true});await expect(link).toHaveAttribute('href',`https://www.h43lund.se/lagsida/?team=${slug}`);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(link).toBeInViewport();
    await page.clock.fastForward(10000);await expect(confirmation).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`published-${slug}.png`)});
    if(team==='P2015'){await confirmation.getByRole('button',{name:'Stäng publiceringsbekräftelsen',exact:true}).click();await expect(confirmation).toHaveCount(0);await expect(page.getByRole('button',{name:'Publicera',exact:true})).toBeFocused();}else{await page.getByLabel('Välkomstrubrik',{exact:true}).fill('Nytt utkast');await expect(confirmation).toHaveCount(0);}
  }
});
test('failed publishing shows an error without a success confirmation or public link',async({page})=>{
  await open(page);await page.route('**/api/admin/v1/teams/p11/publish',route=>route.fulfill({status:409,json:{error:{code:'EDIT_CONFLICT'}}}));await page.getByRole('button',{name:'Publicera',exact:true}).click();await expect(page.locator('#status')).toContainText('Någon har ändrat');await expect(page.locator('#publish-confirmation')).toHaveCount(0);await expect(page.getByRole('link',{name:'Visa lagsidan ↗',exact:true})).toHaveCount(0);
});
