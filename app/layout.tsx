import TitleBar from "./components/TitleBar";
import "./globals.css";

export const metadata = {
  title: "Gilgamesh",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
