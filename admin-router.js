import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cfg=window.ARC_CONFIG;
if(cfg?.supabaseUrl&&cfg?.supabaseAnonKey&&!location.pathname.endsWith('/admin.html')){
 const db=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
 let redirecting=false;
 async function routeAdmin(session){
  const user=session?.user;
  if(redirecting||!user||user.email?.toLowerCase()!=='jarkpruden@gmail.com')return;
  const {data,error}=await db.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if(!error&&data?.role==='admin'){redirecting=true;location.replace('/admin.html')}
 }
 db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>routeAdmin(session),0)});
 db.auth.getSession().then(({data})=>routeAdmin(data.session));
}