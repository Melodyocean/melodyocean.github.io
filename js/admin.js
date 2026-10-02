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
        '<main class="content"><div id="overview-box">' + App.loadingHtml + '</div>' +
        '<h3 class="section-title">管理工具</h3>' +
        '<div class="card list">' +
        '<a class="list-row" href="#/admin/members"><span class="list-main">成員管理</span><span class="chev">›</span></a>' +
        '<a class="list-row" href="#/admin/units"><span class="list-main">單位管理</span><span class="chev">›</span></a>' +
        '<a class="list-row" href="#/admin/logs"><span class="list-main">操作紀錄</span><span class="chev">›</span></a>' +
        '<a class="list-row" href="#/admin/deleted"><span class="list-main">已刪除項目</span><span class="chev">›</span></a>' +
        '<div class="list-row digest-row"><span class="list-main"><span class="list-title">每日摘要</span>' +
        '<span class="list-sub" id="digest-status">讀取中…</span></span>' +
        '<button class="btn btn-small btn-secondary" type="button" id="btn-test-digest">寄一封我的摘要給我</button></div>' +
        '</div></main>';
      App.api('overview').then(function (data) {
        var box = App.$('overview-box');
        if (box) App.renderOverview(box, data);
      }).catch(function (err) {
        var box = App.$('overview-box');
        if (box) box.innerHTML = App.errorHtml(err);
      });
      App.api('notify.status').then(function (d) {
        var el = App.$('digest-status');
        if (!el) return;
        el.textContent = d.last
          ? '上次自動寄送：' + App.fmtDateTime(d.last.at) + '，寄出 ' + d.last.sent + ' 封' + (d.last.failed.length ? '，失敗 ' + d.last.failed.length + ' 封' : '')
          : '排程已設定：工作日 9:00～9:30 自動寄出（尚未寄過）';
      }).catch(function () {
        var el = App.$('digest-status');
        if (el) el.textContent = '無法讀取寄送狀態';
      });
      App.$('btn-test-digest').onclick = function () {
        var btn = App.$('btn-test-digest');
        App.busy(btn, App.api('notify.testDigest'), '寄送中…')
          .then(function (r) {
            App.alert('已寄出測試摘要', '寄到：' + r.to + '\n' + (r.total ? '內容共 ' + r.total + ' 項。' : '目前沒有任何內容（正式摘要在沒有內容時不會寄出）。') +
              '\n\n如果沒收到，請檢查垃圾信件匣。寄到公司信箱的話，可能需要請公司郵件管理人員把寄件地址加入白名單。');
          })
          .catch(function (err) { App.toast(err.message); });
      };
    }
  });

  // ---------- 管理總覽內容（SPEC 6.10、D-049）----------

  var BOXES = [
    { key: 'all', label: '全公司未完成', count: 'open', cls: 'stat-open' },
    { key: 'overdue', label: '已逾期（內部）', count: 'overdue', cls: 'stat-overdue' },
    { key: 'waiting', label: '等待外部', count: 'waiting', cls: 'stat-waiting' },
    { key: 'followUpOverdue', label: '追蹤逾期', count: 'followUpOverdue', cls: 'stat-follow' },
    { key: 'review', label: '待簽核', count: 'review', cls: 'stat-review' },
    { key: 'stalled', label: '停滯', count: 'stalled', cls: 'stat-stalled' }
  ];

  var BOX_MATCH = {
    all: function () { return true; },
    overdue: function (t) { return t.overdueDays > 0; },
    waiting: function (t) { return t.status === '等待外部'; },
    followUpOverdue: function (t) { return t.followUpOverdue; },
    review: function (t) { return t.status === '待簽核'; },
    stalled: function (t) { return t.stalled; }
  };

  App.renderOverview = function (box, d) {
    var f = App.state.overviewFilter || (App.state.overviewFilter = { box: 'all', unitId: '', status: '', assigneeId: '' });
    var memberById = {};
    d.members.forEach(function (m) { memberById[m.id] = m; });

    /** 依負責人篩選：直接指定給此人，或此人所屬單位中未指定個人的任務（D-049） */
    function assigneeMatch(t) {
      if (!f.assigneeId) return { ok: true };
      if (t.assigneeIds.indexOf(f.assigneeId) !== -1) return { ok: true };
      var m = memberById[f.assigneeId];
      if (m && !t.assigneeIds.length && m.units.indexOf(t.unitId) !== -1) return { ok: true, unitWide: true };
      return { ok: false };
    }

    function draw() {
      var list = d.tasks.filter(function (t) {
        return BOX_MATCH[f.box](t) && (!f.unitId || t.unitId === f.unitId) && (!f.status || t.status === f.status) && assigneeMatch(t).ok;
      });
      var filtered = f.box !== 'all' || f.unitId || f.status || f.assigneeId;
      box.innerHTML =
        '<div class="stat-grid">' + BOXES.map(function (b) {
          return '<button type="button" class="stat ' + b.cls + (f.box === b.key ? ' selected' : '') + '" data-box="' + b.key + '">' +
            '<span class="stat-num">' + d.counts[b.count] + '</span><span class="stat-label">' + b.label + '</span></button>';
        }).join('') + '</div>' +

        '<h3 class="section-title">各單位狀況</h3>' +
        '<div class="card unit-table"><div class="ut-row ut-head"><span>單位</span><span>未完成</span><span>逾期</span><span>等待外部</span><span>停滯</span></div>' +
        d.units.map(function (u) {
          return '<button type="button" class="ut-row' + (f.unitId === u.id ? ' selected' : '') + '" data-unit-filter="' + esc(u.id) + '">' +
            '<span>' + esc(u.name) + (u.active ? '' : '<small class="muted">（已停用）</small>') + '</span>' +
            '<span>' + u.open + '</span><span class="' + (u.overdue ? 'num-red' : '') + '">' + u.overdue + '</span>' +
            '<span class="' + (u.waiting ? 'num-purple' : '') + '">' + u.waiting + '</span><span class="' + (u.stalled ? 'num-gray' : '') + '">' + u.stalled + '</span></button>';
        }).join('') + '</div>' +

        '<h3 class="section-title">所有未完成任務</h3>' +
        '<div class="card filter-bar">' +
        '<select class="input" data-f="unitId"><option value="">全部單位</option>' + d.units.map(function (u) {
          return '<option value="' + esc(u.id) + '"' + (f.unitId === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>';
        }).join('') + '</select>' +
        '<select class="input" data-f="status"><option value="">全部狀態</option>' + ['未開始', '進行中', '等待外部', '待簽核'].map(function (st) {
          return '<option' + (f.status === st ? ' selected' : '') + '>' + st + '</option>';
        }).join('') + '</select>' +
        '<select class="input" data-f="assigneeId"><option value="">全部負責人</option>' + d.members.map(function (m) {
          return '<option value="' + esc(m.id) + '"' + (f.assigneeId === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>';
        }).join('') + '</select>' +
        (filtered ? '<button type="button" class="link-btn" data-role="clear">清除篩選</button>' : '') +
        '</div>' +
        '<p class="hint">共 ' + list.length + ' 項 · 排序：逾期 → 追蹤逾期 → 停滯 → 期限</p>' +
        (list.length ? '<div class="card list">' + list.map(function (t) { return overviewRow(t, assigneeMatch(t).unitWide); }).join('') + '</div>'
          : '<div class="card empty"><p class="muted">沒有符合的任務。</p></div>') +

        (d.paused.length ? '<h3 class="section-title">暫停中專案（' + d.paused.length + '）</h3><div class="card list">' + d.paused.map(function (p) {
          return '<a class="list-row" href="#/projects/' + encodeURIComponent(p.id) + '"><span class="list-main">' +
            '<span class="list-title">' + esc(p.id) + ' ' + esc(p.name) + ' <span class="tag tag-paused">暫停中</span></span>' +
            '<span class="list-sub">' + esc(p.pauseReason) + ' · 預計 ' + esc(App.fmtDate(p.resumeDate)) + ' 恢復 · 未完成 ' + p.openCount + ' 項</span></span>' +
            '<span class="chev">›</span></a>';
        }).join('') + '</div>' : '');

      box.querySelectorAll('[data-box]').forEach(function (b) {
        b.onclick = function () { f.box = b.getAttribute('data-box'); draw(); };
      });
      box.querySelectorAll('[data-unit-filter]').forEach(function (b) {
        b.onclick = function () {
          var id = b.getAttribute('data-unit-filter');
          f.unitId = f.unitId === id ? '' : id;
          draw();
        };
      });
      box.querySelectorAll('[data-f]').forEach(function (sel) {
        sel.onchange = function () { f[sel.getAttribute('data-f')] = sel.value; draw(); };
      });
      var clear = box.querySelector('[data-role="clear"]');
      if (clear) clear.onclick = function () { f.box = 'all'; f.unitId = ''; f.status = ''; f.assigneeId = ''; draw(); };
      if (App.markSelected) App.markSelected();
    }
    draw();
  };

  function overviewRow(t, unitWide) {
    var right = t.overdueDays > 0 ? '<span class="due overdue">逾期 ' + t.overdueDays + ' 天</span>' : App.dueHtml(t);
    var who = t.assigneeNames.length ? t.assigneeNames.join('、') : '單位全體';
    return '<a class="task-row ov-row" data-task="' + esc(t.id) + '" href="#/tasks/' + encodeURIComponent(t.id) + '">' +
      '<span class="task-main">' +
      '<span class="task-title"><span class="task-id">' + esc(t.id) + '</span> ' + esc(t.title) + '</span>' +
      '<span class="task-sub">' + App.statusBadge(t.status) +
      (t.stalled ? ' <span class="tag tag-stalled">停滯 ' + t.idleDays + ' 天</span>' : '') +
      (unitWide ? ' <span class="tag tag-paused">單位全體</span>' : '') +
      ' <span>' + esc(t.unitName) + ' · ' + esc(who) + ' · ' + esc(t.projectId ? t.projectName : '公共待辦') + '</span></span>' +
      (t.waiting ? '<span class="task-sub waiting-line">等' + esc(t.waiting.waitingFor) + '：' + esc(t.waiting.note) + ' · 下次追蹤 ' + esc(App.fmtDate(t.waiting.followUpDate)) + '</span>' : '') +
      '<span class="task-sub small">最後更新 ' + esc(App.fmtDate(t.lastActivityAt)) + '</span>' +
      '</span>' +
      '<span class="task-side">' + right + '</span>' +
      '</a>';
  }

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
        var member = isNew ? { name: '', email: '', notifyEmail: '', units: [], role: '一般成員', active: true }
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
      '<label class="field"><span class="field-label">通知信箱 <span class="muted small">選填</span></span>' +
      '<input class="input" name="notifyEmail" type="email" inputmode="email" autocapitalize="off" value="' + esc(member.notifyEmail || '') + '" autocomplete="off">' +
      '<span class="field-hint">每日摘要寄到這裡（通常是公司信箱）；沒填就寄到上面的 Gmail</span></label>' +
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
      var payload = { name: name, email: email, notifyEmail: form.notifyEmail.value.trim(), units: state.units, role: state.role };
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
