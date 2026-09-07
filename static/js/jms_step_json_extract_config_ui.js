/**
 * HTTP 步骤配置元件 · JSON 提取器弹窗 UI（隔离模块，仅 modal-http-step-config-json-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-http-step-config-json-edit';
    var UI_VERSION = '1';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getJmx() {
        return global.JmsStepJsonExtractConfigJmx;
    }

    function defaultData() {
        var Jmx = getJmx();
        return Jmx && typeof Jmx.defaultJsonPostConfigData === 'function'
            ? Jmx.defaultJsonPostConfigData()
            : {
                enabled: false,
                name: '',
                comments: '',
                apply_to: 'main',
                apply_to_variable: '',
                var: '',
                json_path: '',
                match_numbers: '1',
                compute_concat: false,
                default_value: ''
            };
    }

    function normalizeApplyTo(val) {
        var v = val ? String(val) : 'main';
        if (v === 'all' || v === 'main' || v === 'sub' || v === 'variable') return v;
        return 'main';
    }

    function renderLabel(text) {
        return '<span class="jms-step-je-v4__label">' + esc(text) + '</span>';
    }

    function renderApplyToSection(d) {
        var apply = normalizeApplyTo(d.apply_to);
        function radio(val, label) {
            return '<label class="jms-step-je-v4__apply-item">' +
                '<input type="radio" name="step-json-extract-apply-to" value="' + val + '"' + (apply === val ? ' checked' : '') + '>' +
                '<span class="jms-step-je-v4__apply-text">' + esc(label) + '</span></label>';
        }
        return '<section class="jms-step-je-v4__section jms-step-je-v4__section--apply">' +
            '<h4 class="jms-step-je-v4__section-title">应用范围</h4>' +
            '<div class="jms-step-je-v4__apply-grid" role="radiogroup" aria-label="Apply to">' +
            radio('all', 'Main sample and sub-samples') +
            radio('main', 'Main sample only') +
            radio('sub', 'Sub-samples only') +
            radio('variable', 'JMeter Variable Name to use') +
            '</div>' +
            '<label class="jms-step-je-v4__field jms-step-je-v4__field--apply-var">' +
            renderLabel('变量名') +
            '<input type="text" class="jms-step-je-v4__input hf-mono" data-step-je-field="apply_to_variable" value="' + esc(d.apply_to_variable || '') + '"' +
            (apply !== 'variable' ? ' disabled' : '') + ' placeholder="JMeter 变量名">' +
            '</label></section>';
    }

    function renderStepJsonExtractBody(d) {
        d = d || defaultData();
        return '<div class="jms-step-je-v4" data-step-je-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-step-je-v4__section">' +
            '<h4 class="jms-step-je-v4__section-title">基本信息</h4>' +
            '<div class="jms-step-je-v4__meta-row">' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('名称') +
            '<input type="text" class="jms-step-je-v4__input" data-step-je-field="name" value="' + esc(d.name || '') + '" placeholder="JSON提取器">' +
            '</label>' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('注释') +
            '<input type="text" class="jms-step-je-v4__input" data-step-je-field="comments" value="' + esc(d.comments || '') + '" placeholder="可选">' +
            '</label></div></section>' +
            renderApplyToSection(d) +
            '<section class="jms-step-je-v4__section jms-step-je-v4__section--extract">' +
            '<h4 class="jms-step-je-v4__section-title">提取规则</h4>' +
            '<div class="jms-step-je-v4__extract-grid">' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('变量名') +
            '<input type="text" class="jms-step-je-v4__input hf-mono" data-step-je-field="var" value="' + esc(d.var || '') + '" placeholder="token">' +
            '</label>' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('Match No.') +
            '<input type="text" class="jms-step-je-v4__input hf-mono" data-step-je-field="match_numbers" value="' + esc(d.match_numbers !== undefined ? String(d.match_numbers) : '1') + '" placeholder="1">' +
            '</label>' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('JSON Path') +
            '<input type="text" class="jms-step-je-v4__input hf-mono" data-step-je-field="json_path" value="' + esc(d.json_path || '') + '" placeholder="$.data.token">' +
            '</label>' +
            '<label class="jms-step-je-v4__field">' +
            renderLabel('默认值') +
            '<input type="text" class="jms-step-je-v4__input hf-mono" data-step-je-field="default_value" value="' + esc(d.default_value || '') + '" placeholder="未匹配时">' +
            '</label></div>' +
            '<div class="jms-step-je-v4__options-row">' +
            '<label class="jms-step-je-v4__chk">' +
            '<input type="checkbox" data-step-je-field="compute_concat"' + (d.compute_concat ? ' checked' : '') + '>' +
            '<span>Compute concatenation var (_ALL)</span></label>' +
            '<label class="jms-step-je-v4__chk">' +
            '<input type="checkbox" data-step-je-field="enabled"' + (d.enabled !== false ? ' checked' : '') + '>' +
            '<span>启用</span></label>' +
            '</div></section></div>';
    }

    function readStepJsonExtractFromBody(body, prior) {
        body = body || global.document;
        var applyEl = body.querySelector('input[name="step-json-extract-apply-to"]:checked');
        var applyTo = applyEl ? applyEl.value : 'main';
        function field(name) {
            var el = body.querySelector('[data-step-je-field="' + name + '"]');
            return el ? el.value : '';
        }
        function checked(name) {
            var el = body.querySelector('[data-step-je-field="' + name + '"]');
            return el ? !!el.checked : false;
        }
        var data = {
            enabled: true,
            name: field('name').trim() || 'JSON提取器',
            comments: field('comments'),
            apply_to: normalizeApplyTo(applyTo),
            apply_to_variable: applyTo === 'variable' ? field('apply_to_variable').trim() : '',
            var: field('var').trim(),
            json_path: field('json_path').trim(),
            match_numbers: field('match_numbers').trim() || '1',
            compute_concat: checked('compute_concat'),
            default_value: field('default_value')
        };
        if (prior && prior.enabled === false && !checked('enabled')) data.enabled = false;
        else data.enabled = checked('enabled');
        var Jmx = getJmx();
        if (Jmx && typeof Jmx.normalizeJsonPostConfig === 'function') {
            return Jmx.normalizeJsonPostConfig(Object.assign({}, prior || {}, data));
        }
        return data;
    }

    function onDrawerChange(ev) {
        if (!ev.target.closest('#' + MODAL_ID)) return;
        if (ev.target.name === 'step-json-extract-apply-to') {
            var modal = global.document.getElementById(MODAL_ID);
            if (!modal) return;
            var varEl = modal.querySelector('[data-step-je-field="apply_to_variable"]');
            if (varEl) varEl.disabled = ev.target.value !== 'variable';
        }
    }

    function ensureDrawer() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-http-step-config-drawer jms-step-json-extract-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-config-type', 'json_post');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-step-json-extract-drawer__panel">' +
            '<div class="jms-step-json-extract-drawer__head">' +
            '<div class="jms-step-json-extract-drawer__head-main">' +
            '<span class="jms-step-json-extract-drawer__badge">Post Processor</span>' +
            '<h3 class="jms-step-modal__title">JSON 提取器</h3>' +
            '</div>' +
            '<button type="button" class="jms-step-json-extract-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-step-json-extract-drawer__body jms-http-step-config-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-step-json-extract-drawer__foot jms-http-step-config-drawer__foot">' +
            '<button type="button" class="jms-btn-ghost jms-step-json-extract-drawer__cancel jms-http-step-config-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-step-json-extract-drawer__save jms-http-step-config-drawer__save">保存</button>' +
            '</div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('change', onDrawerChange);
        return modal;
    }

    function bindDrawerActions(onCancel, onSave) {
        var modal = ensureDrawer();
        if (modal.dataset.jmsStepJeBound === '1') return modal;
        modal.dataset.jmsStepJeBound = '1';
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal && onCancel) onCancel(modal);
        });
        var closeBtn = modal.querySelector('.jms-step-json-extract-drawer__close');
        if (closeBtn) closeBtn.addEventListener('click', function () { if (onCancel) onCancel(modal); });
        return modal;
    }

    global.JmsStepJsonExtractConfigUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        ensureDrawer: ensureDrawer,
        bindDrawerActions: bindDrawerActions,
        renderStepJsonExtractBody: renderStepJsonExtractBody,
        readStepJsonExtractFromBody: readStepJsonExtractFromBody
    };
}(typeof window !== 'undefined' ? window : this));
