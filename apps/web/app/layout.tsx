import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIESEC LC CRM",
  description: "Internal CRM and operations platform for AIESEC Local Committees"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
