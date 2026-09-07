/**
 * Studio v2 树形 · 新样式步骤编辑弹窗修复（隔离模块，不影响旧网格视图）
 */
(function (global) {
    "use strict";

    var ROUTES = {
        "jms-btn-edit-transaction": { mod: "JmsTgTransactionControllerUi", cards: ".jms-transaction-card", method: "openEditor", modalId: "modal-tg-transaction-edit" },
        "jms-btn-edit-loop": { mod: "JmsTgLoopControllerUi", cards: ".jms-loop-card", method: "openEditor", modalId: "modal-tg-loop-edit" },
        "jms-btn-edit-random": { mod: "JmsTgRandomControllerUi", cards: ".jms-random-card", method: "openEditor", modalId: "modal-tg-random-edit" },
        "jms-btn-edit-simple": { mod: "JmsTgSimpleControllerUi", cards: ".jms-simple-card", method: "openEditor", modalId: "modal-tg-simple-edit" },
        "jms-btn-edit-beanshell": { mod: "JmsTgBeanshellPostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-beanshell-post-edit", extra: [false] },
        "jms-btn-edit-debug": { mod: "JmsTgDebugSamplerUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-debug-edit" },
        "jms-btn-edit-tg-xpath-extract": { mod: "JmsTgXpathExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-xpath-extract-edit", extra: [false] },
        "jms-btn-edit-tg-regex-extract": { mod: "JmsTgRegexExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-regex-extract-edit", extra: [false] },
        "jms-btn-edit-tg-jdbc-post": { mod: "JmsTgJdbcPostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-jdbc-post-edit", extra: [false, 0] },
        "jms-btn-edit-tg-json-extract": { mod: "JmsTgJsonExtractUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-json-extract-edit", extra: [false] },
        "jms-btn-edit-tg-jsr223-post": { mod: "JmsTgJsr223PostUi", cards: ".jms-aux-card", method: "openEditor", modalId: "modal-tg-jsr223-post-edit", extra: [false] }
    };

    function sidEq(a, b) { return String(a) === String(b); }

    function isTreeStudio() {
        return global.document.body.classList.contains("lth-hub-jmeter-tab") &&
            global.document.body.classList.contains("lth-tg-view-tree");
    }

    function readModel() {
        var vb = global.JmsVisualBuilder;
        if (vb && typeof vb.readModelFromDom === "function") vb.readModelFromDom();
    }

    function getModel() {
        return global.JmsVisualBuilder && global.JmsVisualBuilder.getModel ? global.JmsVisualBuilder.getModel() : null;
    }

    function isNestedContainer(st) {
        return st && (st.type === "if_controller" || st.type === "random_controller" ||
            st.type === "simple_controller" || st.type === "transaction_controller" ||
            st.type === "loop_controller" || (st.type === "catalog_element" && st.container));
    }

    function findStepInTree(list, stepId) {
        var found = null;
        (list || []).some(function (s) {
            if (!s) return false;
            if (sidEq(s.id, stepId)) { found = s; return true; }
            if (isNestedContainer(s) && s.children) {
                found = findStepInTree(s.children, stepId);
                return !!found;
            }
            return false;
        });
        return found;
    }

    function findTgRobust(planId, tgId) {
        var m = getModel();
        if (!m || tgId == null || tgId === "") return null;
        var hits = [];
        function scan(list, pid) {
            (list || []).forEach(function (t) {
                if (t && sidEq(t.id, tgId)) hits.push({ tg: t, planId: pid });
            });
        }
        scan(m.setup_thread_groups, planId || "");
        (m.test_plans || []).forEach(function (p) { scan(p.thread_groups, p.id); });
        scan(m.post_thread_groups, planId || "");
        if (!hits.length) return null;
        if (planId) {
            var exact = hits.find(function (h) { return sidEq(h.planId, planId); });
            if (exact) return exact.tg;
        }
        return hits[0].tg;
    }

    function resolveCard(btn, route) {
        var sels = (route.cards || "").split(",");
        for (var i = 0; i < sels.length; i++) {
            var card = btn.closest(sels[i].trim());
            if (card) return card;
        }
        return btn.closest(".jms-aux-card, .jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card");
    }

    function resolveIds(card) {
        var planId = card.getAttribute("data-plan-id") || "";
        var tgId = card.getAttribute("data-tg-id") || "";
        var stepId = card.getAttribute("data-step-id") || "";
        if (!tgId) {
            var tgBlock = card.closest(".jms-tg-block--tree, .jms-tg-block");
            if (tgBlock) tgId = tgBlock.getAttribute("data-tg-id") || tgId;
        }
        if (!planId) {
            var planCard = card.closest(".jms-plan-card");
            if (planCard) planId = planCard.getAttribute("data-plan-id") || planId;
            if (!planId) {
                var toolbar = global.document.getElementById("jms-studio-plan-toolbar");
                if (toolbar) planId = toolbar.getAttribute("data-plan-id") || planId;
            }
        }
        if (!planId) {
            var m = getModel();
            if (m && m.test_plans && m.test_plans[0]) planId = m.test_plans[0].id;
        }
        return { planId: planId, tgId: tgId, stepId: stepId };
    }

    function ensureModalOnBody(Ui, modalId) {
        var modal = null;
        if (Ui && typeof Ui.ensureModal === "function") modal = Ui.ensureModal();
        if (!modal && modalId) modal = global.document.getElementById(modalId);
        if (global.JmsStudioV2TreeStepEditUnify && typeof global.JmsStudioV2TreeStepEditUnify.ensureOnBody === "function") {
            global.JmsStudioV2TreeStepEditUnify.ensureOnBody(modal);
        } else if (modal && modal.parentElement !== global.document.body) {
            global.document.body.appendChild(modal);
        }
        return modal;
    }

    function modalIsOpen(modalId) {
        if (!modalId) return false;
        var modal = global.document.getElementById(modalId);
        return !!(modal && modal.classList.contains("jms-modal-open"));
    }

    function resolvePlanIdForTg(tgId) {
        var m = getModel();
        if (!m || tgId == null || tgId === "") return "";
        var i, j, p, tg;
        for (i = 0; i < (m.test_plans || []).length; i++) {
            p = m.test_plans[i];
            for (j = 0; j < (p.thread_groups || []).length; j++) {
                tg = p.thread_groups[j];
                if (tg && sidEq(tg.id, tgId)) return p.id;
            }
        }
        if ((m.setup_thread_groups || []).some(function (t) { return t && sidEq(t.id, tgId); })) {
            return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
        }
        if ((m.post_thread_groups || []).some(function (t) { return t && sidEq(t.id, tgId); })) {
            return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
        }
        return (m.test_plans && m.test_plans[0]) ? m.test_plans[0].id : "";
    }

    function invokeOpen(route, planId, tgId, stepId) {
        var Ui = global[route.mod];
        if (!Ui) return false;
        if (!planId) planId = resolvePlanIdForTg(tgId);
        ensureModalOnBody(Ui, route.modalId);
        if (typeof Ui[route.method] === "function") {
            var args = [planId, tgId, stepId].concat(route.extra || []);
            Ui[route.method].apply(Ui, args);
            if (modalIsOpen(route.modalId)) return true;
        }
        if (route.fallback === "openIfEditor" && global.JmsVisualBuilder &&
            typeof global.JmsVisualBuilder.openIfEditor === "function") {
            global.JmsVisualBuilder.openIfEditor(planId, tgId, stepId);
            return modalIsOpen(route.modalId || "modal-if-edit");
        }
        return false;
    }

    function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    }

    function onCaptureClick(ev) {
        if (!isTreeStudio()) return;
        var btn = null;
        var route = null;
        var keys = Object.keys(ROUTES);
        for (var i = 0; i < keys.length; i++) {
            var cls = keys[i];
            var hit = ev.target.closest("." + cls);
            if (hit) { btn = hit; route = ROUTES[cls]; break; }
        }
        if (!btn || !route) return;

        var card = resolveCard(btn, route);
        if (!card) return;

        readModel();
        var ids = resolveIds(card);
        if (!ids.tgId || !ids.stepId) return;

        var tg = findTgRobust(ids.planId, ids.tgId);
        var step = tg ? findStepInTree(tg.steps, ids.stepId) : null;
        if (!tg || !step) return;

        var actions = btn.closest(".lth-step-actions");
        if (actions) actions.classList.remove("is-open", "is-hover");

        if (invokeOpen(route, ids.planId, ids.tgId, ids.stepId)) {
            stopClick(ev);
        }
    }

    function bind() {
        if (!global.document.body || global.document.body.dataset.jmsV2TreeStepEditFixBound === "1") return;
        global.document.body.dataset.jmsV2TreeStepEditFixBound = "1";
        global.document.addEventListener("click", onCaptureClick, true);
    }

    bind();
    if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", bind);
    }
    global.addEventListener("pageshow", bind);

    global.JmsStudioV2TreeStepEditFix = {
        bind: bind,
        findTgRobust: findTgRobust,
        findStepInTree: findStepInTree,
        invokeOpen: invokeOpen
    };
})(window);
