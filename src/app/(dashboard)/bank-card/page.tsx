// src/app/(dashboard)/bank-card/page.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { CreditCard, Lock, Eye, EyeOff, Palette, Sticker, Smartphone, AlertCircle, Loader2 } from "lucide-react";

const COLORS = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6"];
const EMOJIS = ["💳", "🚀", "💎", "🔥", "🌟", "🦾", "🧠", "🎯"];

export default function BankCardPage() {
  const [open, setOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [cardExists, setCardExists] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJIS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardData, setCardData] = useState<any>(null);
  const [ephemeralKey, setEphemeralKey] = useState<string | null>(null);
  const uid = auth.currentUser?.uid || "";

  // 1. Cargar estado desde Firestore
  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        setHasAccess(data.bankCardAccess === true);
        setCardExists(!!data.stripeCardId);
        setPasswordSet(!!data.cardPasswordHash);
        setSelectedColor(data.cardColor || COLORS[0]);
        setSelectedEmoji(data.cardEmoji || EMOJIS[0]);
        setCardData(data.stripeCardData || null);
      }
    };
    load();
  }, [uid]);

  // 2. Solicitar acceso (crea un doc en "cardRequests")
  const requestAccess = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      await setDoc(doc(db, "cardRequests", uid), {
        uid,
        accountName: auth.currentUser?.displayName || "Usuario Waevo",
        email: auth.currentUser?.email,
        requestedAt: serverTimestamp(),
        approved: false,
      });
      setError("Solicitud enviada. Espera la aprobación del administrador.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Crear tarjeta virtual (llama al backend de Stripe)
  const createCard = async () => {
    if (!uid || !hasAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCardData(data.card);
      setCardExists(true);
      await setDoc(doc(db, "users", uid), {
        stripeCardId: data.card.id,
        stripeCardData: data.card,
        cardColor: selectedColor,
        cardEmoji: selectedEmoji,
      }, { merge: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 4. Guardar contraseña (hash simple en Firestore; en producción usa bcrypt en backend)
  const savePassword = async () => {
    if (!uid || newPassword.length < 4) return;
    const hash = btoa(newPassword); // ⚠️ En producción usa bcrypt en una API route
    await setDoc(doc(db, "users", uid), { cardPasswordHash: hash }, { merge: true });
    setPasswordSet(true);
    setShowPasswordModal(false);
    setNewPassword("");
  };

  // 5. Verificar contraseña para desbloquear
  const verifyPassword = () => {
    if (!uid) return;
    const stored = cardData?.cardPasswordHash || "";
    if (btoa(inputPassword) === stored) {
      setUnlocked(true);
      setInputPassword("");
    } else {
      setError("Contraseña incorrecta");
    }
  };

  // 6. Obtener ephemeral key para mostrar datos de forma segura
  const revealDetails = async () => {
    if (!cardExists) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/ephemeral-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, cardId: cardData.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEphemeralKey(data.ephemeralKeySecret);
      setShowDetails(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 7. Añadir a cartera (detecta plataforma y muestra instrucciones)
  const addToWallet = () => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);
    if (isIOS) {
      alert("En iOS: abre la app Wallet, toca '+' y sigue los pasos. Si no aparece, usa el botón 'Añadir a Apple Pay' desde la web de Stripe (requiere push provisioning).");
    } else if (isAndroid) {
      alert("En Android: abre Google Wallet, toca 'Añadir tarjeta' y sigue los pasos. Para push provisioning automático se requiere configuración adicional con Stripe.");
    } else {
      alert("Añadir a cartera solo está disponible en dispositivos móviles compatibles.");
    }
  };

  if (!unlocked && cardExists) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/80 p-8 text-center">
          <Lock className="mx-auto mb-4 text-indigo-400" size={40} />
          <h2 className="text-xl font-bold text-white mb-2">Tarjeta bloqueada</h2>
          <p className="text-slate-400 text-sm mb-4">Introduce tu contraseña para acceder.</p>
          <input
            type="password"
            value={inputPassword}
            onChange={(e) => setInputPassword(e.target.value)}
            className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-white mb-3"
            placeholder="Contraseña"
          />
          <button onClick={verifyPassword} className="w-full rounded-xl bg-indigo-500 p-3 font-bold text-white">Desbloquear</button>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => setOpen(true)}
          className="mb-8 flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-6 py-4 text-white"
        >
          <CreditCard className="text-indigo-400" /> Tarjeta de Banco
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            >
              <div className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl relative overflow-hidden">
                <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-slate-400">✕</button>

                {!hasAccess ? (
                  <div className="text-center py-8">
                    <AlertCircle className="mx-auto mb-4 text-amber-400" size={40} />
                    <h2 className="text-xl font-bold text-white mb-2">Acceso restringido</h2>
                    <p className="text-slate-400 text-sm mb-4">Solicita acceso al administrador para crear tu tarjeta virtual.</p>
                    <button onClick={requestAccess} disabled={loading} className="rounded-xl bg-indigo-500 px-6 py-3 font-bold text-white">
                      {loading ? <Loader2 className="animate-spin" /> : "Solicitar acceso"}
                    </button>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                  </div>
                ) : !cardExists ? (
                  <div className="text-center py-8">
                    <CreditCard className="mx-auto mb-4 text-indigo-400" size={40} />
                    <h2 className="text-xl font-bold text-white mb-2">Aún no tienes tarjeta</h2>
                    <button onClick={createCard} disabled={loading} className="rounded-xl bg-indigo-500 px-6 py-3 font-bold text-white">
                      {loading ? <Loader2 className="animate-spin" /> : "Crear Tarjeta Virtual"}
                    </button>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Tarjeta virtual */}
                    <div
                      className="relative rounded-2xl p-6 text-white shadow-xl overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${selectedColor}, #0f172a)` }}
                    >
                      <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Waevo Corporation VC</p>
                      <p className="text-2xl mb-4">{selectedEmoji} •••• {cardData?.last4 || "••••"}</p>
                      <p className="text-sm text-white/80">{auth.currentUser?.displayName}</p>
                      <p className="text-xs text-white/60">Vence: {cardData?.expMonth}/{cardData?.expYear}</p>
                      {showDetails && ephemeralKey && (
                        <div className="mt-4 text-xs space-y-1 bg-black/30 p-3 rounded-lg">
                          <p>Número: {cardData?.number || "Sensible"}</p>
                          <p>CVV: {cardData?.cvc || "•••"}</p>
                        </div>
                      )}
                    </div>

                    {/* Personalización */}
                    <div className="flex gap-2 flex-wrap">
                      {COLORS.map((c) => (
                        <button key={c} onClick={() => setSelectedColor(c)} className="w-8 h-8 rounded-full border-2" style={{ background: c, borderColor: selectedColor === c ? "#fff" : "transparent" }} />
                      ))}
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => setSelectedEmoji(e)} className={`text-xl ${selectedEmoji === e ? "opacity-100" : "opacity-50"}`}>{e}</button>
                      ))}
                    </div>

                    {/* Botones */}
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={revealDetails} className="rounded-xl bg-slate-800 p-3 text-sm text-white flex items-center justify-center gap-2">
                        {showDetails ? <EyeOff size={16} /> : <Eye size={16} />} {showDetails ? "Ocultar" : "Revelar datos"}
                      </button>
                      <button onClick={addToWallet} className="rounded-xl bg-slate-800 p-3 text-sm text-white flex items-center justify-center gap-2">
                        <Smartphone size={16} /> Añadir a cartera
                      </button>
                    </div>

                    {!passwordSet ? (
                      <button onClick={() => setShowPasswordModal(true)} className="w-full rounded-xl bg-slate-800 p-3 text-sm text-white flex items-center justify-center gap-2">
                        <Lock size={16} /> Configurar contraseña
                      </button>
                    ) : (
                      <p className="text-xs text-slate-500 text-center">🔒 Contraseña configurada</p>
                    )}

                    {showPasswordModal && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6">
                          <h3 className="text-white font-bold mb-3">Nueva contraseña</h3>
                          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-white mb-3" />
                          <button onClick={savePassword} className="w-full rounded-xl bg-indigo-500 p-3 font-bold text-white">Guardar</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
