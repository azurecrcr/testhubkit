/**
 * 树节点生成按钮注入器
 * 在每个需求页的刷新按钮旁边添加"生成"按钮
 * （不修改 dist 文件，通过 MutationObserver 注入）
 */
(function () {
    'use strict';

    // SVG 图标：闪电/生成
    var GEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>';

    function createGenButton(nodeId, nodeName) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tc-lanhu-tree-node__gen';
        btn.setAttribute('data-tree-gen', nodeId);
        btn.title = '生成测试用例：' + (nodeName || '');
        btn.setAttribute('aria-label', '生成测试用例');
        btn.innerHTML = GEN_SVG;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (typeof window.openTcPageGenModal === 'function') {
                window.openTcPageGenModal(nodeId, nodeName);
            }
        });
        return btn;
    }

    function injectGenButton(row) {
        // 检查是否已经注入过
        if (row.querySelector('.tc-lanhu-tree-node__gen')) return;

        var refreshBtn = row.querySelector('.tc-lanhu-tree-node__refresh');
        var nodeId = row.getAttribute('data-tree-select');
        var label = row.querySelector('.tc-lanhu-tree-node__label');
        var nodeName = label ? label.textContent.trim() : '';

        if (!nodeId || !refreshBtn) return;

        var genBtn = createGenButton(nodeId, nodeName);
        refreshBtn.parentNode.insertBefore(genBtn, refreshBtn);
    }

    function scanAndInject() {
        var rows = document.querySelectorAll('.tc-lanhu-tree-node__row[data-tree-select]');
        for (var i = 0; i < rows.length; i++) {
            injectGenButton(rows[i]);
        }
    }

    // 监听树挂载区域
    function startObserver() {
        var mount = document.querySelector('.tc-lanhu-tree-mount');
        if (!mount) {
            // 重试
            setTimeout(startObserver, 500);
            return;
        }

        // 初始扫描
        scanAndInject();

        // MutationObserver 监听新增节点
        var observer = new MutationObserver(function () {
            scanAndInject();
        });
        observer.observe(mount, { childList: true, subtree: true });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }
})();
