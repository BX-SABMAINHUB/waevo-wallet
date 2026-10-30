export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="aurora-bg relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
