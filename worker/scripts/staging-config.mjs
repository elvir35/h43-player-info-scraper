import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export const STAGING_WORKER="h43-youth-api-staging";
export const STAGING_DATABASE="h43-youth-staging";
export const STAGING_ASSETS={directory:"../frontend/dist",run_worker_first:["/api/*"],not_found_handling:"none"};
export function buildStagingConfig(base,inventory){
  if(!/^[a-f0-9]{32}$/.test(inventory.account_id??""))throw new Error("Verified account inventory is required");
  if(!/^[a-z0-9-]+$/.test(inventory.subdomain??""))throw new Error("Verified workers.dev subdomain is required");
  const databases=inventory.databases.filter(d=>d.name===STAGING_DATABASE);
  if(databases.length!==1 || !/^[a-f0-9-]{36}$/.test(databases[0].id))throw new Error("A dedicated verified staging D1 database is required");
  const db=databases[0];
  if((inventory.workers??[]).some(w=>![STAGING_WORKER,'h43-youth-admin-staging'].includes(w.name) && (w.bindings??[]).some(b=>b.type==="d1" && b.database_id===db.id)))
    throw new Error("Staging database is bound to another Worker; isolation not established");
  const namespace=base.env.staging.ratelimits[0].namespace_id;
  if((inventory.workers??[]).some(w=>w.name!==STAGING_WORKER && (w.bindings??[]).some(b=>b.type==="ratelimit" && b.namespace_id===namespace)))
    throw new Error("Staging rate-limit namespace collides with another Worker");
  return {
    $schema:base.$schema,name:base.name,main:base.main,compatibility_date:base.compatibility_date,
    account_id:inventory.account_id,workers_dev:false,preview_urls:false,
    env:{staging:{...structuredClone(base.env.staging),name:STAGING_WORKER,workers_dev:true,preview_urls:false,routes:[],
      assets:structuredClone(STAGING_ASSETS),
      vars:{ENVIRONMENT:"staging",ALLOWED_ORIGINS:"https://www.h43lund.se,https://h43lund.se,http://localhost:3000",PUBLIC_API_ENABLED:"true"},
      d1_databases:[{binding:"DB",database_name:db.name,database_id:db.id,migrations_dir:"migrations"}]}}
  };
}
export function assertStagingConfig(config,inventory){
  const expected=buildStagingConfig(JSON.parse(JSON.stringify(config)),inventory);
  if(Object.keys(config.env).join()!=="staging" || config.env.staging.name!==STAGING_WORKER
      || config.account_id!==inventory.account_id || config.env.staging.routes?.length!==0
      || JSON.stringify(config.env.staging.assets)!==JSON.stringify(STAGING_ASSETS)
      || JSON.stringify(config.env.staging.d1_databases)!==JSON.stringify(expected.env.staging.d1_databases)
      || config.env.staging.vars.ENVIRONMENT!=="staging"
      || (config.env.staging.r2_buckets && JSON.stringify(config.env.staging.r2_buckets)!==JSON.stringify([{binding:'IMAGES',bucket_name:'h43-youth-images-staging'}]))
      || Object.keys(config.env.staging.vars).some(k=>/TOKEN|SECRET|PASSWORD/.test(k)))throw new Error("Not an isolated staging deployment configuration");
}
async function main(){
  const root=fileURLToPath(new URL("../",import.meta.url));
  const base=JSON.parse(await readFile(root+"wrangler.jsonc","utf8"));
  const inventory=JSON.parse(await readFile(root+".staging/inventory.json","utf8"));
  const output=root+"wrangler.staging.generated.jsonc";
  if(process.argv[2]==="--check"){
    assertStagingConfig(JSON.parse(await readFile(output,"utf8")),inventory);
    console.log("PASS isolated staging configuration; no deployment performed");
  }else{
    let prior;try{prior=JSON.parse(await readFile(output,'utf8'));}catch{}
    if(prior?.env?.staging?.r2_buckets)throw new Error('Use admin-staging-config.mjs to preserve verified Phase 5 image bindings');
    const config=buildStagingConfig(base,inventory);
    assertStagingConfig(config,inventory);
    await writeFile(output,JSON.stringify(config,null,2)+"\n");
    console.log("Prepared staging-only configuration from verified resource inventory; no deployment performed");
    console.log(`Planned URL: https://${STAGING_WORKER}.${inventory.subdomain}.workers.dev`);
  }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  main().catch(()=>{console.error("Staging configuration could not be prepared/verified; inspect resource metadata (no secrets printed)");process.exitCode=1;});
}
