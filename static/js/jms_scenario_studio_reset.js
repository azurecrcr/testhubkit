/**
 * 压测造数 · 空白场景重置（隔离确认弹窗，不复用 modal-jms-confirm，避免文案被主题样式冲掉）
 */
(function (global) {
    'use strict';

    var BLANK_YAML = [
        'name: 新场景',
        'base_url: https://api.example.com',
        'env: staging',
        'build: "${BUILD_ID}"',
        'layout: scenario',
        'plan_catalog_items: []',
        'default_headers:',
        '  Accept: application/json',
        'variables: {}',
        'influxdb:',
        '  enabled: true',
        '  url: http://127.0.0.1:8086/write?db=jmeter',
        '  measurement: jmeter',
        '  application: my-api',
        '  tags:',
        '    env: staging',
        'thread_groups:',
        '  - name: 线程组 1',
        '    load:',
        '      users: 1',
        '      spawn_rate: 1',
        '      duration_sec: 60',
        '      loops: -1',
        '    steps: []'
    ].join('\n') + '\n';

    var hooks = null;
    var MODAL_ID = 'modal-jms-scenario-reset-v1';
    var pendingConfirm = null;

    function ensureStyles() {
        if (global.document.getElementById('jms-scenario-reset-style-v1')) return;
        var style = global.document.createElement('style');
        style.id = 'jms-scenario-reset-style-v1';
        style.textContent =
            '#' + MODAL_ID + '{position:fixed;inset:0;z-index:10080;display:none;align-items:center;justify-content:center;' +
            'padding:1.25rem;background:rgba(6,78,59,.42);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
            '#' + MODAL_ID + '.jms-modal-open,.is-open{display:flex}' +
            '#' + MODAL_ID + ' .jms-reset-card{width:min(420px,100%);border-radius:1.05rem;padding:1.35rem 1.4rem 1.15rem;' +
            'border:1px solid rgba(167,243,208,.6);background:linear-gradient(168deg,#fff 0%,#f0fdf4 48%,#ecfdf5 100%);' +
            'box-shadow:0 22px 48px rgba(6,78,59,.18);color:#14532d;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}' +
            '#' + MODAL_ID + ' .jms-reset-title{margin:0;font-size:1.125rem;font-weight:800;line-height:1.35;color:#065f46;' +
            '-webkit-text-fill-color:#065f46}' +
            '#' + MODAL_ID + ' .jms-reset-msg{margin:.65rem 0 0;font-size:.875rem;font-weight:500;line-height:1.6;color:#166534;' +
            '-webkit-text-fill-color:#166534;white-space:pre-wrap}' +
            '#' + MODAL_ID + ' .jms-reset-foot{display:flex;justify-content:flex-end;gap:.55rem;margin-top:1.2rem;padding-top:.95rem;' +
            'border-top:1px solid rgba(167,243,208,.45)}' +
            '#' + MODAL_ID + ' .jms-reset-btn{appearance:none;border-radius:.7rem;padding:.55rem 1rem;font-size:.8125rem;font-weight:600;cursor:pointer}' +
            '#' + MODAL_ID + ' .jms-reset-btn--ghost{border:1px solid rgba(16,185,129,.35);background:rgba(255,255,255,.92);color:#047857}' +
            '#' + MODAL_ID + ' .jms-reset-btn--danger{border:none;background:linear-gradient(135deg,#34d399,#059669);color:#ecfdf5;' +
            'box-shadow:0 8px 18px rgba(5,150,105,.28)}';
        global.document.head.appendChild(style);
    }

    function ensureModal() {
        ensureStyles();
        var el = global.document.getElementById(MODAL_ID);
        if (el) return el;
        el = global.document.createElement('div');
        el.id = MODAL_ID;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="jms-reset-card" role="document">' +
            '  <h3 class="jms-reset-title" id="jms-reset-title-v1">重置场景</h3>' +
            '  <p class="jms-reset-msg" id="jms-reset-msg-v1"></p>' +
            '  <div class="jms-reset-foot">' +
            '    <button type="button" class="jms-reset-btn jms-reset-btn--ghost" data-act="cancel">取消</button>' +
            '    <button type="button" class="jms-reset-btn jms-reset-btn--danger" data-act="ok">重置</button>' +
            '  </div>' +
            '</div>';
        global.document.body.appendChild(el);
        el.addEventListener('click', function (ev) {
            if (ev.target === el) closeModal(false);
        });
        el.querySelector('[data-act="cancel"]').addEventListener('click', function () { closeModal(false); });
        el.querySelector('[data-act="ok"]').addEventListener('click', function () {
            var fn = pendingConfirm;
            closeModal(true);
            if (typeof fn === 'function') fn();
        });
        return el;
    }

    function openModal(title, message, onConfirm) {
        var el = ensureModal();
        var titleEl = global.document.getElementById('jms-reset-title-v1');
        var msgEl = global.document.getElementById('jms-reset-msg-v1');
        if (titleEl) titleEl.textContent = title || '重置场景';
        if (msgEl) {
            msgEl.textContent = message || '将清空当前场景内容并恢复为空白场景。此操作不可撤销，是否继续？';
        }
        pendingConfirm = onConfirm || null;
        el.classList.add('jms-modal-open');
        el.classList.add('is-open');
        el.setAttribute('aria-hidden', 'false');
        // 清掉 FOUC 兜底可能残留的尺寸压制
        el.style.cssText = 'display:flex;visibility:visible;opacity:1;pointer-events:auto;position:fixed;inset:0;width:auto;height:auto;z-index:10080;';
    }

    function closeModal(_confirmed) {
        var el = global.document.getElementById(MODAL_ID);
        if (el) {
            el.classList.remove('jms-modal-open');
            el.classList.remove('is-open');
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = '';
        }
        if (!_confirmed) pendingConfirm = null;
    }

    function ensureVisualMode() {
        var yamlWrap = global.document.getElementById('jms-yaml-wrap');
        if (yamlWrap && !yamlWrap.classList.contains('hidden')) {
            var visBtn = global.document.querySelector('.jms-editor-mode-btn[data-mode="visual"]');
            if (visBtn) visBtn.click();
        }
    }

    function resetProgressSteps() {
        global.document.querySelectorAll('.lth-studio-step').forEach(function (el, i) {
            el.classList.toggle('lth-studio-step--active', i === 0);
            el.classList.toggle('lth-studio-step--done', false);
        });
    }

    function performReset() {
        if (!hooks || typeof hooks.applyYaml !== 'function') return;
        hooks.applyYaml(BLANK_YAML);
        if (typeof hooks.clearDirtyState === 'function') hooks.clearDirtyState();
        if (typeof hooks.clearGeneratedState === 'function') hooks.clearGeneratedState();
        ensureVisualMode();
        resetProgressSteps();
        if (typeof hooks.showMsg === 'function') {
            hooks.showMsg('已重置为空白场景，可从零开始搭建。', true);
        }
    }

    function requestReset() {
        openModal(
            '重置场景',
            '将清空当前场景内容并恢复为空白场景（保留一个空线程组）。此操作不可撤销，是否继续？',
            performReset
        );
    }

    function bindUi() {
        var btn = global.document.getElementById('btn-scenario-reset');
        if (!btn) return;
        if (btn.getAttribute('data-jms-reset-bound') === '1') return;
        btn.setAttribute('data-jms-reset-bound', '1');
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            requestReset();
        });
    }

    function bind(h) {
        hooks = h || null;
        bindUi();
        // 延迟再绑一次，避免 tabs 晚渲染或 bind 早于按钮
        global.setTimeout(bindUi, 0);
        global.setTimeout(bindUi, 400);
    }

    // 模块加载后也尝试自绑（hooks 仍可由后续 bind 注入）
    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindUi);
    } else {
        bindUi();
    }
    global.addEventListener('load', bindUi);

    global.JmsScenarioStudioReset = {
        BLANK_YAML: BLANK_YAML,
        bind: bind,
        requestReset: requestReset
    };
})(window);
