/* =========================================================
   Lisia Górka — main.js
   - Loads content from /content/site.json
   - Renders dynamic sections
   - Handles header scroll, sticky submenu scroll-spy, mobile nav
   ========================================================= */

(function () {
  'use strict';

  const CONTENT_URL = '/content/site.json';

  // -----------------------------------------------------
  // Helpers
  // -----------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  // Pad section number with leading zero
  const numLabel = (n) => String(n + 1).padStart(2, '0');

  // -----------------------------------------------------
  // Content loading
  // -----------------------------------------------------
  async function loadContent() {
    try {
      // Cache-bust to make sure admin edits are reflected immediately
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
    if (hero.image_alt) setAttr('hero-image', 'alt', hero.image_alt);
    if (hero.eyebrow) setText('hero-eyebrow', hero.eyebrow);
    if (hero.subline) setText('hero-subline', hero.subline);

    // Headline: render with optional italic accent on last word
    if (hero.headline) {
      const h1 = document.getElementById('hero-headline');
      if (h1) {
        const parts = hero.headline.trim().split(/\s+/);
        if (parts.length > 1) {
          const last = parts.pop();
          h1.innerHTML = `${escapeHtml(parts.join(' '))} <span class="accent">${escapeHtml(last)}</span>`;
        } else {
          h1.innerHTML = `<span class="accent">${escapeHtml(hero.headline)}</span>`;
        }
      }
    }

    if (hero.cta_primary) {
      const btn = document.getElementById('hero-cta-primary');
      if (btn) {
        btn.innerHTML = `${escapeHtml(hero.cta_primary.label)} <span class="arrow" aria-hidden="true">→</span>`;
        btn.href = hero.cta_primary.url;
        const isExternal = /^https?:\/\//.test(hero.cta_primary.url) && !hero.cta_primary.url.includes(location.host);
        if (isExternal) {
          btn.target = '_blank';
          btn.rel = 'noopener';
        } else {
          btn.removeAttribute('target');
          btn.removeAttribute('rel');
        }
      }
      // Mirror primary CTA into header "Zarezerwuj" button
      const navBtn = document.getElementById('nav-cta-book');
      if (navBtn) {
        navBtn.textContent = hero.cta_primary.label;
        navBtn.href = hero.cta_primary.url;
      }
    }

    if (hero.cta_secondary) {
      const btn = document.getElementById('hero-cta-secondary');
      if (btn) {
        btn.textContent = hero.cta_secondary.label;
        btn.href = hero.cta_secondary.url;
      }
    }
  }

  // -----------------------------------------------------
  // Sections rendering (only on home page)
  // -----------------------------------------------------
  function renderSections(sections) {
    const container = document.getElementById('sections');
    if (!container || !sections) return;

    const submenuInner = document.getElementById('submenu-inner');
    if (submenuInner) submenuInner.innerHTML = '';

    container.innerHTML = '';

    sections.forEach((sec, i) => {
      // Section markup
      const sectionEl = document.createElement('section');
      sectionEl.id = sec.id;
      sectionEl.className = 'section';

      const isImageLeft = sec.image_position === 'left';
      const isMap = sec.image_position === 'map';
      const isGrid = sec.image_position === 'grid';

      if (isImageLeft) sectionEl.classList.add('image-left');
      if (isMap) sectionEl.classList.add('section-map');
      if (isGrid) sectionEl.classList.add('section-grid-features');

      const eyebrow = sec.eyebrow || `${numLabel(i)} — ${sec.title}`;

      let inner = '';
      if (isMap) {
        inner = `
          <div class="container">
            <div class="section-grid">
              <div class="section-content reveal">
                <div class="eyebrow">${escapeHtml(eyebrow)}</div>
                <h2>${formatTitle(sec.title)}</h2>
                ${sec.content || ''}
              </div>
              <div class="map-frame reveal" style="transition-delay: 0.1s">
                <iframe
                  src="${escapeAttr(getMapEmbed())}"
                  loading="lazy"
                  referrerpolicy="no-referrer-when-downgrade"
                  title="Mapa — ${escapeAttr(sec.title)}">
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
                <h2>${formatTitle(sec.title)}</h2>
                ${sec.content || ''}
              </div>
            </div>
          </div>`;
      } else {
        // Standard: text + image
        inner = `
          <div class="container">
            <div class="section-grid">
              <div class="section-content reveal">
                <div class="eyebrow">${escapeHtml(eyebrow)}</div>
                <h2>${formatTitle(sec.title)}</h2>
                ${sec.content || ''}
              </div>
              <div class="section-image reveal" style="transition-delay: 0.15s">
                ${sec.image
                  ? `<img src="${escapeAttr(sec.image)}" alt="${escapeAttr(sec.image_alt || sec.title)}" loading="lazy">`
                  : '<div style="background: var(--bg-deep); width:100%; height:100%;"></div>'}
              </div>
            </div>
          </div>`;
      }

      sectionEl.innerHTML = inner;
      container.appendChild(sectionEl);

      // Submenu link
      if (submenuInner) {
        const a = document.createElement('a');
        a.href = `#${sec.id}`;
        a.dataset.section = sec.id;
        a.innerHTML = `<span class="submenu-num">${numLabel(i)}</span>${escapeHtml(sec.title)}`;
        submenuInner.appendChild(a);
      }
    });

    // Re-init reveal observer on new content
    initRevealObserver();
    initScrollSpy();
  }

  // Format title: italicize last word for editorial flair
  function formatTitle(title) {
    if (!title) return '';
    const parts = title.trim().split(/\s+/);
    if (parts.length === 1) return escapeHtml(title);
    const last = parts.pop();
    return `${escapeHtml(parts.join(' '))} <span class="accent">${escapeHtml(last)}</span>`;
  }

  // -----------------------------------------------------
  // Contact rendering
  // -----------------------------------------------------
  function renderContact(contact) {
    if (!contact) return;

    // Address (lines)
    if (contact.address_lines && Array.isArray(contact.address_lines)) {
      const html = contact.address_lines.map(escapeHtml).join('<br>');
      setHTML('contact-address', html);
      // footer (single line)
      setText('footer-address', contact.address_lines.join(', '));
    }

    // Phone
    if (contact.phone) {
      const phoneHref = `tel:${contact.phone.replace(/\s+/g, '')}`;
      const label = contact.phone_label || contact.phone;
      const a = document.getElementById('contact-phone');
      if (a) { a.href = phoneHref; a.textContent = label; }
      const fp = document.getElementById('footer-phone');
      if (fp) { fp.href = phoneHref; fp.textContent = label; }
    }

    // Email
    if (contact.email) {
      const a = document.getElementById('contact-email');
      if (a) { a.href = `mailto:${contact.email}`; a.textContent = contact.email; }
      const fe = document.getElementById('footer-email');
      if (fe) { fe.href = `mailto:${contact.email}`; fe.textContent = contact.email; }
    }

    // Map (only on contact page)
    if (contact.map_embed) {
      const mapWrap = document.getElementById('contact-map');
      if (mapWrap) {
        const iframe = mapWrap.querySelector('iframe');
        if (iframe) iframe.src = contact.map_embed;
      }
    }

    // Directions
    if (contact.directions) {
      setHTML('contact-directions', contact.directions);
    }
  }

  // Helper: get map embed URL (for the homepage map section)
  let __cachedContact = null;
  function getMapEmbed() {
    return (__cachedContact && __cachedContact.map_embed) || '';
  }

  // -----------------------------------------------------
  // Header scroll behavior (homepage only — hero overlay)
  // -----------------------------------------------------
  function initHeaderScroll() {
    const header = document.getElementById('site-header');
    if (!header) return;
    // Subpages have static header (already .scrolled .dark-bg)
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

    // Detect "stuck" state for shadow
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:-1px;height:1px;width:1px;';
    submenu.parentNode.insertBefore(sentinel, submenu);
    new IntersectionObserver((entries) => {
      submenu.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: [0] }).observe(sentinel);

    // Active section tracking
    const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const setActive = (id) => {
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
      // Scroll active link into view in horizontal scroller
      const activeLink = links.find(a => a.classList.contains('active'));
      if (activeLink && submenu.querySelector('.submenu-inner')) {
        const inner = submenu.querySelector('.submenu-inner');
        const linkRect = activeLink.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        if (linkRect.left < innerRect.left || linkRect.right > innerRect.right) {
          inner.scrollTo({
            left: activeLink.offsetLeft - 24,
            behavior: 'smooth'
          });
        }
      }
    };

    const obs = new IntersectionObserver((entries) => {
      // Find the section closest to top among visible
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    }, {
      rootMargin: '-100px 0px -60% 0px',
      threshold: [0, 0.2, 0.5]
    });
    sections.forEach(s => obs.observe(s));
  }

  // -----------------------------------------------------
  // Reveal-on-scroll
  // -----------------------------------------------------
  function initRevealObserver() {
    const items = $$('.reveal:not(.is-visible)');
    if (!items.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
    items.forEach(item => obs.observe(item));
  }

  // -----------------------------------------------------
  // Mobile menu
  // -----------------------------------------------------
  function initMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const close = document.getElementById('menu-close');
    const nav = document.getElementById('header-nav');
    if (!toggle || !nav) return;

    const open = () => {
      nav.classList.add('is-open');
      document.body.classList.add('menu-open');
      toggle.setAttribute('aria-expanded', 'true');
    };
    const shut = () => {
      nav.classList.remove('is-open');
      document.body.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', open);
    if (close) close.addEventListener('click', shut);
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', shut));
  }

  // -----------------------------------------------------
  // Year in footer
  // -----------------------------------------------------
  function setYear() {
    const y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  }

  // -----------------------------------------------------
  // HTML escape helpers
  // -----------------------------------------------------
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // -----------------------------------------------------
  // Init
  // -----------------------------------------------------
  async function init() {
    setYear();
    initHeaderScroll();
    initMobileMenu();
    initRevealObserver();
    initScrollSpy(); // for any pre-baked sections

    const data = await loadContent();
    if (!data) return;

    __cachedContact = data.contact;

    if (data.hero) renderHero(data.hero);
    if (data.sections) renderSections(data.sections);
    if (data.contact) renderContact(data.contact);

    if (data.site && data.site.title) {
      // Optionally update <title> (don't override page-specific titles)
      // We only update brand text via DOM if needed
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
