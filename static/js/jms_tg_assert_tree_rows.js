/**
 * 线程组 · 断言树形行（独立模块，对齐配置元件/HTTP 步骤样式，支持拖动）
 */
(function (global) {
    'use strict';

    var H = function () { return global.JmsTgAssertHelpers; };

    var RA_LABEL = '响应断言';
    var RA_SHORT = 'Resp';
    var JA_LABEL = 'JSON断言';
    var JA_SHORT = 'JSON';
    var SA_LABEL = '大小断言';
    var SA_SHORT = 'Size';
    var M5_LABEL = 'MD5Hex断言';
    var M5_SHORT = 'MD5';

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getAssertions(tg) {
        if (!tg || !Array.isArray(tg.assertions)) return [];
        return tg.assertions.filter(function (a) {
            return a && typeof a === 'object' && a.type;
        });
    }

    function findTg(planId, tgId) {
        return H() && typeof H().findTg === 'function' ? H().findTg(planId, tgId) : null;
    }

    function ensureAssertions(tg) {
        return H() && typeof H().ensureTgAssertions === 'function' ? H().ensureTgAssertions(tg) : [];
    }

    function markDirty(planId, tgId) {
        if (H() && typeof H().markDirtyAndRefreshTg === 'function') H().markDirtyAndRefreshTg(planId, tgId);
    }

    function assertRowMeta(a) {
        if (!a) return { shortType: 'Legacy', name: '断言', kind: '', editable: false, stripeClass: '' };
        if (a.type === 'response_assert') {
            return { shortType: RA_SHORT, name: a.name || RA_LABEL, kind: 'response_assert', editable: true, stripeClass: 'jms-aux-card--tg-assert-ra' };
        }
        if (a.type === 'json_assert') {
            return { shortType: JA_SHORT, name: a.name || JA_LABEL, kind: 'json_assert', editable: true, stripeClass: 'jms-aux-card--tg-assert-ja' };
        }
        if (a.type === 'size_assert') {
            return { shortType: SA_SHORT, name: a.name || SA_LABEL, kind: 'size_assert', editable: true, stripeClass: 'jms-aux-card--tg-assert-sa' };
        }
        if (a.type === 'md5hex_assert') {
            return { shortType: M5_SHORT, name: a.name || M5_LABEL, kind: 'md5hex_assert', editable: true, stripeClass: 'jms-aux-card--tg-assert-m5' };
        }
        return { shortType: 'Legacy', name: '断言', kind: '', editable: false, stripeClass: 'jms-aux-card--tg-assert-legacy' };
    }


    function renderStepActionsMenu(editBtnHtml, delBtnHtml) {
        return '<div class="jms-http-card__actions lth-step-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="断言操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' + editBtnHtml + delBtnHtml + '</div></div>';
    }

    function renderAssertDragHandle(planId, tgId, assertIndex) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-tg-assert-index="' + esc(String(assertIndex)) + '" data-parent-step-id="">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }


    function composeAssertActions(planId, tgId, assertIndex, enabled, actionsHtml) {
        var Ui = global.JmsAssertEnableUi;
        if (!Ui || typeof Ui.renderTgAssertToggle !== 'function') return actionsHtml;
        var toggle = Ui.renderTgAssertToggle(planId, tgId, assertIndex, enabled);
        return Ui.composeCardToolbar ? Ui.composeCardToolbar(toggle, actionsHtml) : actionsHtml;
    }

    function renderAssertTreeRow(planId, tgId, a, index) {
        var meta = assertRowMeta(a);
        var disabled = a && a.enabled === false ? ' is-disabled' : '';
        var editBtn = meta.editable
            ? '<button type="button" class="jms-btn-ghost jms-tg-assert-edit" role="menuitem" data-assert-kind="' + esc(meta.kind) + '" data-assert-index="' +
            index + '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">编辑</button>'
            : '<span class="jms-tg-assert-legacy-tag" role="menuitem">导入</span>';
        return '<div class="jms-tree-node jms-tree-node--tg-assert" data-depth="0" style="--jms-tree-depth:0;" data-tg-assert-index="' + esc(String(index)) + '">' +
            renderAssertDragHandle(planId, tgId, index) +
            '<div class="jms-tree-node__body"><div class="jms-aux-card jms-aux-card--tg-assert ' + esc(meta.stripeClass) + disabled + '"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-tg-assert-index="' + esc(String(index)) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">A</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(meta.shortType) + '</span>' +
            '<span class="jms-aux-name" title="' + esc(meta.name) + '">' + esc(meta.name) + '</span>' +
            '</div>' +
            composeAssertActions(planId, tgId, index, a && a.enabled !== false,
            renderStepActionsMenu(editBtn,
            '<button type="button" class="jms-btn-ghost jms-tg-assert-del" role="menuitem" data-assert-index="' + index +
            '" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '">删除</button>')) +
            '</div></div></div>';
    }

    function renderAssertNodes(planId, tg) {
        if (!tg) return '';
        var assertions = getAssertions(tg);
        if (!assertions.length) return '';
        return assertions.map(function (a, i) {
            return renderAssertTreeRow(planId, tg.id, a, i);
        }).join('');
    }

    function reorderByIndex(planId, tgId, fromIndex, toIndex) {
        if (fromIndex === toIndex) return false;
        var tg = findTg(planId, tgId);
        if (!tg) return false;
        var list = ensureAssertions(tg);
        if (fromIndex < 0 || fromIndex >= list.length) return false;
        toIndex = Math.max(0, Math.min(toIndex, list.length - 1));
        if (fromIndex === toIndex) return true;
        var item = list.splice(fromIndex, 1)[0];
        list.splice(toIndex, 0, item);
        markDirty(planId, tgId);
        return true;
    }

    function patchAssertNodesInSteps(planId, tgId) {
        var block = global.document.querySelector('.jms-tg-block--tree[data-plan-id="' + planId + '"][data-tg-id="' + tgId + '"]');
        if (!block) return false;
        var stepsEl = block.querySelector('.jms-tg-tree-steps');
        if (!stepsEl) return false;
        var tg = findTg(planId, tgId);
        if (!tg) return false;
        stepsEl.querySelectorAll('.jms-tree-node--tg-assert').forEach(function (node) {
            node.remove();
        });
        var html = renderAssertNodes(planId, tg);
        if (html) {
            var tmp = global.document.createElement('div');
            tmp.innerHTML = html;
            while (tmp.firstChild) {
                stepsEl.appendChild(tmp.firstChild);
            }
        }
        var menuWrap = block.querySelector('.jms-tg-assert-more');
        if (menuWrap) {
            var trigger = menuWrap.querySelector('.jms-tg-assert-trigger');
            var configured = getAssertions(tg).length > 0;
            if (trigger) {
                trigger.classList.toggle('is-configured', configured);
                trigger.classList.toggle('is-empty', !configured);
            }
        }
        return true;
    }

    global.JmsTgAssertTreeRows = {
        renderAssertNodes: renderAssertNodes,
        renderAssertTreeRow: renderAssertTreeRow,
        reorderByIndex: reorderByIndex,
        patchAssertNodesInSteps: patchAssertNodesInSteps
    };
}(typeof window !== 'undefined' ? window : this));
