import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chicago Happy Hour Finder",
  description:
    "Find Chicago happy hours near you by just chatting. Tell it what you're in the mood for — cheap drafts, a rooftop, oysters in the West Loop — and it finds the spot.",
};

export const viewport: Viewport = {
  themeColor: "#c97c5d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
