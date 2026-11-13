// Runs one npm script in every sub-project, one after another, and fails if any failed.
// Sequential on purpose: each suite takes about a second, and interleaved output is hard to read.
// Every project runs even after a failure, so one broken suite never hides the other's results.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECTS = ['epec-consumos-webhooks-server', 'epec-consumption-reporting-extension'];

const scriptName = process.argv[2];
if (!scriptName) {
    console.error('Usage: node scripts/run-in-projects.mjs <npm-script>');
    process.exit(2);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = PROJECTS.map((project) => runScript(project, scriptName));

printSummary(results);
process.exit(results.every((result) => result.passed) ? 0 : 1);

function runScript(project, script) {
    console.log(`\n▶ ${project}: npm run ${script}\n`);
    // shell: true so "npm" resolves to npm.cmd on Windows.
    const { status } = spawnSync('npm', ['run', script], { cwd: join(repoRoot, project), stdio: 'inherit', shell: true });
    return { project, passed: status === 0 };
}

function printSummary(results) {
    console.log(`\n── npm run ${scriptName} ──`);
    for (const { project, passed } of results) {
        console.log(`${passed ? '✔' : '✖'} ${project}`);
    }
}
