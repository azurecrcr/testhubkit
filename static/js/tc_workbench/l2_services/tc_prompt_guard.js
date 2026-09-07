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
