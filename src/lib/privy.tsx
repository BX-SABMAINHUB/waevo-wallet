import { PrivyProvider } from "@privy-io/react-auth";

export function PrivyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        appearance: {
          theme: "dark",
          accentColor: "#6366f1", // Color de Waevo
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
