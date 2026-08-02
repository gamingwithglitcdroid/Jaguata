import { useState, useEffect } from "react";
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db, requestForToken } from "../firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { UserRole } from "../types";
import { Dog, User as UserIcon, Calendar, MapPin, Phone, Shield, ExternalLink, Check, Camera, Upload, Image as ImageIcon, Mail, Lock, Eye, EyeOff, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { sendNotification } from "../services/notificationService";
import { toast } from "sonner";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWalkerForm, setShowWalkerForm] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGSITER_CHOICE' | 'EMAIL_REGISTER_WALKER' | 'EMAIL_LOGIN'>('LOGIN');
  const [showPassword, setShowPassword] = useState(false);
  
  const [walkerData, setWalkerData] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    email: "",
    password: "",
    ci: "",
    city: "",
    phoneNumber: "",
    photoURL: "",
    ciFrontPhoto: "",
    ciBackPhoto: ""
  });
  const [loginData, setLoginData] = useState({
    email: "",
    password: ""
  });
  const [localTermsAccepted, setLocalTermsAccepted] = useState(false);

  // Helper to compress and resize image to keep document size under Firestore 1MB limit
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
        resolve(canvas.toDataURL("image/jpeg", 0.6)); // Compress to 60% quality jpeg
      };
      img.onerror = () => resolve(base64Str); // Fallback to original if error
    });
  };

  // Helper to handle image selection
  const handleImageChange = async (e: any, field: keyof typeof walkerData) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 7 * 1024 * 1024) {
        toast.error("La imagen es muy pesada (máx 7MB)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLoading(true);
        try {
          const compressed = await compressImage(base64);
          setWalkerData(prev => ({ ...prev, [field]: compressed }));
        } catch (err) {
          console.error("Compression error:", err);
          setWalkerData(prev => ({ ...prev, [field]: base64 }));
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Check for redirect result on mount
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const user = result.user;
          // Trigger the same logic as handleLogin but with the already authenticated user
          await processUserLogin(user, (localStorage.getItem("pending_auth_role") as UserRole) || UserRole.OWNER);
        }
      } catch (err: any) {
        console.error("Redirect Auth Result Error:", err);
        setError("Error al procesar el inicio de sesión. Por favor intenta de nuevo.");
      }
    };
    handleRedirectResult();
  }, []);

  const processUserLogin = async (user: User, role: UserRole) => {
    setLoading(true);
    try {
      // Check if user profile exists in registry
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        if (role === UserRole.WALKER) {
          // Show form for walkers
          setPendingUser(user);
          const nameParts = user.displayName?.split(" ") || ["", ""];
          setWalkerData(prev => ({
            ...prev,
            firstName: nameParts[0] || "",
            lastName: nameParts.slice(1).join(" ") || "",
            photoURL: user.photoURL || ""
          }));
          setShowWalkerForm(true);
        } else {
          // Auto-create for owners
          const profileData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: role,
            isAdmin: user.email?.toLowerCase() === "gamingwithglitch@gmail.com",
            isApproved: true,
            isAvailable: false,
            createdAt: new Date().toISOString(),
            walkCount: 0,
            rating: 5,
          };

          await setDoc(docRef, profileData);
          await setDoc(doc(db, "owners", user.uid), profileData);
          
          toast.success("¡Cuenta de dueño creada con éxito!");
        }
      } else {
        // If user exists, ensure isAdmin is correct for the main admin
        const currentData = docSnap.data();
        if (user.email?.toLowerCase() === "gamingwithglitch@gmail.com" && !currentData.isAdmin) {
          await setDoc(docRef, { isAdmin: true, role: UserRole.ADMIN }, { merge: true });
        }
      }
    } catch (err: any) {
      console.error("Process login error:", err);
      setError("Error al procesar el perfil del usuario.");
    } finally {
      setLoading(false);
    }
  };

  // Check localStorage for terms acceptance periodically or on focus
  useEffect(() => {
    const checkTerms = () => {
      const accepted = localStorage.getItem("jaguata_terms_accepted") === "true";
      if (accepted && !localTermsAccepted) {
        setLocalTermsAccepted(true);
        toast.success("Términos aceptados correctamente");
      }
    };

    window.addEventListener("focus", checkTerms);
    const interval = setInterval(checkTerms, 1000);
    return () => {
      window.removeEventListener("focus", checkTerms);
      clearInterval(interval);
    };
  }, [localTermsAccepted]);

  const handleEmailRegisterWalker = async () => {
    if (!localTermsAccepted) {
      toast.error("Debes aceptar los términos y condiciones");
      return;
    }
    
    if (!walkerData.email || !walkerData.password || !walkerData.firstName || !walkerData.lastName || !walkerData.birthDate || !walkerData.ci || !walkerData.city || !walkerData.phoneNumber || !walkerData.ciFrontPhoto || !walkerData.ciBackPhoto) {
      toast.error("Por favor completa todos los campos y sube todas las fotos requeridas");
      return;
    }

    setLoading(true);
    try {
      // 1. Create firebase auth user
      const userCredential = await createUserWithEmailAndPassword(auth, walkerData.email, walkerData.password);
      const user = userCredential.user;

      // 2. Update profile displayName
      await updateProfile(user, {
        displayName: `${walkerData.firstName} ${walkerData.lastName}`,
        photoURL: walkerData.photoURL
      });

      // 3. Create Firestore profiles
      const profileData = {
        uid: user.uid,
        email: walkerData.email,
        displayName: `${walkerData.firstName} ${walkerData.lastName}`,
        firstName: walkerData.firstName,
        lastName: walkerData.lastName,
        photoURL: walkerData.photoURL || null,
        role: UserRole.WALKER,
        isAdmin: walkerData.email.toLowerCase() === "gamingwithglitch@gmail.com",
        isApproved: false,
        isAvailable: false,
        createdAt: new Date().toISOString(),
        walkCount: 0,
        rating: 5,
        birthDate: walkerData.birthDate,
        city: walkerData.city,
        phoneNumber: walkerData.phoneNumber,
        termsAccepted: true,
        termsAcceptedAt: new Date().toISOString(),
        ciVerificationStatus: 'manual_pending',
        ciVerificationResult: "Perfil en proceso de validación"
      };

      const sensitiveData = {
        ci: walkerData.ci,
        ciFrontPhoto: walkerData.ciFrontPhoto,
        ciBackPhoto: walkerData.ciBackPhoto,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", user.uid), profileData);
      await setDoc(doc(db, "users", user.uid, "private_data", "identity"), sensitiveData);
      await setDoc(doc(db, "walkers", user.uid), profileData);

      // 4. Notify admin (Handle safely to avoid registration being blocked by individual notification errors)
      try {
        const adminQuery = query(collection(db, "users"));
        const adminSnap = await getDocs(adminQuery);
        const adminDocs = adminSnap.docs.filter(d => {
          const data = d.data();
          return data.isAdmin === true || data.email === "gamingwithglitch@gmail.com";
        });

        for (const adminDoc of adminDocs) {
          await sendNotification({
            userId: adminDoc.id,
            title: "Nueva solicitud de paseador",
            body: `${walkerData.firstName} ${walkerData.lastName} se ha registrado (vía Email) y espera aprobación.`,
            type: 'walker_request'
          }).catch(console.error);
        }
      } catch (adminErr) {
        console.warn("Failed to notify admins, but registration finished:", adminErr);
      }

      toast.success("¡Registro completado! Un administrador revisará tu perfil pronto.");
      setAuthMode('LOGIN');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al completar el registro");
      toast.error("Error al completar el registro");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!loginData.email || !loginData.password) {
      toast.error("Por favor completa tus credenciales");
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
      toast.success("¡Bienvenido de nuevo!");
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-disabled') {
        setError("Tu cuenta ha sido suspendida por un administrador.");
        toast.error("Cuenta Suspendida", {
          description: "Revisa tu correo o contacta a soporte para más detalles."
        });
      } else {
        setError("Email o contraseña incorrectos");
        toast.error("Email o contraseña incorrectos");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (role: UserRole) => {
    if (role === UserRole.WALKER) {
      setAuthMode('REGSITER_CHOICE');
      return;
    }
    
    setLoading(true);
    setError(null);
    localStorage.setItem("pending_auth_role", role);
    const provider = new GoogleAuthProvider();
    
    try {
      // First attempt with Popup
      const result = await signInWithPopup(auth, provider);
      await processUserLogin(result.user, role);
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/user-disabled') {
        setError("Tu cuenta ha sido suspendida por un administrador.");
        toast.error("Cuenta Suspendida", {
          description: "Revisa tu correo o contacta a soporte para más detalles."
        });
        return;
      }
      // Check for referer blocked error
      if (err.message?.includes('requests-from-referer') || err.code === 'auth/requests-from-referer-blocked') {
        setError(`⚠️ DOMINIO RESTRINGIDO: ${window.location.hostname}`);
        toast.error("Error de dominio", {
          description: "Google está bloqueando el inicio de sesión desde este entorno. Intentando modo alternativo...",
          duration: 5000
        });
        
        // Fallback to Redirect
        try {
          await signInWithRedirect(auth, provider);
        } catch (rerr: any) {
          console.error("Critical Redirect Error:", rerr);
          setError("Error crítico de dominio. Por favor intenta abrir la app en una nueva pestaña (Open in new tab).");
        }
      } else {
        setError("Error al iniciar sesión. Por favor, intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLoginWalker = async () => {
    setLoading(true);
    setError(null);
    localStorage.setItem("pending_auth_role", UserRole.WALKER);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await processUserLogin(result.user, UserRole.WALKER);
    } catch (err: any) {
       console.error(err);
       if (err.code === 'auth/user-disabled') {
         setError("Tu cuenta ha sido suspendida por un administrador.");
         toast.error("Cuenta Suspendida");
       } else {
         toast.error("Error al iniciar con Google");
       }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteWalkerRegistration = async () => {
    if (!pendingUser || !localTermsAccepted) return;
    
    // Simple validation
    if (!walkerData.firstName || !walkerData.lastName || !walkerData.birthDate || !walkerData.ci || !walkerData.city || !walkerData.phoneNumber || !walkerData.ciFrontPhoto || !walkerData.ciBackPhoto) {
      toast.error("Por favor completa todos los campos y sube todas las fotos requeridas");
      return;
    }

    setLoading(true);
    try {
      const profileData = {
        uid: pendingUser.uid,
        email: pendingUser.email,
        displayName: `${walkerData.firstName} ${walkerData.lastName}`,
        firstName: walkerData.firstName,
        lastName: walkerData.lastName,
        photoURL: walkerData.photoURL || pendingUser.photoURL,
        role: UserRole.WALKER,
        isAdmin: pendingUser.email?.toLowerCase() === "gamingwithglitch@gmail.com",
        isApproved: false, // Walkers need admin approval
        isAvailable: false,
        createdAt: new Date().toISOString(),
        walkCount: 0,
        rating: 5,
        // New fields
        birthDate: walkerData.birthDate,
        city: walkerData.city,
        phoneNumber: walkerData.phoneNumber,
        termsAccepted: true,
        termsAcceptedAt: localStorage.getItem("jaguata_terms_date") || new Date().toISOString(),
        ciVerificationStatus: 'manual_pending',
        ciVerificationResult: "Registro completado. Tu perfil está en proceso de validación."
      };

      const sensitiveData = {
        ci: walkerData.ci,
        ciFrontPhoto: walkerData.ciFrontPhoto,
        ciBackPhoto: walkerData.ciBackPhoto,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", pendingUser.uid), profileData);
      await setDoc(doc(db, "users", pendingUser.uid, "private_data", "identity"), sensitiveData);
      await setDoc(doc(db, "walkers", pendingUser.uid), profileData);

      // Notify admin (Handle safely)
      try {
        const adminQuery = query(collection(db, "users"));
        const adminSnap = await getDocs(adminQuery);
        const adminDocs = adminSnap.docs.filter(d => {
          const data = d.data();
          return data.isAdmin === true || data.email === "gamingwithglitch@gmail.com";
        });

        for (const adminDoc of adminDocs) {
          await sendNotification({
            userId: adminDoc.id,
            title: "Nueva solicitud de paseador",
            body: `${walkerData.firstName} ${walkerData.lastName} se ha registrado y espera aprobación.`,
            type: 'walker_request'
          }).catch(console.error);
        }
      } catch (adminErr) {
        console.warn("Failed to notify admins:", adminErr);
      }

      toast.success("¡Registro completado! Un administrador revisará tu perfil pronto.");
    } catch (err) {
      console.error(err);
      toast.error("Error al completar el registro");
    } finally {
      setLoading(false);
    }
  };

  if (showWalkerForm || authMode === 'EMAIL_REGISTER_WALKER') {
    return (
      <div className="flex min-h-screen flex-col items-center bg-orange-50 px-6 py-12 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl"
        >
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white">
              <UserIcon size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Registro de Paseador</h2>
            <p className="text-center text-sm text-gray-500 mt-2">Completa tu información para la revisión de tu perfil.</p>
          </div>

          <div className="space-y-6">
            {/* Account Info (Email/Pass if not Google) */}
            {!pendingUser && (
              <div className="space-y-4 border-b border-gray-100 pb-6">
                 <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Mail size={18} className="text-orange-500" />
                  Credenciales de Acceso
                </h3>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Correo Electrónico</label>
                  <input 
                    type="email" 
                    value={walkerData.email}
                    onChange={(e) => setWalkerData({ ...walkerData, email: e.target.value })}
                    placeholder="email@ejemplo.com"
                    className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contraseña</label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={walkerData.password}
                      onChange={(e) => setWalkerData({ ...walkerData, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                <input 
                  type="text" 
                  value={walkerData.firstName}
                  onChange={(e) => setWalkerData({ ...walkerData, firstName: e.target.value })}
                  placeholder="Juan"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Apellido</label>
                <input 
                  type="text" 
                  value={walkerData.lastName}
                  onChange={(e) => setWalkerData({ ...walkerData, lastName: e.target.value })}
                  placeholder="Pérez"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">F. de Nacimiento</label>
                <input 
                  type="date" 
                  value={walkerData.birthDate}
                  onChange={(e) => setWalkerData({ ...walkerData, birthDate: e.target.value })}
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nº de C.I.</label>
                <input 
                  type="text" 
                  value={walkerData.ci}
                  onChange={(e) => setWalkerData({ ...walkerData, ci: e.target.value })}
                  placeholder="1.234.567"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ciudad</label>
                <input 
                  type="text" 
                  value={walkerData.city}
                  onChange={(e) => setWalkerData({ ...walkerData, city: e.target.value })}
                  placeholder="Asunción"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nº de Celular</label>
                <input 
                  type="tel" 
                  value={walkerData.phoneNumber}
                  onChange={(e) => setWalkerData({ ...walkerData, phoneNumber: e.target.value })}
                  placeholder="+595 981 123456"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
              </div>
            </div>

            {pendingUser && (
              <div>
                <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Correo Electrónico (Google)</label>
                <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-4 text-sm text-gray-500">
                  <Mail size={16} />
                  {pendingUser?.email}
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-6">
              <h3 className="mb-4 text-sm font-bold text-gray-900 flex items-center gap-2">
                <Shield size={18} className="text-orange-500" />
                Documentación Requerida
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Selfie */}
                <div className="relative">
                  <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Foto Selfie</label>
                  <label className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${walkerData.photoURL ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-orange-500 hover:bg-orange-50'}`}>
                    {walkerData.photoURL ? (
                      <img src={walkerData.photoURL} alt="Selfie" className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      <>
                        <Camera className="mb-1 text-gray-400" size={24} />
                        <span className="text-[10px] font-bold text-gray-400">SUBIR FOTO</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'photoURL')} />
                  </label>
                </div>

                {/* CI Front */}
                <div className="relative">
                  <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">CI Frontal</label>
                  <label className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${walkerData.ciFrontPhoto ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-orange-500 hover:bg-orange-50'}`}>
                    {walkerData.ciFrontPhoto ? (
                      <img src={walkerData.ciFrontPhoto} alt="CI Front" className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      <>
                        <ImageIcon className="mb-1 text-gray-400" size={24} />
                        <span className="text-[10px] font-bold text-gray-400">PARTE FRONTAL</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'ciFrontPhoto')} />
                  </label>
                </div>

                {/* CI Back */}
                <div className="relative">
                  <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">CI Dorsal</label>
                  <label className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${walkerData.ciBackPhoto ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50 hover:border-orange-500 hover:bg-orange-50'}`}>
                    {walkerData.ciBackPhoto ? (
                      <img src={walkerData.ciBackPhoto} alt="CI Back" className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      <>
                        <ImageIcon className="mb-1 text-gray-400" size={24} />
                        <span className="text-[10px] font-bold text-gray-400">PARTE DORSAL</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e, 'ciBackPhoto')} />
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button 
                onClick={() => window.open("/terms", "_blank")}
                className="flex w-full items-center justify-between rounded-xl bg-gray-100 p-4 text-sm font-bold text-gray-700 hover:bg-gray-200 transition-all"
              >
                <span className="flex items-center gap-2">
                  <Shield className="text-orange-500" size={18} />
                  TÉRMINOS Y CONDICIONES
                </span>
                <ExternalLink size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="flex items-start gap-3 py-2">
              <button 
                onClick={() => setLocalTermsAccepted(!localTermsAccepted)}
                className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all ${localTermsAccepted ? "bg-green-500 border-green-500 text-white" : "border-gray-200 bg-white"}`}
              >
                {localTermsAccepted && <Check size={16} />}
              </button>
              <p className="text-xs text-gray-500 leading-relaxed">
                He leído y acepto los términos y condiciones para paseadores de Jaguata.
              </p>
            </div>

            <button 
              onClick={pendingUser ? handleCompleteWalkerRegistration : handleEmailRegisterWalker}
              disabled={loading || !localTermsAccepted}
              className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-200 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Finalizar Registro y Postularme"
              )}
            </button>

            <button 
              onClick={() => {
                setShowWalkerForm(false);
                setPendingUser(null);
                setAuthMode('LOGIN');
              }}
              className="w-full py-2 text-xs font-bold text-gray-400 uppercase tracking-widest"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (authMode === 'REGSITER_CHOICE') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-orange-50 px-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm space-y-6 text-center"
        >
          <div className="mb-4 flex flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-orange-500 text-white shadow-xl">
              <UserIcon size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Únete como Paseador</h2>
            <p className="text-sm text-gray-500 mt-2">¿Cómo prefieres crear tu cuenta?</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleGoogleLoginWalker}
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-white p-5 font-bold text-gray-700 shadow-md transition-all hover:shadow-xl active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-6 w-6" />
              Continuar con Google
              <div className="absolute right-4">
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </button>

            <button
              onClick={() => setAuthMode('EMAIL_REGISTER_WALKER')}
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 p-5 font-bold text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 active:scale-95"
            >
              <Mail size={24} />
              Registrar con Email
              <div className="absolute right-4 text-white/50">
                <ChevronRight size={18} />
              </div>
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-4">¿Ya tienes una cuenta?</p>
            <button
              onClick={() => setAuthMode('EMAIL_LOGIN')}
              className="text-orange-500 font-bold text-sm hover:underline"
            >
              Iniciar Sesión con Email
            </button>
          </div>

          <button 
            onClick={() => setAuthMode('LOGIN')}
            className="w-full py-2 text-xs font-bold text-gray-400 uppercase tracking-widest"
          >
            Volver
          </button>
        </motion.div>
      </div>
    );
  }

  if (authMode === 'EMAIL_LOGIN') {
    return (
       <div className="flex min-h-screen flex-col items-center justify-center bg-orange-50 px-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl"
        >
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white">
              <Lock size={28} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Iniciar Sesión</h2>
            <p className="text-center text-sm text-gray-500 mt-2">Ingresa tus credenciales de Jaguata.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Email</label>
              <input 
                type="email" 
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                placeholder="tu@email.com"
                className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full rounded-xl border-2 border-gray-50 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:bg-white focus:outline-none transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button 
              onClick={handleEmailLogin}
              disabled={loading}
              className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-200 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-4"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "Entrar"
              )}
            </button>

            <button 
              onClick={() => setAuthMode('LOGIN')}
              className="w-full py-2 text-xs font-bold text-gray-400 uppercase tracking-widest"
            >
              Volver
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-orange-50 px-6">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-8 w-full max-w-sm overflow-hidden rounded-2xl shadow-lg bg-white"
      >
        <img 
          src="/jaguata_banner.jpg" 
          alt="Jaguata Banner" 
          className="w-full h-auto object-contain"
          referrerPolicy="no-referrer"
        />
      </motion.div>

      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={() => handleLogin(UserRole.OWNER)}
          disabled={loading}
          className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-white p-5 font-bold text-gray-700 shadow-md transition-all hover:shadow-xl active:scale-95 disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-6 w-6" />
          Soy Dueño de Mascota
          <div className="absolute right-4 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1">
            <Check size={16} className="text-orange-500" />
          </div>
        </button>

        <button
          onClick={() => handleLogin(UserRole.WALKER)}
          disabled={loading}
          className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-orange-500 p-5 font-bold text-white shadow-lg shadow-orange-100 transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-6 w-6 brightness-0 invert" />
          Soy Paseador
          <div className="absolute right-4 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1">
            <Check size={16} className="text-white" />
          </div>
        </button>

        {error && (
          <p className="text-center text-sm font-medium text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>
        )}
      </div>

      <div className="mt-8 flex flex-col items-center gap-4">
        <p className="text-xs text-gray-400">¿Ya tienes cuenta de paseador vía email?</p>
        <button 
           onClick={() => setAuthMode('EMAIL_LOGIN')}
           className="text-orange-600 text-sm font-bold hover:underline"
        >
          Iniciar Sesión con Email
        </button>
      </div>

      <p className="mt-12 text-center text-xs text-gray-400">
        Al continuar, aceptas nuestros <button onClick={() => window.open("/terms", "_blank")} className="underline font-bold text-gray-500">Términos de Servicio</button> y Política de Privacidad.
      </p>
    </div>
  );
}
