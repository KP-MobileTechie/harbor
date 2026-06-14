import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harbor — drop a .har, see what's slow",
  description:
    "Analyze a browser network capture: waterfall, weight, third parties, privacy leaks, and a scored audit. 100% in your browser. Nothing uploaded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
