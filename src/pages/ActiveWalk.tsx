import { useState, useEffect, useRef } from "react";
import React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { sendNotification } from "../services/notificationService";
import { doc, onSnapshot, updateDoc, collection, addDoc, query, where, orderBy, getDoc, getDocs } from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType, playNotificationSound } from "../firebase";
import { Walk, WalkStatus, Message, UserProfile, UserRole } from "../types";
import { MapPin, Clock, Camera, CheckCircle, Check, CheckCheck, Send, MessageCircle, Info, X, Droplets, Trash2, Footprints, User as UserIcon } from "lucide-react";
import Map from "../components/Map";
import WalkETA from "../components/WalkETA";
import PostWalkFeedback from "../components/PostWalkFeedback";
import WalkChat from "../components/WalkChat";
import { motion, AnimatePresence } from "motion/react";
import { formatCurrency, calculateWalkCost, getDistance } from "../lib/utils";

export default function ActiveWalk() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [walk, setWalk] = useState<Walk | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportPeed, setReportPeed] = useState(false);
  const [reportPooped, setReportPooped] = useState(false);
  const [reportWater, setReportWater] = useState(false);
  const [reportBehavior, setReportBehavior] = useState('Tranquilo');
  const [reportNotes, setReportNotes] = useState('');
  const [showArrivedAlert, setShowArrivedAlert] = useState(false);
  const [showOwnerArrivalAlert, setShowOwnerArrivalAlert] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [alarmTriggered, setAlarmTriggered] = useState(false);

  const isWalker = profile?.role === UserRole.WALKER;

  const elapsedTime = walk?.startTime 
    ? Math.floor((new Date().getTime() - new Date(walk.startTime).getTime()) / 60000)
    : 0;

  // GPS Tracking Simulation for Walker
  useEffect(() => {
    if (!id || !walk || walk.status !== WalkStatus.IN_PROGRESS || profile?.role !== UserRole.WALKER) return;

    const timer = setTimeout(async () => {
      const currentPos = walk.currentLocation || walk.pickupLocation || { lat: -25.2866, lng: -57.6333 };
      // Simulate small movement (approx 0.0001 degrees)
      const nextPos = {
        lat: currentPos.lat + (Math.random() - 0.5) * 0.0002,
        lng: currentPos.lng + (Math.random() - 0.5) * 0.0002,
      };

      const newPath = [...(walk.path || []), nextPos];
      
      try {
        await updateDoc(doc(db, "walks", id), {
          currentLocation: nextPos,
          path: newPath,
          "report.distanceMiles": (walk.report?.distanceMiles || 0) + 0.01 // Increment distance
        });
      } catch (error) {
        console.error("Error updating simulated location:", error);
      }
    }, 5000); // Every 5 seconds

    return () => clearTimeout(timer);
  }, [id, walk?.status, profile?.role, walk?.currentLocation, walk?.path, walk?.report?.distanceMiles]);

  useEffect(() => {
    if (!id) return;

    const walkRef = doc(db, "walks", id);
    let unsubscribeOther: (() => void) | null = null;
    let unsubscribeSelf: (() => void) | null = null;

    const unsubscribe = onSnapshot(walkRef, (snap) => {
      if (snap.exists()) {
        const walkData = { id: snap.id, ...snap.data() } as Walk;
        setWalk(walkData);
        
        if (!profile && auth.currentUser) {
          if (unsubscribeSelf) unsubscribeSelf();
          unsubscribeSelf = onSnapshot(doc(db, "users", auth.currentUser.uid), (userSnap) => {
            if (userSnap.exists()) {
              setProfile(userSnap.data() as UserProfile);
            }
          });
        }

        const otherId = auth.currentUser?.uid === walkData.ownerId ? walkData.walkerId : walkData.ownerId;
        if (otherId && (!otherProfile || otherProfile.uid !== otherId)) {
          if (unsubscribeOther) unsubscribeOther();
          const otherRef = doc(db, "users", otherId);
          unsubscribeOther = onSnapshot(otherRef, (otherSnap) => {
            if (otherSnap.exists()) {
              setOtherProfile(otherSnap.data() as UserProfile);
            }
          });
        }
      } else {
        navigate("/");
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `walks/${id}`);
    });

    return () => {
      unsubscribe();
      if (unsubscribeOther) unsubscribeOther();
      if (unsubscribeSelf) unsubscribeSelf();
    };
  }, [id, navigate, profile]);

  useEffect(() => {
    if (searchParams.get("chat") === "true") {
      setShowChat(true);
    }
    if (searchParams.get("cancel") === "true") {
      setShowCancelConfirm(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (walk?.status === WalkStatus.COMPLETED && profile?.role === UserRole.OWNER && !walk.rating) {
      setShowFeedback(true);
    }
  }, [walk?.status, profile?.role, walk?.rating]);

  // Alert owner when walker arrives
  useEffect(() => {
    if (walk?.walkerArrivedAt && profile?.role === UserRole.OWNER) {
      playNotificationSound();
      setShowOwnerArrivalAlert(true);
      const timer = setTimeout(() => setShowOwnerArrivalAlert(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [walk?.walkerArrivedAt, profile?.role]);

  // Alarm for walker when duration is reached
  useEffect(() => {
    if (isWalker && walk?.status === WalkStatus.IN_PROGRESS && elapsedTime >= walk.durationOption && !alarmTriggered) {
      setAlarmTriggered(true);
      playNotificationSound();
      toast.info("¡Tiempo cumplido! Es hora de devolver el perro a su dueño.", {
        duration: 10000,
        icon: "⏰"
      });
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    }
  }, [elapsedTime, walk?.durationOption, walk?.status, isWalker, alarmTriggered]);

  const [tempStartPhoto, setTempStartPhoto] = useState<string | null>(null);
  const [tempEndPhoto, setTempEndPhoto] = useState<string | null>(null);

  const handleTakePhoto = async (type: 'start' | 'end' | 'general') => {
    setIsUploadingPhoto(true);
    // Simulate camera delay
    setTimeout(async () => {
      const photoUrl = `https://picsum.photos/seed/${type}_${id}_${Math.random()}/800/800`;
      if (type === 'start') {
        setTempStartPhoto(photoUrl);
        toast.success("Foto de recogida capturada");
      } else if (type === 'end') {
        setTempEndPhoto(photoUrl);
        toast.success("Foto de entrega capturada");
      } else {
        const currentPhotos = walk?.report?.photos || [];
        await updateReport({ photos: [...currentPhotos, photoUrl] });
        toast.success("Foto del paseo guardada");
      }
      setIsUploadingPhoto(false);
    }, 1500);
  };

  const handleLogEvent = async (type: 'pee' | 'poop') => {
    if (!id || !walk || walk.status !== WalkStatus.IN_PROGRESS) return;
    
    const newEvent = { type, timestamp: new Date().toISOString() };
    const currentEvents = walk.events || [];
    const currentReport = walk.report || { peeCount: 0, poopCount: 0, photos: [], distanceMiles: 0, notes: "" };
    
    try {
      await updateDoc(doc(db, "walks", id), {
        events: [...currentEvents, newEvent],
        [`report.${type === 'pee' ? 'peeCount' : 'poopCount'}`]: (type === 'pee' ? currentReport.peeCount : currentReport.poopCount) + 1
      });
      toast.success(`¡${type === 'pee' ? 'Pipí' : 'Caca'} registrado!`);
      playNotificationSound();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `walks/${id}`);
    }
  };

  const updateReport = async (updates: Partial<NonNullable<Walk['report']>>) => {
    if (!id || !walk) return;
    const currentReport = walk.report || { peeCount: 0, poopCount: 0, photos: [], distanceMiles: 0, notes: "" };
    try {
      await updateDoc(doc(db, "walks", id), {
        report: { ...currentReport, ...updates }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `walks/${id}`);
    }
  };

  const handleArrived = async () => {
    if (!id || !walk || !auth.currentUser) return;
    setLoading(true);
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId: id,
          status: WalkStatus.WALKER_ARRIVED,
          walkerName: profile?.displayName
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "API call failed");
      }

      // Local update for immediate feedback
      setShowArrivedAlert(true);
      setTimeout(() => setShowArrivedAlert(false), 3000);
      toast.success("Has notificado tu llegada al dueño.");
    } catch (err) {
      console.error("Error sending arrival notification:", err);
      toast.error("Error al notificar llegada.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartWalk = async () => {
    if (!id || !walk || !auth.currentUser) return;
    
    setLoading(true);
    try {
      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId: id,
          status: WalkStatus.IN_PROGRESS,
          walkerName: profile?.displayName,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Error al iniciar el paseo.");
      }
    } catch (err) {
      console.error("Error al iniciar el paseo:", err);
      toast.error("Error al iniciar paseo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!id || !walk) return;

    setLoading(true);
    try {
      const finalDuration = elapsedTime;
      const finalCost = walk.estimatedCost || calculateWalkCost(walk.durationOption);

      // GPS Validation for Walker: Check if walker is near the pickup/delivery location
      if (profile?.role === UserRole.WALKER) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0
            });
          });

          const targetLat = walk.pickupLocation?.lat || -25.2866;
          const targetLng = walk.pickupLocation?.lng || -57.6333;
          
          const distance = getDistance(
            position.coords.latitude,
            position.coords.longitude,
            targetLat,
            targetLng
          );

          // Allow within 200 meters for safety in finalization
          if (distance > 0.2) {
            toast.error(`Estás demasiado lejos para finalizar (${(distance * 1000).toFixed(0)}m). Acércate al punto de entrega.`);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("GPS Verification failed:", err);
        }
      }

      const response = await fetch("/api/update-walk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId: id,
          status: WalkStatus.COMPLETED,
          walkerName: profile?.displayName,
          cost: finalCost,
          duration: finalDuration,
          petNames: walk.pets.map(p => p.name).join(", "),
          reportData: {
            peed: reportPeed,
            pooped: reportPooped,
            drankWater: reportWater,
            behavior: reportBehavior,
            notes: reportNotes
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Error al finalizar el paseo.");
      }

      // Create transaction for the walk
      await addDoc(collection(db, "transactions"), {
        walkId: id,
        userId: walk.ownerId,
        amount: finalCost,
        method: 'card', 
        status: 'completed',
        type: 'walk',
        createdAt: new Date().toISOString()
      });

      toast.success("¡Paseo finalizado con éxito! Reporte enviado.");
      navigate("/");
    } catch (err) {
      console.error("Error al finalizar el paseo:", err);
      toast.error("Error al finalizar paseo.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelWalk = async () => {
    if (!id || !walk || !auth.currentUser) return;

    try {
      await updateDoc(doc(db, "walks", id), {
        status: WalkStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancelledBy: auth.currentUser.uid
      });
      setShowCancelConfirm(false);

      const isWalkerCancelling = auth.currentUser.uid === walk.walkerId;
      const recipientId = isWalkerCancelling ? walk.ownerId : walk.walkerId;
      const cancelAuthor = isWalkerCancelling ? "El paseador" : "El dueño";

      if (recipientId) {
        await sendNotification({
          userId: recipientId,
          title: "Paseo Cancelado",
          body: `${cancelAuthor} ha cancelado el paseo.`,
          type: 'walk_cancelled',
          walkId: id
        });
      }

      // Notify admin
      const adminEmails = ["gamingwithglitch@gmail.com"];
      const adminQuery = query(collection(db, "users"), where("isAdmin", "==", true));
      const adminSnap = await getDocs(adminQuery);
      adminSnap.forEach(async (adminDoc) => {
        await sendNotification({
          userId: adminDoc.id,
          title: "Paseo Cancelado",
          body: `Un paseo ha sido cancelado por ${isWalkerCancelling ? "el paseador" : "el dueño"}.`,
          type: 'walk_cancelled',
          walkId: id
        });
      });

      // Ensure the specific admin email is notified even if not marked as isAdmin in DB
      for (const email of adminEmails) {
        const q = query(collection(db, "users"), where("email", "==", email));
        const snap = await getDocs(q);
        snap.forEach(async (adminDoc) => {
          // Check if already notified via isAdmin query
          const alreadyNotified = adminSnap.docs.some(d => d.id === adminDoc.id);
          if (!alreadyNotified) {
            await sendNotification({
              userId: adminDoc.id,
              title: "Paseo Cancelado",
              body: `Un paseo ha sido cancelado por ${isWalkerCancelling ? "el paseador" : "el dueño"}.`,
              type: 'walk_cancelled',
              walkId: id
            });
          }
        });
      }

      navigate("/");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `walks/${id}`);
    }
  };

  if (loading) return <div className="p-8 text-center bg-gray-50 dark:bg-slate-950 min-h-screen flex items-center justify-center font-bold text-gray-500">Cargando...</div>;
  if (!walk) return null;

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50 dark:bg-slate-950 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border-b overflow-hidden shrink-0">
        <img 
          src="/jaguata_banner.jpg" 
          alt="Jaguata" 
          className="w-full h-16 object-cover sm:h-24"
          referrerPolicy="no-referrer"
        />
      </div>
      <header className="bg-white dark:bg-slate-900 p-6 shadow-sm z-10 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-slate-400">
              <X size={24} />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Paseo en Vivo</h1>
          </div>
          <span className="rounded-full bg-orange-100 dark:bg-orange-950/40 px-3 py-1 text-xs font-bold text-orange-600 dark:text-orange-400 uppercase">
            {walk.status === WalkStatus.IN_PROGRESS ? "En Progreso" : 
             walk.status === WalkStatus.COMPLETED ? "Finalizado" : 
             walk.status === WalkStatus.WALKER_ARRIVED ? "Paseador Llegó" : "Aceptado"}
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {otherProfile && (
          <div 
            onClick={() => navigate(`/profile/${otherProfile.uid}`)}
            className="mb-6 flex items-center justify-between rounded-3xl bg-white dark:bg-slate-900 p-4 shadow-md active:scale-[0.98] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30">
                {otherProfile.photoURL ? (
                  <img src={otherProfile.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-orange-500">
                    <UserIcon size={24} />
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">
                  {otherProfile.uid === walk.walkerId ? "Paseador" : "Dueño"}
                </p>
                <p className="font-bold text-gray-900 dark:text-white">{otherProfile.displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-orange-500">
              <span className="text-xs font-bold">Ver Perfil</span>
              <Info size={16} />
            </div>
          </div>
        )}
        <div className="space-y-4">
          <AnimatePresence>
            {!showChat && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="relative mb-2 h-[40vh] w-full overflow-hidden rounded-3xl bg-gray-200 dark:bg-slate-800 shadow-inner">
                  <Map 
                    center={walk.currentLocation || walk.pickupLocation || { lat: -25.2866, lng: -57.6333 }} 
                    markers={[
                      ...(walk.pickupLocation ? [{ ...walk.pickupLocation, title: "Recogida", type: 'pickup' as const }] : []),
                      ...(walk.currentLocation ? [{ ...walk.currentLocation, title: "Paseador", type: 'walker' as const }] : [])
                    ]}
                    path={walk.path || []}
                    readOnly
                  />
                  {profile?.role === UserRole.OWNER && walk.status === WalkStatus.ACCEPTED && walk.currentLocation && walk.pickupLocation && (
                    <div className="absolute top-4 right-4">
                      <WalkETA origin={walk.currentLocation} destination={walk.pickupLocation} />
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/90 dark:bg-slate-900/90 p-3 shadow-xl backdrop-blur-sm">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Distancia</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{walk.report?.distanceMiles?.toFixed(2) || "0.00"} mi</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Costo Total Pactado</p>
                          <p className="text-sm font-black text-green-600 dark:text-green-400">{formatCurrency(walk.estimatedCost || calculateWalkCost(walk.durationOption))}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Duración</p>
                          <p className={`text-sm font-bold ${elapsedTime >= walk.durationOption ? 'text-red-500 animate-pulse' : 'text-gray-900 dark:text-white'}`}>
                            {elapsedTime} / {walk.durationOption} min
                          </p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((elapsedTime / walk.durationOption) * 100, 100)}%` }}
                          className={`h-full ${elapsedTime >= walk.durationOption ? 'bg-red-500' : 'bg-orange-500'}`}
                        />
                      </div>
                      {elapsedTime >= walk.durationOption && isWalker && (
                        <p className="text-[10px] font-bold text-red-500 text-center uppercase animate-bounce">
                          ¡Tiempo cumplido! Regresa con el dueño
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-md transition-colors">
            <h1 className="mb-4 text-sm font-bold text-gray-400 uppercase tracking-wider">Reporte de Paseo</h1>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button 
                onClick={() => isWalker && walk.status === WalkStatus.IN_PROGRESS && handleLogEvent('pee')}
                disabled={!isWalker || walk.status !== WalkStatus.IN_PROGRESS}
                className={`flex flex-col items-center justify-center rounded-2xl p-6 transition-all ${isWalker && walk.status === WalkStatus.IN_PROGRESS ? "bg-yellow-50 dark:bg-yellow-950/20 active:scale-95 border-2 border-yellow-200" : "bg-gray-50 dark:bg-slate-800 opacity-50"}`}
              >
                <Droplets size={32} className="mb-2 text-yellow-500" />
                <span className="text-xs font-black text-yellow-700 dark:text-yellow-500 uppercase">Hizo Pipí</span>
                <span className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{walk.report?.peeCount || 0}</span>
              </button>
              <button 
                onClick={() => isWalker && walk.status === WalkStatus.IN_PROGRESS && handleLogEvent('poop')}
                disabled={!isWalker || walk.status !== WalkStatus.IN_PROGRESS}
                className={`flex flex-col items-center justify-center rounded-2xl p-6 transition-all ${isWalker && walk.status === WalkStatus.IN_PROGRESS ? "bg-orange-50 dark:bg-orange-950/20 active:scale-95 border-2 border-orange-200" : "bg-gray-50 dark:bg-slate-800 opacity-50"}`}
              >
                <Trash2 size={32} className="mb-2 text-orange-700 dark:text-orange-500" />
                <span className="text-xs font-black text-orange-700 dark:text-orange-500 uppercase">Hizo Caca</span>
                <span className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{walk.report?.poopCount || 0}</span>
              </button>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-2xl">
              <div className="flex items-center gap-3">
                <Footprints size={20} className="text-blue-500" />
                <span className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase">Distancia Recorrida</span>
              </div>
              <span className="text-lg font-black text-gray-900 dark:text-white">{(walk.report?.distanceMiles || 0).toFixed(2)} mi</span>
            </div>
          </div>

          {walk.events && walk.events.length > 0 && (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-md transition-colors">
              <h3 className="mb-4 text-sm font-bold text-gray-400 uppercase tracking-wider">Historial de Eventos</h3>
              <div className="space-y-3">
                {walk.events.slice().reverse().map((event, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-gray-50 dark:border-slate-800 pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      {event.type === 'pee' ? (
                        <Droplets size={16} className="text-yellow-500" />
                      ) : (
                        <Trash2 size={16} className="text-orange-700" />
                      )}
                      <span className="text-sm font-bold text-gray-700 dark:text-slate-300">
                        {event.type === 'pee' ? 'Marcó Pipí' : 'Marcó Caca'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}



          {isWalker && walk.status === WalkStatus.PENDING_OWNER && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setShowChat(true)}
                className="w-full rounded-2xl bg-white border-2 border-slate-900 dark:border-white py-4 font-bold text-slate-900 dark:text-white shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={20} />
                Chat con el Dueño
              </button>
              <button 
                onClick={() => setShowCancelConfirm(true)}
                className="w-full rounded-2xl bg-red-50 dark:bg-red-950/20 py-4 font-bold text-red-600 dark:text-red-400 shadow-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/30"
              >
                <Trash2 size={20} />
                Cancelar Solicitud
              </button>
            </div>
          )}

          {isWalker && walk.status === WalkStatus.ACCEPTED && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleArrived}
                disabled={loading}
                className="w-full rounded-2xl bg-orange-500 py-5 font-black text-white shadow-lg shadow-orange-200 active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50"
              >
                <MapPin size={24} />
                HE LLEGADO A LA CASA
              </button>
              <button 
                onClick={() => setShowChat(true)}
                className="w-full rounded-2xl bg-white border-2 border-slate-900 dark:border-white py-4 font-bold text-slate-900 dark:text-white shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={20} />
                Chat con el Dueño
              </button>
              <button 
                onClick={() => setShowCancelConfirm(true)}
                className="w-full rounded-2xl bg-red-50 dark:bg-red-950/20 py-4 font-bold text-red-600 dark:text-red-400 shadow-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/30"
              >
                <Trash2 size={20} />
                Cancelar Paseo
              </button>
            </div>
          )}

          {isWalker && walk.status === WalkStatus.WALKER_ARRIVED && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleStartWalk}
                disabled={loading}
                className="w-full rounded-2xl bg-green-500 py-5 font-black text-white shadow-lg shadow-green-200 active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50"
              >
                <Footprints size={24} />
                COMENZAR PASEO
              </button>
              <button 
                onClick={handleArrived}
                disabled={loading}
                className="w-full rounded-2xl border-2 border-orange-500 py-4 font-bold text-orange-500 active:scale-95 flex items-center justify-center gap-2"
              >
                <MapPin size={20} />
                Notificar llegada de nuevo
              </button>
              <button 
                onClick={() => setShowChat(true)}
                className="w-full rounded-2xl bg-white border-2 border-slate-900 dark:border-white py-4 font-bold text-slate-900 dark:text-white shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={20} />
                Chat con el Dueño
              </button>
              <button 
                onClick={() => setShowCancelConfirm(true)}
                className="w-full rounded-2xl bg-red-50 dark:bg-red-950/20 py-4 font-bold text-red-600 dark:text-red-400 shadow-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/30"
              >
                <Trash2 size={20} />
                Cancelar Paseo
              </button>
            </div>
          )}

          {isWalker && walk.status === WalkStatus.IN_PROGRESS && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setShowConfirmFinish(true)}
                disabled={loading}
                className="w-full rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900 py-5 font-black text-white shadow-lg active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-50"
              >
                <CheckCircle size={24} />
                FINALIZAR PASEO
              </button>
              <button 
                onClick={() => setShowChat(true)}
                className="w-full rounded-2xl bg-white border-2 border-slate-900 dark:border-white py-4 font-bold text-slate-900 dark:text-white shadow-sm active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle size={20} />
                Chat con el Dueño
              </button>
            </div>
          )}

          {!isWalker && (walk.status === WalkStatus.ACCEPTED || walk.status === WalkStatus.REQUESTED || walk.status === WalkStatus.IN_PROGRESS || walk.status === WalkStatus.WALKER_ARRIVED) && (
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setShowChat(true)}
                className="w-full rounded-2xl bg-orange-500 py-5 font-black text-white shadow-lg active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
              >
                <MessageCircle size={24} />
                CHAT CON EL PASEADOR
              </button>
              <button 
                onClick={() => setShowCancelConfirm(true)}
                className="w-full rounded-2xl bg-red-50 dark:bg-red-950/20 py-4 font-bold text-red-600 dark:text-red-400 shadow-sm active:scale-95 flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/30"
              >
                <Trash2 size={20} />
                Cancelar Paseo
              </button>
            </div>
          )}
        </div>

        <button 
          onClick={() => setShowChat(true)}
          className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 dark:bg-slate-800 text-white shadow-2xl active:scale-90 transition-colors"
        >
          <MessageCircle size={24} />
        </button>

        <AnimatePresence>
          {isUploadingPhoto && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 text-white backdrop-blur-md"
            >
              <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
              <p className="text-xl font-bold">Registrando Foto de Seguridad</p>
              <p className="text-sm opacity-60">Protección Jaguata® activada</p>
            </motion.div>
          )}

          {showArrivedAlert && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-24 left-6 right-6 z-50 rounded-2xl bg-green-600 p-4 text-white shadow-2xl flex items-center gap-3"
            >
              <CheckCircle size={24} />
              <p className="text-sm font-bold">Notificación de llegada enviada al dueño.</p>
            </motion.div>
          )}

          {showOwnerArrivalAlert && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 100, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-0 left-6 right-6 z-50 rounded-2xl bg-orange-500 p-6 text-white shadow-2xl flex items-center gap-4 border-2 border-white/20"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <MapPin size={28} />
              </div>
              <div>
                <p className="text-lg font-bold">¡El paseador ha llegado!</p>
                <p className="text-sm opacity-90">{otherProfile?.displayName} está en la puerta.</p>
              </div>
            </motion.div>
          )}

          {showConfirmFinish && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm">
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="w-full max-w-md rounded-t-[32px] bg-white p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
              >
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-gray-900">Reporte del Paseo</h3>
                  <p className="text-sm text-gray-500">
                    Completa este breve reporte para el dueño.
                  </p>
                </div>

                <div className="space-y-4 mb-6 text-left">
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                    <span className="font-bold text-gray-700 text-sm">¿Hizo sus necesidades?</span>
                    <div className="flex gap-2">
                      <button onClick={() => setReportPeed(!reportPeed)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${reportPeed ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'}`}>Pipí</button>
                      <button onClick={() => setReportPooped(!reportPooped)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${reportPooped ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'}`}>Popó</button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                    <span className="font-bold text-gray-700 text-sm">¿Tomó agua?</span>
                    <button onClick={() => setReportWater(!reportWater)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${reportWater ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {reportWater ? 'Sí' : 'No'}
                    </button>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl">
                    <span className="font-bold text-gray-700 text-sm block mb-2">Comportamiento</span>
                    <div className="grid grid-cols-2 gap-2">
                      {['Tranquilo', 'Alegre', 'Muy activo', 'Asustado'].map(b => (
                        <button 
                          key={b}
                          onClick={() => setReportBehavior(b)}
                          className={`py-2 rounded-xl text-xs font-bold transition-colors ${reportBehavior === b ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl">
                    <span className="font-bold text-gray-700 text-sm block mb-2">Notas (opcional)</span>
                    <textarea 
                      value={reportNotes}
                      onChange={(e) => setReportNotes(e.target.value)}
                      placeholder="Escribe algo sobre el paseo..."
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleSubmitReport}
                    className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg active:scale-95"
                  >
                    Finalizar y Enviar
                  </button>
                  <button 
                    onClick={() => setShowConfirmFinish(false)}
                    className="w-full rounded-2xl bg-gray-100 py-4 font-bold text-gray-500 active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {showCancelConfirm && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm">
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="w-full max-w-md rounded-t-[32px] bg-white p-8 shadow-2xl"
              >
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <Trash2 size={32} />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-gray-900">¿Cancelar Paseo?</h3>
                  <p className="text-sm text-gray-500">
                    {walk.status === WalkStatus.IN_PROGRESS 
                      ? "El paseo ya está en curso. ¿Estás seguro de que deseas cancelarlo ahora?"
                      : "¿Estás seguro de que deseas cancelar este paseo?"}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleCancelWalk}
                    className="w-full rounded-2xl bg-red-600 py-4 font-bold text-white shadow-lg active:scale-95"
                  >
                    Sí, Cancelar Paseo
                  </button>
                  <button 
                    onClick={() => setShowCancelConfirm(false)}
                    className="w-full rounded-2xl bg-gray-100 py-4 font-bold text-gray-500 active:scale-95"
                  >
                    No, Mantener Paseo
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showFeedback && walk && (
          <PostWalkFeedback 
            walk={walk} 
            onClose={() => {
              setShowFeedback(false);
              navigate("/");
            }} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChat && (
          <WalkChat 
            walkId={id!}
            onClose={() => setShowChat(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
