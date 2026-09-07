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
