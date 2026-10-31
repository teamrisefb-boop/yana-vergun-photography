import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const output=process.env.REVEAL_OUTPUT||'test-results/reveal-before';
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
try{
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
    await context.route('https://yana-vergun-booking.yana-vergun-photography.workers.dev/**',r=>r.abort());
    const page=await context.newPage();
    await page.addInitScript(()=>{
      window.revealSamples=[];window.decodeSamples=[];
      document.addEventListener('load',event=>{
        const img=event.target;if(!img.matches?.('.ph__img'))return;
        const start=performance.now();img.decode().then(()=>window.decodeSamples.push({image:img.dataset.original,ms:performance.now()-start})).catch(()=>{});
      },true);
    });
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.intro==='done');
    await page.waitForTimeout(1600);
    await page.evaluate(()=>{
      window.sampleTimer=setInterval(()=>{
        const photos=[...document.querySelectorAll('.ph.has-img')].flatMap(frame=>{
          const r=frame.getBoundingClientRect(),img=frame.querySelector('.ph__img');
          const visible=Math.min(r.bottom,innerHeight)-Math.max(r.top,0);
          if(visible<100||frame.closest('.hero'))return [];
          const clip=getComputedStyle(frame.querySelector('.image-reveal')||frame).clipPath;
          const inset=clip.startsWith('inset(')?parseFloat(clip.slice(6))/100:0;
          const exposed=Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top+inset*r.height,0));
          return [{image:img.dataset.original,loaded:img.complete&&img.naturalWidth>0,exposed:Math.round(exposed/visible*100),state:frame.dataset.motionPhoto||'waiting'}];
        });
        window.revealSamples.push({time:performance.now(),y:scrollY,photos});
      },50);
    });
    for(let n=0;n<7;n++){await page.mouse.wheel(0,mobile?270:400);await page.waitForTimeout(320);}
    await page.waitForTimeout(350);
    const services=await page.locator('#services').evaluate(e=>e.getBoundingClientRect().top+scrollY-120);
    await page.evaluate(y=>window.scrollTo(0,y),services);await page.waitForTimeout(200);
    await page.mouse.wheel(0,1600);await page.waitForTimeout(250);
    await page.locator('#portfolio').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-100));
    await page.waitForTimeout(700);
    await page.screenshot({path:`${output}/${mobile?'mobile':'desktop'}-return.png`});
    const data=await page.evaluate(()=>{clearInterval(window.sampleTimer);return {samples:window.revealSamples,decodes:window.decodeSamples};});
    const photos=data.samples.flatMap(sample=>sample.photos);
    const blank=photos.filter(photo=>photo.exposed<10||!photo.loaded);
    const summary={samples:photos.length,blankSamples:blank.length,loadedButMasked:blank.filter(photo=>photo.loaded).length,waitingForFile:blank.filter(photo=>!photo.loaded).length,maxDecodeMs:Math.max(...data.decodes.map(x=>x.ms))};
    await writeFile(`${output}/${mobile?'mobile':'desktop'}.json`,JSON.stringify({summary,...data},null,2));
    console.log(JSON.stringify({mobile,...summary}));await context.close();
  }
}finally{await browser.close();}
