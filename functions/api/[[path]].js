/* Everything under /api on the site: the store for walls that are a photo and routes
   (store/store.js says what it does). This file only hands the request over, with the
   database the Pages project binds as DB (see wrangler.toml). */
import { handle } from '../../store/store.js';

export async function onRequest({ request, env }){
  try{
    return await handle(request, env.DB);
  }catch(e){
    return new Response(JSON.stringify({ error: 'the store failed: ' + (e && e.message || e) }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
