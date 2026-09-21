(()=>{
const intro=document.querySelector('.jb-network'),field=intro.querySelector('.network-field'),toggle=intro.querySelector('.network-motion'),motion=matchMedia('(prefers-reduced-motion:reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)'),svg=field.querySelector('svg');
const nodes=[...field.querySelectorAll('.network-node,.network-quiet')];
const points=[[-.76,-.64,.2],[.65,-.65,-.18],[.86,.05,.25],[.58,.69,-.12],[-.69,.65,.18],[-.9,-.04,-.16],[-.24,-.88,-.45],[.84,-.43,-.6],[.2,.9,-.35],[-.9,.36,-.55]];
let focused=false,paused=false,visible=true,dragging=false,moved=false,downX=0,downY=0,lastX=0,lastY=0,yaw=0,pitch=0,aimYaw=0,aimPitch=0,dragYaw=0,dragPitch=0,raf=0,last=0,time=0;
function staticMode(){return motion.matches||!fine.matches||innerWidth<=700}
function draw(){
 const w=field.clientWidth,h=field.clientHeight,cx=w/2,cy=h/2;
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 const ry=Math.max(-.75,Math.min(.75,yaw+dragYaw)),rx=Math.max(-.4,Math.min(.4,pitch+dragPitch)),cosY=Math.cos(ry),sinY=Math.sin(ry),cosX=Math.cos(rx),sinX=Math.sin(rx);let paths='';
 nodes.forEach((node,i)=>{let [x,y,z]=points[i];
 if(!staticMode()){const xx=x*cosY+z*sinY,zz=-x*sinY+z*cosY;x=xx;z=zz;const yy=y*cosX-z*sinX;z=y*sinX+z*cosX;y=yy;}
 const perspective=1/(1-z*.22);let dx=x*w*.43*perspective,dy=y*h*.42*perspective;
 if(i<6&&!staticMode()){const radius=Math.hypot(dx/(w*.23),dy/(h*.34));if(radius<1){dx/=Math.max(.01,radius);dy/=Math.max(.01,radius)}}
 const px=cx+dx,py=cy+dy;
 node.style.left=px+'px';node.style.top=py+'px';
 node.style.transform=`translate(-50%,-50%) scale(${staticMode()?1:.9+(z+1)*.12})`;
 node.style.opacity=String(i<6?Math.max(.62,Math.min(1,.82+z*.25)):Math.max(.2,.4+z*.2));
 paths+=`M${cx} ${cy}L${px} ${py}`;
 });svg.querySelector('path').setAttribute('d',paths);const extras=svg.querySelector('g');if(extras)extras.style.display='none';
}
function tick(t){raf=0;const dt=Math.min(50,t-(last||t));last=t;if(!paused&&!focused&&!staticMode()&&visible){time+=dt*.001;const ease=1-Math.exp(-dt/160);yaw+=(aimYaw+Math.sin(time*.38)*.13-yaw)*ease;pitch+=(aimPitch+Math.sin(time*.29)*.075-pitch)*ease;draw();}if(visible&&!paused&&!focused&&!staticMode())raf=requestAnimationFrame(tick)}
function start(){if(!raf){last=0;raf=requestAnimationFrame(tick)}}
field.addEventListener('focusin',()=>{focused=true;cancelAnimationFrame(raf);raf=0});
field.addEventListener('focusout',e=>{if(!field.contains(e.relatedTarget)){focused=false;start()}});
field.addEventListener('pointermove',e=>{if(staticMode()||paused)return;const r=field.getBoundingClientRect();aimYaw=((e.clientX-r.left)/r.width-.5)*1.35;aimPitch=((e.clientY-r.top)/r.height-.5)*-.75;if(dragging){if(Math.hypot(e.clientX-downX,e.clientY-downY)>6)moved=true;dragYaw=Math.max(-.55,Math.min(.55,dragYaw+(e.clientX-lastX)*.004));dragPitch=Math.max(-.5,Math.min(.5,dragPitch-(e.clientY-lastY)*.003));lastX=e.clientX;lastY=e.clientY;}start()},{passive:true});
field.addEventListener('pointerdown',e=>{if(staticMode()||paused||e.button!==0)return;dragging=true;moved=false;downX=lastX=e.clientX;downY=lastY=e.clientY;field.classList.add('is-dragging')});
addEventListener('pointerup',()=>{dragging=false;field.classList.remove('is-dragging')},{passive:true});
field.addEventListener('pointerleave',()=>{aimYaw=0;aimPitch=0;dragging=false;field.classList.remove('is-dragging')});
field.addEventListener('dragstart',e=>e.preventDefault());
field.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false}},{capture:true});
toggle.addEventListener('click',()=>{paused=!paused;toggle.setAttribute('aria-pressed',String(paused));toggle.textContent=paused?'Bewegung aktivieren':'Bewegung pausieren';if(paused){cancelAnimationFrame(raf);raf=0}else start()});
function reset(){yaw=pitch=aimYaw=aimPitch=dragYaw=dragPitch=0;draw();cancelAnimationFrame(raf);raf=0;start()}
motion.addEventListener('change',reset);fine.addEventListener('change',reset);addEventListener('resize',reset,{passive:true});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)start();else{cancelAnimationFrame(raf);raf=0}},{threshold:0}).observe(intro);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else if(visible)start()});
intro.querySelectorAll('[data-decision]').forEach(a=>a.addEventListener('click',()=>{document.querySelector('.jb-decision [data-key="'+a.dataset.decision+'"]').click()}));
draw();start();
})();
