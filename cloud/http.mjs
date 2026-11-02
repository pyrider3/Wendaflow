import {CloudStore,CloudError} from './store.mjs';
export function cloudApi({root,origin,secure=true}){
 const store=new CloudStore(root),limits=new Map();let activeAuth=0;
 const cookie=(value,maxAge=2592000)=>`${secure?'__Host-':''}wendaflow_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
 const read=async req=>{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>13*1024*1024)throw new CloudError(413,'请求过大');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new CloudError(400,'JSON 数据无效');}};
 const throttle=(req,auth,uid)=>{const ip=req.headers['x-real-ip']||req.socket.remoteAddress||'unknown',key=(uid?'user:':auth?'auth:':'api:')+(uid||ip),now=Date.now(),entry=limits.get(key);const next=entry&&entry.until>now?entry:{count:0,until:now+60000};next.count++;limits.set(key,next);if(limits.size>10000)for(const [k,v]of limits)if(v.until<=now)limits.delete(k);if(next.count>(uid?240:auth?10:1000))throw new CloudError(429,'请求过于频繁，请稍后重试');};
 return {store,async handle(req,res){if(!req.url?.startsWith('/cloud/'))return false;
 try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname.slice(7),write=req.method==='POST';
 if(!['GET','POST'].includes(req.method))throw new CloudError(405,'请求方法不支持');
 if((req.headers.origin&&req.headers.origin!==origin)||(write&&req.headers.origin!==origin))throw new CloudError(403,'来源不允许');
 if(req.headers['sec-fetch-site']==='cross-site')throw new CloudError(403,'来源不允许');
 if(write&&!String(req.headers['content-type']||'').startsWith('application/json'))throw new CloudError(415,'需要 JSON 请求');
 const auth=['register','login','recover'].includes(path);throttle(req,auth);
 const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${secure?'__Host-':''}wendaflow_session=`))?.split('=')[1];
 if(path==='session'&&!write){send(res,200,{user:store.authenticate(value)});return true;}
 if(auth&&write){if(activeAuth>=4)throw new CloudError(429,'登录服务繁忙，请稍后重试');activeAuth++;try{const b=await read(req);let result;
 if(path==='register')result=await store.register(b.username,b.password);
 else if(path==='recover')result=await store.recover(b.username,b.recoveryKey,b.password);
 else result={user:await store.login(b.username,b.password)};
 send(res,200,result,{'Set-Cookie':cookie(store.session(result.user))});return true;}finally{activeAuth--;}}
 const user=store.authenticate(value);if(!user)throw new CloudError(401,'请先登录个人云端账号');
 if(req.headers['x-cloud-user']!==user.id)throw new CloudError(409,'账号已在其他页面切换，请刷新后重新登录');throttle(req,false,user.id);
 if(path==='logout'&&write){store.logout(value);send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});return true;}
 if(path==='documents'&&!write){send(res,200,{documents:store.list(user.id)});return true;}
 if(path==='backup'&&!write){
 res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="wendaflow-personal-backup.json"'});
 const chunk=async text=>{if(res.destroyed)throw Error('Download closed');if(!res.write(text))await new Promise((resolve,reject)=>{const done=()=>{res.off('close',closed);resolve();},closed=()=>{res.off('drain',done);reject(Error('Download closed'));};res.once('drain',done);res.once('close',closed);});};
 await chunk(JSON.stringify({format:'wendaflow-personal-backup',version:1,created:new Date().toISOString()}).slice(0,-1)+',"documents":[');let first=true;for(const doc of store.list(user.id)){await chunk((first?'':',')+JSON.stringify(store.get(user.id,doc.id)));first=false;}await chunk(']}');res.end();return true;}

 const match=/^documents\/([a-zA-Z0-9_-]{1,100})(?:\/(history|restore))?$/.exec(path);
 if(match){const [,id,action]=match;
 if(!write){send(res,200,action==='history'?{versions:store.history(user.id,id)}:store.get(user.id,id));return true;}
 const body=await read(req);send(res,200,action==='restore'?store.restore(user.id,id,body.revision,body.baseRevision):store.save(user.id,id,body));return true;}
 throw new CloudError(404,'接口不存在');
 }catch(e){if(res.headersSent){res.destroy();return true;}if(!(e instanceof CloudError))console.error('Cloud request failed',e);send(res,e.status||500,{error:e.status?e.message:'云端暂时不可用，请稍后重试'});return true;}
 }};
}
