import {test} from 'node:test';import assert from 'node:assert/strict';import {productionOrigin} from '../scripts/smoke-production.mjs';
test('production smoke accepts only an exact production workers.dev HTTPS origin',()=>{
 assert.equal(productionOrigin('https://h43-youth-api-production.example.workers.dev'),'https://h43-youth-api-production.example.workers.dev');
 for(const value of ['https://h43-youth-api-staging.example.workers.dev','http://h43-youth-api-production.example.workers.dev','https://user@h43-youth-api-production.example.workers.dev','https://h43-youth-api-production.example.workers.dev/path','https://h43-youth-api-production.example.workers.dev?secret=x','https://h43-youth-api-production.example.workers.dev#x','https://h43-youth-api-production.example.workers.dev.evil.invalid'])assert.throws(()=>productionOrigin(value));
});
