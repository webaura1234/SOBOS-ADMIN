import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/utils";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SITE_NAME} — Restaurant Admin`,
  description: "Sobos restaurant management — menu, inventory, staff, analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" data-density="comfortable" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=localStorage.getItem('density');if(d==='comfortable'||d==='standard'||d==='compact')document.documentElement.dataset.density=d;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
