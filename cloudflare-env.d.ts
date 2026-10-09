declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PASSWORD_HASH?: string;
    AUTH_ORIGIN?: string;
    APP_ENV?: string;
    MAIL_API_URL?: string;
    MAIL_API_KEY?: string;
    MAIL_FROM?: string;
  }
}
