// A deliberately schematic cutaway: a roof aperture and its projection onto a floor.
// Coordinates are study units, not an engineering or geographic daylight simulation.
export const project = ([x,y,z]) => [480+(x-z)*57, 400+(x+z)*25-y*74];
const points = vertices => vertices.map(v=>project(v).map(n=>n.toFixed(2)).join(',')).join(' ');
const poly = (vertices,fill,extra='') => `<polygon points="${points(vertices)}" fill="${fill}" ${extra}/>`;
function clip(poly, axis, boundary, keepLess) {
  const output=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length], ia=keepLess?a[axis]<=boundary:a[axis]>=boundary, ib=keepLess?b[axis]<=boundary:b[axis]>=boundary;
    if(ia)output.push(a);
    if(ia!==ib){const t=(boundary-a[axis])/(b[axis]-a[axis]);output.push(a.map((n,j)=>n+(b[j]-n)*t));}
  }
  return output;
}
export function lightStudy(sun=45, opening=65) {
  sun=Math.max(0,Math.min(100,Number(sun)||0)); opening=Math.max(15,Math.min(90,Number(opening)||15));
  const width=opening/100*4.4, depth=1.75, height=2.6;
  const dx=(sun-50)/50*2.8, dz=.35+Math.abs(sun-50)/50*.9;
  const aperture=[[-width/2,height,-depth/2],[width/2,height,-depth/2],[width/2,height,depth/2],[-width/2,height,depth/2]];
  let patch=aperture.map(([x,,z])=>[x+dx,0.015,z+dz]);
  for(const [axis,boundary,less] of [[0,-3,false],[0,3,true],[2,-2,false],[2,2,true]])patch=clip(patch,axis,boundary,less);
  return {sun,opening,width,aperture,patch,dx,dz};
}
export function renderModel(sun=45,opening=65,rotation=0,lift=0){
  const angle=Math.max(-30,Math.min(30,Number(rotation)||0))*Math.PI/180, separation=Math.max(0,Math.min(1,Number(lift)||0));
  const project=([x,y,z])=>{const xx=x*Math.cos(angle)-z*Math.sin(angle),zz=x*Math.sin(angle)+z*Math.cos(angle),yy=y;return [480+(xx-zz)*57,400+(xx+zz)*25-yy*74]};
  const points=vertices=>vertices.map(v=>project(v).map(n=>n.toFixed(2)).join(',')).join(' ');
  const poly=(vertices,fill,extra='')=>`<polygon points="${points(vertices)}" fill="${fill}" ${extra}/>`;
  const d=lightStudy(sun,opening), a=d.width/2,b=.875,h=2.6;
  const floor=[[-3,0,-2],[3,0,-2],[3,0,2],[-3,0,2]];
  const base=[[-3.45,-.15,-2.45],[3.45,-.15,-2.45],[3.45,-.15,2.45],[-3.45,-.15,2.45]];
  let s=poly(base,'#d8d9d6','filter="url(#model-shadow)"');
  s+=poly([[-3.45,-.3,2.45],[3.45,-.3,2.45],[3.45,-.15,2.45],[-3.45,-.15,2.45]],'#afb2b0');
  s+=poly([[3.45,-.3,-2.45],[3.45,-.3,2.45],[3.45,-.15,2.45],[3.45,-.15,-2.45]],'#9caaa7');
  s+=poly(base,'#dedfda')+poly(floor,'#aeb7b1');
  // Floor joints make the changing patch legible without turning it into a texture.
  for(let x=-2;x<3;x++)s+=`<polyline points="${points([[x,0,-2],[x,0,2]])}" stroke="#8f9c98" stroke-width=".6"/>`;
  s+=poly(d.patch,'#fff1bc');
  s+='<g data-model-part="walls">';s+=poly([[-3,0,-2],[3,0,-2],[3,h,-2],[-3,h,-2]],'#d3d6d1');
  s+=poly([[-3,0,-2],[-3,0,2],[-3,h,2],[-3,h,-2]],'#e4e5dd');s+='</g>';
  // Bench and entrance step are fixed, providing a human-scale reference.
  s+=poly([[-2.75,.4,-1.65],[1.9,.4,-1.65],[1.9,.4,-1.12],[-2.75,.4,-1.12]],'#9c7960');
  s+=poly([[-2.75,.15,-1.12],[1.9,.15,-1.12],[1.9,.4,-1.12],[-2.75,.4,-1.12]],'#765a45');
  // The exploded roof separates from fixed walls; it does not stretch the building.
  const roofPoly=(vertices,fill,extra='')=>poly(vertices.map(([x,y,z])=>[x,y+separation*.9,z]),fill,extra);
  s+='<g data-model-part="roof">';
  // Four roof strips form a real opening whose width responds to the input.
  for(const strip of [
    [[-3.15,h,-2.15],[3.15,h,-2.15],[3.15,h,-b],[-3.15,h,-b]],
    [[-3.15,h,b],[3.15,h,b],[3.15,h,2.15],[-3.15,h,2.15]],
    [[-3.15,h,-b],[-a,h,-b],[-a,h,b],[-3.15,h,b]],
    [[a,h,-b],[3.15,h,-b],[3.15,h,b],[a,h,b]]
  ])s+=roofPoly(strip,'#f4f2e9','stroke="#b9bdb5" stroke-width=".7"');
  s+=roofPoly([[-3.15,h,2.15],[3.15,h,2.15],[3.15,h-.12,2.15],[-3.15,h-.12,2.15]],'#b6c0b7');
  s+=roofPoly([[3.15,h,-2.15],[3.15,h,2.15],[3.15,h-.12,2.15],[3.15,h-.12,-2.15]],'#c5c9bd');
  s+='</g>';
  const pos=project([d.dx,4.1,d.dz]);
  s+=`<g stroke="#ac7d24" fill="none"><circle cx="${pos[0]}" cy="${pos[1]}" r="11" stroke-width="1.3"/><path d="M${pos[0]},${pos[1]+18} L${project([0,h,0]).join(',')}" stroke-dasharray="3 6" opacity=".65"/></g>`;
  s+=`<polyline points="${points([[-3,0,2.8],[3,0,2.8]])}" fill="none" stroke="#214bdf" stroke-width="1"/><g fill="#214bdf" font-size="13" font-family="Inter,Arial,sans-serif"><text x="${project([0,0,2.8])[0]}" y="${project([0,0,2.8])[1]+25}" text-anchor="middle">OFFENE SEITE</text></g>`;
  return s;
}
