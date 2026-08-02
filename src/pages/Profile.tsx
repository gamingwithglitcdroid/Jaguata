import { useState, useEffect } from "react";
import React from "react";
import { doc, onSnapshot, updateDoc, deleteDoc, collection, query, where, orderBy, limit, getDoc, setDoc } from "firebase/firestore";
import { auth, db, requestForToken } from "../firebase";
import { UserProfile, UserRole, Transaction, Notification as AppNotification, Walk, WalkStatus } from "../types";
import { User, Mail, MapPin, Star, LogOut, Trash2, ShieldCheck, BarChart3, Bell, Users, ArrowLeft, X, History, DollarSign, Calendar, Shield, Key, Smartphone, Monitor, Camera, Image as ImageIcon, Settings, Moon, Sun, BellOff, FileText, CheckCircle } from "lucide-react";
import { signOut, sendPasswordResetEmail } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import { useParams, useNavigate } from "react-router-dom";
import { sendNotification } from "../services/notificationService";
import { toast } from "sonner";
import { UserSession } from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCurrency } from "../lib/utils";

export default function Profile() {
  const navigate = useNavigate();
  const { uid } = useParams<{ uid: string }>();
  const user = auth.currentUser;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [petCount, setPetCount] = useState(0);
  const [ownerCount, setOwnerCount] = useState(0);
  const [walkerCount, setWalkerCount] = useState(0);
  const [pendingWalkerCount, setPendingWalkerCount] = useState(0);
  const [walkCount, setWalkCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [reviews, setReviews] = useState<Walk[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'INFO' | 'SECURITY' | 'SETTINGS' | 'REVIEWS'>('INFO');
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    bio: "",
    address: ""
  });
  const [sensitiveData, setSensitiveData] = useState<any>(null);

  // Use a state for targetUid to better track changes
  const [targetUid, setTargetUid] = useState<string | null>(uid || auth.currentUser?.uid || null);

  useEffect(() => {
    setTargetUid(uid || auth.currentUser?.uid || null);
  }, [uid, auth.currentUser]);

  const isOwnProfile = targetUid === auth.currentUser?.uid;
  const isViewerAdmin = auth.currentUser?.email?.toLowerCase() === "gamingwithglitch@gmail.com";
  const isAutoVerified = profile?.email?.toLowerCase() === "c.rodrigoxifra@gmail.com";
  const userIsVerified = profile?.ciVerificationStatus === 'verified' || isAutoVerified;
  const isAdmin = profile?.email?.toLowerCase() === "gamingwithglitch@gmail.com";

  useEffect(() => {
    if (!targetUid) {
      // If we don't have a UID yet (e.g. auth loading), don't set loading to false yet
      // unless we are sure no one is logged in. But App.tsx handles redirect.
      return;
    }

    const profileRef = doc(db, "users", targetUid);
    const unsubscribe = onSnapshot(profileRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setProfile(data);
        if (targetUid === auth.currentUser?.uid) {
          setFormData({
            displayName: data.displayName || "",
            bio: data.bio || "",
            address: data.address || ""
          });
        }
      } else {
        console.warn("Profile document not found for:", targetUid);
      }
      setLoading(false);
    }, (error) => {
      console.error("Profile snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [targetUid]);

  useEffect(() => {
    const fetchSensitiveData = async () => {
      if (targetUid && (isOwnProfile || isViewerAdmin)) {
        try {
          const sensitiveRef = doc(db, "users", targetUid, "private_data", "identity");
          const sensitiveSnap = await getDoc(sensitiveRef);
          if (sensitiveSnap.exists()) {
            setSensitiveData(sensitiveSnap.data());
          }
        } catch (err) {
          console.error("Error fetching sensitive profile data:", err);
        }
      }
    };
    fetchSensitiveData();
  }, [targetUid, isOwnProfile, isViewerAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    
    const petsQuery = query(collection(db, "pets"));
    const unsubscribe = onSnapshot(petsQuery, (snapshot) => {
      setPetCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [profile?.email]);

  useEffect(() => {
    if (!isAdmin) return;

    const walksQuery = query(collection(db, "walks"));
    const unsubscribe = onSnapshot(walksQuery, (snapshot) => {
      const revenue = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        return data.status === "completed" ? acc + (data.cost || 0) : acc;
      }, 0);
      setTotalRevenue(revenue);
    });

    return () => unsubscribe();
  }, [profile?.email]);

  useEffect(() => {
    if (!isAdmin) return;
    
    const ownersQuery = query(collection(db, "users"), where("role", "==", UserRole.OWNER));
    const unsubscribeOwners = onSnapshot(ownersQuery, (snapshot) => {
      setOwnerCount(snapshot.size);
    });

    const walkersQuery = query(collection(db, "users"), where("role", "==", UserRole.WALKER));
    const unsubscribeWalkers = onSnapshot(walkersQuery, (snapshot) => {
      setWalkerCount(snapshot.size);
    });

    const pendingQuery = query(collection(db, "users"), where("role", "==", UserRole.WALKER), where("isApproved", "==", false));
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      setPendingWalkerCount(snapshot.size);
      if (snapshot.size > 0 && isAdmin) {
        toast.info(`Tienes ${snapshot.size} solicitudes de paseadores pendientes`, {
          action: {
            label: "Ver",
            onClick: () => navigate("/admin/users?tab=PENDING")
          }
        });
      }
    });

    const walksQuery = query(collection(db, "walks"));
    const unsubscribeWalks = onSnapshot(walksQuery, (snapshot) => {
      setWalkCount(snapshot.size);
    });

    return () => {
      unsubscribeOwners();
      unsubscribeWalkers();
      unsubscribePending();
      unsubscribeWalks();
    };
  }, [profile?.email, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("status", "==", "completed"),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
    });

    return () => unsubscribe();
  }, [profile?.email, isAdmin]);

  useEffect(() => {
    if (!user || !isOwnProfile) return;

    const sessionsQuery = query(
      collection(db, "sessions"),
      where("userId", "==", user.uid),
      orderBy("lastSeen", "desc"),
      limit(5)
    );

    const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
      const sessionKey = `jaguata_session_id_${user.uid}`;
      const currentSessionId = localStorage.getItem(sessionKey);
      const sessionList = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        isCurrent: doc.id === currentSessionId
      } as UserSession));
      setSessions(sessionList);
    });

    return () => unsubscribe();
  }, [user, isOwnProfile]);

  const toggleTheme = async () => {
    if (!auth.currentUser || isUpdatingTheme) return;
    setIsUpdatingTheme(true);
    try {
      const newTheme = profile?.theme === 'dark' ? 'light' : 'dark';
      const profileRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(profileRef, { theme: newTheme });
      localStorage.setItem('jaguata_theme', newTheme);
      toast.success(`Modo ${newTheme === 'dark' ? 'oscuro' : 'claro'} activado`);
    } catch (err) {
      console.error(err);
      toast.error("Error al cambiar el tema");
    } finally {
      setIsUpdatingTheme(false);
    }
  };

  const handleUpdate = async () => {
    if (!auth.currentUser) return;
    const profileRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(profileRef, formData);
    setIsEditing(false);
    toast.success("Perfil actualizado correctamente");
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setShowPhotoOptions(false);
    if (file && auth.currentUser) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("La imagen es demasiado grande. Máximo 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const profileRef = doc(db, "users", auth.currentUser!.uid);
          await updateDoc(profileRef, { photoURL: base64 });
          toast.success("Foto de perfil actualizada");
        } catch (err) {
          console.error(err);
          toast.error("Error al actualizar la foto");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = async () => {
    if (auth.currentUser) {
      try {
        // Clear FCM token on logout
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, { fcmToken: null });
        localStorage.removeItem(`jaguata_session_id_${auth.currentUser.uid}`);
      } catch (err) {
        console.warn("Could not clear FCM token on logout:", err);
      }
    }
    await signOut(auth);
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success("Correo de restablecimiento enviado a " + user.email);
    } catch (err) {
      console.error(err);
      toast.error("Error al enviar el correo de restablecimiento");
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await deleteDoc(doc(db, "sessions", sessionId));
      toast.success("Sesión cerrada correctamente");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo cerrar la sesión");
    }
  };

  const handleDeleteOwnAccount = async () => {
    if (!auth.currentUser) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: auth.currentUser.uid })
      });

      if (!response.ok) throw new Error("Error al eliminar cuenta en Auth");

      // Delete from Firestore
      await deleteDoc(doc(db, "walkers", auth.currentUser.uid)).catch(() => {});
      await deleteDoc(doc(db, "owners", auth.currentUser.uid)).catch(() => {});
      await deleteDoc(doc(db, "users", auth.currentUser.uid)).catch(() => {});

      await signOut(auth);
      toast.success("Tu cuenta ha sido eliminada permanentemente");
      navigate("/login");
    } catch (err) {
      console.error("Error deleting own account:", err);
      toast.error("No se pudo eliminar la cuenta. Contacta a soporte.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    if (!targetUid || profile?.role !== UserRole.WALKER) return;

    const reviewsQuery = query(
      collection(db, "walks"),
      where("walkerId", "==", targetUid),
      where("status", "==", WalkStatus.COMPLETED),
      where("rating", ">", 0),
      orderBy("rating", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(reviewsQuery, (snapshot) => {
      const walkReviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      setReviews(walkReviews);
    });

    return () => unsubscribe();
  }, [targetUid, profile?.role]);

  // Helper to compress and resize image
  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleKYCUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ciFront' | 'ciBack' | 'selfie') => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    if (file.size > 7 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande. Máximo 7MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const fieldMap = {
        ciFront: 'ciFrontPhoto',
        ciBack: 'ciBackPhoto'
      };

      setLoading(true);
      try {
        const compressed = await compressImage(base64);
        const sensitiveRef = doc(db, "users", auth.currentUser!.uid, "private_data", "identity");
        await setDoc(sensitiveRef, { 
          [fieldMap[type]]: compressed,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        // Update verification status in main profile
        const profileRef = doc(db, "users", auth.currentUser!.uid);
        await updateDoc(profileRef, { 
          ciVerificationStatus: 'pending'
        });
        
        toast.success("Documento cargado correctamente");
        // Update local sensitive data state
        setSensitiveData(prev => ({ ...prev, [fieldMap[type]]: compressed }));
      } catch (err) {
        console.error(err);
        toast.error("Error al cargar el documento");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const registerNotifications = async () => {
    try {
      const token = await requestForToken(true);
      if (token && auth.currentUser) {
        const profileRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(profileRef, { fcmToken: token });
        toast.success("Notificaciones activadas correctamente.");
      }
    } catch (err) {
      console.error(err);
      toast.error("No se pudieron activar las notificaciones");
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="bg-white border-b overflow-hidden">
        <img 
          src="/jaguata_banner.jpg" 
          alt="Jaguata" 
          className="w-full h-24 object-cover sm:h-32"
          referrerPolicy="no-referrer"
        />
      </div>
      <header className="bg-white p-6 shadow-sm flex items-center gap-4">
        {!isOwnProfile && (
          <button onClick={() => navigate(-1)} className="text-gray-500">
            <X size={24} />
          </button>
        )}
        <h1 className="text-2xl font-bold text-gray-900">
          {isOwnProfile ? "Mi Perfil" : "Perfil del Usuario"}
        </h1>
      </header>

      <main className="flex-1 p-4">
        <div className="rounded-2xl bg-white p-6 shadow-md">
          <div className="mb-6 flex flex-col items-center">
            <div className="relative mb-4 group">
              <input 
                type="file" 
                id="profile-photo-upload"
                accept="image/*"
                onChange={handleProfilePhotoChange}
                className="hidden"
                disabled={!isOwnProfile}
              />
              <input 
                type="file" 
                id="profile-photo-camera"
                accept="image/*"
                capture="user"
                onChange={handleProfilePhotoChange}
                className="hidden"
                disabled={!isOwnProfile}
              />
              <div 
                onClick={() => isOwnProfile && setShowPhotoOptions(!showPhotoOptions)}
                className={`block relative h-24 w-24 rounded-full overflow-hidden ring-4 ${isAdmin ? 'ring-yellow-400 ring-offset-2 ring-offset-white shadow-[0_0_25px_rgba(234,179,8,0.5)]' : 'ring-orange-50'} bg-orange-100 transition-all duration-500 cursor-pointer`}
              >
                {profile?.photoURL ? (
                  <img src={profile.photoURL} alt={profile.displayName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-orange-500">
                    <User size={48} />
                  </div>
                )}
                {isOwnProfile && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={24} className="text-white" />
                  </div>
                )}
              </div>

              <AnimatePresence>
                {showPhotoOptions && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 z-20 mt-2 w-48 rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-black/5"
                  >
                    <label 
                      htmlFor="profile-photo-upload"
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <ImageIcon size={18} />
                      </div>
                      Subir Foto
                    </label>
                    <label 
                      htmlFor="profile-photo-camera"
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-sm font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Camera size={18} />
                      </div>
                      Tomar Foto
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {profile?.role === UserRole.WALKER && (
                <div className={`absolute bottom-0 right-0 rounded-full ${isAdmin ? 'bg-yellow-500' : 'bg-orange-500'} p-1 text-white ring-2 ring-white`}>
                  <Star size={16} fill="currentColor" />
                </div>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {profile?.displayName}
              {userIsVerified && (
                <CheckCircle size={18} className="text-blue-500 fill-blue-50" title="Perfil Verificado (KYC)" />
              )}
              {isAdmin && (
                <motion.span 
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase shadow-sm"
                >
                  <ShieldCheck size={12} />
                  Admin
                </motion.span>
              )}
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-orange-500 uppercase">{profile?.role === UserRole.WALKER ? "Paseador" : "Dueño de Mascota"}</p>
              {profile?.role === UserRole.WALKER && (
                <div className="flex items-center gap-1 rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black text-yellow-900">
                  <Star size={10} className="fill-yellow-900" />
                  {profile.rating?.toFixed(1) || "5.0"}
                </div>
              )}
            </div>
          </div>

          {isOwnProfile && !isEditing && (
            <div className="mb-6 flex rounded-xl bg-gray-50 p-1">
              <button 
                onClick={() => setActiveTab('INFO')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${activeTab === 'INFO' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}
              >
                Información
              </button>
              <button 
                onClick={() => setActiveTab('SECURITY')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${activeTab === 'SECURITY' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}
              >
                Seguridad
              </button>
              <button 
                onClick={() => setActiveTab('SETTINGS')}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${activeTab === 'SETTINGS' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}
              >
                Ajustes
              </button>
              {profile?.role === UserRole.WALKER && (
                <button 
                  onClick={() => setActiveTab('REVIEWS')}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all ${activeTab === 'REVIEWS' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"}`}
                >
                  Reseñas
                </button>
              )}
            </div>
          )}

          <div className="space-y-6">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-400 uppercase">Nombre</label>
                  <input 
                    type="text" 
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-400 uppercase">Bio</label>
                  <textarea 
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-orange-500"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-400 uppercase">Dirección</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-xl border-gray-100 bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex gap-4 pt-2">
                  <button onClick={() => setIsEditing(false)} className="flex-1 rounded-xl bg-gray-100 py-3 font-bold text-gray-500">Cancelar</button>
                  <button onClick={handleUpdate} className="flex-1 rounded-xl bg-orange-500 py-3 font-bold text-white shadow-md">Guardar</button>
                </div>
              </div>
            ) : activeTab === 'SECURITY' ? (
              <div className="space-y-8 min-h-[400px]">
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Shield size={18} className="text-orange-500" />
                    Seguridad de la Cuenta
                  </h3>
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-gray-900">Contraseña</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Se recomienda cambiarla periódicamente.
                        </p>
                      </div>
                      <button 
                        onClick={handleChangePassword}
                        className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-bold text-orange-600 shadow-sm ring-1 ring-orange-200 active:scale-95 transition-all"
                      >
                        <Key size={14} />
                        Cambiar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Smartphone size={18} className="text-gray-400" />
                    Sesiones Activas
                  </h3>
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <div key={session.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${session.isCurrent ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                            {session.device === 'Móvil' ? <Smartphone size={18} /> : <Monitor size={18} />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-gray-900">{session.os} ({session.browser})</p>
                              {session.isCurrent && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[8px] font-black text-orange-600 uppercase">
                                  Este dispositivo
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-400">
                              Última actividad: {format(new Date(session.lastSeen), "d MMM, HH:mm", { locale: es })}
                            </p>
                          </div>
                        </div>
                        {!session.isCurrent && (
                          <button 
                            onClick={() => handleRevokeSession(session.id)}
                            className="text-xs font-bold text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Cerrar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                 <div className="rounded-xl bg-blue-50 p-4 border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Privacidad</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    Tu información de inicio de sesión se utiliza para proteger tu cuenta y notificarte sobre actividades sospechosas.
                  </p>
                </div>

                <div className="pt-6 border-t border-gray-100">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-red-600 mb-4">
                    <Trash2 size={18} />
                    Zona de Peligro
                  </h3>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    Al eliminar tu cuenta, se borrarán permanentemente todos tus datos, incluyendo fotos, mascotas registradas y tu historial de paseos. Esta acción no se puede deshacer.
                  </p>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded-xl bg-red-100 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-200 active:scale-95 border-2 border-red-200 border-dashed"
                  >
                    Eliminar mi cuenta permanentemente
                  </button>
                </div>
              </div>
            ) : activeTab === 'SETTINGS' ? (
              <div className="space-y-6 min-h-[400px]">
                <div className="space-y-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Settings size={18} className="text-orange-500" />
                    Preferencias de la Aplicación
                  </h3>
                  
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${(profile?.fcmToken && typeof window !== 'undefined' && Notification.permission === 'granted') ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                          {(profile?.fcmToken && typeof window !== 'undefined' && Notification.permission === 'granted') ? <Bell size={20} /> : <BellOff size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Push Notifications</p>
                          <p className="text-xs text-gray-500">
                            {typeof window !== 'undefined' && Notification.permission === 'denied' ? (
                              <span className="text-red-500 font-medium">
                                Bloqueado {window.self !== window.top ? '(Abre en pestaña nueva ↗️)' : ''}
                              </span>
                            ) : profile?.fcmToken ? (
                              'Activadas ✅'
                            ) : (
                              'Haga clic para activar'
                            )}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={registerNotifications}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${profile?.fcmToken ? 'bg-white border border-gray-200 text-gray-400' : 'bg-orange-500 text-white shadow-md shadow-orange-100'}`}
                      >
                        {profile?.fcmToken ? 'Actualizar' : 'Activar'}
                      </button>
                    </div>
                  </div>

                  {profile?.fcmToken && (
                    <div className="mt-4">
                      <button 
                        onClick={async () => {
                          try {
                            await sendNotification({
                              userId: profile.uid,
                              title: "¡Prueba de Jaguata!",
                              body: "Si ves esto, las notificaciones están funcionando correctamente. 🐾",
                              type: 'walker_approved'
                            });
                            toast.info("Enviando notificación de prueba...");
                          } catch (err) {
                            toast.error("Error al enviar prueba");
                          }
                        }}
                        className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                      >
                        <Smartphone size={18} />
                        Enviar Notificación de Prueba
                      </button>
                    </div>
                  )}

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${profile?.theme === 'dark' ? 'bg-indigo-100 text-indigo-600' : 'bg-yellow-100 text-yellow-600'}`}>
                          {profile?.theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">Modo Oscuro</p>
                          <p className="text-xs text-gray-500">
                            Cambia la apariencia de la aplicación.
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={toggleTheme}
                        disabled={isUpdatingTheme}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${profile?.theme === 'dark' ? 'bg-orange-500' : 'bg-gray-200'}`}
                      >
                        <span className="sr-only">Toggle Dark Mode</span>
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${profile?.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-orange-50 p-4 border border-orange-100">
                  <p className="text-[10px] font-bold text-orange-600 uppercase mb-1">Personalización</p>
                  <p className="text-xs text-orange-700 leading-relaxed">
                    Personaliza tu experiencia en Jaguata para que se adapte mejor a tus necesidades.
                  </p>
                </div>
              </div>
            ) : activeTab === 'INFO' ? (
              <div className="space-y-6">
                <div className="flex items-center gap-4 text-gray-600">
                  <Mail size={20} className="text-gray-400" />
                  <span className="text-sm">{profile?.email}</span>
                </div>
                <div className="flex items-center gap-4 text-gray-600">
                  <MapPin size={20} className="text-gray-400" />
                  <span className="text-sm">{profile?.address || "Sin dirección"}</span>
                </div>
                {profile?.role === UserRole.WALKER && (isOwnProfile || isViewerAdmin) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">C.I</p>
                      <p className="text-sm font-semibold text-gray-700">{sensitiveData?.ci || profile.ci || "—"}</p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Celular</p>
                      <p className="text-sm font-semibold text-gray-700">{profile.phoneNumber || "—"}</p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Ciudad</p>
                      <p className="text-sm font-semibold text-gray-700">{profile.city || "—"}</p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 p-3">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Barrio</p>
                      <p className="text-sm font-semibold text-gray-700">{profile.neighborhood || "—"}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="mb-1 text-xs font-bold text-gray-400 uppercase">Sobre mí</p>
                  <p className="text-sm text-gray-700">{profile?.bio || "No hay biografía disponible."}</p>
                </div>

                {(isOwnProfile || isViewerAdmin) && profile?.role === UserRole.WALKER && (
                  <div className="space-y-4 rounded-2xl border border-orange-100 bg-orange-50/20 p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-orange-500" size={18} />
                        Validación de Perfil
                      </h3>
                      <span className={`rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${
                        profile.ciVerificationStatus === 'verified' ? 'bg-green-100 text-green-600' :
                        profile.ciVerificationStatus === 'pending' ? 'bg-blue-100 text-blue-600' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {profile.ciVerificationStatus === 'verified' ? 'Verificado' : 
                         profile.ciVerificationStatus === 'pending' ? 'En Revisión' : 'No Verificado'}
                      </span>
                    </div>

                    {(profile.ciVerificationStatus !== 'verified' && isOwnProfile) && (
                      <p className="text-xs text-gray-500 leading-relaxed ring-1 ring-orange-100 p-3 rounded-lg bg-white">
                        Para generar confianza con los dueños, carga fotos legibles de tu C.I.
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">C.I Frontal</p>
                        <div 
                          onClick={() => (sensitiveData?.ciFrontPhoto || profile.ciFrontPhoto) && window.open(sensitiveData?.ciFrontPhoto || profile.ciFrontPhoto)}
                          className={`relative aspect-video rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center border-2 border-dashed border-gray-200 ${(sensitiveData?.ciFrontPhoto || profile.ciFrontPhoto) ? 'cursor-pointer' : ''}`}
                        >
                          {(sensitiveData?.ciFrontPhoto || profile.ciFrontPhoto) ? (
                            <img src={sensitiveData?.ciFrontPhoto || profile.ciFrontPhoto} className="h-full w-full object-cover" />
                          ) : (
                            <Camera size={20} className="text-gray-300" />
                          )}
                          {isOwnProfile && (
                            <input 
                              type="file" 
                              accept="image/*" 
                              onClick={(e) => e.stopPropagation()} 
                              onChange={(e) => handleKYCUpload(e, 'ciFront')} 
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">C.I Dorsal</p>
                        <div 
                          onClick={() => (sensitiveData?.ciBackPhoto || profile.ciBackPhoto) && window.open(sensitiveData?.ciBackPhoto || profile.ciBackPhoto)}
                          className={`relative aspect-video rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center border-2 border-dashed border-gray-200 ${(sensitiveData?.ciBackPhoto || profile.ciBackPhoto) ? 'cursor-pointer' : ''}`}
                        >
                          {(sensitiveData?.ciBackPhoto || profile.ciBackPhoto) ? (
                            <img src={sensitiveData?.ciBackPhoto || profile.ciBackPhoto} className="h-full w-full object-cover" />
                          ) : (
                            <Camera size={20} className="text-gray-300" />
                          )}
                          {isOwnProfile && (
                            <input 
                              type="file" 
                              accept="image/*" 
                              onClick={(e) => e.stopPropagation()} 
                              onChange={(e) => handleKYCUpload(e, 'ciBack')} 
                              className="absolute inset-0 opacity-0 cursor-pointer" 
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {profile?.role === UserRole.WALKER && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-orange-50 p-4 text-center">
                      <p className="text-xl font-bold text-orange-600">{profile?.walkCount || 0}</p>
                      <p className="text-xs font-medium text-orange-400 uppercase">Paseos</p>
                    </div>
                    <div className="rounded-xl bg-orange-50 p-4 text-center">
                      <p className="text-xl font-bold text-orange-600">{profile?.rating || 5.0}</p>
                      <p className="text-xs font-medium text-orange-400 uppercase">Calificación</p>
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="rounded-2xl border-2 border-yellow-200 bg-yellow-50/30 p-5 shadow-sm">
                    <div className="mb-5 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 font-bold text-gray-900">
                        <BarChart3 size={20} className="text-yellow-600" />
                        Admin Dashboard Stats
                      </h3>
                      <div className="flex items-center gap-2">
                        {pendingWalkerCount > 0 && (
                          <span className="flex h-6 w-6 animate-bounce items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg">
                            {pendingWalkerCount}
                          </span>
                        )}
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold text-yellow-700 uppercase">
                          Panel de Control
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-yellow-100">
                        <p className="text-2xl font-black text-gray-900">{petCount}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Mascotas</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-yellow-100">
                        <p className="text-2xl font-black text-gray-900">{walkCount}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Paseos</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-yellow-100">
                        <p className="text-2xl font-black text-gray-900">{ownerCount}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Dueños</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-yellow-100">
                        <p className="text-2xl font-black text-gray-900">{walkerCount}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Paseadores</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-red-100">
                        <p className="text-2xl font-black text-red-500">{pendingWalkerCount}</p>
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Paseadores Pendientes</p>
                      </div>
                      <div className="rounded-xl bg-white p-4 shadow-sm border border-yellow-100">
                        <p className="text-2xl font-black text-yellow-600">{formatCurrency(totalRevenue * 0.3)}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comisión (30%)</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 mt-5">
                      <button 
                        onClick={() => navigate("/admin/users")}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 py-4 text-sm font-bold text-white shadow-lg shadow-yellow-200 active:scale-95 transition-all"
                      >
                        <Users size={18} />
                        Gestionar Usuarios
                      </button>
                      
                      {pendingWalkerCount > 0 && (
                        <button 
                          onClick={() => navigate("/admin/users?tab=PENDING")}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-4 text-sm font-bold text-white shadow-lg shadow-red-200 animate-pulse active:scale-95 transition-all"
                        >
                          <ShieldCheck size={18} />
                          Aprobar Paseadores Pendientes ({pendingWalkerCount})
                        </button>
                      )}

                      <button 
                        onClick={async () => {
                          if (!auth.currentUser) return;
                          await sendNotification({
                            userId: auth.currentUser.uid,
                            title: "Notificación de Prueba",
                            body: "Esta es una notificación de prueba para verificar el sistema.",
                            type: 'walker_request'
                          });
                          toast.success("Notificación de prueba enviada!", {
                            className: "border-2 border-orange-500 bg-white dark:bg-gray-800 scale-105 shadow-2xl",
                            description: "En unos segundos recibirás la notificación real.",
                            duration: 5000
                          });
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-200 py-3 text-xs font-bold text-gray-500 active:scale-95 transition-all"
                      >
                        <Bell size={14} />
                        Probar Notificaciones
                      </button>
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="rounded-2xl border-2 border-gray-100 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 font-bold text-gray-900">
                        <History size={20} className="text-gray-400" />
                        Historial de Transacciones
                      </h3>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        Últimas 10
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      {transactions.length > 0 ? (
                        transactions.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 border border-gray-100">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                                <DollarSign size={18} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-900">{formatCurrency(tx.amount)}</p>
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                  <Calendar size={10} />
                                  {new Date(tx.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-gray-400 uppercase">{tx.method}</p>
                              <p className="text-[10px] font-medium text-green-600 uppercase">Completado</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-sm text-gray-400 italic">No hay transacciones registradas.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isOwnProfile && (
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="w-full rounded-xl border-2 border-orange-500 py-3 font-bold text-orange-500 transition-all active:bg-orange-50"
                  >
                    Editar Perfil
                  </button>
                )}
              </div>
            ) : activeTab === 'REVIEWS' ? (
              <div className="space-y-6 min-h-[400px]">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Star size={18} className="text-yellow-400 fill-yellow-400" />
                    Reseñas de Clientes
                  </h3>
                  <div className="text-right text-[10px] font-bold text-gray-400 uppercase">
                    Promedio: {profile?.rating?.toFixed(1) || "5.0"}
                  </div>
                </div>

                {reviews.length > 0 ? (
                  <div className="space-y-4">
                    {reviews.map((review) => (
                      <div key={review.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star 
                                key={star} 
                                size={12} 
                                className={star <= (review.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"} 
                              />
                            ))}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(review.createdAt), "d MMM, yyyy", { locale: es })}
                          </span>
                        </div>
                        {review.ratingComment && (
                          <p className="text-sm text-gray-600 italic leading-relaxed">
                            "{review.ratingComment}"
                          </p>
                        )}
                        {!review.ratingComment && (
                          <p className="text-xs text-gray-400">Sin comentario escrito.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 rounded-full bg-gray-100 p-4 text-gray-400">
                      <Star size={32} />
                    </div>
                    <p className="text-sm font-bold text-gray-900">Aún no hay reseñas</p>
                    <p className="text-xs text-gray-500">Las calificaciones aparecerán aquí después de completar paseos.</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isOwnProfile && (
          <div className="mt-8 space-y-6">
            <button 
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white p-4 font-bold text-red-500 shadow-sm active:bg-red-50"
            >
              <LogOut size={20} />
              Cerrar Sesión
            </button>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500">
                <Trash2 size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">¿Eliminar tu cuenta?</h2>
              <p className="text-gray-500 mb-6 text-sm">
                Esta acción es irreversible y perderás acceso a tu perfil de Jaguata.
                <br /><br />
                <span className="font-bold text-red-600 italic">¿Estás seguro de que deseas continuar?</span>
              </p>
              <div className="flex flex-col gap-2">
                <button 
                  disabled={isDeleting}
                  onClick={handleDeleteOwnAccount}
                  className="w-full rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? "Eliminando..." : "Sí, eliminar mi cuenta"}
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
