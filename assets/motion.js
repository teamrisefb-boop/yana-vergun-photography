(() => {
  const root=document.documentElement;
  const boot=window.YVIntro;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const gsap=window.gsap, ScrollTrigger=window.ScrollTrigger;
  const owned=new Set(), photoEntries=new Map();
  let intro, hero, context, desktop;
  let stopReveals=()=>{};
  let disabled=false;
  const heroNodes=[...document.querySelectorAll('.hero .reveal')];
  const own=node=>{owned.add(node);return node;};

  function showHero() {
    hero?.kill();
    heroNodes.forEach(node=>{node.style.removeProperty('opacity');node.style.removeProperty('transform');node.style.removeProperty('filter');});
  }
  function failOpen(reason='unavailable') {
    if(disabled)return;
    disabled=true;
    stopReveals();
    intro?.kill();hero?.kill();
    desktop?.revert();context?.revert();
    gsap?.killTweensOf([...owned]);
    owned.forEach(node=>['opacity','transform','filter','clip-path','will-change'].forEach(key=>node.style.removeProperty(key)));
    root.classList.remove('motion-ready');root.dataset.motion=reason;
    showHero();boot?.finish(reason);
  }
  window.YanaMotion={failOpen};
  if(reduce.matches||!gsap||!ScrollTrigger) { failOpen(reduce.matches?'reduced':'unavailable');return; }

  try {
    gsap.registerPlugin(ScrollTrigger);
    const skipIntro=!root.classList.contains('intro-pending');
    document.addEventListener('yv:introend',event=>{
      intro?.kill();
      if(event.detail!=='done') showHero();
      if(event.detail==='failsafe')failOpen('failsafe');
    });

    function textTargets(node) {
      if(node.matches('.pf-item,.about-media,.contact-media,#form'))return [];
      if(node.matches('.cat'))return [...node.querySelectorAll(':scope > h3,:scope > p')];
      return [node];
    }
    function prepareText(node) {
      if(skipIntro && node.closest('#contact'))return [];
      const targets=textTargets(node);
      targets.forEach(own);
      gsap.set(targets,{opacity:0,y:46,filter:'blur(9px)'});
      return targets;
    }
    const texts=new Set();
    let tick=0,velocity=0,lastY=scrollY,lastScroll=performance.now();
    function scheduleReveals(){if(!disabled&&!tick)tick=requestAnimationFrame(checkReveals);}
    function finishPhoto(entry){
      entry.tween?.kill();entry.done=true;
      gsap.set(entry.clip,{clearProps:'clipPath'});entry.frame.dataset.motionPhoto='done';
    }
    function finishText(entry){
      entry.tween?.kill();texts.delete(entry);
      gsap.set(entry.targets,{clearProps:'opacity,transform,filter'});entry.node.dataset.motionText='done';
    }
    function readyPhoto(entry){
      if(disabled||entry.done||!entry.img.complete)return;
      const {img,clip,frame}=entry;
      if(!img.naturalWidth){gsap.set(clip,{clearProps:'clipPath'});frame.dataset.motionPhoto='error';return;}
      const src=img.currentSrc;
      if(entry.decoding===src)return;
      entry.decoding=src;
      img.decode().catch(()=>{}).then(()=>{
        if(disabled||entry.done||img.currentSrc!==src)return;
        entry.ready=true;frame.dataset.motionDecoded='true';scheduleReveals();
      });
    }
    function revealPhoto(entry,fast,delay){
      entry.tween?.kill();entry.started=true;entry.fast=fast;
      entry.frame.dataset.motionPhoto='revealing';
      // Retiming starts from the current mask, never from a closed photo again.
      entry.tween=gsap.to(entry.clip,{clipPath:'inset(0% 0% 0% 0%)',duration:fast ? .32 : 1.35,
        delay:fast?0:delay,ease:'power3.out',onComplete:()=>finishPhoto(entry)});
    }
    function revealText(entry,fast,delay){
      entry.tween?.kill();entry.started=true;entry.fast=fast;
      entry.node.dataset.motionText='revealing';
      entry.tween=gsap.to(entry.targets,{opacity:1,y:0,filter:'blur(0px)',duration:fast ? .32 : 1.2,
        delay:fast?0:delay,ease:'power3.out',onComplete:()=>finishText(entry)});
    }
    function checkReveals(){
      tick=0;if(disabled)return;
      const speed=performance.now()-lastScroll<180?velocity:0;
      const fast=speed>1200;
      const lead=Math.min(innerHeight*.8,Math.max(100,speed*.4));
      // Read geometry before changing styles. Completed entries are never armed again.
      const photos=[...photoEntries.values()].filter(entry=>!entry.done).map(entry=>[entry,entry.frame.getBoundingClientRect()]);
      const copy=[...texts].map(entry=>[entry,entry.node.getBoundingClientRect()]);
      const cascade=new Map(),copyCascade=new Map();
      function delay(group,counts=cascade){const n=counts.get(group)||0;counts.set(group,n+1);return fast?0:n*.13;}
      photos.forEach(([entry,rect])=>{
        if(rect.bottom<=0){finishPhoto(entry);return;}
        const visible=Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0);
        if(entry.started){if(fast&&!entry.fast)revealPhoto(entry,true,0);return;}
        if(entry.ready&&rect.top<=innerHeight+lead){
          const urgent=fast||visible>Math.min(120,rect.height*.25);
          revealPhoto(entry,urgent,delay(entry.group));
        }
      });
      copy.forEach(([entry,rect])=>{
        if(rect.bottom<=0){finishText(entry);return;}
        if(entry.started){if(fast&&!entry.fast)revealText(entry,true,0);return;}
        if(rect.top<=innerHeight+lead)revealText(entry,fast||rect.top<innerHeight*.8,entry.group?delay(entry.group,copyCascade):0);
      });
    }
    function scrollReveals(){
      const now=performance.now();velocity=Math.abs(scrollY-lastY)/Math.max(16,now-lastScroll)*1000;
      lastY=scrollY;lastScroll=now;scheduleReveals();
    }
    addEventListener('scroll',scrollReveals,{passive:true});
    addEventListener('resize',scheduleReveals,{passive:true});
    document.addEventListener('site:languagechange',scheduleReveals);
    stopReveals=()=>{cancelAnimationFrame(tick);removeEventListener('scroll',scrollReveals);removeEventListener('resize',scheduleReveals);document.removeEventListener('site:languagechange',scheduleReveals);};
    context=gsap.context(()=>{
      document.querySelectorAll('.ph.has-img').forEach(frame=>{
        const picture=frame.querySelector('picture'),img=frame.querySelector('.ph__img');
        if(!picture||!img)return;
        const clip=document.createElement('div'),hover=document.createElement('div');
        clip.className='image-reveal';hover.className='image-hover';
        frame.insertBefore(clip,picture);clip.append(hover);hover.append(picture);
        frame.querySelectorAll(':scope > .ph__tag').forEach(tag=>clip.append(tag));
        own(clip);
        if(frame.closest('.hero'))return;
        if(skipIntro && frame.closest('#contact'))return;
        const entry={frame,img,clip,ready:false,started:false,done:false,group:frame.closest('.cats,.pf,.photo-pair')||frame};
        photoEntries.set(frame,entry);
        if(frame.getBoundingClientRect().top<innerHeight&&!root.classList.contains('intro-pending')){finishPhoto(entry);return;}
        gsap.set(clip,{clipPath:'inset(100% 0% 0% 0%)'});
        img.addEventListener('load',()=>{try{readyPhoto(entry);}catch{failOpen('error');}});
        img.addEventListener('error',()=>{clip.style.removeProperty('clip-path');});
        readyPhoto(entry);
      });
      ['.cats','.svc-grid','.proc'].forEach(selector=>{
        const nodes=[...document.querySelectorAll(`${selector} > .reveal`)];
        nodes.forEach(node=>texts.add({node,targets:prepareText(node),group:node.parentElement}));
      });
      document.querySelectorAll('.reveal').forEach(node=>{
        if(node.closest('.hero,.cats,.svc-grid,.proc,.pf'))return;
        const targets=prepareText(node);
        if(targets.length)texts.add({node,targets});
      });
      desktop=gsap.matchMedia();
      desktop.add('(min-width:1025px) and (hover:hover) and (prefers-reduced-motion:no-preference)',()=>{
        const mainPhoto=document.querySelector('.hero-media .m1');
        mainPhoto.dataset.parallax='-40';
        document.querySelectorAll('[data-parallax]').forEach(frame=>{
          own(frame);
          gsap.to(frame,{y:Number(frame.dataset.parallax),ease:'none',scrollTrigger:{trigger:frame,start:'top bottom',end:'bottom top',scrub:true}});
        });
        const fill=own(document.getElementById('procFill'));
        gsap.fromTo(fill,{scaleX:0},{scaleX:1,ease:'none',scrollTrigger:{trigger:'#procLine',start:'top 80%',end:'+=300',scrub:true}});
        const shells=[];
        document.querySelectorAll('.magnet').forEach(button=>{
          if(getComputedStyle(button).display==='none')return;
          const shell=document.createElement('span');shell.className='magnet-shell';
          button.before(shell);shell.append(button);shells.push([shell,button]);
          const x=gsap.quickTo(shell,'x',{duration:.4,ease:'power3.out'});
          const y=gsap.quickTo(shell,'y',{duration:.4,ease:'power3.out'});
          const move=event=>{
            const r=button.getBoundingClientRect();x((event.clientX-r.left-r.width/2)*.25);y((event.clientY-r.top-r.height/2)*.35);
          };
          const leave=()=>{x(0);y(0);};
          button.addEventListener('mousemove',move);button.addEventListener('mouseleave',leave);
          shell._release=()=>{button.removeEventListener('mousemove',move);button.removeEventListener('mouseleave',leave);};
        });
        return ()=>shells.forEach(([shell,button])=>{shell._release();shell.replaceWith(button);});
      });
    });
    root.classList.add('motion-ready');root.dataset.motion='ready';
    scheduleReveals();
    const track=document.getElementById('marquee');
    function marqueeSpeed(){track.style.animationDuration=`${track.scrollWidth/2/30}s`;}
    marqueeSpeed();new ResizeObserver(marqueeSpeed).observe(track);

    if(!skipIntro){
      root.dataset.intro='running';
      document.querySelectorAll('header,main,footer').forEach(node=>{node.inert=true;node.setAttribute('data-intro-inert','');});
      heroNodes.forEach(own);gsap.set(heroNodes,{opacity:0,y:46});
      hero=gsap.timeline({paused:true});
      heroNodes.forEach((node,n)=>{
        const props={opacity:1,y:0,duration:1.1,ease:'power3.out',clearProps:'opacity,transform,filter'};
        if(!node.querySelector('.ph__img')){gsap.set(node,{filter:'blur(9px)'});props.filter='blur(0px)';}
        hero.to(node,props,n*.12);
      });
      intro=gsap.timeline({onComplete:()=>boot.finish('done')})
        .to('#loader .loader__inner',{opacity:0,duration:.5,ease:'power2.out'},1.95)
        .to('#loader',{yPercent:-100,duration:.9,ease:'power4.inOut'},'-=.1')
        .to('#curtain',{yPercent:-100,duration:.9,ease:'power4.inOut'},'-=.7')
        .add(()=>hero.play(),'-=.3');
    }else showHero();
    reduce.addEventListener('change',event=>{if(event.matches)failOpen('reduced');});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){if(root.classList.contains('intro-pending'))boot.finish('hidden');gsap.globalTimeline.pause();}
      else{gsap.globalTimeline.resume();ScrollTrigger.update();}
    });
    window.addEventListener('error',event=>{if(/motion\.js|vendor\//.test(event.filename||''))failOpen('error');});
  }catch{failOpen('error');}
})();
