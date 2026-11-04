"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { 
  signOut, 
  updateProfile, 
  updatePassword, 
  updateEmail, 
  sendEmailVerification,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { motion } from "@/components/motion-client";
import { 
  User, Shield, Settings, LogOut, Trash2, Mail, Lock, 
  Camera, CheckCircle2, AlertCircle, Loader2, Save,
  Bell, Moon, Sun, Globe, Key
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = usePrivy();
  const user = auth.currentUser;

  // Estados del perfil
  const [displayName, setDisplayName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Estados de seguridad
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Preferencias (solo visuales)
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState("dark");

  // Estados de cuenta
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setPhotoURL(user.photoURL || "");
      setNewEmail(user.email || "");
    }
  }, [user]);

  // --- LÓGICA DE PERFIL ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsUpdatingProfile(true);
    setProfileMsg(null);

    try {
      await updateProfile(user, { displayName, photoURL });
      setProfileMsg({ type: "success", text: "Perfil actualizado correctamente." });
    } catch (error: any) {
      setProfileMsg({ type: "error", text: error.message || "Error al actualizar el perfil." });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // --- LÓGICA DE CONTRASEÑA ---
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setIsUpdatingPassword(true);
    setPasswordMsg(null);

    try {
      // Reautenticación requerida por seguridad
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      await updatePassword(user, newPassword);
      setPasswordMsg({ type: "success", text: "Contraseña actualizada correctamente." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: any) {
      setPasswordMsg({ type: "error", text: error.message || "Error al cambiar la contraseña. Verifica tu contraseña actual." });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // --- LÓGICA DE EMAIL ---
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setIsUpdatingEmail(true);
    setEmailMsg(null);

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      
      await updateEmail(user, newEmail);
      setEmailMsg({ type: "success", text: "Correo electrónico actualizado. Por favor, verifica tu nuevo correo." });
      await sendEmailVerification(user);
    } catch (error: any) {
      setEmailMsg({ type: "error", text: error.message || "Error al actualizar el correo. Verifica tu contraseña." });
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  // --- LÓGICA DE VERIFICACIÓN DE EMAIL ---
  const handleSendVerification = async () => {
    if (!user) return;
    try {
      await sendEmailVerification(user);
      alert("Correo de verificación enviado. Revisa tu bandeja de entrada.");
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  // --- LÓGICA DE CIERRE DE SESIÓN ---
  const handleLogout = async () => {
    try {
      await signOut(auth); // Cierra Firebase
      logout(); // Cierra Privy
      router.push("/login"); // Redirige al login
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  // --- LÓGICA DE ELIMINAR CUENTA ---
  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = window.confirm("¿Estás seguro de que quieres eliminar tu cuenta? Esta acción es irreversible.");
    if (!confirmed) return;

    const password = prompt("Introduce tu contraseña para confirmar la eliminación:");
    if (!password || !user.email) return;

    setIsDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
      logout();
      router.push("/");
    } catch (error: any) {
      alert(`Error al eliminar la cuenta: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!user) return <div className="p-10 text-white">Cargando ajustes...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        
        {/* Cabecera */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Settings className="text-indigo-400" size={32} /> Ajustes de la Cuenta
          </h1>
          <p className="text-slate-400">Gestiona tu perfil, seguridad y preferencias.</p>
        </motion.div>

        <div className="space-y-6">
          
          {/* SECCIÓN 1: PERFIL */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl glass p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl"><User size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-white">Perfil Público</h2>
                <p className="text-sm text-slate-400">Así te verán otros usuarios en Waevo.</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="relative">
                  <img 
                    src={photoURL || `https://ui-avatars.com/api/?name=${displayName || "User"}&background=6366f1&color=fff&size=128`} 
                    alt="Avatar" 
                    className="h-24 w-24 rounded-full object-cover border-2 border-slate-700"
                  />
                  <div className="absolute bottom-0 right-0 bg-indigo-500 p-2 rounded-full text-white cursor-pointer hover:bg-indigo-600 transition">
                    <Camera size={16} />
                  </div>
                </div>
                <div className="flex-1 space-y-4 w-full">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nombre a mostrar</label>
                    <input 
                      type="text" 
                      value={displayName} 
                      onChange={(e) => setDisplayName(e.target.value)} 
                      placeholder="Tu nombre"
                      className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">URL de la foto de perfil</label>
                    <input 
                      type="url" 
                      value={photoURL} 
                      onChange={(e) => setPhotoURL(e.target.value)} 
                      placeholder="https://ejemplo.com/mi-foto.jpg"
                      className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {profileMsg && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${profileMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {profileMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {profileMsg.text}
                </div>
              )}

              <button 
                type="submit" 
                disabled={isUpdatingProfile}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-xl text-white font-semibold transition disabled:opacity-50"
              >
                {isUpdatingProfile ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Guardar Cambios
              </button>
            </form>
          </motion.div>

          {/* SECCIÓN 2: SEGURIDAD */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl glass p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl"><Shield size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-white">Seguridad</h2>
                <p className="text-sm text-slate-400">Protege tu cuenta y tus fondos.</p>
              </div>
            </div>

            {/* Verificación de Email */}
            <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  <Mail size={16} /> Correo Electrónico
                </p>
                <p className="text-xs text-slate-400 mt-1">{user.email}</p>
              </div>
              {user.emailVerified ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full">
                  <CheckCircle2 size={14} /> Verificado
                </span>
              ) : (
                <button onClick={handleSendVerification} className="text-xs bg-amber-500/20 text-amber-400 font-semibold px-3 py-1 rounded-full hover:bg-amber-500/30 transition">
                  Verificar ahora
                </button>
              )}
            </div>

            {/* Cambiar Contraseña */}
            <form onSubmit={handleUpdatePassword} className="space-y-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Lock size={16} /> Cambiar Contraseña</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="password" 
                  placeholder="Contraseña actual" 
                  value={currentPassword} 
                  onChange={(e) => setCurrentPassword(e.target.value)} 
                  required 
                  className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                />
                <input 
                  type="password" 
                  placeholder="Nueva contraseña (mín. 6 caracteres)" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  required 
                  minLength={6}
                  className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
              {passwordMsg && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${passwordMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {passwordMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {passwordMsg.text}
                </div>
              )}
              <button type="submit" disabled={isUpdatingPassword} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-xl text-white font-semibold transition disabled:opacity-50">
                {isUpdatingPassword ? <Loader2 className="animate-spin" size={18} /> : <Key size={18} />}
                Actualizar Contraseña
              </button>
            </form>

            {/* Cambiar Email (Opcional, pero útil) */}
            <form onSubmit={handleUpdateEmail} className="space-y-4 pt-6 border-t border-slate-800">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2"><Mail size={16} /> Cambiar Correo Electrónico</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  type="password" 
                  placeholder="Contraseña actual" 
                  value={currentPassword} 
                  onChange={(e) => setCurrentPassword(e.target.value)} 
                  required 
                  className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                />
                <input 
                  type="email" 
                  placeholder="Nuevo correo electrónico" 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)} 
                  required 
                  className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
              {emailMsg && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${emailMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {emailMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {emailMsg.text}
                </div>
              )}
              <button type="submit" disabled={isUpdatingEmail} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-xl text-white font-semibold transition disabled:opacity-50">
                {isUpdatingEmail ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Actualizar Correo
              </button>
            </form>
          </motion.div>

          {/* SECCIÓN 3: PREFERENCIAS */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-3xl glass p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl"><Settings size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-white">Preferencias</h2>
                <p className="text-sm text-slate-400">Personaliza tu experiencia en Waevo.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="flex items-center gap-3">
                  <Bell className="text-slate-400" size={20} />
                  <div>
                    <p className="text-sm font-medium text-white">Notificaciones</p>
                    <p className="text-xs text-slate-400">Recibir alertas de depósitos y exchanges.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setNotifications(!notifications)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${notifications ? "bg-indigo-500" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notifications ? "translate-x-7" : "translate-x-1"}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="flex items-center gap-3">
                  {theme === "dark" ? <Moon className="text-slate-400" size={20} /> : <Sun className="text-slate-400" size={20} />}
                  <div>
                    <p className="text-sm font-medium text-white">Tema de la aplicación</p>
                    <p className="text-xs text-slate-400">Elige entre modo claro y oscuro.</p>
                  </div>
                </div>
                <select 
                  value={theme} 
                  onChange={(e) => setTheme(e.target.value)}
                  className="bg-slate-800 text-white text-sm rounded-lg p-2 border border-slate-700 outline-none"
                >
                  <option value="dark">Oscuro</option>
                  <option value="light">Claro</option>
                  <option value="system">Sistema</option>
                </select>
              </div>
            </div>
          </motion.div>

          {/* SECCIÓN 4: CUENTA Y ZONA DE PELIGRO */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 md:p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-red-500/20 text-red-400 rounded-xl"><AlertCircle size={24} /></div>
              <div>
                <h2 className="text-xl font-bold text-white">Cuenta</h2>
                <p className="text-sm text-slate-400">Cerrar sesión o eliminar tu cuenta permanentemente.</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-xl text-white font-semibold transition"
              >
                <LogOut size={18} /> Cerrar Sesión
              </button>
              
              <button 
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-6 py-3 rounded-xl text-red-400 font-semibold transition disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                Eliminar Cuenta
              </button>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  );
}
