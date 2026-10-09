import * as THREE from 'three';
// Fit the actual shell bounds into the usable canvas above the existing controls.
export function caseFrame(pack,camera,canvas,direction,{zoom=1,focus=null,offset=new THREE.Vector3(),spine=null,upHint=new THREE.Vector3(0,1,0)}={}){
  pack.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(spine||pack),center=focus?.clone()||bounds.getCenter(new THREE.Vector3());
  const r=canvas.getBoundingClientRect(),controls=document.querySelector('#case-controls');
  const panel=controls&&!controls.hidden?controls.getBoundingClientRect():null;
  const top=Math.min(66,r.height*.12),bottom=panel?Math.min(r.height-16,panel.top-r.top-12):r.height-30;
  const usable=Math.max(r.height*.45,bottom-top),middle=top+usable/2;
  const up=upHint.clone().projectOnPlane(direction).normalize();
  const right=new THREE.Vector3().crossVectors(up,direction).normalize();
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  let distance=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const corner=new THREE.Vector3(x,y,z).sub(center),depth=corner.dot(direction);
    distance=Math.max(distance,depth+Math.abs(corner.dot(right))*1.16/(tangent*camera.aspect*.92),depth+Math.abs(corner.dot(up))*1.16/(tangent*usable/r.height));
  }
  distance=Math.max(.2,distance)/zoom;
  const screenCenter=focus?.35:1-2*middle/r.height;
  center.addScaledVector(up,-screenCenter*distance*tangent).add(offset);
  return {center,position:center.clone().addScaledVector(direction,distance)};
}
export const coverDirection=()=>new THREE.Vector3(.18,4,1.8).normalize();
