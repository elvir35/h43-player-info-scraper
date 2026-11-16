import jpeg from 'jpeg-js';
import {ApiError,fail} from './validation';
async function bounded(body:ReadableStream<Uint8Array>|null,max:number){
  if(!body)fail(422,'INVALID_IMAGE');const reader=body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();fail(413,'IMAGE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
const stream=(bytes:Uint8Array)=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);controller.close();}});
function dimensions(info:ImageInfoResponse,format:string,max:number){
  if(info.format!==format||!('width' in info)||!Number.isSafeInteger(info.width)||!Number.isSafeInteger(info.height)||info.width<1||info.height<1||info.width>max||info.height>max||info.width*info.height>4000000)fail(422,'IMAGE_DIMENSIONS');
  return {width:info.width,height:info.height};
}
export async function normalizeWithImages(body:ReadableStream<Uint8Array>|null,processor:ImagesBinding){
  const bytes=await bounded(body,2*1024*1024);
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)fail(422,'INVALID_IMAGE');
  try{
    dimensions(await processor.info(stream(bytes)),'image/jpeg',2048);
    // Heavy decoding happens in Images, once per upload, never on public reads.
    // WebP output discards EXIF/GPS and other source metadata by design.
    const result=await processor.input(stream(bytes)).transform({width:1600,height:1600,fit:'scale-down'}).output({format:'image/webp',quality:85,anim:false});
    const response=result.response();if(!response.ok||response.headers.get('Content-Type')!=='image/webp')fail(503,'IMAGE_PROCESSING_UNAVAILABLE');
    const output=await bounded(response.body,3*1024*1024);
    if(output.length<12||new TextDecoder().decode(output.slice(0,4))!=='RIFF'||new TextDecoder().decode(output.slice(8,12))!=='WEBP')fail(503,'IMAGE_PROCESSING_UNAVAILABLE');
    const size=dimensions(await processor.info(stream(output)),'image/webp',1600);
    return {bytes:output,...size,contentType:'image/webp' as const};
  }catch(error){if(error instanceof ApiError)throw error;
    if(error&&typeof error==='object'&&'code' in error&&[9412,9403].includes(Number(error.code)))fail(422,'INVALID_IMAGE');
    fail(503,'IMAGE_PROCESSING_UNAVAILABLE');
  }
}
export async function normalizeJpeg(body:ReadableStream<Uint8Array>|null){
  if(!body)fail(422,'INVALID_IMAGE');const reader=body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();fail(413,'IMAGE_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  const input=new Uint8Array(length);let offset=0;for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.length;}
  if(length<4||input[0]!==255||input[1]!==216||input[length-2]!==255||input[length-1]!==217)fail(422,'INVALID_IMAGE');
  try{
    const decoded=jpeg.decode(input,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:48});
    if(decoded.width<1||decoded.height<1||decoded.width>2048||decoded.height>2048||decoded.width*decoded.height>4000000)fail(422,'IMAGE_DIMENSIONS');
    // Full decode and re-encode removes EXIF/GPS, trailing data and source metadata.
    const bytes=jpeg.encode({width:decoded.width,height:decoded.height,data:decoded.data},85).data;
    if(bytes.length>3*1024*1024)fail(413,'IMAGE_TOO_LARGE');return {bytes,width:decoded.width,height:decoded.height,contentType:'image/jpeg' as const};
  }catch(error){if(error instanceof ApiError)throw error;fail(422,'INVALID_IMAGE');}
}
