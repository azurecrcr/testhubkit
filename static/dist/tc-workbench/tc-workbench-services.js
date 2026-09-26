/* ---- tc_http_media.js ---- */
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

var HF_TOOLKIT_UNLOCK_PASSWORD = 'hugokit.123';
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
            if (pwd !== HF_TOOLKIT_UNLOCK_PASSWORD) {
                hfUnlockFailToast('密码错误，请重试');
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


/* ---- tc_context_budget.js ---- */
/**
 * TestHub — 客户端 Token 预算（与后端 context_budget.py 对齐）
 */
var TC_DEFAULT_BUDGET = {
    total_cap: 12000,
    layer_ratio: { requirements: 0.45, personal: 0.35, public: 0.20 },
    stage_multiplier: {
        summary: { requirements: 0.6, personal: 0.3, public: 0.2 },
        module: { requirements: 0.8, personal: 0.7, public: 0.6 },
        row: { requirements: 0.5, personal: 0.5, public: 0.4 }
    },
    min_requirements_tokens: 800
};

function tcEstimateTokens(text) {
    var t = String(text || '');
    if (!t) return 0;
    return Math.max(1, Math.floor(t.length / 4));
}

function tcTrimTextByTokens(text, tokenCap) {
    if (tokenCap <= 0) return '';
    var charCap = Math.max(1, tokenCap * 4);
    var t = String(text || '');
    if (t.length <= charCap) return t;
    if (charCap <= 80) return t.slice(0, charCap);
    return t.slice(0, Math.floor(charCap / 2)) + '\n…（已裁剪）\n' + t.slice(-Math.floor(charCap / 2));
}

function tcTrimChunksByTokens(chunks, tokenCap) {
    chunks = chunks || [];
    if (tokenCap <= 0 || !chunks.length) return { chunks: [], text: '' };
    var kept = [];
    var parts = [];
    var used = 0;
    for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        var text = String(c.text || '');
        var need = tcEstimateTokens(text);
        if (used + need > tokenCap) {
            var remain = tokenCap - used;
            if (remain < 80) break;
            var trimmed = tcTrimTextByTokens(text, remain);
            if (trimmed) {
                var copy = Object.assign({}, c, { text: trimmed, preview: trimmed.slice(0, 240) });
                kept.push(copy);
                parts.push(trimmed);
            }
            break;
        }
        kept.push(c);
        parts.push(text);
        used += need;
    }
    return { chunks: kept, text: parts.join('\n\n---\n\n') };
}

function tcAllocateContextLayers(layers, stage, budgetConfig) {
    layers = layers || {};
    var cfg = TC_DEFAULT_BUDGET;
    if (budgetConfig && budgetConfig.total_cap) cfg = Object.assign({}, TC_DEFAULT_BUDGET, budgetConfig);
    stage = String(stage || 'module').toLowerCase();
    var multipliers = (cfg.stage_multiplier && cfg.stage_multiplier[stage]) || cfg.stage_multiplier.module;
    var ratios = cfg.layer_ratio || TC_DEFAULT_BUDGET.layer_ratio;
    var totalCap = cfg.total_cap || 12000;

    var reqCap = Math.max(
        Math.floor((cfg.min_requirements_tokens || 800) * (multipliers.requirements || 1)),
        Math.floor(totalCap * (ratios.requirements || 0.45) * (multipliers.requirements || 1))
    );
    var personalCap = Math.floor(totalCap * (ratios.personal || 0.35) * (multipliers.personal || 1));
    var publicCap = Math.floor(totalCap * (ratios.public || 0.20) * (multipliers.public || 1));

    var reqText = tcTrimTextByTokens((layers.requirements && layers.requirements.text) || '', reqCap);
    var personalRaw = layers.personal || {};
    var publicRaw = layers.public || {};
    var personalTrim = tcTrimChunksByTokens(personalRaw.chunks || [], personalCap);
    var publicTrim = tcTrimChunksByTokens(publicRaw.chunks || [], publicCap);

    var out = {
        requirements: { tokens: tcEstimateTokens(reqText), text: reqText, chunks: [] },
        personal: { tokens: tcEstimateTokens(personalTrim.text), text: personalTrim.text, chunks: personalTrim.chunks },
        public: { tokens: tcEstimateTokens(publicTrim.text), text: publicTrim.text, chunks: publicTrim.chunks }
    };
    var used = out.requirements.tokens + out.personal.tokens + out.public.tokens;
    return {
        layers: out,
        budget: {
            used: used,
            cap: totalCap,
            by_layer: {
                requirements: out.requirements.tokens,
                personal: out.personal.tokens,
                public: out.public.tokens
            }
        }
    };
}

window.tcEstimateTokens = tcEstimateTokens;
window.tcAllocateContextLayers = tcAllocateContextLayers;

/* ---- tc_prompt_guard.js ---- */
/**
 * 用例生成提示词：软提示（字符/token 条）与大批量粘贴确认
 */
(function(global) {
    'use strict';

    var TC_PROMPT_SOFT_HINT_CHARS = 8000;
    var TC_PROMPT_BAR_REF_CHARS = 16000;
    var TC_PROMPT_PASTE_CONFIRM_CHARS = 4000;

    function getPromptEl() {
        return document.getElementById('ai-prompt');
    }

    function estimateTokens(text) {
        if (typeof global.tcEstimateTokens === 'function') {
            return global.tcEstimateTokens(text);
        }
        var t = String(text || '');
        if (!t) return 0;
        return Math.max(1, Math.floor(t.length / 4));
    }

    function syncTcPromptBudgetBar(textarea) {
        var el = textarea || getPromptEl();
        var bar = document.getElementById('tc-prompt-budget-bar');
        if (!el || !bar) return;
        var text = String(el.value || '');
        var chars = text.length;
        var tokens = estimateTokens(text);
        var pct = Math.min(100, Math.round((chars / TC_PROMPT_BAR_REF_CHARS) * 100));
        var fill = bar.querySelector('.tc-prompt-budget-bar__fill');
        var label = bar.querySelector('.tc-prompt-budget-bar__text');
        if (fill) fill.style.width = pct + '%';
        bar.classList.toggle('tc-prompt-budget-bar--warn', chars >= TC_PROMPT_SOFT_HINT_CHARS && chars < TC_PROMPT_BAR_REF_CHARS);
        bar.classList.toggle('tc-prompt-budget-bar--hot', chars >= TC_PROMPT_BAR_REF_CHARS);
        if (label) {
            var hint = '';
            if (chars >= TC_PROMPT_SOFT_HINT_CHARS) {
                hint = ' · 内容较长，可能影响生成质量，建议精简或分批';
            }
            label.textContent = chars.toLocaleString() + ' 字 · 约 ' + tokens.toLocaleString() + ' tokens' + hint;
        }
    }

    function applyPasteText(textarea, text) {
        if (!textarea) return;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var before = textarea.value.slice(0, start);
        var after = textarea.value.slice(end);
        textarea.value = before + text + after;
        var pos = start + text.length;
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof global.resizeTcAiPromptInput === 'function') {
            global.resizeTcAiPromptInput(textarea);
        }
        syncTcPromptBudgetBar(textarea);
    }

    function confirmLargePaste(textarea, pastedText, done) {
        var chars = pastedText.length;
        if (chars < TC_PROMPT_PASTE_CONFIRM_CHARS) {
            done(true);
            return;
        }
        var msg = '即将粘贴约 ' + chars.toLocaleString() + ' 字（约 ' + estimateTokens(pastedText).toLocaleString() + ' tokens）。'
            + '过长内容可能影响生成质量并消耗更多资源。是否继续？';
        if (typeof global.tcAppConfirm === 'function') {
            global.tcAppConfirm(msg, {
                title: '粘贴大量文本',
                confirmText: '继续粘贴',
                cancelText: '取消'
            }).then(function(ok) {
                done(!!ok);
            }).catch(function() {
                done(false);
            });
            return;
        }
        done(global.confirm(msg));
    }

    function initTcPromptPasteGuard(textarea) {
        var el = textarea || getPromptEl();
        if (!el || el.dataset.tcPasteGuardBound === '1') return;
        el.dataset.tcPasteGuardBound = '1';
        el.addEventListener('paste', function(e) {
            var clip = e.clipboardData;
            if (!clip) return;
            var pasted = clip.getData('text/plain') || '';
            if (pasted.length < TC_PROMPT_PASTE_CONFIRM_CHARS) return;
            e.preventDefault();
            confirmLargePaste(el, pasted, function(ok) {
                if (ok) applyPasteText(el, pasted);
            });
        });
    }

    function initTcPromptBudgetUi(textarea) {
        var el = textarea || getPromptEl();
        if (!el) return;
        syncTcPromptBudgetBar(el);
        if (el.dataset.tcBudgetBound === '1') return;
        el.dataset.tcBudgetBound = '1';
        el.addEventListener('input', function() {
            syncTcPromptBudgetBar(this);
        });
    }

    function initTcPromptGuard() {
        var el = getPromptEl();
        if (!el) return;
        initTcPromptBudgetUi(el);
        initTcPromptPasteGuard(el);
    }

    global.syncTcPromptBudgetBar = syncTcPromptBudgetBar;
    global.initTcPromptGuard = initTcPromptGuard;
    global.TC_PROMPT_SOFT_HINT_CHARS = TC_PROMPT_SOFT_HINT_CHARS;
    global.TC_PROMPT_PASTE_CONFIRM_CHARS = TC_PROMPT_PASTE_CONFIRM_CHARS;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTcPromptGuard);
    } else {
        initTcPromptGuard();
    }
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_workbench_session.js ---- */
/**
 * 用例工作台 — 对话会话持久化（按规划模式隔离，每模式最多 5 条历史）
 */
(function (global) {
    'use strict';

    var MAX_HISTORY = 5;
    var PLAN_CONTEXT_LABELS = {
        edit: '智能编辑（表格）',
        edit_mindmap: '智能编辑（导图）'
    };

    var state = {
        sessionId: null,
        currentPlanContext: 'edit',
        initialized: false,
        initPromise: null,
        turnIdByUserKey: {},
        turnIdByBatchKey: {},
        currentTurnId: null,
        lastObservedContext: null,
        limitBannerTimer: null,
        awaitingFirstMessageTitle: false,
        titleAutoNaming: false,
        currentTurnCount: 0,
        currentSessionMeta: null,
        prefsSaveTimer: null,
        applyingPrefs: false,
        pendingTurnsRestore: null,
        pendingAutoNamePrompt: null,
        currentTurns: [],
        bootSyncing: false,
        planContextChangePromise: null,
        sessionIdByContext: Object.create(null)
    };

    function syncObservedPlanContext() {
        state.lastObservedContext = getPlanContext();
    }

    function rememberActiveSessionForContext(context, sessionId) {
        context = context || state.currentPlanContext;
        sessionId = String(sessionId || state.sessionId || '').trim();
        if (!context || !sessionId) return;
        state.sessionIdByContext[context] = sessionId;
    }

    function getRememberedSessionIdForContext(context) {
        context = String(context || '').trim();
        if (!context) return null;
        return state.sessionIdByContext[context] || null;
    }

    function forgetRememberedSessionId(sessionId) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return;
        Object.keys(state.sessionIdByContext).forEach(function (ctx) {
            if (state.sessionIdByContext[ctx] === sessionId) {
                delete state.sessionIdByContext[ctx];
            }
        });
    }

    function restoreSessionForContextSwitch(sessionId, planContext) {
        sessionId = String(sessionId || '').trim();
        planContext = planContext || getPlanContext();
        if (!sessionId) return Promise.resolve(null);
        return sessionAppearsInHistory(sessionId, planContext).then(function (exists) {
            if (!exists) {
                forgetRememberedSessionId(sessionId);
                return null;
            }
            return loadSessionDetail(sessionId).then(function (detail) {
                var sess = detail && detail.session;
                if (!sess || !sess.id) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                var sessCtx = sess.plan_context || planContext;
                if (sessCtx !== planContext) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                var payload = applySessionDetail(detail);
                restoreChatFromTurns(payload.turns || [], { force: true });
                return payload;
            }).catch(function (err) {
                if (err && err.status === 404) {
                    forgetRememberedSessionId(sessionId);
                    return null;
                }
                forgetRememberedSessionId(sessionId);
                return null;
            });
        });
    }

    function sessionAppearsInHistory(sessionId, planContext) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.resolve(false);
        return listSessions(MAX_HISTORY, planContext).then(function (items) {
            for (var i = 0; i < items.length; i++) {
                if (items[i] && items[i].id === sessionId) return true;
            }
            return false;
        }).catch(function () {
            return false;
        });
    }

    function fetchJson(url, opts) {
        opts = opts || {};
        var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        return fetch(url, Object.assign({}, opts, { headers: headers, credentials: 'same-origin' }))
            .then(function (res) {
                return res.json().then(function (body) {
                    if (!res.ok) {
                        var err = new Error((body && body.error) || res.statusText || '请求失败');
                        err.status = res.status;
                        throw err;
                    }
                    return body;
                });
            });
    }

    function dispatch(name, detail) {
        try {
            global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
        } catch (e) { /* ignore */ }
        if (global.TcWorkbenchBus && typeof global.TcWorkbenchBus.emit === 'function') {
            global.TcWorkbenchBus.emit(name, detail || {});
        }
    }

    function isMindmapViewActiveForPlanContext() {
        return document.body.classList.contains('tc-left-gen-compact--mindmap') ||
            (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap');
    }

    function isEditPlanContext(ctx) {
        ctx = String(ctx || '').trim();
        return ctx === 'edit' || ctx === 'edit_mindmap';
    }

    /** 智能编辑会话：不绑定蓝湖 prefs/turn lanhu_url，避免切历史污染当前需求页。其它 plan 走原逻辑。 */
    function shouldSkipLanhuSessionPrefsBinding(planContext) {
        return isEditPlanContext(planContext || getPlanContext());
    }

    function emptyLanhuPrefsForSessionPersist() {
        return { cookie: '', url: '', requirements_summary: '' };
    }

    function collectSessionPrefsForPersist(planContext) {
        var prefs = collectSessionPrefs();
        if (!shouldSkipLanhuSessionPrefsBinding(planContext)) {
            return prefs;
        }
        prefs.lanhu = emptyLanhuPrefsForSessionPersist();
        return prefs;
    }

    function getPlanContext() {
        if (typeof global.isTcWorkbenchEditMode === 'function' && global.isTcWorkbenchEditMode()) {
            return isMindmapViewActiveForPlanContext() ? 'edit_mindmap' : 'edit';
        }
        return isMindmapViewActiveForPlanContext() ? 'edit_mindmap' : 'edit';
    }

    function getPlanContextLabel(ctx) {
        return PLAN_CONTEXT_LABELS[ctx] || PLAN_CONTEXT_LABELS.edit;
    }

    function collectSessionPrefs() {
        var prefs = {
            lanhu: {
                cookie: (document.getElementById('lanhu-cookie') || {}).value || '',
                url: (document.getElementById('lanhu-url') || {}).value || '',
                requirements_summary: ''
            },
            quality: {
                auto_validate: false
            }
        };
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.getLastRequirementsSummary === 'function') {
            prefs.lanhu.requirements_summary =
                global.TcWorkbenchEnhancements.getLastRequirementsSummary();
        }
        if (typeof global.tcCaptureGenAutoValidateForTask === 'function') {
            prefs.quality.auto_validate = !!global.tcCaptureGenAutoValidateForTask();
        } else {
            var validateEl = document.getElementById('tc-gen-auto-validate');
            prefs.quality.auto_validate = !!(validateEl && validateEl.checked);
        }
        return prefs;
    }

    function paintValidateToggleFromPrefs(enabled) {
        var autoVal = document.getElementById('tc-gen-auto-validate');
        var autoBtn = document.getElementById('tc-gen-auto-validate-btn');
        var panel = document.getElementById('tc-auto-validate-enabled');
        if (autoVal) autoVal.checked = !!enabled;
        if (panel) panel.checked = !!enabled;
        if (!autoBtn || !autoVal) return;
        var on = !!autoVal.checked;
        autoBtn.classList.remove('tc-gen-toggle-btn--locked');
        autoBtn.classList.toggle('tc-gen-toggle-btn--on', on);
        autoBtn.classList.toggle('tc-gen-toggle-btn--off', !on);
        autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function setLanhuInputValue(el, value) {
        if (!el) return;
        value = value != null ? String(value) : '';
        el.value = value;
        if ('defaultValue' in el) el.defaultValue = value;
    }

    function resetGenOptionTogglesForNewSession() {
        paintValidateToggleFromPrefs(false);
        if (typeof global.setTcRagToggleEnabled === 'function') {
            global.setTcRagToggleEnabled(false);
        } else {
            var ragEl = document.getElementById('tc-rag-enabled');
            if (ragEl) ragEl.checked = false;
            if (typeof global.paintTcRagToggleUi === 'function') global.paintTcRagToggleUi();
            if (typeof global.syncTcRagLockChrome === 'function') global.syncTcRagLockChrome();
        }
        if (typeof global.updateTcRagToggleHint === 'function') global.updateTcRagToggleHint('');
    }

    function applySessionPrefs(prefs, applyOpts) {
        applyOpts = applyOpts || {};
        if (!prefs || typeof prefs !== 'object') return;
        var skipLanhuPrefs = shouldSkipLanhuSessionPrefsBinding(applyOpts.planContext);
        state.applyingPrefs = true;
        try {
            if (!applyOpts.skipGenAreaPrefs && !skipLanhuPrefs) {
                var lanhu = prefs.lanhu || {};
                var cookieEl = document.getElementById('lanhu-cookie');
                var urlEl = document.getElementById('lanhu-url');
                if (cookieEl && lanhu.cookie != null) setLanhuInputValue(cookieEl, lanhu.cookie);
                if (urlEl && lanhu.url != null) setLanhuInputValue(urlEl, lanhu.url);
                if (urlEl && lanhu.url != null && typeof global.retryTcLanhuTreeHydrateIfNeeded === 'function') {
                    global.retryTcLanhuTreeHydrateIfNeeded();
                }
                if (typeof global.autoGrowTcPresetLanhuField === 'function') {
                    global.autoGrowTcPresetLanhuField(cookieEl);
                    global.autoGrowTcPresetLanhuField(urlEl);
                }
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.setLastRequirements === 'function') {
                    global.TcWorkbenchEnhancements.setLastRequirements(lanhu.requirements_summary || '');
                }
            }
            if (!applyOpts.skipGenAreaPrefs) {
                paintValidateToggleFromPrefs(!!(prefs.quality && prefs.quality.auto_validate));
            }
        } finally {
            state.applyingPrefs = false;
        }
    }

    function buildSessionPrefsForNewSession() {
        return {
            lanhu: {
                cookie: '',
                url: '',
                requirements_summary: ''
            },
            quality: {
                auto_validate: false
            }
        };
    }

    /** 新会话时清空蓝湖需求区全部配置（Cookie/URL/摘要/拉取状态/RAG/质量检查等）。 */
    function clearLanhuRequirementConfig() {
        state.applyingPrefs = true;
        try {
            ['lanhu-cookie', 'lanhu-url'].forEach(function (id) {
                setLanhuInputValue(document.getElementById(id), '');
            });
            var modalInput = document.getElementById('lanhu-cookie-modal-input');
            if (modalInput) modalInput.value = '';
            var statusEl = document.getElementById('lanhu-fetch-status');
            if (statusEl) statusEl.textContent = '';
            var cookieEl = document.getElementById('lanhu-cookie');
            var urlEl = document.getElementById('lanhu-url');
            if (typeof global.autoGrowTcPresetLanhuField === 'function') {
                global.autoGrowTcPresetLanhuField(cookieEl);
                global.autoGrowTcPresetLanhuField(urlEl);
            }
            if (typeof global.setTcLanhuFieldRevealed === 'function') {
                global.setTcLanhuFieldRevealed(cookieEl, false);
                global.setTcLanhuFieldRevealed(urlEl, false);
            }
            if (global.TcWorkbenchEnhancements &&
                typeof global.TcWorkbenchEnhancements.setLastRequirements === 'function') {
                global.TcWorkbenchEnhancements.setLastRequirements('');
            }
            resetGenOptionTogglesForNewSession();
            dispatch('tc-wb-requirements-updated', { cleared: true });
        } finally {
            state.applyingPrefs = false;
        }
    }

    function isSessionPrefsTargetActive(sessionId) {
        sessionId = String(sessionId || '').trim();
        return !!(sessionId && state.sessionId === sessionId);
    }

    function persistClearedLanhuSessionPrefs() {
        if (!state.sessionId) return Promise.resolve(null);
        var sid = state.sessionId;
        return fetchJson(
            '/api/test-cases/workbench-sessions/' + encodeURIComponent(sid) + '/prefs',
            {
                method: 'PUT',
                body: JSON.stringify({ session_prefs: buildSessionPrefsForNewSession() })
            }
        ).then(function (data) {
            if (!isSessionPrefsTargetActive(sid)) return null;
            return (data && data.session) || null;
        }).catch(function (err) {
            if (err && err.status === 404 && !isSessionPrefsTargetActive(sid)) return null;
            return null;
        });
    }

    function saveSessionPrefsNow() {
        if (!state.sessionId || state.applyingPrefs) return Promise.resolve(null);
        var sid = state.sessionId;
        return fetchJson(
            '/api/test-cases/workbench-sessions/' + encodeURIComponent(sid) + '/prefs',
            {
                method: 'PUT',
                body: JSON.stringify({ session_prefs: collectSessionPrefsForPersist(state.currentPlanContext || getPlanContext()) })
            }
        ).then(function (data) {
            if (!isSessionPrefsTargetActive(sid)) return null;
            return (data && data.session) || null;
        }).catch(function (err) {
            if (err && err.status === 404 && !isSessionPrefsTargetActive(sid)) return null;
            return null;
        });
    }

    function saveSessionPrefsDebounced() {
        if (!state.sessionId || state.applyingPrefs) return;
        if (state.prefsSaveTimer) global.clearTimeout(state.prefsSaveTimer);
        state.prefsSaveTimer = global.setTimeout(function () {
            state.prefsSaveTimer = null;
            saveSessionPrefsNow();
        }, 400);
    }

    function bindSessionPrefsHooks() {
        if (bindSessionPrefsHooks._bound) return;
        bindSessionPrefsHooks._bound = true;
        ['lanhu-cookie', 'lanhu-url'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el._tcWbPrefsBound) return;
            el._tcWbPrefsBound = true;
            el.addEventListener('input', saveSessionPrefsDebounced);
            el.addEventListener('change', saveSessionPrefsDebounced);
        });
        var validateEl = document.getElementById('tc-gen-auto-validate');
        if (validateEl && !validateEl._tcWbPrefsBound) {
            validateEl._tcWbPrefsBound = true;
            validateEl.addEventListener('change', saveSessionPrefsDebounced);
        }
        document.addEventListener('tc-wb-requirements-updated', saveSessionPrefsDebounced);
    }

    function resetTurnMappings() {
        state.turnIdByUserKey = {};
        state.turnIdByBatchKey = {};
        state.currentTurnId = null;
        state.currentTurns = [];
    }

    function normalizeLanhuUrl(url) {
        return String(url != null ? url : '').trim();
    }

    function getLanhuUrlFromSessionPrefs() {
        var meta = state.currentSessionMeta;
        var prefs = meta && meta.session_prefs;
        var lanhu = prefs && prefs.lanhu;
        if (!lanhu || lanhu.url == null) return '';
        return normalizeLanhuUrl(lanhu.url);
    }

    function getActiveGenerationLanhuUrl() {
        var url = global.tcActiveGenerationLanhuUrl;
        return normalizeLanhuUrl(url != null ? url : '');
    }

    /** 读取当前用于生成/过滤历史的蓝湖 URL（输入框 → 本轮生成快照 → 会话 prefs）。 */
    function getCurrentLanhuUrlForGen() {
        var url = '';
        if (typeof global.getTcLanhuCredentialsForMode === 'function') {
            url = normalizeLanhuUrl(global.getTcLanhuCredentialsForMode('preset').url);
        } else {
            var urlEl = document.getElementById('lanhu-url');
            url = normalizeLanhuUrl(urlEl ? urlEl.value : '');
        }
        if (url) return url;
        url = getActiveGenerationLanhuUrl();
        if (url) return url;
        return getLanhuUrlFromSessionPrefs();
    }

    /** 归档 turn 时写入的 URL：优先本轮生成开始时捕获的快照，避免表单已清空导致漏记。 */
    function resolveLanhuUrlForTurnArchive(opts) {
        opts = opts || {};
        if (opts.userMode === 'edit' || shouldSkipLanhuSessionPrefsBinding()) {
            return '';
        }
        if (opts.lanhuUrl != null) {
            var explicit = normalizeLanhuUrl(opts.lanhuUrl);
            if (explicit) return explicit;
        }
        var active = getActiveGenerationLanhuUrl();
        if (active) return active;
        return getCurrentLanhuUrlForGen();
    }

    function setCurrentTurns(turns) {
        state.currentTurns = Array.isArray(turns) ? turns.slice() : [];
    }

    function upsertTurnInState(turn) {
        if (!turn || !turn.id) return;
        var idx = -1;
        for (var i = 0; i < state.currentTurns.length; i++) {
            var row = state.currentTurns[i];
            if (!row) continue;
            if (row.id === turn.id || row.turn_index === turn.turn_index) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) {
            state.currentTurns[idx] = turn;
        } else {
            state.currentTurns.push(turn);
        }
        state.currentTurns.sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
    }

    function getPreviousUserPromptsForCurrentLanhu(opts) {
        opts = opts || {};
        var currentUrl = normalizeLanhuUrl(
            opts.lanhuUrl != null ? opts.lanhuUrl : getCurrentLanhuUrlForGen()
        );
        var items = [];
        (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        }).forEach(function (turn) {
            if (!turn) return;
            if (normalizeLanhuUrl(turn.lanhu_url) !== currentUrl) return;
            var text = String(turn.user_prompt || '').trim();
            if (!text) return;
            items.push(text);
        });
        return items;
    }

    function applyActiveSession(session, planContext, activeOpts) {
        activeOpts = activeOpts || {};
        planContext = planContext || getPlanContext();
        state.sessionId = session && session.id ? session.id : null;
        state.currentPlanContext = planContext;
        state.currentSessionMeta = session || null;
        state.currentTurnCount = session && session.turn_count != null
            ? (parseInt(session.turn_count, 10) || 0)
            : 0;
        resetTurnMappings();
        applySessionPrefs(session && session.session_prefs, {
            skipGenAreaPrefs: !!activeOpts.skipGenAreaPrefs,
            planContext: planContext
        });
        dispatch('tc-wb-session-ready', {
            sessionId: state.sessionId,
            planContext: planContext
        });
        if (state.sessionId) rememberActiveSessionForContext(planContext, state.sessionId);
        return state.sessionId;
    }

    function applySessionTurnMappings(turns) {
        (turns || []).forEach(function (turn) {
            if (turn && turn.id) {
                registerTurnMapping(
                    turn.id,
                    'restored-' + turn.id,
                    turn.chain && turn.chain.batchValidationKey
                );
            }
        });
    }

    function hideSessionLimitBanner() {
        var banner = document.getElementById('tc-wb-session-limit-banner');
        if (!banner) return;
        banner.classList.add('hidden');
        banner.setAttribute('aria-hidden', 'true');
        if (state.limitBannerTimer) {
            global.clearTimeout(state.limitBannerTimer);
            state.limitBannerTimer = null;
        }
    }

    function showSessionLimitBanner(planContext) {
        var banner = document.getElementById('tc-wb-session-limit-banner');
        if (!banner) return;
        if (typeof ensureTcWorkbenchOverlaysMounted === 'function') {
            ensureTcWorkbenchOverlaysMounted();
        } else if (banner.parentElement !== document.body) {
            document.body.appendChild(banner);
        }
        var label = getPlanContextLabel(planContext || getPlanContext());
        var textEl = banner.querySelector('.tc-wb-session-limit-banner__text');
        if (textEl) {
            textEl.textContent =
                '「' + label + '」历史会话已达 ' + MAX_HISTORY +
                ' 条上限，已恢复最新会话。请打开「历史记录」删除不需要的会话后再新建。';
        }
        banner.classList.remove('hidden');
        banner.setAttribute('aria-hidden', 'false');
        if (state.limitBannerTimer) global.clearTimeout(state.limitBannerTimer);
        state.limitBannerTimer = global.setTimeout(hideSessionLimitBanner, 12000);
    }

    function isDefaultSessionTitle(title) {
        title = String(title || '').trim();
        if (title === '新会话') return true;
        return /^(快速规划|导图规划|智能编辑(?:（表格）|（导图）)?) \d{2}-\d{2} \d{2}:\d{2}$/.test(title);
    }

    function fallbackTitleFromPrompt(text) {
        var raw = String(text || '').replace(/\s+/g, ' ').trim();
        if (!raw) return '新会话';
        if (raw.length > 24) {
            var cut = raw.slice(0, 24).replace(/\s+\S*$/, '').trim();
            if (!cut) cut = raw.slice(0, 24);
            return (cut + '…').slice(0, 200);
        }
        return raw.slice(0, 200);
    }

    function shouldAutoNameFromFirstMessage() {
        if (state.titleAutoNaming || !state.sessionId) return false;
        if (!isDefaultSessionTitle(state.currentSessionMeta && state.currentSessionMeta.title)) {
            return false;
        }
        return (parseInt(state.currentTurnCount, 10) || 0) <= 1;
    }

    function syncAwaitingFirstMessageTitle(session, opts) {
        opts = opts || {};
        if (opts.limitReached) {
            state.awaitingFirstMessageTitle = false;
            return;
        }
        var turnCount = session && session.turn_count != null
            ? (parseInt(session.turn_count, 10) || 0)
            : (state.currentTurnCount || 0);
        state.awaitingFirstMessageTitle =
            turnCount <= 1 && isDefaultSessionTitle(session && session.title);
    }

    function patchHistoryListTitle(sessionId, title) {
        sessionId = String(sessionId || '').trim();
        title = String(title || '').trim();
        if (!sessionId || !title) return;
        var list = document.getElementById('tc-wb-history-list');
        if (!list) return;
        var li = list.querySelector('.tc-wb-history-list__item[data-session-id="' + sessionId + '"]');
        if (!li) return;
        var titleEl = li.querySelector('.tc-wb-history-list__title');
        if (titleEl) titleEl.textContent = title;
    }

    function applySessionTitleUpdate(session) {
        session = session || {};
        var sessionId = String(session.id || '').trim();
        var title = String(session.title || '').trim();
        if (!sessionId || !title) return;
        if (sessionId === state.sessionId) {
            state.currentSessionMeta = Object.assign({}, state.currentSessionMeta || {}, session, { title: title });
        }
        patchHistoryListTitle(sessionId, title);
        updateHistoryPanelHead();
    }

    function syncSessionValidationFromTurns(turns, planContext) {
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.hydrateSessionValidationFromTurns !== 'function') return;
        enh.hydrateSessionValidationFromTurns(turns || [], {
            planContext: planContext || getPlanContext()
        });
    }

    function flushSessionStateBeforeLeave(opts) {
        opts = opts || {};
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.persistSessionValidationBeforeLeave === 'function') {
            enh.persistSessionValidationBeforeLeave();
        }
        var persistChat = Promise.resolve(null);
        if (global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.persistLiveStateBeforeLeave === 'function') {
            persistChat = global.TcGenChatXUi.persistLiveStateBeforeLeave(opts).catch(function () {
                return null;
            });
        }
        if (isCurrentSessionNew()) {
            return persistChat;
        }
        return persistChat.then(function () {
            return saveSessionPrefsNow().catch(function () {
                return null;
            });
        });
    }

    function isGenerationBusyForPageLeave() {
        if (typeof global.isTcPromptSendLocked === 'function' && global.isTcPromptSendLocked()) {
            return true;
        }
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return true;
        }
        return false;
    }

    function abortActiveGenerationForPageLeave() {
        try {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.abortForPageLeave === 'function') {
                global.TcGenerationStreamClient.abortForPageLeave();
            }
        } catch (e1) { /* ignore */ }
        try {
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.abortForPageLeave === 'function') {
                global.TcAgentOrchestrator.abortForPageLeave();
            }
        } catch (e2) { /* ignore */ }
    }

    function flushGenerationStateBeforePageLeave() {
        if (!isWorkbenchPage()) return;
        if (!isGenerationBusyForPageLeave()) return;
        abortActiveGenerationForPageLeave();
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.abortAndRollbackWorkbenchGeneration === 'function') {
            try {
                global.TcRequirementCaseStore.abortAndRollbackWorkbenchGeneration({ reason: 'page_leave' });
            } catch (eRollback) { /* ignore */ }
        }
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.persistSessionValidationBeforeLeave === 'function') {
            try {
                enh.persistSessionValidationBeforeLeave();
            } catch (e3) { /* ignore */ }
        }
        if (global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.persistLiveStateBeforeLeave === 'function') {
            try {
                global.TcGenChatXUi.persistLiveStateBeforeLeave({ keepalive: true });
            } catch (e4) { /* ignore */ }
        }
        saveSessionPrefsKeepalive();
    }

    function saveSessionPrefsKeepalive() {
        if (!state.sessionId) return;
        var prefs = collectSessionPrefsForPersist(state.currentPlanContext || getPlanContext());
        try {
            fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify({ session_prefs: prefs })
            });
        } catch (e) { /* ignore */ }
    }

    function initGenerationLeaveHandler() {
        if (global._tcGenLeaveHandlerBound) return;
        global._tcGenLeaveHandlerBound = true;
        global.addEventListener('pagehide', flushGenerationStateBeforePageLeave);
        global.addEventListener('beforeunload', flushGenerationStateBeforePageLeave);
    }

    function shouldResetGenAreaForSessionStart(data) {
        if (!data || data.limit_reached) return false;
        return !!(data.created || data.reused_draft);
    }

    function resetLiveGenerationUiForContextSwitch() {
        if (global.TcGenChatPipeline) {
            if (typeof global.TcGenChatPipeline.cancelScheduledArchive === 'function') {
                global.TcGenChatPipeline.cancelScheduledArchive();
            }
            if (typeof global.TcGenChatPipeline.reset === 'function') {
                global.TcGenChatPipeline.reset();
            }
        }
        if (global.TcGenChatXUi) {
            if (typeof global.TcGenChatXUi.clearLivePipeline === 'function') {
                global.TcGenChatXUi.clearLivePipeline();
            }
            if (typeof global.TcGenChatXUi.resetAgentPipeline === 'function') {
                global.TcGenChatXUi.resetAgentPipeline();
            }
        }
        if (global.TcEditChat && typeof global.TcEditChat.clearThread === 'function') {
            global.TcEditChat.clearThread();
        }
    }

    function buildChatRestoreOpts(sessionOpts) {
        sessionOpts = sessionOpts || {};
        if (sessionOpts.forceRestore === true) {
            return { force: true };
        }
        if (sessionOpts.forceRestore === false) {
            return { force: false };
        }
        return { force: sessionOpts.clearChat !== false };
    }

    function handleSessionStartResponse(data, opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        var session = data.session || null;
        var limitReached = !!data.limit_reached;
        var turns = data.turns || [];
        var restoreOpts = buildChatRestoreOpts(opts);
        var shouldResetLanhu = opts.resetLanhuConfig != null
            ? !!opts.resetLanhuConfig
            : shouldResetGenAreaForSessionStart(data);
        if (isEditPlanContext(planContext)) {
            shouldResetLanhu = false;
        }
        applyActiveSession(session, planContext, { skipGenAreaPrefs: shouldResetLanhu });
        setCurrentTurns(turns);
        if (shouldResetLanhu) {
            clearLanhuRequirementConfig();
            persistClearedLanhuSessionPrefs();
        }
        if (limitReached) {
            applySessionTurnMappings(turns);
            restoreChatFromTurns(turns, restoreOpts);
            syncSessionValidationFromTurns(turns, planContext);
            showSessionLimitBanner(planContext);
            state.awaitingFirstMessageTitle = false;
        } else if (opts.clearChat !== false || turns.length > 0) {
            applySessionTurnMappings(turns);
            restoreChatFromTurns(turns, restoreOpts);
            syncSessionValidationFromTurns(turns, planContext);
            syncAwaitingFirstMessageTitle(session, { limitReached: false });
        } else {
            syncAwaitingFirstMessageTitle(session, { limitReached: false });
        }
        dispatch('tc-wb-session-created', {
            session: session,
            planContext: planContext,
            limitReached: limitReached,
            created: !!data.created && !limitReached,
            reusedDraft: !!data.reused_draft
        });
        return session;
    }

    function chatHasConversationContent() {
        if (isEditPlanContext(getPlanContext())) {
            var editThread = document.getElementById('tc-edit-chat-thread');
            return !!(editThread && editThread.children.length > 0);
        }
        var thread = document.getElementById('tc-gen-chat-thread');
        if (!thread) return false;
        return !!thread.querySelector(
            '.tc-gen-chat-x-mount .ant-bubble, .tc-gen-chat-x-scroll .ant-thought-chain, ' +
            '.tc-gen-chat-x-scroll .tc-gen-chat-x-stream, .tc-gen-chat-x-scroll .tc-gen-chat-x-thinking, ' +
            '.tc-gen-chat-x-scroll .tc-gen-chat-x-thinking-block, .tc-gen-chat-msg, .tc-gen-chat-msg--pipeline'
        );
    }

    /** 当前会话是否为空草稿（规划模式切换时勿用 getPlanContext 比对，避免误记已删会话） */
    function isSessionEmptyDraft() {
        if (!state.sessionId) return false;
        if ((state.currentTurnCount || 0) > 0) return false;
        if (state.currentTurnId || Object.keys(state.turnIdByUserKey).length > 0) return false;
        if (state.currentPlanContext === getPlanContext() && chatHasConversationContent()) return false;
        return true;
    }

    function isCurrentSessionNew() {
        if (!state.sessionId || state.currentPlanContext !== getPlanContext()) return false;
        return isSessionEmptyDraft();
    }

    function getCurrentSessionSnapshot() {
        return {
            id: state.sessionId,
            plan_context: state.currentPlanContext,
            turn_count: state.currentTurnCount || 0
        };
    }

    function noopCurrentNewSession() {
        setHistoryPanelOpen(false);
        if (isEditPlanContext(getPlanContext())) {
            if (global.TcEditChat && typeof global.TcEditChat.clearThread === 'function') {
                global.TcEditChat.clearThread();
            }
            return Promise.resolve(getCurrentSessionSnapshot());
        }
        clearLanhuRequirementConfig();
        return persistClearedLanhuSessionPrefs().then(function () {
            return getCurrentSessionSnapshot();
        });
    }

    function createNewSession(opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        if (state.sessionId && state.currentPlanContext === planContext && isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        if (!isEditPlanContext(planContext)) {
            clearLanhuRequirementConfig();
        }
        var body = {
            title: opts.title || '',
            plan_context: planContext,
            session_prefs: buildSessionPrefsForNewSession()
        };
        if (state.sessionId && state.currentPlanContext === planContext) {
            body.current_session_id = state.sessionId;
        }
        return fetchJson('/api/test-cases/workbench-sessions', {
            method: 'POST',
            body: JSON.stringify(body)
        }).then(function (data) {
            return handleSessionStartResponse(data, {
                planContext: planContext,
                clearChat: opts.clearChat,
                resetLanhuConfig: !data.limit_reached
            });
        });
    }

    function updateSessionTitle(sessionId, title) {
        sessionId = String(sessionId || '').trim();
        title = String(title || '').trim();
        if (!sessionId || !title) return Promise.reject(new Error('缺少参数'));
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId), {
            method: 'PATCH',
            body: JSON.stringify({ title: title })
        }).then(function (data) {
            if (data.session && data.session.id === state.sessionId) {
                applySessionTitleUpdate(data.session);
                dispatch('tc-wb-session-title-updated', { session: data.session });
            }
            return data.session || null;
        });
    }

    function tryAutoNameFromFirstMessage(text) {
        text = String(text || '').trim();
        if (!text) return Promise.resolve(null);
        state.pendingAutoNamePrompt = text;
        return flushPendingAutoNameFromFirstMessage();
    }

    function flushPendingAutoNameFromFirstMessage() {
        var prompt = String(state.pendingAutoNamePrompt || '').trim();
        if (!prompt || state.titleAutoNaming) {
            return Promise.resolve(null);
        }
        return ensureSession().then(function (sessionId) {
            if (!sessionId || !shouldAutoNameFromFirstMessage()) {
                return null;
            }
            state.pendingAutoNamePrompt = null;
            var previewTitle = fallbackTitleFromPrompt(prompt);
            if (!isDefaultSessionTitle(previewTitle)) {
                applySessionTitleUpdate({ id: state.sessionId, title: previewTitle });
            }
            state.titleAutoNaming = true;
            return fetchJson(
                '/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/generate-title',
                {
                    method: 'POST',
                    body: JSON.stringify({ user_prompt: prompt })
                }
            ).then(function (data) {
                if (data.error) return null;
                if (data.skipped) {
                    if (data.session && data.session.title && !isDefaultSessionTitle(data.session.title)) {
                        state.awaitingFirstMessageTitle = false;
                        applySessionTitleUpdate(data.session);
                    }
                    return null;
                }
                if (data.session && data.session.title && !isDefaultSessionTitle(data.session.title)) {
                    state.awaitingFirstMessageTitle = false;
                    applySessionTitleUpdate(data.session);
                    dispatch('tc-wb-session-title-updated', {
                        session: data.session,
                        generated: !!data.generated
                    });
                    refreshHistoryList();
                }
                return data;
            }).catch(function () {
                if (shouldAutoNameFromFirstMessage() && !isDefaultSessionTitle(previewTitle)) {
                    updateSessionTitle(state.sessionId, previewTitle).then(function (session) {
                        if (session) {
                            state.awaitingFirstMessageTitle = false;
                            applySessionTitleUpdate(session);
                            refreshHistoryList();
                        }
                    }).catch(function () { /* ignore */ });
                }
                return null;
            }).finally(function () {
                state.titleAutoNaming = false;
            });
        });
    }

    function beginEditHistoryTitle(item, titleEl) {
        if (!item || !titleEl || titleEl.dataset.editing === '1') return;
        titleEl.dataset.editing = '1';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'tc-wb-history-list__title-input';
        input.value = item.title || '';
        input.maxLength = 200;
        titleEl.replaceWith(input);
        input.focus();
        input.select();
        var committed = false;
        function commit() {
            if (committed) return;
            committed = true;
            var val = String(input.value || '').trim();
            if (!val || val === (item.title || '')) {
                refreshHistoryList();
                return;
            }
            updateSessionTitle(item.id, val).then(function () {
                refreshHistoryList();
            }).catch(function () {
                refreshHistoryList();
            });
        }
        input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                refreshHistoryList();
            }
        });
        input.addEventListener('click', function (e) {
            e.stopPropagation();
        });
        input.addEventListener('blur', commit);
    }

    function deleteSession(sessionId, opts) {
        opts = opts || {};
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.reject(new Error('缺少 sessionId'));
        return fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId), {
            method: 'DELETE',
            credentials: 'same-origin'
        }).then(function (res) {
            if (res.status === 404 && opts.ignoreNotFound) {
                forgetRememberedSessionId(sessionId);
                return { ok: true, notFound: true };
            }
            return res.json().then(function (body) {
                if (!res.ok) {
                    var err = new Error((body && body.error) || res.statusText || '请求失败');
                    err.status = res.status;
                    throw err;
                }
                forgetRememberedSessionId(sessionId);
                return body;
            });
        });
    }

    function confirmDeleteHistorySession(item) {
        item = item || {};
        var title = String(item.title || '新会话').trim() || '新会话';
        var message = '将永久删除「' + title + '」，且无法恢复。';
        if (typeof global.tcAppConfirm === 'function') {
            return global.tcAppConfirm(message, {
                title: '删除会话？',
                variant: 'warning',
                confirmText: '删除',
                cancelText: '取消'
            });
        }
        return Promise.resolve(global.confirm(message));
    }

    function performHistorySessionDelete(item) {
        return deleteSession(item.id).then(function () {
            hideSessionLimitBanner();
            if (item.id === state.sessionId) {
                if (state.prefsSaveTimer) {
                    global.clearTimeout(state.prefsSaveTimer);
                    state.prefsSaveTimer = null;
                }
                state.sessionId = null;
                state.currentTurnCount = 0;
                state.currentSessionMeta = null;
                resetTurnMappings();
                return startNewSessionForCurrentContext(true);
            }
            return refreshHistoryList();
        }).catch(function () {
            refreshHistoryList();
        });
    }

    function discardEmptyDraftSessionIfNeeded() {
        if (!state.sessionId || !isCurrentSessionNew()) {
            return Promise.resolve(false);
        }
        var sid = state.sessionId;
        if (state.prefsSaveTimer) {
            global.clearTimeout(state.prefsSaveTimer);
            state.prefsSaveTimer = null;
        }
        state.sessionId = null;
        state.currentTurnCount = 0;
        state.currentSessionMeta = null;
        resetTurnMappings();
        return deleteSession(sid, { ignoreNotFound: true }).then(function () {
            forgetRememberedSessionId(sid);
            return true;
        }).catch(function () {
            forgetRememberedSessionId(sid);
            return false;
        });
    }

    function startNewSessionForCurrentContext(clearChat) {
        var planContext = getPlanContext();
        if (state.sessionId && state.currentPlanContext === planContext && isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        return discardEmptyDraftSessionIfNeeded().then(function () {
            return flushSessionStateBeforeLeave();
        }).then(function () {
            return createNewSession({ planContext: planContext, clearChat: clearChat });
        }).then(function (session) {
            refreshHistoryList();
            return session;
        });
    }

    function bootstrapEntrySession(opts) {
        opts = opts || {};
        var planContext = opts.planContext || getPlanContext();
        var url = '/api/test-cases/workbench-sessions/entry?plan_context=' +
            encodeURIComponent(planContext);
        return fetchJson(url).then(function (data) {
            handleSessionStartResponse({
                session: data.session,
                turns: data.turns || [],
                created: !!data.created,
                limit_reached: !!data.limit_reached,
                reused_draft: !!data.reused_draft
            }, {
                planContext: planContext,
                clearChat: opts.clearChat !== false,
                forceRestore: opts.forceRestore != null ? !!opts.forceRestore : (opts.clearChat !== false),
                resetLanhuConfig: shouldResetGenAreaForSessionStart(data)
            });
            updateHistoryPanelHead();
            return refreshHistoryList().then(function () {
                dispatch('tc-wb-entry-session-ready', {
                    session: data.session || null,
                    planContext: planContext,
                    created: !!data.created,
                    reusedDraft: !!data.reused_draft,
                    limitReached: !!data.limit_reached,
                    historyEmpty: !(data.history_items && data.history_items.length)
                });
                return data.session || null;
            });
        }).catch(function (err) {
            if (opts.fallbackCreate === false) throw err;
            return createNewSession({
                planContext: planContext,
                clearChat: opts.clearChat !== false
            }).then(function (session) {
                return refreshHistoryList().then(function () {
                    return session;
                });
            });
        });
    }

    function ensureSession() {
        if (state.sessionId && state.currentPlanContext === getPlanContext()) {
            return Promise.resolve(state.sessionId);
        }
        if (state.initPromise) {
            return state.initPromise.then(function () {
                return state.sessionId || null;
            });
        }
        return bootstrapEntrySession({ clearChat: false });
    }

    function isWorkbenchPage() {
        return !!(document.getElementById('tc-wb-history-list') ||
            document.querySelector('.tc-workbench-scope'));
    }

    function init() {
        if (!isWorkbenchPage()) {
            return Promise.resolve(null);
        }
        if (state.initialized && state.sessionId) return Promise.resolve(state.sessionId);
        if (state.initPromise) return state.initPromise;
        syncObservedPlanContext();
        state.initPromise = bootstrapEntrySession({ clearChat: true }).then(function (session) {
            state.initialized = true;
            return flushPendingAutoNameFromFirstMessage().then(function () {
                return session && session.id ? session.id : state.sessionId;
            });
        }).finally(function () {
            state.initPromise = null;
        });
        return state.initPromise;
    }

    function onPlanContextChange(newContext, oldContext) {
        if (!newContext || newContext === oldContext) return Promise.resolve(state.sessionId);
        if (oldContext && state.sessionId && !isSessionEmptyDraft()) {
            rememberActiveSessionForContext(oldContext, state.sessionId);
        }
        return flushSessionStateBeforeLeave().then(function () {
            return discardEmptyDraftSessionIfNeeded();
        }).then(function () {
            resetLiveGenerationUiForContextSwitch();
            var rememberedId = getRememberedSessionIdForContext(newContext);
            if (rememberedId) {
                return restoreSessionForContextSwitch(rememberedId, newContext).then(function (payload) {
                    if (payload && payload.session && payload.session.id) {
                        return refreshHistoryList().then(function () {
                            return payload.session.id;
                        });
                    }
                    return bootstrapEntrySession({
                        planContext: newContext,
                        clearChat: false,
                        forceRestore: true
                    }).then(function (session) {
                        return refreshHistoryList().then(function () {
                            return session && session.id ? session.id : state.sessionId;
                        });
                    });
                });
            }
            return bootstrapEntrySession({
                planContext: newContext,
                clearChat: false,
                forceRestore: true
            }).then(function (session) {
                return refreshHistoryList().then(function () {
                    return session && session.id ? session.id : state.sessionId;
                });
            });
        });
    }

    function enqueuePlanContextChange(newContext, oldContext) {
        state.planContextChangePromise = (state.planContextChangePromise || Promise.resolve())
            .then(function () {
                return onPlanContextChange(newContext, oldContext);
            })
            .catch(function () {
                return null;
            });
        return state.planContextChangePromise;
    }

    function observePlanContext() {
        if (state.bootSyncing) return;
        var ctx = getPlanContext();
        if (state.lastObservedContext === null) {
            state.lastObservedContext = ctx;
            return;
        }
        if (ctx !== state.lastObservedContext) {
            var prev = state.lastObservedContext;
            state.lastObservedContext = ctx;
            enqueuePlanContextChange(ctx, prev);
        }
    }

    function hookPlanContextChanges() {
        if (typeof global.switchTcGenPlanMode === 'function' &&
            !global.switchTcGenPlanMode._tcWbSessionHooked) {
            var origMode = global.switchTcGenPlanMode;
            global.switchTcGenPlanMode = function (mode) {
                var ret = origMode.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcGenPlanMode._tcWbSessionHooked = true;
        }
        if (typeof global.switchTcRightView === 'function' &&
            !global.switchTcRightView._tcWbSessionHooked) {
            var origView = global.switchTcRightView;
            global.switchTcRightView = function (mode) {
                var ret = origView.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcRightView._tcWbSessionHooked = true;
        }
        if (typeof global.syncTcLeftGenPanelLayout === 'function' &&
            !global.syncTcLeftGenPanelLayout._tcWbSessionHooked) {
            var origLayout = global.syncTcLeftGenPanelLayout;
            global.syncTcLeftGenPanelLayout = function () {
                var ret = origLayout.apply(this, arguments);
                observePlanContext();
                return ret;
            };
            global.syncTcLeftGenPanelLayout._tcWbSessionHooked = true;
        }
        function hookWorkbenchModeSwitch() {
            if (typeof global.switchTcWorkbenchMode !== 'function' ||
                global.switchTcWorkbenchMode._tcWbSessionHooked) {
                return;
            }
            var origWb = global.switchTcWorkbenchMode;
            global.switchTcWorkbenchMode = function (mode) {
                var ret = origWb.apply(this, arguments);
                global.setTimeout(observePlanContext, 0);
                return ret;
            };
            global.switchTcWorkbenchMode._tcWbSessionHooked = true;
        }
        hookWorkbenchModeSwitch();
        global.setTimeout(hookWorkbenchModeSwitch, 0);
        global.setTimeout(hookWorkbenchModeSwitch, 800);
    }

    function getCurrentSessionId() {
        return state.sessionId;
    }

    function getCurrentPlanContext() {
        return state.currentPlanContext || getPlanContext();
    }

    function getCurrentTurnId() {
        return state.currentTurnId;
    }

    function getTurnIdForUserKey(userKey) {
        return state.turnIdByUserKey[userKey] || null;
    }

    function getTurnFromState(turnId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return null;
        var i;
        for (i = 0; i < (state.currentTurns || []).length; i++) {
            var row = state.currentTurns[i];
            if (row && String(row.id || '') === turnId) return row;
        }
        return null;
    }

    function getTurnIdForBatchKey(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return null;
        return state.turnIdByBatchKey[batchKey] || null;
    }

    function getLatestValidatedTurnId(scope) {
        var turns = (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
        var i;
        for (i = turns.length - 1; i >= 0; i--) {
            var row = turns[i];
            if (!row || !row.id) continue;
            if (row.validation && typeof row.validation === 'object') return row.id;
        }
        return turns.length ? (turns[turns.length - 1].id || null) : null;
    }

    /** 当前会话中 turn_index 最大的轮次（最新一轮）。 */
    function getLatestSessionTurnId() {
        var turns = (state.currentTurns || []).slice().sort(function (a, b) {
            return (a.turn_index || 0) - (b.turn_index || 0);
        });
        if (turns.length) {
            var last = turns[turns.length - 1];
            if (last && last.id) return last.id;
        }
        return state.currentTurnId || null;
    }

    function mergeTurnValidationInState(turnId, payload) {
        turnId = String(turnId || '').trim();
        if (!turnId || !payload) return;
        var idx;
        for (idx = 0; idx < state.currentTurns.length; idx++) {
            var row = state.currentTurns[idx];
            if (!row || row.id !== turnId) continue;
            state.currentTurns[idx] = Object.assign({}, row, {
                validation: payload.validation || null,
                validate_reasoning: payload.validate_reasoning || '',
                batch_meta: payload.batch_meta != null ? payload.batch_meta : row.batch_meta
            });
            break;
        }
    }

    function registerTurnMapping(turnId, userKey, batchValidationKey) {
        turnId = String(turnId || '').trim();
        if (!turnId) return;
        if (userKey) state.turnIdByUserKey[userKey] = turnId;
        state.currentTurnId = turnId;
        var batchKey = String(batchValidationKey || '').trim();
        if (batchKey) state.turnIdByBatchKey[batchKey] = turnId;
    }


    function stripEphemeralChainFields(chain) {
        if (!chain || typeof chain !== 'object') return chain;
        var out = Object.assign({}, chain);
        out.thinkingText = '';
        out.validateThinkingText = '';
        var mod = out.moduleStepThinking;
        if (mod && typeof mod === 'object') {
            out.moduleStepThinking = {
                split_modules: '',
                generate_modules: '',
                module_count: 0,
                generate_module_slots: []
            };
        }
        var stream = out.stream;
        if (stream && typeof stream === 'object') {
            out.stream = Object.assign({}, stream);
            if (!String(out.stream.buffer || '').trim()) {
                out.stream.visible = false;
            }
        }
        var steps = out.steps;
        if (steps && typeof steps === 'object') {
            out.steps = Object.assign({}, steps);
            Object.keys(out.steps).forEach(function (k) {
                var row = out.steps[k];
                if (!row || typeof row !== 'object' || !row.output) return;
                if (k !== 'split_modules') return;
                var output = Object.assign({}, row.output);
                delete output.reasoning_text;
                delete output.module_thinking_slots;
                out.steps[k] = Object.assign({}, row, { output: output });
            });
        }
        return out;
    }

    function saveTurn(opts) {
        opts = opts || {};
        if (opts.keepalive && state.sessionId) {
            saveTurnKeepalive(opts);
            return Promise.resolve(null);
        }
        return ensureSession().then(function (sessionId) {
            if (!sessionId) return null;
            return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns', {
                method: 'POST',
                body: JSON.stringify({
                    turn_index: opts.turnIndex != null ? opts.turnIndex : 0,
                    user_prompt: String(opts.userPrompt || ''),
                    user_mode: String(opts.userMode || ''),
                    lanhu_url: String(
                        opts.lanhuUrl != null ? opts.lanhuUrl : resolveLanhuUrlForTurnArchive(opts)
                    ),
                    chain: opts.chain ? stripEphemeralChainFields(opts.chain) : null,
                    agent_chain: opts.agentChain || null,
                    batch_meta: opts.batchMeta || null,
                    turn_id: opts.turnId || null
                })
            }).then(function (data) {
                var turn = data.turn || null;
                if (turn && turn.id) {
                    upsertTurnInState(turn);
                    registerTurnMapping(turn.id, opts.userKey, opts.batchValidationKey);
                    saveSessionPrefsDebounced();
                    dispatch('tc-wb-turn-saved', {
                        turnId: turn.id,
                        userKey: opts.userKey,
                        batchValidationKey: opts.batchValidationKey || ''
                    });
                    if ((opts.turnIndex != null ? opts.turnIndex : 0) === 0 && opts.userPrompt) {
                        tryAutoNameFromFirstMessage(opts.userPrompt);
                    }
                    state.currentTurnCount = Math.max(state.currentTurnCount || 0, 1);
                    refreshHistoryList();
                }
                return turn;
            });
        });
    }

    function saveTurnKeepalive(opts) {
        opts = opts || {};
        var sessionId = state.sessionId;
        if (!sessionId) return;
        var batchKey = opts.chain && opts.chain.batchValidationKey
            ? String(opts.chain.batchValidationKey)
            : '';
        try {
            fetch('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) + '/turns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify({
                    turn_index: opts.turnIndex != null ? opts.turnIndex : 0,
                    user_prompt: String(opts.userPrompt || ''),
                    user_mode: String(opts.userMode || ''),
                    lanhu_url: String(
                        opts.lanhuUrl != null ? opts.lanhuUrl : resolveLanhuUrlForTurnArchive(opts)
                    ),
                    chain: opts.chain ? stripEphemeralChainFields(opts.chain) : null,
                    agent_chain: opts.agentChain || null,
                    batch_meta: opts.batchMeta || null,
                    turn_id: opts.turnId || null
                })
            });
        } catch (e) { /* ignore */ }
    }


    function resolveSessionIdForTurnApi(sessionId) {
        return String(sessionId || state.sessionId || '').trim();
    }

    function buildTurnValidationApiUrl(turnId, sessionId, opts) {
        opts = opts || {};
        turnId = String(turnId || '').trim();
        sessionId = resolveSessionIdForTurnApi(sessionId);
        if (!turnId) return '';
        var turnRow = getTurnFromState(turnId);
        var useSessionScoped = !!sessionId;
        if (turnRow && turnRow.id === turnId) {
            useSessionScoped = true;
        } else if (opts.preferTurnScoped || !turnRow) {
            useSessionScoped = false;
        }
        if (useSessionScoped && sessionId) {
            return '/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId) +
                '/turns/' + encodeURIComponent(turnId) + '/validation';
        }
        return '/api/test-cases/workbench-sessions/turns/' + encodeURIComponent(turnId) + '/validation';
    }

    function saveTurnValidation(turnId, validation, reasoning, batchMeta, sessionId) {
        turnId = String(turnId || '').trim();
        if (!turnId || !validation) return Promise.resolve(null);
        var url = buildTurnValidationApiUrl(turnId, sessionId, { preferTurnScoped: true });
        if (!url) return Promise.resolve(null);
        return fetchJson(url, {
            method: 'PUT',
            body: JSON.stringify({
                validation: validation,
                validate_reasoning: String(reasoning || ''),
                batch_meta: batchMeta || null
            })
        }).then(function (data) {
            dispatch('tc-wb-turn-validation-saved', { turnId: turnId });
            return data.turn || null;
        });
    }

    function loadTurnValidation(turnId, forceRefresh, sessionId) {
        turnId = String(turnId || '').trim();
        if (!turnId) return Promise.reject(new Error('缺少 turnId'));
        var url = buildTurnValidationApiUrl(turnId, sessionId, { preferTurnScoped: true });
        if (!url) return Promise.reject(new Error('缺少 turnId'));
        if (forceRefresh) url += (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
        return fetchJson(url);
    }

    /** 质量检查落库前确保当前会话轮次存在（按 session + turn_index upsert，不覆盖已有 validation）。 */
    function ensureTurnForValidation(opts) {
        opts = opts || {};
        var batchKey = String(opts.batchValidationKey || '').trim();
        var turnId = String(opts.turnId || state.currentTurnId || '').trim();
        if (!turnId && batchKey) {
            turnId = String(state.turnIdByBatchKey[batchKey] || '').trim();
        }
        if (turnId) return Promise.resolve(turnId);
        return ensureSession().then(function () {
            if (!state.sessionId) return null;
            var turnIndex = parseInt(state.currentTurnCount, 10);
            if (isNaN(turnIndex) || turnIndex < 0) turnIndex = 0;
            var userPrompt = String(opts.userPrompt || '').trim();
            if (!userPrompt) {
                var promptEl = document.getElementById('ai-prompt');
                userPrompt = promptEl ? String(promptEl.value || '').trim() : '';
            }
            var chain = opts.chain && typeof opts.chain === 'object' ? opts.chain : null;
            if (!chain && batchKey) {
                chain = { batchValidationKey: batchKey };
            }
            var batchMeta = opts.batchMeta && typeof opts.batchMeta === 'object' ? opts.batchMeta : null;
            return saveTurn({
                turnIndex: turnIndex,
                userPrompt: userPrompt,
                userMode: getPlanContext(),
                chain: chain,
                batchMeta: batchMeta,
                batchValidationKey: batchKey,
                turnId: null
            }).then(function (turn) {
                return turn && turn.id ? String(turn.id) : null;
            });
        });
    }

    function flushValidationForBatchKey(batchKey, turnId) {
        batchKey = String(batchKey || '').trim();
        turnId = String(turnId || '').trim();
        if (!turnId) return;
        var enh = global.TcWorkbenchEnhancements;
        if (!enh || typeof enh.getCachedBatchValidation !== 'function') return;
        var turnKey = typeof enh.buildTurnScopedValidationKey === 'function'
            ? enh.buildTurnScopedValidationKey(turnId)
            : ('turn-' + turnId);
        if (batchKey.indexOf('turn-') === 0 && batchKey !== turnKey) {
            batchKey = '';
        } else if (typeof enh.migrateValidationCacheToTurn === 'function' && batchKey) {
            enh.migrateValidationCacheToTurn(batchKey, turnId);
        }
        var cached = enh.getCachedBatchValidation(turnKey);
        if ((!cached || !cached.lastValidation) && batchKey && batchKey.indexOf('turn-') !== 0) {
            cached = enh.getCachedBatchValidation(batchKey);
        }
        if ((!cached || !cached.lastValidation) && typeof enh.resolveTurnScopedValidationFallback === 'function') {
            var payload = enh.resolveTurnScopedValidationFallback(null, turnId, turnKey);
            if (payload && payload.validation) {
                cached = {
                    lastValidation: payload.validation,
                    validateLlmReasoning: payload.validate_reasoning || '',
                    batchSnapshot: payload.batch_meta || null
                };
            }
        }
        if (!cached || !cached.lastValidation) return;
        var batchMeta = typeof enh.buildBatchMetaForTurnFlush === 'function'
            ? enh.buildBatchMetaForTurnFlush(turnId, cached.batchSnapshot)
            : (cached.batchSnapshot && typeof cached.batchSnapshot === 'object'
                ? Object.assign({}, cached.batchSnapshot, { batchValidationKey: turnKey })
                : { batchValidationKey: turnKey });
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.attachTurnIdToValidationCache === 'function' &&
            batchKey) {
            global.TcWorkbenchEnhancements.attachTurnIdToValidationCache(batchKey, turnId);
        }
        registerTurnMapping(turnId, null, turnKey);
        if (batchKey && batchKey !== turnKey) {
            registerTurnMapping(turnId, null, batchKey);
        }
        saveTurnValidation(
            turnId,
            cached.lastValidation,
            cached.validateLlmReasoning || '',
            batchMeta
        ).then(function () {
            patchTurnChainValidationKey(turnId, turnKey);
        });
    }

    function patchTurnChainValidationKey(turnId, turnKey) {
        turnId = String(turnId || '').trim();
        turnKey = String(turnKey || '').trim();
        if (!turnId || !turnKey || !state.sessionId) return Promise.resolve(null);
        var idx = -1;
        var row = null;
        for (var i = 0; i < state.currentTurns.length; i++) {
            if (state.currentTurns[i] && state.currentTurns[i].id === turnId) {
                idx = i;
                row = state.currentTurns[i];
                break;
            }
        }
        if (!row) {
            return Promise.resolve(null);
        }
        var chain = row.chain && typeof row.chain === 'object' ? Object.assign({}, row.chain) : {};
        chain.batchValidationKey = turnKey;
        chain.turnId = turnId;
        state.currentTurns[idx] = Object.assign({}, row, { chain: chain });
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(state.sessionId) + '/turns', {
            method: 'POST',
            body: JSON.stringify({
                turn_index: row && row.turn_index != null ? row.turn_index : (idx >= 0 ? idx : 0),
                user_prompt: row ? String(row.user_prompt || '') : '',
                user_mode: row ? String(row.user_mode || '') : '',
                chain: row && row.chain ? row.chain : { batchValidationKey: turnKey, turnId: turnId },
                turn_id: turnId
            })
        }).then(function (data) { return data.turn || null; }).catch(function () { return null; });
    }

    function onValidationCached(batchKey) {
        batchKey = String(batchKey || '').trim();
        if (!batchKey) return;
        var turnId = state.turnIdByBatchKey[batchKey];
        if (!turnId && batchKey.indexOf('turn-') === 0) {
            turnId = batchKey.slice(5);
        }
        if (!turnId) return;
        var enh = global.TcWorkbenchEnhancements;
        if (enh && typeof enh.getCachedBatchValidation === 'function') {
            var cached = enh.getCachedBatchValidation(batchKey);
            if (!cached && batchKey.indexOf('turn-') === 0) {
                cached = enh.getCachedBatchValidation('turn-' + turnId);
            }
            if (cached && cached.turnId && String(cached.turnId) !== String(turnId)) {
                return;
            }
        }
        flushValidationForBatchKey(batchKey, turnId);
    }

    function onTurnArchived(opts) {
        opts = opts || {};
        var chain = opts.chain || null;
        var agentChain = opts.agentChain || null;
        var batchKey = chain && chain.batchValidationKey ? String(chain.batchValidationKey) : '';
        var turnId = opts.turnId ||
            (agentChain && agentChain.turnId ? String(agentChain.turnId) : '') ||
            (chain && chain.turnId ? String(chain.turnId) : '') ||
            null;
        return saveTurn({
            turnIndex: opts.turnIndex != null ? opts.turnIndex : 0,
            userPrompt: opts.userPrompt,
            userMode: opts.userMode,
            lanhuUrl: resolveLanhuUrlForTurnArchive(opts),
            chain: chain,
            agentChain: agentChain,
            batchMeta: chain && chain.batchValidationKey ? { batchValidationKey: batchKey } : null,
            userKey: opts.userKey,
            batchValidationKey: batchKey,
            turnId: turnId,
            keepalive: !!opts.keepalive
        }).then(function (turn) {
            if (turn && turn.id) {
                var turnKey = 'turn-' + turn.id;
                if (chain && typeof chain === 'object') {
                    chain.batchValidationKey = turnKey;
                    chain.turnId = turn.id;
                }
                registerTurnMapping(turn.id, opts.userKey, batchKey);
                registerTurnMapping(turn.id, null, turnKey);
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.attachTurnIdToValidationCache === 'function' &&
                    batchKey) {
                    global.TcWorkbenchEnhancements.attachTurnIdToValidationCache(batchKey, turn.id);
                }
                var flushPending = Promise.resolve(null);
                if (global.TcWorkbenchEnhancements &&
                    typeof global.TcWorkbenchEnhancements.flushPendingValidationForTurn === 'function') {
                    flushPending = global.TcWorkbenchEnhancements.flushPendingValidationForTurn(turn.id, batchKey || turnKey);
                }
                flushPending.finally(function () {
                    flushValidationForBatchKey(batchKey || turnKey, turn.id);
                    patchTurnChainValidationKey(turn.id, turnKey);
                });
            }
            return turn;
        });
    }

    function listSessions(limit, planContext) {
        planContext = planContext || getPlanContext();
        var qs = '?plan_context=' + encodeURIComponent(planContext) +
            '&limit=' + encodeURIComponent(limit != null ? limit : MAX_HISTORY);
        if (state.sessionId) {
            qs += '&current_session_id=' + encodeURIComponent(state.sessionId);
        }
        return fetchJson('/api/test-cases/workbench-sessions' + qs).then(function (data) {
            return data.items || [];
        });
    }

    function loadSessionDetail(sessionId) {
        sessionId = String(sessionId || '').trim();
        if (!sessionId) return Promise.reject(new Error('缺少 sessionId'));
        return fetchJson('/api/test-cases/workbench-sessions/' + encodeURIComponent(sessionId));
    }

    function applySessionDetail(detail) {
        detail = detail || {};
        var sess = detail.session || {};
        var turns = detail.turns || [];
        var planContext = sess.plan_context || getPlanContext();
        applyActiveSession(sess, planContext);
        setCurrentTurns(turns);
        syncAwaitingFirstMessageTitle(sess, { limitReached: false });
        turns.forEach(function (turn) {
            if (turn && turn.id) {
                registerTurnMapping(
                    turn.id,
                    'restored-' + turn.id,
                    turn.chain && turn.chain.batchValidationKey
                );
            }
        });
        syncSessionValidationFromTurns(turns, planContext);
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.syncTurnValidationStepsFromSession === 'function') {
            global.TcWorkbenchEnhancements.syncTurnValidationStepsFromSession(turns);
        }
        dispatch('tc-wb-session-switched', { session: sess, turns: turns, planContext: planContext });
        return { session: sess, turns: turns };
    }

    function switchSession(sessionId) {
        return flushSessionStateBeforeLeave().then(function () {
            return discardEmptyDraftSessionIfNeeded();
        }).then(function () {
            return loadSessionDetail(sessionId);
        }).then(function (detail) {
            if (detail.session && detail.session.plan_context &&
                detail.session.plan_context !== getPlanContext()) {
                return detail;
            }
            return applySessionDetail(detail);
        });
    }

    function formatSessionTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso);
            var pad = function (n) { return n < 10 ? '0' + n : String(n); };
            return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (e) {
            return String(iso);
        }
    }

    function updateHistoryPanelHead() {
        var titleEl = document.querySelector('#tc-wb-history-panel .tc-wb-history-panel__title');
        if (titleEl) {
            titleEl.textContent = '历史会话';
        }
        var hintEl = document.getElementById('tc-wb-history-limit-hint');
        if (hintEl) {
            hintEl.textContent = '最多保留 ' + MAX_HISTORY + ' 条';
        }
    }

    function buildHistoryDisplayItems(items) {
        items = sortHistoryItemsByCreatedAt(items).filter(function (item) {
            return (parseInt(item.turn_count, 10) || 0) > 0;
        });
        if (state.sessionId && state.currentPlanContext === getPlanContext()) {
            var hasCurrent = items.some(function (item) {
                return item && item.id === state.sessionId;
            });
            if (!hasCurrent && state.currentSessionMeta && state.currentSessionMeta.id === state.sessionId) {
                items.unshift(Object.assign({}, state.currentSessionMeta, {
                    turn_count: state.currentTurnCount || 0,
                    is_current_draft: (state.currentTurnCount || 0) === 0
                }));
            }
        }
        return items;
    }

    function sortHistoryItemsByCreatedAt(items) {
        return (items || []).slice().sort(function (a, b) {
            var ta = new Date(a && a.created_at ? a.created_at : 0).getTime();
            var tb = new Date(b && b.created_at ? b.created_at : 0).getTime();
            if (isNaN(ta)) ta = 0;
            if (isNaN(tb)) tb = 0;
            return tb - ta;
        });
    }

    function renderHistoryList(items) {
        var list = document.getElementById('tc-wb-history-list');
        if (!list) return;
        list.innerHTML = '';
        updateHistoryPanelHead();
        items = buildHistoryDisplayItems(items);
        if (!items || !items.length) {
            var empty = document.createElement('li');
            empty.className = 'tc-wb-history-list__empty';
            empty.textContent = '暂无历史会话';
            list.appendChild(empty);
            return;
        }
        items.forEach(function (item) {
            var li = document.createElement('li');
            li.className = 'tc-wb-history-list__item';
            if (item.id === state.sessionId) li.classList.add('tc-wb-history-list__item--active');
            li.setAttribute('data-session-id', item.id);

            var row = document.createElement('div');
            row.className = 'tc-wb-history-list__item-row';

            var main = document.createElement('div');
            main.className = 'tc-wb-history-list__item-main';

            var title = document.createElement('span');
            title.className = 'tc-wb-history-list__title';
            title.textContent = item.title || '新会话';
            title.title = '双击重命名';
            title.addEventListener('dblclick', function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginEditHistoryTitle(item, title);
            });
            var meta = document.createElement('span');
            meta.className = 'tc-wb-history-list__meta';
            if (item.is_current_draft) {
                meta.textContent = '当前会话 · 0 轮';
            } else {
                meta.textContent = formatSessionTime(item.created_at || item.updated_at) +
                    ' · ' + (item.turn_count || 0) + ' 轮';
            }
            main.appendChild(title);
            main.appendChild(meta);

            var renameBtn = document.createElement('button');
            renameBtn.type = 'button';
            renameBtn.className = 'tc-wb-history-list__rename';
            renameBtn.setAttribute('aria-label', '重命名此会话');
            renameBtn.title = '重命名';
            renameBtn.textContent = '重命名';
            renameBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                beginEditHistoryTitle(item, title);
            });

            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'tc-wb-history-list__delete';
            delBtn.setAttribute('aria-label', '删除此会话');
            delBtn.title = '删除此会话';
            delBtn.textContent = '删除';
            delBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                confirmDeleteHistorySession(item).then(function (ok) {
                    if (!ok) return;
                    performHistorySessionDelete(item);
                });
            });

            row.appendChild(main);
            row.appendChild(renameBtn);
            row.appendChild(delBtn);
            li.appendChild(row);
            list.appendChild(li);
        });
    }

    function refreshHistoryList() {
        return listSessions(MAX_HISTORY, getPlanContext()).then(renderHistoryList).catch(function () {
            renderHistoryList([]);
        });
    }

    function setHistoryPanelOpen(open) {
        var panel = document.getElementById('tc-wb-history-panel');
        var btn = document.getElementById('tc-wb-history-toggle');
        if (!panel) return;
        panel.classList.toggle('hidden', !open);
        panel.setAttribute('aria-hidden', open ? 'false' : 'true');
        if (btn) {
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.classList.toggle('tc-wb-history-toggle--open', !!open);
        }
        if (open) {
            if (typeof global.maybeCollapseTcLanhuSectionIfExpanded === 'function') {
                global.maybeCollapseTcLanhuSectionIfExpanded();
            }
            refreshHistoryList();
        }
    }

    function shouldSkipTurnsRestore(turns) {
        if (!global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.isRestoreBlockedByLiveActivity !== 'function') {
            return false;
        }
        if (global.TcGenChatXUi.isRestoreBlockedByLiveActivity(turns || [])) {
            return true;
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isSessionActive === 'function' &&
            global.TcGenChatPipeline.isSessionActive()) {
            return true;
        }
        return false;
    }

    function restoreChatFromTurns(turns, opts) {
        opts = opts || {};
        turns = turns || [];
        if (!opts.force && shouldSkipTurnsRestore(turns)) {
            state.pendingTurnsRestore = null;
            return;
        }
        var planContext = state.currentPlanContext || getPlanContext();
        if (isEditPlanContext(planContext)) {
            if (global.TcEditChat && typeof global.TcEditChat.restoreFromTurns === 'function') {
                global.TcEditChat.restoreFromTurns(turns, opts);
                state.pendingTurnsRestore = null;
                return;
            }
        }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.restoreFromTurns === 'function') {
            global.TcGenChatXUi.restoreFromTurns(turns, { force: !!opts.force });
            state.pendingTurnsRestore = null;
            return;
        }
        state.pendingTurnsRestore = turns;
        dispatch('tc-wb-restore-turns', { turns: turns });
    }

    function flushPendingTurnsRestore() {
        if (state.pendingTurnsRestore === null) return;
        var planContext = state.currentPlanContext || getPlanContext();
        if (isEditPlanContext(planContext)) {
            if (global.TcEditChat && typeof global.TcEditChat.restoreFromTurns === 'function') {
                var pendingEdit = state.pendingTurnsRestore;
                if (shouldSkipTurnsRestore(pendingEdit)) {
                    state.pendingTurnsRestore = null;
                    return;
                }
                global.TcEditChat.restoreFromTurns(pendingEdit);
                state.pendingTurnsRestore = null;
                return;
            }
        }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.restoreFromTurns === 'function') {
            var pending = state.pendingTurnsRestore;
            if (shouldSkipTurnsRestore(pending)) {
                state.pendingTurnsRestore = null;
                return;
            }
            global.TcGenChatXUi.restoreFromTurns(pending);
            state.pendingTurnsRestore = null;
        }
    }

    function isSessionInteractionBlocked() {
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return true;
        }
        if (typeof global.isTcPromptSendLocked === 'function' && global.isTcPromptSendLocked()) {
            return true;
        }
        return false;
    }

    function syncSessionNavLockUi(locked) {
        locked = !!locked;
        var lockTitle = '';
        if (locked && global.TcLeftPanelLock &&
            typeof global.TcLeftPanelLock.getSessionNavLockTitle === 'function') {
            lockTitle = global.TcLeftPanelLock.getSessionNavLockTitle();
        } else if (locked) {
            lockTitle = '用例生成进行中，请稍候';
        }
        var toggleBtn = document.getElementById('tc-wb-history-toggle');
        var newChatBtn = document.getElementById('tc-wb-new-chat-btn');
        var newBtn = document.getElementById('tc-wb-history-new');
        [
            { el: toggleBtn, openTitle: '查看历史会话' },
            { el: newChatBtn, openTitle: '开启新对话，清空当前对话区' },
            { el: newBtn, openTitle: '新建会话' }
        ].forEach(function (item) {
            var btn = item.el;
            if (!btn) return;
            btn.disabled = locked;
            btn.classList.toggle('tc-session-nav-btn--locked', locked);
            if (locked) {
                btn.setAttribute('aria-disabled', 'true');
                btn.title = lockTitle;
            } else {
                btn.removeAttribute('aria-disabled');
                btn.title = item.openTitle;
            }
        });
        if (locked) setHistoryPanelOpen(false);
    }

    global.syncTcSessionNavLockUi = syncSessionNavLockUi;

    function sessionInteractionBlockedToast() {
        if (typeof global.tcAppToast !== 'function') return;
        var qcBusy = global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isQualityCheckBusy === 'function' &&
            global.TcLeftPanelLock.isQualityCheckBusy();
        var editBusy = global.TcLeftPanelLock && typeof global.TcLeftPanelLock.isEditLocked === 'function' &&
            global.TcLeftPanelLock.isEditLocked();
        var msg = qcBusy ? '质量检查进行中，请稍候'
            : (editBusy ? '智能编辑进行中，请稍候' : '用例生成进行中，请稍候');
        global.tcAppToast(msg, { variant: 'warning', duration: 2800 });
    }

    function startNewConversation() {
        if (isSessionInteractionBlocked()) {
            sessionInteractionBlockedToast();
            return Promise.resolve();
        }
        if (isCurrentSessionNew()) {
            return noopCurrentNewSession();
        }
        setHistoryPanelOpen(false);
        return startNewSessionForCurrentContext(true);
    }

    function bindHistoryUi() {
        var toggleBtn = document.getElementById('tc-wb-history-toggle');
        var panel = document.getElementById('tc-wb-history-panel');
        var closeBtn = document.getElementById('tc-wb-history-close');
        var newBtn = document.getElementById('tc-wb-history-new');
        var newChatBtn = document.getElementById('tc-wb-new-chat-btn');
        var list = document.getElementById('tc-wb-history-list');
        var limitClose = document.querySelector('#tc-wb-session-limit-banner .tc-wb-session-limit-banner__close');
        if (limitClose) {
            limitClose.addEventListener('click', function (e) {
                e.preventDefault();
                hideSessionLimitBanner();
            });
        }
        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (isSessionInteractionBlocked()) {
                sessionInteractionBlockedToast();
                return;
            }
            var open = panel.classList.contains('hidden');
            setHistoryPanelOpen(open);
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                setHistoryPanelOpen(false);
            });
        }

        if (newBtn) {
            newBtn.addEventListener('click', function (e) {
                e.preventDefault();
                startNewConversation();
            });
        }

        if (newChatBtn) {
            newChatBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                startNewConversation();
            });
        }

        if (list) {
            list.addEventListener('click', function (e) {
                var li = e.target.closest('.tc-wb-history-list__item[data-session-id]');
                if (!li) return;
                if (isSessionInteractionBlocked()) {
                    sessionInteractionBlockedToast();
                    return;
                }
                var sid = li.getAttribute('data-session-id');
                if (!sid || sid === state.sessionId) {
                    setHistoryPanelOpen(false);
                    return;
                }
                switchSession(sid).then(function (payload) {
                    if (payload && payload.session && payload.session.id) {
                        restoreChatFromTurns(payload.turns || [], { force: true });
                    }
                    setHistoryPanelOpen(false);
                });
            });
        }

        document.addEventListener('click', function (e) {
            if (panel.classList.contains('hidden')) return;
            if (e.target.closest('#tc-wb-history-panel') || e.target.closest('#tc-wb-history-toggle')) return;
            setHistoryPanelOpen(false);
        });
    }

    function boot() {
        if (!isWorkbenchPage()) return;
        initGenerationLeaveHandler();
        bindSessionPrefsHooks();
        global.addEventListener('tc-gen-chat-x-ready', flushPendingTurnsRestore);
        hookPlanContextChanges();
        state.bootSyncing = true;
        state.lastObservedContext = getPlanContext();
        Promise.resolve().then(function () {
            syncObservedPlanContext();
            return init();
        }).then(function () {
            flushPendingTurnsRestore();
            bindHistoryUi();
            updateHistoryPanelHead();
            refreshHistoryList();
            if (typeof global.TcLeftPanelLock &&
                typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
        }).catch(function () {
            bindHistoryUi();
        }).finally(function () {
            state.bootSyncing = false;
            syncObservedPlanContext();
        });
    }

    global.TcWorkbenchSession = {
        init: init,
        ensureSession: ensureSession,
        getCurrentSessionId: getCurrentSessionId,
        getCurrentPlanContext: getCurrentPlanContext,
        getPlanContext: getPlanContext,
        getCurrentTurnId: getCurrentTurnId,
        getTurnIdForUserKey: getTurnIdForUserKey,
        getTurnFromState: getTurnFromState,
        getTurnIdForBatchKey: getTurnIdForBatchKey,
        getLatestValidatedTurnId: getLatestValidatedTurnId,
        getLatestSessionTurnId: getLatestSessionTurnId,
        mergeTurnValidationInState: mergeTurnValidationInState,
        registerTurnMapping: registerTurnMapping,
        patchTurnChainValidationKey: patchTurnChainValidationKey,
        saveTurn: saveTurn,
        saveTurnValidation: saveTurnValidation,
        loadTurnValidation: loadTurnValidation,
        ensureTurnForValidation: ensureTurnForValidation,
        onTurnArchived: onTurnArchived,
        onValidationCached: onValidationCached,
        listSessions: listSessions,
        switchSession: switchSession,
        createNewSession: createNewSession,
        deleteSession: deleteSession,
        startNewSessionForCurrentContext: startNewSessionForCurrentContext,
        startNewConversation: startNewConversation,
        toggleHistoryPanel: function () {
            var panel = document.getElementById('tc-wb-history-panel');
            if (!panel) return;
            setHistoryPanelOpen(panel.classList.contains('hidden'));
        },
        showSessionLimitBanner: showSessionLimitBanner,
        hideSessionLimitBanner: hideSessionLimitBanner,
        refreshHistoryList: refreshHistoryList,
        updateSessionTitle: updateSessionTitle,
        tryAutoNameFromFirstMessage: tryAutoNameFromFirstMessage,
        collectSessionPrefs: collectSessionPrefs,
        applySessionPrefs: applySessionPrefs,
        clearLanhuRequirementConfig: clearLanhuRequirementConfig,
        saveSessionPrefsNow: saveSessionPrefsNow,
        bootstrapEntrySession: bootstrapEntrySession,
        getCurrentLanhuUrlForGen: getCurrentLanhuUrlForGen,
        resolveLanhuUrlForTurnArchive: resolveLanhuUrlForTurnArchive,
        getPreviousUserPromptsForCurrentLanhu: getPreviousUserPromptsForCurrentLanhu,
        setCurrentTurns: setCurrentTurns,
        getCurrentTurnCount: function () { return state.currentTurnCount || 0; },
        syncPlanContextFromWorkbench: observePlanContext
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(window));

/* ---- tc_requirement_case_store.js ---- */
/**
 * TestHub — 按蓝湖需求 ID（pageId/docId）持久化用例表格
 */
(function tcRequirementCaseStoreModule(global) {
    'use strict';

    var DEBOUNCE_MS = 800;
    var _debounceTimer = null;
    var _activeCtx = null;
    var _loading = false;
    var _lastLoadedKey = '';
    var _loadSeq = 0;
    var _pageSwitchToken = 0;
    var _targetPageId = '';
    var _persistSuspended = false;
    var _dirty = false;
    var _loadAbort = null;
    var _generationPinnedCtx = null;
    var _generationPersistPayload = null;
    var _genMergeMode = null;

    function $(id) { return document.getElementById(id); }

    function parseLanhuParams(url) {
        var raw = String(url || '').trim();
        if (!raw) return null;
        var q = raw;
        if (/^https?:/i.test(raw)) {
            var hashIdx = raw.indexOf('#');
            if (hashIdx >= 0) {
                var frag = raw.slice(hashIdx + 1);
                q = frag.indexOf('?') >= 0 ? frag.split('?')[1] : frag;
            } else {
                var qi = raw.indexOf('?');
                q = qi >= 0 ? raw.slice(qi + 1) : '';
            }
        }
        if (q.charAt(0) === '?') q = q.slice(1);
        if (q.charAt(0) === '#') q = q.slice(1);
        var params = {};
        q.split('&').forEach(function (part) {
            if (!part || part.indexOf('=') < 0) return;
            var kv = part.split('=');
            params[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('='));
        });
        var pid = params.pid || '';
        var docId = params.docId || params.image_id || '';
        var pageId = params.pageId || params.page_id || '';
        if (!docId) return null;
        return {
            lanhu_pid: pid,
            lanhu_doc_id: docId,
            lanhu_page_id: pageId,
            requirement_id: pageId || docId
        };
    }


    var LAST_PAGE_LS_PREFIX = 'tc_req_case_last_page:';

    function rememberLastPage(docId, pageId) {
        if (!docId || !pageId) return;
        try {
            localStorage.setItem(LAST_PAGE_LS_PREFIX + docId, pageId);
        } catch (e) { /* ignore */ }
    }

    function readLastPage(docId) {
        if (!docId) return '';
        try {
            return localStorage.getItem(LAST_PAGE_LS_PREFIX + docId) || '';
        } catch (e) {
            return '';
        }
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

    function normalizeCtx(ctx) {
        if (!ctx) return null;
        var out = Object.assign({}, ctx);
        var pageId = String(out.lanhu_page_id || out.page_id || '').trim();
        if (pageId) {
            out.lanhu_page_id = pageId;
            out.page_id = pageId;
            out.requirement_id = pageId;
        }
        var baseUrl = stripPageIdFromLanhuUrl(out.lanhu_url || getLanhuUrlFromDom() || '');
        if (baseUrl && pageId && typeof global.buildTcLanhuPageUrl === 'function') {
            out.lanhu_url = global.buildTcLanhuPageUrl(baseUrl, pageId);
        } else if (baseUrl) {
            out.lanhu_url = baseUrl;
        }
        if (out.page_name == null) out.page_name = '';
        return out.lanhu_url ? out : null;
    }

    function isGenerationActive() {
        return typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive();
    }



    function isWorkbenchGenerationStreamBusy() {
        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator &&
            typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return true;
        }
        return false;
    }

    function isWorkbenchGenerationInterruptible() {
        if (_generationPinnedCtx) return true;
        if (typeof global.tcIsGenerationRollbackSnapshotActive === 'function' &&
            global.tcIsGenerationRollbackSnapshotActive()) {
            return true;
        }
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcRequirementPageGenBusy === 'function' && global.isTcRequirementPageGenBusy()) {
            return true;
        }
        if (isGenerationActive()) return true;
        return false;
    }

    function abortAndRollbackWorkbenchGeneration(opts) {
        opts = opts || {};
        if (!isWorkbenchGenerationInterruptible()) return false;
        var mergeMode = _genMergeMode || opts.mergeMode || 'overwrite';
        try {
            if (typeof global.abortActiveGenerationRun === 'function') global.abortActiveGenerationRun();
        } catch (eAbortRun) { /* ignore */ }
        try {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.abortForPageLeave === 'function') {
                global.TcGenerationStreamClient.abortForPageLeave();
            }
        } catch (eStream) { /* ignore */ }
        try {
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.abortForPageLeave === 'function') {
                global.TcAgentOrchestrator.abortForPageLeave();
            }
        } catch (eAgent) { /* ignore */ }
        if (typeof global.tcRestoreGenerationRollbackSnapshot === 'function') {
            global.tcRestoreGenerationRollbackSnapshot({ mergeMode: mergeMode });
        } else if (mergeMode === 'append' &&
            typeof global.tcForceRestoreAppendGenerationBaseline === 'function') {
            global.tcForceRestoreAppendGenerationBaseline();
        }
        clearDirty();
        cancelPendingPersist();
        clearGenerationPinnedContext();
        if (typeof global.tcClearGenerationRollbackSnapshot === 'function') {
            global.tcClearGenerationRollbackSnapshot();
        }
        if (typeof global.tcClearAppendGenerationBaseline === 'function') {
            global.tcClearAppendGenerationBaseline();
        }
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        if (typeof global.refreshTcPageGenLock === 'function') {
            global.refreshTcPageGenLock();
        }
        if (typeof global.restoreTcPromptComposerAfterStop === 'function') {
            global.restoreTcPromptComposerAfterStop({ releaseStreamUi: true, status: 'cancelled' });
        }
        return true;
    }

    function abortGenerationAndRestoreTable(opts) {
        opts = opts || {};
        var mergeMode = _genMergeMode || opts.mergeMode || 'overwrite';
        var hadRollback = typeof global.tcIsGenerationRollbackSnapshotActive === 'function' &&
            global.tcIsGenerationRollbackSnapshotActive();
        var hadPinned = !!_generationPinnedCtx;
        if (hadRollback || hadPinned) {
            if (typeof global.tcRestoreGenerationRollbackSnapshot === 'function') {
                global.tcRestoreGenerationRollbackSnapshot({ mergeMode: mergeMode });
            } else if (mergeMode === 'append' &&
                typeof global.tcForceRestoreAppendGenerationBaseline === 'function') {
                global.tcForceRestoreAppendGenerationBaseline();
            }
        }
        clearDirty();
        cancelPendingPersist();
        clearGenerationPinnedContext();
        return hadRollback || hadPinned;
    }

    function shouldBlockOverwriteDbPersistDuringGeneration(opts) {
        opts = opts || {};
        if (opts.source === 'generation' || opts.forGeneration || opts.forCoverageFill) return false;
        if (!_generationPinnedCtx || _genMergeMode !== 'overwrite') return false;
        return true;
    }

    function markDirty() {
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        if (!resolveContext({})) return;
        _dirty = true;
    }

    function clearDirty() {
        _dirty = false;
    }


    function tcIsBenignFetchAbort(err) {
        if (!err) return false;
        if (err.name === 'AbortError') return true;
        var msg = String((err && err.message) || err || '');
        var lower = msg.toLowerCase();
        if (err.name === 'TypeError' && (lower.indexOf('networkerror') >= 0 || lower.indexOf('failed to fetch') >= 0)) {
            return true;
        }
        return lower.indexOf('networkerror') >= 0 || lower.indexOf('network error') >= 0 ||
            lower.indexOf('failed to fetch') >= 0 || lower.indexOf('aborted') >= 0 ||
            lower.indexOf('cancelled') >= 0 || lower.indexOf('the user aborted') >= 0 ||
            lower.indexOf('attempting to fetch resource') >= 0;
    }

    function cancelPendingPersist() {
        if (_debounceTimer) {
            clearTimeout(_debounceTimer);
            _debounceTimer = null;
        }
    }

    function shouldSkipGridPullForPersist() {
        if (_genMergeMode === 'append') return true;
        if (typeof global.tcShouldSkipGridPullForAppendGen === 'function' && global.tcShouldSkipGridPullForAppendGen()) {
            return true;
        }
        return false;
    }

    function collectPayloadWithoutGridPull() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        if (!rowsHaveContent(rows, cols.length)) return null;
        var payload = {
            scope: 'table',
            columns: cols,
            rows: rows,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(rows.length);
        }
        return payload;
    }

    function buildAppendGenerationPersistPayload() {
        ensureGenerationPersistPayloadShell();
        if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
            global.tcRestoreAppendGenerationBaselineIfNeeded();
        }
        var shell = _generationPersistPayload;
        var direct = collectPayloadWithoutGridPull();
        if (!shell || !shell.columns || !shell.columns.length) {
            return direct;
        }
        if (!direct || !direct.rows || !direct.rows.length) {
            return shell;
        }
        var shellRows = shell.rows ? shell.rows.length : 0;
        var directRows = direct.rows.length;
        if (directRows >= shellRows) {
            shell.rows = direct.rows.slice();
            shell.columnVisible = direct.columnVisible || shell.columnVisible;
            shell.columnWidth = direct.columnWidth || shell.columnWidth;
            shell.rowHeights = direct.rowHeights || shell.rowHeights;
            if (direct.provenance) shell.provenance = direct.provenance;
            return sanitizeRequirementCasePayloadForPersist(shell, { dedupe: true });
        }
        return shell;
    }

    function syncTableForPersist() {
        if (shouldSkipGridPullForPersist()) {
            return Promise.resolve(false);
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            return Promise.resolve(global.TcTableBridge.commitAll());
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            return global.tcTablePullRowsFromView();
        }
        return Promise.resolve(false);
    }

    function buildContextKey(ctx) {
        if (!ctx) return '';
        return [ctx.lanhu_pid || '', ctx.lanhu_doc_id || '', ctx.lanhu_page_id || ''].join(':');
    }

    function getLanhuUrlFromDom() {
        var el = $('lanhu-url');
        return el ? String(el.value || '').trim() : '';
    }

    /** 切换需求页时解析蓝湖 base URL（输入框 → 活跃上下文 → 会话 prefs → 已保存文档） */
    function resolveLanhuBaseUrlForPageLoad(opts) {
        opts = opts || {};
        var url = String(opts.lanhu_url || '').trim();
        if (url) return stripPageIdFromLanhuUrl(url) || url;
        url = getLanhuUrlFromDom();
        if (url) return stripPageIdFromLanhuUrl(url) || url;
        if (_activeCtx && _activeCtx.lanhu_url) {
            url = stripPageIdFromLanhuUrl(_activeCtx.lanhu_url) || String(_activeCtx.lanhu_url).trim();
            if (url) return url;
        }
        if (global.TcWorkbenchSession &&
            typeof global.TcWorkbenchSession.getCurrentLanhuUrlForGen === 'function') {
            url = global.TcWorkbenchSession.getCurrentLanhuUrlForGen();
            if (url) return stripPageIdFromLanhuUrl(url) || url;
        }
        if (typeof global.getTcLanhuSavedDocUrlForTreeDocId === 'function' &&
            typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            url = global.getTcLanhuSavedDocUrlForTreeDocId(meta.docId);
            if (url) return stripPageIdFromLanhuUrl(url) || url;
        }
        return '';
    }

    function isDisplayedCasesForPage(pageId) {
        pageId = String(pageId || '').trim();
        if (!pageId || !global.tcTableTemplateApplied) return false;
        if (getActiveLanhuPageId() !== pageId) return false;
        if (typeof global.tcCountTableCaseContentRows === 'function') {
            return global.tcCountTableCaseContentRows() > 0;
        }
        return !!(global.testCasesData && global.testCasesData.length);
    }

    function resolveContext(overrides) {
        overrides = overrides || {};
        if (_activeCtx && !overrides.forceUrl) {
            return normalizeCtx(Object.assign({}, _activeCtx, {
                lanhu_url: overrides.lanhu_url || _activeCtx.lanhu_url || getLanhuUrlFromDom(),
                lanhu_page_id: overrides.lanhu_page_id || overrides.page_id || _activeCtx.lanhu_page_id || _activeCtx.page_id,
                page_name: overrides.page_name != null ? overrides.page_name : _activeCtx.page_name
            }));
        }
        var url = String(overrides.lanhu_url || getLanhuUrlFromDom() || '').trim();
        if (!url) return null;
        var pageId = overrides.page_id || overrides.lanhu_page_id || '';
        if (!pageId && global.TC_PAGE_GEN_STATE && global.TC_PAGE_GEN_STATE.pageId) {
            pageId = global.TC_PAGE_GEN_STATE.pageId;
        }
        if (!pageId && typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            pageId = meta.selectedId || meta.focusPageId || '';
        }
        var keys = parseLanhuParams(url);
        if (!keys) return null;
        if (pageId) {
            keys.lanhu_page_id = pageId;
            keys.requirement_id = pageId;
        }
        var pageName = overrides.page_name || '';
        if (!pageName && global.TC_PAGE_GEN_STATE && global.TC_PAGE_GEN_STATE.pageName) {
            pageName = global.TC_PAGE_GEN_STATE.pageName;
        }
        if (!pageName && typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta2 = global.getTcLanhuDocTreeMeta() || {};
            pageName = meta2.selectedPageName || '';
        }
        return normalizeCtx({
            lanhu_url: url,
            lanhu_pid: keys.lanhu_pid,
            lanhu_doc_id: keys.lanhu_doc_id,
            lanhu_page_id: keys.lanhu_page_id,
            requirement_id: keys.requirement_id,
            page_name: pageName
        });
    }

    function setActiveContext(ctx) {
        if (!ctx) {
            _activeCtx = null;
            return;
        }
        _activeCtx = normalizeCtx(ctx);
    }


    function tcClearOverwriteListUiAfterSnapshot() {
        if (typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline()) {
            return;
        }
        if (typeof global.tcTableHasOnlyPlaceholderRows === 'function' && global.tcTableHasOnlyPlaceholderRows()) {
            return;
        }
        if (global.TcWorkbenchData && typeof global.TcWorkbenchData.resetStoreForGeneration === 'function') {
            global.TcWorkbenchData.resetStoreForGeneration('list');
        } else if (typeof global.testCasesData !== 'undefined') {
            global.testCasesData = [];
            if (typeof global.testCasesProvenance !== 'undefined') global.testCasesProvenance = [];
            if (typeof global.markedRows !== 'undefined') global.markedRows = new Set();
            if (typeof global.selectedRows !== 'undefined' && global.selectedRows && typeof global.selectedRows.clear === 'function') {
                global.selectedRows.clear();
            }
        }
        if (typeof global.requestAnimationFrame === 'function') {
            global.requestAnimationFrame(function () {
                if (window.TcTableView && typeof window.TcTableView.syncFromData === 'function') {
                    try { window.TcTableView.syncFromData({ reload: false, immediate: true }); } catch (eSync) { /* ignore */ }
                }
            });
        }
    }

    function captureGenerationTableSnapshot() {
        global.__tcGenerationTableSnapshot = {
            tableColumns: (global.tableColumns || []).slice(),
            tcActiveTemplateId: global.tcActiveTemplateId || null,
            tcTableTemplateApplied: !!global.tcTableTemplateApplied,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
    }

    function clearGenerationTableSnapshot() {
        global.__tcGenerationTableSnapshot = null;
    }

    function restoreGenerationTableSnapshot() {
        var snap = global.__tcGenerationTableSnapshot;
        if (!snap || !snap.tableColumns || !snap.tableColumns.length) return false;
        global.tableColumns = snap.tableColumns.slice();
        global.tcActiveTemplateId = snap.tcActiveTemplateId;
        global.tcTableTemplateApplied = !!snap.tcTableTemplateApplied;
        global.columnVisible = Object.assign({}, snap.columnVisible || {});
        global.columnWidth = Object.assign({}, snap.columnWidth || {});
        global.rowHeights = Object.assign({}, snap.rowHeights || {});
        if (typeof global.renderTableHeader === 'function') global.renderTableHeader();
        return true;
    }

    function resetLanhuNavBypassAfterCoverageFillForNewGeneration() {
        if (global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        if (typeof global.tcSyncLanhuTreePageSwitchLockUi === 'function') {
            global.tcSyncLanhuTreePageSwitchLockUi();
        }
        if (typeof global.tcSyncLanhuDocSwitcherLockUi === 'function') {
            global.tcSyncLanhuDocSwitcherLockUi();
        }
    }

    function captureGenerationContext(mergeMode) {
        resetLanhuNavBypassAfterCoverageFillForNewGeneration();
        var ctx = resolveContext({});
        if (ctx) {
            setActiveContext(ctx);
            _generationPinnedCtx = normalizeCtx(Object.assign({}, ctx));
            _genMergeMode = mergeMode || 'overwrite';
            if (typeof global.tcTemplateSwitchMarkUserEdited === 'function') {
                global.tcTemplateSwitchMarkUserEdited();
            }
            captureGenerationTableSnapshot();
            if (typeof global.tcCaptureGenerationRollbackSnapshot === 'function') {
                global.tcCaptureGenerationRollbackSnapshot();
            }
            if (_genMergeMode === 'overwrite') {
                clearDirty();
                cancelPendingPersist();
                tcClearOverwriteListUiAfterSnapshot();
            }
            if (_genMergeMode === 'append') {
                _generationPersistPayload = null;
                ensureGenerationPersistPayloadShell();
            }
        }
        return ctx;
    }

    function clearGenerationPinnedContext() {
        _generationPinnedCtx = null;
        _genMergeMode = null;
        clearGenerationTableSnapshot();
        _generationPersistPayload = null;
        if (typeof global.tcClearAppendGenerationBaseline === 'function') {
            global.tcClearAppendGenerationBaseline();
        }
        if (typeof global.tcClearGenerationRollbackSnapshot === 'function') {
            global.tcClearGenerationRollbackSnapshot();
        }
        if (typeof global.tcSyncLanhuNavLockUiAfterGenerationIdle === 'function') {
            global.tcSyncLanhuNavLockUiAfterGenerationIdle();
        }
    }

    function resolvePersistContext(opts) {
        opts = opts || {};
        if (opts.ctx) return normalizeCtx(opts.ctx);
        if (_generationPinnedCtx && (opts.forGeneration || opts.usePinnedContext || isGenerationActive())) {
            return normalizeCtx(Object.assign({}, _generationPinnedCtx));
        }
        return resolveContext(opts);
    }

    function getGenerationPinnedPageId() {
        return _generationPinnedCtx ? String(_generationPinnedCtx.lanhu_page_id || _generationPinnedCtx.page_id || '') : '';
    }

    function normalizeRowsForColumns(rows, cols) {
        return (rows || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
    }

    function ensureGenerationPersistPayloadShell() {
        if (_generationPersistPayload && _generationPersistPayload.columns && _generationPersistPayload.columns.length) {
            return _generationPersistPayload;
        }
        if (!global.__tcGenerationTableSnapshot) {
            captureGenerationContext(_genMergeMode || 'overwrite');
        }
        restoreGenerationTableSnapshot();
        var fromTable = null;
        if (_genMergeMode !== 'append') {
            fromTable = collectPayload();
        }
        if (fromTable) {
            _generationPersistPayload = fromTable;
            return _generationPersistPayload;
        }
        var snap = global.__tcGenerationTableSnapshot;
        var cols = snap && snap.tableColumns ? snap.tableColumns.slice() : (global.tableColumns || []).slice();
        if (!cols.length) return null;
        var _baselineRows = (_genMergeMode === 'append' &&
            typeof global.tcGetAppendGenerationBaselineRows === 'function')
            ? global.tcGetAppendGenerationBaselineRows() : null;
        var _sourceRows = (_baselineRows && _baselineRows.length)
            ? _baselineRows
            : (global.testCasesData || []);
        _generationPersistPayload = {
            scope: 'table',
            columns: cols,
            rows: _sourceRows.map(function (row) {
                var out = [];
                for (var i = 0; i < cols.length; i++) {
                    out.push(String(row && row[i] != null ? row[i] : ''));
                }
                return out;
            }),
            columnVisible: Object.assign({}, (snap && snap.columnVisible) || global.columnVisible || {}),
            columnWidth: Object.assign({}, (snap && snap.columnWidth) || global.columnWidth || {}),
            rowHeights: Object.assign({}, (snap && snap.rowHeights) || global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            _generationPersistPayload.provenance = [];
        }
        return _generationPersistPayload;
    }

    function resyncGenerationPersistPayloadFromTable() {
        restoreGenerationTableSnapshot();
        var payload = collectPayloadWithoutGridPull();
        if (!payload) return null;
        var shell = ensureGenerationPersistPayloadShell();
        if (!shell) {
            _generationPersistPayload = payload;
            return _generationPersistPayload;
        }
        shell.columns = payload.columns;
        shell.rows = payload.rows;
        shell.columnVisible = payload.columnVisible || shell.columnVisible;
        shell.columnWidth = payload.columnWidth || shell.columnWidth;
        shell.rowHeights = payload.rowHeights || shell.rowHeights;
        if (payload.provenance) shell.provenance = payload.provenance;
        return shell;
    }

    function mergeGenerationPersistRows(rows) {
        if (!rows || !rows.length) return;
        if (_genMergeMode === 'append') {
            var shell = ensureGenerationPersistPayloadShell();
            if (!shell) return;
            var normalized = normalizeRowsForColumns(rows, shell.columns);
            shell.rows = shell.rows.concat(normalized);
            if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
                var prov = global.tcProvenanceArrayForStashPayload(normalized.length);
                shell.provenance = (shell.provenance || []).concat(prov || []);
            }
            return;
        }
        resyncGenerationPersistPayloadFromTable();
    }

    function refreshGenerationPersistPayload() {
        if (!_generationPinnedCtx) return null;
        restoreGenerationTableSnapshot();
        var payload = collectPayload();
        if (payload && payload.rows && payload.rows.length) {
            if (_genMergeMode === 'append') {
                var existingRows = _generationPersistPayload && _generationPersistPayload.rows ? _generationPersistPayload.rows.length : 0;
                if (existingRows > payload.rows.length) {
                    _generationPersistPayload.columns = payload.columns;
                    _generationPersistPayload.columnVisible = payload.columnVisible;
                    _generationPersistPayload.columnWidth = payload.columnWidth;
                } else {
                    _generationPersistPayload = payload;
                }
            } else {
                _generationPersistPayload = payload;
            }
        }
        return _generationPersistPayload;
    }


    function sanitizeRequirementCasePayloadForPersist(payload, opts) {
        opts = opts || {};
        if (!payload || !Array.isArray(payload.rows) || !payload.columns || !payload.columns.length) {
            return payload;
        }
        var dedupe = !!opts.dedupe;
        var cleaned = [];
        var seen = {};
        for (var i = 0; i < payload.rows.length; i++) {
            var row = payload.rows[i];
            if (typeof global.tcTableRowHasCaseContent === 'function') {
                if (!global.tcTableRowHasCaseContent(row)) continue;
            } else if (!rowsHaveContent([row], payload.columns.length)) {
                continue;
            }
            if (dedupe) {
                var key = JSON.stringify(row);
                if (seen[key]) continue;
                seen[key] = true;
            }
            cleaned.push(row);
        }
        var out = Object.assign({}, payload, { rows: cleaned });
        if (typeof global.tcNormalizeTableRowsForStorage === 'function') {
            out.rows = global.tcNormalizeTableRowsForStorage(out.rows);
        }
        if (out.provenance && out.provenance.length > cleaned.length) {
            out.provenance = out.provenance.slice(0, cleaned.length);
        }
        return out;
    }

    function rowsHaveContent(rows, colCount) {
        if (!rows || !rows.length) return false;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row) continue;
            for (var j = 0; j < colCount; j++) {
                if (String(row[j] != null ? row[j] : '').trim()) return true;
            }
        }
        return false;
    }

    function collectPayload() {
        if (typeof global.tcSyncTableLayoutBeforeStash === 'function') {
            global.tcSyncTableLayoutBeforeStash();
        }
        if (shouldSkipGridPullForPersist()) {
            return collectPayloadWithoutGridPull();
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (eSync) { /* ignore */ }
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e) { /* ignore */ }
        }
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        if (!rowsHaveContent(rows, cols.length)) return null;
        var payload = {
            scope: 'table',
            columns: cols,
            rows: rows,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(rows.length);
        }
        return payload;
    }

    function shouldApplyLoadForPage(pageId, opts) {
        opts = opts || {};
        pageId = String(pageId || '').trim();
        var target = String(opts.targetPageId || _targetPageId || '').trim();
        if (target && pageId && target !== pageId) return false;
        return true;
    }

    function resetToTemplateChooserState() {
        if (typeof global.isTcRequirementPageGenBusy === 'function' && global.isTcRequirementPageGenBusy()) {
            return;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return;
        }
        if (typeof global.isTcLeftPanelNavLocked === 'function' && global.isTcLeftPanelNavLocked()) {
            return;
        }
        if (typeof global.resetRequirementCaseTableUi === 'function') {
            global.resetRequirementCaseTableUi();
            return;
        }
        if (typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive()) {
            return;
        }
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        }
        global.tcTableTemplateApplied = false;
        global.tcActiveTemplateId = null;
        global.tableColumns = [];
        global.testCasesData = [];
        global.testCasesProvenance = [];
        if (typeof global.tcClearTableLayoutMaps === 'function') {
            global.tcClearTableLayoutMaps();
        } else if (global.columnVisible && global.columnWidth && global.rowHeights) {
            Object.keys(global.columnVisible).forEach(function (k) { delete global.columnVisible[k]; });
            Object.keys(global.columnWidth).forEach(function (k) { delete global.columnWidth[k]; });
            Object.keys(global.rowHeights).forEach(function (k) { delete global.rowHeights[k]; });
        }
        if (global.markedRows) global.markedRows = new Set();
        if (global.selectedRows) global.selectedRows.clear();
        if (typeof global.tcTableResetUndoHistory === 'function') global.tcTableResetUndoHistory();
        if (typeof global.renderTableHeader === 'function') global.renderTableHeader();
        if (typeof global.renderTableBody === 'function') {
            global.renderTableBody({ reload: true });
        }
        if (typeof global.updateRestoreButton === 'function') global.updateRestoreButton();
        if (typeof global.syncTcTableTemplateChrome === 'function') global.syncTcTableTemplateChrome();
        if (typeof global.syncTcRightPanelMeta === 'function') global.syncTcRightPanelMeta();
        if (typeof global.tcTableEnsureHistoryReady === 'function') global.tcTableEnsureHistoryReady();
    }

    function applyPayloadSilent(payload, opts) {
        opts = opts || {};
        if (typeof global.applyRequirementCasePayload === 'function') {
            return global.applyRequirementCasePayload(payload, opts);
        }
        if (!payload || !payload.columns || !payload.columns.length) {
            return Promise.resolve(false);
        }
        return Promise.resolve(false);
    }

    function persistNow(source, opts) {
        opts = opts || {};
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        if (_persistSuspended && !opts.ctx && !opts.forCoverageFill) return Promise.resolve(null);
        var ctx = resolvePersistContext(opts);
        if (!ctx || !ctx.lanhu_url) return Promise.resolve(null);
        if (!ctx.lanhu_page_id) return Promise.resolve(null);
        var payload = opts.payload || collectPayload();
        if (!payload) {
            if (opts.allowEmpty) {
                payload = { scope: 'table', columns: (global.tableColumns || []).slice(), rows: [] };
            } else {
                return Promise.resolve(null);
            }
        }
        if (source === 'generation' || _genMergeMode === 'append') {
            payload = sanitizeRequirementCasePayloadForPersist(payload, {
                dedupe: source === 'generation' || _genMergeMode === 'append'
            });
        }
        var body = {
            lanhu_url: stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url,
            page_id: ctx.lanhu_page_id || undefined,
            page_name: ctx.page_name || '',
            template_id: (source === 'generation' && global.__tcGenerationTableSnapshot &&
                global.__tcGenerationTableSnapshot.tcActiveTemplateId)
                ? global.__tcGenerationTableSnapshot.tcActiveTemplateId
                : (global.tcActiveTemplateId || null),
            payload: payload,
            source: source || 'manual_edit'
        };
        if (_genMergeMode === 'append') {
            body.merge_mode = 'append';
        }
        var _emptyRows = !rowsHaveContent(
            (payload && payload.rows) || [],
            ((payload && payload.columns) || []).length
        );
        if (!_emptyRows && payload && payload.rows && payload.rows.length) {
            try {
                var _san = sanitizeRequirementCasePayloadForPersist(payload || {}, { dedupe: false });
                _emptyRows = !rowsHaveContent((_san && _san.rows) || [], ((payload && payload.columns) || []).length);
            } catch (eEmptySan) { /* keep */ }
        }
        // 空表落库必须带 allow_clear；编辑清空路径会传 forceClear/allowEmpty
        var _allowClear = !!(opts.forceClear || opts.allowClear || opts.allowEmpty);
        if (_emptyRows && !_allowClear) {
            console.warn('[TcRequirementCaseStore] skip empty overwrite (no allow_clear)');
            return Promise.resolve(null);
        }
        if (_emptyRows && _allowClear) {
            body.allow_clear = true;
            body.force_clear = true;
            body.payload = Object.assign({}, payload, { rows: [] });
        }
        return fetch('/api/test-cases/requirement-cases', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (d) {
                if (!r.ok || !d.ok) {
                    console.warn('[TcRequirementCaseStore] save failed', d && d.error);
                    return null;
                }
                // 服务端仍跳过空表覆盖时：补一次强制清空，且不清 dirty
                if (d.saved && d.saved.skipped_empty_overwrite && _emptyRows && !opts._retriedAllowClear) {
                    console.warn('[TcRequirementCaseStore] retry empty clear after skipped_empty_overwrite');
                    return persistNow(source, Object.assign({}, opts, {
                        payload: Object.assign({}, payload, { rows: [] }),
                        forceClear: true,
                        allowClear: true,
                        allowEmpty: true,
                        _retriedAllowClear: true
                    }));
                }
                if (d.saved && d.saved.skipped_empty_overwrite) {
                    console.warn('[TcRequirementCaseStore] empty clear still skipped');
                    return d.saved;
                }
                if (!opts.ctx) clearDirty();
                if (d.saved && window.TcLanhuTreeCaseStatus && typeof window.TcLanhuTreeCaseStatus.markPage === 'function') {
                    window.TcLanhuTreeCaseStatus.markPage(
                        d.saved.lanhu_doc_id,
                        d.saved.lanhu_page_id,
                        parseInt(d.saved.row_count, 10) || 0
                    );
                }
                return d.saved;
            });
        }).catch(function (e) {
            console.warn('[TcRequirementCaseStore] save error', e);
            return null;
        });
    }

    function buildEmptyTablePersistPayload() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var payload = {
            scope: 'table',
            columns: cols,
            rows: [],
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(0);
        }
        return payload;
    }

    /** 用户编辑/删行/清空后的落库：允许空表 forceClear，不影响通用 flushIfDirty 防误覆盖 */
    function flushIfDirtyAfterTableEdit(source, opts) {
        opts = opts || {};
        cancelPendingPersist();
        if (!_dirty && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            clearDirty();
            return Promise.resolve(null);
        }
        return syncTableForPersist().then(function () {
            var payload = opts.payload != null ? opts.payload : collectPayload();
            var persistOpts = { allowEmpty: true };
            if (opts.ctx) persistOpts.ctx = opts.ctx;
            if (!payload) {
                payload = buildEmptyTablePersistPayload();
                if (!payload) {
                    clearDirty();
                    return null;
                }
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.payload = payload;
            } else {
                persistOpts.payload = payload;
                if (!rowsHaveContent(payload.rows, (payload.columns || []).length)) {
                    persistOpts.forceClear = true;
                    persistOpts.allowClear = true;
                }
            }
            return persistNow(source || 'manual_edit', persistOpts);
        });
    }


    /**
     * 删除行 / 清空表格专用落库（新方法，不影响通用 flushIfDirty）。
     * 不从 VXE 回拉行，避免删光后被表格组件把旧行又 pull 回来；
     * 空表时强制 allow_clear。
     */
    function persistAfterTableDeleteOrClear(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        markDirty();
        if (_persistSuspended && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            return Promise.resolve(null);
        }
        cancelPendingPersist();
        var payload = opts.payload != null ? opts.payload : collectPayloadWithoutGridPull();
        var persistOpts = {
            allowEmpty: true,
            forceClear: false,
            allowClear: false
        };
        if (opts.ctx) persistOpts.ctx = opts.ctx;
        if (!payload || !rowsHaveContent(payload.rows, (payload.columns || []).length)) {
            payload = buildEmptyTablePersistPayload();
            if (!payload) {
                // 无表头时无法组空包，仍标记 dirty，切页时再试
                return Promise.resolve(null);
            }
            persistOpts.forceClear = true;
            persistOpts.allowClear = true;
            persistOpts.payload = payload;
        } else {
            persistOpts.payload = payload;
        }
        return persistNow(source, persistOpts);
    }

    function onTableRowsRemoved() {
        return persistAfterTableDeleteOrClear('manual_edit', { force: true });
    }

    function schedulePersistAfterTableEdit(source) {
        /* 退出单元格编辑等表格变更后：防抖落库，避免连改多格时每次都打接口 */
        markDirty();
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        if (!ctx || !ctx.lanhu_page_id) return;
        cancelPendingPersist();
        var src = source || 'manual_edit';
        _debounceTimer = setTimeout(function () {
            _debounceTimer = null;
            flushIfDirtyAfterTableEdit(src).catch(function () { /* ignore */ });
        }, DEBOUNCE_MS);
    }

    function persistDebounced(source) {
        schedulePersistAfterTableEdit(source);
    }

    function flushIfDirty(source, opts) {
        opts = opts || {};
        cancelPendingPersist();
        if (!_dirty && !opts.force) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id) {
            clearDirty();
            return Promise.resolve(null);
        }
        return syncTableForPersist().then(function () {
            var payload = opts.payload != null ? opts.payload : collectPayload();
            var persistOpts = {
                ctx: opts.ctx,
                payload: payload,
                allowEmpty: opts.allowEmpty
            };
            if (!opts.ctx) delete persistOpts.ctx;
            // 缺失 payload 时不要用空表落库，避免覆盖服务端已有用例
            if (!payload) return Promise.resolve(null);
            return persistNow(source || 'manual_edit', persistOpts);
        });
    }


    function collectPayloadForCoverageFillPersist() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        }
        if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e1) { /* ignore */ }
        }
        if (typeof global.tcTablePullRowsFromView === 'function') {
            try { global.tcTablePullRowsFromView(); } catch (e2) { /* ignore */ }
        }
        if (typeof global.tcSyncTableLayoutBeforeStash === 'function') {
            try { global.tcSyncTableLayoutBeforeStash(); } catch (e3) { /* ignore */ }
        }
        return collectPayloadWithoutGridPull();
    }

    function resolvePersistContextForCoverageFill() {
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : resolveContext({});
        if (ctx && ctx.lanhu_page_id) return ctx;
        var pageId = getActiveLanhuPageId();
        if (pageId) {
            ctx = resolveContext({ lanhu_page_id: pageId, page_id: pageId });
            if (ctx && ctx.lanhu_page_id) return ctx;
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var meta = global.getTcLanhuDocTreeMeta() || {};
            pageId = String(meta.selectedId || meta.focusPageId || '').trim();
            if (pageId) {
                ctx = resolveContext({ lanhu_page_id: pageId, page_id: pageId, page_name: meta.selectedPageName || '' });
                if (ctx && ctx.lanhu_page_id) return ctx;
            }
        }
        return ctx;
    }

    function persistAfterCoverageFillInDrawer(opts) {
        opts = opts || {};
        cancelPendingPersist();
        var tableSyncChain = syncTableForPersist();
        if (typeof global.renderTableBody === 'function') {
            tableSyncChain = tableSyncChain.then(function () {
                try {
                    return global.renderTableBody({ reload: true, immediate: true, forceTableSync: true });
                } catch (eRender) {
                    return null;
                }
            });
        }
        return tableSyncChain.then(function () {
            var payload = collectPayloadForCoverageFillPersist();
            if (!payload || !payload.rows || !payload.rows.length) {
                payload = collectPayload();
            }
            if (!payload || !payload.rows || !payload.rows.length) {
                if (!opts.allowEmpty) {
                    console.warn('[TcRequirementCaseStore] coverage fill persist skipped: empty table');
                    return null;
                }
            }
            var ctx = resolvePersistContextForCoverageFill();
            if (!ctx || !ctx.lanhu_url || !ctx.lanhu_page_id) {
                console.warn('[TcRequirementCaseStore] coverage fill persist skipped: missing page context');
                return null;
            }
            markDirty();
            return persistNow('manual_edit', {
                force: true,
                forCoverageFill: true,
                payload: payload,
                allowEmpty: !!opts.allowEmpty,
                ctx: ctx
            });
        }).catch(function (err) {
            console.warn('[TcRequirementCaseStore] coverage fill persist error', err);
            return null;
        });
    }

    function flushDebounced() {
        return flushIfDirty('manual_edit');
    }

    function persistAfterGeneration() {
        var pinnedCtx = _generationPinnedCtx ? normalizeCtx(Object.assign({}, _generationPinnedCtx)) : null;
        var isAppend = _genMergeMode === 'append';
        return (isAppend ? Promise.resolve() : syncTableForPersist()).then(function () {
            if (!isAppend) {
                refreshGenerationPersistPayload();
            } else {
                restoreGenerationTableSnapshot();
                if (typeof global.tcRestoreAppendGenerationBaselineIfNeeded === 'function') {
                    global.tcRestoreAppendGenerationBaselineIfNeeded();
                }
                _generationPersistPayload = buildAppendGenerationPersistPayload();
            }
            var payload = null;
            if (isAppend) {
                payload = (_generationPersistPayload && _generationPersistPayload.rows &&
                    _generationPersistPayload.rows.length)
                    ? _generationPersistPayload
                    : buildAppendGenerationPersistPayload();
            } else {
                payload = collectPayload();
                if (!payload || !payload.rows || !payload.rows.length) {
                    payload = (_generationPersistPayload && _generationPersistPayload.rows &&
                        _generationPersistPayload.rows.length)
                        ? _generationPersistPayload
                        : collectPayload();
                }
            }
            if (!payload || !payload.rows || !payload.rows.length) {
                if (isAppend) {
                    console.warn('[TcRequirementCaseStore] append persist skipped: no payload');
                    return Promise.resolve(null);
                }
            }
            return persistNow('generation', {
                ctx: pinnedCtx,
                payload: payload,
                forGeneration: true,
                forceUrl: false
            });
        }).then(function (saved) {
            if (saved) clearDirty();
            if (saved && saved.lanhu_doc_id && saved.lanhu_page_id) {
                rememberLastPage(saved.lanhu_doc_id, saved.lanhu_page_id);
            }
            if (saved && window.TcLanhuTreeCaseStatus &&
                typeof window.TcLanhuTreeCaseStatus.markPage === 'function') {
                window.TcLanhuTreeCaseStatus.markPage(
                    saved.lanhu_doc_id,
                    saved.lanhu_page_id,
                    parseInt(saved.row_count, 10) || 0
                );
            }
            if (saved && typeof global.tcAppToast === 'function') {
                var savedPageLabel = '';
                if (_generationPinnedCtx && _generationPinnedCtx.page_name) {
                    savedPageLabel = String(_generationPinnedCtx.page_name).trim();
                }
                if (!savedPageLabel && typeof global.getTcLanhuDocTreeMeta === 'function') {
                    var _saveMeta = global.getTcLanhuDocTreeMeta() || {};
                    savedPageLabel = String(_saveMeta.selectedPageName || '').trim();
                }
                var savedToastMsg = savedPageLabel
                    ? ('用例已保存到需求页「' + savedPageLabel + '」')
                    : '用例已保存到需求页';
                global.tcAppToast(savedToastMsg, {
                    variant: 'success',
                    duration: 2400
                });
            }
            return saved;
        }).catch(function (err) {
            if (!tcIsBenignFetchAbort(err)) {
                console.warn('[TcRequirementCaseStore] persistAfterGeneration error', err);
            }
            return null;
        }).finally(function () {
            clearGenerationPinnedContext();
            if (typeof global.clearOptimisticPageGenLock === 'function') {
                try { global.clearOptimisticPageGenLock(); } catch (_eOpt) { /* ignore */ }
            }
            var refreshPromise = Promise.resolve(null);
            if (typeof global.refreshTcPageGenLock === 'function') {
                try {
                    refreshPromise = Promise.resolve(global.refreshTcPageGenLock()).catch(function () {
                        return null;
                    });
                } catch (_eRef) {
                    refreshPromise = Promise.resolve(null);
                }
            }
            /* 落库成功/失败都要解开顶栏交互锁，避免生成结束后按钮一直置灰 */
            function unlockWorkbenchChromeAfterGenerationPersist() {
                try {
                    if (typeof global.setTcLeftPanelAiGenerateLock === 'function') {
                        global.setTcLeftPanelAiGenerateLock(false);
                    }
                } catch (_eLock) { /* ignore */ }
                try {
                    if (global.TcAgentOrchestrator &&
                        typeof global.TcAgentOrchestrator.releaseGenModeLockIfIdle === 'function') {
                        global.TcAgentOrchestrator.releaseGenModeLockIfIdle();
                    }
                } catch (_eAgent) { /* ignore */ }
                if (typeof global.scheduleReleaseWorkbenchInteractionLocks === 'function') {
                    global.scheduleReleaseWorkbenchInteractionLocks();
                } else if (typeof global.syncQcWorkbenchInteractionLock === 'function') {
                    global.syncQcWorkbenchInteractionLock();
                }
                if (typeof global.syncTcQualityCheckButtonChrome === 'function') {
                    try { global.syncTcQualityCheckButtonChrome(); } catch (_eQc) { /* ignore */ }
                }
                if (typeof global.syncTcTableTemplateChrome === 'function') {
                    try { global.syncTcTableTemplateChrome(); } catch (_eTpl) { /* ignore */ }
                }
            }
            unlockWorkbenchChromeAfterGenerationPersist();
            refreshPromise.finally(function () {
                unlockWorkbenchChromeAfterGenerationPersist();
                if (typeof global.setTimeout === 'function') {
                    global.setTimeout(unlockWorkbenchChromeAfterGenerationPersist, 0);
                    global.setTimeout(unlockWorkbenchChromeAfterGenerationPersist, 320);
                }
            });
        });
    }


    function isSamePageWithCasesDisplayed(ctx) {
        if (!ctx) return false;
        var key = buildContextKey(normalizeCtx(ctx));
        if (!key || key !== _lastLoadedKey) return false;
        var pageId = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        return isDisplayedCasesForPage(pageId);
    }

    function getActiveLanhuPageId() {
        return _activeCtx ? String(_activeCtx.lanhu_page_id || _activeCtx.page_id || '').trim() : '';
    }


    function persistActivePageBeforeLeave(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        if (_persistSuspended && !opts.force && !opts.ctx) return Promise.resolve(null);
        if (isGenerationActive() && !opts.force) return Promise.resolve(null);
        if (shouldBlockOverwriteDbPersistDuringGeneration(opts)) return Promise.resolve(null);
        var ctx = opts.ctx || (_activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null);
        if (!ctx || !ctx.lanhu_page_id || !ctx.lanhu_url) {
            return flushIfDirty(source, opts);
        }
        cancelPendingPersist();
        return syncTableForPersist().then(function () {
            var mindPersistChain = Promise.resolve(null);
            if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                typeof global.TcRequirementMindmapStore.persistActivePageBeforeLeave === 'function' && ctx) {
                mindPersistChain = global.TcRequirementMindmapStore.persistActivePageBeforeLeave({ ctx: ctx, source: source });
            }
            return mindPersistChain.then(function () {
            var decision = null;
            if (typeof global.tcTemplateSwitchEvaluateLeavePersist === 'function') {
                try {
                    decision = global.tcTemplateSwitchEvaluateLeavePersist();
                } catch (eEval) { decision = null; }
            }
            var shouldPersist = (decision && decision.shouldPersist) || (_dirty && opts.force);
            if (!shouldPersist && !_dirty) return null;
            if (!shouldPersist && _dirty) shouldPersist = true;
            if (!shouldPersist) return null;
            var leavePayload = decision && decision.payload ? decision.payload : collectPayload();
            var persistOpts = {
                ctx: ctx,
                force: true,
                payload: leavePayload
            };
            // 蓝湖树传入的 allowEmpty 需落到 forceClear，否则空表无法清库
            if (opts.forceClear || opts.allowClear || opts.allowEmpty) {
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            }
            // 用户删光用例后切页：必须带 forceClear；无 dirty 且调用方未允许空表时仍跳过
            if (!leavePayload) {
                if (!_dirty && !opts.forceClear && !opts.allowClear && !opts.allowEmpty) return null;
                leavePayload = buildEmptyTablePersistPayload();
                if (!leavePayload) return null;
                persistOpts.payload = leavePayload;
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            } else if (!rowsHaveContent(leavePayload.rows, (leavePayload.columns || []).length)) {
                if (!_dirty && !opts.forceClear && !opts.allowClear && !opts.allowEmpty) return null;
                persistOpts.forceClear = true;
                persistOpts.allowClear = true;
                persistOpts.allowEmpty = true;
            }
            return persistNow(source, persistOpts).then(function (saved) {
                if (saved && !opts.ctx) clearDirty();
                return saved;
            });
            });
        });
    }


    function switchRequirementPage(pageId, pageName, opts) {
        opts = opts || {};
        pageId = String(pageId || '').trim();
        pageName = pageName || '';
        if (!pageId) return Promise.resolve(false);
        if (typeof global.isTcQualityCheckLanhuNavBlocked === 'function' &&
            global.isTcQualityCheckLanhuNavBlocked()) {
            if (typeof global.toastTcQualityCheckNavBlocked === 'function') {
                global.toastTcQualityCheckNavBlocked();
            }
            return Promise.resolve(false);
        }
        if (typeof global.isTcLanhuRequirementPageSwitchBlocked === 'function' &&
            global.isTcLanhuRequirementPageSwitchBlocked()) {
            if (typeof global.toastTcLanhuRequirementPageSwitchBlocked === 'function') {
                global.toastTcLanhuRequirementPageSwitchBlocked();
            }
            return Promise.resolve(false);
        }

        var url = resolveLanhuBaseUrlForPageLoad(opts);
        if (!url) return Promise.resolve(false);

        cancelPendingPersist();
        var switchToken = ++_pageSwitchToken;
        _targetPageId = pageId;
        _persistSuspended = true;

        var prevCtx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        var prevPageIdForQc = prevCtx ? String(prevCtx.lanhu_page_id || prevCtx.page_id || '').trim() : '';
        var prevKey = prevCtx ? buildContextKey(prevCtx) : '';
        var nextCtx = resolveContext({
            page_id: pageId,
            page_name: pageName,
            forceUrl: true,
            lanhu_url: url
        });
        if (!nextCtx) {
            _persistSuspended = false;
            return Promise.resolve(false);
        }

        var nextKey = buildContextKey(nextCtx);
        if (prevKey && nextKey === prevKey && isSamePageWithCasesDisplayed(nextCtx)) {
            _persistSuspended = false;
            _targetPageId = pageId;
            return Promise.resolve(true);
        }
        if (prevKey && nextKey && prevKey !== nextKey && typeof global.tcTemplateSwitchClearPageSession === 'function') {
            global.tcTemplateSwitchClearPageSession(prevKey);
        }
        var leavingPrev = prevCtx && prevKey && prevCtx.lanhu_page_id && prevKey !== nextKey;

        if (_loadAbort) {
            try { _loadAbort.abort(); } catch (eAbort) { /* ignore */ }
            _loadAbort = null;
        }

        function continuePageSwitchAfterLeavePersist() {
            if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                typeof global.TcRequirementMindmapStore.clearSessionForPageSwitch === 'function') {
                global.TcRequirementMindmapStore.clearSessionForPageSwitch();
            }
            if (!opts.showTableLoading) {
                resetToTemplateChooserState();
            }
            _lastLoadedKey = '';

            if (opts.showTableLoading && typeof global.showTablePageLoading === 'function') {
                global.showTablePageLoading();
            }
            if (opts.showTableLoading && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('table');
            }

            setActiveContext(nextCtx);
            if (nextCtx.lanhu_doc_id && nextCtx.lanhu_page_id) {
                rememberLastPage(nextCtx.lanhu_doc_id, nextCtx.lanhu_page_id);
            }
            var mainUrl = document.getElementById('lanhu-url');
            if (mainUrl && nextCtx.lanhu_url) mainUrl.value = nextCtx.lanhu_url;

            return loadForContext(nextCtx, {
                force: true,
                fromPageSwitch: true,
                switchToken: switchToken,
                targetPageId: pageId
            }).then(function (loaded) {
                if (typeof global.tcQcPageSessionOnPageSwitch === 'function') {
                    global.tcQcPageSessionOnPageSwitch(prevPageIdForQc, pageId);
                }
                return loaded;
            }).finally(function () {
                if (switchToken === _pageSwitchToken) {
                    _persistSuspended = false;
                }
            });
        }

        if (leavingPrev) {
            return persistActivePageBeforeLeave('manual_edit', { ctx: prevCtx, force: true })
                .catch(function () { return null; })
                .then(continuePageSwitchAfterLeavePersist);
        }

        return continuePageSwitchAfterLeavePersist();
    }

    function loadForContext(ctx, opts) {
        opts = opts || {};
        ctx = ctx || resolveContext({});
        if (!ctx || !ctx.lanhu_url) return Promise.resolve(false);
        var key = buildContextKey(ctx);
        if (!opts.force && key && key === _lastLoadedKey) return Promise.resolve(false);
        if (_loadAbort) {
            try { _loadAbort.abort(); } catch (eAbort2) { /* ignore */ }
        }
        _loadAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var fetchSignal = _loadAbort ? _loadAbort.signal : undefined;
        _loading = true;
        var reqPageId = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        if (!reqPageId) {
            _loading = false;
            if (opts.fromPageSwitch) resetToTemplateChooserState();
            return Promise.resolve(false);
        }
        var seq = ++_loadSeq;
        var apiBaseUrl = stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url;
        var q = '/api/test-cases/requirement-cases?lanhu_url=' +
            encodeURIComponent(apiBaseUrl) +
            '&page_id=' + encodeURIComponent(reqPageId) +
            '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store', signal: fetchSignal })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (seq !== _loadSeq) return false;
                if (!shouldApplyLoadForPage(reqPageId, opts)) return false;
                if (!d.ok || !d.found || !d.data || !d.data.payload) {
                    if (opts.fromPageSwitch && shouldApplyLoadForPage(reqPageId, opts)) {
                        resetToTemplateChooserState();
                    }
                    if (opts.fromPageSwitch && typeof global.TcRequirementMindmapStore !== 'undefined' &&
                        typeof global.TcRequirementMindmapStore.onTablePageLoaded === 'function') {
                        global.TcRequirementMindmapStore.onTablePageLoaded(ctx);
                    }
                    return false;
                }
                var respPageId = String(d.data.lanhu_page_id || reqPageId || '').trim();
                if (respPageId && respPageId !== reqPageId) {
                    return false;
                }
                setActiveContext({
                    lanhu_url: d.data.lanhu_url || ctx.lanhu_url,
                    lanhu_pid: d.data.lanhu_pid,
                    lanhu_doc_id: d.data.lanhu_doc_id,
                    lanhu_page_id: d.data.lanhu_page_id || reqPageId,
                    requirement_id: d.data.requirement_id,
                    page_name: d.data.page_name || ctx.page_name
                });
                var loadedTemplateId = d.data.template_id ? String(d.data.template_id) : '';
                return applyPayloadSilent(d.data.payload, { templateId: loadedTemplateId || undefined }).then(function (ok) {
                    if (!ok || !shouldApplyLoadForPage(reqPageId, opts)) return false;
                    if (loadedTemplateId) {
                        if (typeof global.setTcActiveTemplateId === 'function') {
                            global.setTcActiveTemplateId(loadedTemplateId);
                        } else {
                            global.tcActiveTemplateId = loadedTemplateId;
                        }
                    }
                    if (loadedTemplateId && typeof global.tcTemplateSwitchRecordBaseline === 'function') {
                        global.setTimeout(function () {
                            global.tcTemplateSwitchRecordBaseline(loadedTemplateId);
                        }, 150);
                    }
                    if (typeof global.TcRequirementMindmapStore !== 'undefined' &&
                        typeof global.TcRequirementMindmapStore.onTablePageLoaded === 'function') {
                        global.TcRequirementMindmapStore.onTablePageLoaded({
                            lanhu_url: d.data.lanhu_url || ctx.lanhu_url,
                            lanhu_pid: d.data.lanhu_pid,
                            lanhu_doc_id: d.data.lanhu_doc_id,
                            lanhu_page_id: d.data.lanhu_page_id || reqPageId,
                            requirement_id: d.data.requirement_id,
                            page_name: d.data.page_name || ctx.page_name
                        });
                    }
                    clearDirty();
                    _lastLoadedKey = key;
                    _targetPageId = reqPageId;
                    if (typeof global.tcAppToast === 'function') {
                        var pn = d.data.page_name || ctx.page_name || '';
                        var hint = pn ? ('「' + pn + '」') : ('pageId=' + (d.data.lanhu_page_id || ctx.lanhu_page_id || ''));
                        global.tcAppToast('已加载该需求页历史用例 ' + hint, { variant: 'info', duration: 2200 });
                    }
                    // 页面切换后如存在待处理的生成请求且模板已从历史数据恢复，继续弹窗
                    if (global._tcPendingPageGenAfterTemplate && global.tcTableTemplateApplied) {
                        var pending = global._tcPendingPageGenAfterTemplate;
                        global._tcPendingPageGenAfterTemplate = null;
                        var pendingPageId = String(pending.pageId || '').trim();
                        if (!pendingPageId || pendingPageId === reqPageId) {
                            setTimeout(function () {
                                if (typeof global.openTcPageGenModal === 'function') {
                                    global.openTcPageGenModal(pending.pageId, pending.pageName);
                                }
                            }, 0);
                        }
                    }
                    return ok;
                });
            })
            .catch(function (err) {
                if (tcIsBenignFetchAbort(err)) return false;
                return false;
            })
            .finally(function () {
                _loading = false;
                if (opts.fromPageSwitch && typeof global.hideTablePageLoading === 'function') {
                    var st = opts.switchToken;
                    if (st == null || st === _pageSwitchToken) {
                        global.hideTablePageLoading();
                    }
                }
            });
    }

    function onPageSelected(pageId, pageName, opts) {
        return switchRequirementPage(pageId, pageName, opts);
    }

    function onTableMutation() {
        schedulePersistAfterTableEdit('manual_edit');
    }

    function hydrateSelectedPageCases(pageId, pageName, opts) {
        opts = opts || {};
        return switchRequirementPage(pageId, pageName, {
            lanhu_url: opts.lanhu_url,
            forceUrl: opts.forceUrl
        });
    }


    function persistBeforePageLeave() {
        if (_persistSuspended) return;
        if (isGenerationActive()) return;
        if (shouldBlockOverwriteDbPersistDuringGeneration()) return;
        var ctx = _activeCtx ? normalizeCtx(Object.assign({}, _activeCtx)) : null;
        if (!ctx || !ctx.lanhu_page_id) return;
        var shouldPersist = _dirty;
        var evaluatedPayload = null;
        if (typeof global.tcTemplateSwitchEvaluateLeavePersist === 'function') {
            try {
                if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
                    global.TcTableBridge.commitAll();
                }
                var decision = global.tcTemplateSwitchEvaluateLeavePersist();
                if (decision && decision.shouldPersist) {
                    shouldPersist = true;
                    evaluatedPayload = decision.payload;
                }
            } catch (eEvalLeave) { /* ignore */ }
        }
        if (!shouldPersist) return;
        cancelPendingPersist();
        try {
            if (!evaluatedPayload && global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
                global.TcTableBridge.commitAll();
            }
        } catch (eCommit) { /* ignore */ }
        var payload = evaluatedPayload || collectPayload();
        var allowClear = false;
        if (!payload || !payload.rows || !payload.rows.length) {
            // 仅在确有未保存变更（例如用户清空全部用例）时允许空表落库
            if (!_dirty) return;
            payload = buildEmptyTablePersistPayload();
            if (!payload) return;
            allowClear = true;
        } else if (!rowsHaveContent(payload.rows, (payload.columns || []).length)) {
            if (!_dirty) return;
            allowClear = true;
        }
        var body = {
            lanhu_url: stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url,
            page_id: ctx.lanhu_page_id || undefined,
            page_name: ctx.page_name || '',
            template_id: (typeof global.getTcActiveTemplateId === 'function'
                ? global.getTcActiveTemplateId()
                : null) || global.tcActiveTemplateId || null,
            payload: payload,
            source: 'manual_edit'
        };
        if (allowClear) {
            body.allow_clear = true;
        }
        try {
            fetch('/api/test-cases/requirement-cases', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                keepalive: true,
                body: JSON.stringify(body)
            }).catch(function () { /* ignore leave persist */ });
            clearDirty();
        } catch (eLeave) { /* ignore */ }
    }


    function tcBindBenignFetchAbortGuard() {
        if (global._tcBenignFetchAbortGuardBound) return;
        global._tcBenignFetchAbortGuardBound = true;
        global.addEventListener('unhandledrejection', function (ev) {
            if (tcIsBenignFetchAbort(ev && ev.reason)) {
                ev.preventDefault();
            }
        });
    }

    function initLeaveHandlers() {
        if (global._tcReqCaseLeaveBound) return;
        global._tcReqCaseLeaveBound = true;
        global.addEventListener('pagehide', persistBeforePageLeave);
        global.addEventListener('beforeunload', persistBeforePageLeave);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                persistActivePageBeforeLeave('manual_edit', { force: true })
                    .catch(function () { /* ignore */ });
            }
        });
    }
    tcBindBenignFetchAbortGuard();
    initLeaveHandlers();

    global.restoreGenerationTableSnapshot = restoreGenerationTableSnapshot;

    global.tcIsBenignFetchAbort = tcIsBenignFetchAbort;

    global.TcRequirementCaseStore = {
        captureGenerationContext: captureGenerationContext,
        clearGenerationPinnedContext: clearGenerationPinnedContext,
        isWorkbenchGenerationStreamBusy: isWorkbenchGenerationStreamBusy,
        isWorkbenchGenerationInterruptible: isWorkbenchGenerationInterruptible,
        abortAndRollbackWorkbenchGeneration: abortAndRollbackWorkbenchGeneration,
        abortGenerationAndRestoreTable: abortGenerationAndRestoreTable,
        restoreGenerationTableSnapshot: restoreGenerationTableSnapshot,
        refreshGenerationPersistPayload: refreshGenerationPersistPayload,
        mergeGenerationPersistRows: mergeGenerationPersistRows,
        getGenerationPinnedPageId: getGenerationPinnedPageId,
        setActiveContext: setActiveContext,
        resolveContext: resolveContext,
        persistAfterCoverageFillInDrawer: persistAfterCoverageFillInDrawer,
        persistAfterGeneration: persistAfterGeneration,
        persistDebounced: persistDebounced,
        schedulePersistAfterTableEdit: schedulePersistAfterTableEdit,
        flushIfDirtyAfterTableEdit: flushIfDirtyAfterTableEdit,
        buildEmptyTablePersistPayload: buildEmptyTablePersistPayload,
        persistAfterTableDeleteOrClear: persistAfterTableDeleteOrClear,
        onTableRowsRemoved: onTableRowsRemoved,
        persistNow: persistNow,
        flushDebounced: flushDebounced,
        flushIfDirty: flushIfDirty,
        persistActivePageBeforeLeave: persistActivePageBeforeLeave,
        isDirty: function () { return _dirty; },
        isLoading: function () { return _loading; },
        loadForContext: loadForContext,
        onPageSelected: onPageSelected,
        onTableMutation: onTableMutation,
        applyPayloadSilent: applyPayloadSilent,
        hydrateSelectedPageCases: hydrateSelectedPageCases,
        switchRequirementPage: switchRequirementPage,
        cancelPendingPersist: cancelPendingPersist,
        getActiveLanhuPageId: getActiveLanhuPageId,
        isDisplayedCasesForPage: isDisplayedCasesForPage,
        rememberLastPage: rememberLastPage,
        readLastPage: readLastPage
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tc_requirement_mindmap_store.js ---- */
/**
 * TestHub — 按蓝湖需求页持久化思维导图（user + doc + page），与表格 store 隔离。
 */
(function tcRequirementMindmapStoreModule(global) {
    'use strict';

    var _cachedByKey = {};
    var _loadSeqByKey = {};
    var _activeKey = '';

    function getCaseStore() {
        return global.TcRequirementCaseStore || null;
    }

    function resolveCtx(extra) {
        var store = getCaseStore();
        if (store && typeof store.resolveContext === 'function') {
            return store.resolveContext(extra || {});
        }
        return null;
    }


    function normalizeCtxForMindmap(ctx) {
        var store = getCaseStore();
        if (store && typeof store.resolveContext === 'function') {
            if (ctx && ctx.lanhu_url) {
                return store.resolveContext(Object.assign({}, ctx));
            }
            return store.resolveContext({});
        }
        return ctx || null;
    }

    function buildContextKey(ctx) {
        if (!ctx) return '';
        var pid = String(ctx.lanhu_pid || '').trim();
        var doc = String(ctx.lanhu_doc_id || '').trim();
        var page = String(ctx.lanhu_page_id || ctx.page_id || '').trim();
        if (!doc || !page) return '';
        return pid + '|' + doc + '|' + page;
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

    function mindmapHasPersistableContent() {
        if (typeof global.tcMindmapStashHasContent === 'function') {
            return !!global.tcMindmapStashHasContent();
        }
        if (typeof global.collectTcMindmapStashPayload === 'function') {
            try {
                var payload = global.collectTcMindmapStashPayload();
                if (payload && Array.isArray(payload.rows) && payload.rows.length) return true;
                if (payload && payload.mind && typeof global.tcMindmapStashMindHasUserNodes === 'function') {
                    return global.tcMindmapStashMindHasUserNodes(payload.mind);
                }
            } catch (e0) { /* ignore */ }
        }
        return false;
    }


    function mindmapHasRestorableMindInMemory() {
        if (typeof global.tcMindmapStashMindHasUserNodes === 'function') {
            var ext = global.tcMindmapExternalMindData || global.tcMindmapCommittedExternalMind;
            return global.tcMindmapStashMindHasUserNodes(ext);
        }
        var ext2 = global.tcMindmapExternalMindData || global.tcMindmapCommittedExternalMind;
        if (!ext2 || !ext2.data) return false;
        var ch = ext2.data.children;
        return Array.isArray(ch) && ch.length > 0;
    }

    function mindmapNeedsDbRestore() {
        return !mindmapHasRestorableMindInMemory();
    }

    function collectMindmapPayload() {
        if (typeof global.collectTcMindmapStashPayload !== 'function') return null;
        try {
            var payload = global.collectTcMindmapStashPayload();
            if (!payload || !payload.columns || !payload.columns.length) return null;
            payload.scope = 'mindmap';
            return payload;
        } catch (e1) {
            return null;
        }
    }

    function cloneMind(mind) {
        if (!mind) return null;
        try {
            return JSON.parse(JSON.stringify(mind));
        } catch (e2) {
            return null;
        }
    }

    function applyRequirementMindmapPayload(payload, opts) {
        opts = opts || {};
        if (!payload || !Array.isArray(payload.columns) || !payload.columns.length) return false;
        if (typeof global.isTcWorkbenchGenerationActive === 'function' && global.isTcWorkbenchGenerationActive()) {
            return false;
        }

        var cols = payload.columns.map(function (c) { return String(c); });
        var rawRows = Array.isArray(payload.rows) ? payload.rows : [];
        var rows = rawRows.map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(Array.isArray(row) && row[i] != null ? String(row[i]) : '');
            }
            return out;
        });

        global.tableColumns = cols;
        global.tcTableTemplateApplied = true;
        if (typeof global.tcApplyStashTemplateMetaFromPayload === 'function') {
            global.tcApplyStashTemplateMetaFromPayload(payload);
        }
        global.tcMindmapCasesData = rows.map(function (r) { return r.slice(); });
        if (typeof global.tcProvenanceArrayFromStashPayload === 'function') {
            global.tcMindmapCasesProvenance = global.tcProvenanceArrayFromStashPayload(payload, rows.length);
        }
        if (typeof global.tcEnsureMindmapProvenanceLength === 'function') {
            global.tcEnsureMindmapProvenanceLength();
        }

        if (payload.rootTopic) global.tcMindmapRootTopic = String(payload.rootTopic);

        var mindClone = cloneMind(payload.mind);
        if (mindClone && mindClone.data) {
            global.tcMindmapExternalMindData = mindClone;
            global.tcMindmapCommittedExternalMind = cloneMind(mindClone);
            if (typeof global.window !== 'undefined') {
                global.window.tcMindmapExternalMindData = global.tcMindmapExternalMindData;
                global.window.tcMindmapCommittedExternalMind = global.tcMindmapCommittedExternalMind;
            }
        } else if (typeof global.buildTcMindmapMindData === 'function') {
            var built = global.buildTcMindmapMindData();
            global.tcMindmapExternalMindData = built;
            global.tcMindmapCommittedExternalMind = cloneMind(built);
            if (typeof global.window !== 'undefined') {
                global.window.tcMindmapExternalMindData = built;
                global.window.tcMindmapCommittedExternalMind = global.tcMindmapCommittedExternalMind;
            }
        }

        global.tcMindmapPendingViewTransform = payload.viewTransform || null;
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapHistory = [];
        global.tcMindmapHistoryIndex = 0;
        global.tcMindmapUndoStack = [];

        if (typeof global.tcSyncWorkbenchGlobals === 'function') global.tcSyncWorkbenchGlobals();

        if (!opts.deferRender) {
            var onMindmapView = typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap';
            if (!opts.skipViewSwitch && typeof global.switchTcRightView === 'function') {
                global.switchTcRightView('mindmap');
                onMindmapView = true;
            } else if (onMindmapView) {
                if (typeof global.tcMindmapReleaseInstance === 'function') global.tcMindmapReleaseInstance();
                if (typeof global.tcMindmapRenderWhenReady === 'function') {
                    global.tcMindmapRenderWhenReady();
                } else if (typeof global.renderTcMindmap === 'function') {
                    global.renderTcMindmap();
                }
            }
        }

        if (typeof global.tcMindmapPersistCache === 'function') {
            global.setTimeout(function () { global.tcMindmapPersistCache(); }, 200);
        }
        return true;
    }

    function clearSessionForPageSwitch() {
        _activeKey = '';
        global.tcMindmapCasesData = [];
        if (typeof global.tcMindmapCasesProvenance !== 'undefined') global.tcMindmapCasesProvenance = [];
        global.tcMindmapExternalMindData = null;
        global.tcMindmapCommittedExternalMind = null;
        if (typeof global.window !== 'undefined') {
            global.window.tcMindmapExternalMindData = null;
            global.window.tcMindmapCommittedExternalMind = null;
        }
        global.tcMindmapSkipCacheRestore = true;
        global.tcMindmapCachedMindPayload = null;
        if (typeof global.tcMindmapClearCache === 'function') global.tcMindmapClearCache();
        if (typeof global.tcMindmapReleaseInstance === 'function') global.tcMindmapReleaseInstance();
    }

    function prefetchForContext(ctx) {
        ctx = normalizeCtxForMindmap(ctx);
        var key = buildContextKey(ctx);
        if (!ctx || !key || !ctx.lanhu_url || !ctx.lanhu_page_id) {
            return Promise.resolve(false);
        }
        _activeKey = key;
        var seq = (_loadSeqByKey[key] || 0) + 1;
        _loadSeqByKey[key] = seq;
        var apiBaseUrl = stripPageIdFromLanhuUrl(ctx.lanhu_url) || ctx.lanhu_url;
        var q = '/api/test-cases/requirement-mindmaps?lanhu_url=' +
            encodeURIComponent(apiBaseUrl) +
            '&page_id=' + encodeURIComponent(String(ctx.lanhu_page_id)) +
            '&_ts=' + Date.now();
        return fetch(q, { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (_loadSeqByKey[key] !== seq) return false;
                if (!d.ok || !d.found || !d.data || !d.data.payload) {
                    delete _cachedByKey[key];
                    return false;
                }
                _cachedByKey[key] = {
                    payload: d.data.payload,
                    templateId: d.data.template_id ? String(d.data.template_id) : '',
                    updatedAt: d.data.updated_at || ''
                };
                return true;
            })
            .catch(function () { return false; });
    }

    function tryApplyCachedForContext(ctx, opts) {
        opts = opts || {};
        ctx = normalizeCtxForMindmap(ctx);
        var key = buildContextKey(ctx);
        if (!key) return false;
        var cached = _cachedByKey[key];
        if (!cached || !cached.payload) return false;
        if (!opts.force && mindmapHasRestorableMindInMemory()) return false;
        var applied = applyRequirementMindmapPayload(cached.payload, {
            skipViewSwitch: true,
            deferRender: opts.deferRender !== false
        });
        if (applied) _activeKey = key;
        return applied;
    }

    function tryApplyCachedForActivePage(opts) {
        return tryApplyCachedForContext(null, opts || {});
    }


    function ensureLoadedForActivePage(opts) {
        opts = opts || {};
        if (tryApplyCachedForActivePage(opts)) return Promise.resolve(true);
        var ctx = normalizeCtxForMindmap(null);
        return prefetchForContext(ctx).then(function (found) {
            if (!found) return false;
            if (tryApplyCachedForContext(ctx, opts)) return true;
            return tryApplyCachedForContext(ctx, Object.assign({}, opts, { force: true }));
        });
    }

    function persistNow(source, opts) {
        opts = opts || {};
        source = source || 'manual_edit';
        var ctx = opts.ctx || resolveCtx({});
        var key = buildContextKey(ctx);
        if (!ctx || !key || !ctx.lanhu_url || !ctx.lanhu_page_id) return Promise.resolve(null);
        if (!mindmapHasPersistableContent()) return Promise.resolve(null);

        if (typeof global.tcMindmapSyncExternalMindFromInstance === 'function') {
            global.tcMindmapSyncExternalMindFromInstance();
        }
        var payload = collectMindmapPayload();
        if (!payload) return Promise.resolve(null);

        var body = {
            lanhu_url: ctx.lanhu_url,
            page_id: ctx.lanhu_page_id,
            lanhu_page_id: ctx.lanhu_page_id,
            page_name: ctx.page_name || '',
            template_id: (typeof global.tcActiveTemplateId !== 'undefined' ? global.tcActiveTemplateId : null),
            source: source,
            payload: payload
        };
        return fetch('/api/test-cases/requirement-mindmaps', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d.ok) return null;
                _cachedByKey[key] = {
                    payload: payload,
                    templateId: body.template_id ? String(body.template_id) : '',
                    updatedAt: (d.saved && d.saved.updated_at) || ''
                };
                _activeKey = key;
                return d.saved || null;
            })
            .catch(function () { return null; });
    }

    function persistActivePageBeforeLeave(opts) {
        opts = opts || {};
        return persistNow(opts.source || 'manual_edit', { ctx: opts.ctx });
    }

    function persistAfterAiConvert() {
        return persistNow('ai_table_convert', {});
    }

    /** 表格视图加载钩子：不预取思维导图（仅在切到思维导图 Tab 时 loadForMindmapTabView 请求） */
    function onTablePageLoaded(ctx) {
        return Promise.resolve(false);
    }

    /**
     * 仅在用户切换到思维导图 Tab 时调用：按需请求接口并 hydrate 内存（不切换视图、不渲染）。
     */
    function loadForMindmapTabView(opts) {
        opts = opts || {};
        if (!opts.force && mindmapHasRestorableMindInMemory()) {
            return Promise.resolve(true);
        }
        var ctx = normalizeCtxForMindmap(null);
        if (!ctx) return Promise.resolve(false);
        return prefetchForContext(ctx).then(function (found) {
            if (!found) return false;
            if (tryApplyCachedForContext(ctx, {
                deferRender: opts.deferRender !== false,
                force: true
            })) {
                return true;
            }
            return false;
        });
    }

    global.TcRequirementMindmapStore = {
        buildContextKey: buildContextKey,
        clearSessionForPageSwitch: clearSessionForPageSwitch,
        prefetchForContext: prefetchForContext,
        tryApplyCachedForActivePage: tryApplyCachedForActivePage,
        tryApplyCachedForContext: tryApplyCachedForContext,
        mindmapHasRestorableMindInMemory: mindmapHasRestorableMindInMemory,
        mindmapNeedsDbRestore: mindmapNeedsDbRestore,
        applyRequirementMindmapPayload: applyRequirementMindmapPayload,
        persistNow: persistNow,
        persistActivePageBeforeLeave: persistActivePageBeforeLeave,
        persistAfterAiConvert: persistAfterAiConvert,
        onTablePageLoaded: onTablePageLoaded,
        loadForMindmapTabView: loadForMindmapTabView,
        ensureLoadedForActivePage: ensureLoadedForActivePage
    };
})(typeof window !== 'undefined' ? window : globalThis);

/* ---- tc_table_boot_loading.js ---- */
/**
 * 用例工作台首次进入/刷新：在文档树与用例状态恢复完成前，右侧表格展示 boot loading，
 * 避免短暂闪现「选择模板」。与页面切换 loading（showTablePageLoading）隔离。
 */
(function tcTableBootLoadingModule() {
    'use strict';

    var global = window;
    var _pending = false;
    var _finished = false;
    var _safetyTimer = null;

    function getPanel() {
        return document.getElementById('tc-table-list-panel');
    }

    function clearSafetyTimer() {
        if (_safetyTimer) {
            clearTimeout(_safetyTimer);
            _safetyTimer = null;
        }
    }

    function armBootSafetyTimer() {
        clearSafetyTimer();
        _safetyTimer = setTimeout(function () {
            finishTcTableBootHydrate();
        }, 30000);
    }

    function beginTcTableBootHydrate() {
        if (_finished) return;
        _pending = true;
        armBootSafetyTimer();
        syncTcTableBootLoadingChrome(false);
    }

    function finishTcTableBootHydrate() {
        if (_finished) return;
        _finished = true;
        _pending = false;
        clearSafetyTimer();
        var panel = getPanel();
        if (panel) {
            panel.classList.remove('tc-table-list-panel--boot-loading');
            panel.classList.add('tc-table-boot-ready');
        }
        if (typeof global.syncTcTableTemplateChrome === 'function') {
            global.syncTcTableTemplateChrome();
        }
    }

    function isTcTableBootHydratePending() {
        return (_pending || isDomBootLoading()) && !_finished;
    }

    function isDomBootLoading() {
        var panel = getPanel();
        return !!(panel && panel.classList.contains('tc-table-list-panel--boot-loading'));
    }

    function syncTcTableBootLoadingChrome(applied) {
        var panel = getPanel();
        if (!panel) return;
        if (_finished) {
            panel.classList.remove('tc-table-list-panel--boot-loading');
            return;
        }
        if (applied) {
            finishTcTableBootHydrate();
            return;
        }
        if (!_pending && !isDomBootLoading()) return;
        _pending = true;
        panel.classList.add('tc-table-list-panel--boot-loading');
    }

    function bootstrapWorkbenchBootLoading() {
        if (_finished || !document.querySelector('.tc-workbench-scope')) return;
        var panel = getPanel();
        if (!panel) return;
        _pending = true;
        panel.classList.add('tc-table-list-panel--boot-loading');
        armBootSafetyTimer();
    }

    global.beginTcTableBootHydrate = beginTcTableBootHydrate;
    global.finishTcTableBootHydrate = finishTcTableBootHydrate;
    global.isTcTableBootHydratePending = isTcTableBootHydratePending;
    global.syncTcTableBootLoadingChrome = syncTcTableBootLoadingChrome;

    bootstrapWorkbenchBootLoading();
})();

/* ---- tc_template_switch_session.js ---- */
/**
 * 需求页内模板切换会话缓存：切走前保存快照，切回时恢复；若在其它模板上生成/加行则作废其它模板缓存。
 * 隔离模块，不影响需求页切换持久化与其它工作台逻辑。
 */
(function (global) {
    'use strict';

    var _sessions = {};

    function getPageKey() {
        var store = global.TcRequirementCaseStore;
        if (store && typeof store.resolveContext === 'function') {
            try {
                var ctx = store.resolveContext({});
                if (ctx) {
                    return [
                        String(ctx.lanhu_pid || ''),
                        String(ctx.lanhu_doc_id || ''),
                        String(ctx.lanhu_page_id || ctx.page_id || '')
                    ].join(':');
                }
            } catch (eCtx) { /* ignore */ }
        }
        if (store && typeof store.getActiveLanhuPageId === 'function') {
            var activePage = String(store.getActiveLanhuPageId() || '').trim();
            if (activePage) {
                var docId = '';
                if (typeof global.getTcLanhuDocTreeMeta === 'function') {
                    var meta = global.getTcLanhuDocTreeMeta() || {};
                    docId = String(meta.docId || meta.doc_id || '');
                }
                return ['', docId, activePage].join(':');
            }
        }
        if (typeof global.getTcLanhuDocTreeMeta === 'function') {
            var m = global.getTcLanhuDocTreeMeta() || {};
            var pageId = String(m.selectedId || m.focusPageId || m.pageId || '').trim();
            var doc = String(m.docId || m.doc_id || '').trim();
            if (pageId || doc) {
                return ['', doc, pageId].join(':');
            }
        }
        return '__workbench__';
    }

    function ensureBucket(pageKey) {
        if (!_sessions[pageKey]) {
            _sessions[pageKey] = { byTemplate: {} };
        }
        return _sessions[pageKey];
    }



    function ensureBaselines(pageKey) {
        var bucket = ensureBucket(pageKey);
        if (!bucket.baselines) bucket.baselines = {};
        return bucket.baselines;
    }

    function payloadFingerprint(payload) {
        if (!payload || !payload.columns) return '';
        try {
            return JSON.stringify({
                columns: (payload.columns || []).map(String),
                rows: (payload.rows || []).map(function (row) {
                    return (row || []).map(function (cell) { return String(cell != null ? cell : ''); });
                })
            });
        } catch (eFp) {
            return '';
        }
    }

    function getTemplateBaselineKey(pageKey, templateId) {
        if (!pageKey || !templateId) return null;
        var baselines = ensureBaselines(pageKey);
        return baselines[templateId] != null ? baselines[templateId] : null;
    }

    function setTemplateBaselineKey(pageKey, templateId, payload) {
        if (!pageKey || !templateId || !payload) return;
        ensureBaselines(pageKey)[templateId] = payloadFingerprint(payload);
    }

    function tcTemplateSwitchRecordBaseline(templateId, opts) {
        opts = opts || {};
        templateId = templateId ? String(templateId) : resolveCurrentTemplateIdForSwitch();
        if (!templateId) return;
        if (!opts.skipCommit) commitTableForSnapshot();
        var payload = opts.payload || collectTemplateSwitchPayload();
        if (!payload) return;
        setTemplateBaselineKey(getPageKey(), templateId, payload);
    }

    function tcTemplateSwitchPersistPayload(payload) {
        if (!hasTemplateSwitchPersistContext()) return Promise.resolve(null);
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.persistNow !== 'function') return Promise.resolve(null);
        try {
            return store.persistNow('manual_edit', { force: true, payload: payload });
        } catch (ePersist) {
            return Promise.resolve(null);
        }
    }

    function tcTemplateSwitchAfterApply(templateId) {
        templateId = templateId ? String(templateId) : '';
        if (!templateId) return;
        var record = function () {
            tcTemplateSwitchRecordBaseline(templateId, { skipCommit: true });
        };
        if (typeof global.setTimeout === 'function') {
            global.setTimeout(record, 150);
        } else {
            record();
        }
    }


    function isTemplateSwitchSourceReady() {
        var cols = global.tableColumns || [];
        if (!cols.length) return false;
        if (global.tcTableTemplateApplied) return true;
        if (global.tcActiveTemplateId) return true;
        return true;
    }

    function mergeTemplateSwitchRowsPreservingCount(beforeRows, afterRows, cols) {
        var merged = (beforeRows || []).map(function (row) {
            return cols.map(function (_, i) {
                return String(row && row[i] != null ? row[i] : '');
            });
        });
        var after = afterRows || [];
        var overlap = Math.min(merged.length, after.length);
        for (var ri = 0; ri < overlap; ri++) {
            for (var ci = 0; ci < cols.length; ci++) {
                var v = after[ri] && after[ri][ci];
                if (String(v != null ? v : '').trim() !== '') {
                    merged[ri][ci] = String(v);
                }
            }
        }
        if (after.length > merged.length) {
            for (var j = merged.length; j < after.length; j++) {
                merged.push(cols.map(function (_, ci) {
                    return String(after[j] && after[j][ci] != null ? after[j][ci] : '');
                }));
            }
        }
        return merged;
    }

    function commitTableForSnapshot() {
        if (global.TcTableBridge && typeof global.TcTableBridge.commitAll === 'function') {
            try { global.TcTableBridge.commitAll(); } catch (e0) { /* ignore */ }
        } else if (global.TcTableView && typeof global.TcTableView.pullRows === 'function') {
            try { global.TcTableView.pullRows(); } catch (e1) { /* ignore */ }
        }
    }

    function rowHasCaseContent(row, colCount) {
        if (typeof global.tcTableRowHasCaseContent === 'function') {
            return global.tcTableRowHasCaseContent(row);
        }
        if (!row) return false;
        for (var i = 0; i < colCount; i++) {
            if (String(row[i] != null ? row[i] : '').trim()) return true;
        }
        return false;
    }

    function payloadHasCaseContent(payload) {
        if (!payload || !payload.columns || !payload.columns.length) return false;
        var cols = payload.columns.length;
        var rows = payload.rows || [];
        for (var i = 0; i < rows.length; i++) {
            if (rowHasCaseContent(rows[i], cols)) return true;
        }
        return false;
    }

    function collectTemplateSwitchPayload() {
        var cols = (global.tableColumns || []).map(String);
        if (!cols.length) return null;
        var rows = (global.testCasesData || []).map(function (row) {
            var out = [];
            for (var i = 0; i < cols.length; i++) {
                out.push(String(row && row[i] != null ? row[i] : ''));
            }
            return out;
        });
        var payload = {
            scope: 'table',
            columns: cols,
            rows: rows,
            columnVisible: Object.assign({}, global.columnVisible || {}),
            columnWidth: Object.assign({}, global.columnWidth || {}),
            rowHeights: Object.assign({}, global.rowHeights || {})
        };
        if (typeof global.tcProvenanceArrayForStashPayload === 'function') {
            payload.provenance = global.tcProvenanceArrayForStashPayload(rows.length);
        }
        return payload;
    }

    function tcTemplateSwitchBeforeApply(fromTemplateId, toTemplateId) {
        fromTemplateId = fromTemplateId ? String(fromTemplateId) : '';
        toTemplateId = toTemplateId ? String(toTemplateId) : '';
        if (!fromTemplateId && typeof global.getTcActiveTemplateId === 'function') {
            fromTemplateId = global.getTcActiveTemplateId();
        }
        if (!fromTemplateId || fromTemplateId === toTemplateId) return;
        if (!isTemplateSwitchSourceReady()) return;
        var pageKey = getPageKey();
        if (!pageKey) return;
        var cols = (global.tableColumns || []).map(String);
        var rowsBefore = (global.testCasesData || []).slice();
        commitTableForSnapshot();
        var rowsAfter = (global.testCasesData || []).slice();
        var mergedRows = mergeTemplateSwitchRowsPreservingCount(rowsBefore, rowsAfter, cols);
        global.testCasesData = mergedRows.map(function (row) { return row.slice(); });
        if (typeof global.tcEnsureProvenanceLength === 'function') {
            try { global.tcEnsureProvenanceLength(); } catch (eProv) { /* ignore */ }
        }
        var payload = collectTemplateSwitchPayload();
        if (!payload) return;
        ensureBucket(pageKey).byTemplate[fromTemplateId] = {
            templateId: fromTemplateId,
            payload: payload,
            hasCaseContent: payloadHasCaseContent(payload)
        };
        var baselineKey = getTemplateBaselineKey(pageKey, fromTemplateId);
        var currentKey = payloadFingerprint(payload);
        var changed = baselineKey == null ? payloadHasCaseContent(payload) : (baselineKey !== currentKey);
        if (changed) {
            tcTemplateSwitchMarkUserEdited({ force: true });
            tcTemplateSwitchPersistPayload(payload);
        }
    }


    function tcTemplateSwitchEvaluateLeavePersist() {
        if (!isTemplateSwitchSourceReady()) {
            return { shouldPersist: false, payload: null, hasContent: false };
        }
        commitTableForSnapshot();
        var payload = collectTemplateSwitchPayload();
        if (!payload) return { shouldPersist: false, payload: null, hasContent: false };
        var templateId = resolveCurrentTemplateIdForSwitch();
        var pageKey = getPageKey();
        var baselineKey = (templateId && pageKey) ? getTemplateBaselineKey(pageKey, templateId) : null;
        var currentKey = payloadFingerprint(payload);
        var hasContent = payloadHasCaseContent(payload);
        var changed = baselineKey == null ? hasContent : (baselineKey !== currentKey);
        return { shouldPersist: changed, payload: payload, hasContent: hasContent };
    }

    function tcTemplateSwitchPersistOnPageLeave(opts) {
        opts = opts || {};
        if (!hasTemplateSwitchPersistContext()) return Promise.resolve(null);
        if (typeof global.isTcWorkbenchGenerationActive === 'function' &&
            global.isTcWorkbenchGenerationActive()) {
            return Promise.resolve(null);
        }
        if (global._tcTemplateSwitchApplyInProgress && !opts.force) return Promise.resolve(null);
        var decision = tcTemplateSwitchEvaluateLeavePersist();
        if (!decision.shouldPersist) return Promise.resolve(null);
        return tcTemplateSwitchPersistPayload(decision.payload);
    }

    function resolveCurrentTemplateIdForSwitch() {
        if (typeof global.getTcActiveTemplateId === 'function') {
            var fromGetter = global.getTcActiveTemplateId();
            if (fromGetter) return String(fromGetter);
        }
        return global.tcActiveTemplateId ? String(global.tcActiveTemplateId) : '';
    }


    var _tplSwitchPersistTimer = null;

    function hasTemplateSwitchPersistContext() {
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.resolveContext !== 'function') return false;
        try {
            var ctx = store.resolveContext({});
            return !!(ctx && ctx.lanhu_page_id && ctx.lanhu_url);
        } catch (eCtx) { return false; }
    }

    /** 模板切换场景：当前模板表格变更后 debounce 落库（覆盖需求页用例） */
    function tcTemplateSwitchPersistDebounced() {
        if (global._tcTemplateSwitchApplyInProgress) return;
        if (!hasTemplateSwitchPersistContext()) return;
        if (_tplSwitchPersistTimer) {
            try { global.clearTimeout(_tplSwitchPersistTimer); } catch (e0) { /* ignore */ }
        }
        _tplSwitchPersistTimer = global.setTimeout(function () {
            _tplSwitchPersistTimer = null;
            if (global._tcTemplateSwitchApplyInProgress) return;
            var store = global.TcRequirementCaseStore;
            if (!store || typeof store.flushIfDirty !== 'function') return;
            try {
                store.flushIfDirty('manual_edit', { force: true }).catch(function () { /* ignore */ });
            } catch (e1) { /* ignore */ }
        }, 650);
    }

    function tcTemplateSwitchPersistNow() {
        if (!hasTemplateSwitchPersistContext()) return;
        var store = global.TcRequirementCaseStore;
        if (!store || typeof store.flushIfDirty !== 'function') return;
        try {
            return store.flushIfDirty('manual_edit', { force: true });
        } catch (e2) {
            return Promise.resolve(null);
        }
    }

    /** 当前模板发生用户变更时，作废其它模板的内存缓存（切回时展示空表） */
    function tcTemplateSwitchMarkUserEdited(opts) {
        opts = opts || {};
        if (!opts.force && global._tcTemplateSwitchApplyInProgress) return;
        var pageKey = getPageKey();
        var currentId = resolveCurrentTemplateIdForSwitch();
        if (!pageKey || !currentId) return;
        var bucket = ensureBucket(pageKey);
        Object.keys(bucket.byTemplate).forEach(function (tid) {
            if (tid !== currentId) delete bucket.byTemplate[tid];
        });
    }


    /** 当前模板编辑/加行/生成后：作废其它模板缓存 + 需求页落库 */
    function tcTemplateSwitchOnCurrentTemplateMutated() {
        tcTemplateSwitchMarkUserEdited();
    }

    function tcTemplateSwitchClearPageSession(pageKey) {
        if (pageKey) {
            delete _sessions[pageKey];
            return;
        }
        _sessions = {};
    }



    function applyCachedTemplateSnapshot(entry, opts) {
        opts = opts || {};
        var payload = entry && entry.payload;
        var templateId = entry && entry.templateId;
        if (!payload || !payload.columns || !payload.columns.length || !templateId) return false;
        if (global.TcTableView && typeof global.TcTableView.reset === 'function') {
            try { global.TcTableView.reset(); } catch (eResetSnap) { /* ignore */ }
        }
        if (typeof global.applyRequirementCasePayload === 'function') {
            global.applyRequirementCasePayload(payload, { templateId: templateId });
        } else {
            return false;
        }
        if (typeof global.setTcActiveTemplateId === 'function') {
            global.setTcActiveTemplateId(templateId);
        } else {
            global.tcActiveTemplateId = templateId;
        }
        global.tcTableTemplateApplied = true;
        if (typeof global.saveTcDailyTemplateChoice === 'function') {
            global.saveTcDailyTemplateChoice(templateId);
        }
        if (typeof global.syncTcTableTemplateChrome === 'function') global.syncTcTableTemplateChrome();
        if (typeof global.syncTcRightPanelMeta === 'function') global.syncTcRightPanelMeta();
        if (typeof global.closeTcTemplateModal === 'function') global.closeTcTemplateModal();
        if (typeof global.switchTcRightView === 'function') global.switchTcRightView('table');
        if (typeof global.tcTableEnsureHistoryReady === 'function') global.tcTableEnsureHistoryReady();
        if (!opts.silent && typeof global.tcAppToast === 'function') {
            var tplName = templateId;
            if (typeof global.TC_CASE_TEMPLATES !== 'undefined' && global.TC_CASE_TEMPLATES.length) {
                var tpl = global.TC_CASE_TEMPLATES.find(function (t) { return t.id === templateId; });
                if (tpl && tpl.name) tplName = tpl.name;
            }
            global.tcAppToast('已恢复 ' + tplName + ' 的用例', { variant: 'success', duration: 2200 });
        }
        tcTemplateSwitchRecordBaseline(templateId, { payload: payload, skipCommit: true });
        return true;
    }

    function tcTemplateSwitchTryRestore(templateId, opts) {
        opts = opts || {};
        templateId = templateId ? String(templateId) : '';
        if (!templateId) return false;
        var pageKey = getPageKey();
        if (!pageKey) return false;
        var bucket = _sessions[pageKey];
        if (!bucket || !bucket.byTemplate) return false;
        var entry = bucket.byTemplate[templateId];
        if (!entry || !entry.payload) return false;
        return applyCachedTemplateSnapshot(entry, opts);
    }

    global.tcTemplateSwitchRecordBaseline = tcTemplateSwitchRecordBaseline;
    global.tcTemplateSwitchAfterApply = tcTemplateSwitchAfterApply;
    global.tcTemplateSwitchBeforeApply = tcTemplateSwitchBeforeApply;
    global.tcTemplateSwitchTryRestore = tcTemplateSwitchTryRestore;
    global.tcTemplateSwitchMarkUserEdited = tcTemplateSwitchMarkUserEdited;
    global.tcTemplateSwitchPersistDebounced = tcTemplateSwitchPersistDebounced;
    global.tcTemplateSwitchOnCurrentTemplateMutated = tcTemplateSwitchOnCurrentTemplateMutated;
    global.tcTemplateSwitchPersistNow = tcTemplateSwitchPersistNow;
    global.tcTemplateSwitchEvaluateLeavePersist = tcTemplateSwitchEvaluateLeavePersist;
    global.tcTemplateSwitchPersistOnPageLeave = tcTemplateSwitchPersistOnPageLeave;
    global.tcTemplateSwitchClearPageSession = tcTemplateSwitchClearPageSession;
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_gen_chat_pipeline.js ---- */
/**
 * 用例生成弹窗 — 流水线阶段（每步独立对话气泡）+ AI 流式输出
 */
(function (global) {
    'use strict';

    var STEPS_STANDARD = [
        { id: 'lanhu', label: '获取蓝湖需求' },
        { id: 'parse_req', label: '解析与检索需求' },
        { id: 'generate', label: 'AI 生成用例' },
        { id: 'parse_rows', label: '解析并写入表格' }
    ];

    var STEPS_MODULE = [
        { id: 'lanhu', label: '获取蓝湖需求' },
        { id: 'parse_req', label: '解析与检索需求' },
        { id: 'split_modules', label: '模块拆分' },
        { id: 'generate_modules', label: '分模块生成用例' },
        { id: 'dedupe', label: '交叉去重' },
        { id: 'parse_rows', label: '解析并写入表格' }
    ];

    var STEPS = STEPS_STANDARD.slice();

    var STEP_IDS = STEPS.map(function (s) { return s.id; });

    var state = {
        sessionActive: false,
        stepMsgs: {},
        streamEl: null,
        streamMsg: null,
        cancelBtn: null,
        buffer: '',
        thinkingBuffer: '',
        completed: false,
        cancelled: false,
        failed: false,
        failedStepId: '',
        activeStepId: '',
        expanded: false,
        rafPending: false,
        paintQueued: false,
        lastChunkAt: 0,
        qualityCheckEnabled: false,
        pendingQualityCheckInChat: false,
        validateReasoningBuffer: '',
        outputTarget: 'list',
        runToken: 0,
        stepPhaseSnapshot: {},
        useModulePipeline: false,
        moduleStepThinking: {
            split_modules: '',
            generate_modules: '',
            module_count: 0,
            generate_module_slots: []
        }
    };

    var scheduledArchiveHandles = { raf1: 0, raf2: 0, timeout: 0 };

    function setOutputTarget(target) {
        target = target === 'mindmap' ? 'mindmap' : 'list';
        state.outputTarget = target;
    }

    function detectPipelineOutputTarget() {
        if (state.outputTarget === 'mindmap' || state.outputTarget === 'list') {
            return state.outputTarget;
        }
        if (global.TcGenerationStreamClient && global.TcGenerationStreamClient.outputTarget) {
            var fromClient = global.TcGenerationStreamClient.outputTarget;
            if (fromClient === 'mindmap' || fromClient === 'list') return fromClient;
        }
        if (typeof global.tcRightViewMode !== 'undefined' && global.tcRightViewMode === 'mindmap') {
            return 'mindmap';
        }
        if (typeof document !== 'undefined' && document.body &&
            document.body.classList.contains('tc-left-gen-compact--mindmap')) {
            return 'mindmap';
        }
        return 'list';
    }

    function pipelineWriteStepLabel(target, phase) {
        target = target || detectPipelineOutputTarget();
        if (target === 'mindmap') {
            return phase === 'active' ? '写入导图…' : '已写入思维导图';
        }
        return phase === 'active' ? '写入表格…' : '已写入表格';
    }

    function pipelineParseWriteStepTitle(target) {
        target = target || detectPipelineOutputTarget();
        return target === 'mindmap' ? '解析并写入导图' : '解析并写入表格';
    }

    function pipelineParseWriteActiveDetail(target, phase) {
        target = target || detectPipelineOutputTarget();
        if (phase === 'write') {
            return pipelineWriteStepLabel(target, 'active');
        }
        if (phase === 'parse') {
            return '解析用例结构…';
        }
        return pipelineParseWriteStepTitle(target) + '…';
    }

    function pipelineParseWriteDoneDetail(target, rowCount, parsedDetail) {
        target = target || detectPipelineOutputTarget();
        rowCount = Math.max(0, parseInt(rowCount, 10) || 0);
        var parsed = String(parsedDetail || '').trim();
        var writeDone = pipelineWriteStepLabel(target, 'done');
        if (parsed && /写入/.test(parsed)) return parsed;
        if (parsed) {
            var writeTail = writeDone.replace(/^已/, '');
            return parsed + '并' + writeTail;
        }
        if (rowCount > 0) {
            return target === 'mindmap'
                ? ('已解析 ' + rowCount + ' 条并写入思维导图')
                : ('已解析 ' + rowCount + ' 条并写入表格');
        }
        return writeDone;
    }

    function normalizePipelineStepId(stepId) {
        if (stepId === 'write') return 'parse_rows';
        if (stepId === 'rag_context') return 'parse_req';
        return stepId;
    }

    function mergeParseWriteDetail(existingDetail, newDetail) {
        existingDetail = String(existingDetail || '').trim();
        newDetail = String(newDetail || '').trim();
        if (!existingDetail) return newDetail;
        if (!newDetail || existingDetail.indexOf(newDetail) >= 0) return existingDetail;
        if (newDetail.indexOf(existingDetail) >= 0) return newDetail;
        if (/写入/.test(newDetail) && /已解析/.test(existingDetail)) {
            return existingDetail.replace(/…$/, '') + '，' + newDetail;
        }
        return newDetail || existingDetail;
    }

    function pipelineFallbackSummaryText(rowCount, target) {
        target = target || detectPipelineOutputTarget();
        rowCount = Math.max(0, parseInt(rowCount, 10) || 0);
        if (target === 'mindmap') {
            return '已解析 **' + rowCount + '** 条导图用例并写入右侧思维导图。';
        }
        return '已解析 **' + rowCount + '** 条用例并写入右侧表格。';
    }

    function countListCaseContentRows() {
        return typeof global.tcCountTableCaseContentRows === 'function'
            ? global.tcCountTableCaseContentRows(0)
            : 0;
    }

    function countMindmapCaseContentRows() {
        var rows = typeof global.tcMindmapCasesData !== 'undefined' ? global.tcMindmapCasesData : null;
        if (rows && rows.length) {
            var n = 0;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (!row) continue;
                if (typeof global.tcTableRowHasCaseContent === 'function') {
                    if (global.tcTableRowHasCaseContent(row)) n++;
                } else if (row.some(function (cell) { return String(cell != null ? cell : '').trim(); })) {
                    n++;
                }
            }
            if (n > 0) return n;
            return rows.length;
        }
        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            var totalRows = typeof global.TcGenerationStreamClient.getTotalRows === 'function'
                ? global.TcGenerationStreamClient.getTotalRows() : 0;
            return Math.max(sessionAdded, totalRows);
        }
        return 0;
    }

    function countPipelineContentRows(target) {
        target = target || detectPipelineOutputTarget();
        return target === 'mindmap' ? countMindmapCaseContentRows() : countListCaseContentRows();
    }

    function hasMeaningfulStreamOutput(text) {
        text = String(text || '').trim();
        if (!text) return false;
        return !isFallbackSummary(text) && !isMindmapFallbackSummary(text);
    }

    function getStepIndex(stepId) {
        stepId = normalizePipelineStepId(stepId);
        for (var i = 0; i < STEP_IDS.length; i++) {
            if (STEP_IDS[i] === stepId) return i;
        }
        return -1;
    }

    function isFailed() {
        return !!state.failed;
    }

    function resolveDefaultFailStepId() {
        if (state.useModulePipeline) return 'split_modules';
        return 'generate';
    }

    function abortSubsequentSteps(failedStepId, reason) {
        failedStepId = String(failedStepId || resolveDefaultFailStepId());
        var failIdx = getStepIndex(failedStepId);
        if (failIdx < 0) failIdx = 0;
        state.failed = true;
        state.failedStepId = failedStepId;
        state.pendingQualityCheckInChat = false;
        state.completed = true;
        var skipDetail = '因前序步骤失败已跳过';
        for (var i = failIdx + 1; i < STEP_IDS.length; i++) {
            paintStepMessage(STEP_IDS[i], 'skip', skipDetail);
        }
        resetValidateSubStepsInUi();
    }

    function enabled() {
        try {
            if (global.TC_GEN_CHAT_PIPELINE_ENABLED === false || global.TC_GEN_CHAT_PIPELINE_ENABLED === 0) return false;
            return global.TC_GEN_CHAT_PIPELINE_ENABLED === true || global.TC_GEN_CHAT_PIPELINE_ENABLED === 1
                || global.TC_GEN_CHAT_STATUS_ENABLED === true || global.TC_GEN_CHAT_STATUS_ENABLED === 1;
        } catch (e) {
            return false;
        }
    }

    function getThread() {
        return document.getElementById('tc-gen-chat-thread');
    }

    function getStepDef(id) {
        for (var i = 0; i < STEPS.length; i++) {
            if (STEPS[i].id === id) {
                if (id === 'parse_rows') {
                    return { id: id, label: pipelineParseWriteStepTitle() };
                }
                return STEPS[i];
            }
        }
        return null;
    }

    function thinkingPreview(text, maxLen) {
        text = String(text || '').trim();
        maxLen = maxLen || 80;
        if (!text) return '';
        if (text.length <= maxLen) return text;
        return text.slice(0, maxLen) + '…';
    }

    function isParseRowsDone() {
        var row = state.stepMsgs.parse_rows;
        if (!row || !row.isConnected) return false;
        return row.classList.contains('tc-gen-chat-msg--pipeline-step--done');
    }

    function bufferLooksLikeCaseOutput(buf) {
        buf = String(buf || '');
        if (!buf.trim()) return false;
        if (/test_cases\s*=|\[\s*\[|^\s*\[\s*\{/m.test(buf)) return true;
        return false;
    }

    function bufferLooksLikeMindmapOutput(buf) {
        buf = String(buf || '');
        if (!buf.trim()) return false;
        if (/(?:^|\n)\s*[-*+]?\s*TC\s*[:：]/im.test(buf)) return true;
        if (/^Here'?s a thinking process:/im.test(buf) && /[\u4e00-\u9fff]/.test(buf)) return true;
        return false;
    }

    function ensureParseRowsForOutput(detail) {
        if (state.completed || state.failed) return;
        if (!bufferLooksLikeCaseOutput(state.buffer)) return;
        if (isParseRowsDone()) return;
        paintStepMessage('parse_rows', 'active', detail || '正在接收模型输出…');
    }

    function paintGenerateThinkingDetail(status, detail) {
        if (!enabled()) return;
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        var msg = String(detail || '').trim();
        if (!msg) {
            msg = thinkLen > 0 ? ('思考中…（' + thinkLen + ' 字）') : '思考中…';
        }
        paintStepMessage('generate', status || 'active', msg);
    }

    function paintGenerateDetailDuringStream() {
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        if (thinkLen > 0) {
            paintStepMessage('generate', 'active', '思考中…');
            return;
        }
        paintStepMessage('generate', 'active', '模型生成中…');
    }

    function syncThinkingGlobals(text, replace) {
        text = String(text || '');
        if (!text.trim()) return;
        if (replace) {
            global.__tcGenReasoningText = text;
        } else {
            global.__tcGenReasoningText = (global.__tcGenReasoningText || '') + text;
        }
        try {
            global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                detail: {
                    text: global.__tcGenReasoningText,
                    piece: text,
                    replace: !!replace
                }
            }));
        } catch (e) { /* ignore */ }
        if (global.TcGenChatXUi && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatTime(date) {
        var h = date.getHours();
        var m = date.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    var TC_GEN_CHAT_SCROLL_EPS = 48;

    function getTcGenChatScrollEl() {
        var thread = getThread();
        if (!thread) return null;
        return thread.querySelector(".tc-gen-chat-x-scroll") || thread;
    }

    function isTcGenChatNearBottom(el) {
        el = el || getTcGenChatScrollEl();
        if (!el) return true;
        if (el.scrollHeight <= el.clientHeight + TC_GEN_CHAT_SCROLL_EPS) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= TC_GEN_CHAT_SCROLL_EPS;
    }

    function scrollBottom(opts) {
        opts = opts || {};
        if (!opts.force && !isTcGenChatNearBottom()) return;
        if (useXRenderer()) {
            if (typeof global.TcGenChatXUi.scrollBottom === "function") {
                global.TcGenChatXUi.scrollBottom(opts);
            }
            if (typeof global.syncTcGenChatLayout === "function") global.syncTcGenChatLayout();
            return;
        }
        var thread = getThread();
        if (thread) thread.scrollTop = thread.scrollHeight;
        if (typeof global.syncTcGenChatLayout === "function") global.syncTcGenChatLayout();
    }

    function useXRenderer() {
        try {
            return !!(global.TcGenChatXUi && global.TcGenChatXUi.ready);
        } catch (e) {
            return false;
        }
    }

    function xUpdateStream(showCursor) {
        if (!useXRenderer()) return false;
        global.TcGenChatXUi.updateStream({
            buffer: state.buffer,
            completed: state.completed,
            cancelled: state.cancelled,
            showCursor: showCursor !== false && !state.completed && !state.cancelled
        });
        var thinkingText = String(state.thinkingBuffer || '');
        if (thinkingText.trim()) {
            if (typeof global.TcGenChatXUi.setThinkingContent === 'function') {
                global.TcGenChatXUi.setThinkingContent(thinkingText, { replace: true });
            } else {
                try {
                    global.dispatchEvent(new CustomEvent('tc-gen-reasoning-update', {
                        detail: { text: thinkingText, piece: thinkingText, replace: true }
                    }));
                } catch (e) { /* ignore */ }
            }
        }
        return true;
    }

    /** 将 content 流中 test_cases 赋值前的分析文字拆到思考区（无 reasoning 字段的模型） */
    function maybeSplitContentThinking() {
        var buf = String(state.buffer || '');
        if (!buf.trim()) return;
        if (detectPipelineOutputTarget() === 'mindmap' && bufferLooksLikeMindmapOutput(buf)) {
            return;
        }
        var re = /(?:^|\n)\s*(?:```(?:python|json)?\s*\n)?\s*test_cases\s*=/m;
        var m = re.exec(buf);
        if (m && m.index > 0) {
            var prefix = buf.slice(0, m.index).trim();
            state.buffer = buf.slice(m.index).replace(/^\s+/, '');
            if (prefix && prefix.length >= 6) {
                state.thinkingBuffer = prefix;
                syncThinkingGlobals(state.thinkingBuffer, true);
                paintGenerateThinkingDetail('active');
            }
            return;
        }
        if (bufferLooksLikeCaseOutput(buf)) return;
        var preview = buf.trim();
        if (preview.length < 6) return;
        if (!String(state.thinkingBuffer || '').trim() || preview.length > String(state.thinkingBuffer || '').length) {
            state.thinkingBuffer = preview;
            syncThinkingGlobals(state.thinkingBuffer, true);
            paintGenerateThinkingDetail('active');
        }
    }

    function formatInlineRichText(text) {
        var escaped = escapeHtml(text);
        escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="tc-chat-inline-code">$1</code>');
        escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        return escaped.replace(/\n/g, '<br>');
    }

    function renderRichTextHtml(text) {
        var src = String(text || '');
        if (!src) return '';
        var parts = src.split('```');
        var html = '';
        for (var i = 0; i < parts.length; i++) {
            if (i % 2 === 1) {
                var code = parts[i].replace(/^\w*\n/, '');
                html += '<pre class="tc-chat-code-block"><code>' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>';
            } else {
                html += formatInlineRichText(parts[i]);
            }
        }
        return html;
    }

    function bindCancel(btn) {
        if (!btn || btn._tcPipelineBound) return;
        btn._tcPipelineBound = true;
        btn.addEventListener('click', function () {
            if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.cancel === 'function') {
                global.TcGenerationStreamClient.cancel();
            }
        });
    }

    function bindGenerateStreamRefs(item) {
        if (!item) return;
        state.streamMsg = item;
        state.streamEl = item.querySelector('.tc-chat-streaming-content');
        state.cancelBtn = item.querySelector('.tc-pipeline-step__cancel');
        bindCancel(state.cancelBtn);
    }

    function paintStream(showCursor) {
        if (xUpdateStream(showCursor)) {
            scrollBottom();
            return;
        }
        if (!state.streamEl) return;
        var text = state.buffer;
        if (text.length > 50000) text = text.slice(-50000);
        var preview = text;
        var collapseAt = 1200;
        if (state.completed && text.length > collapseAt && !state.expanded) {
            preview = text.slice(0, collapseAt) + '\u2026';
        }
        state.streamEl.innerHTML = renderRichTextHtml(preview);
        if (showCursor && !state.completed && !state.cancelled) {
            state.streamEl.insertAdjacentHTML('beforeend', '<span class="tc-chat-streaming-cursor" aria-hidden="true"></span>');
        }
        if (state.streamMsg) {
            state.streamMsg.classList.toggle('tc-gen-chat-msg--pipeline-stall',
                !state.completed && state.lastChunkAt && (Date.now() - state.lastChunkAt > 500));
        }
        scrollBottom();
    }

    function scheduleStreamPaint(showCursor) {
        state.paintQueued = true;
        if (state.rafPending) return;
        state.rafPending = true;
        requestAnimationFrame(function () {
            state.rafPending = false;
            if (!state.paintQueued) return;
            state.paintQueued = false;
            paintStream(showCursor !== false);
        });
    }

    function flushStreamPaint(showCursor) {
        state.paintQueued = false;
        paintStream(showCursor);
    }

    function createStepMessage(stepId) {
        var def = getStepDef(stepId);
        if (!def) return null;
        var thread = getThread();
        if (!thread) return null;

        var isGenerate = stepId === 'generate';
        var item = document.createElement('article');
        item.className = 'tc-gen-chat-msg tc-gen-chat-msg--assistant tc-gen-chat-msg--pipeline-step tc-gen-chat-msg--pipeline-step--pending';
        item.setAttribute('data-tc-gen-pipeline-step', stepId);

        var bubbleHtml =
            '<div class="tc-gen-chat-msg__bubble tc-gen-chat-msg__bubble--pipeline-step">' +
            '<div class="tc-pipeline-step">' +
            '<div class="tc-pipeline-step__head">' +
            '<span class="tc-pipeline-step__dot" aria-hidden="true"></span>' +
            '<span class="tc-pipeline-step__title">' + escapeHtml(def.label) + '</span>' +
            '</div>' +
            '<p class="tc-pipeline-step__detail hidden"></p>' +
            '</div>';

        if (isGenerate) {
            bubbleHtml +=
                '<div class="tc-pipeline-step__stream-wrap hidden">' +
                '<div class="tc-pipeline-step__stream-label">模型输出</div>' +
                '<div class="tc-pipeline-step__stream tc-chat-streaming-content" aria-live="polite"></div>' +
                '<button type="button" class="tc-pipeline-step__cancel hidden" aria-label="取消生成">取消生成</button>' +
                '</div>';
        }

        bubbleHtml += '</div>';

        item.innerHTML =
            bubbleHtml +
            '<div class="tc-gen-chat-msg__meta">' +
            '<span class="tc-gen-chat-msg__mode">AI 助手</span>' +
            '<time class="tc-gen-chat-msg__time">' + formatTime(new Date()) + '</time>' +
            '</div>';

        thread.appendChild(item);
        state.stepMsgs[stepId] = item;
        if (isGenerate) bindGenerateStreamRefs(item);
        scrollBottom();
        return item;
    }

    function ensureStepMessage(stepId) {
        var existing = state.stepMsgs[stepId];
        if (existing && existing.isConnected) {
            if (stepId === 'generate') bindGenerateStreamRefs(existing);
            return existing;
        }
        return createStepMessage(stepId);
    }

    function rememberStepPhase(stepId, status, detail) {
        if (!stepId) return;
        state.stepPhaseSnapshot = state.stepPhaseSnapshot || {};
        state.stepPhaseSnapshot[stepId] = {
            status: status || 'pending',
            detail: String(detail || '').trim()
        };
    }

    function buildCombinedGenerateModulesText(slots) {
        if (!Array.isArray(slots) || !slots.length) return '';
        return slots.map(function (slot) {
            var text = String((slot && slot.text) || '').trim();
            if (!text) return '';
            var name = slot && slot.name ? String(slot.name) : '';
            return name ? ('【' + name + '】\n' + text) : text;
        }).filter(Boolean).join('\n\n');
    }

    function normalizeModuleGenSlots(slots) {
        if (!Array.isArray(slots)) return [];
        return slots.map(function (slot, idx) {
            slot = slot || {};
            return {
                name: String(slot.name || ('模块' + (idx + 1))),
                text: String(slot.text || ''),
                status: String(slot.status || 'pending')
            };
        });
    }

    function syncModuleGenSlotsToXUi(opts) {
        opts = opts || {};
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var slots = state.moduleStepThinking.generate_module_slots || [];
        if (!slots.length) return;
        if (typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
            global.TcGenChatXUi.setModuleGenSlots(slots, opts);
            return;
        }
        if (typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
            global.TcGenChatXUi.setModuleStepThinking(
                'generate_modules',
                state.moduleStepThinking.generate_modules || buildCombinedGenerateModulesText(slots),
                { replace: true, force: !!opts.force }
            );
        }
    }

    function setModuleGenPlan(modules, opts) {
        opts = opts || {};
        var list = Array.isArray(modules) ? modules : [];
        if (!list.length) return;
        var slots = list.map(function (mod, idx) {
            var name = '';
            if (mod && typeof mod === 'object') {
                name = String(mod.name || '').trim();
            } else {
                name = String(mod || '').trim();
            }
            return {
                name: name || ('模块' + (idx + 1)),
                text: '',
                status: 'pending'
            };
        });
        state.moduleStepThinking.module_count = slots.length;
        state.moduleStepThinking.generate_module_slots = slots;
        syncModuleGenSlotsToXUi(opts);
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function setModuleGenSlots(slots, opts) {
        opts = opts || {};
        var normalized = normalizeModuleGenSlots(slots);
        if (!normalized.length) return;
        state.moduleStepThinking.generate_module_slots = normalized;
        state.moduleStepThinking.module_count = normalized.length;
        state.moduleStepThinking.generate_modules = buildCombinedGenerateModulesText(normalized);
        syncModuleGenSlotsToXUi(opts);
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function setModuleStepThinking(stepId, text, opts) {
        opts = opts || {};
        if (stepId !== 'split_modules' && stepId !== 'generate_modules') return;
        text = String(text != null ? text : '');
        var prev = String(state.moduleStepThinking[stepId] || '');
        if (!text.trim() && prev.trim()) return;
        if (opts.replace || !prev.trim()) {
            state.moduleStepThinking[stepId] = text;
        } else if (text.length > prev.length) {
            state.moduleStepThinking[stepId] = text;
        } else if (!text.trim()) {
            return;
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
            global.TcGenChatXUi.setModuleStepThinking(stepId, state.moduleStepThinking[stepId], {
                replace: true
            });
        }
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step'));
        }
    }

    function getModuleStepThinkingSnapshot() {
        return {
            split_modules: String(state.moduleStepThinking.split_modules || ''),
            generate_modules: String(state.moduleStepThinking.generate_modules || ''),
            module_count: Number(state.moduleStepThinking.module_count || 0) || 0,
            generate_module_slots: normalizeModuleGenSlots(
                state.moduleStepThinking.generate_module_slots || []
            )
        };
    }

    function hasModuleThinkingContent(snap) {
        snap = snap || {};
        if (String(snap.split_modules || '').trim() || String(snap.generate_modules || '').trim()) {
            return true;
        }
        var slots = Array.isArray(snap.generate_module_slots) ? snap.generate_module_slots : [];
        return slots.some(function (slot) {
            return String((slot && slot.text) || '').trim() ||
                (slot && (slot.status === 'active' || slot.status === 'done'));
        });
    }

    function stashModuleThinkingForArchive() {
        var snap = getModuleStepThinkingSnapshot();
        global.__tcModuleStepThinkingArchive = {
            split_modules: snap.split_modules,
            generate_modules: snap.generate_modules,
            module_count: snap.module_count,
            generate_module_slots: snap.generate_module_slots
        };
        return global.__tcModuleStepThinkingArchive;
    }

    function resolveModuleThinkingForArchive() {
        var snap = getModuleStepThinkingSnapshot();
        if (hasModuleThinkingContent(snap)) {
            stashModuleThinkingForArchive();
            return snap;
        }
        var stash = global.__tcModuleStepThinkingArchive;
        if (stash && hasModuleThinkingContent(stash)) {
            return {
                split_modules: String(stash.split_modules || ''),
                generate_modules: String(stash.generate_modules || ''),
                module_count: Number(stash.module_count || 0) || 0,
                generate_module_slots: normalizeModuleGenSlots(stash.generate_module_slots || [])
            };
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.getModuleStepThinkingSnapshot === 'function') {
            var uiSnap = global.TcGenChatXUi.getModuleStepThinkingSnapshot() || {};
            return {
                split_modules: String(uiSnap.split_modules || ''),
                generate_modules: String(uiSnap.generate_modules || ''),
                module_count: Number(uiSnap.module_count || 0) || 0,
                generate_module_slots: normalizeModuleGenSlots(uiSnap.generate_module_slots || [])
            };
        }
        return snap;
    }

    function prepareModuleThinkingArchive() {
        syncModuleThinkingToXUiBeforeArchive();
        return stashModuleThinkingForArchive();
    }

    function syncLivePipelineToXUi() {
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var snap = state.stepPhaseSnapshot || {};
        var steps = {};
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            steps[stepId] = { status: row.status, detail: row.detail || '' };
        });
        if (typeof global.TcGenChatXUi.replayLivePipeline === 'function' &&
            Object.keys(steps).length) {
            global.TcGenChatXUi.replayLivePipeline({
                steps: steps,
                thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                moduleStepThinking: getModuleStepThinkingSnapshot(),
                stream: {
                    buffer: state.buffer || '',
                    completed: !!state.completed,
                    cancelled: !!state.cancelled,
                    visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                    showCursor: !state.completed && !state.cancelled
                }
            });
            return;
        }
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            if (typeof global.TcGenChatXUi.paintStepMessage === 'function') {
                global.TcGenChatXUi.paintStepMessage(stepId, row.status, row.detail);
            }
        });
        if (String(state.thinkingBuffer || '').trim() &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(state.thinkingBuffer, { replace: true });
        } else if (String(global.__tcGenReasoningText || '').trim() &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(global.__tcGenReasoningText, { replace: true });
        }
        if (String(state.buffer || '').trim() &&
            typeof global.TcGenChatXUi.updateStream === 'function') {
            global.TcGenChatXUi.updateStream({
                buffer: state.buffer,
                completed: state.completed,
                cancelled: state.cancelled,
                showCursor: !state.completed && !state.cancelled
            });
        }
        var modThink = getModuleStepThinkingSnapshot();
        if (hasModuleThinkingContent(modThink) && global.TcGenChatXUi) {
            if (modThink.generate_module_slots.length &&
                typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
                global.TcGenChatXUi.setModuleGenSlots(modThink.generate_module_slots, { replace: true });
            } else if (typeof global.TcGenChatXUi.setModuleStepThinking === 'function' &&
                modThink.generate_modules) {
                global.TcGenChatXUi.setModuleStepThinking(
                    'generate_modules', modThink.generate_modules, { replace: true }
                );
            }
            if (modThink.split_modules &&
                typeof global.TcGenChatXUi.setModuleStepThinking === 'function') {
                global.TcGenChatXUi.setModuleStepThinking('split_modules', modThink.split_modules, { replace: true });
            }
        }
        scrollBottom();
    }

    function paintStepMessage(stepId, status, detail) {
        var incomingWrite = stepId === 'write';
        stepId = normalizePipelineStepId(stepId);
        if (incomingWrite) {
            var prevSnap = state.stepPhaseSnapshot && state.stepPhaseSnapshot[stepId];
            detail = mergeParseWriteDetail(prevSnap && prevSnap.detail, detail);
        }
        var st = status || 'pending';
        rememberStepPhase(stepId, st, detail);
        if (st === 'active') {
            state.activeStepId = stepId;
        } else if (state.activeStepId === stepId &&
            (st === 'done' || st === 'skip' || st === 'error' || st === 'cancelled' || st === 'pending')) {
            state.activeStepId = '';
        }
        if (useXRenderer()) {
            global.TcGenChatXUi.paintStepMessage(stepId, st, detail);
            if (stepId === 'generate') {
                xUpdateStream(false);
            }
            scrollBottom();
            try {
                global.dispatchEvent(new CustomEvent('tc-gen-pipeline-step', {
                    detail: { stepId: stepId, status: st, detail: detail || '' }
                }));
            } catch (e) { /* ignore */ }
            return;
        }

        var item = ensureStepMessage(stepId);
        if (!item) return;

        item.classList.remove(
            'tc-gen-chat-msg--pipeline-step--pending',
            'tc-gen-chat-msg--pipeline-step--active',
            'tc-gen-chat-msg--pipeline-step--done',
            'tc-gen-chat-msg--pipeline-step--skip',
            'tc-gen-chat-msg--pipeline-step--error',
            'tc-gen-chat-msg--pipeline-step--cancelled'
        );
        item.classList.add('tc-gen-chat-msg--pipeline-step--' + st);

        var detailEl = item.querySelector('.tc-pipeline-step__detail');
        var detailText = String(detail || '').trim();
        if (detailEl) {
            detailEl.textContent = detailText;
            detailEl.classList.toggle('hidden', !detailText);
        }

        if (stepId === 'generate') {
            bindGenerateStreamRefs(item);
            var streamWrap = item.querySelector('.tc-pipeline-step__stream-wrap');
            if (streamWrap) {
                var showStream = st === 'active' || (st === 'done' && String(state.buffer || '').trim());
                streamWrap.classList.toggle('hidden', !showStream);
            }
            if (state.cancelBtn) {
                state.cancelBtn.classList.toggle('hidden', st !== 'active');
            }
        }

        scrollBottom();
    }

    function resetInternalState() {
        state.sessionActive = false;
        state.stepMsgs = {};
        state.streamEl = null;
        state.streamMsg = null;
        state.cancelBtn = null;
        state.buffer = '';
        state.thinkingBuffer = '';
        global.__tcGenReasoningText = '';
        state.completed = false;
        state.cancelled = false;
        state._stopHandled = false;
        state.failed = false;
        state.failedStepId = '';
        state.activeStepId = '';
        state.expanded = false;
        state.rafPending = false;
        state.paintQueued = false;
        state.lastChunkAt = 0;
        state.qualityCheckEnabled = false;
        state.pendingQualityCheckInChat = false;
        state.validateReasoningBuffer = '';
        state.stepPhaseSnapshot = {};
        state.useModulePipeline = false;
        state.moduleStepThinking = {
            split_modules: '',
            generate_modules: '',
            module_count: 0,
            generate_module_slots: []
        };
        STEPS = STEPS_STANDARD.slice();
        STEP_IDS = STEPS.map(function (s) { return s.id; });
    }

    function configureModulePipeline(pageChars) {
        pageChars = parseInt(pageChars, 10) || 0;
        state.useModulePipeline = true;
        STEPS = STEPS_MODULE.map(function (step) {
            if (step.id !== 'parse_rows') return step;
            return { id: step.id, label: pipelineParseWriteStepTitle() };
        });
        STEP_IDS = STEPS.map(function (s) { return s.id; });
        if (!state.sessionActive) return;
        if (state.stepPhaseSnapshot.generate) {
            paintStepMessage('generate', 'skip', '当前需求较大，改走分模块生成');
        }
        syncLivePipelineToXUi();
    }

    function isModulePipelineActive() {
        return !!state.useModulePipeline;
    }

    function clearLivePipelineUi() {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.clearLivePipeline === 'function') {
            global.TcGenChatXUi.clearLivePipeline();
        }
    }

    function archiveLiveRunBeforeNewGeneration() {
        if (!useXRenderer() || !global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.archiveCurrentRun !== 'function') {
            return;
        }
        global.TcGenChatXUi.archiveCurrentRun({
            preferPrevious: true,
            skipIfPersisted: false
        });
    }

    function prepareForNewGenerationRun() {
        cancelScheduledArchive();
        archiveLiveRunBeforeNewGeneration();
        resetInternalState();
        clearLivePipelineUi();
    }

    function begin() {
        if (!enabled()) return null;
        if (state.sessionActive && !state.completed) return true;
        resetInternalState();
        state.sessionActive = true;
        if (typeof global.dismissTcPromptIntro === 'function') global.dismissTcPromptIntro();
        scrollBottom();
        return true;
    }

    function setPhase(id, status, detail) {
        if (!enabled()) return;
        id = normalizePipelineStepId(id);
        if (!state.sessionActive) begin();
        if (status === 'pending') return;
        if (state.failed) {
            var curIdx = getStepIndex(id);
            var failIdx = getStepIndex(state.failedStepId || resolveDefaultFailStepId());
            if (failIdx < 0) failIdx = 0;
            if (curIdx > failIdx && (status === 'active' || status === 'done')) return;
        }
        if (state.completed && status === 'active') {
            if (state.failed) return;
            if (state.cancelled) return;
            if (id !== 'quality_check') return;
        }
        if (status === 'error') {
            paintStepMessage(id, status, detail);
            abortSubsequentSteps(id, detail);
            return;
        }
        if (status === 'active' || status === 'done' || status === 'skip' || status === 'cancelled') {
            paintStepMessage(id, status, detail);
        }
    }


    function mergeReasoningText(prev, piece) {
        prev = String(prev || '');
        piece = String(piece || '');
        if (!piece) return prev;
        if (!prev) return piece;
        if (piece === prev) return prev;
        if (piece.indexOf(prev) === 0) return piece;
        if (prev.indexOf(piece) === 0) return prev;
        return prev + piece;
    }

    function appendReasoningContent(chunk) {
        if (!enabled()) return;
        if (state.completed || state.failed) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        paintStepMessage('generate', 'active', '思考中…');
        state.thinkingBuffer = mergeReasoningText(state.thinkingBuffer, piece);
        syncThinkingGlobals(state.thinkingBuffer, true);
        state.lastChunkAt = Date.now();
        paintGenerateThinkingDetail('active');
        scheduleStreamPaint(true);
    }

    function setReasoningContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim()) return;
        if (!state.sessionActive) begin();
        if (opts.replace || !String(state.thinkingBuffer || '').trim()) {
            state.thinkingBuffer = text;
        } else if (text.length > state.thinkingBuffer.length) {
            state.thinkingBuffer = text;
        }
        syncThinkingGlobals(state.thinkingBuffer, true);
        state.lastChunkAt = Date.now();
        if (state.completed || opts.finalize) {
            paintGenerateThinkingDetail('done');
            return;
        }
        paintGenerateThinkingDetail('active', thinkingPreview(state.thinkingBuffer, 100));
        paintStepMessage('generate', 'active', '思考中…');
        flushStreamPaint(false);
    }

    function appendContent(chunk) {
        if (!enabled()) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (state.completed || state.failed) {
            return;
        }
        state.completed = false;
        state.cancelled = false;
        state.buffer += piece;
        maybeSplitContentThinking();
        state.lastChunkAt = Date.now();
        paintGenerateDetailDuringStream();
        ensureParseRowsForOutput('正在接收模型输出…');
        scheduleStreamPaint(true);
    }

    function isFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条用例并写入右侧表格。$/.test(String(text || '').trim());
    }

    function isMindmapFallbackSummary(text) {
        return /^已解析 \*\*\d+\*\* 条导图用例并写入右侧思维导图。$/.test(String(text || '').trim());
    }

    function ingestStreamText(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim()) return;
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (state.completed && !opts.allowAfterComplete) {
            if (opts.replace || !String(state.buffer || '').trim() || isFallbackSummary(state.buffer) ||
                isMindmapFallbackSummary(state.buffer)) {
                state.buffer = text;
            } else if (state.buffer.length < text.length) {
                state.buffer = text;
            }
            flushStreamPaint(false);
            return;
        }
        if (!state.buffer.trim() || opts.replace || isFallbackSummary(state.buffer) ||
            isMindmapFallbackSummary(state.buffer)) {
            state.buffer = text;
        } else if (state.buffer.length < text.length) {
            state.buffer = text;
        }
        maybeSplitContentThinking();
        state.lastChunkAt = Date.now();
        paintGenerateDetailDuringStream();
        ensureParseRowsForOutput('正在接收模型输出…');
        flushStreamPaint(false);
    }

    function getStreamText() {
        return state.buffer || '';
    }

    function getThinkingText() {
        return state.thinkingBuffer || '';
    }

    function applyFinishReasoning(opts) {
        if (!opts || !opts.reasoning_text) return;
        var rt = String(opts.reasoning_text || '').trim();
        if (!rt) return;
        var finalize = !!(state.completed || opts.finalize);
        if (global.TcGenChatXUi && global.TcGenChatXUi.ready &&
            typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(rt, { replace: true, force: true });
        }
        if (!String(state.thinkingBuffer || '').trim() || rt.length >= String(state.thinkingBuffer || '').length) {
            setReasoningContent(rt, { replace: true, finalize: finalize });
        } else if (finalize && String(state.thinkingBuffer || '').trim()) {
            /* 思考内容已在 generate 步骤内展示，无需单独步骤 */
        }
    }

    function resolveEffectiveListGenerationRows(opts) {
        opts = opts || {};
        return resolveCurrentRunParsedRowCount(opts);
    }

    function resolveEffectiveMindmapGenerationRows(opts) {
        opts = opts || {};
        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            if (sessionAdded > 0) return sessionAdded;
        }
        var contentRows = countMindmapCaseContentRows();
        if (contentRows > 0) return contentRows;
        var hasStream = hasMeaningfulStreamOutput(state.buffer);
        var hasStreamText = hasMeaningfulStreamOutput(opts.stream_text);
        if (hasStream || hasStreamText) return 0;
        return 0;
    }

    function resolveEffectiveGenerationRows(opts) {
        if (detectPipelineOutputTarget() === 'mindmap') {
            return resolveEffectiveMindmapGenerationRows(opts);
        }
        return resolveEffectiveListGenerationRows(opts);
    }


    /** 本次生成/解析写入的行数（不含表格历史存量） */
    function resolveCurrentRunParsedRowCount(opts) {
        opts = opts || {};
        var finishCount = parseInt(opts.finish_row_count, 10) || 0;
        if (finishCount > 0) return finishCount;

        if (global.TcGenerationStreamClient) {
            var sessionAdded = typeof global.TcGenerationStreamClient.getSessionRowsAdded === 'function'
                ? global.TcGenerationStreamClient.getSessionRowsAdded() : 0;
            if (sessionAdded > 0) return sessionAdded;
        }

        var parsedRowsOpt = parseInt(opts.parsedRows, 10) || 0;
        if (parsedRowsOpt > 0) return parsedRowsOpt;

        if (global.tcGenBatchCore && global.tcGenBatchCore.state) {
            var batchRowCount = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            if (batchRowCount > 0) return batchRowCount;
        }

        var target = detectPipelineOutputTarget();
        if (target === 'list' && typeof global.tcCountTableCaseContentRows === 'function') {
            var batchStart = opts.batch_row_start != null ? parseInt(opts.batch_row_start, 10) : -1;
            if (isNaN(batchStart) || batchStart < 0) {
                if (typeof global.tcGetLastGenerationWriteStart === 'function') {
                    batchStart = global.tcGetLastGenerationWriteStart();
                }
            }
            if ((isNaN(batchStart) || batchStart < 0) && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                batchStart = parseInt(global.tcGenBatchCore.state.batchRowStart, 10);
            }
            var batchLimit = parseInt(opts.batch_row_count, 10) || 0;
            if (batchLimit <= 0 && global.tcGenBatchCore && global.tcGenBatchCore.state) {
                batchLimit = parseInt(global.tcGenBatchCore.state.batchRowCount, 10) || 0;
            }
            if (!isNaN(batchStart) && batchStart >= 0) {
                if (batchLimit > 0) {
                    var limited = global.tcCountTableCaseContentRows(batchStart, batchLimit);
                    if (limited > 0) return limited;
                }
                if (batchStart > 0) {
                    var scoped = global.tcCountTableCaseContentRows(batchStart);
                    if (scoped > 0) return scoped;
                }
            }
        }

        if (global.TcGenerationStreamClient &&
            typeof global.TcGenerationStreamClient.getTotalRows === 'function') {
            var streamTotal = parseInt(global.TcGenerationStreamClient.getTotalRows(), 10) || 0;
            if (streamTotal > 0) return streamTotal;
        }

        var claimed = parseInt(opts.total_rows, 10) || 0;
        if (claimed > 0 && opts.trust_server_row_count) return claimed;
        return 0;
    }

    /** 流式生成 finish 专用：仅统计本次解析/写入行数 */
    function resolvePipelineFinishRowCount(opts) {
        return resolveCurrentRunParsedRowCount(opts);
    }

    function isParseRowsTerminal() {
        var snap = state.stepPhaseSnapshot && state.stepPhaseSnapshot.parse_rows;
        return !!(snap && (snap.status === 'done' || snap.status === 'skip' ||
            snap.status === 'cancelled' || snap.status === 'error'));
    }

    /** 流式进度同步：已完成后忽略迟到的 parse/write 事件，防止步骤回退为转圈 */
    function syncStreamProgressStep(opts) {
        if (!enabled()) return;
        if (state.failed) return;
        opts = opts || {};
        var step = opts.step || '';
        if (step === 'done' || step === 'error' || step === 'cancelled') {
            syncStreamStep(opts);
            return;
        }
        if (state.completed || isParseRowsTerminal()) return;
        syncStreamStep(opts);
    }

    /** 补救：写入已成功但 finish 未收尾时强制完成 parse_rows（并触发质量检查排队） */
    function completeStreamParseWriteFinish(opts) {
        if (!enabled() || state.failed) return false;
        opts = opts || {};
        if (state.completed && isParseRowsTerminal()) return false;
        var rowCount = resolvePipelineFinishRowCount(opts);
        if (rowCount <= 0) return false;
        if (!state.sessionActive) begin();
        if (!state.completed) state.completed = true;
        markGenerationPipelineDone(Object.assign({}, opts, {
            total_rows: rowCount,
            finish_row_count: rowCount,
            parsed_detail: opts.parsed_detail || ('已解析 ' + rowCount + ' 条')
        }));
        flushStreamPaint(false);
        return true;
    }

    function cancelScheduledArchive() {
        state.runToken = (state.runToken || 0) + 1;
        if (scheduledArchiveHandles.raf1 && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(scheduledArchiveHandles.raf1);
        }
        if (scheduledArchiveHandles.raf2 && typeof global.cancelAnimationFrame === 'function') {
            global.cancelAnimationFrame(scheduledArchiveHandles.raf2);
        }
        if (scheduledArchiveHandles.timeout && typeof global.clearTimeout === 'function') {
            global.clearTimeout(scheduledArchiveHandles.timeout);
        }
        scheduledArchiveHandles.raf1 = 0;
        scheduledArchiveHandles.raf2 = 0;
        scheduledArchiveHandles.timeout = 0;
    }

    function scheduleArchiveCurrentRunToSession(opts) {
        opts = opts || {};
        if (!useXRenderer() || !global.TcGenChatXUi ||
            typeof global.TcGenChatXUi.archiveCurrentRun !== 'function') {
            return;
        }
        var token = state.runToken;
        var run = function () {
            if (token !== state.runToken) return;
            prepareModuleThinkingArchive();
            var archiveSteps = buildArchiveStepSnapshot();
            if (useXRenderer() && global.TcGenChatXUi &&
                typeof global.TcGenChatXUi.replayLivePipeline === 'function' &&
                Object.keys(archiveSteps).length) {
                global.TcGenChatXUi.replayLivePipeline({
                    steps: archiveSteps,
                    thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                    moduleStepThinking: getModuleStepThinkingSnapshot(),
                    stream: {
                        buffer: state.buffer || '',
                        completed: !!state.completed,
                        cancelled: !!state.cancelled,
                        visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                        showCursor: !state.completed && !state.cancelled
                    }
                });
            }
            global.TcGenChatXUi.archiveCurrentRun({
                preferPrevious: !!opts.preferPrevious,
                skipIfPersisted: !!opts.skipIfPersisted,
                steps: archiveSteps
            });
        };
        if (typeof global.requestAnimationFrame === 'function') {
            scheduledArchiveHandles.raf1 = global.requestAnimationFrame(function () {
                scheduledArchiveHandles.raf2 = global.requestAnimationFrame(function () {
                    scheduledArchiveHandles.raf1 = 0;
                    scheduledArchiveHandles.raf2 = 0;
                    run();
                });
            });
        } else {
            scheduledArchiveHandles.timeout = global.setTimeout(function () {
                scheduledArchiveHandles.timeout = 0;
                run();
            }, 0);
        }
    }

    function syncModuleThinkingToXUiBeforeArchive() {
        if (!useXRenderer() || !global.TcGenChatXUi) return;
        var snap = getModuleStepThinkingSnapshot();
        if (snap.generate_module_slots.length &&
            typeof global.TcGenChatXUi.setModuleGenSlots === 'function') {
            global.TcGenChatXUi.setModuleGenSlots(snap.generate_module_slots, { replace: true });
            return;
        }
        if (typeof global.TcGenChatXUi.setModuleStepThinking !== 'function') return;
        if (snap.split_modules) {
            global.TcGenChatXUi.setModuleStepThinking('split_modules', snap.split_modules, { replace: true });
        }
        if (snap.generate_modules) {
            global.TcGenChatXUi.setModuleStepThinking('generate_modules', snap.generate_modules, { replace: true });
        }
    }

    function markModuleGenerationDone(opts) {
        opts = opts || {};
        if (state.failed) return;
        if (!state.qualityCheckEnabled && typeof global.tcCaptureGenAutoValidateForTask === 'function') {
            state.qualityCheckEnabled = !!global.tcCaptureGenAutoValidateForTask();
        }
        syncModuleThinkingToXUiBeforeArchive();
        var target = detectPipelineOutputTarget();
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            failStep('parse_rows', '分模块生成未产出用例，请检查需求或模型配置后重试');
            return;
        }
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        opts.parsed_detail = opts.parsed_detail || ('已生成 ' + effectiveRows + ' 条');
        state.completed = true;
        paintStepMessage('parse_rows', 'done', pipelineParseWriteDoneDetail(
            target, effectiveRows, opts.parsed_detail
        ));
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function markGenerationPipelineDone(opts) {
        opts = opts || {};
        if (state.failed) return;
        if (state.cancelled) return;
        var target = detectPipelineOutputTarget();
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            error('未收到模型输出，请检查 AI 配置后重试');
            return;
        }
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        opts.parsed_detail = opts.parsed_detail || ('已解析 ' + effectiveRows + ' 条');
        var thinkLen = String(state.thinkingBuffer || '').trim().length;
        var genDetail = thinkLen > 0
            ? ('生成完成（思考 ' + thinkLen + ' 字）')
            : '生成完成';
        paintStepMessage('generate', 'done', genDetail);
        paintStepMessage('parse_rows', 'done', pipelineParseWriteDoneDetail(
            target, effectiveRows, opts.parsed_detail
        ));
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function captureQualityCheckEnabled() {
        state.qualityCheckEnabled = false;
        return false;
    }

    function isQualityCheckEnabled() {
        return !!state.qualityCheckEnabled;
    }

    function setQualityCheckContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim() && !opts.force) return;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setValidateContent === 'function') {
            global.TcGenChatXUi.setValidateContent(text, opts);
        }
    }

    function appendQualityCheckContent(text) {
        text = String(text || '');
        if (!text) return;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.appendValidateContent === 'function') {
            global.TcGenChatXUi.appendValidateContent(text);
        }
        scrollBottom();
    }

    function resetValidateSubStepsInUi() {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.resetValidateSubSteps === 'function') {
            global.TcGenChatXUi.resetValidateSubSteps();
        }
    }

    function paintValidateSubStepInUi(stepId, status, detail, skipReason) {
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.paintValidateSubStep === 'function') {
            global.TcGenChatXUi.paintValidateSubStep(stepId, status, detail, skipReason);
        }
    }

    function resetValidateReasoningInUi() {
        state.validateReasoningBuffer = '';
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.resetValidateReasoning === 'function') {
            global.TcGenChatXUi.resetValidateReasoning();
        }
    }

    function appendValidateReasoningContent(chunk) {
        if (!enabled()) return;
        var piece = String(chunk || '');
        if (!piece) return;
        if (!state.sessionActive) begin();
        state.validateReasoningBuffer += piece;
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.appendValidateReasoningContent === 'function') {
            global.TcGenChatXUi.appendValidateReasoningContent(piece);
        }
        scrollBottom();
    }

    function setValidateReasoningContent(text, opts) {
        opts = opts || {};
        text = String(text || '');
        if (!text.trim() && !opts.force) return;
        if (!state.sessionActive) begin();
        if (opts.replace || !String(state.validateReasoningBuffer || '').trim()) {
            state.validateReasoningBuffer = text;
        } else if (text.length > state.validateReasoningBuffer.length) {
            state.validateReasoningBuffer = text;
        }
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.setValidateReasoningContent === 'function') {
            global.TcGenChatXUi.setValidateReasoningContent(state.validateReasoningBuffer, opts);
        }
        scrollBottom();
    }

    function syncQualityCheckProgress(opts) {
        opts = opts || {};
        if (!enabled()) return;
        if (state.failed) return;
        if (!state.pendingQualityCheckInChat) {
            if (!opts.begin || !state.qualityCheckEnabled) return;
            state.pendingQualityCheckInChat = true;
        }
        if (opts.begin) {
            setPhase('quality_check', 'active', opts.detail || '正在执行质量检查…');
            if (opts.resetSubSteps !== false) {
                resetValidateSubStepsInUi();
                resetValidateReasoningInUi();
            }
            if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
            return;
        }
        if (opts.subStep === 'llm' && opts.subStatus === 'running') {
            resetValidateReasoningInUi();
        }
        if (opts.subStep) {
            paintValidateSubStepInUi(opts.subStep, opts.subStatus, opts.subDetail, opts.subSkipReason);
            if (opts.detail) {
                setPhase('quality_check', 'active', opts.detail);
            }
            scrollBottom();
            return;
        }
        if (opts.append) {
            if (opts.detail) {
                setPhase('quality_check', 'active', opts.detail);
            }
            return;
        }
        if (opts.finish) {
            var st = opts.error ? 'error' : 'done';
            setPhase('quality_check', st, opts.detail || '质量检查完成');
            state.pendingQualityCheckInChat = false;
            if (typeof global.syncTcPromptSendBtnState === 'function') {
                global.syncTcPromptSendBtnState();
            }
            if (global.TcLeftPanelLock && typeof global.TcLeftPanelLock.applyLockUi === 'function') {
                global.TcLeftPanelLock.applyLockUi();
            }
            if (typeof global.setTimeout === 'function') {
                global.setTimeout(function () {
                    scheduleArchiveCurrentRunToSession({ preferPrevious: false });
                }, 0);
            } else {
                scheduleArchiveCurrentRunToSession({ preferPrevious: false });
            }
            return;
        }
        if (opts.detail) {
            setPhase('quality_check', 'active', opts.detail);
        }
    }

    function finish(opts) {
        opts = opts || {};
        if (!state.sessionActive) return;
        if (state.failed) return;
        if (state.cancelled) return;
        applyFinishReasoning(opts);
        if (state.completed && String(state.buffer || '').trim()) {
            if (opts.stream_text && String(opts.stream_text).trim()) {
                if (isFallbackSummary(state.buffer) || isMindmapFallbackSummary(state.buffer) ||
                    String(opts.stream_text).length > String(state.buffer).length) {
                    ingestStreamText(opts.stream_text, { replace: true, allowAfterComplete: true });
                }
            }
            applyFinishReasoning(Object.assign({}, opts, { finalize: true }));
            markGenerationPipelineDone(opts);
            flushStreamPaint(false);
            return;
        }
        if (!useXRenderer()) {
            ensureStepMessage('generate');
            bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (!String(state.buffer || '').trim() && opts.stream_text) {
            ingestStreamText(opts.stream_text, { replace: true });
        }
        applyFinishReasoning(opts);
        var effectiveRows = resolvePipelineFinishRowCount(opts);
        if (effectiveRows <= 0) {
            error('未收到模型输出，请检查 AI 配置后重试');
            return;
        }
        state.completed = true;
        opts.total_rows = effectiveRows;
        opts.finish_row_count = effectiveRows;
        if (!String(state.buffer || '').trim()) {
            if (opts.stream_text && String(opts.stream_text).trim()) {
                ingestStreamText(opts.stream_text, { replace: true, allowAfterComplete: true });
            } else {
                state.buffer = pipelineFallbackSummaryText(effectiveRows, detectPipelineOutputTarget());
            }
        }
        markGenerationPipelineDone(opts);
        flushStreamPaint(false);
    }



    function buildArchiveStepSnapshot() {
        var snap = state.stepPhaseSnapshot || {};
        var steps = {};
        STEP_IDS.forEach(function (stepId) {
            var row = snap[stepId];
            if (!row || row.status === 'pending') return;
            steps[stepId] = { status: row.status, detail: row.detail || '' };
        });
        return steps;
    }

    function markRunStopped(activeId) {
        activeId = activeId || state.activeStepId || 'generate';
        var idx = getStepIndex(activeId);
        if (idx < 0) idx = getStepIndex('generate');
        for (var i = 0; i < STEP_IDS.length; i++) {
            var stepId = STEP_IDS[i];
            var row = state.stepPhaseSnapshot[stepId];
            if (i < idx) {
                continue;
            }
            if (i === idx) {
                if (!row || row.status !== 'done') {
                    paintStepMessage(stepId, 'cancelled', '已停止');
                }
            } else if (!row || row.status === 'pending' || row.status === 'active') {
                paintStepMessage(stepId, 'skip', '已停止');
            }
        }
    }

    function cancel() {
        if (!state.sessionActive || state._stopHandled) return;
        state._stopHandled = true;
        state.cancelled = true;
        state.completed = true;
        state.pendingQualityCheckInChat = false;
        markRunStopped(state.activeStepId || 'generate');
        if (state.cancelBtn) state.cancelBtn.classList.add('hidden');
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        }
        syncLivePipelineToXUi();
        if (useXRenderer() && global.TcGenChatXUi &&
            typeof global.TcGenChatXUi.replayLivePipeline === 'function') {
            var archiveSteps = buildArchiveStepSnapshot();
            if (Object.keys(archiveSteps).length) {
                global.TcGenChatXUi.replayLivePipeline({
                    steps: archiveSteps,
                    thinkingText: state.thinkingBuffer || global.__tcGenReasoningText || '',
                    moduleStepThinking: getModuleStepThinkingSnapshot(),
                    stream: {
                        buffer: state.buffer || '',
                        completed: true,
                        cancelled: true,
                        visible: !!(String(state.buffer || '').trim() || String(state.thinkingBuffer || '').trim()),
                        showCursor: false
                    }
                });
            }
        }
        flushStreamPaint(false);
        scheduleArchiveCurrentRunToSession({ preferPrevious: false });
    }

    function abortForPageLeave() {
        state.cancelled = true;
        state.completed = true;
        state.pendingQualityCheckInChat = false;
        if (typeof abortTcMindmapStreamingIfActive === 'function') {
            abortTcMindmapStreamingIfActive();
        }
    }

    function error(message, stepId) {
        stepId = stepId || 'generate';
        message = String(message || '生成失败');
        if (!state.sessionActive) begin();
        if (!useXRenderer()) {
            ensureStepMessage(stepId === 'generate' ? 'generate' : stepId);
            if (stepId === 'generate') bindGenerateStreamRefs(state.stepMsgs.generate);
        }
        if (stepId === 'generate') {
            state.buffer += (state.buffer ? '\n\n' : '') + '**错误：** ' + message;
        }
        paintStepMessage(stepId, 'error', message);
        abortSubsequentSteps(stepId, message);
        if (state.streamMsg) state.streamMsg.classList.add('tc-gen-chat-msg--pipeline-error');
        flushStreamPaint(false);
    }

    function syncStreamStep(opts) {
        if (!enabled()) return;
        if (state.failed) return;
        if (!state.sessionActive) begin();
        opts = opts || {};
        var step = opts.step || '';
        var target = detectPipelineOutputTarget();
        var map = {
            connect: ['generate', 'active', '连接模型…'],
            gen: ['generate', 'active', '模型生成中…'],
            parse: ['parse_rows', 'active', pipelineParseWriteActiveDetail(target, 'parse')],
            write: ['parse_rows', 'active', pipelineParseWriteActiveDetail(target, 'write')]
        };
        if (step === 'done') {
            if (state.completed && String(state.buffer || '').trim()) {
                var lateReasoning = opts.reasoning_text || state.thinkingBuffer || '';
                if (!String(lateReasoning || '').trim() && global.TcGenerationStreamClient &&
                    typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                    lateReasoning = global.TcGenerationStreamClient.getReasoningText() || '';
                }
                if (lateReasoning) {
                    applyFinishReasoning({ reasoning_text: lateReasoning, finalize: true });
                }
                markGenerationPipelineDone({
                    total_rows: opts.parsedRows || 0,
                    parsed_detail: opts.parsedRows ? ('已解析 ' + opts.parsedRows + ' 条') : ''
                });
                flushStreamPaint(false);
                return;
            }
            var doneStream = opts.stream_text || '';
            if (!String(doneStream || '').trim() && String(state.buffer || '').trim()) {
                doneStream = state.buffer;
            }
            var doneReasoning = opts.reasoning_text || state.thinkingBuffer || '';
            if (!String(doneReasoning || '').trim() && global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.getReasoningText === 'function') {
                doneReasoning = global.TcGenerationStreamClient.getReasoningText() || '';
            }
            finish({
                total_rows: opts.parsedRows || 0,
                parsed_detail: opts.parsedRows ? ('已解析 ' + opts.parsedRows + ' 条') : '',
                stream_text: doneStream,
                reasoning_text: doneReasoning
            });
            return;
        }
        if (step === 'error') {
            error(opts.detail || '');
            return;
        }
        if (step === 'cancelled') {
            cancel();
            return;
        }
        var m = map[step];
        if (m) setPhase(m[0], m[1], m[2] || opts.detail || '');
        if (opts.parsedRows > 0 && (step === 'parse' || step === 'write')) {
            var parsedActive = '已解析 ' + opts.parsedRows + ' 条';
            if (step === 'write') {
                parsedActive += '，' + pipelineWriteStepLabel(target, 'active');
            }
            setPhase('parse_rows', 'active', parsedActive);
        }
    }

    function reset() {
        resetInternalState();
        if (useXRenderer() && typeof global.TcGenChatXUi.resetPipeline === 'function') {
            global.TcGenChatXUi.resetPipeline({ skipArchive: true });
        }
    }

    /** 归档到对话轮次后清掉 pipeline 快照，避免 live 链覆盖已归档链（含质量检查子步骤）。 */
    function clearAfterArchive() {
        cancelScheduledArchive();
        resetInternalState();
    }

    function getStreamText() {
        return state.buffer || '';
    }

    function isFinished() {
        return !!state.completed;
    }

    function isQualityCheckPending() {
        return !!state.pendingQualityCheckInChat;
    }

    function failStep(stepId, message) {
        setPhase(stepId || resolveDefaultFailStepId(), 'error', message || '步骤失败');
    }

    global.TcGenChatPipeline = {
        enabled: enabled,
        begin: begin,
        setOutputTarget: setOutputTarget,
        getOutputTarget: detectPipelineOutputTarget,
        setPhase: setPhase,
        configureModulePipeline: configureModulePipeline,
        isModulePipelineActive: isModulePipelineActive,
        markModuleGenerationDone: markModuleGenerationDone,
        appendContent: appendContent,
        appendReasoningContent: appendReasoningContent,
        setReasoningContent: setReasoningContent,
        ingestStreamText: ingestStreamText,
        finish: finish,
        cancel: cancel,
        abortForPageLeave: abortForPageLeave,
        error: error,
        syncStreamStep: syncStreamStep,
        syncStreamProgressStep: syncStreamProgressStep,
        completeStreamParseWriteFinish: completeStreamParseWriteFinish,
        resolvePipelineFinishRowCount: resolvePipelineFinishRowCount,
        reset: reset,
        clearAfterArchive: clearAfterArchive,
        prepareForNewGenerationRun: prepareForNewGenerationRun,
        cancelScheduledArchive: cancelScheduledArchive,
        getStreamText: getStreamText,
        getThinkingText: getThinkingText,
        isFinished: isFinished,
        isFailed: isFailed,
        failStep: failStep,
        captureQualityCheckEnabled: captureQualityCheckEnabled,
        isQualityCheckEnabled: isQualityCheckEnabled,
        isQualityCheckPending: isQualityCheckPending,
        syncQualityCheckProgress: syncQualityCheckProgress,
        appendValidateReasoningContent: appendValidateReasoningContent,
        setValidateReasoningContent: setValidateReasoningContent,
        resetValidateReasoning: resetValidateReasoningInUi,
        getValidateReasoningText: function () { return state.validateReasoningBuffer || ''; },
        isSessionActive: function () { return !!state.sessionActive; },
        getStepIds: function () { return STEP_IDS.slice(); },
        getStepPhaseSnapshot: function () {
            var snap = state.stepPhaseSnapshot || {};
            var copy = {};
            Object.keys(snap).forEach(function (stepId) {
                var row = snap[stepId];
                if (!row) return;
                copy[stepId] = { status: row.status || 'pending', detail: row.detail || '' };
            });
            return copy;
        },
        setModuleStepThinking: setModuleStepThinking,
        setModuleGenPlan: setModuleGenPlan,
        setModuleGenSlots: setModuleGenSlots,
        getModuleStepThinkingSnapshot: getModuleStepThinkingSnapshot,
        prepareModuleThinkingArchive: prepareModuleThinkingArchive,
        resolveModuleThinkingForArchive: resolveModuleThinkingForArchive,
        syncLivePipelineToXUi: syncLivePipelineToXUi
    };

    global.addEventListener('tc-gen-chat-x-ready', function () {
        if (!state.sessionActive) return;
        syncLivePipelineToXUi();
        if (!state.thinkingBuffer && !state.buffer &&
            !Object.keys(state.stepPhaseSnapshot || {}).some(function (stepId) {
                var row = state.stepPhaseSnapshot[stepId];
                return row && row.status && row.status !== 'pending';
            })) {
            return;
        }
        if (String(state.thinkingBuffer || '').trim() &&
            global.TcGenChatXUi && typeof global.TcGenChatXUi.setThinkingContent === 'function') {
            global.TcGenChatXUi.setThinkingContent(state.thinkingBuffer, { replace: true });
        }
        flushStreamPaint(!state.completed && !state.cancelled);
    });
})(typeof window !== 'undefined' ? window : this);

/* ---- tc_context_stack.js ---- */
/**
 * TestHub TC Workbench — L2 Context Stack
 * 上下文（蓝湖 + 平台公共 RAG）；CONTEXT_STACK_ENABLED 关闭时走 legacy 路径。
 */
var TC_CONTEXT_STACK_ENABLED = false;
var TC_USER_CAN_PUBLIC_RAG = false;
var TC_LAST_PUBLIC_RAG_CHUNKS = [];

function isTcContextStackEnabled() {
    return !!TC_CONTEXT_STACK_ENABLED;
}

function isTcPublicRagAdmin() {
    return !!TC_USER_CAN_PUBLIC_RAG;
}

function tcPublicRagAdminUnlocked() {
    if (!TC_ADMIN_RAG_NO_PASSWORD) return false;
    if (isTcPublicRagAdmin()) return true;
    if (window._tcConnectRagIsAdmin === true) return true;
    return false;
}
var TC_ADMIN_RAG_NO_PASSWORD = true;

function applyTcContextStackStatus(data) {
    data = data || {};
    TC_CONTEXT_STACK_ENABLED = !!data.context_stack_enabled;
    TC_USER_CAN_PUBLIC_RAG = !!data.user_can_use_public_rag;
    TC_ADMIN_RAG_NO_PASSWORD = data.admin_rag_no_password !== false;
    if (typeof syncTcRagVisibilityForRole === 'function') syncTcRagVisibilityForRole();
    if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
}

function syncTcRagVisibilityForRole() {
    var label = document.getElementById('tc-rag-toggle-label');
    if (!label) return;
    var wrap = label.closest('.tc-gen-option-item');
    if (!wrap) return;
    var hide = isTcContextStackEnabled() && !isTcPublicRagAdmin();
    wrap.classList.toggle('hidden', hide);
    if (hide) {
        wrap.setAttribute('aria-hidden', 'true');
        if (typeof setTcRagToggleEnabled === 'function') setTcRagToggleEnabled(false);
    } else {
        wrap.removeAttribute('aria-hidden');
    }
}

function fetchTcContextStackStatus() {
    return fetch('/api/rag/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            applyTcContextStackStatus(data);
            return data;
        })
        .catch(function() {
            applyTcContextStackStatus({});
            return null;
        });
}

function initTcContextStack() {
    fetchTcContextStackStatus();
}

function resolveTcQueryForRetrieval(reqSummary, mode, userPrompt) {
    var summary = String(reqSummary || '').trim();
    var prompt = String(userPrompt || '').trim();
    if (summary) {
        return fetchTcRagSummarizeQuery(summary, mode).then(function(q) {
            var query = String(q || '').trim();
            return query || summary.slice(0, 500);
        });
    }
    return Promise.resolve(prompt);
}

function tcApplyBudgetToBundle(bundle, stage) {
    bundle = bundle || {};
    if (typeof tcAllocateContextLayers !== 'function') return bundle;
    var allocated = tcAllocateContextLayers({
        requirements: { text: bundle.requirements || '', chunks: [] },
        personal: { text: '', chunks: [] },
        public: { text: bundle.publicContext || '', chunks: bundle.publicChunks || [] }
    }, stage || 'module');
    var layers = allocated.layers || {};
    bundle.requirements = (layers.requirements && layers.requirements.text) || bundle.requirements || '';
    bundle.personalContext = '';
    bundle.publicContext = (layers.public && layers.public.text) || '';
    bundle.personalChunks = [];
    bundle.publicChunks = (layers.public && layers.public.chunks) || bundle.publicChunks || [];
    bundle.ragContext = bundle.publicContext || '';
    bundle.contextBudget = allocated.budget;
    return bundle;
}

function emitTcRagContextCheck(hooks, ragEnabled, validateEnabled) {
    if (hooks && typeof hooks.onRagContextCheck === 'function') {
        hooks.onRagContextCheck(!!ragEnabled, !!validateEnabled);
    } else if (hooks && typeof hooks.onRagCheck === 'function') {
        hooks.onRagCheck(!!ragEnabled);
    }
}

function emitTcRagContextDone(hooks, info) {
    info = info || {};
    if (hooks && typeof hooks.onRagContextDone === 'function') {
        hooks.onRagContextDone(info);
    } else if (hooks && typeof hooks.onLegacyDone === 'function') {
        hooks.onLegacyDone(!!info.hit);
    }
}

function emitTcLanhuDone(hooks, ok) {
    if (hooks && typeof hooks.onLanhuDone === 'function') {
        hooks.onLanhuDone(!!ok);
    }
}

function fetchTcLanhuRequirementsWithHooks(creds, hooks) {
    if (hooks && typeof hooks.onLanhuStart === 'function') {
        hooks.onLanhuStart();
    }
    var pageName = '';
    if (typeof window.getTcLanhuDocTreeMeta === 'function') {
        var meta = window.getTcLanhuDocTreeMeta() || {};
        pageName = String(meta.selectedPageName || '').trim();
    }
    return fetchTcLanhuRequirementsSummary(creds.cookie, creds.url, {
        page_id: creds.page_id || '',
        doc_id: (typeof getTcLanhuDocIdForPageCache === 'function' ? getTcLanhuDocIdForPageCache() : ''),
        page_name: pageName
    })
        .then(function(summary) {
            emitTcLanhuDone(hooks, true);
            return summary;
        })
        .catch(function(err) {
            emitTcLanhuDone(hooks, false);
            throw err;
        });
}

/** legacy：仅平台公共 RAG（勾选 RAG 召回时） */
function resolveTcGenerateKnowledgeContextLegacy(mode, hooks) {
    hooks = hooks || {};
    var validateEnabled = !!hooks.validateEnabled;
    var creds = getTcLanhuCredentialsForMode(mode);
    var hasLanhu = !!(creds.cookie && creds.url);
    var hasPublic = isTcRagEnabled();

    function finishBundle(reqSummary, ragCtx) {
        return {
            requirements: String(reqSummary || '').trim(),
            personalContext: '',
            publicContext: String(ragCtx || '').trim(),
            ragContext: String(ragCtx || '').trim(),
            publicChunks: [],
            personalChunks: [],
            query: ''
        };
    }

    function runRetrieval(query) {
        if (!hasPublic) return Promise.resolve('');
        if (hooks.onLegacyStart) hooks.onLegacyStart();
        return fetchTcRagRetrieveContext(query, { includePublic: true });
    }

    function runRagPipeline(reqSummary) {
        reqSummary = String(reqSummary || '').trim();
        emitTcRagContextCheck(hooks, hasPublic, validateEnabled);
        if (!hasPublic) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle(reqSummary, ''));
        }
        if (hasLanhu && reqSummary) {
            if (hooks.onSummarizeStart) hooks.onSummarizeStart();
            return fetchTcRagSummarizeQuery(reqSummary, mode).then(function(query) {
                var q = String(query || '').trim();
                if (!q) {
                    emitTcRagContextDone(hooks, {
                        hit: false,
                        ragEnabled: true,
                        validateEnabled: validateEnabled
                    });
                    return finishBundle(reqSummary, '');
                }
                return runRetrieval(q).then(function(ragCtx) {
                    emitTcRagContextDone(hooks, {
                        hit: !!String(ragCtx || '').trim(),
                        ragEnabled: true,
                        validateEnabled: validateEnabled
                    });
                    return finishBundle(reqSummary, ragCtx);
                });
            });
        }
        emitTcRagContextDone(hooks, {
            hit: false,
            ragEnabled: true,
            validateEnabled: validateEnabled,
            skipReason: hasLanhu ? '' : '缺少蓝湖摘要，未检索'
        });
        return Promise.resolve(finishBundle(reqSummary, ''));
    }

    if (hasLanhu) {
        return fetchTcLanhuRequirementsWithHooks(creds, hooks).then(runRagPipeline);
    }
    emitTcLanhuDone(hooks, false);
    return runRagPipeline('');
}

/** Context Stack：蓝湖 + 平台公共 RAG，带 budget */
function resolveTcGenerateKnowledgeContextStack(mode, hooks) {
    hooks = hooks || {};
    var validateEnabled = !!hooks.validateEnabled;
    var stage = hooks.contextStage || 'module';
    var creds = getTcLanhuCredentialsForMode(mode);
    var hasLanhu = !!(creds.cookie && creds.url);
    var hasPublic = isTcRagEnabled() && isTcPublicRagAdmin();
    var userPrompt = String(hooks.userPrompt || '').trim();

    function finishBundle(reqSummary, publicCtx, query, publicChunks) {
        var bundle = {
            requirements: String(reqSummary || '').trim(),
            personalContext: '',
            publicContext: String(publicCtx || '').trim(),
            personalChunks: [],
            publicChunks: publicChunks || [],
            query: String(query || '').trim()
        };
        bundle.ragContext = bundle.publicContext;
        return tcApplyBudgetToBundle(bundle, stage);
    }

    function runRetrieval(query, reqSummary) {
        if (!hasPublic) {
            return Promise.resolve(finishBundle(reqSummary, '', query, []));
        }
        if (hooks.onLegacyStart) hooks.onLegacyStart();
        return fetchTcRagRetrieveContext(query, { includePublic: true, returnMeta: true })
            .then(function(publicMeta) {
                publicMeta = publicMeta || {};
                TC_LAST_PUBLIC_RAG_CHUNKS = publicMeta.chunks || [];
                return finishBundle(reqSummary, publicMeta.context || '', query, TC_LAST_PUBLIC_RAG_CHUNKS);
            });
    }

    function afterRequirements(reqSummary) {
        reqSummary = String(reqSummary || '').trim();
        emitTcRagContextCheck(hooks, hasPublic, validateEnabled);
        if (!hasPublic && !reqSummary) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle('', '', '', []));
        }
        if (!hasPublic) {
            emitTcRagContextDone(hooks, {
                hit: false,
                ragEnabled: false,
                validateEnabled: validateEnabled,
                skipReason: '未开启 RAG'
            });
            return Promise.resolve(finishBundle(reqSummary, '', '', []));
        }
        if (hooks.onSummarizeStart) hooks.onSummarizeStart();
        return resolveTcQueryForRetrieval(reqSummary, mode, userPrompt).then(function(query) {
            var q = String(query || '').trim();
            if (!q) {
                emitTcRagContextDone(hooks, {
                    hit: false,
                    ragEnabled: true,
                    validateEnabled: validateEnabled
                });
                return finishBundle(reqSummary, '', '', []);
            }
            return runRetrieval(q, reqSummary).then(function(bundle) {
                emitTcRagContextDone(hooks, {
                    hit: !!String((bundle && bundle.publicContext) || '').trim(),
                    ragEnabled: true,
                    validateEnabled: validateEnabled
                });
                return bundle;
            });
        });
    }

    if (hasLanhu) {
        return fetchTcLanhuRequirementsWithHooks(creds, hooks).then(afterRequirements);
    }
    emitTcLanhuDone(hooks, false);
    return afterRequirements('');
}

window.tcPublicRagAdminUnlocked = tcPublicRagAdminUnlocked;
window.isTcContextStackEnabled = isTcContextStackEnabled;
window.isTcPublicRagAdmin = isTcPublicRagAdmin;
window.applyTcContextStackStatus = applyTcContextStackStatus;
window.syncTcRagVisibilityForRole = syncTcRagVisibilityForRole;
window.resolveTcGenerateKnowledgeContextLegacy = resolveTcGenerateKnowledgeContextLegacy;
window.resolveTcGenerateKnowledgeContextStack = resolveTcGenerateKnowledgeContextStack;

/* ---- tc_rag_feature.js ---- */
/**
 * TestHub TC Workbench — L2 SERVICES
 * Split from templates/index.html; preserves global scope for onclick/defer scripts.
 */
function paintTcRagToggleUi() {
    syncTcRagEnableHint();
    var btn = document.getElementById('tc-rag-toggle-label');
    var el = document.getElementById('tc-rag-enabled');
    if (!btn || !el) return;
    var locked = !isTcRagFeatureUnlocked();
    var on = !!el.checked && !locked;
    btn.classList.toggle('tc-gen-toggle-btn--locked', locked);
    btn.classList.toggle('tc-gen-toggle-btn--on', on);
    btn.classList.toggle('tc-gen-toggle-btn--off', !on && !locked);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function updateTcRagToggleHint(extraHint) {
    var stackOn = typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled();
    var base = stackOn
        ? '开启后检索平台公共知识库；未配蓝湖时仍可用公共库'
        : '开启后检索平台公共知识库；须先填写蓝湖 Cookie 与文档 URL';
    var hint = extraHint ? base + '（' + extraHint + '）' : base;
    var label = document.getElementById('tc-rag-toggle-label');
    if (label) label.title = hint;
    var staticHint = document.getElementById('tc-rag-toggle-static-hint');
    if (staticHint && isTcRagFeatureUnlocked()) {
        staticHint.textContent = hint;
    }
    if (typeof refreshTcRagHelpTip === 'function') refreshTcRagHelpTip();
}

function initTcRagToggle() {
    if (typeof initTcContextStack === 'function') initTcContextStack();
    var el = document.getElementById('tc-rag-enabled');
    var label = document.getElementById('tc-rag-toggle-label');
    if (!el || !label) return;
    el.checked = false;
    paintTcRagToggleUi();
    syncTcRagLockChrome();
    label.addEventListener('click', function(e) {
        e.preventDefault();
        if (!isTcRagFeatureUnlocked()) {
            requestTcFeatureUnlock('rag', function() {
                setTcRagToggleEnabled(true);
            });
            return;
        }
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    el.addEventListener('change', function() {
        if (!isTcRagFeatureUnlocked()) {
            el.checked = false;
            return;
        }
        paintTcRagToggleUi();
        if (el.checked) updateTcRagStatusHint();
        else updateTcRagToggleHint('');
    });
    if (isTcRagFeatureUnlocked()) updateTcRagStatusHint();
}

function updateTcRagStatusHint() {
    fetch('/api/rag/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (typeof applyTcContextStackStatus === 'function') {
                applyTcContextStackStatus(data);
            }
            if (!data.enabled) {
                updateTcRagToggleHint('服务端未启用');
                return;
            }
            var hint = data.available ? '已启用' : '知识库未导入';
            if (isTcContextStackEnabled && isTcContextStackEnabled()) {
                hint = data.available ? '管理员公共库 · 已启用' : '管理员公共库 · 未导入';
            }
            updateTcRagToggleHint(hint);
        })
        .catch(function() {
            updateTcRagToggleHint('');
        });
}

function getTcAiCredentialsForMode(mode) {
    return {
        use_builtin: true,
        base_url: TC_AI_PRESET.baseUrl || '',
        api_key: TC_AI_PRESET.apiKey || '',
        model: TC_AI_PRESET.model || '',
        temperature: TC_AI_PRESET.temperature
    };
}

function fetchTcRagSummarizeQuery(lanhuSummary, mode) {
    var text = String(lanhuSummary || '').trim();
    if (!text) return Promise.resolve('');
    var creds = getTcAiCredentialsForMode(mode);
    var body = {
        text: text,
        use_builtin: !!creds.use_builtin
    };
    if (!creds.use_builtin) {
        body.base_url = creds.base_url;
        body.api_key = creds.api_key;
        body.model = creds.model;
        if (creds.temperature) body.temperature = creds.temperature;
    } else if (creds.temperature) {
        body.temperature = creds.temperature;
    }
    return fetch('/api/rag/summarize-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
        .then(function(response) {
            return response.json().catch(function() {
                console.warn('[TestHub] RAG summarize: 非 JSON 响应 HTTP', response.status);
                return { query: '', error: 'bad response' };
            });
        })
        .then(function(data) {
            if (data.error) {
                console.warn('[TestHub] RAG summarize:', data.error);
                return '';
            }
            return String(data.query != null ? data.query : '').trim();
        })
        .catch(function(err) {
            console.warn('[TestHub] RAG summarize failed:', err && err.message ? err.message : err);
            return '';
        });
}

/**
 * 平台公共库 RAG 检索（RAG 召回勾选时调用）
 */
function fetchTcRagRetrieveContext(queryText, opts) {
    opts = opts || {};
    var q = String(queryText || '').trim();
    var emptyMeta = { context: '', chunks: [] };
    if (!q || !opts.includePublic) {
        return opts.returnMeta ? Promise.resolve(emptyMeta) : Promise.resolve('');
    }
    return fetch('/api/rag/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: q, include_public: true })
    })
        .then(function(response) {
            return response.json().catch(function() {
                throw new Error('检索知识库失败：服务返回非 JSON（HTTP ' + response.status + '）');
            }).then(function(data) {
                return { response: response, data: data };
            });
        })
        .then(function(wrapped) {
            var response = wrapped.response;
            var data = wrapped.data || {};
            if (response.status === 403) {
                console.warn('[TestHub] RAG retrieve: 403 无公共库权限');
                return opts.returnMeta ? emptyMeta : '';
            }
            if (data.error) {
                console.warn('[TestHub] RAG retrieve:', data.error);
                return opts.returnMeta ? emptyMeta : '';
            }
            var ctx = String(data.context != null ? data.context : '').trim();
            if (opts.returnMeta) {
                return { context: ctx, chunks: data.chunks || [] };
            }
            return ctx;
        })
        .catch(function(err) {
            console.warn('[TestHub] RAG retrieve failed:', err && err.message ? err.message : err);
            return opts.returnMeta ? emptyMeta : '';
        });
}

/** @deprecated 保留别名，仅检索平台公共库 */
function fetchTcLegacyRequirementsSummary(queryText) {
    if (!isTcRagEnabled()) return Promise.resolve('');
    return fetchTcRagRetrieveContext(queryText, { includePublic: true });
}

/** 蓝湖需求 + 平台公共库检索（Context Stack 或 legacy 路径）
 * 单页需求：内存 pageCache → DB tc_lanhu_page_content_cache → 蓝湖 page-chars 兜底 */
function resolveTcGenerateKnowledgeContext(mode, hooks) {
    if (typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled() &&
        typeof resolveTcGenerateKnowledgeContextStack === 'function') {
        return resolveTcGenerateKnowledgeContextStack(mode, hooks);
    }
    if (typeof resolveTcGenerateKnowledgeContextLegacy === 'function') {
        return resolveTcGenerateKnowledgeContextLegacy(mode, hooks);
    }
    hooks = hooks || {};
    return Promise.resolve({ requirements: '', personalContext: '', publicContext: '', ragContext: '', publicChunks: [] });
}

function buildTcComposeOptsFromBundle(bundle) {
    bundle = bundle || {};
    var stackOn = typeof isTcContextStackEnabled === 'function' && isTcContextStackEnabled();
    if (stackOn) {
        return {
            contextStackEnabled: true,
            personalContext: bundle.personalContext || '',
            publicContext: bundle.publicContext || '',
            legacyRag: bundle.ragContext || ''
        };
    }
    return { legacyRag: bundle.ragContext || '' };
}

/** 用例生成上下文：蓝湖 → 总结 → 知识库 → 拼装 Prompt */
function resolveTcCaseGenerateContext(userPrompt, mode, hooks, composeFn) {
    hooks = hooks || {};
    hooks.userPrompt = userPrompt;
    return resolveTcGenerateKnowledgeContext(mode, hooks).then(function (bundle) {
        bundle = bundle || {};
        window.TC_LAST_GENERATE_KNOWLEDGE_BUNDLE = bundle;
        var lanhuCreds = typeof getTcLanhuCredentialsForMode === 'function'
            ? getTcLanhuCredentialsForMode(mode) : { cookie: '', url: '' };
        if (typeof tcCaptureGenerationLanhuContext === 'function') {
            tcCaptureGenerationLanhuContext(mode, bundle.requirements);
        }
        tcPendingGenerationProvenance = tcBuildGenerationProvenance(
            bundle.requirements,
            {
                personalContext: bundle.personalContext,
                publicContext: bundle.publicContext,
                publicChunks: bundle.publicChunks,
                personalChunks: bundle.personalChunks,
                ragContext: bundle.ragContext,
                lanhuUrl: lanhuCreds.url || ''
            }
        );
        if (typeof tcEnsurePendingGenerationProvenance === 'function') {
            tcEnsurePendingGenerationProvenance(mode);
        }
        var composeOpts = buildTcComposeOptsFromBundle(bundle);
        return composeFn(userPrompt, bundle.requirements, composeOpts);
    });
}

function resolveListCaseGeneratePrompt(userPrompt, mode, hooks) {
    return resolveTcCaseGenerateContext(userPrompt, mode, hooks, function(up, req, opts) {
        var composeOpts = Object.assign({ mindmap: false }, opts || {});
        if (typeof getTcPreviousGenUserPrompts === 'function') {
            composeOpts.previousUserPrompts = getTcPreviousGenUserPrompts();
        }
        return composeTcAiGeneratePrompt(up, req, composeOpts);
    });
}

/** 导图用例生成：蓝湖 → 总结 → RAG → 独立导图 Prompt（不含表头/历史输入） */
function resolveMindmapCaseGeneratePrompt(userPrompt, mode, hooks) {
    return resolveTcCaseGenerateContext(userPrompt, mode, hooks, function(up, req, opts) {
        return composeMindmapCaseGeneratePrompt(up, req, mode, opts || {});
    });
}

var TC_LANHU_MODULE_GEN_MIN_CHARS = (typeof window.TC_LANHU_MODULE_GEN_MIN_CHARS === 'number'
    && window.TC_LANHU_MODULE_GEN_MIN_CHARS > 0) ? window.TC_LANHU_MODULE_GEN_MIN_CHARS : 2000;
var _tcLanhuPageCacheDbInflight = null;
var _tcLanhuPageCacheDbDocId = '';

function getTcLanhuDocIdForPageCache() {
    if (typeof window.getTcLanhuDocTreeMeta === 'function') {
        var meta = window.getTcLanhuDocTreeMeta() || {};
        var docId = String(meta.docId || '').trim();
        if (docId) return docId;
    }
    return '';
}

function resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = String(opts.page_id || opts.pageId || '').trim();
    if (!pageId) {
        var pageMatch = String(lanhuUrl || '').match(/[?&]pageId=([^&]+)/i);
        if (pageMatch && pageMatch[1]) {
            try { pageId = decodeURIComponent(pageMatch[1]); } catch (ePage) { pageId = pageMatch[1]; }
        }
    }
    return pageId;
}

function tcLanhuUseModulePipelineFromChars(chars) {
    var n = parseInt(chars, 10);
    if (isNaN(n) || n < 0) n = 0;
    return n >= TC_LANHU_MODULE_GEN_MIN_CHARS;
}

function applyTcLanhuFetchMetaFromChars(chars) {
    var n = parseInt(chars, 10);
    if (isNaN(n) || n < 0) n = 0;
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = n > 0 ? n : 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = tcLanhuUseModulePipelineFromChars(n);
}

function applyTcLanhuFetchMeta(data) {
    data = data || {};
    if (data.from_cache) {
        applyTcLanhuFetchMetaFromChars(data.page_text_chars);
        return;
    }
    var chars = parseInt(data.page_text_chars, 10);
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = (!isNaN(chars) && chars > 0) ? chars : 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = !!data.use_module_pipeline;
}

function resetTcLanhuFetchMeta() {
    window.TC_LAST_LANHU_PAGE_TEXT_CHARS = 0;
    window.TC_LAST_LANHU_USE_MODULE_PIPELINE = false;
}

function readTcLanhuPageCacheFromMemory(pageId) {
    pageId = String(pageId || '').trim();
    if (!pageId || typeof window.getTcLanhuPageCacheEntry !== 'function') return null;
    var entry = window.getTcLanhuPageCacheEntry(pageId);
    if (!entry || entry.loading || entry.error) return null;
    var text = String(entry.text || '').trim();
    if (!text) return null;
    var chars = parseInt(entry.chars, 10);
    if (isNaN(chars) || chars < 0) chars = text.length;
    return { text: text, chars: chars, source: 'memory' };
}

function fetchTcLanhuPageCacheFromDb(docId, pageId) {
    docId = String(docId || '').trim();
    pageId = String(pageId || '').trim();
    if (!docId || !pageId) return Promise.resolve(null);
    if (_tcLanhuPageCacheDbInflight && _tcLanhuPageCacheDbDocId === docId) {
        return _tcLanhuPageCacheDbInflight.then(function (items) {
            items = items || [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item && String(item.page_id || '') === pageId) {
                    var text = String(item.content_text || '').trim();
                    if (!text) return null;
                    var chars = parseInt(item.content_chars, 10);
                    if (isNaN(chars) || chars < 0) chars = text.length;
                    return { text: text, chars: chars, source: 'db' };
                }
            }
            return null;
        });
    }
    _tcLanhuPageCacheDbDocId = docId;
    _tcLanhuPageCacheDbInflight = fetch('/api/lanhu-page-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ doc_id: docId })
    }).then(function (response) {
        return response.json().catch(function () { return { items: [] }; });
    }).then(function (data) {
        return (data && data.items) ? data.items : [];
    }).catch(function () {
        return [];
    }).finally(function () {
        _tcLanhuPageCacheDbInflight = null;
        _tcLanhuPageCacheDbDocId = '';
    });
    return _tcLanhuPageCacheDbInflight.then(function (items) {
        items = items || [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item && String(item.page_id || '') === pageId) {
                var text = String(item.content_text || '').trim();
                if (!text) return null;
                var chars = parseInt(item.content_chars, 10);
                if (isNaN(chars) || chars < 0) chars = text.length;
                return { text: text, chars: chars, source: 'db' };
            }
        }
        return null;
    });
}

function resolveTcLanhuRequirementsFromCache(pageId, docId) {
    pageId = String(pageId || '').trim();
    if (!pageId) return Promise.resolve(null);
    var mem = readTcLanhuPageCacheFromMemory(pageId);
    if (mem) return Promise.resolve(mem);
    return fetchTcLanhuPageCacheFromDb(docId, pageId);
}

function fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts);
    var docId = String(opts.doc_id || opts.docId || getTcLanhuDocIdForPageCache() || '').trim();
    if (pageId) {
        return fetch('/api/lanhu-page-chars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                lanhu_cookie: lanhuCookie,
                lanhu_url: lanhuUrl,
                page_id: pageId,
                doc_id: docId,
                page_name: String(opts.page_name || '').trim()
            })
        }).then(function (response) {
            return response.json().catch(function () {
                throw new Error('获取蓝湖页面需求失败：服务返回非 JSON（HTTP ' + response.status + '）');
            });
        }).then(function (data) {
            if (data.error) throw new Error(data.error);
            var text = String(data.page_text || '').trim();
            var chars = parseInt(data.page_text_chars, 10);
            if (isNaN(chars) || chars < 0) chars = text.length;
            applyTcLanhuFetchMetaFromChars(chars);
            return text;
        });
    }
    var body = { lanhu_cookie: lanhuCookie, lanhu_url: lanhuUrl };
    return fetch('/api/lanhu-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function (response) {
        return response.json().catch(function () {
            throw new Error('获取蓝湖需求失败：服务返回非 JSON（HTTP ' + response.status + '）');
        });
    }).then(function (data) {
        if (data.error) throw new Error(data.error);
        applyTcLanhuFetchMeta(data);
        return String(data.summary != null ? data.summary : '').trim();
    });
}

function fetchTcLanhuRequirementsSummary(lanhuCookie, lanhuUrl, opts) {
    if (!lanhuCookie || !lanhuUrl) {
        resetTcLanhuFetchMeta();
        return Promise.resolve('');
    }
    opts = opts && typeof opts === 'object' ? opts : {};
    var pageId = resolveTcLanhuPageIdFromUrlOrOpts(lanhuUrl, opts);
    var docId = String(opts.doc_id || opts.docId || getTcLanhuDocIdForPageCache() || '').trim();
    if (!pageId) {
        return fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts);
    }
    return resolveTcLanhuRequirementsFromCache(pageId, docId).then(function (cached) {
        if (cached && cached.text) {
            applyTcLanhuFetchMetaFromChars(cached.chars);
            return cached.text;
        }
        return fetchTcLanhuRequirementsSummaryLive(lanhuCookie, lanhuUrl, opts);
    });
}

function buildTableRowsSnippetFromIndices(indices) {
    if (!indices || !indices.length) return '(空)';
    return indices.map(function(i) {
        const row = testCasesData[i] || [];
        return tableColumns.map(function(col, j) {
            return col + ': ' + (row[j] != null ? String(row[j]) : '');
        }).join(' | ');
    }).join('\n');
}

/** 内网预设：运行时缓存，来源为 GET /api/builtin-ai/config（MySQL） */
var TC_AI_PRESET = {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: '0.1'
};

function applyTcAiPresetToObject(cfg, skipEvent) {
    if (!cfg) return;
    if (cfg.base_url) TC_AI_PRESET.baseUrl = cfg.base_url;
    if (cfg.api_key != null) TC_AI_PRESET.apiKey = cfg.api_key;
    if (cfg.model) TC_AI_PRESET.model = cfg.model;
    if (cfg.temperature != null) TC_AI_PRESET.temperature = String(cfg.temperature);
    if (!skipEvent) {
        document.dispatchEvent(new CustomEvent('th-ai-preset-updated', { detail: cfg }));
    }
}

function syncTcPresetModelSummary() {
    ['tc-preset-model-summary', 'ctm-preset-model-summary'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    });
}

function loadTcAiPresetFromServer() {
    function applyUserOrBuiltin(userData, me) {
        if (userData && userData.configured) {
            applyTcAiPresetToObject(userData);
            syncTcPresetModelSummary();
            return userData;
        }
        if (me && me.can_manage_builtin_ai) {
            return fetch('/api/builtin-ai/config', { credentials: 'same-origin' })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (data) {
                    applyTcAiPresetToObject(data);
                    syncTcPresetModelSummary();
                    return data;
                });
        }
        applyTcAiPresetToObject(userData || {});
        syncTcPresetModelSummary();
        return userData;
    }
    var mePromise = (window.HfAuthNav && window.HfAuthNav.fetchMe)
        ? window.HfAuthNav.fetchMe()
        : fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    return mePromise.then(function (me) {
        if (!me || !me.authenticated) {
            applyTcAiPresetToObject({});
            syncTcPresetModelSummary();
            return null;
        }
        return fetch('/api/user-ai-config', { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (userData) { return applyUserOrBuiltin(userData, me); });
    });
}

function saveTcAiPresetToServer(baseUrl, apiKey, model) {
    var temp = parseFloat(TC_AI_PRESET.temperature);
    if (isNaN(temp)) temp = 0.1;
    return fetch('/api/user-ai-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base_url: baseUrl,
            api_key: apiKey,
            model: model,
            temperature: temp
        })
    }).then(function(r) {
        return r.json().then(function(data) {
            if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
            applyTcAiPresetToObject({ base_url: baseUrl, api_key: apiKey, model: model, temperature: temp });
            if (window.HfUserAiConfig && window.HfUserAiConfig.loadConfig) {
                window.HfUserAiConfig.loadConfig(true);
            }
            return data;
        });
    });
}

function openTcPresetModelModal() {
    var modal = document.getElementById('tc-preset-model-modal');
    var urlInp = document.getElementById('tc-preset-modal-base-url');
    var keyInp = document.getElementById('tc-preset-modal-api-key');
    var modelInp = document.getElementById('tc-preset-modal-model');
    if (!modal || !urlInp || !keyInp || !modelInp) return;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);

    loadTcAiPresetFromServer()
        .catch(function() { /* 沿用已加载的 TC_AI_PRESET */ })
        .finally(function() {
            urlInp.value = TC_AI_PRESET.baseUrl || '';
            keyInp.value = TC_AI_PRESET.apiKey || '';
            modelInp.value = TC_AI_PRESET.model || '';
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            urlInp.focus();
        });
}

function closeTcPresetModelModal() {
    var modal = document.getElementById('tc-preset-model-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function initTcPresetModelSettingsUi() {
    loadTcAiPresetFromServer().catch(function() { /* 首次失败时生成仍会在保存后可用 */ });

    var cancelBtn = document.getElementById('tc-preset-model-cancel-btn');
    var saveBtn = document.getElementById('tc-preset-model-save-btn');
    var modal = document.getElementById('tc-preset-model-modal');
    if (cancelBtn) cancelBtn.addEventListener('click', closeTcPresetModelModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeTcPresetModelModal();
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            var urlInp = document.getElementById('tc-preset-modal-base-url');
            var keyInp = document.getElementById('tc-preset-modal-api-key');
            var modelInp = document.getElementById('tc-preset-modal-model');
            var baseUrl = (urlInp && urlInp.value || '').trim();
            var apiKey = (keyInp && keyInp.value || '').trim();
            var model = (modelInp && modelInp.value || '').trim();
            if (!baseUrl || !apiKey || !model) {
                tcAppAlert('请填写 API 地址、API Key 与模型名称。', { variant: 'warning', title: '参数不完整' });
                return;
            }
            saveBtn.disabled = true;
            saveTcAiPresetToServer(baseUrl, apiKey, model)
                .then(function(data) {
                    applyTcAiPresetToObject(data);
                    syncTcPresetModelSummary();
                    closeTcPresetModelModal();
                    tcAppToast('内网模型连接已保存到服务器。', { variant: 'success', duration: 2800 });
                })
                .catch(function(err) {
                    tcAppAlert((err && err.message) || '保存失败', { variant: 'error', title: '保存失败' });
                })
                .finally(function() { saveBtn.disabled = false; });
        });
    }
    document.addEventListener('keydown', function tcPresetModelEsc(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('flex')) closeTcPresetModelModal();
    });
}

var TC_FEATURE_UNLOCK_PASSWORD = 'hugokit.123';
var TC_FEATURE_UNLOCK_STATE = { preset: false, rag: false };
var tcFeatureUnlockPending = null;

function isTcFeatureUnlocked(feature) {
    if (feature === 'rag') return isTcRagFeatureUnlocked();
    if (typeof hfToolkitFeatureUsable === 'function' && hfToolkitFeatureUsable()) return true;
    return !!TC_FEATURE_UNLOCK_STATE[feature];
}

function tcFeatureUnlockFlagName(feature) {
    if (feature === 'preset') return 'tc_preset';
    if (feature === 'rag') return 'tc_rag';
    return 'tc_' + feature;
}

function setTcFeatureUnlocked(feature, unlocked) {
    TC_FEATURE_UNLOCK_STATE[feature] = !!unlocked;
    hfToolkitSetUnlockFlag(tcFeatureUnlockFlagName(feature), unlocked);
    syncTcFeatureLockChrome();
    if (feature === 'rag' && !unlocked && typeof setTcRagToggleEnabled === 'function') {
        setTcRagToggleEnabled(false);
    }
}

function resetTcFeatureUnlockState() {
    TC_FEATURE_UNLOCK_STATE.preset = false;
    TC_FEATURE_UNLOCK_STATE.rag = false;
    tcFeatureUnlockPending = null;
    closeTcFeatureUnlockModal();
    syncTcFeatureLockChrome();
}

function initTcFeatureUnlockLockedState() {
    if (typeof hfToolkitFeatureUsable === 'function' && hfToolkitFeatureUsable()) {
        setTcFeatureUnlocked('preset', true);
        tcFeatureUnlockPending = null;
        syncTcFeatureLockChrome();
        return;
    }
    TC_FEATURE_UNLOCK_STATE.preset = false;
    TC_FEATURE_UNLOCK_STATE.rag = false;
    tcFeatureUnlockPending = null;
    hfToolkitSetUnlockFlag('tc_preset', false);
    hfToolkitSetUnlockFlag('tc_rag', false);
    syncTcFeatureLockChrome();
}

function syncTcFeatureLockChrome() {
    var presetLock = document.getElementById('ai-config-mode-preset-lock');
    var presetBtn = document.getElementById('ai-config-mode-preset-btn');
    var presetUnlocked = isTcFeatureUnlocked('preset');
    if (presetLock) presetLock.classList.toggle('hidden', presetUnlocked);
    if (presetBtn) presetBtn.setAttribute('aria-disabled', presetUnlocked ? 'false' : 'true');
    if (typeof syncTcRagLockChrome === 'function') syncTcRagLockChrome();
    if (window.ThAiConfigBridge && typeof window.ThAiConfigBridge.syncPresetLockChrome === 'function') {
        window.ThAiConfigBridge.syncPresetLockChrome();
    }
}

window.syncTcFeatureLockChrome = syncTcFeatureLockChrome;

function closeTcFeatureUnlockModal() {
    tcFeatureUnlockPending = null;
    var m = document.getElementById('tc-feature-unlock-modal');
    var inp = document.getElementById('tc-feature-unlock-password');
    if (inp) inp.value = '';
    if (m) {
        m.classList.add('hidden');
        m.classList.remove('flex');
    }
    document.body.style.overflow = '';
}

function openTcFeatureUnlockModal(feature, onSuccess) {
    if (typeof ensureTcWorkbenchOverlaysMounted === 'function') ensureTcWorkbenchOverlaysMounted();
    var m = document.getElementById('tc-feature-unlock-modal');
    var titleEl = document.getElementById('tc-feature-unlock-modal-title');
    var descEl = document.getElementById('tc-feature-unlock-modal-desc');
    var inp = document.getElementById('tc-feature-unlock-password');
    if (!m || !inp) {
        if (onSuccess) onSuccess();
        return;
    }
    if (m.parentNode !== document.body) document.body.appendChild(m);
    tcFeatureUnlockPending = { feature: feature, onSuccess: onSuccess };
    if (titleEl) {
        titleEl.textContent = feature === 'rag'
                ? 'RAG召回已锁定'
                : '内网预设已锁定';
    }
    if (descEl) {
        descEl.textContent = feature === 'rag'
                ? '请输入密码后开启 RAG 召回；刷新或离开本页后需重新解锁。'
                : '请输入密码后才能使用内网预设与相关 AI 生成。';
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.body.style.overflow = 'hidden';
    inp.value = '';
    setTimeout(function() { inp.focus(); }, 50);
}

function requestTcFeatureUnlock(feature, onSuccess) {
    if (isTcFeatureUnlocked(feature)) {
        if (onSuccess) onSuccess();
        return;
    }
    openTcFeatureUnlockModal(feature, onSuccess);
}

function initTcFeatureUnlockUi() {
    if (window._tcFeatureUnlockUiBound) {
        if (typeof initTcFeatureUnlockLockedState === 'function') initTcFeatureUnlockLockedState();
        return;
    }
    window._tcFeatureUnlockUiBound = true;
    var m = document.getElementById('tc-feature-unlock-modal');
    var inp = document.getElementById('tc-feature-unlock-password');
    var submit = document.getElementById('tc-feature-unlock-submit');
    var cancel = document.getElementById('tc-feature-unlock-cancel');
    if (cancel) cancel.addEventListener('click', closeTcFeatureUnlockModal);
    if (m) {
        m.addEventListener('click', function(e) {
            if (e.target === m) closeTcFeatureUnlockModal();
        });
    }
    if (submit) {
        submit.addEventListener('click', function() {
            var pending = tcFeatureUnlockPending;
            if (!pending) return;
            var pwd = (inp && inp.value || '').trim();
            if (pwd !== TC_FEATURE_UNLOCK_PASSWORD) {
                hfUnlockFailToast('密码错误，请重试');
                if (inp) inp.focus();
                return;
            }
            setTcFeatureUnlocked(pending.feature, true);
            closeTcFeatureUnlockModal();
            var cb = pending.onSuccess;
            var feat = pending.feature;
            tcFeatureUnlockPending = null;
            if (feat === 'rag') {
                tcAppToast('RAG 召回已解锁，可点击按钮开启。', { variant: 'success', duration: 2800 });
            }
            if (cb) cb();
        });
    }
    if (inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (submit) submit.click();
            }
            if (e.key === 'Escape') closeTcFeatureUnlockModal();
        });
    }
    document.addEventListener('keydown', function tcFeatureUnlockEsc(e) {
        if (e.key === 'Escape' && m && m.classList.contains('flex')) closeTcFeatureUnlockModal();
    });
    var presetBtn = document.getElementById('ai-config-mode-preset-btn');
    if (presetBtn) {
        presetBtn.addEventListener('click', function() {
            if (typeof switchAiConfigMode === 'function') switchAiConfigMode('preset');
        });
    }
    hfToolkitClearUnlockStorage();
    initTcFeatureUnlockLockedState();
}

window.__thTcAi = {
    switchMode: switchAiConfigMode,
    isPresetUnlocked: function() { return isTcFeatureUnlocked('preset'); },
    requestPresetUnlock: function(cb) { requestTcFeatureUnlock('preset', cb); },
    applyPreset: applyTcAiPresetToObject,
    getPreset: function() { return TC_AI_PRESET; }
};

document.addEventListener('th-request-preset-unlock', function(ev) {
    requestTcFeatureUnlock('preset', ev.detail && ev.detail.callback);
});
document.addEventListener('th-ai-preset-updated', function(ev) {
    applyTcAiPresetToObject(ev.detail, true);
    syncTcPresetModelSummary();
});
document.addEventListener('th-ai-config-alert', function(ev) {
    var detail = ev.detail || {};
    tcAppAlert(detail.message || '参数不完整', {
        variant: 'warning',
        title: detail.title || '提示'
    });
});
document.addEventListener('th-ai-config-toast', function(ev) {
    var detail = ev.detail || {};
    tcAppToast(detail.message || '已保存', { variant: 'success', duration: 2800 });
});

/** 内网预设提示词草稿（仅当前页内存，刷新清空） */
var tcAiPromptDrafts = { preset: '' };

function getTcAiPromptEl() {
    return document.getElementById('ai-prompt');
}

function saveTcAiPromptDraftForMode(mode) {
    var el = getTcAiPromptEl();
    if (!el) return;
    tcAiPromptDrafts.preset = el.value;
}

function loadTcAiPromptDraftForMode(mode) {
    var el = getTcAiPromptEl();
    if (!el) return;
    el.value = tcAiPromptDrafts.preset || '';
    if (typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(el);
    } else if (typeof autoResizeTextarea === 'function') {
        autoResizeTextarea(el, 36, 118);
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function clearTcAiPromptDrafts() {
    tcAiPromptDrafts = { preset: '' };
    var el = getTcAiPromptEl();
    if (el) el.value = '';
    if (typeof resizeTcAiPromptInput === 'function') resizeTcAiPromptInput(el);
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function clearTcAiPromptDraftForMode(mode) {
    tcAiPromptDrafts.preset = '';
    var el = getTcAiPromptEl();
    if (el) el.value = '';
    if (el && typeof resizeTcAiPromptInput === 'function') {
        resizeTcAiPromptInput(el);
    } else if (el && typeof autoResizeTextarea === 'function') {
        autoResizeTextarea(el, 36, 118);
    }
    if (typeof syncTcPromptSendBtnState === 'function') syncTcPromptSendBtnState();
}

function syncTcAiClearButtonsVisibility(mode) {
    var btnPreset = document.getElementById('clear-ai-form-preset');
    if (btnPreset) btnPreset.classList.remove('hidden');
}

function normalizeTcAiTemperatureInput(el, silent) {
    if (!el) return true;
    var raw = String(el.value || '').trim();
    if (!raw) {
        el.setCustomValidity('');
        return true;
    }
    var num = parseFloat(raw);
    if (Number.isNaN(num)) {
        el.setCustomValidity('请输入 0～2 之间的数字，或留空');
        if (!silent && el.reportValidity) el.reportValidity();
        return false;
    }
    if (num < 0 || num > 2) {
        el.setCustomValidity('Temperature 须在 0～2 之间');
        if (!silent && el.reportValidity) el.reportValidity();
        return false;
    }
    el.setCustomValidity('');
    var rounded = Math.round(num * 10) / 10;
    if (String(el.value) !== String(rounded)) el.value = String(rounded);
    return true;
}

function initTcAiTemperatureInput() {
    var el = document.getElementById('ai-temperature');
    if (!el || el._tcTempBound) return;
    el._tcTempBound = true;
    el.addEventListener('input', function() {
        var raw = String(el.value || '').trim();
        if (!raw || raw === '-' || raw === '.') return;
        var num = parseFloat(raw);
        if (Number.isNaN(num)) return;
        if (num > 2) el.value = '2';
        else if (num < 0) el.value = '0';
    });
    el.addEventListener('blur', function() {
        normalizeTcAiTemperatureInput(el, false);
    });
}

function initTcAiPromptIsolation() {
    var el = getTcAiPromptEl();
    if (!el || el._tcPromptIsolationBound) return;
    el._tcPromptIsolationBound = true;
    ['tc_ai_prompt_v1', 'tc_ai_prompt_preset', 'tc_ai_prompt_custom'].forEach(function(k) {
        try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
    clearTcAiPromptDrafts();
    el.setAttribute('autocomplete', 'off');
}

function getAiConfigMode() {
    return 'preset';
}



function isTcEntryLoggedInAuth() {
    var root = document.getElementById('ai-config-mode-root');
    return !!(root && root.getAttribute('data-tc-entry-auth') === 'logged-in');
}

function syncTcAiEntryAuthLayout(me) {
    var root = document.getElementById('ai-config-mode-root');
    if (!root) return;
    var authed = !!(me && me.authenticated);
    root.setAttribute('data-tc-entry-auth', authed ? 'logged-in' : 'guest');
    if (typeof switchAiConfigMode === 'function') {
        switchAiConfigMode('preset', true);
    }
    if (typeof isCollapsed !== 'undefined' && !isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
}
window.syncTcAiEntryAuthLayout = syncTcAiEntryAuthLayout;

(function initTcAiEntryAuthLayout() {
    var root = document.getElementById('ai-config-mode-root');
    if (!root) return;
    document.addEventListener('hf-auth-nav-updated', function (ev) {
        syncTcAiEntryAuthLayout(ev.detail);
    });
    function bootAuthLayout() {
        syncTcAiEntryAuthLayout(null);
        if (window.HfAuthNav && window.HfAuthNav.fetchMe) {
            window.HfAuthNav.fetchMe().then(syncTcAiEntryAuthLayout).catch(function () {
                syncTcAiEntryAuthLayout(null);
            });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootAuthLayout);
    } else {
        bootAuthLayout();
    }
})();

function syncTcAiLanhuSectionTitle() {
    var titleEl = document.getElementById('tc-ai-lanhu-section-title');
    if (!titleEl) return;
    titleEl.textContent = '蓝湖需求';
}

function syncAiConfigModeSegButtons(activeMode) {
    /* 自定义模式已移除，保留空函数避免调用方报错 */
}

function switchAiConfigMode(mode, skipUnlockCheck, forceSwitch) {
    if (!forceSwitch && typeof isTcLeftPanelNavLocked === 'function' && isTcLeftPanelNavLocked()) {
        if (typeof tcAppToast === 'function') {
            tcAppToast('生成进行中，无法切换配置', { variant: 'warning', duration: 2800 });
        }
        return;
    }
    var prevMode = getAiConfigMode();
    saveTcAiPromptDraftForMode(prevMode);
    if (!skipUnlockCheck && !isTcFeatureUnlocked('preset')) {
        requestTcFeatureUnlock('preset', function() {
            switchAiConfigMode('preset', true);
        });
        return;
    }
    var root = document.getElementById('ai-config-mode-root');
    var presetPanel = document.getElementById('ai-config-preset-panel');
    if (!root || !presetPanel) return;
    root.setAttribute('data-mode', 'preset');
    var presetGenWrap = document.getElementById('tc-generate-preset-wrap');
    presetPanel.classList.remove('hidden');
    if (presetGenWrap) presetGenWrap.classList.remove('hidden');
    syncTcAiClearButtonsVisibility('preset');
    syncTcPresetModelSummary();
    if (typeof autoGrowTcPresetLanhuField === 'function') {
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-cookie'));
        autoGrowTcPresetLanhuField(document.getElementById('lanhu-url'));
    }
    syncTcAiLanhuSectionTitle();
    if (window.TcWorkbenchEnhancements && typeof window.TcWorkbenchEnhancements.remountLanhuTooldeckControls === 'function') {
        window.TcWorkbenchEnhancements.remountLanhuTooldeckControls();
    }
    loadTcAiPromptDraftForMode('preset');
    if (!isCollapsed && typeof tcLeftFloatRefreshContentHeights === 'function') {
        tcLeftFloatRefreshContentHeights();
    }
    if (!isCollapsed && typeof tcLeftFloatAdaptContentToPanel === 'function') {
        tcLeftFloatAdaptContentToPanel();
    }
    if (window.TcLeftPanelLock && typeof window.TcLeftPanelLock.applyLockUi === 'function') {
        window.TcLeftPanelLock.applyLockUi();
    } else {
        syncAiConfigModeSegButtons('preset');
    }
    if (typeof syncTcFeatureLockChrome === 'function') syncTcFeatureLockChrome();
}

function getTcGenerateActionButtons() {
    return ['generate-test-cases', 'generate-test-cases-preset-mindmap']
        .map(function(id) { return document.getElementById(id); })
        .filter(Boolean);
}

/**
 * scope: legacy_freeform | append_selected | append_whole | rewrite_selected
 * options.outputTarget: list | mindmap（导图生成成功后自动切换右侧思维导图）
 */

