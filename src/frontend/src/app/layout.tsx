import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "VERITAS — Verifiable Summaries & Cross-Paper Synthesis",
  description: "Evidence-first AI Research Assistant for Verifiable Summaries and Cross-Paper Synthesis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

