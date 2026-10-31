async page=>{
 const button=name=>page.getByRole('button',{name,exact:true});
 const dialog=()=>page.getByRole('dialog',{name:'切换画布',exact:true});
 if(await dialog().isVisible()){await page.keyboard.press('Escape');await dialog().waitFor({state:'detached'});}
 if(await page.getByRole('switch',{name:'快速思维'}).getAttribute('aria-checked')!=='true')await page.getByRole('switch',{name:'快速思维'}).click();
 await page.mouse.dblclick(380,270);const edit=page.getByRole('textbox',{name:'编辑想法',exact:true});await edit.fill('文字卡片可以自由调整大小');await edit.press('Enter');
 const card=page.getByRole('article',{name:'文字卡片可以自由调整大小',exact:true});await card.waitFor();const before=await card.boundingBox();const handle=await card.getByRole('button',{name:'调整卡片大小',exact:true}).boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+120,handle.y+handle.height/2+65,{steps:8});await page.mouse.up();
 const after=await card.boundingBox();if(after.width<before.width+80||after.height<before.height+40)throw Error('Plain text resize did not change width and height');
 await page.mouse.click(900,560);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#e4efe8';ctx.fillRect(0,0,320,160);ctx.fillStyle='#356f56';ctx.font='20px sans-serif';ctx.fillText('Wendaflow image note',36,85);const blob=await new Promise(resolve=>canvas.toBlob(resolve));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);});
 await page.keyboard.press('Control+v');await page.locator('.media-thought-editor img').waitFor({state:'visible'});await edit.waitFor({state:'visible'});
 if(!await edit.evaluate(el=>el===document.activeElement))throw Error('Pasted image caption did not receive focus');
 if(await edit.inputValue()!=='')throw Error('Filename must not become caption');
 await edit.fill('粘贴后马上补充说明');await page.screenshot({path:'reviews/image-caption-editing-20261030.png',animations:'disabled'});await edit.press('Enter');
 const imageCard=page.getByRole('article',{name:'粘贴后马上补充说明',exact:true});await imageCard.waitFor();if((await imageCard.innerText()).includes('image.png'))throw Error('Filename leaked into image card');
 await imageCard.locator('h2').dblclick();await edit.fill('图片文字可以再次编辑');await edit.press('Enter');
 await page.getByRole('article',{name:'图片文字可以再次编辑',exact:true}).locator('h2').click();await page.keyboard.press('Delete');await page.locator('.undo-toast').waitFor({state:'visible'});await page.locator('.undo-toast').waitFor({state:'detached',timeout:6000});
 await page.keyboard.press('Control+z');await page.getByRole('article',{name:'图片文字可以再次编辑',exact:true}).waitFor();
 await page.locator('.save-button').click();await button('已保存到浏览器').waitFor();await page.reload();await page.getByRole('article',{name:'图片文字可以再次编辑',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'切换画布侧栏',exact:true}).count())throw Error('Sidebar toggle must be removed');
 return 'PASS: text resize, clipboard image, immediate caption focus, no filename, re-edit caption, expiring delete toast, undo after expiry, reload persistence';
}
