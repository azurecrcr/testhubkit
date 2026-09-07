#!/usr/bin/env python3
"""Patch tc_workbench_session.js: preserve gen/edit session on tab switch."""
from pathlib import Path

TARGET = Path(__file__).resolve().parents[1] / "static/js/tc_workbench/l2_services/tc_workbench_session.js"

STATE_OLD = """        bootSyncing: false,
        planContextChangePromise: null
    };"""

STATE_NEW = """        bootSyncing: false,
        planContextChangePromise: null,
        inPageContextSnapshots: {}
    };"""

ON_PLAN_OLD = """    function onPlanContextChange(newContext, oldContext) {
        if (!newContext || newContext === oldContext) return Promise.resolve(state.sessionId);
        return flushSessionStateBeforeLeave().then(function () {
            return discardEmptyDraftSessionIfNeeded();
        }).then(function () {
            resetLiveGenerationUiForContextSwitch();
            return bootstrapEntrySession({
                planContext: newContext,
                clearChat: true,
                forceRestore: true
            });
        });
    }"""

ON_PLAN_NEW = """    function isWorkbenchGenEditTabSwitch(oldCtx, newCtx) {
        if (!oldCtx || !newCtx || oldCtx === newCtx) return false;
        var oldIsEdit = oldCtx === 'edit';
        var newIsEdit = newCtx === 'edit';
        if (oldIsEdit === newIsEdit) return false;
        return oldCtx === 'single' || oldCtx === 'mindmap' || oldCtx === 'edit';
    }

    function captureContextSnapshot(planContext) {
        planContext = planContext || state.currentPlanContext || getPlanContext();
        return {
            sessionId: state.sessionId,
            currentPlanContext: planContext,
            currentSessionMeta: state.currentSessionMeta,
            currentTurnCount: state.currentTurnCount,
            currentTurnId: state.currentTurnId,
            turnIdByUserKey: Object.assign({}, state.turnIdByUserKey),
            turnIdByBatchKey: Object.assign({}, state.turnIdByBatchKey),
            currentTurns: (state.currentTurns || []).slice(),
            awaitingFirstMessageTitle: state.awaitingFirstMessageTitle
        };
    }

    function applyContextSnapshot(snapshot) {
        if (!snapshot || !snapshot.sessionId) return false;
        state.sessionId = snapshot.sessionId;
        state.currentPlanContext = snapshot.currentPlanContext;
        state.currentSessionMeta = snapshot.currentSessionMeta;
        state.currentTurnCount = snapshot.currentTurnCount;
        state.currentTurnId = snapshot.currentTurnId;
        state.turnIdByUserKey = Object.assign({}, snapshot.turnIdByUserKey);
        state.turnIdByBatchKey = Object.assign({}, snapshot.turnIdByBatchKey);
        state.currentTurns = (snapshot.currentTurns || []).slice();
        state.awaitingFirstMessageTitle = snapshot.awaitingFirstMessageTitle;
        applySessionPrefs(snapshot.currentSessionMeta && snapshot.currentSessionMeta.session_prefs, {
            skipGenAreaPrefs: snapshot.currentPlanContext === 'edit'
        });
        syncSessionValidationFromTurns(state.currentTurns, snapshot.currentPlanContext);
        dispatch('tc-wb-session-ready', {
            sessionId: state.sessionId,
            planContext: snapshot.currentPlanContext
        });
        return true;
    }

    function restoreInPageContextSnapshot(newContext) {
        var cached = state.inPageContextSnapshots[newContext];
        if (!cached || !cached.sessionId) return null;
        applyContextSnapshot(cached);
        updateHistoryPanelHead();
        return refreshHistoryList().then(function () {
            return state.sessionId;
        });
    }

    function onPlanContextChange(newContext, oldContext) {
        if (!newContext || newContext === oldContext) return Promise.resolve(state.sessionId);
        var isTabSwitch = isWorkbenchGenEditTabSwitch(oldContext, newContext);
        return flushSessionStateBeforeLeave().then(function () {
            if (isTabSwitch) {
                state.inPageContextSnapshots[oldContext] = captureContextSnapshot(oldContext);
                var restored = restoreInPageContextSnapshot(newContext);
                if (restored) return restored;
                return bootstrapEntrySession({
                    planContext: newContext,
                    clearChat: false,
                    forceRestore: false
                });
            }
            return discardEmptyDraftSessionIfNeeded().then(function () {
                resetLiveGenerationUiForContextSwitch();
                return bootstrapEntrySession({
                    planContext: newContext,
                    clearChat: true,
                    forceRestore: true
                });
            });
        });
    }"""


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    if "inPageContextSnapshots" in text and "isWorkbenchGenEditTabSwitch" in text:
        print("already patched")
        return
    if STATE_OLD not in text:
        raise SystemExit("state block not found")
    if ON_PLAN_OLD not in text:
        raise SystemExit("onPlanContextChange block not found")
    text = text.replace(STATE_OLD, STATE_NEW, 1)
    text = text.replace(ON_PLAN_OLD, ON_PLAN_NEW, 1)
    TARGET.write_text(text, encoding="utf-8")
    print("patched", TARGET)


if __name__ == "__main__":
    main()
