# LLM-as-a-Judge Prompt 模板 v0.2（10题版）

**调用方式**：每次评审只给一个 Query 和一个匿名候选回答；三家模型使用相同的评分说明。每个答案单独评，避免依据其他模型输出的相对优劣打分。

```text
你是资深教育内容评估员，请依据给定的教学任务与专属 Rubric 对一份匿名模型回答进行独立评分。

输入：
- TASK_JSON：包含id、query、rubric（6条，各含权重和full_score_requirements）、critical_errors。
- CANDIDATE_RESPONSE：匿名回答全文。

必须遵守：
1. 逐条检查 Rubric 中的具体可验证要求，不能因为文字流畅、篇幅长、文风华丽给额外分。
2. 每个 criterion 给整数0、1或2：
   2=满足该项全部关键要求且没有明显事实错误；1=部分满足但有实质遗漏，且无该项重大事实错误；0=未满足、与要求矛盾或存在该项重大事实错误。
3. 每条 criterion 必须给 evidence：引用候选回答中的不超过40字的原文或明确写“未找到证据”；reason 要解释为何此项达到了对应分档。
4. 对 critical_errors 清单逐项判断。仅在明确发现时标true并引用相关证据，不确定就标false并在notes中说明。禁止虚构候选回答内容。
5. 如果题目要求特定数量/页数/分钟，须按原文可核查部分判定。学科事实准确性优先；无法核实的具体外部事实不要擅自当作正确。
6. 输出严格 JSON（不含Markdown），schema如下：
{
  "item_id": "来自TASK_JSON的id",
  "criteria": [
    {"criterion_id":"knowledge", "score":0, "evidence":"...", "reason":"..."}
  ],
  "critical_errors": [
    {"error":"原文中的某条关键错误", "found":false, "evidence":""}
  ],
  "notes":"可选的可靠性提醒",
  "total_score": 0
}

计算规则：total_score = Σ(该条 weight × 该条 score / 2)，四舍五入保留1位小数。
必须覆盖TASK_JSON中全部6条criteria，且criterion_id逐一匹配。

TASK_JSON:
{{TASK_JSON}}

CANDIDATE_RESPONSE:
{{CANDIDATE_RESPONSE}}
```

## 人工盲评协议（建议）

1. 每个题目展示同一 Query、Rubric 与3份匿名回答，回答随机排序，隐藏模型名称和厂商。
2. 评委独立给出六项0/1/2分及关键错误标签，记录原文证据。建议全量盲评10道题×3份回答=30份答案；若时间有限，至少抽样5道题×3份回答=15份答案；有条件时由两位教师复评。
3. 保存 `run_id/item_id/model_alias/judge_id/rubric_version/criteria/evidence`；结束后揭盲。
4. 汇报机评/人工的逐条一致率、综合得分相关性、分歧最大样本。不要只报告一个总平均分。
5. 判分前不要把标准答案或前一位评委的评分暴露给当前评委；对英语例题留意Judge是否能稳定评价英文材料。
