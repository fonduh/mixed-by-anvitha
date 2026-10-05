const grid=document.querySelector('#mixtape-grid');
const pager=document.querySelector('#mixtape-pagination');
const previous=document.querySelector('#mixtape-prev'),next=document.querySelector('#mixtape-next');
const status=document.querySelector('#collection-status');
let entries=[],page=0,disposers=[],generation=0,engaged=null;
const capacity=()=>innerWidth<620?1:innerWidth<1000?2:3;
let pageSize=capacity();
const glyphs={back:'M15 5 8 12l7 7',next:'m9 5 7 7-7 7',reset:'M4 9a8 8 0 1 1 0 6M4 4v5h5',play:'m8 5 11 7-11 7Z',close:'m6 6 12 12M18 6 6 18'};
function iconButton(name,icon){const button=document.createElement('button');button.type='button';button.className='icon-button';button.setAttribute('aria-label',name);button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphs[icon]}"/></svg>`;return button;}
function entry(row){
 const url=new URL(row.url);if(url.protocol!=='https:'||url.hostname!=='open.spotify.com'||!/^\/playlist\/[A-Za-z0-9]{22}\/?$/.test(url.pathname))throw Error('Invalid playlist link');
 const cover=typeof row.cover==='string'&&/^assets\/mixtapes\/[\w.-]+\.(png|webp|jpg)$/.test(row.cover)?row.cover:null;
 return {title:String(row.displayTitle||row.title||'Mixtape'),label:String(row.dateLabel||''),url:url.href,playlistId:url.pathname.split('/')[2],cover,tracks:[],printLabels:false};
}
function updatePager(){pager.hidden=Boolean(engaged)||entries.length<=pageSize;previous.disabled=page===0;next.disabled=(page+1)*pageSize>=entries.length;}
async function showPage(){
 const version=++generation;engaged=null;grid.classList.remove('has-selection');disposers.forEach(dispose=>dispose());disposers=[];grid.replaceChildren();
 const list=entries.slice(page*pageSize,page*pageSize+pageSize);grid.style.setProperty('--case-count',list.length);updatePager();
 await Promise.all(list.map(async(tape)=>{
  const card=document.createElement('article');card.className='mixtape-card';card.setAttribute('aria-label',tape.title);card.dataset.open='false';
  const canvas=document.createElement('canvas');canvas.className='mixtape-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${tape.title}. Click or press Enter to open. Scroll or pinch to zoom. Drag to turn. Click the exposed disc to listen. Escape resets zoom.`);
  const toolbar=document.createElement('div');toolbar.className='case-tools';
  const back=iconButton('Open case','back');back.disabled=true;back.hidden=true;
  const reset=iconButton('Reset view','reset');reset.hidden=true;
  const play=iconButton(`Play ${tape.title}`,'play');play.hidden=true;play.disabled=true;
  toolbar.append(back,reset,play);
  const panel=document.createElement('div');panel.className='mixtape-player-overlay';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label',`Spotify player for ${tape.title}`);
  let isOpen=false,lastTrigger=null;
  function closePlayer(){panel.hidden=true;panel.replaceChildren();lastTrigger?.focus({preventScroll:true});}
  function select(){
   if(!isOpen)return;
   lastTrigger=document.activeElement;panel.replaceChildren();panel.hidden=false;
   const close=iconButton('Close Spotify player','close');close.classList.add('close-player');close.addEventListener('click',closePlayer);
   const iframe=document.createElement('iframe');iframe.src=`https://open.spotify.com/embed/playlist/${tape.playlistId}?utm_source=oembed`;iframe.title=`Spotify: ${tape.title}`;iframe.className='mixtape-embed';iframe.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';iframe.height='352';iframe.width='100%';
   panel.append(close,iframe);close.focus({preventScroll:true});
  }
  function setOpen(open){isOpen=open;card.dataset.open=String(open);play.disabled=!open;play.hidden=!open;if(!open&&!panel.hidden)closePlayer();}
  function setEngaged(active){
   engaged=active?card:null;card.classList.toggle('is-selected',active);grid.classList.toggle('has-selection',active);back.hidden=!active;
   grid.querySelectorAll('.mixtape-card').forEach(other=>{other.inert=active&&other!==card;});updatePager();
   if(!active&&capacity()!==pageSize)queueMicrotask(()=>{const start=page*pageSize;pageSize=capacity();page=Math.floor(start/pageSize);void showPage();});
  }
  play.addEventListener('click',select);reset.addEventListener('click',()=>canvas.caseViewer?.resetZoom());
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closePlayer();}});
  card.append(canvas,toolbar,panel);grid.append(card);
  try{
   const {mountCase}=await import('./viewer.js?v=collection-1');if(version!==generation)return;
   const dispose=await mountCase(canvas,back,tape,select,setOpen,({zoom})=>{reset.hidden=zoom===1;},setEngaged);
   if(version!==generation)dispose();else disposers.push(dispose);
  }catch(error){
   console.warn('CD model unavailable',error);canvas.hidden=true;
   const fallback=iconButton(`Open ${tape.title}`,'play');fallback.className='cover-fallback';
   if(tape.cover){const image=document.createElement('img');image.src=tape.cover;image.alt=tape.title;fallback.replaceChildren(image);}
   fallback.addEventListener('click',()=>{if(isOpen)select();else{setEngaged(true);setOpen(true);back.disabled=false;back.setAttribute('aria-label','Return to collection');}});
   back.addEventListener('click',()=>{setOpen(false);setEngaged(false);});card.prepend(fallback);
  }
 }));
 status.textContent=`${entries.length} ${entries.length===1?'mixtape':'mixtapes'} in the collection.`;
}
previous.addEventListener('click',()=>{if(page>0&&!engaged){page--;void showPage();}});
next.addEventListener('click',()=>{if((page+1)*pageSize<entries.length&&!engaged){page++;void showPage();}});
addEventListener('resize',()=>{const size=capacity();if(size!==pageSize&&!engaged){const start=page*pageSize;pageSize=size;page=Math.floor(start/pageSize);void showPage();}});
try{const response=await fetch('./mixtapes/mixtapes.json',{cache:'no-store'});if(!response.ok)throw Error('Unable to load collection');const data=await response.json();entries=data.mixtapes.map(entry);await showPage();}catch(error){status.className='collection-error';status.textContent='The collection could not load. Please refresh.';console.warn(error);}
