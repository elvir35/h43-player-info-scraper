import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {buildStagingConfig,assertStagingConfig,STAGING_WORKER} from './staging-config.mjs';
export const ADMIN_WORKER='h43-youth-admin-staging';
export function adminStagingConfig(base,publicBase,inventory,access,settings){
  if(base.assets?.run_worker_first!==true||base.assets?.binding!=='ASSETS'||base.assets?.directory!=='../admin/dist')throw new Error('Admin assets must run authenticated Worker first');
  const publicConfig=buildStagingConfig(publicBase,inventory);
  const expected=`https://${ADMIN_WORKER}.${inventory.subdomain}.workers.dev`;
  if(settings.origin!==expected)throw new Error('Use the verified staging workers.dev host; a custom domain needs a separate verified DNS/Access review');
  const organization=access.access_organization?.organization;
  if(!access.access_organization?.success||settings.issuer!==`https://${organization?.auth_domain}`||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(settings.issuer))throw new Error('Verified staging Access organization required');
  const app=access.access_applications?.applications?.find(a=>a.domain===new URL(expected).hostname&&a.aud===settings.audience&&a.type==='self_hosted');
  if(!access.access_applications?.success||!app)throw new Error('Verified Access application with exact staging hostname/audience required');
  const images=settings.imageUploads===true;
  if(images&&(!access.images_plan?.success||access.images_plan.transformationsEnabled!==true||access.images_plan.baseFeeUsd!==0||access.images_plan.hostedStorageEnabled!==false))throw new Error('Verified zero-base-fee Images transformations entitlement without hosted storage required');
  const bucket=access.r2_buckets?.buckets?.find(b=>b.name===settings.bucketName);
  if(images&&(!access.r2_buckets?.success||!bucket||bucket.publicAccess!==false||settings.bucketName!=='h43-youth-images-staging'))throw new Error('Verified private, dedicated staging R2 bucket required');
  const namespace=base.env.staging.ratelimits[0].namespace_id;
  if(inventory.workers.some(w=>w.name!==ADMIN_WORKER&&(w.bindings??[]).some(b=>b.type==='ratelimit'&&b.namespace_id===namespace)))throw new Error('Rate-limit namespace collision');
  const db=publicConfig.env.staging.d1_databases;
  return {$schema:base.$schema,name:base.name,main:base.main,compatibility_date:base.compatibility_date,compatibility_flags:['nodejs_compat'],account_id:inventory.account_id,workers_dev:false,preview_urls:false,
    env:{staging:{name:ADMIN_WORKER,workers_dev:true,preview_urls:false,routes:[],assets:structuredClone(base.assets),
      vars:{ENVIRONMENT:'staging',ADMIN_ENABLED:'true',IMAGE_UPLOADS_ENABLED:String(images),ADMIN_ORIGIN:expected,ACCESS_ISSUER:settings.issuer,ACCESS_AUD:settings.audience,PUBLIC_API_ORIGIN:`https://${STAGING_WORKER}.${inventory.subdomain}.workers.dev`},
      d1_databases:db,...(images?{r2_buckets:[{binding:'IMAGES',bucket_name:settings.bucketName}],images:{binding:'IMAGE_PROCESSOR'}}:{}),services:[{binding:'PUBLIC_API',service:STAGING_WORKER}],ratelimits:structuredClone(base.env.staging.ratelimits),...(images?{triggers:{crons:['23 3 * * *']}}:{})}}};
}
async function main(){const root=fileURLToPath(new URL('../',import.meta.url));const read=name=>readFile(root+name,'utf8').then(JSON.parse);
  const base=await read('wrangler.jsonc'),inventory=await read('.staging/inventory.json');
  const config=adminStagingConfig(await read('wrangler.admin.jsonc'),base,inventory,await read('.staging/admin-inventory.json'),await read('.staging/admin-settings.json'));
  const publicConfig=buildStagingConfig(base,inventory);if(config.env.staging.r2_buckets)publicConfig.env.staging.r2_buckets=structuredClone(config.env.staging.r2_buckets);assertStagingConfig(publicConfig,inventory);
  if(process.argv.includes('--check')){
    if(JSON.stringify(await read('wrangler.admin.staging.generated.jsonc'))!==JSON.stringify(config)||JSON.stringify(await read('wrangler.staging.generated.jsonc'))!==JSON.stringify(publicConfig))throw new Error('Reviewed configurations differ');
    console.log('PASS verified Phase 5 staging configurations; no deployment');
  }else{await writeFile(root+'wrangler.admin.staging.generated.jsonc',JSON.stringify(config,null,2)+'\n');await writeFile(root+'wrangler.staging.generated.jsonc',JSON.stringify(publicConfig,null,2)+'\n');console.log('Prepared verified staging-only admin/public configurations; photo bindings included only when explicitly enabled; no resource or deployment change');}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main().catch(()=>{console.error('Admin staging not prepared: verified Access organization/application, private R2, domain and local settings are required. No credentials printed.');process.exitCode=1;});
