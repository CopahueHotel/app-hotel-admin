import type { RecoveryMail } from '@/modules/access/recovery';

type MailSettings = { MAIL_API_URL?: string; MAIL_API_KEY?: string; MAIL_FROM?: string };
// HTTP mail adapter. Disabled until an administrator configures a compatible
// provider/gateway. Credentials are bindings, never browser inputs.
export function recoverySender(settings: MailSettings) {
  if (!settings.MAIL_API_URL || !settings.MAIL_API_KEY || !settings.MAIL_FROM) return null;
  const url = new URL(settings.MAIL_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(settings.MAIL_FROM)) throw Error('MAIL_NOT_CONFIGURED');
  return async (mail: RecoveryMail) => {
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(1200),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.MAIL_API_KEY}` },
      body: JSON.stringify({ from: settings.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw Error('MAIL_DELIVERY_FAILED');
  };
}
