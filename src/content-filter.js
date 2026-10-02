// MVP demonstration vocabulary. Replace via a reviewed wordlist/service before public launch.
const DEMO_BLOCKED_TERMS = ['测试屏蔽词', '恶意辱骂'];

export function screenComment(text, terms = DEMO_BLOCKED_TERMS) {
  const normalized = String(text).replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
  const matched = terms.find((term) => normalized.includes(term.toLocaleLowerCase('zh-CN')));
  return { allowed: !matched, reason: matched ? '文字触发了内容筛选，请修改后再提交。' : '' };
}

export const filterVersion = 'demo-1';
