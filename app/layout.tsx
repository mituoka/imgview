import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "imgview",
  description: "Local image viewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-gray-950 text-gray-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
