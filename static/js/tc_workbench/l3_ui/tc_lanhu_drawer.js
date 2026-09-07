/**
 * TestHub TC Workbench — L3 UI
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */

function autoGrowTcPresetLanhuField(el) {
    if (!el) return;
    if (el.tagName === 'INPUT') return;
    var style = window.getComputedStyle(el);
    var lineHeight = parseFloat(style.lineHeight);
    if (!lineHeight || isNaN(lineHeight)) lineHeight = 16;
    var padTop = parseFloat(style.paddingTop) || 0;
    var padBot = parseFloat(style.paddingBottom) || 0;
    var borderY = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    var oneLine = Math.ceil(lineHeight + padTop + padBot + borderY);
    var twoLine = Math.ceil(lineHeight * 2 + padTop + padBot + borderY);
    el.style.height = 'auto';
    var scrollH = el.scrollHeight;
    if (scrollH <= oneLine + 2) {
        el.style.height = oneLine + 'px';
        el.style.overflowY = 'hidden';
    } else if (scrollH <= twoLine + 2) {
        el.style.height = scrollH + 'px';
        el.style.overflowY = 'hidden';
    } else {
        el.style.height = twoLine + 'px';
        el.style.overflowY = 'auto';
    }
}

function getActiveLanhuCookieEl() {
    return document.getElementById('lanhu-cookie');
}

function openLanhuCookieModal() {
    var modal = document.getElementById('lanhu-cookie-modal');
    var main = getActiveLanhuCookieEl();
    var editor = document.getElementById('lanhu-cookie-modal-input');
    if (!modal || !editor) return;
    editor.value = main ? main.value : '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    editor.focus();
}

function closeLanhuCookieModal() {
    var modal = document.getElementById('lanhu-cookie-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function initTcPresetLanhuFields() {
    var cookieEl = document.getElementById('lanhu-cookie');
    var urlEl = document.getElementById('lanhu-url');
    [cookieEl, urlEl].forEach(function(el) {
        if (!el) return;
        el.addEventListener('input', function() { autoGrowTcPresetLanhuField(el); });
        autoGrowTcPresetLanhuField(el);
    });
    var modal = document.getElementById('lanhu-cookie-modal');
    var cancelBtn = document.getElementById('lanhu-cookie-modal-cancel');
    var saveBtn = document.getElementById('lanhu-cookie-modal-save');
    if (cookieEl) {
        cookieEl.addEventListener('dblclick', function(e) {
            e.preventDefault();
            openLanhuCookieModal();
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closeLanhuCookieModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeLanhuCookieModal();
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            var editor = document.getElementById('lanhu-cookie-modal-input');
            var activeCookieEl = getActiveLanhuCookieEl();
            if (activeCookieEl && editor) activeCookieEl.value = editor.value;
            autoGrowTcPresetLanhuField(activeCookieEl);
            closeLanhuCookieModal();
        });
    }
    document.addEventListener('keydown', function lanhuCookieModalEsc(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeLanhuCookieModal();
    });
    initTcLanhuSectionToggle();
    initTcLanhuConfigReveal();
}

function getTcLanhuRevealInputForBtn(btn) {
    if (!btn) return null;
    var shell = btn.closest('.tc-preset-lanhu__input-shell');
    return shell ? shell.querySelector('.tc-preset-lanhu__input') : null;
}

function getTcLanhuRevealFieldLabel(input) {
    if (!input) return '内容';
    if (input.id === 'lanhu-cookie') return 'Cookie';
    if (input.id === 'lanhu-url') return 'URL';
    return '内容';
}

function syncTcLanhuRevealButton(btn) {
    var input = getTcLanhuRevealInputForBtn(btn);
    if (!input || !btn) return;
    var revealed = input.type === 'text';
    var label = getTcLanhuRevealFieldLabel(input);
    var title = revealed ? ('隐藏' + label) : ('显示' + label);
    btn.setAttribute('aria-pressed', revealed ? 'true' : 'false');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.classList.toggle('tc-preset-lanhu__reveal-btn--active', revealed);
    var showIcon = btn.querySelector('.tc-preset-lanhu__reveal-icon--show');
    var hideIcon = btn.querySelector('.tc-preset-lanhu__reveal-icon--hide');
    if (showIcon) showIcon.classList.toggle('hidden', revealed);
    if (hideIcon) hideIcon.classList.toggle('hidden', !revealed);
}

function setTcLanhuFieldRevealed(input, revealed) {
    if (!input) return;
    input.type = revealed ? 'text' : 'password';
    var shell = input.closest('.tc-preset-lanhu__input-shell');
    var btn = shell ? shell.querySelector('.tc-preset-lanhu__reveal-btn') : null;
    if (btn) syncTcLanhuRevealButton(btn);
}

function toggleTcLanhuFieldReveal(btn) {
    var input = getTcLanhuRevealInputForBtn(btn);
    if (!input) return;
    setTcLanhuFieldRevealed(input, input.type !== 'text');
}

function initTcLanhuConfigReveal() {
    var buttons = document.querySelectorAll('.tc-preset-lanhu__reveal-btn');
    if (!buttons.length) return;
    buttons.forEach(function(btn) {
        if (btn.dataset.tcLanhuRevealBound === '1') return;
        btn.dataset.tcLanhuRevealBound = '1';
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTcLanhuFieldReveal(btn);
        });
        var input = getTcLanhuRevealInputForBtn(btn);
        if (input) setTcLanhuFieldRevealed(input, false);
    });
}

function toggleTcLanhuSection(forceExpand) {
    var root = document.getElementById('ai-config-mode-root');
    var btn = document.getElementById('tc-lanhu-section-toggle');
    if (!root || !btn) return;
    var expand = typeof forceExpand === 'boolean'
        ? forceExpand
        : root.classList.contains('tc-lanhu-section--collapsed');
    root.classList.toggle('tc-lanhu-section--collapsed', !expand);
    btn.setAttribute('aria-expanded', expand ? 'true' : 'false');
    btn.title = expand ? '收起蓝湖需求' : '展开蓝湖需求';
    btn.classList.toggle('tc-lanhu-section-toggle--collapsed', !expand);
    var zone = document.getElementById('tc-gen-instruction-zone');
    var drawerContent = document.getElementById('drawer-1-content');
    if (zone) zone.classList.toggle('tc-gen-lanhu-open', expand);
    if (drawerContent) drawerContent.classList.toggle('tc-gen-lanhu-open', expand);
    if (typeof syncTcGenLanhuOverlayLayout === 'function') {
        syncTcGenLanhuOverlayLayout();
    }
    refreshTcGenChatAfterLanhuToggle(expand);
}
window.toggleTcLanhuSection = toggleTcLanhuSection;

/** 蓝湖 overlay 切换后仅同步穿透层与滚动，不触发整页高度重算（避免对话区闪动） */
function refreshTcGenChatAfterLanhuToggle(lanhuExpanded) {
    var scrollState = typeof captureTcGenChatScrollState === 'function'
        ? captureTcGenChatScrollState()
        : null;
    if (scrollState && typeof restoreTcGenChatScrollState === 'function') {
        restoreTcGenChatScrollState(scrollState);
    }
}

/** 用例生成弹窗展开时默认打开蓝湖需求区（已展开则跳过） */
function openTcLanhuSectionOnGenPanel() {
    if (!document.querySelector('.tc-workbench-scope')) return;
    var root = document.getElementById('ai-config-mode-root');
    if (!root || !root.classList.contains('tc-lanhu-section--collapsed')) return;
    toggleTcLanhuSection(true);
}
window.openTcLanhuSectionOnGenPanel = openTcLanhuSectionOnGenPanel;

function isTcLanhuSectionExpanded() {
    var root = document.getElementById('ai-config-mode-root');
    return !!(root && !root.classList.contains('tc-lanhu-section--collapsed'));
}

function isTcLanhuDismissExemptTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!(
        target.closest('#ai-config-mode-root') ||
        target.closest('#tc-lanhu-section-toggle') ||
        target.closest('#tc-wb-history-toggle') ||
        target.closest('#tc-wb-new-chat-btn') ||
        target.closest('#tc-wb-history-panel') ||
        target.closest('#tc-drawer-tabs-root') ||
        target.closest('#lanhu-cookie-modal')
    );
}

function maybeCollapseTcLanhuSectionOnOutsideClick(ev) {
    if (!document.querySelector('.tc-workbench-scope')) return;
    if (!isTcLanhuSectionExpanded()) return;
    var panel = document.getElementById('left-panel');
    if (!panel || !panel.contains(ev.target)) return;
    if (isTcLanhuDismissExemptTarget(ev.target)) return;
    toggleTcLanhuSection(false);
}
window.maybeCollapseTcLanhuSectionOnOutsideClick = maybeCollapseTcLanhuSectionOnOutsideClick;

function maybeCollapseTcLanhuSectionOnGenChatPointer() {
    if (!isTcLanhuSectionExpanded()) return;
    toggleTcLanhuSection(false);
}

function initTcGenChatLanhuDismiss() {
    var chatPanel = document.getElementById('tc-gen-chat-panel');
    if (!chatPanel || chatPanel.dataset.tcLanhuChatDismissBound === '1') return;
    chatPanel.dataset.tcLanhuChatDismissBound = '1';
    chatPanel.addEventListener('mousedown', maybeCollapseTcLanhuSectionOnGenChatPointer, true);
}

function initTcLanhuClickOutsideDismiss() {
    if (window._tcLanhuClickOutsideBound) return;
    window._tcLanhuClickOutsideBound = true;
    document.addEventListener('mousedown', maybeCollapseTcLanhuSectionOnOutsideClick, true);
    initTcGenChatLanhuDismiss();
}

function initTcLanhuSectionToggle() {
    var btn = document.getElementById('tc-lanhu-section-toggle');
    if (!btn || btn.dataset.tcLanhuToggleBound === '1') return;
    btn.dataset.tcLanhuToggleBound = '1';
    btn.addEventListener('click', function() {
        toggleTcLanhuSection();
    });
    var root = document.getElementById('ai-config-mode-root');
    if (root) {
        var expanded = !root.classList.contains('tc-lanhu-section--collapsed');
        var zone = document.getElementById('tc-gen-instruction-zone');
        var drawerContent = document.getElementById('drawer-1-content');
        if (zone) zone.classList.toggle('tc-gen-lanhu-open', expanded);
        if (drawerContent) drawerContent.classList.toggle('tc-gen-lanhu-open', expanded);
    }
    initTcLanhuClickOutsideDismiss();
}


function tcStripLanhuPageId(text) {
    return String(text || '')
        .replace(/[\uFF08(]\s*pageId\s*=\s*[^\uFF09)\n]*[\uFF09)]/gi, '')
        .trim();
}

function tcEscapeLanhuPreviewHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function tcBuildLanhuPageSummarySnippet(pageName, lines, knownPageNames) {
    var name = String(pageName || '').trim();
    var known = {};
    (knownPageNames || []).forEach(function (n) {
        var key = String(n || '').trim();
        if (key) known[key] = true;
    });
    if (name) known[name] = true;
    var filtered = (lines || []).filter(function (line) {
        var t = String(line || '').trim();
        if (!t) return false;
        if (/^#{1,6}\s*\d+\.\s*/.test(t)) return false;
        if (known[t]) return false;
        if (name && t === name) return false;
        return true;
    });
    if (!filtered.length) return '';
    var text = filtered.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 72) text = text.slice(0, 72) + '…';
    return text;
}

function tcExtractLanhuPageTags(pageName, lines, knownPageNames) {
    var name = String(pageName || '').trim();
    var known = {};
    (knownPageNames || []).forEach(function (n) {
        var key = String(n || '').trim();
        if (key) known[key] = true;
    });
    if (name) known[name] = true;
    var filtered = (lines || []).filter(function (line) {
        var t = String(line || '').trim();
        if (!t) return false;
        if (/^#{1,6}\s*\d+\.\s*/.test(t)) return false;
        if (known[t]) return false;
        if (name && t === name) return false;
        return true;
    });
    for (var i = 0; i < filtered.length; i++) {
        var t = String(filtered[i] || '').trim();
        if (t.indexOf('标签：') === 0) return t.slice(3).trim();
        if (t.indexOf('·') >= 0 || t.indexOf('•') >= 0) return t;
    }
    return tcBuildLanhuPageSummarySnippet(pageName, lines, knownPageNames);
}

function tcParseLanhuSummaryForPreview(summary) {
    var raw = tcStripLanhuPageId(summary);
    if (!raw) return null;
    var lines = raw.split(/\r?\n/);
    var docName = '';
    var currentPage = '';
    var pageCount = '';
    var pageNames = [];
    var pageSummaries = [];
    var pageSections = [];
    var inBody = false;
    var sectionName = '';
    var sectionLines = [];
    function flushSection() {
        if (sectionName) {
            var tags = tcExtractLanhuPageTags(sectionName, sectionLines, pageNames);
            pageSections.push({ name: sectionName, tags: tags });
        }
        var snippet = tcBuildLanhuPageSummarySnippet(sectionName, sectionLines, pageNames);
        if (snippet) pageSummaries.push(snippet);
        sectionName = '';
        sectionLines = [];
    }
    lines.forEach(function (line) {
        var t = String(line || '').trim();
        if (!t) return;
        if (t === '【蓝湖需求摘要】') return;
        if (t === '【各页面要点】') {
            inBody = true;
            return;
        }
        if (/^\|/.test(t)) {
            if (/^\|\s*[-—:|\s]+\|\s*$/.test(t)) return;
            var cells = t.split('|').map(function (c) { return c.trim(); }).filter(Boolean);
            if (cells.length >= 2 && cells[0] !== '序号') {
                pageNames.push(cells[cells.length - 1]);
            }
            return;
        }
        if (t.indexOf('文档：') === 0) {
            docName = t.slice(3).trim();
            return;
        }
        if (t.indexOf('当前页面：') === 0) {
            currentPage = t.slice(5).trim();
            return;
        }
        if (t.indexOf('页面数：') === 0) {
            var countMatch = t.match(/^页面数：(\d+)/);
            pageCount = countMatch ? countMatch[1] : t.slice(4).trim();
            return;
        }
        if (!inBody) return;
        var headerMatch = t.match(/^#{1,6}\s*\d+\.\s*(.+)$/);
        if (headerMatch) {
            flushSection();
            sectionName = headerMatch[1].trim();
            return;
        }
        sectionLines.push(t);
    });
    flushSection();
    if (!docName && !currentPage && !pageNames.length && !pageSummaries.length) {
        var flat = raw
            .replace(/\|/g, ' ')
            .replace(/-{3,}/g, ' ')
            .replace(/#{1,6}/g, '')
            .replace(/【[^】]+】/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return flat ? { fallback: flat.slice(0, 120) } : null;
    }
    return {
        docName: docName,
        currentPage: currentPage,
        pageCount: pageCount,
        pageNames: pageNames,
        pageSections: pageSections,
        bodySnippet: pageSummaries.join(' · ').slice(0, 180)
    };
}



// 下载最后一次导入的文件
function downloadLastFile() {
    if (window.lastDownloadUrl && window.lastDownloadName) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = window.lastDownloadUrl;
        a.download = window.lastDownloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        tcAppAlert('当前没有可用的下载链接。请先完成一次可下载的导入或生成流程。', {
            variant: 'info',
            title: '暂无可下载文件',
            hint: '例如：从 Excel 导入并生成下载后，再使用下载入口。'
        });
    }
}

// 测试用例导入功能
let currentExcelFile = null;

// Excel文件上传监听
const excelFileInput = document.getElementById('excel-file-input');
if (excelFileInput) {
    excelFileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            currentExcelFile = file;
            const fileInfo = document.getElementById('excel-file-info');
            const fileName = document.getElementById('excel-file-name');
            if (fileInfo && fileName) {
                fileName.textContent = file.name;
                fileInfo.classList.remove('hidden');
            }
        }
    });
}

// Excel文件拖拽上传
const excelUploadSection = document.getElementById('excel-upload-section');
if (excelUploadSection) {
    excelUploadSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#10b981';
        this.style.background = 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
    });

    excelUploadSection.addEventListener('dragleave', function(e) {
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
    });

    excelUploadSection.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                document.getElementById('excel-file-input').files = e.dataTransfer.files;
                const event = new Event('change');
                document.getElementById('excel-file-input').dispatchEvent(event);
            }
        }
    });
}

// 导入测试用例按钮点击事件
const importBtn = document.getElementById('import-test-cases-btn');
if (importBtn) {
    importBtn.addEventListener('click', function() {
        const btn = this;
        const resultDiv = document.getElementById('import-result');
        const testCasesText = document.getElementById('import-test-cases').value;
        
        // 验证参数
        if (!currentExcelFile) {
            tcAppAlert('请先选择要导入的 Excel 文件（.xlsx / .xls）。', { variant: 'warning', title: '缺少文件' });
            return;
        }
        if (!testCasesText) {
            tcAppAlert('请在输入框中粘贴或填写与模板对应的测试用例数据。', { variant: 'warning', title: '缺少数据' });
            return;
        }

        // 显示加载状态
        btn.disabled = true;
        btn.textContent = '导入中...';
        resultDiv.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p class="text-gray-600">正在导入测试用例...</p>
            </div>
        `;

        // 构建表单数据
        const formData = new FormData();
        formData.append('excel_file', currentExcelFile);
        formData.append('test_cases', testCasesText);

        // 发送请求
        fetch('/api/test-case-importer', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            // 检查响应类型
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                // 如果是JSON响应，表示出错
                return response.json().then(data => {
                    throw new Error(data.error || '导入失败');
                });
            }
            
            // 如果是文件响应，处理下载
            const filledCount = response.headers.get('X-Filled-Count');
            
            return response.blob().then(blob => {
                // 创建下载链接但不自动下载
                const url = window.URL.createObjectURL(blob);
                return { filledCount, blobUrl: url };
            });
        })
        .then(result => {
            btn.disabled = false;
            btn.textContent = '导入并保存';
            
            if (result) {
                // 保存blob URL以便用户可以下载
                window.lastDownloadUrl = result.blobUrl;
                window.lastDownloadName = currentExcelFile.name;
                
                // 在前端构造成功消息
                const message = result.filledCount 
                    ? `成功导入 ${result.filledCount} 条测试用例到Excel文件` 
                    : '成功导入测试用例到Excel文件';
                
                resultDiv.innerHTML = `
                    <div class="text-green-600 p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-2xl">✓</span>
                            <strong class="text-lg">导入成功!</strong>
                        </div>
                        <p class="text-gray-600 mb-3">${message}</p>
                        <button onclick="downloadLastFile()" class="btn btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                            📥 下载Excel文件
                        </button>
                    </div>
                `;
            }
        })
        .catch(error => {
            btn.disabled = false;
            btn.textContent = '导入并保存';
            resultDiv.innerHTML = `
                <div class="p-4">
                    <div class="ds-alert ds-alert--error"><strong>导入失败</strong> — ${error.message}</div>
                </div>
            `;
        });
    });
}

// 图片格式转换逻辑
let uploadedFile = null;
let currentOriginalFormat = null;
let selectedTargetFormat = null;

// 格式转换映射
const formatOptions = {
    'png': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'tiff', label: 'TIFF', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ],
    'bmp': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'tiff', label: 'TIFF', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'tiff': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'webp': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'jpg', label: 'JPG', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true }
    ],
    'jpg': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG (再次保存)', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ],
    'jpeg': [
        { value: 'png', label: 'PNG', lossy: false },
        { value: 'bmp', label: 'BMP', lossy: false },
        { value: 'webp-lossless', label: 'WebP (无损)', lossy: false },
        { value: 'jpg', label: 'JPG (再次保存)', lossy: true },
        { value: 'webp-lossy', label: 'WebP (有损)', lossy: true },
        { value: 'heic', label: 'HEIC', lossy: true }
    ]
};

// 监听图片上传
const formatImageInput = document.getElementById('format-image-input');
if (formatImageInput) {
    formatImageInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleFormatImageUpload(file);
        }
    });
}

// 处理图片上传
function handleFormatImageUpload(file) {
    console.log("=== 处理文件上传 ===");
    console.log("文件对象:", file);
    console.log("文件名:", file.name);
    console.log("文件大小:", file.size, "字节");
    console.log("文件类型:", file.type);
    
    if (!file || file.size === 0) {
        tcAppAlert("上传的文件为空，请重新选择文件！", { variant: 'warning', title: '提示' });
        return;
    }
    const sizeErr = getImageFileSizeError(file);
    if (sizeErr) {
        tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
        const fin = document.getElementById('format-image-input');
        if (fin) fin.value = '';
        return;
    }
    
    // 保存文件对象
    uploadedFile = file;
    
    // 获取文件扩展名
    const ext = file.name.split('.').pop().toLowerCase();
    currentOriginalFormat = ext;
    
    // 显示文件名和格式
    document.getElementById('format-original-name').textContent = file.name;
    document.getElementById('format-original-format').textContent = ext.toUpperCase();
    
    // 预览图片
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('format-preview-img').src = e.target.result;
        document.getElementById('format-image-preview').style.display = 'block';
        console.log("图片预览加载完成");
    };
    reader.onerror = function(e) {
        console.error("图片预览失败:", e);
        tcAppAlert("无法预览该图片，请检查文件是否有效！", { variant: 'warning', title: '提示' });
    };
    reader.readAsDataURL(file);
    
    // 生成格式选项
    generateFormatOptions(ext);
    
    // 重置选择
    selectedTargetFormat = null;
    document.getElementById('convert-format-btn').disabled = true;
    document.getElementById('quality-section').style.display = 'none';
    document.getElementById('format-result').innerHTML = `
        <div class="ds-empty">
            <span class="ds-empty__icon" aria-hidden="true">⏳</span>
            <div class="ds-empty__title">等待转换</div>
            <div class="ds-empty__desc">已上传图片，请选择目标格式后点击「转换格式」</div>
        </div>
    `;
}

// 生成格式选项
function generateFormatOptions(originalFormat) {
    const optionsContainer = document.getElementById('format-options');
    const options = formatOptions[originalFormat] || [];
    
    optionsContainer.innerHTML = options.map(opt => `
        <button type="button" 
            class="format-option p-3 border-2 rounded-lg text-center transition-all hover:border-orange-400 hover:bg-orange-50"
            data-format="${opt.value}"
            data-lossy="${opt.lossy}"
            onclick="selectFormat(this)">
            <div class="text-lg font-semibold">${opt.label}</div>
            <div class="text-xs text-gray-500">${opt.lossy ? '有损' : '无损'}</div>
        </button>
    `).join('');
}

// 选择格式
function selectFormat(button) {
    // 移除其他选中状态
    document.querySelectorAll('.format-option').forEach(btn => {
        btn.classList.remove('border-orange-500', 'bg-orange-100');
    });
    
    // 添加选中状态
    button.classList.add('border-orange-500', 'bg-orange-100');
    
    // 保存选中的格式
    selectedTargetFormat = button.dataset.format;
    const isLossy = button.dataset.lossy === 'true';
    
    // 启用转换按钮
    document.getElementById('convert-format-btn').disabled = false;
    
    // 显示/隐藏质量选项
    const qualitySection = document.getElementById('quality-section');
    if (isLossy) {
        qualitySection.style.display = 'block';
    } else {
        qualitySection.style.display = 'none';
    }
}

// 质量滑块更新
const formatQuality = document.getElementById('format-quality');
if (formatQuality) {
    formatQuality.addEventListener('input', function() {
        document.getElementById('quality-value').textContent = this.value;
    });
}

// 重新上传按钮
const formatReuploadBtn = document.getElementById('format-reupload-btn');
if (formatReuploadBtn) {
    formatReuploadBtn.addEventListener('click', function() {
        document.getElementById('format-image-input').value = '';
        document.getElementById('format-image-preview').style.display = 'none';
        document.getElementById('format-options').innerHTML = '';
        document.getElementById('convert-format-btn').disabled = true;
        document.getElementById('quality-section').style.display = 'none';
        uploadedFile = null;
        currentOriginalFormat = null;
        selectedTargetFormat = null;
        document.getElementById('format-result').innerHTML = `
            <div class="ds-empty">
                <span class="ds-empty__icon" aria-hidden="true">🖼</span>
                <div class="ds-empty__title">尚无转换结果</div>
                <div class="ds-empty__desc">选择目标格式并点击「转换格式」后，在此下载文件</div>
            </div>
        `;
    });
}

// 转换按钮
const convertFormatBtn = document.getElementById('convert-format-btn');
if (convertFormatBtn) {
    convertFormatBtn.addEventListener('click', async function() {
        console.log("=== 点击转换按钮 ===");
        console.log("uploadedFile:", uploadedFile);
        console.log("selectedTargetFormat:", selectedTargetFormat);
        
        if (!uploadedFile || uploadedFile.size === 0) {
            tcAppAlert('请先上传有效的图片文件！', { variant: 'warning', title: '提示' });
            return;
        }
        const upErr = getImageFileSizeError(uploadedFile);
        if (upErr) {
            tcAppAlert(upErr, { variant: 'warning', title: '提示' });
            return;
        }
        
        if (!selectedTargetFormat) {
            tcAppAlert('请先选择目标格式！', { variant: 'warning', title: '提示' });
            return;
        }
        
        const btn = this;
        const resultDiv = document.getElementById('format-result');
        const quality = document.getElementById('format-quality').value;
        
        console.log("准备发送请求...");
        console.log("文件信息:", {
            name: uploadedFile.name,
            size: uploadedFile.size,
            type: uploadedFile.type
        });
        console.log("目标格式:", selectedTargetFormat);
        console.log("质量:", quality);
        
        btn.disabled = true;
        btn.textContent = '转换中...';
        resultDiv.innerHTML = `
            <div class="ds-loading-inline">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" aria-hidden="true"></div>
                <div class="font-medium text-slate-700">正在转换图片格式</div>
                <div class="text-sm text-slate-500">超时或异常时将自动重试，请稍候</div>
            </div>
        `;
        
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('target_format', selectedTargetFormat);
        formData.append('quality', quality);
        
        console.log("FormData内容:");
        for (let [key, value] of formData.entries()) {
            console.log(key, value);
        }
        
        try {
            const blob = await postImageBinaryWithRetry('/api/image-format-converter', formData);
            console.log("转换成功，blob大小:", blob.size);
            btn.disabled = false;
            btn.textContent = '转换格式';
            const blobUrl = URL.createObjectURL(blob);
            const extension = selectedTargetFormat.replace('-lossless', '').replace('-lossy', '');
            resultDiv.innerHTML = `
                <div class="p-6 text-center space-y-4">
                    <div class="ds-alert ds-alert--success text-center">转换成功</div>
                    <a href="${blobUrl}" download="converted.${extension}" class="btn btn-primary inline-block">
                        下载图片
                    </a>
                </div>
            `;
        } catch (error) {
            console.error("转换失败:", error);
            btn.disabled = false;
            btn.textContent = '转换格式';
            const msg = (error && error.message) ? error.message : '转换失败';
            resultDiv.innerHTML = `
                <div class="p-4">
                    <div class="ds-alert ds-alert--error"><strong>转换失败</strong> — ${msg}</div>
                </div>
            `;
        }
    });
}

// 格式转换工具的拖拽上传
const formatUploadSection = document.getElementById('format-upload-section');
if (formatUploadSection) {
    formatUploadSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#f97316';
        this.style.background = 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)';
    });

    formatUploadSection.addEventListener('dragleave', function(e) {
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
    });

    formatUploadSection.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const sizeErr = getImageFileSizeError(file);
                if (sizeErr) {
                    tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
                    return;
                }
                document.getElementById('format-image-input').files = e.dataTransfer.files;
                handleFormatImageUpload(file);
            }
        }
    });
}

// ==================== 测试用例表格管理功能 ====================

let isCollapsed = true;
/** 抽屉位置/尺寸仅当前页会话有效，刷新或离开页面后恢复默认 */
var tcLeftFloatSessionPos = null;
var tcLeftFloatSessionSize = null;
var TC_LEFT_FLOAT_MIN_W = 300;
var TC_LEFT_FLOAT_MIN_H = 260;
var TC_LEFT_FLOAT_DEFAULT_W = 608;
var TC_LEFT_FLOAT_DEFAULT_H = 560;
var TC_LEFT_FLOAT_LAYOUT_KEY = 'tc_left_float_layout_v1';

function getTcLeftFloatViewportInsets() {
    var margin = 12;
    var top = margin;
    var nav = document.querySelector('.hf-gnav');
    if (nav) {
        var nr = nav.getBoundingClientRect();
        top = Math.max(top, Math.round(nr.bottom) + margin);
    }
    var tcHeader = document.getElementById('tc-header-shell');
    if (tcHeader) {
        var hr = tcHeader.getBoundingClientRect();
        if (hr.bottom > top - margin) {
            top = Math.max(top, Math.round(hr.bottom) + margin);
        }
    }
    var toolHeader = document.querySelector('.ds-tool-header-shell');
    if (toolHeader) {
        var tr = toolHeader.getBoundingClientRect();
        if (tr.bottom > top - margin) {
            top = Math.max(top, Math.round(tr.bottom) + margin);
        }
    }
    return { margin: margin, top: top, bottom: margin };
}

function getTcLeftFloatAdaptiveDefaultSize() {
    var insets = getTcLeftFloatViewportInsets();
    var lim = getTcLeftFloatSizeLimits();
    var availH = Math.max(TC_LEFT_FLOAT_MIN_H, window.innerHeight - insets.top - insets.bottom);
    var availW = Math.max(TC_LEFT_FLOAT_MIN_W, window.innerWidth - insets.margin * 2);
    var ratioH = window.innerHeight < 820 ? 0.78 : (window.innerHeight < 920 ? 0.84 : 0.88);
    var ratioW = window.innerWidth < 1280 ? 0.9 : 0.94;
    var targetH = Math.min(TC_LEFT_FLOAT_DEFAULT_H, Math.round(availH * ratioH));
    var targetW = Math.min(TC_LEFT_FLOAT_DEFAULT_W, Math.round(Math.min(availW * ratioW, TC_LEFT_FLOAT_DEFAULT_W)));
    return clampTcLeftFloatSize(targetW, targetH);
}

function ensureTcLeftFloatFitsViewport() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel.classList.contains('tc-left-float-panel--collapsed')) return;
    var insets = getTcLeftFloatViewportInsets();
    var lim = getTcLeftFloatSizeLimits();
    var r = panel.getBoundingClientRect();
    var w = r.width > 0 ? r.width : TC_LEFT_FLOAT_DEFAULT_W;
    var h = r.height > 0 ? r.height : TC_LEFT_FLOAT_DEFAULT_H;
    var x = r.left;
    var y = r.top;
    w = Math.min(w, lim.maxW);
    h = Math.min(h, lim.maxH);
    if (y < insets.top) y = insets.top;
    if (y + h > window.innerHeight - insets.bottom) {
        y = Math.max(insets.top, window.innerHeight - insets.bottom - h);
    }
    if (x < insets.margin) x = insets.margin;
    if (x + w > window.innerWidth - insets.margin) {
        x = Math.max(insets.margin, window.innerWidth - insets.margin - w);
    }
    applyTcLeftFloatBounds(w, h, x, y);
    panel.style.setProperty('--tc-float-safe-top', insets.top + 'px');
}

function loadTcLeftFloatLayoutFromStorage() {
    try {
        var raw = localStorage.getItem(TC_LEFT_FLOAT_LAYOUT_KEY);
        if (!raw) return;
        var d = JSON.parse(raw);
        if (d && typeof d.w === 'number' && typeof d.h === 'number') {
            tcLeftFloatSessionSize = { w: d.w, h: d.h };
        }
        /* 位置 x/y 不跨刷新恢复，仅当前页拖动会话内有效 */
    } catch (e) { /* ignore */ }
}

function persistTcLeftFloatLayout() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var r = panel.getBoundingClientRect();
    var w = Math.round(r.width);
    var h = Math.round(r.height);
    tcLeftFloatSessionSize = { w: w, h: h };
    tcLeftFloatSessionPos = { x: Math.round(r.left), y: Math.round(r.top) };
    try {
        localStorage.setItem(TC_LEFT_FLOAT_LAYOUT_KEY, JSON.stringify({ w: w, h: h }));
    } catch (e) { /* ignore */ }
}

var TC_COLLAPSE_ICON_COLLAPSE = 'M15 19l-7-7 7-7';
var TC_COLLAPSE_ICON_EXPAND = 'M9 5l7 7-7 7';

function syncLeftPanelCollapseBtn() {
    var collapseBtn = document.getElementById('collapse-btn');
    if (!collapseBtn) return;
    var path = collapseBtn.querySelector('#collapse-icon path');
    if (isCollapsed) {
        collapseBtn.title = '展开智能编辑';
        collapseBtn.setAttribute('aria-label', '展开智能编辑');
        collapseBtn.setAttribute('aria-expanded', 'false');
        if (path) path.setAttribute('d', TC_COLLAPSE_ICON_EXPAND);
    } else {
        collapseBtn.title = '收起智能编辑';
        collapseBtn.setAttribute('aria-label', '收起智能编辑');
        collapseBtn.setAttribute('aria-expanded', 'true');
        if (path) path.setAttribute('d', TC_COLLAPSE_ICON_COLLAPSE);
    }
}

function tcLeftFloatNotifyLayoutChange() {
    window.requestAnimationFrame(function() {
        if (tcMindmapInstance && typeof tcMindmapInstance.resize === 'function') {
            try { tcMindmapInstance.resize(); } catch (e) { /* ignore */ }
        }
        if (typeof tcMindmapFitToView === 'function' && tcRightViewMode === 'mindmap') {
            tcMindmapFitToView();
        }
    });
}

function isTcHubExcelTabActive() {
    var panel = document.getElementById('tc-hub-panel-excel');
    if (!panel) return false;
    return !panel.classList.contains('hidden');
}

/** Hub：Excel Tab 与 AI 生成 Tab 悬浮控件隔离（勿互通） */
function syncTcHubAiChrome() {
    if (!document.querySelector('.tc-hub-scope')) return;
    var excel = isTcHubExcelTabActive();
    document.body.classList.toggle('tc-hub-excel-tab', excel);
    document.body.classList.toggle('tc-hub-ai-tab', !excel);

    var pageFloat = document.getElementById('tc-page-float-wrap');
    var leftWrap = document.getElementById('tc-left-input-float-wrap');
    var fabWrap = document.getElementById('tc-table-fab-wrap');
    var exportFabWrap = document.getElementById('tc-export-fab-wrap');

    if (excel) {
        if (leftWrap) {
            leftWrap.classList.add('hidden');
            leftWrap.setAttribute('aria-hidden', 'true');
        }
        if (fabWrap) {
            fabWrap.classList.add('hidden');
            fabWrap.setAttribute('aria-hidden', 'true');
        }
        if (exportFabWrap) {
            exportFabWrap.classList.add('hidden');
            exportFabWrap.setAttribute('aria-hidden', 'true');
        }
        if (typeof closeTcTableFabSheet === 'function') closeTcTableFabSheet();
    } else {
        if (leftWrap) {
            leftWrap.classList.remove('hidden');
            leftWrap.setAttribute('aria-hidden', 'false');
        }
        if (typeof syncTcLeftInputFloatChrome === 'function') syncTcLeftInputFloatChrome();
    }
}

/** 表格 / 思维导图视图均展示暂存 FAB / 列表（按 scope 过滤条目） */
function syncTcStashFloatChrome() {}

function getTcLeftFloatDefaultPos() {
    var insets = getTcLeftFloatViewportInsets();
    var wrap = document.getElementById('tc-left-input-float-wrap');
    var dock = document.getElementById('tc-left-float-dock');
    var anchor = wrap || dock;
    if (anchor) {
        var dr = anchor.getBoundingClientRect();
        var y = Math.max(insets.top, dr.top);
        var panel = document.getElementById('left-panel');
        var ph = panel && panel.offsetHeight > 0 ? panel.offsetHeight : TC_LEFT_FLOAT_DEFAULT_H;
        if (y + ph > window.innerHeight - insets.bottom) {
            y = Math.max(insets.top, window.innerHeight - insets.bottom - ph);
        }
        return { x: dr.right + 12, y: y };
    }
    return { x: 56, y: insets.top };
}

function ensureTcLeftInputFloatMounted() {
    if (isTcHubExcelTabActive()) return null;
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return null;
    if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
    }
    wrap.classList.remove('hidden');
    wrap.setAttribute('aria-hidden', 'false');
    return wrap;
}

/** 用例录入悬浮窗、遮罩挂到 body，避免落在带 backdrop-filter/overflow 的工作台内被裁切 */
function ensureTcLeftFloatPanelMounted() {
    var backdrop = document.getElementById('tc-left-float-backdrop');
    var panel = document.getElementById('left-panel');
    if (backdrop && backdrop.parentElement !== document.body) {
        document.body.appendChild(backdrop);
    }
    if (panel && panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }
}

function ensureTcWorkbenchOverlaysMounted() {
    ensureTcLeftFloatPanelMounted();
    [
        'tc-wb-session-limit-banner',
        'edit-modal',
        'column-settings-modal',
        'tc-feature-unlock-modal',
        'tc-template-modal',
        'tc-view-convert-modal',
                'lanhu-cookie-modal',
        'tc-lanhu-tree-connect-modal',
        'tc-validate-drawer-single',
        'tc-agent-drawer',
        'tc-validate-drawer-single',
        'tc-export-report-modal'
    ].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    });
}

/** 暂存列表 / FAB 分列挂 body，拖拽互不影响 */
function ensureTcStashOverlaysMounted() {}

function ensureTcLeftFloatLayersMounted() {
    if (isTcHubExcelTabActive()) {
        syncTcHubAiChrome();
        return;
    }
    ensureTcLeftInputFloatMounted();
    ensureTcWorkbenchOverlaysMounted();
}

function syncTcLeftInputFloatChrome() {
    ensureTcLeftFloatLayersMounted();
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return;
    var show = !isTcHubExcelTabActive();
    wrap.classList.toggle('hidden', !show);
    wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
        ensureTcLeftInputFloatOnScreen();
        if (typeof initTcLeftInputFloatDrag === 'function') initTcLeftInputFloatDrag();
    }
}

function getTcLeftInputFloatDragSize() {
    var btn = document.querySelector('#tc-left-input-float-wrap [data-tc-float-open]');
    var r = btn ? btn.getBoundingClientRect() : null;
    return {
        w: r && r.width > 0 ? r.width : 44,
        h: r && r.height > 0 ? r.height : 44
    };
}

function clampTcLeftInputFloatPos(left, top) {
    var size = getTcLeftInputFloatDragSize();
    var margin = 8;
    return {
        left: Math.max(margin, Math.min(left, window.innerWidth - size.w - margin)),
        top: Math.max(margin, Math.min(top, window.innerHeight - size.h - margin))
    };
}

function applyTcLeftInputFloatPosition(left, top) {
    var wrap = ensureTcLeftInputFloatMounted();
    if (!wrap) return;
    var p = clampTcLeftInputFloatPos(left, top);
    wrap.classList.add('tc-left-input-float-wrap--positioned');
    wrap.style.left = p.left + 'px';
    wrap.style.top = p.top + 'px';
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.transform = 'none';
}

function resetTcLeftInputFloatToDefault() {
    try { localStorage.removeItem('tc_left_input_float_pos_v1'); } catch (e) { /* ignore legacy */ }
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap) return;
    wrap.classList.remove('tc-left-input-float-wrap--positioned');
    wrap.style.left = '';
    wrap.style.top = '';
    wrap.style.right = '';
    wrap.style.bottom = '';
    wrap.style.transform = '';
}

function ensureTcLeftInputFloatOnScreen() {
    var wrap = document.getElementById('tc-left-input-float-wrap');
    if (!wrap || wrap.classList.contains('hidden')) return;
    if (!wrap.classList.contains('tc-left-input-float-wrap--positioned')) return;
    var r = wrap.getBoundingClientRect();
    applyTcLeftInputFloatPosition(r.left, r.top);
}

function openTcLeftInputFloatFromFab() {
    if (window.__tcSuppressLeftPanelUi) return;
    if (typeof ensureTcLeftFloatLayersMounted === 'function') {
        ensureTcLeftFloatLayersMounted();
    }
    if (typeof switchTcWorkbenchMode === 'function') {
        switchTcWorkbenchMode('edit');
    }
    if (typeof expandTcLeftFloatPanel === 'function') {
        expandTcLeftFloatPanel(2);
    }
}

function initTcLeftInputFloatDrag() {
    var wrap = document.getElementById('tc-left-input-float-wrap');
    var toggle = wrap && wrap.querySelector('[data-tc-float-open]');
    if (!toggle || toggle._tcLeftInputFloatDragBound) return;
    toggle._tcLeftInputFloatDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;
    var suppressOpenClick = false;

    function markOpenClickHandled() {
        suppressOpenClick = true;
        toggle._tcLeftFloatOpenSuppressClick = true;
        window.setTimeout(function() {
            suppressOpenClick = false;
            toggle._tcLeftFloatOpenSuppressClick = false;
        }, 450);
    }

    function onFabPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            suppressOpenClick = true;
            if (wrap) wrap.classList.add('tc-left-input-float-wrap--dragging');
            document.body.classList.add('tc-left-input-float-dragging');
        }
        applyTcLeftInputFloatPosition(startLeft + dx, startTop + dy);
        e.preventDefault();
    }

    function endFabPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        document.removeEventListener('pointermove', onFabPointerMove);
        document.removeEventListener('pointerup', endFabPointer);
        document.removeEventListener('pointercancel', endFabPointer);
        if (!pointerDown) return;
        var wasDrag = dragging;
        pointerDown = false;
        dragging = false;
        activePointerId = null;
        if (wrap) wrap.classList.remove('tc-left-input-float-wrap--dragging');
        document.body.classList.remove('tc-left-input-float-dragging');
        if (wasDrag) {
            window.setTimeout(function() { suppressOpenClick = false; }, 400);
        } else {
            markOpenClickHandled();
            openTcLeftInputFloatFromFab();
        }
    }

    toggle.addEventListener('click', function(e) {
        if (!suppressOpenClick && !toggle._tcLeftFloatOpenSuppressClick) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    toggle.addEventListener('pointerdown', function(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.stopPropagation();
        pointerDown = true;
        dragging = false;
        suppressOpenClick = false;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        var rect = wrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        if (!wrap.classList.contains('tc-left-input-float-wrap--positioned')) {
            applyTcLeftInputFloatPosition(startLeft, startTop);
        }
        if (toggle.setPointerCapture) {
            try { toggle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        document.addEventListener('pointermove', onFabPointerMove);
        document.addEventListener('pointerup', endFabPointer);
        document.addEventListener('pointercancel', endFabPointer);
    });

    if (!window._tcLeftInputFloatResizeBound) {
        window._tcLeftInputFloatResizeBound = true;
        window.addEventListener('resize', function() {
            ensureTcLeftInputFloatOnScreen();
        });
    }
}

function getTcLeftFloatSizeLimits() {
    var insets = getTcLeftFloatViewportInsets();
    return {
        minW: TC_LEFT_FLOAT_MIN_W,
        minH: TC_LEFT_FLOAT_MIN_H,
        maxW: Math.max(TC_LEFT_FLOAT_MIN_W, window.innerWidth - insets.margin * 2),
        maxH: Math.max(TC_LEFT_FLOAT_MIN_H, window.innerHeight - insets.top - insets.bottom)
    };
}

function clampTcLeftFloatSize(w, h) {
    var lim = getTcLeftFloatSizeLimits();
    return {
        w: Math.round(Math.max(lim.minW, Math.min(w, lim.maxW))),
        h: Math.round(Math.max(lim.minH, Math.min(h, lim.maxH)))
    };
}

function applyTcLeftFloatSize(w, h) {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var s = clampTcLeftFloatSize(w, h);
    panel.style.width = s.w + 'px';
    panel.style.height = s.h + 'px';
    panel.style.maxWidth = 'none';
    panel.style.maxHeight = 'none';
    panel.dataset.tcFloatW = String(s.w);
    panel.dataset.tcFloatH = String(s.h);
    return s;
}

function applyTcLeftFloatBounds(w, h, left, top) {
    var panel = document.getElementById('left-panel');
    if (!panel) return null;
    var s = applyTcLeftFloatSize(w, h);
    if (!s) return null;
    var p = clampTcLeftFloatPos(left, top);
    panel.style.left = p.x + 'px';
    panel.style.top = p.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    return { w: s.w, h: s.h, left: p.x, top: p.y };
}

/** 根据抽屉当前宽高缩放内部字号/间距，并限制输入区高度 */
function tcLeftFloatAdaptContentToPanel() {
    var panel = document.getElementById('left-panel');
    if (!panel || isCollapsed) return;
    var w = panel.offsetWidth || TC_LEFT_FLOAT_DEFAULT_W;
    var h = panel.offsetHeight || TC_LEFT_FLOAT_DEFAULT_H;
    var scale = Math.max(0.72, Math.min(1.1, Math.min(w / TC_LEFT_FLOAT_DEFAULT_W, h / TC_LEFT_FLOAT_DEFAULT_H)));
    panel.style.setProperty('--tc-float-scale', scale.toFixed(3));

    var prompt = document.getElementById('ai-prompt');
    if (prompt && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(prompt);
    }
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
}

function tcLeftFloatComputeResize(mode, startW, startH, startLeft, startTop, dx, dy) {
    var nw = startW;
    var nh = startH;
    var nl = startLeft;
    var nt = startTop;
    if (mode === 'e') {
        nw = startW + dx;
    } else if (mode === 'w') {
        nw = startW - dx;
        nl = startLeft + dx;
    } else if (mode === 's') {
        nh = startH + dy;
    } else if (mode === 'n') {
        nh = startH - dy;
        nt = startTop + dy;
    } else if (mode === 'se') {
        nw = startW + dx;
        nh = startH + dy;
    } else if (mode === 'sw') {
        nw = startW - dx;
        nl = startLeft + dx;
        nh = startH + dy;
    } else if (mode === 'ne') {
        nw = startW + dx;
        nh = startH - dy;
        nt = startTop + dy;
    } else if (mode === 'nw') {
        nw = startW - dx;
        nl = startLeft + dx;
        nh = startH - dy;
        nt = startTop + dy;
    } else {
        nw = startW + dx;
        nh = startH + dy;
    }
    var s = clampTcLeftFloatSize(nw, nh);
    if (mode === 'w' || mode === 'sw' || mode === 'nw') {
        nl = startLeft + (startW - s.w);
    }
    if (mode === 'n' || mode === 'ne' || mode === 'nw') {
        nt = startTop + (startH - s.h);
    }
    return applyTcLeftFloatBounds(s.w, s.h, nl, nt);
}

function measureTcLeftFloatDefaultSize() {
    var panel = document.getElementById('left-panel');
    if (!panel) {
        return { w: TC_LEFT_FLOAT_DEFAULT_W, h: TC_LEFT_FLOAT_DEFAULT_H };
    }
    var prevW = panel.style.width;
    var prevH = panel.style.height;
    panel.style.visibility = 'hidden';
    panel.style.pointerEvents = 'none';
    panel.style.opacity = '0';
    panel.style.width = TC_LEFT_FLOAT_DEFAULT_W + 'px';
    panel.style.height = 'auto';
    panel.style.maxHeight = 'none';
    var scroll = panel.querySelector('.tc-left-float-panel__scroll');
    if (scroll) scroll.style.overflowY = 'visible';
    var measuredH = panel.offsetHeight;
    var lim = getTcLeftFloatSizeLimits();
    var h = Math.max(TC_LEFT_FLOAT_MIN_H, Math.min(measuredH + 8, lim.maxH, TC_LEFT_FLOAT_DEFAULT_H + 120));
    panel.style.width = prevW;
    panel.style.height = prevH;
    panel.style.visibility = '';
    panel.style.pointerEvents = '';
    panel.style.opacity = '';
    if (scroll) scroll.style.overflowY = '';
    return { w: TC_LEFT_FLOAT_DEFAULT_W, h: h };
}

function resetTcLeftFloatSessionLayout() {
    tcLeftFloatSessionPos = null;
    tcLeftFloatSessionSize = null;
}

function ensureTcLeftFloatSize() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    loadTcLeftFloatLayoutFromStorage();
    if (tcLeftFloatSessionSize && typeof tcLeftFloatSessionSize.w === 'number' && typeof tcLeftFloatSessionSize.h === 'number') {
        var stored = clampTcLeftFloatSize(tcLeftFloatSessionSize.w, tcLeftFloatSessionSize.h);
        applyTcLeftFloatSize(stored.w, stored.h);
        return;
    }
    var def = getTcLeftFloatAdaptiveDefaultSize();
    applyTcLeftFloatSize(def.w, def.h);
}

function saveTcLeftFloatSize() {
    persistTcLeftFloatLayout();
}

function clampTcLeftFloatPos(x, y) {
    var panel = document.getElementById('left-panel');
    if (!panel) return { x: x, y: y };
    var insets = getTcLeftFloatViewportInsets();
    var r = panel.getBoundingClientRect();
    var w = r.width > 0 ? r.width : TC_LEFT_FLOAT_DEFAULT_W;
    var h = r.height > 0 ? r.height : TC_LEFT_FLOAT_DEFAULT_H;
    return {
        x: Math.max(insets.margin, Math.min(x, window.innerWidth - w - insets.margin)),
        y: Math.max(insets.top, Math.min(y, window.innerHeight - h - insets.bottom))
    };
}

function applyTcLeftFloatPosition(x, y) {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    var p = clampTcLeftFloatPos(x, y);
    panel.style.left = p.x + 'px';
    panel.style.top = p.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
}

function ensureTcLeftFloatPosition() {
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    loadTcLeftFloatLayoutFromStorage();
    if (tcLeftFloatSessionPos && typeof tcLeftFloatSessionPos.x === 'number' && typeof tcLeftFloatSessionPos.y === 'number') {
        applyTcLeftFloatPosition(tcLeftFloatSessionPos.x, tcLeftFloatSessionPos.y);
        return;
    }
    var def = getTcLeftFloatDefaultPos();
    applyTcLeftFloatPosition(def.x, def.y);
}

function saveTcLeftFloatPosition() {
    persistTcLeftFloatLayout();
}

function tcLeftFloatRefreshContentHeights() {
    var panel = document.getElementById('left-panel');
    if (!panel || isCollapsed) return;
    var prompt = document.getElementById('ai-prompt');
    if (prompt && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(prompt);
    }
    if (typeof syncTcManualImportTextareaHeights === 'function') {
        syncTcManualImportTextareaHeights();
    }
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
    window.requestAnimationFrame(function() {
        ensureTcLeftFloatPosition();
        tcLeftFloatAdaptContentToPanel();
    });
}

/** 左侧录入区：悬浮抽屉展开/收起（右侧工作区始终铺满） */
function applyDrawerLayout(drawerNum) {
    var shell = document.getElementById('tc-main-content-shell');
    var leftPanel = document.getElementById('left-panel');
    var dock = document.getElementById('tc-left-float-dock');
    var backdrop = document.getElementById('tc-left-float-backdrop');
    var drawerTabsRoot = document.getElementById('tc-drawer-tabs-root');
    var leftContentWrapper = document.getElementById('left-content-wrapper');
    if (!shell || !leftPanel) return;

    ensureTcLeftFloatPanelMounted();

    shell.classList.toggle('tc-left-float--collapsed', isCollapsed);
    shell.classList.toggle('tc-left-float--open', !isCollapsed);
    leftPanel.classList.toggle('tc-left-float-panel--collapsed', isCollapsed);
    leftPanel.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
    if (dock) dock.classList.toggle('hidden', !isCollapsed);
    if (backdrop) {
        backdrop.classList.toggle('hidden', isCollapsed);
        backdrop.setAttribute('aria-hidden', isCollapsed ? 'true' : 'false');
    }
    if (drawerTabsRoot) drawerTabsRoot.classList.toggle('hidden', isCollapsed);
    if (leftContentWrapper) leftContentWrapper.classList.toggle('hidden', isCollapsed);
    if (!isCollapsed) {
        ensureTcLeftFloatSize();
        ensureTcLeftFloatPosition();
        ensureTcLeftFloatFitsViewport();
        tcLeftFloatRefreshContentHeights();
        tcLeftFloatAdaptContentToPanel();
        if (typeof initTcEditComposer === 'function') initTcEditComposer();
        if (typeof ensureTcLeftFloatDrag === 'function') ensureTcLeftFloatDrag();
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(leftPanel);
        }
    }
    syncLeftPanelCollapseBtn();
    if (typeof syncTcLeftGenPanelLayout === 'function') syncTcLeftGenPanelLayout();
    tcLeftFloatNotifyLayoutChange();
}

function expandTcLeftFloatPanel(drawerNum) {
    if (window.__tcSuppressLeftPanelUi) return;
    if (typeof ensureTcLeftFloatLayersMounted === 'function') {
        ensureTcLeftFloatLayersMounted();
    }
    var needOpen = isCollapsed;
    if (needOpen) {
        isCollapsed = false;
    }
    if (drawerNum === 1 || drawerNum === 2) {
        switchDrawer(drawerNum);
    } else if (needOpen) {
        applyDrawerLayout(getTcActiveDrawerNum());
    }
}

/** 进入用例工作台时不再默认展开「用例生成」浮层（保留空实现，避免外部引用报错） */
function autoOpenTcGenPanelOnPageEnter() {
    /* 默认收起，由用户点击 dock / 展开按钮打开 */
}

function ensureTcLeftPanelClosedForHeadlessGen() {
    if (!window.__tcSuppressLeftPanelUi) return;
    var panel = document.getElementById('left-panel');
    if (!panel || panel.classList.contains('tc-left-float-panel--collapsed')) return;
    if (typeof toggleCollapse === 'function') toggleCollapse();
}

function toggleCollapse() {
    if (!document.getElementById('left-panel') || !document.getElementById('right-panel')) return;
    isCollapsed = !isCollapsed;
    applyDrawerLayout(getTcActiveDrawerNum());
}

function initTcLeftFloatDrag() {
    if (!window._tcLeftFloatViewportResizeBound) {
        window._tcLeftFloatViewportResizeBound = true;
        window.addEventListener('resize', function() {
            ensureTcLeftFloatFitsViewport();
            tcLeftFloatAdaptContentToPanel();
        });
    }
    var panel = document.getElementById('left-panel');
    var handle = document.getElementById('tc-left-float-drag-handle');
    var closeBtn = document.getElementById('collapse-btn');
    if (!panel || !handle) return;
    if (handle._tcFloatDragBound) return;
    handle._tcFloatDragBound = true;

    var pointerDown = false;
    var dragging = false;
    var activePointerId = null;
    var dragThreshold = 5;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    function detachDragListeners() {
        document.removeEventListener('pointermove', onPanelPointerMove);
        document.removeEventListener('pointerup', endPanelPointer);
        document.removeEventListener('pointercancel', endPanelPointer);
        handle.removeEventListener('pointermove', onPanelPointerMove);
        handle.removeEventListener('pointerup', endPanelPointer);
        handle.removeEventListener('pointercancel', endPanelPointer);
    }

    function onPanelPointerMove(e) {
        if (!pointerDown || (activePointerId !== null && e.pointerId !== activePointerId)) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (!dragging) {
            if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
            dragging = true;
            panel.classList.add('tc-left-float-panel--dragging');
            document.body.classList.add('tc-left-float-dragging');
        }
        applyTcLeftFloatPosition(startLeft + dx, startTop + dy);
        e.preventDefault();
    }

    function endPanelPointer(e) {
        if (activePointerId !== null && e && e.pointerId !== activePointerId) return;
        detachDragListeners();
        if (!pointerDown) return;
        pointerDown = false;
        if (dragging) saveTcLeftFloatPosition();
        dragging = false;
        activePointerId = null;
        panel.classList.remove('tc-left-float-panel--dragging');
        document.body.classList.remove('tc-left-float-dragging');
    }

    function beginPanelDrag(clientX, clientY, pointerId) {
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(panel);
        }
        pointerDown = true;
        dragging = false;
        activePointerId = pointerId != null ? pointerId : null;
        startX = clientX;
        startY = clientY;
        var rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener('pointermove', onPanelPointerMove);
        document.addEventListener('pointerup', endPanelPointer);
        document.addEventListener('pointercancel', endPanelPointer);
        handle.addEventListener('pointermove', onPanelPointerMove);
        handle.addEventListener('pointerup', endPanelPointer);
        handle.addEventListener('pointercancel', endPanelPointer);
    }

    handle.addEventListener('pointerdown', function(e) {
        if (closeBtn && (e.target === closeBtn || closeBtn.contains(e.target))) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        e.preventDefault();
        e.stopPropagation();
        beginPanelDrag(e.clientX, e.clientY, e.pointerId);
    });
}

function ensureTcLeftFloatDrag() {
    initTcLeftFloatDrag();
}

function initTcLeftFloatUi() {
    if (window._tcLeftFloatUiBound) return;
    window._tcLeftFloatUiBound = true;
    var isWorkbench = !!document.querySelector('.tc-workbench-scope');
    ensureTcLeftFloatLayersMounted();
    loadTcLeftFloatLayoutFromStorage();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 1);
    }
    syncTcHubAiChrome();
    resetTcLeftInputFloatToDefault();
    syncTcLeftInputFloatChrome();
    initTcLeftInputFloatDrag();
    document.querySelectorAll('[data-tc-float-drawer]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var n = parseInt(btn.getAttribute('data-tc-float-drawer'), 10);
            expandTcLeftFloatPanel(n === 2 ? 2 : 1);
        });
    });
    var backdrop = document.getElementById('tc-left-float-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function() {
            if (!isCollapsed) toggleCollapse();
        });
    }
    initTcLeftFloatDrag();
    initTcLeftFloatResize();
    initTcLeftFloatPanelStack();
    var leftWrap = document.getElementById('left-content-wrapper');
    if (leftWrap) leftWrap.setAttribute('data-active-drawer', String(getTcActiveDrawerNum()));
    if (typeof syncTcPromptIntroLayout === 'function') syncTcPromptIntroLayout();
    if (typeof syncTcGenChatLayout === 'function') syncTcGenChatLayout();
    if (isWorkbench && document.body) {
        document.body.classList.add('tc-left-gen-ui-ready');
    }
}

function tcLeftFloatWorkbenchBootLayout() {
    if (!document.querySelector('.tc-workbench-scope')) return;
    var panel = document.getElementById('left-panel');
    if (!panel) return;
    isCollapsed = true;
    if (typeof ensureTcLeftFloatPanelMounted === 'function') ensureTcLeftFloatPanelMounted();
    if (typeof ensureTcLeftFloatSize === 'function') ensureTcLeftFloatSize();
    if (typeof ensureTcLeftFloatPosition === 'function') ensureTcLeftFloatPosition();
    if (typeof applyDrawerLayout === 'function') {
        applyDrawerLayout(typeof getTcActiveDrawerNum === 'function' ? getTcActiveDrawerNum() : 2);
    }
    if (typeof initTcLeftFloatUi === 'function') initTcLeftFloatUi();
}

(function tcLeftFloatWorkbenchBoot() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tcLeftFloatWorkbenchBootLayout);
    } else {
        tcLeftFloatWorkbenchBootLayout();
    }
})();

function initTcLeftFloatPanelStack() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel._tcWorkbenchFloatStackBound) return;
    panel._tcWorkbenchFloatStackBound = true;
    panel.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
        if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.bringFloatPanelToFront === 'function') {
            window.TcWorkbenchEnhancements.bringFloatPanelToFront(panel);
        }
    }, true);
}

function initTcLeftFloatResize() {
    var panel = document.getElementById('left-panel');
    if (!panel || panel._tcFloatResizeBound) return;
    panel._tcFloatResizeBound = true;

    panel.querySelectorAll('[data-tc-resize]').forEach(function(handle) {
        handle.addEventListener('pointerdown', function(e) {
            if (panel.classList.contains('tc-left-float-panel--collapsed')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            var mode = handle.getAttribute('data-tc-resize') || 'se';
            var rect = panel.getBoundingClientRect();
            var startX = e.clientX;
            var startY = e.clientY;
            var startW = rect.width;
            var startH = rect.height;
            var startLeft = rect.left;
            var startTop = rect.top;
            var activePointerId = e.pointerId;

            function onResizeMove(ev) {
                if (activePointerId !== null && ev.pointerId !== activePointerId) return;
                tcLeftFloatComputeResize(
                    mode, startW, startH, startLeft, startTop,
                    ev.clientX - startX, ev.clientY - startY
                );
                tcLeftFloatAdaptContentToPanel();
                ev.preventDefault();
            }

            function endResize(ev) {
                if (activePointerId !== null && ev && ev.pointerId !== activePointerId) return;
                document.removeEventListener('pointermove', onResizeMove);
                document.removeEventListener('pointerup', endResize);
                document.removeEventListener('pointercancel', endResize);
                panel.classList.remove('tc-left-float-panel--resizing');
                document.body.classList.remove('tc-left-float-resizing');
                document.body.removeAttribute('data-tc-resize-cursor');
                saveTcLeftFloatSize();
                saveTcLeftFloatPosition();
                tcLeftFloatAdaptContentToPanel();
                tcLeftFloatNotifyLayoutChange();
            }

            panel.classList.add('tc-left-float-panel--resizing');
            document.body.classList.add('tc-left-float-resizing');
            document.body.setAttribute('data-tc-resize-cursor', mode);
            if (handle.setPointerCapture) {
                try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }
            document.addEventListener('pointermove', onResizeMove);
            document.addEventListener('pointerup', endResize);
            document.addEventListener('pointercancel', endResize);
        });
    });
}

function getTcActiveDrawerNum() {
    return 2;
}

function switchDrawer(drawerNum) {
    drawerNum = 2;
    var editLeftWrap = document.getElementById('left-content-wrapper');
    if (editLeftWrap) editLeftWrap.setAttribute('data-active-drawer', '2');
    applyDrawerLayout(drawerNum);
    if (!isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
    if (!isCollapsed && typeof tcLeftFloatAdaptContentToPanel === 'function') {
        tcLeftFloatAdaptContentToPanel();
    }
}

if (typeof window !== 'undefined') {
    window.toggleCollapse = toggleCollapse;
    window.ensureTcLeftPanelClosedForHeadlessGen = ensureTcLeftPanelClosedForHeadlessGen;
}
