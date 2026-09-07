/**
 * JMeter catalog · 取样器/逻辑控制器挂载区工具栏（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function isCatalogSampler(step) {
        if (!step || step.container) return false;
        if (step.method) return true;
        if (step.type !== 'catalog_element') return false;
        if (step.alias === 'DebugSampler') return true;
        return step.category === 'sampler';
    }

    function isCatalogController(step) {
        if (!step || step.type !== 'catalog_element') return false;
        return !!step.container;
    }

    function renderDropdown(btnClass, btnLabel, menuClass) {
        return '<div class="' + menuClass + ' jms-catalog-mount-ctx-more">' +
            '<button type="button" class="jms-catalog-mount-ctx-btn ' + btnClass + '">' +
            esc(btnLabel) + '<span class="jms-catalog-mount-ctx-caret">▾</span></button>' +
            '<div class="jms-catalog-mount-ctx-menu" aria-hidden="true"></div></div>';
    }

    function renderSamplerToolbar(stepId) {
        var sid = esc(stepId);
        return '<div class="jms-if-mount-context__toolbar jms-catalog-mount-context__toolbar" data-catalog-step-id="' + sid + '">' +
            renderDropdown('jms-catalog-mount-ctx-btn-config', '配置元件', 'jms-catalog-mount-ctx-config-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-preproc', '前置处理器', 'jms-catalog-mount-ctx-preproc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-timer', '定时器', 'jms-catalog-mount-ctx-timer-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-processors', '后置处理器', 'jms-catalog-mount-ctx-proc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-assert', '断言', 'jms-catalog-mount-ctx-assert-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-listeners', '监听器', 'jms-catalog-mount-ctx-listener-more') +
            '</div>';
    }

    function renderControllerToolbar(stepId) {
        var sid = esc(stepId);
        return '<div class="jms-if-mount-context__toolbar jms-catalog-mount-context__toolbar" data-catalog-step-id="' + sid + '">' +
            renderDropdown('jms-catalog-mount-ctx-btn-sampler', '取样器', 'jms-catalog-mount-ctx-sampler-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-logic', '逻辑控制器', 'jms-catalog-mount-ctx-logic-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-config', '配置元件', 'jms-catalog-mount-ctx-config-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-preproc', '前置处理器', 'jms-catalog-mount-ctx-preproc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-timer', '定时器', 'jms-catalog-mount-ctx-timer-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-processors', '后置处理器', 'jms-catalog-mount-ctx-proc-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-assert', '断言', 'jms-catalog-mount-ctx-assert-more') +
            renderDropdown('jms-catalog-mount-ctx-btn-listeners', '监听器', 'jms-catalog-mount-ctx-listener-more') +
            '</div>';
    }

    function renderPanel(step, planId, tgId) {
        if (!isTreeView() || !step || step.type !== 'catalog_element') return '';
        var mode = '';
        if (isCatalogSampler(step)) mode = 'sampler';
        else if (isCatalogController(step)) mode = 'controller';
        if (!mode) return '';
        var toolbar = mode === 'sampler'
            ? renderSamplerToolbar(step.id)
            : renderControllerToolbar(step.id);
        return '<div class="jms-if-mount-context jms-if-mount-context--toolbar-only jms-catalog-mount-context jms-catalog-mount-context--' + mode + '"' +
            ' data-plan-id="' + esc(planId) + '"' +
            ' data-tg-id="' + esc(tgId) + '"' +
            ' data-catalog-step-id="' + esc(step.id) + '"' +
            ' data-catalog-mount-mode="' + mode + '">' + toolbar + '</div>';
    }

    global.JmsCatalogMountContextUi = {
        renderPanel: renderPanel,
        isCatalogSampler: isCatalogSampler,
        isCatalogController: isCatalogController
    };
})(window);
