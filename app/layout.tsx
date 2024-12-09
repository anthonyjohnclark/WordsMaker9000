import TitleBar from "./components/TitleBar";
import "./globals.css";

export const metadata = {
  title: "WordsMaker9000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Add Google Font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>

      <body>
        <div className="grid grid-rows-[auto,1fr] h-screen">
          {/* Title Bar */}
          <TitleBar />

          {/* Main Content */}
          <main className="overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
