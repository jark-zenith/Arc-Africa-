import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.ARC_CONFIG;
const db = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => value ? new Date(value).toLocaleString('en-KE', {dateStyle:'medium',timeStyle:'short'}) : '—';
const safeUrl = value => { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const externalLink = (value, label) => { const url = safeUrl(value); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ''; };

let currentUser = null, users = [], sessions = [], profiles = [], activity = [], activityChannel = null;
let applicationRows = [], projectRows = [], communityRows = [], messageRows = [], auditRows = [];
let userPage = 1, loadingPromise = null, toastTimer = null;
const pageSize = 25;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}
function profileFor(id) { return profiles.find(profile => profile.id === id) || {}; }
function sessionFor(id) { return sessions.find(session => session.user_id === id) || {}; }
function tab(name) {
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === name));
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  $('#pageTitle').textContent = ({overview:'Overview',users:'Member directory',applications:'Membership inbox',projects:'Project reviews',community:'Community moderation',messages:'Contact inbox',audit:'Administrator audit',activity:'Member activity'})[name] || name;
}

async function gate() {
  const {data:{session}} = await db.auth.getSession();
  currentUser = session?.user || null;
  if (!currentUser) {
    $('#gate').classList.remove('hidden'); $('#app').classList.add('hidden'); return false;
  }
  const {data:profile,error} = await db.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
  if (error || profile?.role !== 'admin' || currentUser.email?.toLowerCase() !== 'jarkpruden@gmail.com') {
    await db.auth.signOut();
    $('#gateMessage').textContent = 'This account is not authorised for the private administrator console.';
    $('#gate').classList.remove('hidden'); $('#app').classList.add('hidden'); return false;
  }
  $('#gate').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#adminEmail').textContent = currentUser.email;
  return true;
}

async function loadConsole() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    if (!await gate()) return;
    watchActivity();
    const [consoleResult, profileResult] = await Promise.all([
      db.functions.invoke('admin-console', {body:{}}),
      db.from('profiles').select('id,display_name,username,avatar_url,bio,location,role,membership_status,created_at')
    ]);
    const {data,error} = consoleResult;
    if (error || data?.error) { toast(data?.error || error?.message || 'Admin data unavailable'); return; }
    users = data.users || [];
    sessions = data.sessions || [];
    profiles = profileResult.data || [];
    if (profileResult.error) console.warn('Profile directory details unavailable:', profileResult.error.message);
    userPage = 1;
    await Promise.all([loadApplications(),loadProjects(),loadCommunity(),loadMessages(),loadAudit(),loadActivity(),loadHealth()]);
    renderUsers();
    renderOverview(data.generated_at);
    $('#lastUpdated').textContent = `Updated ${fmt(data.generated_at)}`;
    $('#queueUpdated').textContent = `Snapshot ${fmt(data.generated_at)}`;
  })().finally(() => { loadingPromise = null; });
  return loadingPromise;
}

function renderOverview(generatedAt) {
  const activeSessions = sessions.reduce((total,item) => total + Number(item.session_count || 0), 0);
  const pendingApps = applicationRows.filter(item => item.status === 'pending').length;
  const pendingProjects = projectRows.filter(item => item.status === 'pending').length;
  const pendingPosts = communityRows.filter(item => item.status === 'pending').length;
  const unreadMessages = messageRows.filter(item => item.status === 'unread').length;
  const newMembers = users.filter(item => Date.now() - new Date(item.created_at).getTime() <= 7*86400000).length;
  const verified = users.filter(item => item.email_confirmed_at).length;
  const cards = [
    ['Registered accounts',users.length,'All known accounts'],
    ['Active sessions',activeSessions,'Current session records'],
    ['Pending applications',pendingApps,'Awaiting membership review'],
    ['Projects to review',pendingProjects,'Awaiting project decision'],
    ['New members · 7 days',newMembers,'Recently created accounts'],
    ['Verified emails',verified,`${users.length ? Math.round(verified/users.length*100) : 0}% of accounts`]
  ];
  $('#stats').innerHTML = cards.map(([label,value,note]) => `<article><small>${esc(label)}</small><strong>${Number(value).toLocaleString('en-KE')}</strong><span class="stat-note">${esc(note)}</span></article>`).join('');
  $('#pulse').innerHTML = `<p><b>${users.length}</b> accounts · <b>${activeSessions}</b> active sessions · <b>${activity.length}</b> recent activity records loaded.</p><p>Data snapshot: ${esc(fmt(generatedAt))}. Activity history begins when privacy-safe audit collection was enabled.</p>`;
  const queues = [
    ['Membership',applicationRows.filter(item=>['pending','changes_requested'].includes(item.status)).length,'applications','Needs review'],
    ['Projects',projectRows.filter(item=>['pending','changes_requested'].includes(item.status)).length,'projects','Needs review'],
    ['Community',communityRows.filter(item=>['pending','changes_requested'].includes(item.status)).length,'community','Needs review'],
    ['Unread messages',unreadMessages,'messages','Inbox attention']
  ];
  $('#queueSummary').innerHTML = queues.map(([label,count,destination,note]) => `<button class="queue-tile" data-go="${destination}"><span>${esc(label)}</span><strong>${count}</strong><small>${esc(note)} →</small></button>`).join('');
  renderGrowth();
}

function renderGrowth() {
  const days = Array.from({length:7},(_,index) => {
    const date = new Date(); date.setUTCHours(0,0,0,0); date.setUTCDate(date.getUTCDate() - (6-index));
    return {date,key:date.toISOString().slice(0,10),members:0,events:0};
  });
  users.forEach(user => { const key = new Date(user.created_at).toISOString().slice(0,10); const day = days.find(item=>item.key===key); if(day) day.members++; });
  activity.forEach(event => { const key = new Date(event.created_at).toISOString().slice(0,10); const day = days.find(item=>item.key===key); if(day) day.events++; });
  const max = Math.max(1,...days.map(day=>day.members+day.events));
  $('#growthBars').innerHTML = days.map(day => `<div class="growth-day"><div class="growth-stack"><span class="growth-members" style="height:${Math.max(day.members?4:0,day.members/max*88)}px" title="${day.members} new members"></span><span class="growth-events" style="height:${Math.max(day.events?4:0,day.events/max*88)}px" title="${day.events} activity events"></span></div><small>${day.date.toLocaleDateString('en-KE',{weekday:'short'})}</small><b>${day.members+day.events}</b></div>`).join('');
}

function renderUsers() {
  const query = ($('#userSearch')?.value || '').trim().toLowerCase();
  const filter = $('#userStatusFilter')?.value || 'all';
  const roleFilter = $('#userRoleFilter')?.value || 'all';
  const membershipFilter = $('#membershipFilter')?.value || 'all';
  const filtered = users.filter(user => {
    const profile = profileFor(user.id), session = sessionFor(user.id), count = Number(session.session_count||0);
    const haystack = [user.email,user.id,profile.display_name,profile.username,profile.location].join(' ').toLowerCase();
    const matches = !query || haystack.includes(query);
    const status = filter === 'verified' ? !!user.email_confirmed_at : filter === 'unverified' ? !user.email_confirmed_at : filter === 'sessions' ? count>0 : filter === 'no-sessions' ? count===0 : filter === 'restricted' ? !!user.banned_until : true;
    return matches && status && (roleFilter==='all'||(profile.role||'member')===roleFilter) && (membershipFilter==='all'||(profile.membership_status||'not_applied')===membershipFilter);
  });
  const pages = Math.max(1,Math.ceil(filtered.length/pageSize)); userPage = Math.min(userPage,pages);
  const visible = filtered.slice((userPage-1)*pageSize,userPage*pageSize);
  $('#userCount').textContent = `${filtered.length.toLocaleString('en-KE')} matching accounts · page ${userPage} of ${pages}`;
  $('#usersRows').innerHTML = visible.map(user => {
    const profile = profileFor(user.id), session = sessionFor(user.id), count = Number(session.session_count||0);
    const name = profile.display_name || profile.username || user.email || 'Unnamed member';
    const role = profile.role || 'member';
    const status = user.banned_until ? 'Restricted' : 'Active';
    return `<tr><td><b>${esc(name)}</b><br><small>${esc(user.email||'No email')}</small></td><td><span class="status role-${esc(role)}">${esc(role)}</span></td><td><span class="status">${esc(profile.membership_status||'not applied')}</span></td><td>${esc(fmt(user.created_at))}</td><td>${esc(fmt(user.last_sign_in_at))}</td><td><span class="status ${user.email_confirmed_at?'online':'status-warn'}">${user.email_confirmed_at?'Verified':'Unverified'}</span></td><td><span class="status ${count?'online':''}">${count} session(s)</span><br><small>${esc(fmt(session.latest_activity))}</small></td><td><span class="status ${user.banned_until?'status-warn':'online'}">${status}</span></td><td><button class="table-action" data-user-detail="${esc(user.id)}">View record</button></td></tr>`;
  }).join('') || '<tr><td colspan="9">No accounts match these filters.</td></tr>';
  $('#userPager').innerHTML = `<button class="btn-quiet" data-user-page="prev" ${userPage<=1?'disabled':''}>← Previous</button><span>Page ${userPage} / ${pages}</span><button class="btn-quiet" data-user-page="next" ${userPage>=pages?'disabled':''}>Next →</button>`;
}

async function openUserDetail(id) {
  const user = users.find(item=>item.id===id); if(!user) return;
  const profile = profileFor(id), session = sessionFor(id);
  $('#userModalTitle').textContent = profile.display_name || profile.username || user.email || 'Member record';
  $('#userModalBody').innerHTML = '<p class="muted">Loading account activity…</p>';
  $('#userModal').classList.remove('hidden');
  const [eventsResult,projectsResult] = await Promise.all([
    db.from('admin_audit_events').select('action,target_type,target_id,created_at,details').eq('actor_id',id).order('created_at',{ascending:false}).limit(12),
    db.from('projects').select('id,title,status,created_at').eq('owner_id',id).order('created_at',{ascending:false}).limit(8)
  ]);
  const events = eventsResult.data || [], projects = projectsResult.data || [];
  const avatar = safeUrl(profile.avatar_url);
  $('#userModalBody').innerHTML = `<div class="member-identity">${avatar?`<img src="${esc(avatar)}" alt="">`:'<div class="avatar-placeholder">AA</div>'}<div><b>${esc(profile.display_name||'Name not provided')}</b><span>${esc(user.email||'No email address')}</span><small>@${esc(profile.username||'username not set')}</small></div></div><div class="detail-grid"><div><small>Account role</small><b>${esc(profile.role||'member')}</b></div><div><small>Membership status</small><b>${esc(profile.membership_status||'not applied')}</b></div><div><small>Email verification</small><b>${user.email_confirmed_at?'Verified':'Not verified'}</b></div><div><small>Account status</small><b>${user.banned_until?'Restricted':'Active'}</b></div><div><small>Joined</small><b>${esc(fmt(user.created_at))}</b></div><div><small>Last sign in</small><b>${esc(fmt(user.last_sign_in_at))}</b></div><div><small>Active sessions</small><b>${Number(session.session_count||0)}</b></div><div><small>Latest session activity</small><b>${esc(fmt(session.latest_activity))}</b></div><div><small>Location</small><b>${esc(profile.location||'Not provided')}</b></div><div><small>Account ID</small><b class="id-value">${esc(user.id)}</b></div></div>${profile.bio?`<div class="detail-block"><small>Public profile bio</small><p>${esc(profile.bio)}</p></div>`:''}<div class="detail-block"><h3>Projects submitted</h3>${projects.length?projects.map(project=>`<div class="mini-row"><b>${esc(project.title)}</b><span class="status">${esc(project.status)}</span></div>`).join(''):'<p class="muted">No projects submitted.</p>'}</div><div class="detail-block"><h3>Recent recorded activity</h3>${events.length?events.map(event=>`<div class="mini-row"><span>${esc(String(event.action||'activity').replaceAll('_',' '))} · ${esc(event.target_type||'platform')}</span><small>${esc(fmt(event.created_at))}</small></div>`).join(''):'<p class="muted">No member-attributed activity records yet.</p>'}<p class="muted">This view contains account and platform activity metadata only. It does not expose private messages, credentials, IP addresses or browsing history.</p></div>`;
}

async function loadApplications() {
  const {data,error} = await db.from('member_applications').select('*').order('created_at',{ascending:false}).limit(300);
  applicationRows = error ? [] : data || [];
  renderApplications();
  if(error) $('#applicationsRows').innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
}
function renderApplications() {
  const query = ($('#applicationSearch')?.value||'').toLowerCase().trim(), filter = $('#applicationFilter')?.value||'open';
  const rows = applicationRows.filter(item => (filter==='all'||(filter==='open'?['pending','changes_requested'].includes(item.status):item.status===filter)) && [item.applicant_name,item.email,item.county,item.github_username,item.motivation].join(' ').toLowerCase().includes(query));
  $('#applicationsRows').innerHTML = rows.map(item => `<div class="row"><div><h3>${esc(item.applicant_name)} · ${esc(item.county)}</h3><p>${esc(item.email)} · GitHub: ${esc(item.github_username)} · <span class="status">${esc(item.status)}</span></p><p>${esc(item.motivation)}</p><p>${externalLink(item.linkedin_url,'LinkedIn')} ${externalLink(item.portfolio_url,'Portfolio')}</p><small class="muted">Submitted ${esc(fmt(item.created_at))}</small></div><div class="actions">${item.status!=='approved'?`<button data-app="${esc(item.id)}" data-status="approved">Approve</button>`:''}${item.status!=='rejected'?`<button class="reject" data-app="${esc(item.id)}" data-status="rejected">Reject</button>`:''}<button data-app="${esc(item.id)}" data-status="changes_requested">Request info</button></div></div>`).join('') || '<p class="empty-state">No applications match this view.</p>';
}
async function reviewApplication(id,status) {
  const note = status==='approved' ? '' : prompt('Optional note to applicant:') || '';
  const {data,error} = await db.functions.invoke('review-member-application',{body:{application_id:id,decision:status,note}});
  if(error||data?.error){toast(data?.error||error.message);return;}
  toast(data?.email_sent===false?'Decision saved, but the notification email was not sent.':`Application ${status.replaceAll('_',' ')}.`);
  await loadConsole();
}

async function loadProjects() {
  const {data,error} = await db.from('projects').select('id,owner_id,title,summary,description,category,country,status,created_at,repository_url,demo_url,website_url,stage,featured').order('created_at',{ascending:false}).limit(300);
  projectRows = error ? [] : data || []; renderProjects();
  if(error) $('#projectsRows').innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
}
function renderProjects() {
  const query = ($('#projectSearch')?.value||'').toLowerCase().trim(), filter = $('#projectFilter')?.value||'open';
  const rows = projectRows.filter(item => (filter==='all'||(filter==='open'?['pending','changes_requested'].includes(item.status):item.status===filter)) && [item.title,item.category,item.country,item.summary,item.description].join(' ').toLowerCase().includes(query));
  $('#projectsRows').innerHTML = rows.map(item => `<div class="row"><div><h3>${esc(item.title)} <span class="status">${esc(item.status)}</span></h3><p>${esc(item.category)} · ${esc(item.country)} · ${esc(item.stage||'idea')}${item.featured?' · Featured':''}</p><p>${esc(item.summary)}</p><p>${externalLink(item.repository_url,'Repository')} ${externalLink(item.demo_url,'Demo')} ${externalLink(item.website_url,'Website')}</p><small class="muted">Submitted ${esc(fmt(item.created_at))} · Owner ${esc(profileFor(item.owner_id).display_name||item.owner_id||'Unknown')}</small></div><div class="actions">${item.status!=='approved'?`<button data-project="${esc(item.id)}" data-status="approved">Approve</button>`:''}${item.status!=='rejected'?`<button class="reject" data-project="${esc(item.id)}" data-status="rejected">Reject</button>`:''}<button data-project="${esc(item.id)}" data-status="changes_requested">Request changes</button></div></div>`).join('') || '<p class="empty-state">No project submissions match this view.</p>';
}
async function reviewProject(id,status) {
  const note = status==='approved' ? '' : prompt('Optional note for project owner:') || '';
  const {error} = await db.from('projects').update({status,moderator_note:note,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq('id',id);
  if(error){toast(error.message);return;} toast(`Project ${status.replaceAll('_',' ')}.`); await loadProjects(); renderOverview(new Date().toISOString());
}

async function loadCommunity() {
  const {data,error} = await db.from('community_posts').select('id,author_id,title,summary,post_type,country,county,status,created_at,external_url,registration_url,venue,starts_at,deadline_at').order('created_at',{ascending:false}).limit(300);
  communityRows = error ? [] : data || []; renderCommunity();
  if(error) $('#communityRows').innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
}
function renderCommunity() {
  const query = ($('#communitySearch')?.value||'').toLowerCase().trim(), filter = $('#communityFilter')?.value||'open';
  const rows = communityRows.filter(item => (filter==='all'||(filter==='open'?['pending','changes_requested'].includes(item.status):item.status===filter)) && [item.title,item.summary,item.post_type,item.country,item.county,item.venue].join(' ').toLowerCase().includes(query));
  $('#communityRows').innerHTML = rows.map(item => `<div class="row"><div><h3>${esc(item.title)} <span class="status">${esc(item.post_type)}</span> <span class="status">${esc(item.status)}</span></h3><p>${esc(item.country)}${item.county?' · '+esc(item.county):''}${item.venue?' · '+esc(item.venue):''}</p><p>${esc(item.summary)}</p><p>${externalLink(item.external_url,'External link')} ${externalLink(item.registration_url,'Registration')}</p><small class="muted">Submitted ${esc(fmt(item.created_at))} · Author ${esc(profileFor(item.author_id).display_name||'Member')}</small></div><div class="actions">${item.status!=='approved'?`<button data-post="${esc(item.id)}" data-status="approved">Approve</button>`:''}${item.status!=='rejected'?`<button class="reject" data-post="${esc(item.id)}" data-status="rejected">Reject</button>`:''}<button data-post="${esc(item.id)}" data-status="changes_requested">Request changes</button></div></div>`).join('') || '<p class="empty-state">No community submissions match this view.</p>';
}
async function reviewPost(id,status) {
  const note = status==='approved' ? '' : prompt('Optional note for contributor:') || '';
  const {error} = await db.from('community_posts').update({status,moderator_note:note,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq('id',id);
  if(error){toast(error.message);return;} toast(`Community post ${status.replaceAll('_',' ')}.`); await loadCommunity(); renderOverview(new Date().toISOString());
}

async function loadMessages() {
  const {data,error} = await db.from('admin_inbox').select('*').order('created_at',{ascending:false}).limit(300);
  messageRows = error ? [] : data || []; renderMessages();
  if(error) $('#messagesRows').innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
}
function renderMessages() {
  const query = ($('#messageSearch')?.value||'').toLowerCase().trim(), filter = $('#messageFilter')?.value||'active';
  const rows = messageRows.filter(item => (filter==='all'||(filter==='active'?['unread','read'].includes(item.status):item.status===filter)) && [item.sender_name,item.sender_email,item.subject,item.message].join(' ').toLowerCase().includes(query));
  $('#messagesRows').innerHTML = rows.map(item => `<div class="row"><div><h3>${esc(item.subject)} <span class="status ${item.status==='unread'?'status-warn':''}">${esc(item.status)}</span></h3><p>${esc(item.sender_name)} · ${esc(item.sender_email)} · ${esc(fmt(item.created_at))}</p><p class="message-body">${esc(item.message)}</p></div><div class="actions"><button data-msg="${esc(item.id)}" data-status="read">Mark read</button><button data-msg="${esc(item.id)}" data-status="replied">Mark replied</button><button class="reject" data-msg="${esc(item.id)}" data-status="archived">Archive</button></div></div>`).join('') || '<p class="empty-state">No messages match this view.</p>';
}
async function updateMessage(id,status) {
  const {error} = await db.from('admin_inbox').update({status}).eq('id',id);
  if(error){toast(error.message);return;} toast(`Message marked ${status}.`); await loadMessages(); renderOverview(new Date().toISOString());
}

async function loadAudit() {
  const {data,error} = await db.from('admin_audit_events').select('id,actor_id,action,target_type,target_id,details,created_at').order('created_at',{ascending:false}).limit(100);
  auditRows = error ? [] : (data||[]).filter(item => item.actor_id===currentUser?.id && !String(item.action||'').startsWith('member_activity:'));
  renderAudit();
  if(error) $('#auditRows').innerHTML = `<p class="error-text">${esc(error.message)}</p>`;
}
function renderAudit() {
  $('#auditRows').innerHTML = auditRows.map(item => `<div class="row"><div><h3>${esc(String(item.action||'admin action').replaceAll('_',' '))}</h3><p>${esc(item.target_type||'platform')} · ${esc(item.target_id||'—')} · ${esc(fmt(item.created_at))}</p></div><span class="status">Administrator</span></div>`).join('') || '<p class="empty-state">No administrator actions recorded in this view yet.</p>';
}

async function loadActivity() {
  const {data,error} = await db.from('admin_audit_events').select('id,actor_id,action,target_type,target_id,details,created_at').order('created_at',{ascending:false}).limit(250);
  if(error){$('#activityRows').innerHTML=`<p class="error-text">${esc(error.message)}</p>`;return;}
  activity = data || []; renderActivity();
}
function renderActivity() {
  const type=$('#activityType').value, query=$('#activitySearch').value.trim().toLowerCase();
  const rows=activity.filter(item=>{
    const user=users.find(candidate=>candidate.id===item.actor_id);
    const haystack=[item.action,item.target_type,item.target_id,item.actor_id,user?.email,profileFor(item.actor_id).display_name].join(' ').toLowerCase();
    return (!type||item.target_type===type)&&(!query||haystack.includes(query));
  });
  $('#activityRows').innerHTML=rows.map(item=>{
    const user=users.find(candidate=>candidate.id===item.actor_id), profile=profileFor(item.actor_id);
    const action=String(item.action||'activity').replace(/^member_activity:/,'').replaceAll('_',' ');
    const fields=Array.isArray(item.details?.changed_fields)?item.details.changed_fields.join(', '):'';
    return `<div class="row"><div><h3>${esc(action)}</h3><p><b>${esc(profile.display_name||user?.email||'System / unavailable actor')}</b> · ${esc(item.target_type||'platform')} · ${esc(item.target_id||'—')}</p><p>${esc(fmt(item.created_at))}${fields?' · Changed fields: '+esc(fields):''}</p></div><span class="status">Recorded</span></div>`;
  }).join('')||'<p class="empty-state">No activity matches these filters.</p>';
}

async function loadHealth() {
  const checks=await Promise.all([
    db.from('profiles').select('id',{count:'exact',head:true}),
    db.from('projects').select('id',{count:'exact',head:true}),
    db.from('admin_audit_events').select('id',{count:'exact',head:true}),
    db.from('admin_inbox').select('id',{count:'exact',head:true})
  ]);
  const names=['Member database','Project directory','Private audit log','Contact inbox'];
  $('#healthRows').innerHTML=checks.map((result,index)=>`<div class="health-row"><span>${names[index]}</span><b class="${result.error?'health-bad':'health-good'}">${result.error?'Needs attention':'Responding'}</b></div>`).join('')+'<p class="muted">These checks verify authenticated query access. They do not replace provider uptime, email-delivery, or external integration monitoring.</p>';
}
function watchActivity() {
  if(activityChannel) return;
  activityChannel=db.channel('arc-africa-admin-activity').on('postgres_changes',{event:'*',schema:'public',table:'admin_audit_events'},()=>{loadActivity();loadAudit();}).subscribe();
}

function exportCsv(filename, rows) {
  if(!rows.length){toast('There is no data to export in this view.');return;}
  const headers=Object.keys(rows[0]);
  const csvCell=value=>{const text=String(value??'');const safe=/^[\s]*[=+\-@]/.test(text)?`'${text}`:text;return `"${safe.replace(/"/g,'""')}"`;};
  const csv=[headers.map(csvCell).join(','),...rows.map(row=>headers.map(key=>csvCell(row[key])).join(','))].join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  toast('CSV export prepared.');
}
function exportUsers() {
  const query=($('#userSearch').value||'').toLowerCase().trim(), filter=$('#userStatusFilter').value, roleFilter=$('#userRoleFilter').value, membershipFilter=$('#membershipFilter').value;
  const rows=users.filter(user=>{const profile=profileFor(user.id),count=Number(sessionFor(user.id).session_count||0),hay=[user.email,user.id,profile.display_name,profile.username,profile.location].join(' ').toLowerCase();return(!query||hay.includes(query))&&(filter==='all'||filter==='verified'&&!!user.email_confirmed_at||filter==='unverified'&&!user.email_confirmed_at||filter==='sessions'&&count>0||filter==='no-sessions'&&count===0||filter==='restricted'&&!!user.banned_until)&&(roleFilter==='all'||(profile.role||'member')===roleFilter)&&(membershipFilter==='all'||(profile.membership_status||'not_applied')===membershipFilter);}).map(user=>{const profile=profileFor(user.id),session=sessionFor(user.id);return {name:profile.display_name||profile.username||'',email:user.email||'',user_id:user.id,role:profile.role||'member',membership_status:profile.membership_status||'',joined_at:user.created_at,last_sign_in:user.last_sign_in_at||'',email_verified:!!user.email_confirmed_at,active_sessions:Number(session.session_count||0),latest_session_activity:session.latest_activity||'',account_status:user.banned_until?'restricted':'active'};});
  exportCsv('arc-africa-members.csv',rows);
}
function exportActivity() { exportCsv('arc-africa-member-activity.csv',activity.map(item=>({time:item.created_at,actor:users.find(user=>user.id===item.actor_id)?.email||item.actor_id||'system',action:item.action,target_type:item.target_type,target_id:item.target_id,changed_fields:Array.isArray(item.details?.changed_fields)?item.details.changed_fields.join('|'):''}))); }
function exportAudit() { exportCsv('arc-africa-admin-audit.csv',auditRows.map(item=>({time:item.created_at,action:item.action,target_type:item.target_type,target_id:item.target_id,actor_id:item.actor_id}))); }
function exportMessages() { exportCsv('arc-africa-contact-messages.csv',messageRows.map(item=>({time:item.created_at,sender:item.sender_name,email:item.sender_email,subject:item.subject,message:item.message,status:item.status}))); }

$('#loginForm').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  const {error}=await db.auth.signInWithPassword({email:form.get('email'),password:form.get('password')});
  if(error){$('#gateMessage').textContent=error.message;return;} await loadConsole();
};
$('#signout').onclick=async()=>{await db.auth.signOut();location.href='/';};
$('#refresh').onclick=loadConsole;
$('#userSearch').oninput=()=>{userPage=1;renderUsers();};
$('#userStatusFilter').onchange=()=>{userPage=1;renderUsers();};
$('#userRoleFilter').onchange=()=>{userPage=1;renderUsers();};
$('#membershipFilter').onchange=()=>{userPage=1;renderUsers();};
$('#applicationSearch').oninput=renderApplications;$('#applicationFilter').onchange=renderApplications;
$('#projectSearch').oninput=renderProjects;$('#projectFilter').onchange=renderProjects;
$('#communitySearch').oninput=renderCommunity;$('#communityFilter').onchange=renderCommunity;
$('#messageSearch').oninput=renderMessages;$('#messageFilter').onchange=renderMessages;
$('#activityType').onchange=renderActivity;$('#activitySearch').oninput=renderActivity;
$('#exportUsers').onclick=exportUsers;$('#exportActivity').onclick=exportActivity;$('#exportAudit').onclick=exportAudit;$('#exportMessages').onclick=exportMessages;
$('#closeUserModal').onclick=()=>$('#userModal').classList.add('hidden');
$('#userModal').onclick=event=>{if(event.target.id==='userModal')$('#userModal').classList.add('hidden');};
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('#userModal').classList.add('hidden');});
document.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.tab)tab(target.dataset.tab);
  if(target.dataset.go)tab(target.dataset.go);
  if(target.dataset.userPage){userPage+=target.dataset.userPage==='next'?1:-1;renderUsers();}
  if(target.dataset.userDetail)openUserDetail(target.dataset.userDetail);
  if(target.dataset.app)reviewApplication(target.dataset.app,target.dataset.status);
  if(target.dataset.project)reviewProject(target.dataset.project,target.dataset.status);
  if(target.dataset.post)reviewPost(target.dataset.post,target.dataset.status);
  if(target.dataset.msg)updateMessage(target.dataset.msg,target.dataset.status);
});
db.auth.onAuthStateChange(()=>{setTimeout(loadConsole,0);});
loadConsole();
