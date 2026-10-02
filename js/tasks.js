/**
 * 任務畫面：公共待辦清單、歷史、任務詳情、新增表單、修改指派（SPEC 5.4、5.7、6.2–6.6）。
 * 按鈕是否出現由後端回傳的權限決定；送出時後端會再檢查一次。
 */
(function () {
  'use strict';
  var App = window.App;
  var esc = App.esc;

  var STATUS_CLASS = { '未開始': 'todo', '進行中': 'doing', '等待外部': 'waiting', '待簽核': 'review', '已完成': 'done' };
  var GROUP_ORDER = ['待簽核', '進行中', '等待外部', '未開始']; // SPEC 5.3

  // ---------- 共用片段 ----------

  App.statusBadge = function (status) {
    return '<span class="status s-' + (STATUS_CLASS[status] || 'todo') + '">' + esc(status) + '</span>';
  };

  App.dueHtml = function (t) {
    if (t.status === '已完成') return t.completedAt ? '<span class="due">完成於 ' + esc(App.fmtDate(t.completedAt)) + '</span>' : '';
    if (t.waiting && t.waiting.followUpState === 'overdue') return '<span class="due follow-overdue">追蹤逾期 ' + t.waiting.followUpOverdueDays + ' 天</span>';
    if (t.waiting && t.waiting.followUpState === 'today') return '<span class="due follow-today">今天該追蹤</span>';
    if (t.waiting && t.duePassedWhileWaiting) return '<span class="due waiting">已過（等待外部中）</span>';
    if (!t.dueDate) return '';
    if (t.overdueDays > 0) return '<span class="due overdue">逾期 ' + t.overdueDays + ' 天</span>';
    if (t.daysLeft === 0) return '<span class="due soon">今天到期</span>';
    return '<span class="due">' + esc(App.fmtDate(t.dueDate)) + '</span>';
  };

  function whoHtml(t) {
    return esc(t.unitName) + ' · ' + (t.assigneeNames.length ? esc(t.assigneeNames.join('、')) : '單位全體');
  }

  /**
   * 一筆任務。手機版是卡片（兩行）；電腦版以表格欄位呈現（SPEC 5.6：
   * 編號、任務、單位、負責人、期限、狀態、備註數）。opts.inProject：在專案內頁時不重複顯示專案名稱。
   */
  App.taskRow = function (t, opts) {
    opts = opts || {};
    var place = opts.inProject ? '' : esc(t.projectId ? t.projectName : '公共待辦') + ' · ';
    var tags = (t.closedWithProject ? ' <span class="tag tag-paused">隨專案結案</span>' : '') +
      (t.waiting ? ' <span class="tag tag-waiting">等' + esc(t.waiting.waitingFor) + '</span>' : '') +
      (t.projectPaused && !opts.inProject ? ' <span class="tag tag-paused">暫停中</span>' : '');
    var who = t.assigneeNames.length ? esc(t.assigneeNames.join('、')) : '單位全體';
    return '<a class="task-row" data-task="' + esc(t.id) + '" href="#/tasks/' + encodeURIComponent(t.id) + '">' +
      // 手機版
      '<span class="task-main m-cell">' +
      '<span class="task-title"><span class="task-id">' + esc(t.id) + '</span> ' + esc(t.title) + '</span>' +
      '<span class="task-sub">' + App.statusBadge(t.status) + tags + ' <span>' + place + whoHtml(t) + '</span></span>' +
      '</span>' +
      '<span class="task-side m-cell">' + App.dueHtml(t) + (t.noteCount ? '<span class="note-count">💬 ' + t.noteCount + '</span>' : '') + '</span>' +
      // 電腦版表格欄位
      '<span class="d-cell c-id">' + esc(t.id) + '</span>' +
      '<span class="d-cell c-title">' + esc(t.title) + tags + (opts.inProject || !t.projectId ? '' : '<small class="muted">' + esc(t.projectName) + '</small>') + '</span>' +
      '<span class="d-cell c-unit">' + esc(t.unitName) + '</span>' +
      '<span class="d-cell c-who">' + who + '</span>' +
      '<span class="d-cell c-due">' + App.dueHtml(t) + '</span>' +
      '<span class="d-cell c-status">' + App.statusBadge(t.status) + '</span>' +
      '<span class="d-cell c-notes">' + (t.noteCount || '') + '</span>' +
      '</a>';
  };

  /** 任務清單卡片（電腦版附表頭）。 */
  App.taskList = function (tasks, opts) {
    return '<div class="card list task-list">' +
      '<div class="task-thead d-only"><span>編號</span><span>任務</span><span class="c-unit">單位</span><span class="c-who">負責人</span><span>期限</span><span>狀態</span><span class="c-notes">備註</span></div>' +
      tasks.map(function (t) { return App.taskRow(t, opts); }).join('') + '</div>';
  };

  function groupedHtml(tasks) {
    return GROUP_ORDER.map(function (status) {
      var list = tasks.filter(function (t) { return t.status === status; });
      if (!list.length) return '';
      return '<h3 class="section-title">' + App.statusBadge(status) + ' ' + list.length + ' 項</h3>' +
        App.taskList(list);
    }).join('');
  }

  function loadInto(boxId, promise, render) {
    promise.then(function (data) {
      var box = App.$(boxId);
      if (box) box.innerHTML = render(data);
    }).catch(function (err) {
      var box = App.$(boxId);
      if (box) box.innerHTML = App.errorHtml(err);
    });
  }

  // ---------- 公共待辦分頁（SPEC 6.5）----------

  App.route('/todos', {
    tab: 'todos',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '公共待辦' }) +
        '<main class="content" id="todo-list">' + App.loadingHtml + '</main>';
      loadInto('todo-list', App.api('tasks.listTodos'), function (data) {
        if (!data.tasks.length) {
          return '<div class="card empty"><h2>目前沒有未完成的公共待辦</h2>' +
            '<p class="muted">按右下角「＋」可以新增。</p></div>';
        }
        return groupedHtml(data.tasks);
      });
    }
  });

  // ---------- 歷史分頁（SPEC 6.6）----------

  App.route('/history', {
    tab: 'history',
    render: function (page) {
      page.innerHTML = App.topbar({ title: '歷史' }) +
        '<main class="content" id="history-list">' + App.loadingHtml + '</main>';
      loadInto('history-list', App.api('tasks.history'), function (data) {
        if (!data.tasks.length && !data.projects.length) {
          return '<div class="card empty"><h2>還沒有歷史資料</h2>' +
            '<p class="muted">簽核完成的任務、已結案的專案會移到這裡。</p></div>';
        }
        return (data.projects.length ? '<h3 class="section-title">已結案專案（' + data.projects.length + '）</h3>' +
            '<div class="card list">' + data.projects.map(function (p) {
              return '<a class="project-row" href="#/projects/' + encodeURIComponent(p.id) + '">' +
                '<span class="project-title"><span class="task-id">' + esc(p.id) + '</span> ' + esc(p.name) + ' ' + App.projectTags(p) + '</span>' +
                '<span class="project-hint muted">' + (p.closeNote ? esc(p.closeNote) + ' · ' : '') + '結案於 ' + esc(App.fmtDate(p.closedAt)) + ' · 完成 ' + p.done + ' / ' + p.total + ' 項</span></a>';
            }).join('') + '</div>' : '') +
          (data.tasks.length ? '<h3 class="section-title">已完成的任務（' + data.tasks.length + '）</h3>' +
            App.taskList(data.tasks) : '');
      });
    }
  });

  // ---------- 任務詳情、修改指派、編輯任務（整頁；畫面內容在 task-view.js）----------

  App.route('/tasks/:id', { tab: 'todos', noFab: true, render: function (page, params) { App.pageTaskHost(page, params.id, 'detail'); } });
  App.route('/tasks/:id/edit', { tab: 'todos', noFab: true, render: function (page, params) { App.pageTaskHost(page, params.id, 'edit'); } });
  App.route('/tasks/:id/assign', { tab: 'todos', noFab: true, render: function (page, params) { App.pageTaskHost(page, params.id, 'assign'); } });

  // ---------- 新增子任務／公共待辦（SPEC 5.7）----------

  /** place：todo＝公共待辦；pick＝請使用者選專案；其他＝專案編號 */
  App.route('/new/task/:place', {
    tab: 'todos',
    noFab: true,
    render: function (page, params) {
      var place = params.place;
      var isProject = place !== 'todo' && place !== 'pick';
      App.setActiveTab(place === 'todo' ? 'todos' : 'projects');
      page.innerHTML = App.topbar({
        title: place === 'todo' ? '新增公共待辦' : '新增子任務',
        back: isProject ? '/projects/' + encodeURIComponent(place) : (place === 'pick' ? '/projects' : '/todos'),
        backLabel: '取消'
      }) + '<main class="content" id="new-box">' + App.loadingHtml + '</main>';
      Promise.all([App.api('members.list'), App.api('units.list'), App.api('projects.creatable')]).then(function (res) {
        App.state.units = res[1].units;
        if (App.$('new-box')) renderNewForm(res[0].members, res[2].projects, place);
      }).catch(function (err) {
        var box = App.$('new-box');
        if (box) box.innerHTML = App.errorHtml(err);
      });
    }
  });

  App.route('/new/todo', { tab: 'todos', noFab: true, render: function () { App.go('/new/task/todo', true); } });

  function dueOptions() {
    var today = App.today();
    var dow = App.weekday(today);
    var thisFri = App.addDays(today, 5 - (dow === 0 ? 7 : dow));
    return [
      { key: 'tomorrow', label: '明天', date: App.addDays(today, 1) },
      { key: 'thisFri', label: '本週五', date: thisFri, disabled: thisFri < today },
      { key: 'nextFri', label: '下週五', date: App.addDays(thisFri, 7) }
    ];
  }

  function renderNewForm(members, projects, place) {
    var box = App.$('new-box');
    var due = { date: '' };
    var initialPlace = place === 'todo' ? '' : place === 'pick' ? null : place;
    if (initialPlace && !projects.some(function (p) { return p.id === initialPlace; })) {
      box.innerHTML = App.errorHtml({ message: '這個專案目前不能新增子任務（可能已暫停或結案）。' });
      return;
    }
    box.innerHTML =
      '<form class="card form" id="new-form" novalidate>' +
      '<label class="field" id="field-place"><span class="field-label">放在</span>' +
      '<select class="input" name="place">' +
      (initialPlace === null ? '<option value="__pick" selected disabled>請選擇專案…</option>' : '') +
      projects.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === initialPlace ? ' selected' : '') + '>' + esc(p.id + ' ' + p.name) + '</option>';
      }).join('') +
      '<option value=""' + (initialPlace === '' ? ' selected' : '') + '>公共待辦</option>' +
      '</select></label>' +
      '<label class="field" id="field-title"><span class="field-label">任務標題 <em>必填</em></span>' +
      '<input class="input" name="title" maxlength="100" autocomplete="off"></label>' +
      '<div id="assign-box"></div>' +
      '<div class="field"><span class="field-label">期限 <span class="muted small">選填</span></span>' +
      '<div class="chips" id="due-chips">' + dueOptions().map(function (o) {
        return '<button type="button" class="chip" data-due="' + o.date + '"' + (o.disabled ? ' disabled' : '') + '>' + o.label + '</button>';
      }).join('') + '<label class="chip chip-date">選日期…<input type="date" id="due-input" min="' + App.today() + '"></label></div>' +
      '<div class="field-hint" id="due-text"></div></div>' +
      '<button type="button" class="link-btn" id="toggle-more">＋ 說明、文件路徑</button>' +
      '<div id="more-fields" hidden>' +
      '<label class="field"><span class="field-label">說明</span>' +
      '<textarea class="input textarea" name="description" rows="3" maxlength="2000" placeholder="要做什麼、做到什麼程度算完成"></textarea></label>' +
      '<label class="field"><span class="field-label">文件路徑 <span class="muted small">一行一筆</span></span>' +
      '<textarea class="input textarea" name="paths" rows="2" placeholder="例：\\\\server\\品保\\2026\\報告"></textarea></label>' +
      '</div>' +
      '<p class="form-note" id="notify-note"></p>' +
      '<div class="alert" id="new-error" role="alert" hidden></div>' +
      '<button class="btn btn-primary btn-block" type="submit" id="new-save" disabled>建立任務</button>' +
      '<p class="hint center" id="missing-note"></p>' +
      '</form>';

    var form = App.$('new-form');
    var picker = App.assignPicker(App.$('assign-box'), members, {}, update);

    function setDue(date) {
      due.date = date;
      form.querySelectorAll('[data-due]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-due') === date); });
      var input = App.$('due-input');
      var custom = date && !form.querySelector('[data-due="' + date + '"]');
      input.parentElement.classList.toggle('on', !!custom);
      App.$('due-text').innerHTML = date ? '期限：' + esc(App.fmtDate(date)) + ' <button type="button" class="link-btn" id="due-clear">清除</button>' : '';
      var clear = App.$('due-clear');
      if (clear) clear.onclick = function () { input.value = ''; setDue(''); };
    }
    form.querySelectorAll('[data-due]').forEach(function (b) {
      b.onclick = function () { setDue(due.date === b.getAttribute('data-due') ? '' : b.getAttribute('data-due')); };
    });
    App.$('due-input').onchange = function (e) { setDue(e.target.value); };
    App.$('due-input').onclick = function (e) {
      try { if (e.target.showPicker) e.target.showPicker(); } catch (err) { /* 部分瀏覽器不支援 */ }
    };

    App.$('toggle-more').onclick = function () {
      App.$('more-fields').hidden = false;
      App.$('toggle-more').hidden = true;
    };

    function update() {
      var a = picker.get();
      var title = form.title.value.trim();
      var missing = [];
      if (form.place.value === '__pick') missing.push('放在哪個專案');
      if (!title) missing.push('任務標題');
      if (!a.unitId) missing.push('負責單位');
      App.$('new-save').disabled = missing.length > 0;
      App.$('missing-note').textContent = missing.length ? '還缺：' + missing.join('、') : '';
      App.$('field-title').classList.toggle('missing', !title && form.title.dataset.touched === '1');
      // SPEC 5.7 表單底部提示（D-038）
      var who = a.assignees.length ? picker.names().join('、') : (a.unitId ? App.unitName(a.unitId) + '全體' : '負責人或單位');
      App.$('notify-note').textContent = '建立後狀態為「未開始」，' + who + '下個工作日早上 9 點後會收到 Email 通知';
    }
    form.title.oninput = function () { form.title.dataset.touched = '1'; update(); };
    form.place.onchange = update;
    update();

    form.onsubmit = function (e) {
      e.preventDefault();
      var a = picker.get();
      var payload = {
        projectId: form.place.value === '__pick' ? '' : form.place.value,
        title: form.title.value.trim(),
        unitId: a.unitId,
        assignees: a.assignees,
        dueDate: due.date,
        description: form.description.value.trim(),
        paths: form.paths.value.split('\n').map(function (p) { return p.trim(); }).filter(Boolean)
      };
      var err = App.$('new-error');
      err.hidden = true;
      App.busy(App.$('new-save'), App.api('tasks.create', payload), '建立中…')
        .then(function (res) {
          App.toast('已建立 ' + res.id);
          App.go('/tasks/' + encodeURIComponent(res.id), true);
        })
        .catch(function (e2) {
          err.textContent = e2.message;
          err.hidden = false;
        });
    };
  }
})();
