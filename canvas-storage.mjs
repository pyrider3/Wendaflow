import path from 'node:path';
import {mkdir,readFile,writeFile,rename,readdir,copyFile,rm,stat,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export function canvasStorage(root){
 const queues=new Map(),dir=path.join(root,'data','canvases'),trash=path.join(root,'data','canvas-trash'),versions=path.join(root,'data','canvas-history');
 const valid=id=>{if(!/^[a-zA-Z0-9_-]+$/.test(id||''))throw new Error('Invalid canvas ID');return id;};
 const serial=(id,fn)=>{const task=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(id,task);return task.finally(()=>{if(queues.get(id)===task)queues.delete(id);});};
 async function atomic(file,payload){await mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${randomUUID()}.tmp`;let handle;try{handle=await open(tmp,'wx');await handle.writeFile(JSON.stringify(payload,null,2),'utf8');await handle.sync();await handle.close();handle=null;await rename(tmp,file);}finally{await handle?.close();await rm(tmp,{force:true});}}
 return {
 save(payload){const id=valid(payload.canvas?.id);return serial(id,async()=>{const file=path.join(dir,`${id}.wdf`);await mkdir(versions,{recursive:true});try{await stat(file);await copyFile(file,path.join(versions,`${id}-${Date.now()}-${randomUUID()}.wdf`));}catch(e){if(e.code!=='ENOENT')throw e;}await atomic(file,{...payload,format:'branchspace-wdf',version:1});const old=(await readdir(versions)).filter(name=>new RegExp('^'+id+'-[0-9]+-').test(name)).sort().reverse();await Promise.all(old.slice(10).map(name=>rm(path.join(versions,name),{force:true}))); });},
 trash(id,hydrate){valid(id);return serial(id,async()=>{if(hydrate){const file=path.join(dir,`${id}.wdf`),payload=JSON.parse(await readFile(file,'utf8'));await atomic(file,await hydrate(payload));}await mkdir(trash,{recursive:true});const token=`${id}-${Date.now()}-${randomUUID()}`;await rename(path.join(dir,`${id}.wdf`),path.join(trash,`${token}.wdf`));return token;});},
 async listTrash(){await mkdir(trash,{recursive:true});const result=[];for(const file of await readdir(trash)){if(!file.endsWith('.wdf'))continue;try{const p=JSON.parse(await readFile(path.join(trash,file),'utf8'));const token=file.slice(0,-4),stamp=Number(token.split('-').at(-6));result.push({token,id:p.canvas?.id,name:p.canvas?.name||'Canvas',deletedAt:Number.isFinite(stamp)?new Date(stamp).toISOString():null});}catch{}}return result;},
 restore(token){valid(token);return serial(token,async()=>{const file=path.join(trash,`${token}.wdf`),p=JSON.parse(await readFile(file,'utf8'));const id=`restored-${randomUUID()}`;p.canvas={...p.canvas,id,restoredFrom:p.canvas?.id,restoredAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await atomic(path.join(dir,`${id}.wdf`),p);await rm(file);return p.canvas;});}
 };
}
