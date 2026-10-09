"""Exercise late Spotify callbacks against the real player adapter, with no audio."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parent
fixture=(ROOT/'spotify_embed_fixture.js').read_text()
url='http://127.0.0.1:4177/__spotify_test'
harness='''<!doctype html><div id="spotify-panel" hidden></div><script type="module">
import {createSpotifyPlayer} from '/mixtapes/spotify-player.js?v=open-play-1';
window.allowed=false;window.player=createSpotifyPlayer(document.querySelector('#spotify-panel'),()=>window.allowed);
</script>'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless=True,args=['--no-sandbox'])
 def setup(options=None,fail=False):
  page=browser.new_page();page.route(url,lambda r:r.fulfill(body=harness,content_type='text/html'))
  page.route('https://open.spotify.com/embed/**',lambda r:r.fulfill(body='<html>Spotify fixture</html>',content_type='text/html'))
  page.route('https://open.spotify.com/embed/iframe-api/v1',lambda r:r.abort() if fail else r.fulfill(body=fixture,content_type='text/javascript'))
  page.add_init_script('window.__spotifyOptions='+json.dumps(options or {}))
  page.goto(url);page.wait_for_function('window.player');return page
 def calls(page,method):return page.evaluate('(method)=>window.__spotifyCalls.filter(c=>c.method===method)',method)
 page=setup();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("player.prepare('spotify:playlist:first','First');player.play('spotify:playlist:first','First')")
 page.wait_for_function('document.querySelector("#spotify-panel").dataset.playback==="ready"')
 assert not calls(page,'play'),'Closed case played music'
 assert page.locator('#spotify-panel').is_hidden()
 page.evaluate("allowed=true;player.play('spotify:playlist:first','First')")
 page.wait_for_function('document.querySelector("#spotify-panel").dataset.playback==="playing"')
 assert len(calls(page,'play'))==1
 page.evaluate('allowed=false;player.stop()');assert page.locator('iframe').count()==0
 assert len(calls(page,'pause'))==1 and len(calls(page,'destroy'))==1
 page.close()
 # Delayed controller creation and ready callbacks after return or track changes.
 page=setup({'callbackDelay':300,'readyDelay':150});page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("allowed=true;player.play('spotify:playlist:cancelled','Cancelled')")
 page.wait_for_function('window.__spotifyCalls?.some(c=>c.method==="create")')
 page.evaluate("player.stop();player.play('spotify:track:chosen','Chosen track')")
 page.wait_for_function('document.querySelector("#spotify-panel").dataset.playback==="playing"')
 assert [c['uri'] for c in calls(page,'play')]==['spotify:track:chosen']
 page.evaluate("player.play('spotify:playlist:returning','Returning')")
 page.wait_for_function('window.__spotifyCalls.some(c=>c.method==="create"&&c.uri.endsWith(":returning"))')
 page.evaluate('allowed=false;player.stop()');page.wait_for_timeout(700)
 assert [c['uri'] for c in calls(page,'play')]==['spotify:track:chosen']
 assert page.locator('iframe').count()==0
 page.close()
 # Native Play remains accessible when the browser declines autoplay.
 page=setup({'blocked':True});page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("allowed=true;player.play('spotify:playlist:blocked','Blocked')")
 page.get_by_text('If playback hasn’t started, press Play in Spotify below.').wait_for()
 assert page.locator('#spotify-panel').is_visible() and page.locator('iframe').is_visible()
 assert page.locator('#spotify-panel').get_attribute('data-playback')=='starting'
 page.close()
 # Network failure retains a manually usable standard Spotify embed.
 page=setup(fail=True);page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("allowed=true;player.play('spotify:playlist:fallback','Fallback')")
 page.get_by_text('Press Play in Spotify below to start listening.').wait_for()
 assert '/playlist/fallback' in page.locator('iframe').get_attribute('src')
 assert page.locator('#spotify-panel').get_attribute('data-playback')=='manual'
 page.evaluate('player.stop()');assert page.locator('iframe').count()==0
 page.close()
 assert not errors,errors
 print('PASS: play gated until open; pause/destroy on close; stale controller and track callbacks cancelled; autoplay-blocked and API-failure manual fallbacks; no JavaScript errors. Spotify responses simulated; no streamed audio asserted.')
 browser.close()
