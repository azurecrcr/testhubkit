(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    function truncate(s, n) {
        s = String(s || '');
        return s.length <= n ? s : s.slice(0, n) + '…';
    }

    function listIfControllers(planId, tgId) {
        var vb = global.JmsVisualBuilder;
        if (!vb || typeof vb.listIfControllersInTg !== 'function') return [];
        return vb.listIfControllersInTg(planId, tgId) || [];
    }

    function renderOptionsHtml(ifList) {
        var html = '<label class="jms-http-add-placement-option">' +
            '<input type="radio" name="http-add-placement" value="" checked />' +
            '<span class="jms-http-add-placement-option__body">' +
            '<span class="jms-http-add-placement-option__title">线程组根级</span>' +
            '<span class="jms-http-add-placement-option__hint">直接添加在当前线程组步骤列表中</span>' +
            '</span></label>';
        (ifList || []).forEach(function (item) {
            var prefix = item.depth > 0 ? ('—'.repeat(Math.min(item.depth, 4)) + ' ') : '';
            html += '<label class="jms-http-add-placement-option">' +
                '<input type="radio" name="http-add-placement" value="' + esc(item.id) + '" />' +
                '<span class="jms-http-add-placement-option__body">' +
                '<span class="jms-http-add-placement-option__title">' + prefix + esc(item.name) + '</span>' +
                '<span class="jms-http-add-placement-option__hint">' + esc(truncate(item.condition, 48) || 'If 控制器内') + '</span>' +
                '</span></label>';
        });
        return html;
    }

    function readSelectedIfStepId() {
        var picked = global.document.querySelector('#http-add-placement-options input[name="http-add-placement"]:checked');
        return picked ? (picked.value || null) : null;
    }

    global.JmsHttpIfPlacement = {
        listIfControllers: listIfControllers,
        renderOptionsHtml: renderOptionsHtml,
        readSelectedIfStepId: readSelectedIfStepId
    };
}(typeof window !== 'undefined' ? window : this));
