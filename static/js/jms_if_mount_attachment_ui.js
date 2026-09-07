/**
 * If 控制器挂载区 · 附件编辑（v2 独立模块 · 定时器弹窗对齐 HTTP 请求固定定时器 v4）
 */
(function (global) {
    'use strict';

    var TIMER_MODAL = 'modal-if-mount-timer-edit';
    var TARGET_TIMER = 'if-mount-timer';
    var TIMER_UI_VERSION = '4';
    var Catalog = function () { return global.JmsIfMountTimerCatalog; };

    function M() { return global.JmsIfMountModel; }

    function getIf(planId, tgId, ifStepId) {
        if (!M() || typeof M().findLogicMountStep !== 'function') return null;
        var step = M().findLogicMountStep(planId, tgId, ifStepId);
        return step ? M().ensureMountFields(step) : null;
    }

    function markDirty(planId, tgId, ifStepId) {
        if (M() && typeof M().markDirty === 'function') M().markDirty(planId, tgId, ifStepId);
    }

    function defaultTimerData() {
        return Catalog() && typeof Catalog().defaultTimerData === 'function'
            ? Catalog().defaultTimerData()
            : { enabled: false, name: '固定定时器', comments: '', delay_ms: 300 };
    }

    function normalizeTimer(cfg) {
        return Catalog() && typeof Catalog().normalizeTimer === 'function'
            ? Catalog().normalizeTimer(cfg)
            : defaultTimerData();
    }

    function hasConstantTimer(step) {
        return !!(step && step.constant_timer);
    }

    function resolveTimerEnabledForSave(existingTimer, mode) {
        var En = global.JmsHttpMountEnableUi;
        if (En && typeof En.resolveEnabledForSave === 'function') {
            return En.resolveEnabledForSave(mode === 'edit' ? existingTimer : null, {});
        }
        if (mode === 'create') return true;
        return existingTimer ? existingTimer.enabled !== false : true;
    }

    function fieldEl(modal, name) {
        return modal.querySelector('[data-if-mount-timer-field="' + name + '"]');
    }

    function fillTimerForm(modal, data) {
        data = normalizeTimer(data);
        var nameEl = fieldEl(modal, 'name');
        var commentsEl = fieldEl(modal, 'comments');
        var delayEl = fieldEl(modal, 'delay_ms');
        if (nameEl) nameEl.value = data.name || '固定定时器';
        if (commentsEl) commentsEl.value = data.comments || '';
        if (delayEl) delayEl.value = String(data.delay_ms != null ? data.delay_ms : 300);
    }

    function readTimerForm(modal) {
        var nameEl = fieldEl(modal, 'name');
        var commentsEl = fieldEl(modal, 'comments');
        var delayEl = fieldEl(modal, 'delay_ms');
        var delay = Number(delayEl && delayEl.value);
        return normalizeTimer({
            name: nameEl ? nameEl.value.trim() : '固定定时器',
            comments: commentsEl ? commentsEl.value : '',
            delay_ms: delay
        });
    }

    function ensureTimerModal() {
        var modal = global.document.getElementById(TIMER_MODAL);
        if (modal && modal.getAttribute('data-ui-version') === TIMER_UI_VERSION) return modal;
        if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
        modal = global.document.createElement('div');
        modal.id = TIMER_MODAL;
        modal.className = 'jms-modal jms-if-mount-timer-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('data-ui-version', TIMER_UI_VERSION);
        modal.innerHTML =
            '<div class="jms-step-modal jms-if-mount-timer-modal__panel">' +
            '<div class="jms-if-mount-timer-modal__head">' +
            '<div class="jms-if-mount-timer-modal__head-main">' +
            '<span class="jms-if-mount-timer-modal__badge">Constant Timer</span>' +
            '<h3 class="jms-step-modal__title" data-if-mount-timer-modal-title>编辑固定定时器</h3>' +
            '</div>' +
            '<button type="button" class="jms-if-mount-timer-modal__close" data-if-mount-timer-close aria-label="关闭">&times;</button>' +
            '</div>' +
            '<div class="jms-if-mount-timer-modal__body">' +
            '<div class="jms-if-mount-timer-v1">' +
            '<div class="jms-if-mount-timer-v1__row jms-if-mount-timer-v1__row--meta">' +
            '<label class="jms-if-mount-timer-v1__field"><span class="jms-if-mount-timer-v1__label">名称</span>' +
            '<input type="text" class="jms-if-mount-timer-v1__input" data-if-mount-timer-field="name" placeholder="固定定时器"></label>' +
            '<label class="jms-if-mount-timer-v1__field"><span class="jms-if-mount-timer-v1__label">注释</span>' +
            '<input type="text" class="jms-if-mount-timer-v1__input" data-if-mount-timer-field="comments" placeholder=""></label>' +
            '</div>' +
            '<label class="jms-if-mount-timer-v1__field jms-if-mount-timer-v1__field--delay">' +
            '<span class="jms-if-mount-timer-v1__label">线程延迟（毫秒）</span>' +
            '<input type="text" class="jms-if-mount-timer-v1__input jms-if-mount-timer-v1__input--delay" data-if-mount-timer-field="delay_ms" placeholder="300" inputmode="numeric">' +
            '</label></div></div>' +
            '<div class="jms-if-mount-timer-modal__foot">' +
            '<button type="button" class="jms-if-mount-timer-modal__btn jms-if-mount-timer-modal__btn--ghost" data-if-mount-timer-cancel>取消</button>' +
            '<button type="button" class="jms-if-mount-timer-modal__btn jms-if-mount-timer-modal__btn--primary" data-if-mount-timer-save>保存</button>' +
            '</div></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target === modal) closeTimerModal();
        });
        var panel = modal.querySelector('.jms-if-mount-timer-modal__panel');
        if (panel) panel.addEventListener('click', function (ev) { ev.stopPropagation(); });
        modal.querySelector('[data-if-mount-timer-close]').addEventListener('click', closeTimerModal);
        modal.querySelector('[data-if-mount-timer-cancel]').addEventListener('click', closeTimerModal);
        modal.querySelector('[data-if-mount-timer-save]').addEventListener('click', saveTimerModal);
        if (!global.document.body.dataset.jmsIfMountTimerEscBound) {
            global.document.body.dataset.jmsIfMountTimerEscBound = '1';
            global.document.addEventListener('keydown', function (ev) {
                if (ev.key !== 'Escape') return;
                var m = global.document.getElementById(TIMER_MODAL);
                if (m && m.classList.contains('jms-modal-open')) closeTimerModal();
            });
        }
        return modal;
    }

    function closeTimerModal() {
        var modal = global.document.getElementById(TIMER_MODAL);
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-mode');
    }

    function saveTimerModal() {
        var modal = global.document.getElementById(TIMER_MODAL);
        if (!modal || modal.getAttribute('data-edit-target') !== TARGET_TIMER) return;
        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var ifStepId = modal.getAttribute('data-if-step-id');
        var step = getIf(planId, tgId, ifStepId);
        if (!step) return;
        var data = readTimerForm(modal);
        if (!Number.isFinite(data.delay_ms) || data.delay_ms < 0) {
            global.alert('请输入有效的线程延迟毫秒数');
            return;
        }
        var mode = modal.getAttribute('data-mode') || 'edit';
        var hadTimer = hasConstantTimer(step);
        var prevTimer = hadTimer ? step.constant_timer : null;
        var enabled = resolveTimerEnabledForSave(prevTimer, mode);
        step.constant_timer = {
            enabled: enabled,
            name: data.name,
            comments: data.comments,
            delay_ms: data.delay_ms
        };
        if (enabled && global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.migrateLegacyMountArraysToHash === 'function') {
            global.JmsMountCatalogBridge.migrateLegacyMountArraysToHash(step);
        }
        var Ht = global.JmsIfMountSaveHelper;
        if (mode === 'create' && Ht && typeof Ht.notifyMountAdded === 'function') {
            var tKey = 'iftimer:constant';
            if (global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.hashMountKey === 'function') {
                var tChild = (step.catalog_hash_children || []).filter(function (c) {
                    return c && c.alias === 'ConstantTimer';
                }).pop();
                if (tChild) tKey = global.JmsMountCatalogBridge.hashMountKey(tChild, 0);
            }
            Ht.notifyMountAdded(step, tKey);
        }
        closeTimerModal();
        markDirty(planId, tgId, ifStepId);
    }

    function openTimerEdit(planId, tgId, ifStepId) {
        var step = getIf(planId, tgId, ifStepId);
        if (!step) return;
        var modal = ensureTimerModal();
        var t = normalizeTimer(step.constant_timer || defaultTimerData());
        var mode = hasConstantTimer(step) ? 'edit' : 'create';
        modal.setAttribute('data-edit-target', TARGET_TIMER);
        modal.setAttribute('data-plan-id', planId);
        modal.setAttribute('data-tg-id', tgId);
        modal.setAttribute('data-if-step-id', ifStepId);
        modal.setAttribute('data-mode', mode);
        var titleEl = modal.querySelector('[data-if-mount-timer-modal-title]');
        if (titleEl) titleEl.textContent = mode === 'create' ? '添加固定定时器' : '编辑固定定时器';
        fillTimerForm(modal, mode === 'create' ? defaultTimerData() : t);
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        var first = fieldEl(modal, 'name');
        if (first) {
            global.setTimeout(function () {
                try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
            }, 60);
        }
    }

    function openUserParamsEdit(planId, tgId, ifStepId) {
        if (global.JmsIfMountUserParamsUi && typeof global.JmsIfMountUserParamsUi.openEdit === 'function') {
            global.JmsIfMountUserParamsUi.openEdit(planId, tgId, ifStepId);
        }
    }

    function openPreprocCreate(planId, tgId, ifStepId, type) {
        if (!type || type !== 'beanshell_pre') return;
        if (global.JmsIfMountBeanshellPreUi && typeof global.JmsIfMountBeanshellPreUi.openCreate === 'function') {
            global.JmsIfMountBeanshellPreUi.openCreate(planId, tgId, ifStepId);
        }
    }

    function postprocUiForKind(kind) {
        /* catalog-only：后置处理器统一走 JmsCatalogOnlyAppend / catalog 编辑器 */
        return null;
    }

    function openPostprocCreate(planId, tgId, ifStepId, kind) {
        if (!kind) return;
        var ui = postprocUiForKind(kind);
        if (ui && typeof ui.openCreateForIfMount === 'function') {
            ui.openCreateForIfMount(planId, tgId, ifStepId);
            return;
        }
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.appendAuxStepToParent === 'function') {
            vb.appendAuxStepToParent(planId, tgId, ifStepId, kind);
        }
    }

    function openAssertCreate(planId, tgId, ifStepId, type) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.openCreateMountAux === 'function' && B.openCreateMountAux(planId, tgId, ifStepId, type)) {
            return;
        }
        if (global.JmsIfMountAssertUi && typeof global.JmsIfMountAssertUi.openCreate === 'function') {
            global.JmsIfMountAssertUi.openCreate(planId, tgId, ifStepId, type);
        }
    }

    function openConfigCreate(planId, tgId, ifStepId, type) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.openCreateMountAux === 'function' && B.openCreateMountAux(planId, tgId, ifStepId, type)) {
            return;
        }
        if (global.JmsIfMountConfigUi && typeof global.JmsIfMountConfigUi.openCreate === 'function') {
            global.JmsIfMountConfigUi.openCreate(planId, tgId, ifStepId, type);
        }
    }

    function openListenerCreate(planId, tgId, ifStepId, listenerType) {
        var B = global.JmsMountCatalogBridge;
        if (B && typeof B.openCreateMountAux === 'function' && B.openCreateMountAux(planId, tgId, ifStepId, listenerType)) {
            return;
        }
        if (global.JmsIfMountListenerUi && typeof global.JmsIfMountListenerUi.openCreate === 'function') {
            global.JmsIfMountListenerUi.openCreate(planId, tgId, ifStepId, listenerType);
        }
    }

    global.JmsIfMountAttachmentUi = {
        openTimerEdit: openTimerEdit,
        openUserParamsEdit: openUserParamsEdit,
        openPreprocCreate: openPreprocCreate,
        openPostprocCreate: openPostprocCreate,
        openAssertCreate: openAssertCreate,
        openConfigCreate: openConfigCreate,
        openListenerCreate: openListenerCreate
    };
}(typeof window !== 'undefined' ? window : this));
