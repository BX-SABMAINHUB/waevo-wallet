"use client";
import { useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { motion } from "@/components/motion-client";

export default function RegisterForm() {
  const [step, setStep] = useState<"form" | "verify" | "totp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
    setStep("verify");
  };

  // ... lógica para comprobar verificación y pasar a <TotpEnrollment />
}
