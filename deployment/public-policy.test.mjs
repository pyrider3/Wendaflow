import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicEndpoint,publicRequestAllowed} from './public-policy.mjs';
test('public backend exposes streaming and health only',()=>{
 assert.ok(publicRequestAllowed('POST','/stream'));
 assert.ok(publicRequestAllowed('GET','/health'));
 for(const path of ['/agent/start','/agent','/codex','/canvases','/canvases/save','/pick-directory','/open-directory','/stream?path=/agent/start']){
  assert.equal(publicRequestAllowed('POST',path),false);
  assert.equal(publicRequestAllowed('GET',path),false);
 }
});
test('public endpoints reject local networks, arbitrary domains, credentials and custom ports',()=>{
 for(const value of ['http://api.openai.com/v1','https://127.0.0.1/v1','https://169.254.169.254/v1','https://localhost/v1','https://api.openai.com.evil.test/v1','https://api.openai.com:4318/v1','https://user:secret@api.openai.com/v1','https://api.openai.com/v1?next=http://127.0.0.1','https://api.qnjyxh.xyz/v1'])assert.throws(()=>validatePublicEndpoint(value));
 assert.equal(validatePublicEndpoint('https://api.deepseek.com/v1').hostname,'api.deepseek.com');
 assert.equal(validatePublicEndpoint('https://api.openai.com/v1').protocol,'https:');
});
