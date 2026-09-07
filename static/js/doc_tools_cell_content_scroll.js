/**
 * 文档工具 · 单元格内无滚动条纵向浏览（仅 doc-tools-page，与 tc-table 完全隔离）
 * 对齐 WPS：编辑态内容超出单元格时，滚轮在单元格内滚动，不显示滚动条。
 */
(function () {
    'use strict';

    if (!document.body.classList.contains('doc-tools-page')) return;

    var MOUNT_ID = 'dtk-vxe-table-mount';

    function getMount() {
        return document.getElementById(MOUNT_ID);
    }

    function getActiveEditColumn(mount, target) {
        if (!mount || !target || !target.closest) return null;
        var col = target.closest('.vxe-body--column.col--active');
        if (!col || !mount.contains(col)) return null;
        return col;
    }

    function getCellScrollEl(col) {
        if (!col) return null;
        return col.querySelector('textarea, .vxe-textarea--inner');
    }

    function canScrollVertically(el) {
        return el && el.scrollHeight > el.clientHeight + 1;
    }

    function shouldConsumeWheel(el, deltaY) {
        if (!canScrollVertically(el)) return false;
        if (deltaY < 0) return el.scrollTop > 0;
        if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
        return false;
    }

    function onWheelCapture(event) {
        var mount = getMount();
        if (!mount) return;
        var col = getActiveEditColumn(mount, event.target);
        if (!col) return;
        var scrollEl = getCellScrollEl(col);
        if (!scrollEl || !canScrollVertically(scrollEl)) return;
        if (!shouldConsumeWheel(scrollEl, event.deltaY)) return;
        event.preventDefault();
        event.stopPropagation();
    }

    function bindMount(mount) {
        if (!mount || mount.getAttribute('data-dtk-cell-scroll-v1') === '1') return;
        mount.setAttribute('data-dtk-cell-scroll-v1', '1');
        mount.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    }

    function boot() {
        bindMount(getMount());
        if (!getMount()) setTimeout(boot, 120);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
