// "Always allow this kind of thing" rules for Pi's approval requests, remembered per working folder.
// Deliberately narrow: a command rule never matches anything that chains, pipes, redirects or substitutes.
import path from 'node:path';

const CHAINING = /[;&|`$<>\n\r]|\$\(/;
const SUBCOMMAND_TOOLS = new Set(['git', 'npm', 'pnpm', 'yarn', 'npx', 'cargo', 'docker', 'kubectl', 'go', 'pip', 'pip3', 'uv', 'make', 'systemctl', 'gh']);
// Programs that can do anything with the right argument: only the exact command may be remembered, never a prefix.
const OPEN_ENDED = new Set(['rm', 'sudo', 'su', 'dd', 'mkfs', 'chmod', 'chown', 'curl', 'wget', 'sh', 'bash', 'zsh', 'fish', 'eval', 'exec', 'env', 'xargs', 'ssh', 'scp', 'kill', 'pkill', 'mv', 'cp', 'node', 'python', 'python3', 'bun', 'deno', 'perl', 'ruby', 'php', 'find', 'awk', 'sed', 'tee', 'nc', 'npx']);

const commandOf = (input) => String(input?.command ?? input?.cmd ?? '').trim();
const insideFolder = (folder, file) => {
  if (!file) return false;
  const root = path.resolve(folder), target = path.resolve(root, String(file));
  return target !== root && target.startsWith(root + path.sep);
};

export function suggestRule(tool, input, folder) {
  if (tool === 'bash') {
    const command = commandOf(input);
    if (!command || CHAINING.test(command)) return null;
    const tokens = command.split(/\s+/);
    if (OPEN_ENDED.has(tokens[0])) return { rule: { tool: 'bash', exact: command }, label: command.length > 80 ? `${command.slice(0, 80)}…` : command, kind: 'exact' };
    const prefix = SUBCOMMAND_TOOLS.has(tokens[0]) && tokens[1] && !tokens[1].startsWith('-') ? `${tokens[0]} ${tokens[1]}` : tokens[0];
    return { rule: { tool: 'bash', prefix }, label: prefix, kind: 'prefix' };
  }
  if ((tool === 'edit' || tool === 'write') && insideFolder(folder, input?.path || input?.file_path)) return { rule: { tool: 'files' }, label: '', kind: 'files' };
  return null;
}

export function matchesRule(rules, tool, input, folder) {
  for (const rule of rules || []) {
    if (rule.tool === 'bash' && tool === 'bash') {
      const command = commandOf(input);
      if (!command || CHAINING.test(command)) continue;
      if (rule.exact !== undefined ? command === rule.exact : command === rule.prefix || command.startsWith(`${rule.prefix} `)) return true;
    } else if (rule.tool === 'files' && (tool === 'edit' || tool === 'write') && insideFolder(folder, input?.path || input?.file_path)) return true;
  }
  return false;
}

export const sameRule = (a, b) => a.tool === b.tool && a.prefix === b.prefix && a.exact === b.exact;
