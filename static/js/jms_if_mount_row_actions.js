/**
 * If 控制器挂载区 · 树形行编辑/删除（独立模块，不影响 HTTP/TG 挂载操作）
 */
(function (global) {
    'use strict';

    var H = function () { return global.JmsIfMountSaveHelper; };
    var TL = function () { return global.JmsIfMountTimeline; };

    function getIf(planId, tgId, ifStepId) {
        return H() && typeof H().getIf === 'function' ? H().getIf(planId, tgId, ifStepId) : null;
    }

    function markDirty(planId, tgId, ifStepId) {
        if (H() && typeof H().markDirty === 'function') H().markDirty(planId, tgId, ifStepId);
    }

    function removeKeyAndReconcile(ifStep, key) {
        var timeline = TL();
        if (!ifStep || !timeline) return;
        if (typeof timeline.removeMountKeyFromTimeline === 'function') {
            timeline.removeMountKeyFromTimeline(ifStep, key);
        }
        if (typeof timeline.reconcileMountKeysAfterDelete === 'function') {
            timeline.reconcileMountKeysAfterDelete(ifStep);
        }
    }

    function assertUiForKind(kind) {
        if (kind === 'response_assert') return global.JmsTgResponseAssertionUi;
        if (kind === 'json_assert') return global.JmsTgJsonAssertionUi;
        if (kind === 'size_assert') return global.JmsTgSizeAssertionUi;
        if (kind === 'md5hex_assert') return global.JmsTgMd5hexAssertionUi;
        return null;
    }

    function listenerUiForKey(key) {
        return null;
    }

    function openEdit(planId, tgId, ifStepId, mountKind, mountIndex, assertKind, configType, listenerKey) {
        if (mountKind === 'catalog_hash') {
            var Bridge = global.JmsMountCatalogBridge;
            if (Bridge && typeof Bridge.openHashChildEditor === 'function') {
                Bridge.openHashChildEditor(planId, tgId, ifStepId, mountIndex);
            }
            return;
        }
        if (mountKind === 'timer') {
            if (global.JmsIfMountAttachmentUi && typeof global.JmsIfMountAttachmentUi.openTimerEdit === 'function') {
                global.JmsIfMountAttachmentUi.openTimerEdit(planId, tgId, ifStepId);
            }
            return;
        }
        if (mountKind === 'user_parameters') {
            if (global.JmsIfMountUserParamsUi && typeof global.JmsIfMountUserParamsUi.openEdit === 'function') {
                global.JmsIfMountUserParamsUi.openEdit(planId, tgId, ifStepId);
            } else if (global.JmsHttpStepUserParamsUi && typeof global.JmsHttpStepUserParamsUi.openEditForIfMount === 'function') {
                global.JmsHttpStepUserParamsUi.openEditForIfMount(planId, tgId, ifStepId);
            }
            return;
        }
        if (mountKind === 'pre_processor') {
            if (global.JmsHttpBeanshellPreProcessorUi && typeof global.JmsHttpBeanshellPreProcessorUi.openEditForIfMount === 'function') {
                global.JmsHttpBeanshellPreProcessorUi.openEditForIfMount(planId, tgId, ifStepId, mountIndex);
            }
            return;
        }
        if (mountKind === 'processor') {
            var ifStepProc = getIf(planId, tgId, ifStepId);
            var proc = ifStepProc && (ifStepProc.processors || [])[mountIndex];
            if (!proc) return;
            var procUi = null;
            if (proc.type === 'regex_extract') procUi = global.JmsHttpRegexExtractProcessorUi;
            else if (proc.type === 'json_post') procUi = null;
            else if (proc.type === 'xpath_extract') procUi = global.JmsHttpXpathExtractProcessorUi;
            else if (proc.type === 'jdbc_post') procUi = global.JmsHttpJdbcPostProcessorUi;
            else if (proc.type === 'jsr223_post') procUi = global.JmsHttpJsr223PostProcessorUi;
            else if (proc.type === 'beanshell_post') procUi = global.JmsHttpBeanshellPostProcessorUi;
            if (procUi && typeof procUi.openEditForIfMount === 'function') {
                procUi.openEditForIfMount(planId, tgId, ifStepId, mountIndex);
            }
            return;
        }
        if (mountKind === 'assertion') {
            var aui = assertUiForKind(assertKind);
            if (aui && typeof aui.openEditForIfMount === 'function') {
                aui.openEditForIfMount(planId, tgId, ifStepId, mountIndex);
            }
            return;
        }
        if (mountKind === 'config') {
            if (global.JmsHttpStepConfigUi && typeof global.JmsHttpStepConfigUi.openEditForIfMount === 'function') {
                global.JmsHttpStepConfigUi.openEditForIfMount(planId, tgId, ifStepId, mountIndex, configType);
            }
            return;
        }
        if (mountKind === 'listener' && listenerKey) {
            var lui = listenerUiForKey(listenerKey);
            if (lui && typeof lui.openEditorForIfMount === 'function') {
                lui.openEditorForIfMount(planId, tgId, ifStepId, listenerKey);
            }
        }
    }

    function deleteMount(planId, tgId, ifStepId, mountKind, mountIndex, bodyKey, assertKind, configType, listenerKey) {
        var ifStep = getIf(planId, tgId, ifStepId);
        if (!ifStep) return;
        var timeline = TL();
        var label = '该挂载元件';
        var key = bodyKey || '';

        if (mountKind === 'catalog_hash') {
            var BridgeDel = global.JmsMountCatalogBridge;
            var child = BridgeDel && typeof BridgeDel.getHashChild === 'function'
                ? BridgeDel.getHashChild(ifStep, mountIndex) : null;
            label = (child && (child.name || child.label_zh || child.alias)) || '挂载元件';
            var doHashDel = function () {
                if (BridgeDel && typeof BridgeDel.deleteHashChild === 'function') {
                    BridgeDel.deleteHashChild(planId, tgId, ifStepId, mountIndex, key);
                }
                if (timeline && typeof timeline.reconcileMountKeysAfterDelete === 'function') {
                    timeline.reconcileMountKeysAfterDelete(ifStep);
                }
                markDirty(planId, tgId, ifStepId);
            };
            var DelH = global.JmsComponentDelete;
            if (DelH && typeof DelH.confirm === 'function') {
                DelH.confirm({ title: '删除挂载元件', name: label }).then(function (ok) { if (ok) doHashDel(); });
                return;
            }
            if (global.confirm('确定删除「' + label + '」吗？')) doHashDel();
            return;
        }

        if (mountKind === 'timer') {
            label = '固定定时器';
            if (!ifStep.constant_timer) ifStep.constant_timer = { enabled: false };
            ifStep.constant_timer.enabled = false;
            key = key || (timeline && typeof timeline.keyTimer === 'function' ? timeline.keyTimer() : 'iftimer:constant');
        } else if (mountKind === 'user_parameters') {
            label = '用户参数';
            if (!ifStep.user_parameters) ifStep.user_parameters = { enabled: false, params: [] };
            ifStep.user_parameters.enabled = false;
            key = key || (timeline && typeof timeline.keyUserParameters === 'function' ? timeline.keyUserParameters() : 'ifpre:user_parameters');
        } else if (mountKind === 'pre_processor') {
            var preList = ifStep.pre_processors || [];
            var pre = preList[mountIndex];
            if (!pre) return;
            label = pre.name || '前置处理器';
            preList.splice(mountIndex, 1);
            ifStep.pre_processors = preList;
            key = key || (timeline && typeof timeline.keyPreProcessor === 'function' ? timeline.keyPreProcessor(mountIndex) : 'ifpre:' + mountIndex);
        } else if (mountKind === 'processor') {
            var procList = ifStep.processors || [];
            var procItem = procList[mountIndex];
            if (!procItem) return;
            label = procItem.name || '后置处理器';
            procList.splice(mountIndex, 1);
            ifStep.processors = procList;
            key = key || (timeline && typeof timeline.keyProcessor === 'function' ? timeline.keyProcessor(mountIndex) : 'ifproc:' + mountIndex);
        } else if (mountKind === 'assertion') {
            var asList = ifStep.assertions || [];
            var asItem = asList[mountIndex];
            if (!asItem) return;
            label = asItem.name || '断言';
            asList.splice(mountIndex, 1);
            ifStep.assertions = asList;
            key = key || (timeline && typeof timeline.keyAssertion === 'function' ? timeline.keyAssertion(mountIndex) : 'ifas:' + mountIndex);
        } else if (mountKind === 'config') {
            var cfgList = ifStep.http_managers || [];
            var cfg = cfgList[mountIndex];
            if (!cfg) return;
            var cat = global.JmsTgConfigCatalog;
            label = cfg.name || (cat && cat.LABELS && cat.LABELS[cfg.type]) || cfg.type || '配置元件';
            cfgList.splice(mountIndex, 1);
            ifStep.http_managers = cfgList;
            key = key || (timeline && typeof timeline.keyConfig === 'function' ? timeline.keyConfig(mountIndex) : 'ifcfg:' + mountIndex);
        } else if (mountKind === 'listener' && listenerKey) {
            if (!ifStep.step_listeners) ifStep.step_listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
            ifStep.step_listeners[listenerKey] = false;
            if (listenerKey === 'view_results_tree') delete ifStep.view_results_tree;
            if (listenerKey === 'aggregate_report') delete ifStep.aggregate_report;
            if (listenerKey === 'backend_listener') delete ifStep.backend_listener;
            var lisNames = { view_results_tree: '察看结果树', aggregate_report: '聚合报告', backend_listener: '后端监听器' };
            label = lisNames[listenerKey] || '监听器';
            key = key || (timeline && typeof timeline.keyListener === 'function' ? timeline.keyListener(listenerKey) : 'iflis:' + listenerKey);
        } else {
            return;
        }

        var doDelete = function () {
            removeKeyAndReconcile(ifStep, key);
            markDirty(planId, tgId, ifStepId);
        };
        var Del = global.JmsComponentDelete;
        if (Del && typeof Del.confirm === 'function') {
            Del.confirm({ title: '删除挂载元件', name: label }).then(function (ok) { if (ok) doDelete(); });
            return;
        }
        if (global.confirm('确定删除「' + label + '」吗？')) doDelete();
    }

    function closeMenus(except) {
        global.document.querySelectorAll('.jms-if-mount-row-actions.is-open').forEach(function (wrap) {
            if (except && wrap === except) return;
            wrap.classList.remove('is-open');
        });
    }

    function onRootClick(ev) {
        if (!global.document.body.classList.contains('lth-tg-view-tree')) return;
        var t = ev.target;

        var menuBtn = t.closest('.jms-if-mount-row-actions .lth-step-menu-btn');
        if (menuBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var wrap = menuBtn.closest('.jms-if-mount-row-actions');
            if (!wrap) return;
            var open = wrap.classList.contains('is-open');
            closeMenus(wrap);
            wrap.classList.toggle('is-open', !open);
            return;
        }

        var editBtn = t.closest('.jms-if-mount-row-edit');
        if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            closeMenus(null);
            openEdit(
                editBtn.getAttribute('data-plan-id'),
                editBtn.getAttribute('data-tg-id'),
                editBtn.getAttribute('data-if-step-id'),
                editBtn.getAttribute('data-if-mount-kind'),
                parseInt(editBtn.getAttribute('data-if-mount-index'), 10) || 0,
                editBtn.getAttribute('data-assert-kind') || '',
                editBtn.getAttribute('data-config-type') || '',
                editBtn.getAttribute('data-listener-key') || ''
            );
            return;
        }

        var delBtn = t.closest('.jms-if-mount-row-del');
        if (delBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            closeMenus(null);
            deleteMount(
                delBtn.getAttribute('data-plan-id'),
                delBtn.getAttribute('data-tg-id'),
                delBtn.getAttribute('data-if-step-id'),
                delBtn.getAttribute('data-if-mount-kind'),
                parseInt(delBtn.getAttribute('data-if-mount-index'), 10) || 0,
                delBtn.getAttribute('data-if-body-key') || '',
                delBtn.getAttribute('data-assert-kind') || '',
                delBtn.getAttribute('data-config-type') || '',
                delBtn.getAttribute('data-listener-key') || ''
            );
            return;
        }

        if (!t.closest('.jms-if-mount-row-actions')) closeMenus(null);
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsIfMountRowActionsBound === '1') return;
        root.dataset.jmsIfMountRowActionsBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsIfMountRowActions = {
        openEdit: openEdit,
        deleteMount: deleteMount,
        bind: bind
    };
}(typeof window !== 'undefined' ? window : this));
