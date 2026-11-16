import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
export const PRODUCTION={api:'h43-youth-api-production',admin:'h43-youth-admin-production',database:'h43-youth-production',bucket:'h43-youth-images-production'};
export function productionConfigs(base,admin,inventory,access,settings={}){
  if(!/^[a-f0-9]{32}$/.test(inventory.account_id??'')||!/^[a-z0-9-]+$/.test(inventory.subdomain??''))throw new Error('Verified account/subdomain required');
  const dbs=(inventory.databases??[]).filter(d=>d.name===PRODUCTION.database);
  if(dbs.length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(dbs[0].id))throw new Error('Dedicated verified production D1 required');
  const db=dbs[0],owners=[PRODUCTION.api,PRODUCTION.admin];
  if(inventory.databases.some(d=>d.name!==PRODUCTION.database&&d.id===db.id))throw new Error('Database aliases another environment');
  for(const w of inventory.workers??[])if(!owners.includes(w.name)&&(w.bindings??[]).some(b=>(b.type==='d1'&&b.database_id===db.id)||(b.type==='r2_bucket'&&b.bucket_name===PRODUCTION.bucket)))throw new Error('Production storage is shared with another Worker');
  const apiOrigin=`https://${PRODUCTION.api}.${inventory.subdomain}.workers.dev`,adminOrigin=`https://${PRODUCTION.admin}.${inventory.subdomain}.workers.dev`;
  const organization=access.access_organization?.organization;
  if(!access.access_organization?.success||settings.issuer!==`https://${organization?.auth_domain}`||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(settings.issuer??''))throw new Error('Verified Access organization required');
  const app=access.access_applications?.applications?.find(a=>a.domain===new URL(adminOrigin).hostname&&a.aud===settings.audience&&a.type==='self_hosted');
  if(!access.access_applications?.success||!app||!settings.audience)throw new Error('Separate verified production Access application required');
  const bucket=access.r2_buckets?.buckets?.find(b=>b.name===PRODUCTION.bucket);
  if(!access.r2_buckets?.success||!bucket||bucket.publicAccess!==false)throw new Error('Private dedicated production R2 required');
  if(!access.images_plan?.success||access.images_plan.transformationsEnabled!==true||access.images_plan.baseFeeUsd!==0||access.images_plan.hostedStorageEnabled!==false)throw new Error('Existing zero-base-fee transformations entitlement required');
  const apiRate=base.env.production.ratelimits,adminRate=admin.env.production.ratelimits;
  const namespaces=[apiRate?.[0]?.namespace_id,adminRate?.[0]?.namespace_id];
  if(namespaces.some(n=>!/^\d+$/.test(n??''))||new Set(namespaces).size!==2)throw new Error('Distinct production rate-limit namespaces required');
  for(const w of inventory.workers??[])for(const b of w.bindings??[])if(b.type==='ratelimit'&&namespaces.includes(String(b.namespace_id))&&w.name!==(String(b.namespace_id)===namespaces[0]?PRODUCTION.api:PRODUCTION.admin))throw new Error('Rate-limit namespace collision');
  const common={account_id:inventory.account_id,workers_dev:false,preview_urls:false};
  const d1=[{binding:'DB',database_name:db.name,database_id:db.id,migrations_dir:'migrations'}],r2=[{binding:'IMAGES',bucket_name:PRODUCTION.bucket}];
  const publicConfig={$schema:base.$schema,name:base.name,main:base.main,compatibility_date:base.compatibility_date,...common,env:{production:{name:PRODUCTION.api,workers_dev:true,preview_urls:false,routes:[],
    assets:{directory:'../frontend/dist-production',run_worker_first:['/api/*'],not_found_handling:'none'},d1_databases:d1,r2_buckets:r2,ratelimits:structuredClone(apiRate),
    vars:{ENVIRONMENT:'production',PUBLIC_API_ENABLED:'false',ALLOWED_ORIGINS:'https://www.h43lund.se,https://h43lund.se'}}}};
  const adminConfig={$schema:admin.$schema,name:admin.name,main:admin.main,compatibility_date:admin.compatibility_date,compatibility_flags:['nodejs_compat'],...common,env:{production:{name:PRODUCTION.admin,workers_dev:true,preview_urls:false,routes:[],
    assets:{directory:'../admin/dist-production',binding:'ASSETS',run_worker_first:true,not_found_handling:'none'},d1_databases:structuredClone(d1),r2_buckets:structuredClone(r2),ratelimits:structuredClone(adminRate),images:{binding:'IMAGE_PROCESSOR'},services:[{binding:'PUBLIC_API',service:PRODUCTION.api}],triggers:{crons:['23 3 * * *']},
    vars:{ENVIRONMENT:'production',ADMIN_ENABLED:'false',IMAGE_UPLOADS_ENABLED:'true',ADMIN_ORIGIN:adminOrigin,ACCESS_ISSUER:settings.issuer,ACCESS_AUD:settings.audience,PUBLIC_API_ORIGIN:apiOrigin}}}};
  return {publicConfig,adminConfig,frontend:{environment:'production',apiBaseUrl:apiOrigin+'/api/v1',clubCalendarUrl:'https://www.h43lund.se/kalender/',clubContactUrl:'https://www.h43lund.se/kontakt/',registrationUrl:'https://entry.sportadmin.se/groupsOverview?uid=fjtzIS'}};
}
export function assertProductionConfigs(actual,expected){
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Production configuration drift; regenerate and review before deployment');
}
async function main(){const root=fileURLToPath(new URL('../',import.meta.url)),read=n=>readFile(root+n,'utf8').then(JSON.parse);
  const result=productionConfigs(await read('wrangler.jsonc'),await read('wrangler.admin.jsonc'),await read('.production/inventory.json'),await read('.production/access-inventory.json'),await read('.production/settings.json'));
  if(process.argv.includes('--check')){assertProductionConfigs({publicConfig:await read('wrangler.production.generated.jsonc'),adminConfig:await read('wrangler.admin.production.generated.jsonc'),frontend:await read('.production/frontend.json')},result);console.log('PASS production prerequisites/configurations verified; public API/admin remain disabled; no deployment');return;}
  await mkdir(root+'.production',{recursive:true});await writeFile(root+'wrangler.production.generated.jsonc',JSON.stringify(result.publicConfig,null,2)+'\n');await writeFile(root+'wrangler.admin.production.generated.jsonc',JSON.stringify(result.adminConfig,null,2)+'\n');await writeFile(root+'.production/frontend.json',JSON.stringify(result.frontend,null,2)+'\n');console.log('Prepared isolated disabled production configurations; no resource or deployment change');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main().catch(()=>{console.error('Production not prepared: verified isolated D1/private R2, Access application and Images entitlement are required. No resources created or secrets logged.');process.exitCode=1;});
