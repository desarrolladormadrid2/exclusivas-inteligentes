import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AssistantWidget from "./AssistantWidget";
import AuthGate from "./AuthGate";
import SettingsPanel from "./SettingsPanel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Exclusivas Inteligentes · CRM local",
  description: "CRM local para la gestión de una distribuidora de bebidas.",
  icons: {
    icon: "/favicon.svg?v=2.0.13",
    shortcut: "/favicon.svg?v=2.0.13",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthGate>{children}<AssistantWidget /><SettingsPanel /></AuthGate>
      </body>
    </html>
  );
}
