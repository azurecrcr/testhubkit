/**
 * JMX 导入后 UI 恢复（隔离模块 v1）
 * 修复：导入后计划级编辑/删除、线程组工具栏、步骤区菜单点击无响应。
 */
(function (global) {
    'use strict';

    var recoverTimer = null;
    var recoverPass = 0;

    function hasFidelityFlag(obj) {
        return !!(obj && obj._jmx_import_fidelity);
    }

    function closeStrayModals() {
        if (!global.document) return;
        global.document.querySelectorAll('.jms-modal.jms-modal-open').forEach(function (modal) {
            modal.classList.remove('jms-modal-open');
            modal.setAttribute('aria-hidden', 'true');
        });
        var jmxModal = global.document.getElementById('modal-jmx-import');
        if (jmxModal) {
            jmxModal.classList.remove('jms-modal-open');
            jmxModal.setAttribute('aria-hidden', 'true');
        }
        if (global.document.body) {
            global.document.body.classList.remove('jmx-import-modal-open');
        }
        global.document.body.classList.remove('jms-v2-catalog-popup-open');
        var pop = global.document.getElementById('jms-v2-catalog-popup');
        if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
        var CM = global.JmsCatalogMenuV2;
        if (CM) {
            if (typeof CM.closePopup === 'function') CM.closePopup();
            if (typeof CM.closeAllDropdowns === 'function') CM.closeAllDropdowns();
            if (typeof CM.closeAllNativeTgMenus === 'function') CM.closeAllNativeTgMenus();
        }
        var CFG = global.JmsTgConfigMenuUi;
        if (CFG && typeof CFG.closeAllMenus === 'function') CFG.closeAllMenus();
    }

    function rebindMenusAfterDomRefresh() {
        var CM = global.JmsCatalogMenuV2;
        if (CM && typeof CM.init === 'function') CM.init();
        var PC = global.JmsPlanCatalogItemsUi;
        if (PC && typeof PC.init === 'function') PC.init();
        var HU = global.JmsHttpContextUi;
        if (HU && typeof HU.ensureBind === 'function') HU.ensureBind();
    }

    function runRecover() {
        closeStrayModals();
        rebindMenusAfterDomRefresh();
        var T = global.JmsTgTreeShell;
        var VB = global.JmsVisualBuilder;
        var m = VB && typeof VB.getModel === 'function' ? VB.getModel() : null;
        if (T && global.document.body.classList.contains('lth-tg-view-tree') && m) {
            if (typeof T.syncAll === 'function' && recoverPass < 2) {
                recoverPass += 1;
                T.syncAll(true);
            }
        }
        rebindMenusAfterDomRefresh();
        if (VB && typeof VB.triggerRender === 'function' && m && hasFidelityFlag(m)) {
            VB.triggerRender();
        }
        global.setTimeout(rebindMenusAfterDomRefresh, 120);
    }

    function scheduleRecover() {
        if (recoverTimer) global.clearTimeout(recoverTimer);
        recoverPass = 0;
        recoverTimer = global.setTimeout(function () {
            recoverTimer = null;
            runRecover();
        }, 0);
        global.setTimeout(runRecover, 80);
        global.setTimeout(function () {
            recoverPass = 0;
            rebindMenusAfterDomRefresh();
        }, 240);
    }

    function patchFidelitySyncAll() {
        var T = global.JmsTgTreeShell;
        if (!T || typeof T.syncAll !== 'function' || T.__jmxImportUiRecoverSyncV1) return;
        T.__jmxImportUiRecoverSyncV1 = true;
        var orig = T.syncAll;
        T.syncAll = function (forceFull) {
            orig.call(T, forceFull);
            var VB = global.JmsVisualBuilder;
            var m = VB && typeof VB.getModel === 'function' ? VB.getModel() : null;
            if (m && hasFidelityFlag(m) && global.__jmxImportRecoverPending) {
                global.__jmxImportRecoverPending = false;
                scheduleRecover();
            }
        };
    }

    function patchApplyScenarioYaml() {
        var S = global.JmsScenarioStudio;
        if (!S || typeof S.applyScenarioYaml !== 'function' || S.__jmxImportUiRecoverApplyV1) return;
        S.__jmxImportUiRecoverApplyV1 = true;
        var orig = S.applyScenarioYaml;
        S.applyScenarioYaml = function (yamlText) {
            var pending = false;
            try {
                if (global.jsyaml && yamlText) {
                    var data = global.jsyaml.load(yamlText);
                    pending = hasFidelityFlag(data);
                }
            } catch (e) { /* ignore */ }
            if (pending) global.__jmxImportRecoverPending = true;
            orig.call(this, yamlText);
            if (pending) scheduleRecover();
        };
    }

    function boot() {
        patchApplyScenarioYaml();
        patchFidelitySyncAll();
        rebindMenusAfterDomRefresh();
    }

    global.JmsJmxImportUiRecover = {
        closeStrayModals: closeStrayModals,
        rebindMenusAfterDomRefresh: rebindMenusAfterDomRefresh,
        scheduleRecover: scheduleRecover,
        runRecover: runRecover,
        boot: boot
    };

    function scheduleBoot() {
        boot();
        global.setTimeout(boot, 0);
        global.setTimeout(boot, 200);
    }

    if (global.document && global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', scheduleBoot);
    } else {
        scheduleBoot();
    }
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', scheduleBoot);
    }
}(typeof window !== 'undefined' ? window : this));
