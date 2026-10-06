import * as THREE from 'three';
import { GLTFLoader } from '../album/vendor/GLTFLoader.js';
let modelPromise;
export const loadModel=()=>modelPromise??=new GLTFLoader().loadAsync(new URL('../assets/mixtapes/burned-cd-jewel-case.glb',import.meta.url).href);
export async function createCase(renderer,tape){
  const gltf=await loadModel();
  await document.fonts.load('20px "Selectric Mono"');
  const coverMap=tape.cover?await new THREE.TextureLoader().loadAsync(new URL('../'+tape.cover,import.meta.url).href).catch(error=>{console.warn('Mixtape cover unavailable',error);return null;}):null;
  const pack=gltf.scene.clone(true);
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
    ctx.fillText(disc?(tape.blank?'':'CD-R / WEEKLY MIX'):tape.title,512,65,920);
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
  // Separate front-facing spine strip and outer-edge labels, fixed to the base.
  const spineCanvas=document.createElement('canvas');spineCanvas.width=1536;spineCanvas.height=112;
  const spineContext=spineCanvas.getContext('2d');
  spineContext.fillStyle='#ece4cf';spineContext.fillRect(0,0,1536,112);
  spineContext.fillStyle='#344638';spineContext.textBaseline='middle';spineContext.font='54px "Selectric Mono",monospace';
  spineContext.fillText(tape.title,42,57,880);
  spineContext.textAlign='right';spineContext.font='40px "Selectric Mono",monospace';spineContext.fillText(tape.label,1494,57,480);
  const spineMap=new THREE.CanvasTexture(spineCanvas);spineMap.colorSpace=THREE.SRGBColorSpace;spineMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(spineMap);
  const spineMaterial=new THREE.MeshBasicMaterial({map:spineMap,toneMapped:false,side:THREE.FrontSide});materials.push(spineMaterial);
  const spineLabels=[];
  for(const [name,width,height,position,rotation] of [
    ['Spine_Top_Label',1.12,.078,[-.654,.089,0],[-Math.PI/2,0,Math.PI/2]],
    ['Spine_Left_Label',1.1,.064,[-.716,.052,0],[0,-Math.PI/2,0]],
    ['Spine_Right_Label',1.1,.064,[.716,.052,0],[0,Math.PI/2,0]],
  ]){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),spineMaterial);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.userData.label=`${tape.title} · ${tape.label}`;pack.add(mesh);spineLabels.push(mesh);}
  let coverPrint;
  if(coverMap){
    coverMap.colorSpace=THREE.SRGBColorSpace;coverMap.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(coverMap);
    const material=new THREE.MeshBasicMaterial({map:coverMap,alphaTest:.35,side:THREE.DoubleSide,toneMapped:false});materials.push(material);
    const height=.98,width=height*coverMap.image.width/coverMap.image.height;
    coverPrint=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);coverPrint.name='Torn_Photo_Cover';
    coverPrint.rotation.set(-Math.PI/2,0,-.025);coverPrint.position.set(.045,.124,-.075);pack.add(coverPrint);
    pack.updateMatrixWorld(true);hinge.attach(coverPrint);
  }
  return {pack,hinge,regions,printedDisc,coverPrint,tape,dispose(){
    printedDisc?.geometry.dispose();coverPrint?.geometry.dispose();spineLabels.forEach(mesh=>mesh.geometry.dispose());
    materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  }};
}
