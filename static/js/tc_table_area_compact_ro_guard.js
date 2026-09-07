/**
 * 须在 tc-workbench bundle 之前加载：忽略对 .tc-workbench-scope 的 ResizeObserver，
 * 避免设置 --tc-wb-grid-h 后触发 scope 尺寸回调形成闪烁环。
 */
(function tcTableAreaCompactRoGuard() {
    'use strict';
    if (typeof ResizeObserver === 'undefined' || window._tcTableAreaCompactRoGuard) return;
    window._tcTableAreaCompactRoGuard = true;

    var Orig = window.ResizeObserver;
    window.ResizeObserver = function (callback) {
        return new Orig(function (entries, observer) {
            var filtered = [];
            for (var i = 0; i < entries.length; i++) {
                var target = entries[i].target;
                if (target && target.classList && target.classList.contains('tc-workbench-scope')) continue;
                filtered.push(entries[i]);
            }
            if (filtered.length) callback(filtered, observer);
        });
    };
    window.ResizeObserver.prototype = Orig.prototype;
})();
