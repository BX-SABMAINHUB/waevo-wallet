import { PrivyWrapper } from "@/lib/privy";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivyWrapper>{children}</PrivyWrapper>;
}
