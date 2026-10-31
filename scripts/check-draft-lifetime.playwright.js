async page=>{
 const picker=()=>page.getByRole('dialog',{name:'切换画布',exact:true});
 await page.locator('.app-shell').waitFor();await page.keyboard.press('Escape');
 await page.locator('.save-button').click();await page.getByRole('button',{name:'已保存到浏览器',exact:true}).waitFor();
 await page.getByRole('switch',{name:'快速思维'}).click();
 const create=async(text)=>{await page.getByRole('button',{name:'新建画布',exact:true}).click();await page.locator('.workspace-loading').waitFor({state:'detached'});await page.mouse.dblclick(450,320);const edit=page.getByRole('textbox',{name:'编辑想法',exact:true});await edit.fill(text);await edit.press('Enter');return await page.locator('[data-canvas-tab-id].active').getAttribute('data-canvas-tab-id');};
 const a=await create('未保存草稿一'),b=await create('未保存草稿二');
 await page.locator(`[data-canvas-tab-id="${a}"] i`).click();await page.locator(`[data-canvas-tab-id="${a}"]`).waitFor({state:'detached'});
 await page.getByRole('article',{name:'未保存草稿二',exact:true}).waitFor();
 await page.locator(`[data-canvas-tab-id="${b}"] i`).click();await page.locator(`[data-canvas-tab-id="${b}"]`).waitFor({state:'detached'});
 await page.getByRole('button',{name:'所有画布',exact:true}).click();await picker().waitFor();if(await picker().getByRole('listitem').count()!==1)throw Error('Closed drafts remain in picker');
 await picker().getByRole('button',{name:'管理画布',exact:true}).click();const manager=page.getByRole('dialog',{name:'管理画布',exact:true});if(await manager.getByRole('button',{name:/打开画布 新画布/}).count())throw Error('Closed drafts remain in management');await manager.getByRole('button',{name:'回收站',exact:true}).click();if(await manager.getByRole('button',{name:/查看已删除画布/}).count())throw Error('Drafts moved to trash');
 await page.reload();await page.locator('.app-shell').waitFor();if(await picker().isVisible())await page.keyboard.press('Escape');
 const saved=await create('保存后保留');await page.locator('.save-button').click();await page.getByRole('button',{name:'已保存到浏览器',exact:true}).waitFor();await page.locator(`[data-canvas-tab-id="${saved}"] i`).click();await page.getByRole('button',{name:'所有画布',exact:true}).click();await picker().getByRole('button',{name:'打开画布 新画布 1',exact:true}).click();await page.getByRole('article',{name:'保存后保留',exact:true}).waitFor();
 return 'PASS: two edited unsaved drafts discarded on active/inactive close, absent from picker/manager/trash after reload; saved canvas remains and reopens with content';
}
