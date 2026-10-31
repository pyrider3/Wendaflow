import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {once} from 'node:events';
let child,base;
before(async()=>{
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 base=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,WENDAFLOW_PUBLIC:'1',WENDAFLOW_PUBLIC_ORIGIN:'https://example.test',WONDERFUL_PORT:String(port)},stdio:'ignore'});
 for(let attempt=0;attempt<100;attempt++){try{const response=await fetch(base+'/health');if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}
 throw new Error('Public server did not start');
});
after(async()=>{if(child?.exitCode===null){child.kill();await once(child,'exit');}});
test('public health uses no wildcard CORS',async()=>{const r=await fetch(base+'/health');assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),null);});
test('real public server blocks archives and all command routes',async()=>{
 for(const path of ['/canvases','/canvases/save','/agent/start','/codex','/open-directory','/agent/artifact?job=x&index=0']){
  const r=await fetch(base+path,{method:path==='/canvases'?'GET':'POST',headers:{'content-type':'application/json'},body:path==='/canvases'?undefined:'{}'});assert.equal(r.status,403,path);
 }
});
test('cross-origin and form requests cannot call the gateway',async()=>{
 const a=await fetch(base+'/stream',{method:'POST',headers:{origin:'https://elsewhere.test','content-type':'application/json'},body:'{}'});assert.equal(a.status,403);
 const b=await fetch(base+'/stream',{method:'POST',body:'{}'});assert.equal(b.status,415);
});
test('streaming denies missing visitor keys and internal endpoints before fetching',async()=>{
 for(const data of [{endpoint:'https://api.openai.com/v1'},{endpoint:'http://127.0.0.1:3000',apiKey:'test-key'}]){
  const r=await fetch(base+'/stream',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,400);
 }
});
