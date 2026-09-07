/**
 * TestHub — 流式生成动画增强（独立模块，不影响现有功能）
 * 提供：表格行入场动画、思维导图渐进展开动画
 */
(function (global) {
    'use strict';

    var _tableHookInstalled = false;
    var _mmHookInstalled = false;

    // ===== 表格行入场动画 =====
    function installTableAnimationHook() {
        if (_tableHookInstalled) return;
        var origAppend = global.appendParsedRowsIncremental;
        if (!origAppend) {
            global.setTimeout(installTableAnimationHook, 500);
            return;
        }
        _tableHookInstalled = true;

        // 包装 appendParsedRowsIncremental，在行写入后添加动画类
        global.appendParsedRowsIncremental_v2 = function (rows, opts) {
            var result = origAppend(rows, opts);
            var added = result || 0;

            if (added > 0) {
                // 给新添加的行加上入场动画类
                var startIdx = (typeof global.testCasesData !== 'undefined' && global.testCasesData)
                    ? global.testCasesData.length - added : 0;

                // 针对原生表格
                var tableBody = document.getElementById('table-body');
                if (tableBody) {
                    var allRows = tableBody.querySelectorAll('tr');
                    for (var i = Math.max(0, startIdx); i < Math.min(startIdx + added, allRows.length); i++) {
                        var row = allRows[i];
                        row.classList.add('tc-row-streaming-entering');
                        row.addEventListener('animationend', function () {
                            this.classList.remove('tc-row-streaming-entering');
                        }, { once: true });
                    }
                }

                // 针对 VxeTable
                var vxeMount = document.getElementById('tc-vxe-table-mount');
                if (vxeMount) {
                    global.setTimeout(function () {
                        var vxeRows = vxeMount.querySelectorAll('.vxe-body--row');
                        for (var j = Math.max(0, startIdx); j < Math.min(startIdx + added, vxeRows.length); j++) {
                            var vxeRow = vxeRows[j];
                            vxeRow.classList.add('tc-row-streaming-entering');
                            vxeRow.addEventListener('animationend', function () {
                                this.classList.remove('tc-row-streaming-entering');
                            }, { once: true });
                        }
                    }, 50);
                }
            }

            return result;
        };
    }

    // ===== 思维导图渐进展开 =====
    function installMindmapAnimationHook() {
        if (_mmHookInstalled) return;
        var origMmAppend = global.appendMindmapRowsIncremental;
        if (!origMmAppend) {
            global.setTimeout(installMindmapAnimationHook, 500);
            return;
        }
        _mmHookInstalled = true;

        // 包装 appendMindmapRowsIncremental
        global.appendMindmapRowsIncremental_v2 = function (rows, opts) {
            var result = origMmAppend(rows, opts);

            if (result > 0 && global.tcMindmapInstance && global.tcMindmapInstance.mind) {
                // 标记新节点用于动画
                global.setTimeout(function () {
                    try {
                        var container = document.getElementById('tc-smm-container');
                        if (container) {
                            var nodes = container.querySelectorAll('.smm-node');
                            var totalNodes = nodes.length;
                            var newStart = Math.max(0, totalNodes - result * 3);
                            for (var i = newStart; i < totalNodes; i++) {
                                if (nodes[i]) {
                                    nodes[i].classList.add('tc-mindmap-progressive-node');
                                    nodes[i].addEventListener('animationend', function () {
                                        this.classList.remove('tc-mindmap-progressive-node');
                                    }, { once: true });
                                }
                            }
                        }
                    } catch (e) { /* ignore */ }
                }, 80);
            }

            return result;
        };
    }

    // ===== 初始化 =====
    function init() {
        installTableAnimationHook();
        installMindmapAnimationHook();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            global.setTimeout(init, 800);
        });
    } else {
        global.setTimeout(init, 800);
    }

})(typeof window !== 'undefined' ? window : this);
