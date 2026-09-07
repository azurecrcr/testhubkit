p="/root/TestHub/static/js/case_to_mindmap.js"
t=open(p,encoding="utf-8-sig").read()
t=t.replace("function runAiPolish() {","function runAiPolish(userAiGatePassed) {")
t=t.replace("if (useBuiltin && window.HfUserAiConfig","if (!userAiGatePassed && useBuiltin && window.HfUserAiConfig")
t=t.replace("runAiPolish();\n            });","runAiPolish(true);\n            });")
open(p,"w",encoding="utf-8").write(t)
print("fixed ctm")
