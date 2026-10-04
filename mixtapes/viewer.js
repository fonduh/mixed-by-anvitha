import * as THREE from 'three';
import { GLTFLoader } from '../album/vendor/GLTFLoader.js';

let modelPromise;
const model=()=>modelPromise??=new GLTFLoader().loadAsync(new URL('../assets/mixtapes/burned-cd-jewel-case.glb',import.meta.url).href);
export async function mountCase(canvas,button,tape,onSelect=()=>{},onOpenChange=()=>{},onViewChange=()=>{}){
  const gltf=await model();
  if(!canvas.isConnected)return ()=>{};
  await document.fonts.load('20px "Selectric Mono"');
  if(!canvas.isConnected)return ()=>{};
  const coverMap=tape.cover?await new THREE.TextureLoader().loadAsync(new URL('../'+tape.cover,import.meta.url).href).catch(error=>{console.warn('Mixtape cover unavailable',error);return null;}):null;
  if(!canvas.isConnected){coverMap?.dispose();return ()=>{};}
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.85;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.01,30);
  camera.position.set(.9,2.9,2.7);camera.lookAt(0,.12,0);
  scene.add(new THREE.HemisphereLight(0xfffbee,0x637567,1));
  const key=new THREE.DirectionalLight(0xffffff,1.7);key.position.set(-2,5,3);scene.add(key);
  const room=new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(12,12,12),new THREE.MeshBasicMaterial({color:0x87958a,side:THREE.BackSide})));
  for(const [x,y,z,w,h,intensity] of [[-3,4,1,2,6,5],[4,3,-2,1,5,3],[0,5,-3,5,2,4]]){
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity),side:THREE.DoubleSide}));panel.position.set(x,y,z);panel.lookAt(0,0,0);room.add(panel);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(room,.08);scene.environment=env.texture;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  const pack=gltf.scene.clone(true);scene.add(pack);pack.rotation.y=-.16;
  const materials=[],textures=[];
  const tracks=tape.tracks||[],regions=[];
  // A restrained diffraction tint makes the recording surface recognizable as CD-R.
  const discCanvas=document.createElement('canvas');discCanvas.width=discCanvas.height=512;
  const discContext=discCanvas.getContext('2d'),pixels=discContext.createImageData(512,512),tint=new THREE.Color();
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const dx=x-256,dy=y-256,r=Math.hypot(dx,dy)/256,a=Math.atan2(dy,dx);
    const band=Math.pow(Math.abs(Math.sin(a+.3)),12)*.32;
    const grain=Math.sin(r*2200)*.008;
    tint.setHSL((a/Math.PI+1+r*.35)%1,.42,.67);
    const i=(y*512+x)*4;
    pixels.data[i]=Math.round(255*(.73*(1-band)+tint.r*band+grain));
    pixels.data[i+1]=Math.round(255*(.74*(1-band)+tint.g*band+grain));
    pixels.data[i+2]=Math.round(255*(.75*(1-band)+tint.b*band+grain));pixels.data[i+3]=255;
  }
  discContext.putImageData(pixels,0,0);
  const discMap=new THREE.CanvasTexture(discCanvas);discMap.colorSpace=THREE.SRGBColorSpace;textures.push(discMap);
  function label(disc=false){
    const c=document.createElement('canvas');c.width=1024;c.height=208;
    const ctx=c.getContext('2d');
    if(!disc){ctx.fillStyle='#ece4cf';ctx.fillRect(0,0,c.width,c.height);}
    ctx.fillStyle='#344638';ctx.textAlign='center';ctx.font='38px "Selectric Mono", monospace';
    ctx.fillText(disc?'CD-R / WEEKLY MIX':tape.title,512,65,920);
    ctx.font='54px "Selectric Mono", monospace';ctx.fillText(tape.label,512,145,920);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(texture);return texture;
  }
  let hinge;
  pack.traverse(o=>{
    if(o.name==='Lid_Hinge')hinge=o;
    if(!o.isMesh)return;
    let material=o.material.clone();
    if(o.name==='CD_R'||o.name==='Recorded_Area'||o.name.startsWith('Recording_Ring')){
      if(!o.geometry.getAttribute('uv')){
        const positions=o.geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
        for(let i=0;i<positions.count;i++){uv[i*2]=(positions.getX(i)-.045)/1.2+.5;uv[i*2+1]=.5-positions.getZ(i)/1.2;}
        o.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
      }
      material.dispose();material=new THREE.MeshPhysicalMaterial({map:discMap,color:0xffffff,metalness:.78,roughness:.27,iridescence:.28,iridescenceIOR:1.45,iridescenceThicknessRange:[240,390],envMapIntensity:.9});
    }
    if(o.name==='Case_Date_Label'||o.name==='Disc_Date_Label'){
      material.dispose();material=new THREE.MeshBasicMaterial({map:label(o.name==='Disc_Date_Label'),transparent:o.name==='Disc_Date_Label',toneMapped:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
    }
    if(tracks.length&&o.name==='Disc_Date_Label')o.visible=false;
    if(tracks.length&&o.name==='Lid_Glass')material.opacity=.045;
    if(material.transparent){material.depthWrite=false;material.side=THREE.DoubleSide;}
    o.material=material;materials.push(material);
  });
  let printedDisc;
  if(tracks.length){
    const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');
    ctx.fillStyle='#26362f';ctx.textAlign='center';ctx.font='48px "Selectric Mono",monospace';ctx.fillText(tape.title,512,211,660);
    const total=Math.floor(tracks.reduce((sum,t)=>sum+t.durationMs,0)/1000);
    ctx.font='21px "Selectric Mono",monospace';ctx.fillText(`${tracks.length} TRACKS / ${Math.floor(total/60)}:${String(total%60).padStart(2,'0')} / SPOTIFY`,512,255,650);
    function lines(text,x,y,width,font,maxLines=2){
      ctx.font=font;const words=text.split(/\s+/);let line='',count=0;
      for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line&&count<maxLines-1){ctx.fillText(line,x,y,width);line=word;y+=29;count++;}else line=next;}
      ctx.fillText(line,x,y,width);return y;
    }
    const rows=Math.ceil(tracks.length/2),step=Math.min(132,400/rows);
    tracks.forEach((track,index)=>{
      const col=index<rows?0:1,row=index%rows,x=col?606:182,y=350+row*step,w=244;
      ctx.textAlign='left';ctx.fillStyle='#596256';ctx.font='19px "Selectric Mono",monospace';ctx.fillText(String(index+1).padStart(2,'0'),x,y);
      ctx.fillStyle='#26362f';const end=lines(track.title,x,y+29,w,'28px "Selectric Mono",monospace');
      ctx.fillStyle='#515c50';ctx.font='19px "Selectric Mono",monospace';ctx.fillText(track.artist,x,end+27,w);
      regions.push({x:x-10,y:y-20,w:w+20,h:step,track});
    });
    ctx.textAlign='center';ctx.fillStyle='#596256';ctx.font='19px "Selectric Mono",monospace';ctx.fillText('SELECT A TRACK · PRESS PLAY',512,826,590);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(map);
    const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});materials.push(material);
    printedDisc=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),material);printedDisc.name='Printed_Tracklist';printedDisc.rotation.x=-Math.PI/2;printedDisc.position.set(.045,.087,0);pack.add(printedDisc);
  }
  if(!hinge)throw Error('Case hinge missing');
  let coverPrint;
  if(coverMap){
    coverMap.colorSpace=THREE.SRGBColorSpace;coverMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(coverMap);
    const material=new THREE.MeshBasicMaterial({map:coverMap,alphaTest:.35,side:THREE.DoubleSide,toneMapped:false});materials.push(material);
    const height=.98,width=height*coverMap.image.width/coverMap.image.height;
    coverPrint=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);coverPrint.name='Torn_Photo_Cover';
    coverPrint.rotation.set(-Math.PI/2,0,-.025);coverPrint.position.set(.045,.124,-.075);pack.add(coverPrint);
    pack.updateMatrixWorld(true);hinge.attach(coverPrint);
  }
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
    camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
    renderer.render(scene,camera);
  }
  function viewChanged(){canvas.dataset.zoom=zoom.toFixed(2);canvas.dataset.focusedTrack=focusRegion?.track.uri||'';onViewChange({zoom,track:focusRegion?.track||null});render();}
  function setZoom(value){zoom=THREE.MathUtils.clamp(Number(value)||1,1,4);if(zoom===1){focusRegion=null;viewOffset.set(0,0,0);}viewChanged();}
  function resetZoom(){focusRegion=null;zoom=1;viewOffset.set(0,0,0);viewChanged();}
  function focusTrack(uri){if(!canSelect)return;const region=regions.find(r=>r.track.uri===uri);if(!region)return;focusRegion=region;zoom=3.2;viewOffset.set(0,0,0);viewChanged();}
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
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pack.rotation.y+=(e.key==='ArrowLeft'?-.15:.15);render();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom+.25);}else if(e.key==='-'){e.preventDefault();setZoom(zoom-.25);}else if(e.key==='Escape'||e.key==='0'){e.preventDefault();resetZoom();}},{signal:events.signal});
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();canvas.dataset.ready='true';canvas.dataset.label=tape.label;
  canvas.caseViewer={renderer,model:pack,hinge,render,setZoom,resetZoom,focusTrack,trackPoints:()=>regions.map(r=>{const point=new THREE.Vector3((r.x+70)/1024*1.2-.6+.045,.087,(r.y+50)/1024*1.2-.6);pack.localToWorld(point);point.project(camera);const box=canvas.getBoundingClientRect();return {title:r.track.title,x:box.x+(point.x+1)*box.width/2,y:box.y+(1-point.y)*box.height/2};})};viewChanged();
  return ()=>{disposed=true;events.abort();observer.disconnect();cancelAnimationFrame(raf);printedDisc?.geometry.dispose();coverPrint?.geometry.dispose();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());env.texture.dispose();env.dispose();renderer.dispose();};
}
