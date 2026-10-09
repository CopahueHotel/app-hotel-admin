import type { RecoveryMail } from '@/modules/access/recovery';
import { mailAddress, sendSMTP } from '@/modules/access/recovery-smtp';

type MailSettings = { MAIL_PROVIDER?: string; MAIL_API_URL?: string; MAIL_API_KEY?: string; MAIL_FROM?: string; SMTP_HOST?: string; SMTP_PORT?: string; SMTP_USER?: string; SMTP_PASSWORD?: string; APP_ENV?: string; MAIL_TEST_RECIPIENTS?: string };
// HTTP mail adapter. Disabled until an administrator configures a compatible
// provider/gateway. Credentials are bindings, never browser inputs.
export function recoverySender(settings: MailSettings) {
  const allowed = settings.MAIL_TEST_RECIPIENTS?.split(',').map(email => email.trim().toLowerCase()).filter(Boolean) ?? [];
  if (settings.APP_ENV === 'test' && !allowed.length) return null;
  const deliver = (send: (mail: RecoveryMail) => Promise<void>) => async (mail: RecoveryMail) => {
    if (settings.APP_ENV === 'test' && !allowed.includes(mail.to.toLowerCase())) throw Error('MAIL_TEST_RECIPIENT_BLOCKED');
    await send(mail);
  };
  if (settings.MAIL_PROVIDER === 'smtp') {
    if (!settings.SMTP_HOST || !settings.SMTP_USER || !settings.SMTP_PASSWORD || !settings.MAIL_FROM) return null;
    if (settings.SMTP_PORT !== '465' || !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(settings.SMTP_HOST) || !mailAddress(settings.MAIL_FROM) || !mailAddress(settings.SMTP_USER) || settings.SMTP_PASSWORD.includes('\0') || settings.SMTP_PASSWORD.length > 1024) throw Error('MAIL_NOT_CONFIGURED');
    return deliver(mail => sendSMTP({ host: settings.SMTP_HOST!, user: settings.SMTP_USER!, password: settings.SMTP_PASSWORD!, from: settings.MAIL_FROM! }, mail));
  }
  if (settings.MAIL_PROVIDER && settings.MAIL_PROVIDER !== 'api') throw Error('MAIL_NOT_CONFIGURED');
  if (!settings.MAIL_API_URL || !settings.MAIL_API_KEY || !settings.MAIL_FROM) return null;
  const url = new URL(settings.MAIL_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(settings.MAIL_FROM)) throw Error('MAIL_NOT_CONFIGURED');
  return deliver(async (mail: RecoveryMail) => {
    const response = await fetch(url, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(1200),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.MAIL_API_KEY}` },
      body: JSON.stringify({ from: settings.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw Error('MAIL_DELIVERY_FAILED');
  });
}
