import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWithImages} from '../dist/admin.js';
const jpeg=new Uint8Array([255,216,255,217]);
const webp=new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80]);
const body=bytes=>new Response(bytes).body;
function fixture({input={format:'image/jpeg',width:1200,height:800},output={format:'image/webp',width:1200,height:800},bytes=webp,contentType='image/webp',failure}={}){
  const calls={info:0,transforms:0};
  const processor={async info(){return ++calls.info===1?input:output;},input(){return {transform(options){assert.deepEqual(options,{width:1600,height:1600,fit:'scale-down'});return {async output(options){calls.transforms++;assert.deepEqual(options,{format:'image/webp',quality:85,anim:false});if(failure)throw failure;return {response:()=>new Response(bytes,{headers:{'Content-Type':contentType}})};}};}};}};
  return {processor,calls};
}
test('Images processes each upload once, validates output and emits WebP for private storage',async()=>{
  const f=fixture();const result=await normalizeWithImages(body(jpeg),f.processor);assert.equal(result.contentType,'image/webp');assert.deepEqual(result.bytes,webp);assert.equal(result.width,1200);assert.equal(f.calls.transforms,1);assert.equal(f.calls.info,2);
});
test('invalid JPEG, oversized bodies and invalid dimensions never start a transformation',async()=>{
  for(const bytes of [new Uint8Array([1,2,3]),new Uint8Array(2*1024*1024+1)]){const f=fixture();await assert.rejects(normalizeWithImages(body(bytes),f.processor));assert.equal(f.calls.transforms,0);}
  for(const input of [{format:'image/svg+xml'},{format:'image/jpeg',width:0,height:2},{format:'image/jpeg',width:9999,height:2},{format:'image/jpeg',width:2048,height:2048}]){const f=fixture({input});await assert.rejects(normalizeWithImages(body(jpeg),f.processor),e=>e.status===422);assert.equal(f.calls.transforms,0);}
});
test('service/quota failures never fall back to the original or a CPU-heavy encoder',async()=>{
  for(const failure of [Object.assign(new Error('private upstream details'),{code:9422}),new Error('not enabled')]){const f=fixture({failure});await assert.rejects(normalizeWithImages(body(jpeg),f.processor),e=>e.status===503&&e.code==='IMAGE_PROCESSING_UNAVAILABLE');assert.equal(f.calls.transforms,1);}
});
test('unexpected format, oversized output and excessive output dimensions are rejected',async()=>{
  for(const options of [{contentType:'image/jpeg'},{bytes:new Uint8Array(3*1024*1024+1)},{bytes:new Uint8Array([1,2,3])},{output:{format:'image/webp',width:1601,height:800}}]){const f=fixture(options);await assert.rejects(normalizeWithImages(body(jpeg),f.processor));}
});
