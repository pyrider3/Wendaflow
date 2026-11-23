// `--key value` pairs become JSON arguments; values that parse as JSON
// (numbers, booleans, arrays, objects) keep their type.
export function parseCliArgs(argv) {
  const args = {}; let out = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [key, inline] = token.slice(2).split(/=(.*)/s, 2);
    const value = inline !== undefined ? inline : (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
    if (key === 'json') Object.assign(args, JSON.parse(value));
    else if (key === 'out') out = value;
    else { try { args[key] = JSON.parse(value); } catch { args[key] = value; } }
  }
  // Ids and free text stay strings even when they look like numbers.
  for (const key of ['prompt', 'title', 'content', 'name', 'request', 'nodeId', 'canvasId', 'parentId', 'childId']) if (key in args && typeof args[key] !== 'string' && args[key] !== null) args[key] = String(args[key]);
  return { args, out };
}
