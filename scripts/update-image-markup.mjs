import { parse, parseFragment, serialize } from 'parse5';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('assets/optimized/manifest.json', root), 'utf8'));
const document = parse(await readFile(new URL('index.html', root), 'utf8'));
const get = (node,key) => node.attrs?.find(a => a.name === key)?.value;
const set = (node,key,value) => { node.attrs ||= []; const a=node.attrs.find(a=>a.name===key); if(a) a.value=String(value); else node.attrs.push({name:key,value:String(value)}); };
const altUk = {
  'hero-main.jpg':'Fashion-портрет авторства Yana Vergun',
  'photo-studio-miss-universe-2026.jpg':'Студійна fashion-зйомка авторства Yana Vergun',
  'photo-street-black-and-white.jpg':'Вулична fashion-зйомка авторства Yana Vergun',
  'photo-brand-cowgirl.jpg':'Контент для бренду авторства Yana Vergun',
  'photo-backstage-field.png':'Портрет за кадром авторства Yana Vergun',
  'photo-family-four-generations.jpg':'Сімейна зйомка авторства Yana Vergun',
  'photo-editorial-portrait-glasses.jpg':'Editorial-портрет авторства Yana Vergun',
  'photo-summer-in-lviv-field.png':'Літній портрет просто неба авторства Yana Vergun',
  'photo-brand-campaign-studio.png':'Зйомка кампанії бренду авторства Yana Vergun',
  'photo-backstage-studio.jpg':'Студійний fashion-портрет авторства Yana Vergun',
  'photo-about.jpg':'Яна Вергун із камерою у студії',
  'photo-1.jpg':'Fashion-портрет авторства Yana Vergun',
  'photo-4.jpg':'Beauty-портрет авторства Yana Vergun',
  'photo-7.jpg':'Портрет для розділу контактів авторства Yana Vergun',
};
function visit(node, ancestors=[]) {
  if (node.tagName === 'img' && get(node,'class')?.includes('ph__img')) {
    const path = get(node,'data-original') || get(node,'src');
    const data = manifest[path];
    if (!data) throw new Error(`Missing image manifest: ${path}`);
    const classes = ancestors.map(n=>get(n,'class') || '').join(' ');
    const hero = /\bhero-media\b/.test(classes);
    const category = /\bcats\b/.test(classes);
    const portfolio = /\bpf\b/.test(classes);
    const wide = /\bpf-[de]\b/.test(classes);
    const galleryLink = [...ancestors].reverse().find(n=>get(n,'data-gallery') !== undefined);
    const full = data.variants.at(-1);
    set(node,'data-full-avif',full.avif.src); set(node,'data-full-webp',full.webp.src);
    if (galleryLink) set(galleryLink,'href',full.jpg.src);
    if (!get(node,'data-en-alt')) set(node,'data-en-alt',get(node,'alt'));
    set(node,'alt',altUk[path.split('/').at(-1)] || get(node,'alt'));
    const sizes = hero ? '(max-width: 1024px) 90vw, (min-width: 1320px) 528px, 42vw'
      : category ? '(max-width: 760px) 43vw, (max-width: 1024px) 42vw, (min-width: 1320px) 212px, 16vw'
      : portfolio ? `(max-width: 760px) 90vw, (max-width: 1024px) 44vw, (min-width: 1320px) ${wide ? 570 : 373}px, ${wide ? 43 : 28}vw`
      : '(max-width: 1024px) 90vw, (min-width: 1320px) 500px, 40vw';
    const variants = data.variants.filter(v=>v.width<=1600);
    const fallback = variants.find(v=>v.width>=800) || variants.at(-1);
    set(node,'src',fallback.jpg.src);
    set(node,'srcset',variants.map(v=>`${v.jpg.src} ${v.width}w`).join(', '));
    set(node,'sizes',sizes); set(node,'width',data.width); set(node,'height',data.height);
    set(node,'decoding','async'); set(node,'loading',hero?'eager':'lazy'); set(node,'data-original',path);
    if (hero) set(node,'fetchpriority','high');
    const parent=node.parentNode;
    if (parent.tagName==='picture') {
      for (const source of parent.childNodes.filter(n=>n.tagName==='source')) {
        const format=get(source,'type')?.slice('image/'.length);
        if (['avif','webp'].includes(format)) {
          set(source,'sizes',sizes);
          set(source,'srcset',variants.map(v=>`${v[format].src} ${v.width}w`).join(', '));
        }
      }
      return;
    }
    const picture=parseFragment('<picture></picture>').childNodes[0];
    const sources=parseFragment(['avif','webp'].map(format=>`<source type="image/${format}" sizes="${sizes}" srcset="${variants.map(v=>`${v[format].src} ${v.width}w`).join(', ')}">`).join('')).childNodes;
    picture.childNodes=[...sources,node]; picture.parentNode=parent;
    for(const child of picture.childNodes) child.parentNode=picture;
    parent.childNodes[parent.childNodes.indexOf(node)]=picture;
    return;
  }
  for (const child of [...(node.childNodes || [])]) visit(child,[...ancestors,node]);
}
visit(document);
await writeFile(new URL('index.html',root),serialize(document));
