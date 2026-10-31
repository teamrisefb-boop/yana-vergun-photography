import { chromium } from 'playwright';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const base='http://127.0.0.1:4173/';
const out='test-results/motion-review';
const versions=process.argv[2]?['baseline','restored','adaptive'].filter(version=>process.argv[2]===version):['baseline','restored'];
if(!versions.length)throw new Error('Expected baseline, restored or adaptive');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const report=versions.length===1?JSON.parse(await readFile(`${out}/recordings.json`,'utf8').catch(()=>'[]')):[];
try {
  for(const mobile of [false,true])for(const version of versions) {
    const viewport=mobile?{width:390,height:844}:{width:1440,height:900};
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,
      reducedMotion:'no-preference',recordVideo:{dir:out,size:viewport}});
    // Record the historical choreography, independent of third-party CDN availability.
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/**',async route=>{
      const file=new URL(route.request().url()).pathname.split('/').pop();
      await route.fulfill({contentType:'text/javascript',body:await readFile(`assets/vendor/${file}`)});
    });
    await context.route('https://fonts.googleapis.com/**',async route=>route.fulfill({contentType:'text/css',
      body:(await readFile('assets/fonts.css','utf8')).replaceAll('font-display:optional','font-display:swap')
        .replaceAll('url(fonts/',`url(${base}assets/fonts/`)}));
    await context.route('https://yana-vergun-booking.yana-vergun-photography.workers.dev/**',r=>r.abort());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const id=`${version}-${mobile?'mobile':'desktop'}`;
    await page.goto(base+(version==='baseline'?'baseline/':''),{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(1200);
    await page.screenshot({path:`${out}/${id}-intro.png`});
    if(version!=='baseline')await page.waitForFunction(()=>document.documentElement.dataset.intro==='done');
    else await page.waitForFunction(()=>getComputedStyle(document.getElementById('loader')).display==='none',{},{timeout:30000});
    await page.waitForTimeout(1700);
    await page.screenshot({path:`${out}/${id}-hero.png`});
    const gsapVersion=await page.evaluate(()=>window.gsap?.version);
    if(gsapVersion!=='3.12.5')throw new Error('Historical animation engine did not load');
    if(version==='adaptive'){
      for(let n=0;n<9;n++){await page.mouse.wheel(0,mobile?90:110);await page.waitForTimeout(240);}
      await page.screenshot({path:`${out}/${id}-slow.png`});
      const target=await page.locator('#services').evaluate(e=>e.getBoundingClientRect().top+scrollY-140);
      const distance=target-await page.evaluate(()=>scrollY);
      for(let n=0;n<5;n++){await page.mouse.wheel(0,distance/5);await page.waitForTimeout(100);}
      await page.waitForTimeout(500);
      await page.screenshot({path:`${out}/${id}-services.png`});
      const portfolio=await page.locator('#portfolio').evaluate(e=>e.getBoundingClientRect().top+scrollY+100);
      const back=portfolio-await page.evaluate(()=>scrollY);
      for(let n=0;n<4;n++){await page.mouse.wheel(0,back/4);await page.waitForTimeout(120);}
      await page.waitForTimeout(500);
      await page.screenshot({path:`${out}/${id}-return.png`});
      for(let n=0;n<4;n++){await page.mouse.wheel(0,mobile?140:180);await page.waitForTimeout(220);}
      await page.waitForTimeout(500);
    }else{
    for(let i=0;i<7;i++){await page.mouse.wheel(0,mobile?270:400);await page.waitForTimeout(320);}
    await page.waitForTimeout(1500);
    await page.screenshot({path:`${out}/${id}-portfolio.png`});
    for(const selector of ['#about','#process']){
      const target=await page.locator(selector).evaluate(e=>e.getBoundingClientRect().top+scrollY-150);
      const distance=target-await page.evaluate(()=>scrollY);
      for(let n=0;n<6;n++){await page.mouse.wheel(0,distance/6);await page.waitForTimeout(190);}
      await page.waitForTimeout(1450);
    }
    await page.screenshot({path:`${out}/${id}-process.png`});
    for(let n=0;n<6;n++){await page.mouse.wheel(0,-420);await page.waitForTimeout(180);}
    await page.waitForTimeout(1000);
    }
    const info=await page.evaluate(()=>({motion:document.documentElement.dataset.motion||'historical',
      intro:document.documentElement.dataset.intro||'historical',lenis:typeof window.Lenis!=='undefined',overflow:document.documentElement.scrollWidth>innerWidth+1}));
    const video=page.video();await context.close();
    await rename(await video.path(),`${out}/${id}.webm`);
    const previous=report.findIndex(item=>item.id===id);
    if(previous!==-1)report.splice(previous,1);
    report.push({id,viewport,gsapVersion,...info,errors});
    console.log(JSON.stringify(report.at(-1)));
  }
  await writeFile(`${out}/recordings.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
