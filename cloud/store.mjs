import {DatabaseSync,backup} from 'node:sqlite';
import {randomBytes,createHash,scrypt as derive,timingSafeEqual,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
const scrypt=promisify(derive),hash=s=>createHash('sha256').update(s).digest('hex'),token=()=>randomBytes(32).toString('base64url');
export class CloudError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new CloudError(status,message);};
export class CloudStore{
 constructor(root){mkdirSync(root,{recursive:true,mode:0o700});this.root=root;this.db=new DatabaseSync(join(root,'personal.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA max_page_count=524288; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,recovery TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS documents(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,updated TEXT NOT NULL,PRIMARY KEY(user_id,id));
 CREATE TABLE IF NOT EXISTS versions(user_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,deleted INTEGER NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(user_id,id,revision));`);}
 async password(value){if(typeof value!=='string'||value.length<12||value.length>256)fail(400,'密码须为 12–256 个字符');const salt=token();return salt+':'+(await scrypt(value,salt,64)).toString('hex');}
 async verify(value,stored){if(typeof value!=='string'||value.length>256)return false;const [salt,key]=stored.split(':');const actual=await scrypt(value,salt,64);return timingSafeEqual(actual,Buffer.from(key,'hex'));}
 user(row){return row?{id:row.id,username:row.username}:null;}
 async register(username,password){if(typeof username!=='string'||!/^[a-zA-Z0-9_-]{3,32}$/.test(username))fail(400,'用户名须为 3–32 位字母、数字、下划线或连字符');if(this.db.prepare('SELECT COUNT(*) AS n FROM users').get().n>=1000)fail(503,'个人云端试运营账号已满，请稍后再试');const encoded=await this.password(password),recoveryKey=token(),id=randomUUID();try{this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,username.toLowerCase(),encoded,hash(recoveryKey),new Date().toISOString());}catch(e){if(e.code?.includes('CONSTRAINT')||e.message.includes('UNIQUE'))fail(409,'该用户名不可用');throw e;}return {user:{id,username:username.toLowerCase()},recoveryKey};}
 async login(username,password){const row=this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username).toLowerCase());const dummy='dummy:'+Buffer.alloc(64).toString('hex');if(!await this.verify(password,row?.password||dummy)||!row)fail(401,'用户名或密码不正确');return this.user(row);}
 session(user){const value=token();this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(value),user.id,Date.now()+30*86400000);return value;}
 authenticate(value){if(!value)return null;return this.user(this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hash(value),Date.now()));}
 logout(value){this.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(value||''));}
 async recover(username,key,password){const row=this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username).toLowerCase());if(typeof key!=='string'||!row||!timingSafeEqual(Buffer.from(hash(key)),Buffer.from(row.recovery)))fail(401,'用户名或恢复密钥不正确');const encoded=await this.password(password),recoveryKey=token();this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('UPDATE users SET password=?,recovery=? WHERE id=?').run(encoded,hash(recoveryKey),row.id);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return{user:this.user(row),recoveryKey};}
 list(uid){return this.db.prepare('SELECT id,name,revision,deleted,updated FROM documents WHERE user_id=? ORDER BY updated DESC').all(uid);}
 get(uid,id){const row=this.db.prepare('SELECT * FROM documents WHERE user_id=? AND id=?').get(uid,id);if(!row)fail(404,'画布不存在');return this.decode(row);}
 decode(row){return{id:row.id,name:row.name,revision:row.revision,deleted:!!row.deleted,updated:row.updated,state:JSON.parse(row.body)};}
 validate(state){if(!state||!Array.isArray(state.nodes)||state.nodes.length>10000)fail(400,'画布数据无效或节点过多');if(state.nodes.some(n=>!n||typeof n.id!=='string'||!Number.isFinite(n.x)||!Number.isFinite(n.y)))fail(400,'节点数据无效');const body=JSON.stringify({nodes:state.nodes,selectedId:state.selectedId||null,collapsedIds:Array.isArray(state.collapsedIds)?state.collapsedIds:[],viewport:state.viewport||{x:20,y:20,zoom:.9}});if(Buffer.byteLength(body)>12*1024*1024)fail(413,'单张画布含附件最大 12 MB，请缩小图片或拆分画布');return body;}
 save(uid,id,{name,state,baseRevision,deleted=false}){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail(400,'画布 ID 无效');if(typeof name!=='string'||!name.trim()||name.length>160)fail(400,'画布名称须为 1–160 个字符');if(!Number.isInteger(baseRevision)||baseRevision<0)fail(400,'缺少有效的基础版本');const body=this.validate(state);this.db.exec('BEGIN IMMEDIATE');try{
 const old=this.db.prepare('SELECT * FROM documents WHERE user_id=? AND id=?').get(uid,id);if((old?.revision||0)!==baseRevision)fail(409,'云端已有更新。本地内容已保留，请载入云端版本或另存副本');
 const usage=this.db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(body AS BLOB))),0) AS bytes FROM documents WHERE user_id=?').get(uid);
 if(!old&&usage.count>=200)fail(413,'个人空间最多 200 张画布');if(usage.bytes-Buffer.byteLength(old?.body||'')+Buffer.byteLength(body)>100*1024*1024)fail(413,'个人空间已达到 100 MB，请导出并清理画布');
 if(old&&old.body===body&&old.name===name.trim()&&!!old.deleted===!!deleted){this.db.exec('COMMIT');return this.decode(old);}
 const revision=baseRevision+1,updated=new Date().toISOString();
 this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,revision=excluded.revision,body=excluded.body,deleted=excluded.deleted,updated=excluded.updated').run(uid,id,name.trim(),revision,body,Number(!!deleted),updated);
 this.db.prepare('INSERT INTO versions VALUES(?,?,?,?,?,?,?)').run(uid,id,revision,name.trim(),body,Number(!!deleted),updated);
 // Keep 30 revisions and cap each canvas history to 24 MB (always retain latest).
 let bytes=0;for(const v of this.db.prepare('SELECT revision,length(CAST(body AS BLOB)) AS size FROM versions WHERE user_id=? AND id=? ORDER BY revision DESC').all(uid,id).map((v,index)=>({...v,index}))){bytes+=v.size;if(v.index>=30||(v.index>0&&bytes>24*1024*1024))this.db.prepare('DELETE FROM versions WHERE user_id=? AND id=? AND revision=?').run(uid,id,v.revision);}
 let total=this.db.prepare('SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) AS n FROM versions WHERE user_id=?').get(uid).n;
 for(const row of this.db.prepare('SELECT v.id,v.revision,length(CAST(v.body AS BLOB)) AS size FROM versions v JOIN documents d ON d.user_id=v.user_id AND d.id=v.id WHERE v.user_id=? AND v.revision<d.revision ORDER BY v.updated ASC').all(uid)){if(total<=200*1024*1024)break;this.db.prepare('DELETE FROM versions WHERE user_id=? AND id=? AND revision=?').run(uid,row.id,row.revision);total-=row.size;}
 this.db.exec('COMMIT');return{id,name:name.trim(),revision,updated,deleted:!!deleted,state:JSON.parse(body)};
 }catch(e){this.db.exec('ROLLBACK');throw e;}}
 history(uid,id){this.get(uid,id);return this.db.prepare('SELECT revision,name,deleted,updated FROM versions WHERE user_id=? AND id=? ORDER BY revision DESC').all(uid,id);}
 restore(uid,id,revision,baseRevision){const row=this.db.prepare('SELECT * FROM versions WHERE user_id=? AND id=? AND revision=?').get(uid,id,revision);if(!row)fail(404,'历史版本不存在');return this.save(uid,id,{name:row.name,state:JSON.parse(row.body),baseRevision,deleted:false});}
 export(uid){return{format:'wendaflow-personal-backup',version:1,created:new Date().toISOString(),documents:this.list(uid).map(d=>this.get(uid,d.id))};}
 async backup(destination){await backup(this.db,destination);}
 close(){this.db.close();}
}
