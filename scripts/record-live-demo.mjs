import { chromium, expect } from '@playwright/test';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const origin='https://momenta-hacktx.vercel.app';
await mkdir('output/demo/raw',{recursive:true});await mkdir('.data',{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},recordVideo:{dir:'output/demo/raw',size:{width:1280,height:900}}});
const page=await context.newPage();const failures=[];page.on('pageerror',e=>failures.push(e.message));
const pause=()=>page.waitForTimeout(1800);
async function picture(){await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth>100),{},{timeout:30000});}
try{
 await page.goto(origin,{waitUntil:'networkidle'});await pause();
 await page.getByRole('button',{name:'Try a sample memory'}).click();
 await expect(page.getByLabel('Give this memory a title')).toHaveValue('The day you let go');await pause();
 await page.getByRole('button',{name:'Save & review the scene'}).click();
 await expect(page).toHaveURL(/\/memory\//,{timeout:30000});const authorUrl=page.url();
 await page.getByRole('button',{name:'Review the scene',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Does this feel like your memory?'})).toBeVisible({timeout:180000});
 console.log(JSON.stringify({stage:'production-scene',success:true}));await pause();
 await page.getByRole('checkbox').check();const generationStart=Date.now();
 await page.getByRole('button',{name:'Illustrate this memory'}).click();
 await expect(page.getByText('1 saved illustration',{exact:true})).toBeVisible({timeout:270000});await picture();
 console.log(JSON.stringify({stage:'production-generation',success:true,seconds:(Date.now()-generationStart)/1000}));await pause();
 await page.getByLabel('What would bring it closer?').fill('Make the parking lot feel much bigger, and put Dad farther behind me. Keep each person shown only once.');await pause();
 const editStart=Date.now();await page.getByRole('button',{name:'Make this change'}).click();
 await expect(page.getByText('2 saved illustrations',{exact:true})).toBeVisible({timeout:270000});await picture();
 console.log(JSON.stringify({stage:'production-edit',success:true,seconds:(Date.now()-editStart)/1000}));await pause();
 await page.getByRole('button',{name:'Share this illustration'}).click();
 await page.getByLabel('A few words to go with it').fill('A fictional sample memory: I remember the parking lot feeling enormous. When I looked back, you had let go, and I was riding all by myself.');
 await page.getByRole('button',{name:'Publish this memory'}).click();
 const link=page.getByRole('textbox',{name:'Share link',exact:true});await expect(link).toBeVisible({timeout:30000});
 const shareUrl=new URL(await link.inputValue(),origin).href;
 const authorCookies=await context.cookies();await context.storageState({path:'.data/production-demo-browser.json'});
 await pause();await context.clearCookies();await page.goto(shareUrl);
 await expect(page.getByRole('heading',{name:'The day you let go'})).toBeVisible({timeout:30000});await picture();await pause();
 await page.getByLabel('Your name',{exact:true}).fill('Dad (sample)');
 await page.getByLabel('Your question or reflection').fill('Were you scared when you realized I had let go?');
 await page.getByRole('button',{name:'Leave your message'}).click();
 await expect(page.locator('article.message').getByText('Were you scared when you realized I had let go?',{exact:true})).toBeVisible({timeout:30000});
 await context.addCookies(authorCookies);await page.goto(authorUrl);
 await expect(page.getByRole('heading',{name:'A little closer to how it felt.'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Share & connect'}).click();
 await page.getByLabel('Reply to Dad (sample)').fill('Sample reply: for a moment, then I realized I could do it myself.');
 await page.getByRole('button',{name:'Send reply'}).click();
 await expect(page.locator('.reply').getByText('Sample reply: for a moment, then I realized I could do it myself.',{exact:true})).toBeVisible({timeout:30000});
 await pause();await context.clearCookies();await page.goto(shareUrl);
 await expect(page.getByText('Sample reply: for a moment, then I realized I could do it myself.',{exact:true})).toBeVisible({timeout:30000});await picture();
 await page.screenshot({path:'output/demo/production-recipient.png',fullPage:true});await pause();
 await writeFile('.data/production-demo.json',JSON.stringify({authorUrl,shareUrl,fictional:true}),{mode:0o600});
 console.log(JSON.stringify({stage:'production-share-and-human-exchange',success:true,shareUrl,browserErrors:failures}));
}finally{
 const video=page.video();await context.close();await browser.close();
 if(video){await copyFile(await video.path(),'output/demo/momenta-walkthrough.webm');console.log(JSON.stringify({recording:'output/demo/momenta-walkthrough.webm',audio:false}));}
}
