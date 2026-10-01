/**
 * 總覽分頁（僅管理者）與管理工具：成員管理、單位管理（SPEC 4.1、4.2、5.8）。
 * 畫面上的限制只是方便操作，真正的權限檢查在後端。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  // ---------- 總覽 ----------

  App.route('/overview', {
    tab: 'overview',
    admin: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '總覽' }) +
        '<main class="content">' +
        '<div class="card empty"><h2>管理總覽：第 6 階段開放</h2>' +
        '<p class="muted">之後這裡會顯示全公司的未完成、逾期、停滯任務與各單位狀況。</p></div>' +
        '<h3 class="section-title">管理工具</h3>' +
        '<div class="card list">' +
        '<a class="list-row" href="#/admin/members"><span class="list-main">成員管理</span><span class="chev">›</span></a>' +
        '<a class="list-row" href="#/admin/units"><span class="list-main">單位管理</span><span class="chev">›</span></a>' +
        '<div class="list-row disabled"><span class="list-main">操作紀錄</span><span class="muted small">第 4 階段開放</span></div>' +
        '<div class="list-row disabled"><span class="list-main">已刪除項目</span><span class="muted small">第 4 階段開放</span></div>' +
        '</div></main>';
    }
  });

  // ---------- 成員清單 ----------

  App.route('/admin/members', {
    tab: 'overview',
    admin: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '成員管理', back: '/overview', backLabel: '總覽' }) +
        '<main class="content"><a class="btn btn-primary btn-block" href="#/admin/members/new">＋ 新增成員</a>' +
        '<div id="member-list">' + App.loadingHtml + '</div></main>';
      App.api('members.list').then(function (data) {
        var active = data.members.filter(function (m) { return m.active; });
        var inactive = data.members.filter(function (m) { return !m.active; });
        var box = App.$('member-list');
        if (!box) return;
        box.innerHTML =
          '<h3 class="section-title">啟用中（' + active.length + '）</h3>' + memberRows(active) +
          (inactive.length ? '<h3 class="section-title">已停用（' + inactive.length + '）</h3>' + memberRows(inactive) : '');
      }).catch(function (err) {
        var box = App.$('member-list');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  function memberRows(list) {
    if (!list.length) return '<div class="card"><p class="muted">沒有成員</p></div>';
    return '<div class="card list">' + list.map(function (m) {
      var units = m.units.length ? m.units.map(App.unitName).join('、') : '未設定單位';
      return '<a class="list-row' + (m.active ? '' : ' inactive') + '" href="#/admin/members/' + encodeURIComponent(m.id) + '">' +
        '<span class="avatar avatar-sm">' + esc(App.initial(m.name)) + '</span>' +
        '<span class="list-main"><span class="list-title">' + esc(m.name) +
        (m.role === '管理者' ? ' <span class="badge badge-admin">管理者</span>' : '') +
        (m.active ? '' : ' <span class="badge badge-muted">已停用</span>') + '</span>' +
        '<span class="list-sub">' + esc(units) + '</span></span>' +
        '<span class="chev">›</span></a>';
    }).join('') + '</div>';
  }

  // ---------- 新增／編輯成員 ----------

  App.route('/admin/members/:id', {
    tab: 'overview',
    admin: true,
    render: function (page, params) {
      var isNew = params.id === 'new';
      page.innerHTML = App.topbar({ title: isNew ? '新增成員' : '編輯成員', back: '/admin/members', backLabel: '成員' }) +
        '<main class="content" id="member-form-box">' + App.loadingHtml + '</main>';
      // 編輯時需要該成員資料；單位清單也重新取得，確保是最新的
      Promise.all([isNew ? null : App.api('members.list'), App.api('units.list')]).then(function (res) {
        App.state.units = res[1].units;
        var member = isNew ? { name: '', email: '', units: [], role: '一般成員', active: true }
          : res[0].members.filter(function (m) { return m.id === params.id; })[0];
        var box = App.$('member-form-box');
        if (!box) return;
        if (!member) { box.innerHTML = App.errorHtml({ message: '找不到這位成員。' }); return; }
        renderMemberForm(box, member, isNew);
      }).catch(function (err) {
        var box = App.$('member-form-box');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  function renderMemberForm(box, member, isNew) {
    var selectable = App.state.units.filter(function (u) { return u.active || member.units.indexOf(u.id) !== -1; });
    var isSelf = member.id === App.state.profile.id;
    box.innerHTML =
      '<form id="member-form" class="card form" novalidate>' +
      '<label class="field"><span class="field-label">姓名 <em>必填</em></span>' +
      '<input class="input" name="name" maxlength="30" value="' + esc(member.name) + '" autocomplete="off"></label>' +
      '<label class="field"><span class="field-label">Gmail <em>必填</em></span>' +
      '<input class="input" name="email" type="email" inputmode="email" autocapitalize="off" value="' + esc(member.email) + '" autocomplete="off">' +
      '<span class="field-hint">同仁用這個 Google 帳號登入系統</span></label>' +
      '<div class="field"><span class="field-label">所屬單位 <span class="muted small">可多選</span></span>' +
      '<div class="chips">' + selectable.map(function (u) {
        var on = member.units.indexOf(u.id) !== -1;
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-unit="' + esc(u.id) + '" aria-pressed="' + on + '">' +
          esc(u.name) + (u.active ? '' : '（已停用）') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="field-label">角色</span>' +
      '<div class="segmented">' + ['一般成員', '管理者'].map(function (r) {
        return '<button type="button" class="seg' + (member.role === r ? ' on' : '') + '" data-role="' + r + '" aria-pressed="' + (member.role === r) + '">' + r + '</button>';
      }).join('') + '</div></div>' +
      '<div class="alert" id="member-error" role="alert" hidden></div>' +
      '<button class="btn btn-primary btn-block" type="submit" id="member-save">' + (isNew ? '新增成員' : '儲存') + '</button>' +
      '</form>' +
      (isNew ? '' :
        '<div class="card">' +
        (member.active
          ? '<p class="muted small">停用後這位同仁就無法登入，但他過去的紀錄都會保留。</p>' +
            '<button class="btn btn-danger btn-block" type="button" id="member-toggle"' + (isSelf ? ' disabled' : '') + '>停用這位成員</button>' +
            (isSelf ? '<p class="hint">不能停用自己的帳號。</p>' : '')
          : '<p class="muted small">這位成員目前已停用，無法登入。</p>' +
            '<button class="btn btn-secondary btn-block" type="button" id="member-toggle">重新啟用</button>') +
        '<p class="hint">建立：' + esc(member.createdAt || '') + '　更新：' + esc(member.updatedAt || '') + '</p>' +
        '</div>');

    var form = App.$('member-form');
    var state = { units: member.units.slice(), role: member.role };

    form.querySelectorAll('.chip').forEach(function (chip) {
      chip.onclick = function () {
        var id = chip.getAttribute('data-unit');
        var i = state.units.indexOf(id);
        if (i === -1) state.units.push(id); else state.units.splice(i, 1);
        chip.classList.toggle('on', i === -1);
        chip.setAttribute('aria-pressed', String(i === -1));
      };
    });
    form.querySelectorAll('.seg').forEach(function (seg) {
      seg.onclick = function () {
        state.role = seg.getAttribute('data-role');
        form.querySelectorAll('.seg').forEach(function (s) {
          var on = s === seg;
          s.classList.toggle('on', on);
          s.setAttribute('aria-pressed', String(on));
        });
      };
    });

    form.onsubmit = function (e) {
      e.preventDefault();
      var err = App.$('member-error');
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var missing = [];
      if (!name) missing.push('姓名');
      if (!email) missing.push('Gmail');
      if (missing.length) {
        err.textContent = '請填寫：' + missing.join('、');
        err.hidden = false;
        return;
      }
      err.hidden = true;
      var payload = { name: name, email: email, units: state.units, role: state.role };
      if (!isNew) payload.id = member.id;
      App.busy(App.$('member-save'), App.api(isNew ? 'members.create' : 'members.update', payload), '儲存中…')
        .then(function () {
          App.toast(isNew ? '已新增成員' : '已儲存');
          var after = isSelf ? App.refreshBootstrap() : Promise.resolve();
          return after.then(function () { App.go('/admin/members', true); });
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          err.hidden = false;
        });
    };

    var toggle = App.$('member-toggle');
    if (toggle) {
      toggle.onclick = function () {
        var activate = !member.active;
        var ask = activate
          ? Promise.resolve(true)
          : App.confirm({
            title: '停用「' + member.name + '」？',
            message: '停用後他就無法登入系統，過去的紀錄會保留。之後可以重新啟用。',
            okText: '停用',
            danger: true
          });
        ask.then(function (yes) {
          if (!yes) return;
          App.busy(toggle, App.api('members.setActive', { id: member.id, active: activate }))
            .then(function () {
              App.toast(activate ? '已重新啟用' : '已停用');
              App.go('/admin/members', true);
            })
            .catch(function (e2) { App.toast(e2.message); });
        });
      };
    }
  }

  // ---------- 單位管理 ----------

  App.route('/admin/units', {
    tab: 'overview',
    admin: true,
    render: function (page) {
      page.innerHTML = App.topbar({ title: '單位管理', back: '/overview', backLabel: '總覽' }) +
        '<main class="content">' +
        '<form class="card inline-form" id="unit-add">' +
        '<input class="input" name="name" maxlength="20" placeholder="新單位名稱" autocomplete="off">' +
        '<button class="btn btn-primary" type="submit" id="unit-add-btn">新增</button></form>' +
        '<div id="unit-list">' + App.loadingHtml + '</div></main>';

      var form = App.$('unit-add');
      form.onsubmit = function (e) {
        e.preventDefault();
        var name = form.name.value.trim();
        if (!name) { form.name.focus(); return; }
        App.busy(App.$('unit-add-btn'), App.api('units.create', { name: name }), '新增中…')
          .then(function () { App.toast('已新增「' + name + '」'); form.name.value = ''; loadUnits(); })
          .catch(function (err) { App.toast(err.message); });
      };
      loadUnits();
    }
  });

  function loadUnits() {
    return App.api('units.list').then(function (data) {
      App.state.units = data.units;
      var box = App.$('unit-list');
      if (!box) return;
      var active = data.units.filter(function (u) { return u.active; });
      var inactive = data.units.filter(function (u) { return !u.active; });
      box.innerHTML =
        '<h3 class="section-title">啟用中（' + active.length + '）</h3>' + unitRows(active) +
        (inactive.length ? '<h3 class="section-title">已停用（' + inactive.length + '）</h3>' + unitRows(inactive) : '') +
        '<p class="hint">停用的單位不能再被指派，也不會出現在選單中；過去的資料會保留。</p>';
      box.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.onclick = function () { onUnitAction(btn, data.units); };
      });
    }).catch(function (err) {
      var box = App.$('unit-list');
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }

  function unitRows(list) {
    if (!list.length) return '<div class="card"><p class="muted">沒有單位</p></div>';
    return '<div class="card list">' + list.map(function (u) {
      return '<div class="list-row' + (u.active ? '' : ' inactive') + '">' +
        '<span class="list-main"><span class="list-title">' + esc(u.name) + '</span>' +
        '<span class="list-sub">' + u.memberCount + ' 位成員</span></span>' +
        (u.active
          ? '<button class="btn btn-small btn-secondary" type="button" data-act="rename" data-id="' + esc(u.id) + '">改名</button>' +
            '<button class="btn btn-small btn-danger" type="button" data-act="disable" data-id="' + esc(u.id) + '">停用</button>'
          : '<button class="btn btn-small btn-secondary" type="button" data-act="enable" data-id="' + esc(u.id) + '">重新啟用</button>') +
        '</div>';
    }).join('') + '</div>';
  }

  function onUnitAction(btn, units) {
    var unit = units.filter(function (u) { return u.id === btn.getAttribute('data-id'); })[0];
    var act = btn.getAttribute('data-act');
    var ask;
    if (act === 'rename') {
      ask = App.prompt({ title: '單位改名', value: unit.name, maxLength: 20, okText: '儲存' }).then(function (name) {
        return name && name !== unit.name ? App.api('units.rename', { id: unit.id, name: name }).then(function () { return '已改名為「' + name + '」'; }) : null;
      });
    } else if (act === 'disable') {
      ask = App.confirm({
        title: '停用「' + unit.name + '」？',
        message: (unit.memberCount ? '這個單位目前有 ' + unit.memberCount + ' 位成員。' : '') +
          '停用後不能再被指派、不會出現在選單中，過去的資料會保留。之後可以重新啟用。',
        okText: '停用',
        danger: true
      }).then(function (yes) {
        return yes ? App.api('units.setActive', { id: unit.id, active: false }).then(function () { return '已停用「' + unit.name + '」'; }) : null;
      });
    } else {
      ask = App.api('units.setActive', { id: unit.id, active: true }).then(function () { return '已重新啟用「' + unit.name + '」'; });
    }
    App.busy(btn, ask, '…')
      .then(function (msg) {
        if (!msg) return;
        App.toast(msg);
        return loadUnits().then(App.refreshBootstrap);
      })
      .catch(function (err) { App.toast(err.message); });
  }
})();
