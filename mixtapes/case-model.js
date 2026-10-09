import * as THREE from 'three';
import {GLTFLoader} from '../album/vendor/GLTFLoader.js';
let modelPromise,fontPromise,handwritingPromise;
const coverMaps=new Map();
export const loadModel=()=>modelPromise??=new GLTFLoader().loadAsync(new URL('../assets/mixtapes/floral-cd-case.glb',import.meta.url).href);
export async function createCase(renderer,tape){
  const gltf=await loadModel();
  await (fontPromise??=document.fonts.load('20px "Selectric Mono"'));
  if(tape.tracks?.length)await (handwritingPromise??=document.fonts.load('40px "Borel"'));
  let coverMap=null;
  if(tape.cover){
    if(!coverMaps.has(tape.cover))coverMaps.set(tape.cover,new THREE.TextureLoader().loadAsync(new URL('../'+tape.cover,import.meta.url).href).then(map=>{map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return map;}));
    coverMap=await coverMaps.get(tape.cover);
  }
  const source=gltf.scene.clone(true),pack=new THREE.Group();pack.name='Mixtape_Case';pack.add(source);
  // glTF is already Y-up, face-up, with the spine at -Z. The reference's
  // assembly X rotation only faces its front camera; this scene uses Y-up.
  // Leave Album_Orientation (the authored 90-degree turn) untouched.
  const rawBounds=new THREE.Box3().setFromObject(source),normalizer=1.25/(rawBounds.max.x-rawBounds.min.x);
  source.scale.setScalar(normalizer);pack.updateMatrixWorld(true);
  const materials=new Map(),textures=[],ownedGeometry=[],tapeMeshes={},bodyMeshes=[];
  const intensity={'Floral printed lacquer':.3,'Clear molded acrylic':2.8,'Clear polycarbonate hub':1.8,'Molded edge facets':2.7,'Satin latch and tooling pads':1.5};
  source.traverse(o=>{
    if(!o.isMesh)return;
    if(!materials.has(o.material)){
      const m=o.material.clone();m.envMapIntensity=intensity[m.name]??1.7;
      if(m.name==='Clear thin cover'){
        // Match the reference's thin-panel treatment, retaining physical glass
        // on the edges, hinges, latch and hub in the single transmission pass.
        m.transmission=0;m.transparent=true;m.opacity=.018;m.depthWrite=false;m.side=THREE.FrontSide;
      }
      materials.set(o.material,m);
    }
    o.material=materials.get(o.material);
    if(o.userData.label_surface){tapeMeshes[o.userData.label_surface]=o;o.material.envMapIntensity=.25;}
    else bodyMeshes.push(o);
  });
  const hinge=source.getObjectByName('Lid_Pivot'),clip=gltf.animations.find(a=>a.name==='Open case');
  if(!hinge||!clip||!tapeMeshes.cover||!tapeMeshes.spine)throw Error('The floral CD model is missing its hinge, Open case animation, or prepared tapes.');
  const mixer=new THREE.AnimationMixer(source),action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  let openProgress=0;
  function setOpenProgress(value){
    openProgress=THREE.MathUtils.clamp(value,0,1);action.enabled=true;action.paused=false;mixer.setTime(openProgress*clip.duration);pack.updateMatrixWorld(true);
  }
  setOpenProgress(0);
  const title=String(tape.title||''),date=String(tape.label||'');
  const labelCanvases={};
  for(const [key,mesh] of Object.entries(tapeMeshes)){
    const text=[title,date].filter(Boolean).join(' · '),canvas=document.createElement('canvas');
    // Blank tapes still own independent textures; small maps avoid spending
    // desktop-sized label memory on the 84 intentionally empty cases.
    canvas.width=text?(key==='cover'?1536:2048):256;
    canvas.height=text?(key==='cover'?240:128):(key==='cover'?40:16);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=false;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    textures.push(texture);mesh.material.map=texture;mesh.material.color.set(0xffffff);mesh.material.needsUpdate=true;
    labelCanvases[key]={canvas,texture,mesh};
  }
  function setWriting({cover='',spine=''}={}){
    for(const [key,{canvas,texture,mesh}] of Object.entries(labelCanvases)){
      const text=String(key==='cover'?cover:spine),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
      ctx.fillStyle=tape.paperColor||'#ded3b8';ctx.fillRect(0,0,w,h);
      let seed=619;for(let i=0;i<Math.min(2500,w*h/20);i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%w;seed=(seed*1664525+1013904223)>>>0;ctx.fillStyle=i%2?'rgba(90,74,42,.035)':'rgba(255,255,244,.12)';ctx.fillRect(x,seed%h,1+i%3,1);}
      let size=h*.57;ctx.font=`${size}px "Selectric Mono",monospace`;
      while(ctx.measureText(text).width>w*.9&&size>12){size-=1;ctx.font=`${size}px "Selectric Mono",monospace`;}
      ctx.fillStyle='#25291f';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h*.52);
      texture.needsUpdate=true;mesh.userData.writing=text;mesh.parent.userData.writing=text;
    }
  }
  const writing=[title,date].filter(Boolean).join(' · ');setWriting({cover:writing,spine:writing});
  // Replace the embedded floral print only for an album with supplied artwork.
  // Re-map that print's UVs into the already-oriented case coordinates so the
  // photo is upright; tape UVs and the authored 90-degree orientation stay intact.
  if(coverMap){
    const artwork=document.createElement('canvas');artwork.width=artwork.height=1024;
    const ctx=artwork.getContext('2d'),img=coverMap.image,crop=Math.min(img.width,img.height);
    ctx.fillStyle='#32241f';ctx.fillRect(0,0,1024,1024);
    ctx.drawImage(img,(img.width-crop)/2,(img.height-crop)*.55,crop,crop,0,0,1024,1024);
    ctx.fillStyle='rgba(18,12,10,.16)';ctx.fillRect(0,0,1024,1024);
    const shade=ctx.createLinearGradient(0,0,1024,0);
    for(const [stop,alpha] of [[0,.4],[.27,.28],[.42,0],[.58,0],[.73,.28],[1,.4]])shade.addColorStop(stop,`rgba(18,12,10,${alpha})`);
    ctx.fillStyle=shade;ctx.fillRect(0,0,1024,1024);
    const map=new THREE.CanvasTexture(artwork);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());map.userData.coverUrl=tape.cover;textures.push(map);
    const face=source.getObjectByName('Printed_floral_face'),geometry=face.geometry.clone();ownedGeometry.push(geometry);
    const positions=geometry.attributes.position,uv=new Float32Array(positions.count*2),diameter=.117*normalizer;
    for(let i=0;i<positions.count;i++){
      const point=pack.worldToLocal(face.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i)));
      uv[i*2]=point.x/diameter+.5;uv[i*2+1]=.5-point.z/diameter;
    }
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));face.geometry=geometry;face.material.map=map;face.material.needsUpdate=true;
  }
  const regions=[],tracks=tape.tracks||[];
  let printedDisc,coverPrint;
  if(tracks.length){
    const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');
    // White ink sits directly over the photo. A narrow dark stroke/shadow
    // separates the handwriting from bright skin, paper and glass highlights.
    if(!coverMap){ctx.fillStyle='#343a32';ctx.beginPath();ctx.arc(512,512,494,0,Math.PI*2);ctx.arc(512,512,186,0,Math.PI*2,true);ctx.fill();}
    ctx.lineJoin='round';ctx.strokeStyle='rgba(18,12,10,.9)';ctx.lineWidth=2.6;ctx.shadowColor='rgba(10,8,6,.85)';ctx.shadowBlur=3;ctx.shadowOffsetY=1;
    function ink(text,x,y,width){ctx.strokeText(text,x,y,width);ctx.fillText(text,x,y,width);}
    ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='39px "Selectric Mono",monospace';ink(title,512,190,660);
    const total=Math.floor(tracks.reduce((sum,t)=>sum+t.durationMs,0)/1000);
    ctx.font='20px "Selectric Mono",monospace';ink(`${tracks.length} TRACKS / ${Math.floor(total/60)}:${String(total%60).padStart(2,'0')} / SPOTIFY`,512,230,650);
    function lines(text,x,y,width,step){
      const words=text.split(/\s+/);let size=40,wrapped=[];
      for(;size>=24;size--){
        ctx.font=`${size}px "Borel",cursive`;wrapped=[];let line='';
        for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){wrapped.push(line);line=word;}else line=next;}
        wrapped.push(line);
        if(wrapped.length<=3&&(wrapped.length-1)*size*1.6<=step-100)break;
      }
      const lineHeight=size*1.6;
      wrapped.forEach((line,index)=>ink(line,x,y+index*lineHeight,width));
      return {end:y+(wrapped.length-1)*lineHeight,size,lines:wrapped};
    }
    const rows=Math.ceil(tracks.length/2),step=Math.min(200,600/rows);
    tracks.forEach((track,index)=>{
      const col=index<rows?0:1,row=index%rows,x=col?704:128,y=280+row*step,w=192;
      ctx.textAlign='left';ctx.fillStyle='#eee9df';ctx.font='19px "Selectric Mono",monospace';ink(String(index+1).padStart(2,'0'),x,y,w);
      ctx.fillStyle='#fff';const titleLayout=lines(track.title,x,y+45,w,step);
      ctx.fillStyle='#eee9df';ctx.font='18px "Selectric Mono",monospace';ink(track.artist,x,titleLayout.end+26,w);
      regions.push({x:x-8,y:y-20,w:w+16,h:step,track,titleLayout});
    });
    ctx.textAlign='center';ctx.fillStyle='#eee9df';ctx.font='19px "Selectric Mono",monospace';ink('SELECT A TRACK · PRESS PLAY',512,866,590);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(map);
    const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});materials.set(material,material);
    const diameter=.117*normalizer,geometry=new THREE.PlaneGeometry(diameter,diameter);ownedGeometry.push(geometry);
    printedDisc=new THREE.Mesh(geometry,material);printedDisc.name='Printed_Tracklist';printedDisc.userData.lettering={font:'Borel',color:'#ffffff',backing:coverMap?'album photo':'dark disc'};printedDisc.rotation.x=-Math.PI/2;printedDisc.position.y=.00232*normalizer;pack.add(printedDisc);
  }
  if(coverMap&&tape.showCoverPhoto!==false){
    const map=coverMap;
    const material=new THREE.MeshBasicMaterial({map,alphaTest:.35,side:THREE.DoubleSide,toneMapped:false});materials.set(material,material);
    const height=.075*normalizer,width=height*map.image.width/map.image.height,geometry=new THREE.PlaneGeometry(width,height);ownedGeometry.push(geometry);
    coverPrint=new THREE.Mesh(geometry,material);coverPrint.name='Torn_Photo_Cover';coverPrint.rotation.x=-Math.PI/2;coverPrint.position.set(0,.00665*normalizer,.015*normalizer);pack.add(coverPrint);
    pack.updateMatrixWorld(true);hinge.attach(coverPrint);
  }
  pack.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(pack),spineCenter=pack.worldToLocal(tapeMeshes.spine.getWorldPosition(new THREE.Vector3()));
  const footprint={spineCenter,spineLeft:new THREE.Vector3(bounds.min.x,spineCenter.y,spineCenter.z),spineRight:new THREE.Vector3(bounds.max.x,spineCenter.y,spineCenter.z),foot:new THREE.Vector3(0,0,bounds.max.z),width:bounds.max.x-bounds.min.x};
  function trackPoint(region,center=false){
    const width=printedDisc.geometry.parameters.width;
    return printedDisc.localToWorld(new THREE.Vector3(((region.x+(center?region.w/2:70))/1024-.5)*width,(.5-(region.y+(center?47:50))/1024)*width,0));
  }
  return {pack,source,hinge,clip,mixer,tapeMeshes,bodyMeshes,normalizer,footprint,regions,printedDisc,coverPrint,tape,trackPoint,setWriting,setOpenProgress,
    get openProgress(){return openProgress;},setStored(stored){bodyMeshes.forEach(mesh=>mesh.visible=!stored);},
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(source);ownedGeometry.forEach(g=>g.dispose());new Set(materials.values()).forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  };
}
