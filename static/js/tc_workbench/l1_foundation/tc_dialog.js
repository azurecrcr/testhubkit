/**
 * TestHub TC Workbench — L1 FOUNDATION
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function getImageFileSizeError(file) {
    if (!file) return '请先选择文件';
    if (file.size === 0) return '文件为空，请重新选择';
    if (file.size > IMAGE_UPLOAD_LIMITS.maxBytes) {
        const cur = (file.size / (1024 * 1024)).toFixed(1);
        return '文件过大：单张不超过 ' + IMAGE_UPLOAD_LIMITS.maxMb + ' MB（当前约 ' + cur + ' MB）';
    }
    return '';
}

/** 测试用例页统一弹窗（无 tc-app-dialog 时回退到 alert/confirm） */
var tcAppDialogResolve = null;
var tcAppDialogIsConfirm = false;
var tcAppDialogIsCopyMode = false;
var tcAppDialogCopyText = null;
var tcAppDialogBackdropFn = null;
var TC_WORKBENCH_MODAL_Z_BASE = 10750;
var TC_VALIDATE_DRAWER_Z_FLOOR = 10475;

function tcWorkbenchEnhancementsApi() {
    if (typeof TcWorkbenchEnhancements !== 'undefined' && TcWorkbenchEnhancements) {
        return TcWorkbenchEnhancements;
    }
    if (typeof window !== 'undefined' && window.TcWorkbenchEnhancements) {
        return window.TcWorkbenchEnhancements;
    }
    return null;
}

function tcWorkbenchModalZIndex() {
    var z = TC_WORKBENCH_MODAL_Z_BASE;
    var enh = tcWorkbenchEnhancementsApi();
    if (enh && typeof enh.getFloatPanelStackZIndex === 'function') {
        z = Math.max(z, enh.getFloatPanelStackZIndex() + 20);
    }
    z = Math.max(z, TC_VALIDATE_DRAWER_Z_FLOOR + 250);
    if (typeof document !== 'undefined' &&
        document.body &&
        document.body.classList.contains('tc-wb-supplement-confirm-open')) {
        z = Math.max(z, TC_VALIDATE_DRAWER_Z_FLOOR + 350);
    }
    return z;
}


/** 通用模态框显隐（原 tc_stash.js，暂存移除后仍供模板/导出等弹窗使用） */
function showModal(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    el.style.display = 'flex';
    el.setAttribute('aria-hidden', 'false');
    if (typeof tcEnsureModalTopLayer === 'function') tcEnsureModalTopLayer(el);
}

function hideModal(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    el.style.display = '';
    el.setAttribute('aria-hidden', 'true');
}

function tcEnsureModalTopLayer(el) {
    if (!el) return;
    if (el.parentElement !== document.body) document.body.appendChild(el);
    el.style.setProperty('z-index', String(tcWorkbenchModalZIndex()), 'important');
}

function tcAppDialogIsOpen() {
    var root = document.getElementById('tc-app-dialog');
    return !!(root && !root.classList.contains('hidden'));
}
window.tcAppDialogIsOpen = tcAppDialogIsOpen;

function tcAppDialogClose(result) {
    var root = document.getElementById('tc-app-dialog');
    if (root) {
        root.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
    if (tcAppDialogBackdropFn && root) {
        root.removeEventListener('click', tcAppDialogBackdropFn);
        tcAppDialogBackdropFn = null;
    }
    var fn = tcAppDialogResolve;
    var wasConfirm = tcAppDialogIsConfirm;
    tcAppDialogResolve = null;
    tcAppDialogIsConfirm = false;
    tcAppDialogIsCopyMode = false;
    tcAppDialogCopyText = null;
    if (fn) {
        if (wasConfirm) fn(!!result);
        else fn();
    }
}

function tcAppDialogOpen(options) {
    return new Promise(function (resolve) {
        var root = document.getElementById('tc-app-dialog');
        var titleEl = document.getElementById('tc-app-dialog-title');
        var msgEl = document.getElementById('tc-app-dialog-message');
        var iconEl = document.getElementById('tc-app-dialog-icon');
        var hintEl = document.getElementById('tc-app-dialog-hint');
        var cancelBtn = document.getElementById('tc-app-dialog-cancel');
        var okBtn = document.getElementById('tc-app-dialog-confirm');
        var variant = (options && options.variant) || 'info';
        var showCancel = !!(options && options.showCancel);

        if (!root || !titleEl || !msgEl || !iconEl || !cancelBtn || !okBtn) {
            if (showCancel) resolve(confirm((options && options.message) || ''));
            else {
                alert((options && options.message) || '');
                resolve();
            }
            return;
        }

        tcAppDialogResolve = resolve;
        tcAppDialogIsConfirm = showCancel;

        titleEl.textContent = (options && options.title) || (showCancel ? '请确认' : '提示');
        var fullMessage = (options && options.message) || '';
        msgEl.textContent = fullMessage;
        tcAppDialogCopyText = fullMessage;
        if (variant === 'error' && !showCancel) {
            tcAppDialogIsCopyMode = true;
            msgEl.classList.add('tc-app-dialog-message--error-clamp');
        } else {
            tcAppDialogIsCopyMode = false;
            msgEl.classList.remove('tc-app-dialog-message--error-clamp');
        }
        if (hintEl) {
            var hint = options && options.hint;
            if (hint) {
                hintEl.textContent = hint;
                hintEl.classList.remove('hidden');
            } else {
                hintEl.textContent = '';
                hintEl.classList.add('hidden');
            }
        }

        iconEl.className = 'tc-app-dialog-icon';
        iconEl.classList.remove(
            'tc-app-dialog-icon--error',
            'tc-app-dialog-icon--warning',
            'tc-app-dialog-icon--success',
            'tc-app-dialog-icon--info'
        );
        if (variant === 'error') {
            iconEl.classList.add('tc-app-dialog-icon--error');
            iconEl.textContent = '!';
        } else if (variant === 'warning') {
            iconEl.classList.add('tc-app-dialog-icon--warning');
            iconEl.textContent = '!';
        } else if (variant === 'success') {
            iconEl.classList.add('tc-app-dialog-icon--success');
            iconEl.textContent = '✓';
        } else {
            iconEl.classList.add('tc-app-dialog-icon--info');
            iconEl.textContent = 'i';
        }

        if (showCancel) {
            cancelBtn.classList.remove('hidden');
            cancelBtn.textContent = (options && options.cancelText) || '取消';
            okBtn.textContent = (options && options.confirmText) || '确定';
        } else {
            cancelBtn.classList.add('hidden');
            if (variant === 'error') {
                okBtn.textContent = (options && options.confirmText) || '复制';
            } else {
                okBtn.textContent = (options && options.confirmText) || '知道了';
            }
        }

        root.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        tcEnsureModalTopLayer(root);

        tcAppDialogBackdropFn = function (e) {
            if (e.target === root || (e.target && e.target.classList && e.target.classList.contains('tc-app-dialog__scrim'))) {
                tcAppDialogClose(showCancel ? false : undefined);
            }
        };
        root.addEventListener('click', tcAppDialogBackdropFn);

        requestAnimationFrame(function () {
            if (okBtn && typeof okBtn.focus === 'function') okBtn.focus();
        });
    });
}

function tcAppAlert(message, opts) {
    opts = opts || {};
    return tcAppDialogOpen({
        message: message,
        title: opts.title || '提示',
        showCancel: false,
        variant: opts.variant || 'info',
        confirmText: opts.confirmText
    });
}

function tcAppConfirm(message, opts) {
    opts = opts || {};
    return tcAppDialogOpen({
        message: message,
        title: opts.title || '请确认',
        showCancel: true,
        variant: opts.variant || 'warning',
        confirmText: opts.confirmText,
        cancelText: opts.cancelText,
        hint: opts.hint
    });
}

var hfFloatToastTimer = null;
/** 统一渐变悬浮提示：placement top|bottom，variant warning|success|error|info，默认 2s 渐隐 */
function hfFloatToast(message, opts) {
    opts = opts || {};
    var wrap = document.getElementById('hf-float-toast');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'hf-float-toast';
        wrap.className = 'hf-float-toast hf-float-toast--top';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');
        var innerEl = document.createElement('div');
        innerEl.id = 'hf-float-toast-inner';
        innerEl.className = 'hf-float-toast__inner';
        wrap.appendChild(innerEl);
    }
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    var inner = document.getElementById('hf-float-toast-inner');
    if (!inner) return;
    if (hfFloatToastTimer) {
        clearTimeout(hfFloatToastTimer);
        hfFloatToastTimer = null;
    }
    var placement = opts.placement === 'bottom' ? 'bottom' : 'top';
    wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible', 'hf-float-toast--above-modal');
    wrap.classList.add(placement === 'bottom' ? 'hf-float-toast--bottom' : 'hf-float-toast--top');
    if (opts.aboveModal) wrap.classList.add('hf-float-toast--above-modal');
    inner.textContent = String(message != null ? message : '').trim();
    var tone = opts.variant || (placement === 'top' ? 'warning' : 'success');
    inner.className = 'hf-float-toast__inner hf-float-toast__inner--' + tone;
    wrap.classList.add('hf-float-toast--visible');
    var ms = typeof opts.duration === 'number' ? opts.duration : (placement === 'top' ? 2000 : 3200);
    hfFloatToastTimer = setTimeout(function() {
        wrap.classList.remove('hf-float-toast--visible');
        hfFloatToastTimer = null;
    }, ms);
}

function tcAppToast(message, opts) {
    opts = opts || {};
    hfFloatToast(message, {
        placement: 'bottom',
        variant: opts.variant || 'success',
        duration: typeof opts.duration === 'number' ? opts.duration : 3200
    });
}

function tcAppDialogCopyToClipboard(text) {
    var s = String(text != null ? text : '');
    if (!s) return Promise.reject(new Error('empty'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(s);
    }
    return new Promise(function(resolve, reject) {
        try {
            var ta = document.createElement('textarea');
            ta.value = s;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (ok) resolve();
            else reject(new Error('copy failed'));
        } catch (e) {
            reject(e);
        }
    });
}

(function tcAppDialogBindButtons() {
    var okBtn = document.getElementById('tc-app-dialog-confirm');
    var cancelBtn = document.getElementById('tc-app-dialog-cancel');
    if (okBtn) {
        okBtn.addEventListener('click', function () {
            if (tcAppDialogIsCopyMode && tcAppDialogCopyText) {
                tcAppDialogCopyToClipboard(tcAppDialogCopyText)
                    .then(function() {
                        tcAppToast('已复制完整报错到剪贴板', { variant: 'success', duration: 2400 });
                    })
                    .catch(function() {
                        tcAppToast('复制失败，请手动选择报错文字复制', { variant: 'warning', duration: 3200 });
                    })
                    .finally(function() { tcAppDialogClose(); });
                return;
            }
            tcAppDialogClose(true);
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', function () { tcAppDialogClose(false); });
})();

(function bindTcAppDialogGlobalKeys() {
    document.addEventListener('keydown', function (e) {
        if (!tcAppDialogIsOpen()) return;
        var showCancel = tcAppDialogIsConfirm;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            tcAppDialogClose(showCancel ? false : undefined);
            return;
        }
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        var tag = e.target && e.target.tagName;
        if (tag === 'TEXTAREA' && e.target.closest && e.target.closest('#tc-app-dialog')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (tcAppDialogIsCopyMode && tcAppDialogCopyText) {
            tcAppDialogCopyToClipboard(tcAppDialogCopyText)
                .then(function () {
                    tcAppToast('已复制完整报错到剪贴板', { variant: 'success', duration: 2400 });
                })
                .catch(function () {
                    tcAppToast('复制失败，请手动选择报错文字复制', { variant: 'warning', duration: 3200 });
                })
                .finally(function () { tcAppDialogClose(); });
            return;
        }
        tcAppDialogClose(showCancel ? true : undefined);
    }, true);
})();

