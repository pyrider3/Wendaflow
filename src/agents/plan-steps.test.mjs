import test from 'node:test';
import assert from 'node:assert/strict';
import { planSteps } from './plan-steps.mjs';

test('numbered plan steps are found in a finished card, with sub-points kept on their step', () => {
  const content = '整理 README\n\n---\n\n**Pi 执行结果**\n\n计划如下：\n\n1. 读取 README.md，列出过时的段落\n   - 安装说明\n2. **改写**功能介绍\n3) 更新截图链接\n\n风险：无';
  assert.deepEqual(planSteps(content), ['读取 README.md，列出过时的段落 安装说明', '改写功能介绍', '更新截图链接']);
});

test('Chinese and English step headings both count', () => {
  assert.deepEqual(planSteps('### 步骤 1：备份\n### 步骤 2：迁移'), ['备份', '迁移']);
  assert.deepEqual(planSteps('Step 1: back up\nStep 2: migrate'), ['back up', 'migrate']);
});

test('bullets are used when the plan has no numbers, and a single item is not a checklist', () => {
  assert.deepEqual(planSteps('- 先看目录\n- 再改代码'), ['先看目录', '再改代码']);
  assert.deepEqual(planSteps('只有一句说明'), []);
});
