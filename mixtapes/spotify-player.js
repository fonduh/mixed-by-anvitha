// Spotify's documented Embed API; browser/account restrictions may still require
// a click on the native player. Never infer successful audio from a play request.
let apiPromise;
function spotifyAPI(){
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://open.spotify.com/embed/iframe-api/v1';script.async=true;
    const timer=setTimeout(()=>fail(),12000);
    function fail(){clearTimeout(timer);script.remove();apiPromise=null;reject(new Error('Spotify controller unavailable'));}
    window.onSpotifyIframeApiReady=api=>{clearTimeout(timer);resolve(api);};
    script.onerror=fail;document.head.append(script);
  });
  return apiPromise;
}

export function createSpotifyPlayer(panel,canPlay){
  let session=null;
  const current=s=>session===s&&!s.cancelled;
  const allowed=s=>current(s)&&canPlay()&&!document.hidden;
  function destroy(controller){try{controller?.pause();}catch{}try{controller?.destroy();}catch{}}
  function stop(){
    if(session){session.cancelled=true;clearTimeout(session.readyTimer);clearTimeout(session.playTimer);destroy(session.controller);}
    session=null;panel.hidden=true;panel.replaceChildren();delete panel.dataset.playback;
  }
  function hint(s,message){
    if(!current(s))return;
    s.status.textContent=message;s.status.className='mixtape-player-status';
  }
  function styleFrame(s){
    const frame=s.host.querySelector('iframe');if(!frame)return;
    frame.className='mixtape-embed';frame.title=`Spotify: ${s.title}`;
    frame.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;
  }
  function fallback(s){
    if(!current(s)||s.fallback)return;
    clearTimeout(s.readyTimer);s.fallback=true;s.pending=false;destroy(s.controller);s.controller=null;
    const frame=document.createElement('iframe');
    const [,kind,id]=s.uri.split(':');frame.src=`https://open.spotify.com/embed/${kind}/${id}?utm_source=oembed`;
    s.host.replaceChildren(frame);styleFrame(s);panel.dataset.playback='manual';
    hint(s,'Press Play in Spotify below to start listening.');
  }
  function requestPlay(s){
    if(!s.pending||!s.ready||!allowed(s))return;
    s.pending=false;panel.dataset.playback='starting';
    try{s.controller.play();}catch{hint(s,'Press Play in Spotify below to start listening.');return;}
    clearTimeout(s.playTimer);
    s.playTimer=setTimeout(()=>{
      if(allowed(s)&&panel.dataset.playback==='starting')hint(s,'If playback hasn’t started, press Play in Spotify below.');
    },4000);
  }
  function prepare(uri,title){
    if(session?.uri===uri)return session;
    stop();
    const top=document.createElement('div');top.className='mixtape-player-top';
    const label=document.createElement('span');label.textContent=title;
    const close=document.createElement('button');close.type='button';close.textContent='Close player ×';close.addEventListener('click',stop);top.append(label,close);
    const status=document.createElement('p');status.className='sr-only';status.setAttribute('role','status');status.textContent='Loading Spotify…';
    const host=document.createElement('div'),mount=document.createElement('div');host.append(mount);panel.append(top,status,host);
    const s={uri,title,host,status,ready:false,pending:false,cancelled:false,controller:null,fallback:false};session=s;panel.dataset.playback='loading';
    void spotifyAPI().then(api=>{
      if(!current(s))return;
      s.readyTimer=setTimeout(()=>fallback(s),12000);
      api.createController(mount,{uri,width:'100%',height:152},controller=>{
        if(!current(s)||s.fallback){destroy(controller);return;}
        s.controller=controller;styleFrame(s);
        controller.addListener('ready',()=>{
          if(!current(s)||s.fallback)return;
          clearTimeout(s.readyTimer);s.ready=true;panel.dataset.playback='ready';requestPlay(s);
        });
        const started=()=>{
          if(!current(s))return;
          if(!canPlay()){stop();return;}
          clearTimeout(s.playTimer);panel.dataset.playback='playing';status.className='sr-only';status.textContent='Playing in Spotify.';
        };
        controller.addListener('playback_started',started);
        controller.addListener('playback_update',event=>{
          if(!current(s))return;
          if(!event.data.isPaused&&!event.data.isBuffering)started();
        });
      });
    }).catch(()=>fallback(s));
    return s;
  }
  function play(uri,title){
    if(!canPlay())return;
    const s=prepare(uri,title);panel.hidden=false;s.pending=true;requestPlay(s);
  }
  // A late ready callback must not start sound after the user switches away.
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session)session.pending=false;});
  return {prepare,play,stop};
}
