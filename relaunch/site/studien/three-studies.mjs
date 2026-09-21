import * as THREE from './vendor/three.module.min.js?v=06552c54e407';
import {RoomEnvironment} from './vendor/RoomEnvironment.mjs?v=3abf1ce79bb6';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
// The two studies use authored geometry, not a rotating photograph.
function createStage(canvas,fallback,bg){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.setClearColor(bg,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
 const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(35,1,.1,100);const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room,.045);scene.environment=env.texture;room.dispose();pmrem.dispose();
 const hemisphere=new THREE.HemisphereLight(0xf7f8ed,0x69716a,1.1);scene.add(hemisphere);
 let dead=false,raf=0,version=0;
 function render(){if(!dead)renderer.render(scene,camera)}
 function size(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render()}
 const resize=new ResizeObserver(size);resize.observe(canvas.parentElement);
 function animate(update,duration=800){cancelAnimationFrame(raf);const own=++version,begin=performance.now();if(reduced.matches){update(1);render();return}const frame=t=>{if(dead||own!==version)return;const p=Math.min(1,(t-begin)/duration);update(1-Math.pow(1-p,3));render();if(p<1)raf=requestAnimationFrame(frame);else raf=0};raf=requestAnimationFrame(frame)}
 const hide=()=>{cancelAnimationFrame(raf);raf=0};document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();else render()});window.addEventListener('pagehide',hide);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();hide();fallback.hidden=false;canvas.hidden=true});canvas.addEventListener('webglcontextrestored',()=>location.reload());
 function ready(){size();fallback.hidden=true;canvas.dataset.ready='true'}
 return {THREE,scene,camera,renderer,render,size,animate,ready};
}

export function mountHouse(canvas,fallback){
 const app=createStage(canvas,fallback,0xedf0e9),{scene,camera,renderer,render,animate}=app;
 renderer.localClippingEnabled=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const sun=new THREE.DirectionalLight(0xfff1d2,2.8);sun.position.set(-4,9,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=10;sun.shadow.camera.bottom=-10;sun.shadow.normalBias=.025;scene.add(sun);
 const plane=new THREE.Plane(new THREE.Vector3(-1,0,0),.7);
 const material=(color,rough=.7,clip=true)=>new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0,side:THREE.DoubleSide,clippingPlanes:clip?[plane]:[],clipShadows:true});
 const plaster=material(0xd6d7c7),oak=material(0x9b7652,.52),stone=material(0xbabdaf,.8),dark=material(0x3e4b40),fabric=material(0x9caa93),white=material(0xefeee4);
 const baseMat=material(0xd3d9cc,.85,false),copper=new THREE.MeshStandardMaterial({color:0xad4f35,metalness:.25,roughness:.4});
 const box=(w,h,d,x,y,z,mat=plaster)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh};
 box(8.6,.12,5.6,0,-.08,0,baseMat);box(8,.1,5,0,.03,0,oak);
 // One 8 × 5 m geometry drives the scene, plan and section controls.
 box(8,2.6,.18,0,1.35,-2.42);box(.18,2.6,5,-3.91,1.35,0);box(.18,2.6,5,3.91,1.35,0);
 const roof=box(8,.18,5,0,2.72,0,white);box(8,.14,.12,0,2.4,2.43,dark);box(8,.12,.12,0,.17,2.43,dark);
 for(const x of [-3.85,-1.4,1.35,3.85])box(.07,2.2,.1,x,1.3,2.43,dark);
 // Partitions contain door openings. The foreground remains glazed/open.
 for(const x of [-1.33,1.33]){box(.14,2.5,1.65,x,1.3,-1.63);box(.14,2.5,.78,x,1.3,2.03);box(.14,.43,2.55,x,2.34,.48)}
 // Entry, dining centre, retreat. Objects belong to the same clipped scene.
 box(1.5,.16,.58,-2.55,.52,-1.85,oak);box(.1,.45,.45,-3.1,.25,-1.85,dark);box(.1,.45,.45,-2,.25,-1.85,dark);
 for(let i=0;i<5;i++)box(.055,1.4,.05,-3.4+i*.23,1.6,-2.25,oak);
 box(1.65,.12,1.04,0,.8,.15,oak);for(const x of [-.65,.65])for(const z of [-.24,.54])box(.075,.72,.075,x,.39,z,dark);
 for(const x of [-.45,.45])for(const z of [-.74,1.04]){box(.46,.09,.42,x,.48,z,white);box(.46,.7,.065,x,.78,z+(z<0?-.19:.19),oak);for(const side of [-.16,.16])box(.05,.45,.3,x+side,.25,z,dark)}
 box(1.92,.5,.96,2.65,.43,-1.55,fabric);box(1.92,.55,.17,2.65,.85,-1.94,fabric);box(.12,.68,.96,1.72,.65,-1.55,fabric);box(.12,.68,.96,3.58,.65,-1.55,fabric);box(1.2,.06,.78,2.65,.47,.15,oak);box(.12,.42,.5,2.65,.23,.15,dark);
 // Slim cut marker: actual section position, never an opaque cover over the model.
 const marker=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.013,2.9,5.15)),new THREE.LineBasicMaterial({color:0xae4834,transparent:true,opacity:.8}));marker.position.set(.64,1.41,0);scene.add(marker);
 const footprint=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8,2.6,5)),new THREE.LineBasicMaterial({color:0x718475,transparent:true,opacity:.32}));footprint.position.y=1.35;scene.add(footprint);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.15;ground.receiveShadow=true;scene.add(ground);
 camera.position.set(11,8.5,12);let target=new THREE.Vector3(0,.8,0);camera.lookAt(target);let currentView='space',lastCut=58;
 function destination(view){const narrow=canvas.parentElement.clientWidth<650;return view==='plan'?{pos:new THREE.Vector3(0,17,0.001),look:new THREE.Vector3(0,0,0)}:view==='detail'?{pos:new THREE.Vector3(8,4.8,7),look:new THREE.Vector3((lastCut/100)*8-4,.7,0)}:{pos:new THREE.Vector3(narrow?11.5:9.6,narrow?8:7.3,narrow?12:10.3),look:new THREE.Vector3(0,.8,0)}}
 function update(value,view='space'){roof.visible=view!=='plan';lastCut=value;plane.constant=-4+value*.08;marker.position.x=plane.constant;marker.visible=value<99;canvas.setAttribute('aria-label',`Hausstudie mit Schnitt bei ${value} Prozent, ${view==='plan'?'Grundriss':view==='detail'?'Nahsicht':'Raumansicht'}`);if(view!==currentView){currentView=view;const from=camera.position.clone(),start=target.clone(),end=destination(view);animate(p=>{camera.position.lerpVectors(from,end.pos,p);target.lerpVectors(start,end.look,p);camera.lookAt(target)})}else render()}
 const initial=destination('space');camera.position.copy(initial.pos);camera.lookAt(initial.look);app.ready();update(58);return {update};
}

export function makeOpenContour(){
 const vertices=[],normals=[],indices=[];const segments=180,sides=16;
 for(let i=0;i<=segments;i++){const u=i/segments,angle=(-145+290*u)*Math.PI/180,twist=(u-.5)*.7;const radial=new THREE.Vector3(Math.cos(angle),Math.sin(angle),0),binormal=new THREE.Vector3(0,0,1);const center=new THREE.Vector3(1.9*Math.cos(angle),2.45*Math.sin(angle),.18*Math.sin(angle*2));const taper=.65+.35*Math.sin(Math.PI*u);
  for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;const ax=Math.cos(a)*.24*taper,az=Math.sin(a)*.105*taper,rx=ax*Math.cos(twist)-az*Math.sin(twist),rz=ax*Math.sin(twist)+az*Math.cos(twist);const pos=center.clone().addScaledVector(radial,rx).addScaledVector(binormal,rz);vertices.push(pos.x,pos.y,pos.z)}
 }
 for(let i=0;i<segments;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1)}
 // Closed, smoothly finished ends rather than an open tube artifact.
 for(const [row,reverse] of [[0,true],[segments,false]]){const center=new THREE.Vector3();for(let j=0;j<sides;j++){const p=(row*(sides+1)+j)*3;center.x+=vertices[p];center.y+=vertices[p+1];center.z+=vertices[p+2]}center.divideScalar(sides);const idx=vertices.length/3;vertices.push(center.x,center.y,center.z);for(let j=0;j<sides;j++){const a=row*(sides+1)+j,b=a+1;indices.push(...(reverse?[idx,b,a]:[idx,a,b]))}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
export function mountJewel(canvas,fallback){
 const app=createStage(canvas,fallback,0xedf0f2),{scene,camera,render,animate}=app;
 app.renderer.toneMappingExposure=1.05;scene.environmentIntensity=.9;
 const material=new THREE.MeshPhysicalMaterial({color:0xdbdde0,metalness:1,roughness:.16,clearcoat:.35,clearcoatRoughness:.18});const object=new THREE.Mesh(makeOpenContour(),material);object.rotation.set(-.4,-.25,.6);scene.add(object);
 const key=new THREE.DirectionalLight(0xffffff,6);key.position.set(5,4,5);scene.add(key);const warm=new THREE.DirectionalLight(0xffd9b5,3);warm.position.set(-4,-2,2);scene.add(warm);
 const fill=new THREE.DirectionalLight(0xb6c9e7,4);fill.position.set(0,3,-4);scene.add(fill);
 camera.position.set(0,0,12);camera.lookAt(0,0,0);let lastView=0,finish=0,light=35;
 const poses=[[-.4,-.25,.6,12],[-.15,1.13,.3,12],[.1,-.55,.8,8.5]];
 function update(value,view=0,surface=0){light=value;const theta=(value/100)*Math.PI*2;key.position.set(Math.cos(theta)*7,3+Math.sin(theta)*3,4);scene.environmentRotation.y=theta*.45;material.roughness=surface?.52:.16;material.metalness=surface?.88:1;object.rotation.z=poses[view][2]+(value-50)*.002;
  if(view!==lastView){lastView=view;const r=object.rotation.clone(),z=camera.position.z,end=poses[view];animate(p=>{object.rotation.x=r.x+(end[0]-r.x)*p;object.rotation.y=r.y+(end[1]-r.y)*p;camera.position.z=z+(end[3]-z)*p})}else render();canvas.setAttribute('aria-label',`Offene Metallkontur, ${['Frontansicht','Profilansicht','Detailansicht'][view]}, ${surface?'satinierte':'polierte'} Oberfläche, Lichtposition ${Math.round(value*3.6)} Grad`);
 }
 app.ready();update(35);return {update};
}
