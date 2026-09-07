/**
 * TestHub TC Workbench — 蓝湖需求文档树（左侧栏，独立于生成浮层蓝湖逻辑）
 */
(function tcLanhuDocTreeModule() {
    'use strict';

    var STORAGE_KEY = 'tc_lanhu_doc_tree_meta_v1';
    var LOGOUT_TREE_CLEAR_FLAG = 'tc_logout_pending_tree_clear_v1';
    var state = {
        tree: null,
        docName: '',
        docId: '',
        focusPageId: '',
        expanded: {},
        selectedId: '',
        loading: false,
        collapsedRail: false,
        pageCache: {},
        lanhuBaseUrl: ''
    };

    function $(id) { return document.getElementById(id); }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getMainCookieEl() { return $('lanhu-cookie'); }
    function getMainUrlEl() { return $('lanhu-url'); }


    function stripLanhuBaseUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        return url
            .replace(/([?&])pageId=[^&]*/gi, '$1')
            .replace(/([?&])page_id=[^&]*/gi, '$1')
            .replace(/[?&]$/, '')
            .replace(/\?&/, '?');
    }

    function syncToMainLanhuFields(cookie, url) {
        var cookieEl = getMainCookieEl();
        var urlEl = getMainUrlEl();
        if (cookieEl && cookie) cookieEl.value = cookie;
        if (urlEl && url) urlEl.value = url;
        if (url) state.lanhuBaseUrl = stripLanhuBaseUrl(url);
        if (typeof autoGrowTcPresetLanhuField === 'function') {
            autoGrowTcPresetLanhuField(cookieEl);
            autoGrowTcPresetLanhuField(urlEl);
        }
    }

    function readStoredMeta() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function persistMeta() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                docName: state.docName,
                docId: state.docId,
                focusPageId: state.focusPageId,
                tree: state.tree,
                expanded: state.expanded,
                selectedId: state.selectedId,
                pageCache: state.pageCache,
                lanhuBaseUrl: state.lanhuBaseUrl || stripLanhuBaseUrl((getMainUrlEl() || {}).value || '')
            }));
        } catch (e) { /* ignore */ }
    }

    function setStatus(text, kind) {
        var el = $('tc-lanhu-tree-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('tc-lanhu-tree-status--error', 'tc-lanhu-tree-status--ok', 'tc-lanhu-tree-status--loading');
        if (kind) el.classList.add('tc-lanhu-tree-status--' + kind);
    }
    var INVALID_LANHU_URL_MSG = (window.TcLanhuDocUrlValidator && window.TcLanhuDocUrlValidator.message) || '文档 URL 须以 https://lanhuapp.com 开头';

    function isValidLanhuDocUrl(url) {
        if (window.TcLanhuDocUrlValidator && typeof window.TcLanhuDocUrlValidator.isValid === 'function') {
            return window.TcLanhuDocUrlValidator.isValid(url);
        }
        return /^https:\/\/lanhuapp\.com/i.test(String(url || '').trim());
    }

    function showInvalidLanhuUrlTreeView(opts) {
        opts = opts || {};
        state.tree = null;
        state.docId = '';
        if (!opts.keepDocName) state.docName = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        setStatus('', '');
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(true);
        }
        var mount = $('tc-lanhu-tree-mount');
        if (mount) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty tc-lanhu-tree-empty--invalid">' +
                '<p class="tc-lanhu-tree-empty__title">' + escapeHtml(INVALID_LANHU_URL_MSG) + '</p>' +
                '<p class="tc-lanhu-tree-empty__desc">请为该文档填写正确的蓝湖文档链接后重新连接</p>' +
                '<button type="button" class="tc-lanhu-tree-empty__btn" data-tc-lanhu-tree-connect>连接蓝湖</button>' +
            '</div>';
        }
        var rail = $('tc-lanhu-doc-tree-rail');
        if (rail) {
            rail.classList.remove('tc-lanhu-doc-tree-rail--has-data');
            rail.classList.toggle('tc-lanhu-doc-tree-rail--collapsed', !!state.collapsedRail);
        }
        if (typeof window.scheduleTcLanhuTreeFillHeight === 'function') {
            window.scheduleTcLanhuTreeFillHeight();
        }
    }



    function countPages(nodes) {
        var n = 0;
        (nodes || []).forEach(function (node) {
            if (node.type === 'page') n += 1;
            n += countPages(node.children);
        });
        return n;
    }

    function defaultExpandTree(nodes, depth, acc) {
        acc = acc || {};
        (nodes || []).forEach(function (node) {
            if (depth < 2) acc[node.id] = true;
            if (node.children && node.children.length) {
                defaultExpandTree(node.children, depth + 1, acc);
            }
        });
        return acc;
    }

    function filterTree(nodes, query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return nodes;
        var out = [];
        (nodes || []).forEach(function (node) {
            var name = String(node.name || '').toLowerCase();
            var childFiltered = filterTree(node.children, q);
            if (name.indexOf(q) >= 0 || childFiltered.length) {
                out.push(Object.assign({}, node, { children: childFiltered }));
            }
        });
        return out;
    }

    function findPageNodeName(pageId) {
        var found = '';
        function walk(nodes) {
            (nodes || []).forEach(function (node) {
                if (found) return;
                if (node.type === 'page' && node.id === pageId) {
                    found = node.name || '';
                    return;
                }
                walk(node.children);
            });
        }
        walk(state.tree);
        return found;
    }

    function findPageNodePath(pageId) {
        pageId = String(pageId || '').trim();
        if (!pageId || !state.tree) return '';
        var found = null;
        function walk(nodes, trail) {
            (nodes || []).forEach(function (node) {
                if (found || !node) return;
                var name = String(node.name || '').trim();
                var nextTrail = trail.slice();
                if (name) nextTrail.push(name);
                if (node.type === 'page' && node.id === pageId) {
                    found = nextTrail;
                    return;
                }
                walk(node.children, nextTrail);
            });
        }
        walk(state.tree, []);
        return found && found.length ? found.join('/') : '';
    }

    function getPageCharsDisplay(pageId) {
        var entry = state.pageCache[pageId];
        if (!entry) {
            return {
                text: '',
                cls: 'tc-lanhu-tree-node__chars',
                title: ''
            };
        }
        if (entry.loading) {
            return {
                text: '',
                cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--loading',
                title: '获取中…'
            };
        }
        if (entry.error) {
            return {
                text: String(entry.error).slice(0, 30),
                cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--error',
                title: String(entry.error)
            };
        }
        var ch = parseInt(entry.chars, 10);
        if (isNaN(ch) || ch < 0) ch = 0;
        var label = ch >= 1000 ? (ch / 1000).toFixed(1) + 'k' : (ch + '字');
        return {
            text: label,
            cls: 'tc-lanhu-tree-node__chars tc-lanhu-tree-node__chars--ok',
            title: '共 ' + ch + ' 字'
        };
    }

    function mergePageCacheItems(items) {
        (items || []).forEach(function (item) {
            var pid = item.page_id;
            if (!pid) return;
            state.pageCache[pid] = {
                chars: parseInt(item.content_chars, 10) || 0,
                text: item.content_text || '',
                error: null
            };
        });
    }

    function loadPageCacheFromServer() {
        if (!state.docId) return Promise.resolve();
        return fetch('/api/lanhu-page-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ doc_id: state.docId })
        })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.items && data.items.length) {
                    mergePageCacheItems(data.items);
                    persistMeta();
                    renderTree();
                }
            })
            .catch(function () { /* ignore */ });
    }


    function getPageCaseStatus(pageId) {
        if (!window.TcLanhuTreeCaseStatus || !state.docId || !pageId) return null;
        return window.TcLanhuTreeCaseStatus.getPageStatus(state.docId, pageId);
    }

    var _lanhuCaseStatusLoadPromise = null;
    var _lanhuCaseStatusLoadedDocId = '';

    function resetLanhuTreeCaseStatusCache() {
        _lanhuCaseStatusLoadPromise = null;
        _lanhuCaseStatusLoadedDocId = '';
    }

    function ensureLanhuTreeCaseStatusReady() {
        if (!window.TcLanhuTreeCaseStatus || !state.docId) return Promise.resolve(false);
        if (_lanhuCaseStatusLoadedDocId === state.docId) return Promise.resolve(true);
        if (_lanhuCaseStatusLoadPromise) return _lanhuCaseStatusLoadPromise;
        _lanhuCaseStatusLoadPromise = window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
            .then(function (ok) {
                if (ok) _lanhuCaseStatusLoadedDocId = state.docId;
                return ok;
            })
            .finally(function () {
                _lanhuCaseStatusLoadPromise = null;
            });
        return _lanhuCaseStatusLoadPromise;
    }

    /** 左侧树切换：判断目标需求页是否已有用例（多信号，避免 case 缓存未就绪时误判） */
    function lanhuTreeTargetPageHasDesignedCases(pageId, selectRowEl) {
        pageId = String(pageId || '').trim();
        if (!pageId) return false;
        if (getPageCaseStatus(pageId)) return true;
        if (window.TcLanhuTreeCaseStatus && state.docId &&
            typeof window.TcLanhuTreeCaseStatus.pageHasCases === 'function' &&
            window.TcLanhuTreeCaseStatus.pageHasCases(state.docId, pageId)) {
            return true;
        }
        if (selectRowEl) {
            var li = selectRowEl.closest('li[data-tree-type]');
            if (li && li.classList.contains('tc-lanhu-tree-node--designed')) return true;
        }
        return false;
    }

    function countFolderDesigned(nodes) {
        var designed = 0;
        var total = 0;
        function walk(list) {
            (list || []).forEach(function (node) {
                if (!node) return;
                if (node.type === 'page') {
                    total += 1;
                    if (getPageCaseStatus(node.id)) designed += 1;
                    return;
                }
                walk(node.children);
            });
        }
        walk(nodes);
        return { designed: designed, total: total };
    }

    function buildPageCaseBadgeHtml() { return ''; }

    function buildFolderCaseBadgeHtml() { return ''; }

    function renderTreeNodes(nodes, depth) {
        depth = depth || 0;
        if (!nodes || !nodes.length) return '';
        return nodes.map(function (node) {
            var hasChildren = node.children && node.children.length;
            var isExpanded = !!state.expanded[node.id];
            var isSelected = state.selectedId === node.id;
            var isPage = node.type === 'page';
            var caseStatus = isPage ? getPageCaseStatus(node.id) : null;
            var rowCls = [
                'tc-lanhu-tree-node',
                isPage ? 'tc-lanhu-tree-node--page' : 'tc-lanhu-tree-node--folder',
                isSelected ? 'tc-lanhu-tree-node--selected' : '',
                hasChildren && isExpanded ? 'tc-lanhu-tree-node--expanded' : '',
                caseStatus ? 'tc-lanhu-tree-node--designed' : ''
            ].filter(Boolean).join(' ');
            var toggleBtn = hasChildren
                ? '<button type="button" class="tc-lanhu-tree-node__toggle" data-tree-toggle="' + escapeHtml(node.id) + '" aria-label="' + (isExpanded ? '收起' : '展开') + '">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
                  '</button>'
                : '<span class="tc-lanhu-tree-node__toggle tc-lanhu-tree-node__toggle--spacer" aria-hidden="true"></span>';
            var icon = isPage
                ? '<span class="tc-lanhu-tree-node__icon tc-lanhu-tree-node__icon--page" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6M7 4h7l5 5v11a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg></span>'
                : '<span class="tc-lanhu-tree-node__icon tc-lanhu-tree-node__icon--folder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></span>';
            var childrenHtml = hasChildren && isExpanded
                ? '<ul class="tc-lanhu-tree-node__children" role="group">' + renderTreeNodes(node.children, depth + 1) + '</ul>'
                : '';
            var charsDisplay = isPage ? getPageCharsDisplay(node.id) : null;
            var charsHtml = isPage
                ? '<button type="button" class="tc-lanhu-tree-node__refresh" data-tree-refresh="' + escapeHtml(node.id) + '" title="获取页面需求" aria-label="获取页面需求">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66"/></svg></button>' +
                    '<span class="' + charsDisplay.cls + '" data-tree-chars="' + escapeHtml(node.id) + '" title="' + escapeHtml(charsDisplay.title) + '" aria-live="polite">' + escapeHtml(charsDisplay.text) + '</span>'
                : '';
            return '<li class="' + rowCls + '" data-tree-id="' + escapeHtml(node.id) + '" data-tree-type="' + escapeHtml(node.type) + '" style="--tc-tree-depth:' + depth + '">' +
                '<div class="tc-lanhu-tree-node__row" data-tree-select="' + escapeHtml(node.id) + '">' +
                    toggleBtn + icon +
                    (isPage
                        ? ('<span class="tc-lanhu-tree-node__label" title="' + escapeHtml(node.name) + '">' +
                            '<span class="tc-lanhu-tree-node__label-text">' + escapeHtml(node.name) + '</span>' +
                            (caseStatus ? '<span class="tc-lanhu-tree-node__case-dot" aria-hidden="true" title="已设计用例"></span>' : '') +
                            '</span>')
                        : ('<span class="tc-lanhu-tree-node__label" title="' + escapeHtml(node.name) + '">' + escapeHtml(node.name) + '</span>')) +
                    charsHtml +
                '</div>' +
                childrenHtml +
            '</li>';
        }).join('');
    }

    var TC_LANHU_RAIL_ICON_COLLAPSE = 'M15 19l-7-7 7-7';
    var TC_LANHU_RAIL_ICON_EXPAND = 'M9 5l7 7-7 7';

    function syncRailCollapseChrome() {
        var rail = $('tc-lanhu-doc-tree-rail');
        var collapseBtn = $('tc-lanhu-tree-rail-collapse');
        if (!rail || !collapseBtn) return;
        var collapsed = !!state.collapsedRail;
        var path = collapseBtn.querySelector('svg path');
        if (path) path.setAttribute('d', collapsed ? TC_LANHU_RAIL_ICON_EXPAND : TC_LANHU_RAIL_ICON_COLLAPSE);
        collapseBtn.title = collapsed ? '展开需求树' : '收起需求树';
        collapseBtn.setAttribute('aria-label', collapsed ? '展开需求树' : '收起需求树');
        collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function renderTree() {
        var mount = $('tc-lanhu-tree-mount');
        var titleEl = $('tc-lanhu-tree-doc-title');
        var countEl = $('tc-lanhu-tree-page-count');
        var rail = $('tc-lanhu-doc-tree-rail');
        if (!mount) return;

        var docTitleText = state.docName || '蓝湖需求';
        var docSubtitleText = '';
        if (titleEl) {
            titleEl.textContent = docTitleText;
            titleEl.setAttribute('title', docTitleText);
        }
        if (countEl) {
            var cnt = state.tree ? countPages(state.tree) : 0;
            if (cnt && window.TcLanhuTreeCaseStatus && state.docId) {
                var summary = window.TcLanhuTreeCaseStatus.getSummary(state.docId);
                if (summary.designed > 0) {
                    docSubtitleText = summary.designed + ' / ' + cnt + ' 页已设计';
                    countEl.textContent = docSubtitleText;
                    countEl.setAttribute('title', docSubtitleText);
                    countEl.classList.add('tc-lanhu-tree-rail__subtitle--progress');
                } else {
                    docSubtitleText = cnt + ' 个页面';
                    countEl.textContent = docSubtitleText;
                    countEl.setAttribute('title', docSubtitleText);
                    countEl.classList.remove('tc-lanhu-tree-rail__subtitle--progress');
                }
            } else {
                docSubtitleText = cnt ? cnt + ' 个页面' : '';
                countEl.textContent = docSubtitleText;
                if (docSubtitleText) countEl.setAttribute('title', docSubtitleText);
                else countEl.removeAttribute('title');
                countEl.classList.remove('tc-lanhu-tree-rail__subtitle--progress');
            }
        }
        if (titleEl) {
            var titleWrap = titleEl.closest ? titleEl.closest('.tc-lanhu-tree-rail__titles') : null;
            if (titleWrap) {
                titleWrap.removeAttribute('data-lanhu-title-tip');
                titleWrap.setAttribute('aria-label', docTitleText + (docSubtitleText ? '，' + docSubtitleText : ''));
            }
        }
        if (rail) {
            rail.classList.toggle('tc-lanhu-doc-tree-rail--has-data', !!(state.tree && state.tree.length));
            rail.classList.toggle('tc-lanhu-doc-tree-rail--collapsed', !!state.collapsedRail);
        }
        syncRailCollapseChrome();
        if (typeof window.scheduleTcLanhuTreeFillHeight === 'function') {
            window.scheduleTcLanhuTreeFillHeight();
        }

        var query = ($('tc-lanhu-tree-search') || {}).value || '';
        var nodes = filterTree(state.tree, query);
        if (!state.tree || !state.tree.length) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty">' +
                '<div class="tc-lanhu-tree-empty__icon" aria-hidden="true">🌲</div>' +
                '<p class="tc-lanhu-tree-empty__title">尚未连接蓝湖文档</p>' +
                '<p class="tc-lanhu-tree-empty__desc">配置 Cookie 与文档 URL 后，将在此展示完整页面需求树</p>' +
                '<button type="button" class="tc-lanhu-tree-empty__btn" data-tc-lanhu-tree-connect>连接蓝湖</button>' +
            '</div>';
            return;
        }
        if (!nodes.length) {
            mount.innerHTML = '<div class="tc-lanhu-tree-empty tc-lanhu-tree-empty--filter">' +
                '<p class="tc-lanhu-tree-empty__title">无匹配页面</p>' +
                '<p class="tc-lanhu-tree-empty__desc">尝试调整搜索关键词</p>' +
            '</div>';
            return;
        }
        mount.innerHTML = '<ul class="tc-lanhu-tree-root" role="tree">' + renderTreeNodes(nodes, 0) + '</ul>';
    }

    function openConnectModal() {
        if (typeof window.isTcLanhuTreeHeadActionsBlocked === 'function' && window.isTcLanhuTreeHeadActionsBlocked()) {
            if (typeof window.toastTcLanhuTreeHeadActionsBlocked === 'function') window.toastTcLanhuTreeHeadActionsBlocked();
            return;
        }
        if (typeof window.openTcConnectModal === 'function') {
            window.openTcConnectModal();
            return;
        }
        if (typeof window.ensureTcLanhuAuthOrPrompt === 'function') {
            window.ensureTcLanhuAuthOrPrompt().then(function (ok) {
                if (!ok) return;
                openConnectModalFallback();
            });
            return;
        }
        openConnectModalFallback();
    }

    function openConnectModalFallback() {
        var modal = $('tc-lanhu-tree-connect-modal');
        if (!modal) return;
        var cookieInput = $('tc-lanhu-tree-cookie');
        var urlInput = $('tc-lanhu-tree-url');
        var mainCookie = getMainCookieEl();
        var mainUrl = getMainUrlEl();
        if (cookieInput && mainCookie) cookieInput.value = mainCookie.value || '';
        if (urlInput && mainUrl) urlInput.value = mainUrl.value || '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.body.style.overflow = 'hidden';
        if (cookieInput) cookieInput.focus();
    }

    function closeConnectModal(opts) {
        if (typeof window.closeTcConnectModal === 'function') {
            window.closeTcConnectModal(opts);
            return;
        }
        var modal = $('tc-lanhu-tree-connect-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function fetchLanhuTree(cookie, url) {
        return fetch('/api/lanhu-sitemap-tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lanhu_cookie: cookie, lanhu_url: url })
        }).then(function (res) { return res.json(); });
    }

    function applyTreeResult(payload, opts) {
        opts = opts || {};
        var nextDocId = payload.doc_id || '';
        var docChanged = !!(nextDocId && state.docId && nextDocId !== state.docId);
        if (docChanged) {
            state.pageCache = {};
            resetLanhuTreeCaseStatusCache();
        }
        if (nextDocId) state.docId = nextDocId;
        state.tree = payload.tree || [];
        state.docName = opts.docName || payload.doc_name || '蓝湖需求';
        state.focusPageId = payload.focus_page_id || '';
        state.expanded = defaultExpandTree(state.tree, 0, state.expanded || {});
        var baseUrl = opts.lanhuBaseUrl || state.lanhuBaseUrl || '';
        if (!baseUrl) {
            var mainUrlEl = getMainUrlEl();
            baseUrl = mainUrlEl ? stripLanhuBaseUrl(String(mainUrlEl.value || '').trim()) : '';
        }
        if (baseUrl) state.lanhuBaseUrl = baseUrl;
        var prevSelected = docChanged ? '' : (state.selectedId || '');
        if (state.focusPageId) {
            state.selectedId = state.focusPageId;
        } else if (prevSelected && isPageNodeId(prevSelected)) {
            state.selectedId = prevSelected;
        } else if (state.docId && window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.readLastPage === 'function') {
            var remembered = window.TcRequirementCaseStore.readLastPage(state.docId);
            if (remembered && isPageNodeId(remembered)) state.selectedId = remembered;
        } else {
            state.selectedId = '';
        }
        persistMeta();
        renderTree();
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }
        setStatus('已加载 ' + (payload.page_count || countPages(state.tree)) + ' 个页面', 'ok');
        loadPageCacheFromServer().finally(function () {
            var loadCases = window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.loadForDoc === 'function' &&
                state.docId
                ? window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
                : Promise.resolve(false);
            loadCases.finally(function () {
                hydrateRequirementCasesForSelection(state.selectedId);
            });
        });
    }

    /**
     * 仅用于「连接蓝湖文档」确认：优先用户填写名，未填再用蓝湖返回名。
     * 独立方法，避免改动 applyTreeResult / saveCurrentAsDoc 等共用逻辑。
     */
    function resolveConnectDocNamePreferUser(userDocName, lanhuDocName) {
        var userName = String(userDocName || '').trim();
        if (userName) return userName;
        var lanhuName = String(lanhuDocName || '').trim();
        if (lanhuName) return lanhuName;
        return '蓝湖需求';
    }

    function confirmConnect() {
        var cookieInput = $('tc-lanhu-tree-cookie');
        var urlInput = $('tc-lanhu-tree-url');
        var docNameInput = $('tc-lanhu-connect-doc-name');
        var cookie = cookieInput ? String(cookieInput.value || '').trim() : '';
        var url = urlInput ? String(urlInput.value || '').trim() : '';
        var userDocName = docNameInput ? String(docNameInput.value || '').trim() : '';
        if (!cookie) {
            setStatus('请填写蓝湖 Cookie', 'error');
            if (typeof tcAppToast === 'function') tcAppToast('请填写蓝湖 Cookie', { variant: 'warning' });
            return;
        }
        if (!url) {
            setStatus('请填写蓝湖文档 URL', 'error');
            if (typeof tcAppToast === 'function') tcAppToast('请填写蓝湖文档 URL', { variant: 'warning' });
            return;
        }
        if (!isValidLanhuDocUrl(url)) {
            showInvalidLanhuUrlTreeView({ keepDocName: true });
            return;
        }
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }
        syncToMainLanhuFields(cookie, url);
        state.loading = true;
        setStatus('正在拉取文档页面树…', 'loading');
        var confirmBtn = $('tc-lanhu-tree-connect-confirm');
        if (confirmBtn) confirmBtn.disabled = true;
        fetchLanhuTree(cookie, url)
            .then(function (data) {
                if (data.error) throw new Error(data.error);
                if (!data.tree || !data.tree.length) throw new Error('文档树为空');
                var resolvedDocName = resolveConnectDocNamePreferUser(userDocName, data && data.doc_name);
                applyTreeResult(data, { lanhuBaseUrl: stripLanhuBaseUrl(url) || url, docName: resolvedDocName });
                if (typeof window.setTcLanhuConnectDocName === 'function') window.setTcLanhuConnectDocName(resolvedDocName);
                if (typeof window.captureTcConnectModalSnapshot === 'function') {
                    window.captureTcConnectModalSnapshot();
                }
                closeConnectModal({ skipRestore: true });
                if (typeof tcAppToast === 'function') {
                    tcAppToast('蓝湖需求树已加载', { variant: 'success', duration: 2200 });
                }
            })
            .catch(function (err) {
                var msg = (err && err.message) ? err.message : '拉取失败';
                setStatus(msg, 'error');
                if (typeof tcAppToast === 'function') tcAppToast(msg, { variant: 'error', duration: 3600 });
            })
            .finally(function () {
                state.loading = false;
                if (confirmBtn) confirmBtn.disabled = false;
            });
    }

    function clearTcLanhuDocTreeView() {

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }
        state.tree = null;
        state.docName = '';
        state.docId = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        resetLanhuTreeCaseStatusCache();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        syncToMainLanhuFields('', '');
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        if (tc) tc.value = '';
        if (tu) tu.value = '';
        setStatus('', '');
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }
        renderTree();
    }

    function refreshTreeFromMainFields() {
        var cookieEl = getMainCookieEl();
        var urlEl = getMainUrlEl();
        var cookie = cookieEl ? String(cookieEl.value || '').trim() : '';
        var url = urlEl ? String(urlEl.value || '').trim() : '';
        if (!cookie || !url) {
            if (typeof tcAppToast === 'function') tcAppToast('请先在连接面板填写 Cookie 与 URL', { variant: 'info' });
            openConnectModal();
            return;
        }

        if (typeof window.TcRequirementCaseStore !== 'undefined' &&
            typeof window.TcRequirementCaseStore.persistActivePageBeforeLeave === 'function') {
            window.TcRequirementCaseStore.persistActivePageBeforeLeave('manual_edit', { force: true, allowEmpty: true });
        }

        if (!isValidLanhuDocUrl(url)) {
            showInvalidLanhuUrlTreeView({ keepDocName: true });
            return;
        }
        if (typeof window.setTcInvalidLanhuDocWorkbenchLock === 'function') {
            window.setTcInvalidLanhuDocWorkbenchLock(false);
        }

        state.loading = true;
        setStatus('刷新中…', 'loading');
        var baseUrl = stripLanhuBaseUrl(url) || url;
        syncToMainLanhuFields(cookie, baseUrl);
        fetchLanhuTree(cookie, baseUrl)
            .then(function (data) {
                if (data.error) throw new Error(data.error);
                applyTreeResult(data, { lanhuBaseUrl: baseUrl });
            })
            .catch(function (err) {
                var msg = (err && err.message) || '刷新失败';
                if (msg.indexOf('lanhuapp.com') >= 0 || msg.indexOf('https://lanhuapp.com') >= 0) {
                    showInvalidLanhuUrlTreeView({ keepDocName: true });
                    return;
                }
                setStatus(msg, 'error');
            })
            .finally(function () { state.loading = false; });
    }


    function extractDocIdFromLanhuUrl(url) {
        url = String(url || '').trim();
        if (!url) return '';
        var m = url.match(/[?&](?:docId|image_id)=([^&]+)/i);
        return m ? decodeURIComponent(m[1]) : '';
    }

    function resolveLanhuCredsForTree() {
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        var cookie = tc ? String(tc.value || '').trim() : '';
        var url = '';
        if (state.tree && state.tree.length && state.lanhuBaseUrl) {
            url = state.lanhuBaseUrl;
        } else if (tu && String(tu.value || '').trim()) {
            url = String(tu.value || '').trim();
        } else {
            var urlEl = getMainUrlEl();
            url = urlEl ? String(urlEl.value || '').trim() : '';
        }
        if (!cookie) {
            var cookieEl = getMainCookieEl();
            cookie = cookieEl ? String(cookieEl.value || '').trim() : '';
        }
        url = stripLanhuBaseUrl(url) || url;
        if (state.docId && url) {
            var urlDocId = extractDocIdFromLanhuUrl(url);
            if (urlDocId && urlDocId !== state.docId) {
                if (typeof window.getTcLanhuSavedDocUrlForTreeDocId === 'function') {
                    var saved = window.getTcLanhuSavedDocUrlForTreeDocId(state.docId);
                    if (saved) url = stripLanhuBaseUrl(saved) || saved;
                }
            }
        }
        return { cookie: cookie, url: url };
    }

    function buildTcLanhuPageUrl(baseUrl, pageId) {
        if (!baseUrl || !pageId) return baseUrl || '';
        var url = String(baseUrl).trim();
        if (/[?&]pageId=/.test(url)) {
            return url.replace(/([?&]pageId=)[^&]*/, '$1' + encodeURIComponent(pageId));
        }
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'pageId=' + encodeURIComponent(pageId);
    }

    function fetchPageContent(pageId, pageName) {
        if (!findPageNode(pageId)) {
            var missingMsg = '当前文档树中未找到该页面，请先点击顶部刷新文档树或重新连接蓝湖文档';
            return Promise.resolve({ page_text_chars: 0, page_text: '', error: missingMsg });
        }
        var creds = resolveLanhuCredsForTree();
        var cookie = creds.cookie;
        var url = creds.url;
        if (!cookie || !url) {
            return Promise.resolve({ page_text_chars: 0, page_text: '', error: '请先在连接面板填写蓝湖 Cookie 与 URL' });
        }
        var pageUrl = buildTcLanhuPageUrl(url, pageId);
        syncToMainLanhuFields(cookie, pageUrl);
        state.pageCache[pageId] = { loading: true, chars: null, text: '', error: null };
        persistMeta();
        renderTree();
        return fetch('/api/lanhu-page-chars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                lanhu_cookie: cookie,
                lanhu_url: url,
                page_id: pageId,
                doc_id: state.docId || '',
                page_name: pageName || findPageNodeName(pageId)
            })
        }).then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.error) {
                    state.pageCache[pageId] = { chars: 0, text: '', error: data.error };
                } else {
                    var ch = parseInt(data.page_text_chars, 10) || 0;
                    state.pageCache[pageId] = {
                        chars: ch,
                        text: data.page_text || '',
                        error: null
                    };
                }
                persistMeta();
                renderTree();
                return data;
            })
            .catch(function (err) {
                var errMsg = (err && err.message) ? err.message : '获取失败';
                state.pageCache[pageId] = { chars: 0, text: '', error: errMsg };
                persistMeta();
                renderTree();
                return { page_text_chars: 0, page_text: '', error: errMsg };
            });
    }

    function refreshSinglePage(pageId) {
        fetchPageContent(pageId).then(function (data) {
            if (data && data.error && typeof tcAppToast === 'function') {
                tcAppToast(data.error, { variant: 'error' });
            }
        });
    }


    /** 点击文件夹行时展开/收起（与页面选中、toggle 按钮逻辑隔离） */
    function tryToggleLanhuFolderExpandOnRowClick(nodeId, treeType) {
        if (treeType === 'page' || !nodeId) return false;
        var node = findPageNode(nodeId);
        if (!node || !node.children || !node.children.length) return false;
        state.expanded[nodeId] = !state.expanded[nodeId];
        persistMeta();
        renderTree();
        return true;
    }


    /** 左侧树切换需求页：仅当该页已有用例时，表格区展示 loading；无用例保持「选择模板」逻辑 */
    function buildLanhuTreePageSwitchOpts(hasDesignedCases) {
        return hasDesignedCases ? { showTableLoading: true } : undefined;
    }

    function onTreeClick(ev) {
        var refreshBtn = ev.target.closest('[data-tree-refresh]');
        if (refreshBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var pid = refreshBtn.getAttribute('data-tree-refresh');
            if (pid) refreshSinglePage(pid);
            return;
        }
        var toggle = ev.target.closest('[data-tree-toggle]');
        if (toggle) {
            ev.preventDefault();
            ev.stopPropagation();
            var tid = toggle.getAttribute('data-tree-toggle');
            if (!tid) return;
            state.expanded[tid] = !state.expanded[tid];
            persistMeta();
            renderTree();
            return;
        }
        var selectRow = ev.target.closest('[data-tree-select]');
        if (!selectRow) return;
        var sid = selectRow.getAttribute('data-tree-select');
        if (!sid) return;
        var selLi = selectRow.closest('li[data-tree-type]');
        var treeType = selLi ? (selLi.getAttribute('data-tree-type') || '') : '';
        var isPageNode = treeType === 'page';
        if (!isPageNode && tryToggleLanhuFolderExpandOnRowClick(sid, treeType)) {
            return;
        }
        if (isPageNode && sid !== state.selectedId &&
            typeof window.isTcQualityCheckLanhuNavBlocked === 'function' &&
            window.isTcQualityCheckLanhuNavBlocked()) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof window.toastTcQualityCheckNavBlocked === 'function') {
                window.toastTcQualityCheckNavBlocked();
            }
            return;
        }
        if (isPageNode && sid !== state.selectedId &&
            typeof window.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
            window.isTcLanhuRequirementPageSwitchBlocked()) {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof window.toastTcLanhuRequirementPageSwitchBlocked === 'function') {
                window.toastTcLanhuRequirementPageSwitchBlocked();
            }
            return;
        }
        var prevSelected = state.selectedId;
        if (isPageNode && sid === prevSelected) {
            var storeRef = window.TcRequirementCaseStore;
            var displayedForPage = storeRef &&
                typeof storeRef.isDisplayedCasesForPage === 'function' &&
                storeRef.isDisplayedCasesForPage(sid);
            if (displayedForPage) return;
        }
        state.selectedId = sid;
        persistMeta();
        renderTree();
        if (isPageNode &&
            window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.onPageSelected === 'function') {
            var hasDesignedCases = lanhuTreeTargetPageHasDesignedCases(sid, selectRow);
            var nodeLi = document.querySelector('[data-tree-id="' + sid.replace(/"/g, '\\"') + '"]');
            if (hasDesignedCases && nodeLi) {
                nodeLi.classList.add('tc-lanhu-tree-node--loading');
            }
            var pageSwOpts = buildLanhuTreePageSwitchOpts(hasDesignedCases);
            var promise = window.TcRequirementCaseStore.onPageSelected(sid, findPageNodeName(sid), pageSwOpts);
            if (promise && typeof promise.then === 'function') {
                var done = function () {
                    if (nodeLi) nodeLi.classList.remove('tc-lanhu-tree-node--loading');
                };
                promise.then(done, done);
            }
        }
    }

    function findPageNode(pageId) {
        var found = null;
        function walk(nodes) {
            (nodes || []).forEach(function (node) {
                if (found || !node) return;
                if (node.id === pageId) {
                    found = node;
                    return;
                }
                walk(node.children);
            });
        }
        walk(state.tree);
        return found;
    }

    function isPageNodeId(pageId) {
        var node = findPageNode(pageId);
        return !!(node && node.type === 'page');
    }

    function finishTcTableBootAfterHydrate() {
        if (typeof window.finishTcTableBootHydrate === 'function') {
            window.finishTcTableBootHydrate();
        }
    }


    function resolveLanhuBaseUrlForTreeHydrate() {
        var urlEl = getMainUrlEl();
        var url = urlEl ? String(urlEl.value || '').trim() : '';
        if (url) return stripLanhuBaseUrl(url) || url;
        if (state.lanhuBaseUrl) return state.lanhuBaseUrl;
        if (window.TcWorkbenchSession &&
            typeof window.TcWorkbenchSession.getCurrentLanhuUrlForGen === 'function') {
            url = window.TcWorkbenchSession.getCurrentLanhuUrlForGen();
            if (url) return stripLanhuBaseUrl(url) || url;
        }
        if (typeof window.getTcLanhuSavedDocUrlForTreeDocId === 'function' && state.docId) {
            url = window.getTcLanhuSavedDocUrlForTreeDocId(state.docId);
            if (url) return url;
        }
        return '';
    }

    function hydrateRequirementCasesForSelection(pageId, pageName) {
        pageId = pageId || state.selectedId;
        if (!pageId || !isPageNodeId(pageId)) return Promise.resolve(false);
        pageName = pageName || findPageNodeName(pageId);
        var baseUrl = resolveLanhuBaseUrlForTreeHydrate();
        var swOpts = {};
        if (baseUrl) swOpts.lanhu_url = baseUrl;
        if (lanhuTreeTargetPageHasDesignedCases(pageId)) swOpts.showTableLoading = true;
        if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.hydrateSelectedPageCases === 'function') {
            return Promise.resolve(window.TcRequirementCaseStore.hydrateSelectedPageCases(pageId, pageName, swOpts));
        }
        if (window.TcRequirementCaseStore &&
            typeof window.TcRequirementCaseStore.onPageSelected === 'function') {
            return Promise.resolve(window.TcRequirementCaseStore.onPageSelected(pageId, pageName, swOpts));
        }
        return Promise.resolve(false);
    }

    function consumeLogoutTreeClearBeforeRestore() {
        try {
            if (sessionStorage.getItem(LOGOUT_TREE_CLEAR_FLAG) !== '1') return false;
            sessionStorage.removeItem(LOGOUT_TREE_CLEAR_FLAG);
        } catch (e) {
            return false;
        }
        state.tree = null;
        state.docName = '';
        state.docId = '';
        state.focusPageId = '';
        state.expanded = {};
        state.selectedId = '';
        state.pageCache = {};
        state.loading = false;
        resetLanhuTreeCaseStatusCache();
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        syncToMainLanhuFields('', '');
        var tc = $('tc-lanhu-tree-cookie');
        var tu = $('tc-lanhu-tree-url');
        if (tc) tc.value = '';
        if (tu) tu.value = '';
        setStatus('', '');
        return true;
    }

    function restoreFromStorage() {
        if (consumeLogoutTreeClearBeforeRestore()) {
            finishTcTableBootAfterHydrate();
            return;
        }
        var meta = readStoredMeta();
        if (!meta || !meta.tree) {
            finishTcTableBootAfterHydrate();
            return;
        }
        if (typeof window.beginTcTableBootHydrate === 'function') {
            window.beginTcTableBootHydrate();
        }
        state.tree = meta.tree;
        state.docName = meta.docName || '';
        state.docId = meta.docId || '';
        state.focusPageId = meta.focusPageId || '';
        state.expanded = meta.expanded || defaultExpandTree(meta.tree, 0, {});
        state.selectedId = meta.selectedId || '';
        state.pageCache = meta.pageCache || {};
        state.lanhuBaseUrl = meta.lanhuBaseUrl || '';
        renderTree();
        if (state.tree.length) setStatus('已恢复上次文档树（会话内）', 'ok');
        loadPageCacheFromServer().finally(function () {
            var loadCases = window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.loadForDoc === 'function' &&
                state.docId
                ? window.TcLanhuTreeCaseStatus.loadForDoc(state.docId)
                : Promise.resolve(false);
            loadCases.finally(function () {
                Promise.resolve(hydrateRequirementCasesForSelection(state.selectedId))
                    .finally(finishTcTableBootAfterHydrate);
            });
        });
    }

    function bindEvents() {
        var rail = $('tc-lanhu-doc-tree-rail');
        if (!rail || rail.dataset.tcLanhuTreeBound === '1') return;
        rail.dataset.tcLanhuTreeBound = '1';

        var connectBtn = $('tc-lanhu-tree-connect-btn');
        var refreshBtn = $('tc-lanhu-tree-refresh-btn');
        var collapseBtn = $('tc-lanhu-tree-rail-collapse');
        var searchInput = $('tc-lanhu-tree-search');
        var mount = $('tc-lanhu-tree-mount');
        var modal = $('tc-lanhu-tree-connect-modal');
        var cancelBtn = $('tc-lanhu-connect-cancel-btn') || $('tc-lanhu-tree-connect-cancel');
        var confirmBtn = $('tc-lanhu-tree-connect-confirm');

        if (connectBtn) connectBtn.addEventListener('click', openConnectModal);
        if (refreshBtn) refreshBtn.addEventListener('click', refreshTreeFromMainFields);
        if (collapseBtn) {
            collapseBtn.addEventListener('click', function () {
                state.collapsedRail = !state.collapsedRail;
                renderTree();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                window.requestAnimationFrame(renderTree);
            });
        }
        if (mount) mount.addEventListener('click', onTreeClick);
        if (cancelBtn) cancelBtn.addEventListener('click', closeConnectModal);
        if (confirmBtn) confirmBtn.addEventListener('click', confirmConnect);
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeConnectModal();
            });
        }
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-tc-lanhu-tree-connect]')) {
                e.preventDefault();
                openConnectModal();
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeConnectModal();
        });
    }

    function initTcLanhuDocTree() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        bindEvents();
        restoreFromStorage();
        renderTree();
    }

    window._tcLanhuDocTreeRerender = renderTree;

    function retryTcLanhuTreeHydrateIfNeeded() {
        if (!state.selectedId || !isPageNodeId(state.selectedId)) return;
        var storeRef = window.TcRequirementCaseStore;
        if (storeRef && typeof storeRef.isDisplayedCasesForPage === 'function' &&
            storeRef.isDisplayedCasesForPage(state.selectedId)) {
            return;
        }
        hydrateRequirementCasesForSelection(state.selectedId);
    }

    window.retryTcLanhuTreeHydrateIfNeeded = retryTcLanhuTreeHydrateIfNeeded;
    window.initTcLanhuDocTree = initTcLanhuDocTree;
    window.refreshTcLanhuDocTree = refreshTreeFromMainFields;
    window.clearTcLanhuDocTreeView = clearTcLanhuDocTreeView;
    window.tcLanhuDocTreeConfirmConnect = confirmConnect;
    window.fetchTcLanhuPageForGen = fetchPageContent;
    window.buildTcLanhuPageUrl = buildTcLanhuPageUrl;
    window.getTcLanhuPageCacheEntry = function (pageId) {
        return state.pageCache[pageId] || null;
    };
    window.findTcLanhuPageNodePath = findPageNodePath;
    window.getTcLanhuDocTreeMeta = function () {
        return {
            docId: state.docId,
            docName: state.docName,
            focusPageId: state.focusPageId,
            selectedId: state.selectedId,
            selectedPageName: findPageNodeName(state.selectedId),
            selectedPagePath: findPageNodePath(state.selectedId)
        };
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcLanhuDocTree);
    } else {
        initTcLanhuDocTree();
    }
})();
