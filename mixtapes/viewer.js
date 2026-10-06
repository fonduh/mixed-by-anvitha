import * as THREE from 'three';
export function attachCaseControls(canvas,button,caseModel,stage,onSelect=()=>{},onOpenChange=()=>{},onViewChange=()=>{}){
  const {pack,hinge,regions,printedDisc,coverPrint,tape}=caseModel;
  const {renderer,scene,camera,draw}=stage;
  const tracks=tape.tracks||[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),events=new AbortController();
  let disposed=false,raf=0,animation=null,target=0,canSelect=false,zoom=1,focusRegion=null;
  const viewOffset=new THREE.Vector3(),viewCenter=new THREE.Vector3();
  function syncOpen(){const open=target>0&&hinge.rotation.z>=1.95-1e-6;if(open!==canSelect){canSelect=open;onOpenChange(open);}}
  const bounds=new THREE.Box3(),sphere=new THREE.Sphere(),direction=(tracks.length?new THREE.Vector3(.3,4,1.5):new THREE.Vector3(.9,2.9,2.7)).normalize();
  function render(){
    if(disposed)return;
    pack.updateMatrixWorld(true);bounds.setFromObject(pack);bounds.getBoundingSphere(sphere);
    const center=focusRegion?pack.localToWorld(new THREE.Vector3((focusRegion.x+focusRegion.w/2)/1024*1.2-.6+.045,.087,(focusRegion.y+47)/1024*1.2-.6)):sphere.center.clone();
    const distance=sphere.radius/Math.sin(THREE.MathUtils.degToRad(camera.fov/2))*1.06/Math.min(1,camera.aspect)/zoom;
    if(focusRegion)center.addScaledVector(new THREE.Vector3(0,1,0).projectOnPlane(direction).normalize(),-distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.4);
    center.add(viewOffset);viewCenter.copy(center);
    camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);camera.updateMatrixWorld();
    draw();
  }
  function viewChanged(){canvas.dataset.zoom=zoom.toFixed(2);canvas.dataset.focusedTrack=focusRegion?.track.uri||'';onViewChange({zoom,track:focusRegion?.track||null});render();}
  function setZoom(value){zoom=THREE.MathUtils.clamp(Number(value)||1,1,4);if(zoom===1){focusRegion=null;viewOffset.set(0,0,0);}viewChanged();}
  function coverDirection(){direction.set(...(tracks.length?[.3,4,1.5]:[.9,2.9,2.7])).normalize();canvas.dataset.view='cover';}
  function resetZoom(){focusRegion=null;zoom=1;viewOffset.set(0,0,0);coverDirection();viewChanged();}
  function focusSpine(){focusRegion=null;zoom=1.25;viewOffset.set(0,0,0);direction.set(-3,1.6,1.3).normalize();canvas.dataset.view='spine';viewChanged();}
  function focusTrack(uri){if(!canSelect)return;const region=regions.find(r=>r.track.uri===uri);if(!region)return;coverDirection();focusRegion=region;zoom=3.2;viewOffset.set(0,0,0);viewChanged();}
  function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
  function pose(angle){hinge.rotation.z=angle;syncOpen();canvas.dataset.open=String(canSelect);render();}
  function settle(){cancelAnimationFrame(raf);animation=null;pose(target);}
  function frame(time){if(disposed||!animation)return;const t=Math.min(1,(time-animation.start)/650);pose(THREE.MathUtils.lerp(animation.from,target,t*t*(3-2*t)));if(t<1)raf=requestAnimationFrame(frame);else animation=null;}
  function toggle(){target=target?0:1.95;resetZoom();syncOpen();button.textContent=target?'Close case':'Open case';button.setAttribute('aria-expanded',String(Boolean(target)));cancelAnimationFrame(raf);if(reduced.matches){settle();return;}animation={start:performance.now(),from:hinge.rotation.z};raf=requestAnimationFrame(frame);}
  button.disabled=false;button.addEventListener('click',toggle,{signal:events.signal});
  reduced.addEventListener('change',settle,{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)settle();},{signal:events.signal});
  let drag;
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
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,rotation:pack.rotation.y};canvas.setPointerCapture(e.pointerId);},{signal:events.signal});
  canvas.addEventListener('pointermove',e=>{if(drag){pack.rotation.y=drag.rotation+(e.clientX-drag.x)*.008;render();}},{signal:events.signal});
  canvas.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6){const track=selectedTrack(e);if(track)onSelect(track);else toggle();}drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);},{signal:events.signal});
  canvas.addEventListener('pointercancel',()=>{drag=null;},{signal:events.signal});
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pack.rotation.y+=(e.key==='ArrowLeft'?-.15:.15);render();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}else if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}else if(e.key==='0'){e.preventDefault();resetZoom();}},{signal:events.signal});
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();canvas.dataset.ready='true';canvas.dataset.label=tape.label;
  canvas.caseViewer={renderer,model:pack,hinge,render,setZoom,resetZoom,focusSpine,focusTrack,toggle,close:()=>{target=0;syncOpen();settle();},trackPoints:()=>regions.map(r=>{const point=new THREE.Vector3((r.x+70)/1024*1.2-.6+.045,.087,(r.y+50)/1024*1.2-.6);pack.localToWorld(point);point.project(camera);const box=canvas.getBoundingClientRect();return {title:r.track.title,x:box.x+(point.x+1)*box.width/2,y:box.y+(1-point.y)*box.height/2};})};viewChanged();
  return ()=>{disposed=true;events.abort();observer.disconnect();cancelAnimationFrame(raf);delete canvas.caseViewer;};
}
