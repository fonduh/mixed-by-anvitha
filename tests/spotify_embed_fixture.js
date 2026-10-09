// Deterministic stand-in for Spotify, not evidence of actual streamed audio.
window.__spotifyCalls=[];
window.onSpotifyIframeApiReady({createController(mount,options,callback){
  const config=window.__spotifyOptions||{},listeners={},frame=document.createElement('iframe');
  const [,kind,id]=options.uri.split(':');frame.src=`https://open.spotify.com/embed/${kind}/${id}`;mount.replaceWith(frame);
  let destroyed=false;
  const log=method=>{
    const canvas=document.querySelector('canvas');
    window.__spotifyCalls.push({method,uri:options.uri,progress:canvas?.collectionViewer?.active?.model.openProgress,open:canvas?.dataset.open,time:performance.now()});
  };
  const emit=(name,data={})=>listeners[name]?.({data});
  const controller={
    addListener(name,fn){listeners[name]=fn;},
    play(){log('play');if(!config.blocked)emit('playback_started',{playingURI:options.uri});},
    pause(){log('pause');},destroy(){destroyed=true;log('destroy');frame.remove();}
  };
  log('create');
  setTimeout(()=>{callback(controller);setTimeout(()=>{if(!destroyed)emit('ready');},config.readyDelay||30);},config.callbackDelay||0);
}});
