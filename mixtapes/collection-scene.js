import * as THREE from 'three';
import {createCase} from './case-model.js?v=lift-1';

const ease=t=>t*t*t*(t*(t*6-15)+10);
const clamp=THREE.MathUtils.clamp;
export async function mountCollection(canvas,slots,{onPick,onReady,onReturn,onProgress,onLayout}){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.01,80);
  scene.add(new THREE.HemisphereLight(0xfffbee,0x637567,1));
  const key=new THREE.DirectionalLight(0xffffff,1.7);key.position.set(-2,5,3);scene.add(key);
  const room=new THREE.Scene();room.add(new THREE.Mesh(new THREE.BoxGeometry(12,12,12),new THREE.MeshBasicMaterial({color:0x87958a,side:THREE.BackSide})));
  for(const [x,y,z,w,h,intensity] of [[-3,4,1,2,6,5],[4,3,-2,1,5,3],[0,5,-3,5,2,4]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,0,0);room.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.08);scene.environment=env.texture;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  const storage=new THREE.Group();scene.add(storage);
  const blank=await createCase(renderer,{title:'',label:'',tracks:[],blank:true});
  const rows=slots.length/2,spacing=.143,depth=rows*spacing+.17;
  const standing=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,0)));
  const palette=['#e4ddc8','#454a46','#b89b94','#d9d5c6','#78858a','#c3b28d','#454a46','#8ea9ac'];
  const items=slots.map((tape,index)=>{
    const position=new THREE.Vector3(index<rows?-.67:.67,.746+((index*7)%4)*.004,(index%rows-(rows-1)/2)*spacing);
    const quaternion=standing.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),((index*7)%5-2)*.002));
    return {tape,index,position,quaternion,matrix:new THREE.Matrix4().compose(position,quaternion,new THREE.Vector3(1,1,1)),color:new THREE.Color(palette[(index*13+Math.floor(index/3))%palette.length])};
  });
  // Each stored blank is an instance of the original GLB meshes. Picking one
  // promotes exactly those meshes, at exactly the same matrix, for articulation.
  const empty=items.filter(item=>item.tape.blank),batches=[];
  blank.pack.updateMatrixWorld(true);
  blank.pack.traverse(source=>{
    if(!source.isMesh||!source.visible)return;
    const mesh=new THREE.InstancedMesh(source.geometry,source.material,empty.length);
    mesh.name='Stored_'+source.name;mesh.userData.source=source;mesh.frustumCulled=false;
    empty.forEach((item,i)=>{
      item.instance=i;mesh.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(item.matrix,source.matrixWorld));
      if(source.name.includes('Label'))mesh.setColorAt(i,item.color);
    });
    storage.add(mesh);batches.push(mesh);
  });
  for(const item of items.filter(item=>!item.tape.blank)){
    item.model=await createCase(renderer,item.tape);item.model.pack.position.copy(item.position);item.model.pack.quaternion.copy(item.quaternion);storage.add(item.model.pack);
  }
  // A shallow, open cardboard crate; cases stand above its rim.
  const cardboard=new THREE.MeshStandardMaterial({color:0xaf895d,roughness:1});
  const inner=new THREE.MeshStandardMaterial({color:0x9c794e,roughness:1});
  function wall(w,h,d,x,y,z,material=cardboard){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);storage.add(m);return m;}
  wall(2.79,.055,depth,0,-.007,0,inner);
  wall(.045,1.16,depth,-1.39,.55,0);wall(.045,1.16,depth,1.39,.55,0);
  wall(2.82,1.16,.045,0,.55,-depth/2);wall(2.82,1.16,.045,0,.55,depth/2);
  wall(.024,.91,depth-.05,0,.44,0,inner);
  // Thin corrugated rims preserve the box reference without a separate CSS frame.
  wall(.052,.018,depth,-1.39,1.135,0);wall(.052,.018,depth,1.39,1.135,0);
  const backgroundMaterials=new Map();storage.traverse(o=>{if(o.material&&!backgroundMaterials.has(o.material))backgroundMaterials.set(o.material,{opacity:o.material.opacity,depthWrite:o.material.depthWrite,transparent:o.material.transparent});});
  // Compile both the instanced rack and ordinary mesh path before the first lift.
  const warm=blank.pack.clone(true);warm.visible=true;warm.position.set(0,-50,0);scene.add(warm);
  let active=null,state='box',motion=null,raf=0,detailDispose=null,backdropAlpha=1;
  let homeCamera=new THREE.Vector3(),homeQuaternion=new THREE.Quaternion();
  function draw(){renderer.render(scene,camera);}
  function backdrop(alpha){
    backdropAlpha=alpha;storage.visible=alpha>0;
    const activeMaterials=new Set();active?.model.pack.traverse(o=>{if(o.material)activeMaterials.add(o.material);});
    backgroundMaterials.forEach((original,material)=>{
      if(activeMaterials.has(material))return;
      const transparent=alpha===1?original.transparent:true;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.opacity=original.opacity*alpha;material.depthWrite=alpha===1?original.depthWrite:false;
    });
  }
  function placeCamera(){
    const fov=THREE.MathUtils.degToRad(camera.fov/2);
    const distance=Math.max((depth+.25)/(2*Math.tan(fov)),3.05/(2*Math.tan(fov)*camera.aspect))*1.08;
    const center=new THREE.Vector3(0,.85,0);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(0,1,.14).normalize(),distance);camera.lookAt(center);camera.updateMatrixWorld();
    homeCamera.copy(camera.position);homeQuaternion.copy(camera.quaternion);
  }
  function targets(){
    const points=items.map(item=>{
      const center=new THREE.Vector3(-.716,.052,0).applyMatrix4(item.matrix).project(camera);
      const left=new THREE.Vector3(-.716,.052,-.625).applyMatrix4(item.matrix).project(camera);
      const right=new THREE.Vector3(-.716,.052,.625).applyMatrix4(item.matrix).project(camera);
      const r=canvas.getBoundingClientRect();return {index:item.index,x:(center.x+1)*r.width/2,y:(1-center.y)*r.height/2,width:Math.abs(right.x-left.x)*r.width/2,height:Math.max(16,r.height*spacing/(depth+.6)*.85)};
    });onLayout(points);
  }
  function resize(){
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
    const previousPosition=camera.position.clone(),previousQuaternion=camera.quaternion.clone();
    placeCamera();
    if(state==='box'){targets();draw();}
    else {
      camera.position.copy(previousPosition);camera.quaternion.copy(previousQuaternion);camera.updateMatrixWorld();
      if(motion){
        if(motion.returning){motion.endCamera.copy(homeCamera);motion.endCameraQ.copy(homeQuaternion);}
        else Object.assign(motion,detailPose());
        finishMotion();
      }
    }
  }
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile(scene,camera);
  scene.remove(warm);
  function setInstance(item,visible){
    batches.forEach(mesh=>{mesh.setMatrixAt(item.instance,visible?new THREE.Matrix4().multiplyMatrices(item.matrix,mesh.userData.source.matrixWorld):new THREE.Matrix4().makeScale(0,0,0));mesh.instanceMatrix.needsUpdate=true;});
  }
  function promote(item){
    if(!item.tape.blank)return item.model;
    const pack=blank.pack.clone(true),materials=[];
    pack.traverse(o=>{if(!o.isMesh)return;o.material=o.material.clone();materials.push(o.material);if(o.name.includes('Label'))o.material.color.multiply(item.color);});
    pack.position.copy(item.position);pack.quaternion.copy(item.quaternion);
    setInstance(item,false);
    return {...blank,pack,hinge:pack.getObjectByName('Lid_Hinge'),tape:item.tape,dispose:()=>materials.forEach(m=>m.dispose())};
  }
  function detailPose(){
    const pack=active.model.pack,oldP=pack.position.clone(),oldQ=pack.quaternion.clone();
    const endP=new THREE.Vector3(0,4,0),endQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-.16,0));
    pack.position.copy(endP);pack.quaternion.copy(endQ);pack.updateMatrixWorld(true);
    const sphere=new THREE.Box3().setFromObject(pack).getBoundingSphere(new THREE.Sphere());
    const distance=sphere.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.06/Math.min(1,camera.aspect);
    const direction=new THREE.Vector3(...(active.tape.tracks?.length?[.3,4,1.5]:[.9,2.9,2.7])).normalize();
    const endCamera=sphere.center.clone().addScaledVector(direction,distance),testCamera=camera.clone();testCamera.position.copy(endCamera);testCamera.lookAt(sphere.center);
    pack.position.copy(oldP);pack.quaternion.copy(oldQ);pack.updateMatrixWorld(true);
    return {endP,endQ,endCamera,endCameraQ:testCamera.quaternion.clone()};
  }
  function setState(value){state=value;canvas.dataset.state=value;}
  function pick(index){
    if(state!=='box')return;
    const item=items[index];if(!item)return;
    active=item;active.model=promote(item);scene.attach(active.model.pack);
    onPick(item.tape,index);setState('lifting');
    const end=detailPose();
    motion={start:performance.now(),duration:1100,fromP:item.position.clone(),fromQ:item.quaternion.clone(),fromCamera:camera.position.clone(),fromCameraQ:camera.quaternion.clone(),...end,returning:false};
    tick(performance.now());
  }
  function putBack(){
    if(!active||state==='returning')return;
    detailDispose?.();detailDispose=null;
    // Stop the player immediately; the lid closes during the return movement.
    onReturn(false);setState('returning');
    const pack=active.model.pack;
    motion={start:performance.now(),duration:950,fromP:pack.position.clone(),fromQ:pack.quaternion.clone(),fromCamera:camera.position.clone(),fromCameraQ:camera.quaternion.clone(),endP:active.position.clone(),endQ:active.quaternion.clone(),endCamera:homeCamera.clone(),endCameraQ:homeQuaternion.clone(),returning:true,fromAlpha:backdropAlpha,lid:active.model.hinge.rotation.z};
    cancelAnimationFrame(raf);tick(performance.now());
  }
  function tick(time){
    if(!motion)return;
    const t=reduced.matches?1:clamp((time-motion.start)/motion.duration,0,1),u=ease(t),m=motion,pack=active.model.pack;
    if(m.returning){
      const lift=ease(clamp((1-t)/.48,0,1)),travel=ease(clamp((1-t-.18)/.82,0,1));
      pack.position.lerpVectors(m.endP,m.fromP,travel);pack.position.y=m.endP.y+(m.fromP.y-m.endP.y)*lift;
      pack.quaternion.slerpQuaternions(m.fromQ,m.endQ,1-ease(clamp((1-t-.2)/.8,0,1)));
      active.model.hinge.rotation.z=m.lid*(1-ease(clamp(t/.45,0,1)));
    }else{
      // Clear the neighbors first, then turn the cover toward the viewer.
      const lift=ease(clamp(t/.48,0,1)),travel=ease(clamp((t-.18)/.82,0,1));
      pack.position.lerpVectors(m.fromP,m.endP,travel);pack.position.y=m.fromP.y+(m.endP.y-m.fromP.y)*lift;
      pack.quaternion.slerpQuaternions(m.fromQ,m.endQ,ease(clamp((t-.2)/.8,0,1)));
    }
    camera.position.lerpVectors(m.fromCamera,m.endCamera,u);camera.quaternion.slerpQuaternions(m.fromCameraQ,m.endCameraQ,u);camera.updateMatrixWorld();
    backdrop(m.returning?THREE.MathUtils.lerp(m.fromAlpha,1,u):1-u);canvas.dataset.progress=t.toFixed(3);onProgress(t,m.returning);draw();
    if(t<1)raf=requestAnimationFrame(tick);else finishMotion();
  }
  function finishMotion(){
    if(!motion)return;
    const m=motion;motion=null;cancelAnimationFrame(raf);
    active.model.pack.position.copy(m.endP);active.model.pack.quaternion.copy(m.endQ);camera.position.copy(m.endCamera);camera.quaternion.copy(m.endCameraQ);camera.updateMatrixWorld();
    if(m.returning){
      active.model.hinge.rotation.z=0;
      if(active.tape.blank){scene.remove(active.model.pack);setInstance(active,true);active.model.dispose();delete active.model;}
      else storage.attach(active.model.pack);
      active=null;backdrop(1);setState('box');placeCamera();targets();onReturn(true);
    }else{
      backdrop(0);setState('held');
      detailDispose=onReady(active.model,{renderer,scene,camera,draw});
    }
    draw();
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change',()=>{if(motion)finishMotion();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&motion)finishMotion();});
  canvas.dataset.ready='true';canvas.dataset.state='box';draw();targets();
  const api={pick,putBack,renderer,scene,camera,items,get active(){return active;},get state(){return state;}};
  canvas.collectionViewer=api;
  return api;
}
