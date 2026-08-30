const app = document.querySelector('#app');
const config = window.GAME_NOTE_CONFIG || {};
const configured = config.supabaseUrl?.startsWith('https://') && config.supabasePublishableKey && !config.supabasePublishableKey.includes('請貼上');
const sdkAvailable = Boolean(window.supabase?.createClient);
const db = configured && sdkAvailable ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey) : null;
const state = { user: null, view: 'login', currentGameId: null, tab: 'notes', search: '', games: [], loading: true };
let startupError = '';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const message = text => { document.querySelector('.notice')?.remove(); document.body.insertAdjacentHTML('beforeend', `<div class="notice">${escapeHtml(text)}</div>`); setTimeout(() => document.querySelector('.notice')?.remove(), 3500); };

async function start() {
  render();
  if (!configured) { startupError = '尚未設定 Supabase，請檢查 config.js。'; state.loading = false; return renderLogin(); }
  if (!sdkAvailable) { startupError = 'Supabase 程式庫載入失敗，請確認網路連線後重新整理。'; state.loading = false; return renderLogin(); }
  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    state.user = data.session?.user || null;
    if (state.user) { state.view = 'library'; await loadGames(); }
    db.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; });
  } catch (error) {
    startupError = `Supabase 連線失敗：${error.message || '請檢查專案設定'}`;
  } finally {
    state.loading = false; render();
  }
}
function render() { if (state.loading) return app.innerHTML = '<div class="loading">載入中…</div>'; state.view === 'login' ? renderLogin() : state.view === 'library' ? renderLibrary() : renderDetail(); }

function renderLogin() {
  app.innerHTML = `<section class="login-page"><form class="login-card" id="loginForm"><h1 class="brand">GAME NOTE</h1><p class="tagline">收藏每一段遊戲旅程</p>${startupError ? `<p class="setup-warning">${escapeHtml(startupError)}</p>` : ''}<div class="field"><label for="email">電子信箱</label><input id="email" type="email" placeholder="name@gmail.com" required></div><div class="field"><label for="password">密碼</label><input id="password" type="password" placeholder="至少 6 個字元" required minlength="6"></div><button class="primary" type="submit" ${db ? '' : 'disabled'}>登入</button><button class="text-button" id="signup" type="button" ${db ? '' : 'disabled'}>第一次使用？建立帳號</button></form></section>`;
  document.querySelector('#loginForm').onsubmit = login;
  document.querySelector('#signup').onclick = signup;
}
function credentials() { return { email: document.querySelector('#email')?.value.trim(), password: document.querySelector('#password')?.value || '' }; }
function setFormBusy(busy) { document.querySelectorAll('#loginForm button').forEach(x => x.disabled = busy); }
async function login(e) {
  e.preventDefault(); setFormBusy(true);
  const { error } = await db.auth.signInWithPassword(credentials());
  if (error) { setFormBusy(false); return message(`登入失敗：${error.message}`); }
  state.user = (await db.auth.getUser()).data.user; state.view = 'library'; await loadGames(); render();
}
async function signup() {
  const values = credentials();
  if (!values.email || values.password.length < 6) return message('請輸入有效信箱與至少 6 個字元的密碼。');
  setFormBusy(true); const { data, error } = await db.auth.signUp(values); setFormBusy(false);
  if (error) return message(`註冊失敗：${error.message}`);
  message(data.session ? '帳號建立完成！' : '帳號已建立，請到信箱完成驗證後登入。');
}

async function loadGames() {
  const { data, error } = await db.from('games').select('*, entries(*)').order('created_at', { ascending: false });
  if (error) { message(`讀取失敗：${error.message}`); state.games = []; return; }
  state.games = (data || []).map(g => ({ ...g, notes: g.entries.filter(x => x.kind === 'note'), memories: g.entries.filter(x => x.kind === 'memory') }));
}
function renderLibrary() {
  const games = state.games.filter(g => g.name.toLowerCase().includes(state.search.toLowerCase()));
  const noteCount = state.games.reduce((n, g) => n + g.notes.length, 0), memoryCount = state.games.reduce((n, g) => n + g.memories.length, 0);
  app.innerHTML = `<section class="shell"><aside class="sidebar"><img class="side-logo" src="page_example/usepng/logo.png" alt="Game Note logo"><div class="side-title">遊戲旅程筆記</div><nav class="side-links"><button type="button">⚙ 設定</button><button id="logout" type="button">↪ 登出</button></nav></aside><section class="content-panel"><header class="topbar"><h1>GAME NOTE</h1><input class="search" id="search" value="${escapeHtml(state.search)}" placeholder="搜尋遊戲"><span>${escapeHtml(state.user?.email || '')}</span></header><div class="section-head"><h2>我的遊戲庫</h2><button class="primary" id="addGame">＋ 新增遊戲</button></div><div class="game-grid">${games.length ? games.map(gameCard).join('') : '<div class="empty">尚未建立遊戲，點選「新增遊戲」開始收藏吧！</div>'}</div></section><aside class="stats"><div class="stat">筆記數量<strong>${noteCount}</strong></div><div class="stat">紀念時刻<strong>${memoryCount}</strong></div><div class="stat">收藏遊戲<strong>${state.games.length}</strong></div></aside></section>`;
  document.querySelector('#logout').onclick = async () => { await db.auth.signOut(); state.view = 'login'; state.user = null; state.games = []; render(); };
  document.querySelector('#addGame').onclick = openGameModal;
  document.querySelector('#search').oninput = e => { state.search = e.target.value; renderLibrary(); document.querySelector('#search').focus(); };
  document.querySelectorAll('[data-game]').forEach(el => el.onclick = () => { state.currentGameId = el.dataset.game; state.view = 'detail'; render(); });
}
function gameCard(g) { const cover = g.cover_url ? `<img src="${escapeHtml(g.cover_url)}" alt="${escapeHtml(g.name)}">` : escapeHtml(g.name.slice(0, 1).toUpperCase()); return `<button class="game-card" data-game="${g.id}"><span class="game-cover">${cover}</span><span class="game-name">${escapeHtml(g.name)}</span></button>`; }

function renderDetail() {
  const game = state.games.find(g => g.id === state.currentGameId); if (!game) { state.view = 'library'; return render(); }
  const list = state.tab === 'notes' ? game.notes : game.memories, label = state.tab === 'notes' ? '筆記' : '紀念';
  app.innerHTML = `<section class="detail-page"><header class="detail-header"><button class="back" id="back">← 回到首頁</button><h1 class="detail-title">GAME NOTE</h1><span class="detail-game">${escapeHtml(game.name)}</span></header><nav class="tabs"><button class="tab ${state.tab === 'notes' ? 'active' : ''}" data-tab="notes">筆記</button><button class="tab ${state.tab === 'memories' ? 'active' : ''}" data-tab="memories">紀念</button></nav><div class="section-head"><h2>${label}收藏</h2><button class="primary" id="addEntry">＋ 新增${label}</button></div><div class="entries">${list.length ? list.map(entryCard).join('') : `<div class="empty">目前還沒有${label}</div>`}</div></section>`;
  document.querySelector('#back').onclick = () => { state.view = 'library'; render(); };
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { state.tab = el.dataset.tab; render(); });
  document.querySelector('#addEntry').onclick = () => openEntryModal(game);
  document.querySelectorAll('[data-delete]').forEach(el => el.onclick = () => deleteEntry(el.dataset.delete));
}
function entryCard(item) { return `<article class="entry"><button class="delete" data-delete="${item.id}" aria-label="刪除">✕</button><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p>${item.link_url ? `<a href="${escapeHtml(item.link_url)}" target="_blank" rel="noreferrer">開啟連結</a>` : ''}</article>`; }
async function deleteEntry(id) { const { error } = await db.from('entries').delete().eq('id', id); if (error) return message(`刪除失敗：${error.message}`); await loadGames(); render(); }

function openGameModal() {
  showModal(`<h2>新增遊戲</h2><form id="gameForm"><div class="field"><label for="gameName">遊戲名</label><input id="gameName" required placeholder="輸入遊戲名稱"></div><div class="field"><label for="gameCover">上傳 Logo／封面</label><input id="gameCover" type="file" accept="image/*"></div><img id="coverPreview" class="preview hidden" alt="封面預覽"><div class="actions"><button class="secondary" data-close type="button">取消</button><button class="primary" type="submit">完成</button></div></form>`);
  const input = document.querySelector('#gameCover'); input.onchange = () => readImage(input.files[0], src => { const p = document.querySelector('#coverPreview'); p.src = src; p.classList.remove('hidden'); });
  document.querySelector('#gameForm').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true; let coverUrl = null;
    if (input.files[0]) { try { coverUrl = await uploadCover(input.files[0]); } catch (error) { e.submitter.disabled = false; return message(`圖片上傳失敗：${error.message}`); } }
    const { error } = await db.from('games').insert({ user_id: state.user.id, name: document.querySelector('#gameName').value.trim(), cover_url: coverUrl });
    if (error) { e.submitter.disabled = false; return message(`新增失敗：${error.message}`); }
    closeModal(); await loadGames(); renderLibrary();
  };
}
async function uploadCover(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('圖片不可超過 5MB');
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, ''), path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from('game-covers').upload(path, file, { cacheControl: '3600' }); if (error) throw error;
  return db.storage.from('game-covers').getPublicUrl(path).data.publicUrl;
}
function openEntryModal(game) {
  const isNote = state.tab === 'notes';
  showModal(`<h2>新增${isNote ? '筆記' : '紀念'}</h2><form id="entryForm"><div class="type-tabs">${(isNote ? ['文字','圖片','影片'] : ['圖片','影片','連結']).map((x,i) => `<button type="button" class="${i===0?'active':''}" data-type="${x}">${x}</button>`).join('')}</div><div class="field"><label for="entryTitle">${isNote ? '筆記標題' : '紀念文字'}</label><input id="entryTitle" required></div><div class="field"><label for="entryContent">${isNote ? '筆記內容' : '介紹文字'}</label><textarea id="entryContent" rows="6" required></textarea></div>${isNote ? '' : '<div class="field"><label for="entryLink">連結（選填）</label><input id="entryLink" type="url" placeholder="https://"></div>'}<div class="actions"><button class="secondary" data-close type="button">取消</button><button class="primary" type="submit">完成</button></div></form>`);
  let entryType = isNote ? '文字' : '圖片'; document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { entryType = el.dataset.type; document.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active')); el.classList.add('active'); });
  document.querySelector('#entryForm').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    const row = { game_id: game.id, user_id: state.user.id, kind: isNote ? 'note' : 'memory', entry_type: entryType, title: document.querySelector('#entryTitle').value.trim(), content: document.querySelector('#entryContent').value.trim(), link_url: document.querySelector('#entryLink')?.value.trim() || null };
    const { error } = await db.from('entries').insert(row); if (error) { e.submitter.disabled = false; return message(`新增失敗：${error.message}`); }
    closeModal(); await loadGames(); render();
  };
}
function showModal(content) { document.body.insertAdjacentHTML('beforeend', `<div class="modal-wrap" id="modal"><div class="modal">${content}</div></div>`); document.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal); document.querySelector('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); }; }
function closeModal() { document.querySelector('#modal')?.remove(); }
function readImage(file, done) { if (!file) return; const reader = new FileReader(); reader.onload = () => done(reader.result); reader.readAsDataURL(file); }
start();
