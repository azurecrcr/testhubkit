from core.services.test_cases.lanhu_requirement_service import (
    _build_sitemap_tree_nodes,
    _count_sitemap_tree_pages,
    fetch_lanhu_sitemap_tree,
)


SAMPLE_ROOT_NODES = [
    {
        "pageName": "首页",
        "url": "home.html",
        "id": "p1",
        "type": "Wireframe",
        "children": [],
    },
    {
        "pageName": "模块A",
        "url": "",
        "id": "f1",
        "type": "Folder",
        "children": [
            {
                "pageName": "列表页",
                "url": "list.html",
                "id": "p2",
                "type": "Wireframe",
                "children": [],
            }
        ],
    },
]


def test_build_sitemap_tree_nodes_hierarchy():
    tree = _build_sitemap_tree_nodes(SAMPLE_ROOT_NODES)
    assert len(tree) == 2
    assert tree[0]["type"] == "page"
    assert tree[0]["page_id"] == "p1"
    assert tree[1]["type"] == "folder"
    assert len(tree[1]["children"]) == 1
    assert tree[1]["children"][0]["name"] == "列表页"


def test_count_sitemap_tree_pages():
    tree = _build_sitemap_tree_nodes(SAMPLE_ROOT_NODES)
    assert _count_sitemap_tree_pages(tree) == 2


def test_fetch_lanhu_sitemap_tree_mock(monkeypatch):
    class FakeResp:
        def __init__(self, payload):
            self._payload = payload
            self.status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeSession:
        def get(self, url, **kwargs):
            if url.endswith("/api/project/image"):
                return FakeResp({
                    "code": 0,
                    "data": {
                        "name": "测试文档",
                        "versions": [{"json_url": "https://example.com/map.json"}],
                    },
                })
            if "map.json" in url:
                return FakeResp({
                    "sitemap": {"rootNodes": SAMPLE_ROOT_NODES},
                })
            raise AssertionError(url)

    monkeypatch.setattr(
        "core.services.test_cases.lanhu_requirement_service._make_lanhu_session",
        lambda *_a, **_k: FakeSession(),
    )
    result = fetch_lanhu_sitemap_tree(
        "session=abc",
        "https://lanhuapp.com/web/#/item/project/product?pid=1&docId=d1&pageId=p2",
    )
    assert result["doc_name"] == "测试文档"
    assert result["page_count"] == 2
    assert result["focus_page_id"] == "p2"
    assert len(result["tree"]) == 2
