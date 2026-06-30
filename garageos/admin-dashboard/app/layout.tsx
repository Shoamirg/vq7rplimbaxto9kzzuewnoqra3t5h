import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CommandPaletteContent } from "@/components/layout/command-palette-content";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GarageOS — The operating system for modern garages",
  description: "Manage your garage, vehicles, customers, and appointments from one dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto bg-muted/30">
                {children}
              </main>
            </div>
          </div>

          {/* Global Command Palette */}
          <CommandPaletteContent />
        </ThemeProvider>
      </body>
    </html>
  );
}
