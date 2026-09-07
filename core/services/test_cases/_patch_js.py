from pathlib import Path
path = Path("/root/TestHub/static/js/tc_workbench/l3_ui/tc_lanhu_doc_manager.js")
text = path.read_text(encoding="utf-8")

# 1) vars after _docsReady
vneedle = "    var _docsReady = false;\n"
vinsert = """    var _docsReady = false;
    var _lanhuDocQuotaAdmin = false;
    var LANHU_DOC_QUOTA_MSG = '每位用户最多只能添加一个需求文档。您当前已有需求文档，如需更换请先删除现有文档。\\n\\n注意：删除当前需求文档后，该文档下的所有用例都会丢失，请务必先导出用例后再删除。';
"""
if vneedle not in text:
    raise SystemExit("vars needle not found")
text = text.replace(vneedle, vinsert, 1)

# 2) quota helpers after apiJson function block (after refreshDocsFromServer's closing)
qneedle = """    function refreshDocsFromServer() {
        return apiJson('/api/user-lanhu-docs', { method: 'GET' })
            .then(function(d) {
                if (d.ok) {
                    _serverMode = true;
                    setDocsCache(d.docs || []);
                    return migrateLocalToServer().then(function() {
                        if (_docsCache.length) return Promise.resolve();
                        return apiJson('/api/user-lanhu-docs', { method: 'GET' }).then(function(d2) {
                            if (d2.ok) setDocsCache(d2.docs || []);
                        });
                    });
                }
                _serverMode = false;
            })
            .catch(function() { _serverMode = false; })
            .then(function() { _docsReady = true; renderDocList(); });
    }
"""
qinsert = qneedle + """
    function refreshLanhuDocQuotaAuth() {
        return apiJson('/api/auth/me', { method: 'GET' }).then(function(me) {
            _lanhuDocQuotaAdmin = !!(me && me.can_manage_builtin_ai);
        }).catch(function() {
            _lanhuDocQuotaAdmin = false;
        });
    }

    function shouldBlockLanhuDocAdd() {
        if (_lanhuDocQuotaAdmin) return false;
        return loadDocs().length >= 1;
    }

    function showLanhuDocQuotaBlockedAlert() {
        if (typeof tcAppAlert === 'function') {
            tcAppAlert(LANHU_DOC_QUOTA_MSG, { title: '无法添加需求文档', variant: 'warning' });
            return;
        }
        alert(LANHU_DOC_QUOTA_MSG);
    }
"""
if qneedle not in text:
    raise SystemExit("quota helpers needle not found")
text = text.replace(qneedle, qinsert, 1)

# 3) openAddDocModal guard
oneedle = """    function openAddDocModal() {
        if (typeof window.isTcLanhuTreeHeadActionsBlocked === 'function' && window.isTcLanhuTreeHeadActionsBlocked()) {
            if (typeof window.toastTcLanhuTreeHeadActionsBlocked === 'function') window.toastTcLanhuTreeHeadActionsBlocked();
            return;
        }
        var m = document.getElementById('tc-lanhu-doc-add-modal');
"""
oinsert = """    function openAddDocModal() {
        if (typeof window.isTcLanhuTreeHeadActionsBlocked === 'function' && window.isTcLanhuTreeHeadActionsBlocked()) {
            if (typeof window.toastTcLanhuTreeHeadActionsBlocked === 'function') window.toastTcLanhuTreeHeadActionsBlocked();
            return;
        }
        if (shouldBlockLanhuDocAdd()) {
            showLanhuDocQuotaBlockedAlert();
            return;
        }
        var m = document.getElementById('tc-lanhu-doc-add-modal');
"""
if oneedle not in text:
    raise SystemExit("openAddDocModal needle not found")
text = text.replace(oneedle, oinsert, 1)

# 4) confirmAddDoc guard before duplicate check
cneedle = """        if (!cookie || !url) { if (typeof tcAppToast === 'function') tcAppToast('请填写 Cookie 和 URL', { variant: 'warning' }); return; }
        if (findDuplicateDoc(url)) { warnDuplicateDoc(); return; }
"""
cinsert = """        if (!cookie || !url) { if (typeof tcAppToast === 'function') tcAppToast('请填写 Cookie 和 URL', { variant: 'warning' }); return; }
        if (shouldBlockLanhuDocAdd()) { showLanhuDocQuotaBlockedAlert(); return; }
        if (findDuplicateDoc(url)) { warnDuplicateDoc(); return; }
"""
if cneedle not in text:
    raise SystemExit("confirmAddDoc needle not found")
text = text.replace(cneedle, cinsert, 1)

# 5) init parallel auth refresh
ineedle = """    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        refreshDocsFromServer().then(function() {
            setupDocSwitcherUI();
            interceptConnectSave();
            if (!_docsReady) renderDocList();
        });
    }
"""
iinsert = """    function init() {
        if (!document.querySelector('.tc-workbench-scope')) return;
        Promise.all([refreshDocsFromServer(), refreshLanhuDocQuotaAuth()]).then(function() {
            setupDocSwitcherUI();
            interceptConnectSave();
            if (!_docsReady) renderDocList();
        });
    }
"""
if ineedle not in text:
    raise SystemExit("init needle not found")
text = text.replace(ineedle, iinsert, 1)

path.write_text(text, encoding="utf-8")
print("js patched")