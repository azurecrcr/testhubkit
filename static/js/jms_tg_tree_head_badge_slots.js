/**
 * 树形视图 · 头行右侧动态标签（紧贴启用按钮左侧，向左扩展）
 */
(function (global) {
    'use strict';

    function renderDynamicBadges(badgeList) {
        var items = (badgeList || []).filter(function (b) { return b && String(b).trim(); });
        if (!items.length) return '';
        return '<span class="jms-card-head-badges">' + items.join('') + '</span>';
    }

    function wrapCardHeadActions(badgeBarHtml, toolbarHtml) {
        return '<div class="jms-card-head-actions">' +
            (badgeBarHtml || '') +
            (toolbarHtml || '') +
            '</div>';
    }

    function getHttpBadges(step) {
        var badges = [];
        var H = global.JmsHttpContextUi;
        if (H) {
            var assertCount = typeof H.getAssertCount === 'function' ? H.getAssertCount(step) : 0;
            var procCount = typeof H.getProcessorCount === 'function' ? H.getProcessorCount(step) : 0;
            if (assertCount) {
                badges.push('<span class="jms-http-assert-badge" title="已配置断言">' + assertCount + ' 条断言</span>');
            }
            if (procCount) {
                badges.push('<span class="jms-http-proc-badge" title="已配置后置处理器">' + procCount + ' 个后置处理器</span>');
            }
        } else {
            var a = step && step.assertions;
            var ac = Array.isArray(a) ? a.length : 0;
            if (ac) {
                badges.push('<span class="jms-http-assert-badge" title="已配置断言">' + ac + ' 条断言</span>');
            }
        }
        return badges;
    }

    function getHttpBadgeBarHtml(step) {
        return renderDynamicBadges(getHttpBadges(step));
    }

    function renderChildCountBadge(childCount, className) {
        return '<span class="' + className + ' jms-http-assert-badge jms-tree-child-count-badge">' + childCount + ' 子步骤</span>';
    }

    function composeLogicHead(childCount, childClass, toolbarHtml, extraBadges) {
        var badges = [];
        if (childCount != null && childCount !== '') {
            badges.push(renderChildCountBadge(childCount, childClass));
        }
        if (extraBadges && extraBadges.length) {
            badges = badges.concat(extraBadges);
        }
        return wrapCardHeadActions(renderDynamicBadges(badges), toolbarHtml);
    }

    function composeAuxHead(toolbarHtml, extraBadges) {
        return wrapCardHeadActions(renderDynamicBadges(extraBadges || []), toolbarHtml);
    }

    function composeHttpHead(step, toolbarHtml) {
        return wrapCardHeadActions(getHttpBadgeBarHtml(step), toolbarHtml);
    }

    function patchHttpCardBadges(node, step) {
        if (!node || !step) return;
        var actions = node.querySelector('.jms-card-head-actions');
        if (!actions) return;
        var html = getHttpBadgeBarHtml(step);
        var bar = actions.querySelector('.jms-card-head-badges');
        if (!html) {
            if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
            return;
        }
        if (bar) {
            bar.outerHTML = html;
            return;
        }
        var toolbar = actions.querySelector('.jms-config-card-toolbar, .lth-step-actions, .jms-http-card__actions');
        var wrap = global.document.createElement('div');
        wrap.innerHTML = html;
        var next = wrap.firstElementChild;
        if (!next) return;
        if (toolbar) actions.insertBefore(next, toolbar);
        else actions.insertBefore(next, actions.firstChild);
    }

    global.JmsTgTreeHeadBadgeSlots = {
        renderDynamicBadges: renderDynamicBadges,
        wrapCardHeadActions: wrapCardHeadActions,
        getHttpBadges: getHttpBadges,
        composeLogicHead: composeLogicHead,
        composeAuxHead: composeAuxHead,
        composeHttpHead: composeHttpHead,
        patchHttpCardBadges: patchHttpCardBadges
    };
}(typeof window !== 'undefined' ? window : this));
