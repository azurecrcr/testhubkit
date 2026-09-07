/**
 * JMeter Studio V2 · 前端层级规则（与 component_hierarchy_rules.py 对齐）
 */
(function (global) {
    'use strict';
    var THREAD_GROUP_ALIASES = {
        ThreadGroup: 1, SetupThreadGroup: 1, PostThreadGroup: 1, OpenModelThreadGroup: 1,
        'Custom Thread Groups': 1
    };
    var CATEGORY_BY_CONTEXT = {
        test_plan: { thread_group: 1, config: 1, listener: 1, other: 1 },
        thread_group: { controller: 1, sampler: 1, config: 1, timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, listener: 1 },
        controller: { controller: 1, sampler: 1, config: 1, timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, listener: 1 },
        sampler_child: { timer: 1, preprocessor: 1, postprocessor: 1, assertion: 1, config: 1 }
    };
    var PLAN_LEVEL_CONFIG_ALIASES = {
        HeaderManager: 1, Arguments: 1, CookieManager: 1, CacheManager: 1, AuthManager: 1,
        CSVDataSet: 1, CounterConfig: 1, RandomVariableConfig: 1, DNSCacheManager: 1,
        KeystoreConfig: 1, LoginConfig: 1, ConfigTestElement: 1
    };
    function effectiveCategory(comp, context) {
        var cat = comp.category || 'other';
        var alias = comp.alias || '';
        if (context === 'test_plan' && PLAN_LEVEL_CONFIG_ALIASES[alias]) return 'config';
        return cat;
    }
    global.JmsHierarchyRules = {
        effectiveCategory: effectiveCategory,
        componentAllowed: function (comp, context) {
            if (!comp) return false;
            var cat = effectiveCategory(comp, context);
            var alias = comp.alias || '';
            var allowed = CATEGORY_BY_CONTEXT[context] || CATEGORY_BY_CONTEXT.thread_group;
            if (!allowed[cat]) return false;
            if (THREAD_GROUP_ALIASES[alias] && context !== 'test_plan') return false;
            if (cat === 'thread_group' && context !== 'test_plan') return false;
            if (cat === 'sampler' && (context === 'test_plan' || context === 'sampler_child')) return false;
            if (context === 'sampler_child' && (cat === 'listener' || cat === 'controller')) return false;
            return true;
        },
        CATEGORY_BY_CONTEXT: CATEGORY_BY_CONTEXT
    };
})(window);
