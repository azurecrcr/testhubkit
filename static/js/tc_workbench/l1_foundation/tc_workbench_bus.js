/**
 * TC Workbench EventBus — decouple features without breaking window.* compat.
 */
(function (global) {
    'use strict';
    var listeners = {};

    function on(event, fn) {
        event = String(event || '');
        if (!event || typeof fn !== 'function') return function () {};
        (listeners[event] = listeners[event] || []).push(fn);
        return function () { off(event, fn); };
    }

    function off(event, fn) {
        event = String(event || '');
        var arr = listeners[event];
        if (!arr) return;
        listeners[event] = arr.filter(function (x) { return x !== fn; });
    }

    function emit(event, detail) {
        event = String(event || '');
        var arr = (listeners[event] || []).slice();
        arr.forEach(function (fn) {
            try { fn(detail || {}); } catch (e) { console.error('[TcWorkbenchBus]', event, e); }
        });
    }

    global.TcWorkbenchBus = { on: on, off: off, emit: emit };
})(typeof window !== 'undefined' ? window : this);
