"use client";
import { useState, useEffect } from "react";
import { multiFactor, TotpMultiFactorGenerator, TotpSecret } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { QRCodeSVG } from "qrcode.react";
import { motion } from "@/components/motion-client";

export default function TotpEnrollment({ onComplete }: { onComplete: () => void }) {
  const [qrUrl, setQrUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [secret, setSecret] = useState<TotpSecret | null>(null);

  useEffect(() => {
    const startEnrollment = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const mfaUser = multiFactor(user);
      const session = await mfaUser.getSession();
      const totpSecret = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(totpSecret);
      // Genera la URL otpauth:// para el QR
      setQrUrl(totpSecret.generateQrCodeUrl(user.email!, "Waevo Wallet"));
    };
    startEnrollment();
  }, []);

  const handleVerify = async () => {
    if (!secret || !auth.currentUser) return;
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode);
    await multiFactor(auth.currentUser).enroll(assertion, "App de contraseñas");
    onComplete(); // Redirige al dashboard
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
      <h2>Configura tu 2FA</h2>
      <p>Escanea este código con tu app de contraseñas (Google Authenticator, Authy, etc.)</p>
      {qrUrl && <QRCodeSVG value={qrUrl} size={200} />}
      <input
        type="text"
        placeholder="Código de 6 dígitos"
        value={verificationCode}
        onChange={(e) => setVerificationCode(e.target.value)}
        maxLength={6}
      />
      <button onClick={handleVerify}>Verificar y crear cuenta</button>
    </motion.div>
  );
}
