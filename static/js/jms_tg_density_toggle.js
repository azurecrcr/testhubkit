/**
 * JMeter · 树形步骤密度切换（隔离，不修改 jms_tg_tree_shell.js）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'jms-tg-density';
    var MODES = ['compact', 'comfortable', 'dense'];
    var LABELS = { compact: '紧凑', comfortable: '舒适', dense: '超紧' };
    var ICONS = { compact: '▤', comfortable: '▦', dense: '▪' };

    function isActive() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function readMode() {
        var saved = global.localStorage.getItem(STORAGE_KEY);
        return MODES.indexOf(saved) >= 0 ? saved : 'compact';
    }

    function applyMode(mode) {
        if (!isActive()) return;
        var body = global.document.body;
        MODES.forEach(function (m) { body.classList.remove('jms-density-' + m); });
        body.classList.add('jms-density-' + mode);
        global.localStorage.setItem(STORAGE_KEY, mode);
        updateButtons(mode);
    }

    function cycleMode() {
        var idx = MODES.indexOf(readMode());
        applyMode(MODES[(idx + 1) % MODES.length]);
    }

    function updateButtons(mode) {
        global.document.querySelectorAll('.jms-density-toggle-btn').forEach(function (btn) {
            btn.setAttribute('aria-label', '显示密度：' + LABELS[mode] + '，点击切换');
            btn.title = '显示密度：' + LABELS[mode] + '（点击切换）';
            var icon = btn.querySelector('.jms-density-toggle-btn__icon');
            var text = btn.querySelector('.jms-density-toggle-btn__text');
            if (icon) icon.textContent = ICONS[mode] || ICONS.compact;
            if (text) text.textContent = LABELS[mode] || LABELS.compact;
            btn.setAttribute('data-density-mode', mode);
        });
    }

    function createToggleBtn() {
        var btn = global.document.createElement('button');
        btn.type = 'button';
        btn.className = 'jms-density-toggle-btn';
        btn.innerHTML = '<span class="jms-density-toggle-btn__icon" aria-hidden="true">▤</span>' +
            '<span class="jms-density-toggle-btn__text">紧凑</span>';
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            cycleMode();
        });
        return btn;
    }

    function ensureToggle() {
        if (!isActive()) return;
        var navHead = global.document.querySelector('.jms-tg-tree-nav__head');
        if (!navHead || navHead.querySelector('.jms-density-toggle-btn')) return;
        var host = navHead.querySelector('.jms-tg-tree-nav__head-right') || navHead;
        host.insertBefore(createToggleBtn(), host.firstChild);
        updateButtons(readMode());
    }

    function bind() {
        applyMode(readMode());
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgDensityToggleBound === '1') return;
        root.dataset.jmsTgDensityToggleBound = '1';
        ensureToggle();
        var obs = new MutationObserver(function () { ensureToggle(); });
        obs.observe(root, { childList: true, subtree: true });
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgDensityToggle = { applyMode: applyMode, readMode: readMode };
}(typeof window !== 'undefined' ? window : this));
