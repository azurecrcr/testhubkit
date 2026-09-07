/**
 * 文档工具 · 工具栏（Excel 导入）
 * 与 dtk-vxe-table 模块完全隔离。
 */
(function () {
    'use strict';

    var ALLOWED_EXTS = ['.xlsx', '.xls'];
    var ALLOWED_MIMES = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream'
    ];
    var DOC_TOOLS_XLSX_URL = '/static/vendor/xlsx.full.min.js?v=0.18.5';

    let columnFillExcelFile = null;
    let docToolsXlsxPromise = null;
    let docToolsExportedSinceLoad = false;
    let docToolsPendingNavHref = '';

    function docToolsToast(message, opts) {
        opts = opts || {};
        var text = String(message != null ? message : '').trim();
        if (!text) return;
        if (typeof globalThis.hfFloatToast === 'function') {
            globalThis.hfFloatToast(text, {
                placement: 'top',
                variant: opts.variant || 'warning',
                duration: typeof opts.duration === 'number' ? opts.duration : 3200
            });
            return;
        }
        window.alert(text);
    }

    function getFileExtension(name) {
        var n = String(name || '').trim().toLowerCase();
        var dot = n.lastIndexOf('.');
        return dot >= 0 ? n.slice(dot) : '';
    }

    function readFileHead(file, length) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(new Uint8Array(reader.result || [])); };
            reader.onerror = function () { reject(new Error('read failed')); };
            reader.readAsArrayBuffer(file.slice(0, length));
        });
    }

    function matchExcelMagic(head, ext) {
        if (!head || !head.length) return false;
        var isZip = head[0] === 0x50 && head[1] === 0x4b;
        var isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
        if (ext === '.xlsx') return isZip;
        if (ext === '.xls') return isOle;
        return isZip || isOle;
    }

    function ensureDocToolsXlsxLoaded() {
        if (typeof globalThis.XLSX !== 'undefined') {
            return Promise.resolve();
        }
        if (docToolsXlsxPromise) return docToolsXlsxPromise;
        docToolsXlsxPromise = new Promise(function (resolve, reject) {
            var pending = document.querySelector('script[data-doc-tools-xlsx="1"]');
            if (pending) {
                pending.addEventListener('load', function () {
                    if (typeof globalThis.XLSX !== 'undefined') resolve();
                    else reject(new Error('XLSX 组件未加载'));
                });
                pending.addEventListener('error', function () {
                    reject(new Error('无法加载 XLSX 组件'));
                });
                return;
            }
            var script = document.createElement('script');
            script.src = DOC_TOOLS_XLSX_URL;
            script.async = true;
            script.defer = true;
            script.setAttribute('data-doc-tools-xlsx', '1');
            script.onload = function () {
                if (typeof globalThis.XLSX !== 'undefined') resolve();
                else {
                    docToolsXlsxPromise = null;
                    reject(new Error('XLSX 组件未加载'));
                }
            };
            script.onerror = function () {
                docToolsXlsxPromise = null;
                reject(new Error('无法加载 XLSX 组件'));
            };
            document.head.appendChild(script);
        });
        return docToolsXlsxPromise;
    }

    function readExcelMatrix(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (event) {
                try {
                    var data = new Uint8Array(event.target.result || []);
                    var workbook = globalThis.XLSX.read(data, { type: 'array', cellDates: true });
                    var sheetName = workbook.SheetNames && workbook.SheetNames[0];
                    if (!sheetName) {
                        reject(new Error('Excel 中没有可用的工作表'));
                        return;
                    }
                    var worksheet = workbook.Sheets[sheetName];
                    var matrix = globalThis.XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        raw: false,
                        defval: ''
                    });
                    resolve({
                        matrix: Array.isArray(matrix) ? matrix : [],
                        sheetName: sheetName
                    });
                } catch (err) {
                    reject(err instanceof Error ? err : new Error('Excel 解析失败'));
                }
            };
            reader.onerror = function () {
                reject(new Error('无法读取 Excel 文件'));
            };
            reader.readAsArrayBuffer(file);
        });
    }

    function loadMatrixIntoTable(matrix) {
        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.loadFromMatrix !== 'function') {
            return Promise.reject(new Error('表格组件未就绪'));
        }
        return table.ensureReady().then(function () {
            table.loadFromMatrix(matrix);
        });
    }

    function resetDocToolsTable() {
        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.resetSheet !== 'function') return Promise.resolve();
        return table.resetSheet();
    }

    function parseAndRenderExcel(file) {
        return ensureDocToolsXlsxLoaded()
            .then(function () { return readExcelMatrix(file); })
            .then(function (result) {
                return loadMatrixIntoTable(result.matrix).then(function () {
                    return result;
                });
            });
    }

    function validateDocToolsExcelFile(file) {
        if (!file) {
            return Promise.resolve({ ok: false, error: '未选择文件' });
        }
        var ext = getFileExtension(file.name);
        if (ALLOWED_EXTS.indexOf(ext) === -1) {
            return Promise.resolve({
                ok: false,
                error: '仅支持 .xlsx 或 .xls 格式的 Excel 文件'
            });
        }
        if (file.type && ALLOWED_MIMES.indexOf(file.type) === -1) {
            return Promise.resolve({
                ok: false,
                error: '文件类型无效，请上传 Excel（.xlsx / .xls）'
            });
        }
        var maxBytes = 20 * 1024 * 1024;
        if (file.size <= 0) {
            return Promise.resolve({ ok: false, error: '文件为空，无法读取' });
        }
        if (file.size > maxBytes) {
            return Promise.resolve({
                ok: false,
                error: '文件过大，请上传不超过 20MB 的 Excel 文件'
            });
        }
        return readFileHead(file, 8).then(function (head) {
            if (!matchExcelMagic(head, ext)) {
                return {
                    ok: false,
                    error: '文件内容与扩展名不匹配，请确认是有效的 Excel 文件'
                };
            }
            return { ok: true, file: file };
        }).catch(function () {
            return { ok: false, error: '无法读取文件，请重试' };
        });
    }


    function docToolsHasTableContent() {
        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.getApi !== 'function') return false;
        var api = table.getApi();
        if (!api || !api.gridRef || !api.gridRef.value) return false;
        var grid = api.gridRef.value;
        var fullData = [];
        if (typeof grid.getTableData === 'function') {
            var tableData = grid.getTableData();
            fullData = (tableData && tableData.fullData) ? tableData.fullData : [];
        }
        if (!fullData.length) return false;
        return fullData.some(function (row) {
            if (!row || typeof row !== 'object') return false;
            return Object.keys(row).some(function (key) {
                if (key.charAt(0) !== 'c') return false;
                var val = row[key];
                return val != null && String(val).trim() !== '';
            });
        });
    }

    function shouldWarnDocToolsNavLeave() {
        if (!document.body.classList.contains('doc-tools-page')) return false;
        if (docToolsExportedSinceLoad) return false;
        var overlay = document.getElementById('cf-table-import-overlay');
        if (!overlay || !overlay.classList.contains('hidden')) return false;
        return docToolsHasTableContent();
    }

    function isDocToolsNavLeaveLink(link) {
        if (!link || link.tagName !== 'A') return false;
        if (!link.closest('[data-hf-gnav], [data-gnav-drawer]')) return false;
        var href = link.getAttribute('href');
        if (!href || href.charAt(0) === '#') return false;
        if (href.indexOf('/auth') === 0) return false;
        try {
            var target = new URL(href, window.location.origin);
            if (target.pathname === window.location.pathname) return false;
        } catch (err) {
            return false;
        }
        return true;
    }

    function openDocToolsNavLeaveConfirm(href) {
        docToolsPendingNavHref = href || '';
        var modal = document.getElementById('cf-nav-leave-modal');
        if (!modal) {
            window.location.href = docToolsPendingNavHref;
            return;
        }
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        var submitBtn = document.getElementById('cf-nav-leave-submit');
        if (submitBtn) submitBtn.focus();
    }

    function closeDocToolsNavLeaveConfirm() {
        docToolsPendingNavHref = '';
        var modal = document.getElementById('cf-nav-leave-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }

    function confirmDocToolsNavLeave() {
        var href = docToolsPendingNavHref;
        closeDocToolsNavLeaveConfirm();
        if (href) window.location.href = href;
    }

    function initDocToolsNavLeaveGuard() {
        if (!document.body.classList.contains('doc-tools-page')) return;

        document.addEventListener('click', function (e) {
            if (!shouldWarnDocToolsNavLeave()) return;
            var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!isDocToolsNavLeaveLink(link)) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof globalThis.hfHidePageNavLoading === 'function') {
                globalThis.hfHidePageNavLoading();
            }
            openDocToolsNavLeaveConfirm(link.getAttribute('href'));
        }, true);

        var modal = document.getElementById('cf-nav-leave-modal');
        if (!modal) return;

        var cancelBtn = document.getElementById('cf-nav-leave-cancel');
        var closeBtn = document.getElementById('cf-nav-leave-close');
        var submitBtn = document.getElementById('cf-nav-leave-submit');

        function onDismiss() {
            closeDocToolsNavLeaveConfirm();
        }

        if (cancelBtn) cancelBtn.addEventListener('click', onDismiss);
        if (closeBtn) closeBtn.addEventListener('click', onDismiss);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) onDismiss();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                onDismiss();
            }
        });
        if (submitBtn) submitBtn.addEventListener('click', confirmDocToolsNavLeave);
    }

    let dtkDeleteConfirmResolver = null;

    function closeDtkDeleteConfirmModal(result) {
        var modal = document.getElementById('dtk-delete-confirm-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        }
        if (dtkDeleteConfirmResolver) {
            var resolve = dtkDeleteConfirmResolver;
            dtkDeleteConfirmResolver = null;
            resolve(!!result);
        }
    }

    function initDtkDeleteConfirmModal() {
        if (!document.body.classList.contains('doc-tools-page')) return;
        var modal = document.getElementById('dtk-delete-confirm-modal');
        if (!modal) return;

        var cancelBtn = document.getElementById('dtk-delete-confirm-cancel');
        var closeBtn = document.getElementById('dtk-delete-confirm-close');
        var submitBtn = document.getElementById('dtk-delete-confirm-submit');

        function onDismiss() { closeDtkDeleteConfirmModal(false); }

        if (cancelBtn) cancelBtn.addEventListener('click', onDismiss);
        if (closeBtn) closeBtn.addEventListener('click', onDismiss);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) onDismiss();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                onDismiss();
            }
        });
        if (submitBtn) {
            submitBtn.addEventListener('click', function () {
                closeDtkDeleteConfirmModal(true);
            });
        }

        globalThis.dtkConfirmDelete = function (message) {
            if (!document.body.classList.contains('doc-tools-page')) {
                return Promise.resolve(window.confirm(message));
            }
            var msgNode = document.getElementById('dtk-delete-confirm-message');
            if (!modal || !msgNode) {
                return Promise.resolve(window.confirm(message));
            }
            if (dtkDeleteConfirmResolver) {
                closeDtkDeleteConfirmModal(false);
            }
            return new Promise(function (resolve) {
                dtkDeleteConfirmResolver = resolve;
                msgNode.textContent = String(message != null ? message : '');
                modal.classList.remove('hidden');
                modal.setAttribute('aria-hidden', 'false');
                if (submitBtn) submitBtn.focus();
            });
        };
    }

    function syncDocToolsTableImportOverlay(show) {
        var overlay = document.getElementById('cf-table-import-overlay');
        if (!overlay) return;
        overlay.classList.toggle('hidden', !show);
        overlay.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    function syncDocToolsFileActions(file) {
        var actions = document.getElementById('cf-file-actions');
        if (!actions) return;
        actions.classList.toggle('hidden', !file);
        if (globalThis.DocToolsAiPanel && typeof globalThis.DocToolsAiPanel.syncImportState === 'function') {
            globalThis.DocToolsAiPanel.syncImportState(!!file);
        }
    }

    function buildDocToolsExportFilename() {
        if (columnFillExcelFile && columnFillExcelFile.name) {
            var base = String(columnFillExcelFile.name).replace(/\.(xlsx|xls)$/i, '');
            return base + '_导出.xlsx';
        }
        var now = new Date();
        var y = now.getFullYear();
        var m = String(now.getMonth() + 1).padStart(2, '0');
        var d = String(now.getDate()).padStart(2, '0');
        return '智能编辑_' + y + '-' + m + '-' + d + '.xlsx';
    }

    function downloadDocToolsMatrixAsXlsx(matrix) {
        var ws = globalThis.XLSX.utils.aoa_to_sheet(matrix);
        var wb = globalThis.XLSX.utils.book_new();
        globalThis.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        var wbout = globalThis.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = buildDocToolsExportFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function readDocToolsTableMatrixFromGrid() {
        var table = globalThis.DocToolsVxeTable;
        if (!table || typeof table.ensureReady !== 'function') {
            return Promise.reject(new Error('表格组件未就绪'));
        }
        return table.ensureReady().then(function (api) {
            if (!api || !api.gridRef || !api.gridRef.value) return [];
            var grid = api.gridRef.value;
            var fullData = [];
            if (typeof grid.getTableData === 'function') {
                var tableData = grid.getTableData();
                fullData = (tableData && tableData.fullData) ? tableData.fullData : [];
            }
            if (!fullData.length) return [];

            var colCount = 0;
            fullData.forEach(function (row) {
                if (!row || typeof row !== 'object') return;
                Object.keys(row).forEach(function (key) {
                    if (key.charAt(0) !== 'c') return;
                    var idx = parseInt(String(key).slice(1), 10);
                    if (!Number.isNaN(idx)) colCount = Math.max(colCount, idx + 1);
                });
            });
            if (!colCount) return [];

            return fullData.map(function (row) {
                var line = [];
                for (var c = 0; c < colCount; c += 1) {
                    var val = row['c' + c];
                    line.push(val == null ? '' : String(val));
                }
                return line;
            });
        });
    }

    function openDocToolsExportConfirm() {
        var modal = document.getElementById('cf-export-confirm-modal');
        if (!modal) {
            exportDocToolsTableToExcel();
            return;
        }
        var filenameNode = document.getElementById('cf-export-confirm-filename');
        if (filenameNode) {
            filenameNode.textContent = '文件名：' + buildDocToolsExportFilename();
        }
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        var submitBtn = document.getElementById('cf-export-confirm-submit');
        if (submitBtn) submitBtn.focus();
    }

    function closeDocToolsExportConfirm() {
        var modal = document.getElementById('cf-export-confirm-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }

    function initDocToolsExportConfirm() {
        var modal = document.getElementById('cf-export-confirm-modal');
        if (!modal) return;

        var cancelBtn = document.getElementById('cf-export-confirm-cancel');
        var closeBtn = document.getElementById('cf-export-confirm-close');
        var submitBtn = document.getElementById('cf-export-confirm-submit');

        function onDismiss() {
            closeDocToolsExportConfirm();
        }

        if (cancelBtn) cancelBtn.addEventListener('click', onDismiss);
        if (closeBtn) closeBtn.addEventListener('click', onDismiss);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) onDismiss();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                onDismiss();
            }
        });

        if (submitBtn) {
            submitBtn.addEventListener('click', function () {
                closeDocToolsExportConfirm();
                if (globalThis.DocToolsExcelUpload && typeof globalThis.DocToolsExcelUpload.exportTable === 'function') {
                    globalThis.DocToolsExcelUpload.exportTable();
                } else {
                    exportDocToolsTableToExcel();
                }
            });
        }
    }

function exportDocToolsTableToExcel() {
        return ensureDocToolsXlsxLoaded()
            .then(function () { return readDocToolsTableMatrixFromGrid(); })
            .then(function (matrix) {
                if (!matrix || !matrix.length) {
                    docToolsToast('当前表格没有可导出的数据', { variant: 'warning' });
                    return;
                }
                downloadDocToolsMatrixAsXlsx(matrix);
                docToolsExportedSinceLoad = true;
                docToolsToast('Excel 已导出', { variant: 'success' });
            })
            .catch(function (err) {
                docToolsToast((err && err.message) || '导出失败', { variant: 'warning' });
            });
    }

    function clearDocToolsExcelSelection(fileInput) {
        if (fileInput) fileInput.value = '';
        columnFillExcelFile = null;
        docToolsExportedSinceLoad = false;
        syncDocToolsFileActions(null);
        syncDocToolsTableImportOverlay(true);
        resetDocToolsTable().catch(function () { /* ignore */ });
    }

    function ensureDocToolsPageBackground() {
        if (!document.body.classList.contains('doc-tools-page')) return;
        var layer = document.querySelector('.doc-tools-page__bg');
        if (!layer) return;
        var bgUrl = layer.getAttribute('data-doc-tools-bg');
        if (!bgUrl) return;

        function applyBackground() {
            var cssUrl = "url('" + bgUrl.replace(/'/g, "\\'") + "')";
            layer.style.setProperty('--doc-tools-bg-url', cssUrl);
            layer.style.backgroundImage = cssUrl;
        }

        function reloadBackground() {
            var sep = bgUrl.indexOf('?') >= 0 ? '&' : '?';
            var fresh = bgUrl + sep + '_rc=' + Date.now();
            var cssUrl = "url('" + fresh.replace(/'/g, "\\'") + "')";
            layer.style.setProperty('--doc-tools-bg-url', cssUrl);
            layer.style.backgroundImage = cssUrl;
        }

        applyBackground();

        var bgRetried = false;
        var probe = new Image();
        probe.onload = applyBackground;
        probe.onerror = function () {
            if (!bgRetried) {
                bgRetried = true;
                reloadBackground();
            }
        };
        probe.src = bgUrl;

        window.addEventListener('pageshow', function (ev) {
            if (ev.persisted) reloadBackground();
        });
    }

    function initDocToolsFeedbackUi() {
        if (!document.body.classList.contains('doc-tools-page')) return;
        var modal = document.getElementById('hf-feedback-modal');
        var toast = document.getElementById('hf-feedback-toast');
        if (modal) {
            if (modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            modal.style.display = 'none';
        }
        if (toast && toast.parentElement !== document.body) {
            document.body.appendChild(toast);
        }
    }

    function initColumnFillTool() {
        if (!document.getElementById('column-fill-excel-input')) return;

        initDocToolsFeedbackUi();
        initDocToolsExportConfirm();
        initDocToolsNavLeaveGuard();
        initDtkDeleteConfirmModal();
        ensureDocToolsPageBackground();

        var fileInput = document.getElementById('column-fill-excel-input');
        var reimportBtn = document.getElementById('cf-reimport-btn');
        var exportBtn = document.getElementById('cf-export-btn');

        if (fileInput) {
            fileInput.addEventListener('change', function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                validateDocToolsExcelFile(file).then(function (result) {
                    if (!result.ok) {
                        clearDocToolsExcelSelection(fileInput);
                        docToolsToast(result.error || 'Excel 文件校验未通过', { variant: 'warning' });
                        return;
                    }
                    columnFillExcelFile = result.file;
                    docToolsExportedSinceLoad = false;
                    parseAndRenderExcel(result.file).then(function () {
                        if (globalThis.DocToolsAiPanel && typeof globalThis.DocToolsAiPanel.resetSession === 'function') {
                            globalThis.DocToolsAiPanel.resetSession();
                        }
                        syncDocToolsFileActions(result.file);
                        syncDocToolsTableImportOverlay(false);
                        docToolsToast('Excel 已解析到表格', { variant: 'success' });
                        try {
                            document.dispatchEvent(new CustomEvent('doc-tools-excel-imported', { bubbles: true }));
                        } catch (eImport) { /* ignore */ }
                        if (typeof globalThis.__openDocToolsAiPanelAfterImport === 'function') {
                            globalThis.__openDocToolsAiPanelAfterImport();
                        }
                    }).catch(function (err) {
                        clearDocToolsExcelSelection(fileInput);
                        docToolsToast((err && err.message) || 'Excel 解析失败', { variant: 'warning' });
                    });
                });
            });
        }

        if (reimportBtn && fileInput) {
            reimportBtn.addEventListener('click', function () {
                fileInput.value = '';
                fileInput.click();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                openDocToolsExportConfirm();
            });
        }

        syncDocToolsFileActions(columnFillExcelFile);
        syncDocToolsTableImportOverlay(!columnFillExcelFile);
    }

    function normalizeDocToolsMatrixForAi(matrix) {
        if (!Array.isArray(matrix) || !matrix.length) {
            return Promise.reject(new Error('无效的表格数据'));
        }
        var rows = [];
        var colCount = 0;
        for (var i = 0; i < matrix.length; i += 1) {
            var row = matrix[i];
            if (!Array.isArray(row)) {
                return Promise.reject(new Error('表格数据格式无效'));
            }
            var line = row.map(function (cell) { return cell == null ? '' : String(cell); });
            if (!colCount) colCount = line.length;
            else if (line.length !== colCount) {
                return Promise.reject(new Error('表格每行列数不一致'));
            }
            rows.push(line);
        }
        if (!colCount) {
            return Promise.reject(new Error('表格列数不能为 0'));
        }
        return Promise.resolve(rows);
    }

    function applyDocToolsTableMatrixFromAi(matrix, sourceMatrix) {
        var validated = matrix;
        if (globalThis.DocToolsAiResponse &&
            typeof globalThis.DocToolsAiResponse.validateMatrixAgainstSource === 'function') {
            try {
                validated = globalThis.DocToolsAiResponse.validateMatrixAgainstSource(matrix, sourceMatrix);
            } catch (err) {
                return Promise.reject(err);
            }
        }
        return normalizeDocToolsMatrixForAi(validated).then(function (rows) {
            return loadMatrixIntoTable(rows);
        });
    }

    globalThis.readDocToolsTableMatrixFromGrid = readDocToolsTableMatrixFromGrid;
    globalThis.applyDocToolsTableMatrixFromAi = applyDocToolsTableMatrixFromAi;

    globalThis.DocToolsExcelUpload = {
        validateFile: validateDocToolsExcelFile,
        parseFile: parseAndRenderExcel,
        exportTable: exportDocToolsTableToExcel,
        getFile: function () { return columnFillExcelFile; },
        clear: function () {
            var fileInput = document.getElementById('column-fill-excel-input');
            clearDocToolsExcelSelection(fileInput);
        }
    };


    document.addEventListener('DOMContentLoaded', initColumnFillTool);
})();
