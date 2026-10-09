import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers/hotel-fixture.mjs';

function connection({ login = false, fail = '', fragmented = false } = {}) {
  const commands = []; let input, authStep = 0, closed = false;
  const encoder = new TextEncoder();
  const emit = text => { const data = encoder.encode(text); if (fragmented) for (const byte of data) input.enqueue(new Uint8Array([byte])); else input.enqueue(data); };
  const readable = new ReadableStream({ start(controller) { input = controller; emit('220 test SMTP\r\n'); }, cancel() { closed = true; } });
  const writable = new WritableStream({ write(bytes) {
    const value = new TextDecoder().decode(bytes).replace(/\r\n$/, ''); commands.push(value);
    if (value.startsWith('EHLO')) emit(`250-test\r\n250 AUTH ${login ? 'LOGIN' : 'PLAIN'}\r\n`);
    else if (value.startsWith('AUTH PLAIN')) emit(fail === 'auth' ? '535 rejected\r\n' : '235 accepted\r\n');
    else if (value === 'AUTH LOGIN') { authStep = 1; emit('334 user\r\n'); }
    else if (authStep === 1) { authStep = 2; emit('334 password\r\n'); }
    else if (authStep === 2) { authStep = 0; emit('235 accepted\r\n'); }
    else if (value.startsWith('RCPT')) emit(fail === 'recipient' ? '550 rejected\r\n' : '250 accepted\r\n');
    else if (value.startsWith('MAIL')) emit('250 accepted\r\n');
    else if (value === 'DATA') emit('354 send\r\n');
    else if (value.startsWith('From:')) emit('250 queued\r\n');
  } });
  return { commands, open(address, options) { assert.equal(address.port, 465); assert.equal(options.secureTransport, 'on'); return { readable, writable, opened: Promise.resolve({}), closed: Promise.resolve(), close: async () => { closed = true; } }; }, isClosed: () => closed };
}
const settings = { host: 'mail.example.test', user: 'system@example.test', password: 'test-only-SMTP-password', from: 'system@example.test' };
const message = { to: 'registered@example.test', subject: 'Hotel · Recuperación', text: 'Enlace privado\nhttps://admin.example.test/recuperar#123\n.\nObservación' };

test('SMTP uses implicit TLS, parses fragmented multiline replies, authenticates and encodes the message safely', async t => {
  const f = await fixture(t), smtp = f.load('modules/access/recovery-smtp.ts'), server = connection({ fragmented: true });
  await smtp.sendSMTP(settings, message, server.open);
  assert.ok(server.commands.some(command => command.startsWith('AUTH PLAIN ')));
  assert.ok(server.commands.includes('RCPT TO:<registered@example.test>'));
  const body = server.commands.find(command => command.startsWith('From:'));
  assert.match(body, /Content-Transfer-Encoding: base64/);
  const encoded = body.split('\r\n\r\n')[1].replace(/\r\n\.$/, '').replaceAll('\r\n', '');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), message.text);
  assert.ok(!body.includes(settings.password)); assert.equal(server.isClosed(), true);
});

test('SMTP supports LOGIN and stops after rejected authentication or recipient', async t => {
  const f = await fixture(t), smtp = f.load('modules/access/recovery-smtp.ts');
  await smtp.sendSMTP(settings, message, connection({ login: true }).open);
  for (const fail of ['auth', 'recipient']) {
    const server = connection({ fail });
    await assert.rejects(smtp.sendSMTP(settings, message, server.open), /SMTP_/);
    assert.ok(!server.commands.includes('DATA')); assert.equal(server.isClosed(), true);
  }
});

test('SMTP refuses injected headers and unsafe configurations; test mail requires an explicit recipient list', async t => {
  const f = await fixture(t), smtp = f.load('modules/access/recovery-smtp.ts'), mail = f.load('modules/access/recovery-mail.ts');
  await assert.rejects(smtp.sendSMTP(settings, { ...message, to: 'victim@example.test\r\nRCPT TO:other@example.test' }), /INVALID/);
  await assert.rejects(smtp.sendSMTP(settings, { ...message, subject: 'subject\r\nBcc: other@example.test' }), /INVALID/);
  assert.equal(mail.recoverySender({ MAIL_PROVIDER: 'smtp' }), null);
  const config = { MAIL_PROVIDER: 'smtp', SMTP_HOST: settings.host, SMTP_PORT: '465', SMTP_USER: settings.user, SMTP_PASSWORD: settings.password, MAIL_FROM: settings.from };
  assert.throws(() => mail.recoverySender({ ...config, SMTP_PORT: '25' }));
  assert.equal(mail.recoverySender({ ...config, APP_ENV: 'test' }), null);
  const send = mail.recoverySender({ ...config, APP_ENV: 'test', MAIL_TEST_RECIPIENTS: 'authorized@example.test' });
  await assert.rejects(send(message), /MAIL_TEST_RECIPIENT_BLOCKED/);
});
