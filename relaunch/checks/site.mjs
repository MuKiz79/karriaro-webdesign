import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const { Window } = await import(process.env.HAPPY_DOM_PACKAGE || 'happy-dom');
const root=fileURLToPath(new URL('../site/',import.meta.url));
const htmlFiles=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(p.endsWith('.html'))htmlFiles.push(p);}}
walk(root);
const errors=[];
for(const file of htmlFiles){
 const w=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 w.document.write(fs.readFileSync(file,'utf8'));
 const d=w.document;const relative=path.relative(root,file);
 const ids=[...d.querySelectorAll('[id]')].map(n=>n.id);
 if(ids.length!==new Set(ids).size)errors.push(relative+': duplicate IDs');
 if(!d.querySelector('title')?.textContent.trim())errors.push(relative+': missing title');
 for(const el of d.querySelectorAll('[href],[src]')){
  const raw=el.getAttribute('href')||el.getAttribute('src');
  if(!raw||/^(https?:|mailto:|tel:|data:|blob:|about:)/.test(raw))continue;
  const [part,hash]=raw.split('#');
  if(!part){if(hash&&!d.getElementById(decodeURIComponent(hash)))errors.push(relative+': missing anchor '+raw);continue;}
  const local=decodeURIComponent(part.split('?')[0]);
  let target=path.resolve(local.startsWith('/')?root:path.dirname(file),local.replace(/^\//,''));
  if(target.endsWith(path.sep)||fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
  if(!fs.existsSync(target)&&fs.existsSync(target+'.html'))target+='.html';
  if(!fs.existsSync(target))errors.push(relative+': missing '+raw);
  else if(hash&&target.endsWith('.html')){
   const markup=fs.readFileSync(target,'utf8');
   if(!markup.includes('id="'+decodeURIComponent(hash)+'"')&&!markup.includes("id='"+decodeURIComponent(hash)+"'"))errors.push(relative+': missing target anchor '+raw);
  }
 }
 for(const img of d.querySelectorAll('img'))if(!img.hasAttribute('alt'))errors.push(relative+': image without alt');
 await w.happyDOM.close();
}
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(!home.includes('m.karriaro-webdesign.de'),'Home must be responsive without a mobile-domain redirect');
assert(!/handcodiert|0 Templates|0 Subunternehmer/i.test(home),'Removed manufacturing claims must not return');
assert(home.includes('https://formspree.io/f/mjggbdre'),'Existing form delivery retained');
assert.equal(errors.length,0,errors.join('\n'));
console.log(`${htmlFiles.length} HTML routes: local links, images, anchors and unique IDs verified.`);
console.log('Main site: no mobile redirect, no handcoded claims, existing inquiry endpoint retained.');
