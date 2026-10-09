"""Browser regression checks; start the static preview first. See MODEL_INTEGRATION.md."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:4177/')
parser.add_argument('--output',default='/tmp/floral-case-check')
parser.add_argument('--chrome',default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=args.chrome,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},has_touch=True)
 errors=[];requests=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:requests.append(request.url))
 page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
 # Validate iframe selection and gating independently of Spotify login, ads,
 # third-party network availability, and actual audio playback.
 page.route('https://open.spotify.com/embed/**',lambda route:route.fulfill(body='<html><body>Spotify embed fixture</body></html>',content_type='text/html'))
 page.route('https://open.spotify.com/embed/iframe-api/v1',lambda route:route.fulfill(body=Path(__file__).with_name('spotify_embed_fixture.js').read_text(),content_type='text/javascript'))
 page.goto(args.url)
 page.wait_for_function('document.querySelector("canvas").collectionViewer?.state==="box"',timeout=120000)
 def state(expression):return page.evaluate('()=>{const c=document.querySelector("canvas"),v=c.collectionViewer;'+expression+'}')
 def wait(expression):page.wait_for_function('()=>{const c=document.querySelector("canvas"),v=c.collectionViewer;return '+expression+';}',timeout=20000)
 def pick(index):
  state(f'v.pick({index});');wait('v.state==="held"')
 def put_back():
  page.get_by_role('button',name='Back to the collection').click();wait('v.state==="box"')
 def screenshot(name):page.screenshot(path=str(out/name))
 report=state('''const models=v.items.map(i=>i.model),first=models[0];return {
 count:v.items.length,ids:v.items.map(i=>i.measured.id),filled:v.items.filter(i=>!i.tape.blank).map(i=>({index:i.index,title:i.tape.title,url:i.tape.url,tracks:i.tape.tracks.length})),
 allNew:models.every(m=>m.source.getObjectByName('Album_Orientation')?.userData.rotation_degrees===90&&m.hinge.name==='Lid_Pivot'&&m.clip.name==='Open case'),
 geometryShared:models.every(m=>m.bodyMeshes[0].geometry===first.bodyMeshes[0].geometry),
 artworkShared:v.items.filter(i=>!i.tape.cover).every(i=>i.model.source.getObjectByName('Printed_floral_face').material.map===first.source.getObjectByName('Printed_floral_face').material.map),
 albumArtworkPersonalized:v.items.filter(i=>i.tape.cover).every(i=>i.model.source.getObjectByName('Printed_floral_face').material.map.userData.coverUrl===i.tape.cover),
 whiteHandwriting:v.items.filter(i=>i.tape.tracks.length).every(i=>i.model.printedDisc.userData.lettering.font==='Borel'&&i.model.printedDisc.userData.lettering.color==='#ffffff')&&document.fonts.check('40px "Borel"'),
 coverTextures:new Set(models.map(m=>m.tapeMeshes.cover.material.map.uuid)).size,spineTextures:new Set(models.map(m=>m.tapeMeshes.spine.material.map.uuid)).size,
 coverMaterials:new Set(models.map(m=>m.tapeMeshes.cover.material.uuid)).size,spineMaterials:new Set(models.map(m=>m.tapeMeshes.spine.material.uuid)).size,
 mixers:new Set(models.map(m=>m.mixer)).size,
 tapes:models.every(m=>m.tapeMeshes.cover.parent.name==='Cover_Anchor'&&m.tapeMeshes.cover.parent.parent===m.hinge&&m.tapeMeshes.spine.parent.parent.name==='Case_Base'&&m.tapeMeshes.cover.material.map.flipY===false&&m.tapeMeshes.spine.material.map.flipY===false),
 emptyWriting:v.items.filter(i=>i.tape.blank).every(i=>Object.values(i.model.tapeMeshes).every(m=>m.userData.writing==='')),
 thinCover:first.bodyMeshes.filter(m=>m.material.name==='Clear thin cover').map(m=>({opacity:m.material.opacity,transmission:m.material.transmission,depthWrite:m.material.depthWrite})),
 physicalGlass:first.bodyMeshes.some(m=>m.material.name==='Clear molded acrylic'&&m.material.transmission===1&&m.material.ior>1),
 meshCounts:models.map(m=>{let n=0;m.source.traverse(o=>{if(o.isMesh)n++;});return n;})};''')
 assert report['count']==85 and report['filled']==[{'index':5,'title':'Mixed by Anvitha','url':'https://open.spotify.com/playlist/6VWaYZbC9La3vbG2qIywXq','tracks':6},{'index':6,'title':'Mixed by Vidya','url':'https://open.spotify.com/playlist/0XRiCc89XG90yQUJduIrte','tracks':7}],report
 assert all(report[k] for k in ['allNew','geometryShared','artworkShared','albumArtworkPersonalized','whiteHandwriting','tapes','emptyWriting','physicalGlass'])
 assert state('return v.items[0].model.pack.parent.children.every(o=>o.isGroup||o.isInstancedMesh);'), 'Cardboard floor or walls remain in the collection'
 assert state('return v.items.filter(i=>!i.tape.blank).every(i=>i.tape.showCoverPhoto===false&&!i.model.coverPrint&&!i.model.pack.getObjectByName("Torn_Photo_Cover"));')
 assert all(report[k]==85 for k in ['coverTextures','spineTextures','coverMaterials','spineMaterials','mixers'])
 assert all(n in [189,190] for n in report['meshCounts']) # Personal photo belongs to Anvitha's lid.
 assert all(m=={'opacity':.018,'transmission':0,'depthWrite':False} for m in report['thinCover'])
 assert len([u for u in requests if '.glb' in u])==1 and 'floral-cd-case.glb' in next(u for u in requests if '.glb' in u)
 report['layout']=page.evaluate('''async()=>{const T=await import('./prototypes/waves/vendor/three.module.js'),v=document.querySelector('canvas').collectionViewer,l=v.layout,[left,top,right,bottom]=l.boundsPx;
 return {ids:v.items.map(i=>i.measured.id),maxAnchorError:Math.max(...v.items.map(i=>i.model.footprint.spineCenter.clone().applyMatrix4(i.matrix).distanceTo(new T.Vector3((i.measured.centerPx[0]-(left+right)/2)*l.worldUnitsPerPixel,1.5,(i.measured.centerPx[1]-(top+bottom)/2)*l.worldUnitsPerPixel)))),maxWidthError:Math.max(...v.items.map(i=>Math.abs(i.model.footprint.width*i.uniformScale-i.measured.widthPx*l.worldUnitsPerPixel)))};}''')
 assert report['layout']['maxAnchorError']<1e-6 and report['layout']['maxWidthError']<1e-6
 screenshot('collection-desktop.png')
 # Alter one real slot and verify all neighboring state/materials are isolated.
 report['independence']=page.evaluate('''async()=>{const T=await import('./prototypes/waves/vendor/three.module.js'),v=document.querySelector('canvas').collectionViewer,a=v.items[0].model,b=v.items[1].model;
 a.pack.updateMatrixWorld(true);const cover=a.tapeMeshes.cover.getWorldPosition(new T.Vector3()),spine=a.tapeMeshes.spine.getWorldPosition(new T.Vector3()),bq=b.hinge.quaternion.clone();
 a.setWriting({cover:'Independent cover',spine:'Independent spine'});a.setOpenProgress(.65);a.pack.updateMatrixWorld(true);
 const result={otherStillClosed:b.openProgress===0&&b.hinge.quaternion.angleTo(bq)<1e-8,otherStillBlank:b.tapeMeshes.cover.userData.writing===''&&b.tapeMeshes.spine.userData.writing==='',coverMoves:cover.distanceTo(a.tapeMeshes.cover.getWorldPosition(new T.Vector3()))>.1,spineFixed:spine.distanceTo(a.tapeMeshes.spine.getWorldPosition(new T.Vector3()))<1e-8};
 a.setWriting();a.setOpenProgress(0);return result;}''')
 assert all(report['independence'].values())
 # Vidya has her own artwork, writing, playlist and individual track playback.
 pick(6)
 assert state('return !v.active.tape.draft&&v.active.tape.playlistId==="0XRiCc89XG90yQUJduIrte"&&v.active.tape.tracks.length===7;')
 assert state('return Object.values(v.active.model.tapeMeshes).every(m=>m.userData.writing==="Mixed by Vidya");')
 assert state('return v.active.model.source.getObjectByName("Printed_floral_face").material.map!==v.items[5].model.source.getObjectByName("Printed_floral_face").material.map;')
 wait('c.dataset.open==="true"')
 page.wait_for_function('window.__spotifyCalls.some(c=>c.method==="play"&&c.uri==="spotify:playlist:0XRiCc89XG90yQUJduIrte")')
 assert '/playlist/0XRiCc89XG90yQUJduIrte' in page.locator('iframe').get_attribute('src')
 assert page.locator('#spotify-link').get_attribute('href')=='https://open.spotify.com/playlist/0XRiCc89XG90yQUJduIrte'
 page.get_by_role('button',name='Close player ×',exact=True).click()
 screenshot('vidya-open-desktop.png')
 report['vidyaTrackLayout']=state('return v.active.model.regions.map(r=>({title:r.track.title,y:r.y,height:r.h,...r.titleLayout}));')
 page.get_by_text('Browse songs',exact=True).click()
 assert page.locator('.mixtape-song').count()==7
 page.get_by_role('button',name='Zoom in on Soak Up The Sun - Surf Mesa Remix',exact=True).click()
 screenshot('vidya-song-zoom.png')
 page.get_by_role('button',name='No Ordinary Love — Sade',exact=True).click();page.locator('iframe').wait_for()
 assert '/track/1oaaSrDJimABpOdCEbw2DJ' in page.locator('iframe').get_attribute('src')
 page.get_by_role('button',name='Close player ×',exact=True).click()
 page.get_by_text('Browse songs',exact=True).click()
 page.get_by_role('button',name='View spine',exact=True).click();screenshot('vidya-spine-label.png')
 assert state('return v.items[5].model.tapeMeshes.spine.userData.writing;')=='Mixed by Anvitha · OCTOBER 2026'
 put_back();assert page.locator('iframe').count()==0
 # Pointer lift remains available on both columns; click promotes that same GLB.
 for index in [7,55]:
  pt=page.locator('.case-hit').nth(index).bounding_box();page.mouse.move(pt['x']+pt['width']/2,pt['y']+pt['height']/2)
  wait(f'v.items[{index}].focus>.99')
  before=state(f'return v.items[{index}].model.pack.uuid;')
  page.mouse.click(pt['x']+pt['width']/2,pt['y']+pt['height']/2);wait('v.state==="held"')
  assert state('return v.active.model.pack.uuid;')==before
  assert state('return v.active.model.bodyMeshes.every(m=>m.visible);')
  page.get_by_role('button',name='Open case',exact=True).click();wait('c.dataset.open==="true"')
  assert state('return v.active.model.openProgress;')==1
  assert state('return v.items.filter(i=>i!==v.active).every(i=>i.model.openProgress===0);')
  screenshot(f'blank-{index}-open.png');put_back()
 # Closing can reverse the embedded animation part-way through its two seconds.
 pick(5);assert page.get_by_role('button',name='Play mixtape',exact=True).is_disabled()
 page.wait_for_timeout(400) # Filled cases now open automatically after pickup.
 progress=state('return v.active.model.openProgress;');assert 0<progress<1,progress
 assert page.get_by_role('button',name='Play mixtape',exact=True).is_disabled()
 page.get_by_role('button',name='Close case',exact=True).click();wait('v.active.model.openProgress===0')
 assert page.locator('iframe').count()==0
 # Drag and background clicks never open or play.
 page.mouse.move(690,480);page.mouse.down();page.mouse.move(750,500,steps=8);page.mouse.up()
 assert state('return v.active.model.openProgress;')==0
 page.mouse.click(1400,80);assert state('return v.active.model.openProgress;')==0
 page.get_by_role('button',name='Open case',exact=True).click();wait('c.dataset.open==="true"')
 page.wait_for_function('window.__spotifyCalls.some(c=>c.method==="play")')
 report['autoplay']=page.evaluate('window.__spotifyCalls.filter(c=>c.method==="play")')
 assert all(call['progress']==1 and call['open']=='true' for call in report['autoplay']),report['autoplay']
 page.get_by_role('button',name='Close player ×',exact=True).click();screenshot('anvitha-open-desktop.png')
 # All corners fit above the controls, including intermediate lid poses and mobile.
 def check_bounds():
  return page.evaluate('''async()=>{const T=await import('./prototypes/waves/vendor/three.module.js'),c=document.querySelector('canvas'),v=c.collectionViewer,m=v.active.model,results=[];
   for(const p of [0,.25,.5,.75,1]){m.setOpenProgress(p);c.caseViewer.render();const bounds=new T.Box3().setFromObject(m.pack),points=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).project(v.camera);points.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});}results.push({progress:p,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),controlsTop:document.querySelector('#case-controls').getBoundingClientRect().top,width:innerWidth});}
   return results;}''')
 report['desktopBounds']=check_bounds()
 assert all(r['minX']>=0 and r['maxX']<=r['width'] and r['minY']>=0 and r['maxY']<r['controlsTop'] for r in report['desktopBounds']),report['desktopBounds']
 page.get_by_role('button',name='Play mixtape',exact=True).click();page.locator('iframe').wait_for()
 assert '/playlist/6VWaYZbC9La3vbG2qIywXq' in page.locator('iframe').get_attribute('src')
 page.get_by_role('button',name='Close player ×',exact=True).click()
 page.get_by_text('Browse songs',exact=True).click();page.get_by_role('button',name='Zoom in on Little Bit',exact=True).click()
 pt=page.locator('canvas').evaluate('(c)=>c.caseViewer.trackPoints()[0]');page.mouse.click(pt['x'],pt['y']);page.locator('iframe').wait_for()
 assert '/track/0spXmYRCgO10zVvQwkj4hZ' in page.locator('iframe').get_attribute('src')
 page.get_by_role('button',name='Close player ×',exact=True).click();screenshot('song-zoom.png')
 page.get_by_text('Browse songs',exact=True).click();page.get_by_role('button',name='Close case',exact=True).click();wait('v.active.model.openProgress===0')
 assert page.get_by_role('button',name='Play mixtape',exact=True).is_disabled()
 page.get_by_role('button',name='View spine',exact=True).click();screenshot('spine-label.png')
 assert page.evaluate('''async()=>{const T=await import('./prototypes/waves/vendor/three.module.js'),c=document.querySelector('canvas'),v=c.collectionViewer,m=v.active.model.tapeMeshes.spine,a=m.localToWorld(new T.Vector3(-.02,0,0)).project(v.camera),b=m.localToWorld(new T.Vector3(.02,0,0)).project(v.camera);return b.x>a.x;}'''), 'Spine writing must read left to right'
 assert state('return v.active.model.tapeMeshes.spine.userData.writing;')=='Mixed by Anvitha · OCTOBER 2026'
 put_back();assert page.locator('iframe').count()==0
 # A single normal-motion pickup opens the lid and starts the playlist once.
 before=page.evaluate('window.__spotifyCalls.filter(c=>c.method==="play").length')
 pick(5);wait('c.dataset.open==="true"')
 page.wait_for_function(f'window.__spotifyCalls.filter(c=>c.method==="play").length==={before+1}')
 latest=page.evaluate('window.__spotifyCalls.filter(c=>c.method==="play").at(-1)')
 assert latest['uri']=='spotify:playlist:6VWaYZbC9La3vbG2qIywXq' and latest['progress']==1 and latest['open']=='true'
 report['singleClickPlayback']=latest
 page.get_by_role('button',name='Close player ×',exact=True).click();put_back()
 # Mobile taps, framing and reduced-motion behavior, including last-slot reachability.
 page.set_viewport_size({'width':390,'height':844});page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(200)
 screenshot('collection-mobile.png');pick(5)
 wait('c.dataset.open==="true"');page.get_by_role('button',name='Close player ×',exact=True).click()
 report['mobileBounds']=check_bounds()
 assert all(r['minX']>=0 and r['maxX']<=r['width'] and r['minY']>=0 and r['maxY']<r['controlsTop'] for r in report['mobileBounds']),report['mobileBounds']
 screenshot('anvitha-open-mobile.png');put_back()
 pick(6);wait('c.dataset.open==="true"')
 page.locator('iframe').wait_for()
 assert '/playlist/0XRiCc89XG90yQUJduIrte' in page.locator('iframe').get_attribute('src')
 page.get_by_role('button',name='Close player ×',exact=True).click()
 screenshot('vidya-open-mobile.png');put_back()
 state('v.browseTo(84);');page.locator('.case-hit').nth(84).focus();page.keyboard.press('Enter');wait('v.state==="held"')
 assert state('return v.active.index;')==84
 pt=page.evaluate('''async()=>{const T=await import('./prototypes/waves/vendor/three.module.js'),c=document.querySelector('canvas'),m=c.collectionViewer.active.model,p=m.tapeMeshes.cover.getWorldPosition(new T.Vector3()).project(c.collectionViewer.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}''')
 page.touchscreen.tap(pt['x'],pt['y']);assert state('return v.active.model.openProgress;')==1
 put_back()
 assert page.evaluate('document.documentElement.scrollWidth===innerWidth && document.documentElement.scrollHeight===innerHeight')
 assert not errors,errors
 report['glbRequests']=[u for u in requests if '.glb' in u];report['errors']=errors
 (out/'report.json').write_text(json.dumps(report,indent=2))
 print('PASS: exact GLB loaded once; 85 layouts and independent tapes/mixers; source geometry/artwork shared; upward clip and reverse; multiple pickup/return; playback gating and track selection; desktop/mobile full-lid framing; touch, keyboard and browser errors.')
 browser.close()
