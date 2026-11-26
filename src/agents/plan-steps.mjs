// The steps of a plan an agent wrote in "plan first" mode, so the card can offer them as a checklist and
// run only the ones the user keeps. A step is a top-level numbered item ("1." "2)" "步骤 3：" "Step 4:");
// when the plan has no numbers, top-level bullets count instead. Sub-points stay with their step.
export function planSteps(text) {
  const body = String(text || '');
  // A finished card's content is "task --- **<agent> 执行结果** output"; only the output holds the plan.
  const marker = body.search(/\*\*[^*\n]*(执行结果|execution results)\*\*/i);
  const plan = marker >= 0 ? body.slice(marker).replace(/^\*\*[^*\n]*\*\*\s*/, '') : body;
  const lines = plan.split('\n');
  const numbered = /^\s{0,3}(?:#{1,4}\s*)?(?:\*\*)?\s*(?:(?:步骤|第)\s*\d+\s*[步:：.、)]?|step\s*\d+\s*[:.)]?|\d{1,2}\s*[.)、])\s*(.*)$/i;
  const bullet = /^\s{0,1}[-*•]\s+(.*)$/;
  const collect = (pattern) => {
    const steps = [];
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) { steps.push(match[1].replace(/\*\*/g, '').trim()); continue; }
      if (steps.length && /^\s+\S/.test(line) && steps[steps.length - 1].length < 600) steps[steps.length - 1] += ` ${line.trim().replace(/^[-*•]\s+/, '')}`;
    }
    return steps.filter((step) => step.length > 1).map((step) => step.slice(0, 400));
  };
  const steps = collect(numbered);
  return (steps.length >= 2 ? steps : collect(bullet)).slice(0, 30);
}
