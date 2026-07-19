import './globals.css';

export const metadata = {
  title: 'CRMegoric ERP · CRM — Medieval Realms',
  description: 'Hệ thống ERP và CRM đầy đủ với lớp trải nghiệm medieval, Realm, Quest, Gold và Tavern.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
