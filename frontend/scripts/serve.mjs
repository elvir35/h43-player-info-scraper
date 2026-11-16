import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json'};
const server=createServer(async(req,res)=>{try{
  let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/'||path.endsWith('/'))path+=path==='/'?'preview/p11/index.html':'index.html';
  const file=resolve(root,'.'+path);if(!file.startsWith(resolve(root)+sep))throw new Error('Path');
  const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end('Not found');}});
const port=Number(process.env.H43_PREVIEW_PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid preview port');
server.listen(port,'localhost',()=>console.log(`Frontend preview: http://localhost:${port}/preview/p11/`));
