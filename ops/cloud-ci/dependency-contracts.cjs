// Offline behavior checks for the SDKs changed by the security update.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createServer } = require('node:http');
const { generateKeyPairSync } = require('node:crypto');
const dependencies = require('../../package.json').dependencies;
(async () => {
  const platform = createRequire(require.resolve('@nestjs/platform-express/package.json'));
  const express = platform('express');
  const multer = platform('multer');
  const app = express();
  app.post('/upload', multer({ limits: { fileSize: 32 } }).single('file'), (request, response) => response.json({ content: request.file.buffer.toString() }));
  app.use((error, request, response, next) => response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ code: error.code }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/upload`;
    for (const [content, expected] of [['fixture', 200], ['x'.repeat(64), 413]]) {
      const body = new FormData(); body.set('file', new Blob([content], { type: 'text/plain' }), 'fixture.txt');
      const response = await fetch(url, { method: 'POST', body });
      assert.equal(response.status, expected);
      const data = await response.json();
      if (expected === 200) assert.equal(data.content, content);
      else assert.equal(data.code, 'LIMIT_FILE_SIZE');
    }
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  if (dependencies['@nestjs/axios']) {
    const axios = require('axios');
    const { HttpService } = require('@nestjs/axios');
    const { firstValueFrom } = require('rxjs');
    const service = new HttpService(axios.create({ adapter: async (config) => ({ status: 200, statusText: 'OK', headers: {}, config, data: { fixture: true } }) }));
    assert.deepEqual((await firstValueFrom(service.get('https://fixture.invalid/'))).data, { fixture: true });
  }
  if (dependencies.sharp) {
    const sharp = require('sharp');
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const stats = await sharp(png).stats();
    assert.equal(stats.channels[0].mean, 255); assert.equal(stats.channels[1].mean, 0);
  }
  if (dependencies.nodemailer) {
    const mailer = require('nodemailer');
    const transport = mailer.createTransport({ streamTransport: true, buffer: true });
    const mail = await transport.sendMail({ from: 'fixture@example.test', to: 'recipient@example.test', subject: 'Offline fixture', text: 'No external delivery' });
    assert.match(mail.message.toString(), /Subject: Offline fixture/);
    assert.match(mail.message.toString(), /No external delivery/);
    transport.close();
  }
  if (dependencies['firebase-admin']) {
    const admin = require('firebase-admin');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    const credential = admin.credential.cert({ projectId: 'ci-fixture', clientEmail: 'fixture@ci-fixture.iam.gserviceaccount.com', privateKey });
    const firebase = admin.initializeApp({ projectId: 'ci-fixture', credential }, 'offline-ci');
    assert.equal(typeof admin.messaging(firebase).sendEach, 'function');
    await firebase.delete();
  }
  console.log('Dependency behavior verified: bounded multipart parsing and installed HTTP/image/mail/push SDKs; no external message sent.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
