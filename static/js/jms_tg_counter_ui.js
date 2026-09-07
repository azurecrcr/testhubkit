/**
 * 线程组配置元件 · 计数器弹窗 UI（隔离模块，仅 modal-tg-config-drawer-counter）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-counter';
    var UI_VERSION = '4';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCatalog() {
        return global.JmsTgConfigCatalog;
    }

    /** 弹窗新建时使用的空白表单（无预填默认值） */
    function blankFormData() {
        return {
            name: '', comments: '',
            start: '', increment: '', maximum: '', format: '',
            variable_name: '', per_user: false, reset_each_iteration: false
        };
    }

    function defaultData() {
        var Catalog = getCatalog();
        return Catalog ? Catalog.defaultItemData('counter') : {
            name: '', comments: '',
            start: '1', increment: '1', maximum: '999999', format: '',
            variable_name: 'counter', per_user: true, reset_each_iteration: false
        };
    }

    function resolveRenderData(item) {
        if (item && item.data && typeof item.data === 'object') {
            return item.data;
        }
        return blankFormData();
    }

    function textField(label, fieldName, value, placeholder, hint, width) {
        return '<label class="jms-tg-counter-v2__field jms-tg-counter-v2__field--' + (width || 'full') + '">' +
            '<span class="jms-tg-counter-v2__label">' + esc(label) +
            (hint ? '<span class="jms-tg-counter-v2__hint">' + esc(hint) + '</span>' : '') +
            '</span>' +
            '<input type="text" class="hf-mono jms-tg-counter-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function renderRefAndOptionsRow(d) {
        return '<section class="jms-tg-counter-v2__card jms-tg-counter-v2__card--foot">' +
            '<div class="jms-tg-counter-v2__ref-options">' +
            textField('引用名称', 'variable_name', d.variable_name, '', '', 'ref') +
            '<div class="jms-tg-counter-v2__options-inline" role="group" aria-label="计数器选项">' +
            '<label class="jms-tg-counter-v2__chk-pill">' +
            '<input type="checkbox" data-cfg-field="per_user"' + (d.per_user === true ? ' checked' : '') + '>' +
            '<span>每用户独立计数</span></label>' +
            '<label class="jms-tg-counter-v2__chk-pill">' +
            '<input type="checkbox" data-cfg-field="reset_each_iteration"' + (d.reset_each_iteration === true ? ' checked' : '') + '>' +
            '<span>迭代时重置</span></label>' +
            '</div></div></section>';
    }

    function renderCounterBody(item) {
        var d = resolveRenderData(item);
        if (item && item.name && !d.name) d.name = item.name;
        return '<div class="jms-tg-counter-v2" data-counter-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-counter-v2__card jms-tg-counter-v2__card--meta">' +
            '<div class="jms-tg-counter-v2__meta-row">' +
            textField('名称', 'name', d.name, '', '', 'name') +
            textField('注释', 'comments', d.comments, '', '', 'comments') +
            '</div></section>' +
            '<section class="jms-tg-counter-v2__card jms-tg-counter-v2__card--range">' +
            '<h4 class="jms-tg-counter-v2__card-title">计数范围</h4>' +
            '<div class="jms-tg-counter-v2__grid jms-tg-counter-v2__grid--4">' +
            textField('起始值', 'start', d.start, '', '', 'quarter') +
            textField('递增', 'increment', d.increment, '', '', 'quarter') +
            textField('最大值', 'maximum', d.maximum, '', '', 'quarter') +
            textField('数字格式', 'format', d.format, '', '', 'quarter') +
            '</div></section>' +
            renderRefAndOptionsRow(d) +
            '</div>';
    }

    function readCounterFromBody(body, priorData) {
        var out = blankFormData();
        if (priorData && typeof priorData === 'object') {
            Object.keys(out).forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
        }
        if (!body) return out;
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        ['start', 'increment', 'maximum', 'format', 'variable_name'].forEach(function (f) {
            var el = body.querySelector('[data-cfg-field="' + f + '"]');
            if (el) out[f] = el.value.trim();
        });
        out.per_user = !!((body.querySelector('[data-cfg-field="per_user"]') || {}).checked);
        out.reset_each_iteration = !!((body.querySelector('[data-cfg-field="reset_each_iteration"]') || {}).checked);
        if (priorData && priorData.enabled === false) out.enabled = false;
        else out.enabled = true;
        return out;
    }

    function bind() {
        if (global.document.body.dataset.jmsTgCounterV2Bound === '4') return;
        global.document.body.dataset.jmsTgCounterV2Bound = '4';
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgCounterUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        blankFormData: blankFormData,
        renderCounterBody: renderCounterBody,
        readCounterFromBody: readCounterFromBody,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
