import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import './globals.css';
export const metadata:Metadata={title:'Hotel · Administración',description:'Gestión compartida de reservas, restaurante, caja y stock.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{env.APP_ENV==='test'&&<aside className="environment-banner" aria-label="Entorno de pruebas"><strong>PRUEBAS</strong><span>No cargar datos reales del hotel.</span></aside>}{children}</body></html>}
