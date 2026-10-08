import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/frames',{recursive:true});await fs.mkdir('docs',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1200,height:1080},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8124');await page.waitForFunction(()=>window.robotLab,{timeout:120000});
await page.waitForTimeout(3000);await page.screenshot({path:'docs/preview.png'});
await page.locator('#demo').click();
for(let i=0;i<32;i++){await page.waitForTimeout(120);await page.screenshot({path:`artifacts/frames/${String(i).padStart(3,'0')}.png`});}
await browser.close();
