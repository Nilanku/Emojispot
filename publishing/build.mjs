import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import MarkdownIt from 'markdown-it';
import { parseDocument } from 'yaml';

// Generates a clean deployment. Never writes to the original website or post files.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const STAGE = path.join(ROOT, '.publisher-stage');
const SITE = 'https://emojispot.world';
const PAGE_SIZE = 12;
const MAX_FILES = 20000;
const MAX_BYTES = 25 * 1024 * 1024;
const ROOT_FILES = ['index.html','404.html','robots.txt','manifest.webmanifest','sw.js','sitemap.xml','favicon.ico','favicon.svg','apple-touch-icon.png','_headers','_redirects'];
const SITE_DIRS = ['about','activities','animals-nature','ar','assets','contact','data','de','emoji','emoji-17-0','emoji-18-0','emoji-meanings','es','faq','flags','food-drink','fr','guides','hi','id','new-emoji','objects','people-body','privacy','pt','smileys-emotion','symbols','terms','tone','travel-places'];
const EXT = new Set(['.html','.css','.js','.mjs','.json','.xml','.webmanifest','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.avif','.woff','.woff2','.ttf','.otf','.mp3','.mp4','.pdf']);
const md = new MarkdownIt({html:false, linkify:false, typographer:false});
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const read = rel => fs.readFileSync(path.join(ROOT,rel),'utf8');
const output = rel => path.join(STAGE,rel);
function write(rel,text) { const f=output(rel); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,text); }
function walk(dir) {
  return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en')).flatMap(e => {
    const p=path.join(dir,e.name);
    assert(!e.isSymbolicLink(), `Symbolic links are not supported: ${p}`);
    return e.isDirectory()?walk(p):[p];
  });
}
function cleanHTML(raw) {
  const $=load(raw);
  $('script').each((_,e)=> {
    const s=$(e);
    if ((s.attr('src')||'').includes('/cdn-cgi/')) { s.remove(); return; }
    if ((s.attr('type')||'').endsWith('-text/javascript')) s.removeAttr('type');
    if (s.attr('type')!=='application/ld+json') s.attr('data-cfasync','false');
  });
  return $;
}
function localFile(url) {
  const u=new URL(url,SITE);
  if(u.origin!==SITE) return null;
  const p=decodeURIComponent(u.pathname);
  assert(!p.includes('..')&&!p.includes('\\'),`Unsafe local URL: ${url}`);
  return p.endsWith('/')?p.slice(1)+'index.html':p.slice(1);
}
function text(value, field, file, max=500) {
  assert(typeof value==='string' && value.trim() && value.length<=max,`${file}: invalid or missing ${field}`);
  return value.trim();
}
function date(value,field,file) {
  if(value===undefined) return undefined;
  assert(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0,10)===value,`${file}: ${field} must be YYYY-MM-DD`);
  assert(value<=new Date().toISOString().slice(0,10),`${file}: future dates are not scheduling. Keep future posts outside the repository or use published: false.`);
  return value;
}
function readPosts() {
  const posts=[]; const dir=path.join(ROOT,'posts');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.md')&&f!=='README.md').sort()) {
    const raw=read('posts/'+file);
    const m=/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
    assert(m,`${file}: expected YAML metadata between --- lines.`);
    const doc=parseDocument(m[1]); assert(!doc.errors.length,`${file}: ${doc.errors.map(e=>e.message).join('; ')}`);
    const data=doc.toJS({maxAliasCount:0});
    assert(data && typeof data==='object' && !Array.isArray(data),`${file}: metadata must be an object.`);
    assert(typeof data.published==='boolean',`${file}: published must be true or false.`);
    if(!data.published) continue;
    const allowed=['title','seo_title','description','slug','published','order','label','visual','copy','backlinks','related_guides','date','updated'];
    for(const key of Object.keys(data)) assert(allowed.includes(key),`${file}: unknown metadata field ${key}`);
    const p={file, body:m[2], title:text(data.title,'title',file,180), seo:text(data.seo_title,'seo_title',file,180), description:text(data.description,'description',file,300), slug:text(data.slug,'slug',file,100), label:text(data.label,'label',file,60), visual:text(data.visual,'visual',file,100)};
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) && !['page','feed','index','rss'].includes(p.slug),`${file}: invalid or reserved slug.`);
    assert(Number.isSafeInteger(data.order),`${file}: order must be an integer.`); p.order=data.order;
    assert(Array.isArray(data.copy)&&data.copy.length<=20,`${file}: copy must be an array (maximum 20).`);
    p.copy=data.copy.map(x=>({emoji:text(x.emoji,'copy emoji',file,50),name:text(x.name,'copy name',file,100)}));
    for(const field of ['backlinks','related_guides']) assert(Array.isArray(data[field])&&data[field].every(x=>typeof x==='string'),`${file}: ${field} must be a list of strings.`);
    p.backlinks=[...new Set(data.backlinks)]; p.related=[...new Set(data.related_guides)];
    for(const url of p.backlinks) assert(/^\/emoji\/[a-z0-9-]+\/$/.test(url),`${file}: backlinks must reference English /emoji/ pages.`);
    for(const slug of p.related) assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),`${file}: invalid related guide slug.`);
    p.date=date(data.date,'date',file); p.updated=date(data.updated,'updated',file);
    assert(!p.updated||p.date,`${file}: updated requires an original date.`);
    assert(!p.updated||p.updated>=p.date,`${file}: updated cannot precede date.`);
    p.url='/guides/'+p.slug+'/';
    const b=load(md.render(p.body),{},false);
    assert(b('h1').length===1 && b('h1').first().text()===p.title,`${file}: use exactly one H1 matching title.`);
    assert(b('h2').length>0,`${file}: article needs section headings.`);
    p.minutes=Math.max(1,Math.ceil(b.root().text().split(/\s+/).length/220));
    posts.push(p);
  }
  assert(new Set(posts.map(p=>p.slug)).size===posts.length,'Duplicate article slug. Keep one file per article.');
  return posts;
}
function existingGuides() {
  const entries=[];
  for(const d of fs.readdirSync(path.join(ROOT,'guides'),{withFileTypes:true})) {
    if(!d.isDirectory())continue;
    const rel='guides/'+d.name+'/index.html';
    if(!fs.existsSync(path.join(ROOT,rel)))continue;
    const $=load(read(rel));
    if(!$('article.editorial-article').length)continue;
    entries.push({slug:d.name,url:'/guides/'+d.name+'/',title:$('h1').first().text(),description:$('meta[name="description"]').attr('content')||'',visual:$('[data-copy-emoji]').map((_,e)=>$(e).attr('data-copy-emoji')).get().slice(0,4).join(' ')||'📖',label:'Emoji guide',minutes:Math.max(1,Math.ceil($('.editorial-article').text().split(/\s+/).length/220)),order:0,legacy:true});
  }
  return entries;
}
function breadcrumbs(title,url) {
  const items=[{name:'Home',item:SITE+'/'},{name:'Guides',item:SITE+'/guides/'}];
  if(url!=='/guides/') items.push({name:title,item:SITE+url});
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((x,i)=>({'@type':'ListItem',position:i+1,...x}))};
}
function metadata($,title,description,url,ld,type='website') {
  $('title').text(title); $('link[rel="canonical"]').attr('href',SITE+url);
  for(const [attr,key,value] of [['name','description',description],['property','og:title',title],['property','og:description',description],['property','og:url',SITE+url],['property','og:type',type],['property','og:image:alt','EmojiSpot — emoji copy and paste'],['name','twitter:title',title],['name','twitter:description',description]]) {
    let e=$(`meta[${attr}="${key}"]`); if(!e.length){$('head').append(`<meta ${attr}="${key}">`);e=$(`meta[${attr}="${key}"]`);} e.attr('content',value);
  }
  $('link[hreflang], script[type="application/ld+json"], link[rel="alternate"][type="application/rss+xml"]').remove();
  $('head').append(`<link rel="alternate" hreflang="en" href="${SITE+url}"><link rel="alternate" hreflang="x-default" href="${SITE+url}"><link rel="alternate" type="application/rss+xml" title="EmojiSpot Guides" href="/guides/feed.xml">`);
  $('head').append(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g,'\\u003c')}</script>`);
  $('script').each((_,e)=>{if(($(e).html()||'').includes('window.__EMOJI__'))$(e).text('window.__EMOJI__ = {lang:"en", page:"guide", ep:"/emoji/", langs:["en"]};');});
}
const card=p=>`<a class="editorial-card" href="${p.url}"><span class="editorial-visual" aria-hidden="true">${esc(p.visual)}</span><span class="editorial-card-copy"><span class="editorial-kicker">${esc(p.label)} · ${p.minutes} min read</span><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><span class="editorial-read">Read the guide →</span></span></a>`;
function article(p,base,all) {
  const b=load(md.render(p.body),{},false); b('h1').remove();
  b('a[href]').each((_,e)=>{const href=b(e).attr('href');if(href.startsWith(SITE+'/'))b(e).attr('href',href.slice(SITE.length));});
  b('table').each((i,e)=>{
    const table=b(e);const caption=`${p.title}: comparison ${i+1}`;
    table.prepend(`<caption class="sr-only">${esc(caption)}</caption>`);table.find('th').attr('scope','col');
    table.wrap(`<div class="article-table-wrap" role="region" tabindex="0" aria-label="${esc(caption)}"></div>`);
  });
  const toc=[];b('h2').each((i,e)=>{const id='section-'+(i+1);b(e).attr('id',id);toc.push(`<li><a href="#${id}">${esc(b(e).text())}</a></li>`);});
  const lead=b('p').first();lead.addClass('article-lead');const lede=b.html(lead);lead.remove();
  // Keep the direct answer above Copy controls and the table of contents.
  const introNodes=b('h2').first().prevAll().toArray().reverse();
  const intro=introNodes.map(e=>b.html(e)).join('');introNodes.forEach(e=>b(e).remove());
  const copy=p.copy.length?`<div class="article-copybar" role="group" aria-label="Copy an emoji">${p.copy.map(x=>`<button class="btn article-copy" type="button" data-copy-emoji="${esc(x.emoji)}" aria-label="Copy ${esc(x.name)}"><span aria-hidden="true">${esc(x.emoji)}</span><span>Copy ${esc(x.name)}</span></button>`).join('')}</div><noscript><p>One-tap Copy buttons need JavaScript. Select the emoji text and use your device’s Copy command instead.</p></noscript>`:'';
  const related=all.filter(x=>p.related.includes(x.slug)&&x.slug!==p.slug);
  const $=cleanHTML(base);
  $('main').html(`<div class="wrap editorial-wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true"> › </span><a href="/guides/">Guides</a><span aria-hidden="true"> › </span><span aria-current="page">${esc(p.label)}</span></nav><article class="editorial-article" lang="en"><header class="article-header"><p class="editorial-kicker">${esc(p.label)}</p><h1>${esc(p.title)}</h1><p class="article-byline">By EmojiSpot · About ${p.minutes} minutes${p.date?` · Published <time datetime="${p.date}">${p.date}</time>`:''}${p.updated?` · Updated <time datetime="${p.updated}">${p.updated}</time>`:''}</p>${lede}<div class="article-intro">${intro}</div>${copy}</header><nav class="article-toc" aria-label="In this guide"><h2>In this guide</h2><ul>${toc.join('')}</ul></nav><div class="article-body">${b.html()}</div><aside class="article-end"><h2>Keep exploring</h2>${related.length?`<ul>${related.map(x=>`<li><a href="${x.url}">${esc(x.title)}</a></li>`).join('')}</ul>`:''}<p><a href="/guides/">All emoji guides</a> · <a href="/emoji-meanings/">Individual emoji meanings</a> · <a href="/">Find and copy emojis</a></p></aside></article></div>`);
  const ld={'@context':'https://schema.org','@type':'Article',headline:p.title,description:p.description,url:SITE+p.url,mainEntityOfPage:SITE+p.url,inLanguage:'en',author:{'@type':'Organization',name:'EmojiSpot',url:SITE+'/about/'},publisher:{'@type':'Organization',name:'EmojiSpot',url:SITE+'/'},...(p.date?{datePublished:p.date}:{}),...(p.updated?{dateModified:p.updated}:{})};
  metadata($,p.seo,p.description,p.url,[ld,breadcrumbs(p.title,p.url)],'article');
  return $.html();
}
function build() {
  const started=Date.now();
  assert(fs.existsSync(path.join(ROOT,'guides/index.html')),'Missing current Guides directory. Install on the current EmojiSpot repository, not an empty folder.');
  assert(fs.existsSync(path.join(ROOT,'assets/js/site.js')),'Missing existing website assets.');
  assert(read('assets/js/site.js').includes('data-copy-emoji'),'Existing emoji Copy handler is required.');
  const posts=readPosts(), legacy=existingGuides();
  assert(legacy.length,'Need at least one existing editorial article as the shared page shell.');
  for(const p of posts) assert(!fs.existsSync(path.join(ROOT,'guides',p.slug)),`${p.file}: URL already exists in original website; choose a different slug.`);
  const all=[...posts,...legacy].sort((a,b)=>b.order-a.order||a.slug.localeCompare(b.slug,'en'));
  const base=read('guides/'+legacy[0].slug+'/index.html');
  if(fs.existsSync(STAGE))fs.rmSync(STAGE,{recursive:true});fs.mkdirSync(STAGE);
  let sourceCount=0;
  for(const rel of ROOT_FILES){ assert(fs.existsSync(path.join(ROOT,rel)),`Missing original ${rel}`);write(rel,fs.readFileSync(path.join(ROOT,rel)));sourceCount++; }
  for(const dir of SITE_DIRS) {
    assert(fs.existsSync(path.join(ROOT,dir)),`Missing original folder ${dir}. Do not remove existing website folders.`);
    for(const f of walk(path.join(ROOT,dir))) {
      const rel=path.relative(ROOT,f), parts=rel.split(path.sep);
      assert(!parts.some(p=>p.startsWith('.'))&&EXT.has(path.extname(f).toLowerCase()),`Unexpected file in public folder: ${rel}. Move drafts and tools outside public folders.`);
      write(rel,fs.readFileSync(f));sourceCount++;
    }
  }
  const generated=[];
  for(const p of posts){const rel='guides/'+p.slug+'/index.html';write(rel,article(p,base,all));generated.push(rel);}
  const pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE)); const indexURLs=[];
  for(let n=1;n<=pages;n++) {
    const url=n===1?'/guides/':`/guides/page/${n}/`;indexURLs.push(url);
    const entries=all.slice((n-1)*PAGE_SIZE,n*PAGE_SIZE);const $=cleanHTML(read('guides/index.html'));
    $('.guides-list').html(`<h2>${n===1?'Latest guides':`Guides — page ${n}`}</h2>${entries.map(card).join('')}`);
    $('.publisher-pagination').remove();
    if(pages>1) $('.guides-list').append(`<nav class="publisher-pagination" aria-label="Guide pages">${n>1?`<a class="btn" rel="prev" href="${n===2?'/guides/':`/guides/page/${n-1}/`}">← Previous</a>`:''}<span>Page ${n} of ${pages}</span>${n<pages?`<a class="btn" rel="next" href="/guides/page/${n+1}/">Next →</a>`:''}</nav>`);
    const title=n===1?'Emoji Guides: Comparisons & Message Examples | EmojiSpot':`Emoji Guides — Page ${n} | EmojiSpot`;
    if(n>1)$('h1').text(`Emoji guides — page ${n}`);
    const desc='Choose the right emoji for your message with clear explanations, practical examples and links to individual emoji meanings.';
    metadata($,title,desc,url,[{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:SITE+url,inLanguage:'en',mainEntity:{'@type':'ItemList',itemListElement:entries.map((p,i)=>({'@type':'ListItem',position:(n-1)*PAGE_SIZE+i+1,name:p.title,url:SITE+p.url}))}},breadcrumbs(n===1?'Guides':`Guides — page ${n}`,url)]);
    const rel=localFile(url);write(rel,$.html());generated.push(rel);
  }
  const home=cleanHTML(read('index.html'));
  assert(home('.editorial-home').length===1,'Homepage is missing its Guides section.');
  home('.editorial-home .editorial-card').remove();home('.editorial-home').append(all.slice(0,3).map(card).join(''));write('index.html',home.html());generated.push('index.html');
  const backlinks=new Map();
  for(const p of posts)for(const url of p.backlinks){if(!backlinks.has(url))backlinks.set(url,[]);backlinks.get(url).push(p);}
  for(const [url,entries] of backlinks) {
    const rel=localFile(url);assert(fs.existsSync(output(rel)),`Backlink target does not exist: ${url}`);
    const $=cleanHTML(fs.readFileSync(output(rel),'utf8'));
    $('[data-publisher-related]').remove();
    const block=`<aside class="guide-callout related-editorial" data-publisher-related="true"><h2>Related emoji guides</h2><ul>${entries.sort((a,b)=>b.order-a.order).slice(0,6).map(p=>`<li><a href="${p.url}">${esc(p.title)}</a></li>`).join('')}</ul><p><a href="/guides/">Browse all guides →</a></p></aside>`;
    const place=$('.emoji-guide').first().length?$('.emoji-guide').first():$('main .kv').first();
    assert(place.length,`Cannot locate backlink insertion point: ${url}`);place.after(block);write(rel,$.html());generated.push(rel);
  }
  const feed=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>EmojiSpot Guides</title><link>${SITE}/guides/</link><description>Emoji explanations and practical message examples.</description><language>en</language>${all.slice(0,30).map(p=>`<item><title>${esc(p.title)}</title><link>${SITE+p.url}</link><guid isPermaLink="true">${SITE+p.url}</guid><description>${esc(p.description)}</description>${p.date?`<pubDate>${new Date(p.date).toUTCString()}</pubDate>`:''}</item>`).join('')}</channel></rss>`;write('guides/feed.xml',feed);
  let sitemap=read('sitemap.xml');const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert(locs.length===new Set(locs).size,'Original sitemap contains duplicate URLs.');
  const extra=[...posts.map(p=>p.url),...indexURLs].map(u=>SITE+u).filter(u=>!locs.includes(u));
  for(const u of extra) sitemap=sitemap.replace('</urlset>',`<url><loc>${esc(u)}</loc></url>\n</urlset>`);
  // Preserve genuine existing lastmod values, except entry pages whose content this build changes.
  const changed=new Set(['/',...indexURLs,...backlinks.keys()].map(u=>SITE+u));
  sitemap=sitemap.replace(/<url>[\s\S]*?<\/url>/g,block=>changed.has(/<loc>([^<]+)<\/loc>/.exec(block)?.[1])?block.replace(/\s*<lastmod>[^<]+<\/lastmod>/g,''):block);
  assert(locs.length+extra.length<=50000 && Buffer.byteLength(sitemap)<50*1024*1024,'Sitemap needs splitting before publication.');write('sitemap.xml',sitemap);
  write('assets/css/site.css',read('assets/css/site.css')+'\n/* Automatic editorial listings */\n.article-intro{font-size:16px;line-height:1.85}.article-intro p{margin:16px 0}.editorial-card + .editorial-card{margin-top:18px}.editorial-visual{flex-wrap:wrap;overflow-wrap:anywhere}.publisher-pagination{display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:28px}.article-body ol,.article-end ul,.related-editorial ul{padding-inline-start:24px}.article-end li{margin-block:8px}\n');
  // Validate every local link/fragment and asset on every page the builder touched.
  for(const rel of [...new Set(generated)]) {
    const $=load(fs.readFileSync(output(rel),'utf8'));
    assert($('h1').length===1,`${rel}: expected one H1`);
    const pageURL='/'+rel.replace(/index\.html$/,'');
    for(const attr of ['href','src'])$(`[${attr}]`).each((_,e)=>{
      const v=$(e).attr(attr);if(!v||/^(mailto:|tel:|data:)/.test(v))return;
      const u=new URL(v,SITE+pageURL);if(u.origin!==SITE)return;
      const target=localFile(u.href);assert(fs.existsSync(output(target)),`${rel}: broken ${attr} ${v}`);
      if(u.hash&&target.endsWith('.html')){
        const other=target===rel?$:load(fs.readFileSync(output(target),'utf8'));
        const id=decodeURIComponent(u.hash.slice(1));
        assert(other('[id]').toArray().some(el=>other(el).attr('id')===id),`${rel}: missing fragment ${v}`);
      }
    });
    $('script[type="application/ld+json"]').each((_,e)=>JSON.parse($(e).text()));
  }
  const files=walk(STAGE);
  assert(files.length<=MAX_FILES,`Free-plan asset limit exceeded: ${files.length}/${MAX_FILES}. Reduce output before publishing.`);
  for(const f of files)assert(fs.statSync(f).size<=MAX_BYTES,`File exceeds 25 MiB: ${path.relative(STAGE,f)}`);
  const hash=crypto.createHash('sha256');
  for(const f of files){const rel=path.relative(STAGE,f);if(rel==='sw.js')continue;hash.update(rel);hash.update(fs.readFileSync(f));}
  const digest=hash.digest('hex').slice(0,16);const sw=read('sw.js');
  assert(/const CACHE = '[^']+';/.test(sw),'Service-worker cache declaration changed; review the template.');
  write('sw.js',sw.replace(/const CACHE = '[^']+';/,`const CACHE = 'emoji-publisher-${digest}';`));
  // Replace generated output only after every validation succeeds.
  if(fs.existsSync(OUT))fs.rmSync(OUT,{recursive:true});fs.renameSync(STAGE,OUT);
  const report={sourceFiles:sourceCount,deployedFiles:files.length,remainingFiles:MAX_FILES-files.length,existingGuides:legacy.length,publishedNewPosts:posts.length,guideListingPages:pages,sitemapURLs:locs.length+extra.length,generatedOrUpdatedHTML:[...new Set(generated)],cacheVersion:'emoji-publisher-'+digest,seconds:Math.round((Date.now()-started)/10)/100};
  fs.writeFileSync(path.join(ROOT,'.publisher-report.json'),JSON.stringify(report,null,2));
  console.log('EmojiSpot publishing build passed.');console.log(JSON.stringify(report,null,2));
  if(files.length>18000)console.warn('WARNING: fewer than 2,000 files remain within the free-plan limit.');
}
try {build();} catch(error) {console.error('\nPUBLISHING STOPPED: '+error.message+'\nNo deployment should proceed. Fix the post or restore the previous commit.');process.exitCode=1;}
