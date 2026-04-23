import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "imgview",
  description: "Local image library viewer with AI search",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-gray-950 text-gray-100 font-sans antialiased">
        <div className="grain-overlay" aria-hidden="true" />
        <div className="scanline-bar" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
