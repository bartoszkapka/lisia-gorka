/* ============================================================================
   Lisia Górka — panel admina
   Bezpośrednia integracja z GitHub Contents API.
   Token trzymany jest tylko w sessionStorage (znika po zamknięciu karty).
   ============================================================================ */

(() => {
  'use strict';

  // ----- STAN -----
  const state = {
    config: null,        // { owner, repo, branch }
    token: null,         // sessionStorage
    data: null,          // bieżący obiekt site.json
    sha: null,           // sha aktualnego content/site.json (potrzebne do PUT)
    dirty: false,        // czy są niezapisane zmiany
    loading: false,
  };

  const SITE_JSON_PATH = 'content/site.json';
  const LS_CONFIG = 'lg_admin_config';
  const SS_TOKEN  = 'lg_admin_token';

  // ----- DOM -----
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const els = {
    loginScreen:  $('#login-screen'),
    editorScreen: $('#editor-screen'),
    loginForm:    $('#login-form'),
    loginError:   $('#login-error'),
    loginSubmit:  $('#login-submit'),

    inputOwner:   $('#github-owner'),
    inputRepo:    $('#github-repo'),
    inputBranch:  $('#github-branch'),
    inputToken:   $('#github-token'),

    saveBtn:      $('#save-btn'),
    logoutBtn:    $('#logout-btn'),
    adminRepo:    $('#admin-repo'),
    adminStatus:  $('#admin-status'),

    tabs:         $$('.admin-tab'),
    panels:       $$('.admin-panel'),

    // hero
    heroImageUrl: $('#hero-image-url'),
    heroImagePreview: $('#hero-image-preview'),
    heroAlt:      $('#hero-alt'),
    heroEyebrow:  $('#hero-eyebrow'),
    heroHeadline: $('#hero-headline'),
    heroSubline:  $('#hero-subline'),
    heroCta1Lbl:  $('#hero-cta1-label'),
    heroCta1Url:  $('#hero-cta1-url'),
    heroCta2Lbl:  $('#hero-cta2-label'),
    heroCta2Url:  $('#hero-cta2-url'),

    // sections
    sectionsList:    $('#sections-list'),
    addSectionBtn:   $('#add-section-btn'),
    sectionTemplate: $('#section-template'),

    // contact
    contactAddress:    $('#contact-address'),
    contactPhone:      $('#contact-phone'),
    contactEmail:      $('#contact-email'),
    contactMap:        $('#contact-map'),
    contactDirections: $('#contact-directions'),

    // raw
    rawJson:      $('#raw-json'),
    toast:        $('#toast'),
  };

  // ============================================================================
  // GITHUB API
  // ============================================================================

  function gh(path, init = {}) {
    const url = `https://api.github.com/repos/${state.config.owner}/${state.config.repo}${path}`;
    const headers = Object.assign(
      {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': `Bearer ${state.token}`,
      },
      init.headers || {}
    );
    return fetch(url, { ...init, headers });
  }

  async function ghGetFile(filePath) {
    const r = await gh(`/contents/${filePath}?ref=${encodeURIComponent(state.config.branch)}`);
    if (!r.ok) {
      if (r.status === 404) return null;
      const body = await safeText(r);
      throw new Error(`GET ${filePath}: ${r.status} ${body}`);
    }
    return r.json();
  }

  async function ghPutFile(filePath, contentBase64, message, sha) {
    const body = {
      message,
      content: contentBase64,
      branch: state.config.branch,
    };
    if (sha) body.sha = sha;

    const r = await gh(`/contents/${filePath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await safeText(r);
      throw new Error(`PUT ${filePath}: ${r.status} ${text}`);
    }
    return r.json();
  }

  async function safeText(response) {
    try { return await response.text(); } catch { return ''; }
  }

  // ============================================================================
  // KODOWANIE / DEKODOWANIE
  // ============================================================================

  // base64 → string z poprawną obsługą UTF-8
  function decodeBase64Utf8(b64) {
    const clean = b64.replace(/\s/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  // string UTF-8 → base64
  function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  // File → base64 (bez prefiksu data:)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  // ============================================================================
  // LOGIN / LOGOUT
  // ============================================================================

  function loadStoredConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem(LS_CONFIG) || 'null');
      if (cfg && cfg.owner && cfg.repo) {
        els.inputOwner.value  = cfg.owner;
        els.inputRepo.value   = cfg.repo;
        els.inputBranch.value = cfg.branch || 'main';
      }
    } catch {}

    const token = sessionStorage.getItem(SS_TOKEN);
    if (token) els.inputToken.value = token;
  }

  async function tryAutoLogin() {
    const cfg = JSON.parse(localStorage.getItem(LS_CONFIG) || 'null');
    const token = sessionStorage.getItem(SS_TOKEN);
    if (!cfg || !token) return false;

    state.config = cfg;
    state.token = token;

    try {
      await loadSiteJson();
      enterEditor();
      return true;
    } catch (err) {
      console.warn('Auto-login nie powiódł się:', err);
      state.config = null;
      state.token = null;
      return false;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    hideError();

    const owner  = els.inputOwner.value.trim();
    const repo   = els.inputRepo.value.trim();
    const branch = els.inputBranch.value.trim() || 'main';
    const token  = els.inputToken.value.trim();

    if (!owner || !repo || !token) {
      showError('Wypełnij wszystkie pola.');
      return;
    }

    setLoginLoading(true);
    state.config = { owner, repo, branch };
    state.token = token;

    try {
      await loadSiteJson();
      // sukces — zapisz config (bez tokena) i token w sesji
      localStorage.setItem(LS_CONFIG, JSON.stringify(state.config));
      sessionStorage.setItem(SS_TOKEN, token);
      enterEditor();
    } catch (err) {
      console.error(err);
      const msg = err.message || String(err);
      if (msg.includes('401')) {
        showError('Nieprawidłowy token lub brak uprawnień. Sprawdź, czy token ma uprawnienie „Contents: Read and write” na to repo.');
      } else if (msg.includes('404')) {
        showError(`Nie znaleziono repozytorium ${owner}/${repo} lub gałęzi „${branch}". Sprawdź pisownię.`);
      } else if (msg.includes('403')) {
        showError('Brak dostępu (403). Token nie ma uprawnień do tego repozytorium albo wyczerpał limit zapytań.');
      } else {
        showError(`Błąd: ${msg}`);
      }
      state.config = null;
      state.token = null;
    } finally {
      setLoginLoading(false);
    }
  }

  function showError(msg) {
    els.loginError.textContent = msg;
    els.loginError.hidden = false;
  }
  function hideError() {
    els.loginError.hidden = true;
    els.loginError.textContent = '';
  }
  function setLoginLoading(v) {
    els.loginSubmit.disabled = v;
    els.loginSubmit.querySelector('.login-btn-label').textContent =
      v ? 'Łączę z GitHubem…' : 'Zaloguj się';
  }

  function enterEditor() {
    els.loginScreen.hidden = true;
    els.editorScreen.hidden = false;
    document.body.classList.add('admin-editing');
    els.adminRepo.textContent = `${state.config.owner}/${state.config.repo} · ${state.config.branch}`;
    renderAll();
  }

  function logout() {
    if (state.dirty && !confirm('Masz niezapisane zmiany. Wylogować mimo to?')) return;
    sessionStorage.removeItem(SS_TOKEN);
    state.token = null;
    state.data = null;
    state.sha = null;
    state.dirty = false;
    els.editorScreen.hidden = true;
    els.loginScreen.hidden = false;
    document.body.classList.remove('admin-editing');
    els.inputToken.value = '';
    els.inputToken.focus();
  }

  // ============================================================================
  // ŁADOWANIE / ZAPIS
  // ============================================================================

  async function loadSiteJson() {
    const file = await ghGetFile(SITE_JSON_PATH);
    if (!file) {
      throw new Error(`Nie znaleziono pliku ${SITE_JSON_PATH} w repo. Najpierw wgraj projekt na GitHub.`);
    }
    state.sha = file.sha;
    const text = decodeBase64Utf8(file.content);
    try {
      state.data = JSON.parse(text);
    } catch (e) {
      throw new Error('Plik site.json zawiera niepoprawny JSON. Popraw go ręcznie w repo.');
    }
    // backwardsy / sanity
    state.data.hero            = state.data.hero || {};
    state.data.hero.cta_primary   = state.data.hero.cta_primary   || { label: '', url: '' };
    state.data.hero.cta_secondary = state.data.hero.cta_secondary || { label: '', url: '' };
    state.data.sections = Array.isArray(state.data.sections) ? state.data.sections : [];
    state.data.contact  = state.data.contact || {};
    state.data.contact.address_lines = state.data.contact.address_lines || [];
  }

  async function saveSiteJson() {
    if (state.loading) return;
    if (!validateBeforeSave()) return;

    state.loading = true;
    setSaveLoading(true);
    setStatus('Zapisuję…');

    try {
      const json = JSON.stringify(state.data, null, 2) + '\n';
      const message = `Aktualizacja treści strony (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
      const result = await ghPutFile(SITE_JSON_PATH, encodeBase64Utf8(json), message, state.sha);
      state.sha = result.content.sha;
      state.dirty = false;
      setStatus('Zapisano ✓');
      toast('Zmiany zapisane. Cloudflare zaraz zbuduje stronę (~30 s).', 'success');
      updateSaveBtnState();
      setTimeout(() => setStatus(''), 4000);
    } catch (err) {
      console.error(err);
      const msg = err.message || String(err);
      if (msg.includes('409')) {
        toast('Konflikt: ktoś inny zmienił plik. Odśwież panel (wyloguj/zaloguj), żeby pobrać świeżą wersję.', 'error');
      } else if (msg.includes('401') || msg.includes('403')) {
        toast('Brak autoryzacji. Zaloguj się ponownie.', 'error');
        setTimeout(logout, 1500);
      } else {
        toast(`Błąd zapisu: ${msg}`, 'error');
      }
      setStatus('');
    } finally {
      state.loading = false;
      setSaveLoading(false);
    }
  }

  function validateBeforeSave() {
    // unikalne ID sekcji + slug-format
    const ids = new Set();
    for (const s of state.data.sections) {
      if (!s.id || !/^[a-z0-9-]+$/.test(s.id)) {
        toast(`Sekcja „${s.title || '(bez tytułu)'}" ma nieprawidłowe ID. Tylko małe litery, cyfry i myślniki.`, 'error');
        return false;
      }
      if (ids.has(s.id)) {
        toast(`Powielone ID sekcji: „${s.id}". ID musi być unikalne.`, 'error');
        return false;
      }
      ids.add(s.id);
    }
    return true;
  }

  function setSaveLoading(v) {
    els.saveBtn.disabled = v;
    els.saveBtn.querySelector('.save-label').textContent = v ? 'Zapisuję…' : 'Zapisz zmiany';
  }
  function setStatus(text) {
    els.adminStatus.textContent = text || '';
  }
  function updateSaveBtnState() {
    els.saveBtn.disabled = !state.dirty || state.loading;
    els.saveBtn.classList.toggle('btn-dirty', state.dirty);
  }

  function markDirty() {
    state.dirty = true;
    updateSaveBtnState();
    syncRawJson();
  }

  // ============================================================================
  // RENDER — HERO
  // ============================================================================

  function renderAll() {
    renderHero();
    renderSections();
    renderContact();
    syncRawJson();
    updateSaveBtnState();
  }

  function renderHero() {
    const h = state.data.hero;
    els.heroImageUrl.value = h.image || '';
    els.heroImagePreview.src = h.image || '';
    els.heroImagePreview.alt = h.image_alt || '';
    els.heroAlt.value      = h.image_alt || '';
    els.heroEyebrow.value  = h.eyebrow   || '';
    els.heroHeadline.value = h.headline  || '';
    els.heroSubline.value  = h.subline   || '';
    els.heroCta1Lbl.value  = h.cta_primary.label   || '';
    els.heroCta1Url.value  = h.cta_primary.url     || '';
    els.heroCta2Lbl.value  = h.cta_secondary.label || '';
    els.heroCta2Url.value  = h.cta_secondary.url   || '';
  }

  function bindHeroFields() {
    const map = [
      [els.heroImageUrl, v => { state.data.hero.image = v; els.heroImagePreview.src = v; }],
      [els.heroAlt,      v => { state.data.hero.image_alt = v; els.heroImagePreview.alt = v; }],
      [els.heroEyebrow,  v => { state.data.hero.eyebrow = v; }],
      [els.heroHeadline, v => { state.data.hero.headline = v; }],
      [els.heroSubline,  v => { state.data.hero.subline = v; }],
      [els.heroCta1Lbl,  v => { state.data.hero.cta_primary.label = v; }],
      [els.heroCta1Url,  v => { state.data.hero.cta_primary.url = v; }],
      [els.heroCta2Lbl,  v => { state.data.hero.cta_secondary.label = v; }],
      [els.heroCta2Url,  v => { state.data.hero.cta_secondary.url = v; }],
    ];
    map.forEach(([el, setter]) => {
      el.addEventListener('input', () => { setter(el.value); markDirty(); });
    });

    // upload pliku do hero
    const heroFileInput = $('input[type="file"][data-upload-target="hero-image-url"]');
    heroFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        els.heroImageUrl.value = url;
        els.heroImagePreview.src = url;
        state.data.hero.image = url;
        markDirty();
        toast('Zdjęcie wgrane.', 'success');
      } catch (err) {
        toast(`Błąd uploadu: ${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    });
  }

  // ============================================================================
  // RENDER — KONTAKT
  // ============================================================================

  function renderContact() {
    const c = state.data.contact;
    els.contactAddress.value    = (c.address_lines || []).join('\n');
    els.contactPhone.value      = c.phone || '';
    els.contactEmail.value      = c.email || '';
    els.contactMap.value        = c.map_embed || '';
    els.contactDirections.value = c.directions || '';
  }

  function bindContactFields() {
    els.contactAddress.addEventListener('input', () => {
      state.data.contact.address_lines = els.contactAddress.value
        .split('\n').map(s => s.trim()).filter(Boolean);
      markDirty();
    });
    els.contactPhone.addEventListener('input', () => {
      state.data.contact.phone = els.contactPhone.value;
      // jeśli phone_label jest "synem" telefonu, też aktualizuj
      state.data.contact.phone_label = els.contactPhone.value;
      markDirty();
    });
    els.contactEmail.addEventListener('input', () => {
      state.data.contact.email = els.contactEmail.value;
      markDirty();
    });
    els.contactMap.addEventListener('input', () => {
      state.data.contact.map_embed = els.contactMap.value;
      markDirty();
    });
    els.contactDirections.addEventListener('input', () => {
      state.data.contact.directions = els.contactDirections.value;
      markDirty();
    });
  }

  // ============================================================================
  // RENDER — SEKCJE
  // ============================================================================

  function renderSections() {
    els.sectionsList.innerHTML = '';
    state.data.sections.forEach((section, idx) => {
      const card = buildSectionCard(section, idx);
      els.sectionsList.appendChild(card);
    });
  }

  function buildSectionCard(section, idx) {
    const node = els.sectionTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = idx;

    const numEl     = node.querySelector('.section-card-num');
    const titleEl   = node.querySelector('.section-card-title');
    const bodyEl    = node.querySelector('.section-card-body');
    const toggleBtn = node.querySelector('[data-action="toggle"]');
    const upBtn     = node.querySelector('[data-action="up"]');
    const downBtn   = node.querySelector('[data-action="down"]');
    const delBtn    = node.querySelector('[data-action="delete"]');

    numEl.textContent = String(idx + 1).padStart(2, '0');
    titleEl.textContent = section.title || '(bez tytułu)';

    // pola
    const fields = {
      title:          node.querySelector('[data-field="title"]'),
      id:             node.querySelector('[data-field="id"]'),
      eyebrow:        node.querySelector('[data-field="eyebrow"]'),
      image_position: node.querySelector('[data-field="image_position"]'),
      image:          node.querySelector('[data-field="image"]'),
      image_alt:      node.querySelector('[data-field="image_alt"]'),
      content:        node.querySelector('[data-field="content"]'),
    };
    const imageFieldWrap = node.querySelector('[data-image-field]');
    const imagePreview   = node.querySelector('[data-section-image-preview]');
    const fileInput      = node.querySelector('[data-section-upload]');

    // wartości startowe
    fields.title.value          = section.title || '';
    fields.id.value             = section.id || '';
    fields.eyebrow.value        = section.eyebrow || '';
    fields.image_position.value = section.image_position || 'right';
    fields.image.value          = section.image || '';
    fields.image_alt.value      = section.image_alt || '';
    fields.content.value        = section.content || '';
    imagePreview.src            = section.image || '';
    imagePreview.alt            = section.image_alt || '';

    updateImageVisibility(imageFieldWrap, fields.image_position.value);

    // toggle (rozwijanie)
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      bodyEl.hidden = expanded;
      node.classList.toggle('is-open', !expanded);
    });

    // bind zmian
    fields.title.addEventListener('input', () => {
      section.title = fields.title.value;
      titleEl.textContent = section.title || '(bez tytułu)';
      markDirty();
    });
    fields.id.addEventListener('input', () => {
      section.id = fields.id.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (fields.id.value !== section.id) fields.id.value = section.id;
      markDirty();
    });
    fields.eyebrow.addEventListener('input', () => {
      section.eyebrow = fields.eyebrow.value;
      markDirty();
    });
    fields.image_position.addEventListener('change', () => {
      section.image_position = fields.image_position.value;
      updateImageVisibility(imageFieldWrap, section.image_position);
      markDirty();
    });
    fields.image.addEventListener('input', () => {
      section.image = fields.image.value;
      imagePreview.src = section.image;
      markDirty();
    });
    fields.image_alt.addEventListener('input', () => {
      section.image_alt = fields.image_alt.value;
      imagePreview.alt = section.image_alt;
      markDirty();
    });
    fields.content.addEventListener('input', () => {
      section.content = fields.content.value;
      markDirty();
    });

    // upload
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        fields.image.value = url;
        section.image = url;
        imagePreview.src = url;
        markDirty();
        toast('Zdjęcie wgrane.', 'success');
      } catch (err) {
        toast(`Błąd uploadu: ${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    });

    // akcje
    upBtn.addEventListener('click',   (e) => { e.stopPropagation(); moveSection(idx, -1); });
    downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSection(idx, +1); });
    delBtn.addEventListener('click',  (e) => {
      e.stopPropagation();
      if (confirm(`Usunąć sekcję „${section.title || section.id}"?`)) {
        state.data.sections.splice(idx, 1);
        markDirty();
        renderSections();
      }
    });

    return node;
  }

  function updateImageVisibility(wrap, pos) {
    const showImage = pos === 'left' || pos === 'right';
    wrap.style.display = showImage ? '' : 'none';
  }

  function moveSection(idx, delta) {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= state.data.sections.length) return;
    const arr = state.data.sections;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    markDirty();
    renderSections();
  }

  function addSection() {
    const next = state.data.sections.length + 1;
    state.data.sections.push({
      id: `sekcja-${next}`,
      title: 'Nowa sekcja',
      eyebrow: `${String(next).padStart(2, '0')} — `,
      image: '',
      image_alt: '',
      image_position: 'right',
      content: '<p>Treść sekcji…</p>',
    });
    markDirty();
    renderSections();
    // rozwiń ostatnią
    const cards = $$('[data-section-card]', els.sectionsList);
    const last = cards[cards.length - 1];
    if (last) last.querySelector('[data-action="toggle"]').click();
  }

  // ============================================================================
  // UPLOAD ZDJĘCIA
  // ============================================================================

  async function uploadImage(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Plik nie jest obrazem.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Plik większy niż 5 MB.');
    }
    const safeName = file.name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const stamp = Date.now().toString(36);
    const finalName = `${stamp}-${safeName || 'upload.jpg'}`;
    const ghPath = `assets/images/${finalName}`;

    setStatus('Wgrywam zdjęcie…');
    const b64 = await fileToBase64(file);
    await ghPutFile(ghPath, b64, `Wgranie zdjęcia: ${finalName}`, null);
    setStatus('');
    return `/${ghPath}`;
  }

  // ============================================================================
  // RAW JSON / TABS / TOAST
  // ============================================================================

  function syncRawJson() {
    if (els.rawJson) {
      els.rawJson.value = JSON.stringify(state.data, null, 2);
    }
  }

  function bindTabs() {
    els.tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        els.tabs.forEach(b => b.classList.toggle('active', b === btn));
        els.panels.forEach(p => {
          const match = p.dataset.panel === target;
          p.classList.toggle('active', match);
          p.hidden = !match;
        });
      });
    });
  }

  let toastTimer = null;
  function toast(message, kind = 'info') {
    els.toast.textContent = message;
    els.toast.classList.remove('is-error', 'is-success');
    if (kind === 'error')   els.toast.classList.add('is-error');
    if (kind === 'success') els.toast.classList.add('is-success');
    els.toast.hidden = false;
    // wymuszenie reflow, żeby transition zadziałał
    void els.toast.offsetWidth;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
      setTimeout(() => { els.toast.hidden = true; }, 250);
    }, 4500);
  }

  // ============================================================================
  // INIT
  // ============================================================================

  function init() {
    loadStoredConfig();
    bindHeroFields();
    bindContactFields();
    bindTabs();

    els.loginForm.addEventListener('submit', handleLogin);
    els.logoutBtn.addEventListener('click', logout);
    els.saveBtn.addEventListener('click', saveSiteJson);
    els.addSectionBtn.addEventListener('click', addSection);

    // Cmd/Ctrl+S → zapis
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !els.editorScreen.hidden) {
        e.preventDefault();
        if (state.dirty) saveSiteJson();
      }
    });

    // ostrzeżenie o niezapisanych zmianach
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // próba auto-loginu (jeśli token jest w sesji)
    tryAutoLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
