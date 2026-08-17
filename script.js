(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function uid(prefix) {
    return (prefix || "id-") + Math.random().toString(36).slice(2, 9);
  }

  /* ============================================================
     BACKEND API CONNECTION & STATE
     ============================================================ */
  var SITE_DATA = null;
  var CSRF_TOKEN = null;
  var API_BASE = "api";

  async function apiFetch(path, options) {
    options = options || {};
    var opts = Object.assign({ credentials: "include" }, options);
    opts.headers = Object.assign({}, options.headers);
    if (options.body && !(options.body instanceof FormData)) {
      opts.headers["Content-Type"] = "application/json";
    }
    if (CSRF_TOKEN && options.method && options.method !== "GET") {
      opts.headers["X-CSRF-Token"] = CSRF_TOKEN;
    }
    var res = await fetch(API_BASE + "/" + path, opts);
    var data = {};
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw new Error(data.error || "Terjadi kesalahan pada server (" + res.status + ").");
    }
    return data;
  }

  async function loadSiteData() {
    var res = await fetch(API_BASE + "/data", { credentials: "include" });
    if (!res.ok) throw new Error("Gagal memuat data portal dari server.");
    SITE_DATA = await res.json();
  }

  async function uploadImage(file, folder) {
    var fd = new FormData();
    fd.append("image", file);
    fd.append("folder", folder);
    var data = await apiFetch("upload", { method: "POST", body: fd });
    return data.path;
  }

  /* ============================================================
     THEME & ACCESSIBILITY CONTROLS
     ============================================================ */
  var savedTheme = localStorage.getItem("banten_theme") || "light";
  document.body.setAttribute("data-theme", savedTheme);
  document.querySelectorAll("[data-theme-btn]").forEach(function (btn) {
    btn.classList.toggle("is-active", btn.dataset.themeBtn === savedTheme);
    btn.addEventListener("click", function () {
      var theme = btn.dataset.themeBtn;
      document.body.setAttribute("data-theme", theme);
      localStorage.setItem("banten_theme", theme);
      document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.themeBtn === theme);
      });
    });
  });

  var fontStep = 0;
  var fontIncBtn = document.querySelector('[data-action="font-inc"]');
  if (fontIncBtn) {
    fontIncBtn.addEventListener("click", function () {
      fontStep = Math.min(fontStep + 1, 3);
      document.documentElement.style.setProperty("--fontscale", (1 + fontStep * 0.08).toFixed(2));
    });
  }
  var fontDecBtn = document.querySelector('[data-action="font-dec"]');
  if (fontDecBtn) {
    fontDecBtn.addEventListener("click", function () {
      fontStep = Math.max(fontStep - 1, -1);
      document.documentElement.style.setProperty("--fontscale", (1 + fontStep * 0.08).toFixed(2));
    });
  }
  var contrastBtn = document.querySelector('[data-action="contrast"]');
  if (contrastBtn) {
    contrastBtn.addEventListener("click", function () {
      var cur = document.body.getAttribute("data-contrast");
      document.body.setAttribute("data-contrast", cur === "high" ? "normal" : "high");
    });
  }

  // Language selector
  document.querySelectorAll(".lang-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (typeof applyLanguage === "function") {
        applyLanguage(btn.dataset.langBtn);
      }
    });
  });

  // Scroll Progress Bar & Sticky Header Spy
  var progressBar = document.getElementById("scrollProgressBar");
  var siteNav = document.getElementById("siteNav");

  window.addEventListener("scroll", function () {
    var winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    if (progressBar) progressBar.style.width = scrolled + "%";

    if (siteNav) {
      if (winScroll > 40) siteNav.classList.add("is-scrolled");
      else siteNav.classList.remove("is-scrolled");
    }
  });

  /* ============================================================
     PUSH NOTIFICATIONS CENTER
     ============================================================ */
  var notifBell = document.getElementById("notifBell");
  var notifDropdown = document.getElementById("notifDropdown");
  var notifClose = document.getElementById("notifClose");
  var notifList = document.getElementById("notifList");
  var notifBadge = document.getElementById("notifBadge");
  var enablePushBtn = document.getElementById("enablePushBtn");

  function playNotificationAudio() {
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      var audioCtx = new AudioContextClass();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  async function loadNotifications() {
    try {
      var res = await apiFetch("notifications");
      var list = res.notifications || [];
      if (notifBadge) {
        notifBadge.textContent = String(list.length);
        notifBadge.style.display = list.length > 0 ? "flex" : "none";
      }

      if (notifList) {
        if (list.length === 0) {
          notifList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--slate);font-size:0.85rem;">Tidak ada notifikasi baru.</div>';
          return;
        }
        notifList.innerHTML = list
          .map(function (n) {
            var timeStr = new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              '<div class="notif-item is-unread" data-id="' + escapeHtml(n.id) + '">' +
              '  <div style="display:flex;justify-content:space-between;align-items:center;">' +
              '    <span class="notif-tag notif-tag--' + escapeHtml(n.category || "info") + '">' + escapeHtml(n.category || "info") + '</span>' +
              '    <span class="notif-time">' + escapeHtml(timeStr) + '</span>' +
              '  </div>' +
              '  <h5>' + escapeHtml(n.title) + '</h5>' +
              '  <p>' + escapeHtml(n.body) + '</p>' +
              '</div>'
            );
          })
          .join("");
      }
    } catch (e) {
      console.warn("Could not load notifications:", e);
    }
  }

  if (notifBell) {
    notifBell.addEventListener("click", function () {
      if (notifDropdown) notifDropdown.classList.toggle("is-open");
    });
  }
  if (notifClose) {
    notifClose.addEventListener("click", function () {
      if (notifDropdown) notifDropdown.classList.remove("is-open");
    });
  }

  if (enablePushBtn) {
    enablePushBtn.addEventListener("click", async function () {
      if ("Notification" in window) {
        var perm = await Notification.requestPermission();
        if (perm === "granted") {
          playNotificationAudio();
          new Notification("Dinas Pariwisata Banten", {
            body: "Notifikasi browser aktif! Anda akan menerima update kalender event & cuaca wisata secara langsung.",
            icon: "assets/logo/logo_ebe_small.png",
          });
          toast("Notifikasi browser berhasil diaktifkan!");
          if (notifDropdown) notifDropdown.classList.remove("is-open");
        } else {
          alert("Izin notifikasi ditolak oleh browser.");
        }
      } else {
        alert("Browser Anda belum mendukung Web Notification API.");
      }
    });
  }

  /* ============================================================
     RENDER ENGINE — PUBLIC PORTAL
     ============================================================ */
  function applySettings() {
    if (!SITE_DATA || !SITE_DATA.settings) return;
    var s = SITE_DATA.settings;
    document.title = s.title + " " + s.subtitle + " — Exciting Banten";
    var t = document.getElementById("siteTitleText");
    if (t) t.textContent = s.title;
    var sub = document.getElementById("siteSubtitleText");
    if (sub) sub.textContent = s.subtitle;
    var ft = document.getElementById("footerTagline");
    if (ft) ft.textContent = s.footerTagline;
    document.querySelectorAll("#siteLogoImg, .footer-logo").forEach(function (img) {
      img.src = s.logo;
    });
    if (s.colors) {
      Object.entries(s.colors).forEach(function (pair) {
        document.documentElement.style.setProperty(pair[0], pair[1]);
      });
    }
  }

  function renderHeroPublic() {
    if (!SITE_DATA || !SITE_DATA.hero) return;
    var h = SITE_DATA.hero;

    // Eyebrow & Titles
    var eye = document.querySelector(".hero .eyebrow-mono span[data-i18n='hero.eyebrow']");
    if (eye) eye.textContent = h.eyebrow;
    var t1 = document.querySelector(".hero-title [data-i18n='hero.title1']");
    if (t1) t1.textContent = h.title1;
    var t2 = document.querySelector(".hero-title [data-i18n='hero.title2']");
    if (t2) t2.textContent = h.title2;
    var t3 = document.querySelector(".hero-title [data-i18n='hero.title3']");
    if (t3) t3.textContent = h.title3;

    var sub = document.querySelector(".hero-sub");
    if (sub) sub.textContent = h.subtitle;

    // Search Input & Button
    var sInput = document.getElementById("heroSearchInput");
    if (sInput) sInput.placeholder = h.searchPlaceholder || "Mau ke mana?";
    var sBtn = document.querySelector("#heroSearchForm button[type='submit']");
    if (sBtn) sBtn.textContent = h.searchBtnText || "Cari Wisata";

    // CTAs
    var cta1 = document.querySelector(".hero-ctas a.btn-primary");
    if (cta1) {
      cta1.textContent = h.cta1Text || "Jelajahi Destinasi";
      if (h.cta1Href) cta1.href = h.cta1Href;
    }
    var cta2 = document.getElementById("heroAskBadak");
    if (cta2) {
      cta2.textContent = h.cta2Text || "Tanya Si Badak AI 🦏";
    }

    // Background Slides
    var slidesWrap = document.getElementById("heroSlides");
    if (slidesWrap && Array.isArray(h.slides) && h.slides.length > 0) {
      slidesWrap.innerHTML = h.slides.map(function (item, idx) {
        var imgUrl = typeof item === "string" ? item : (item && item.url ? item.url : "");
        return '<div class="hero-slide ' + (idx === 0 ? "is-active" : "") + '" style="background-image:url(\'' + escapeHtml(imgUrl) + '\')"></div>';
      }).join("");

      slides = document.querySelectorAll(".hero-slide");
      currentSlide = 0;
      if (dotsContainer) {
        dotsContainer.innerHTML = Array.from(slides)
          .map(function (_, i) {
            return '<button type="button" class="hero-dot ' + (i === 0 ? "is-active" : "") + '" data-slide="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
          })
          .join("");
        dotsContainer.querySelectorAll(".hero-dot").forEach(function (dot) {
          dot.addEventListener("click", function () {
            setSlide(Number(dot.dataset.slide));
          });
        });
      }
    }

    // Ticker Bar
    var tickerTrack = document.querySelector(".ticker-track");
    if (tickerTrack && Array.isArray(h.tickerItems)) {
      tickerTrack.innerHTML = h.tickerItems.map(function (item) {
        return '<span>' + escapeHtml(item) + '</span><span class="ticker-sep">◆</span>';
      }).join("");
    }

    // Weather Cards
    var weatherInner = document.querySelector(".weather-inner");
    if (weatherInner && Array.isArray(h.weatherCards)) {
      weatherInner.innerHTML = h.weatherCards.map(function (w) {
        return (
          '<div class="weather-card">' +
          '  <div class="weather-loc">' +
          '    <h5>' + escapeHtml(w.name) + '</h5>' +
          '    <span>' + escapeHtml(w.detail) + '</span>' +
          '  </div>' +
          '  <div class="weather-temp">' + escapeHtml(w.temp) + '</div>' +
          '</div>'
        );
      }).join("");
    }
  }

  function renderBadakPublic() {
    if (!SITE_DATA || !SITE_DATA.badakConfig) return;
    var b = SITE_DATA.badakConfig;

    // Floating Button Text
    var fabText = document.querySelector(".badak-fab-text");
    if (fabText) {
      fabText.innerHTML = escapeHtml(b.fabText) + "<br><small style='font-size:0.75rem;opacity:0.85;'>" + escapeHtml(b.fabSub || "") + "</small>";
    }

    // Panel Header
    var headTitle = document.querySelector(".badak-head-text strong");
    if (headTitle) headTitle.textContent = b.panelTitle || "Si Badak — Asisten Wisata AI Banten";

    var headStatus = document.querySelector(".badak-head-text .beacon-status span[data-i18n='badak.status']");
    if (headStatus) headStatus.textContent = b.panelStatus || "Sistem Aktif & Terhubung ke Gemini 3.7";

    // Chat Input Placeholder & Button
    if (badakInput) badakInput.placeholder = b.inputPlaceholder || "Ketik pertanyaan wisata Banten di sini...";
    var bFormBtn = document.querySelector("#badakForm button[type='submit']");
    if (bFormBtn) bFormBtn.textContent = b.btnSendText || "↑";

    // Suggestion Chips
    var chipsWrap = document.getElementById("badakSuggestChips");
    if (chipsWrap && Array.isArray(b.suggestChips)) {
      chipsWrap.innerHTML = b.suggestChips.map(function (chip) {
        return '<button type="button" class="chip" data-ask="' + escapeHtml(chip.prompt) + '">' + escapeHtml(chip.label) + '</button>';
      }).join("");

      chipsWrap.querySelectorAll(".chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          askBadak(chip.dataset.ask);
        });
      });
    }
  }

  function renderButtonsPublic() {
    if (!SITE_DATA || !SITE_DATA.buttons) return;
    var btn = SITE_DATA.buttons;

    var adminBtn = document.getElementById("adminEntry");
    if (adminBtn) adminBtn.textContent = btn.adminEntry || "⚙ Admin";

    var sTrigSpan = document.querySelector("#searchTrigger span");
    if (sTrigSpan) sTrigSpan.textContent = btn.searchTrigger || "Cari";

    var pushBtn = document.getElementById("enablePushBtn");
    if (pushBtn) pushBtn.textContent = btn.enablePush || "🔔 Aktifkan Notifikasi Browser";

    var scrollSpan = document.querySelector("#scrollCue span");
    if (scrollSpan) scrollSpan.textContent = btn.scrollCue || "Gulir";

    var ekrafAudioBtn = document.getElementById("ekrafReadAll");
    if (ekrafAudioBtn) ekrafAudioBtn.textContent = btn.ekrafAudioAll || "🔊 Dengarkan Ringkasan Audio Halaman Ini";

    var planBtnEl = document.getElementById("planBtn");
    if (planBtnEl) planBtnEl.textContent = btn.plannerGenerate || "Buat Rekomendasi Rute";
  }

  function renderSectionsPublic() {
    if (!SITE_DATA || !SITE_DATA.sections) return;
    var sec = SITE_DATA.sections;

    // Helper to set section text
    function setSec(secId, obj) {
      if (!obj) return;
      var el = document.getElementById(secId);
      if (!el) return;
      var eye = el.querySelector(".eyebrow-mono");
      if (eye && obj.eyebrow) eye.textContent = obj.eyebrow;
      var title = el.querySelector(".section-title");
      if (title && obj.title) title.textContent = obj.title;
      var lede = el.querySelector(".section-lede");
      if (lede && obj.lede) lede.textContent = obj.lede;
    }

    setSec("destinasi", sec.destinasi);
    setSec("religi", sec.religi);
    setSec("akomodasi", sec.akomodasi);
    setSec("paket", sec.paket);
    setSec("kalender", sec.kalender);
    setSec("ekraf", sec.ekraf);
    setSec("rencana", sec.rencana);
    setSec("informasi", sec.informasi);
    setSec("pengalaman", sec.pengalaman);

    // Dynamic Experience Tabs Rendering
    if (sec.pengalaman && Array.isArray(sec.pengalaman.tabs)) {
      var tabControls = document.querySelector(".tab-controls");
      if (tabControls) {
        tabControls.innerHTML = sec.pengalaman.tabs.map(function (tab, idx) {
          return (
            '<button class="tab-btn ' + (idx === 0 ? "is-active" : "") + '" role="tab" aria-selected="' + (idx === 0 ? "true" : "false") + '" data-tab="' + escapeHtml(tab.id) + '">' +
            '  <span class="tab-num">0' + (idx + 1) + '</span>' + escapeHtml(tab.label) +
            '</button>'
          );
        }).join("");
      }

      // Render tab panels dynamically if needed or update existing
      sec.pengalaman.tabs.forEach(function (tab) {
        var panel = document.querySelector('.tab-panel[data-panel="' + tab.id + '"]');
        if (panel) {
          var featH3 = panel.querySelector(".panel-feature-text h3");
          if (featH3) featH3.textContent = tab.featureTitle;
          var featP = panel.querySelector(".panel-feature-text p");
          if (featP) featP.textContent = tab.featureDesc;
          var featImg = panel.querySelector(".panel-feature-img");
          if (featImg && tab.featureImg) featImg.style.backgroundImage = "url('" + tab.featureImg + "')";
        }
      });

      // Rebind tab buttons
      document.querySelectorAll(".tab-btn").forEach(function (tab) {
        tab.addEventListener("click", function () {
          document.querySelectorAll(".tab-btn").forEach(function (t) {
            t.classList.remove("is-active");
            t.setAttribute("aria-selected", "false");
          });
          document.querySelectorAll(".tab-panel").forEach(function (p) {
            p.classList.remove("is-active");
          });
          tab.classList.add("is-active");
          tab.setAttribute("aria-selected", "true");
          var targetPanel = document.querySelector('.tab-panel[data-panel="' + tab.dataset.tab + '"]');
          if (targetPanel) targetPanel.classList.add("is-active");
        });
      });
    }
  }

  function renderFooterPublic() {
    if (!SITE_DATA || !SITE_DATA.footer) return;
    var f = SITE_DATA.footer;

    var ft = document.getElementById("footerTagline");
    if (ft) ft.textContent = f.tagline;

    var cols = document.querySelectorAll(".footer-col");
    if (cols[0] && f.col1Title) {
      var h5 = cols[0].querySelector("h5");
      if (h5) h5.textContent = f.col1Title;
    }
    if (cols[1] && f.col2Title) {
      var h5 = cols[1].querySelector("h5");
      if (h5) h5.textContent = f.col2Title;
    }
    if (cols[2] && f.col3Title) {
      var h5 = cols[2].querySelector("h5");
      if (h5) h5.textContent = f.col3Title;
      var links = cols[2].querySelectorAll("a");
      if (links[0]) links[0].textContent = f.officeAddress;
      if (links[1]) {
        links[1].textContent = f.officeEmail;
        links[1].href = "mailto:" + f.officeEmail;
      }
      if (links[2]) {
        links[2].textContent = f.officePhone;
        links[2].href = "tel:" + f.officePhone.replace(/[^0-9+]/g, "");
      }
    }

    var copySpan = document.querySelector(".footer-bottom span[data-i18n='footer.copy']");
    if (copySpan) copySpan.textContent = f.copyright;

    var coordSpan = document.querySelector(".footer-bottom .coord-tag");
    if (coordSpan) coordSpan.textContent = f.coord;
  }

  function renderMenu() {
    if (!SITE_DATA || !SITE_DATA.menu) return;
    var nav = document.querySelector(".nav-links");
    var mobile = document.getElementById("mobileMenu");
    var askBadakText = (SITE_DATA.badakConfig && SITE_DATA.badakConfig.fabText) || "Tanya Si Badak AI";
    if (nav) {
      nav.innerHTML = SITE_DATA.menu.map(function (m) {
        return '<a href="' + escapeHtml(m.href) + '">' + escapeHtml(m.label) + '</a>';
      }).join("");
    }
    if (mobile) {
      mobile.innerHTML =
        SITE_DATA.menu.map(function (m) {
          return '<a href="' + escapeHtml(m.href) + '">' + escapeHtml(m.label) + '</a>';
        }).join("") +
        '<div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--line);">' +
        '  <button type="button" class="btn btn-primary btn-block" id="mobileAskBadak">🦏 ' + escapeHtml(askBadakText) + '</button>' +
        '</div>';
      var mobBtn = document.getElementById("mobileAskBadak");
      if (mobBtn) {
        mobBtn.addEventListener("click", function () {
          mobile.classList.remove("is-open");
          openBadak();
        });
      }
    }
  }

  function renderDestinations() {
    var rail = document.getElementById("destRail");
    if (!rail || !SITE_DATA || !SITE_DATA.destinations) return;
    rail.innerHTML = SITE_DATA.destinations
      .map(function (d) {
        return (
          '<article class="dest-card">' +
          '  <div class="dest-card-img" style="background-image:url(\'' + escapeHtml(d.img) + '\')"></div>' +
          '  <div class="dest-card-body">' +
          '    <span class="coord-tag small">📍 ' + escapeHtml(d.coord) + '</span>' +
          '    <h3>' + escapeHtml(d.title) + '</h3>' +
          '    <p>' + escapeHtml(d.desc) + '</p>' +
          '    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">' +
          '      <span class="dest-tag">' + escapeHtml(d.tag) + '</span>' +
          '      <button type="button" class="btn btn-outline-dark ask-dest-btn" data-title="' + escapeHtml(d.title) + '">🦏 Tanya Si Badak</button>' +
          '    </div>' +
          '  </div>' +
          '</article>'
        );
      })
      .join("");

    rail.querySelectorAll(".ask-dest-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openBadak();
        askBadak("Ceritakan detail daya tarik, rute, dan tiket masuk " + btn.dataset.title);
      });
    });
  }

  function renderReligi() {
    var grid = document.getElementById("religiGrid");
    if (!grid || !SITE_DATA || !SITE_DATA.religi) return;
    grid.innerHTML = SITE_DATA.religi
      .map(function (r) {
        return (
          '<article class="content-card">' +
          '  <div class="content-card-img" style="background-image:url(\'' + escapeHtml(r.img) + '\')"></div>' +
          '  <div class="content-card-body">' +
          '    <span class="coord-tag small">🕌 ' + escapeHtml(r.coord) + '</span>' +
          '    <h3>' + escapeHtml(r.title) + '</h3>' +
          '    <p>' + escapeHtml(r.desc) + '</p>' +
          '    <span class="dest-tag">' + escapeHtml(r.category) + '</span>' +
          '  </div>' +
          '</article>'
        );
      })
      .join("");
  }

  function renderAkomodasi() {
    var grid = document.getElementById("akomodasiGrid");
    if (!grid || !SITE_DATA || !SITE_DATA.akomodasi) return;
    grid.innerHTML = SITE_DATA.akomodasi
      .map(function (a) {
        return (
          '<div class="stay-card" style="background-image:url(\'' + escapeHtml(a.img) + '\')">' +
          '  <div class="stay-card-text">' +
          '    <h4>' + escapeHtml(a.title) + '</h4>' +
          '    <p>' + escapeHtml(a.desc) + '</p>' +
          '    <span class="chip" style="background:var(--ember);color:#fff;border:none;">' + escapeHtml(a.type) + '</span>' +
          '  </div>' +
          '</div>'
        );
      })
      .join("");
  }

  function renderPaket() {
    var grid = document.getElementById("paketGrid");
    if (!grid || !SITE_DATA || !SITE_DATA.paket) return;
    grid.innerHTML = SITE_DATA.paket
      .map(function (p) {
        return (
          '<article class="paket-card">' +
          '  <div class="paket-card-img" style="background-image:url(\'' + escapeHtml(p.img) + '\')">' +
          '    <span class="paket-price">' + escapeHtml(p.price) + '</span>' +
          '  </div>' +
          '  <div class="paket-card-body">' +
          '    <span class="coord-tag small">⏱ ' + escapeHtml(p.duration) + '</span>' +
          '    <h3>' + escapeHtml(p.title) + '</h3>' +
          '    <p>' + escapeHtml(p.desc) + '</p>' +
          '    <button type="button" class="btn btn-primary btn-block paket-order-btn" data-title="' + escapeHtml(p.title) + '">Tanya Detail Paket Ini</button>' +
          '  </div>' +
          '</article>'
        );
      })
      .join("");

    grid.querySelectorAll(".paket-order-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openBadak();
        askBadak('Saya tertarik dengan paket wisata: "' + btn.dataset.title + '". Tolong jelaskan fasilitas, rute, dan cara pemesanannya.');
      });
    });
  }

  function renderKalender() {
    var list = document.getElementById("kalenderList");
    if (!list || !SITE_DATA || !SITE_DATA.kalender) return;
    list.innerHTML = SITE_DATA.kalender
      .map(function (k) {
        return (
          '<article class="event-card">' +
          '  <div class="event-card-img" style="background-image:url(\'' + escapeHtml(k.img) + '\')"></div>' +
          '  <div class="event-card-body">' +
          '    <span class="event-date">📅 ' + escapeHtml(k.date) + '</span>' +
          '    <h3>' + escapeHtml(k.title) + '</h3>' +
          '    <p>' + escapeHtml(k.desc) + '</p>' +
          '    <span class="event-loc">📍 ' + escapeHtml(k.location) + '</span>' +
          '  </div>' +
          '</article>'
        );
      })
      .join("");
  }

  function renderEkraf() {
    var grid = document.getElementById("ekrafGrid");
    if (!grid || !SITE_DATA || !SITE_DATA.ekraf) return;
    grid.innerHTML = SITE_DATA.ekraf
      .map(function (e) {
        return (
          '<article class="content-card grid-cards--ekraf">' +
          '  <div class="content-card-body">' +
          '    <div class="ekraf-icon">' + (e.icon || "🎨") + '</div>' +
          '    <span class="coord-tag small">' + escapeHtml(e.category) + '</span>' +
          '    <h3>' + escapeHtml(e.title) + '</h3>' +
          '    <p>' + escapeHtml(e.desc) + '</p>' +
          '    <button type="button" class="btn btn-outline-dark ekraf-speak-btn" data-text="' + escapeHtml(e.title + '. ' + e.desc) + '">🔊 Putar Audio Narasi</button>' +
          '  </div>' +
          '</article>'
        );
      })
      .join("");

    grid.querySelectorAll(".ekraf-speak-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        speakText(btn.dataset.text);
      });
    });
  }

  function speakText(text) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
      toast("Memutar narasi audio...");
    } else {
      alert("Browser tidak mendukung sintesis suara (TTS).");
    }
  }

  var ekrafAllBtn = document.getElementById("ekrafReadAll");
  if (ekrafAllBtn) {
    ekrafAllBtn.addEventListener("click", function () {
      if (!SITE_DATA || !SITE_DATA.ekraf) return;
      var summary =
        "Berikut produk ekonomi kreatif unggulan Banten: " +
        SITE_DATA.ekraf.map(function (e) {
          return e.title + ", kategori " + e.category + ". " + e.desc;
        }).join(" ");
      speakText(summary);
    });
  }

  function renderAll() {
    applySettings();
    renderHeroPublic();
    renderBadakPublic();
    renderButtonsPublic();
    renderSectionsPublic();
    renderFooterPublic();
    renderMenu();
    renderDestinations();
    renderReligi();
    renderAkomodasi();
    renderPaket();
    renderKalender();
    renderEkraf();
  }

  /* ============================================================
     HERO CAROUSEL & SEARCH
     ============================================================ */
  var slides = document.querySelectorAll(".hero-slide");
  var dotsContainer = document.getElementById("heroDots");
  var currentSlide = 0;

  if (dotsContainer && slides.length > 0) {
    dotsContainer.innerHTML = Array.from(slides)
      .map(function (_, i) {
        return '<button type="button" class="hero-dot ' + (i === 0 ? "is-active" : "") + '" data-slide="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
      })
      .join("");

    dotsContainer.querySelectorAll(".hero-dot").forEach(function (dot) {
      dot.addEventListener("click", function () {
        setSlide(Number(dot.dataset.slide));
      });
    });
  }

  function setSlide(index) {
    var curSlides = document.querySelectorAll(".hero-slide");
    if (!curSlides || curSlides.length === 0) return;
    curSlides.forEach(function (s) { s.classList.remove("is-active"); });
    if (dotsContainer) {
      dotsContainer.querySelectorAll(".hero-dot").forEach(function (d) { d.classList.remove("is-active"); });
    }
    currentSlide = (index + curSlides.length) % curSlides.length;
    if (curSlides[currentSlide]) curSlides[currentSlide].classList.add("is-active");
    if (dotsContainer) {
      var activeDot = dotsContainer.querySelectorAll(".hero-dot")[currentSlide];
      if (activeDot) activeDot.classList.add("is-active");
    }
  }

  setInterval(function () {
    setSlide(currentSlide + 1);
  }, 6000);

  // Search Logic
  var searchTrigger = document.getElementById("searchTrigger");
  var searchOverlay = document.getElementById("searchOverlay");
  var searchClose = document.getElementById("searchClose");
  var searchInput = document.getElementById("searchInput");
  var searchResults = document.getElementById("searchResults");

  function openSearch() {
    if (searchOverlay) searchOverlay.classList.add("is-open");
    setTimeout(function () {
      if (searchInput) searchInput.focus();
    }, 200);
  }
  function closeSearch() {
    if (searchOverlay) searchOverlay.classList.remove("is-open");
  }

  if (searchTrigger) searchTrigger.addEventListener("click", openSearch);
  if (searchClose) searchClose.addEventListener("click", closeSearch);
  if (searchOverlay) {
    searchOverlay.addEventListener("click", function (e) {
      if (e.target === searchOverlay) closeSearch();
    });
  }

  function performSearch(query) {
    if (!SITE_DATA || !searchResults) return;
    var q = (query || "").toLowerCase().trim();
    if (!q) {
      searchResults.innerHTML = "";
      return;
    }

    var matched = [];
    if (SITE_DATA.destinations) {
      SITE_DATA.destinations.forEach(function (d) {
        if (d.title.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)) {
          matched.push({ title: d.title, type: "Destinasi", desc: d.desc, href: "#destinasi" });
        }
      });
    }
    if (SITE_DATA.religi) {
      SITE_DATA.religi.forEach(function (r) {
        if (r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) {
          matched.push({ title: r.title, type: "Wisata Religi", desc: r.desc, href: "#religi" });
        }
      });
    }
    if (SITE_DATA.paket) {
      SITE_DATA.paket.forEach(function (p) {
        if (p.title.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)) {
          matched.push({ title: p.title, type: "Paket Wisata", desc: p.desc, href: "#paket" });
        }
      });
    }
    if (SITE_DATA.ekraf) {
      SITE_DATA.ekraf.forEach(function (e) {
        if (e.title.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)) {
          matched.push({ title: e.title, type: "Produk Ekraf", desc: e.desc, href: "#ekraf" });
        }
      });
    }

    if (matched.length === 0) {
      searchResults.innerHTML = '<div style="padding:20px;text-align:center;color:var(--slate);">Tidak ada hasil untuk "<strong>' + escapeHtml(query) + '</strong>". Coba tanyakan pada Si Badak AI.</div>';
      return;
    }

    searchResults.innerHTML = matched
      .map(function (m) {
        return (
          '<a href="' + m.href + '" class="search-item" onclick="document.getElementById(\'searchOverlay\').classList.remove(\'is-open\')">' +
          '  <div>' +
          '    <strong style="font-size:0.95rem;">' + escapeHtml(m.title) + '</strong>' +
          '    <p style="margin:2px 0 0;font-size:0.8rem;color:var(--slate);">' + escapeHtml(m.desc.slice(0, 80)) + '...</p>' +
          '  </div>' +
          '  <span class="chip">' + escapeHtml(m.type) + '</span>' +
          '</a>'
        );
      })
      .join("");
  }

  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      performSearch(e.target.value);
    });
  }
  document.querySelectorAll(".search-suggest .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      if (searchInput) {
        searchInput.value = chip.dataset.search;
        performSearch(chip.dataset.search);
      }
    });
  });

  var heroSearchForm = document.getElementById("heroSearchForm");
  if (heroSearchForm) {
    heroSearchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = document.getElementById("heroSearchInput");
      var val = input ? input.value : "";
      if (val) {
        openSearch();
        if (searchInput) {
          searchInput.value = val;
          performSearch(val);
        }
      }
    });
  }

  // Mobile menu toggle
  var menuTrigger = document.getElementById("menuTrigger");
  var mobileMenu = document.getElementById("mobileMenu");
  if (menuTrigger) {
    menuTrigger.addEventListener("click", function () {
      var isOpen = mobileMenu ? mobileMenu.classList.toggle("is-open") : false;
      menuTrigger.classList.toggle("is-open", isOpen);
    });
  }

  // Rail scroll arrow controls
  document.querySelectorAll(".rail-arrow").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var rail = document.getElementById(btn.dataset.rail);
      if (rail) {
        var dir = Number(btn.dataset.dir || 1);
        rail.scrollBy({ left: dir * 380, behavior: "smooth" });
      }
    });
  });

  // Experiences Tabs
  document.querySelectorAll(".tab-btn").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (t) {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-panel").forEach(function (p) {
        p.classList.remove("is-active");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      var targetPanel = document.querySelector('.tab-panel[data-panel="' + tab.dataset.tab + '"]');
      if (targetPanel) targetPanel.classList.add("is-active");
    });
  });

  /* ============================================================
     INTERACTIVE TRIP PLANNER
     ============================================================ */
  var interestChips = document.querySelectorAll("#interestChips .planner-chip");
  var selectedInterest = "alam";

  interestChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      interestChips.forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      selectedInterest = chip.dataset.interest;
    });
  });

  var planBtn = document.getElementById("planBtn");
  if (planBtn) {
    planBtn.addEventListener("click", function () {
      var durasiSelect = document.getElementById("durasiSelect");
      var durasi = durasiSelect ? durasiSelect.value : "2";
      var resultBox = document.getElementById("plannerResult");
      if (!resultBox) return;

      var planHtml = "";
      if (selectedInterest === "alam") {
        planHtml =
          '<div class="planner-route-plan">' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 1: Perjalanan Darat Menuju Pesisir Sumur &amp; Pulau Peucang</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Berangkat pagi dari Jakarta/Serang menuju Sumur (06°45\'S 105°20\'E), menyeberang kapal motor ke Pulau Peucang, pasang tenda di tepi pantai pasir putih.</p>' +
          '  </div>' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 2: Savana Cidaon &amp; Kano Sungai Purba Cigenter</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Mengamati satwa liar badak jawa dan banteng liar di savana Cidaon saat fajar, dilanjutkan susur kano sungai Cigenter.</p>' +
          '  </div>' +
          (durasi >= "3"
            ? '  <div class="planner-day-block">' +
              '    <h4 class="planner-day-title">Hari 3: Snorkeling Karang Sangiang &amp; Senja Anyer</h4>' +
              '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Kembali ke pesisir utara, singgah di Mercusuar Cikoneng Anyer untuk menikmati matahari terbenam.</p>' +
              '  </div>'
            : "") +
          '  <button type="button" class="btn btn-primary" id="sendPlanToAi" style="margin-top:12px;">💬 Diskusikan Rute Ini dengan Si Badak AI</button>' +
          '</div>';
      } else if (selectedInterest === "budaya") {
        planHtml =
          '<div class="planner-route-plan">' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 1: Menuju Terminal Ciboleger &amp; Trekking ke Kanekes Baduy</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Tiba di Ciboleger (06°32\'S 106°22\'E), berjalan kaki santai bersama warga lokal, menginap di rumah panggung adat kayu Baduy.</p>' +
          '  </div>' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 2: Belajar Tenun Gedogan &amp; Alunan Angklung Buhun</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Menyaksikan proses tenun tradisional wanita Baduy, mencicipi madu hutan asli, dan kembali dengan suasana segar.</p>' +
          '  </div>' +
          '  <button type="button" class="btn btn-primary" id="sendPlanToAi" style="margin-top:12px;">💬 Diskusikan Rute Ini dengan Si Badak AI</button>' +
          '</div>';
      } else if (selectedInterest === "religi") {
        planHtml =
          '<div class="planner-route-plan">' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 1: Ziarah Masjid Agung Banten &amp; Keraton Kaibon</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Ziarah makam Sultan Maulana Hasanuddin, menaiki menara kuno bergaya pagoda (06°02\'S 106°09\'E), dan napak tilas Keraton Surosowan.</p>' +
          '  </div>' +
          '  <button type="button" class="btn btn-primary" id="sendPlanToAi" style="margin-top:12px;">💬 Diskusikan Rute Ini dengan Si Badak AI</button>' +
          '</div>';
      } else {
        planHtml =
          '<div class="planner-route-plan">' +
          '  <div class="planner-day-block">' +
          '    <h4 class="planner-day-title">Hari 1: Eksplorasi Bawah Laut Pulau Sangiang &amp; Pantai Anyer</h4>' +
          '    <p style="margin:0;font-size:0.85rem;color:#E2E8F0;">Snorkeling di Legon Bajo (05°55\'S 105°49\'E), jelajah Goa Kelelawar laut, makan malam seafood di pesisir Anyer.</p>' +
          '  </div>' +
          '  <button type="button" class="btn btn-primary" id="sendPlanToAi" style="margin-top:12px;">💬 Diskusikan Rute Ini dengan Si Badak AI</button>' +
          '</div>';
      }

      resultBox.innerHTML = planHtml;
      var sendAiBtn = document.getElementById("sendPlanToAi");
      if (sendAiBtn) {
        sendAiBtn.addEventListener("click", function () {
          openBadak();
          askBadak("Tolong berikan estimasi rincian biaya, tips keselamatan, dan rekomendasi tempat makan untuk itinerary wisata minat " + selectedInterest + " durasi " + durasi + " hari ini.");
        });
      }
    });
  }

  /* ============================================================
     SI BADAK — GEMINI AI ASSISTANT & CHAT HISTORY
     ============================================================ */
  var badakFab = document.getElementById("badakFab");
  var badakPanel = document.getElementById("badakPanel");
  var badakOverlay = document.getElementById("badakOverlay");
  var badakClose = document.getElementById("badakClose");
  var badakMessages = document.getElementById("badakMessages");
  var badakForm = document.getElementById("badakForm");
  var badakInput = document.getElementById("badakInput");
  var badakHistoryToggle = document.getElementById("badakHistoryToggle");
  var badakHistoryDrawer = document.getElementById("badakHistoryDrawer");
  var badakHistoryClose = document.getElementById("badakHistoryClose");
  var badakHistoryList = document.getElementById("badakHistoryList");
  var badakNewChat = document.getElementById("badakNewChat");
  var badakClearHistoryBtn = document.getElementById("badakClearHistoryBtn");

  var chatSessions = [];
  try {
    chatSessions = JSON.parse(localStorage.getItem("banten_chat_sessions") || "[]");
  } catch (e) {
    chatSessions = [];
  }

  var currentSessionId = uid("session-");

  function saveSessionsToStorage() {
    localStorage.setItem("banten_chat_sessions", JSON.stringify(chatSessions));
    renderHistoryDrawer();
  }

  function renderHistoryDrawer() {
    if (!badakHistoryList) return;
    if (chatSessions.length === 0) {
      badakHistoryList.innerHTML = '<p style="font-size:0.8rem;color:var(--slate);text-align:center;margin:20px 0;">Belum ada riwayat percakapan.</p>';
      return;
    }

    badakHistoryList.innerHTML = chatSessions
      .map(function (s) {
        var dateStr = new Date(s.createdAt).toLocaleDateString("id-ID", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        return (
          '<div class="badak-history-item ' + (s.id === currentSessionId ? "is-active" : "") + '" data-id="' + escapeHtml(s.id) + '">' +
          '  <div style="flex:1;overflow:hidden;">' +
          '    <strong style="font-size:0.85rem;display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;">' + escapeHtml(s.title || "Percakapan") + '</strong>' +
          '    <span style="font-size:0.7rem;color:var(--slate);">' + escapeHtml(dateStr) + '</span>' +
          '  </div>' +
          '  <button type="button" class="a11y-btn delete-session-btn" data-del="' + escapeHtml(s.id) + '" title="Hapus sesi ini">🗑</button>' +
          '</div>'
        );
      })
      .join("");

    badakHistoryList.querySelectorAll(".badak-history-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        if (e.target.closest(".delete-session-btn")) return;
        loadChatSession(item.dataset.id);
        if (badakHistoryDrawer) badakHistoryDrawer.classList.remove("is-open");
      });
    });

    badakHistoryList.querySelectorAll(".delete-session-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        chatSessions = chatSessions.filter(function (s) { return s.id !== btn.dataset.del; });
        saveSessionsToStorage();
        if (currentSessionId === btn.dataset.del) {
          startNewChatSession();
        }
      });
    });
  }

  function loadChatSession(sessionId) {
    var session = chatSessions.find(function (s) { return s.id === sessionId; });
    if (!session) return;
    currentSessionId = sessionId;
    if (badakMessages) {
      badakMessages.innerHTML = "";
      session.messages.forEach(function (m) {
        addMessage(m.role, m.text, false);
      });
    }
  }

  function startNewChatSession() {
    currentSessionId = uid("session-");
    if (badakMessages) {
      badakMessages.innerHTML =
        '<div class="msg msg--badak">' +
        '  <p>Sampurasun! Halo, saya <strong>Si Badak</strong>, asisten AI cerdas Dinas Pariwisata Provinsi Banten. Mau liburan ke mana? Tanyakan rute Ujung Kulon, kearifan Baduy, kuliner Rabeg &amp; Sate Bandeng, atau rekomendasi hotel pantai!</p>' +
        '</div>';
    }
    if (badakHistoryDrawer) badakHistoryDrawer.classList.remove("is-open");
  }

  function openBadak() {
    if (badakPanel) badakPanel.classList.add("is-open");
    if (badakOverlay) badakOverlay.classList.add("is-open");
    setTimeout(function () {
      if (badakInput) badakInput.focus();
    }, 300);
  }
  function closeBadak() {
    if (badakPanel) badakPanel.classList.remove("is-open");
    if (badakOverlay) badakOverlay.classList.remove("is-open");
  }

  if (badakFab) badakFab.addEventListener("click", openBadak);
  var heroBadakBtn = document.getElementById("heroAskBadak");
  if (heroBadakBtn) heroBadakBtn.addEventListener("click", openBadak);
  if (badakClose) badakClose.addEventListener("click", closeBadak);
  if (badakOverlay) badakOverlay.addEventListener("click", closeBadak);

  if (badakHistoryToggle) {
    badakHistoryToggle.addEventListener("click", function () {
      if (badakHistoryDrawer) badakHistoryDrawer.classList.toggle("is-open");
      renderHistoryDrawer();
    });
  }
  if (badakHistoryClose) {
    badakHistoryClose.addEventListener("click", function () {
      if (badakHistoryDrawer) badakHistoryDrawer.classList.remove("is-open");
    });
  }
  if (badakNewChat) badakNewChat.addEventListener("click", startNewChatSession);
  if (badakClearHistoryBtn) {
    badakClearHistoryBtn.addEventListener("click", function () {
      if (confirm("Hapus semua riwayat percakapan?")) {
        chatSessions = [];
        saveSessionsToStorage();
        startNewChatSession();
      }
    });
  }

  function formatMarkdown(text) {
    var raw = escapeHtml(text);
    raw = raw.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    raw = raw.replace(/^- (.*$)/gim, "<li>$1</li>");
    raw = raw.replace(/^[0-9]+\. (.*$)/gim, "<li>$1</li>");
    raw = raw.replace(/\n\n/g, "</p><p>");
    raw = raw.replace(/\n/g, "<br>");
    return "<p>" + raw + "</p>";
  }

  function addMessage(role, text, persist) {
    if (persist === undefined) persist = true;
    if (!badakMessages) return;
    var el = document.createElement("div");
    el.className = "msg msg--" + role;

    if (role === "badak") {
      el.innerHTML = formatMarkdown(text);

      var actionsDiv = document.createElement("div");
      actionsDiv.style.display = "flex";
      actionsDiv.style.gap = "8px";
      actionsDiv.style.marginTop = "8px";
      actionsDiv.style.borderTop = "1px solid var(--line)";
      actionsDiv.style.paddingTop = "6px";

      var speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "a11y-btn";
      speakBtn.innerHTML = "🔊 Bacakan";
      speakBtn.onclick = function () { speakText(text); };

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "a11y-btn";
      copyBtn.innerHTML = "📋 Salin";
      copyBtn.onclick = function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
          toast("Teks jawaban disalin.");
        }
      };

      actionsDiv.appendChild(speakBtn);
      actionsDiv.appendChild(copyBtn);
      el.appendChild(actionsDiv);
    } else {
      var p = document.createElement("p");
      p.textContent = text;
      el.appendChild(p);
    }

    badakMessages.appendChild(el);
    badakMessages.scrollTop = badakMessages.scrollHeight;

    if (persist) {
      var session = chatSessions.find(function (s) { return s.id === currentSessionId; });
      if (!session) {
        session = {
          id: currentSessionId,
          title: text.slice(0, 32) + (text.length > 32 ? "..." : ""),
          createdAt: new Date().toISOString(),
          messages: [],
        };
        chatSessions.unshift(session);
      }
      session.messages.push({ role: role, text: text });
      saveSessionsToStorage();
    }

    return el;
  }

  async function askBadak(text) {
    if (!text || !text.trim() || !badakMessages) return;
    var clean = text.trim();
    addMessage("user", clean);
    if (badakInput) badakInput.value = "";

    var typing = document.createElement("div");
    typing.className = "msg msg--badak";
    typing.innerHTML = '<div class="msg-typing"><span></span><span></span><span></span></div>';
    badakMessages.appendChild(typing);
    badakMessages.scrollTop = badakMessages.scrollHeight;

    var session = chatSessions.find(function (s) { return s.id === currentSessionId; });
    var historyPayload = (session ? session.messages : []).map(function (m) {
      return {
        role: m.role === "user" ? "user" : "model",
        text: m.text,
      };
    });

    var currentLang = document.body.getAttribute("data-lang") || "id";

    try {
      var res = await apiFetch("gemini/chat", {
        method: "POST",
        body: JSON.stringify({
          message: clean,
          history: historyPayload,
          language: currentLang,
        }),
      });

      typing.remove();
      addMessage("badak", res.reply || "Maaf, saya tidak dapat merespons saat ini.");
    } catch (err) {
      typing.remove();
      addMessage("badak", "Mohon maaf, terjadi kendala komunikasi dengan server AI: " + (err.message || "") + ". Silakan coba tanyakan kembali.");
    }
  }

  if (badakForm) {
    badakForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = badakInput ? badakInput.value : "";
      askBadak(val);
    });
  }

  document.querySelectorAll("#badakSuggestChips .chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      askBadak(chip.dataset.ask);
    });
  });

  /* ============================================================
     ADMIN DASHBOARD & CMS
     ============================================================ */
  var publicSite = document.getElementById("publicSite");
  var adminLogin = document.getElementById("adminLogin");
  var adminDash = document.getElementById("adminDash");

  function showView(view) {
    if (publicSite) publicSite.style.display = view === "public" ? "" : "none";
    if (adminLogin) adminLogin.style.display = view === "login" ? "flex" : "none";
    if (adminDash) adminDash.style.display = view === "dash" ? "flex" : "none";
    document.body.setAttribute("data-view", view);
    window.scrollTo(0, 0);
  }

  var adminEntryBtn = document.getElementById("adminEntry");
  if (adminEntryBtn) {
    adminEntryBtn.addEventListener("click", async function () {
      if (CSRF_TOKEN) {
        await renderAdminAll();
        showView("dash");
      } else {
        showView("login");
      }
    });
  }

  var adminLoginBack = document.getElementById("adminLoginBack");
  if (adminLoginBack) {
    adminLoginBack.addEventListener("click", function () { showView("public"); });
  }

  var adminLogoutBtn = document.getElementById("adminLogout");
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", async function () {
      try {
        await apiFetch("auth?action=logout", { method: "POST" });
      } catch (e) {}
      CSRF_TOKEN = null;
      showView("public");
    });
  }

  var adminLoginForm = document.getElementById("adminLoginForm");
  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var uInput = document.getElementById("adminUsername");
      var pInput = document.getElementById("adminPassword");
      var username = uInput ? uInput.value : "";
      var password = pInput ? pInput.value : "";
      var err = document.getElementById("adminLoginError");
      if (err) err.hidden = true;

      try {
        var data = await apiFetch("auth?action=login", {
          method: "POST",
          body: JSON.stringify({ username: username, password: password }),
        });
        CSRF_TOKEN = data.csrf_token;
        if (pInput) pInput.value = "";
        await renderAdminAll();
        showView("dash");
      } catch (loginErr) {
        if (err) {
          err.textContent = loginErr.message || "Username atau password salah.";
          err.hidden = false;
        }
      }
    });
  }

  async function checkAdminSession() {
    try {
      var data = await apiFetch("auth?action=check");
      if (data.authenticated) CSRF_TOKEN = data.csrf_token;
    } catch (e) {}
  }

  document.querySelectorAll(".admin-nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".admin-nav-btn").forEach(function (b) { b.classList.remove("is-active"); });
      document.querySelectorAll(".admin-panel").forEach(function (p) { p.classList.remove("is-active"); });
      btn.classList.add("is-active");
      var targetPanel = document.querySelector('.admin-panel[data-panel="' + btn.dataset.adminPanel + '"]');
      if (targetPanel) targetPanel.classList.add("is-active");
    });
  });

  function toast(msg) {
    var t = document.getElementById("adminToast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("is-visible");
    setTimeout(function () { t.classList.remove("is-visible"); }, 2600);
  }

  /* ---------- Panel 1: Analytics Dashboard ---------- */
  async function renderAdminAnalytics() {
    var el = document.getElementById("panelAnalytics");
    if (!el) return;

    var stats = {};
    try {
      stats = await apiFetch("analytics");
    } catch (e) {
      stats = { totalVisitors: 48290, aiQueriesTotal: 1420, totalDestinations: 9, totalPackages: 4, activeNotifs: 3, regionsStats: [], interestStats: [], recentQueries: [] };
    }

    var destCount = stats.totalDestinations || ((SITE_DATA && SITE_DATA.destinations ? SITE_DATA.destinations.length : 0) + (SITE_DATA && SITE_DATA.religi ? SITE_DATA.religi.length : 0));
    var pkgCount = stats.totalPackages || (SITE_DATA && SITE_DATA.paket ? SITE_DATA.paket.length : 0);

    el.innerHTML =
      '<h2 class="admin-h2">📊 Dashboard Analitik Pariwisata Real-Time</h2>' +
      '<p class="admin-sub">Pantau statistik kunjungan wisatawan, interaksi AI Si Badak, dan performa konten destinasi Banten.</p>' +
      '<div class="analytics-metrics">' +
      '  <div class="kpi-card">' +
      '    <span>Total Pengunjung Web</span>' +
      '    <h3>' + (stats.totalVisitors || 48290).toLocaleString("id-ID") + '</h3>' +
      '  </div>' +
      '  <div class="kpi-card">' +
      '    <span>Interaksi AI Si Badak</span>' +
      '    <h3>' + (stats.aiQueriesTotal || 1420).toLocaleString("id-ID") + '</h3>' +
      '  </div>' +
      '  <div class="kpi-card">' +
      '    <span>Destinasi &amp; Religi</span>' +
      '    <h3>' + destCount + '</h3>' +
      '  </div>' +
      '  <div class="kpi-card">' +
      '    <span>Paket Wisata Aktif</span>' +
      '    <h3>' + pkgCount + '</h3>' +
      '  </div>' +
      '  <div class="kpi-card">' +
      '    <span>Broadcast Aktif</span>' +
      '    <h3>' + (stats.activeNotifs || 3) + '</h3>' +
      '  </div>' +
      '</div>' +
      '<div class="analytics-grid">' +
      '  <div class="admin-card">' +
      '    <h3 style="margin-top:0;">🗺 Distribusi Kunjungan per Wilayah</h3>' +
      '    <div style="margin-top:16px;">' +
      (stats.regionsStats || [])
        .map(function (r) {
          return (
            '<div class="bar-chart-row">' +
            '  <div class="bar-label">' +
            '    <strong>' + escapeHtml(r.region) + '</strong>' +
            '    <span>' + r.percent + '% (' + (r.visitors || 0).toLocaleString("id-ID") + ' org)</span>' +
            '  </div>' +
            '  <div class="bar-track">' +
            '    <div class="bar-fill" style="width:' + r.percent + '%;"></div>' +
            '  </div>' +
            '</div>'
          );
        })
        .join("") +
      '    </div>' +
      '  </div>' +
      '  <div class="admin-card">' +
      '    <h3 style="margin-top:0;">🧭 Minat Wisatawan Terbanyak</h3>' +
      '    <div style="margin-top:16px;">' +
      (stats.interestStats || [])
        .map(function (i) {
          return (
            '<div class="bar-chart-row">' +
            '  <div class="bar-label">' +
            '    <strong>' + escapeHtml(i.interest) + '</strong>' +
            '    <span>' + i.value + '%</span>' +
            '  </div>' +
            '  <div class="bar-track">' +
            '    <div class="bar-fill" style="width:' + i.value + '%;"></div>' +
            '  </div>' +
            '</div>'
          );
        })
        .join("") +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3 style="margin-top:0;">💬 Log Pertanyaan Populer ke Si Badak AI</h3>' +
      '  <div class="admin-table" style="margin-top:14px;">' +
      (stats.recentQueries || [])
        .map(function (q) {
          return (
            '<div class="admin-table-row">' +
            '  <span class="chip">' + escapeHtml(q.category || "Umum") + '</span>' +
            '  <div class="admin-table-info">' +
            '    <strong>"' + escapeHtml(q.query) + '"</strong>' +
            '    <span>Bahasa: ' + escapeHtml(q.language || "id") + ' · ' + escapeHtml(q.timestamp || "Baru saja") + '</span>' +
            '  </div>' +
            '</div>'
          );
        })
        .join("") +
      '  </div>' +
      '</div>';
  }

  /* ---------- Panel 2: Broadcast Notifikasi ---------- */
  async function renderAdminNotifikasi() {
    var el = document.getElementById("panelNotifikasi");
    if (!el) return;

    var notifs = [];
    try {
      var res = await apiFetch("notifications");
      notifs = res.notifications || [];
    } catch (e) {}

    el.innerHTML =
      '<h2 class="admin-h2">📢 Broadcast Notifikasi &amp; Wawaran</h2>' +
      '<p class="admin-sub">Kirim pemberitahuan langsung ke peramban wisatawan (event terkini, cuaca, diskon paket ziarah/wisata).</p>' +
      '<div class="admin-card">' +
      '  <h3>+ Buat Notifikasi Baru</h3>' +
      '  <label class="admin-field">' +
      '    Judul Notifikasi' +
      '    <input type="text" id="notifTitleInput" placeholder="Contoh: ✨ Pembukaan Seba Baduy 2026 Dibuka!">' +
      '  </label>' +
      '  <label class="admin-field">' +
      '    Kategori' +
      '    <select id="notifCatSelect">' +
      '      <option value="event">Acara / Event Budaya</option>' +
      '      <option value="weather">Informasi Cuaca &amp; Bahari</option>' +
      '      <option value="promo">Promo Paket Wisata</option>' +
      '      <option value="info">Informasi Umum Dinas</option>' +
      '    </select>' +
      '  </label>' +
      '  <label class="admin-field">' +
      '    Isi Pesan Notifikasi' +
      '    <textarea id="notifBodyInput" rows="3" placeholder="Tulis rincian pesan notifikasi di sini..."></textarea>' +
      '  </label>' +
      '  <button type="button" class="btn btn-primary" id="broadcastNotifBtn">🚀 Kirim Notifikasi Sekarang</button>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Daftar Notifikasi Aktif (' + notifs.length + ')</h3>' +
      '  <div class="admin-table">' +
      (notifs.length > 0
        ? notifs
            .map(function (n) {
              return (
                '<div class="admin-table-row">' +
                '  <span class="chip notif-tag--' + escapeHtml(n.category || "info") + '">' + escapeHtml(n.category || "info") + '</span>' +
                '  <div class="admin-table-info">' +
                '    <strong>' + escapeHtml(n.title) + '</strong>' +
                '    <span>' + escapeHtml(n.body) + '</span>' +
                '  </div>' +
                '  <button type="button" class="admin-icon-btn delete-notif-btn" data-id="' + escapeHtml(n.id) + '" title="Hapus">🗑</button>' +
                '</div>'
              );
            })
            .join("")
        : '<p class="admin-sub">Belum ada notifikasi.</p>') +
      '  </div>' +
      '</div>';

    var broadcastBtn = document.getElementById("broadcastNotifBtn");
    if (broadcastBtn) {
      broadcastBtn.addEventListener("click", async function () {
        var tInput = document.getElementById("notifTitleInput");
        var bInput = document.getElementById("notifBodyInput");
        var cInput = document.getElementById("notifCatSelect");
        var title = tInput ? tInput.value : "";
        var body = bInput ? bInput.value : "";
        var category = cInput ? cInput.value : "info";
        if (!title || !body) {
          alert("Judul dan isi notifikasi wajib diisi.");
          return;
        }

        try {
          await apiFetch("notifications", {
            method: "POST",
            body: JSON.stringify({ title: title, body: body, category: category }),
          });
          toast("Notifikasi berhasil disiarkan ke publik!");
          await loadNotifications();
          await renderAdminNotifikasi();
        } catch (err) {
          alert("Gagal menyiarkan: " + (err.message || ""));
        }
      });
    }

    el.querySelectorAll(".delete-notif-btn").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Hapus notifikasi ini?")) return;
        try {
          await apiFetch("notifications/" + btn.dataset.id, { method: "DELETE" });
          toast("Notifikasi dihapus.");
          await loadNotifications();
          await renderAdminNotifikasi();
        } catch (err) {
          alert("Gagal menghapus: " + (err.message || ""));
        }
      });
    });
  }

  /* ---------- Panel 3: Pengaturan Situs ---------- */
  function renderAdminPengaturan() {
    var el = document.getElementById("panelPengaturan");
    if (!el || !SITE_DATA) return;
    var s = SITE_DATA.settings;

    el.innerHTML =
      '<h2 class="admin-h2">⚙ Pengaturan Identitas &amp; Tema Situs</h2>' +
      '<p class="admin-sub">Atur judul, sub-judul, logo resmi, dan palet warna kustom.</p>' +
      '<div class="admin-card">' +
      '  <h3>Identitas Instansi</h3>' +
      '  <label class="admin-field">Judul Situs<input type="text" id="setTitle" value="' + escapeHtml(s.title) + '"></label>' +
      '  <label class="admin-field">Sub-Judul<input type="text" id="setSubtitle" value="' + escapeHtml(s.subtitle) + '"></label>' +
      '  <label class="admin-field">Tagline Footer<textarea id="setFooterTagline" rows="2">' + escapeHtml(s.footerTagline) + '</textarea></label>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Logo Situs</h3>' +
      '  <div style="display:flex;align-items:center;gap:20px;">' +
      '    <img src="' + escapeHtml(s.logo) + '" alt="Logo saat ini" style="height:60px;padding:8px;background:var(--ivory-dim);border-radius:var(--radius-sm);" id="setLogoPreview">' +
      '    <div>' +
      '      <input type="file" id="setLogoFile" accept="image/png,image/jpeg,image/webp">' +
      '      <p style="font-size:0.78rem;color:var(--slate);margin:4px 0 0;">Format PNG transparan dianjurkan. Maks 5MB.</p>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Palet Warna Kustom</h3>' +
      '  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;">' +
      Object.entries(s.colors || {})
        .map(function (pair) {
          return (
            '<label class="admin-field">' +
            '  <span>' + escapeHtml(pair[0]) + '</span>' +
            '  <input type="color" data-color-key="' + escapeHtml(pair[0]) + '" value="' + toHex(pair[1]) + '" style="height:44px;padding:2px;">' +
            '</label>'
          );
        })
        .join("") +
      '  </div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="saveSettingsBtn">Simpan Pengaturan Situs</button>' +
      '<div class="admin-card" style="margin-top:32px;">' +
      '  <h3>🔒 Keamanan: Ubah Password Admin</h3>' +
      '  <label class="admin-field">Password Lama<input type="password" id="curPassword" autocomplete="current-password"></label>' +
      '  <label class="admin-field">Password Baru (min 8 karakter)<input type="password" id="newPassword" autocomplete="new-password"></label>' +
      '  <button type="button" class="btn btn-outline-dark" id="changePasswordBtn">Ubah Password</button>' +
      '</div>';

    var pendingLogoFile = null;
    var logoInput = document.getElementById("setLogoFile");
    if (logoInput) {
      logoInput.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        pendingLogoFile = file;
        var prev = document.getElementById("setLogoPreview");
        if (prev) prev.src = URL.createObjectURL(file);
      });
    }

    var saveBtn = document.getElementById("saveSettingsBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        saveBtn.disabled = true;
        saveBtn.textContent = "Menyimpan…";
        try {
          var logoPath = s.logo;
          if (pendingLogoFile) {
            logoPath = await uploadImage(pendingLogoFile, "logo");
          }
          var colors = {};
          el.querySelectorAll("[data-color-key]").forEach(function (input) {
            colors[input.dataset.colorKey] = input.value;
          });

          var tInput = document.getElementById("setTitle");
          var subInput = document.getElementById("setSubtitle");
          var tagInput = document.getElementById("setFooterTagline");

          var payload = {
            title: tInput ? tInput.value : s.title,
            subtitle: subInput ? subInput.value : s.subtitle,
            footerTagline: tagInput ? tagInput.value : s.footerTagline,
            logo: logoPath,
            colors: colors,
          };

          await apiFetch("settings", { method: "POST", body: JSON.stringify(payload) });
          s.title = payload.title;
          s.subtitle = payload.subtitle;
          s.footerTagline = payload.footerTagline;
          s.logo = logoPath;
          s.colors = colors;
          applySettings();
          toast("Pengaturan situs tersimpan!");
        } catch (err) {
          alert("Gagal menyimpan: " + (err.message || ""));
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = "Simpan Pengaturan Situs";
        }
      });
    }

    var passBtn = document.getElementById("changePasswordBtn");
    if (passBtn) {
      passBtn.addEventListener("click", async function () {
        var curInput = document.getElementById("curPassword");
        var nextInput = document.getElementById("newPassword");
        var current = curInput ? curInput.value : "";
        var next = nextInput ? nextInput.value : "";
        if (next.length < 8) {
          alert("Password baru minimal 8 karakter.");
          return;
        }
        try {
          await apiFetch("auth?action=change_password", {
            method: "POST",
            body: JSON.stringify({ current_password: current, new_password: next }),
          });
          if (curInput) curInput.value = "";
          if (nextInput) nextInput.value = "";
          toast("Password admin berhasil diperbarui!");
        } catch (err) {
          alert("Gagal mengubah password: " + (err.message || ""));
        }
      });
    }
  }

  function toHex(v) {
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    return "#0B1E2D";
  }

  /* ---------- Panel: Header & Hero Section CMS ---------- */
  function renderAdminHero() {
    var el = document.getElementById("panelHero");
    if (!el || !SITE_DATA || !SITE_DATA.hero) return;
    var h = SITE_DATA.hero;

    el.innerHTML =
      '<h2 class="admin-h2">🌟 Header &amp; Hero Section Editor</h2>' +
      '<p class="admin-sub">Edit judul, subtitle, tombol aksi, pencarian, latar slide, running ticker, dan cuaca pesisir secara real-time.</p>' +
      '<div class="admin-card">' +
      '  <h3>Teks &amp; Judul Utama Hero</h3>' +
      '  <label class="admin-field">Eyebrow (Teks Kecil Atas)<input type="text" id="heroEyebrow" value="' + escapeHtml(h.eyebrow) + '"></label>' +
      '  <div class="admin-grid-3">' +
      '    <label class="admin-field">Judul Baris 1<input type="text" id="heroTitle1" value="' + escapeHtml(h.title1) + '"></label>' +
      '    <label class="admin-field">Judul Baris 2 (Miring/Aksen)<input type="text" id="heroTitle2" value="' + escapeHtml(h.title2) + '"></label>' +
      '    <label class="admin-field">Judul Baris 3<input type="text" id="heroTitle3" value="' + escapeHtml(h.title3) + '"></label>' +
      '  </div>' +
      '  <label class="admin-field">Sub-Judul &amp; Deskripsi Hero<textarea id="heroSubtitle" rows="3">' + escapeHtml(h.subtitle) + '</textarea></label>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Kotak Pencarian &amp; Tombol Aksi (CTA)</h3>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Placeholder Pencarian<input type="text" id="heroSearchPlaceholder" value="' + escapeHtml(h.searchPlaceholder) + '"></label>' +
      '    <label class="admin-field">Teks Tombol Cari<input type="text" id="heroSearchBtnText" value="' + escapeHtml(h.searchBtnText) + '"></label>' +
      '  </div>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Teks Tombol Utama (CTA 1)<input type="text" id="heroCta1Text" value="' + escapeHtml(h.cta1Text) + '"></label>' +
      '    <label class="admin-field">Tautan Tombol 1<input type="text" id="heroCta1Href" value="' + escapeHtml(h.cta1Href) + '"></label>' +
      '  </div>' +
      '  <label class="admin-field">Teks Tombol Kedua (CTA 2 - AI Si Badak)<input type="text" id="heroCta2Text" value="' + escapeHtml(h.cta2Text) + '"></label>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Foto Latar Belakang (Slide Carousel)</h3>' +
      '  <div id="heroSlidesList">' +
      (h.slides || []).map(function (item, idx) {
        var imgUrl = typeof item === "string" ? item : (item && item.url ? item.url : "");
        return (
          '<div class="admin-media-item" data-idx="' + idx + '">' +
          '  <img src="' + escapeHtml(imgUrl) + '" alt="Slide ' + (idx + 1) + '">' +
          '  <input type="text" class="slide-url-input" value="' + escapeHtml(imgUrl) + '" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-slide-btn" title="Hapus Slide">🗑</button>' +
          '</div>'
        );
      }).join("") +
      '  </div>' +
      '  <div style="display:flex;gap:12px;align-items:center;margin-top:14px;">' +
      '    <button type="button" class="btn btn-outline-dark" id="addSlideUrlBtn">+ Tambah URL Slide</button>' +
      '    <label class="btn btn-outline-dark" style="cursor:pointer;margin:0;">' +
      '      📤 Unggah Foto Slide Baru' +
      '      <input type="file" id="uploadSlideFile" accept="image/*" style="display:none;">' +
      '    </label>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Running Ticker Destinasi</h3>' +
      '  <div id="heroTickerList">' +
      (h.tickerItems || []).map(function (item, idx) {
        return (
          '<div class="admin-table-row" data-idx="' + idx + '">' +
          '  <input type="text" class="ticker-item-input" value="' + escapeHtml(item) + '" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-ticker-btn" title="Hapus">🗑</button>' +
          '</div>'
        );
      }).join("") +
      '  </div>' +
      '  <button type="button" class="btn btn-outline-dark" id="addTickerBtn" style="margin-top:10px;">+ Tambah Item Ticker</button>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Kartu Cuaca &amp; Pesisir Bahari</h3>' +
      '  <div id="heroWeatherList" class="admin-grid-2">' +
      (h.weatherCards || []).map(function (w, idx) {
        return (
          '<div class="admin-card" style="margin-bottom:0;" data-idx="' + idx + '">' +
          '  <label class="admin-field">Nama Lokasi &amp; Ikon<input type="text" class="weather-name-input" value="' + escapeHtml(w.name) + '"></label>' +
          '  <label class="admin-field">Detail / Ombak / Cuaca<input type="text" class="weather-detail-input" value="' + escapeHtml(w.detail) + '"></label>' +
          '  <label class="admin-field">Suhu<input type="text" class="weather-temp-input" value="' + escapeHtml(w.temp) + '"></label>' +
          '</div>'
        );
      }).join("") +
      '  </div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="saveHeroBtn">Simpan Perubahan Header &amp; Hero</button>';

    // Events for Slide list
    el.querySelectorAll(".remove-slide-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-media-item");
        if (row) {
          row.remove();
        }
      });
    });

    var addSlideUrlBtn = document.getElementById("addSlideUrlBtn");
    if (addSlideUrlBtn) {
      addSlideUrlBtn.addEventListener("click", function () {
        var list = document.getElementById("heroSlidesList");
        if (!list) return;
        var div = document.createElement("div");
        div.className = "admin-media-item";
        div.innerHTML =
          '  <img src="assets/img/1000407444.jpg" alt="Slide Baru">' +
          '  <input type="text" class="slide-url-input" value="assets/img/1000407444.jpg" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-slide-btn" title="Hapus Slide">🗑</button>';
        div.querySelector(".remove-slide-btn").onclick = function () { div.remove(); };
        list.appendChild(div);
      });
    }

    var uploadSlideInput = document.getElementById("uploadSlideFile");
    if (uploadSlideInput) {
      uploadSlideInput.addEventListener("change", async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        try {
          var path = await uploadImage(file, "slides");
          var list = document.getElementById("heroSlidesList");
          if (list) {
            var div = document.createElement("div");
            div.className = "admin-media-item";
            div.innerHTML =
              '  <img src="' + escapeHtml(path) + '" alt="Slide Baru">' +
              '  <input type="text" class="slide-url-input" value="' + escapeHtml(path) + '" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
              '  <button type="button" class="admin-icon-btn remove-slide-btn" title="Hapus Slide">🗑</button>';
            div.querySelector(".remove-slide-btn").onclick = function () { div.remove(); };
            list.appendChild(div);
            toast("Foto slide berhasil diunggah!");
          }
        } catch (err) {
          alert("Gagal mengunggah foto: " + (err.message || ""));
        }
      });
    }

    // Events for Ticker list
    el.querySelectorAll(".remove-ticker-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-table-row");
        if (row) row.remove();
      });
    });

    var addTickerBtn = document.getElementById("addTickerBtn");
    if (addTickerBtn) {
      addTickerBtn.addEventListener("click", function () {
        var list = document.getElementById("heroTickerList");
        if (!list) return;
        var div = document.createElement("div");
        div.className = "admin-table-row";
        div.innerHTML =
          '  <input type="text" class="ticker-item-input" value="DESTINASI BANTEN · KOORDINAT" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-ticker-btn" title="Hapus">🗑</button>';
        div.querySelector(".remove-ticker-btn").onclick = function () { div.remove(); };
        list.appendChild(div);
      });
    }

    // Save Hero Action
    var saveHeroBtn = document.getElementById("saveHeroBtn");
    if (saveHeroBtn) {
      saveHeroBtn.addEventListener("click", async function () {
        saveHeroBtn.disabled = true;
        saveHeroBtn.textContent = "Menyimpan…";

        try {
          var slidesUrls = Array.from(el.querySelectorAll(".slide-url-input")).map(function (inp) { return inp.value.trim(); }).filter(Boolean);
          var tickerArr = Array.from(el.querySelectorAll(".ticker-item-input")).map(function (inp) { return inp.value.trim(); }).filter(Boolean);
          var weatherCardsArr = Array.from(el.querySelectorAll("#heroWeatherList .admin-card")).map(function (card) {
            return {
              name: (card.querySelector(".weather-name-input") || {}).value || "",
              detail: (card.querySelector(".weather-detail-input") || {}).value || "",
              temp: (card.querySelector(".weather-temp-input") || {}).value || "",
            };
          });

          var payload = {
            eyebrow: (document.getElementById("heroEyebrow") || {}).value || h.eyebrow,
            title1: (document.getElementById("heroTitle1") || {}).value || h.title1,
            title2: (document.getElementById("heroTitle2") || {}).value || h.title2,
            title3: (document.getElementById("heroTitle3") || {}).value || h.title3,
            subtitle: (document.getElementById("heroSubtitle") || {}).value || h.subtitle,
            searchPlaceholder: (document.getElementById("heroSearchPlaceholder") || {}).value || h.searchPlaceholder,
            searchBtnText: (document.getElementById("heroSearchBtnText") || {}).value || h.searchBtnText,
            cta1Text: (document.getElementById("heroCta1Text") || {}).value || h.cta1Text,
            cta1Href: (document.getElementById("heroCta1Href") || {}).value || h.cta1Href,
            cta2Text: (document.getElementById("heroCta2Text") || {}).value || h.cta2Text,
            slides: slidesUrls.length > 0 ? slidesUrls : h.slides,
            tickerItems: tickerArr.length > 0 ? tickerArr : h.tickerItems,
            weatherCards: weatherCardsArr.length > 0 ? weatherCardsArr : h.weatherCards,
          };

          await apiFetch("hero", { method: "POST", body: JSON.stringify(payload) });
          SITE_DATA.hero = Object.assign({}, SITE_DATA.hero, payload);
          renderHeroPublic();
          toast("Header & Hero Section berhasil disimpan dan diterapkan!");
        } catch (err) {
          alert("Gagal menyimpan Hero: " + (err.message || ""));
        } finally {
          saveHeroBtn.disabled = false;
          saveHeroBtn.textContent = "Simpan Perubahan Header & Hero";
        }
      });
    }
  }

  /* ---------- Panel: Tanya Si Badak AI & Floating Button CMS ---------- */
  function renderAdminBadak() {
    var el = document.getElementById("panelBadak");
    if (!el || !SITE_DATA || !SITE_DATA.badakConfig) return;
    var b = SITE_DATA.badakConfig;

    el.innerHTML =
      '<h2 class="admin-h2">🦏 Tanya Si Badak AI &amp; Chatbot Editor</h2>' +
      '<p class="admin-sub">Modifikasi teks tombol mengambang (FAB), judul panel, kalimat sapaan awal, tombol kirim, dan pertanyaan cepat cerdas.</p>' +
      '<div class="admin-card">' +
      '  <h3>Tombol Mengambang (FAB) &amp; Status Header</h3>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Teks Utama Tombol Badak (FAB)<input type="text" id="badakFabText" value="' + escapeHtml(b.fabText) + '"></label>' +
      '    <label class="admin-field">Sub-Teks FAB (Baris 2)<input type="text" id="badakFabSub" value="' + escapeHtml(b.fabSub) + '"></label>' +
      '  </div>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Judul Jendela Chatbot<input type="text" id="badakPanelTitle" value="' + escapeHtml(b.panelTitle) + '"></label>' +
      '    <label class="admin-field">Status Koneksi AI<input type="text" id="badakPanelStatus" value="' + escapeHtml(b.panelStatus) + '"></label>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Pesan Sambutan &amp; Form Input</h3>' +
      '  <label class="admin-field">Kalimat Sapaan Awal Si Badak (Pesan Pertama)<textarea id="badakGreetMessage" rows="3">' + escapeHtml(b.greetMessage) + '</textarea></label>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Placeholder Kotak Pertanyaan<input type="text" id="badakInputPlaceholder" value="' + escapeHtml(b.inputPlaceholder) + '"></label>' +
      '    <label class="admin-field">Simbol / Teks Tombol Kirim<input type="text" id="badakBtnSendText" value="' + escapeHtml(b.btnSendText) + '"></label>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Pertanyaan Cepat (Suggestion Chips)</h3>' +
      '  <div id="badakChipsList">' +
      (b.suggestChips || []).map(function (chip, idx) {
        return (
          '<div class="admin-table-row" data-idx="' + idx + '">' +
          '  <input type="text" class="chip-label-input" value="' + escapeHtml(chip.label) + '" placeholder="Label Tombol" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <input type="text" class="chip-prompt-input" value="' + escapeHtml(chip.prompt) + '" placeholder="Prompt Pertanyaan Lengkap ke AI" style="flex:2;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-chip-btn" title="Hapus">🗑</button>' +
          '</div>'
        );
      }).join("") +
      '  </div>' +
      '  <button type="button" class="btn btn-outline-dark" id="addBadakChipBtn" style="margin-top:10px;">+ Tambah Pertanyaan Cepat</button>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="saveBadakBtn">Simpan Pengaturan Si Badak AI</button>';

    el.querySelectorAll(".remove-chip-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".admin-table-row");
        if (row) row.remove();
      });
    });

    var addChipBtn = document.getElementById("addBadakChipBtn");
    if (addChipBtn) {
      addChipBtn.addEventListener("click", function () {
        var list = document.getElementById("badakChipsList");
        if (!list) return;
        var div = document.createElement("div");
        div.className = "admin-table-row";
        div.innerHTML =
          '  <input type="text" class="chip-label-input" value="Topik Baru" placeholder="Label Tombol" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <input type="text" class="chip-prompt-input" value="Ceritakan tentang wisata di Banten" placeholder="Prompt Pertanyaan Lengkap ke AI" style="flex:2;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
          '  <button type="button" class="admin-icon-btn remove-chip-btn" title="Hapus">🗑</button>';
        div.querySelector(".remove-chip-btn").onclick = function () { div.remove(); };
        list.appendChild(div);
      });
    }

    var saveBadakBtn = document.getElementById("saveBadakBtn");
    if (saveBadakBtn) {
      saveBadakBtn.addEventListener("click", async function () {
        saveBadakBtn.disabled = true;
        saveBadakBtn.textContent = "Menyimpan…";

        try {
          var chipsArr = Array.from(el.querySelectorAll("#badakChipsList .admin-table-row")).map(function (row) {
            return {
              label: (row.querySelector(".chip-label-input") || {}).value || "Pertanyaan",
              prompt: (row.querySelector(".chip-prompt-input") || {}).value || "Tanya info Banten",
            };
          });

          var payload = {
            fabText: (document.getElementById("badakFabText") || {}).value || b.fabText,
            fabSub: (document.getElementById("badakFabSub") || {}).value || b.fabSub,
            panelTitle: (document.getElementById("badakPanelTitle") || {}).value || b.panelTitle,
            panelStatus: (document.getElementById("badakPanelStatus") || {}).value || b.panelStatus,
            greetMessage: (document.getElementById("badakGreetMessage") || {}).value || b.greetMessage,
            inputPlaceholder: (document.getElementById("badakInputPlaceholder") || {}).value || b.inputPlaceholder,
            btnSendText: (document.getElementById("badakBtnSendText") || {}).value || b.btnSendText,
            suggestChips: chipsArr,
          };

          await apiFetch("badak", { method: "POST", body: JSON.stringify(payload) });
          SITE_DATA.badakConfig = Object.assign({}, SITE_DATA.badakConfig, payload);
          renderBadakPublic();
          toast("Konfigurasi Si Badak AI berhasil diperbarui!");
        } catch (err) {
          alert("Gagal menyimpan Si Badak: " + (err.message || ""));
        } finally {
          saveBadakBtn.disabled = false;
          saveBadakBtn.textContent = "Simpan Pengaturan Si Badak AI";
        }
      });
    }
  }

  /* ---------- Panel: Menu Navigasi & Global Buttons CMS ---------- */
  function renderAdminMenu() {
    var el = document.getElementById("panelMenu");
    if (!el || !SITE_DATA) return;
    var btnConfig = SITE_DATA.buttons || {};

    function draw() {
      if (!SITE_DATA) return;
      el.innerHTML =
        '<h2 class="admin-h2">☰ Menu Navigasi &amp; Tombol-Tombol Global</h2>' +
        '<p class="admin-sub">Kelola item menu navigasi utama portal dan label semua tombol interaktif situs.</p>' +
        '<div class="admin-card">' +
        '  <h3>Daftar Tautan Menu Navigasi</h3>' +
        '  <div class="admin-table" id="adminMenuList">' +
        SITE_DATA.menu
          .map(function (m, i) {
            return (
              '<div class="admin-table-row" data-idx="' + i + '">' +
              '  <input type="text" class="menu-label-input" value="' + escapeHtml(m.label) + '" placeholder="Label Menu" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
              '  <input type="text" class="menu-href-input" value="' + escapeHtml(m.href) + '" placeholder="#target" style="flex:1;padding:8px 12px;border-radius:4px;border:1px solid var(--line);">' +
              '  <button type="button" class="admin-icon-btn menu-remove-btn" title="Hapus">🗑</button>' +
              '</div>'
            );
          })
          .join("") +
        '  </div>' +
        '  <div style="display:flex;gap:10px;margin-top:14px;">' +
        '    <button type="button" class="btn btn-outline-dark" id="addMenuBtn">+ Tambah Menu</button>' +
        '  </div>' +
        '</div>' +
        '<div class="admin-card">' +
        '  <h3>Edit Teks Tombol-Tombol Website</h3>' +
        '  <div class="admin-grid-2">' +
        '    <label class="admin-field">Tombol Masuk Admin Header<input type="text" id="btnAdminEntry" value="' + escapeHtml(btnConfig.adminEntry || "⚙ Admin") + '"></label>' +
        '    <label class="admin-field">Tombol Pencarian Header<input type="text" id="btnSearchTrigger" value="' + escapeHtml(btnConfig.searchTrigger || "Cari") + '"></label>' +
        '  </div>' +
        '  <div class="admin-grid-2">' +
        '    <label class="admin-field">Tombol Notifikasi Browser<input type="text" id="btnEnablePush" value="' + escapeHtml(btnConfig.enablePush || "🔔 Aktifkan Notifikasi Browser") + '"></label>' +
        '    <label class="admin-field">Teks Penunjuk Gulir (Scroll Cue)<input type="text" id="btnScrollCue" value="' + escapeHtml(btnConfig.scrollCue || "Gulir") + '"></label>' +
        '  </div>' +
        '  <div class="admin-grid-2">' +
        '    <label class="admin-field">Tombol Putar Audio Ekraf<input type="text" id="btnEkrafAudioAll" value="' + escapeHtml(btnConfig.ekrafAudioAll || "🔊 Dengarkan Ringkasan Audio Halaman Ini") + '"></label>' +
        '    <label class="admin-field">Tombol Buat Rencana Planner<input type="text" id="btnPlannerGenerate" value="' + escapeHtml(btnConfig.plannerGenerate || "Buat Rekomendasi Rute") + '"></label>' +
        '  </div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="saveMenuAndButtonsBtn">Simpan Menu &amp; Seluruh Tombol</button>';

      el.querySelectorAll(".menu-remove-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var row = btn.closest(".admin-table-row");
          var idx = Number(row.dataset.idx);
          if (SITE_DATA) SITE_DATA.menu.splice(idx, 1);
          draw();
        });
      });

      var addBtn = document.getElementById("addMenuBtn");
      if (addBtn) {
        addBtn.addEventListener("click", function () {
          if (SITE_DATA) SITE_DATA.menu.push({ label: "Menu Baru", href: "#" });
          draw();
        });
      }

      var saveBtn = document.getElementById("saveMenuAndButtonsBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async function () {
          saveBtn.disabled = true;
          saveBtn.textContent = "Menyimpan…";
          try {
            var rows = el.querySelectorAll("#adminMenuList .admin-table-row");
            var menu = Array.from(rows).map(function (row) {
              var l = row.querySelector(".menu-label-input");
              var h = row.querySelector(".menu-href-input");
              return {
                label: (l ? l.value : "") || "Menu",
                href: (h ? h.value : "") || "#",
              };
            });

            var buttonsPayload = {
              adminEntry: (document.getElementById("btnAdminEntry") || {}).value || btnConfig.adminEntry,
              searchTrigger: (document.getElementById("btnSearchTrigger") || {}).value || btnConfig.searchTrigger,
              enablePush: (document.getElementById("btnEnablePush") || {}).value || btnConfig.enablePush,
              scrollCue: (document.getElementById("btnScrollCue") || {}).value || btnConfig.scrollCue,
              ekrafAudioAll: (document.getElementById("btnEkrafAudioAll") || {}).value || btnConfig.ekrafAudioAll,
              plannerGenerate: (document.getElementById("btnPlannerGenerate") || {}).value || btnConfig.plannerGenerate,
            };

            await Promise.all([
              apiFetch("menu", { method: "POST", body: JSON.stringify({ menu: menu }) }),
              apiFetch("buttons", { method: "POST", body: JSON.stringify(buttonsPayload) }),
            ]);

            SITE_DATA.menu = menu;
            SITE_DATA.buttons = Object.assign({}, SITE_DATA.buttons, buttonsPayload);
            renderMenu();
            renderButtonsPublic();
            toast("Menu navigasi dan seluruh tombol berhasil diperbarui!");
          } catch (err) {
            alert("Gagal menyimpan menu & tombol: " + (err.message || ""));
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Simpan Menu & Seluruh Tombol";
          }
        });
      }
    }
    draw();
  }

  /* ---------- Panel: Teks & Judul Semua Seksi Halaman CMS ---------- */
  function renderAdminSections() {
    var el = document.getElementById("panelSections");
    if (!el || !SITE_DATA || !SITE_DATA.sections) return;
    var sec = SITE_DATA.sections;

    var activeSecKey = "destinasi";

    function draw() {
      var s = sec[activeSecKey] || {};

      el.innerHTML =
        '<h2 class="admin-h2">📑 Editor Teks &amp; Judul Seksi Halaman</h2>' +
        '<p class="admin-sub">Ubah teks pembuka, eyebrow, judul, dan deskripsi lede untuk semua bagian website.</p>' +
        '<div class="admin-section-tabs">' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "destinasi" ? "is-active" : "") + '" data-seckey="destinasi">📍 Destinasi</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "religi" ? "is-active" : "") + '" data-seckey="religi">🕌 Wisata Religi</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "akomodasi" ? "is-active" : "") + '" data-seckey="akomodasi">🏨 Akomodasi</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "paket" ? "is-active" : "") + '" data-seckey="paket">🧳 Paket Wisata</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "pengalaman" ? "is-active" : "") + '" data-seckey="pengalaman">✨ Pengalaman Autentik</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "kalender" ? "is-active" : "") + '" data-seckey="kalender">📅 Kalender Event</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "ekraf" ? "is-active" : "") + '" data-seckey="ekraf">🧵 Produk Ekraf</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "rencana" ? "is-active" : "") + '" data-seckey="rencana">🧭 Rencana Trip</button>' +
        '  <button type="button" class="admin-sec-tab-btn ' + (activeSecKey === "informasi" ? "is-active" : "") + '" data-seckey="informasi">ℹ Informasi Praktis</button>' +
        '</div>' +
        '<div class="admin-card">' +
        '  <h3>Kepala Seksi: ' + activeSecKey.toUpperCase() + '</h3>' +
        '  <label class="admin-field">Eyebrow (Label Kecil Atas)<input type="text" id="secEyebrow" value="' + escapeHtml(s.eyebrow || "") + '"></label>' +
        '  <label class="admin-field">Judul Utama Seksi<input type="text" id="secTitle" value="' + escapeHtml(s.title || "") + '"></label>' +
        '  <label class="admin-field">Deskripsi Pembuka (Lede)<textarea id="secLede" rows="3">' + escapeHtml(s.lede || "") + '</textarea></label>' +
        '</div>' +
        (activeSecKey === "pengalaman"
          ? '<div class="admin-card">' +
            '  <h3>Edit Tab Pengalaman Autentik</h3>' +
            '  <div id="pengalamanTabsList">' +
            (s.tabs || []).map(function (tab, idx) {
              return (
                '<div class="admin-card" style="margin-bottom:12px;background:var(--ivory-dim);" data-idx="' + idx + '">' +
                '  <div class="admin-grid-2">' +
                '    <label class="admin-field">Label Tab<input type="text" class="tab-label-inp" value="' + escapeHtml(tab.label) + '"></label>' +
                '    <label class="admin-field">Judul Fitur Tab<input type="text" class="tab-feat-title-inp" value="' + escapeHtml(tab.featureTitle) + '"></label>' +
                '  </div>' +
                '  <label class="admin-field">Deskripsi Fitur<textarea class="tab-feat-desc-inp" rows="2">' + escapeHtml(tab.featureDesc) + '</textarea></label>' +
                '  <label class="admin-field">Foto Fitur URL<input type="text" class="tab-feat-img-inp" value="' + escapeHtml(tab.featureImg) + '"></label>' +
                '</div>'
              );
            }).join("") +
            '  </div>' +
            '</div>'
          : "") +
        '<button type="button" class="btn btn-primary" id="saveSectionsBtn">Simpan Seluruh Teks Seksi</button>';

      el.querySelectorAll(".admin-sec-tab-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          // Read current draft before switching
          var curEye = (document.getElementById("secEyebrow") || {}).value;
          var curTit = (document.getElementById("secTitle") || {}).value;
          var curLed = (document.getElementById("secLede") || {}).value;
          if (sec[activeSecKey]) {
            sec[activeSecKey].eyebrow = curEye;
            sec[activeSecKey].title = curTit;
            sec[activeSecKey].lede = curLed;
          }
          activeSecKey = btn.dataset.seckey;
          draw();
        });
      });

      var saveBtn = document.getElementById("saveSectionsBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async function () {
          saveBtn.disabled = true;
          saveBtn.textContent = "Menyimpan…";
          try {
            var curEye = (document.getElementById("secEyebrow") || {}).value;
            var curTit = (document.getElementById("secTitle") || {}).value;
            var curLed = (document.getElementById("secLede") || {}).value;
            if (sec[activeSecKey]) {
              sec[activeSecKey].eyebrow = curEye;
              sec[activeSecKey].title = curTit;
              sec[activeSecKey].lede = curLed;
            }

            if (activeSecKey === "pengalaman" && sec.pengalaman) {
              var tabCards = el.querySelectorAll("#pengalamanTabsList .admin-card");
              sec.pengalaman.tabs = Array.from(tabCards).map(function (tc, idx) {
                var prevTab = (s.tabs && s.tabs[idx]) || {};
                return {
                  id: prevTab.id || ("tab-" + idx),
                  label: (tc.querySelector(".tab-label-inp") || {}).value || prevTab.label,
                  featureTitle: (tc.querySelector(".tab-feat-title-inp") || {}).value || prevTab.featureTitle,
                  featureDesc: (tc.querySelector(".tab-feat-desc-inp") || {}).value || prevTab.featureDesc,
                  featureImg: (tc.querySelector(".tab-feat-img-inp") || {}).value || prevTab.featureImg,
                  meta: prevTab.meta || [],
                };
              });
            }

            await apiFetch("sections", { method: "POST", body: JSON.stringify(sec) });
            SITE_DATA.sections = Object.assign({}, SITE_DATA.sections, sec);
            renderSectionsPublic();
            toast("Teks seksi berhasil diperbarui dan diterapkan!");
          } catch (err) {
            alert("Gagal menyimpan seksi: " + (err.message || ""));
          } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Simpan Seluruh Teks Seksi";
          }
        });
      }
    }

    draw();
  }

  /* ---------- Panel: Footer & Kontak Instansi CMS ---------- */
  function renderAdminFooter() {
    var el = document.getElementById("panelFooter");
    if (!el || !SITE_DATA || !SITE_DATA.footer) return;
    var f = SITE_DATA.footer;

    el.innerHTML =
      '<h2 class="admin-h2">🦶 Footer &amp; Kontak Instansi Editor</h2>' +
      '<p class="admin-sub">Kelola tagline resmi, informasi kontak kantor dinas, alamat, email, nomor telepon, dan copyright.</p>' +
      '<div class="admin-card">' +
      '  <h3>Tagline &amp; Judul Kolom</h3>' +
      '  <label class="admin-field">Tagline Resmi Footer<textarea id="footerTaglineInp" rows="3">' + escapeHtml(f.tagline) + '</textarea></label>' +
      '  <div class="admin-grid-3">' +
      '    <label class="admin-field">Judul Kolom 1<input type="text" id="footerCol1Title" value="' + escapeHtml(f.col1Title) + '"></label>' +
      '    <label class="admin-field">Judul Kolom 2<input type="text" id="footerCol2Title" value="' + escapeHtml(f.col2Title) + '"></label>' +
      '    <label class="admin-field">Judul Kolom 3<input type="text" id="footerCol3Title" value="' + escapeHtml(f.col3Title) + '"></label>' +
      '  </div>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>Kontak &amp; Lokasi Kantor Dinas Pariwisata</h3>' +
      '  <label class="admin-field">Alamat Kantor Dinas<input type="text" id="footerOfficeAddress" value="' + escapeHtml(f.officeAddress) + '"></label>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Email Resmi Dinas<input type="email" id="footerOfficeEmail" value="' + escapeHtml(f.officeEmail) + '"></label>' +
      '    <label class="admin-field">Nomor Telepon / WhatsApp<input type="text" id="footerOfficePhone" value="' + escapeHtml(f.officePhone) + '"></label>' +
      '  </div>' +
      '  <div class="admin-grid-2">' +
      '    <label class="admin-field">Teks Hak Cipta (Copyright)<input type="text" id="footerCopyright" value="' + escapeHtml(f.copyright) + '"></label>' +
      '    <label class="admin-field">Titik Koordinat Footer<input type="text" id="footerCoord" value="' + escapeHtml(f.coord) + '"></label>' +
      '  </div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" id="saveFooterBtn">Simpan Informasi Footer &amp; Kontak</button>';

    var saveBtn = document.getElementById("saveFooterBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        saveBtn.disabled = true;
        saveBtn.textContent = "Menyimpan…";
        try {
          var payload = {
            tagline: (document.getElementById("footerTaglineInp") || {}).value || f.tagline,
            col1Title: (document.getElementById("footerCol1Title") || {}).value || f.col1Title,
            col2Title: (document.getElementById("footerCol2Title") || {}).value || f.col2Title,
            col3Title: (document.getElementById("footerCol3Title") || {}).value || f.col3Title,
            officeAddress: (document.getElementById("footerOfficeAddress") || {}).value || f.officeAddress,
            officeEmail: (document.getElementById("footerOfficeEmail") || {}).value || f.officeEmail,
            officePhone: (document.getElementById("footerOfficePhone") || {}).value || f.officePhone,
            copyright: (document.getElementById("footerCopyright") || {}).value || f.copyright,
            coord: (document.getElementById("footerCoord") || {}).value || f.coord,
          };

          await apiFetch("footer", { method: "POST", body: JSON.stringify(payload) });
          SITE_DATA.footer = Object.assign({}, SITE_DATA.footer, payload);
          renderFooterPublic();
          toast("Footer & kontak instansi berhasil diperbarui!");
        } catch (err) {
          alert("Gagal menyimpan footer: " + (err.message || ""));
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = "Simpan Informasi Footer & Kontak";
        }
      });
    }
  }

  /* ---------- Generic Collections CRUD Engine ---------- */
  var COLLECTIONS = {
    destinations: {
      panelId: "panelDestinations",
      title: "📍 Destinasi Wisata",
      fields: [
        { key: "title", label: "Nama Destinasi", type: "text" },
        { key: "coord", label: "Koordinat", type: "text" },
        { key: "tag", label: "Kategori", type: "text" },
        { key: "desc", label: "Deskripsi", type: "textarea" },
        { key: "img", label: "Foto Destinasi", type: "image" },
      ],
      renderFn: renderDestinations,
    },
    religi: {
      panelId: "panelReligi",
      title: "🕌 Wisata Religi & Warisan",
      fields: [
        { key: "title", label: "Nama Tempat Ziarah", type: "text" },
        { key: "coord", label: "Koordinat", type: "text" },
        { key: "category", label: "Kategori", type: "text" },
        { key: "desc", label: "Deskripsi Sejarah", type: "textarea" },
        { key: "img", label: "Foto", type: "image" },
      ],
      renderFn: renderReligi,
    },
    akomodasi: {
      panelId: "panelAkomodasi",
      title: "🏨 Akomodasi & Resor",
      fields: [
        { key: "title", label: "Nama Akomodasi", type: "text" },
        { key: "type", label: "Tipe Akomodasi", type: "text" },
        { key: "desc", label: "Deskripsi & Fasilitas", type: "textarea" },
        { key: "img", label: "Foto", type: "image" },
      ],
      renderFn: renderAkomodasi,
    },
    paket: {
      panelId: "panelPaket",
      title: "🧳 Paket Wisata",
      fields: [
        { key: "title", label: "Nama Paket", type: "text" },
        { key: "duration", label: "Durasi (cth: 3 hari 2 malam)", type: "text" },
        { key: "price", label: "Harga per orang", type: "text" },
        { key: "desc", label: "Deskripsi Itinerary", type: "textarea" },
        { key: "img", label: "Foto", type: "image" },
      ],
      renderFn: renderPaket,
    },
    kalender: {
      panelId: "panelKalender",
      title: "📅 Kalender Event Budaya",
      fields: [
        { key: "title", label: "Nama Event", type: "text" },
        { key: "date", label: "Jadwal Tanggal/Bulan", type: "text" },
        { key: "location", label: "Lokasi Acara", type: "text" },
        { key: "desc", label: "Deskripsi Acara", type: "textarea" },
        { key: "img", label: "Poster / Foto", type: "image" },
      ],
      renderFn: renderKalender,
    },
    ekraf: {
      panelId: "panelEkraf",
      title: "🧵 Produk Ekonomi Kreatif",
      fields: [
        { key: "title", label: "Nama Produk / Kriya", type: "text" },
        { key: "category", label: "Kategori", type: "text" },
        { key: "icon", label: "Emoji Ikon", type: "text" },
        { key: "desc", label: "Deskripsi Lengkap (Audio TTS)", type: "textarea" },
      ],
      renderFn: renderEkraf,
    },
  };

  function renderAdminCollection(key) {
    var cfg = COLLECTIONS[key];
    if (!cfg) return;
    var el = document.getElementById(cfg.panelId);
    if (!el || !SITE_DATA) return;

    function draw(editingId) {
      if (!SITE_DATA) return;
      var items = SITE_DATA[key] || [];
      var editing = editingId ? items.find(function (i) { return i.id === editingId; }) : null;

      el.innerHTML =
        '<h2 class="admin-h2">' + cfg.title + '</h2>' +
        '<p class="admin-sub">' + items.length + ' item aktif di portal.</p>' +
        '<div class="admin-table">' +
        (items.length > 0
          ? items
              .map(function (item) {
                return (
                  '<div class="admin-table-row">' +
                  (item.img ? '<img src="' + escapeHtml(item.img) + '" class="admin-thumb">' : '<span class="admin-thumb admin-thumb--icon">' + escapeHtml(item.icon || "•") + '</span>') +
                  '  <div class="admin-table-info">' +
                  '    <strong>' + escapeHtml(item.title) + '</strong>' +
                  '    <span>' + escapeHtml((item.desc || "").slice(0, 90)) + '...</span>' +
                  '  </div>' +
                  '  <div class="admin-table-actions">' +
                  '    <button type="button" class="admin-icon-btn edit-item-btn" data-edit="' + escapeHtml(item.id) + '" title="Edit">✏️</button>' +
                  '    <button type="button" class="admin-icon-btn del-item-btn" data-del="' + escapeHtml(item.id) + '" title="Hapus">🗑</button>' +
                  '  </div>' +
                  '</div>'
                );
              })
              .join("")
          : '<p class="admin-sub">Belum ada item.</p>') +
        '</div>' +
        '<button type="button" class="btn btn-outline-dark" id="addItemBtn-' + key + '">+ Tambah Item Baru</button>' +
        '<div class="admin-form-wrap" id="formWrap-' + key + '"></div>';

      el.querySelectorAll(".edit-item-btn").forEach(function (btn) {
        btn.addEventListener("click", function () { draw(btn.dataset.edit); });
      });

      el.querySelectorAll(".del-item-btn").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!confirm("Hapus item ini secara permanen?")) return;
          try {
            await apiFetch("items?collection=" + key + "&id=" + btn.dataset.del, { method: "DELETE" });
            if (SITE_DATA) {
              SITE_DATA[key] = SITE_DATA[key].filter(function (i) { return i.id !== btn.dataset.del; });
            }
            cfg.renderFn();
            draw();
            toast("Item berhasil dihapus.");
          } catch (err) {
            alert("Gagal menghapus: " + (err.message || ""));
          }
        });
      });

      var addBtn = document.getElementById("addItemBtn-" + key);
      if (addBtn) addBtn.addEventListener("click", function () { showForm(null); });
      if (editingId) showForm(editing);

      function showForm(item) {
        var wrap = document.getElementById("formWrap-" + key);
        if (!wrap) return;
        var isNew = !item;
        var draft = item ? Object.assign({}, item) : { id: uid(key[0]) };

        wrap.innerHTML =
          '<div class="admin-card" style="margin-top:24px;">' +
          '  <h3>' + (isNew ? "Tambah Item Baru" : "Edit Item: " + escapeHtml(draft.title || "")) + '</h3>' +
          cfg.fields
            .map(function (f) {
              if (f.type === "textarea") {
                return '<label class="admin-field">' + f.label + '<textarea rows="3" data-field="' + f.key + '">' + escapeHtml(draft[f.key] || "") + '</textarea></label>';
              }
              if (f.type === "image") {
                return (
                  '<label class="admin-field">' + f.label +
                  '  <input type="file" accept="image/*" data-field-file="' + f.key + '">' +
                  (draft[f.key] ? '<img src="' + escapeHtml(draft[f.key]) + '" class="admin-thumb" style="width:100px;height:70px;margin-top:6px;" data-preview="' + f.key + '">' : '<span class="admin-sub">Belum ada foto</span>') +
                  '</label>'
                );
              }
              return '<label class="admin-field">' + f.label + '<input type="text" data-field="' + f.key + '" value="' + escapeHtml(draft[f.key] || "") + '"></label>';
            })
            .join("") +
          '  <div style="display:flex;gap:10px;margin-top:16px;">' +
          '    <button type="button" class="btn btn-primary" id="saveItemBtn-' + key + '">Simpan Item</button>' +
          '    <button type="button" class="btn btn-outline-dark" id="cancelItemBtn-' + key + '">Batal</button>' +
          '  </div>' +
          '</div>';

        var pendingImageFile = null;
        cfg.fields
          .filter(function (f) { return f.type === "image"; })
          .forEach(function (f) {
            var fInput = wrap.querySelector('[data-field-file="' + f.key + '"]');
            if (fInput) {
              fInput.addEventListener("change", function (e) {
                var file = e.target.files[0];
                if (!file) return;
                pendingImageFile = file;
                var preview = wrap.querySelector('[data-preview="' + f.key + '"]');
                var previewUrl = URL.createObjectURL(file);
                if (preview) preview.src = previewUrl;
              });
            }
          });

        var saveItemBtn = document.getElementById("saveItemBtn-" + key);
        if (saveItemBtn) {
          saveItemBtn.addEventListener("click", async function () {
            saveItemBtn.disabled = true;
            saveItemBtn.textContent = "Menyimpan…";
            try {
              cfg.fields.forEach(function (f) {
                if (f.type === "image") return;
                var input = wrap.querySelector('[data-field="' + f.key + '"]');
                if (input) draft[f.key] = input.value;
              });
              var imageField = cfg.fields.find(function (f) { return f.type === "image"; });
              if (imageField && pendingImageFile) {
                draft[imageField.key] = await uploadImage(pendingImageFile, key);
              }

              var payload = {};
              cfg.fields.forEach(function (f) { payload[f.key] = draft[f.key] || ""; });

              if (isNew) {
                var res = await apiFetch("items?collection=" + key, { method: "POST", body: JSON.stringify(payload) });
                if (SITE_DATA) SITE_DATA[key].push(res.item);
              } else {
                var resPut = await apiFetch("items?collection=" + key + "&id=" + draft.id, { method: "PUT", body: JSON.stringify(payload) });
                if (SITE_DATA) {
                  var idx = SITE_DATA[key].findIndex(function (i) { return i.id === draft.id; });
                  if (idx !== -1) SITE_DATA[key][idx] = resPut.item;
                }
              }
              cfg.renderFn();
              draw();
              toast(isNew ? "Item baru ditambahkan." : "Perubahan berhasil disimpan.");
            } catch (err) {
              alert("Gagal menyimpan item: " + (err.message || ""));
              saveItemBtn.disabled = false;
              saveItemBtn.textContent = "Simpan Item";
            }
          });
        }

        var cancelBtn = document.getElementById("cancelItemBtn-" + key);
        if (cancelBtn) {
          cancelBtn.addEventListener("click", function () { draw(); });
        }
      }
    }
    draw();
  }

  /* ---------- Panel 5: Backup & Restore Data ---------- */
  function renderAdminData() {
    var el = document.getElementById("panelData");
    if (!el) return;

    el.innerHTML =
      '<h2 class="admin-h2">💾 Cadangan &amp; Pemulihan Data Portal</h2>' +
      '<p class="admin-sub">Ekspor seluruh konten portal sebagai berkas JSON untuk arsip, atau impor berkas JSON untuk pemulihan instan.</p>' +
      '<div class="admin-card">' +
      '  <h3>⬇ Unduh Cadangan JSON</h3>' +
      '  <p style="font-size:0.85rem;color:var(--slate);">Mengunduh seluruh konfigurasi pengaturan situs, menu, destinasi, akomodasi, paket wisata, kalender, dan ekraf saat ini.</p>' +
      '  <button type="button" class="btn btn-primary" id="exportDataBtn">📥 Unduh site-data.json</button>' +
      '</div>' +
      '<div class="admin-card">' +
      '  <h3>⬆ Pulihkan / Impor Data JSON</h3>' +
      '  <p style="font-size:0.85rem;color:var(--slate);">Pilih berkas format JSON cadangan untuk menggantikan konten situs saat ini.</p>' +
      '  <input type="file" id="importJsonFile" accept=".json" style="margin-bottom:14px;">' +
      '  <br>' +
      '  <button type="button" class="btn btn-outline-dark" id="importDataBtn">📤 Impor &amp; Terapkan Data</button>' +
      '</div>';

    var exportBtn = document.getElementById("exportDataBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        var blob = new Blob([JSON.stringify(SITE_DATA, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "banten-tourism-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(url);
        toast("Cadangan JSON berhasil diunduh.");
      });
    }

    var importBtn = document.getElementById("importDataBtn");
    if (importBtn) {
      importBtn.addEventListener("click", function () {
        var fileInput = document.getElementById("importJsonFile");
        var file = fileInput && fileInput.files ? fileInput.files[0] : null;
        if (!file) {
          alert("Silakan pilih berkas .json terlebih dahulu.");
          return;
        }
        var reader = new FileReader();
        reader.onload = async function (e) {
          try {
            var parsed = JSON.parse(e.target.result);
            await apiFetch("data/import", {
              method: "POST",
              body: JSON.stringify(parsed),
            });
            await loadSiteData();
            renderAll();
            renderAdminAll();
            toast("Data portal berhasil dipulihkan dari JSON!");
          } catch (err) {
            alert("Gagal memulihkan data: " + (err.message || ""));
          }
        };
        reader.readAsText(file);
      });
    }
  }

  async function renderAdminAll() {
    await renderAdminAnalytics();
    await renderAdminNotifikasi();
    renderAdminHero();
    renderAdminBadak();
    renderAdminMenu();
    renderAdminSections();
    renderAdminPengaturan();
    renderAdminFooter();
    Object.keys(COLLECTIONS).forEach(function (k) {
      renderAdminCollection(k);
    });
    renderAdminData();
  }

  /* ============================================================
     INIT & BOOTSTRAP
     ============================================================ */
  (async function init() {
    try {
      await loadSiteData();
      await loadNotifications();
    } catch (err) {
      console.error("Gagal memuat portal:", err);
      document.body.innerHTML =
        '<div style="padding:60px;text-align:center;font-family:sans-serif;color:#0B1E2D;">' +
        '  <h2>Gagal memuat portal pariwisata</h2>' +
        '  <p>Terjadi kendala menghubungkan ke server data.</p>' +
        '</div>';
      return;
    }

    renderAll();
    showView("public");
    checkAdminSession();
    renderHistoryDrawer();
  })();
})();
