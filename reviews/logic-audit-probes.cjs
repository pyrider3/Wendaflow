// Regression runner replacing the original reproduction-only audit probes.
const {spawnSync}=require('node:child_process');const path=require('node:path');const root=path.join(__dirname,'..');
const result=spawnSync(process.execPath,['--test','src/canvas/document.test.mjs','src/canvas/storage.test.mjs','src/canvas/workflow.test.mjs'],{cwd:root,stdio:'inherit'});process.exitCode=result.status??1;
