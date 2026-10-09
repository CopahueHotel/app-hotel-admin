import { connect } from 'cloudflare:sockets';
import type { RecoveryMail } from '@/modules/access/recovery';

export type SMTPSettings = { host: string; user: string; password: string; from: string };
export const mailAddress = (value: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(value);
const base64 = (value: string) => btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join(''));

// Authenticated submission over implicit TLS (465). No plaintext fallback.
export async function sendSMTP(settings: SMTPSettings, mail: RecoveryMail, open = connect) {
  if (!mailAddress(settings.from) || !mailAddress(mail.to) || /[\r\n]/.test(mail.subject) || mail.subject.length > 240 || mail.text.length > 16000) throw Error('SMTP_MESSAGE_INVALID');
  const socket = open({ hostname: settings.host, port: 465 }, { secureTransport: 'on', allowHalfOpen: false });
  void socket.closed.catch(() => {});
  const reader = socket.readable.getReader(), writer = socket.writable.getWriter(), decoder = new TextDecoder();
  let buffer = '', timer: ReturnType<typeof setTimeout> | undefined;
  async function reply() {
    const lines: string[] = []; let code = 0, size = 0;
    while (true) {
      while (!buffer.includes('\r\n')) {
        const part = await reader.read();
        if (part.done) throw Error('SMTP_CLOSED');
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > 65536) throw Error('SMTP_RESPONSE_INVALID');
      }
      const end = buffer.indexOf('\r\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      size += line.length;
      if (!match || size > 65536 || lines.length > 100 || code && code !== Number(match[1])) throw Error('SMTP_RESPONSE_INVALID');
      code = Number(match[1]); lines.push(match[3]);
      if (match[2] === ' ') return { code, lines };
    }
  }
  const write = (value: string) => writer.write(new TextEncoder().encode(value + '\r\n'));
  async function command(value: string, expected: number) {
    await write(value); const response = await reply();
    if (response.code !== expected) throw Error('SMTP_REJECTED');
    return response;
  }
  const task = (async () => {
    await socket.opened;
    if ((await reply()).code !== 220) throw Error('SMTP_GREETING_REJECTED');
    const hello = await command('EHLO ' + settings.from.split('@')[1], 250);
    const methods = hello.lines.filter(line => /^AUTH(?:[ =])/i.test(line)).join(' ').toUpperCase();
    if (/\bPLAIN\b/.test(methods)) {
      const auth = base64('\0' + settings.user + '\0' + settings.password);
      await write('AUTH PLAIN ' + auth); const response = await reply();
      if (response.code === 334) await command(auth, 235);
      else if (response.code !== 235) throw Error('SMTP_AUTH_REJECTED');
    } else if (/\bLOGIN\b/.test(methods)) {
      await command('AUTH LOGIN', 334); await command(base64(settings.user), 334); await command(base64(settings.password), 235);
    } else throw Error('SMTP_AUTH_UNSUPPORTED');
    await command('MAIL FROM:<' + settings.from + '>', 250);
    await write('RCPT TO:<' + mail.to + '>'); const recipient = await reply();
    if (![250, 251].includes(recipient.code)) throw Error('SMTP_RECIPIENT_REJECTED');
    await command('DATA', 354);
    const words: string[] = []; let word = '';
    for (const character of mail.subject) {
      if (new TextEncoder().encode(word + character).length > 42) { words.push(word); word = ''; }
      word += character;
    }
    if (word) words.push(word);
    const subject = words.map(part => `=?UTF-8?B?${base64(part)}?=`).join('\r\n ');
    const body = (base64(mail.text).match(/.{1,76}/g) ?? []).join('\r\n');
    const message = [`From: ${settings.from}`, `To: ${mail.to}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${settings.from.split('@')[1]}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, '.'].join('\r\n');
    await command(message, 250);
    // The server has accepted the message; a failed QUIT must not revoke it.
    void write('QUIT').catch(() => {});
  })();
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('SMTP_TIMEOUT')), 15000); });
  try { await Promise.race([task, deadline]); }
  finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    void socket.close().catch(() => {});
  }
}
