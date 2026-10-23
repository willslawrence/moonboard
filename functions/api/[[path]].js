/* Everything under /api on the site: the store for walls that are a photo and routes
   (store/store.js says what it does), and the connect and Sun-board alerts (store/push.js). This file only
   hands the request over, with the database the Pages project binds as DB (see wrangler.toml). */
import { handle } from '../../store/store.js';
import { handlePush, sunLogged } from '../../store/push.js';

export async function onRequest({ request, env, waitUntil }){
  try{
    if (new URL(request.url).pathname.startsWith('/api/push/')) return await handlePush(request, env, waitUntil);
    const url = new URL(request.url);
    // a try or a send logged on the Sun board: tell the phones that asked (store/push.js, at most every 3 hours)
    const sunLog = request.method === 'POST' && url.pathname === '/api/w/sun/log' && !url.searchParams.get('crew')
      ? await request.clone().json().catch(() => null) : null;
    const res = await handle(request, env.DB);
    if (sunLog && res.ok && waitUntil) waitUntil(sunLogged(env, sunLog.person).catch(() => {}));
    return res;
  }catch(e){
    return new Response(JSON.stringify({ error: 'the store failed: ' + (e && e.message || e) }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
