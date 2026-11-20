import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://nebulax.example"),
  title: {
    default: "NEBULA X — Your digital universe starts here",
    template: "%s — NEBULA X",
  },
  description:
    "Discover digital products, cloud infrastructure and custom software services built for your next big idea.",
  openGraph: {
    title: "NEBULA X — Your digital universe starts here",
    description:
      "A new space for digital products, cloud infrastructure and creative technology.",
    siteName: "NEBULA X",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NEBULA X",
    description: "Your gateway to next-generation digital technology.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await headers();

  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${dmSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
