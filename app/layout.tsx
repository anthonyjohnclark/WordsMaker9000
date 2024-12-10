// app/layout.tsx
import TitleBar from "./components/TitleBar";
import RootProvider from "./contexts/global/RootProvider";

import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RootProvider>
          {" "}
          {/* Keeps app-wide contexts like ModalProvider */}
          <div className="grid grid-rows-[auto,1fr] h-screen">
            <TitleBar /> {/* Always present */}
            <main className="overflow-auto">{children}</main>
          </div>
        </RootProvider>
      </body>
    </html>
  );
}
