const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const { writeReport } = require('./source.cjs');
async function main() {
  const [id, program, ...args] = process.argv.slice(2);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id || '') || !program)
    throw Error('Invalid stage');
  const root = process.cwd(),
    dir = path.join(root, 'resolveup-artifact/logs');
  fs.mkdirSync(dir, { recursive: true });
  const keep = [
    'PATH',
    'HOME',
    'TMPDIR',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
  ];
  const env = Object.fromEntries(
    keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
  );
  Object.assign(env, { CI: 'true', TZ: 'America/Sao_Paulo' });
  const fixture = path.join(root, '.resolveup/fixture-env.json');
  if (fs.existsSync(fixture)) {
    const additions = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    for (const [key, value] of Object.entries(additions)) {
      if (
        !/^[A-Z_][A-Z0-9_]*$/.test(key) ||
        typeof value !== 'string' ||
        /^(?:SOURCE_|TRUSTED_|GITHUB_|FORGEJO_|ACTIONS_)/.test(key)
      )
        throw Error('Invalid fixture environment');
      env[key] = value;
    }
  }
  const log = fs.createWriteStream(path.join(dir, id + '.log'));
  const startedAt = new Date().toISOString();
  const code = await new Promise((resolve) => {
    const child = cp.spawn(program, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      log.write(data);
    });
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      log.write(data);
    });
    child.once('error', () => resolve(1));
    child.once('close', (status) => resolve(status ?? 1));
  });
  await new Promise((resolve) => log.end(resolve));
  const file = path.join(root, '.resolveup/stages.json'),
    stages = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : [];
  stages.push({
    id,
    status: code === 0 ? 'success' : 'failure',
    exitCode: code,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stages));
  const failed = stages.find((s) => s.exitCode !== 0);
  writeReport(root, {
    status: failed ? 'failure' : 'success',
    exitCode: failed?.exitCode || 0,
    stages,
  });
  process.exitCode = code;
}
main().catch(() => {
  console.error('Cloud quality stage could not be recorded.');
  process.exitCode = 1;
});
