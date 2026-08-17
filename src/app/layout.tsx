import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Registro de Capacitaciones | Creadero',
  description: 'Registro y administración de capacitaciones realizadas a clientes.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
