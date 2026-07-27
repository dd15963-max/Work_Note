import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Note",
  description: "일정, 영업, 정산, 출력과 기타 업무를 한 곳에서 관리하는 업무 메모장",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/work-note-icon.svg",
    shortcut: "/icons/work-note-icon.svg",
    apple: "/icons/work-note-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#2563d9" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Work Note" />
        <link rel="stylesheet" href="/file-manager-modal.css?v=sites" />
        <link rel="stylesheet" href="/sales-invoice-fields.css?v=sites" />
      </head>
      <body>
        {children}
        <script defer src="/calendar-label-fix.js?v=sites" />
        <script defer src="/file-manager-modal.js?v=sites" />
        <script defer src="/input-key-fix.js?v=sites" />
        <script defer src="/sales-invoice-fields.js?v=sites" />
      </body>
    </html>
  );
}
