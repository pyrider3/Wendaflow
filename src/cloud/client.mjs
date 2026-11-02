export async function cloudRequest(base,path,body,owner){const response=await fetch(`${base}/cloud/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{...(owner?{'X-Cloud-User':owner}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const result=await response.json();if(!response.ok){const error=new Error(result.error||'云端请求失败');error.status=response.status;throw error;}return result;}
function outbox(operation){return new Promise((resolve,reject)=>{const req=indexedDB.open('wendaflow-cloud-outbox',1);req.onupgradeneeded=()=>req.result.createObjectStore('jobs',{keyPath:'key'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('jobs','readwrite');let value;operation(tx.objectStore('jobs'),v=>value=v);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
export const queuedJobs=()=>outbox((s,set)=>{const r=s.getAll();r.onsuccess=()=>set(r.result);});
export const putJob=job=>outbox(s=>s.put(job));
export const removeJob=key=>outbox(s=>s.delete(key));
export const signature=(name,state)=>JSON.stringify({name,nodes:state.nodes,collapsedIds:state.collapsedIds||[]});
export function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function fingerprint(name,state){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature(name,state)));return [...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,'0')).join('');}
