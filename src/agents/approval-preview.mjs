// What an approval card shows for a tool call Pi wants to make: the real command / file change, not just a path.
const clip = (text, limit = 6000) => { const value = String(text ?? ''); return value.length > limit ? `${value.slice(0, limit)}\n…` : value; };

export function approvalPreview(tool, input) {
  if (!input || typeof input !== 'object') return input ? { kind: 'text', text: clip(input) } : null;
  const file = input.path || input.file_path || input.file;
  if (typeof input.command === 'string' || typeof input.cmd === 'string') return { kind: 'command', command: clip(input.command || input.cmd) };
  if (Array.isArray(input.edits) && input.edits.some((edit) => edit && typeof edit.oldText === 'string')) {
    return { kind: 'edit', path: file ? String(file) : '', edits: input.edits.slice(0, 12).map((edit) => ({ from: clip(edit.oldText, 3000), to: clip(edit.newText, 3000) })) };
  }
  if (typeof input.oldText === 'string' || typeof input.old_string === 'string') {
    return { kind: 'edit', path: file ? String(file) : '', edits: [{ from: clip(input.oldText ?? input.old_string, 3000), to: clip(input.newText ?? input.new_string, 3000) }] };
  }
  if (file && typeof input.content === 'string') return { kind: 'write', path: String(file), content: clip(input.content), bytes: Buffer.byteLength(input.content) };
  return { kind: 'text', text: clip(JSON.stringify(input, null, 2)) };
}

// Lines added and removed by a file-editing tool call, for the "+N −M" badge on a running card.
// Returns null for calls that do not change a file.
export function diffStat(input) {
  if (!input || typeof input !== 'object') return null;
  const lines = (text) => (typeof text === 'string' && text.length ? text.replace(/\n$/, '').split('\n').length : 0);
  const edits = Array.isArray(input.edits) ? input.edits : (typeof input.oldText === 'string' || typeof input.old_string === 'string') ? [{ oldText: input.oldText ?? input.old_string, newText: input.newText ?? input.new_string }] : null;
  if (edits) return edits.reduce((sum, edit) => ({ added: sum.added + lines(edit?.newText), removed: sum.removed + lines(edit?.oldText) }), { added: 0, removed: 0 });
  if ((input.path || input.file_path || input.file) && typeof input.content === 'string') return { added: lines(input.content), removed: 0 };
  return null;
}
