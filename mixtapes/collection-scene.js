import * as THREE from 'three';
import {createCase} from './case-model.js?v=clear-lid-1';
import {mergeGeometries} from '../album/vendor/BufferGeometryUtils.js';
import {caseFrame,coverDirection} from './case-framing.js?v=handwritten-1';

const ease=t=>t*t*t*(t*(t*6-15)+10);
const clamp=THREE.MathUtils.clamp;
export async function mountCollection(canvas,slots,{onPick,onReady,onReturn,onProgress,onLayout,layout,onBrowse=()=>{}}){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.01,80);scene.background=new THREE.Color(0xf6f5e9);
  scene.add(new THREE.HemisphereLight(0xffffff,0x73786c,.65));
  const key=new THREE.DirectionalLight(0xfff9e9,1.1);key.position.set(-3,10,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0xe0ebff,.2);fill.position.set(5,6,-2);scene.add(fill);
  // Reference studio cards converted from its front-facing camera to Y-up.
  const room=new THREE.Scene();room.background=new THREE.Color(.008,.008,.008);
  for(const [position,size,intensity] of [[[-1.2,.25,1.1],[.32,3.5],7],[[1.3,.15,.7],[.22,3],5],[[0,1.4,.6],[3,.4],6],[[.3,-1.6,.3],[2.5,.2],3],[[-.3,.4,2.5],[2,2],.025]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));panel.position.set(position[0],position[2],-position[1]);panel.lookAt(0,0,0);room.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.04,.1,10);scene.environment=env.texture;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  const storage=new THREE.Group();scene.add(storage);
  const blank=await createCase(renderer,{title:'',label:'',tracks:[],blank:true});
  const units=layout.worldUnitsPerPixel,thickness=1;
  const footprint=blank.footprint;
  const [left,top,right,bottom]=layout.boundsPx,cx=(left+right)/2,cy=(top+bottom)/2;
  const width=(right-left)*units,depth=(bottom-top)*units,spacing=layout.medianCenterSpacingPx*units;
  const spineHeight=1.5;
  const standing=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
  const firstFilled=slots.findIndex(tape=>!tape.blank);
  const initialFocus=firstFilled<0?0:firstFilled;
  // Browse by measured vertical position, shared by both columns.
  const pitch=layout.medianCenterSpacingPx;
  let browsePosition=layout.spines[initialFocus].centerPx[1],browseTarget=browsePosition;
  let browseRAF=0,browseTime=0,browseMix=0,browseMixTarget=0;
  let pointer=null,hoverIndex=null,keyboardIndex=initialFocus;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  // Every base pose comes from a traced line in the photograph. Image-plane
  // coordinates preserve perspective already present in that photograph.
  // Uniform scale preserves the new model's physical proportions, including its edges.
  const items=slots.map((tape,index)=>{
    const measured=layout.spines[index],side=measured.column==='L'?-1:1;
    const uniformScale=measured.widthPx*units/footprint.width;
    const modelScale=new THREE.Vector3(uniformScale,uniformScale*thickness,uniformScale);
    const baseQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-THREE.MathUtils.degToRad(measured.angleDeg))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),THREE.MathUtils.degToRad(measured.leanDeg||0))).multiply(standing);
    const anchor=new THREE.Vector3((measured.centerPx[0]-cx)*units,spineHeight,(measured.centerPx[1]-cy)*units);
    const basePosition=anchor.clone().sub(footprint.spineCenter.clone().multiply(modelScale).applyQuaternion(baseQuaternion));
    return {tape,index,measured,side,uniformScale,modelScale,basePosition,baseQuaternion,position:basePosition.clone(),quaternion:baseQuaternion.clone(),matrix:new THREE.Matrix4(),focus:0,passed:0,color:new THREE.Color(measured.paperColor)};
  });
  const columns={L:items.filter(item=>item.measured.column==='L'),R:items.filter(item=>item.measured.column==='R')};
  const minRow=Math.min(...items.map(item=>item.measured.centerPx[1]));
  const maxRow=Math.max(...items.map(item=>item.measured.centerPx[1]));
  const nearest=(column,y)=>columns[column].reduce((best,item)=>Math.abs(item.measured.centerPx[1]-y)<Math.abs(best.measured.centerPx[1]-y)?item:best);
  function poseFor(item,focus){
    // Pivot at the lower edge, keeping the measured spacing on the box floor.
    // Negative world-X rotation sends the upper edge toward screen top.
    const passed=ease(clamp((browsePosition-item.measured.centerPx[1]-pitch*.4)/(pitch*3),0,1))*browseMix*(1-focus);
    const quaternion=item.baseQuaternion.clone().slerp(standing,focus);
    quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-.32*passed));
    const foot=footprint.foot.clone().multiply(item.modelScale);
    const position=item.basePosition.clone()
      .add(foot.clone().applyQuaternion(item.baseQuaternion))
      .sub(foot.applyQuaternion(quaternion));
    position.y+=.24*focus;
    return {position,quaternion,passed};
  }
  function browsePose(item){
    const pose=poseFor(item,item.focus);
    item.position.copy(pose.position);item.quaternion.copy(pose.quaternion);item.passed=pose.passed;
    item.matrix.compose(item.position,item.quaternion,new THREE.Vector3().setScalar(item.uniformScale));
  }
  items.forEach(browsePose);
  // Every slot owns its hierarchy, mixer and tape textures. Closed blank bodies
  // share instanced geometry; picking reveals that slot's original articulated
  // hierarchy, with the same geometry and labels, at the exact current pose.
  const empty=items.filter(item=>item.tape.blank),batches=[];
  const models=await Promise.all(items.map(item=>createCase(renderer,{...item.tape,paperColor:item.tape.blank?item.measured.paperColor:undefined})));
  items.forEach((item,i)=>{
    item.model=models[i];item.model.pack.scale.copy(item.modelScale);item.model.pack.position.copy(item.position);item.model.pack.quaternion.copy(item.quaternion);
    if(item.tape.blank)item.model.setStored(true);
    storage.add(item.model.pack);
  });
  blank.pack.updateMatrixWorld(true);
  const groups=new Map();
  for(const source of blank.bodyMeshes){
    const geometry=(source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone()).applyMatrix4(source.matrixWorld);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    if(!groups.has(source.material))groups.set(source.material,[]);groups.get(source.material).push(geometry);
  }
  for(const [sourceMaterial,geometries] of groups){
    const geometry=mergeGeometries(geometries),material=sourceMaterial.clone();geometries.forEach(g=>g.dispose());
    if(!geometry)throw Error('Could not batch the detailed CD geometry.');
    if(material.thickness)material.thickness*=blank.normalizer;
    const mesh=new THREE.InstancedMesh(geometry,material,empty.length);mesh.name='Stored_'+material.name;mesh.frustumCulled=false;
    empty.forEach((item,i)=>{item.instance=i;item.stored=true;mesh.setMatrixAt(i,item.matrix);});storage.add(mesh);batches.push(mesh);
  }
  // Keep the photographed CD positions without the cardboard floor or walls.
  const backgroundMaterials=new Map();storage.traverse(o=>{if(o.material&&!backgroundMaterials.has(o.material))backgroundMaterials.set(o.material,{opacity:o.material.opacity,depthWrite:o.material.depthWrite,transparent:o.material.transparent});});
  // Compile both the instanced rack and ordinary mesh path before the first lift.
  const warm=blank.pack.clone(true);warm.visible=true;warm.position.set(0,-50,0);scene.add(warm);
  let active=null,state='box',motion=null,raf=0,detailDispose=null,backdropAlpha=1;
  let homeCamera=new THREE.Vector3(),homeQuaternion=new THREE.Quaternion();
  const frustum=new THREE.Frustum(),viewProjection=new THREE.Matrix4(),caseSphere=new THREE.Sphere();
  function draw(){
    if(storage.visible){
      camera.updateMatrixWorld();frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const visible=empty.filter(item=>item.stored&&frustum.intersectsSphere(caseSphere.set(item.position,1.02*item.uniformScale)));
      for(const mesh of batches){mesh.count=visible.length;visible.forEach((item,i)=>mesh.setMatrixAt(i,item.matrix));mesh.instanceMatrix.needsUpdate=true;}
    }
    renderer.render(scene,camera);
  }
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
    // Cover the viewport with the box instead of fitting its entire height.
    // Follow the browsed row so the cropped rows remain reachable by scrolling.
    const distance=Math.min(depth/(2*Math.tan(fov)),width/(2*Math.tan(fov)*camera.aspect));
    const viewDepth=2*distance*Math.tan(fov);
    const rowY=browsePosition;
    const centerZ=clamp((rowY-cy)*units,-depth/2+viewDepth/2,depth/2-viewDepth/2);
    // A plan-view camera reproduces the measured 2D geometry exactly. Camera
    // perspective in the source is retained in the traced centers and spans.
    camera.up.set(0,0,-1);camera.position.set(0,spineHeight+distance,centerZ);camera.lookAt(0,spineHeight,centerZ);camera.updateMatrixWorld();
    homeCamera.copy(camera.position);homeQuaternion.copy(camera.quaternion);
  }
  function screen(point){
    const r=canvas.getBoundingClientRect();point.project(camera);
    return {x:(point.x+1)*r.width/2,y:(1-point.y)*r.height/2};
  }
  function pointerCase(){
    // Include scroll lean in hit positions, but exclude the hover lift itself.
    // This keeps selection aligned with the visible row without hover feedback.
    if(!pointer){hoverIndex=null;return;}
    const pointerTargets=items.map(item=>{
      const pose=poseFor(item,0);
      const edge=point=>screen(point.clone().multiply(item.modelScale).applyQuaternion(pose.quaternion).add(pose.position));
      return {index:item.index,left:edge(footprint.spineLeft),right:edge(footprint.spineRight)};
    });
    let closest=null,distance=Infinity;
    for(const point of pointerTargets){
      const lo=Math.min(point.left.x,point.right.x),hi=Math.max(point.left.x,point.right.x);
      if(pointer.x<lo-10||pointer.x>hi+10)continue;
      const t=clamp((pointer.x-point.left.x)/(point.right.x-point.left.x),0,1);
      const y=THREE.MathUtils.lerp(point.left.y,point.right.y,t);
      const d=Math.abs(pointer.y-y);
      if(d<distance){distance=d;closest=point.index;}
    }
    hoverIndex=closest;
  }
  function focusedIndex(){return hoverIndex??keyboardIndex;}
  function targets(){
    const r=canvas.getBoundingClientRect();
    const points=items.map(item=>{
      const center=screen(footprint.spineCenter.clone().applyMatrix4(item.matrix));
      const left=screen(footprint.spineLeft.clone().applyMatrix4(item.matrix));
      const right=screen(footprint.spineRight.clone().applyMatrix4(item.matrix));
      return {index:item.index,x:center.x,y:center.y,width:Math.hypot(right.x-left.x,right.y-left.y),height:Math.max(14,r.height*spacing/(2*(camera.position.y-spineHeight)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*.7),angle:Math.atan2(right.y-left.y,right.x-left.x)*180/Math.PI,focused:focusedIndex()===item.index};
    });onLayout(points);
  }
  function updateBrowse(blend=1){
    placeCamera();pointerCase();
    const scrollFocus=new Set(['L','R'].map(column=>nearest(column,browsePosition).index));
    let moving=false;
    items.forEach(item=>{
      const target=hoverIndex!==null?Number(item.index===hoverIndex):(scrollFocus.has(item.index)?browseMix:0);
      item.focus+=(target-item.focus)*blend;
      if(Math.abs(target-item.focus)<.002)item.focus=target;else moving=true;
      browsePose(item);
      if(item.model){item.model.pack.position.copy(item.position);item.model.pack.quaternion.copy(item.quaternion);}
      if(item.tape.blank)setInstance(item,true);
    });
    canvas.dataset.browse=browsePosition.toFixed(3);
    canvas.dataset.focusedCase=String(focusedIndex());
    canvas.dataset.hoveredCase=hoverIndex===null?'':String(hoverIndex);
    targets();draw();onBrowse(focusedIndex());return moving;
  }
  function browseFrame(time){
    browseRAF=0;if(state!=='box')return;
    const dt=Math.min(50,time-browseTime||16.7);browseTime=time;
    const blend=1-Math.exp(-dt/110);
    browsePosition+=(browseTarget-browsePosition)*blend;
    browseMix+=(browseMixTarget-browseMix)*blend;
    if(Math.abs(browseMixTarget-browseMix)<.002)browseMix=browseMixTarget;
    if(Math.abs(browseTarget-browsePosition)<.002)browsePosition=browseTarget;
    const moving=updateBrowse(blend);
    if(moving||browsePosition!==browseTarget||browseMix!==browseMixTarget)browseRAF=requestAnimationFrame(browseFrame);
  }
  function animateBrowse(){
    if(state!=='box')return;
    if(reduced.matches){browsePosition=browseTarget;browseMix=browseMixTarget;updateBrowse();}
    else if(!browseRAF){browseTime=performance.now();browseRAF=requestAnimationFrame(browseFrame);}
  }
  function browseTo(index){
    if(state!=='box')return false;
    keyboardIndex=clamp(Math.round(index),0,items.length-1);
    browseTarget=items[keyboardIndex].measured.centerPx[1];browseMixTarget=1;
    animateBrowse();return true;
  }
  function browseBy(delta){
    if(state!=='box')return false;
    const next=clamp(browseTarget+delta*pitch,minRow,maxRow);
    if(next===browseTarget)return false;
    const column=items[focusedIndex()].measured.column;
    browseTarget=next;keyboardIndex=nearest(column,next).index;browseMixTarget=1;
    animateBrowse();return true;
  }
  const surface=canvas.parentElement;
  let touch=null,suppressClick=false;
  surface.addEventListener('wheel',event=>{
    if(state!=='box'||event.ctrlKey||!event.deltaY)return;
    const units=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
    if(browseBy(clamp(event.deltaY*units,-280,280)/145))event.preventDefault();
  },{passive:false});
  surface.addEventListener('pointerleave',()=>{if(state==='box'){pointer=null;animateBrowse();}});
  surface.addEventListener('pointerdown',event=>{
    suppressClick=false;
    if(state!=='box'||event.pointerType!=='touch')return;
    pointer=null;hoverIndex=null;
    touch={id:event.pointerId,y:event.clientY,last:event.clientY,moved:false};
  });
  surface.addEventListener('pointermove',event=>{
    if(state!=='box')return;
    if(event.pointerType==='mouse'||event.pointerType==='pen'){
      const r=canvas.getBoundingClientRect();pointer={x:event.clientX-r.left,y:event.clientY-r.top};animateBrowse();return;
    }
    if(!touch||touch.id!==event.pointerId)return;
    if(Math.abs(event.clientY-touch.y)>7)touch.moved=true;
    if(touch.moved){event.preventDefault();browseBy((touch.last-event.clientY)/55);}
    touch.last=event.clientY;
  },{passive:false});
  const endTouch=()=>{if(!touch)return;suppressClick=touch.moved;touch=null;};
  surface.addEventListener('pointerup',endTouch);surface.addEventListener('pointercancel',endTouch);
  surface.addEventListener('click',event=>{
    if(state!=='box')return;
    if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();return;}
    // A pointer click picks the lifted case even when its projected spine has
    // moved above the resting hit area. Keyboard activation keeps its DOM target.
    if(event.detail>0&&hoverIndex!==null){event.preventDefault();event.stopImmediatePropagation();pick(hoverIndex);}
  },{capture:true});
  surface.addEventListener('keydown',event=>{
    if(state!=='box')return;
    const targetIndex=Array.from(surface.querySelectorAll('.case-hit')).indexOf(event.target.closest('.case-hit'));
    const current=items[targetIndex<0?focusedIndex():targetIndex],column=columns[current.measured.column];
    let next;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight')next=nearest(event.key==='ArrowLeft'?'L':'R',current.measured.centerPx[1]).index;
    else if(event.key==='ArrowDown'||event.key==='ArrowUp')next=column[clamp(column.indexOf(current)+(event.key==='ArrowDown'?1:-1),0,column.length-1)].index;
    else if(event.key==='Home')next=column[0].index;
    else if(event.key==='End')next=column.at(-1).index;
    else return;
    event.preventDefault();pointer=null;hoverIndex=null;browseTo(next);
    surface.querySelectorAll('.case-hit')[next]?.focus({preventScroll:true});
  });
  function resize(){
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
    const previousPosition=camera.position.clone(),previousQuaternion=camera.quaternion.clone(),previousUp=camera.up.clone();
    placeCamera();
    if(state==='box'){pointerCase();targets();draw();}
    else {
      camera.position.copy(previousPosition);camera.quaternion.copy(previousQuaternion);camera.up.copy(previousUp);camera.updateMatrixWorld();
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
  function setInstance(item,visible){item.stored=visible;}
  function promote(item){
    if(item.tape.blank){setInstance(item,false);item.model.setStored(false);}
    return item.model;
  }
  function detailPose(){
    const pack=active.model.pack,oldP=pack.position.clone(),oldQ=pack.quaternion.clone();
    const endP=new THREE.Vector3(0,4,0),endQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-.16,0));
    pack.position.copy(endP);pack.quaternion.copy(endQ);pack.updateMatrixWorld(true);
    const frame=caseFrame(pack,camera,canvas,coverDirection());
    const endCamera=frame.position,testCamera=camera.clone();testCamera.position.copy(endCamera);testCamera.up.set(0,1,0);testCamera.lookAt(frame.center);
    pack.position.copy(oldP);pack.quaternion.copy(oldQ);pack.updateMatrixWorld(true);
    return {endP,endQ,endCamera,endCameraQ:testCamera.quaternion.clone()};
  }
  function setState(value){state=value;canvas.dataset.state=value;}
  function pick(index){
    if(state!=='box')return;
    const item=items[index];if(!item)return;
    cancelAnimationFrame(browseRAF);browseRAF=0;browseTarget=browsePosition;browseMixTarget=browseMix;pointer=null;hoverIndex=null;keyboardIndex=index;
    active=item;active.model=promote(item);scene.attach(active.model.pack);
    onPick(item.tape,index);setState('lifting');
    camera.up.set(0,1,0);const end=detailPose();
    motion={start:performance.now(),duration:1100,fromP:item.position.clone(),fromQ:item.quaternion.clone(),fromCamera:camera.position.clone(),fromCameraQ:camera.quaternion.clone(),...end,returning:false};
    tick(performance.now());
  }
  function putBack(){
    if(!active||state==='returning')return;
    detailDispose?.();detailDispose=null;
    // Stop the player immediately; the lid closes during the return movement.
    onReturn(false);setState('returning');
    const pack=active.model.pack;
    motion={start:performance.now(),duration:950,fromP:pack.position.clone(),fromQ:pack.quaternion.clone(),fromCamera:camera.position.clone(),fromCameraQ:camera.quaternion.clone(),endP:active.position.clone(),endQ:active.quaternion.clone(),endCamera:homeCamera.clone(),endCameraQ:homeQuaternion.clone(),returning:true,fromAlpha:backdropAlpha,lid:active.model.openProgress};
    cancelAnimationFrame(raf);tick(performance.now());
  }
  function tick(time){
    if(!motion)return;
    const t=reduced.matches?1:clamp((time-motion.start)/motion.duration,0,1),u=ease(t),m=motion,pack=active.model.pack;
    if(m.returning){
      const lift=ease(clamp((1-t)/.48,0,1)),travel=ease(clamp((1-t-.18)/.82,0,1));
      pack.position.lerpVectors(m.endP,m.fromP,travel);pack.position.y=m.endP.y+(m.fromP.y-m.endP.y)*lift;
      pack.quaternion.slerpQuaternions(m.fromQ,m.endQ,1-ease(clamp((1-t-.2)/.8,0,1)));
      active.model.setOpenProgress(m.lid*(1-ease(clamp(t/.45,0,1))));
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
      active.model.setOpenProgress(0);
      storage.attach(active.model.pack);
      if(active.tape.blank){active.model.setStored(true);setInstance(active,true);}
      active=null;backdrop(1);setState('box');placeCamera();targets();onReturn(true);animateBrowse();
    }else{
      backdrop(0);setState('held');
      detailDispose=onReady(active.model,{renderer,scene,camera,draw});
    }
    draw();
  }
  reduced.addEventListener('change',()=>{if(motion)finishMotion();if(reduced.matches&&state==='box'){cancelAnimationFrame(browseRAF);browseRAF=0;browsePosition=browseTarget;browseMix=browseMixTarget;updateBrowse();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&motion)finishMotion();});
  canvas.dataset.ready='true';canvas.dataset.state='box';updateBrowse();
  const api={layout,thickness,pick,putBack,browseTo,browseBy,get browsePosition(){return browsePosition;},get browseTarget(){return browseTarget;},renderer,scene,camera,items,get active(){return active;},get state(){return state;}};
  canvas.collectionViewer=api;
  return api;
}
