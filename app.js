/* SKB Orange เช็กอิน — หน้าเว็บ static สำหรับ GitHub Pages */
const $ = selector => document.querySelector(selector);
const state = {
  token: localStorage.getItem('skb_token') || '', data: null, dashboard: null,
  current: null, selectedSessionId: '', tab: 'checkin', search: '', roleFilter: '',
  level: '', grade: '', room: '', queue: new Map(), syncing: false
};
const ACTIVITY_TYPES = ['เช็กก่อนกิจกรรม', 'เช็กหลังเลิกกิจกรรม', 'ซ้อมเชียร์', 'ซ้อมขบวนพาเหรด', 'ประชุม/เตรียมงาน', 'กิจกรรมพิเศษ'];
const apiUrl = () => window.SKB_CONFIG?.API_URL || '';

function api(action, params = {}) {
  if (!apiUrl() || apiUrl().includes('PASTE_')) return Promise.reject(new Error('ยังไม่ได้ใส่ URL ของ GAS ใน config.js'));
  return new Promise((resolve, reject) => {
    const callback = `skbCallback_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const query = new URLSearchParams({ action, token: state.token, callback, ...params });
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('เชื่อมต่อระบบไม่สำเร็จ')), 18000);
    function finish(error, result) {
      clearTimeout(timer); delete window[callback]; script.remove();
      if (error) reject(error); else if (result?.ok) resolve(result.data); else reject(new Error(result?.error || 'เกิดข้อผิดพลาด'));
    }
    window[callback] = result => finish(null, result);
    script.onerror = () => finish(new Error('ไม่สามารถเชื่อมต่อ GAS ได้'));
    script.src = `${apiUrl()}?${query.toString()}`;
    document.head.appendChild(script);
  });
}
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function thaiDate(date) { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }

async function load() {
  try {
    state.data = await api('bootstrap');
    state.dashboard = await api('dashboard');
    if (state.selectedSessionId && !state.data.sessions.some(s => s.id === state.selectedSessionId)) state.selectedSessionId = '';
    await render();
  } catch (error) {
    if (/เซสชัน/.test(error.message)) logout(); else toast(error.message);
  }
}
async function render() {
  $('#loginView').hidden = !!state.token;
  $('#mainView').hidden = !state.token;
  if (!state.token || !state.data) return;
  renderDashboard();
  if (state.tab === 'checkin') await renderCheckin();
  if (state.tab === 'students') renderStudents();
  if (state.tab === 'history') renderHistory();
  if (state.tab === 'more') renderMore();
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === state.tab));
}

function selectedSession() { return state.data.sessions.find(s => s.id === state.selectedSessionId) || state.dashboard?.currentSession; }
function summary(students) {
  const statuses = students.map(s => s.attendance?.status);
  return { total: statuses.length, present: statuses.filter(x => x === 'PRESENT').length, unchecked: statuses.filter(x => x === 'UNCHECKED').length, absent: statuses.filter(x => x === 'ABSENT').length };
}
function renderDashboard() {
  const totals = state.current ? summary(state.current.students) : (state.dashboard?.totals || { total: 0, present: 0, unchecked: 0, absent: 0 });
  $('#dashboard').innerHTML = `<div class="stat present"><strong>${totals.present}</strong><small>มาแล้ว</small></div><div class="stat unchecked"><strong>${totals.unchecked}</strong><small>ยังไม่เช็ก</small></div><div class="stat"><strong>${totals.absent}</strong><small>ขาด</small></div>`;
}

async function renderCheckin() {
  const box = $('#sessionPanel');
  const active = selectedSession();
  if (!active) {
    box.innerHTML = `<div class="empty"><b>ยังไม่มีรอบเช็กชื่อ</b><p>สร้างรอบ แล้วเลือกระดับชั้นและห้องที่รับผิดชอบ</p><button class="primary" id="newSession">+ สร้างรอบเช็กชื่อ</button></div>`;
    $('#newSession').onclick = showCreateSessionModal;
    return;
  }
  if (!state.current || state.current.session.id !== active.id) {
    state.current = await api('getSession', { sessionId: active.id });
    renderDashboard();
  }
  const { session, students } = state.current;
  const visible = filterCheckinStudents(students);
  const sync = state.queue.size ? `<span class="sync-text">กำลังบันทึก ${state.queue.size} รายการ</span>` : '<span class="sync-text saved">บันทึกแล้ว</span>';
  box.innerHTML = `<div class="session-heading"><div><span class="pill">${session.status === 'OPEN' ? 'กำลังเช็กชื่อ' : 'ปิดรอบแล้ว'}</span><h2>${esc(session.name)}</h2><p>${thaiDate(session.date)} · ${sync}</p></div><button class="secondary" id="switchSession">เปลี่ยนรอบ</button></div>${roomPicker(students)}<div id="checkinArea">${state.room ? `<div class="toolbar"><input id="search" placeholder="ค้นหาชื่อหรือรหัสในห้องนี้" value="${esc(state.search)}"><button class="filter-button" id="roleFilter">หน้าที่</button></div><div class="student-list">${visible.map(studentCard).join('') || '<p class="empty">ไม่พบรายชื่อในห้องนี้</p>'}</div>` : '<p class="empty">เลือกห้องที่รับผิดชอบก่อนเริ่มเช็กชื่อ</p>'}</div>${session.status === 'OPEN' ? '<div class="row-actions"><button id="closeSession" class="secondary danger">จบรอบเช็กชื่อ</button></div>' : ''}`;
  bindRoomPicker(students);
  $('#switchSession').onclick = showSessionList;
  if (state.room) {
    $('#search').oninput = event => { state.search = event.target.value; renderCheckin(); };
    $('#roleFilter').onclick = showRoleFilter;
    document.querySelectorAll('[data-mark]').forEach(button => button.onclick = () => markLocally(button.dataset.student, button.dataset.next));
  }
  const close = $('#closeSession'); if (close) close.onclick = confirmClose;
}

function gradeOf(room) { const match = String(room).match(/ม\.\s*(\d+)/); return match ? `ม.${match[1]}` : 'อื่น ๆ'; }
function levelOf(room) { const grade = Number((String(room).match(/ม\.\s*(\d+)/) || [])[1]); return grade && grade <= 3 ? 'มัธยมต้น' : grade ? 'มัธยมปลาย' : 'อื่น ๆ'; }
function roomsOf(students) { return [...new Set(students.map(s => String(s.room)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true })); }
function option(value, label, selected, disabled = false) { return `<option value="${esc(value)}" ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(label)}</option>`; }
function roomPicker(students) {
  const levels = [...new Set(students.map(s => levelOf(s.room)))];
  const grades = [...new Set(students.filter(s => !state.level || levelOf(s.room) === state.level).map(s => gradeOf(s.room)))].sort();
  const rooms = roomsOf(students.filter(s => (!state.level || levelOf(s.room) === state.level) && (!state.grade || gradeOf(s.room) === state.grade)));
  return `<section class="room-picker"><b>เลือกห้องที่รับผิดชอบ</b><div class="choice-grid"><label>ช่วงชั้น<select id="levelSelect">${option('', 'ทุกช่วงชั้น', !state.level)}${levels.map(x => option(x, x, state.level === x)).join('')}</select></label><label>ระดับชั้น<select id="gradeSelect">${option('', 'เลือกระดับชั้น', !state.grade)}${grades.map(x => option(x, x, state.grade === x)).join('')}</select></label><label>ห้อง<select id="roomSelect">${option('', 'เลือกห้อง', !state.room, true)}${rooms.map(x => option(x, x, state.room === x)).join('')}</select></label></div></section>`;
}
function bindRoomPicker(students) {
  $('#levelSelect').onchange = event => { state.level = event.target.value; state.grade = ''; state.room = ''; state.search = ''; renderCheckin(); };
  $('#gradeSelect').onchange = event => { state.grade = event.target.value; state.room = ''; state.search = ''; renderCheckin(); };
  $('#roomSelect').onchange = event => { state.room = event.target.value; state.search = ''; renderCheckin(); };
}
function filterCheckinStudents(students) {
  const query = state.search.trim().toLowerCase();
  return students.filter(s => s.room === state.room).filter(s => !state.roleFilter || s.roles.includes(state.roleFilter)).filter(s => !query || [s.name, s.studentNo, s.number].join(' ').toLowerCase().includes(query));
}
function studentCard(student) {
  const status = student.attendance.status;
  const label = status === 'PRESENT' ? 'มาแล้ว' : status === 'ABSENT' ? 'ขาด' : 'เช็กชื่อ';
  const next = status === 'PRESENT' ? 'UNCHECKED' : 'PRESENT';
  return `<article class="student"><div class="avatar">${esc(student.name.slice(0, 1))}</div><div class="student-main"><div class="student-name">${esc(student.name)}</div><div class="student-meta">${esc(student.studentNo)} · ${esc(student.room)} เลขที่ ${esc(student.number)}</div>${student.roles.length ? `<div class="roles">${student.roles.map(role => `<span class="role">${esc(role)}</span>`).join('')}</div>` : ''}</div><button class="check-button ${status === 'PRESENT' ? 'checked' : status === 'ABSENT' ? 'absent' : ''}" data-mark="1" data-student="${student.id}" data-next="${next}" ${status === 'ABSENT' ? 'disabled' : ''}>${label}</button></article>`;
}

/* แตะแล้วเปลี่ยนผลบนหน้าจอทันที จากนั้นส่งเข้าคิวไป GAS เบื้องหลัง */
function markLocally(studentId, status) {
  const student = state.current.students.find(s => s.id === studentId);
  if (!student || state.current.session.status !== 'OPEN') return;
  student.attendance.status = status;
  student.attendance.checkedAt = status === 'PRESENT' ? new Date().toISOString() : '';
  state.queue.set(`${state.current.session.id}:${studentId}`, { sessionId: state.current.session.id, studentId, status });
  renderDashboard(); renderCheckin(); flushQueue();
}
async function flushQueue() {
  if (state.syncing) return true;
  state.syncing = true;
  let success = true;
  try {
    while (state.queue.size) {
      const [key, item] = state.queue.entries().next().value;
      state.queue.delete(key);
      try { await api('markAttendance', item); }
      catch (error) { state.queue.set(key, item); toast(`บันทึกไม่สำเร็จ: ${error.message}`); success = false; break; }
      if (state.tab === 'checkin') renderCheckin();
    }
  } finally { state.syncing = false; }
  return success;
}

function renderStudents() {
  const query = state.search.trim().toLowerCase();
  const students = state.data.students.filter(s => !query || [s.name, s.studentNo, s.room, s.number].join(' ').toLowerCase().includes(query)).filter(s => !state.roleFilter || s.roles.includes(state.roleFilter));
  $('#sessionPanel').innerHTML = `<div class="session-heading"><div><h2>รายชื่อนักเรียน</h2><p>${state.data.students.length} คน · จัดการข้อมูลและหน้าที่ได้ที่นี่</p></div><button class="secondary" id="addStudent">+ เพิ่ม</button></div><div class="toolbar"><input id="search" placeholder="ค้นหาชื่อ รหัส หรือห้อง" value="${esc(state.search)}"><button class="filter-button" id="roleFilter">หน้าที่</button></div><div class="student-list">${students.map(s => `<article class="student" data-edit="${s.id}"><div class="avatar">${esc(s.name.slice(0, 1))}</div><div class="student-main"><div class="student-name">${esc(s.name)}</div><div class="student-meta">${esc(s.studentNo)} · ${esc(s.room)} เลขที่ ${esc(s.number)}</div>${s.roles.length ? `<div class="roles">${s.roles.map(r => `<span class="role">${esc(r)}</span>`).join('')}</div>` : ''}</div><button class="secondary">แก้ไข</button></article>`).join('') || '<p class="empty">ไม่พบรายชื่อ</p>'}</div>`;
  $('#addStudent').onclick = () => showStudentModal();
  $('#search').oninput = event => { state.search = event.target.value; renderStudents(); };
  $('#roleFilter').onclick = showRoleFilter;
  document.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => showStudentModal(state.data.students.find(s => s.id === el.dataset.edit)));
}

function renderHistory() {
  const sessions = state.data.sessions;
  $('#sessionPanel').innerHTML = `<h2 class="section-title">ประวัติรอบเช็กชื่อ</h2>${sessions.map(s => `<div class="history-item"><b>${esc(s.name)}</b><small>${thaiDate(s.date)} · ${s.status === 'OPEN' ? 'กำลังเปิด' : 'ปิดรอบแล้ว'}</small><div class="row-actions"><button class="secondary" data-open="${s.id}">ดูผล</button><button class="secondary" data-edit-session="${s.id}">แก้ไข</button><button class="secondary danger" data-delete-session="${s.id}">ลบ</button></div></div>`).join('') || '<p class="empty">ยังไม่มีประวัติ</p>'}`;
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = async () => { state.selectedSessionId = button.dataset.open; state.current = await api('getSession', { sessionId: button.dataset.open }); state.tab = 'checkin'; render(); });
  document.querySelectorAll('[data-edit-session]').forEach(button => button.onclick = () => showEditSessionModal(sessions.find(s => s.id === button.dataset.editSession)));
  document.querySelectorAll('[data-delete-session]').forEach(button => button.onclick = () => confirmDeleteSession(button.dataset.deleteSession));
}
function renderMore() {
  const alerts = state.dashboard?.frequentAbsences || [];
  $('#sessionPanel').innerHTML = `<h2 class="section-title">เพิ่มเติม</h2><div class="card form-stack"><button class="secondary" id="createSession">+ สร้างรอบเช็กชื่อใหม่</button><button class="secondary" id="export">⇩ ส่งออก Excel</button></div><h2 class="section-title" style="margin-top:20px">แจ้งเตือนขาดบ่อย</h2>${alerts.length ? alerts.map(a => `<div class="history-item"><b>${esc(a.name)}</b><small>ขาด ${a.absent} จาก ${a.total} รอบ (${Math.round(a.absent / a.total * 100)}%)</small></div>`).join('') : '<p class="empty">ยังไม่มีผู้ที่ขาดเกิน 30%</p>'}`;
  $('#createSession').onclick = showCreateSessionModal; $('#export').onclick = exportExcel;
}

function modal(title, body) { $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="backdrop"><section class="modal"><h2>${title}</h2>${body}</section></div>`; $('#backdrop').onclick = event => { if (event.target.id === 'backdrop') closeModal(); }; }
function closeModal() { $('#modalRoot').innerHTML = ''; }
function sessionName(type, detail) { return detail.trim() ? `${type} — ${detail.trim()}` : type; }
function showCreateSessionModal() {
  modal('สร้างรอบเช็กชื่อ', `<form id="sessionForm" class="form-stack"><p class="form-hint">เลือกประเภทก่อน แล้วเพิ่มรายละเอียดเมื่อจำเป็น เช่น “ม.4/1” หรือ “คาบเช้า”</p><label>วันที่<input name="date" type="date" value="${state.data.today}" required></label><label>ประเภทการเช็กชื่อ<select name="type">${ACTIVITY_TYPES.map(x => option(x, x, x === ACTIVITY_TYPES[0])).join('')}</select></label><label>รายละเอียดเพิ่มเติม (ถ้ามี)<input name="detail" placeholder="เช่น ม.4/1 · คาบเช้า"></label><p class="name-preview">ชื่อรอบ: <b id="namePreview">${ACTIVITY_TYPES[0]}</b></p><button class="primary">สร้างรอบ <span>→</span></button></form>`);
  const form = $('#sessionForm'); const update = () => $('#namePreview').textContent = sessionName(form.type.value, form.detail.value); form.type.onchange = update; form.detail.oninput = update;
  form.onsubmit = async event => { event.preventDefault(); const f = new FormData(form); try { state.current = await api('createSession', { date: f.get('date'), name: sessionName(f.get('type'), f.get('detail')) }); state.selectedSessionId = state.current.session.id; closeModal(); await load(); toast('สร้างรอบเช็กชื่อแล้ว'); } catch (error) { toast(error.message); } };
}
function showEditSessionModal(session) {
  modal('แก้ไขรอบเช็กชื่อ', `<form id="editSessionForm" class="form-stack"><label>วันที่<input name="date" type="date" value="${esc(session.date)}" required></label><label>ชื่อรอบเช็กชื่อ<input name="name" value="${esc(session.name)}" required></label><p class="form-hint">การแก้ไขชื่อหรือวันที่จะไม่กระทบผลเช็กชื่อเดิม</p><button class="primary">บันทึกการแก้ไข <span>✓</span></button></form>`);
  $('#editSessionForm').onsubmit = async event => { event.preventDefault(); const f = new FormData(event.target); try { await api('updateSession', { sessionId: session.id, date: f.get('date'), name: f.get('name') }); closeModal(); state.current = null; await load(); toast('แก้ไขรอบแล้ว'); } catch (error) { toast(error.message); } };
}
function showSessionList() {
  modal('เลือกรอบเช็กชื่อ', `<div class="student-list">${state.data.sessions.map(s => `<button class="secondary" data-pick="${s.id}">${esc(s.name)} · ${thaiDate(s.date)}</button>`).join('')}</div><div class="row-actions"><button class="primary" id="newHere">+ สร้างรอบใหม่</button></div>`);
  document.querySelectorAll('[data-pick]').forEach(button => button.onclick = async () => { state.selectedSessionId = button.dataset.pick; state.current = await api('getSession', { sessionId: button.dataset.pick }); closeModal(); render(); });
  $('#newHere').onclick = showCreateSessionModal;
}
function showRoleFilter() {
  modal('กรองตามหน้าที่', `<div class="role-picker">${['ทั้งหมด', ...state.data.roles].map(role => `<label><input type="radio" name="filterRole" value="${esc(role)}" ${(!state.roleFilter && role === 'ทั้งหมด') || state.roleFilter === role ? 'checked' : ''}><span>${esc(role)}</span></label>`).join('')}</div>`);
  document.querySelectorAll('[name=filterRole]').forEach(input => input.onchange = () => { state.roleFilter = input.value === 'ทั้งหมด' ? '' : input.value; closeModal(); render(); });
}
function showStudentModal(student = { roles: [] }) {
  modal(student.id ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มนักเรียน', `<form id="studentForm" class="form-stack"><label>เลขประจำตัวนักเรียน<input name="studentNo" value="${esc(student.studentNo || '')}" required></label><label>ชื่อ-นามสกุล<input name="name" value="${esc(student.name || '')}" required></label><div class="toolbar"><label>ห้อง<input name="room" value="${esc(student.room || '')}" required></label><label>เลขที่<input name="number" value="${esc(student.number || '')}" required></label></div><label>หน้าที่</label><div class="role-picker">${state.data.roles.map(role => `<label><input type="checkbox" name="roles" value="${esc(role)}" ${student.roles.includes(role) ? 'checked' : ''}><span>${esc(role)}</span></label>`).join('')}</div><button class="primary">บันทึก <span>✓</span></button></form>`);
  $('#studentForm').onsubmit = async event => { event.preventDefault(); const f = new FormData(event.target); try { state.data.students = await api('saveStudent', { studentId: student.id || '', studentNo: f.get('studentNo'), name: f.get('name'), room: f.get('room'), number: f.get('number'), roles: JSON.stringify(f.getAll('roles')) }); closeModal(); renderStudents(); toast('บันทึกข้อมูลแล้ว'); } catch (error) { toast(error.message); } };
}
function confirmClose() {
  modal('จบรอบเช็กชื่อ', `<p class="muted">ผู้ที่ยังไม่เช็กทั้งหมดจะถูกเปลี่ยนเป็น “ขาด” และรอบนี้จะไม่สามารถเช็กเพิ่มได้</p><div class="row-actions"><button class="secondary" id="cancel">ยกเลิก</button><button class="primary" id="confirm">ยืนยันจบรอบ</button></div>`);
  $('#cancel').onclick = closeModal; $('#confirm').onclick = async () => { if (!await flushQueue()) return; try { await api('closeSession', { sessionId: state.current.session.id }); closeModal(); state.current = null; await load(); toast('ปิดรอบและสรุปผลแล้ว'); } catch (error) { toast(error.message); } };
}
function confirmDeleteSession(id) {
  const session = state.data.sessions.find(s => s.id === id);
  modal('ลบรอบเช็กชื่อ', `<p class="muted">จะลบ “${esc(session.name)}” รวมถึงผลเช็กชื่อของนักเรียนทุกรายในรอบนี้ การกระทำนี้ย้อนกลับไม่ได้</p><div class="row-actions"><button class="secondary" id="cancel">ยกเลิก</button><button class="primary" id="confirm">ยืนยันการลบ</button></div>`);
  $('#cancel').onclick = closeModal; $('#confirm').onclick = async () => { try { await api('deleteSession', { sessionId: id }); if (state.selectedSessionId === id) { state.selectedSessionId = ''; state.current = null; } closeModal(); await load(); toast('ลบรอบและผลเช็กชื่อแล้ว'); } catch (error) { toast(error.message); } };
}
async function exportExcel() {
  try {
    if (!await flushQueue()) return;
    const data = await api('exportData', { scope: 'all' }); if (!window.XLSX) throw new Error('กำลังโหลดเครื่องมือส่งออก โปรดลองอีกครั้ง');
    const studentMap = Object.fromEntries(data.students.map(s => [s.id, s]));
    const sheets = [['รายชื่อนักเรียน', data.students.map(s => ({ 'เลขประจำตัวนักเรียน': s.studentNo, 'ชื่อ-นามสกุล': s.name, 'ห้อง': s.room, 'เลขที่': s.number, 'หน้าที่': s.roles.join(', ') }))], ['รอบเช็กชื่อ', data.sessions.map(s => ({ 'วันที่': s.date, 'ชื่อรอบ': s.name, 'สถานะ': s.status, 'ปิดรอบเมื่อ': s.closedAt }))], ['ผลเช็กชื่อ', data.attendance.map(a => ({ 'รหัสรอบ': a.session_id, 'เลขประจำตัวนักเรียน': studentMap[a.student_id]?.studentNo || '', 'ชื่อ-นามสกุล': studentMap[a.student_id]?.name || '', 'สถานะ': a['สถานะ'], 'เวลาบันทึก': a.checked_at }))]];
    const workbook = XLSX.utils.book_new(); sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name)); XLSX.writeFile(workbook, `SKB-Orange-${new Date().toISOString().slice(0, 10)}.xlsx`); toast('กำลังดาวน์โหลดไฟล์ Excel');
  } catch (error) { toast(error.message); }
}
function logout() { state.token = ''; localStorage.removeItem('skb_token'); state.data = null; state.current = null; state.selectedSessionId = ''; state.queue.clear(); render(); }

$('#loginForm').onsubmit = async event => { event.preventDefault(); const f = new FormData(event.target); try { const result = await api('login', { username: f.get('username'), password: f.get('password') }); state.token = result.token; localStorage.setItem('skb_token', state.token); $('#loginView').hidden = true; $('#mainView').hidden = false; $('#sessionPanel').innerHTML = '<div class="empty"><b>กำลังเตรียมข้อมูล</b><p>กรุณารอสักครู่</p></div>'; await load(); } catch (error) { toast(error.message); } };
$('#logoutButton').onclick = logout;
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { state.tab = button.dataset.tab; state.search = ''; state.roleFilter = ''; render(); });
if (state.token) load();
