declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AUTH_PASSWORD_HASH?: string;
    AUTH_ORIGIN?: string;
  }
}
