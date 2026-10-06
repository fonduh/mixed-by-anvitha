import {mountCollection} from './collection-scene.js?v=measured-1';
import {attachCaseControls} from './viewer.js?v=lift-1';
const canvas=document.querySelector('#collection-canvas');
const hitLayer=document.querySelector('#case-targets');
const controls=document.querySelector('#case-controls');
const lidButton=document.querySelector('#toggle-case');
const back=document.querySelector('#return-case');
const note=document.querySelector('#collection-note');
const heading=document.querySelector('#collection-title');
const panel=document.querySelector('#spotify-panel');
const trackList=document.querySelector('#track-list');
const play=document.querySelector('#play-mixtape');
const spotify=document.querySelector('#spotify-link');
const zoomRange=document.querySelector('#case-zoom');
let viewer,selected=null,selectedIndex=0,caseOpen=false,returning=false;
const dateFormat=new Intl.DateTimeFormat('en-US',{month:'short',day:'2-digit',year:'numeric',timeZone:'UTC'});
function entry(row){
  let label=String(row.dateLabel||'UNDATED').slice(0,40);
  if(row.date!=null){
    if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))throw Error('Use YYYY-MM-DD for a full mixtape date.');
    const date=new Date(row.date+'T12:00:00Z');
    if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==row.date)throw Error('A mixtape date is invalid.');
    label=dateFormat.format(date);
  }
  const url=new URL(row.url);
  if(url.protocol!=='https:'||url.hostname!=='open.spotify.com'||!/^\/playlist\/[A-Za-z0-9]+\/?$/.test(url.pathname))throw Error('Use an https://open.spotify.com/playlist/… link for each mixtape.');
  const tracks=(Array.isArray(row.tracks)?row.tracks:[]).filter(t=>/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri)&&typeof t.title==='string').map(t=>({title:t.title,artist:String(t.artist||''),uri:t.uri,durationMs:Math.max(0,Number(t.durationMs)||0)}));
  const cover=typeof row.cover==='string'&&/^assets\/mixtapes\/[\w.-]+\.(png|webp|jpg)$/.test(row.cover)?row.cover:null;
  return {title:String(row.displayTitle||row.title||'Weekly mixtape').slice(0,160),date:row.date||'',label,url:url.href,playlistId:url.pathname.split('/')[2],embed:row.embed===true,tracks,cover};
}

function stopPlayer(){panel.hidden=true;panel.replaceChildren();}
function revealCase(){canvas.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
function selectTrack(track){
  if(!caseOpen||returning||!selected?.playlistId)return;
  if(track)canvas.caseViewer.focusTrack(track.uri);
  revealCase();
  panel.replaceChildren();panel.hidden=false;
  const top=document.createElement('div');top.className='mixtape-player-top';
  const title=document.createElement('span');title.textContent=track?.title||selected.title;
  const close=document.createElement('button');close.type='button';close.textContent='Close player ×';close.addEventListener('click',stopPlayer);top.append(title,close);
  const frame=document.createElement('iframe');frame.className='mixtape-embed';frame.title=`Spotify: ${track?.title||selected.title}`;
  frame.src=`https://open.spotify.com/embed/${track?'track/'+track.uri.split(':')[2]:'playlist/'+selected.playlistId}?utm_source=oembed`;
  frame.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;
  panel.append(top,frame);
}
function syncOpen(open){
  caseOpen=open;controls.dataset.open=String(open);canvas.dataset.open=String(open);
  play.disabled=!open;trackList.querySelectorAll('button').forEach(b=>b.disabled=!open);
  spotify.setAttribute('aria-disabled',String(!open));spotify.tabIndex=open?0:-1;
  if(!open)stopPlayer();
}
function syncView({zoom,track}){
  zoomRange.value=String(zoom);document.querySelector('#zoom-status').textContent=`${Number(zoom.toFixed(1))}×`;
  document.querySelector('#zoom-out').disabled=zoom<=1;document.querySelector('#zoom-in').disabled=zoom>=4;
  document.querySelector('#spine-view').setAttribute('aria-pressed',String(canvas.dataset.view==='spine'));
  document.querySelector('#reset-view').disabled=zoom===1&&canvas.dataset.view!=='spine';
  trackList.querySelectorAll('.mixtape-song-zoom').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.uri===track?.uri)));
}
function buildSongs(tape){
  trackList.replaceChildren();document.querySelector('#browse-songs').open=false;
  document.querySelector('#browse-songs').hidden=!tape.tracks?.length;
  for(const track of tape.tracks||[]){
    const li=document.createElement('li'),row=document.createElement('div');row.className='mixtape-song-row';
    const choose=document.createElement('button');choose.type='button';choose.className='mixtape-song';choose.textContent=`${track.title} — ${track.artist}`;choose.addEventListener('click',()=>selectTrack(track));
    const zoom=document.createElement('button');zoom.type='button';zoom.className='mixtape-song-zoom';zoom.textContent='Zoom';zoom.dataset.uri=track.uri;zoom.setAttribute('aria-label',`Zoom in on ${track.title}`);
    zoom.addEventListener('click',()=>{if(caseOpen){stopPlayer();canvas.caseViewer.focusTrack(track.uri);canvas.focus({preventScroll:true});revealCase();}});
    row.append(choose,zoom);li.append(row);trackList.append(li);
  }
}
function onPick(tape,index){
  selected=tape;selectedIndex=index;returning=false;caseOpen=false;
  document.body.classList.add('case-is-out');hitLayer.hidden=true;back.hidden=false;
  heading.textContent=tape.blank?'A blank case':tape.title;
  note.textContent='Taking it out of the box…';controls.hidden=false;controls.inert=true;controls.classList.add('is-moving');
  play.hidden=!tape.embed;spotify.hidden=!tape.url;if(tape.url)spotify.href=tape.url;
  document.querySelector('#case-date').textContent=tape.blank?'Ready for a friend’s recommendation.':`${tape.tracks.length} TRACKS · ${tape.label}`;
  lidButton.textContent='Open case';lidButton.setAttribute('aria-expanded','false');lidButton.disabled=true;
  buildSongs(tape);syncOpen(false);back.focus({preventScroll:true});
}
function onReady(model,stage){
  returning=false;controls.inert=false;controls.classList.remove('is-moving');
  note.textContent=selected.blank?'Open, turn, or zoom the case.':'Open the case to pick a song. Scroll to zoom; drag to turn.';
  return attachCaseControls(canvas,lidButton,model,stage,selectTrack,syncOpen,syncView);
}
function onReturn(done){
  returning=true;syncOpen(false);controls.inert=true;controls.classList.add('is-moving');
  if(!done){note.textContent='Putting it back…';revealCase();return;}
  selected=null;returning=false;controls.hidden=true;back.hidden=true;hitLayer.hidden=false;
  document.body.classList.remove('case-is-out');heading.textContent='The mixtape box';note.textContent='Scroll to browse. Click a spine to pick it up.';
  hitLayer.children[selectedIndex]?.focus({preventScroll:true});
}
back.addEventListener('click',()=>viewer?.putBack());
play.addEventListener('click',()=>selectTrack(null));spotify.addEventListener('click',e=>{if(!caseOpen)e.preventDefault();});
zoomRange.addEventListener('input',()=>canvas.caseViewer?.setZoom(zoomRange.value));
document.querySelector('#zoom-out').addEventListener('click',()=>canvas.caseViewer?.setZoom(Number(zoomRange.value)-.25));
document.querySelector('#zoom-in').addEventListener('click',()=>canvas.caseViewer?.setZoom(Number(zoomRange.value)+.25));
document.querySelector('#reset-view').addEventListener('click',()=>canvas.caseViewer?.resetZoom());
document.querySelector('#spine-view').addEventListener('click',()=>canvas.caseViewer?.focusSpine());
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&selected){e.preventDefault();if(!panel.hidden)stopPlayer();else viewer?.putBack();}
});
function layoutTargets(points){
  for(const point of points){
    const button=hitLayer.children[point.index];if(!button)continue;
    button.style.left=`${point.x-point.width/2}px`;button.style.top=`${point.y-point.height/2}px`;
    button.style.width=`${point.width}px`;button.style.height=`${point.height}px`;
    button.style.transform=`rotate(${point.angle}deg)`;
    button.style.zIndex=point.focused?'2':'1';
    button.tabIndex=point.focused?0:-1;
    button.setAttribute('aria-current',String(point.focused));
  }
}
async function load(){
  try{
    const [response,reference]=await Promise.all([fetch('./mixtapes/mixtapes.json',{cache:'no-store'}),fetch('./mixtapes/reference-layout.json?v=measured-1')]);
    if(!response.ok||!reference.ok)throw Error('Could not load the mixtapes and measured layout.');
    const [data,layout]=await Promise.all([response.json(),reference.json()]);if(!Array.isArray(data.mixtapes))throw Error('Invalid mixtape list.');
    const entries=data.mixtapes.map(entry).sort((a,b)=>b.date.localeCompare(a.date));
    // Preserve the 85 traced slots. Future additions beyond the photograph
    // extend its last rows explicitly; they are never presented as measurements.
    const originalBottom=layout.boundsPx[3];
    while(layout.spines.length<entries.length){
      const column=layout.columns.L<=layout.columns.R?'L':'R';
      const tail=layout.spines.filter(spine=>spine.column===column).at(-1);
      const step=layout.medianCenterSpacingPx;
      const next={...tail,id:`${column}${++layout.columns[column]}`,order:layout.columns[column],
        centerPx:[tail.centerPx[0],tail.centerPx[1]+step],
        endpointsPx:tail.endpointsPx.map(([x,y])=>[x,y+step]),
        leanDeg:0,leanSource:'Unmeasured extension beyond the reference photograph.',
        angleMethod:'Extrapolated from the final measured spine in this column.',measurementStatus:'extrapolated',
        angleUncertaintyDeg:null,positionUncertaintyPx:null,nextCenterSpacingPx:null,nextSpacingInSpineWidths:null};
      layout.spines.push(next);layout.boundsPx[3]=Math.max(layout.boundsPx[3],next.centerPx[1]+step);
    }
    if(layout.boundsPx[3]>originalBottom)layout.boxOutlinePx=layout.boxOutlinePx.map(([x,y])=>[x,y>originalBottom-40?y+layout.boundsPx[3]-originalBottom:y]);
    const count=layout.spines.length,positions=[5,...Array.from({length:count},(_,i)=>i).filter(i=>i!==5)];
    const filled=new Map(entries.map((tape,i)=>[positions[i],tape]));
    const slots=Array.from({length:count},(_,i)=>filled.get(i)||{title:'',label:'',tracks:[],blank:true});
    slots.forEach((tape,i)=>{
      const button=document.createElement('button');button.type='button';button.className=`case-hit ${tape.blank?'is-empty':'is-filled'}`;
      button.disabled=true;button.setAttribute('aria-label',tape.blank?`Pick up empty case ${i+1}`:`Pick up ${tape.title}, ${tape.label}`);
      button.addEventListener('click',()=>viewer?.pick(i));hitLayer.append(button);
    });
    document.querySelector('#collection-count').textContent=`${String(entries.length).padStart(2,'0')} ${entries.length===1?'MIX':'MIXES'} / ${count-entries.length} EMPTY CASES`;
    viewer=await mountCollection(canvas,slots,{layout,onPick,onReady,onReturn,onProgress:()=>{},onLayout:layoutTargets});
    hitLayer.querySelectorAll('button').forEach(button=>button.disabled=false);note.textContent='Scroll to browse. Click a spine to pick it up.';
  }catch(error){
    console.error(error);note.textContent='The 3D box could not load. Refresh to try again.';
    document.querySelector('#load-fallback').hidden=false;
  }
}
void load();
