/**
 * JMX 解析弹窗 UI 辅助（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function measureNavOffset() {
        var gnav = global.document && global.document.querySelector('.hf-gnav');
        var h = gnav ? Math.ceil(gnav.getBoundingClientRect().height) : 0;
        if (!h || h < 40) h = 56;
        global.document.documentElement.style.setProperty('--hf-gnav-height', h + 'px');
        return h;
    }

    function summaryItems(summary) {
        if (!summary) return [];
        var items = [
            { label: '计划', value: summary.planName || '—', wide: true }
        ];
        if (summary.setupThreadGroups) {
            items.push({ label: '前置线程组', value: summary.setupThreadGroups + ' 个' });
        }
        items.push({ label: '线程组', value: (summary.threadGroups || 0) + ' 个' });
        if (summary.postThreadGroups) {
            items.push({ label: '后置线程组', value: summary.postThreadGroups + ' 个' });
        }
        items.push({ label: 'HTTP 步骤', value: (summary.steps || 0) + ' 个' });
        if (summary.officialElementCount) {
            items.push({ label: '官方元件', value: summary.officialElementCount + ' 个', wide: true });
        }
        items.push({ label: '公共变量', value: (summary.variables || 0) + ' 个' });
        if (summary.ifControllers) items.push({ label: 'IfController', value: summary.ifControllers + ' 个' });
        if (summary.beanshellProcessors) items.push({ label: 'BeanShell', value: summary.beanshellProcessors + ' 个' });
        if (summary.jsonAssertions) items.push({ label: 'JSON 断言', value: summary.jsonAssertions + ' 个' });
        if (summary.extractors) items.push({ label: 'JSON 提取', value: summary.extractors + ' 个' });
        if (summary.placeholders) {
            items.push({ label: '占位请求', value: summary.placeholders + ' 个', warn: true, wide: true });
        }
        if (summary.csvAttachments && summary.csvAttachments.length) {
            items.push({
                label: 'CSV 附件',
                value: '待上传 ' + summary.csvAttachments.length + ' 个',
                warn: true,
                wide: true
            });
        }
        (summary.warnings || []).forEach(function (w) {
            items.push({ label: '提示', value: w, warn: true, wide: true });
        });
        return items;
    }

    function renderSummary(el, summary) {
        if (!el) return;
        var items = summaryItems(summary);
        if (!items.length) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        el.innerHTML = '<ul class="jmx-import-summary-grid">' + items.map(function (it) {
            var cls = 'jmx-import-summary-grid__item' +
                (it.wide ? ' jmx-import-summary-grid__item--wide' : '') +
                (it.label === '计划' ? ' jmx-import-summary-grid__item--plan' : '') +
                (it.warn ? ' jmx-import-summary-grid__item--warn' : '');
            return '<li class="' + cls + '">' +
                '<span class="jmx-import-summary-grid__label">' + esc(it.label) + '</span>' +
                '<span class="jmx-import-summary-grid__value">' + esc(it.value) + '</span>' +
                '</li>';
        }).join('') + '</ul>';
        el.classList.remove('hidden');
    }

    function getModalScrollEl() {
        var modal = global.document.getElementById('modal-jmx-import');
        return modal ? modal.querySelector('.jmx-import-modal__scroll') : null;
    }

    function restoreModalScroll(top) {
        if (top == null || top < 0) return;
        var scrollEl = getModalScrollEl();
        if (!scrollEl) return;
        var apply = function () { scrollEl.scrollTop = top; };
        apply();
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                apply();
                global.requestAnimationFrame(apply);
            });
        }
    }

    function pinCsvPickerScroll(input) {
        var scrollEl = getModalScrollEl();
        input.__jmxImportSavedScroll = scrollEl ? scrollEl.scrollTop : 0;
    }


    function csvBaseName(path) {
        return String(path || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
    }

    function csvTargetsMatch(target, fileName) {
        var t = String(target || '').trim();
        var f = String(fileName || '').trim();
        if (!t || !f) return false;
        var tb = csvBaseName(t);
        var fb = csvBaseName(f);
        if (tb === fb) return true;
        if (t === f) return true;
        if (t.endsWith('/' + fb)) return true;
        if (t.endsWith(f)) return true;
        return false;
    }

    function setInputFile(input, file) {
        if (!input || !file) return false;
        try {
            var dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            return true;
        } catch (e) {
            return false;
        }
    }

    function updateCsvPickUi(input, file) {
        var label = input && input.closest('.jmx-import-csv-row__pick');
        var nameEl = label && label.querySelector('.jmx-import-csv-row__pick-name');
        if (!nameEl) return;
        if (file) {
            nameEl.textContent = file.name;
            nameEl.classList.add('is-selected');
        } else {
            nameEl.textContent = '未选择';
            nameEl.classList.remove('is-selected');
        }
    }

    function showBulkCsvStatus(msg, isWarn) {
        var el = global.document.getElementById('jmx-import-csv-bulk-status');
        if (!el) return;
        if (!msg) {
            el.textContent = '';
            el.classList.add('hidden');
            el.classList.remove('is-warn');
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
        el.classList.toggle('is-warn', !!isWarn);
    }

    function applyBulkCsvFiles(fileList) {
        var listRoot = global.document.getElementById('jmx-import-csv-list');
        if (!listRoot) return { matched: 0, slotMatched: 0, unmatched: [] };
        var inputs = listRoot.querySelectorAll('.jmx-import-csv-file');
        if (!inputs.length) return { matched: 0, slotMatched: 0, unmatched: [] };
        var files = Array.prototype.slice.call(fileList || []);
        var matched = 0;
        var slotMatched = 0;
        var unmatched = [];
        files.forEach(function (file) {
            var matchedInputs = [];
            inputs.forEach(function (input) {
                var t = input.getAttribute('data-target') || '';
                if (csvTargetsMatch(t, file.name)) matchedInputs.push(input);
            });
            if (!matchedInputs.length && files.length === 1 && inputs.length === 1) {
                matchedInputs = [inputs[0]];
            }
            if (!matchedInputs.length) {
                unmatched.push(file.name);
                return;
            }
            var okAny = false;
            matchedInputs.forEach(function (input) {
                if (setInputFile(input, file)) {
                    updateCsvPickUi(input, file);
                    slotMatched += 1;
                    okAny = true;
                }
            });
            if (okAny) matched += 1;
            else unmatched.push(file.name);
        });
        return { matched: matched, slotMatched: slotMatched, unmatched: unmatched };
    }

    function readFileAsText(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('read failed')); };
            reader.readAsText(file, 'UTF-8');
        });
    }

    function applyCsvFilesToVisualBuilder(vb) {
        if (!vb || typeof vb.getModel !== 'function') return Promise.resolve({});
        var model = vb.getModel();
        if (!model) return Promise.resolve({});
        var inputs = global.document.querySelectorAll('#jmx-import-csv-list .jmx-import-csv-file');
        var tasks = [];
        var csvFiles = {};
        inputs.forEach(function (input) {
            var file = input.files && input.files[0];
            if (!file) return;
            var target = input.getAttribute('data-target') || ('data/' + file.name);
            tasks.push(readFileAsText(file).then(function (text) {
                csvFiles[target] = text;
                var groups = (model.setup_thread_groups || []).concat(model.thread_groups || []);
                groups.forEach(function (tg) {
                    var csv = tg.http_managers && tg.http_managers.csv_data_set;
                    if (!csv || !csv.enabled) return;
                    if (csvTargetsMatch(csv.filename, file.name) || csvTargetsMatch(target, file.name) || csv.filename === target) {
                        csv.file_content = text;
                        if (!csv.filename) csv.filename = target;
                    }
                });
            }));
        });
        return Promise.all(tasks).then(function () { return csvFiles; });
    }

    function resetBulkCsvUi() {
        var bulkInput = global.document.getElementById('jmx-import-csv-bulk-files');
        if (bulkInput) bulkInput.value = '';
        showBulkCsvStatus('');
    }

    function bindBulkCsvUpload() {
        var btn = global.document.getElementById('btn-jmx-csv-bulk-upload');
        var bulkInput = global.document.getElementById('jmx-import-csv-bulk-files');
        if (!btn || !bulkInput || btn.__jmxBulkCsvBound) return;
        btn.__jmxBulkCsvBound = true;
        btn.addEventListener('click', function () {
            pinCsvPickerScroll(bulkInput);
            bulkInput.click();
        });
        bulkInput.addEventListener('change', function () {
            var files = bulkInput.files;
            if (!files || !files.length) return;
            var result = applyBulkCsvFiles(files);
            var slots = result.slotMatched || result.matched || 0;
            if (slots > 0 && !result.unmatched.length) {
                var okMsg = '已匹配并同步 ' + slots + ' 个元件';
                if (result.matched > 0 && result.matched < slots) {
                    okMsg += '（' + result.matched + ' 个 CSV 文件）';
                }
                showBulkCsvStatus(okMsg, false);
            } else if (slots > 0 && result.unmatched.length) {
                showBulkCsvStatus('已同步 ' + slots + ' 个元件；未匹配文件：' + result.unmatched.join('、'), true);
            } else {
                showBulkCsvStatus('未能匹配 CSV，请按文件名（如 users.csv）选择或逐行上传', true);
            }
            bulkInput.value = '';
            restoreModalScroll(bulkInput.__jmxImportSavedScroll || 0);
        });
    }

    function renderCsvList(listEl, attachments) {
        if (!listEl) return;
        if (!attachments || !attachments.length) {
            listEl.innerHTML = '';
            return;
        }
        listEl.innerHTML = attachments.map(function (item, idx) {
            return '<div class="jmx-import-csv-row" data-csv-idx="' + idx + '">' +
                '<div class="jmx-import-csv-row__info">' +
                '<span class="jmx-import-csv-row__name">' + esc(item.normalized) + '</span>' +
                '<span class="jmx-import-csv-row__path" title="' + esc(item.source_path) + '">原路径: ' +
                esc(item.source_path) + '</span>' +
                '</div>' +
                '<label class="jmx-import-csv-row__pick">' +
                '<input type="file" accept=".csv,text/csv" class="jmx-import-csv-file sr-only" data-target="' +
                esc(item.normalized) + '" />' +
                '<span class="jmx-import-csv-row__pick-btn">选择 CSV</span>' +
                '<span class="jmx-import-csv-row__pick-name">未选择</span>' +
                '</label></div>';
        }).join('');
        bindCsvPickers(listEl);
        bindBulkCsvUpload();
        resetBulkCsvUi();
    }

    function bindCsvPickers(root) {
        if (!root) return;
        root.querySelectorAll('.jmx-import-csv-file').forEach(function (input) {
            if (input.__jmxImportUiBound) return;
            input.__jmxImportUiBound = true;
            input.__jmxImportSavedScroll = 0;

            var pick = input.closest('.jmx-import-csv-row__pick');
            if (pick) {
                pick.addEventListener('pointerdown', function () {
                    pinCsvPickerScroll(input);
                    var onWinFocus = function () {
                        restoreModalScroll(input.__jmxImportSavedScroll);
                        global.removeEventListener('focus', onWinFocus, true);
                    };
                    global.addEventListener('focus', onWinFocus, true);
                }, true);
            }

            input.addEventListener('focus', function () {
                restoreModalScroll(input.__jmxImportSavedScroll);
            });

            input.addEventListener('change', function () {
                var f = input.files && input.files[0];
                var top = input.__jmxImportSavedScroll;
                updateCsvPickUi(input, f);
                if (typeof input.blur === 'function') input.blur();
                restoreModalScroll(top);
            });
        });
    }

    function ensureModalInBody() {
        var modal = global.document.getElementById('modal-jmx-import');
        if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
    }

    function syncBodyScrollLock(modal) {
        if (!modal || !global.document.body) return;
        var open = modal.classList.contains('jms-modal-open');
        global.document.body.classList.toggle('jmx-import-modal-open', open);
    }

    function init() {
        measureNavOffset();
        ensureModalInBody();
        global.addEventListener('resize', measureNavOffset, { passive: true });
        var modal = global.document.getElementById('modal-jmx-import');
        if (modal && !modal.__jmxImportUiObs) {
            modal.__jmxImportUiObs = true;
            new MutationObserver(function () {
                syncBodyScrollLock(modal);
                if (modal.classList.contains('jms-modal-open')) {
                    measureNavOffset();
                    ensureModalInBody();
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
            syncBodyScrollLock(modal);
        }
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }


    function renderOfficialTreeNode(node) {
        if (!node) return '';
        var name = esc(node.name || '未命名');
        var tc = esc(node.test_class || 'Unknown');
        var disabled = node.enabled === false;
        var children = node.children || [];
        var childHtml = children.map(renderOfficialTreeNode).join('');
        var badge = disabled ? '<span class="jmx-official-tree__badge jmx-official-tree__badge--off">禁用</span>' : '';
        if (!childHtml) {
            return '<li class="jmx-official-tree__item jmx-official-tree__item--leaf">' +
                '<span class="jmx-official-tree__name">' + name + '</span>' +
                '<span class="jmx-official-tree__type">' + tc + '</span>' + badge + '</li>';
        }
        return '<li class="jmx-official-tree__item">' +
            '<details class="jmx-official-tree__details" open>' +
            '<summary class="jmx-official-tree__summary">' +
            '<span class="jmx-official-tree__name">' + name + '</span>' +
            '<span class="jmx-official-tree__type">' + tc + '</span>' + badge +
            '</summary><ul class="jmx-official-tree__children">' + childHtml + '</ul></details></li>';
    }

    function renderOfficialTree(el, official) {
        if (!el) return;
        if (!official || !official.tree || !official.tree.length) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        var meta = '<div class="jmx-official-tree__meta">官方导入 · ' +
            esc(official.plan_name || '测试计划') + ' · 共 ' +
            esc(String(official.element_count || 0)) + ' 个元件' +
            (official.truncated ? '（已截断展示）' : '') + '</div>';
        el.innerHTML = meta + '<ul class="jmx-official-tree__root">' +
            official.tree.map(renderOfficialTreeNode).join('') + '</ul>';
        el.classList.remove('hidden');
    }

    function resetOfficialTree() {
        var wrap = global.document.getElementById('jmx-import-official-wrap');
        var el = global.document.getElementById('jmx-import-official-tree');
        if (wrap) wrap.classList.add('hidden');
        if (el) {
            el.innerHTML = '';
            el.classList.add('hidden');
        }
    }

    global.JmxImportModalUi = {
        renderSummary: renderSummary,
        renderCsvList: renderCsvList,
        bindCsvPickers: bindCsvPickers,
        applyBulkCsvFiles: applyBulkCsvFiles,
        applyCsvFilesToVisualBuilder: applyCsvFilesToVisualBuilder,
        resetBulkCsvUi: resetBulkCsvUi,
        renderOfficialTree: renderOfficialTree,
        resetOfficialTree: resetOfficialTree,
        measureNavOffset: measureNavOffset
    };
}(typeof window !== 'undefined' ? window : this));
