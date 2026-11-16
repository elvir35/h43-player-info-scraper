import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildStagingConfig,assertStagingConfig} from "../scripts/staging-config.mjs";
import {stagingOrigin,validateContract} from "../scripts/smoke-staging.mjs";
const base=JSON.parse(await readFile(new URL("../wrangler.jsonc",import.meta.url),"utf8"));
const fixture=()=>({account_id:"a".repeat(32),subdomain:"synthetic-test",workers:[],
  databases:[{name:"h43-youth-staging",id:"11111111-1111-4111-8111-111111111111"}]});
test("generated staging configuration has no production environment/routes or embedded secret",()=>{
  const before=JSON.stringify(base);
  const config=buildStagingConfig(base,fixture());
  assertStagingConfig(config,fixture());
  assert.deepEqual(Object.keys(config.env),["staging"]);assert.deepEqual(config.env.staging.routes,[]);
  assert.equal(config.env.staging.workers_dev,true);assert.equal(JSON.stringify(base),before);
});
test("missing staging DB, shared database and conflicting limiter namespace are rejected",()=>{
  const missing=fixture();missing.databases=[];assert.throws(()=>buildStagingConfig(base,missing));
  for(const binding of [{type:"d1",database_id:fixture().databases[0].id},{type:"ratelimit",namespace_id:"43012"}]){
    const shared=fixture();shared.workers=[{name:"existing-production",bindings:[binding]}];
    assert.throws(()=>buildStagingConfig(base,shared));
  }
});
test("guard rejects a production environment or changed binding",()=>{
  const config=buildStagingConfig(base,fixture());config.env.production={};assert.throws(()=>assertStagingConfig(config,fixture()));
  const other=buildStagingConfig(base,fixture());other.env.staging.d1_databases[0].database_id="22222222-2222-4222-8222-222222222222";
  assert.throws(()=>assertStagingConfig(other,fixture()));
});

test("static staging assets cannot shadow API routes or alter production config",()=>{
  const config=buildStagingConfig(base,fixture());
  assert.deepEqual(config.env.staging.assets,{directory:"../frontend/dist",run_worker_first:["/api/*"],not_found_handling:"none"});
  assert.equal(base.env.production.assets,undefined);
  config.env.staging.assets.run_worker_first=[];
  assert.throws(()=>assertStagingConfig(config,fixture()));
});
test("smoke tooling refuses production or credential-bearing targets",()=>{
  for(const url of ["https://h43-youth-api-production.example.workers.dev","https://www.h43lund.se","https://user:secret@h43-youth-api-staging.example.workers.dev","http://h43-youth-api-staging.example.workers.dev"])
    assert.throws(()=>stagingOrigin(url));
  assert.equal(stagingOrigin("https://h43-youth-api-staging.example.workers.dev"),"https://h43-youth-api-staging.example.workers.dev");
});
test("smoke contract validator rejects extra private fields and invalid nested states",()=>{
  const value={apiVersion:"1",id:"p11",name:"P11",season:null,welcome:{title:null,description:null,heroImageUrl:null,heroAlt:null,seasonMessage:null},
    roster:{players:[],coaches:[],lastSyncedAt:null},nextMatch:null,upcomingMatches:[],playedMatches:[],upcomingEvents:[],social:{instagram:null,tiktok:null,instagramLabel:null,tiktokLabel:null},contact:{email:null,phone:null,text:null,people:[]},
    dataStatus:{roster:"withheld",calendar:"unavailable",matches:"unavailable",playedMatches:"unavailable"},
    freshness:{calendar:{lastFetchedAt:null,sourceUpdatedAt:null},matches:{lastFetchedAt:null,sourceUpdatedAt:null},scheduleCacheTtlSeconds:300}};
  validateContract(value);
  validateContract({...value,id:"f12"},"f12");
  assert.throws(()=>validateContract({...value,id:"f12"},"p11"));
  assert.throws(()=>validateContract(value,"../admin"));
  const privateValue=structuredClone(value);privateValue.roster.observed_us=1;assert.throws(()=>validateContract(privateValue));
  const badStatus=structuredClone(value);badStatus.dataStatus.roster="secret";assert.throws(()=>validateContract(badStatus));
});
