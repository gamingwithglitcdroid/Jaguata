import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDoc, getDocs } from "firebase/firestore";
import { auth, db, playNotificationSound } from "../firebase";
import { Walk, WalkStatus, Pet, UserProfile, UserRole } from "../types";
import { signOut } from "firebase/auth";
import { MapPin, Plus, Dog, Navigation, Bell, Clock, X, User as UserIcon, CheckCircle, TrendingUp, LogOut, Star, Sun, Moon, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Map from "../components/Map";
import AddressAutocomplete from "../components/AddressAutocomplete";
import WalkETA from "../components/WalkETA";
import WalkChat from "../components/WalkChat";
import PostWalkFeedback from "../components/PostWalkFeedback";
import { useNavigate } from "react-router-dom";
import { sendNotification } from "../services/notificationService";
import { toast } from "sonner";
import { formatCurrency, calculateWalkCost } from "../lib/utils";

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [activeWalk, setActiveWalk] = useState<Walk | null>(null);
  const [walkerProfile, setWalkerProfile] = useState<UserProfile | null>(null);
  const [pastWalks, setPastWalks] = useState<Walk[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [activeWalkersCount, setActiveWalkersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showArrivalAlert, setShowArrivalAlert] = useState(false);
  const [showAcceptanceAlert, setShowAcceptanceAlert] = useState(false);
  const [chatWalkId, setChatWalkId] = useState<string | null>(null);
  const [ratingWalk, setRatingWalk] = useState<Walk | null>(null);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<20 | 30 | 60>(30);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [pickupLocation, setPickupLocation] = useState({
    lat: -34.6037,
    lng: -58.3816,
    address: "Ubicación seleccionada"
  });
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'transfer' | 'cash'>('card');

  useEffect(() => {
    if (!auth.currentUser) return;

    // Request current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPickupLocation(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }

    // Listen for active walks
    const activeQuery = query(
      collection(db, "walks"),
      where("ownerId", "==", auth.currentUser.uid),
      where("status", "in", [WalkStatus.REQUESTED, WalkStatus.PENDING_OWNER, WalkStatus.ACCEPTED, WalkStatus.IN_PROGRESS, WalkStatus.WALKER_ARRIVED])
    );

    let unsubscribeWalker: (() => void) | null = null;

    const unsubscribeActive = onSnapshot(activeQuery, (snapshot) => {
      const walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      const currentActive = walks[0] || null;
      setActiveWalk(currentActive);

      // Manage walker profile listener
      if (currentActive?.walkerId) {
        if (!walkerProfile || walkerProfile.uid !== currentActive.walkerId) {
          if (unsubscribeWalker) unsubscribeWalker();
          const walkerRef = doc(db, "users", currentActive.walkerId);
          unsubscribeWalker = onSnapshot(walkerRef, (snap) => {
            if (snap.exists()) {
              setWalkerProfile(snap.data() as UserProfile);
            }
          });
        }
      } else {
        if (unsubscribeWalker) unsubscribeWalker();
        unsubscribeWalker = null;
        setWalkerProfile(null);
      }
    });

    // Listen for past walks
    const pastQuery = query(
      collection(db, "walks"),
      where("ownerId", "==", auth.currentUser.uid),
      where("status", "==", WalkStatus.COMPLETED)
    );

    const unsubscribePast = onSnapshot(pastQuery, (snapshot) => {
      const walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      setPastWalks(walks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    // Listen for pets
    const petsQuery = query(
      collection(db, "pets"),
      where("ownerId", "==", auth.currentUser.uid)
    );

    const unsubscribePets = onSnapshot(petsQuery, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet));
      setPets(petList);
      setLoading(false);
    });

    // Listen for active walkers
    const walkersQuery = query(
      collection(db, "users"),
      where("role", "==", UserRole.WALKER),
      where("isAvailable", "==", true),
      where("isApproved", "==", true)
    );

    const unsubscribeWalkers = onSnapshot(walkersQuery, (snapshot) => {
      setActiveWalkersCount(snapshot.size);
    });

    const unsubscribeProfile = onSnapshot(doc(db, "users", auth.currentUser.uid), (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      }
    });

    return () => {
      unsubscribeActive();
      unsubscribePast();
      unsubscribePets();
      unsubscribeWalkers();
      unsubscribeProfile();
      if (unsubscribeWalker) unsubscribeWalker();
    };
  }, []);

  // Auto-trigger rating for recently completed walks
  useEffect(() => {
    if (pastWalks.length > 0 && !activeWalk) {
      const lastWalk = pastWalks[0];
      // If it's a recent walk (completed in the last 10 mins) and has no rating
      if (!lastWalk.rating) {
        const completedAt = lastWalk.endTime ? new Date(lastWalk.endTime).getTime() : 0;
        const now = new Date().getTime();
        // If it was completed recently (last 10 mins)
        if (now - completedAt < 600000) {
          setRatingWalk(lastWalk);
        }
      }
    }
  }, [pastWalks, activeWalk]);

  // Alert owner when walker arrives
  useEffect(() => {
    if (activeWalk?.walkerArrivedAt) {
      playNotificationSound();
      setShowArrivalAlert(true);
      const timer = setTimeout(() => setShowArrivalAlert(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeWalk?.walkerArrivedAt]);

  // Alert owner when walker accepts walk
  useEffect(() => {
    if (activeWalk?.status === WalkStatus.ACCEPTED && activeWalk.acceptedAt) {
      // Show alert only if it was accepted recently (within last 30 seconds) to avoid showing on every refresh
      const acceptedTime = new Date(activeWalk.acceptedAt).getTime();
      const now = new Date().getTime();
      if (now - acceptedTime < 30000) {
        playNotificationSound();
        setShowAcceptanceAlert(true);
        const timer = setTimeout(() => setShowAcceptanceAlert(false), 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [activeWalk?.status, activeWalk?.acceptedAt]);

  const handleAcceptWalker = async () => {
    if (!activeWalk || !walkerProfile) return;
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId: activeWalk.id,
          status: WalkStatus.ACCEPTED,
          walkerName: walkerProfile.displayName
        })
      });

      if (!response.ok) throw new Error("Error al llamar a la API de actualización de estado");
      
      toast.success("Has aceptado al paseador. ¡Llegará pronto!");
    } catch (err) {
      console.error(err);
      toast.error("Error al confirmar al paseador");
    }
  };

  const handleRejectWalker = async () => {
    if (!activeWalk || !walkerProfile) return;
    try {
      await updateDoc(doc(db, "walks", activeWalk.id), {
        status: WalkStatus.REQUESTED,
        walkerId: null,
        rejectedWalkerIds: [...(activeWalk.rejectedWalkerIds || []), walkerProfile.uid]
      });
      
      await sendNotification({
        userId: walkerProfile.uid,
        title: "Solicitud Rechazada",
        body: `El dueño ha decidido buscar otro paseador para este servicio.`,
        type: 'walk_cancelled',
        walkId: activeWalk.id
      });
      
      toast.info("Has rechazado esta solicitud. Buscaremos otro paseador.");
      setWalkerProfile(null);
    } catch (err) {
      console.error(err);
      toast.error("Error al rechazar al paseador");
    }
  };

  const handleRequestWalk = async () => {
    if (!auth.currentUser || selectedPetIds.length === 0) return;

    if (isScheduled && (!scheduledDate || !scheduledTime)) {
      toast.error("Por favor selecciona la fecha y hora para el paseo programado.");
      return;
    }

    try {
      const collectionName = isScheduled ? "scheduled_walks" : "walks";
      const scheduledFor = isScheduled ? `${scheduledDate}T${scheduledTime}:00` : undefined;

      const walkRef = await addDoc(collection(db, collectionName), {
        ownerId: auth.currentUser.uid,
        petIds: selectedPetIds,
        status: WalkStatus.REQUESTED,
        durationOption: duration,
        estimatedCost: calculateWalkCost(duration),
        pickupLocation: pickupLocation,
        paymentMethod: paymentMethod,
        isScheduled: isScheduled,
        scheduledFor: scheduledFor,
        createdAt: new Date().toISOString(),
      });
      
      setShowRequestModal(false);
      setSelectedPetIds([]);
      setIsScheduled(false);
      setScheduledDate('');
      setScheduledTime('');
      
      toast.success(isScheduled ? "Paseo programado con éxito" : "¡Buscando paseador!");

      // Fetch pet names for notification
      const petNames: string[] = [];
      for (const petId of selectedPetIds) {
        const petSnap = await getDoc(doc(db, "pets", petId));
        if (petSnap.exists()) {
          petNames.push(petSnap.data().name);
        }
      }
      const petNamesStr = petNames.join(", ");

      // Notify all available and approved walkers
      const walkersQuery = query(
        collection(db, "users"), 
        where("role", "==", UserRole.WALKER),
        where("isAvailable", "==", true),
        where("isApproved", "==", true)
      );
      const walkersSnapshot = await getDocs(walkersQuery);
      
      const notificationPromises = walkersSnapshot.docs.map(walkerDoc => 
        sendNotification({
          userId: walkerDoc.id,
          title: isScheduled ? "¡Nuevo Paseo Programado!" : "¡Nuevo Paseo Disponible!",
          body: `${auth.currentUser?.displayName || 'Alguien'} ha solicitado un paseo de ${duration} min para ${petNamesStr}.`,
          type: 'walk_requested',
          walkId: walkRef.id
        })
      );
      await Promise.all(notificationPromises);

    } catch (err) {
      console.error(err);
      toast.error("Error al solicitar el paseo");
    }
  };

  const handleCancelWalk = async () => {
    if (!activeWalk) return;
    try {
      await updateDoc(doc(db, "walks", activeWalk.id), {
        status: WalkStatus.CANCELLED,
        cancelledAt: new Date().toISOString()
      });
      setShowCancelConfirm(false);
      
      // Notify walker if assigned
      if (activeWalk.walkerId) {
        await sendNotification({
          userId: activeWalk.walkerId,
          title: "Paseo Cancelado",
          body: "El dueño ha cancelado la solicitud de paseo.",
          type: 'walk_cancelled',
          walkId: activeWalk.id
        });
      }

      // Notify admin
      const adminEmails = ["gamingwithglitch@gmail.com"];
      for (const email of adminEmails) {
        const q = query(collection(db, "users"), where("email", "==", email));
        const snap = await getDocs(q);
        snap.forEach(async (adminDoc) => {
          await sendNotification({
            userId: adminDoc.id,
            title: "Paseo Cancelado",
            body: `Un paseo ha sido cancelado por el dueño.`,
            type: 'walk_cancelled',
            walkId: activeWalk.id
          });
        });
      }

      const adminQuery = query(collection(db, "users"), where("isAdmin", "==", true));
      const adminSnap = await getDocs(adminQuery);
      adminSnap.forEach(async (adminDoc) => {
        if (!adminEmails.includes(adminDoc.data().email)) {
          await sendNotification({
            userId: adminDoc.id,
            title: "Paseo Cancelado",
            body: `Un paseo ha sido cancelado por el dueño.`,
            type: 'walk_cancelled',
            walkId: activeWalk.id
          });
        }
      });
    } catch (err) {
      console.error("Error cancelling walk:", err);
    }
  };

  const togglePetSelection = (petId: string) => {
    setSelectedPetIds(prev => 
      prev.includes(petId) ? prev.filter(id => id !== petId) : [...prev, petId]
    );
  };

  const petStats = useMemo(() => {
    const stats: Record<string, { count: number; totalCost: number }> = {};
    pastWalks.forEach(walk => {
      walk.petIds?.forEach(petId => {
        if (!stats[petId]) {
          stats[petId] = { count: 0, totalCost: 0 };
        }
        stats[petId].count += 1;
        stats[petId].totalCost += walk.cost || 0;
      });
    });
    return stats;
  }, [pastWalks]);

  const handleLogout = async () => {
    try {
      if (auth.currentUser) {
        localStorage.removeItem(`jaguata_session_id_${auth.currentUser.uid}`);
      }
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const toggleTheme = async () => {
    if (!auth.currentUser || !profile || isUpdatingTheme) return;
    setIsUpdatingTheme(true);
    try {
      const newTheme = profile.theme === 'dark' ? 'light' : 'dark';
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
      <header className="bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-400"
              title="Cerrar sesión / Volver al login"
            >
              <LogOut size={20} />
            </button>
            <button 
              onClick={toggleTheme}
              disabled={isUpdatingTheme}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-400"
              title="Cambiar tema"
            >
              {profile?.theme === 'dark' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} />}
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hola, {auth.currentUser?.displayName?.split(" ")[0]}!</h1>
              <p className="text-gray-500 dark:text-slate-400">¿Listo para un paseo hoy?</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-green-600 ring-1 ring-green-100">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-xs font-bold">{activeWalkersCount} Paseadores Activos</span>
            </div>
          </div>
        </div>
      </header>

      <div className="fixed top-24 left-4 right-4 z-50 flex flex-col items-center gap-3 pointer-events-none">
        <AnimatePresence>
          {showAcceptanceAlert && (
            <motion.div 
              initial={{ y: -20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.95 }}
              className="pointer-events-auto flex items-center gap-3 rounded-full bg-green-600 px-4 py-2.5 text-white shadow-2xl border border-white/20"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                <CheckCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">¡Paseo Aceptado!</p>
                <p className="text-[10px] opacity-90 truncate max-w-[150px]">
                  {walkerProfile?.displayName?.split(" ")[0]} está en camino.
                </p>
              </div>
              <button 
                onClick={() => navigate(`/walk/${activeWalk?.id}`)}
                className="ml-1 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-green-600 shadow-sm active:scale-90 transition-transform"
              >
                Ver Info
              </button>
              <button onClick={() => setShowAcceptanceAlert(false)} className="ml-1 text-white/50 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}

          {showArrivalAlert && (
            <motion.div 
              initial={{ y: -20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.95 }}
              className="pointer-events-auto flex items-center gap-3 rounded-full bg-orange-500 px-4 py-2.5 text-white shadow-2xl border border-white/20"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                <MapPin size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">¡Paseador llegó!</p>
                <p className="text-[10px] opacity-90 truncate max-w-[150px]">
                  {walkerProfile?.displayName?.split(" ")[0]} está afuera.
                </p>
              </div>
              <button 
                onClick={() => navigate(`/walk/${activeWalk?.id}`)}
                className="ml-1 rounded-full bg-white px-3 py-1 text-[10px] font-bold text-orange-600 shadow-sm active:scale-90 transition-transform"
              >
                Atender
              </button>
              <button onClick={() => setShowArrivalAlert(false)} className="ml-1 text-white/50 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="flex-1 p-4">

        {activeWalk ? (
          <div className="space-y-4">
            <div 
              onClick={() => navigate(`/walk/${activeWalk.id}`)}
              className="cursor-pointer rounded-2xl bg-white p-4 shadow-md transition-all active:scale-[0.98]"
            >
              <div className="mb-3 flex items-center justify-between">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    activeWalk.status === WalkStatus.REQUESTED ? "bg-orange-100 text-orange-600" :
                    activeWalk.status === WalkStatus.PENDING_OWNER ? "bg-yellow-100 text-yellow-600" :
                    activeWalk.status === WalkStatus.ACCEPTED ? "bg-blue-100 text-blue-600" :
                    activeWalk.status === WalkStatus.WALKER_ARRIVED ? "bg-orange-100 text-orange-600" :
                    "bg-green-100 text-green-600"
                  }`}>
                    {activeWalk.status === WalkStatus.REQUESTED ? "Buscando Paseador" : 
                     activeWalk.status === WalkStatus.PENDING_OWNER ? "Confirmación Pendiente" :
                     activeWalk.status === WalkStatus.ACCEPTED ? "Paseador en camino" : 
                     activeWalk.status === WalkStatus.WALKER_ARRIVED ? "¡Paseador llegó!" : "En Paseo"}
                  </span>
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock size={14} />
                  <span className="text-xs font-medium">En vivo</span>
                </div>
              </div>
              
              <div className="relative mb-4 h-64 w-full overflow-hidden rounded-xl bg-gray-200 shadow-inner">
                <Map 
                  center={activeWalk.currentLocation || activeWalk.pickupLocation || { lat: -25.2866, lng: -57.6333 }} 
                  markers={[
                    ...(activeWalk.pickupLocation ? [{ ...activeWalk.pickupLocation, title: "Recogida", type: 'pickup' as const }] : []),
                    ...(activeWalk.currentLocation ? [{ ...activeWalk.currentLocation, title: "Paseador", type: 'walker' as const }] : [])
                  ]}
                  path={activeWalk.path || []}
                  readOnly
                />
              </div>

              <div className="flex items-center gap-4">
                {activeWalk.status === WalkStatus.PENDING_OWNER && walkerProfile ? (
                  <div className="w-full space-y-4">
                    <div className="rounded-2xl bg-yellow-50 p-4 border border-yellow-100 dark:bg-yellow-900/10">
                      <p className="text-[10px] font-bold text-yellow-600 uppercase mb-3">Paseador Interesado:</p>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white shadow-sm ring-2 ring-white">
                          {walkerProfile.photoURL ? (
                            <img src={walkerProfile.photoURL} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-gray-400">
                              <UserIcon size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-lg font-bold text-gray-900">{walkerProfile.displayName}</p>
                            {walkerProfile.ciVerificationStatus === 'verified' && (
                              <CheckCircle size={18} className="text-blue-500 fill-blue-50" title="Perfil Verificado (KYC)" />
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Star size={14} className="fill-yellow-500 text-yellow-500" />
                              <span className="text-sm font-bold">{walkerProfile.rating?.toFixed(1) || "5.0"}</span>
                            </div>
                            <span className="text-xs text-gray-400">•</span>
                            <div className="flex items-center gap-1 text-gray-500">
                              <Dog size={14} />
                              <span className="text-xs font-bold">{walkerProfile.walkCount || 0} paseos</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatWalkId(activeWalk.id);
                          }}
                          className="flex-1 rounded-xl bg-gray-50 py-3 text-sm font-bold text-gray-600 border border-gray-100 active:scale-95 flex items-center justify-center gap-2"
                        >
                          <MessageCircle size={16} />
                          Chat
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectWalker();
                          }}
                          className="flex-1 rounded-xl bg-white py-3 text-sm font-bold text-gray-600 border border-gray-100 active:scale-95 transition-all"
                        >
                          Rechazar
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptWalker();
                          }}
                          className="flex-[2] rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 active:scale-95 transition-all"
                        >
                          Aceptar Paseador
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex -space-x-3">
                      {activeWalk.petIds?.map(id => {
                        const pet = pets.find(p => p.id === id);
                        return (
                          <div key={id} className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-orange-100">
                            {pet?.photos?.[0] ? (
                              <img src={pet.photos[0]} alt={pet.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-orange-400">
                                <Dog size={20} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">
                        Paseo de {activeWalk.petIds?.map(id => pets.find(p => p.id === id)?.name).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500">
                        {activeWalk.status === WalkStatus.REQUESTED 
                          ? "Esperando que un paseador acepte..." 
                          : `Paseo de ${activeWalk.durationOption} min en progreso`}
                      </p>
                      {walkerProfile && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/profile/${walkerProfile.uid}`);
                            }}
                            className="flex items-center gap-1 text-[10px] font-bold text-orange-500 hover:underline"
                          >
                            <UserIcon size={10} />
                            Paseador: {walkerProfile.displayName}
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatWalkId(activeWalk.id);
                            }}
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:underline"
                          >
                            <MessageCircle size={10} />
                            Chat con Paseador
                          </button>
                          {activeWalk.status === WalkStatus.ACCEPTED && activeWalk.currentLocation && activeWalk.pickupLocation && (
                            <WalkETA origin={activeWalk.currentLocation} destination={activeWalk.pickupLocation} />
                          )}
                        </div>
                      )}
                    </div>
                    {(activeWalk.status === WalkStatus.REQUESTED || 
                      activeWalk.status === WalkStatus.ACCEPTED || 
                      activeWalk.status === WalkStatus.IN_PROGRESS) && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCancelConfirm(true);
                        }}
                        className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-100"
                      >
                        Cancelar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-gray-100 p-6 text-gray-400">
              <Dog size={64} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">No hay paseos activos</h2>
            <p className="mb-8 text-gray-500">Tus mascotas están esperando salir a explorar.</p>
          </div>
        )}

        <div className="mt-8">
          <h3 className="mb-4 text-lg font-bold text-gray-900">Mis Mascotas</h3>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pets.map(pet => (
              <div key={pet.id} className="min-w-[140px] rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 h-24 w-full overflow-hidden rounded-xl bg-orange-100">
                  {pet.photos?.[0] && (
                    <img src={pet.photos[0]} alt={pet.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  )}
                </div>
                <p className="font-bold text-gray-900">{pet.name}</p>
                <p className="text-xs text-gray-500">{pet.breed}</p>
              </div>
            ))}
            <button 
              onClick={() => navigate("/pets")}
              className="flex min-w-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-transparent p-4 text-gray-400"
            >
              <Plus size={24} />
              <span className="mt-2 text-sm font-medium">Añadir</span>
            </button>
          </div>
        </div>

        {pastWalks.length > 0 && (
          <div className="mt-8">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="text-orange-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900">Estadísticas por Mascota</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {pets.map(pet => {
                const stats = petStats[pet.id] || { count: 0, totalCost: 0 };
                if (stats.count === 0) return null;
                return (
                  <div key={pet.id} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full bg-orange-100">
                        {pet.photos?.[0] ? (
                          <img src={pet.photos[0]} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-orange-400">
                            <Dog size={20} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{pet.name}</p>
                        <p className="text-xs text-gray-500">{pet.breed}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 border-t border-gray-50 pt-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Paseos</p>
                        <p className="text-lg font-bold text-gray-900">{stats.count}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pastWalks.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Historial de Paseos</h3>
            <div className="space-y-4">
              {pastWalks.map(walk => (
                <div 
                  key={walk.id} 
                  onClick={() => navigate(`/walk/${walk.id}`)}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm active:scale-[0.98]"
                >
                  <div className="flex -space-x-2">
                    {walk.petIds?.slice(0, 2).map(id => {
                      const pet = pets.find(p => p.id === id);
                      return (
                        <div key={id} className="h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-orange-100">
                          {pet?.photos?.[0] && <img src={pet.photos[0]} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      Paseo de {walk.petIds?.map(id => pets.find(p => p.id === id)?.name).join(", ")}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(walk.createdAt).toLocaleDateString()} • {walk.durationMinutes} min
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">{formatCurrency(walk.cost || 0)}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Pagado</p>
                    </div>
                    {!walk.rating && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setRatingWalk(walk);
                        }}
                        className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-bold text-orange-600 hover:bg-orange-200"
                      >
                        Calificar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {!activeWalk && (
        <button 
          onClick={() => setShowRequestModal(true)}
          className="fixed bottom-24 right-6 flex h-14 items-center gap-2 rounded-full bg-orange-500 px-6 text-white shadow-2xl transition-transform active:scale-95"
        >
          <Plus size={20} />
          <span className="font-bold">Solicitar un Paseo</span>
        </button>
      )}

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-6 pb-12"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold">Solicitar un Paseo</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-400">Cerrar</button>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-500 uppercase">Selecciona Mascotas</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {pets.map(pet => (
                  <button 
                    key={pet.id}
                    onClick={() => togglePetSelection(pet.id)}
                    className={`flex min-w-[100px] flex-col items-center rounded-2xl border-2 p-3 transition-all ${
                      selectedPetIds.includes(pet.id) 
                        ? "border-orange-500 bg-orange-50" 
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className={`mb-2 h-12 w-12 rounded-full ${selectedPetIds.includes(pet.id) ? "bg-orange-200" : "bg-gray-200"}`} />
                    <span className={`text-xs font-bold ${selectedPetIds.includes(pet.id) ? "text-orange-600" : "text-gray-500"}`}>
                      {pet.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-500 uppercase">Duración del Paseo</p>
              <div className="grid grid-cols-3 gap-3">
                {[20, 30, 60].map(mins => (
                  <button 
                    key={mins}
                    onClick={() => setDuration(mins as 20 | 30 | 60)}
                    className={`flex flex-col items-center rounded-xl py-3 text-sm font-bold transition-all ${
                      duration === mins 
                        ? "bg-orange-500 text-white shadow-md" 
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <span>{mins} min</span>
                    <span className={`text-[10px] ${duration === mins ? "text-orange-100" : "text-gray-400"}`}>
                      {formatCurrency(calculateWalkCost(mins))}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-500 uppercase">¿Cuándo será el paseo?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsScheduled(false)}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                    !isScheduled 
                      ? "bg-orange-500 text-white shadow-md" 
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Inmediato
                </button>
                <button 
                  onClick={() => setIsScheduled(true)}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
                    isScheduled 
                      ? "bg-orange-500 text-white shadow-md" 
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  Programado
                </button>
              </div>
              
              {isScheduled && (
                <div className="mt-4 flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-bold text-gray-700">Fecha</label>
                    <input 
                      type="date" 
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-xl border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-900 focus:border-orange-500 focus:ring-orange-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-bold text-gray-700">Hora</label>
                    <input 
                      type="time" 
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full rounded-xl border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-900 focus:border-orange-500 focus:ring-orange-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-500 uppercase">Dirección de Recogida</p>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <AddressAutocomplete 
                    defaultValue={pickupLocation.address !== "Ubicación seleccionada" ? pickupLocation.address : ""}
                    onPlaceSelect={(place) => {
                      if (place?.geometry?.location) {
                        setPickupLocation({
                          lat: place.geometry.location.lat(),
                          lng: place.geometry.location.lng(),
                          address: place.formatted_address || place.name || "Ubicación seleccionada"
                        });
                      }
                    }}
                    className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-900 focus:border-orange-500 focus:ring-orange-500 outline-none transition-colors"
                    placeholder="Escribe tu dirección..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.geolocation) {
                      toast.loading("Obteniendo ubicación...", { id: "location-toast" });
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          setPickupLocation({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            address: "Ubicación actual"
                          });
                          toast.success("Ubicación obtenida", { id: "location-toast" });
                        },
                        (error) => {
                          console.error("Error al obtener la ubicación:", error);
                          toast.error("No se pudo obtener la ubicación", { id: "location-toast" });
                        },
                        { enableHighAccuracy: true }
                      );
                    } else {
                      toast.error("Geolocalización no soportada por el navegador");
                    }
                  }}
                  className="flex flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 p-3 text-orange-600 hover:bg-orange-200 transition-colors"
                  title="Usar mi ubicación actual"
                >
                  <Navigation size={20} />
                </button>
              </div>

              <div className="h-40 w-full overflow-hidden rounded-2xl shadow-inner mt-2">
                <Map 
                  center={pickupLocation} 
                  markers={[{ ...pickupLocation, title: "Punto de Recogida", type: 'pickup' }]} 
                  onLocationSelect={(lat, lng) => setPickupLocation({ ...pickupLocation, lat, lng, address: "Ubicación en el mapa" })}
                />
              </div>
            </div>

            <div className="mb-6 space-y-4">
              <p className="text-sm font-medium text-gray-500 uppercase">Método de Pago</p>
              <div className="grid grid-cols-3 gap-3">
                {(['card', 'transfer', 'cash'] as const).map(method => (
                  <button 
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-xl py-3 text-xs font-bold transition-all ${
                      paymentMethod === method 
                        ? "bg-orange-500 text-white shadow-md" 
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {method === 'card' ? 'Tarjeta' : method === 'transfer' ? 'Transferencia' : 'Efectivo'}
                  </button>
                ))}
              </div>
              {paymentMethod === 'transfer' && (
                <div className="rounded-xl bg-blue-50 p-3 text-[10px] text-blue-700">
                  <p className="font-bold underline mb-1">Datos para transferencia:</p>
                  <p><span className="font-bold">Alias-C.I.:</span> 3649738</p>
                  <p><span className="font-bold">Numero de Cuenta:</span> 619134328</p>
                  <p><span className="font-bold">Banco:</span> Ueno Bank</p>
                  <p><span className="font-bold">Nombre:</span> Rodrigo Xifra</p>
                  <p className="mt-2 italic text-[9px]">* Envía el comprobante por chat al paseador para confirmar.</p>
                </div>
              )}
            </div>

            <button 
              onClick={handleRequestWalk}
              disabled={selectedPetIds.length === 0}
              className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
            >
              Confirmar Paseo
            </button>

            <p className="mt-6 text-center text-xs text-gray-400">
              Costo del servicio: {formatCurrency(1500)} por minuto de paseo solicitado.
            </p>
          </motion.div>
        </div>
      )}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <X size={32} />
            </div>
            <h3 className="mb-2 text-xl font-bold text-gray-900">¿Cancelar pedido?</h3>
            <p className="mb-6 text-sm text-gray-500">
              {activeWalk?.status === WalkStatus.IN_PROGRESS 
                ? "El paseo ya ha comenzado. ¿Estás seguro de que quieres cancelarlo ahora?" 
                : "¿Estás seguro de que quieres cancelar esta solicitud de paseo? No se te cobrará nada."}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600"
              >
                No, mantener
              </button>
              <button 
                onClick={handleCancelWalk}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-md active:scale-95"
              >
                Sí, cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {chatWalkId && (
          <WalkChat 
            walkId={chatWalkId}
            onClose={() => setChatWalkId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ratingWalk && (
          <PostWalkFeedback 
            walk={ratingWalk}
            onClose={() => setRatingWalk(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
