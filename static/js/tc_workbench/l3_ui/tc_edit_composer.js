/**
 * 智能编辑 — 输入框 Composer（独立实现，不复用智能生成对话框）
 */
(function (global) {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function resizeTcEditPromptInput(textarea) {
        var el = textarea || $('ai-edit-prompt');
        if (!el) return;
        var lim;
        if (typeof global.getTcAiPromptResizeLimits === 'function') {
            lim = global.getTcAiPromptResizeLimits(el);
        } else {
            lim = { min: 36, max: 118 };
        }
        el.style.height = 'auto';
        var scrollHeight = el.scrollHeight;
        var next = Math.min(lim.max, Math.max(lim.min, scrollHeight));
        el.style.height = next + 'px';
        el.style.overflowY = scrollHeight > lim.max ? 'auto' : 'hidden';
        var box = $('tc-edit-prompt-composer-box');
        if (box) {
            var multiline = scrollHeight > lim.min + 2;
            box.classList.toggle('tc-prompt-composer__box--multiline', multiline);
            if (multiline) {
                box.style.setProperty('border-radius', '10px', 'important');
            } else {
                box.style.removeProperty('border-radius');
            }
        }
    }


    function isEditAttachmentParsePending() {
        var mod = global.TcEditAttachments;
        if (!mod || typeof mod.isComposerAttachmentParsePending !== 'function') return false;
        return mod.isComposerAttachmentParsePending();
    }

    function syncTcEditSendBtnState() {
        var el = $('ai-edit-prompt');
        var btn = $('tc-edit-send-btn');
        if (!btn) return;
        var running = global.TcAiSmartEdit && typeof global.TcAiSmartEdit.isRunning === 'function'
            ? global.TcAiSmartEdit.isRunning()
            : false;
        var hasText = !!(el && String(el.value || '').trim());
        var attachParsing = isEditAttachmentParsePending();
        var canSend = hasText && !running && !attachParsing;
        btn.disabled = running ? false : !canSend;
        btn.classList.toggle('tc-prompt-composer__send-btn--active', canSend);
        btn.classList.toggle('tc-prompt-composer__send-btn--stop', running);
        btn.classList.toggle('tc-prompt-composer__send-btn--attach-pending', !running && attachParsing);
        if (running) {
            btn.title = '停止编辑';
            btn.setAttribute('aria-label', '停止编辑');
        } else if (attachParsing) {
            btn.title = '附件解析中，请稍候';
            btn.setAttribute('aria-label', '附件解析中，请稍候');
        } else {
            btn.title = '发送编辑指令';
            btn.setAttribute('aria-label', '发送编辑指令');
        }
    }

    function isEditSendBlocked() {
        var lock = global.TcLeftPanelLock;
        if (!lock) return false;
        if (lock.isAiGenerateLocked && lock.isAiGenerateLocked()) return true;
        if (lock.isQualityCheckBusy && lock.isQualityCheckBusy()) return true;
        return false;
    }

    function onEditSendClick() {
        var btn = $('tc-edit-send-btn');
        if (!global.isTcWorkbenchEditMode || !global.isTcWorkbenchEditMode()) return;
        if (global.TcAiSmartEdit && typeof global.TcAiSmartEdit.isRunning === 'function' &&
            global.TcAiSmartEdit.isRunning()) {
            if (typeof global.triggerTcEditSend === 'function') global.triggerTcEditSend();
            return;
        }
        if (btn && btn.disabled) return;
        if (isEditAttachmentParsePending()) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('附件解析中，请稍后再发送', { variant: 'warning', duration: 2800 });
            }
            return;
        }
        if (isEditSendBlocked()) {
            if (typeof global.tcAppToast === 'function') {
                global.tcAppToast('生成或质量检查进行中，请稍后再试', { variant: 'warning', duration: 2800 });
            }
            return;
        }
        if (typeof global.triggerTcEditSend === 'function') {
            global.triggerTcEditSend();
        }
    }

    function initTcEditPromptInput() {
        var el = $('ai-edit-prompt');
        if (!el || el.dataset.tcEditPromptBound === '1') return;
        el.dataset.tcEditPromptBound = '1';
        el._tcPromptScrollLocked = false;
        resizeTcEditPromptInput(el);
        el.addEventListener('input', function () {
            resizeTcEditPromptInput(this);
            syncTcEditSendBtnState();
        });
        el.addEventListener('change', syncTcEditSendBtnState);
        el.addEventListener('paste', function () {
            var self = this;
            global.setTimeout(function () {
                resizeTcEditPromptInput(self);
                syncTcEditSendBtnState();
            }, 0);
        });
        el.addEventListener('compositionend', function () {
            resizeTcEditPromptInput(this);
            syncTcEditSendBtnState();
        });
        el.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.isComposing) return;
            if (typeof global.tcAppDialogIsOpen === 'function' && global.tcAppDialogIsOpen()) return;
            if (!global.isTcWorkbenchEditMode || !global.isTcWorkbenchEditMode()) return;
            if (isEditSendBlocked()) return;
            if (isEditAttachmentParsePending()) return;
            e.preventDefault();
            onEditSendClick();
        });
    }

    function initTcEditSendBtn() {
        var btn = $('tc-edit-send-btn');
        if (!btn || btn.dataset.tcEditSendBound === '1') return;
        btn.dataset.tcEditSendBound = '1';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            onEditSendClick();
        });
    }

    function initTcEditComposer() {
        if (!document.getElementById('tc-edit-send-btn')) return;
        initTcEditPromptInput();
        initTcEditSendBtn();
        syncTcEditSendBtnState();
    }

    global.resizeTcEditPromptInput = resizeTcEditPromptInput;
    global.syncTcEditSendBtnState = syncTcEditSendBtnState;
    global.initTcEditComposer = initTcEditComposer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcEditComposer);
    } else {
        initTcEditComposer();
    }
})(typeof window !== 'undefined' ? window : this);
