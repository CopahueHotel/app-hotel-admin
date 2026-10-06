import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Hotel · Administración',description:'Gestión compartida de reservas, restaurante, caja y stock. Versión de prueba.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
