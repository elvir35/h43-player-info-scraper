# H43 · Guide för lagadministration

Portalen är byggd och testad lokalt. **Den är ännu inte öppnad i staging eller produktion.** Administratören meddelar rätt adress efter säkerhetskontroll och godkänd driftsättning. Du behöver inte tillgång till Webnode.

## Logga in och välj lag

Logga in via Cloudflare Access med den e-postadress som klubben har gett behörighet. Om engångskod används skickas den till din e-post. Dela inte koden. Du ser endast tilldelade lag; en administratör kan se alla aktiva lag. Saknas ditt lag, kontakta administratören. Att vara ledare i SportAdmin ger inte automatiskt redigeringsbehörighet.

## Redigera och spara

1. Välj ditt lag, till exempel P11.
2. Redigera välkomstrubrik, introduktion och valfritt säsongsmeddelande. Använd vanlig text; HTML stöds inte.
3. Lägg vid behov till Instagram-/TikTok-profil, valfri länktext, offentlig e-post och kontakttext. Lämna tomt om något inte ska visas.
4. Klicka **Spara utkast**. Utkastet är privat och ändrar inte den publicerade lagsidan.
5. Klicka **Spara & förhandsvisa** för att se utkastet med lagets aktuella SportAdmin-data. Förhandsvisningen publicerar ingenting.
6. När allt stämmer, klicka **Publicera**. Du behöver publiceringsbehörighet och ett sparat utkast. Ladda om den offentliga lagsidan för att se ändringen direkt; en redan öppen sida hämtar annars ny information inom cirka fem minuter.

Lagets namn i sidhuvudet och klubbens bildtillstånd är administratörsinställningar. Varje vanlig text-/bildändring genom portalen kan därefter visas utan att HTML-koden i Webnode ändras. En första uppdatering till portalens frontendversion kan krävas för de nya valfria fälten; den gör webbansvarig en gång.

## Lagbild

Välj JPEG, PNG eller WebP under 10 MB. Portalen förminskar bilden och servern kontrollerar den igen. För stora eller felaktiga bilder avvisas. Uppladdningen är privat tills bilden ingår i en godkänd publicering. Bildens ursprungliga metadata, exempelvis GPS-data, sparas inte i den publicerade JPEG-filen.

Skriv en kort **Bildbeskrivning**. Bekräfta att tillstånd finns för just den här lagbilden. Klubben måste dessutom ha aktiverat bildpublicering för laget; annars får du spara/förhandsvisa privat och kontakta administratören. Tillstånd för namn i SportAdmin är inte automatiskt tillstånd för en lagbild.

**Ta bort bilden ur utkastet** ändrar först bara utkastet. Spara och publicera för att ta bort den från den offentliga lagsidan. Tidigare publicerade bilder kan finnas kvar privat för historik/återställning. Helt oanvända uppladdningar blir normalt städningsbara efter sju dagar. Redan nedladdade eller sparade bilder kan inte återkallas från besökare.

## Historik och samtidiga ändringar

Under **Publiceringshistorik** visas tidigare publiceringar och vem som publicerade dem. **Återpublicera** skapar en ny publicering med det tidigare innehållet. Spelare, ledare, matcher och kalender påverkas inte. Bildtillstånd måste fortfarande gälla.

Om någon annan sparar medan du redigerar avvisas din inaktuella version. Kopiera din text och klicka **Ladda om laget** innan du fortsätter. Portalen skriver inte tyst över den nyare versionen. Vid nätverksfel eller oklar bekräftelse: kontrollera historiken efter omladdning innan du försöker publicera igen.

## Det här hanteras i SportAdmin

Spelare, ledare, medlemskap, kalender och matcher är skrivskyddade i portalen. Gör ändringar i SportAdmin. Portalen visar inte personporträtt och har ingen separat spelarlista att redigera eller godkänna.

## Logga ut och problem

Använd **Logga ut** när du är klar, särskilt på en delad dator. Om sessionen gått ut avvisas sparande/publicering. Kopiera osparad text innan du loggar in igen. Omladdning kan annars förlora osparade ändringar.

Vid saknad behörighet, avvisad bild eller misslyckad publicering: läs meddelandet och kontakta administratören vid behov. Skicka inte inloggningskoder eller andra hemligheter i felrapporten. Saknad match-/kalenderdata innebär inte att medlemskap eller aktiviteter har raderats.

## För administratören

Under **Administration · användare och lagbehörighet** kan du lägga till användare, ändra roll/aktiv status, tilldela aktuellt lag och ge publiceringsrätt. Cloudflare Access måste också tillåta nya adresser; D1-tilldelningen ersätter inte Access-policyn. Spara eventuella lagutkast innan du ändrar administrativa inställningar.

Bildpublicering ska bara aktiveras när klubbens tillstånd är etablerat. Om tillstånd dras tillbaka, avaktivera det; den offentliga API:n slutar då lämna ut bilden vid nästa förfrågan. Ändring av SportAdmin-koppling eller ny lag-/databas-/domänkonfiguration görs genom webbansvarigs granskade driftprocess. Se [teknisk konfiguration](admin-architecture.md) och [säkerhetsgenomgång](admin-security.md).

## Aktuell stagingportal

Portalen finns på https://h43-youth-admin-staging.elvir-arslanovic.workers.dev/ . Logga in med det konto som administratören har godkänt i Cloudflare Access. P11-tränaren har endast tillgång till P11.

Denna version stöder välkomsttext, sociala länkar och kontaktuppgifter samt utkast, privat förhandsvisning, publicering och historik. Bilduppladdning är uppskjuten och inte tillgänglig. Använd sociala medier för nya lagbilder. Publicering gäller staging-API:t; produktionen och Webnode-inbäddningen har inte ändrats. De nya valfria fälten för säsongsmeddelande, kontakttext och länktexter kräver widgetversion 1.3.0.

## Textformatering och synlighet — version 1.4.0

Välkomstrubrik visas som rubrik i fliken **Översikt**. Introduktionen visas direkt under rubriken. Säsongsmeddelandet visas i en separat ruta, **Aktuellt i laget**. Offentlig e-postadress, kontakttext och sociala länkar visas i fliken **Kontakt**. Tomma fält visas inte.

Introduktion, säsongsmeddelande och kontakttext har knappar för fetstil, kursiv stil, underrubrik, punktlista, numrerad lista och HTTPS-länk. Markera text och använd en knapp. Välj **Visa formaterad text** för en direkt förhandsvisning. Textfältet visar formateringsmarkeringarna; detta är inte en fullständig Word-editor. Bilder och HTML kan inte klistras in som formaterat innehåll.

Välj **Spara utkast** och sedan **Publicera** för att ändra lagsidan. **Spara & förhandsvisa** visar utkastet privat och publicerar ingenting. En tidigare öppnad lagsida kan behöva laddas om.

Webbansvarig behöver uppdatera båda Webnode-adresserna till widget **v1.4.0** för dessa funktioner. Den publicerade testsidan använde fortfarande v1.2.0 vid kontrollen. Det färdiga HTML-blocket finns i `frontend/embed-p11.html`. Portalen och staging-förhandsvisningen är uppdaterade; Webnode-blocket har inte ändrats.

## Sociala medier och kontakt — version 1.5.0

Instagram och TikTok visas tydligt i rutan **Följ laget** på välkomstfliken **Översikt**, före introduktionstexten. Endast sparade, publicerade och giltiga profillänkar visas. Kontaktfliken visar e-postadressen som en enda klickbar mejlknapp. Webbansvarig behöver välja version 1.5.0 i båda Webnode-adresserna; det aktuella HTML-blocket finns i `frontend/embed-p11.html`.

## Bilduppladdning är nu aktiverad i staging

Ladda om portalen innan du börjar. Under **Lagbild**, välj JPEG, PNG eller WebP (högst 10 MB). Bilden förminskas i webbläsaren, bearbetas av Cloudflare Images och lagras privat som WebP. En lyckad uppladdning visas direkt i bildförhandsvisningen.

Ange **Bildbeskrivning**, bekräfta att publiceringstillstånd finns och välj **Spara utkast**. **Spara & förhandsvisa** visar den sparade bilden privat. **Publicera** gör bilden synlig på lagsidan först när klubbens bildpubliceringstillstånd för laget också är aktiverat av administratören. Administratören hanterar det under **Administration · användare och lagbehörighet → Laginställningar** efter att klubbens tillstånd har kontrollerats. Medlemskap från SportAdmin och godkänd bildpublicering är separata saker.

Om bildtjänsten är otillgänglig eller en gräns nås visas ett fel och den tidigare bilden behålls. Välj **Ta bort bilden ur utkastet**, spara och publicera för att ta bort en publicerad bild. Enbart uppladdning eller borttagning i ett osparat utkast ändrar inte den publicerade sidan.

## Lagbildens placering — version 1.6.0

Lagbilden visas nu i fliken **Översikt**, direkt efter välkomstrubriken och före sociala medier. Hela bilden visas utan beskärning, nedtoning eller text ovanpå. Den blå sidrubriken är separat från bilden. Samma placering gäller i portalens privata förhandsvisning. Webbansvarig behöver uppdatera båda Webnode-adresserna till v1.6.0 med HTML-blocket i frontend/embed-p11.html. Bilden behöver inte laddas upp igen.

## Kontakt och Truppen — version 1.7.0

Under **Kontakt** i portalen kan du ange **Offentlig e-postadress** och **Offentligt mobilnummer (valfritt)**. Mobilnumret kan exempelvis skrivas med svenska mellanslag/bindestreck eller internationellt med +46. Ange endast kontaktuppgifter som ska visas offentligt. Spara utkastet och välj **Publicera**.

Kontaktfliken visar en mejllänk och en klickbar telefonlänk för de fält som är ifyllda. Om bara ett nummer anges visas telefonlänken. Spelare och ledare finns nu under **Truppen**, med separata rubriker. Medlemskap ändras fortfarande i SportAdmin.

Ladda om portalen för det nya fältet. Webbansvarig behöver uppdatera båda Webnode-adresserna till **v1.7.0** med frontend/embed-p11.html för att visa Truppen och mobilnumret där. Befintliga texter och kontaktuppgifter har inte ändrats automatiskt.

## Flera kontaktpersoner — version 1.8.0

Under **Kontakt** kan du nu lägga till upp till 20 kontaktpersoner. Ange namn samt mejladress och/eller mobilnummer per person. Klicka **Lägg till kontaktperson** för fler och **Ta bort kontaktperson** för att ta bort en post. Helt tomma rader ignoreras; en person behöver minst en kontaktväg. Ange endast uppgifter avsedda för offentlig publicering.

Befintlig mejladress och mobilnummer följer med som första kontaktpersonen. Ladda om portalen, redigera, välj **Spara utkast** och sedan **Publicera**. Varje person visas i ett eget kontaktkort. Ledare och spelare finns fortsatt under **Truppen**, och medlemskap hanteras i SportAdmin. Uppdatera båda Webnode-adresserna till **v1.8.0** med `frontend/embed-p11.html`.

## Navigering i portalen

Genvägar överst i redigeraren leder till Välkomsttext, Lagbild, Sociala medier, Kontakt, SportAdmin och Publiceringshistorik; administratörer har även Administration. Kontakt är hopfälld från början. Klicka på Kontakt-rubriken för att fälla ut eller ihop; genvägen öppnar avsnittet automatiskt och osparade fält finns kvar. Efter lyckad **Spara & förhandsvisa** flyttas vyn och tangentbordsfokus till den privata förhandsvisningen. En genväg till förhandsvisningen visas när den har öppnats. Publicering kräver fortfarande **Publicera**. Ingen ändring av Webnode-widgetens version behövs för dessa portaländringar.


## Lagnamn med födelseår i portalen

Laglistan och redigerarens huvudrubrik visar nu födelseår, exempelvis **H43 Lund P2015** för P11 och **H43 Lund F2014** för F12. Gemensamma årskullar behålls: **P2011/2012** och **F2012/2013**. Ladda om portalen för de uppdaterade namnen. Behörigheter och kopplingen till SportAdmin använder fortsatt samma lag-ID. Denna ändring gäller portalens etiketter och kräver ingen uppdatering av Webnode-widgeten.


## E-postkod för tränare — aktiverat 2026-11-12

Öppna portalens ursprungliga adress på nytt om en gammal inloggningssida visar Cloudflares kontoinloggning. På Cloudflare Access-sidan, använd **Email**, ange din godkända e-postadress och välj **Send login code**. Ange sedan koden från mejlet. Du behöver inte skapa ett Cloudflare-konto för denna inloggningsmetod. Klubbens e-postlista och portalens lagbehörigheter gäller fortfarande.

Administratören som redan har loggat in via Cloudflare ska fortsätta välja **Cloudflare**-knappen. Befintliga identitetskopplingar återställs inte automatiskt vid byte av inloggningsmetod. För nya tränare kopplas deras första verifierade identitet till den förhandsgodkända e-postadressen. Konfiguration och kodformulär har verifierats; tränarens egen mottagning av kod och första kompletta inloggning återstår.

## Lagbilder — uppdaterat 2026-11-12

Tränare med publiceringsbehörighet kan ladda upp en lagbild, spara och förhandsvisa utkastet och sedan publicera. Separat administratörsgodkännande och bildbekräftelse behövs inte. Bildbeskrivning är valfri; utan beskrivning visas en automatisk alternativtext med lagets namn för hjälpmedel. En uppladdad bild är privat tills utkastet publiceras. För att sluta visa bilden: ta bort den ur utkastet, spara och publicera.

## Tydligare administration och borttagning av konton

Raden “Du redigerar lagsidan” visar alltid vilket lag som är valt, även när du skrollar. Under Administration visas först tränarna för just det laget. “Ta bort från laget” påverkar endast det valda laget.

Administratörer kan öppna “Alla portalanvändare · gäller samtliga lag” och välja “Ta bort användare”. Efter bekräftelse spärras kontot i portalen och samtliga lagtilldelningar tas bort. Tidigare publiceringar sparas. Felaktiga/inaktiva konton visas separat under “Borttagna eller inaktiva användare”. Där går kontot att återaktivera; lagtilldelningar måste då läggas till på nytt. Du kan inte ta bort ditt eget administratörskonto. Cloudflare Access-listan hanteras fortfarande separat.

## Navigering och meddelanden

Lagets namn och länkarna till redigeringsavsnitten ligger kvar längst upp när du skrollar, även i administrationsdelen. På mindre skärmar kan länkraden skrollas i sidled. Avsnittslänkarna lämnar plats för den fasta raden så att rubriker och fält syns.

Informations- och framgångsmeddelanden stängs automatiskt efter cirka 6,5 sekunder. Meddelandet ligger kvar medan muspekaren eller tangentbordsfokus är i rutan. Felmeddelanden ligger kvar tills du stänger dem eller ett nytt meddelande visas. Alla rutor har knappen “Stäng meddelandet” och visas längst ned, så att navigeringen hålls fri.

## Truppdetaljer

Öppna Truppdetaljer via navigeringen. Spelarnas namn hämtas från SportAdmin; du kan fylla i valfritt tröjnummer (upp till tre siffror, exempelvis 01) och position. För ledare kan du ange Uppgift, exempelvis Tränare, Lagledare eller Lagadministratör. Uppgiften ändrar inte personens behörighet i portalen. Fälten är frivilliga och kan tömmas. Spara och förhandsvisa, och välj sedan Publicera för att visa dem på lagsidan.

Om en person försvinner eller byter identitet/namn i SportAdmin kopplas gamla detaljer inte automatiskt till någon ny. Fyll då i detaljerna igen för den aktuella personen. Om redigering saknas väntar laget på en synkronisering med medlemsidentiteter. Kontakta administratören; ändra namn och medlemskap i SportAdmin.

## Spelarbilder

Under Truppdetaljer finns Spelarbild för varje aktuell spelare. Välj en JPEG-, PNG- eller WebP-bild på högst 10 MB. Uppladdningen är privat tills du sparar och publicerar. Förhandsvisningen visar bilden före publicering. Spelarbilder är frivilliga och kräver ingen separat bildbeskrivning; spelarens namn används som alternativtext. Publicera bara bilder som får visas på lagsidan.

Ta bort spelarbild tar bort bilden ur utkastet. Spara och publicera för att ta bort den från lagsidan. Om en uppladdning misslyckas behålls den tidigare bilden. Om spelaren lämnar SportAdmin-truppen slutar spelarbilden visas efter nästa lyckade synkronisering, och dess gamla offentliga URL fungerar inte längre om bilden inte samtidigt används på en annan publicerad plats.


## Bekräftelse efter publicering

Efter lyckad **Publicera** flyttas vyn och tangentbordsfokus till en tydlig grön bekräftelseruta överst i redigeraren. Rutan visar **Publicerat!**, vilket lag som har uppdaterats och knappen **Visa lagsidan**, som öppnar lagets offentliga Webnode-sida i en ny flik. Har du lagsidan öppen sedan tidigare kan du behöva ladda om den.

Bekräftelsen försvinner när du klickar **Stäng**, byter lag eller börjar redigera igen. Den stängs inte automatiskt efter några sekunder. Misslyckad publicering visar ett felmeddelande och ingen publiceringsbekräftelse. Ingen uppdatering av Webnode-koden behövs för denna portaländring.
