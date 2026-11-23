// Where agents (the MCP server, the CLI) find the running app and its token.
import os from 'node:os';
import path from 'node:path';

export function discoveryFile(env = process.env) {
  if (env.WENDAFLOW_AGENT_FILE) return env.WENDAFLOW_AGENT_FILE;
  const base = process.platform === 'win32' ? (env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')) : (env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'wendaflow', 'agent.json');
}
