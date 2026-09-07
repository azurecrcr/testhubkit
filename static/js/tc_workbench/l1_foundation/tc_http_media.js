/**
 * TestHub TC Workbench — L1 FOUNDATION
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function sleepImageTool(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function postImageBinaryWithRetry(url, formData, options) {
    const timeoutMs = (options && options.timeoutMs) || IMAGE_UPLOAD_LIMITS.timeoutMs;
    const maxRetries = (options && options.maxRetries) || IMAGE_UPLOAD_LIMITS.maxRetries;
    const retryDelayMs = (options && options.retryDelayMs) || IMAGE_UPLOAD_LIMITS.retryDelayMs;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
        try {
            const response = await fetch(url, { method: 'POST', body: formData, signal: controller.signal });
            clearTimeout(timer);
            const ct = response.headers.get('content-type') || '';
            if (!response.ok) {
                let msg = response.statusText || '请求失败';
                if (ct.indexOf('application/json') !== -1) {
                    try {
                        const j = await response.json();
                        if (j && j.error) msg = j.error;
                    } catch (parseErr) { /* ignore */ }
                }
                const retryStatuses = [408, 425, 429, 500, 502, 503, 504];
                if (retryStatuses.indexOf(response.status) !== -1 && attempt < maxRetries) {
                    lastErr = new Error(msg);
                    await sleepImageTool(retryDelayMs * attempt);
                    continue;
                }
                throw new Error(msg);
            }
            return await response.blob();
        } catch (err) {
            clearTimeout(timer);
            const aborted = err && err.name === 'AbortError';
            const net = err && (err.message === 'Failed to fetch' || err instanceof TypeError);
            if ((aborted || net) && attempt < maxRetries) {
                lastErr = err;
                await sleepImageTool(retryDelayMs * attempt);
                continue;
            }
            if (aborted) {
                throw new Error('请求超时，已多次重试仍失败');
            }
            throw err;
        }
    }
    if (lastErr && lastErr.message) throw lastErr;
    throw new Error('请求失败，请稍后重试');
}

// 自动调整输入框高度函数（超出 maxHeight 时显示滚动条）
function autoResizeTextarea(textarea, minHeight, maxHeight) {
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = newHeight + 'px';
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
}

/** 用例生成弹窗提示词：默认单行，最多 5.5 行可见，超出滚动 */
var TC_AI_PROMPT_VISIBLE_LINES = 5.5;
var TC_AI_PROMPT_SCROLL_EPS = 2;

function isTcAiPromptAtBottom(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= TC_AI_PROMPT_SCROLL_EPS;
}

function scrollTcAiPromptToBottom(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el) return;
    el.scrollTop = el.scrollHeight;
}

/** 滚轮手动上滑后暂停自动滚底；滚回底部后恢复 */
function syncTcAiPromptScrollLock(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + TC_AI_PROMPT_SCROLL_EPS) {
        el._tcPromptScrollLocked = false;
        return;
    }
    el._tcPromptScrollLocked = !isTcAiPromptAtBottom(el);
}

function maybeScrollTcAiPromptToBottom(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el || el._tcPromptScrollLocked) return;
    scrollTcAiPromptToBottom(el);
}

function getTcAiPromptResizeLimits(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el) return { min: 36, max: 118 };
    var computed = window.getComputedStyle(el);
    var lineHeight = parseFloat(computed.lineHeight) || 22;
    var pad = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    return {
        min: Math.ceil(lineHeight + pad),
        max: Math.ceil(lineHeight * TC_AI_PROMPT_VISIBLE_LINES + pad)
    };
}

function resizeTcAiPromptInput(textarea) {
    var el = textarea || document.getElementById('ai-prompt');
    if (!el || typeof autoResizeTextarea !== 'function') return;
    var lim = getTcAiPromptResizeLimits(el);
    el.style.height = 'auto';
    var scrollHeight = el.scrollHeight;
    autoResizeTextarea(el, lim.min, lim.max);
    var box = document.getElementById('tc-prompt-composer-box');
    if (box) {
        var multiline = scrollHeight > lim.min + 2;
        box.classList.toggle('tc-prompt-composer__box--multiline', multiline);
        if (multiline) {
            box.style.setProperty('border-radius', '10px', 'important');
        } else {
            box.style.removeProperty('border-radius');
        }
    }
    maybeScrollTcAiPromptToBottom(el);
}
window.isTcAiPromptAtBottom = isTcAiPromptAtBottom;
window.scrollTcAiPromptToBottom = scrollTcAiPromptToBottom;
window.syncTcAiPromptScrollLock = syncTcAiPromptScrollLock;
window.maybeScrollTcAiPromptToBottom = maybeScrollTcAiPromptToBottom;
window.getTcAiPromptResizeLimits = getTcAiPromptResizeLimits;
window.resizeTcAiPromptInput = resizeTcAiPromptInput;

function getPlaceholderBasedMinHeight(textarea, fallbackMinHeight, maxHeight) {
    const computed = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computed.lineHeight) || 24;
    const verticalPadding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
    const placeholderLines = (textarea.placeholder || '').split('\n').length;
    const placeholderMinHeight = placeholderLines * lineHeight + verticalPadding + 2;
    return Math.min(Math.max(fallbackMinHeight, placeholderMinHeight), maxHeight);
}

const TOOL_TAB_INACTIVE = ['border-slate-200', 'bg-white', 'text-slate-700'];
const TOOL_TAB_ACTIVE = ['border-indigo-300', 'bg-indigo-50', 'shadow-md', 'text-indigo-700'];

function setToolTabButtonActive(btn, on) {
    if (!btn) return;
    TOOL_TAB_INACTIVE.forEach(function (c) { btn.classList.remove(c); });
    TOOL_TAB_ACTIVE.forEach(function (c) { btn.classList.remove(c); });
    if (on) {
        TOOL_TAB_ACTIVE.forEach(function (c) { btn.classList.add(c); });
        btn.setAttribute('aria-selected', 'true');
    } else {
        TOOL_TAB_INACTIVE.forEach(function (c) { btn.classList.add(c); });
        btn.setAttribute('aria-selected', 'false');
    }
}

function setToolTabPanelActive(panel, on) {
    if (!panel) return;
    panel.classList.toggle('is-active', on);
    panel.hidden = !on;
}

const MEDIA_TOOL_TABS = {
    sizer: { btnId: 'media-tool-tab-sizer', panelId: 'img-tool-panel-sizer' },
    format: { btnId: 'media-tool-tab-format', panelId: 'img-tool-panel-format' },
    audio: { btnId: 'media-tool-tab-audio', panelId: 'media-workbench-audio-panel' },
};

function switchMediaToolTab(tab) {
    const key = Object.prototype.hasOwnProperty.call(MEDIA_TOOL_TABS, tab) ? tab : 'sizer';
    Object.keys(MEDIA_TOOL_TABS).forEach(function (id) {
        const cfg = MEDIA_TOOL_TABS[id];
        const btn = document.getElementById(cfg.btnId);
        const panel = document.getElementById(cfg.panelId);
        const on = id === key;
        if (btn) {
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        }
        setToolTabPanelActive(panel, on);
    });
}
window.switchMediaToolTab = switchMediaToolTab;
window.switchMediaWorkbench = function (tab) {
    switchMediaToolTab(tab === 'audio' ? 'audio' : 'sizer');
};
window.switchImageToolTab = function (tab) {
    switchMediaToolTab(tab === 'format' ? 'format' : 'sizer');
};

const DATA_TOOL_TABS = {
    json: { btnId: 'data-tool-tab-json', panelId: 'data-tool-panel-json' },
    base64: { btnId: 'data-tool-tab-base64', panelId: 'data-tool-panel-base64' },
    url: { btnId: 'data-tool-tab-url', panelId: 'data-tool-panel-url' },
    diff: { btnId: 'data-tool-tab-diff', panelId: 'data-tool-panel-diff' },
    timestamp: { btnId: 'data-tool-tab-timestamp', panelId: 'data-tool-panel-timestamp' },
};

function switchDataToolTab(tab) {
    const key = Object.prototype.hasOwnProperty.call(DATA_TOOL_TABS, tab) ? tab : 'json';
    Object.keys(DATA_TOOL_TABS).forEach(function (id) {
        const cfg = DATA_TOOL_TABS[id];
        const btn = document.getElementById(cfg.btnId);
        const panel = document.getElementById(cfg.panelId);
        const on = id === key;
        setToolTabButtonActive(btn, on);
        setToolTabPanelActive(panel, on);
    });
}
window.switchDataToolTab = switchDataToolTab;

document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('data-tool-panel-json')) {
        switchDataToolTab('{{ data_tool_tab|default("json") }}');
    }
    if (document.getElementById('media-tool-tab-sizer')) {
        switchMediaToolTab('{{ media_tool_tab|default("sizer") }}');
    }
});

// 初始化提示词输入框
const aiPrompt = document.getElementById('ai-prompt');
if (aiPrompt) {
    aiPrompt._tcPromptScrollLocked = false;
    resizeTcAiPromptInput(aiPrompt);
    aiPrompt.addEventListener('input', function() {
        resizeTcAiPromptInput(this);
        if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
    });
    aiPrompt.addEventListener('wheel', function() {
        var self = this;
        requestAnimationFrame(function() {
            syncTcAiPromptScrollLock(self);
        });
    }, { passive: true });
}

var TC_MINDMAP_LABEL_TREE_EXAMPLE = {
    label: '用户登录',
    children: [
        {
            label: '功能测试',
            children: [
                {
                    label: '正常登录',
                    children: [
                        { label: '账号密码登录成功' },
                        { label: '验证码登录成功' }
                    ]
                },
                {
                    label: '异常登录',
                    children: [
                        { label: '密码错误提示正确' },
                        { label: '账号不存在提示正确' }
                    ]
                }
            ]
        },
        {
            label: '兼容性测试',
            children: [
                {
                    label: '浏览器',
                    children: [
                        { label: 'Chrome正常' },
                        { label: 'Safari正常' }
                    ]
                }
            ]
        }
    ]
};

// ImageSizer工具 - 异步版本
let currentTaskId = null;
let pollInterval = null;

// 监听文件上传，获取图片信息
document.getElementById('file-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const sizeErr = getImageFileSizeError(file);
        if (sizeErr) {
            tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
            e.target.value = '';
            return;
        }
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        document.getElementById('original-size').textContent = fileSizeMB;

        // 获取图片分辨率
        const img = new Image();
        img.onload = function() {
            document.getElementById('image-resolution').textContent = `${img.width} x ${img.height}`;
            document.getElementById('preview-image').src = URL.createObjectURL(file);
            document.getElementById('image-preview').style.display = 'block';
            document.getElementById('upload-section').style.display = 'none';

            // 自动调整目标大小为原始大小的1.5倍
            const targetSize = (fileSizeMB * 1.5).toFixed(1);
            document.getElementById('target-size').value = targetSize;
        };
        img.src = URL.createObjectURL(file);
    }
});

// 拖拽上传功能
const uploadSection = document.getElementById('upload-section');
if (uploadSection) {
    uploadSection.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#1890ff';
        this.style.background = 'linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)';
    });

    uploadSection.addEventListener('dragleave', function(e) {
        this.style.borderColor = '#91d5ff';
        this.style.background = 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)';
    });

    uploadSection.addEventListener('drop', function(e) {
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
                document.getElementById('file-input').files = e.dataTransfer.files;
                // 触发change事件
                const event = new Event('change');
                document.getElementById('file-input').dispatchEvent(event);
            }
        }
    });
}

// 表单提交
document.getElementById('submit-btn')?.addEventListener('click', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        tcAppAlert('请先上传图片', { variant: 'warning', title: '提示' });
        return;
    }

    const file = fileInput.files[0];
    const sizeErr = getImageFileSizeError(file);
    if (sizeErr) {
                    tcAppAlert(sizeErr, { variant: 'warning', title: '提示' });
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_size', document.getElementById('target-size').value);

    const submitBtn = document.getElementById('submit-btn');
    const statusDiv = document.getElementById('task-status');

    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';
    
    // 显示处理中状态
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = `
        <div class="status-processing">
            <div class="spinner"></div>
            <div class="text-lg font-semibold">处理中...</div>
            <div class="text-sm mt-2">正在为您调整图片大小（超时或异常时将自动重试）</div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: 70%"></div>
            </div>
        </div>
    `;

    try {
        const blob = await postImageBinaryWithRetry('/api/image-sizer', formData);
        submitBtn.disabled = false;
        submitBtn.textContent = '提交任务';
        const blobUrl = URL.createObjectURL(blob);
        statusDiv.innerHTML = `
            <div class="status-completed">
                <div class="text-3xl mb-2">✓</div>
                <div class="text-lg font-semibold">处理完成！</div>
                <div class="text-sm mt-2">图片已准备就绪</div>
                <button id="download-btn" class="btn btn-primary mt-4" onclick="downloadResult('${blobUrl}')">下载图片</button>
            </div>
        `;
    } catch (error) {
        submitBtn.disabled = false;
        submitBtn.textContent = '提交任务';
        statusDiv.innerHTML = `
            <div class="status-error">
                <div class="text-3xl mb-2">✗</div>
                <div class="text-lg font-semibold">处理失败</div>
                <div class="text-sm mt-2">${(error && error.message) ? error.message : '请重试'}</div>
            </div>
        `;
    }
});

function downloadResult(blobUrl) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `resized_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// 重新上传按钮
document.getElementById('reupload-btn')?.addEventListener('click', function() {
    document.getElementById('file-input').value = '';
    document.getElementById('target-size').value = '1.0';
    document.getElementById('task-status').style.display = 'none';
    document.getElementById('task-status').innerHTML = '';
    document.getElementById('image-preview').style.display = 'none';
    document.getElementById('upload-section').style.display = 'block';
    currentTaskId = null;
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
    // 清空文件输入，触发重新选择
    document.getElementById('file-input').click();
});

// JSON格式化工具
document.getElementById('format-json')?.addEventListener('click', function() {
    const input = document.getElementById('json-input').value;
    const output = document.getElementById('json-output');
    const error = document.getElementById('json-error');

    fetch('/api/json-formatter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ json: input })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            error.textContent = data.error;
            output.textContent = '';
        } else {
            error.textContent = '';
            output.textContent = data.result;
        }
    });
});

document.getElementById('clear-json')?.addEventListener('click', function() {
    document.getElementById('json-input').value = '';
    document.getElementById('json-output').textContent = '格式化后的JSON将显示在这里...';
    document.getElementById('json-error').textContent = '';
});

// Base64转换工具
let base64Mode = 'encode';

document.getElementById('encode-tab')?.addEventListener('click', function() {
    base64Mode = 'encode';
    const enc = document.getElementById('encode-tab');
    const dec = document.getElementById('decode-tab');
    if (enc) {
        enc.classList.add('b64-mode-tab--active');
        enc.setAttribute('aria-selected', 'true');
    }
    if (dec) {
        dec.classList.remove('b64-mode-tab--active');
        dec.setAttribute('aria-selected', 'false');
    }
    document.getElementById('input-label').textContent = '输入文本';
    document.getElementById('output-label').textContent = 'Base64 输出';
    document.getElementById('base64-input').placeholder = '在此输入要编码的文本...';
});

document.getElementById('decode-tab')?.addEventListener('click', function() {
    base64Mode = 'decode';
    const enc = document.getElementById('encode-tab');
    const dec = document.getElementById('decode-tab');
    if (dec) {
        dec.classList.add('b64-mode-tab--active');
        dec.setAttribute('aria-selected', 'true');
    }
    if (enc) {
        enc.classList.remove('b64-mode-tab--active');
        enc.setAttribute('aria-selected', 'false');
    }
    document.getElementById('input-label').textContent = '输入Base64';
    document.getElementById('output-label').textContent = '解码结果';
    document.getElementById('base64-input').placeholder = '在此输入要解码的Base64...';
});

document.getElementById('convert-base64')?.addEventListener('click', function() {
    const input = document.getElementById('base64-input').value;
    const output = document.getElementById('base64-output');
    const error = document.getElementById('base64-error');

    fetch('/api/base64-converter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: base64Mode, text: input })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            error.textContent = data.error;
            output.textContent = '';
        } else {
            error.textContent = '';
            output.textContent = data.result;
        }
    });
});

document.getElementById('clear-base64')?.addEventListener('click', function() {
    document.getElementById('base64-input').value = '';
    document.getElementById('base64-output').textContent = '转换结果将显示在这里...';
    document.getElementById('base64-error').textContent = '';
});

// URL 编码/解码
(function initUrlTool() {
    const convertBtn = document.getElementById('convert-url');
    if (!convertBtn) return;

    let urlMode = 'encode';

    function getUrlPlus() {
        const checked = document.querySelector('input[name="url-encode-style"]:checked');
        return checked && checked.value === 'plus';
    }

    function updateUrlModeUi() {
        const enc = document.getElementById('url-encode-tab');
        const dec = document.getElementById('url-decode-tab');
        const label = document.getElementById('url-input-label');
        const outLabel = document.getElementById('url-output-label');
        const input = document.getElementById('url-input');
        const isEncode = urlMode === 'encode';

        if (enc) {
            enc.classList.toggle('b64-mode-tab--active', isEncode);
            enc.setAttribute('aria-selected', isEncode ? 'true' : 'false');
        }
        if (dec) {
            dec.classList.toggle('b64-mode-tab--active', !isEncode);
            dec.setAttribute('aria-selected', !isEncode ? 'true' : 'false');
        }
        if (label) label.textContent = isEncode ? '输入内容' : 'URL 编码文本';
        if (outLabel) outLabel.textContent = isEncode ? 'URL 输出' : '解码结果';
        if (input) {
            input.placeholder = isEncode
                ? '例如：https://example.com/search?q=你好 world'
                : '例如：https://example.com/search?q=%E4%BD%A0%E5%A5%BD%20world';
        }
    }

    document.getElementById('url-encode-tab')?.addEventListener('click', function () {
        urlMode = 'encode';
        updateUrlModeUi();
    });
    document.getElementById('url-decode-tab')?.addEventListener('click', function () {
        urlMode = 'decode';
        updateUrlModeUi();
    });

    convertBtn.addEventListener('click', function () {
        const input = document.getElementById('url-input')?.value || '';
        const output = document.getElementById('url-output');
        const error = document.getElementById('url-error');
        if (error) error.textContent = '';

        fetch('/api/url-converter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: urlMode,
                text: input,
                plus: getUrlPlus(),
            }),
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!output) return;
                if (data.error) {
                    if (error) error.textContent = data.error;
                    output.textContent = '';
                } else {
                    if (error) error.textContent = '';
                    output.textContent = data.result;
                }
            })
            .catch(function () {
                if (error) error.textContent = '转换请求失败，请稍后重试';
                if (output) output.textContent = '';
            });
    });

    document.getElementById('clear-url')?.addEventListener('click', function () {
        const inputEl = document.getElementById('url-input');
        const outputEl = document.getElementById('url-output');
        const errorEl = document.getElementById('url-error');
        if (inputEl) inputEl.value = '';
        if (outputEl) outputEl.textContent = '转换结果将显示在这里...';
        if (errorEl) errorEl.textContent = '';
    });

    updateUrlModeUi();
})();

// Unix 时间戳转换
(function initTimestampTool() {
    const convertBtn = document.getElementById('ts-convert-btn');
    if (!convertBtn) return;

    let tsMode = 'to_datetime';

    function getTsUnit() {
        const checked = document.querySelector('input[name="ts-unit"]:checked');
        return checked ? checked.value : 'auto';
    }

    function showTsError(msg) {
        const err = document.getElementById('ts-error');
        if (!err) return;
        err.textContent = msg || '';
    }

    function clearTsOutputs() {
        ['ts-out-datetime', 'ts-out-seconds', 'ts-out-milliseconds'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    function fillTsOutputs(result) {
        const dt = document.getElementById('ts-out-datetime');
        const sec = document.getElementById('ts-out-seconds');
        const ms = document.getElementById('ts-out-milliseconds');
        if (dt) dt.value = result.datetime || '';
        if (sec) sec.value = result.seconds != null ? String(result.seconds) : '';
        if (ms) ms.value = result.milliseconds != null ? String(result.milliseconds) : '';
    }

    function updateTsModeUi() {
        const toDt = document.getElementById('ts-mode-to-datetime');
        const toTs = document.getElementById('ts-mode-to-timestamp');
        const unitWrap = document.getElementById('ts-unit-wrap');
        const label = document.getElementById('ts-input-label');
        const input = document.getElementById('ts-input');
        const isToDatetime = tsMode === 'to_datetime';

        if (toDt) {
            toDt.classList.toggle('b64-mode-tab--active', isToDatetime);
            toDt.setAttribute('aria-selected', isToDatetime ? 'true' : 'false');
        }
        if (toTs) {
            toTs.classList.toggle('b64-mode-tab--active', !isToDatetime);
            toTs.setAttribute('aria-selected', !isToDatetime ? 'true' : 'false');
        }
        if (unitWrap) unitWrap.style.display = isToDatetime ? '' : 'none';
        if (label) label.textContent = isToDatetime ? 'Unix 时间戳' : '日期时间';
        if (input) {
            input.placeholder = isToDatetime
                ? '例如：1716532800 或 1716532800000'
                : '例如：2026-05-24 12:00:00';
        }
    }

    document.getElementById('ts-mode-to-datetime')?.addEventListener('click', function () {
        tsMode = 'to_datetime';
        updateTsModeUi();
    });
    document.getElementById('ts-mode-to-timestamp')?.addEventListener('click', function () {
        tsMode = 'to_timestamp';
        updateTsModeUi();
    });

    convertBtn.addEventListener('click', function () {
        const value = document.getElementById('ts-input')?.value || '';
        showTsError('');
        convertBtn.disabled = true;

        fetch('/api/timestamp-converter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: tsMode,
                value: value,
                unit: getTsUnit(),
            }),
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.error) {
                    showTsError(data.error);
                    clearTsOutputs();
                } else {
                    fillTsOutputs(data.result || {});
                }
            })
            .catch(function () {
                showTsError('转换请求失败，请稍后重试');
                clearTsOutputs();
            })
            .finally(function () {
                convertBtn.disabled = false;
            });
    });

    document.getElementById('ts-now-btn')?.addEventListener('click', function () {
        const nowMs = Date.now();
        const input = document.getElementById('ts-input');
        if (!input) return;
        if (tsMode === 'to_datetime') {
            const useMs = getTsUnit() === 'ms';
            input.value = useMs ? String(nowMs) : String(Math.floor(nowMs / 1000));
        } else {
            const d = new Date(nowMs);
            const pad = function (n) { return String(n).padStart(2, '0'); };
            input.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        }
    });

    document.getElementById('ts-clear-btn')?.addEventListener('click', function () {
        const input = document.getElementById('ts-input');
        if (input) input.value = '';
        showTsError('');
        clearTsOutputs();
    });

    document.querySelectorAll('[data-ts-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const targetId = btn.getAttribute('data-ts-copy');
            const el = targetId ? document.getElementById(targetId) : null;
            if (!el || !el.value) return;
            navigator.clipboard.writeText(el.value).catch(function () { /* ignore */ });
        });
    });

    updateTsModeUi();
})();

// 文本对比（Diff）
(function initTextDiffTool() {
    const compareBtn = document.getElementById('diff-compare-btn');
    if (!compareBtn) return;

    const DIFF_DRAFT_KEY = 'mdh_text_diff_draft_v1';
    let diffViewMode = 'split';
    let diffDraftLeavingHub = false;
    let diffDraftSaveTimer = null;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCharSegments(segments, side) {
        if (!segments || !segments.length) return '';
        return segments.map(function (seg) {
            const text = seg.text != null ? String(seg.text) : '';
            if (!text) return '';
            const type = seg.type || 'equal';
            let cls = 'text-diff-ch text-diff-ch--eq';
            if (type === 'delete' || (side === 'left' && type === 'change')) {
                cls = 'text-diff-ch text-diff-ch--del';
            } else if (type === 'insert' || (side === 'right' && type === 'change')) {
                cls = 'text-diff-ch text-diff-ch--ins';
            }
            return '<span class="' + cls + '" data-diff-type="' + escapeHtml(type) + '">' + escapeHtml(text) + '</span>';
        }).join('');
    }

    function setDiffViewMode(mode) {
        diffViewMode = mode === 'unified' ? 'unified' : 'split';
        const splitBtn = document.getElementById('diff-view-split');
        const unifiedBtn = document.getElementById('diff-view-unified');
        const splitEl = document.getElementById('diff-result-split');
        const unifiedEl = document.getElementById('diff-result-unified');
        if (splitBtn) {
            splitBtn.classList.toggle('text-diff-view-tab--active', diffViewMode === 'split');
            splitBtn.setAttribute('aria-selected', diffViewMode === 'split' ? 'true' : 'false');
        }
        if (unifiedBtn) {
            unifiedBtn.classList.toggle('text-diff-view-tab--active', diffViewMode === 'unified');
            unifiedBtn.setAttribute('aria-selected', diffViewMode === 'unified' ? 'true' : 'false');
        }
        if (splitEl) {
            const showSplit = diffViewMode === 'split';
            splitEl.classList.toggle('hidden', !showSplit);
            splitEl.hidden = !showSplit;
            splitEl.style.display = showSplit ? '' : 'none';
        }
        if (unifiedEl) {
            const showUnified = diffViewMode === 'unified';
            unifiedEl.classList.toggle('hidden', !showUnified);
            unifiedEl.hidden = !showUnified;
            unifiedEl.style.display = showUnified ? 'block' : 'none';
        }
    }

    function showDiffError(msg) {
        const err = document.getElementById('diff-error');
        if (!err) return;
        if (msg) {
            err.textContent = msg;
            err.hidden = false;
        } else {
            err.textContent = '';
            err.hidden = true;
        }
    }

    function isPageReload() {
        const nav = performance.getEntriesByType('navigation')[0];
        return !!(nav && nav.type === 'reload');
    }

    function shouldClearDiffDraftForHref(href) {
        if (!href || href.charAt(0) === '#') return false;
        if (/^javascript:/i.test(href)) return false;
        try {
            const u = new URL(href, window.location.origin);
            if (u.origin !== window.location.origin) return true;
            const path = u.pathname.replace(/\/+$/, '') || '/';
            if (path === '/tool/media-data-hub') return false;
            const legacyHub = {
                imagesizer: 1,
                'image-format-converter': 1,
                'audio-generator': 1,
                'media-tool': 1,
                'json-formatter': 1,
                'base64-converter': 1,
            };
            const m = path.match(/^\/tool\/([^/]+)$/);
            if (m && legacyHub[m[1]]) return false;
            return true;
        } catch (e) {
            return true;
        }
    }

    function saveDiffDraft() {
        const leftEl = document.getElementById('diff-input-left');
        const rightEl = document.getElementById('diff-input-right');
        if (!leftEl || !rightEl) return;
        try {
            sessionStorage.setItem(DIFF_DRAFT_KEY, JSON.stringify({
                left: leftEl.value,
                right: rightEl.value,
                ignoreWs: !!document.getElementById('diff-ignore-whitespace')?.checked,
            }));
        } catch (e) { /* ignore */ }
    }

    function scheduleSaveDiffDraft() {
        if (diffDraftSaveTimer) clearTimeout(diffDraftSaveTimer);
        diffDraftSaveTimer = setTimeout(function () {
            diffDraftSaveTimer = null;
            saveDiffDraft();
        }, 200);
    }

    function clearDiffDraftStorage() {
        try { sessionStorage.removeItem(DIFF_DRAFT_KEY); } catch (e) { /* ignore */ }
    }

    function clearDiffInputsAndResult() {
        const leftEl = document.getElementById('diff-input-left');
        const rightEl = document.getElementById('diff-input-right');
        if (leftEl) leftEl.value = '';
        if (rightEl) rightEl.value = '';
        const cb = document.getElementById('diff-ignore-whitespace');
        if (cb) cb.checked = false;
        showDiffError('');
        const statsEl = document.getElementById('diff-stats');
        if (statsEl) statsEl.textContent = '';
        renderDiffResult(null);
    }

    function restoreDiffDraft() {
        try {
            const raw = sessionStorage.getItem(DIFF_DRAFT_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            const leftEl = document.getElementById('diff-input-left');
            const rightEl = document.getElementById('diff-input-right');
            if (leftEl && data.left != null) leftEl.value = data.left;
            if (rightEl && data.right != null) rightEl.value = data.right;
            const cb = document.getElementById('diff-ignore-whitespace');
            if (cb && data.ignoreWs != null) cb.checked = !!data.ignoreWs;
        } catch (e) {
            clearDiffDraftStorage();
        }
    }

    function initDiffDraftLifecycle() {
        if (isPageReload()) {
            clearDiffDraftStorage();
            clearDiffInputsAndResult();
        } else {
            restoreDiffDraft();
        }

        document.addEventListener('click', function (e) {
            const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            const href = a.getAttribute('href');
            if (!shouldClearDiffDraftForHref(href)) return;
            diffDraftLeavingHub = true;
            clearDiffDraftStorage();
        }, true);

        window.addEventListener('pagehide', function () {
            if (diffDraftLeavingHub) return;
            saveDiffDraft();
        });

        window.addEventListener('pageshow', function (ev) {
            if (!document.getElementById('diff-input-left')) return;
            if (isPageReload()) {
                diffDraftLeavingHub = false;
                clearDiffDraftStorage();
                clearDiffInputsAndResult();
                return;
            }
            if (ev.persisted) {
                restoreDiffDraft();
            }
        });

        const leftEl = document.getElementById('diff-input-left');
        const rightEl = document.getElementById('diff-input-right');
        if (leftEl) leftEl.addEventListener('input', scheduleSaveDiffDraft);
        if (rightEl) rightEl.addEventListener('input', scheduleSaveDiffDraft);
        const cb = document.getElementById('diff-ignore-whitespace');
        if (cb) cb.addEventListener('change', scheduleSaveDiffDraft);
    }

    function renderDiffResult(result) {
        const stats = (result && result.stats) || {};
        const leftSegments = (result && result.left_segments) || [];
        const rightSegments = (result && result.right_segments) || [];
        const unifiedSegments = (result && result.unified_segments) || [];
        const empty = document.getElementById('diff-result-empty');
        const wrap = document.getElementById('diff-result-wrap');
        const splitEl = document.getElementById('diff-result-split');
        const unifiedEl = document.getElementById('diff-result-unified');
        const statsEl = document.getElementById('diff-stats');

        if (statsEl) {
            statsEl.textContent = '删除 ' + (stats.removed || 0) + ' 字 · 新增 ' + (stats.added || 0) + ' 字 · 相同 ' + (stats.unchanged || 0) + ' 字';
        }

        const hasResult = leftSegments.length || rightSegments.length || unifiedSegments.length;
        if (!hasResult) {
            if (empty) empty.classList.remove('hidden');
            if (wrap) {
                wrap.classList.add('hidden');
                wrap.hidden = true;
            }
            if (splitEl) splitEl.innerHTML = '';
            if (unifiedEl) unifiedEl.innerHTML = '';
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (wrap) {
            wrap.classList.remove('hidden');
            wrap.hidden = false;
        }

        const leftBody = renderCharSegments(leftSegments, 'left');
        const rightBody = renderCharSegments(rightSegments, 'right');
        const unifiedBody = renderCharSegments(unifiedSegments, 'unified');

        if (splitEl) {
            splitEl.innerHTML =
                '<div class="text-diff-split__col text-diff-split__col--left" aria-label="原始文本">' +
                '<div class="text-diff-split__head">原始</div>' +
                '<div class="text-diff-body font-mono text-sm">' + leftBody + '</div></div>' +
                '<div class="text-diff-split__col text-diff-split__col--right" aria-label="对比文本">' +
                '<div class="text-diff-split__head">对比</div>' +
                '<div class="text-diff-body font-mono text-sm">' + rightBody + '</div></div>';
        }
        if (unifiedEl) {
            unifiedEl.innerHTML = '<div class="text-diff-body text-diff-body--unified font-mono text-sm">' + unifiedBody + '</div>';
        }
        setDiffViewMode(diffViewMode);
    }

    document.getElementById('diff-view-split')?.addEventListener('click', function () {
        setDiffViewMode('split');
    });
    document.getElementById('diff-view-unified')?.addEventListener('click', function () {
        setDiffViewMode('unified');
    });

    compareBtn.addEventListener('click', function () {
        const left = document.getElementById('diff-input-left')?.value || '';
        const right = document.getElementById('diff-input-right')?.value || '';
        const ignoreWhitespace = !!document.getElementById('diff-ignore-whitespace')?.checked;
        showDiffError('');
        compareBtn.disabled = true;
        compareBtn.textContent = '对比中…';

        fetch('/api/text-diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                left: left,
                right: right,
                ignore_whitespace: ignoreWhitespace,
            }),
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.error) {
                    showDiffError(data.error);
                    renderDiffResult(null);
                } else {
                    renderDiffResult(data.result);
                }
            })
            .catch(function () {
                showDiffError('对比请求失败，请稍后重试');
            })
            .finally(function () {
                compareBtn.disabled = false;
                compareBtn.textContent = '开始对比';
            });
    });

    document.getElementById('diff-swap-btn')?.addEventListener('click', function () {
        const leftEl = document.getElementById('diff-input-left');
        const rightEl = document.getElementById('diff-input-right');
        if (!leftEl || !rightEl) return;
        const tmp = leftEl.value;
        leftEl.value = rightEl.value;
        rightEl.value = tmp;
        scheduleSaveDiffDraft();
    });

    document.getElementById('diff-clear-btn')?.addEventListener('click', function () {
        clearDiffDraftStorage();
        clearDiffInputsAndResult();
    });

    initDiffDraftLifecycle();
})();

// 音频生成工具
let currentAudioBlobUrl = null;

var HF_TOOLKIT_UNLOCK_PASSWORD = String(window.__TESTHUB_FEATURE_UNLOCK_PASSWORD__ || '').trim();
/** 仅当前页内存有效；刷新或关闭浏览器后重新上锁 */
var HF_UNLOCK_MEMORY = {};

function hfToolkitClearUnlockStorage() {
    try { sessionStorage.removeItem('hf_toolkit_unlock_v1'); } catch (e) { /* ignore */ }
}

function hfToolkitSetUnlockFlag(flag, on) {
    if (on) HF_UNLOCK_MEMORY[flag] = true;
    else delete HF_UNLOCK_MEMORY[flag];
}

function hfToolkitGetUnlockFlag(flag) {
    return !!HF_UNLOCK_MEMORY[flag];
}

function hfUnlockFailToast(message) {
    var text = String(message != null ? message : '密码错误，请重试').trim() || '密码错误，请重试';
    hfFloatToast(text, { placement: 'top', variant: 'warning', duration: 2000 });
}

var audioAiUnlocked = false;

function isAudioAiUnlocked() {
    if (typeof hfToolkitFeatureUsable === 'function' && hfToolkitFeatureUsable()) return true;
    return !!audioAiUnlocked;
}

var audioAiAuthed = false;
var audioAiUnlockUiBound = false;

function syncAudioAiChrome() {
    var wrap = document.getElementById('audio-ai-assist-wrap');
    if (!wrap) return;
    if (!audioAiAuthed) {
        wrap.classList.add('audio-ai-assist-wrap--login-required');
        wrap.classList.remove('audio-ai-assist-wrap--locked');
        return;
    }
    wrap.classList.remove('audio-ai-assist-wrap--login-required');
    wrap.classList.toggle('audio-ai-assist-wrap--locked', !audioAiUnlocked);
}

function setAudioAiUnlocked(on) {
    audioAiUnlocked = !!on;
    hfToolkitSetUnlockFlag('audio_ai', audioAiUnlocked);
    syncAudioAiChrome();
}

function openAudioAiUnlockModal() {
    var modal = document.getElementById('audio-ai-unlock-modal');
    var pwd = document.getElementById('audio-ai-unlock-password');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    if (pwd) { pwd.value = ''; setTimeout(function () { pwd.focus(); }, 50); }
}

function closeAudioAiUnlockModal() {
    var modal = document.getElementById('audio-ai-unlock-modal');
    var pwd = document.getElementById('audio-ai-unlock-password');
    if (pwd) pwd.value = '';
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function resetAudioAiUnlock() {
    audioAiUnlocked = false;
    setAudioAiUnlocked(false);
    closeAudioAiUnlockModal();
}

function bindAudioAiUnlockUi() {
    if (audioAiUnlockUiBound) return;
    audioAiUnlockUiBound = true;
    var trigger = document.getElementById('audio-ai-unlock-trigger');
    var modal = document.getElementById('audio-ai-unlock-modal');
    var submitBtn = document.getElementById('audio-ai-unlock-submit');
    var cancelBtn = document.getElementById('audio-ai-unlock-cancel');
    var pwdInp = document.getElementById('audio-ai-unlock-password');
    if (trigger) {
        trigger.addEventListener('click', function () {
            if (!audioAiAuthed) {
                showAudioAiLoginPrompt();
                return;
            }
            document.getElementById('audio-ai-prompt')?.focus();
        });
    }
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeAudioAiUnlockModal();
        });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closeAudioAiUnlockModal);
    if (submitBtn) {
        submitBtn.addEventListener('click', function () {
            var pwd = (pwdInp?.value || '').trim();
            if (!HF_TOOLKIT_UNLOCK_PASSWORD || pwd !== HF_TOOLKIT_UNLOCK_PASSWORD) {
                hfUnlockFailToast(HF_TOOLKIT_UNLOCK_PASSWORD ? '密码错误，请重试' : '未配置解锁密码');
                if (pwdInp) pwdInp.focus();
                return;
            }
            setAudioAiUnlocked(true);
            closeAudioAiUnlockModal();
            document.getElementById('audio-ai-prompt')?.focus();
        });
    }
    if (pwdInp) {
        pwdInp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitBtn?.click();
            }
            if (e.key === 'Escape') closeAudioAiUnlockModal();
        });
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeAudioAiUnlockModal();
    });
}

function bootstrapAudioAiUnlockUi() {
    if (!audioAiAuthed) return;
    setAudioAiUnlocked(true);
}

function isAudioAiUserAuthed(me) {
    return !!(me && me.authenticated);
}

function showAudioAiLoginPrompt() {
    var msg = '请先登录后再使用 AI 文案助手。';
    if (typeof window.tcAppConfirm === 'function') {
        return window.tcAppConfirm(msg, {
            title: '请先登录',
            variant: 'warning',
            confirmText: '去登录',
            cancelText: '取消',
        }).then(function (ok) {
            if (ok && window.HfAuthNav && window.HfAuthNav.loginUrl) {
                window.location.href = window.HfAuthNav.loginUrl();
            }
        });
    }
    if (typeof window.tcAppAlert === 'function') {
        return window.tcAppAlert(msg, { title: '请先登录', variant: 'warning' });
    }
    alert(msg);
    return Promise.resolve();
}

function refreshAudioAiAuthFromServer() {
    if (window.HfAuthNav && typeof window.HfAuthNav.fetchMe === 'function') {
        return window.HfAuthNav.fetchMe().then(syncAudioAiAuthLayout).catch(function () {
            syncAudioAiAuthLayout(null);
        });
    }
    return fetch('/api/auth/me', { credentials: 'same-origin' })
        .then(function (res) { return res.json(); })
        .then(syncAudioAiAuthLayout)
        .catch(function () { syncAudioAiAuthLayout(null); });
}

function syncAudioAiAuthLayout(me) {
    audioAiAuthed = isAudioAiUserAuthed(me);
    if (!audioAiAuthed) {
        audioAiUnlocked = false;
        hfToolkitSetUnlockFlag('audio_ai', false);
    }
    syncAudioAiChrome();
    bootstrapAudioAiUnlockUi();
}

(function initAudioAiUnlock() {
    var authListenerBound = false;
    function bindAuthListener() {
        if (authListenerBound) return;
        authListenerBound = true;
        document.addEventListener('hf-auth-nav-updated', function (ev) {
            syncAudioAiAuthLayout(ev.detail);
        });
    }
    function boot() {
        var wrap = document.getElementById('audio-ai-assist-wrap');
        if (!wrap) return false;
        bindAuthListener();
        refreshAudioAiAuthFromServer();
        return true;
    }
    if (!boot()) {
        document.addEventListener('DOMContentLoaded', boot);
    }
})();

document.getElementById('audio-ai-generate-btn')?.addEventListener('click', function() {
    if (!audioAiAuthed) {
        showAudioAiLoginPrompt();
        return;
    }
    if (!isAudioAiUnlocked()) {
        setAudioAiUnlocked(true);
    }
    const btn = this;
    const promptEl = document.getElementById('audio-ai-prompt');
    const textEl = document.getElementById('audio-input-text');
    const statusEl = document.getElementById('audio-ai-status');
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) {
        if (typeof tcAppAlert === 'function') {
            tcAppAlert('请先在 AI 文案助手中输入你的需求描述。', { variant: 'warning', title: '缺少提示信息' });
        } else {
            tcAppAlert('请先在 AI 文案助手中输入你的需求描述', { variant: 'warning', title: '提示' });
        }
        return;
    }
    const oldLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '生成中…';
    if (statusEl) statusEl.textContent = '正在调用内置 AI…';
    fetch('/api/builtin-ai/audio-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt: prompt }),
    })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
            if (!result.ok || result.data.error) {
                var data = result.data || {};
                if (typeof globalThis.hfAiQuotaFromErrorBody === 'function' && globalThis.hfAiQuotaFromErrorBody(data)) {
                    if (statusEl) statusEl.textContent = '';
                    return;
                }
                var errText = data.error || 'AI 生成失败';
                if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(errText)) {
                    if (statusEl) statusEl.textContent = '';
                    return;
                }
                throw new Error(errText);
            }
            const text = (result.data.text || '').trim();
            if (!text) throw new Error('AI 未返回有效文案');
            if (textEl) textEl.value = text;
            if (statusEl) statusEl.textContent = '已填入朗读正文，可继续编辑后生成音频';
            if (result.data.ai_quota && typeof globalThis.hfAiQuotaNotify === 'function') {
                globalThis.hfAiQuotaNotify(result.data.ai_quota);
            }
        })
        .catch(function (err) {
            if (statusEl) statusEl.textContent = '';
            const msg = err.message || 'AI 生成失败';
            if (typeof globalThis.hfAiQuotaFromErrorMsg === 'function' && globalThis.hfAiQuotaFromErrorMsg(msg)) {
                return;
            }
            if (typeof tcAppAlert === 'function') {
                tcAppAlert(msg, { variant: 'error', title: 'AI 文案生成失败', hint: '请检查内网 AI 服务是否可用后重试。' });
            } else {
                tcAppAlert(msg, { variant: 'warning', title: '提示' });
            }
        })
        .finally(function () {
            btn.disabled = false;
            btn.textContent = oldLabel;
        });
});

document.getElementById('clear-audio-btn')?.addEventListener('click', function() {
    const textEl = document.getElementById('audio-input-text');
    const aiPromptEl = document.getElementById('audio-ai-prompt');
    const aiStatusEl = document.getElementById('audio-ai-status');
    const durationEl = document.getElementById('audio-duration');
    const formatEl = document.getElementById('audio-format');
    const voiceEl = document.getElementById('audio-voice');
    const resultEl = document.getElementById('audio-result');
    const playerWrapper = document.getElementById('audio-player-wrapper');
    const previewEl = document.getElementById('audio-preview');
    const downloadLink = document.getElementById('audio-download-link');

    if (textEl) textEl.value = '';
    if (aiPromptEl) aiPromptEl.value = '';
    if (aiStatusEl) aiStatusEl.textContent = '';
    if (durationEl) durationEl.value = '5';
    if (formatEl) formatEl.value = 'mp3';
    if (voiceEl) voiceEl.value = 'auto';
    if (resultEl) {
        resultEl.innerHTML = `
            <div class="ds-empty">
                <span class="ds-empty__icon" aria-hidden="true">🎵</span>
                <div class="ds-empty__title">等待生成</div>
                <div class="ds-empty__desc">生成完成后将显示摘要，下方出现播放器与下载按钮</div>
            </div>
        `;
    }
    if (playerWrapper) playerWrapper.classList.add('hidden');
    if (previewEl) previewEl.removeAttribute('src');
    if (downloadLink) downloadLink.setAttribute('href', '#');
    if (currentAudioBlobUrl) {
        URL.revokeObjectURL(currentAudioBlobUrl);
        currentAudioBlobUrl = null;
    }
});

document.getElementById('generate-audio-btn')?.addEventListener('click', function() {
    const btn = this;
    const textEl = document.getElementById('audio-input-text');
    const formatEl = document.getElementById('audio-format');
    const durationEl = document.getElementById('audio-duration');
    const voiceEl = document.getElementById('audio-voice');
    const resultEl = document.getElementById('audio-result');
    const playerWrapper = document.getElementById('audio-player-wrapper');
    const previewEl = document.getElementById('audio-preview');
    const downloadLink = document.getElementById('audio-download-link');

    const text = (textEl?.value || '').trim();
    const targetFormat = (formatEl?.value || 'mp3').trim();
    const duration = parseFloat(durationEl?.value || '0');
    const voice = (voiceEl?.value || 'auto').trim() || 'auto';

    if (!text) {
        tcAppAlert('请输入中文或英文文本', { variant: 'warning', title: '提示' });
        return;
    }
    if (!duration || duration <= 0) {
        tcAppAlert('请输入正确的音频时长（秒）', { variant: 'warning', title: '提示' });
        return;
    }

    const formData = new FormData();
    formData.append('text', text);
    formData.append('target_format', targetFormat);
    formData.append('duration', String(duration));
    formData.append('voice', voice);

    btn.disabled = true;
    btn.textContent = '生成中...';
    resultEl.innerHTML = `
        <div class="ds-loading-inline">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" aria-hidden="true"></div>
            <div class="font-medium text-slate-700">正在生成音频</div>
            <div class="text-sm text-slate-500">请稍候，勿关闭页面</div>
        </div>
    `;

    fetch('/api/audio-generator', {
        method: 'POST',
        body: formData
    })
        .then(async response => {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const errData = await response.json();
                throw new Error(errData.error || '音频生成失败');
            }
            if (!response.ok) {
                throw new Error('音频生成失败');
            }

            const contentDisposition = response.headers.get('Content-Disposition') || '';
            const actualDurationHeader = response.headers.get('X-Actual-Duration') || '';
            const appliedVoiceHeader = response.headers.get('X-Applied-Voice') || '';
            const ttsEngineHeader = response.headers.get('X-TTS-Engine') || 'edge-tts';
            let fileName = `generated_audio.${targetFormat}`;
            const nameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
            if (nameMatch && nameMatch[1]) {
                fileName = nameMatch[1];
            }

            const blob = await response.blob();
            if (!blob || blob.size <= 0) {
                throw new Error('生成的音频为空，请重试');
            }
            return { blob, fileName, actualDurationHeader, appliedVoiceHeader, ttsEngineHeader };
        })
        .then(({ blob, fileName, actualDurationHeader, appliedVoiceHeader, ttsEngineHeader }) => {
            if (currentAudioBlobUrl) {
                URL.revokeObjectURL(currentAudioBlobUrl);
            }
            currentAudioBlobUrl = URL.createObjectURL(blob);
            previewEl.src = currentAudioBlobUrl;
            downloadLink.href = currentAudioBlobUrl;
            downloadLink.download = fileName;
            playerWrapper.classList.remove('hidden');

            const actualDuration = parseFloat(actualDurationHeader || '0');
            const targetDuration = duration;
            const voiceOpt = voiceEl && voiceEl.options[voiceEl.selectedIndex];
            const voiceLabel = voiceOpt ? voiceOpt.textContent.trim() : appliedVoiceHeader;
            const engineNote = ttsEngineHeader === 'edge-tts'
                ? `<div class="text-xs text-slate-500 mt-1">引擎：Microsoft Edge TTS · 音色 ${voiceLabel || appliedVoiceHeader}</div>`
                : `<div class="ds-alert ds-alert--info text-sm mt-2">当前为离线备用引擎，音色差异有限；请升级 edge-tts 后使用 Neural 音色。</div>`;
            const durationNote = (actualDuration > 0 && actualDuration + 0.2 < targetDuration)
                ? `<div class="ds-alert ds-alert--info text-sm mt-2">当前音频时长 ${actualDuration.toFixed(1)}s，小于目标时长 ${targetDuration.toFixed(1)}s。可增加文本内容以提高时长。</div>`
                : '';
            resultEl.innerHTML = `
                <div class="p-4 space-y-2">
                    <div class="ds-alert ds-alert--success">成功生成</div>
                    ${engineNote}
                    ${durationNote}
                </div>
            `;
        })
        .catch(error => {
            resultEl.innerHTML = `<div class="p-4"><div class="ds-alert ds-alert--error">生成失败：${error.message}</div></div>`;
            playerWrapper.classList.add('hidden');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '生成音频';
        });
});

// 提示词输入：切换模式时由 loadTcAiPromptDraftForMode 恢复；输入时写入当前模式草稿
(function() {
    var el = document.getElementById('ai-prompt');
    if (!el) return;
    el.addEventListener('input', function() {
        if (typeof saveTcAiPromptDraftForMode === 'function') {
            saveTcAiPromptDraftForMode(typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset');
        }
    });
})();

function collectAiRequestImages() {
    return [];
}

function buildTcTableHeaderSnippet() {
    if (!tableColumns || !tableColumns.length) return '';
    return tableColumns.map(function(c) { return String(c); }).join('、');
}

function buildTcEditModeStepPromptHint() {
    if (!tableColumns || !tableColumns.length) return '';
    if (tableColumns.indexOf('编辑模式') < 0) return '';
    return '【编辑模式字段要求】\n编辑模式字段必须且只能填写：STEP（全大写，禁止使用 STMP 或其他值；不得留空）。';
}

/** 本会话各轮快速规划的用户输入（legacy 兜底；主路径见 TcWorkbenchSession + 数据库 lanhu_url） */
var _tcGenUserPromptHistory = [];
var _tcGenUserPromptHistoryLastBatchId = '';

function getTcPreviousGenUserPrompts() {
    if (typeof window !== 'undefined' &&
        window.TcWorkbenchSession &&
        typeof window.TcWorkbenchSession.getPreviousUserPromptsForCurrentLanhu === 'function') {
        return window.TcWorkbenchSession.getPreviousUserPromptsForCurrentLanhu();
    }
    return _tcGenUserPromptHistory.slice();
}

function pushTcGenUserPromptToHistory(text, batchId) {
    if (typeof window !== 'undefined' &&
        window.TcWorkbenchSession &&
        typeof window.TcWorkbenchSession.getPreviousUserPromptsForCurrentLanhu === 'function') {
        return;
    }
    var t = String(text || '').trim();
    if (!t) return;
    var bid = String(batchId || '').trim();
    if (bid && bid === _tcGenUserPromptHistoryLastBatchId) return;
    _tcGenUserPromptHistoryLastBatchId = bid;
    _tcGenUserPromptHistory.push(t);
}

function clearTcGenUserPromptHistory() {
    _tcGenUserPromptHistory = [];
    _tcGenUserPromptHistoryLastBatchId = '';
}

function buildTcPreviousUserPromptsBlock(previousPrompts) {
    var list = Array.isArray(previousPrompts) ? previousPrompts : [];
    var items = list.map(function (p) { return String(p || '').trim(); }).filter(Boolean);
    if (!items.length) return '';
    var lines = items.map(function (p, i) {
        return '第' + (i + 1) + '轮：' + p;
    });
    return (
        '【历史用户输入】\n' +
        '以下为当前会话、当前蓝湖需求地址下，用户先前各轮生成用例时输入的内容（按时间从早到晚），供你理解完整意图与上下文。\n' +
        '若与【当前页需求（蓝湖）】或本轮指令冲突，以当前页需求与本轮指令为准。\n' +
        lines.join('\n')
    );
}

/**
 * 组装 AI 生成提示词：提示词 + 表头 + 需求 + 知识库（Context Stack 时蓝湖优先）
 */
function composeTcAiGeneratePrompt(userPrompt, requirements, opts) {
    opts = opts || {};
    var parts = [];
    var prompt = String(userPrompt != null ? userPrompt : '').trim();
    if (prompt) parts.push(prompt);
    var prevBlock = buildTcPreviousUserPromptsBlock(opts.previousUserPrompts);
    if (prevBlock) parts.push(prevBlock);
    var headerLine = buildTcTableHeaderSnippet();
    if (headerLine) {
        parts.push(
            '【表头】\n' + headerLine +
            '\n\n请严格按以上表头字段及顺序生成用例：每条用例为一条内层数组，字段个数与顺序必须与表头一致，不得增加、删减或调换字段，不要生成与表头无关的无用列或用例。'
        );
        var editModeHint = buildTcEditModeStepPromptHint();
        if (editModeHint) parts.push(editModeHint);
        if (!opts.mindmap) {
            parts.push(
                '【输出格式】\n' +
                '仅输出 Python 列表，格式为 test_cases = [[\"字段1\", ...], ...]；可放在 ```python 代码块中。' +
                '不要输出解释文字、Markdown 表格或 JSON 对象包装。'
            );
        }
    }
    var req = String(requirements != null ? requirements : '').trim();
    var useStack = !!(opts.contextStackEnabled ||
        (typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled()));
    if (useStack) {
        if (req) parts.push('【当前页需求（蓝湖）】\n' + req);
        var publicCtx = String(opts.publicContext != null ? opts.publicContext : '').trim();
        if (publicCtx) parts.push('【平台历史案例（公共库）】\n' + publicCtx);
    } else {
        var legacy = String(opts.legacyRag != null ? opts.legacyRag : '').trim();
        if (legacy) parts.push('【知识库-历史需求】\n' + legacy);
        if (req) parts.push('【当前页需求（蓝湖）】\n' + req);
    }
    return parts.join('\n\n');
}

/** 导图默认规则：页面加载后从 GET /api/test-cases/system-prompts 拉取（MySQL tc_system_prompts） */
var TC_MINDMAP_RULE_PRESET = [
    "# 角色",
    "你是精通测试设计的高级测试架构师。",
    "# 任务",
    "用\"要素分类法\"为指定功能生成思维导图测试用例，格式可直接导入XMind。",
    "# 规则",
    "1. **层级结构**：测试对象 → 测试要素 → 要素取值 → 测试用例（TC开头）",
    "2. **要素维度**：用户类型、输入数据、操作步骤、环境、网络、系统状态、异常场景等",
    "3. **用例要求**：具体可执行，覆盖正向、异常、边界、组合场景",
    "# 输出格式",
    "- 用缩进表示层级：中心主题无缩进，每层缩进4个空格",
    "- 用例以\"TC:\"开头，描述必须具体",
    "# 示例：用户登录功能",
    "用户登录功能",
    "    **输入数据-账号**",
    "        有效账号",
    "            TC: 输入注册手机号，验证登录成功并跳转主页",
    "        无效账号",
    "            TC: 输入未注册手机号，验证提示\"账号不存在\"",
    "        空账号",
    "            TC: 账号留空点击登录，验证提示\"账号不能为空\"",
    "    **输入数据-密码**",
    "        正确密码",
    "            TC: 输入匹配密码，验证登录成功",
    "        错误密码",
    "            TC: 输入错误密码，验证提示\"账号或密码错误\"",
    "    **网络环境**",
    "        断网",
    "            TC: 断网点击登录，验证立即提示\"网络连接失败\"",
    "        弱网",
    "            TC: 弱网下登录，验证超时后给出友好提示",
    "    **系统状态**",
    "        账号冻结",
    "            TC: 使用已冻结账号登录，验证提示\"账号已被冻结\"",
    "---",
    "请为以下功能生成测试用例："
].join(String.fromCharCode(10));
var TC_MINDMAP_RULE_CUSTOM = TC_MINDMAP_RULE_PRESET;
var tcMindmapRootTopic = '测试用例';
/** 表格转导图时由后端返回的 jsMind 数据；清空导图或 AI 重新生成时置 null */
var tcMindmapExternalMindData = null;

function fetchTcSystemPrompts() {
    return fetch('/api/test-cases/system-prompts')
        .then(function(response) {
            return response.json().catch(function() {
                throw new Error('加载系统提示词失败（HTTP ' + response.status + '）');
            });
        })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            if (data.mindmap_rule_preset) TC_MINDMAP_RULE_PRESET = String(data.mindmap_rule_preset);
            if (data.mindmap_rule_custom) TC_MINDMAP_RULE_CUSTOM = String(data.mindmap_rule_custom);
            if (data.table_generate_default) {
                if (typeof window !== 'undefined') window.TC_DEFAULT_PROMPT = String(data.table_generate_default);
            }
        })
        .catch(function(err) {
            console.warn('[TestHub] 系统提示词使用本地兜底:', err && err.message ? err.message : err);
        });
}

/**
 * 导图用例生成（独立于列表）：用户提示词 + 导图规则 + 输出说明 + 外部上下文
 */
function composeMindmapCaseGeneratePrompt(userPrompt, requirements, mode, opts) {
    opts = opts || {};
    var parts = [];
    var prompt = String(userPrompt != null ? userPrompt : '').trim();
    if (prompt) parts.push(prompt);

    var rule = mode === 'custom' ? TC_MINDMAP_RULE_CUSTOM : TC_MINDMAP_RULE_PRESET;
    parts.push('【导图生成要求】\n' + rule);
    parts.push(
        '【输出说明】\n' +
        '请严格按规则中的缩进层级输出（第一层无缩进，第二层4空格，第三层8空格，第四层12空格并以 TC: 开头）。\n' +
        '不要输出 Python 代码、test_cases 列表或 JSON。仅输出思维导图层级文本。'
    );

    var lanhuOpen = false;
    if (typeof getTcLanhuCredentialsForMode === 'function') {
        var lanhuMode = typeof getAiConfigMode === 'function' ? getAiConfigMode() : 'preset';
        var lanhuCreds = getTcLanhuCredentialsForMode(lanhuMode);
        lanhuOpen = !!(lanhuCreds && lanhuCreds.cookie && lanhuCreds.url);
    }
    var ragOpen = typeof isTcRagEnabled === 'function' && isTcRagEnabled();
    var req = String(requirements != null ? requirements : '').trim();
    if (lanhuOpen && req) {
        parts.push('【当前页需求（蓝湖）】\n' + req);
    }
    if (ragOpen) {
        var useStack = !!(opts.contextStackEnabled ||
            (typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled()));
        var ragCtx = useStack
            ? String(opts.publicContext != null ? opts.publicContext : '').trim()
            : String(opts.legacyRag != null ? opts.legacyRag : (opts.ragContext || '')).trim();
        if (ragCtx) {
            var ragLabel = useStack ? '【平台历史案例（公共库）】' : '【知识库-历史需求】';
            parts.push(ragLabel + '\n' + ragCtx);
        }
    }
    return parts.join('\n\n');
}


function stripPageIdFromLanhuUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    return url
        .replace(/([?&])pageId=[^&]*/gi, '$1')
        .replace(/([?&])page_id=[^&]*/gi, '$1')
        .replace(/[?&]$/, '')
        .replace(/\?&/, '?');
}

function getTcActiveLanhuPageId() {
    if (window.TcRequirementCaseStore && typeof window.TcRequirementCaseStore.getActiveLanhuPageId === 'function') {
        var active = String(window.TcRequirementCaseStore.getActiveLanhuPageId() || '').trim();
        if (active) return active;
    }
    if (typeof window.getTcLanhuDocTreeMeta === 'function') {
        var meta = window.getTcLanhuDocTreeMeta() || {};
        var selected = String(meta.selectedId || meta.focusPageId || '').trim();
        if (selected) return selected;
    }
    return '';
}

function resolveTcLanhuUrlWithPageId(url, pageId) {
    url = String(url || '').trim();
    pageId = String(pageId || '').trim();
    if (!url) return '';
    if (!pageId) return url;
    var base = stripPageIdFromLanhuUrl(url) || url;
    if (typeof window.buildTcLanhuPageUrl === 'function') {
        return window.buildTcLanhuPageUrl(base, pageId);
    }
    if (/[?&]pageId=/.test(url)) {
        return url.replace(/([?&]pageId=)[^&]*/, '$1' + encodeURIComponent(pageId));
    }
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'pageId=' + encodeURIComponent(pageId);
}

window.stripPageIdFromLanhuUrl = stripPageIdFromLanhuUrl;
window.resolveTcLanhuUrlWithPageId = resolveTcLanhuUrlWithPageId;
window.getTcActiveLanhuPageId = getTcActiveLanhuPageId;

function getTcLanhuCredentialsForMode(mode) {
    var cookieEl = document.getElementById('lanhu-cookie');
    var urlEl = document.getElementById('lanhu-url');
    var cookie = cookieEl ? String(cookieEl.value || '').trim() : '';
    var url = urlEl ? String(urlEl.value || '').trim() : '';
    if (!cookie) {
        var tc = document.getElementById('tc-lanhu-tree-cookie');
        cookie = tc ? String(tc.value || '').trim() : '';
    }
    if (!url) {
        var tu = document.getElementById('tc-lanhu-tree-url');
        url = tu ? String(tu.value || '').trim() : '';
    }
    var pageId = getTcActiveLanhuPageId();
    if (!pageId && url) {
        var pageMatch = url.match(/[?&]pageId=([^&]+)/i);
        if (pageMatch && pageMatch[1]) {
            try { pageId = decodeURIComponent(pageMatch[1]); } catch (ePage) { pageId = pageMatch[1]; }
        }
    }
    if (pageId && url) {
        url = resolveTcLanhuUrlWithPageId(url, pageId);
    }
    return { cookie: cookie, url: url, page_id: pageId };
}

function validateTcLanhuCredentials(cookie, url, modeLabel) {
    if ((cookie && !url) || (!cookie && url)) {
        tcAppAlert('从蓝湖拉取需求需同时填写 Cookie 与文档 URL，或两项都留空（仅使用提示词与表头）。', {
            variant: 'warning',
            title: '蓝湖参数不完整',
            hint: modeLabel || ''
        });
        return false;
    }
    return true;
}

function isTcRagFeatureUnlocked() {
    if (typeof window.tcPublicRagAdminUnlocked === 'function' && window.tcPublicRagAdminUnlocked()) {
        return true;
    }
    return !!TC_FEATURE_UNLOCK_STATE.rag;
}

function isTcRagEnabled() {
    if (!isTcRagFeatureUnlocked()) return false;
    var el = document.getElementById('tc-rag-enabled');
    return !!(el && el.checked);
}

function setTcRagToggleEnabled(on) {
    var el = document.getElementById('tc-rag-enabled');
    if (el) el.checked = !!on;
    paintTcRagToggleUi();
    syncTcRagLockChrome();
    if (on) updateTcRagStatusHint();
    else updateTcRagToggleHint('');
}

function syncTcRagLockChrome() {
    var locked = !isTcRagFeatureUnlocked();
    var el = document.getElementById('tc-rag-enabled');
    var label = document.getElementById('tc-rag-toggle-label');
    var staticHint = document.getElementById('tc-rag-toggle-static-hint');
    if (staticHint) {
        staticHint.textContent = locked
            ? '须先输入密码解锁'
            : '开启后检索平台公共知识库；须先填写蓝湖 Cookie 与文档 URL';
    }
    if (el) {
        if (locked) {
            el.checked = false;
            el.disabled = true;
        } else {
            el.disabled = false;
        }
    }
    paintTcRagToggleUi();
    if (locked) updateTcRagToggleHint('已锁定，点击输入密码解锁');
    refreshTcRagHelpTip();
}

function refreshTcRagHelpTip() {
    var staticHint = document.getElementById('tc-rag-toggle-static-hint');
    var cookieEl = document.getElementById('tc-rag-cookie-hint-line');
    var wrap = staticHint && staticHint.closest('.tc-gen-option-help-wrap');
    if (!wrap) return;
    var parts = [];
    var base = staticHint ? String(staticHint.textContent || '').trim() : '';
    if (base) parts.push(base);
    if (isTcRagEnabled() && cookieEl) {
        var cookieLine = String(cookieEl.textContent || '').trim();
        if (cookieLine) parts.push(cookieLine);
    }
    wrap.setAttribute('data-tip', parts.join('\n\n'));
}

function syncTcRagEnableHint() {
    document.querySelectorAll('.tc-rag-enable-hint').forEach(function(el) {
        el.classList.add('hidden');
    });
    refreshTcRagHelpTip();
}

