/* =========================================================
   Lisia Górka — main.js
   - Loads content from /content/site.json
   - Renders dynamic sections in 4 languages (PL/DE/EN/CS)
   - Handles header scroll, sticky submenu scroll-spy, mobile nav, language switcher
   ========================================================= */

(function () {
  'use strict';

  const CONTENT_URL = '/content/site.json';
  const LANGS = ['pl', 'de', 'en', 'cs'];
  const LS_LANG_KEY = 'lg_lang';

  // -----------------------------------------------------
  // Helpers
  // -----------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let currentLang = detectInitialLang();
  let cachedData = null;

  function detectInitialLang() {
    try {
      const saved = localStorage.getItem(LS_LANG_KEY);
      if (saved && LANGS.includes(saved)) return saved;
    } catch (e) {}
    // Default to Polish (primary audience). Other languages must be chosen explicitly.
    return 'pl';
  }

  // Pick translation for a field. Accepts string OR {pl, de, en, cs}.
  function t(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value[currentLang] || value.pl || value.en || Object.values(value)[0] || '';
    }
    return String(value);
  }

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.textContent = value;
  };
  const setHTML = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.innerHTML = value;
  };
  const setAttr = (id, attr, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.setAttribute(attr, value);
  };
  const numLabel = (n) => String(n + 1).padStart(2, '0');

  // -----------------------------------------------------
  // Content loading
  // -----------------------------------------------------
  async function loadContent() {
    try {
      const res = await fetch(`${CONTENT_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('[Lisia Górka] Could not load site.json — using baked HTML.', err);
      return null;
    }
  }

  // -----------------------------------------------------
  // Hero rendering
  // -----------------------------------------------------
  function renderHero(hero) {
    if (!hero) return;
    if (hero.image) setAttr('hero-image', 'src', hero.image);
    setAttr('hero-image', 'alt', t(hero.image_alt));
    setText('hero-eyebrow', t(hero.eyebrow));
    setText('hero-subline', t(hero.subline));

    const headline = t(hero.headline);
    if (headline) {
      const h1 = document.getElementById('hero-headline');
      if (h1) h1.textContent = headline;
    }

    if (hero.cta_primary) {
      const label = t(hero.cta_primary.label);
      const url = hero.cta_primary.url;
      const btn = document.getElementById('hero-cta-primary');
      if (btn) {
        btn.innerHTML = `${escapeHtml(label)} <span class="arrow" aria-hidden="true">→</span>`;
        btn.href = url;
        const external = /^https?:\/\//.test(url) && !url.includes(location.host);
        if (external) { btn.target = '_blank'; btn.rel = 'noopener'; }
        else { btn.removeAttribute('target'); btn.removeAttribute('rel'); }
      }
      const navBtn = document.getElementById('nav-cta-book');
      if (navBtn) { navBtn.textContent = label; navBtn.href = url; }
    }

    if (hero.cta_secondary) {
      const label = t(hero.cta_secondary.label);
      const btn = document.getElementById('hero-cta-secondary');
      if (btn) { btn.textContent = label; btn.href = hero.cta_secondary.url; }
    }
  }

  // -----------------------------------------------------
  // Sections rendering
  // -----------------------------------------------------
  function renderSections(sections) {
    const container = document.getElementById('sections');
    if (!container || !sections) return;

    const submenuInner = document.getElementById('submenu-inner');
    if (submenuInner) submenuInner.innerHTML = '';
    container.innerHTML = '';

    sections.forEach((sec, i) => {
      const sectionEl = document.createElement('section');
      sectionEl.id = sec.id;
      sectionEl.className = 'section';

      const isImageLeft = sec.image_position === 'left';
      const isMap = sec.image_position === 'map';
      const isGrid = sec.image_position === 'grid';

      if (isImageLeft) sectionEl.classList.add('image-left');
      if (isMap) sectionEl.classList.add('section-map');
      if (isGrid) sectionEl.classList.add('section-grid-features');

      const title = t(sec.title);
      const eyebrow = t(sec.eyebrow) || `${numLabel(i)} — ${title}`;
      const content = t(sec.content);
      const imgAlt = t(sec.image_alt) || title;

      let inner = '';
      if (isMap) {
        inner = `
          <div class="container">
            <div class="section-grid">
              <div class="section-content reveal">
                <div class="eyebrow">${escapeHtml(eyebrow)}</div>
                <h2>${escapeHtml(title)}</h2>
                ${content}
              </div>
              <div class="map-frame reveal" style="transition-delay: 0.1s">
                <iframe
                  src="${escapeAttr(getMapEmbed())}"
                  loading="lazy"
                  referrerpolicy="no-referrer-when-downgrade"
                  title="${escapeAttr(title)}">
                </iframe>
              </div>
            </div>
          </div>`;
      } else if (isGrid) {
        inner = `
          <div class="container">
            <div class="section-grid">
              <div class="section-content reveal">
                <div class="eyebrow">${escapeHtml(eyebrow)}</div>
                <h2>${escapeHtml(title)}</h2>
                ${content}
              </div>
            </div>
          </div>`;
      } else {
        inner = `
          <div class="container">
            <div class="section-grid">
              <div class="section-content reveal">
                <div class="eyebrow">${escapeHtml(eyebrow)}</div>
                <h2>${escapeHtml(title)}</h2>
                ${content}
              </div>
              <div class="section-image reveal" style="transition-delay: 0.15s">
                ${sec.image
                  ? `<img src="${escapeAttr(sec.image)}" alt="${escapeAttr(imgAlt)}" loading="lazy">`
                  : '<div style="background: var(--bg-deep); width:100%; height:100%;"></div>'}
              </div>
            </div>
          </div>`;
      }

      sectionEl.innerHTML = inner;
      container.appendChild(sectionEl);

      if (submenuInner) {
        const a = document.createElement('a');
        a.href = `#${sec.id}`;
        a.dataset.section = sec.id;
        a.innerHTML = `<span class="submenu-num">${numLabel(i)}</span>${escapeHtml(title)}`;
        submenuInner.appendChild(a);
      }
    });

    initRevealObserver();
    initScrollSpy();
  }

  // -----------------------------------------------------
  // Contact rendering
  // -----------------------------------------------------
  function renderContact(contact) {
    if (!contact) return;

    // Address (might be array OR {lang: [array]} OR array of {lang: ...})
    let addressArray = [];
    if (Array.isArray(contact.address_lines)) {
      // Could be plain array of strings, or array of {pl: "..", de: ".."}
      addressArray = contact.address_lines.map(line => t(line));
    } else if (typeof contact.address_lines === 'object' && contact.address_lines) {
      // {pl: [...], de: [...], ...}
      const langArr = contact.address_lines[currentLang]
        || contact.address_lines.pl
        || Object.values(contact.address_lines)[0]
        || [];
      addressArray = Array.isArray(langArr) ? langArr : [String(langArr)];
    }

    if (addressArray.length) {
      setHTML('contact-address', addressArray.map(escapeHtml).join('<br>'));
      setText('footer-address', addressArray.join(', '));
    }

    if (contact.phone) {
      const phoneHref = `tel:${contact.phone.replace(/\s+/g, '')}`;
      const label = contact.phone_label || contact.phone;
      const a = document.getElementById('contact-phone');
      if (a) { a.href = phoneHref; a.textContent = label; }
      const fp = document.getElementById('footer-phone');
      if (fp) { fp.href = phoneHref; fp.textContent = label; }
    }

    if (contact.email) {
      const a = document.getElementById('contact-email');
      if (a) { a.href = `mailto:${contact.email}`; a.textContent = contact.email; }
      const fe = document.getElementById('footer-email');
      if (fe) { fe.href = `mailto:${contact.email}`; fe.textContent = contact.email; }
    }

    if (contact.map_embed) {
      const mapWrap = document.getElementById('contact-map');
      if (mapWrap) {
        const iframe = mapWrap.querySelector('iframe');
        if (iframe) iframe.src = contact.map_embed;
      }
    }

    if (contact.map_link) {
      const lnk = document.getElementById('contact-map-link');
      if (lnk) lnk.href = contact.map_link;
    }

    setHTML('contact-directions', t(contact.directions));
  }

  // -----------------------------------------------------
  // UI strings (nav, footer labels, page hero text on subpages)
  // -----------------------------------------------------
  function renderUi(ui) {
    if (!ui) return;
    // Generic data-i18n: text content of element
    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = t(ui[key]);
      if (val) el.textContent = val;
    });
    // data-i18n-html: innerHTML (for richer content)
    $$('[data-i18n-html]').forEach(el => {
      const key = el.dataset.i18nHtml;
      const val = t(ui[key]);
      if (val) el.innerHTML = val;
    });
    // data-i18n-attr="attr:key" e.g. data-i18n-attr="aria-label:nav_contact"
    $$('[data-i18n-attr]').forEach(el => {
      const spec = el.dataset.i18nAttr;
      const [attr, key] = spec.split(':');
      const val = t(ui[key]);
      if (attr && val) el.setAttribute(attr, val);
    });
  }

  // -----------------------------------------------------
  // Language switching
  // -----------------------------------------------------
  function initLangSwitcher() {
    $$('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
    updateLangButtons();
  }

  function setLanguage(lang) {
    if (!LANGS.includes(lang) || lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(LS_LANG_KEY, lang); } catch (e) {}
    document.documentElement.lang = lang;
    updateLangButtons();
    if (cachedData) applyAll(cachedData);
  }

  function updateLangButtons() {
    $$('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
      btn.setAttribute('aria-pressed', btn.dataset.lang === currentLang ? 'true' : 'false');
    });
  }

  // -----------------------------------------------------
  // Apply all (used on initial render + lang switch)
  // -----------------------------------------------------
  function applyAll(data) {
    __cachedContact = data.contact;
    if (data.hero) renderHero(data.hero);
    if (data.sections) renderSections(data.sections);
    if (data.contact) renderContact(data.contact);
    if (data.ui) renderUi(data.ui);
  }

  // Helper: get map embed URL (for the homepage map section)
  let __cachedContact = null;
  function getMapEmbed() {
    return (__cachedContact && __cachedContact.map_embed) || '';
  }

  // -----------------------------------------------------
  // Header scroll
  // -----------------------------------------------------
  function initHeaderScroll() {
    const header = document.getElementById('site-header');
    if (!header) return;
    if (header.classList.contains('dark-bg')) return;
    const onScroll = () => {
      if (window.scrollY > 80) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // -----------------------------------------------------
  // Sticky submenu scroll-spy
  // -----------------------------------------------------
  function initScrollSpy() {
    const submenu = document.getElementById('submenu');
    if (!submenu) return;
    const links = $$('.submenu a', submenu);
    if (!links.length) return;

    const sections = links
      .map(a => document.getElementById(a.dataset.section))
      .filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
      links.forEach(a => a.classList.toggle('active', a.dataset.section === id));
    };

    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, {
      root: null,
      rootMargin: '-30% 0px -55% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    sections.forEach(s => observer.observe(s));
  }

  // -----------------------------------------------------
  // Mobile menu
  // -----------------------------------------------------
  function initMobileMenu() {
    const openBtn = document.getElementById('menu-open');
    const closeBtn = document.getElementById('menu-close');
    const nav = document.getElementById('header-nav');
    if (!openBtn || !nav) return;
    const open = () => {
      nav.classList.add('is-open');
      document.body.classList.add('menu-open');
    };
    const close = () => {
      nav.classList.remove('is-open');
      document.body.classList.remove('menu-open');
    };
    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    $$('a', nav).forEach(a => a.addEventListener('click', close));
  }

  // -----------------------------------------------------
  // Reveal animation observer
  // -----------------------------------------------------
  function initRevealObserver() {
    const els = $$('.reveal');
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    els.forEach(el => obs.observe(el));
  }

  // -----------------------------------------------------
  // Footer year
  // -----------------------------------------------------
  function setYear() {
    const y = document.getElementById('footer-year');
    if (y) y.textContent = new Date().getFullYear();
  }

  // -----------------------------------------------------
  // Escapers
  // -----------------------------------------------------
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // -----------------------------------------------------
  // Init
  // -----------------------------------------------------
  async function init() {
    setYear();
    document.documentElement.lang = currentLang;
    initHeaderScroll();
    initMobileMenu();
    initLangSwitcher();
    initRevealObserver();
    initScrollSpy();

    const data = await loadContent();
    if (!data) return;
    cachedData = data;
    applyAll(data);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
