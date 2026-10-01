(function () {
  'use strict';

  var CFG = window.APP_CONFIG;
  var TOKEN_KEY = 'pt_session';
  var state = { profile: null, googleReady: false, installPrompt: null };

  // ---------- 小工具 ----------

  function $(id) { return document.getElementById(id); }

  function show(viewId) {
    document.querySelectorAll('.view').forEach(function (el) { el.hidden = el.id !== viewId; });
    window.scrollTo(0, 0);
  }

  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2500);
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 無痕模式等情況 */ }
  }

  /** 呼叫後端。失敗時丟出 { code, message }。 */
  function api(action, payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 30000);
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, token: getToken(), payload: payload || {} }),
      signal: controller.signal
    })
      .then(function (res) { return res.json(); })
      .catch(function () {
        throw { code: 'NETWORK', message: '連線失敗，請確認網路後再試一次。' };
      })
      .then(function (json) {
        clearTimeout(timer);
        if (!json || !json.ok) throw (json && json.error) || { code: 'SERVER_ERROR', message: '系統發生錯誤，請稍後再試。' };
        return json.data;
      });
  }

  // ---------- App 內建瀏覽器（LINE 等）----------

  function handleInAppBrowser() {
    var ua = navigator.userAgent || '';
    var isLine = /\bLine\//i.test(ua);
    var isOtherInApp = /FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
    if (isLine && !/[?&]openExternalBrowser=1/.test(location.search)) {
      // LINE 支援這個參數：會自動改用手機的預設瀏覽器開啟
      var sep = location.search ? '&' : '?';
      location.replace(location.pathname + location.search + sep + 'openExternalBrowser=1' + location.hash);
      return true;
    }
    if (isLine || isOtherInApp) {
      show('view-inapp');
      return true;
    }
    // 從 LINE 轉到外部瀏覽器後，把網址上的參數清掉
    if (/[?&]openExternalBrowser=1/.test(location.search) && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
    return false;
  }

  $('btn-copy-link').addEventListener('click', function () {
    var url = location.origin + location.pathname;
    var done = function () { $('copy-result').textContent = '已複製，請貼到 Safari 或 Chrome 開啟。'; };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done, function () { $('copy-result').textContent = url; });
    } else {
      $('copy-result').textContent = url;
    }
  });

  // ---------- 登入 ----------

  function showLogin(errorMessage) {
    state.profile = null;
    $('login-busy').hidden = true;
    $('login-error').hidden = !errorMessage;
    $('login-error').textContent = errorMessage || '';
    show('view-login');
    renderGoogleButton();
  }

  function renderGoogleButton() {
    if (!state.googleReady) return;
    var box = $('google-button');
    box.innerHTML = '';
    google.accounts.id.renderButton(box, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      locale: 'zh-TW',
      width: Math.min(320, box.parentElement.clientWidth - 32)
    });
  }

  function onGoogleCredential(response) {
    $('login-error').hidden = true;
    $('login-busy').hidden = false;
    api('login', { idToken: response.credential })
      .then(function (data) {
        setToken(data.token);
        showHome(data.profile);
      })
      .catch(function (err) {
        setToken(null);
        if (window.google) google.accounts.id.disableAutoSelect();
        var msg = err.message;
        if (err.code === 'NOT_MEMBER') msg += ' 請確認你用的是正確的 Gmail，或請管理者把你加入成員名單。';
        showLogin(msg);
      });
  }

  window.onGoogleLibraryLoad = function () {
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup'
    });
    state.googleReady = true;
    if (!$('view-login').hidden) renderGoogleButton();
  };

  function logout() {
    setToken(null);
    if (window.google && state.googleReady) google.accounts.id.disableAutoSelect();
    showLogin();
  }

  // ---------- 首頁與個人設定 ----------

  function showHome(profile) {
    state.profile = profile;
    $('home-date').textContent = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long'
    }).format(new Date());
    $('home-name').textContent = profile.name;
    $('btn-open-settings').textContent = (profile.name || '?').trim().charAt(0).toUpperCase();
    renderInstallCard();
    show('view-home');
  }

  function showSettings() {
    var p = state.profile;
    $('profile-name').textContent = p.name;
    $('profile-email').textContent = p.email;
    $('profile-units').textContent = p.units.length ? p.units.map(function (u) { return u.name; }).join('、') : '（尚未設定）';
    $('profile-role').textContent = p.role;
    $('app-version').textContent = '版本 ' + CFG.VERSION + '（第 0 階段）';
    show('view-settings');
  }

  $('btn-open-settings').addEventListener('click', showSettings);
  $('btn-back-home').addEventListener('click', function () { show('view-home'); });
  $('btn-logout').addEventListener('click', logout);

  // ---------- 加到主畫面 ----------

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function renderInstallCard() {
    var card = $('install-card');
    if (isStandalone()) { card.hidden = true; return; }
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var text;
    if (state.installPrompt) {
      text = '把系統安裝到這台裝置，之後就能像 App 一樣從主畫面打開。';
    } else if (isIOS) {
      text = '在 Safari 點下方的「分享」按鈕（方框加向上箭頭），往下找到「加入主畫面」，再按「新增」。';
    } else if (/Android/i.test(ua)) {
      text = '在 Chrome 點右上角「⋮」，選「加到主畫面」或「安裝應用程式」。';
    } else {
      card.hidden = true;
      return;
    }
    $('install-text').textContent = text;
    $('btn-install').hidden = !state.installPrompt;
    card.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    state.installPrompt = e;
    if (state.profile) renderInstallCard();
  });

  $('btn-install').addEventListener('click', function () {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    state.installPrompt.userChoice.then(function () {
      state.installPrompt = null;
      renderInstallCard();
    });
  });

  // ---------- 啟動 ----------

  function start() {
    if (handleInAppBrowser()) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 不影響使用 */ });
    }
    if (!getToken()) { showLogin(); return; }
    api('me')
      .then(function (data) { showHome(data.profile); })
      .catch(function (err) {
        if (err.code === 'NETWORK') {
          showLogin(err.message);
          return;
        }
        setToken(null);
        showLogin(err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_INVALID' ? '' : err.message);
      });
  }

  start();
})();
