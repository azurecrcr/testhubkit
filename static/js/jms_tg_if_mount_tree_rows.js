/**
 * If 控制器 · 挂载元件树形行（独立模块，仅展示非空项，对齐 HTTP/辅助步骤样式）
 */
(function (global) {
    'use strict';

    var Model = function () { return global.JmsIfMountModel; };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function truncate(s, n) {
        s = String(s || '');
        return s.length <= n ? s : s.slice(0, n) + '…';
    }

    function ensureIf(step) {
        return Model() && typeof Model().ensureMountFields === 'function'
            ? Model().ensureMountFields(step)
            : step;
    }

    function isLogicMountHostStep(step) {
        if (Model() && typeof Model().isLogicMountHost === 'function') {
            return Model().isLogicMountHost(step);
        }
        return !!(step && (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller'));
    }

    function hostDomFor(step) {
        if (!step || !step.type) return null;
        if (step.type === 'if_controller') {
            return { card: 'jms-if-card', body: 'jms-if-card__body', node: 'if', empty: 'jms-if-card__empty', badge: 'jms-if-card__child-count' };
        }
        if (step.type === 'random_controller') {
            return { card: 'jms-random-card', body: 'jms-random-card__body', node: 'random', empty: 'jms-random-card__empty', badge: 'jms-random-card__child-count' };
        }
        if (step.type === 'simple_controller') {
            return { card: 'jms-simple-card', body: 'jms-simple-card__body', node: 'simple', empty: 'jms-simple-card__empty', badge: 'jms-simple-card__child-count' };
        }
        if (step.type === 'transaction_controller') {
            return { card: 'jms-transaction-card', body: 'jms-transaction-card__body', node: 'transaction', empty: 'jms-transaction-card__empty', badge: 'jms-transaction-card__child-count' };
        }
        if (step.type === 'loop_controller') {
            return { card: 'jms-loop-card', body: 'jms-loop-card__body', node: 'loop', empty: 'jms-loop-card__empty', badge: 'jms-loop-card__child-count' };
        }
        if (Model() && typeof Model().isCatalogSamplerMountHost === 'function' && Model().isCatalogSamplerMountHost(step)) {
            return { card: 'jms-catalog-card', body: 'jms-catalog-card__body', node: 'catalog-sampler', empty: 'jms-catalog-card__empty', badge: 'jms-catalog-card__child-count' };
        }
        if (step && step.type === 'catalog_element' && step.container) {
            return { card: 'jms-catalog-card', body: 'jms-catalog-card__body', node: 'catalog', empty: 'jms-catalog-card__empty', badge: 'jms-catalog-card__child-count' };
        }
        return null;
    }

    function findHostCard(stepsEl, step) {
        var dom = hostDomFor(step);
        if (!stepsEl || !step || !step.id || !dom) return null;
        return stepsEl.querySelector('.' + dom.card + '[data-step-id="' + step.id + '"]');
    }

    function findHostBody(hostCard, step) {
        var dom = hostDomFor(step);
        if (!hostCard || !dom) return null;
        return hostCard.querySelector('.' + dom.body + '.jms-tree-if-children');
    }

    function renderIfMountDragHandle(planId, tgId, ifStepId, bodyKey) {
        return '<span role="button" tabindex="0" class="jms-tree-drag-handle jms-if-mount-drag-handle" aria-label="拖动排序" title="拖动排序"' +
            ' data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '"' +
            ' data-if-step-id="' + esc(ifStepId) + '" data-if-body-key="' + esc(bodyKey) + '">' +
            '<span class="jms-tree-drag-handle__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';
    }

    function resolveMountEnableToggle(planId, tgId, ifStepId, opts) {
        var L = global.JmsLogicCtrlEnableUi;
        if (!L || typeof L.renderIfMountToggle !== 'function') return '';
        var ifStep = null;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.findLogicMountStep === 'function') {
            ifStep = global.JmsIfMountModel.findLogicMountStep(planId, tgId, ifStepId);
        } else if (global.JmsIfMountModel && typeof global.JmsIfMountModel.findIfStep === 'function') {
            ifStep = global.JmsIfMountModel.findIfStep(planId, tgId, ifStepId);
        }
        if (ifStep && global.JmsIfMountModel && typeof global.JmsIfMountModel.ensureMountFields === 'function') {
            ifStep = global.JmsIfMountModel.ensureMountFields(ifStep);
        }
        if (!ifStep) return '';
        var kind = opts.mountKind;
        var enabled = true;
        if (kind === 'timer' && ifStep.constant_timer) {
            enabled = ifStep.constant_timer.enabled !== false;
        } else if (kind === 'user_parameters' && ifStep.user_parameters) {
            enabled = ifStep.user_parameters.enabled !== false;
        } else if (kind === 'catalog_hash') {
            var hashChild = (ifStep.catalog_hash_children || [])[opts.mountIndex];
            enabled = hashChild ? hashChild.enabled !== false : true;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, hashChild && hashChild.alias ? hashChild.alias : '', enabled);
        } else if (kind === 'config') {
            var entry = (ifStep.http_managers || [])[opts.mountIndex];
            if (!entry) return '';
            enabled = entry.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, entry.type, enabled);
        } else if (kind === 'processor') {
            var proc = (ifStep.processors || [])[opts.mountIndex];
            if (!proc) return '';
            enabled = proc.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, '', enabled);
        } else if (kind === 'pre_processor') {
            var pre = (ifStep.pre_processors || [])[opts.mountIndex];
            if (!pre) return '';
            enabled = pre.enabled !== false;
            return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex, '', enabled);
        } else if (kind === 'assertion') {
            var A = global.JmsAssertEnableUi;
            var ast = (ifStep.assertions || [])[opts.mountIndex];
            if (!ast || !A || typeof A.renderIfMountAssertToggle !== 'function') return '';
            enabled = ast.enabled !== false;
            return A.renderIfMountAssertToggle(planId, tgId, ifStepId, opts.mountIndex, enabled);
        } else if (kind === 'listener') {
            var LEn = global.JmsListenerEnableUi;
            var lKey = opts.mountListenerKey || '';
            if (!lKey || !LEn || typeof LEn.renderIfMountListenerToggle !== 'function') return '';
            enabled = typeof LEn.isIfMountListenerActive === 'function' ? LEn.isIfMountListenerActive(ifStep, lKey) : true;
            return LEn.renderIfMountListenerToggle(planId, tgId, ifStepId, lKey, enabled);
        } else if (kind !== 'timer' && kind !== 'user_parameters') {
            return '';
        }
        return L.renderIfMountToggle(planId, tgId, ifStepId, kind, opts.mountIndex || 0, '', enabled);
    }

    function composeMountActions(planId, tgId, ifStepId, opts) {
        var menu = renderMountActionsMenu(opts);
        var toggle = resolveMountEnableToggle(planId, tgId, ifStepId, opts);
        if (!toggle) return menu;
        var L = global.JmsLogicCtrlEnableUi;
        return L && typeof L.composeCardToolbar === 'function'
            ? L.composeCardToolbar(toggle, menu)
            : menu;
    }

    function renderMountActionsMenu(opts) {
        var common = ' data-plan-id="' + esc(opts.planId) + '" data-tg-id="' + esc(opts.tgId) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-if-mount-kind="' + esc(opts.mountKind) + '"' +
            ' data-if-mount-index="' + esc(String(opts.mountIndex)) + '"' +
            ' data-if-body-key="' + esc(opts.bodyKey || '') + '"';
        var extra = '';
        if (opts.assertKind) extra += ' data-assert-kind="' + esc(opts.assertKind) + '"';
        if (opts.configType) extra += ' data-config-type="' + esc(opts.configType) + '"';
        if (opts.mountListenerKey) extra += ' data-listener-key="' + esc(opts.mountListenerKey) + '"';
        return '<div class="jms-http-card__actions lth-step-actions jms-if-mount-row-actions">' +
            '<button type="button" class="lth-step-menu-btn" aria-label="挂载元件操作" aria-haspopup="true">⋮</button>' +
            '<div class="lth-step-menu" role="menu">' +
            '<button type="button" class="jms-btn-ghost jms-if-mount-row-edit" role="menuitem"' + common + extra + '>编辑</button>' +
            '<button type="button" class="jms-btn-ghost jms-if-mount-row-del" role="menuitem"' + common + extra + '>删除</button>' +
            '</div></div>';
    }

    function renderMountRow(opts) {
        var depth = opts.depth || 0;
        var bodyKey = opts.bodyKey || '';
        var cardCls = 'jms-aux-card ' + (opts.cardClass || 'jms-aux-card--if-mount');
        if (opts.disabled) cardCls += ' is-disabled';
        return '<div class="jms-tree-node jms-tree-node--if-mount" data-depth="' + depth + '" style="--jms-tree-depth:' + depth + ';"' +
            ' data-if-mount-kind="' + esc(opts.mountKind) + '" data-if-mount-index="' + esc(String(opts.mountIndex)) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-parent-step-id="' + esc(opts.parentStepId || '') + '"' +
            ' data-if-body-key="' + esc(bodyKey) + '">' +
            renderIfMountDragHandle(opts.planId, opts.tgId, opts.ifStepId, bodyKey) +
            '<div class="jms-tree-node__body jms-tree-node__body--if-mount">' +
            '<div class="' + cardCls + '" data-plan-id="' + esc(opts.planId) + '" data-tg-id="' + esc(opts.tgId) + '"' +
            ' data-if-step-id="' + esc(opts.ifStepId) + '" data-if-mount-kind="' + esc(opts.mountKind) + '"' +
            ' data-if-mount-index="' + esc(String(opts.mountIndex)) + '">' +
            '<span class="jms-aux-card__stripe" aria-hidden="true"></span>' +
            '<span class="jms-aux-card__icon" aria-hidden="true">' + esc(opts.icon || '·') + '</span>' +
            '<div class="jms-aux-card__content jms-aux-card__content--tree">' +
            '<span class="jms-aux-type">' + esc(opts.typeLabel) + '</span>' +
            '<span class="jms-aux-name">' + esc(opts.name) + '</span>' +
            (opts.meta ? '<code class="jms-aux-meta hf-mono">' + esc(opts.meta) + '</code>' : '') +
            '</div>' +
            composeMountActions(opts.planId, opts.tgId, opts.ifStepId, opts) +
            '</div></div></div>';
    }

    function configLabel(type) {
        var cat = global.JmsTgConfigCatalog;
        if (cat && cat.LABELS && cat.LABELS[type]) return cat.LABELS[type];
        return type || '配置元件';
    }

    function assertLabel(type) {
        if (type === 'response') return '响应断言';
        if (type === 'json') return 'JSON断言';
        if (type === 'size') return '大小断言';
        if (type === 'md5hex') return 'MD5Hex断言';
        return type || '断言';
    }

    function hasMountItems(step) {
        step = ensureIf(step);
        if (!step) return false;
        if (global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.hasAnyHashMounts === 'function') {
            if (global.JmsMountCatalogBridge.hasAnyHashMounts(step)) return true;
        }
        if ((step.processors || []).length) return true;
        if ((step.pre_processors || []).length) return true;
        if ((step.assertions || []).length) return true;
        if ((step.http_managers || []).length) return true;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isConstantTimerVisible === 'function') {
            if (global.JmsIfMountModel.isConstantTimerVisible(step)) return true;
        } else if (step.constant_timer) return true;
        if (global.JmsIfMountModel && typeof global.JmsIfMountModel.isUserParametersVisible === 'function') {
            if (global.JmsIfMountModel.isUserParametersVisible(step)) return true;
        } else if (step.user_parameters) return true;
        var sl = step.step_listeners || {};
        return !!(sl.view_results_tree || sl.aggregate_report || sl.backend_listener);
    }


    function renderMountEntry(entry, planId, tgId, depth, parentStepId) {
        return renderMountRow({
            planId: planId,
            tgId: tgId,
            ifStepId: entry.ifStepId,
            parentStepId: parentStepId,
            depth: depth,
            mountKind: entry.mountKind,
            mountIndex: entry.mountIndex,
            mountListenerKey: entry.mountListenerKey,
            cardClass: entry.cardClass,
            icon: entry.icon,
            typeLabel: entry.typeLabel,
            name: entry.name,
            meta: entry.meta,
            bodyKey: entry.key || '',
            assertKind: entry.kind === 'assertion' ? (entry.meta || '') : '',
            configType: entry.kind === 'config' ? (entry.meta || '') : '',
            mountListenerKey: entry.mountListenerKey || '',
            disabled: !!entry.disabled
        });
    }

    function renderIfBodyContent(ifStep, planId, tgId, depth, parentStepId, selectedHttpStepId) {
        if (!isLogicMountHostStep(ifStep)) return '';
        ifStep = ensureIf(ifStep);
        depth = depth || 0;
        parentStepId = parentStepId || ifStep.id;
        selectedHttpStepId = selectedHttpStepId || '';
        var TL = global.JmsIfMountTimeline;
        var R = global.JmsTgTreeRenderer;
        if (TL && typeof TL.buildBodyRenderPlan === 'function' && R && typeof R.renderChildStepNodes === 'function') {
            var plan = TL.buildBodyRenderPlan(ifStep);
            if (!plan.length) return '';
            var html = '';
            plan.forEach(function (item) {
                if (item.kind === 'mount' && item.entry) {
                    html += renderMountEntry(item.entry, planId, tgId, depth, parentStepId);
                } else if (item.kind === 'child' && item.step) {
                    html += R.renderChildStepNodes([item.step], planId, tgId, depth, parentStepId, selectedHttpStepId);
                }
            });
            return html;
        }
        var legacyMounts = renderRows(ifStep, planId, tgId, depth, parentStepId);
        var legacyChildren = R && typeof R.renderChildStepNodes === 'function'
            ? R.renderChildStepNodes(ifStep.children || [], planId, tgId, depth, parentStepId, selectedHttpStepId)
            : '';
        return legacyMounts + legacyChildren;
    }

    function renderRows(ifStep, planId, tgId, depth, parentStepId) {
        if (!isLogicMountHostStep(ifStep)) return '';
        ifStep = ensureIf(ifStep);
        depth = depth || 0;
        parentStepId = parentStepId || '';
        if (!hasMountItems(ifStep)) return '';

        var TL = global.JmsIfMountTimeline;
        var entries = TL && typeof TL.buildMountEntries === 'function'
            ? TL.buildMountEntries(ifStep)
            : [];
        if (!entries.length) return '';

        var html = '';
        entries.forEach(function (entry) {
            html += renderMountRow({
                planId: planId,
                tgId: tgId,
                ifStepId: entry.ifStepId || ifStep.id,
                parentStepId: parentStepId,
                depth: depth,
                mountKind: entry.mountKind,
                mountIndex: entry.mountIndex,
                mountListenerKey: entry.mountListenerKey,
                cardClass: entry.cardClass,
                icon: entry.icon,
                typeLabel: entry.typeLabel,
                name: entry.name,
                meta: entry.meta,
                bodyKey: entry.key || ''
            });
        });
        return html;
    }

    function syncIfBodyEmptyHint(body) {
        if (!body) return;
        var hasMounts = body.querySelector(':scope > .jms-tree-node--if-mount');
        var hasChildSteps = body.querySelector(':scope > .jms-tree-node:not(.jms-tree-node--if-mount)');
        var emptyHint = body.querySelector(':scope > .jms-empty-hint.jms-if-card__empty, :scope > .jms-if-card__empty, :scope > .jms-empty-hint.jms-random-card__empty, :scope > .jms-random-card__empty, :scope > .jms-empty-hint.jms-simple-card__empty, :scope > .jms-simple-card__empty, :scope > .jms-empty-hint.jms-transaction-card__empty, :scope > .jms-transaction-card__empty, :scope > .jms-empty-hint.jms-loop-card__empty, :scope > .jms-loop-card__empty');
        if (!hasMounts && !hasChildSteps) {
            if (!emptyHint) {
                var emptyCls = 'jms-if-card__empty';
                if (body.closest('.jms-random-card')) emptyCls = 'jms-random-card__empty';
                else if (body.closest('.jms-simple-card')) emptyCls = 'jms-simple-card__empty';
                else if (body.closest('.jms-transaction-card')) emptyCls = 'jms-transaction-card__empty';
                else if (body.closest('.jms-loop-card')) emptyCls = 'jms-loop-card__empty';
                body.insertAdjacentHTML('beforeend', '<p class="jms-empty-hint ' + emptyCls + '">暂无子步骤</p>');
            }
            return;
        }
        if (emptyHint && emptyHint.parentNode) emptyHint.parentNode.removeChild(emptyHint);
    }

    function resolveIfMountDepth(stepsEl, ifStepId, fallbackDepth) {
        if (!stepsEl || !ifStepId) return fallbackDepth || 1;
        var ifNode = stepsEl.querySelector('.jms-tree-node--if[data-step-id="' + ifStepId + '"], .jms-tree-node--random[data-step-id="' + ifStepId + '"], .jms-tree-node--simple[data-step-id="' + ifStepId + '"], .jms-tree-node--transaction[data-step-id="' + ifStepId + '"], .jms-tree-node--loop[data-step-id="' + ifStepId + '"], .jms-tree-node--catalog[data-step-id="' + ifStepId + '"]');
        if (!ifNode) return fallbackDepth || 1;
        return (parseInt(ifNode.getAttribute('data-depth') || '0', 10) || 0) + 1;
    }

    function patchIfBodyInDom(stepsEl, ifStep, planId, tgId, selectedHttpStepId) {
        if (!stepsEl || !ifStep || !ifStep.id || !isLogicMountHostStep(ifStep)) return false;
        ifStep = ensureIf(ifStep);
        var hostCard = findHostCard(stepsEl, ifStep);
        if (!hostCard) return false;
        var body = findHostBody(hostCard, ifStep);
        if (!body) return false;

        Array.prototype.slice.call(body.querySelectorAll(':scope > .jms-tree-node, :scope > .jms-empty-hint.jms-if-card__empty, :scope > .jms-if-card__empty, :scope > .jms-empty-hint.jms-random-card__empty, :scope > .jms-random-card__empty, :scope > .jms-empty-hint.jms-simple-card__empty, :scope > .jms-simple-card__empty, :scope > .jms-empty-hint.jms-transaction-card__empty, :scope > .jms-transaction-card__empty, :scope > .jms-empty-hint.jms-loop-card__empty, :scope > .jms-loop-card__empty')).forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        var depth = resolveIfMountDepth(stepsEl, ifStep.id, 1);
        var bodyHtml = renderIfBodyContent(ifStep, planId, tgId, depth, ifStep.id, selectedHttpStepId || '');
        if (bodyHtml) {
            body.insertAdjacentHTML('beforeend', bodyHtml);
        }
        syncIfBodyEmptyHint(body);
        var dom = hostDomFor(ifStep);
        var badge = dom ? hostCard.querySelector('.' + dom.badge + ', .jms-http-assert-badge') : null;
        if (badge && global.JmsTgTreeRenderer && typeof global.JmsTgTreeRenderer.countStepsInList === 'function') {
            badge.textContent = global.JmsTgTreeRenderer.countStepsInList(ifStep.children) + ' 子步骤';
        }
        return true;
    }

    function patchMountRowsInDom(stepsEl, ifStep, planId, tgId) {
        return patchIfBodyInDom(stepsEl, ifStep, planId, tgId, '');
    }

    global.JmsTgIfMountTreeRows = {
        hasMountItems: hasMountItems,
        renderRows: renderRows,
        renderIfBodyContent: renderIfBodyContent,
        patchIfBodyInDom: patchIfBodyInDom,
        patchMountRowsInDom: patchMountRowsInDom,
        syncIfBodyEmptyHint: syncIfBodyEmptyHint
    };
}(typeof window !== 'undefined' ? window : this));
