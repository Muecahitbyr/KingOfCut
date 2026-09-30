/* King of Cut – Interaktionen & Scroll-Animationen (ohne Abhängigkeiten) */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ======================================================================
     Öffnungszeiten – hier pflegen
     Minuten seit Mitternacht, Wochentag: 0 = Sonntag … 6 = Samstag
     ====================================================================== */
  const HOURS = {
    0: null,
    1: null,
    2: [12 * 60, 19 * 60],
    3: [12 * 60, 19 * 60],
    4: [12 * 60, 19 * 60],
    5: [12 * 60, 19 * 60],
    6: [10 * 60, 18 * 60],
  };

  // Sondertage (JJJJ-MM-TT). "hours: null" = geschlossen, [von, bis] = abweichende Zeiten,
  // ohne "hours" wird nur der Hinweis angezeigt.
  const SPECIAL_DAYS = {
    '2026-10-03': { note: 'Tag der Deutschen Einheit – Öffnungszeiten können abweichen.' },
    // '2026-12-24': { hours: null, note: 'Heiligabend geschlossen.' },
  };

  const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const BAR_FROM = 8 * 60;  // Skala der Wochenbalken: 08:00 – 20:00
  const BAR_TO = 20 * 60;

  /* ---------- Intro-Loader ---------- */
  const start = performance.now();
  const finishLoading = () => {
    const wait = reduced ? 0 : Math.max(0, 1500 - (performance.now() - start));
    setTimeout(() => root.classList.add('loaded'), wait);
  };
  if (document.readyState === 'complete') finishLoading();
  else addEventListener('load', finishLoading);
  setTimeout(() => root.classList.add('loaded'), 3500); // Sicherheitsnetz

  /* ---------- Text zerlegen ---------- */

  // Hero-Titel: Buchstaben, pro Wort in einer maskierten Zeile
  $$('[data-letters]').forEach(el => {
    let i = 0;
    const frag = document.createDocumentFragment();
    const addLetters = (text, cls, line) => {
      [...text].forEach(ch => {
        const s = document.createElement('span');
        s.className = 'letter' + (cls ? ' ' + cls : '');
        s.textContent = ch;
        s.style.setProperty('--i', i++);
        line.appendChild(s);
      });
    };
    let line = null;
    el.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); line = null; return; }
          line = document.createElement('span');
          line.className = 'letter-line';
          frag.appendChild(line);
          addLetters(part, '', line);
        });
      } else if (node.nodeType === 1) {
        if (!line) { line = document.createElement('span'); line.className = 'letter-line'; frag.appendChild(line); }
        addLetters(node.textContent, node.className, line);
      }
    });
    el.setAttribute('aria-label', el.textContent);
    el.textContent = '';
    el.appendChild(frag);
  });

  // Überschriften: Wörter gleiten aus einer Maske (.split)
  // Manifest: jedes Wort wird einzeln "gefüllt" ([data-words])
  const splitWords = (el, wrap) => {
    let i = 0;
    const walk = (node, gold) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            frag.appendChild(wrap(part, i++, gold));
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          const isGold = gold || child.classList.contains('gold');
          child.classList.remove('gold'); // Verlauf pro Wort statt am Elternteil
          walk(child, isGold);
        }
      });
    };
    walk(el, false);
    return i;
  };

  $$('.split').forEach(el => {
    splitWords(el, (word, i, gold) => {
      const w = document.createElement('span');
      w.className = 'w';
      const inner = document.createElement('span');
      inner.className = 'wi' + (gold ? ' gold' : '');
      inner.style.setProperty('--i', i);
      inner.textContent = word;
      w.appendChild(inner);
      return w;
    });
  });

  const wordScenes = $$('[data-words]').map(el => {
    splitWords(el, (word, i, gold) => {
      const s = document.createElement('span');
      s.className = 'word' + (gold ? ' gold' : '');
      s.textContent = word;
      return s;
    });
    return { el, words: $$('.word', el), scene: el.closest('[data-scene]') };
  });

  /* ---------- Reveal beim Hineinscrollen ---------- */
  const revealEls = $$('.reveal, .reveal-scale, .split, .cta-crown');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- Zähler ---------- */
  const countEls = $$('[data-count]');
  const runCount = el => {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const fmt = v => v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduced) { el.textContent = fmt(target); return; }
    const dur = 1800;
    const t0 = performance.now();
    const tick = now => {
      const t = clamp((now - t0) / dur);
      const eased = 1 - Math.pow(2, -10 * t);
      el.textContent = fmt(t === 1 ? target : target * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const cio = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { runCount(e.target); cio.unobserve(e.target); } });
    }, { threshold: 0.6 });
    countEls.forEach(el => cio.observe(el));
  } else countEls.forEach(runCount);

  /* ---------- Scroll-Szenen, Parallax, Marquees ---------- */
  const scenes = $$('[data-scene]').map(el => ({ el, type: el.dataset.scene, p: 0, target: 0 }));
  const parallaxEls = $$('[data-parallax]').map(el => ({ el, speed: parseFloat(el.dataset.parallax) || 0.1 }));
  const horizontal = scenes.find(s => s.type === 'horizontal');
  const hTrack = horizontal && $('.h-track', horizontal.el);
  const hImgs = hTrack ? $$('.h-media img', hTrack) : [];
  const progressBar = $('.scroll-progress');
  const nav = $('#nav');

  let vh = innerHeight;
  let vw = innerWidth;

  const measure = () => {
    vh = innerHeight;
    vw = innerWidth;
    if (hTrack) {
      const dist = Math.max(0, hTrack.scrollWidth - vw);
      horizontal.el.style.setProperty('--dist', dist.toFixed(0));
      horizontal.el.style.height = (dist + vh * 1.15).toFixed(0) + 'px';
    }
    marquees.forEach(m => m.measure());
  };

  // Marquee: läuft von links nach rechts, schneller beim Scrollen
  const marquees = $$('[data-marquee]').map(el => {
    const track = $('.marquee-track', el);
    const group = $('.marquee-group', el);
    const m = {
      el, track, group,
      speed: parseFloat(el.dataset.speed) || 50,
      velocity: parseFloat(el.dataset.velocity) || 0,
      skew: el.hasAttribute('data-skew'),
      x: 0, cur: 0, w: 0, hover: false, visible: true,
      measure() {
        $$('.marquee-group[aria-hidden]', track).forEach(n => n.remove());
        m.w = group.getBoundingClientRect().width;
        if (!m.w) return;
        const copies = Math.ceil(vw / m.w) + 1;
        for (let i = 0; i < copies; i++) {
          const c = group.cloneNode(true);
          c.setAttribute('aria-hidden', 'true');
          track.appendChild(c);
        }
      },
    };
    m.cur = m.speed;
    if (el.hasAttribute('data-pause-hover')) {
      el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') m.hover = true; });
      el.addEventListener('pointerleave', () => { m.hover = false; });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { m.visible = e.isIntersecting; }).observe(el);
    }
    return m;
  });

  let lastY = scrollY;
  let velocity = 0;
  let lastTime = performance.now();
  let navY = scrollY;

  const updateScenes = (dt) => {
    const ease = reduced ? 1 : 1 - Math.pow(1 - 0.16, dt * 60);
    scenes.forEach(s => {
      const r = s.el.getBoundingClientRect();
      const total = r.height - vh;
      s.target = total > 0 ? clamp(-r.top / total) : 0;
      if (r.bottom < -vh || r.top > vh * 2) { s.p = s.target; }
      else s.p += (s.target - s.p) * ease;
      if (Math.abs(s.target - s.p) < 0.0004) s.p = s.target;
      if (s.p !== s.last) {
        s.last = s.p;
        s.el.style.setProperty('--p', s.p.toFixed(4));
        if (s.type === 'hero') s.el.classList.toggle('is-past', s.p > 0.4);
      }
    });

    wordScenes.forEach(({ words, scene }) => {
      const sc = scenes.find(s => s.el === scene);
      if (!sc) return;
      const n = words.length;
      const prog = clamp((sc.p - 0.05) / 0.8) * n;
      words.forEach((w, i) => {
        const o = (0.16 + 0.84 * clamp(prog - i)).toFixed(3);
        if (w._o !== o) { w._o = o; w.style.setProperty('--o', o); }
      });
    });

    if (hImgs.length) {
      hImgs.forEach(img => {
        const r = img.parentElement.getBoundingClientRect();
        if (r.right < 0 || r.left > vw) return;
        const off = ((r.left + r.width / 2) - vw / 2) / vw;
        img.style.setProperty('--ix', (off * -70).toFixed(1) + 'px');
      });
    }
  };

  const updateParallax = () => {
    if (reduced) return;
    parallaxEls.forEach(({ el, speed }) => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const off = ((r.top + r.height / 2) - vh / 2) * -speed;
      el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
    });
  };

  const updateMarquees = (dt) => {
    marquees.forEach(m => {
      if (!m.w || !m.visible) return;
      if (reduced) { m.track.style.transform = `translate3d(${-m.w}px,0,0)`; return; }
      const target = m.hover ? 0 : m.speed + Math.abs(velocity) * m.velocity;
      m.cur += (target - m.cur) * clamp(dt * 4);
      m.x = (m.x + m.cur * dt) % m.w;
      const skew = m.skew ? clamp(-velocity * 0.004, -10, 10) : 0;
      m.track.style.transform = `translate3d(${(m.x - m.w).toFixed(2)}px,0,0)` + (skew ? ` skewX(${skew.toFixed(2)}deg)` : '');
    });
  };

  const updateChrome = () => {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - vh;
    if (progressBar) progressBar.style.setProperty('--sp', max > 0 ? (y / max).toFixed(4) : 0);
    if (nav) {
      nav.classList.toggle('is-solid', y > 20);
      if (!root.classList.contains('menu-open')) {
        if (y > navY + 6 && y > 200) nav.classList.add('is-hidden');
        else if (y < navY - 6) nav.classList.remove('is-hidden');
      }
      if (Math.abs(y - navY) > 6) navY = y;
    }
  };

  const frame = now => {
    const dt = Math.min(0.05, (now - lastTime) / 1000) || 0.016;
    lastTime = now;
    const y = scrollY;
    const instV = (y - lastY) / dt;
    velocity += (instV - velocity) * clamp(dt * 8);
    lastY = y;

    updateScenes(dt);
    updateParallax();
    updateMarquees(dt);
    updateChrome();
    requestAnimationFrame(frame);
  };

  measure();
  requestAnimationFrame(frame);
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(measure, 150); });
  addEventListener('load', measure);

  /* ---------- Aktiver Navigationspunkt ---------- */
  const navLinks = $$('.nav-links a');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const sio = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const a = map.get(e.target.id);
        if (a && e.isIntersecting) { navLinks.forEach(l => l.classList.remove('is-active')); a.classList.add('is-active'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) sio.observe(s); });
  }

  /* ---------- Mobiles Menü ---------- */
  const toggle = $('.nav-toggle');
  const menu = $('#mobile-menu');
  if (toggle && menu) {
    const setMenu = open => {
      root.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      menu.setAttribute('aria-hidden', !open);
      if (open) nav.classList.remove('is-hidden');
    };
    toggle.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  }

  /* ---------- Hero: Maus-Parallax ---------- */
  const hero = $('.hero');
  if (hero && finePointer && !reduced) {
    hero.addEventListener('pointermove', e => {
      hero.style.setProperty('--mx', ((e.clientX / vw) * 2 - 1).toFixed(3));
      hero.style.setProperty('--my', ((e.clientY / vh) * 2 - 1).toFixed(3));
    });
    hero.addEventListener('pointerleave', () => { hero.style.setProperty('--mx', 0); hero.style.setProperty('--my', 0); });
  }

  /* ---------- Bento: Tilt & Spotlight ---------- */
  if (finePointer && !reduced) {
    $$('.tile').forEach(tile => {
      tile.addEventListener('pointermove', e => {
        const r = tile.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        tile.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        tile.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        tile.style.setProperty('--rx', ((x - 0.5) * 7).toFixed(2) + 'deg');
        tile.style.setProperty('--ry', ((0.5 - y) * 7).toFixed(2) + 'deg');
      });
      tile.addEventListener('pointerleave', () => {
        tile.style.setProperty('--rx', '0deg');
        tile.style.setProperty('--ry', '0deg');
      });
    });

    /* Magnetische Buttons */
    $$('.magnetic').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.22}px, ${dy * 0.35}px)`;
        btn.firstElementChild.style.transform = `translate(${dx * 0.12}px, ${dy * 0.15}px)`;
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.transform = '';
        btn.firstElementChild.style.transform = '';
      });
    });

    /* Cursor-Ring */
    const cursor = $('.cursor');
    if (cursor) {
      let cx = -100, cy = -100, tx = -100, ty = -100;
      addEventListener('pointermove', e => {
        tx = e.clientX; ty = e.clientY;
        cursor.classList.add('is-visible');
      }, { passive: true });
      document.addEventListener('pointerleave', () => cursor.classList.remove('is-visible'));
      document.addEventListener('pointerover', e => {
        cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .tile, .review'));
      });
      const loop = () => {
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        requestAnimationFrame(loop);
      };
      loop();
    }
  }

  /* ---------- Karte (Zwei-Klick-Lösung) ---------- */
  $$('[data-map-load]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-map]');
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.google.com/maps?q=' + encodeURIComponent('King of Cut, Georg-Fischer-Straße 10A, 87616 Marktoberdorf') + '&output=embed';
      iframe.title = 'Karte: King of Cut, Georg-Fischer-Straße 10A, Marktoberdorf';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      card.innerHTML = '';
      card.appendChild(iframe);
    });
  });

  /* ---------- Öffnungszeiten & Live-Status ---------- */
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtDur = m => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h && min) return `${h} Std. ${min} Min.`;
    if (h) return `${h} Std.`;
    return `${min} Min.`;
  };

  // Aktuelle Zeit in Deutschland – unabhängig von der Zeitzone des Besuchers
  const berlinNow = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    const y = +parts.year, mo = +parts.month, d = +parts.day;
    return { y, mo, d, dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), minutes: (+parts.hour % 24) * 60 + +parts.minute };
  };
  const dateKey = (y, mo, d, add = 0) => new Date(Date.UTC(y, mo - 1, d + add)).toISOString().slice(0, 10);
  const hoursFor = (key, dow) => {
    const sp = SPECIAL_DAYS[key];
    return sp && 'hours' in sp ? sp.hours : HOURS[dow];
  };

  const renderHours = () => {
    const now = berlinNow();
    const todayKey = dateKey(now.y, now.mo, now.d);
    const today = hoursFor(todayKey, now.dow);

    let state = 'closed', label = 'Geschlossen', detail = '';
    if (today && now.minutes >= today[0] && now.minutes < today[1]) {
      const left = today[1] - now.minutes;
      state = left <= 30 ? 'soon' : 'open';
      label = left <= 30 ? 'Schließt bald' : 'Jetzt geöffnet';
      detail = `Heute bis ${fmtTime(today[1])} Uhr · noch ${fmtDur(left)}`;
    } else if (today && now.minutes < today[0]) {
      label = `Heute ab ${fmtTime(today[0])} Uhr`;
      detail = `Wir öffnen in ${fmtDur(today[0] - now.minutes)}.`;
    } else {
      for (let i = 1; i <= 14; i++) {
        const dow = (now.dow + i) % 7;
        const h = hoursFor(dateKey(now.y, now.mo, now.d, i), dow);
        if (h) {
          const when = i === 1 ? 'morgen' : `am ${DAY_NAMES[dow]}`;
          detail = `Wir öffnen wieder ${when} um ${fmtTime(h[0])} Uhr.`;
          break;
        }
      }
    }

    $$('[data-status-pill]').forEach(pill => {
      pill.dataset.state = state;
      const span = $('span', pill);
      if (span) span.textContent = state === 'closed' ? 'Geschlossen' : state === 'soon' ? 'Schließt bald' : 'Geöffnet';
    });

    const card = $('[data-status]');
    if (card) {
      card.dataset.state = state;
      $('[data-status-label]', card).textContent = label;
      $('[data-status-detail]', card).textContent = detail;
      $('[data-clock]', card).textContent = `${fmtTime(now.minutes)} Uhr`;
      const dp = $('[data-day-progress]', card);
      if (today) {
        dp.hidden = false;
        dp.style.setProperty('--dp', clamp((now.minutes - today[0]) / (today[1] - today[0])).toFixed(4));
        $('[data-dp-start]', dp).textContent = fmtTime(today[0]);
        $('[data-dp-end]', dp).textContent = fmtTime(today[1]);
      } else dp.hidden = true;
    }

    const week = $('[data-week]');
    if (!week) return;
    const mondayOffset = -((now.dow + 6) % 7);
    $$('li', week).forEach(li => {
      const dow = +li.dataset.day;
      const offset = mondayOffset + ((dow + 6) % 7);
      const key = dateKey(now.y, now.mo, now.d, offset);
      const h = hoursFor(key, dow);
      const isToday = offset === 0;

      li.classList.toggle('is-today', isToday);
      li.classList.toggle('is-closed', !h);
      $('.w-time', li).textContent = h ? `${fmtTime(h[0])} – ${fmtTime(h[1])}` : 'Geschlossen';

      const dayEl = $('.w-day', li);
      dayEl.textContent = DAY_NAMES[dow];
      if (isToday) {
        const pill = document.createElement('span');
        pill.className = 'today-pill';
        pill.textContent = 'Heute';
        dayEl.appendChild(pill);
        li.setAttribute('aria-current', 'date');
      } else li.removeAttribute('aria-current');

      const bar = $('.w-bar i', li);
      if (h) {
        bar.style.setProperty('--from', ((h[0] - BAR_FROM) / (BAR_TO - BAR_FROM) * 100).toFixed(2) + '%');
        bar.style.setProperty('--len', ((h[1] - h[0]) / (BAR_TO - BAR_FROM) * 100).toFixed(2) + '%');
      } else bar.style.setProperty('--len', '0%');

      $$('.w-now', li).forEach(n => n.remove());
      if (isToday && now.minutes >= BAR_FROM && now.minutes <= BAR_TO) {
        const needle = document.createElement('span');
        needle.className = 'w-now';
        needle.style.left = ((now.minutes - BAR_FROM) / (BAR_TO - BAR_FROM) * 100).toFixed(2) + '%';
        $('.w-bar', li).appendChild(needle);
      }

      $$('.w-note', li).forEach(n => n.remove());
      const sp = SPECIAL_DAYS[key];
      if (sp && sp.note) {
        const note = document.createElement('span');
        note.className = 'w-note';
        note.textContent = sp.note;
        li.appendChild(note);
      }
    });
  };
  renderHours();
  setInterval(renderHours, 20000);

  /* ---------- Jahr im Footer ---------- */
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
})();
