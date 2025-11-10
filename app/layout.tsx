import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gunahon Ka Devta ? Cinematic Reel',
  description: 'Cinematic, emotional, slow-paced storytelling inspired by Dharamvir Bharti\'s classic.',
  metadataBase: new URL('https://agentic-dd53b045.vercel.app')
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
