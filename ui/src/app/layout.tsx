import type { Metadata } from "next";
import { Noto_Sans, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Web3Provider from "@/providers/Web3Provider";
import "./globals.css";
import { UniswapProvider } from "@/providers/UniswapProvider";
import { AppStateProvider } from "@/providers/AppStateProvider";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yoga Position Manager",
  description: "Bend your liquidity with Uniswap v4",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get("cookie");

  return (
    <html lang="en" className="dark">
      <body
        className={`${notoSans.variable} ${geistMono.variable} antialiased`}
      >
        <Web3Provider cookies={cookies}>
          <AppStateProvider>
            <UniswapProvider>{children}</UniswapProvider>
          </AppStateProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
