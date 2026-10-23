/* Everything under /api on the site: the store for walls that are a photo and routes
   (store/store.js says what it does), and the connect alerts (store/push.js). This file only
   hands the request over, with the database the Pages project binds as DB (see wrangler.toml). */
import { handle } from '../../store/store.js';
import { handlePush } from '../../store/push.js';

export async function onRequest({ request, env, waitUntil }){
  try{
    if (new URL(request.url).pathname.startsWith('/api/push/')) return await handlePush(request, env, waitUntil);
    return await handle(request, env.DB);
  }catch(e){
    return new Response(JSON.stringify({ error: 'the store failed: ' + (e && e.message || e) }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
