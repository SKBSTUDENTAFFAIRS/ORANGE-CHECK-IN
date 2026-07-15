/* SKB Orange เช็กอิน — static client using JSONP to call GAS */
const $ = s => document.querySelector(s);
const state = { token: localStorage.getItem('skb_token') || '', data: null, dashboard: null, current: null, selectedSessionId: '', tab: 'checkin', search: '' };
const apiUrl = () => window.SKB_CONFIG?.API_URL || '';

function api(action, params = {}) {
  if (!apiUrl() || apiUrl().includes('PASTE_')) return Promise.reject(new Error('ยังไม่ได้ใส่ URL ของ GAS ในไฟล์ config.js'));
  return new Promise((resolve, reject) => {
    const callback = `skbCallback_${Date.now()}_${Math.floor(Math.random()*9999)}`;
    const query = new URLSearchParams({ action, token: state.token, callback, ...params });
    const script = document.createElement('script'); const timeout = setTimeout(() => done(new Error('เชื่อมต่อระบบไม่สำเร็จ')), 16000);
    function done(error, result) { clearTimeout(timeout); delete window[callback]; script.remove(); error ? reject(error) : result?.ok ? resolve(result.data) : reject(new Error(result?.error || 'เกิดข้อผิดพลาด')); }
    window[callback] = result => done(null, result); script.onerror = () => done(new Error('ไม่สามารถเชื่อมต่อ GAS ได้'));
    script.src = `${apiUrl()}?${query.toString()}`; document.head.appendChild(script);
  });
}
function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function thaiDate(date) { try{return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`));}catch{return date;} }
function toast(message) { const e=$('#toast'); e.textContent=message;e.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>e.classList.remove('show'),2500); }
function setLoading(on) { document.body.style.cursor=on?'wait':''; }

async function load() {
  setLoading(true);
  try { state.data = await api('bootstrap'); state.dashboard = await api('dashboard'); await render(); }
  catch (e) { if (/เซสชัน/.test(e.message)) logout(); else toast(e.message); }
  finally { setLoading(false); }
}
async function render() {
  $('#loginView').hidden = !!state.token; $('#mainView').hidden = !state.token;
  if (!state.token) return;
  renderDashboard();
  if (state.tab === 'checkin') await renderCheckin();
  if (state.tab === 'students') renderStudents();
  if (state.tab === 'history') renderHistory();
  if (state.tab === 'more') renderMore();
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
}
function renderDashboard() {
  const d=state.dashboard?.totals || {total:0,present:0,unchecked:0,absent:0};
  $('#dashboard').innerHTML=`<div class="stat present"><strong>${d.present}</strong><small>มาแล้ว</small></div><div class="stat unchecked"><strong>${d.unchecked}</strong><small>ยังไม่เช็ก</small></div><div class="stat"><strong>${d.absent}</strong><small>ขาด</small></div>`;
}
async function renderCheckin() {
  const box=$('#sessionPanel'), active=state.data.sessions.find(s=>s.id===state.selectedSessionId) || state.dashboard?.currentSession;
  if (!active) { box.innerHTML=`<div class="empty"><b>ยังไม่มีรอบเช็กชื่อ</b><p>เริ่มสร้างรอบเพื่อเช็กชื่อวันนี้หรือย้อนหลัง</p><button class="primary" id="newSession">+ สร้างรอบเช็กชื่อ</button></div>`; $('#newSession').onclick=showSessionModal; return; }
  if (!state.current || state.current.session.id !== active.id) state.current=await api('getSession',{sessionId:active.id});
  const session=state.current.session, students=filtered(state.current.students);
  box.innerHTML=`<div class="session-heading"><div><span class="pill">${session.status==='OPEN'?'กำลังเช็กชื่อ':'ปิดรอบแล้ว'}</span><h2>${esc(session.name)}</h2><p>${thaiDate(session.date)} · แตะเพื่อบันทึกทันที</p></div><button class="secondary" id="switchSession">เปลี่ยน</button></div><div class="toolbar"><input id="search" placeholder="ค้นหาชื่อ รหัส หรือห้อง" value="${esc(state.search)}"><button class="filter-button" id="roleFilter">หน้าที่</button></div><div class="student-list">${students.map(studentCard).join('') || '<p class="empty">ไม่พบรายชื่อ</p>'}</div>${session.status==='OPEN'?'<div class="row-actions"><button id="closeSession" class="secondary danger">จบรอบเช็กชื่อ</button></div>':''}`;
  $('#search').oninput=e=>{state.search=e.target.value;renderCheckin();}; $('#switchSession').onclick=showSessionList; $('#roleFilter').onclick=showRoleFilter;
  document.querySelectorAll('[data-mark]').forEach(b=>b.onclick=()=>mark(b.dataset.mark,b.dataset.student,b.dataset.next));
  const close=$('#closeSession'); if(close) close.onclick=confirmClose;
}
function filtered(students) { const q=state.search.trim().toLowerCase(); const role=state.roleFilter; return students.filter(s=>!q||[s.name,s.studentNo,s.room,s.number].join(' ').toLowerCase().includes(q)).filter(s=>!role||s.roles.includes(role)); }
function studentCard(s) { const status=s.attendance.status; const label=status==='PRESENT'?'มาแล้ว':status==='ABSENT'?'ขาด':'เช็กชื่อ'; const next=status==='PRESENT'?'UNCHECKED':'PRESENT'; return `<article class="student"><div class="avatar">${esc(s.name.slice(0,1))}</div><div class="student-main"><div class="student-name">${esc(s.name)}</div><div class="student-meta">${esc(s.studentNo)} · ${esc(s.room)} เลขที่ ${esc(s.number)}</div>${s.roles.length?`<div class="roles">${s.roles.map(r=>`<span class="role">${esc(r)}</span>`).join('')}</div>`:''}</div><button class="check-button ${status==='PRESENT'?'checked':status==='ABSENT'?'absent':''}" data-mark="1" data-student="${s.id}" data-next="${next}">${label}</button></article>`; }
async function mark(_, studentId, status) { try { await api('markAttendance',{sessionId:state.current.session.id,studentId,status}); const s=state.current.students.find(x=>x.id===studentId);s.attendance.status=status;s.attendance.checkedAt=status==='PRESENT'?new Date().toISOString():'';state.dashboard=await api('dashboard');renderCheckin();renderDashboard();toast(status==='PRESENT'?'บันทึกว่ามาแล้ว':'ยกเลิกการเช็กชื่อแล้ว'); } catch(e){toast(e.message);} }

function renderStudents() { const students=filtered(state.data.students); $('#sessionPanel').innerHTML=`<div class="session-heading"><div><h2>รายชื่อนักเรียน</h2><p>${state.data.students.length} คน · กดเพิ่มหรือแตะรายชื่อเพื่อแก้ไข</p></div><button class="secondary" id="addStudent">+ เพิ่ม</button></div><div class="toolbar"><input id="search" placeholder="ค้นหาชื่อ รหัส หรือห้อง" value="${esc(state.search)}"><button class="filter-button" id="roleFilter">หน้าที่</button></div><div class="student-list">${students.map(s=>`<article class="student" data-edit="${s.id}"><div class="avatar">${esc(s.name.slice(0,1))}</div><div class="student-main"><div class="student-name">${esc(s.name)}</div><div class="student-meta">${esc(s.studentNo)} · ${esc(s.room)} เลขที่ ${esc(s.number)}</div>${s.roles.length?`<div class="roles">${s.roles.map(r=>`<span class="role">${esc(r)}</span>`).join('')}</div>`:''}</div><button class="secondary">แก้ไข</button></article>`).join('')||'<p class="empty">ไม่พบรายชื่อ</p>'}</div>`;
  $('#addStudent').onclick=()=>showStudentModal();$('#search').oninput=e=>{state.search=e.target.value;renderStudents();};$('#roleFilter').onclick=showRoleFilter;document.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>showStudentModal(state.data.students.find(s=>s.id===x.dataset.edit)));
}
function renderHistory() { const sessions=state.data.sessions; $('#sessionPanel').innerHTML=`<h2 class="section-title">ประวัติรอบเช็กชื่อ</h2>${sessions.map(s=>`<div class="history-item"><b>${esc(s.name)}</b><small>${thaiDate(s.date)} · ${s.status==='OPEN'?'กำลังเปิด':'ปิดรอบแล้ว'}</small><div class="row-actions"><button class="secondary" data-open-session="${s.id}">ดูรายชื่อ</button></div></div>`).join('')||'<p class="empty">ยังไม่มีประวัติ</p>'}`;document.querySelectorAll('[data-open-session]').forEach(b=>b.onclick=async()=>{state.selectedSessionId=b.dataset.openSession;state.current=await api('getSession',{sessionId:b.dataset.openSession});state.tab='checkin';render();}); }
function renderMore() { const alerts=state.dashboard?.frequentAbsences||[]; $('#sessionPanel').innerHTML=`<h2 class="section-title">เพิ่มเติม</h2><div class="card form-stack"><button class="secondary" id="createSession">+ สร้างรอบเช็กชื่อใหม่</button><button class="secondary" id="export">⇩ ส่งออก Excel</button></div><h2 class="section-title" style="margin-top:20px">แจ้งเตือนขาดบ่อย</h2>${alerts.length?alerts.map(a=>`<div class="history-item"><b>${esc(a.name)}</b><small>ขาด ${a.absent} จาก ${a.total} รอบ (${Math.round(a.absent/a.total*100)}%)</small></div>`).join(''):'<p class="empty">ยังไม่มีผู้ที่ขาดเกิน 30%</p>'}`;$('#createSession').onclick=showSessionModal;$('#export').onclick=exportExcel; }

function modal(title, body) { $('#modalRoot').innerHTML=`<div class="modal-backdrop" id="backdrop"><section class="modal"><h2>${title}</h2>${body}</section></div>`; $('#backdrop').onclick=e=>{if(e.target.id==='backdrop')closeModal();}; }
function closeModal(){ $('#modalRoot').innerHTML=''; }
function showSessionModal(){ modal('สร้างรอบเช็กชื่อ',`<form id="sessionForm" class="form-stack"><label>วันที่<input name="date" type="date" value="${state.data.today}" required></label><label>ชื่อรอบเช็กชื่อ<input name="name" placeholder="เช่น เช็กก่อนกิจกรรม" required></label><button class="primary">สร้างรอบ <span>→</span></button></form>`);$('#sessionForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{state.current=await api('createSession',{date:f.get('date'),name:f.get('name')});state.selectedSessionId=state.current.session.id;closeModal();await load();toast('สร้างรอบเช็กชื่อแล้ว');}catch(x){toast(x.message);}};}
function showSessionList(){modal('เลือกรอบเช็กชื่อ',`<div class="student-list">${state.data.sessions.map(s=>`<button class="secondary" data-pick="${s.id}">${esc(s.name)} · ${thaiDate(s.date)}</button>`).join('')}</div><div class="row-actions"><button class="primary" id="newHere">+ สร้างรอบใหม่</button></div>`);document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=async()=>{state.selectedSessionId=b.dataset.pick;state.current=await api('getSession',{sessionId:b.dataset.pick});closeModal();render();});$('#newHere').onclick=showSessionModal;}
function showRoleFilter(){const roles=state.data.roles;modal('กรองตามหน้าที่',`<div class="role-picker">${['ทั้งหมด',...roles].map(r=>`<label><input type="radio" name="filterRole" value="${esc(r)}" ${(!state.roleFilter&&r==='ทั้งหมด')||state.roleFilter===r?'checked':''}><span>${esc(r)}</span></label>`).join('')}</div>`);document.querySelectorAll('[name=filterRole]').forEach(x=>x.onchange=()=>{state.roleFilter=x.value==='ทั้งหมด'?'':x.value;closeModal();render();});}
function showStudentModal(s={roles:[]}){const roles=state.data.roles;modal(s.id?'แก้ไขข้อมูลนักเรียน':'เพิ่มนักเรียน',`<form id="studentForm" class="form-stack"><label>เลขประจำตัวนักเรียน<input name="studentNo" value="${esc(s.studentNo||'')}" required></label><label>ชื่อ-นามสกุล<input name="name" value="${esc(s.name||'')}" required></label><div class="toolbar"><label>ห้อง<input name="room" value="${esc(s.room||'')}" required></label><label>เลขที่<input name="number" value="${esc(s.number||'')}" required></label></div><label>หน้าที่</label><div class="role-picker">${roles.map(r=>`<label><input type="checkbox" name="roles" value="${esc(r)}" ${s.roles.includes(r)?'checked':''}><span>${esc(r)}</span></label>`).join('')}</div><button class="primary">บันทึก <span>✓</span></button></form>`);$('#studentForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const data=await api('saveStudent',{studentId:s.id||'',studentNo:f.get('studentNo'),name:f.get('name'),room:f.get('room'),number:f.get('number'),roles:JSON.stringify(f.getAll('roles'))});state.data.students=data;closeModal();renderStudents();toast('บันทึกข้อมูลแล้ว');}catch(x){toast(x.message);}};}
function confirmClose(){modal('จบรอบเช็กชื่อ',`<p class="muted">ผู้ที่ยังไม่เช็กทั้งหมดจะถูกเปลี่ยนเป็น “ขาด” และรอบนี้จะไม่สามารถเช็กเพิ่มได้</p><div class="row-actions"><button class="secondary" id="cancel">ยกเลิก</button><button class="primary" id="confirm">ยืนยันจบรอบ</button></div>`);$('#cancel').onclick=closeModal;$('#confirm').onclick=async()=>{try{await api('closeSession',{sessionId:state.current.session.id});closeModal();state.current=null;await load();toast('ปิดรอบและสรุปผลแล้ว');}catch(e){toast(e.message);}};}
async function exportExcel(){try{const d=await api('exportData',{scope:'all'});if(!window.XLSX)throw new Error('กำลังโหลดเครื่องมือส่งออก โปรดลองอีกครั้ง');const students=d.students.map(s=>({'เลขประจำตัวนักเรียน':s.studentNo,'ชื่อ-นามสกุล':s.name,'ห้อง':s.room,'เลขที่':s.number,'หน้าที่':s.roles.join(', ')}));const sessions=d.sessions.map(s=>({'วันที่':s.date,'ชื่อรอบ':s.name,'สถานะ':s.status,'ปิดรอบเมื่อ':s.closedAt}));const studentMap=Object.fromEntries(d.students.map(s=>[s.id,s]));const attendance=d.attendance.map(a=>({'รหัสรอบ':a.session_id,'เลขประจำตัวนักเรียน':studentMap[a.student_id]?.studentNo||'','ชื่อ-นามสกุล':studentMap[a.student_id]?.name||'','สถานะ':a['สถานะ'],'เวลาบันทึก':a.checked_at}));const wb=XLSX.utils.book_new();[['รายชื่อนักเรียน',students],['รอบเช็กชื่อ',sessions],['ผลเช็กชื่อ',attendance]].forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),name));XLSX.writeFile(wb,`SKB-Orange-${new Date().toISOString().slice(0,10)}.xlsx`);toast('กำลังดาวน์โหลดไฟล์ Excel');}catch(e){toast(e.message);}}
function logout(){state.token='';localStorage.removeItem('skb_token');state.data=null;state.current=null;render();}

$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const result=await api('login',{username:f.get('username'),password:f.get('password')});state.token=result.token;localStorage.setItem('skb_token',state.token);await load();}catch(x){toast(x.message);}};
$('#logoutButton').onclick=logout;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.search='';render();});
if(state.token) load();
