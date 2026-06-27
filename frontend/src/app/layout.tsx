import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { CrisisProvider } from "@/context/CrisisContext";

export const metadata: Metadata = {
  title: "GeoPulse AI - Verifiable Crisis Intelligence",
  description: "Security, Resilience & Defense Command Center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">
        <CrisisProvider>{children}</CrisisProvider>
      </body>
    </html>
  );
}
