/**
 * XMind Zen / 2020+ 原生 .xmind 导出（与 tcBuildStoredZipBlob 配合，独立模块不影响旧转换函数）
 */
(function tcXmindZenExport(global) {
    'use strict';

    function tcXmindZenNewId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function tcXmindZenTopicId(preferred) {
        var s = String(preferred || '').trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
            return s;
        }
        return tcXmindZenNewId();
    }

    function tcXmindZenContentXmlStub() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="no"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" version="2.0"><sheet id="stub-sheet"><title>Sheet</title><topic id="stub-root"><title>Root</title></topic></sheet></xmap-content>';
    }

    function tcJsmindNodeToXmindZenTopic(node) {
        if (!node) return null;
        var topic = {
            id: tcXmindZenTopicId(node.id),
            structureClass: 'org.xmind.ui.logic.right',
            title: String(node.topic != null ? node.topic : '')
        };
        var children = node.children;
        if (children && children.length) {
            topic.children = {
                attached: children.map(tcJsmindNodeToXmindZenTopic).filter(Boolean)
            };
        }
        return topic;
    }

    /** 将旧版 {id,title,children:{attached}} 或 jsmind 节点规范为 XMind Zen topic */
    function tcXmindZenNormalizeTopicTree(topic) {
        if (!topic || typeof topic !== 'object') return null;
        var out = {
            id: tcXmindZenTopicId(topic.id),
            structureClass: topic.structureClass || 'org.xmind.ui.logic.right',
            title: String(topic.title != null ? topic.title : (topic.topic != null ? topic.topic : ''))
        };
        var ch = topic.children;
        var attached = null;
        if (ch && Array.isArray(ch.attached)) {
            attached = ch.attached;
        } else if (Array.isArray(ch)) {
            attached = ch;
        } else if (Array.isArray(topic.children)) {
            attached = topic.children;
        }
        if (attached && attached.length) {
            out.children = {
                attached: attached.map(tcXmindZenNormalizeTopicTree).filter(Boolean)
            };
        }
        return out;
    }

    function tcBuildXmindZenWorkbookBlob(rootTopic, opts) {
        opts = opts || {};
        if (!rootTopic) return null;

        var normalizedRoot = tcXmindZenNormalizeTopicTree(rootTopic);
        if (!normalizedRoot && rootTopic.topic != null) {
            normalizedRoot = tcJsmindNodeToXmindZenTopic(rootTopic);
        }
        if (!normalizedRoot) return null;
        normalizedRoot.class = 'topic';

        var sheetId = tcXmindZenNewId();
        var sheet = {
            id: sheetId,
            class: 'sheet',
            title: String(opts.sheetTitle || '测试用例'),
            extensions: [],
            topicPositioning: 'fixed',
            topicOverlapping: 'overlap',
            coreVersion: '2.100.0',
            rootTopic: normalizedRoot
        };

        var contentJson = JSON.stringify([sheet]);
        var metadataJson = JSON.stringify({
            modifier: '',
            dataStructureVersion: '2',
            creator: { name: 'TestHub', version: '1.0' },
            layoutEngineVersion: '3',
            activeSheetId: sheetId
        });
        var manifestJson = JSON.stringify({
            'file-entries': {
                'content.json': {},
                'metadata.json': {},
                'manifest.json': {},
                'content.xml': {}
            }
        });

        var enc = new TextEncoder();
        var entries = [
            { name: 'content.json', data: enc.encode(contentJson) },
            { name: 'metadata.json', data: enc.encode(metadataJson) },
            { name: 'manifest.json', data: enc.encode(manifestJson) },
            { name: 'content.xml', data: enc.encode(tcXmindZenContentXmlStub()) }
        ];

        if (typeof global.tcBuildStoredZipBlob === 'function') {
            return global.tcBuildStoredZipBlob(entries);
        }
        return null;
    }

    function tcDownloadXmindZenBlob(rootTopic, filenameStem, opts) {
        var blob = tcBuildXmindZenWorkbookBlob(rootTopic, opts);
        if (!blob) return false;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (filenameStem || '测试用例') + '_' + new Date().toISOString().slice(0, 10) + '.xmind';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    }

    global.tcJsmindNodeToXmindZenTopic = tcJsmindNodeToXmindZenTopic;
    global.tcXmindZenNormalizeTopicTree = tcXmindZenNormalizeTopicTree;
    global.tcBuildXmindZenWorkbookBlob = tcBuildXmindZenWorkbookBlob;
    global.tcDownloadXmindZenBlob = tcDownloadXmindZenBlob;
})(typeof window !== 'undefined' ? window : globalThis);
