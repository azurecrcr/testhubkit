/**
 * SetUp 线程组名称防污染（隔离）：启动时清理模型中累积的 [Setup] 前缀
 */
(function (global) {
    'use strict';

    function stripSetupDisplayPrefix(name) {
        var s = String(name || '').trim();
        while (/^\[Setup\]\s*/i.test(s)) {
            s = s.replace(/^\[Setup\]\s*/i, '').trim();
        }
        return s;
    }

    function sanitizeModelSetupNames() {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.getModel !== 'function') return;
        var m = vb.getModel();
        if (!m || !Array.isArray(m.setup_thread_groups)) return;
        var changed = false;
        m.setup_thread_groups.forEach(function (tg) {
            if (!tg) return;
            var clean = stripSetupDisplayPrefix(tg.name);
            if (clean !== tg.name) {
                tg.name = clean;
                changed = true;
            }
        });
        if (changed && typeof vb.syncYamlFromModel === 'function') {
            vb.syncYamlFromModel();
        }
    }

    function init() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var tries = 0;
        var timer = global.setInterval(function () {
            tries += 1;
            if (global.JmsVisualBuilder && global.JmsVisualBuilder.getModel()) {
                global.clearInterval(timer);
                sanitizeModelSetupNames();
            } else if (tries > 80) {
                global.clearInterval(timer);
            }
        }, 100);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsTgSetupNameGuard = { stripSetupDisplayPrefix: stripSetupDisplayPrefix, sanitizeModelSetupNames: sanitizeModelSetupNames };
}(typeof window !== 'undefined' ? window : this));
