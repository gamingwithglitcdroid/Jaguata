/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { UserProfile, UserRole, Notification as AppNotification, UserSession } from "./types";
import { Toaster, toast } from "sonner";
import { Bell, Home, Dog, History, User as UserIcon, DollarSign, X, Shield, Key, Smartphone, Monitor } from "lucide-react";
import { requestForToken, onMessageListener, playNotificationSound } from "./firebase";
import { motion, AnimatePresence } from "motion/react";

// Pages
import Login from "./pages/Login";
import OwnerDashboard from "./pages/OwnerDashboard";
import WalkerDashboard from "./pages/WalkerDashboard";
import Profile from "./pages/Profile";
import Pets from "./pages/Pets";
import WalkHistory from "./pages/WalkHistory";
import ActiveWalk from "./pages/ActiveWalk";
import AdminUsers from "./pages/AdminUsers";
import Terms from "./pages/Terms";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial theme application
  useEffect(() => {
    const savedTheme = localStorage.getItem('jaguata_theme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Record session info & update last login (Only once per user identification)
    const setupSession = async () => {
      // Use user-specific session key to prevent conflicts on shared devices
      const sessionKey = `jaguata_session_id_${user.uid}`;
      let sessionId = localStorage.getItem(sessionKey);
      
      const ua = navigator.userAgent;
      const getBrowser = () => {
        if (ua.includes("Firefox")) return "Firefox";
        if (ua.includes("Chrome")) return "Chrome";
        if (ua.includes("Safari")) return "Safari";
        return "Navegador";
      };
      const getOS = () => {
        if (ua.includes("Win")) return "Windows";
        if (ua.includes("Mac")) return "macOS";
        if (ua.includes("Android")) return "Android";
        if (ua.includes("like Mac")) return "iOS";
        return "OS";
      };

      const sessionData: Omit<UserSession, "id"> = {
        userId: user.uid,
        device: /Mobile|Android|iPhone/i.test(ua) ? "Móvil" : "Escritorio",
        browser: getBrowser(),
        os: getOS(),
        lastSeen: new Date().toISOString(),
      };

      try {
        if (sessionId) {
          // Check if session still exists in DB
          const sessionSnap = await getDoc(doc(db, "sessions", sessionId));
          if (!sessionSnap.exists() || sessionSnap.data().userId !== user.uid) {
            sessionId = null;
          }
        }

        if (!sessionId) {
          const sessionRef = doc(collection(db, "sessions"));
          sessionId = sessionRef.id;
        }

        localStorage.setItem(sessionKey, sessionId);
        
        // 1. Update session (always allowed if authenticated)
        await setDoc(doc(db, "sessions", sessionId), sessionData, { merge: true });
        
        // 2. Update user's last login (only if user doc exists)
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          await updateDoc(userDocRef, { lastLogin: new Date().toISOString() });
        }
      } catch (err) {
        console.error("Session setup error:", err);
      }
    };

    setupSession();

    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const profileData = docSnap.data() as UserProfile;
        
        // Ensure isAdmin is set for the main admin
        if (user.email?.toLowerCase() === "gamingwithglitch@gmail.com" && (!profileData.isAdmin || profileData.role !== UserRole.ADMIN)) {
          try {
            await updateDoc(docRef, { isAdmin: true, role: UserRole.ADMIN });
          } catch (e) {
            console.warn("Admin upgrade failed (might be permissions):", e);
          }
        }
        
        setProfile(profileData);
        
        // Apply theme
        if (profileData.theme === 'dark') {
          document.documentElement.classList.add('dark');
          document.body.classList.add('dark');
          localStorage.setItem('jaguata_theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.body.classList.remove('dark');
          localStorage.setItem('jaguata_theme', 'light');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
      // Silently handle permission errors during sign-out or initial document creation
      console.warn("Profile snapshot error:", error);
      if (error.code === 'permission-denied' && !docRef.id) {
         // Ignore if we lost auth
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <Router>
      <AppInner user={user} profile={profile} />
    </Router>
  );
}

function AppInner({ user, profile }: { user: User | null; profile: UserProfile | null }) {
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  useEffect(() => {
    const autoRegisterToken = async () => {
      if (!user || !profile || !("Notification" in window)) return;

      // Only attempt to update if permission is already granted and we don't have a token or it might be stale
      if (Notification.permission === 'granted') {
        try {
          const token = await requestForToken(false);
          // Only update if the token is actually different to prevent unnecessary Firestore writes
          if (token && token !== profile.fcmToken) {
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { 
              fcmToken: token,
              lastTokenUpdate: new Date().toISOString()
            });
            console.log("FCM Token synchronized silently");
          }
        } catch (err) {
          console.warn("FCM synchronization skipped:", err);
        }
      }
    };

    autoRegisterToken();
    
    // Set banner state once on load
    if (user && "Notification" in window && Notification.permission === 'default') {
      setShowPermissionPrompt(true);
    }
  }, [user?.uid]); // Break loop by only relying on user.uid

  useEffect(() => {
    // Session tracking logic...
  }, [user]);

  const handleEnableNotifications = async () => {
    try {
      const token = await requestForToken(true);
      if (token && user) {
        await updateDoc(doc(db, "users", user.uid), { 
          fcmToken: token,
          lastTokenUpdate: new Date().toISOString()
        });
        toast.success("Notificaciones activadas");
        setShowPermissionPrompt(false);
      }
    } catch (err) {
      console.error("Manual token activation failed:", err);
      toast.error("No se pudieron activar las notificaciones");
    }
  };

  useEffect(() => {
    if (!profile?.isAdmin) return;

    const pendingQuery = query(
      collection(db, "users"), 
      where("role", "==", UserRole.WALKER)
    );

    const unsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      const pendingDocs = snapshot.docs.filter(d => d.data().isApproved === false);
      setPendingCount(pendingDocs.length);
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const walker = change.doc.data() as UserProfile;
          if (walker.isApproved === false) {
            toast.info("Nueva solicitud de paseador", {
              description: `${walker.displayName} espera aprobación.`,
              action: {
                label: "Ver",
                onClick: () => navigate("/admin/users?tab=PENDING")
              },
              duration: 10000,
            });
          }
        }
      });
    }, (error) => {
      console.error("Pending walkers snapshot error:", error);
    });

    return () => unsubscribe();
  }, [profile?.isAdmin, navigate]);

  useEffect(() => {
    const unsubscribe = onMessageListener((payload: any) => {
      toast.info(payload.notification.title, {
        description: payload.notification.body,
        icon: <Bell className="text-orange-500" size={20} />,
        duration: 8000,
        className: "border-2 border-orange-500 bg-white dark:bg-gray-800 scale-105 shadow-2xl",
      });
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const startTime = Date.now();
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const id = change.doc.id;
          const notification = change.doc.data() as AppNotification;
          
          // Only show if it's a fresh notification
          const notificationTime = notification.createdAt ? new Date(notification.createdAt).getTime() : 0;
          
          if (notificationTime > startTime - 3000) {
            playNotificationSound();
            toast.info("Jaguata 🐾", {
              description: notification.body || notification.title,
              icon: <Bell className="text-orange-500" size={20} />,
              duration: 8000,
              className: "border-2 border-orange-500 bg-white dark:bg-gray-800 scale-105 shadow-2xl",
            });
          }
          // Mark as read immediately to avoid showing it again on next load
          updateDoc(doc(db, "notifications", id), { read: true }).catch(console.error);
        }
      });
    }, (error) => {
      console.error("Notifications snapshot error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!user || !profile) return <Navigate to="/login" />;
    return <>{children}</>;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Toaster 
        position="top-center" 
        richColors 
        expand={true} 
        closeButton
        toastOptions={{
          style: {
            fontSize: '14px',
            fontWeight: '600',
            borderRadius: '16px',
          }
        }}
      />

      <AnimatePresence>
        {showPermissionPrompt && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                <Bell size={32} className="animate-bounce" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-gray-900">Activar Notificaciones</h3>
              <p className="mb-6 text-sm text-gray-600 font-medium">
                Para recibir alertas instantáneas de paseos aunque tu pantalla esté bloqueada, activa las notificaciones.
              </p>
              
              {/iPhone|iPad|iPod/.test(navigator.userAgent) && (
                <div className="mb-6 rounded-xl bg-orange-50 p-3 text-xs text-orange-800 text-left">
                  <p className="font-bold mb-1">Nota para iOS:</p>
                  <p>Debes añadir la app a tu pantalla de inicio (Compartir <span className="inline-block border border-orange-300 rounded px-1 text-[10px]">↑</span> {'>'} Añadir a pantalla de inicio) para recibir alertas.</p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowPermissionPrompt(false)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Más tarde
                </button>
                <button 
                  onClick={handleEnableNotifications}
                  className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-md transition-transform active:scale-95"
                >
                  Permitir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Routes>
        <Route path="/login" element={!user || !profile ? <Login /> : <Navigate to="/" />} />
        
        <Route path="/" element={
          user ? (
            profile ? (
              profile.role === UserRole.WALKER ? <WalkerDashboard /> : <OwnerDashboard />
            ) : (
              <Navigate to="/login" />
            )
          ) : (
            <Navigate to="/login" />
          )
        } />

        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/:uid" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/pets" element={<ProtectedRoute><Pets /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><WalkHistory /></ProtectedRoute>} />
        <Route path="/walk/:id" element={<ProtectedRoute><ActiveWalk /></ProtectedRoute>} />
        <Route path="/admin/users" element={user && profile?.isAdmin ? <AdminUsers /> : <Navigate to="/" />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>

      <AnimatePresence>
        {/* Permission prompt removed as per user request */}
      </AnimatePresence>

      {user && (
        <nav className="fixed bottom-0 left-0 right-0 flex h-16 items-center justify-around border-t bg-white px-4 shadow-lg z-50">
          <NavItem to="/" icon="Home" label="Inicio" />
          {(profile?.role === UserRole.OWNER || profile?.isAdmin) && (
            <NavItem to="/pets" icon="Dog" label="Mascotas" />
          )}
          <NavItem to="/history" icon="History" label="Historial" />
          <NavItem to="/profile" icon="User" label="Perfil" badgeCount={profile?.isAdmin ? pendingCount : 0} />
        </nav>
      )}
    </div>
  );
}

function NavItem({ to, icon, label, badgeCount }: { to: string; icon: string; label: string; badgeCount?: number }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  const Icons = { Home, Dog, History, DollarSign, User: UserIcon };
  const SelectedIcon = (Icons as any)[icon] || Home;

  return (
    <Link to={to} className={`flex flex-col items-center gap-1 relative ${isActive ? "text-orange-500" : "text-gray-500"}`}>
      <SelectedIcon size={24} />
      <span className="text-xs font-medium">{label}</span>
      {label === "Perfil" && badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
          {badgeCount}
        </span>
      )}
    </Link>
  );
}
