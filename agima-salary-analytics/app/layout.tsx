import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGIMA Salary Analytics",
  description: "Аналитика зарплат кандидатов",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
