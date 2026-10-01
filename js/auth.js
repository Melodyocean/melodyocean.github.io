/**
 * 登入流程：App 內建瀏覽器處理、Google 登入、登出、啟動。
 */
(function () {
  'use strict';
  var App = window.App;
  var $ = App.$;

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
      App.showView('view-inapp');
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
    App.state.profile = null;
    $('login-busy').hidden = true;
    $('login-error').hidden = !errorMessage;
    $('login-error').textContent = errorMessage || '';
    App.showView('view-login');
    renderGoogleButton();
  }

  function renderGoogleButton() {
    if (!App.state.googleReady) return;
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
    App.api('login', { idToken: response.credential })
      .then(function (data) {
        App.setToken(data.token);
        return loadApp();
      })
      .catch(function (err) {
        App.setToken(null);
        if (window.google) google.accounts.id.disableAutoSelect();
        var msg = err.message;
        if (err.code === 'NOT_MEMBER') msg += ' 請確認你用的是正確的 Gmail，或請管理者把你加入成員名單。';
        showLogin(msg);
      });
  }

  window.onGoogleLibraryLoad = function () {
    google.accounts.id.initialize({
      client_id: App.cfg.GOOGLE_CLIENT_ID,
      callback: onGoogleCredential,
      ux_mode: 'popup'
    });
    App.state.googleReady = true;
    if (!$('view-login').hidden) renderGoogleButton();
  };

  App.logout = function () {
    App.setToken(null);
    if (window.google && App.state.googleReady) google.accounts.id.disableAutoSelect();
    showLogin();
  };

  /** 使用中被停用、通行證過期等情況：回到登入畫面。 */
  App.onSessionLost = function (err) {
    if (!App.state.profile) return;
    App.setToken(null);
    showLogin(err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_INVALID' ? '登入已過期，請重新登入。' : err.message);
  };

  /** 取回登入者資料與單位清單，然後顯示畫面。 */
  function loadApp() {
    return App.api('bootstrap').then(function (data) {
      App.state.profile = data.profile;
      App.state.units = data.units;
      App.showView('view-app');
      App.render();
    });
  }

  /** 重新取回登入者資料（例如管理者改了自己的單位）。 */
  App.refreshBootstrap = function () {
    return App.api('bootstrap').then(function (data) {
      App.state.profile = data.profile;
      App.state.units = data.units;
    });
  };

  // ---------- 啟動 ----------

  function start() {
    if (handleInAppBrowser()) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 不影響使用 */ });
    }
    if (!App.getToken()) { showLogin(); return; }
    loadApp().catch(function (err) {
      if (err.code === 'NETWORK') { showLogin(err.message); return; }
      App.setToken(null);
      showLogin(err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_INVALID' ? '' : err.message);
    });
  }

  App.start = start;
})();
