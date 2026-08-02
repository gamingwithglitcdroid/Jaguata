import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, updateDoc, addDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Walk, WalkStatus, UserRole } from "../types";
import { Calendar, Clock, MapPin, DollarSign, ChevronDown, ChevronUp, Camera, FileText, Info, Heart, X, BarChart3 } from "lucide-react";
import { formatCurrency } from "../lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { sendNotification } from "../services/notificationService";
import PostWalkFeedback from "../components/PostWalkFeedback";

export default function WalkHistory() {
  const [walks, setWalks] = useState<Walk[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [expandedWalkId, setExpandedWalkId] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedWalk, setSelectedWalk] = useState<Walk | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role as UserRole);
        } else {
          // Fallback if no doc exists
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching role:", err);
        setLoading(false);
      }
    };
    fetchRole();
  }, [auth.currentUser]);

  useEffect(() => {
    if (!auth.currentUser || !role) return;

    const walksQuery = query(
      collection(db, "walks"),
      where(role === UserRole.WALKER ? "walkerId" : "ownerId", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(walksQuery, (snapshot) => {
      const walkList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      setWalks(walkList);
      setLoading(false);
    }, (error) => {
      console.error("Walks snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [role, auth.currentUser]);

  const toggleExpand = (id: string) => {
    setExpandedWalkId(expandedWalkId === id ? null : id);
  };

  const calculateStats = () => {
    const completedWalks = walks.filter(w => w.status === WalkStatus.COMPLETED);
    const totalKm = completedWalks.reduce((acc, w) => acc + (w.report?.distanceMiles || 0), 0);
    const totalMinutes = completedWalks.reduce((acc, w) => acc + (w.durationMinutes || 0), 0);
    const totalWalks = completedWalks.length;
    
    // Filter for current month
    const now = new Date();
    const currentMonthWalks = completedWalks.filter(w => {
      const walkDate = new Date(w.createdAt);
      return walkDate.getMonth() === now.getMonth() && walkDate.getFullYear() === now.getFullYear();
    });
    
    const monthKm = currentMonthWalks.reduce((acc, w) => acc + (w.report?.distanceMiles || 0), 0);
    const monthHours = currentMonthWalks.reduce((acc, w) => acc + (w.durationMinutes || 0), 0) / 60;

    return { totalKm, totalWalks, monthKm, monthHours, totalHours: totalMinutes / 60 };
  };

  const stats = calculateStats();

  if (loading) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="bg-white border-b overflow-hidden shrink-0">
        <img 
          src="/jaguata_banner.jpg" 
          alt="Jaguata" 
          className="w-full h-16 object-cover sm:h-24"
          referrerPolicy="no-referrer"
        />
      </div>
      <header className="bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Historial de Paseos</h1>
      </header>

      <main className="flex-1 p-4">
        {role === UserRole.OWNER && walks.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="col-span-2 rounded-2xl bg-orange-500 p-6 shadow-lg shadow-orange-100 text-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-orange-100 uppercase text-xs tracking-widest">Estadísticas del Mes</h3>
                <BarChart3 size={20} className="text-orange-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xl font-black">{stats.monthKm.toFixed(1)}</p>
                  <p className="text-[10px] font-bold text-orange-200 uppercase">Km Recorridos</p>
                </div>
                <div>
                  <p className="text-3xl font-black">{stats.monthHours.toFixed(1)}</p>
                  <p className="text-[10px] font-bold text-orange-200 uppercase">Horas de Aventura</p>
                </div>
              </div>
            </div>
            
            <div className="rounded-2xl bg-white p-4 shadow-md border border-gray-100">
              <p className="text-sm font-bold text-gray-400">Total Paseos</p>
              <p className="text-2xl font-black text-gray-900">{stats.totalWalks}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-md border border-gray-100">
              <p className="text-sm font-bold text-gray-400">Acumulado</p>
              <p className="text-2xl font-black text-gray-900">{stats.totalKm.toFixed(1)} km</p>
            </div>
          </div>
        )}

        {walks.length > 0 ? (
          <div className="space-y-4">
            {walks.map(walk => (
              <div key={walk.id} className="rounded-2xl bg-white p-6 shadow-md">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Calendar size={16} />
                    <span className="text-sm font-medium">
                      {format(new Date(walk.createdAt), "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                    walk.status === WalkStatus.COMPLETED ? "bg-green-100 text-green-600" : 
                    walk.status === WalkStatus.CANCELLED ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-600"
                  }`}>
                    {walk.status === WalkStatus.COMPLETED ? "Completado" : 
                     walk.status === WalkStatus.CANCELLED ? "Cancelado" : "Pendiente"}
                  </span>
                </div>

                <div className="mb-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-orange-100 p-2 text-orange-500">
                    <MapPin size={32} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{walk.pickupLocation?.address || 'Ubicación seleccionada'}</p>
                    <p className="text-xs text-gray-500">{walk.petIds.length} mascota(s)</p>
                  </div>
                </div>

                {walk.status === WalkStatus.COMPLETED && (
                  <>
                    <div className="grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-sm font-bold">{walk.durationMinutes} min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-gray-400" />
                        <span className="text-sm font-bold">{formatCurrency(walk.cost || 0)}</span>
                      </div>
                    </div>

                    {walk.rating && (
                      <div className="mt-3 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Heart 
                            key={star} 
                            size={14} 
                            className={`${star <= walk.rating! ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} 
                          />
                        ))}
                      </div>
                    )}

                    {walk.tipAmount ? (
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-orange-50 p-3 border border-orange-100">
                        <div className="flex items-center gap-2 text-orange-600">
                          <Heart size={16} fill="currentColor" />
                          <span className="text-xs font-bold uppercase">Propina enviada</span>
                        </div>
                        <span className="text-sm font-bold text-orange-700">{formatCurrency(walk.tipAmount)}</span>
                      </div>
                    ) : role === UserRole.OWNER && (
                      <button 
                        onClick={() => {
                          setSelectedWalk(walk);
                          setShowFeedbackModal(true);
                        }}
                        className="mt-3 w-full rounded-xl border-2 border-orange-500 py-2 text-sm font-bold text-orange-500 active:bg-orange-50 transition-all flex items-center justify-center gap-2"
                      >
                        <Heart size={16} />
                        {walk.rating ? "Dar Propina" : "Calificar y Dar Propina"}
                      </button>
                    )}

                    {walk.report && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <FileText size={14} />
                              <span>Reporte listo</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => toggleExpand(walk.id)}
                            className="flex items-center gap-1 text-xs font-bold text-orange-500 hover:text-orange-600"
                          >
                            {expandedWalkId === walk.id ? (
                              <>Ver menos <ChevronUp size={14} /></>
                            ) : (
                              <>Ver reporte <ChevronDown size={14} /></>
                            )}
                          </button>
                        </div>

                        <AnimatePresence>
                          {expandedWalkId === walk.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 space-y-4">
                                {walk.report.aiSummary && (
                                  <div className="rounded-xl bg-orange-50 p-4 border border-orange-100">
                                    <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-wider">
                                      <Info size={14} /> Resumen de Jaguak AI
                                    </h4>
                                    <p className="text-sm text-gray-700 italic">
                                      "{walk.report.aiSummary}"
                                    </p>
                                  </div>
                                )}
                                
                                <div className="rounded-xl bg-gray-50 p-4">
                                  <h4 className="mb-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Detalles
                                  </h4>
                                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                                    <div className="flex justify-between">
                                      <span className="font-medium">Hizo Pipí:</span>
                                      <span className="font-bold">{walk.report.peed ? 'Sí' : 'No'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="font-medium">Hizo Popó:</span>
                                      <span className="font-bold">{walk.report.pooped ? 'Sí' : 'No'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="font-medium">Tomó Agua:</span>
                                      <span className="font-bold">{walk.report.drankWater ? 'Sí' : 'No'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="font-medium">Actitud:</span>
                                      <span className="font-bold">{walk.report.behavior}</span>
                                    </div>
                                  </div>
                                </div>

                                {walk.report.notes && (
                                  <div>
                                    <h4 className="mb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Notas del Paseador</h4>
                                    <p className="text-sm text-gray-600 leading-relaxed bg-white border border-gray-100 p-3 rounded-lg">"{walk.report.notes}"</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
            <Calendar size={64} className="mb-4 opacity-20" />
            <p>Aún no tienes paseos registrados.</p>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showFeedbackModal && selectedWalk && (
          <PostWalkFeedback 
            walk={selectedWalk}
            onClose={() => {
              setShowFeedbackModal(false);
              setSelectedWalk(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
