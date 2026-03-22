import './globals.css';

export const metadata = {
  title: 'Shorts Video Engine 🎬',
  description:
    'Generate MCQ quiz Short videos — runs entirely in your browser, no server needed',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
