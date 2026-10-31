async page=>{
 const d=()=>page.getByRole('dialog',{name:'切换画布',exact:true});await page.locator('.app-shell').waitFor();if(await d().isVisible()){await page.keyboard.press('Escape');await d().waitFor({state:'detached'});}
 await page.getByRole('switch',{name:'快速思维'}).click();await page.mouse.dblclick(410,300);const editor=page.getByRole('textbox',{name:'编辑想法',exact:true});await editor.waitFor();
 const node=page.locator('.node').first(),id=await node.getAttribute('data-node-id'),x=await node.getAttribute('data-node-x');
 if(await page.locator('.quick-edit-hint').count())throw Error('Editor hint must be removed');
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=240;c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='#dbece2';ctx.fillRect(0,0,240,120);ctx.fillStyle='#356c53';ctx.font='18px sans-serif';ctx.fillText('Paste into this card',25,65);const blob=await new Promise(r=>c.toBlob(r));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);});
 await editor.press('Control+v');await page.locator('.media-thought-editor img').waitFor();if(await page.locator('.node').count()!==1||await node.getAttribute('data-node-id')!==id||await node.getAttribute('data-node-x')!==x)throw Error('Pasting into empty editor must preserve card and position');
 await editor.fill('未保存的图片说明');await editor.press('Enter');
 // A negative check deliberately spans more than the 180ms autosave debounce.
 await page.waitForTimeout(450);
 const read=async()=>page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('wonderful-canvas-store');req.onsuccess=()=>{const db=req.result,q=db.transaction('canvases').objectStore('canvases').get('canvas-main');q.onsuccess=()=>{db.close();resolve(q.result||null);};q.onerror=()=>reject(q.error);};}));
 let stored=await read();if(stored?.nodes?.some(n=>n.title==='未保存的图片说明'))throw Error('Content was autosaved before first manual save');
 await page.getByRole('button',{name:'新建画布',exact:true}).click();await page.locator('.workspace-loading').waitFor({state:'detached'});await page.getByRole('button',{name:'主画布 ×',exact:true}).click();await page.getByRole('article',{name:'未保存的图片说明',exact:true}).waitFor();
 stored=await read();if(stored?.nodes?.some(n=>n.title==='未保存的图片说明'))throw Error('Switching canvas persisted an unsaved draft');
 await page.locator('.save-button').click();await page.getByRole('button',{name:'已保存到浏览器',exact:true}).waitFor();
 await page.getByRole('article',{name:'未保存的图片说明',exact:true}).locator('h2').dblclick();await editor.fill('手动保存后自动保存');await editor.press('Enter');
 for(let poll=0;poll<30;poll++){stored=await read();if(stored?.nodes?.some(n=>n.title==='手动保存后自动保存'))break;await page.waitForTimeout(50);}
 if(!stored?.nodes?.some(n=>n.title==='手动保存后自动保存'))throw Error('Autosave did not commit after first manual save');
 await page.reload();await page.getByRole('article',{name:'手动保存后自动保存',exact:true}).waitFor();
 for(let i=0;i<8;i++){await page.getByRole('button',{name:'新建画布',exact:true}).click();await page.locator('.workspace-loading').waitFor({state:'detached'});}
 if(await page.locator('[data-canvas-tab-id]').count()<9)throw Error('Tabs are still capped');if(await page.locator('.canvas-tabs-overflow').count())throw Error('Forced overflow button should be removed');
 const tabWidth=await page.locator('.canvas-tabs').evaluate(el=>el.clientWidth);if(tabWidth<650)throw Error('Wide viewport tab space is still artificially narrow: '+tabWidth);
 await page.getByRole('button',{name:'所有画布',exact:true}).click();await d().waitFor();const rect=await d().boundingBox();if(rect.width>360||rect.height>482)throw Error('Canvas picker still too large');
 await page.screenshot({path:'reviews/canvas-picker-small-tabs-20261030.png',animations:'disabled'});
 return 'PASS: empty editor paste stays in place, hint removed, manual-first autosave, in-session draft switching, autosave reload, unlimited tabs and compact panel';
}
