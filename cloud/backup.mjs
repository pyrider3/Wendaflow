import {CloudStore} from './store.mjs';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,mkdir,readdir,unlink,rename} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export async function createBackup(root,destination,key){
 if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('WENDAFLOW_BACKUP_KEY must contain 32 random bytes as 64 hex characters');
 const temp=await mkdtemp(join(tmpdir(),'wendaflow-backup-'));let store;
 try{store=new CloudStore(root);const file=join(temp,'snapshot.sqlite');await store.backup(file);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const data=Buffer.concat([cipher.update(await readFile(file)),cipher.final()]);await writeFile(destination+'.tmp',Buffer.concat([Buffer.from('WDFBAK01'),iv,cipher.getAuthTag(),data]),{mode:0o600});await rename(destination+'.tmp',destination);}finally{store?.close();await rm(temp,{recursive:true,force:true});}
}
export async function restoreBackup(file,destination,key){
 const data=await readFile(file);if(data.subarray(0,8).toString()!=='WDFBAK01')throw Error('Not a Wendaflow encrypted backup');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),data.subarray(8,20));cipher.setAuthTag(data.subarray(20,36));const plain=Buffer.concat([cipher.update(data.subarray(36)),cipher.final()]);const temp=destination+'.restore';await writeFile(temp,plain,{mode:0o600});let db;try{db=new DatabaseSync(temp);if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup integrity check failed');db.exec('DELETE FROM sessions');db.close();db=null;await rename(temp,destination);}finally{db?.close();await rm(temp,{force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===realpathSync(process.argv[1])){
 const [command,root,target]=process.argv.slice(2),key=process.env.WENDAFLOW_BACKUP_KEY;
 if(command==='backup'){
 await mkdir(target,{recursive:true,mode:0o700});const name=`personal-${new Date().toISOString().replace(/[:.]/g,'-')}.wdfbak`;await createBackup(root,join(target,name),key);
 const files=(await readdir(target)).filter(f=>/^personal-[0-9TZ-]+\.wdfbak$/.test(f)).sort().reverse();for(const file of files.slice(14))await unlink(join(target,file));console.log('Encrypted backup completed');
 }else if(command==='restore'){
 // Restore into an empty staging directory, never onto a running database.
 await mkdir(target,{recursive:true,mode:0o700});if((await readdir(target)).length)throw Error('Restore destination must be empty; stop the service and switch directories after verification');await restoreBackup(root,join(target,'personal.sqlite'),key);console.log('Backup restored and checked. Sessions revoked.');
 }else throw Error('Usage: node cloud/backup.mjs backup DATA_DIR BACKUP_DIR | restore BACKUP_FILE EMPTY_DIR');
}
