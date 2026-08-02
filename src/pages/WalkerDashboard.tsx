import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc } from "firebase/firestore";
import { auth, db, playNotificationSound } from "../firebase";
import { Walk, WalkStatus, UserProfile } from "../types";
import { signOut } from "firebase/auth";
import { MapPin, CheckCircle, Navigation, Clock, User as UserIcon, ShieldAlert, BellRing, X, LogOut, Sun, Moon, MessageCircle, Trash2, Camera, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Map from "../components/Map";
import WalkChat from "../components/WalkChat";
import { useNavigate } from "react-router-dom";
import { sendNotification } from "../services/notificationService";
import { toast } from "sonner";
import { formatCurrency, calculateWalkCost } from "../lib/utils";

export default function WalkerDashboard() {
  const navigate = useNavigate();
  const [availableWalks, setAvailableWalks] = useState<Walk[]>([]);
  const [availableWalkData, setAvailableWalkData] = useState<Record<string, { owner: UserProfile; pets: string[] }>>({});
  const [activeWalk, setActiveWalk] = useState<Walk | null>(null);
  const [pastJobs, setPastJobs] = useState<Walk[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState<string | null>(null);
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [newRequestAlert, setNewRequestAlert] = useState<Walk | null>(null);
  const [chatWalkId, setChatWalkId] = useState<string | null>(null);
  
  const prevWalkIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const lastUpdateRef = useRef<number>(0);

  // Sync location to active walk document
  useEffect(() => {
    if (!activeWalk || !currentLocation || activeWalk.status === WalkStatus.COMPLETED || activeWalk.status === WalkStatus.CANCELLED) return;

    const now = Date.now();
    // Update every 5 seconds for smoother real-time tracking
    if (now - lastUpdateRef.current > 5000) {
      const walkRef = doc(db, "walks", activeWalk.id);
      updateDoc(walkRef, {
        currentLocation: currentLocation
      }).catch(err => console.error("Error updating location in walk:", err));
      lastUpdateRef.current = now;
    }
  }, [currentLocation, activeWalk]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Get current location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error("Error getting location:", error);
          // Fallback to a default location if needed, or just leave as null
        }
      );

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error watching location:", error)
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen for walker profile
    const profileRef = doc(db, "users", auth.currentUser.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (snap) => {
      setProfile(snap.data() as UserProfile);
    });

    // Listen for available walks (requested status)
    const availableQuery = query(
      collection(db, "walks"),
      where("status", "==", WalkStatus.REQUESTED)
    );

    const unsubscribeAvailable = onSnapshot(availableQuery, async (snapshot) => {
      let walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      
      // Filter out walks where this walker was rejected by owner
      walks = walks.filter(w => !(w.rejectedWalkerIds || []).includes(auth.currentUser!.uid));
      
      // Detect new requests for alerts
      if (!isFirstLoad.current && profile?.isAvailable) {
        const newWalks = walks.filter(w => !prevWalkIds.current.has(w.id) && !(profile?.rejectedWalkIds || []).includes(w.id));
        if (newWalks.length > 0) {
          playNotificationSound();
          setNewRequestAlert(newWalks[0]);
          toast.info("¡Nueva solicitud de paseo disponible!", {
            description: "Revisa el panel para ver los detalles.",
            icon: <BellRing className="text-orange-500" />,
            duration: 5000
          });
        }
      }

      setAvailableWalks(walks);
      prevWalkIds.current = new Set(walks.map(w => w.id));
      isFirstLoad.current = false;
    });

    // Helper function to fetch walk details outside of onSnapshot to avoid blocking
    const fetchWalkDetails = async (walks: Walk[]) => {
      for (const walk of walks) {
        if (!availableWalkData[walk.id]) {
          try {
            const ownerSnap = await getDoc(doc(db, "users", walk.ownerId));
            const owner = ownerSnap.data() as UserProfile;
            const petNames: string[] = [];
            for (const petId of walk.petIds) {
              const petSnap = await getDoc(doc(db, "pets", petId));
              if (petSnap.exists()) {
                petNames.push(petSnap.data().name);
              }
            }
            setAvailableWalkData(prev => ({
              ...prev,
              [walk.id]: { owner, pets: petNames }
            }));
          } catch (err) {
            console.error("Error al obtener detalles del paseo:", err);
          }
        }
      }
    };

    // Separate effect for fetching details when availableWalks change
    fetchWalkDetails(availableWalks);

    // Listen for active walk assigned to this walker
    const activeQuery = query(
      collection(db, "walks"),
      where("walkerId", "==", auth.currentUser.uid),
      where("status", "in", [WalkStatus.PENDING_OWNER, WalkStatus.ACCEPTED, WalkStatus.IN_PROGRESS, WalkStatus.WALKER_ARRIVED])
    );

    let unsubscribeOwner: (() => void) | null = null;
    const unsubscribeActive = onSnapshot(activeQuery, (snapshot) => {
      const walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      const currentActive = walks[0] || null;
      setActiveWalk(currentActive);
      
      if (currentActive) {
        if (!ownerProfile || ownerProfile.uid !== currentActive.ownerId) {
          if (unsubscribeOwner) unsubscribeOwner();
          const ownerRef = doc(db, "users", currentActive.ownerId);
          unsubscribeOwner = onSnapshot(ownerRef, (snap) => {
            if (snap.exists()) {
              setOwnerProfile(snap.data() as UserProfile);
            }
          });
        }
      } else {
        if (unsubscribeOwner) unsubscribeOwner();
        unsubscribeOwner = null;
        setOwnerProfile(null);
      }
      
      setLoading(false);
    });

    // Listen for past jobs
    const pastQuery = query(
      collection(db, "walks"),
      where("walkerId", "==", auth.currentUser.uid),
      where("status", "==", WalkStatus.COMPLETED)
    );

    const unsubscribePast = onSnapshot(pastQuery, (snapshot) => {
      const walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      setPastJobs(walks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAvailable();
      unsubscribeActive();
      unsubscribePast();
      if (unsubscribeOwner) unsubscribeOwner();
    };
  }, []);

  const handleToggleAvailability = async () => {
    if (!auth.currentUser || !profile) return;
    const profileRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(profileRef, {
      isAvailable: !profile.isAvailable
    });
  };

  const handleAcceptWalk = async (walkId: string) => {
    if (!auth.currentUser) return;
    setIsAccepting(walkId);
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId,
          status: WalkStatus.PENDING_OWNER,
          walkerId: auth.currentUser.uid,
          walkerName: profile?.displayName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || "No se pudo aceptar el paseo.";
        throw new Error(errorMessage);
      }

      toast.success("¡Solicitud enviada! Esperando confirmación del dueño.");
    } catch (err: any) {
      console.error("Error accepting walk:", err);
      toast.error(err.message || "No se pudo aceptar el paseo. Tal vez ya fue tomado.");
    } finally {
      setIsAccepting(null);
    }
  };

  const handleStartWalk = async (walkId: string) => {
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId,
          status: WalkStatus.IN_PROGRESS,
          walkerName: profile?.displayName
        })
      });

      if (!response.ok) throw new Error("La llamada a la API falló");
      toast.success("¡Paseo iniciado!");
    } catch (err) {
      console.error("Error al iniciar el paseo:", err);
      toast.error("Error al iniciar paseo");
    }
  };

  const handleFinishWalk = async (walkId: string) => {
    if (!activeWalk) return;
    
    const endTime = new Date();
    const startTime = new Date(activeWalk.startTime!);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    const cost = calculateWalkCost(durationMinutes);

    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId,
          status: WalkStatus.COMPLETED,
          walkerName: profile?.displayName,
          cost,
          duration: durationMinutes
        })
      });

      if (!response.ok) throw new Error("La llamada a la API falló");
      toast.success("Paseo finalizado con éxito");
    } catch (err) {
      console.error("Error al finalizar el paseo:", err);
      toast.error("Error al finalizar paseo");
    }
  };

  const handleArrived = async (walkId: string) => {
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId,
          status: WalkStatus.WALKER_ARRIVED,
          walkerName: profile?.displayName
        })
      });

      if (!response.ok) throw new Error("La llamada a la API falló");
      toast.success("Notificación enviada al dueño");
    } catch (err) {
      console.error("Error al enviar notificación de llegada:", err);
      toast.error("Error al notificar llegada");
    }
  };

  const handleRejectWalk = async (walkId: string) => {
    if (!auth.currentUser || !profile) return;
    
    try {
      const profileRef = doc(db, "users", auth.currentUser.uid);
      const currentRejected = profile.rejectedWalkIds || [];
      if (!currentRejected.includes(walkId)) {
        await updateDoc(profileRef, {
          rejectedWalkIds: [...currentRejected, walkId]
        });
      }
      toast.info("Solicitud rechazada");
    } catch (err) {
      console.error("Error rejecting walk:", err);
      toast.error("Error al rechazar la solicitud");
    }
  };

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

  const isAdmin = auth.currentUser?.email?.toLowerCase() === "gamingwithglitch@gmail.com";
  const isAutoApproved = profile?.email?.toLowerCase() === "c.rodrigoxifra@gmail.com";
  const userIsApproved = profile?.isApproved || isAutoApproved;

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
              <p className="text-gray-500 dark:text-slate-400">Panel de Paseador</p>
            </div>
          </div>
          <button 
            onClick={handleToggleAvailability}
            disabled={!userIsApproved}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-all ${
              !userIsApproved ? "bg-red-50 text-red-400 cursor-not-allowed" :
              profile?.isAvailable ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
            }`}
          >
            {!userIsApproved ? "Pendiente" : profile?.isAvailable ? "En Línea" : "Desconectado"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-4">
        {!userIsApproved && (
          <div className="mb-6 rounded-2xl bg-red-50 p-6 text-center shadow-sm border border-red-100">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <ShieldAlert size={24} />
            </div>
            <h3 className="mb-1 font-bold text-red-900">Perfil en Revisión</h3>
            <p className="text-sm text-red-700">
              Tu perfil debe ser aprobado por un administrador antes de que puedas aceptar paseos. 
              Te notificaremos cuando estés listo.
            </p>
          </div>
        )}
        {activeWalk ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 shadow-md">
              <div className="mb-4 flex items-center justify-between">
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  activeWalk.status === WalkStatus.PENDING_OWNER ? "bg-yellow-100 text-yellow-600" :
                  activeWalk.status === WalkStatus.ACCEPTED ? "bg-blue-100 text-blue-600" :
                  activeWalk.status === WalkStatus.WALKER_ARRIVED ? "bg-orange-100 text-orange-600" :
                  "bg-green-100 text-green-600"
                }`}>
                  {activeWalk.status === WalkStatus.PENDING_OWNER ? "Esperando Confirmación" : 
                   activeWalk.status === WalkStatus.ACCEPTED ? "Paseo Aceptado" : 
                   activeWalk.status === WalkStatus.WALKER_ARRIVED ? "Paseador en la Puerta" : "En Paseo"}
                </span>
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock size={16} />
                  <span className="text-sm">Activo</span>
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-orange-100">
                    {ownerProfile?.photoURL ? (
                      <img src={ownerProfile.photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-orange-500">
                        <UserIcon size={32} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">Paseo para {activeWalk.petIds?.length || 0} mascota(s)</p>
                    <p className="text-sm text-gray-500">{activeWalk.durationOption} min • {activeWalk.pickupLocation?.address || 'Ubicación seleccionada'}</p>
                    {ownerProfile && (
                      <button 
                        onClick={() => navigate(`/profile/${ownerProfile.uid}`)}
                        className="mt-1 text-xs font-bold text-orange-500 hover:underline"
                      >
                        Dueño: {ownerProfile.displayName}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {activeWalk.status === WalkStatus.PENDING_OWNER ? (
                <div className="rounded-xl bg-yellow-50 p-6 text-center shadow-sm border border-yellow-100 dark:bg-yellow-900/10 dark:border-yellow-900/20">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30">
                    <Clock size={24} className="animate-pulse" />
                  </div>
                  <h3 className="mb-1 font-bold text-yellow-900 dark:text-yellow-100">Solicitud Enviada</h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    El dueño está revisando tu perfil. Te avisaremos en cuanto confirme el paseo.
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={() => setChatWalkId(activeWalk.id)}
                      className="flex-1 rounded-xl border-2 border-yellow-600/20 py-2 text-sm font-bold text-yellow-700 bg-yellow-600/5 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={16} />
                      Chat
                    </button>
                    <button 
                      onClick={() => navigate(`/walk/${activeWalk.id}?cancel=true`)}
                      className="flex-1 rounded-xl border-2 border-red-600/20 py-2 text-sm font-bold text-red-700 bg-red-600/5 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : activeWalk.status === WalkStatus.ACCEPTED ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700 dark:bg-blue-900/10 dark:text-blue-300">
                    <p className="font-bold text-xs uppercase mb-1">Instrucciones de Acceso:</p>
                    <p>Revisa los perfiles de las mascotas para ver las instrucciones de la caja de llaves o contacto.</p>
                  </div>
                  <button 
                    onClick={() => navigate(`/walk/${activeWalk.id}`)}
                    className="w-full rounded-xl border-2 border-slate-900 dark:border-white py-3 font-bold text-slate-900 dark:text-white active:scale-95 flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={18} />
                    Ver Paseo / Chat
                  </button>
                  <button 
                    onClick={() => handleArrived(activeWalk.id)}
                    className="w-full rounded-xl bg-orange-500 py-4 font-bold text-white shadow-lg active:scale-95"
                  >
                    Notificar Llegada
                  </button>
                </div>
              ) : activeWalk.status === WalkStatus.WALKER_ARRIVED ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/10 dark:text-green-300">
                    <p className="font-bold text-center">¡Estás en la ubicación! Pulsa abajo para comenzar el cronómetro del paseo.</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleArrived(activeWalk.id)}
                      className="flex-1 rounded-xl border-2 border-orange-500 py-3 text-sm font-bold text-orange-500 active:scale-95"
                    >
                      Notificar de nuevo
                    </button>
                    <button 
                      onClick={() => handleStartWalk(activeWalk.id)}
                      className="flex-[2] rounded-xl bg-green-600 py-4 font-bold text-white shadow-lg active:scale-95"
                    >
                      Comenzar Paseo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="h-48 w-full overflow-hidden rounded-xl bg-gray-100 shadow-inner">
                    <Map 
                      center={activeWalk.pickupLocation || { lat: -25.2866, lng: -57.6333 }} 
                      markers={activeWalk.pickupLocation ? [{ ...activeWalk.pickupLocation, title: "Recogida", type: 'pickup' }] : []} 
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setChatWalkId(activeWalk.id)}
                      className="flex-1 rounded-xl border-2 border-orange-500 py-4 font-bold text-orange-500 active:scale-95 text-center flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={18} />
                      Chat / Reporte
                    </button>
                    <button 
                      onClick={() => handleFinishWalk(activeWalk.id)}
                      className="flex-1 rounded-xl bg-green-500 py-4 font-bold text-white shadow-lg active:scale-95"
                    >
                      Finalizar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Paseos Disponibles</h3>
            </div>

            {userIsApproved ? (
              availableWalks.filter(w => !(profile?.rejectedWalkIds || []).includes(w.id)).length > 0 ? (
                <div className="space-y-4">
                  {availableWalks.filter(w => !(profile?.rejectedWalkIds || []).includes(w.id)).map(walk => (
                    <motion.div 
                      key={walk.id}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin size={16} className="text-orange-500" />
                          <span className="text-sm font-medium text-gray-600 truncate max-w-[200px]">{walk.pickupLocation?.address || 'Ubicación seleccionada'}</span>
                        </div>
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">{walk.durationOption} min</span>
                      </div>
                      
                      <div className="mb-4 h-32 w-full overflow-hidden rounded-xl bg-gray-100 shadow-inner">
                        <Map 
                          center={walk.pickupLocation || { lat: -25.2866, lng: -57.6333 }} 
                          markers={walk.pickupLocation ? [{ ...walk.pickupLocation, title: "Recogida", type: 'pickup' }] : []} 
                          readOnly 
                        />
                      </div>

                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-full bg-orange-100">
                          {availableWalkData[walk.id]?.owner.photoURL ? (
                            <img src={availableWalkData[walk.id].owner.photoURL} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-orange-500">
                              <UserIcon size={24} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{availableWalkData[walk.id]?.owner.displayName || "Dueño"}</p>
                          <p className="text-xs text-gray-500">
                            Mascotas: <span className="font-medium text-orange-600">{availableWalkData[walk.id]?.pets.join(", ") || "Cargando..."}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-green-600">{formatCurrency(calculateWalkCost(walk.durationOption))}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase">Pago Est.</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleRejectWalk(walk.id)}
                          className="flex-1 rounded-xl bg-gray-50 py-3 font-bold text-gray-400 active:scale-95 transition-colors hover:bg-gray-100"
                        >
                          Rechazar
                        </button>
                        <button 
                          onClick={() => handleAcceptWalk(walk.id)}
                          disabled={isAccepting !== null}
                          className="flex-[2] rounded-xl bg-orange-500 py-3 font-bold text-white shadow-md active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {isAccepting === walk.id ? "Aceptando..." : "Aceptar Paseo"}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                  <Navigation size={48} className="mb-4 opacity-20" />
                  <p>No hay paseos solicitados cerca de ti.</p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                <ShieldAlert size={48} className="mb-4 opacity-20" />
                <p>Tu cuenta aún no ha sido aprobada para ver trabajos.</p>
              </div>
            )}
          </div>
        )}

        {pastJobs.length > 0 && (
          <div className="mt-8 space-y-4 pb-20">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Resumen de Ganancias</h3>
            <div className="space-y-4">
              {pastJobs.map(job => (
                <div 
                  key={job.id} 
                  onClick={() => navigate(`/walk/${job.id}`)}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <CheckCircle size={24} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">
                      Paseo de {job.petIds?.length || 0} mascota(s)
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(job.createdAt).toLocaleDateString()} • {job.durationMinutes} min
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(job.cost || 0)}</p>
                    <p className="text-[10px] font-bold text-green-600 uppercase">Ganado</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {newRequestAlert && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="w-full max-w-sm overflow-hidden rounded-[32px] bg-white shadow-2xl"
            >
              <div className="relative h-32 bg-orange-500 p-6 text-white">
                <button 
                  onClick={() => setNewRequestAlert(null)}
                  className="absolute right-4 top-4 rounded-full bg-white/20 p-1 hover:bg-white/30"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-full bg-white/20">
                    <BellRing size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">¡Nuevo Paseo!</h3>
                    <p className="text-sm opacity-90">Alguien necesita un paseador cerca</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-6 flex items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-orange-100 ring-4 ring-orange-50">
                    {availableWalkData[newRequestAlert.id]?.owner.photoURL ? (
                      <img src={availableWalkData[newRequestAlert.id].owner.photoURL} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-orange-500">
                        <UserIcon size={32} />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{availableWalkData[newRequestAlert.id]?.owner.displayName || "Dueño"}</p>
                    <p className="text-sm text-gray-500">
                      {newRequestAlert.durationOption} min • {formatCurrency(calculateWalkCost(newRequestAlert.durationOption))}
                    </p>
                  </div>
                </div>

                <div className="mb-6 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <MapPin size={18} className="text-orange-500" />
                    <span className="truncate">{newRequestAlert.pickupLocation?.address || 'Ubicación seleccionada'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Clock size={18} className="text-orange-500" />
                    <span>Mascotas: {availableWalkData[newRequestAlert.id]?.pets.join(", ") || "Cargando..."}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      handleRejectWalk(newRequestAlert.id);
                      setNewRequestAlert(null);
                    }}
                    className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-500 active:scale-95"
                  >
                    Ignorar
                  </button>
                  <button 
                    onClick={() => {
                      handleAcceptWalk(newRequestAlert.id);
                      setNewRequestAlert(null);
                    }}
                    className="flex-[2] rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg active:scale-95"
                  >
                    Aceptar Ahora
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatWalkId && (
          <WalkChat 
            walkId={chatWalkId}
            onClose={() => setChatWalkId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
