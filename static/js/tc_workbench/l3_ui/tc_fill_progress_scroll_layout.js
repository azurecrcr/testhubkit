/**
 * TestHub — 用例补充进度内容区滚动（仅 fill-active，隔离）
 */
(function (global) {
    'use strict';

    function applyFillProgressScrollLayout(scope) {
        scope = scope || 'single';
        var drawer = document.getElementById('tc-validate-drawer-' + scope);
        var panel = document.getElementById('tc-validate-fill-progress-' + scope);
        var inner = document.getElementById('tc-validate-fill-progress-inner-' + scope);
        if (!drawer || !panel || !inner || panel.classList.contains('hidden')) return;
        if (!drawer.classList.contains('tc-validate-drawer--fill-active')) return;

        var rect = drawer.getBoundingClientRect();
        var drawerH = rect.height;
        if (!drawerH || drawerH < 160) {
            drawerH = Math.min(620, Math.max(320, global.innerHeight - 24));
        }
        var topGap = rect.top > 0 ? rect.top : 12;
        var maxDrawerH = Math.max(240, global.innerHeight - topGap - 12);
        if (drawerH > maxDrawerH) drawerH = maxDrawerH;

        drawer.style.setProperty('display', 'flex', 'important');
        drawer.style.setProperty('flex-direction', 'column', 'important');
        drawer.style.setProperty('overflow', 'hidden', 'important');
        drawer.style.setProperty('height', Math.round(drawerH) + 'px', 'important');

        panel.style.setProperty('flex', '1 1 0%', 'important');
        panel.style.setProperty('min-height', '0', 'important');
        panel.style.setProperty('overflow', 'hidden', 'important');
        panel.style.setProperty('display', 'flex', 'important');
        panel.style.setProperty('flex-direction', 'column', 'important');

        var head = drawer.querySelector('.tc-validate-float-panel__head');
        var foot = panel.querySelector('.tc-qc-fill-progress__foot');
        var headH = head ? head.offsetHeight : 0;
        var footH = foot ? foot.offsetHeight : 0;
        var scrollH = Math.max(140, Math.round(drawerH - headH - footH));

        inner.style.setProperty('max-height', scrollH + 'px', 'important');
        inner.style.setProperty('height', scrollH + 'px', 'important');
        inner.style.setProperty('overflow-y', 'scroll', 'important');
        inner.style.setProperty('overflow-x', 'hidden', 'important');
        inner.classList.add('tc-qc-fill-progress--scrollable');
    }

    function clearFillProgressScrollLayout(scope) {
        scope = scope || 'single';
        var drawer = document.getElementById('tc-validate-drawer-' + scope);
        var panel = document.getElementById('tc-validate-fill-progress-' + scope);
        var inner = document.getElementById('tc-validate-fill-progress-inner-' + scope);
        if (inner) {
            inner.style.removeProperty('max-height');
            inner.style.removeProperty('height');
            inner.style.removeProperty('overflow-y');
            inner.style.removeProperty('overflow-x');
            inner.classList.remove('tc-qc-fill-progress--scrollable');
        }
        if (panel) {
            panel.style.removeProperty('flex');
            panel.style.removeProperty('min-height');
            panel.style.removeProperty('overflow');
            panel.style.removeProperty('display');
            panel.style.removeProperty('flex-direction');
        }
        if (drawer && drawer.classList.contains('tc-validate-drawer--side')) {
            drawer.style.removeProperty('display');
            drawer.style.removeProperty('flex-direction');
            drawer.style.removeProperty('overflow');
        }
    }

    function scheduleApplyFillProgressScrollLayout(scope) {
        applyFillProgressScrollLayout(scope);
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                applyFillProgressScrollLayout(scope);
            });
        }
    }

    global.TcFillProgressScrollLayout = {
        apply: scheduleApplyFillProgressScrollLayout,
        clear: clearFillProgressScrollLayout
    };
})(typeof window !== 'undefined' ? window : this);