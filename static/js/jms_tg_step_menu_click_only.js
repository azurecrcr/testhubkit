/**
 * JMeter · 步骤 ⋯ 菜单仅点击展开（隔离，不修改 lth_studio_shell.js）
 */
(function (global) {
    'use strict';

    function isJmeterTab() {
        return global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function blockHoverMenu(ev) {
        if (!isJmeterTab()) return;
        if (!ev.target.closest('.lth-step-actions')) return;
        ev.stopImmediatePropagation();
    }

    function bind() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsTgStepMenuClickOnlyBound === '1') return;
        root.dataset.jmsTgStepMenuClickOnlyBound = '1';
        root.addEventListener('mouseover', blockHoverMenu, true);
        root.addEventListener('mouseout', blockHoverMenu, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
}(typeof window !== 'undefined' ? window : this));
