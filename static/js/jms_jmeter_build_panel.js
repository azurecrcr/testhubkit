/**
 * JMeter 搭建 Tab · 组件全景（隔离模块，仅 body.lth-hub-build-tab 初始化）
 */
(function (global) {
    'use strict';

    var CAT_SHORT = {
        test_plan: '计划', thread_group: '线程组', controller: '控制器', config: '配置',
        sampler: '取样', timer: '定时', preprocessor: '前置', postprocessor: '后置',
        assertion: '断言', listener: '监听', other: '其他'
    };

    function esc(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function iconLetter(cat) {
        return (CAT_SHORT[cat] || '其').slice(0, 1);
    }

    var state = { all: [], categories: [], tree: null, filterCat: '', query: '' };

    function renderRuntime(rt) {
        var el = document.getElementById('jmb-runtime-badges');
        if (!el || !rt) return;
        el.innerHTML = [
            ['JMeter', rt.jmeter_version || '—'],
            ['Java', (rt.java_version || '—').replace(/^openjdk version /i, '')],
            ['Maven', rt.maven_version || '—'],
            ['插件 JAR', String(rt.plugin_jar_count || 0)]
        ].map(function (pair) {
            return '<span class="jmb-badge">' + esc(pair[0]) + ': ' + esc(pair[1]) + '</span>';
        }).join('');
    }

    function renderTree() {
        var root = document.getElementById('jmb-tree-root');
        if (!root || !state.tree) return;
        function walk(node, depth) {
            var cat = node.category || '';
            var count = cat ? state.all.filter(function (c) { return c.category === cat; }).length : state.all.length;
            var html = '<div class="jmb-tree-node' + (depth ? ' jmb-tree-node--child' : '') +
                (state.filterCat === cat && cat ? ' is-active' : '') +
                (!cat && !state.filterCat ? ' is-active' : '') +
                '" data-cat="' + esc(cat) + '" role="button" tabindex="0">' +
                esc(node.label_zh || node.label_en || node.id) +
                (count ? '<span class="jmb-tree-node__meta">' + count + ' 项</span>' : '') +
                '</div>';
            (node.children || []).forEach(function (ch) { html += walk(ch, depth + 1); });
            return html;
        }
        root.innerHTML = walk(state.tree, 0);
        root.querySelectorAll('.jmb-tree-node').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.filterCat = btn.getAttribute('data-cat') || '';
                var sel = document.getElementById('jmb-filter-category');
                if (sel) sel.value = state.filterCat;
                renderGrid();
                renderTree();
            });
        });
    }

    function renderCatStrip() {
        var strip = document.getElementById('jmb-cat-strip');
        if (!strip) return;
        strip.innerHTML = state.categories.map(function (c) {
            return '<button type="button" class="jmb-cat-chip' + (state.filterCat === c.id ? ' is-active' : '') +
                '" data-cat="' + esc(c.id) + '">' + esc(c.label_zh) + ' (' + c.count + ')</button>';
        }).join('');
        strip.querySelectorAll('.jmb-cat-chip').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.filterCat = btn.getAttribute('data-cat') || '';
                var sel = document.getElementById('jmb-filter-category');
                if (sel) sel.value = state.filterCat;
                renderGrid();
                renderTree();
            });
        });
    }

    function renderGrid() {
        var grid = document.getElementById('jmb-grid');
        var empty = document.getElementById('jmb-empty');
        var countLabel = document.getElementById('jmb-count-label');
        if (!grid) return;
        var q = state.query.trim().toLowerCase();
        var list = state.all.filter(function (item) {
            if (state.filterCat && item.category !== state.filterCat) return false;
            if (!q) return true;
            var hay = (item.label_zh + ' ' + item.alias + ' ' + item.class).toLowerCase();
            return hay.indexOf(q) >= 0;
        });
        if (countLabel) countLabel.textContent = '显示 ' + list.length + ' / ' + state.all.length + ' 个组件';
        grid.innerHTML = list.map(function (item) {
            var scopeTag = item.scope === 'plugin'
                ? '<span class="jmb-card__tag jmb-card__tag--plugin">插件</span>'
                : '<span class="jmb-card__tag">核心</span>';
            return '<article class="jmb-card" role="listitem">' +
                '<div class="jmb-card__head">' +
                '<span class="jmb-card__icon jmb-card__icon--' + esc(item.category) + '">' + esc(iconLetter(item.category)) + '</span>' +
                '<div><div class="jmb-card__title">' + esc(item.label_zh) + '</div>' +
                '<div class="jmb-card__alias">' + esc(item.alias) + '</div></div></div>' +
                '<div class="jmb-card__class">' + esc(item.class) + '</div>' + scopeTag + '</article>';
        }).join('');
        if (empty) empty.classList.toggle('hidden', list.length > 0);
    }

    function fillCategorySelect() {
        var sel = document.getElementById('jmb-filter-category');
        if (!sel) return;
        state.categories.forEach(function (c) {
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.label_zh + ' (' + c.count + ')';
            sel.appendChild(opt);
        });
        sel.addEventListener('change', function () {
            state.filterCat = sel.value || '';
            renderGrid();
            renderTree();
        });
    }

    function bindSearch() {
        var input = document.getElementById('jmb-search');
        if (!input) return;
        input.addEventListener('input', function () {
            state.query = input.value || '';
            renderGrid();
        });
    }

    function init() {
        if (!document.body.classList.contains('lth-hub-build-tab')) return;
        fetch('/api/jmeter-build/catalog', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.ok) throw new Error((data && data.error) || '加载失败');
                state.all = data.components || [];
                state.categories = data.categories || [];
                state.tree = data.tree || null;
                renderRuntime(data.runtime || {});
                fillCategorySelect();
                renderTree();
                renderCatStrip();
                renderGrid();
                bindSearch();
            })
            .catch(function (err) {
                var countLabel = document.getElementById('jmb-count-label');
                if (countLabel) countLabel.textContent = err.message || '加载失败';
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.JmsBuildPanel = { init: init };
})(window);
