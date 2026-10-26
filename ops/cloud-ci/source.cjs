// Repository-side quality utilities. Server-side source/executor proof remains authoritative.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  crypto = require('node:crypto');
function git(root, ...args) {
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
  for (const key of Object.keys(env))
    if (
      key.startsWith('GIT_CONFIG_') &&
      ![
        'GIT_CONFIG_NOSYSTEM',
        'GIT_CONFIG_GLOBAL',
        'GIT_CONFIG_SYSTEM',
      ].includes(key)
    )
      delete env[key];
  return cp
    .execFileSync(
      'git',
      ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args],
      { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    .trim();
}
function readSource(directory) {
  const root = fs.realpathSync(directory),
    file = path.join(root, '.resolveup/checkout-receipt.json');
  if (fs.existsSync(file)) {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 4096)
      throw Error('Invalid source receipt');
    const r = JSON.parse(fs.readFileSync(file));
    if (
      r.provider !== 'GITHUB' ||
      !/^[a-f0-9]{40}$/.test(r.commitSha || '') ||
      !/^[a-f0-9]{64}$/.test(r.archiveSha256 || '') ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(r.runId || '') ||
      !/^[1-9][0-9]{0,63}$/.test(String(r.executorRunId || ''))
    )
      throw Error('Invalid source receipt');
    return { mode: 'GITHUB_ARCHIVE', ...r, attested: false };
  }
  if (fs.realpathSync(git(root, 'rev-parse', '--show-toplevel')) !== root)
    throw Error('Source root mismatch');
  const sha = git(root, 'rev-parse', 'HEAD');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Source revision unavailable');
  return {
    mode: 'GIT',
    commitSha: sha,
    dirty: Boolean(git(root, 'status', '--porcelain')),
    attested: false,
  };
}
function prepareIndex(directory) {
  const root = fs.realpathSync(directory),
    source = readSource(root);
  if (source.mode !== 'GITHUB_ARCHIVE') return source;
  if (fs.existsSync(path.join(root, '.git')))
    throw Error('Archive already contains Git metadata');
  git(root, 'init', '--quiet');
  git(
    root,
    'add',
    '--force',
    '--all',
    '--',
    '.',
    ':!.resolveup',
    ':!resolveup-artifact',
  );
  fs.writeFileSync(
    path.join(root, '.resolveup/index-baseline.json'),
    JSON.stringify({
      kind: 'WORKSPACE_INDEX',
      history: false,
      sourceCommitSha: source.commitSha,
    }) + '\n',
  );
  return source;
}
function writeReport(directory, result) {
  const root = fs.realpathSync(directory),
    source = readSource(root);
  if (
    !['success', 'failure'].includes(result.status) ||
    !Number.isInteger(result.exitCode) ||
    result.exitCode < 0 ||
    (result.status === 'success' && result.exitCode !== 0)
  )
    throw Error('Invalid quality outcome');
  const dir = path.join(root, 'resolveup-artifact');
  fs.mkdirSync(dir, { recursive: true });
  const report = {
    kind: 'ResolveUpCloudQuality',
    status: result.status,
    exitCode: result.exitCode,
    commitSha: source.commitSha,
    source,
    stages: result.stages || [],
    finishedAt: new Date().toISOString(),
    deployAuthorized: false,
  };
  fs.writeFileSync(
    path.join(dir, 'result.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  const hash = (file) =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const lock = [
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
  ].find((n) => fs.existsSync(path.join(root, n)));
  if (!lock || fs.lstatSync(path.join(root, lock)).isSymbolicLink())
    throw Error('A supported dependency lockfile is required');
  fs.writeFileSync(
    path.join(dir, 'lockfile.sha256'),
    hash(path.join(root, lock)) + '  ' + lock + '\n',
  );
  const files = [];
  let total = 0;
  function walk(base) {
    for (const entry of fs.readdirSync(base)) {
      const full = path.join(base, entry),
        st = fs.lstatSync(full);
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile()))
        throw Error('Artifact links are not allowed');
      if (st.isDirectory()) walk(full);
      else if (full !== path.join(dir, 'checksums.sha256')) {
        total += st.size;
        if (files.length >= 10000 || total > 104857600)
          throw Error('Artifact exceeds limits');
        files.push(path.relative(dir, full));
      }
    }
  }
  walk(dir);
  files.sort();
  fs.writeFileSync(
    path.join(dir, 'checksums.sha256'),
    files
      .map((n) => hash(path.join(dir, n)) + '  ' + n.split(path.sep).join('/'))
      .join('\n') + '\n',
  );
  return report;
}
module.exports = { readSource, prepareIndex, writeReport };
if (require.main === module) {
  try {
    const [mode, directory, ...args] = process.argv.slice(2);
    if (mode === 'index') prepareIndex(directory);
    else if (mode === 'report')
      writeReport(directory, JSON.parse(fs.readFileSync(args[0], 'utf8')));
    else throw Error('Use index or report');
  } catch {
    console.error('Cloud quality source or outcome could not be verified.');
    process.exitCode = 1;
  }
}
