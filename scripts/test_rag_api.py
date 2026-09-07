import json
import urllib.request

req = urllib.request.Request(
    "http://127.0.0.1:5000/api/rag/retrieve",
    data=json.dumps({"query": "login password"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
print("available", data.get("available"))
print("sources", data.get("sources"))
print("ctx_len", len(data.get("context") or ""))
print("error", data.get("error"))
