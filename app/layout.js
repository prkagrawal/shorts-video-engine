import './globals.css';

export const metadata = {
  title: 'Shorts Video Engine',
  description: 'Generate YouTube / Instagram Shorts quiz videos in your browser',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
