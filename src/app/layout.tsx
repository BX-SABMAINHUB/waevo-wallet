import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waevo Wallet — Tu billetera cripto del futuro",
  description:
    "Explora, envía y recibe criptomonedas con la billetera más rápida y segura. No custodiada, con 2FA obligatorio.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
