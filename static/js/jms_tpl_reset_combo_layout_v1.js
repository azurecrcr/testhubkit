(function (global) {
    'use strict';
    function ensureComboInSlot() {
        var wrap = global.document.getElementById('tpl-select-wrap');
        if (!wrap) return;
        var slot = wrap.querySelector('.lth-tpl-select-slot');
        var combo = wrap.querySelector('.lth-tpl-combobox');
        var sel = wrap.querySelector('#tpl-select');
        if (!slot || !combo) return;
        if (sel && sel.parentElement !== slot) slot.appendChild(sel);
        if (combo.parentElement !== slot) slot.appendChild(combo);
    }
    function schedule() {
        ensureComboInSlot();
        global.setTimeout(ensureComboInSlot, 0);
        global.setTimeout(ensureComboInSlot, 300);
    }
    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', schedule);
    } else {
        schedule();
    }
    global.JmsTplResetComboLayoutV1 = { ensure: ensureComboInSlot };
})(typeof window !== 'undefined' ? window : this);
