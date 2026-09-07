(function (global) {
    'use strict';

    var hfFloatToastTimer = null;

    /** 统一渐变悬浮提示：placement top|bottom，variant warning|success|error|info */
    function hfFloatToast(message, opts) {
        opts = opts || {};
        var wrap = document.getElementById('hf-float-toast');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'hf-float-toast';
            wrap.className = 'hf-float-toast hf-float-toast--top';
            wrap.setAttribute('role', 'status');
            wrap.setAttribute('aria-live', 'polite');
            wrap.setAttribute('aria-atomic', 'true');
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
        wrap.classList.remove('hf-float-toast--top', 'hf-float-toast--bottom', 'hf-float-toast--visible');
        wrap.classList.add(placement === 'bottom' ? 'hf-float-toast--bottom' : 'hf-float-toast--top');
        inner.textContent = String(message != null ? message : '').trim();
        var tone = opts.variant || (placement === 'top' ? 'warning' : 'success');
        inner.className = 'hf-float-toast__inner hf-float-toast__inner--' + tone;
        wrap.classList.add('hf-float-toast--visible');
        var ms = typeof opts.duration === 'number' ? opts.duration : (placement === 'top' ? 2000 : 3200);
        hfFloatToastTimer = setTimeout(function () {
            wrap.classList.remove('hf-float-toast--visible');
            hfFloatToastTimer = null;
        }, ms);
    }

    global.hfFloatToast = hfFloatToast;
})(typeof window !== 'undefined' ? window : this);
