/**
 * TG If 控制器 · 挂载区 UI（v1 · 独立模块 · jms-if-mount-context）
 */
(function (global) {
    'use strict';

    var Model = function () { return global.JmsIfMountModel; };
    var Coord = function () { return global.JmsIfMountMenuCoordinator; };
    var Attach = function () { return global.JmsIfMountAttachmentUi; };

    function esc(s) {
        var d = global.document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function isTreeView() {
        return global.document.body.classList.contains('lth-tg-view-tree') &&
            global.document.body.classList.contains('lth-hub-jmeter-tab');
    }

    function ensureIf(step) {
        return Model() && typeof Model().ensureMountFields === 'function'
            ? Model().ensureMountFields(step)
            : step;
    }

    function renderDropdown(btnClass, btnLabel, menuClass, itemsHtml) {
        return '<div class="' + menuClass + '">' +
            '<button type="button" class="jms-if-mount-ctx-btn ' + btnClass + '">' + esc(btnLabel) + '<span class="jms-if-mount-ctx-caret">▾</span></button>' +
            '<div class="jms-if-mount-ctx-menu">' + itemsHtml + '</div></div>';
    }

    function renderToolbar(ifStepId) {
        var sid = esc(ifStepId);
        return '<div class="jms-if-mount-context__toolbar" data-if-step-id="' + sid + '">' +
            renderDropdown('jms-if-mount-ctx-btn-sampler', '取样器', 'jms-if-mount-ctx-sampler-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-http">HTTP 请求</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-sampler" data-aux-type="debug_sampler">Debug Sampler</button>') +
            renderDropdown('jms-if-mount-ctx-btn-logic', '逻辑控制器', 'jms-if-mount-ctx-logic-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-logic" data-aux-type="if_controller">If控制器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-logic" data-aux-type="random_controller">随机控制器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-logic" data-aux-type="simple_controller">简单控制器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-logic" data-aux-type="transaction_controller">事务控制器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-logic" data-aux-type="loop_controller">循环控制器</button>') +
            renderDropdown('jms-if-mount-ctx-btn-assert', '断言', 'jms-if-mount-ctx-assert-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-assert" data-assert-type="response">响应断言</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-assert" data-assert-type="json">JSON断言</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-assert" data-assert-type="size">大小断言</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-assert" data-assert-type="md5hex">MD5Hex断言</button>') +
            renderDropdown('jms-if-mount-ctx-btn-timer', '定时器', 'jms-if-mount-ctx-timer-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-timer" data-timer-type="constant">固定定时器</button>') +
            renderDropdown('jms-if-mount-ctx-btn-preproc', '前置处理器', 'jms-if-mount-ctx-preproc-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="edit-userparams">用户参数</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-preproc" data-preproc-type="beanshell_pre">BeanShell PreProcessor</button>') +
            renderDropdown('jms-if-mount-ctx-btn-processors', '后置处理器', 'jms-if-mount-ctx-proc-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="json_post">JSON提取器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="regex_extract">正则表达式提取器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="xpath_extract">XPath提取器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="jdbc_post">JDBC PostProcessor</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="jsr223_post">JSR223 PostProcessor</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-proc" data-proc-kind="beanshell_post">BeanShell PostProcessor</button>') +
            renderDropdown('jms-if-mount-ctx-btn-config', '配置元件', 'jms-if-mount-ctx-config-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="http_defaults">HTTP请求默认值</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="header_manager">HTTP信息头管理器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="cookie_manager">HTTP Cookie管理器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="cache_manager">HTTP缓存管理器</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="csv_data_set">CSV 数据文件设置</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="add-config" data-config-type="counter">计数器</button>') +
            renderDropdown('jms-if-mount-ctx-btn-listeners', '监听器', 'jms-if-mount-ctx-listener-more',
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="toggle-listener" data-listener="view_results_tree">察看结果树</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="toggle-listener" data-listener="aggregate_report">聚合报告</button>' +
                '<button type="button" class="jms-if-mount-ctx-item" data-if-mount-action="toggle-listener" data-listener="backend_listener">后端监听器</button>') +
            '</div>';
    }

    function isLogicMountHost(ifStep) {
        return !!(ifStep && (ifStep.type === 'if_controller' || ifStep.type === 'random_controller' || ifStep.type === 'simple_controller' || ifStep.type === 'transaction_controller' || ifStep.type === 'loop_controller'));
    }

    function renderPanel(ifStep, planId, tgId) {
        if (!isLogicMountHost(ifStep)) return '';
        return '<div class="jms-if-mount-context jms-if-mount-context--toolbar-only" data-plan-id="' + esc(planId) + '" data-tg-id="' + esc(tgId) + '" data-if-step-id="' + esc(ifStep.id) + '">' +
            renderToolbar(ifStep.id) +
            '</div>';
    }

    function resolveCtx(el) {
        var ctx = el && el.closest ? el.closest('.jms-if-mount-context') : null;
        if (!ctx) return null;
        return {
            planId: ctx.getAttribute('data-plan-id'),
            tgId: ctx.getAttribute('data-tg-id'),
            ifStepId: ctx.getAttribute('data-if-step-id')
        };
    }

    function onRootClick(ev) {
        if (!isTreeView()) return;
        var t = ev.target;

        var toggleBtn = t.closest('.jms-if-mount-ctx-btn-sampler, .jms-if-mount-ctx-btn-logic, .jms-if-mount-ctx-btn-assert, .jms-if-mount-ctx-btn-timer, .jms-if-mount-ctx-btn-preproc, .jms-if-mount-ctx-btn-processors, .jms-if-mount-ctx-btn-config, .jms-if-mount-ctx-btn-listeners');
        if (toggleBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var wrap = toggleBtn.closest('.jms-if-mount-ctx-sampler-more, .jms-if-mount-ctx-logic-more, .jms-if-mount-ctx-assert-more, .jms-if-mount-ctx-timer-more, .jms-if-mount-ctx-preproc-more, .jms-if-mount-ctx-proc-more, .jms-if-mount-ctx-config-more, .jms-if-mount-ctx-listener-more');
            if (wrap && Coord() && typeof Coord().toggleMenuWrap === 'function') Coord().toggleMenuWrap(wrap);
            return;
        }

        var item = t.closest('.jms-if-mount-ctx-item');
        if (!item) {
            if (!t.closest('.jms-if-mount-context')) {
                if (Coord() && typeof Coord().closeAll === 'function') Coord().closeAll();
            }
            return;
        }

        ev.preventDefault();
        ev.stopPropagation();
        if (Coord() && typeof Coord().closeAll === 'function') Coord().closeAll();

        var info = resolveCtx(item);
        if (!info || !info.planId || !info.tgId || !info.ifStepId) return;
        var vb = global.JmsVisualBuilder;
        var action = item.getAttribute('data-if-mount-action');

        if (action === 'add-http' && global.JmsIfMountHttpCreateUi &&
            typeof global.JmsIfMountHttpCreateUi.openCreate === 'function') {
            global.JmsIfMountHttpCreateUi.openCreate(info.planId, info.tgId, info.ifStepId);
            return;
        }
        if (action === 'add-sampler' || action === 'add-logic') {
            var auxType = item.getAttribute('data-aux-type');
            if (auxType && global.JmsIfMountAuxCreateUi &&
                typeof global.JmsIfMountAuxCreateUi.openCreate === 'function') {
                global.JmsIfMountAuxCreateUi.openCreate(info.planId, info.tgId, info.ifStepId, auxType);
            }
            return;
        }
        if (Attach()) {
            if (action === 'add-timer' && item.getAttribute('data-timer-type') === 'constant' &&
                typeof Attach().openTimerEdit === 'function') {
                Attach().openTimerEdit(info.planId, info.tgId, info.ifStepId);
            } else if (action === 'edit-userparams' && typeof Attach().openUserParamsEdit === 'function') {
                Attach().openUserParamsEdit(info.planId, info.tgId, info.ifStepId);
            } else if (action === 'add-preproc' && typeof Attach().openPreprocCreate === 'function') {
                Attach().openPreprocCreate(info.planId, info.tgId, info.ifStepId, item.getAttribute('data-preproc-type'));
            } else if (action === 'add-proc' && typeof Attach().openPostprocCreate === 'function') {
                Attach().openPostprocCreate(info.planId, info.tgId, info.ifStepId, item.getAttribute('data-proc-kind'));
            } else if (action === 'add-assert' && typeof Attach().openAssertCreate === 'function') {
                Attach().openAssertCreate(info.planId, info.tgId, info.ifStepId, item.getAttribute('data-assert-type'));
            } else if (action === 'add-config' && typeof Attach().openConfigCreate === 'function') {
                Attach().openConfigCreate(info.planId, info.tgId, info.ifStepId, item.getAttribute('data-config-type'));
            } else if (action === 'toggle-listener' && typeof Attach().openListenerCreate === 'function') {
                Attach().openListenerCreate(info.planId, info.tgId, info.ifStepId, item.getAttribute('data-listener'));
            }
        }
    }

    function bind() {
        if (!global.document.body.classList.contains('lth-hub-jmeter-tab')) return;
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsIfMountCtxBound === '1') return;
        root.dataset.jmsIfMountCtxBound = '1';
        root.addEventListener('click', onRootClick, true);
    }

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    global.JmsTgIfMountContextUi = {
        renderPanel: renderPanel
    };
}(typeof window !== 'undefined' ? window : this));
