/**
 * 左栏录入区导航锁：Agent 运行 / 列表·导图 AI 生成 / 智能编辑期间禁止切换子页。
 * 不影响右侧表格/导图视图切换。
 */
(function (global) {
    'use strict';

    var locks = {
        agent: false,
        aiGenerate: false,
        edit: false
    };

    function $(id) { return document.getElementById(id); }

    function toast(msg) {
        if (typeof global.tcAppToast === 'function') {
            global.tcAppToast(msg, { variant: 'warning', duration: 2800 });
        }
    }


    function isQualityCheckActivelyRunning() {
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.isSingleGenValidationInProgress === 'function' &&
            global.TcWorkbenchEnhancements.isSingleGenValidationInProgress()) {
            return true;
        }
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            return true;
        }
        return false;
    }

    function shouldBypassLanhuGenLockAfterCoverageFillTerminal() {
        var cov = global.TcCoverageMatrix;
        if (!cov || typeof cov.shouldBypassLanhuGenLockAfterCoverageFillTerminal !== 'function') {
            return false;
        }
        return cov.shouldBypassLanhuGenLockAfterCoverageFillTerminal('single');
    }

    function forceUnlockLanhuNavAfterCoverageFillTerminal() {
        var cov = global.TcCoverageMatrix;
        if (cov && typeof cov.isCoverageFillJobBlockingLanhuNav === 'function' &&
            cov.isCoverageFillJobBlockingLanhuNav('single')) {
            return;
        }
        var orch = global.TcAgentOrchestrator;
        if (orch && typeof orch.isAgentJobRunning === 'function' && orch.isAgentJobRunning()) {
            return;
        }
        if (typeof global.setTcLeftPanelAgentLock === 'function') {
            global.setTcLeftPanelAgentLock(false);
        }
        if (orch && typeof orch.releaseGenModeLockIfIdle === 'function') {
            orch.releaseGenModeLockIfIdle();
        }
        if (typeof global.clearOptimisticPageGenLock === 'function') {
            global.clearOptimisticPageGenLock();
        }
        applyLockUi();
        syncLanhuRequirementNavLockUi();
    }

    function syncLanhuNavLockAfterCoverageFillTerminal() {
        applyLockUi();
        syncLanhuRequirementNavLockUi();
    }

    global.syncLanhuNavLockAfterCoverageFillTerminal = syncLanhuNavLockAfterCoverageFillTerminal;
    global.forceUnlockLanhuNavAfterCoverageFillTerminal = forceUnlockLanhuNavAfterCoverageFillTerminal;

    function isCoverageFillDrawerBusy() {
        var cov = global.TcCoverageMatrix;
        if (!cov) return false;
        if (typeof cov.isCoverageFillJobBlockingLanhuNav === 'function') {
            return cov.isCoverageFillJobBlockingLanhuNav('single');
        }
        if (typeof cov.isValidateDrawerFillInProgress === 'function') {
            return cov.isValidateDrawerFillInProgress('single');
        }
        return false;
    }

    function isQualityCheckBusy() {
        if (global.TcGenChatPipeline &&
            typeof global.TcGenChatPipeline.isQualityCheckPending === 'function' &&
            global.TcGenChatPipeline.isQualityCheckPending()) {
            return true;
        }
        if (global.TcWorkbenchEnhancements &&
            typeof global.TcWorkbenchEnhancements.isSingleGenValidationInProgress === 'function' &&
            global.TcWorkbenchEnhancements.isSingleGenValidationInProgress()) {
            return true;
        }
        if (typeof global.isTcGenQualityCheckInProgress === 'function' &&
            global.isTcGenQualityCheckInProgress()) {
            return true;
        }
        return false;
    }

    function isLocked() {
        return !!(locks.agent || locks.aiGenerate || locks.edit || isQualityCheckBusy());
    }

    function isAiGenerateLocked() {
        return !!locks.aiGenerate;
    }

    function isEditLocked() {
        return !!locks.edit;
    }

    function applyLockUi() {
        var locked = isLocked();
        var genLocked = !!(locks.agent || locks.aiGenerate || isQualityCheckBusy());
        var editLocked = !!locks.edit;

        var singleBtn = $('tc-gen-mode-single');
        var editBtn = $('tc-gen-mode-edit');
        var genSeg = document.querySelector('#drawer-tabs.tc-gen-mode-seg, .tc-gen-mode-seg');

        [singleBtn, editBtn].forEach(function (btn) {
            if (!btn) return;
            var disable = locked;
            if (btn === singleBtn && editLocked) disable = true;
            if (btn === editBtn && genLocked) disable = true;
            btn.disabled = disable;
            btn.classList.toggle('tc-gen-mode-btn--locked', disable);
            btn.classList.toggle('tc-drawer-tab--locked', disable);
            if (disable) {
                btn.setAttribute('aria-disabled', 'true');
                if (btn === singleBtn) {
                    btn.title = editLocked
                        ? '智能编辑进行中，无法切换'
                        : (isQualityCheckBusy()
                            ? '质量检查进行中，无法切换'
                            : (locks.agent ? 'Agent 任务进行中' : 'AI 生成进行中'));
                }
                if (btn === editBtn) {
                    btn.title = genLocked
                        ? (isQualityCheckBusy() ? '质量检查进行中' : '生成进行中，无法切换')
                        : '智能编辑进行中';
                }
            } else {
                btn.removeAttribute('aria-disabled');
                if (btn === singleBtn) btn.title = '单次提示词生成列表或导图用例';
                if (btn === editBtn) btn.title = '通过提示词编辑当前表格用例';
            }
        });
        if (genSeg) genSeg.classList.toggle('tc-gen-mode-seg--locked', locked);

        if (typeof global.syncTcSessionNavLockUi === 'function') {
            global.syncTcSessionNavLockUi(locked);
        }
        if (typeof global.syncTcPromptSendBtnState === 'function') {
            global.syncTcPromptSendBtnState();
        }
        if (typeof global.syncTcEditSendBtnState === 'function') {
            global.syncTcEditSendBtnState();
        }
        syncLanhuDocSwitcherLockUi();
        syncLanhuTreePageSwitchLockUi();
    }

    function getSessionNavLockTitle() {
        if (isQualityCheckBusy()) return '质量检查进行中，请稍候';
        if (locks.edit) return '智能编辑进行中，请稍候';
        if (locks.agent) return 'Agent 生成进行中，请稍候';
        if (locks.aiGenerate) return '用例生成进行中，请稍候';
        return '用例生成进行中，请稍候';
    }

    function setAgentLock(locked) {
        locks.agent = !!locked;
        applyLockUi();
    }

    function setAiGenerateLock(locked) {
        locks.aiGenerate = !!locked;
        if (locks.aiGenerate && global.TcCoverageMatrix &&
            typeof global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal === 'function') {
            global.TcCoverageMatrix.resetLanhuNavUnlockedAfterCoverageFillTerminal();
        }
        applyLockUi();
    }

    function setEditLock(locked) {
        locks.edit = !!locked;
        applyLockUi();
    }

    global.isTcLeftPanelNavLocked = isLocked;
    global.isTcLeftPanelAiGenerateLocked = isAiGenerateLocked;
    global.setTcLeftPanelAgentLock = setAgentLock;
    global.setTcLeftPanelAiGenerateLock = setAiGenerateLock;



    function isLanhuActiveGenerationBlockingTreeNav() {
        if (locks.agent || locks.aiGenerate) return true;
        if (global.TcRequirementCaseStore &&
            typeof global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy === 'function' &&
            global.TcRequirementCaseStore.isWorkbenchGenerationStreamBusy()) {
            return true;
        }
        return false;
    }

    function syncLanhuNavLockUiAfterGenerationIdle() {
        syncLanhuTreePageSwitchLockUi();
        syncLanhuDocSwitcherLockUi();
    }

    function isLanhuRequirementNavBlocked() {
        if (isCoverageFillDrawerBusy()) return true;
        if (shouldBypassLanhuGenLockAfterCoverageFillTerminal()) return false;
        return isQualityCheckActivelyRunning();
    }

    function toastLanhuRequirementNavBlocked() {
        toast('质量检测进行中，暂不可切换需求页或文档');
    }

    function isLanhuDocSwitchBlockedDuringGenerationCore() {
        if (shouldBypassLanhuGenLockAfterCoverageFillTerminal()) return false;
        if (locks.agent || locks.aiGenerate) return true;
        if (global.TcGenerationStreamClient && typeof global.TcGenerationStreamClient.isActive === 'function' &&
            global.TcGenerationStreamClient.isActive()) {
            return true;
        }
        if (global.TcAgentOrchestrator && typeof global.TcAgentOrchestrator.isGenModeLocked === 'function' &&
            global.TcAgentOrchestrator.isGenModeLocked()) {
            return true;
        }
        if (typeof global.isTcPageGenLockActive === 'function' && global.isTcPageGenLockActive()) {
            return true;
        }
        if (isLanhuActiveGenerationBlockingTreeNav()) {
            return true;
        }
        return false;
    }

    function isLanhuDocSwitchBlockedDuringGeneration() {
        if (isCoverageFillDrawerBusy()) return true;
        return isLanhuDocSwitchBlockedDuringGenerationCore();
    }

    function toastLanhuDocSwitchBlockedDuringGeneration() {
        toast('用例生成进行中，暂不可切换需求文档');
    }


    function isLanhuRequirementPageSwitchBlocked() {
        return isLanhuDocSwitchBlockedDuringGeneration();
    }

    function toastLanhuRequirementPageSwitchBlocked() {
        toast('用例生成进行中，暂不可切换需求页');
    }

    function syncLanhuTreePageSwitchLockUi() {
        var blocked = isLanhuRequirementPageSwitchBlocked() || isLanhuRequirementNavBlocked();
        var mount = document.getElementById('tc-lanhu-tree-mount');
        var rail = document.getElementById('tc-lanhu-doc-tree-rail');
        if (mount) mount.classList.toggle('tc-lanhu-tree-mount--gen-page-locked', blocked);
        if (rail) rail.classList.toggle('tc-lanhu-tree-rail--gen-page-locked', blocked);
    }
    function isLanhuTreeHeadActionsBlocked() {
        return isLanhuRequirementNavBlocked() || isLanhuDocSwitchBlockedDuringGeneration();
    }

    function toastLanhuTreeHeadActionsBlocked() {
        if (isCoverageFillDrawerBusy()) {
            toast('用例补充进行中，暂不可切换需求页或文档');
        } else if (isQualityCheckBusy()) {
            toastLanhuRequirementNavBlocked();
        } else {
            toastLanhuDocSwitchBlockedDuringGeneration();
        }
    }

    function applyLanhuTreeRailHeadBtnLock(btn, blocked, qcBlocked) {
        if (!btn) return;
        btn.disabled = !!blocked;
        btn.classList.toggle('tc-lanhu-tree-rail__action-btn--locked', blocked);
        if (blocked) {
            btn.setAttribute('aria-disabled', 'true');
            var isAdd = btn.id === 'tc-lanhu-tree-head-add-btn';
            btn.title = qcBlocked === 'fill'
                ? (isAdd ? '用例补充进行中，暂不可新增文档' : '用例补充进行中，暂不可连接文档')
                : (qcBlocked
                    ? (isAdd ? '质量检测进行中，暂不可新增文档' : '质量检测进行中，暂不可连接文档')
                    : (isAdd ? '用例生成进行中，暂不可新增文档' : '用例生成进行中，暂不可连接文档'));
        } else {
            btn.removeAttribute('aria-disabled');
            if (btn.id === 'tc-lanhu-tree-head-add-btn') btn.title = '添加 / 连接蓝湖文档';
            else if (btn.id === 'tc-lanhu-tree-connect-btn') btn.title = '添加 / 连接蓝湖文档';
        }
    }

    function syncLanhuDocSwitcherLockUi() {
        var fillBlocked = isCoverageFillDrawerBusy();
        var qcBlocked = !fillBlocked && isQualityCheckBusy();
        var genBlocked = !fillBlocked && !qcBlocked && isLanhuDocSwitchBlockedDuringGenerationCore();
        var blocked = fillBlocked || qcBlocked || genBlocked;
        var docTrigger = document.getElementById('tc-lanhu-doc-switcher-trigger');
        if (docTrigger) {
            docTrigger.classList.toggle('tc-doc-switcher-trigger--qc-busy', blocked);
            docTrigger.disabled = !!blocked;
            if (blocked) {
                docTrigger.setAttribute('aria-disabled', 'true');
                docTrigger.title = fillBlocked
                    ? '用例补充进行中，暂不可切换文档'
                    : (qcBlocked
                        ? '质量检测进行中，暂不可切换文档'
                        : '用例生成进行中，暂不可切换文档');
            } else {
                docTrigger.removeAttribute('aria-disabled');
                docTrigger.title = '切换文档';
            }
        }
        applyLanhuTreeRailHeadBtnLock(
            document.getElementById('tc-lanhu-tree-head-add-btn'),
            blocked,
            fillBlocked ? 'fill' : (qcBlocked ? 'qc' : '')
        );
        applyLanhuTreeRailHeadBtnLock(
            document.getElementById('tc-lanhu-tree-connect-btn'),
            blocked,
            fillBlocked ? 'fill' : (qcBlocked ? 'qc' : '')
        );
    }

    function syncLanhuRequirementNavLockUi() {
        syncLanhuDocSwitcherLockUi();
        syncLanhuTreePageSwitchLockUi();
    }

    global.isTcQualityCheckLanhuNavBlocked = isLanhuRequirementNavBlocked;
    global.toastTcQualityCheckNavBlocked = toastLanhuRequirementNavBlocked;
    global.isTcLanhuDocSwitchBlockedDuringGeneration = isLanhuDocSwitchBlockedDuringGeneration;
    global.toastTcLanhuDocSwitchBlockedDuringGeneration = toastLanhuDocSwitchBlockedDuringGeneration;
    global.isTcLanhuTreeHeadActionsBlocked = isLanhuTreeHeadActionsBlocked;
    global.toastTcLanhuTreeHeadActionsBlocked = toastLanhuTreeHeadActionsBlocked;
    global.isTcLanhuRequirementPageSwitchBlocked = isLanhuRequirementPageSwitchBlocked;
    global.toastTcLanhuRequirementPageSwitchBlocked = toastLanhuRequirementPageSwitchBlocked;
    global.tcSyncLanhuNavLockUiAfterGenerationIdle = syncLanhuNavLockUiAfterGenerationIdle;
    global.tcSyncLanhuTreePageSwitchLockUi = syncLanhuTreePageSwitchLockUi;
    global.tcSyncLanhuDocSwitcherLockUi = syncLanhuDocSwitcherLockUi;

    global.TcLeftPanelLock = {
        isLocked: isLocked,
        isAiGenerateLocked: isAiGenerateLocked,
        isEditLocked: isEditLocked,
        isQualityCheckBusy: isQualityCheckBusy,
        getSessionNavLockTitle: getSessionNavLockTitle,
        setAgentLock: setAgentLock,
        setAiGenerateLock: setAiGenerateLock,
        setEditLock: setEditLock,
        applyLockUi: applyLockUi,
        syncLanhuDocSwitcherLockUi: syncLanhuDocSwitcherLockUi,
        forceUnlockLanhuNavAfterCoverageFillTerminal: forceUnlockLanhuNavAfterCoverageFillTerminal,
        syncLanhuRequirementNavLockUi: syncLanhuRequirementNavLockUi,
        isLanhuDocSwitchBlockedDuringGeneration: isLanhuDocSwitchBlockedDuringGeneration,
        toastLanhuDocSwitchBlockedDuringGeneration: toastLanhuDocSwitchBlockedDuringGeneration,
        isLanhuRequirementPageSwitchBlocked: isLanhuRequirementPageSwitchBlocked,
        toastLanhuRequirementPageSwitchBlocked: toastLanhuRequirementPageSwitchBlocked,
        syncLanhuNavLockUiAfterGenerationIdle: syncLanhuNavLockUiAfterGenerationIdle,
        syncLanhuTreePageSwitchLockUi: syncLanhuTreePageSwitchLockUi,
        isLanhuTreeHeadActionsBlocked: isLanhuTreeHeadActionsBlocked,
        toastLanhuTreeHeadActionsBlocked: toastLanhuTreeHeadActionsBlocked,
        isLanhuRequirementNavBlocked: isLanhuRequirementNavBlocked,
        toastLanhuRequirementNavBlocked: toastLanhuRequirementNavBlocked,
        isCoverageFillDrawerBusy: isCoverageFillDrawerBusy
    };
})(typeof window !== 'undefined' ? window : this);
