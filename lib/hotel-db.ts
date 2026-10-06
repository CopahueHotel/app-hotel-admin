import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('La base de datos no está disponible.');return env.DB;}
