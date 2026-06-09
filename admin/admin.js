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
    adminLang: 'pl',     // aktualnie edytowany język
  };

  const LANGS = ['pl', 'de', 'en', 'cs'];
  const SITE_JSON_PATH = 'content/site.json';
  const LS_CONFIG = 'lg_admin_config';
  const SS_TOKEN  = 'lg_admin_token';
  const LS_ADMIN_LANG = 'lg_admin_lang';

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
      throw await ghError(r, 'GET', filePath);
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
      throw await ghError(r, 'PUT', filePath);
    }
    return r.json();
  }

  // Parses GitHub error response into a structured Error object
  async function ghError(response, method, filePath) {
    const text = await safeText(response);
    let ghMessage = '';
    try {
      const parsed = JSON.parse(text);
      ghMessage = parsed.message || '';
    } catch {}
    const err = new Error(`${method} ${filePath}: ${response.status}${ghMessage ? ' — ' + ghMessage : ''}`);
    err.status = response.status;
    err.githubMessage = ghMessage;
    return err;
  }

  async function safeText(response) {
    try { return await response.text(); } catch { return ''; }
  }

  // ============================================================================
  // TRANSLATION HELPERS
  // Translatable fields are stored as { pl: "...", de: "...", en: "...", cs: "..." }
  // Plain strings are treated as same value for all languages (legacy compat).
  // ============================================================================

  // Read translatable value for the currently edited language.
  function getTr(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value[state.adminLang] || value.pl || value.en || '';
    }
    return String(value);
  }

  // Set translatable value for the currently edited language.
  // Returns the new translation object (caller assigns it back).
  // If existing is a plain string, it gets promoted to {pl: existing} first.
  function setTr(existing, newValueForCurrentLang) {
    let obj;
    if (typeof existing === 'string') {
      // Promote plain string to object: assume it was Polish (the default).
      obj = { pl: existing };
    } else if (existing && typeof existing === 'object') {
      obj = { ...existing };
    } else {
      obj = {};
    }
    obj[state.adminLang] = newValueForCurrentLang;
    return obj;
  }

  // Read address_lines (special: {pl: [array], de: [array], ...}) → array for current lang.
  function getAddressLines(contact) {
    const al = contact && contact.address_lines;
    if (!al) return [];
    if (Array.isArray(al)) return al.map(x => typeof x === 'string' ? x : getTr(x));
    if (typeof al === 'object') {
      const arr = al[state.adminLang] || al.pl || Object.values(al).find(Array.isArray) || [];
      return Array.isArray(arr) ? arr : [];
    }
    return [];
  }

  // Set address_lines for current language.
  function setAddressLines(contact, linesArray) {
    let obj;
    if (Array.isArray(contact.address_lines)) {
      // Legacy: promote to per-language object, assume Polish.
      obj = { pl: contact.address_lines.slice() };
    } else if (contact.address_lines && typeof contact.address_lines === 'object') {
      obj = { ...contact.address_lines };
    } else {
      obj = {};
    }
    obj[state.adminLang] = linesArray;
    contact.address_lines = obj;
  }

  // Language tab UI handling
  function initAdminLangTabs() {
    try {
      const saved = localStorage.getItem(LS_ADMIN_LANG);
      if (saved && LANGS.includes(saved)) state.adminLang = saved;
    } catch (e) {}

    $$('.admin-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setAdminLang(btn.dataset.adminLang));
    });
    updateAdminLangButtons();
  }

  function setAdminLang(lang) {
    if (!LANGS.includes(lang) || lang === state.adminLang) return;
    state.adminLang = lang;
    try { localStorage.setItem(LS_ADMIN_LANG, lang); } catch (e) {}
    updateAdminLangButtons();
    // Re-render all fields to show new language's values
    if (state.data) {
      renderHero();
      renderSections();
      renderContact();
    }
  }

  function updateAdminLangButtons() {
    $$('.admin-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.adminLang === state.adminLang);
    });
  }

  // Translate a GitHub API error into a user-friendly toast.
  // 401 = invalid/expired token → force re-login
  // 403 = token authenticated but lacks write permission → keep session, instruct user
  // 404 = repo/branch not found
  // 409 = sha conflict (someone else updated the file)
  // 422 = validation (e.g. bad branch)
  // others → show GitHub's own message
  function handleGhError(err, contextNoun /* "zapisu" or "uploadu" */) {
    const ctx = contextNoun || 'operacji';
    const status = err && err.status;
    const ghMsg = (err && err.githubMessage) || '';

    if (status === 401) {
      toast(`Token nieprawidłowy lub wygasł. Zaloguj się ponownie.${ghMsg ? ' (GitHub: ' + ghMsg + ')' : ''}`, 'error');
      setTimeout(logout, 2200);
      return;
    }
    if (status === 403) {
      // The most common cause: fine-grained PAT created with "Contents: Read-only".
      // We deliberately do NOT log the user out — re-logging in with the same token won't help.
      const detail = ghMsg ? ` GitHub odpowiedział: „${ghMsg}".` : '';
      toast(
        `Token nie ma uprawnień do zapisu w tym repozytorium.${detail} ` +
        `Wygeneruj nowy token z uprawnieniem „Contents: Read AND write" i wklej go ponownie po wylogowaniu.`,
        'error'
      );
      return;
    }
    if (status === 404) {
      toast(`Nie znaleziono pliku, repo lub gałęzi. Sprawdź dane logowania.${ghMsg ? ' (GitHub: ' + ghMsg + ')' : ''}`, 'error');
      return;
    }
    if (status === 409) {
      toast('Konflikt: ktoś (lub inna karta) zmienił plik w międzyczasie. Wyloguj się i zaloguj ponownie, żeby pobrać świeżą wersję.', 'error');
      return;
    }
    if (status === 422) {
      toast(`Błąd walidacji${ghMsg ? ': ' + ghMsg : ''}. Sprawdź, czy podana gałąź istnieje.`, 'error');
      return;
    }
    // fallback
    toast(`Błąd ${ctx}: ${ghMsg || (err && err.message) || 'nieznany'}`, 'error');
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
      const status = err && err.status;
      const ghMsg = (err && err.githubMessage) || '';
      if (status === 401) {
        showError(`Nieprawidłowy lub wygasły token. ${ghMsg ? 'GitHub: „' + ghMsg + '". ' : ''}Wygeneruj nowy fine-grained token z uprawnieniem „Contents: Read and write".`);
      } else if (status === 404) {
        showError(`Nie znaleziono repozytorium ${owner}/${repo} lub gałęzi „${branch}". Sprawdź pisownię i czy token ma dostęp do tego repo.`);
      } else if (status === 403) {
        showError(`Brak dostępu (403). ${ghMsg ? 'GitHub: „' + ghMsg + '". ' : ''}Token nie ma uprawnień do tego repozytorium albo wyczerpał limit zapytań.`);
      } else {
        showError(`Błąd: ${ghMsg || err.message || String(err)}`);
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
      handleGhError(err, 'zapisu');
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
    els.heroImagePreview.alt = getTr(h.image_alt);
    els.heroAlt.value      = getTr(h.image_alt);
    els.heroEyebrow.value  = getTr(h.eyebrow);
    els.heroHeadline.value = getTr(h.headline);
    els.heroSubline.value  = getTr(h.subline);
    els.heroCta1Lbl.value  = getTr(h.cta_primary && h.cta_primary.label);
    els.heroCta1Url.value  = (h.cta_primary && h.cta_primary.url) || '';
    els.heroCta2Lbl.value  = getTr(h.cta_secondary && h.cta_secondary.label);
    els.heroCta2Url.value  = (h.cta_secondary && h.cta_secondary.url) || '';
  }

  function bindHeroFields() {
    // Fields and how to write them back. Translatable fields use setTr; image/url fields are plain strings.
    const map = [
      [els.heroImageUrl, v => { state.data.hero.image = v; els.heroImagePreview.src = v; }],
      [els.heroAlt,      v => { state.data.hero.image_alt = setTr(state.data.hero.image_alt, v); els.heroImagePreview.alt = v; }],
      [els.heroEyebrow,  v => { state.data.hero.eyebrow = setTr(state.data.hero.eyebrow, v); }],
      [els.heroHeadline, v => { state.data.hero.headline = setTr(state.data.hero.headline, v); }],
      [els.heroSubline,  v => { state.data.hero.subline = setTr(state.data.hero.subline, v); }],
      [els.heroCta1Lbl,  v => { state.data.hero.cta_primary.label = setTr(state.data.hero.cta_primary.label, v); }],
      [els.heroCta1Url,  v => { state.data.hero.cta_primary.url = v; }],
      [els.heroCta2Lbl,  v => { state.data.hero.cta_secondary.label = setTr(state.data.hero.cta_secondary.label, v); }],
      [els.heroCta2Url,  v => { state.data.hero.cta_secondary.url = v; }],
    ];
    map.forEach(([el, setter]) => {
      el.addEventListener('input', () => { setter(el.value); markDirty(); });
    });

    // upload pliku do hero (image url stays as plain string)
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
        if (err && err.status) handleGhError(err, 'uploadu');
        else toast(`Błąd uploadu: ${err.message}`, 'error');
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
    els.contactAddress.value    = getAddressLines(c).join('\n');
    els.contactPhone.value      = c.phone || '';
    els.contactEmail.value      = c.email || '';
    els.contactMap.value        = c.map_embed || '';
    els.contactDirections.value = getTr(c.directions);
  }

  function bindContactFields() {
    els.contactAddress.addEventListener('input', () => {
      const lines = els.contactAddress.value.split('\n').map(s => s.trim()).filter(Boolean);
      setAddressLines(state.data.contact, lines);
      markDirty();
    });
    els.contactPhone.addEventListener('input', () => {
      state.data.contact.phone = els.contactPhone.value;
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
      state.data.contact.directions = setTr(state.data.contact.directions, els.contactDirections.value);
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
    titleEl.textContent = getTr(section.title) || '(bez tytułu)';

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

    // wartości startowe — tłumaczalne pola czytamy przez getTr
    fields.title.value          = getTr(section.title);
    fields.id.value             = section.id || '';
    fields.eyebrow.value        = getTr(section.eyebrow);
    fields.image_position.value = section.image_position || 'right';
    fields.image.value          = section.image || '';
    fields.image_alt.value      = getTr(section.image_alt);
    fields.content.value        = getTr(section.content);
    imagePreview.src            = section.image || '';
    imagePreview.alt            = getTr(section.image_alt);

    updateImageVisibility(imageFieldWrap, fields.image_position.value);

    // toggle (rozwijanie)
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      bodyEl.hidden = expanded;
      node.classList.toggle('is-open', !expanded);
    });

    // bind zmian — tłumaczalne pola przez setTr (tylko bieżący język)
    fields.title.addEventListener('input', () => {
      section.title = setTr(section.title, fields.title.value);
      titleEl.textContent = fields.title.value || '(bez tytułu)';
      markDirty();
    });
    fields.id.addEventListener('input', () => {
      section.id = fields.id.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (fields.id.value !== section.id) fields.id.value = section.id;
      markDirty();
    });
    fields.eyebrow.addEventListener('input', () => {
      section.eyebrow = setTr(section.eyebrow, fields.eyebrow.value);
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
      section.image_alt = setTr(section.image_alt, fields.image_alt.value);
      imagePreview.alt = fields.image_alt.value;
      markDirty();
    });
    fields.content.addEventListener('input', () => {
      section.content = setTr(section.content, fields.content.value);
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
        if (err && err.status) handleGhError(err, 'uploadu');
        else toast(`Błąd uploadu: ${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    });

    // akcje
    upBtn.addEventListener('click',   (e) => { e.stopPropagation(); moveSection(idx, -1); });
    downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveSection(idx, +1); });
    delBtn.addEventListener('click',  (e) => {
      e.stopPropagation();
      if (confirm(`Usunąć sekcję „${getTr(section.title) || section.id}"?`)) {
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
      title:    { [state.adminLang]: 'Nowa sekcja' },
      eyebrow:  { [state.adminLang]: `${String(next).padStart(2, '0')} — ` },
      image: '',
      image_alt: { [state.adminLang]: '' },
      image_position: 'right',
      content:  { [state.adminLang]: '<p>Treść sekcji…</p>' },
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
    initAdminLangTabs();
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
