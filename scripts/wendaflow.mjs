#!/usr/bin/env node
// Wendaflow command line: one agent API call per run, JSON out.
//   node scripts/wendaflow.mjs <method> [--key value ...] [--json '{"key":"value"}']
//   node scripts/wendaflow.mjs ask --parentId agent-123 --prompt "Why?"
//   node scripts/wendaflow.mjs export_canvas --format png --out canvas.png
import { writeFile } from 'node:fs/promises';
import { createClient } from '../src/agent-api/client.mjs';
import { TOOLS } from '../src/agent-api/mcp.mjs';
import { parseCliArgs } from '../src/agent-api/cli-args.mjs';

const [command, ...rest] = process.argv.slice(2);
if (!command || command === 'help' || command === '--help') {
  console.log('Usage: wendaflow <method> [--key value ...] [--json \'{...}\'] [--out file]\n\nMethods:');
  for (const tool of TOOLS) console.log(`  ${tool.method.padEnd(14)} ${tool.description}`);
  process.exit(command ? 0 : 1);
}
try {
  const { args, out } = parseCliArgs(rest);
  const result = await createClient().call(command, args);
  if (out && (result.base64 || typeof result.text === 'string')) {
    await writeFile(out, result.base64 ? Buffer.from(result.base64, 'base64') : result.text);
    console.log(JSON.stringify({ saved: out, format: result.format }, null, 2));
  } else if (command === 'export_canvas' && typeof result.text === 'string') process.stdout.write(result.text);
  else console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
