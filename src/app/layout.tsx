import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Threads 貼文分析 | threads-analytics',
  description: 'Threads 帳號貼文蒐集、清理與互動表現分析 dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
