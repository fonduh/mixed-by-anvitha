const section=document.querySelector('#mixtapes');
const grid=document.querySelector('#mixtape-grid');
const note=document.querySelector('#mixtape-note');
const pager=document.querySelector('#mixtape-pagination');
let entries=[],page=0,disposers=[],generation=0;
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
async function showPage(){
  const version=++generation;disposers.forEach(dispose=>dispose());disposers=[];grid.replaceChildren();
  const list=entries.length?entries.slice(page*3,page*3+3):[{title:'Weekly mixtape',label:'DATE / ____',preview:true}];
  grid.classList.toggle('is-single',list.length===1);
  const jobs=list.map(async tape=>{
    const card=document.createElement('article');card.className='mixtape-card';
    const stage=document.createElement('div');stage.className='mixtape-stage';
    const canvas=document.createElement('canvas');canvas.className='mixtape-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${tape.title} CD in its jewel case. Scroll to zoom toward the pointer. Drag or use arrow keys to rotate. Enter opens the case. Plus and minus zoom; Escape resets the view.`);
    const title=document.createElement('h4');title.textContent=tape.title;
    const date=document.createElement('p');date.className='mixtape-date';date.textContent=tape.preview?'MODEL PREVIEW · UNDATED':tape.tracks?.length?`${tape.tracks.length} TRACKS · ${tape.label}`:tape.label;
    const actions=document.createElement('div');actions.className='mixtape-actions';
    const button=document.createElement('button');button.type='button';button.textContent='Open case';button.disabled=true;button.setAttribute('aria-expanded','false');actions.append(button);
    if(tape.url){const link=document.createElement('a');link.href=tape.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Listen on Spotify ↗';actions.append(link);}
    const fallback=document.createElement('p');fallback.className='mixtape-fallback';fallback.hidden=true;fallback.textContent='3D preview unavailable. Your mixtape link is still available below.';
    const zoomControls=document.createElement('div');zoomControls.className='mixtape-zoom-controls';zoomControls.setAttribute('role','group');zoomControls.setAttribute('aria-label','Case zoom');
    const zoomLess=document.createElement('button');zoomLess.type='button';zoomLess.textContent='−';zoomLess.setAttribute('aria-label','Zoom out');
    const zoomRange=document.createElement('input');zoomRange.type='range';zoomRange.min='1';zoomRange.max='4';zoomRange.step='.1';zoomRange.value='1';zoomRange.setAttribute('aria-label','Case magnification');
    const zoomMore=document.createElement('button');zoomMore.type='button';zoomMore.textContent='+';zoomMore.setAttribute('aria-label','Zoom in');
    const zoomReset=document.createElement('button');zoomReset.type='button';zoomReset.textContent='Reset view';
    const zoomStatus=document.createElement('span');zoomStatus.className='mixtape-zoom-status';zoomStatus.setAttribute('aria-live','polite');zoomStatus.textContent='1×';
    const spineView=document.createElement('button');spineView.type='button';spineView.textContent='View spine';spineView.addEventListener('click',()=>canvas.caseViewer?.focusSpine());
    zoomControls.append(zoomLess,zoomRange,zoomMore,zoomStatus,zoomReset,spineView);zoomControls.querySelectorAll('button,input').forEach(control=>control.disabled=true);
    zoomRange.addEventListener('input',()=>canvas.caseViewer?.setZoom(zoomRange.value));
    zoomLess.addEventListener('click',()=>canvas.caseViewer?.setZoom(Number(zoomRange.value)-.25));
    zoomMore.addEventListener('click',()=>canvas.caseViewer?.setZoom(Number(zoomRange.value)+.25));
    zoomReset.addEventListener('click',()=>canvas.caseViewer?.resetZoom());
    function syncView({zoom,track}){zoomRange.value=String(zoom);zoomRange.disabled=false;spineView.disabled=false;spineView.setAttribute('aria-pressed',String(canvas.dataset.view==='spine'));zoomLess.disabled=zoom<=1;zoomMore.disabled=zoom>=4;zoomReset.disabled=zoom===1&&canvas.dataset.view!=='spine';zoomStatus.textContent=`${Number(zoom.toFixed(1))}×`;zoomRange.setAttribute('aria-valuetext',`${Number(zoom.toFixed(1))} times magnification`);stage.classList.toggle('is-song-focused',Boolean(track));card.querySelectorAll('.mixtape-song-zoom').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.uri===track?.uri)));}
    stage.append(canvas);card.append(stage,fallback,zoomControls,date,title,actions);grid.append(card);
    let lastTrigger,caseOpen=false;
    const panel=document.createElement('div');panel.className='mixtape-player-overlay';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Spotify player');stage.append(panel);
    function closePlayer(){panel.hidden=true;panel.replaceChildren();lastTrigger?.focus({preventScroll:true});}
    function selectTrack(track){
      if(!caseOpen)return;
      if(track)canvas.caseViewer?.focusTrack(track.uri);
      lastTrigger=document.activeElement;
      panel.replaceChildren();panel.hidden=false;
      const top=document.createElement('div');top.className='mixtape-player-top';
      const heading=document.createElement('span');heading.textContent=track?.title||tape.title;
      const close=document.createElement('button');close.type='button';close.textContent='Close player ×';close.addEventListener('click',closePlayer);top.append(heading,close);
      const player=document.createElement('iframe');player.className='mixtape-embed';
      const path=track?'track/'+track.uri.split(':')[2]:'playlist/'+tape.playlistId;
      player.src=`https://open.spotify.com/embed/${path}?utm_source=oembed`;
      player.title=`Spotify: ${track?.title||tape.title}`;player.width='100%';player.height='152';
      player.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';player.allowFullscreen=true;
      panel.append(top,player);close.focus({preventScroll:true});
    }
    panel.addEventListener('keydown',event=>{if(event.key==='Escape')closePlayer();});
    if(tape.embed){
      const play=document.createElement('button');play.type='button';play.textContent='Play mixtape';play.disabled=true;play.addEventListener('click',()=>selectTrack(null));actions.prepend(play);
    }
    if(tape.tracks?.length){
      const details=document.createElement('details');details.className='mixtape-track-access';
      const summary=document.createElement('summary');summary.textContent='Browse songs';details.append(summary);
      const list=document.createElement('ol');tape.tracks.forEach(track=>{const item=document.createElement('li');const row=document.createElement('div');row.className='mixtape-song-row';const choose=document.createElement('button');choose.type='button';choose.className='mixtape-song';const seconds=Math.floor(track.durationMs/1000);choose.textContent=`${track.title} — ${track.artist} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;choose.addEventListener('click',()=>selectTrack(track));const focus=document.createElement('button');focus.type='button';focus.className='mixtape-song-zoom';focus.textContent='Zoom';focus.dataset.uri=track.uri;focus.setAttribute('aria-label',`Zoom in on ${track.title}`);focus.setAttribute('aria-pressed','false');focus.addEventListener('click',()=>{if(caseOpen){if(!panel.hidden)closePlayer();canvas.caseViewer?.focusTrack(track.uri);canvas.focus({preventScroll:true});canvas.scrollIntoView({block:'center',behavior:'instant'});}});row.append(choose,focus);item.append(row);list.append(item);});details.append(list);card.append(details);
      canvas.setAttribute('aria-describedby','mixtape-note');
    }
    function setCaseOpen(open){
      caseOpen=open;card.dataset.open=String(open);
      card.querySelectorAll('.mixtape-track-access button,.mixtape-actions button').forEach(control=>{if(control!==button)control.disabled=!open;});
      const link=actions.querySelector('a');if(link){link.setAttribute('aria-disabled',String(!open));link.tabIndex=open?0:-1;}
      if(!open&&!panel.hidden)closePlayer();
    }
    actions.querySelector('a')?.addEventListener('click',event=>{if(!caseOpen)event.preventDefault();});
    setCaseOpen(false);
    try{const {mountCase}=await import('./viewer.js?v=spine-1');if(version!==generation)return;const dispose=await mountCase(canvas,button,tape,selectTrack,setCaseOpen,syncView);if(version!==generation)dispose();else disposers.push(dispose);}
    catch(error){console.warn('Mixtape model unavailable',error);card.classList.add('is-fallback');zoomControls.hidden=true;card.querySelectorAll('.mixtape-song-zoom').forEach(control=>control.hidden=true);canvas.hidden=true;button.disabled=false;fallback.hidden=false;fallback.textContent='3D preview unavailable. Open the case below to browse the songs.';button.addEventListener('click',()=>{setCaseOpen(!caseOpen);button.textContent=caseOpen?'Close case':'Open case';button.setAttribute('aria-expanded',String(caseOpen));if(caseOpen)card.querySelector('details')?.setAttribute('open','');});if(tape.preview)fallback.textContent='3D preview unavailable. Refresh to try again.';}
  });
  pager.hidden=entries.length<=3;
  document.querySelector('#mixtape-prev').disabled=page===0;
  document.querySelector('#mixtape-next').disabled=(page+1)*3>=entries.length;
  document.querySelector('#mixtape-page').textContent=`${page+1} / ${Math.max(1,Math.ceil(entries.length/3))}`;
  await Promise.all(jobs);
}
document.querySelector('#mixtape-prev').addEventListener('click',()=>{if(page>0){page--;void showPage();}});
document.querySelector('#mixtape-next').addEventListener('click',()=>{if((page+1)*3<entries.length){page++;void showPage();}});
const observer=new IntersectionObserver(async records=>{
  if(!records.some(r=>r.isIntersecting))return;observer.disconnect();
  try{const response=await fetch('./mixtapes/mixtapes.json',{cache:'no-store'});if(!response.ok)throw Error('Could not load the mixtape list.');const data=await response.json();if(!Array.isArray(data.mixtapes))throw Error('Mixtape list is invalid.');entries=data.mixtapes.map(entry).sort((a,b)=>b.date.localeCompare(a.date));
    note.textContent=entries.length?'Open the case to pick a song. Scroll to zoom; drag to turn.':'The first case is a preview. Your playlists and dates will fill the collection.';
  }catch(error){note.textContent=error.message;}
  void showPage();
},{rootMargin:'200px'});observer.observe(section);
