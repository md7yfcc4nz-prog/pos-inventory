import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "Kasuwa POS",
  description: "Multi-store point of sale and inventory management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} antialiased`}
        style={
          {
            ["--font-display" as string]: "var(--font-fraunces), Georgia, serif",
            ["--font-body" as string]: "var(--font-source), Segoe UI, sans-serif",
          } as React.CSSProperties
        }
      >
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
