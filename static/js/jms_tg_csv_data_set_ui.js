/**
 * 线程组配置元件 · CSV 数据文件设置弹窗 UI（隔离模块，仅 modal-tg-config-drawer-csv-data-set）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'modal-tg-config-drawer-csv-data-set';
    var UI_VERSION = '12';
    var LEGACY_FALLBACK_INPUT_ID = 'tg-csv-legacy-fallback-upload';
    var LEGACY_BROWSE_BTN_ID = 'btn-tg-csv-legacy-browse';
    var LEGACY_PICK_HINT_ID = 'tg-csv-legacy-pick-hint';
    var ENCODING_DATALIST_ID = 'jms-tg-csv-v2-encoding-options';
    var UPLOAD_CONTENT_KEY = 'tgCsvUploadContent';
    var UPLOAD_PATH_KEY = 'tgCsvUploadAbsPath';
    var PATH_MANUAL_HINT = '已读取 CSV 内容。浏览器无法自动获取本机绝对路径，请在文件名字段填写 JMeter 所在机器上的绝对路径（如 D:\\data\\test.csv）';

    var ENCODINGS = ['UTF-8', 'GBK', 'GB2312', 'ISO-8859-1', 'US-ASCII'];

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function getCatalog() {
        return global.JmsTgConfigCatalog;
    }

    function getLocalPicker() {
        return global.JmsTgCsvLocalFilePicker;
    }

    function detectTgCsvClientPlatform() {
        var ua = '';
        var platform = '';
        try {
            ua = String(global.navigator && global.navigator.userAgent || '');
            platform = String(global.navigator && global.navigator.platform || '');
        } catch (e) { /* ignore */ }
        var blob = (ua + ' ' + platform).toLowerCase();
        if (/win/i.test(platform) || /windows/i.test(blob)) return 'windows';
        if (/mac/i.test(platform) || /macintosh|mac os x/i.test(blob)) return 'mac';
        if (/linux/i.test(platform) || /linux/i.test(blob)) return 'linux';
        return 'unknown';
    }

    function blankFormData() {
        return {
            name: '', comments: '', filename: '', source_path: '', file_encoding: '', variable_names: '',
            ignore_first_line: false, delimiter: '', quoted_data: false,
            recycle: false, stop_thread: false, share_mode: '', file_content: ''
        };
    }

    function resolveRenderData(item) {
        if (item && item.data && typeof item.data === 'object') {
            return item.data;
        }
        return blankFormData();
    }

    function textField(label, fieldName, value, placeholder, hint) {
        return '<label class="jms-tg-csv-v2__field">' +
            '<span class="jms-tg-csv-v2__label">' + esc(label) + (hint ? '<span class="jms-tg-csv-v2__hint">' + esc(hint) + '</span>' : '') + '</span>' +
            '<input type="text" class="hf-mono jms-tg-csv-v2__input" data-cfg-field="' + fieldName + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
            '</label>';
    }

    function boolSelect(label, fieldName, value, hint) {
        var v = value ? 'true' : 'false';
        return '<label class="jms-tg-csv-v2__field">' +
            '<span class="jms-tg-csv-v2__label">' + esc(label) + (hint ? '<span class="jms-tg-csv-v2__hint">' + esc(hint) + '</span>' : '') + '</span>' +
            '<select class="jms-tg-csv-v2__input jms-tg-csv-v2__select" data-cfg-field="' + fieldName + '" data-cfg-bool="1">' +
            '<option value="false"' + (v === 'false' ? ' selected' : '') + '>False</option>' +
            '<option value="true"' + (v === 'true' ? ' selected' : '') + '>True</option>' +
            '</select></label>';
    }

    function encodingCombobox(d) {
        var cur = d.file_encoding !== undefined && d.file_encoding !== null ? String(d.file_encoding) : '';
        var opts = ENCODINGS.map(function (enc) {
            return '<option value="' + esc(enc) + '"></option>';
        }).join('');
        return '<label class="jms-tg-csv-v2__field">' +
            '<span class="jms-tg-csv-v2__label">文件编码</span>' +
            '<input type="text" class="hf-mono jms-tg-csv-v2__input jms-tg-csv-v2__encoding-input" data-cfg-field="file_encoding" value="' + esc(cur) + '" list="' + ENCODING_DATALIST_ID + '" placeholder="" autocomplete="off">' +
            '<datalist id="' + ENCODING_DATALIST_ID + '">' + opts + '</datalist>' +
            '</label>';
    }

    function shareModeSelect(d) {
        var sm = d.share_mode !== undefined && d.share_mode !== null ? String(d.share_mode) : '';
        return '<label class="jms-tg-csv-v2__field jms-tg-csv-v2__field--full">' +
            '<span class="jms-tg-csv-v2__label">线程共享模式</span>' +
            '<select class="jms-tg-csv-v2__input jms-tg-csv-v2__select" data-cfg-field="share_mode">' +
            '<option value=""' + (sm === '' ? ' selected' : '') + '></option>' +
            '<option value="shareMode.all"' + (sm === 'shareMode.all' ? ' selected' : '') + '>所有线程</option>' +
            '<option value="shareMode.group"' + (sm === 'shareMode.group' ? ' selected' : '') + '>当前线程组</option>' +
            '<option value="shareMode.thread"' + (sm === 'shareMode.thread' ? ' selected' : '') + '>当前线程</option>' +
            '</select></label>';
    }

    function resolveFilenameDisplay(d) {
        if (!d) return '';
        if (d.source_path && String(d.source_path).trim()) {
            return String(d.source_path).trim();
        }
        return d.filename !== undefined && d.filename !== null ? String(d.filename) : '';
    }

    function renderCsvDataSetBody(item) {
        var d = resolveRenderData(item);
        if (item && item.name && !d.name) d.name = item.name;
        var filenameDisplay = resolveFilenameDisplay(d);
        return '<div class="jms-tg-csv-v2" data-csv-ui-version="' + UI_VERSION + '">' +
            '<section class="jms-tg-csv-v2__card jms-tg-csv-v2__card--meta">' +
            '<div class="jms-tg-csv-v2__meta-row">' +
            textField('名称', 'name', d.name, '', '') +
            textField('注释', 'comments', d.comments, '', '') +
            '</div></section>' +
            '<section class="jms-tg-csv-v2__card">' +
            '<h4 class="jms-tg-csv-v2__card-title">设置 CSV 数据文件</h4>' +
            '<label class="jms-tg-csv-v2__field jms-tg-csv-v2__field--filename">' +
            '<span class="jms-tg-csv-v2__label">文件名</span>' +
            '<div class="jms-tg-csv-v2__filename-row">' +
            '<input type="text" class="hf-mono jms-tg-csv-v2__input" data-cfg-field="filename" value="' + esc(filenameDisplay) + '" placeholder="" title="' + esc(filenameDisplay) + '">' +
            '<button type="button" class="jms-tg-csv-v2__browse-btn" data-tg-csv-browse><span>浏览…</span></button>' +
            '<input type="file" class="jms-tg-config-csv-upload jms-tg-csv-v2__upload" accept=".csv,text/csv,text/plain" hidden>' +
            '</div>' +
            '<p class="jms-tg-csv-v2__path-hint" data-tg-csv-path-hint hidden></p>' +
            '</label>' +
            '<div class="jms-tg-csv-v2__grid jms-tg-csv-v2__grid--2">' +
            encodingCombobox(d) +
            textField('变量名称', 'variable_names', d.variable_names, '', '') +
            '</div></section>' +
            '<section class="jms-tg-csv-v2__card">' +
            '<h4 class="jms-tg-csv-v2__card-title">格式与分隔</h4>' +
            '<div class="jms-tg-csv-v2__grid jms-tg-csv-v2__grid--2">' +
            textField('分隔符', 'delimiter', d.delimiter, '', '') +
            boolSelect('忽略首行', 'ignore_first_line', d.ignore_first_line, '') +
            '</div>' +
            '<div class="jms-tg-csv-v2__grid jms-tg-csv-v2__grid--1">' +
            boolSelect('是否允许带引号', 'quoted_data', d.quoted_data, '') +
            '</div></section>' +
            '<section class="jms-tg-csv-v2__card">' +
            '<h4 class="jms-tg-csv-v2__card-title">文件结束与共享</h4>' +
            '<div class="jms-tg-csv-v2__grid jms-tg-csv-v2__grid--2">' +
            boolSelect('遇到文件结束符再次循环', 'recycle', d.recycle === true, '') +
            boolSelect('遇到文件结束符停止线程', 'stop_thread', d.stop_thread === true, '') +
            '</div>' +
            shareModeSelect(d) +
            '</section></div>';
    }

    function readBoolField(body, fieldName, def) {
        var el = body.querySelector('[data-cfg-field="' + fieldName + '"]');
        if (!el) return def;
        if (el.getAttribute('data-cfg-bool') === '1') return el.value === 'true';
        if (el.type === 'checkbox') return !!el.checked;
        return def;
    }

    function getModalFromBody(body) {
        if (!body) return null;
        return body.closest('#' + MODAL_ID);
    }

    function syncTgCsvUploadPath(modal, absPath) {
        if (!modal) return;
        if (absPath !== undefined && absPath !== null && String(absPath).trim()) {
            modal.dataset[UPLOAD_PATH_KEY] = String(absPath).trim();
        } else {
            delete modal.dataset[UPLOAD_PATH_KEY];
        }
    }

    function readTgCsvStoredPath(modal, priorData) {
        if (modal && modal.dataset[UPLOAD_PATH_KEY]) {
            return modal.dataset[UPLOAD_PATH_KEY];
        }
        if (priorData && priorData.source_path && String(priorData.source_path).trim()) {
            return String(priorData.source_path).trim();
        }
        if (priorData && priorData.filename && isTgCsvRealAbsolutePath(priorData.filename)) {
            return String(priorData.filename).trim();
        }
        return '';
    }

    function syncTgCsvUploadContent(modal, content) {
        if (!modal) return;
        if (content !== undefined && content !== null && String(content).length) {
            modal.dataset[UPLOAD_CONTENT_KEY] = String(content);
        } else {
            delete modal.dataset[UPLOAD_CONTENT_KEY];
        }
    }

    function readTgCsvStoredContent(modal, priorData) {
        if (modal && modal.dataset[UPLOAD_CONTENT_KEY] !== undefined) {
            return modal.dataset[UPLOAD_CONTENT_KEY];
        }
        if (priorData && priorData.file_content) return String(priorData.file_content);
        return '';
    }

    function setTgCsvPathHint(modal, message, isError) {
        if (!modal) return;
        var hint = modal.querySelector('[data-tg-csv-path-hint]');
        if (!hint) return;
        if (!message) {
            hint.hidden = true;
            hint.textContent = '';
            hint.classList.remove('jms-tg-csv-v2__path-hint--error');
            return;
        }
        hint.hidden = false;
        hint.textContent = message;
        hint.classList.toggle('jms-tg-csv-v2__path-hint--error', !!isError);
    }

    function isTgCsvFakePath(pathStr) {
        return /fakepath/i.test(String(pathStr || ''));
    }

    function isTgCsvRealAbsolutePath(pathStr) {
        var Picker = getLocalPicker();
        if (Picker && typeof Picker.isRealAbsolutePath === 'function') {
            return Picker.isRealAbsolutePath(pathStr);
        }
        if (!pathStr) return false;
        var p = String(pathStr).trim();
        if (!p || isTgCsvFakePath(p)) return false;
        if (p.charAt(0) === '/') return true;
        if (/^[A-Za-z]:[\\/]/.test(p)) return true;
        if (p.indexOf('\\\\') >= 0) return true;
        return false;
    }

    function applyTgCsvFilenameFromUpload(modal, displayPath) {
        if (!modal || !displayPath) return;
        if (!isTgCsvRealAbsolutePath(displayPath)) return;
        var fn = modal.querySelector('[data-cfg-field="filename"]');
        if (!fn) return;
        fn.value = displayPath;
        fn.setAttribute('title', displayPath);
        syncTgCsvUploadPath(modal, displayPath);
        setTgCsvPathHint(modal, '', false);
        try {
            fn.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { /* IE 兼容忽略 */ }
    }

    function applyTgCsvPickResult(modal, result) {
        if (!modal || !result) return;
        syncTgCsvUploadContent(modal, result.content);
        if (result.absolutePath && isTgCsvRealAbsolutePath(result.absolutePath)) {
            applyTgCsvFilenameFromUpload(modal, result.absolutePath);
            setTgCsvPathHint(modal, '已读取文件并填入本机绝对路径', false);
            return;
        }
        var fn = modal.querySelector('[data-cfg-field="filename"]');
        var basename = result.file && result.file.name ? String(result.file.name) : '';
        if (fn && !isTgCsvRealAbsolutePath(fn.value) && basename) {
            fn.value = basename;
            fn.setAttribute('title', basename);
        }
        setTgCsvPathHint(modal, PATH_MANUAL_HINT, false);
    }

    function bindCsvBrowse(modal) {
        if (!modal) return;
        var browse = modal.querySelector('[data-tg-csv-browse]');
        var upload = modal.querySelector('.jms-tg-csv-v2__upload, .jms-tg-config-csv-upload');
        if (!browse || browse._jmsTgCsvBrowseBound === '1') return;
        browse._jmsTgCsvBrowseBound = '1';
        browse.addEventListener('click', function () {
            var Picker = getLocalPicker();
            if (!Picker || typeof Picker.pickTgCsvLocalFile !== 'function') {
                setTgCsvPathHint(modal, '本地文件选择模块未加载', true);
                return;
            }
            setTgCsvPathHint(modal, '', false);
            Picker.pickTgCsvLocalFile(upload).then(function (result) {
                if (!result) return;
                applyTgCsvPickResult(modal, result);
            }).catch(function (err) {
                var msg = err && err.message ? err.message : '选择文件失败，请重试';
                setTgCsvPathHint(modal, msg, true);
            });
        });
    }

    function afterRender(modal, priorData) {
        if (!modal) return;
        syncTgCsvUploadContent(modal, priorData && priorData.file_content ? priorData.file_content : '');
        var storedPath = readTgCsvStoredPath(modal, priorData);
        if (storedPath) {
            syncTgCsvUploadPath(modal, storedPath);
            applyTgCsvFilenameFromUpload(modal, storedPath);
        }
        bindCsvBrowse(modal);
    }

    function readCsvDataSetFromBody(body, priorData) {
        var out = blankFormData();
        if (priorData && typeof priorData === 'object') {
            Object.keys(out).forEach(function (k) {
                if (priorData[k] !== undefined) out[k] = priorData[k];
            });
        }
        if (!body) return out;
        var modal = getModalFromBody(body);
        var nameEl = body.querySelector('[data-cfg-field="name"]');
        var commentsEl = body.querySelector('[data-cfg-field="comments"]');
        out.name = nameEl ? nameEl.value.trim() : '';
        out.comments = commentsEl ? commentsEl.value : '';
        ['file_encoding', 'variable_names', 'delimiter', 'share_mode'].forEach(function (f) {
            var el = body.querySelector('[data-cfg-field="' + f + '"]');
            if (el) out[f] = el.value.trim();
        });
        var fnEl = body.querySelector('[data-cfg-field="filename"]');
        var filenameInput = fnEl ? String(fnEl.value || '').trim() : '';
        var storedPath = readTgCsvStoredPath(modal, priorData);
        if (storedPath && isTgCsvRealAbsolutePath(storedPath)) {
            out.source_path = storedPath;
            out.filename = storedPath;
        } else if (filenameInput && isTgCsvRealAbsolutePath(filenameInput)) {
            out.filename = filenameInput;
            out.source_path = filenameInput;
        } else {
            out.filename = filenameInput;
            if (storedPath) out.source_path = storedPath;
        }
        out.file_content = readTgCsvStoredContent(modal, priorData);
        out.ignore_first_line = readBoolField(body, 'ignore_first_line', false);
        out.quoted_data = readBoolField(body, 'quoted_data', false);
        out.recycle = readBoolField(body, 'recycle', false);
        out.stop_thread = readBoolField(body, 'stop_thread', false);
        return out;
    }

    function captureTgCsvUploadPathSync(uploadEl) {
        if (!uploadEl || !uploadEl.value) return '';
        return String(uploadEl.value).trim();
    }

    function resolveTgCsvNativeFilePath(file) {
        if (!file) return '';
        if (file.path && String(file.path).trim()) {
            return String(file.path).trim();
        }
        return '';
    }

    function resolveTgCsvUploadDisplayPath(uploadEl, file) {
        var Picker = getLocalPicker();
        if (Picker && typeof Picker.resolveLocalAbsolutePath === 'function') {
            return Picker.resolveLocalAbsolutePath(file, uploadEl);
        }
        var nativePath = resolveTgCsvNativeFilePath(file);
        if (isTgCsvRealAbsolutePath(nativePath)) return nativePath;
        var syncPath = captureTgCsvUploadPathSync(uploadEl);
        if (isTgCsvRealAbsolutePath(syncPath)) return syncPath;
        return '';
    }

    function setLegacyMgrCsvHint(message) {
        var hint = global.document.getElementById(LEGACY_PICK_HINT_ID);
        if (!hint) return;
        hint.textContent = message || '未选择文件';
    }

    function legacyMgrCsvHintForData(csv) {
        if (!csv || !csv.file_content) return '未选择文件';
        var name = csv.filename ? String(csv.filename).trim() : '';
        return '已加载 CSV 内容' + (name ? '（' + name + '）' : '');
    }

    /**
     * 旧版 modal-tg-http-mgr CSV 面板：将本地选文件结果写入 legacy 表单字段。
     * 独立于 drawer 的 applyTgCsvPickResult，避免影响树形配置抽屉。
     */
    function applyLegacyMgrCsvPickResult(result) {
        if (!result) return null;
        var content = result.content != null ? String(result.content) : '';
        var filenameEl = global.document.getElementById('tg-csv-filename');
        var namesEl = global.document.getElementById('tg-csv-variable-names');
        var basename = result.file && result.file.name ? String(result.file.name) : '';
        var displayPath = result.absolutePath && isTgCsvRealAbsolutePath(result.absolutePath)
            ? String(result.absolutePath).trim()
            : '';
        var filename = '';
        if (filenameEl) {
            var cur = String(filenameEl.value || '').trim();
            if (displayPath) {
                filenameEl.value = displayPath;
                filename = displayPath;
            } else if (!cur && basename) {
                filenameEl.value = basename;
                filename = basename;
            } else {
                filename = cur || basename;
            }
        } else {
            filename = displayPath || basename;
        }
        if (namesEl && !String(namesEl.value || '').trim() && content) {
            var firstLine = content.split(/\r?\n/).find(function (line) { return line.trim(); }) || '';
            if (firstLine) namesEl.value = firstLine.trim();
        }
        var hint = basename
            ? '已加载：' + basename + '（' + content.length + ' 字符）'
            : ('已加载 CSV（' + content.length + ' 字符）');
        if (displayPath) {
            hint += ' · 已填入本机绝对路径';
        } else if (content) {
            hint += ' · 请在文件名字段填写 JMeter 运行机上的绝对路径';
        }
        setLegacyMgrCsvHint(hint);
        return { filename: filename, file_content: content };
    }

    /**
     * 绑定旧版 HTTP 管理器弹窗中的 CSV 浏览按钮（一次性）。
     * @param {{ onApplied?: function({filename:string,file_content:string}) }} opts
     */
    function bindLegacyMgrCsvBrowse(opts) {
        var btn = global.document.getElementById(LEGACY_BROWSE_BTN_ID);
        var fallback = global.document.getElementById(LEGACY_FALLBACK_INPUT_ID);
        if (!btn || btn._jmsTgCsvLegacyBrowseBound === '1') return;
        btn._jmsTgCsvLegacyBrowseBound = '1';
        btn.addEventListener('click', function () {
            var Picker = getLocalPicker();
            if (!Picker || typeof Picker.pickTgCsvLocalFile !== 'function') {
                setLegacyMgrCsvHint('本地文件选择模块未加载');
                return;
            }
            setLegacyMgrCsvHint('');
            Picker.pickTgCsvLocalFile(fallback).then(function (result) {
                if (!result) {
                    setLegacyMgrCsvHint('未选择文件');
                    return;
                }
                var applied = applyLegacyMgrCsvPickResult(result);
                if (applied && opts && typeof opts.onApplied === 'function') {
                    opts.onApplied(applied);
                }
            }).catch(function (err) {
                var msg = err && err.message ? err.message : '选择文件失败，请重试';
                setLegacyMgrCsvHint(msg);
            });
        });
    }

    global.JmsTgCsvDataSetUi = {
        MODAL_ID: MODAL_ID,
        UI_VERSION: UI_VERSION,
        blankFormData: blankFormData,
        renderCsvDataSetBody: renderCsvDataSetBody,
        readCsvDataSetFromBody: readCsvDataSetFromBody,
        afterRender: afterRender,
        resolveFilenameDisplay: resolveFilenameDisplay,
        detectTgCsvClientPlatform: detectTgCsvClientPlatform,
        captureTgCsvUploadPathSync: captureTgCsvUploadPathSync,
        isTgCsvRealAbsolutePath: isTgCsvRealAbsolutePath,
        resolveTgCsvUploadDisplayPath: resolveTgCsvUploadDisplayPath,
        applyTgCsvFilenameFromUpload: applyTgCsvFilenameFromUpload,
        applyTgCsvPickResult: applyTgCsvPickResult,
        setLegacyMgrCsvHint: setLegacyMgrCsvHint,
        legacyMgrCsvHintForData: legacyMgrCsvHintForData,
        applyLegacyMgrCsvPickResult: applyLegacyMgrCsvPickResult,
        bindLegacyMgrCsvBrowse: bindLegacyMgrCsvBrowse
    };
}(typeof window !== 'undefined' ? window : this));
