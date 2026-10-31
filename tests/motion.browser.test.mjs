import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const base='http://127.0.0.1:4173/';
const chrome={launch:()=>chromium.launch({channel:'chrome'})};
for(const [engineName,engine] of Object.entries({chromium,chrome,webkit})) {
  test(`${engineName}: restored motion and safe navigation`,async t=>{
    const browser=await engine.launch();t.after(()=>browser.close());
    async function open(mobile=false,options={}) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},
        isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference',...options});
      t.after(()=>context.close());
      await context.route('https://yana-vergun-booking.yana-vergun-photography.workers.dev/**',r=>r.abort());
      const page=await context.newPage();page.setDefaultTimeout(12000);
      return {page,context};
    }
    for(const mobile of [false,true])await t.test(`${mobile?'mobile':'desktop'}: logo, curtains, reload, scroll and return`,async()=>{
      const {page}=await open(mobile);const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      assert.ok(await page.locator('main').evaluate(e=>e.inert));
      await page.waitForTimeout(850);
      const before=await page.locator('.loader__logo-wrap').evaluate(e=>getComputedStyle(e).clipPath);
      await page.waitForTimeout(400);
      const after=await page.locator('.loader__logo-wrap').evaluate(e=>getComputedStyle(e).clipPath);
      assert.notEqual(before,after,'logo is revealed over time');
      await page.waitForFunction(()=>{const t=getComputedStyle(document.getElementById('loader')).transform;return t!=='none'&&new DOMMatrix(t).m42 < -5;});
      assert.equal(await page.locator('#curtain').evaluate(e=>getComputedStyle(e).display),'block');
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='done');
      await page.waitForTimeout(1600);
      assert.equal(await page.locator('.hero h1').evaluate(e=>getComputedStyle(e).opacity),'1');
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      const marquee=()=>page.locator('#marquee').evaluate(e=>getComputedStyle(e).transform);
      const m1=await marquee();await page.waitForTimeout(200);assert.notEqual(m1,await marquee());
      const heroY=()=>page.locator('.hero-media .m1').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m42);
      const firstY=await heroY();
      await page.locator('.cats').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-220));
      await page.waitForFunction(()=>document.querySelector('.cat .ph').dataset.motionPhoto==='done');
      await page.waitForTimeout(800);
      assert.equal(await page.locator('.cat h3').first().evaluate(e=>getComputedStyle(e).opacity),'1');
      if(mobile)assert.equal(await heroY(),0);else assert.notEqual(firstY,await heroY());
      assert.equal(await page.locator('.cat .image-reveal').first().evaluate(e=>getComputedStyle(e).clipPath),'none');
      if(!mobile){
        await page.locator('#procLine').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-innerHeight*.8+150));
        await page.waitForTimeout(150);
        const scale=await page.locator('#procFill').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m11);
        assert.ok(scale>.1&&scale<.9,`process line progresses with scroll: ${scale}`);
        await page.locator('#procLine').evaluate(e=>window.scrollBy(0,400));await page.waitForTimeout(100);
        assert.ok(await page.locator('#procFill').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m11)>.95);
      }
      await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);
      assert.equal(await page.locator('.hero h1').evaluate(e=>getComputedStyle(e).opacity),'1');
      await page.locator('.hero a[href="#services"]').click();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.intro),'done');
      assert.equal(await page.locator('#loader').isVisible(),false);
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      assert.deepEqual(errors,[]);
    });
    await t.test('direct contact/form, including reload, never blocked by intro',async()=>{
      for(const hash of ['contact','form'])for(const mobile of [false,true]){
        const {page}=await open(mobile);
        await page.goto(base+'#'+hash,{waitUntil:'load'});
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.intro),'skipped');
        assert.equal(await page.locator('#loader').isVisible(),false);
        assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
        await page.waitForFunction(()=>document.querySelector('#form').noValidate);
        const position=await page.locator('#'+hash).evaluate(e=>({top:e.getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom}));
        assert.ok(position.top>=position.header+7,JSON.stringify(position));
        await page.reload({waitUntil:'load'});
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.intro),'skipped');
        assert.equal(await page.locator('#bookingName').isEditable(),true);
      }
    });
    await t.test('booking CTA stays clear of header after surrounding reveals finish',async()=>{
      for(const mobile of [false,true]){
        const {page}=await open(mobile);await page.goto(base,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
        await page.keyboard.press('Escape');
        await page.locator('.services a[href="#form"]').click();
        await page.waitForTimeout(1600);
        const rect=await page.locator('#form').evaluate(e=>({top:e.getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom,transform:getComputedStyle(e).transform}));
        assert.ok(rect.top>=rect.header+7,JSON.stringify(rect));
        assert.equal(rect.transform,'none');
        await page.locator('#bookingName').fill('Motion test');
        assert.equal(await page.locator('#bookingName').inputValue(),'Motion test');
      }
    });
    await t.test('reduced motion is static and readable',async()=>{
      const {page}=await open(true,{reducedMotion:'reduce'});
      await page.goto(base,{waitUntil:'load'});
      assert.equal(await page.locator('#loader').isVisible(),false);
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.motion),'reduced');
      assert.equal(await page.locator('.hero h1').evaluate(e=>getComputedStyle(e).opacity),'1');
    });
    if(engineName==='chromium')await t.test('card cascade, photo uncover and hover have independent moving layers',async()=>{
      const {page}=await open();await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      await page.keyboard.press('Escape');
      await page.locator('.cat img').evaluateAll(images=>images.forEach(img=>img.loading='eager'));
      await page.waitForFunction(()=>[...document.querySelectorAll('.cat img')].every(img=>img.complete&&img.naturalWidth));
      for(let n=0;n<25;n++){
        if(await page.locator('.cat .ph').first().getAttribute('data-motion-photo')==='revealing')break;
        await page.mouse.wheel(0,60);await page.waitForTimeout(120);
      }
      await page.waitForFunction(()=>document.querySelector('.cat .ph').dataset.motionPhoto==='revealing');
      assert.equal(await page.locator('.cat .image-reveal').first().evaluate(e=>window.gsap.getTweensOf(e)[0]?.duration()),1.35);
      await page.waitForTimeout(300);
      const clips=await page.locator('.cat .image-reveal').evaluateAll(nodes=>nodes.map(e=>parseFloat(getComputedStyle(e).clipPath.replace('inset(',''))));
      assert.ok(clips[0]<clips[4]-5,JSON.stringify(clips));
      assert.ok(clips[0]>0,'uncover remains in progress beyond 300ms');
      assert.match(await page.locator('.cat h3').first().evaluate(e=>getComputedStyle(e).filter),/^blur\(/);
      assert.equal(await page.locator('.cat .ph').first().evaluate(e=>getComputedStyle(e).filter),'none');
      await page.waitForFunction(()=>document.querySelector('.cat .ph').dataset.motionPhoto==='done');
      const card=page.locator('.pf-item').first();await card.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>document.querySelector('.pf-item .ph').dataset.motionPhoto==='done');
      await page.mouse.move(0,0);await page.waitForTimeout(650);
      assert.equal(await card.locator('.ov').evaluate(e=>getComputedStyle(e).opacity),'0');
      await card.hover();await page.waitForTimeout(650);
      const hover=await card.locator('.image-hover').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m11);
      assert.ok(hover>1.03&&hover<=1.061,`${hover}`);
      assert.equal(await card.locator('.image-reveal').evaluate(e=>getComputedStyle(e).transform),'none');
      assert.equal(await card.locator('.ov').evaluate(e=>getComputedStyle(e).opacity),'1');
      const button=page.locator('header .magnet');await button.hover();
      const box=await button.boundingBox();await page.mouse.move(box.x+box.width-10,box.y+box.height/2);
      await page.waitForTimeout(400);
      assert.ok(await button.evaluate(e=>new DOMMatrix(getComputedStyle(e.parentElement).transform).m41)>5);
      assert.equal(await button.evaluate(e=>getComputedStyle(e).transform),'none');
    });
    for(const mobile of [false,true])await t.test(`${mobile?'mobile':'desktop'}: prefetch, fast pass, return and responsive sources never re-close photos`,async()=>{
      const {page}=await open(mobile);const requests=[];
      page.on('request',request=>{if(request.resourceType()==='image')requests.push(request.url());});
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='done');
      assert.equal(await page.locator('.contact-media .ph__img').getAttribute('data-preloaded'),null);
      assert.equal(await page.locator('.contact-media .ph__img').getAttribute('loading'),'lazy');
      const first=page.locator('.cat .ph').first();
      const top=await first.evaluate(e=>e.getBoundingClientRect().top);
      await page.evaluate(y=>window.scrollBy(0,Math.max(0,y-innerHeight-400)),top);
      await page.waitForFunction(()=>document.querySelector('.cat .ph__img').dataset.preloaded==='true');
      assert.ok(await first.evaluate(e=>e.getBoundingClientRect().top)>await page.evaluate(()=>innerHeight));
      await page.waitForFunction(()=>document.querySelector('.cat .ph').dataset.motionDecoded==='true');
      await page.locator('#process').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY+250));
      await page.waitForTimeout(100);
      assert.ok(await page.locator('.svc-grid>.reveal').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).opacity==='1')));
      await page.locator('#services').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY));
      await page.waitForTimeout(400);
      assert.ok(await page.locator('.svc-grid>.reveal').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).opacity==='1')));
      await page.locator('#portfolio').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY+150));
      await page.waitForTimeout(400);
      const opened=page.locator('.pf-item .image-reveal').first();
      await page.locator('.pf-item .ph__img').first().evaluate(img=>img.decode());
      assert.equal(await opened.evaluate(e=>getComputedStyle(e).clipPath),'none');
      await page.locator('#services').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY));
      await page.locator('#portfolio').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY+150));
      assert.equal(await opened.evaluate(e=>getComputedStyle(e).clipPath),'none');
      await page.setViewportSize(mobile?{width:430,height:844}:{width:1366,height:900});
      await page.waitForTimeout(250);
      assert.equal(await opened.evaluate(e=>getComputedStyle(e).clipPath),'none');
      const originals=await page.locator('.ph__img').evaluateAll(images=>images.map(img=>new URL(img.dataset.original,location.href).href));
      assert.ok(!requests.some(url=>originals.includes(url)),'only responsive variants, not originals');
      assert.ok(!requests.some(url=>url.includes('-2400.')),'lightbox-size assets stay deferred');
    });
    if(engineName!=='chromium')return;
    await t.test('late image decode reveals in place without waiting for another scroll event',async()=>{
      const {page,context}=await open();let release;
      const hold=new Promise(resolve=>{release=resolve;});
      await context.route('**/optimized/photo-brand-cowgirl-*',async route=>{await hold;await route.continue().catch(()=>{});});
      try{
        await page.goto(base,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.documentElement.dataset.intro==='done');
        await page.locator('.pf-item').first().evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-150));
        await page.waitForTimeout(250);release();
        await page.waitForFunction(()=>document.querySelector('.pf-item .ph').dataset.motionPhoto==='done',{},{timeout:1800});
        assert.equal(await page.locator('.pf-item .image-reveal').first().evaluate(e=>getComputedStyle(e).clipPath),'none');
      }finally{release();}
    });
    await t.test('pending photographs do not delay intro or block form',async()=>{
      const {page,context}=await open(true);let release;
      const hold=new Promise(r=>{release=r;});
      await context.route('**/assets/optimized/**',async route=>{await hold;await route.continue().catch(()=>{});});
      try{
        await page.goto(base,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.documentElement.dataset.intro==='done',{},{timeout:5900});
        assert.equal(await page.locator('.hero-media .ph__img').evaluate(e=>e.complete),false);
        await page.locator('.hero a[href="#services"]').click();
        assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      }finally{release();}
    });
    for(const blocked of ['gsap.min.js','ScrollTrigger.min.js','motion.js'])await t.test(`${blocked} missing: fail open`,async()=>{
      const {page,context}=await open();
      await context.route(`**/${blocked}*`,r=>r.abort());
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>!document.documentElement.classList.contains('intro-pending'));
      assert.equal(await page.locator('#loader').isVisible(),false);
      assert.equal(await page.locator('.hero h1').evaluate(e=>getComputedStyle(e).opacity),'1');
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      await page.evaluate(()=>window.scrollTo(0,1000));assert.ok(await page.evaluate(()=>scrollY)>900);
    });
    await t.test('runtime failure and live reduced-motion change release hidden content',async()=>{
      const {page}=await open();await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      await page.evaluate(()=>window.YanaMotion.failOpen('test-error'));
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      assert.equal(await page.locator('.cat h3').first().evaluate(e=>getComputedStyle(e).opacity),'1');
      assert.equal(await page.locator('.cat .image-reveal').first().evaluate(e=>getComputedStyle(e).clipPath),'none');
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.intro==='running');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
      assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
    });
  });
}
