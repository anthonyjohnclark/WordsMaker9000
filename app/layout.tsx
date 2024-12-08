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
        <div className="flex h-screen">
          {/* Main Content */}
          <main className="flex-1 overflow-y-none">{children}</main>
        </div>
      </body>
    </html>
  );
}
