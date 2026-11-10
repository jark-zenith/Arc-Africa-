import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const client=createClient(window.ARC_CONFIG.supabaseUrl,window.ARC_CONFIG.supabaseAnonKey);
const account=document.querySelector('#accountContent');
let activeId=null,observer;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notify(s){const el=document.querySelector('#toast');if(el){el.textContent=s;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}}
async function loadTools(){
 if(!account||account.dataset.ownerTools==='ready'||!account.textContent.includes('Your submissions'))return;
 const {data:{user}}=await client.auth.getUser();if(!user)return;
 const {data:items,error}=await client.from('projects').select('id,title,status').eq('owner_id',user.id).order('created_at',{ascending:false});
 if(error)return;
 account.dataset.ownerTools='ready';
 const block=document.createElement('section');block.className='detail-block';block.innerHTML='<h3>Project progress manager</h3><p class="comment">Add milestones and publish progress updates for projects you own.</p><label style="display:block;font-size:11px;font-weight:700;margin:12px 0">Choose a project<select id="progressProject" style="display:block;width:100%;padding:11px;margin-top:7px;border:1px solid #e1e0d9;border-radius:5px;background:#fff">'+(items||[]).map(p=>'<option value="'+p.id+'">'+esc(p.title)+' · '+esc(p.status)+'</option>').join('')+'</select></label><div id="progressForms"><div class="form-grid"><form id="milestoneForm" class="span-two"><h4>Add a milestone</h4><label>Milestone title<input name="title" required placeholder="e.g. Complete first prototype"></label><label>Details<input name="description" placeholder="What will be achieved?"></label><label>Target date<input name="due_date" type="date"></label><button class="btn btn-dark" type="submit">Add milestone</button></form><form id="updateForm" class="span-two"><h4>Publish a progress update</h4><label>Update title<input name="title" required placeholder="What changed?"></label><label>Update details<textarea name="body" rows="3" required placeholder="Share progress with the community…"></textarea></label><button class="btn btn-primary" type="submit">Publish update ↗</button></form></div><div id="milestoneManager"></div></div>';
 account.appendChild(block);
 const select=block.querySelector('#progressProject');
 async function refresh(){
  activeId=select.value;const list=block.querySelector('#milestoneManager');
  if(!activeId){list.innerHTML='<p class="comment">Submit a project to start tracking progress.</p>';return}
  const {data,error}=await client.from('project_milestones').select('*').eq('project_id',activeId).order('sort_order');
  if(error){list.textContent=error.message;return}
  list.innerHTML='<h4>Milestones</h4>'+((data||[]).map(m=>'<label class="comment" style="display:flex;gap:9px;align-items:center"><input type="checkbox" data-milestone="'+m.id+'" '+(m.completed?'checked':'')+' style="width:auto">'+esc(m.title)+(m.due_date?' · '+esc(m.due_date):'')+'</label>').join('')||'<p class="comment">No milestones yet.</p>');
  list.querySelectorAll('[data-milestone]').forEach(input=>input.addEventListener('change',async()=>{const {error}=await client.from('project_milestones').update({completed:input.checked}).eq('id',input.dataset.milestone);notify(error?error.message:'Milestone progress saved.')}));
 }
 select.addEventListener('change',refresh);await refresh();
 block.querySelector('#milestoneForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await client.from('project_milestones').insert({project_id:select.value,title:f.get('title').trim(),description:f.get('description').trim()||null,due_date:f.get('due_date')||null});if(error){notify(error.message);return}e.currentTarget.reset();notify('Milestone added.');refresh()});
 block.querySelector('#updateForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {error}=await client.from('project_updates').insert({project_id:select.value,author_id:user.id,title:f.get('title').trim(),body:f.get('body').trim()});if(error){notify(error.message);return}e.currentTarget.reset();notify('Progress update published.')});
}
if(account){observer=new MutationObserver(()=>{if(!account.dataset.ownerTools)loadTools()});observer.observe(account,{childList:true,subtree:true})}
client.auth.onAuthStateChange((event)=>{
 if(event==='PASSWORD_RECOVERY')showRecovery();
 if(event==='SIGNED_OUT'&&account)delete account.dataset.ownerTools;
});
function showRecovery(){
 if(document.querySelector('#recoveryModal'))return;
 const wrap=document.createElement('div');wrap.id='recoveryModal';wrap.className='modal-backdrop';wrap.innerHTML='<section class="modal"><div class="modal-kicker">ACCOUNT SECURITY</div><h2>Choose a new password.</h2><p>Use at least 8 characters.</p><form id="recoveryForm"><label>New password<input name="password" type="password" minlength="8" required></label><button class="btn btn-primary btn-full" type="submit">Update password</button></form></section>';document.body.appendChild(wrap);
 wrap.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const password=new FormData(e.currentTarget).get('password');const {error}=await client.auth.updateUser({password});notify(error?error.message:'Password updated. You can now sign in.');if(!error){wrap.remove();location.hash=''}});
}
