const app = document.querySelector('#app');
const config = window.GAME_NOTE_CONFIG || {};
const configured = config.supabaseUrl?.startsWith('https://') && config.supabasePublishableKey && !config.supabasePublishableKey.includes('請貼上');
const sdkAvailable = Boolean(window.supabase?.createClient);
let authQueue = Promise.resolve();
const localAuthLock = async (_name, _timeout, operation) => {
  const previous = authQueue;
  let release;
  authQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await operation(); }
  finally { release(); }
};
const db = configured && sdkAvailable ? window.supabase.createClient(
  config.supabaseUrl,
  config.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: localAuthLock
    }
  }
) : null;
const state = { user: null, view: 'login', currentGameId: null, tab: 'notes', search: '', games: [], loading: true };
let startupError = '';
let loginEmail = '';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const message = text => { document.querySelector('.notice')?.remove(); document.body.insertAdjacentHTML('beforeend', `<div class="notice">${escapeHtml(text)}</div>`); setTimeout(() => document.querySelector('.notice')?.remove(), 3500); };
const withTimeout = (promise, seconds = 12) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('連線逾時，請確認 Supabase 專案目前為 Active 狀態。')), seconds * 1000))
]);

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
function render() {
  if (state.loading) return app.innerHTML = '<div class="loading">載入中…</div>';
  if (state.view === 'login') return renderLogin();
  if (state.view === 'register') return renderRegister();
  state.view === 'library' ? renderLibrary() : renderDetail();
}

function renderLogin() {
  app.innerHTML = `<section class="login-page"><form class="login-card" id="loginForm"><h1 class="brand">GAME NOTE</h1><p class="tagline">收藏每一段遊戲旅程</p>${startupError ? `<p class="setup-warning">${escapeHtml(startupError)}</p>` : ''}<div class="field"><label for="email">電子信箱</label><input id="email" type="email" value="${escapeHtml(loginEmail)}" placeholder="name@gmail.com" autocomplete="email" required></div><div class="field"><label for="password">密碼</label><input id="password" type="password" placeholder="至少 6 個字元" autocomplete="current-password" required minlength="6"></div><button class="primary" type="submit" ${db ? '' : 'disabled'}>登入</button><button class="text-button" id="signup" type="button" ${db ? '' : 'disabled'}>第一次使用？建立帳號</button></form></section>`;
  document.querySelector('#loginForm').onsubmit = login;
  document.querySelector('#signup').onclick = () => { state.view = 'register'; startupError = ''; render(); };
}
function renderRegister() {
  app.innerHTML = `<section class="login-page"><form class="login-card" id="registerForm"><h1 class="brand small-brand">建立帳號</h1><p class="tagline">開始收藏你的遊戲旅程</p><div class="field"><label for="registerEmail">電子信箱</label><input id="registerEmail" type="email" placeholder="name@gmail.com" autocomplete="email" required></div><div class="field"><label for="registerPassword">密碼</label><input id="registerPassword" type="password" placeholder="至少 6 個字元" autocomplete="new-password" minlength="6" required></div><div class="field"><label for="confirmPassword">確認密碼</label><input id="confirmPassword" type="password" placeholder="再次輸入密碼" autocomplete="new-password" minlength="6" required></div><button class="primary" type="submit">註冊</button><button class="text-button" id="backLogin" type="button">← 返回登入</button></form></section>`;
  document.querySelector('#registerForm').onsubmit = signup;
  document.querySelector('#backLogin').onclick = () => { state.view = 'login'; render(); };
}
function credentials() { return { email: document.querySelector('#email')?.value.trim(), password: document.querySelector('#password')?.value || '' }; }
function setFormBusy(busy) { document.querySelectorAll('#loginForm button').forEach(x => x.disabled = busy); }
async function login(e) {
  e.preventDefault(); setFormBusy(true);
  try {
    const { error } = await withTimeout(db.auth.signInWithPassword(credentials()));
    if (error) throw error;
    state.user = (await db.auth.getUser()).data.user; state.view = 'library'; await loadGames(); render();
  } catch (error) {
    setFormBusy(false); message(`登入失敗：${error.message}`);
  }
}
async function signup(e) {
  e.preventDefault();
  const email = document.querySelector('#registerEmail').value.trim();
  const password = document.querySelector('#registerPassword').value;
  const confirmPassword = document.querySelector('#confirmPassword').value;
  if (password !== confirmPassword) return message('兩次輸入的密碼不一致。');
  if (password.length < 6) return message('密碼至少需要 6 個字元。');
  document.querySelectorAll('#registerForm button').forEach(x => x.disabled = true);
  try {
    const { data, error } = await withTimeout(db.auth.signUp({ email, password }));
    if (error) throw error;
    if (data.session) await withTimeout(db.auth.signOut());
    loginEmail = email;
    state.user = null;
    state.view = 'login';
    render();
    message(data.session ? '帳號建立完成，請使用新帳號登入。' : '帳號建立完成，請先到信箱完成驗證後登入。');
  } catch (error) {
    message(`註冊失敗：${error.message}`);
    document.querySelectorAll('#registerForm button').forEach(x => x.disabled = false);
  }
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
  document.querySelectorAll('[data-delete-game]').forEach(el => el.onclick = () => deleteGame(el.dataset.deleteGame));
}
function gameCard(g) {
  const cover = g.cover_url ? `<img src="${escapeHtml(g.cover_url)}" alt="${escapeHtml(g.name)}">` : escapeHtml(g.name.slice(0, 1).toUpperCase());
  return `<article class="game-card"><button class="game-open" data-game="${g.id}" aria-label="開啟 ${escapeHtml(g.name)}"><span class="game-cover">${cover}</span></button><div class="game-card-footer"><span class="game-name">${escapeHtml(g.name)}</span><button class="game-delete" data-delete-game="${g.id}" type="button" aria-label="刪除 ${escapeHtml(g.name)}" title="刪除遊戲">✕</button></div></article>`;
}
async function deleteGame(id) {
  const game = state.games.find(item => item.id === id);
  if (!game || !window.confirm(`確定要刪除「${game.name}」嗎？\n遊戲內的筆記與紀念也會一起刪除。`)) return;
  const { error } = await db.from('games').delete().eq('id', id);
  if (error) return message(`刪除失敗：${error.message}`);
  const coverPath = getStoragePath(game.cover_url, 'game-covers');
  const mediaPaths = [...game.notes, ...game.memories].map(item => getStoragePath(item.media_url, 'entry-media')).filter(Boolean);
  if (coverPath) await db.storage.from('game-covers').remove([coverPath]);
  if (mediaPaths.length) await db.storage.from('entry-media').remove(mediaPaths);
  await loadGames(); renderLibrary(); message(`已刪除「${game.name}」。`);
}
function getStoragePath(url, bucket) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

function renderDetail() {
  const game = state.games.find(g => g.id === state.currentGameId); if (!game) { state.view = 'library'; return render(); }
  const list = state.tab === 'notes' ? game.notes : game.memories, label = state.tab === 'notes' ? '筆記' : '紀念';
  app.innerHTML = `<section class="detail-page"><header class="detail-header"><button class="back" id="back">← 回到首頁</button><h1 class="detail-title">${escapeHtml(game.name)} 的 NOTE</h1><div class="detail-game"><span>${escapeHtml(game.name)}</span><button class="edit-game" id="editGame" type="button">編輯遊戲</button></div></header><nav class="tabs"><button class="tab ${state.tab === 'notes' ? 'active' : ''}" data-tab="notes">筆記</button><button class="tab ${state.tab === 'memories' ? 'active' : ''}" data-tab="memories">紀念</button></nav><div class="section-head"><h2>${label}收藏</h2><button class="primary" id="addEntry">＋ 新增${label}</button></div><div class="entries">${list.length ? list.map(entryCard).join('') : `<div class="empty">目前還沒有${label}</div>`}</div></section>`;
  document.querySelector('#back').onclick = () => { state.view = 'library'; render(); };
  document.querySelector('#editGame').onclick = () => openGameModal(game);
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { state.tab = el.dataset.tab; render(); });
  document.querySelector('#addEntry').onclick = () => openEntryModal(game);
  document.querySelectorAll('[data-delete]').forEach(el => el.onclick = () => deleteEntry(el.dataset.delete));
}
function entryCard(item) {
  let media = '';
  if (item.entry_type === '圖片' && item.media_url) media = `<img class="entry-media" src="${escapeHtml(item.media_url)}" alt="${escapeHtml(item.title)}">`;
  if (item.entry_type === '影片' && item.media_url) media = `<video class="entry-media" src="${escapeHtml(item.media_url)}" controls preload="metadata"></video>`;
  const link = item.link_url ? `<a class="entry-link" href="${escapeHtml(item.link_url)}" target="_blank" rel="noreferrer">開啟${item.entry_type === '影片' ? '影片' : '連結'} ↗</a>` : '';
  return `<article class="entry"><button class="delete" data-delete="${item.id}" aria-label="刪除">✕</button>${media}<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content)}</p>${link}</article>`;
}
async function deleteEntry(id) { const { error } = await db.from('entries').delete().eq('id', id); if (error) return message(`刪除失敗：${error.message}`); await loadGames(); render(); }

function openGameModal(game = null) {
  const editing = Boolean(game);
  showModal(`<h2>${editing ? '編輯' : '新增'}遊戲</h2><form id="gameForm"><div class="field"><label for="gameName">遊戲名</label><input id="gameName" value="${escapeHtml(game?.name || '')}" required placeholder="輸入遊戲名稱"></div><div class="cover-tools"><button class="secondary" id="searchCover" type="button">🔍 自動搜尋圖片</button><span id="coverStatus">也可以自行上傳封面</span></div><div id="coverResults" class="cover-results"></div><div class="field"><label for="gameCover">自行上傳 Logo／封面</label><input id="gameCover" type="file" accept="image/*"></div><img id="coverPreview" class="preview ${game?.cover_url ? '' : 'hidden'}" src="${escapeHtml(game?.cover_url || '')}" alt="封面預覽"><div class="actions"><button class="secondary" data-close type="button">取消</button><button class="primary" type="submit">${editing ? '儲存修改' : '完成'}</button></div></form>`);
  let selectedCoverUrl = game?.cover_url || null;
  const input = document.querySelector('#gameCover');
  input.onchange = () => readImage(input.files[0], src => { selectedCoverUrl = null; document.querySelectorAll('.cover-choice').forEach(x => x.classList.remove('selected')); const p = document.querySelector('#coverPreview'); p.src = src; p.classList.remove('hidden'); });
  document.querySelector('#searchCover').onclick = async () => {
    const name = document.querySelector('#gameName').value.trim();
    if (!name) return message('請先輸入遊戲名稱。');
    const button = document.querySelector('#searchCover'); button.disabled = true;
    document.querySelector('#coverStatus').textContent = '正在搜尋圖片…';
    try {
      const covers = await searchGameCovers(name);
      document.querySelector('#coverStatus').textContent = covers.length ? '請選擇一張圖片' : '找不到圖片，請改用自行上傳';
      document.querySelector('#coverResults').innerHTML = covers.map((cover, index) => `<button class="cover-choice" type="button" data-cover="${index}" title="${escapeHtml(cover.title)}"><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.title)}"><span>${escapeHtml(cover.title)}</span></button>`).join('');
      document.querySelectorAll('[data-cover]').forEach(choice => choice.onclick = () => { const cover = covers[Number(choice.dataset.cover)]; selectedCoverUrl = cover.url; input.value = ''; document.querySelectorAll('.cover-choice').forEach(x => x.classList.remove('selected')); choice.classList.add('selected'); const p = document.querySelector('#coverPreview'); p.src = cover.url; p.classList.remove('hidden'); });
    } catch (error) { document.querySelector('#coverStatus').textContent = '搜尋失敗，請改用自行上傳'; message(`圖片搜尋失敗：${error.message}`); }
    finally { button.disabled = false; }
  };
  document.querySelector('#gameForm').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true; let coverUrl = selectedCoverUrl;
    if (input.files[0]) { try { coverUrl = await uploadCover(input.files[0]); } catch (error) { e.submitter.disabled = false; return message(`圖片上傳失敗：${error.message}`); } }
    const values = { name: document.querySelector('#gameName').value.trim(), cover_url: coverUrl };
    const { error } = editing
      ? await db.from('games').update(values).eq('id', game.id)
      : await db.from('games').insert({ ...values, user_id: state.user.id });
    if (error) {
      e.submitter.disabled = false;
      const schemaError = /schema cache|column of ['"]?games/i.test(error.message);
      return message(schemaError ? '資料庫欄位尚未建立，請在 Supabase 執行 repair_schema.sql。' : `新增失敗：${error.message}`);
    }
    closeModal(); await loadGames(); editing ? render() : renderLibrary();
  };
}
async function searchGameCovers(name) {
  const search = async (language, suffix) => {
    const params = new URLSearchParams({ origin: '*', action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${name} ${suffix}`, gsrnamespace: '0', gsrlimit: '8', prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '600', pilimit: '8', pilicense: 'any' });
    const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`);
    if (!response.ok) throw new Error('圖片服務暫時無法連線');
    const data = await response.json();
    return (data.query?.pages || []).filter(page => page.thumbnail?.source).sort((a, b) => (a.index || 99) - (b.index || 99)).map(page => ({ title: page.title, url: page.thumbnail.source }));
  };
  const zhResults = await search('zh', '電子遊戲');
  if (zhResults.length) return zhResults.slice(0, 6);
  return (await search('en', 'video game')).slice(0, 6);
}
async function uploadCover(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('圖片不可超過 5MB');
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, ''), path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from('game-covers').upload(path, file, { cacheControl: '3600' }); if (error) throw error;
  return db.storage.from('game-covers').getPublicUrl(path).data.publicUrl;
}
function openEntryModal(game) {
  const isNote = state.tab === 'notes';
  showModal(`<h2>新增${isNote ? '筆記' : '紀念'}</h2><form id="entryForm"><div class="type-tabs">${(isNote ? ['文字','圖片','影片'] : ['圖片','影片','連結']).map((x,i) => `<button type="button" class="${i===0?'active':''}" data-type="${x}">${x}</button>`).join('')}</div><div class="field"><label for="entryTitle">${isNote ? '筆記標題' : '紀念文字'}</label><input id="entryTitle" required></div><div class="field"><label for="entryContent">${isNote ? '筆記內容' : '介紹文字'}</label><textarea id="entryContent" rows="6" required></textarea></div><div id="mediaFields"></div><div class="actions"><button class="secondary" data-close type="button">取消</button><button class="primary" type="submit">完成</button></div></form>`);
  let entryType = isNote ? '文字' : '圖片';
  const renderMediaFields = () => {
    const box = document.querySelector('#mediaFields');
    if (entryType === '圖片') box.innerHTML = '<div class="field"><label for="entryFile">選擇圖片檔案</label><input id="entryFile" type="file" accept="image/*" required><small>圖片上限 10 MB</small></div>';
    else if (entryType === '影片') box.innerHTML = '<div class="field"><label for="entryFile">選擇影片檔案（與連結擇一）</label><input id="entryFile" type="file" accept="video/*"><small>影片上限 50 MB</small></div><div class="field"><label for="entryLink">影片連結（與檔案擇一）</label><input id="entryLink" type="url" placeholder="https://"></div>';
    else if (entryType === '連結') box.innerHTML = '<div class="field"><label for="entryLink">紀念連結</label><input id="entryLink" type="url" placeholder="https://" required></div>';
    else box.innerHTML = '';
  };
  renderMediaFields();
  document.querySelectorAll('[data-type]').forEach(el => el.onclick = () => { entryType = el.dataset.type; document.querySelectorAll('[data-type]').forEach(x => x.classList.remove('active')); el.classList.add('active'); renderMediaFields(); });
  document.querySelector('#entryForm').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    const file = document.querySelector('#entryFile')?.files[0] || null;
    const linkUrl = document.querySelector('#entryLink')?.value.trim() || null;
    if (entryType === '影片' && !file && !linkUrl) { e.submitter.disabled = false; return message('請選擇影片檔案或輸入影片連結。'); }
    let mediaUrl = null;
    if (file) {
      try { mediaUrl = await uploadEntryMedia(file, entryType); }
      catch (error) { e.submitter.disabled = false; return message(`檔案上傳失敗：${error.message}`); }
    }
    const row = { game_id: game.id, user_id: state.user.id, kind: isNote ? 'note' : 'memory', entry_type: entryType, title: document.querySelector('#entryTitle').value.trim(), content: document.querySelector('#entryContent').value.trim(), link_url: linkUrl, media_url: mediaUrl };
    const { error } = await db.from('entries').insert(row); if (error) { e.submitter.disabled = false; return message(`新增失敗：${error.message}`); }
    closeModal(); await loadGames(); render();
  };
}
async function uploadEntryMedia(file, type) {
  const maxSize = type === '影片' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) throw new Error(`${type}不可超過 ${type === '影片' ? '50' : '10'} MB`);
  if (type === '圖片' && !file.type.startsWith('image/')) throw new Error('請選擇圖片檔案');
  if (type === '影片' && !file.type.startsWith('video/')) throw new Error('請選擇影片檔案');
  const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '');
  const path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from('entry-media').upload(path, file, { cacheControl: '3600', contentType: file.type });
  if (error) throw error;
  return db.storage.from('entry-media').getPublicUrl(path).data.publicUrl;
}
function showModal(content) { document.body.insertAdjacentHTML('beforeend', `<div class="modal-wrap" id="modal"><div class="modal">${content}</div></div>`); document.querySelectorAll('[data-close]').forEach(el => el.onclick = closeModal); document.querySelector('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); }; }
function closeModal() { document.querySelector('#modal')?.remove(); }
function readImage(file, done) { if (!file) return; const reader = new FileReader(); reader.onload = () => done(reader.result); reader.readAsDataURL(file); }
start();
