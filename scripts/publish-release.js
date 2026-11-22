// Publishes the already-built installer (npm run electron:build) as a GitHub
// Release on the (public) Knightly repo, so every installed desktop app's
// "Check for updates" finds it.
//
// Usage: npm run release            (builds, then runs this)
//        node scripts/publish-release.js "release notes text"
//
// latest.yml (what electron-updater reads) names the installer
// Knightly-Setup-<version>.exe with dashes, so the files are uploaded under
// those names. Needs the GitHub CLI (gh), logged in with the 'repo' scope.
const { readFileSync, copyFileSync, mkdtempSync, existsSync } = require('fs');
const { execFileSync } = require('child_process');
const { tmpdir } = require('os');
const { join } = require('path');

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { version } = pkg;
const { owner, repo } = pkg.build.publish;
const notes = process.argv[2] || `Knightly v${version} for Windows.`;
const gh = existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh';

const latest = readFileSync(join(root, 'release', 'latest.yml'), 'utf8');
if (!latest.includes(`version: ${version}\n`) && !latest.includes(`version: ${version}\r\n`)) {
  console.error(`release/latest.yml isn't for ${version}. Run npm run electron:build first.`);
  process.exit(1);
}

const stage = mkdtempSync(join(tmpdir(), 'knightly-release-'));
const files = [
  [`Knightly Setup ${version}.exe`, `Knightly-Setup-${version}.exe`],
  [`Knightly Setup ${version}.exe.blockmap`, `Knightly-Setup-${version}.exe.blockmap`],
  ['latest.yml', 'latest.yml'],
].map(([from, to]) => { copyFileSync(join(root, 'release', from), join(stage, to)); return join(stage, to); });

execFileSync(gh, ['release', 'create', `v${version}`, '--repo', `${owner}/${repo}`, '--title', version, '--notes', notes, ...files], { cwd: root, stdio: 'inherit' });
console.log(`Published ${owner}/${repo} v${version}. Installed apps will find it on their next check.`);
