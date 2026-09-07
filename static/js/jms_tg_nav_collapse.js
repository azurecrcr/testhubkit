/**
 * 压测造数 · 线程组左侧导航收起/展开（隔离模块，不影响其他页面）
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'lth-tg-tree-nav-collapsed';
    var syncTimer = null;
    var bound = false;

    function isActiveContext() {
        var doc = global.document;
        return doc.body
            && doc.body.classList.contains('lth-tg-view-tree')
            && doc.body.classList.contains('lth-hub-jmeter-tab');
    }

    function readStoredCollapsed() {
        try {
            return global.sessionStorage.getItem(STORAGE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function storeCollapsed(collapsed) {
        try {
            global.sessionStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch (e) { /* ignore */ }
    }

    var CHEVRON_LEFT = '<svg class="jms-tg-tree-nav__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M10 4 6 8l4 4"/>' +
        '</svg>';
    var CHEVRON_RIGHT = '<svg class="jms-tg-tree-nav__chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M6 4l4 4-4 4"/>' +
        '</svg>';

    function setCollapsed(workspace, collapsed) {
        if (!workspace) return;
        workspace.classList.toggle('is-nav-collapsed', !!collapsed);
        var collapseBtn = workspace.querySelector('.jms-tg-tree-nav__collapse-btn');
        var expandBtn = workspace.querySelector('.jms-tg-tree-nav__expand-btn');
        if (collapseBtn) {
            collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            collapseBtn.title = collapsed ? '展开线程组列表' : '收起线程组列表';
        }
        if (expandBtn) {
            expandBtn.hidden = !collapsed;
            expandBtn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
        }
        storeCollapsed(!!collapsed);
        if (global.JmsTgNavViewport && typeof global.JmsTgNavViewport.syncAll === 'function') {
            global.JmsTgNavViewport.syncAll();
        }
    }

    function ensureHeadRight(head) {
        var right = head.querySelector('.jms-tg-tree-nav__head-right');
        if (!right) {
            right = global.document.createElement('div');
            right.className = 'jms-tg-tree-nav__head-right';
            head.appendChild(right);
        }
        return right;
    }

    function ensureTitleGroup(head) {
        var title = head.querySelector('.jms-tg-tree-nav__title');
        if (!title) return null;
        var group = title.closest('.jms-tg-tree-nav__title-group');
        if (!group) {
            group = global.document.createElement('div');
            group.className = 'jms-tg-tree-nav__title-group';
            title.parentNode.insertBefore(group, title);
            group.appendChild(title);
            var addBtn = head.querySelector('.jms-tg-tree-nav__add-btn');
            if (addBtn && addBtn.parentElement !== group) group.appendChild(addBtn);
        }
        return group;
    }

    function ensureControls(workspace) {
        if (!workspace || workspace.dataset.jmsNavCollapseReady === '1') return;
        var nav = workspace.querySelector('.jms-tg-tree-nav');
        if (!nav) return;

        var head = nav.querySelector('.jms-tg-tree-nav__head');
        if (head && !head.querySelector('.jms-tg-tree-nav__collapse-btn')) {
            var collapseBtn = global.document.createElement('button');
            collapseBtn.type = 'button';
            collapseBtn.className = 'jms-tg-tree-nav__collapse-btn';
            collapseBtn.setAttribute('aria-label', '收起线程组列表');
            collapseBtn.setAttribute('aria-expanded', 'true');
            collapseBtn.title = '收起线程组列表';
            collapseBtn.innerHTML = CHEVRON_LEFT;
            var headRight = ensureHeadRight(head);
            headRight.appendChild(collapseBtn);
        }

        if (!workspace.querySelector('.jms-tg-tree-nav__expand-btn')) {
            var expandBtn = global.document.createElement('button');
            expandBtn.type = 'button';
            expandBtn.className = 'jms-tg-tree-nav__expand-btn';
            expandBtn.hidden = true;
            expandBtn.setAttribute('aria-label', '展开线程组列表');
            expandBtn.setAttribute('aria-expanded', 'false');
            expandBtn.title = '展开线程组列表';
            expandBtn.innerHTML = CHEVRON_RIGHT;
            workspace.insertBefore(expandBtn, workspace.firstChild);
        }

        workspace.dataset.jmsNavCollapseReady = '1';
        setCollapsed(workspace, workspace.classList.contains('is-nav-collapsed') || readStoredCollapsed());
    }

    function syncAll() {
        if (!isActiveContext()) return;
        global.document.querySelectorAll('.jms-tg-tree-workspace').forEach(function (workspace) {
            if (!workspace.querySelector('.jms-tg-tree-nav')) {
                workspace.dataset.jmsNavCollapseReady = '';
                return;
            }
            if (!workspace.querySelector('.jms-tg-tree-nav__collapse-btn')) {
                workspace.dataset.jmsNavCollapseReady = '';
            }
            if (workspace.dataset.jmsNavCollapseReady !== '1') {
                ensureControls(workspace);
            }
        });
    }

    function debouncedSync() {
        if (syncTimer) global.clearTimeout(syncTimer);
        syncTimer = global.setTimeout(function () {
            syncTimer = null;
            syncAll();
        }, 50);
    }

    function onClick(ev) {
        var collapseBtn = ev.target.closest('.jms-tg-tree-nav__collapse-btn');
        if (collapseBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var ws = collapseBtn.closest('.jms-tg-tree-workspace');
            setCollapsed(ws, true);
            return;
        }
        var expandBtn = ev.target.closest('.jms-tg-tree-nav__expand-btn');
        if (expandBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var ws2 = expandBtn.closest('.jms-tg-tree-workspace');
            setCollapsed(ws2, false);
        }
    }

    function bind() {
        if (bound) return;
        bound = true;
        global.document.addEventListener('click', onClick, true);
        var container = global.document.getElementById('jms-plans-container');
        if (container && global.MutationObserver) {
            var observer = new global.MutationObserver(debouncedSync);
            observer.observe(container, { childList: true, subtree: true });
        }
        debouncedSync();
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgNavCollapse = {
        syncAll: syncAll,
        setCollapsed: setCollapsed
    };
}(typeof window !== 'undefined' ? window : this));
