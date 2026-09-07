"""JMeter 5.6.3 组件目录：从 saveservice.properties 解析并分类（隔离模块）。"""

import os
import re
import subprocess
from functools import lru_cache
from pathlib import Path

JMETER_HOME = Path(os.environ.get("JMETER_HOME", "/opt/jmeter"))
SAVE_SERVICE = JMETER_HOME / "bin/saveservice.properties"

SKIP_SUFFIXES = (
    "Gui", "Panel", "Model", "Property", "Wrapper", "Visualizer",
    "ControlPanel", "ConfigGui", "TestElementGui", "SamplerGui",
)
SKIP_EXACT = {
    "Argument", "Arguments", "ArgumentsPanel", "NamePanel", "ObsoleteGui",
    "SampleSaveConfiguration", "ResultSaver", "PropertyControlGui",
    "RemoteListenerWrapper", "RemoteSampleListenerWrapper",
    "RemoteTestListenerWrapper", "RemoteThreadsListenerWrapper",
    "FloatProperty", "IntegerProperty", "LongProperty", "BooleanProperty",
    "StringProperty", "DoubleProperty", "CollectionProperty",
    "TestPlanGui", "WorkBenchGui",
}

CATEGORY_META = [
    ("test_plan", "测试计划", "Test Plan", "顶层测试计划与工作台元素"),
    ("thread_group", "线程组", "Thread Group", "并发用户与调度（含 SetUp / TearDown）"),
    ("controller", "逻辑控制器", "Logic Controller", "控制取样器执行顺序与条件"),
    ("config", "配置元件", "Config Element", "默认值、变量、CSV、Cookie 等"),
    ("sampler", "取样器", "Sampler", "HTTP / JDBC / Java / JMS 等请求"),
    ("timer", "定时器", "Timer", "思考时间与吞吐量控制"),
    ("preprocessor", "前置处理器", "Pre-Processor", "请求发送前的脚本与变量处理"),
    ("postprocessor", "后置处理器", "Post-Processor", "响应提取与脚本处理"),
    ("assertion", "断言", "Assertion", "响应校验"),
    ("listener", "监听器", "Listener", "结果收集、报告与 Backend Listener"),
    ("other", "其他组件", "Other", "代理、邮件、杂项与扩展"),
]

PLUGIN_COMPONENTS = [
    {"alias": "PerfMon Metrics Collector", "class": "kg.apc.jmeter.vizualizers.PerfMonitorCollector", "category": "listener", "label_zh": "PerfMon 性能监控", "scope": "plugin", "description": "JMeter Plugins - Server Agent 性能指标"},
    {"alias": "Custom Thread Groups", "class": "com.blazemeter.jmeter.threads.concurrency.ConcurrencyThreadGroup", "category": "thread_group", "label_zh": "Concurrency Thread Group", "scope": "plugin", "description": "JMeter Plugins - 并发线程组"},
    {"alias": "Throughput Shaping Timer", "class": "kg.apc.jmeter.timers.VariableThroughputTimer", "category": "timer", "label_zh": "吞吐量 shaping 定时器", "scope": "plugin", "description": "JMeter Plugins - 动态吞吐量"},
    {"alias": "Dummy Sampler", "class": "kg.apc.jmeter.samplers.DummySampler", "category": "sampler", "label_zh": "Dummy 取样器", "scope": "plugin", "description": "JMeter Plugins - 占位/调试取样器"},
    {"alias": "Flexible File Writer", "class": "kg.apc.jmeter.vizualizers.FlexibleFileWriter", "category": "listener", "label_zh": "灵活文件写入器", "scope": "plugin", "description": "JMeter Plugins - 自定义结果输出"},
    {"alias": "InterThread Communication", "class": "kg.apc.jmeter.control.InterThreadCommunication", "category": "config", "label_zh": "线程间通信", "scope": "plugin", "description": "JMeter Plugins - 跨线程组变量传递"},
]

LABEL_ZH = {
    "TestPlan": "测试计划",
    "ThreadGroup": "线程组",
    "SetupThreadGroup": "SetUp 线程组",
    "PostThreadGroup": "Post 线程组",
    "OpenModelThreadGroup": "开放模型线程组",
    "LoopController": "循环控制器",
    "IfController": "If 控制器",
    "WhileController": "While 控制器",
    "ForEachController": "ForEach 控制器",
    "TransactionController": "事务控制器",
    "SimpleController": "简单控制器",
    "RandomController": "随机控制器",
    "RandomOrderController": "随机顺序控制器",
    "ModuleController": "模块控制器",
    "IncludeController": "Include 控制器",
    "SwitchController": "Switch 控制器",
    "OnceOnlyController": "仅一次控制器",
    "CriticalSectionController": "临界区控制器",
    "InterleaveControl": "交替控制器",
    "ThroughputController": "吞吐量控制器",
    "RunTime": "运行时间控制器",
    "RecordingController": "录制控制器",
    "HTTPSamplerProxy": "HTTP 请求",
    "HTTPSampler": "HTTP 请求(旧)",
    "AjpSampler": "AJP 请求",
    "AccessLogSampler": "访问日志取样器",
    "DebugSampler": "Debug 取样器",
    "JavaSampler": "Java 请求",
    "BeanShellSampler": "BeanShell 取样器",
    "BSFSampler": "BSF 取样器",
    "JSR223Sampler": "JSR223 取样器",
    "JUnitSampler": "JUnit 请求",
    "JDBCSampler": "JDBC 请求",
    "JMSSampler": "JMS 点对点",
    "PublisherSampler": "JMS 发布",
    "SubscriberSampler": "JMS 订阅",
    "LDAPSampler": "LDAP 请求",
    "LDAPExtSampler": "LDAP 扩展请求",
    "MailReaderSampler": "邮件读取取样器",
    "SmtpSampler": "SMTP 取样器",
    "TcpSampler": "TCP 取样器",
    "FtpSampler": "FTP 请求",
    "BoltSampler": "Bolt 请求",
    "MongoScriptSampler": "MongoDB 脚本",
    "ConfigTestElement": "HTTP 请求默认值",
    "Arguments": "用户定义的变量",
    "HeaderManager": "HTTP 信息头管理器",
    "CookieManager": "HTTP Cookie 管理器",
    "CacheManager": "HTTP 缓存管理器",
    "DNSCacheManager": "DNS 缓存管理器",
    "AuthManager": "HTTP 授权管理器",
    "CSVDataSet": "CSV 数据文件设置",
    "CounterConfig": "计数器",
    "RandomVariableConfig": "随机变量",
    "KeystoreConfig": "Keystore 配置",
    "LoginConfig": "登录配置",
    "BackendListener": "Backend Listener",
    "ResultCollector": "结果收集器",
    "ViewResultsFullVisualizer": "查看结果树",
    "StatVisualizer": "聚合报告",
    "SummaryReport": "汇总报告",
    "GraphVisualizer": "图形结果",
    "TableVisualizer": "用表格察看结果",
    "BeanShellPreProcessor": "BeanShell 前置处理器",
    "BeanShellPostProcessor": "BeanShell 后置处理器",
    "JSR223PreProcessor": "JSR223 前置处理器",
    "JSR223PostProcessor": "JSR223 后置处理器",
    "RegexExtractor": "正则表达式提取器",
    "JSONPostProcessor": "JSON 提取器",
    "BoundaryExtractor": "边界提取器",
    "XPathExtractor": "XPath 提取器",
    "XPath2Extractor": "XPath2 提取器",
    "JMESPathExtractor": "JMESPath 提取器",
    "ResponseAssertion": "响应断言",
    "DurationAssertion": "持续时间断言",
    "SizeAssertion": "大小断言",
    "XMLAssertion": "XML 断言",
    "XPathAssertion": "XPath 断言",
    "XPath2Assertion": "XPath2 断言",
    "JSONPathAssertion": "JSON 断言",
    "JSR223Assertion": "JSR223 断言",
    "BeanShellAssertion": "BeanShell 断言",
    "MD5HexAssertion": "MD5 断言",
    "ConstantTimer": "固定定时器",
    "UniformRandomTimer": "均匀随机定时器",
    "GaussianRandomTimer": "高斯随机定时器",
    "PoissonRandomTimer": "泊松随机定时器",
    "ConstantThroughputTimer": "常数吞吐量定时器",
    "PreciseThroughputTimer": "精确吞吐量定时器",
    "SyncTimer": "同步定时器",
    "BeanShellTimer": "BeanShell 定时器",
    "JSR223Timer": "JSR223 定时器",
    "ProxyControl": "HTTP(S) 测试脚本录制",
    "TestFragmentController": "测试片段",
}


def _should_skip(alias: str) -> bool:
    if alias in SKIP_EXACT:
        return True
    return any(alias.endswith(s) for s in SKIP_SUFFIXES)


def _classify(alias: str, fqcn: str) -> str:
    low = alias.lower()
    fq = fqcn.lower()
    if alias in ("TestPlan", "WorkBench"):
        return "test_plan"
    if "threadgroup" in low or "threadgroup" in fq:
        return "thread_group"
    if alias.endswith("Controller") or ".control." in fq:
        return "controller"
    if any(x in low for x in ("Assertion",)) or ".assertions." in fq:
        return "assertion"
    if any(x in low for x in ("PreProcessor",)) or ".modifiers." in fq and "pre" in low:
        return "preprocessor"
    if any(x in low for x in ("PostProcessor", "Extractor")) or ".extractor." in fq:
        return "postprocessor"
    if "timer" in low or ".timers." in fq:
        return "timer"
    if "sampler" in low or ".sampler." in fq:
        return "sampler"
    if any(x in low for x in ("Listener", "Visualizer", "ResultCollector", "BackendListener")) or ".visualizers." in fq or ".reporters." in fq:
        return "listener"
    if any(x in low for x in ("Config", "Manager", "DataSet", "Arguments", "Auth", "Cookie", "Cache", "DNS", "Counter", "Keystore", "Login")) or ".config." in fq:
        return "config"
    return "other"


def _run_cmd(cmd: list) -> str:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, timeout=20)
        return out.strip()
    except Exception:
        return ""


def get_runtime_info() -> dict:
    jmeter_v = _run_cmd(["/opt/jmeter/bin/jmeter", "-v"]) or ""
    java_v = _run_cmd(["java", "-version"])
    mvn_v = _run_cmd(["mvn", "-version"]) or _run_cmd(["/opt/maven/bin/mvn", "-version"])
    plugins = sorted(p.name for p in (JMETER_HOME / "lib/ext").glob("*.jar"))
    return {
        "jmeter_home": str(JMETER_HOME),
        "jmeter_version": "5.6.3" if "5.6.3" in jmeter_v else (jmeter_v.split("\n")[-1] if jmeter_v else "unknown"),
        "java_version": java_v.split("\n")[0] if java_v else "unknown",
        "maven_version": mvn_v.split("\n")[0] if mvn_v else "not installed",
        "plugin_jars": plugins,
        "plugin_jar_count": len(plugins),
    }



# ResultCollector 在 SaveService 中只有一个别名；官方 GUI 子类需注入以便取样器挂载菜单展示
OFFICIAL_LISTENER_GUI_ALIASES = (
    {
        "alias": "ViewResultsFullVisualizer",
        "class": "org.apache.jmeter.visualizers.ViewResultsFullVisualizer",
        "category": "listener",
        "label_zh": "查看结果树",
        "scope": "core",
        "description": "org.apache.jmeter.reporters.ResultCollector / ViewResultsFullVisualizer",
        "testclass": "ResultCollector",
        "guiclass": "ViewResultsFullVisualizer",
    },
    {
        "alias": "StatVisualizer",
        "class": "org.apache.jmeter.visualizers.StatVisualizer",
        "category": "listener",
        "label_zh": "聚合报告",
        "scope": "core",
        "description": "org.apache.jmeter.reporters.ResultCollector / StatVisualizer",
        "testclass": "ResultCollector",
        "guiclass": "StatVisualizer",
    },
    {
        "alias": "GraphVisualizer",
        "class": "org.apache.jmeter.visualizers.GraphVisualizer",
        "category": "listener",
        "label_zh": "图形结果",
        "scope": "core",
        "description": "org.apache.jmeter.reporters.ResultCollector / GraphVisualizer",
        "testclass": "ResultCollector",
        "guiclass": "GraphVisualizer",
    },
    {
        "alias": "TableVisualizer",
        "class": "org.apache.jmeter.visualizers.TableVisualizer",
        "category": "listener",
        "label_zh": "用表格察看结果",
        "scope": "core",
        "description": "org.apache.jmeter.reporters.ResultCollector / TableVisualizer",
        "testclass": "ResultCollector",
        "guiclass": "TableVisualizer",
    },
)


def ensure_official_listener_components(data: dict) -> dict:
    """旁路补齐官方监听器 GUI 别名，不改动 SaveService 解析主流程。"""
    if not isinstance(data, dict):
        return data
    items = list(data.get("components") or [])
    seen = {str(x.get("alias") or "") for x in items if isinstance(x, dict)}
    changed = False
    for row in OFFICIAL_LISTENER_GUI_ALIASES:
        alias = row["alias"]
        if alias in seen:
            continue
        items.append(dict(row))
        seen.add(alias)
        changed = True
    if not changed:
        return data
    items.sort(key=lambda x: (x.get("category") or "", x.get("label_zh") or "", x.get("alias") or ""))
    out = dict(data)
    out["components"] = items
    out["total"] = len(items)
    cats = out.get("categories")
    if isinstance(cats, list):
        n_listener = sum(1 for x in items if isinstance(x, dict) and x.get("category") == "listener")
        new_cats = []
        for c in cats:
            if isinstance(c, dict) and c.get("id") == "listener":
                c = dict(c)
                c["count"] = n_listener
            new_cats.append(c)
        out["categories"] = new_cats
    return out


CATALOG_JSON = Path(__file__).resolve().parent / "jmeter_component_catalog.json"

@lru_cache(maxsize=1)
def build_component_catalog() -> dict:
    if CATALOG_JSON.is_file():
        try:
            import json as _json
            return ensure_official_listener_components(_json.loads(CATALOG_JSON.read_text(encoding="utf-8")))
        except Exception:
            pass
    items: list = []
    if SAVE_SERVICE.is_file():
        for raw in SAVE_SERVICE.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            alias, fqcn = line.split("=", 1)
            alias = alias.strip()
            fqcn = fqcn.strip()
            if alias.startswith("_") or _should_skip(alias):
                continue
            cat = _classify(alias, fqcn)
            items.append({
                "alias": alias,
                "class": fqcn,
                "category": cat,
                "label_zh": LABEL_ZH.get(alias, alias),
                "scope": "core",
                "description": fqcn,
            })

    seen = {x["alias"] for x in items}
    for p in PLUGIN_COMPONENTS:
        if p["alias"] not in seen:
            items.append(dict(p))
            seen.add(p["alias"])

    items.sort(key=lambda x: (x["category"], x["label_zh"], x["alias"]))
    categories = []
    counts: dict = {k: 0 for k, *_ in CATEGORY_META}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    for key, zh, en, desc in CATEGORY_META:
        categories.append({
            "id": key,
            "label_zh": zh,
            "label_en": en,
            "description": desc,
            "count": counts.get(key, 0),
        })

    tree = {
        "id": "test_plan_root",
        "label_zh": "测试计划",
        "label_en": "Test Plan",
        "children": [
            {"id": "tg", "label_zh": "线程组", "label_en": "Thread Group", "category": "thread_group", "children": [
                {"id": "tg_config", "label_zh": "配置元件", "category": "config"},
                {"id": "tg_controller", "label_zh": "逻辑控制器", "category": "controller"},
                {"id": "tg_sampler", "label_zh": "取样器", "category": "sampler"},
                {"id": "tg_timer", "label_zh": "定时器", "category": "timer"},
                {"id": "tg_pre", "label_zh": "前置处理器", "category": "preprocessor"},
                {"id": "tg_post", "label_zh": "后置处理器", "category": "postprocessor"},
                {"id": "tg_assert", "label_zh": "断言", "category": "assertion"},
                {"id": "tg_listener", "label_zh": "监听器", "category": "listener"},
            ]},
            {"id": "plan_listener", "label_zh": "测试计划级监听器", "category": "listener"},
            {"id": "plan_other", "label_zh": "其他 / 插件", "category": "other"},
        ],
    }

    return ensure_official_listener_components({
        "generated_from": str(SAVE_SERVICE),
        "total": len(items),
        "categories": categories,
        "components": items,
        "tree": tree,
        "runtime": get_runtime_info(),
    })
