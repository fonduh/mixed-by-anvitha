import * as THREE from 'three';
import {caseFrame,coverDirection as defaultDirection} from './case-framing.js?v=handwritten-1';
export function attachCaseControls(canvas,button,caseModel,stage,onSelect=()=>{},onOpenChange=()=>{},onViewChange=()=>{}){
  const {pack,hinge,regions,printedDisc,coverPrint,tape}=caseModel;
  const {renderer,scene,camera,draw}=stage;
  const tracks=tape.tracks||[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController();
  let disposed=false,raf=0,animation=null,target=caseModel.openProgress,canSelect=false,zoom=1,focusRegion=null,spineView=false;
  const viewOffset=new THREE.Vector3(),viewCenter=new THREE.Vector3();
  function syncOpen(force=false){const open=target>0&&caseModel.openProgress>=1-1e-6;if(force||open!==canSelect){canSelect=open;onOpenChange(open);}}
  const direction=defaultDirection();
  function render(){
    if(disposed)return;
    pack.updateMatrixWorld(true);
    const frame=caseFrame(pack,camera,canvas,direction,{zoom,focus:focusRegion?caseModel.trackPoint(focusRegion,true):null,offset:viewOffset,spine:spineView?caseModel.tapeMeshes.spine:null,upHint:new THREE.Vector3(0,spineView?-1:1,0)});
    viewCenter.copy(frame.center);camera.position.copy(frame.position);camera.up.set(0,spineView?-1:1,0);camera.lookAt(frame.center);camera.updateMatrixWorld();draw();
  }
  function viewChanged(){canvas.dataset.zoom=zoom.toFixed(2);canvas.dataset.focusedTrack=focusRegion?.track.uri||'';onViewChange({zoom,track:focusRegion?.track||null});render();}
  function setZoom(value){zoom=THREE.MathUtils.clamp(Number(value)||1,1,4);if(zoom===1){focusRegion=null;viewOffset.set(0,0,0);}viewChanged();}
  function coverDirection(){spineView=false;direction.copy(defaultDirection());canvas.dataset.view='cover';}
  function resetZoom(){focusRegion=null;zoom=1;viewOffset.set(0,0,0);coverDirection();viewChanged();}
  function focusSpine(){focusRegion=null;spineView=true;zoom=1;viewOffset.set(0,0,0);direction.set(0,1.3,-4).applyQuaternion(pack.quaternion).normalize();canvas.dataset.view='spine';viewChanged();}
  function focusTrack(uri){if(!canSelect)return;const region=regions.find(r=>r.track.uri===uri);if(!region)return;coverDirection();focusRegion=region;zoom=3.2;viewOffset.set(0,0,0);viewChanged();}
  function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
  function pose(progress){caseModel.setOpenProgress(progress);syncOpen();canvas.dataset.open=String(canSelect);render();}
  function settle(){cancelAnimationFrame(raf);animation=null;pose(target);}
  function frame(time){if(disposed||!animation)return;const t=Math.min(1,(time-animation.start)/animation.duration);pose(THREE.MathUtils.lerp(animation.from,target,t));if(t<1)raf=requestAnimationFrame(frame);else animation=null;}
  function toggle(){target=target?0:1;resetZoom();syncOpen(!target);button.textContent=target?'Close case':'Open case';button.setAttribute('aria-expanded',String(Boolean(target)));cancelAnimationFrame(raf);if(reduced.matches){settle();return;}animation={start:performance.now(),from:caseModel.openProgress,duration:Math.max(1,Math.abs(target-caseModel.openProgress)*caseModel.clip.duration*1000)};raf=requestAnimationFrame(frame);}
  button.disabled=false;button.addEventListener('click',toggle,{signal:events.signal});
  reduced.addEventListener('change',settle,{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)settle();},{signal:events.signal});
  let drag;const pointers=new Set();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  canvas.addEventListener('wheel',event=>{
    if(!event.deltaY)return;
    event.preventDefault();
    const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);
    const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(direction,viewCenter);
    raycaster.setFromCamera(pointer,camera);const before=raycaster.ray.intersectPlane(plane,new THREE.Vector3());
    const units=event.deltaMode===1?16:event.deltaMode===2?box.height:1;
    const delta=THREE.MathUtils.clamp(event.deltaY*units,-240,240);
    setZoom(zoom*Math.exp(-delta*(event.ctrlKey ? .012 : .0018)));
    if(before&&zoom>1){raycaster.setFromCamera(pointer,camera);const after=raycaster.ray.intersectPlane(plane,new THREE.Vector3());if(after){viewOffset.add(before.sub(after));render();}}
  },{passive:false,signal:events.signal});
  function selectedTrack(event){
    if(!printedDisc||!canSelect)return null;
    const box=canvas.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,1-(event.clientY-box.top)/box.height*2);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(coverPrint?[coverPrint,printedDisc]:[printedDisc])[0];if(!hit||hit.object!==printedDisc)return null;
    const x=hit.uv.x*1024,y=(1-hit.uv.y)*1024;
    return regions.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)?.track;
  }
  canvas.addEventListener('pointerdown',e=>{
    pointers.add(e.pointerId);if(pointers.size>1){drag=null;return;}if(e.button!==0)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,rotation:pack.rotation.y,moved:false};canvas.setPointerCapture(e.pointerId);
  },{signal:events.signal});
  canvas.addEventListener('pointermove',e=>{if(drag&&drag.id===e.pointerId){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;if(drag.moved){pack.rotation.y=drag.rotation+(e.clientX-drag.x)*.008;render();}}},{signal:events.signal});
  canvas.addEventListener('pointerup',e=>{
    if(drag&&drag.id===e.pointerId&&!drag.moved&&pointers.size===1){
      const track=selectedTrack(e);
      if(track)onSelect(track);
      else {
        const box=canvas.getBoundingClientRect();pointer.set((e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2);raycaster.setFromCamera(pointer,camera);
        if(raycaster.intersectObject(pack,true).length)toggle();
      }
    }
    pointers.delete(e.pointerId);drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  },{signal:events.signal});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;},{signal:events.signal});
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pack.rotation.y+=(e.key==='ArrowLeft'?-.15:.15);render();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}else if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}else if(e.key==='0'){e.preventDefault();resetZoom();}},{signal:events.signal});
  const observer=new ResizeObserver(resize);observer.observe(canvas);const controls=document.querySelector('#case-controls');if(controls)observer.observe(controls);resize();canvas.dataset.ready='true';canvas.dataset.label=tape.label;
  canvas.caseViewer={renderer,model:pack,caseModel,hinge,render,setZoom,resetZoom,focusSpine,focusTrack,toggle,close:()=>{target=0;syncOpen();settle();},trackPoints:()=>regions.map(r=>{const point=caseModel.trackPoint(r);point.project(camera);const box=canvas.getBoundingClientRect();return {title:r.track.title,x:box.x+(point.x+1)*box.width/2,y:box.y+(1-point.y)*box.height/2};})};viewChanged();
  return ()=>{disposed=true;events.abort();observer.disconnect();cancelAnimationFrame(raf);delete canvas.caseViewer;};
}
