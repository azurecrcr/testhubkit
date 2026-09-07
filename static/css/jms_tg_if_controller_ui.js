/**
 * 线程组 · If 控制器弹窗 UI（隔离模块 v1 · 仅 modal-tg-if-edit）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-if-edit';
    var UI_VERSION = '2';
    var TARGET = 'tg-if-aux';
    var LAST_SAMPLE_EXPR = '${JMeterThread.last_sample_ok}';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel
            ? global.JmsVisualBuilder.getModel()
            : null;
    }

    function findTg(planId, tgId) {
        var m = getModel();
        if (!m) return null;
        var tg = (m.setup_thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        var plan = (m.test_plans || []).find(function (p) { return p.id === planId; });
        if (!plan) return null;
        tg = (plan.thread_groups || []).find(function (t) { return t.id === tgId; });
        if (tg) return tg;
        return (m.post_thread_groups || []).find(function (t) { return t.id === tgId; }) || null;
    }

    function findStepInList(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (s.id === stepId) { found = s; return true; }
            if (s.type === 'if_controller' && s.children) {
                found = findStepInList(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function removeStepFromList(list, stepId) {
        if (!list || !stepId) return false;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            if (!s) continue;
            if (s.id === stepId) {
                list.splice(i, 1);
                return true;
            }
            if (s.type === 'if_controller' && s.children && removeStepFromList(s.children, stepId)) {
                return true;
            }
        }
        return false;
    }

    function findIfStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return null;
        var step = findStepInList(tg.steps, stepId);
        return step && step.type === 'if_controller' ? step : null;
    }

    function removePendingIfStep(planId, tgId, stepId) {
        var tg = findTg(planId, tgId);
        if (!tg || !stepId) return false;
        return removeStepFromList(tg.steps, stepId);
    }

    function defaultStepData(seq) {
        return {
            type: 'if_controller',
            name: 'If 控制器' + (seq ? ' ' + seq : ''),
            comments: '',
            condition: LAST_SAMPLE_EXPR,
            evaluate_all: false,
            use_expression: true,
            enabled: true,
            children: []
        };
    }

    function renderLabel(text) {
        return '<span class="jms-tg-if-v1__label">' + esc(text) + '</span>';
    }

    function renderBody(d) {
        d = d || defaultStepData();
        var isExpr = d.use_expression !== false;
        var modeCls = isExpr ? ' is-expression-mode' : ' is-script-mode';
        var exprLabel = isExpr
            ? 'Expression (must evaluate to true or false)'
            : '条件';
        return '<div class="jms-tg-if-v1' + modeCls + '" data-tg-if-ui-version="' + UI_VERSION + '">' +
            '<div class="jms-tg-if-v1__grid jms-tg-if-v1__grid--meta">' +
            '<label class="jms-tg-if-v1__field">' +
            renderLabel('名称') +
            '<input type="text" class="jms-tg-if-v1__input" data-tg-if-field="name" value="' + esc(d.name || '') + '" placeholder="If 控制器">' +
            '</label>' +
            '<label class="jms-tg-if-v1__field">' +
            renderLabel('注释') +
            '<input type="text" class="jms-tg-if-v1__input" data-tg-if-field="comments" value="' + esc(d.comments || '') + '">' +
            '</label></div>' +
            '<div class="jms-tg-if-v1__hint jms-tg-if-v1__hint--script" role="alert">' +
            '<span class="jms-tg-if-v1__hint-icon" aria-hidden="true">!</span>' +
            '<p class="jms-tg-if-v1__hint-text">For performance it is advised to check &apos;Interpret Condition as Variable Expression&apos; and use <code>__jexl3</code> or <code>__groovy</code> evaluating to true or false or a variable that contains true or false.</p>' +
            '</div>' +
            '<section class="jms-tg-if-v1__section">' +
            '<label class="jms-tg-if-v1__field jms-tg-if-v1__field--expr">' +
            '<span class="jms-tg-if-v1__label" data-tg-if-expr-label>' + esc(exprLabel) + '</span>' +
            '<div class="jms-tg-if-v1__editor">' +
            '<div class="jms-tg-if-v1__editor-gutter" data-tg-if-gutter aria-hidden="true">1</div>' +
            '<textarea class="jms-tg-if-v1__textarea hf-mono" data-tg-if-field="condition" rows="8" spellcheck="false" placeholder="' + (isExpr ? '${__jexl3(&quot;${status}&quot; == &quot;200&quot;)}' : 'true') + '">' + esc(d.condition || '') + '</textarea>' +
            '</div></label></section>' +
            '<div class="jms-tg-if-v1__sample-row jms-tg-if-v1__sample-row--script">' +
            '<button type="button" class="jms-tg-if-v1__sample-btn" data-tg-if-insert-sample>Use status of last sample</button>' +
            '<span class="jms-tg-if-v1__sample-hint"><code class="hf-mono">' + esc(LAST_SAMPLE_EXPR) + '</code> can be used to test if last sampler was successful</span>' +
            '</div>' +
            '<div class="jms-tg-if-v1__opts-row">' +
            '<label class="jms-tg-if-v1__chk jms-tg-if-v1__chk--use-expr">' +
            '<input type="checkbox" data-tg-if-field="use_expression"' + (isExpr ? ' checked' : '') + '>' +
            '<span>将条件解释为变量表达式 (Interpret Condition as Variable Expression?)</span></label>' +
            '<label class="jms-tg-if-v1__chk">' +
            '<input type="checkbox" data-tg-if-field="evaluate_all"' + (d.evaluate_all ? ' checked' : '') + '>' +
            '<span>评估所有子项 (Evaluate for all children?)</span></label>' +
            '</div>' +
            '<div class="jms-tg-if-v1__foot-row">' +
            '<label class="jms-tg-if-v1__chk jms-tg-if-v1__chk--enabled">' +
            '<input type="checkbox" data-tg-if-field="enabled"' + (d.enabled !== false ? ' checked' : '') + '>' +
            '<span>启用</span></label></div></div>';
    }

    function syncExpressionMode(modal) {
        var root = modal.querySelector('.jms-tg-if-v1');
        var chk = modal.querySelector('[data-tg-if-field="use_expression"]');
        var ta = modal.querySelector('[data-tg-if-field="condition"]');
        if (!root || !chk) return;
        var isExpr = !!chk.checked;
        root.classList.toggle('is-expression-mode', isExpr);
        root.classList.toggle('is-script-mode', !isExpr);
        var exprLbl = modal.querySelector('[data-tg-if-expr-label]');
        if (exprLbl) {
            exprLbl.textContent = isExpr
                ? 'Expression (must evaluate to true or false)'
                : '条件';
        }
        if (ta) {
            ta.placeholder = isExpr
                ? '${__jexl3("${status}" == "200")}'
                : 'true';
        }
    }

    function syncExprGutter(modal) {
        var ta = modal.querySelector('[data-tg-if-field="condition"]');
        var gutter = modal.querySelector('[data-tg-if-gutter]');
        if (!ta || !gutter) return;
        var lines = (ta.value || '').split('\n').length;
        if (lines < 1) lines = 1;
        var nums = [];
        for (var i = 1; i <= lines; i++) nums.push(String(i));
        gutter.textContent = nums.join('\n');
    }

    function bindBodyEvents(modal) {
        var ta = modal.querySelector('[data-tg-if-field="condition"]');
        if (ta && !ta.dataset.tgIfGutterBound) {
            ta.dataset.tgIfGutterBound = '1';
            ta.addEventListener('input', function () { syncExprGutter(modal); });
            ta.addEventListener('scroll', function () {
                var gutter = modal.querySelector('[data-tg-if-gutter]');
                if (gutter) gutter.scrollTop = ta.scrollTop;
            });
        }
        var btn = modal.querySelector('[data-tg-if-insert-sample]');
        if (btn && !btn.dataset.tgIfSampleBound) {
            btn.dataset.tgIfSampleBound = '1';
            btn.addEventListener('click', function () {
                if (!ta) return;
                ta.value = LAST_SAMPLE_EXPR;
                syncExprGutter(modal);
                ta.focus();
            });
        }
        var useExprChk = modal.querySelector('[data-tg-if-field="use_expression"]');
        if (useExprChk && !useExprChk.dataset.tgIfModeBound) {
            useExprChk.dataset.tgIfModeBound = '1';
            useExprChk.addEventListener('change', function () {
                syncExpressionMode(modal);
            });
        }
        syncExpressionMode(modal);
        syncExprGutter(modal);
    }

    function readForm(modal) {
        var body = modal.querySelector('.jms-tg-if-drawer__body');
        function field(name) {
            var el = body.querySelector('[data-tg-if-field="' + name + '"]');
            return el ? el.value : '';
        }
        function checked(name) {
            var el = body.querySelector('[data-tg-if-field="' + name + '"]');
            return el ? !!el.checked : false;
        }
        return {
            type: 'if_controller',
            name: field('name').trim() || 'If 控制器',
            comments: field('comments'),
            condition: field('condition'),
            evaluate_all: checked('evaluate_all'),
            use_expression: checked('use_expression'),
            enabled: checked('enabled')
        };
    }

    function markDirtyAndSync() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.syncYamlFromModel === 'function') vb.syncYamlFromModel();
        if (vb && typeof vb.scheduleRender === 'function') vb.scheduleRender();
        if (global.JmsTgTreeShell && typeof global.JmsTgTreeShell.syncAll === 'function') {
            global.JmsTgTreeShell.syncAll(true);
        }
        var ya = global.document.getElementById('yaml-input');
        if (ya) ya.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function hideModal(modal) {
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-plan-id');
        modal.removeAttribute('data-tg-id');
        modal.removeAttribute('data-step-id');
        modal.removeAttribute('data-edit-mode');
    }

    function cancelModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;
        var isCreate = modal.getAttribute('data-edit-mode') === 'create';
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        hideModal(modal);
        if (isCreate && planId && tgId && stepId && removePendingIfStep(planId, tgId, stepId)) {
            markDirtyAndSync();
        }
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal && modal.getAttribute('data-ui-version') === UI_VERSION) return modal;
        if (modal) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-tg-if-drawer';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-tg-if-drawer__panel">' +
            '<div class="jms-tg-if-drawer__head">' +
            '<div class="jms-tg-if-drawer__head-main">' +
            '<span class="jms-tg-if-drawer__badge">Logic Controller</span>' +
            '<h3 class="jms-step-modal__title">If 控制器</h3>' +
            '</div>' +
            '<button type="button" class="jms-tg-if-drawer__close" aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-tg-if-drawer__body"></div>' +
            '<div class="jms-assert-foot jms-tg-if-drawer__foot">' +
            '<button type="button" class="jms-btn-ghost jms-tg-if-drawer__cancel">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-tg-if-drawer__save">保存</button>' +
            '</div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) cancelModal();
        });
        var panel = modal.querySelector('.jms-tg-if-drawer__panel');
        if (panel) panel.addEventListener('click', function (ev) { ev.stopPropagation(); });
        modal.querySelector('.jms-tg-if-drawer__close').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-if-drawer__cancel').addEventListener('click', cancelModal);
        modal.querySelector('.jms-tg-if-drawer__save').addEventListener('click', saveFromModal);
        if (!global.document.body.dataset.jmsTgIfEscBound) {
            global.document.body.dataset.jmsTgIfEscBound = '1';
            global.document.addEventListener('keydown', function (ev) {
                if (ev.key !== 'Escape') return;
                var m = global.document.getElementById(MODAL_ID);
                if (m && m.classList.contains('jms-modal-open')) cancelModal();
            });
        }
        return modal;
    }

    function openModal() {
        var modal = ensureModal();
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function openEditor(planId, tgId, stepId, isCreate, retryCount) {
        retryCount = retryCount || 0;
        var step = findIfStep(planId, tgId, stepId);
        if (!step) {
            if (isCreate && retryCount < 8) {
                global.setTimeout(function () {
                    openEditor(planId, tgId, stepId, isCreate, retryCount + 1);
                }, 40);
            } else if (isCreate && planId && tgId && stepId) {
                removePendingIfStep(planId, tgId, stepId);
                markDirtyAndSync();
            }
            return;
        }
        var modal = ensureModal();
        modal.setAttribute('data-edit-target', TARGET);
        modal.setAttribute('data-edit-mode', isCreate ? 'create' : 'edit');
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-step-id', stepId);
        var bodyEl = modal.querySelector('.jms-tg-if-drawer__body');
        if (bodyEl) bodyEl.innerHTML = renderBody(step);
        bindBodyEvents(modal);
        openModal();
        var first = modal.querySelector('[data-tg-if-field="name"]');
        if (first) {
            global.setTimeout(function () {
                try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
            }, 60);
        }
    }

    function openEditorAfterAppend(planId, tgId, stepId) {
        global.requestAnimationFrame(function () {
            openEditor(planId, tgId, stepId, true, 0);
        });
    }

    function saveFromModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal || modal.getAttribute('data-edit-target') !== TARGET) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var step = findIfStep(planId, tgId, stepId);
        if (!step) { hideModal(modal); return; }
        var data = readForm(modal);
        Object.keys(data).forEach(function (k) {
            if (k !== 'type') step[k] = data[k];
        });
        if (!step.children) step.children = [];
        hideModal(modal);
        markDirtyAndSync();
    }

    function onRootClick(ev) {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var btn = ev.target.closest('.jms-btn-edit-if');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var card = btn.closest('.jms-if-card') || btn.closest('.jms-aux-card');
        if (!card) return;
        var actions = btn.closest('.lth-step-actions');
        if (actions) actions.classList.remove('is-open', 'is-hover');
        if (global.JmsVisualBuilder && typeof global.JmsVisualBuilder.readModelFromDom === 'function') {
            global.JmsVisualBuilder.readModelFromDom();
        }
        openEditor(card.getAttribute('data-plan-id'), card.getAttribute('data-tg-id'), card.getAttribute('data-step-id'), false);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        if (global.document.body.dataset.jmsTgIfUiBound === '1') return;
        global.document.body.dataset.jmsTgIfUiBound = '1';
        global.document.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgIfControllerUi = {
        UI_VERSION: UI_VERSION,
        defaultStepData: defaultStepData,
        ensureModal: ensureModal,
        openEditor: openEditor,
        openEditorAfterAppend: openEditorAfterAppend,
        close: cancelModal,
        isIfTarget: function (modal) {
            return !!(modal && modal.getAttribute('data-edit-target') === TARGET);
        }
    };
}(typeof window !== 'undefined' ? window : this));
