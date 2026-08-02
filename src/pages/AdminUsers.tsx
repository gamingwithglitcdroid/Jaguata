import { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, updateDoc, doc, where, getDocs, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { UserProfile, UserRole, Walk, WalkStatus } from "../types";
import { User, Mail, Calendar, Shield, ArrowLeft, CheckCircle, XCircle, Database, Trash2, DollarSign, TrendingUp, Sun, Moon, ShieldCheck, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { sendNotification } from "../services/notificationService";
import { toast } from "sonner";
import { formatCurrency } from "../lib/utils";

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allWalks, setAllWalks] = useState<Walk[]>([]);
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") as UserRole | 'PENDING' | 'WALKS' || UserRole.OWNER;
  const [activeTab, setActiveTab] = useState<UserRole | 'PENDING' | 'WALKS'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isUpdatingTheme, setIsUpdatingTheme] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [sensitiveData, setSensitiveData] = useState<any>(null);
  const [selectedWalk, setSelectedWalk] = useState<Walk | null>(null);
  const [pastJobs, setPastJobs] = useState<Walk[]>([]);
  const [confirmReject, setConfirmReject] = useState<{ uid: string, role: UserRole } | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<{ uid: string, displayName: string } | null>(null);
  const [suspensionData, setSuspensionData] = useState<{ uid: string, displayName: string } | null>(null);
  const [suspensionForm, setSuspensionForm] = useState({ reason: "", duration: "7" });
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSensitiveData = async () => {
      if (selectedUser && selectedUser.role === UserRole.WALKER) {
        try {
          const sensitiveRef = doc(db, "users", selectedUser.uid, "private_data", "identity");
          const sensitiveSnap = await getDoc(sensitiveRef);
          if (sensitiveSnap.exists()) {
            setSensitiveData(sensitiveSnap.data());
          } else {
            setSensitiveData(null);
          }
        } catch (err) {
          console.error("Error fetching sensitive data:", err);
          setSensitiveData(null);
        }
      } else {
        setSensitiveData(null);
      }
    };

    fetchSensitiveData();
  }, [selectedUser]);

  const handleSeedWalkers = async () => {
    setIsSeeding(true);
    const dummyWalkers = [
      {
        uid: "dummy_walker_1",
        displayName: "Carlos Pérez",
        email: "carlos.test@example.com",
        role: UserRole.WALKER,
        bio: "Amante de los perros con 5 años de experiencia. Especialista en razas grandes.",
        address: "Av. Santa Fe 1234, CABA",
        isApproved: false,
        isAvailable: false,
        age: 32,
        experience: "5 años de experiencia. Especialista en razas grandes.",
        createdAt: new Date().toISOString(),
      },
      {
        uid: "dummy_walker_2",
        displayName: "Lucía Fernández",
        email: "lucia.test@example.com",
        role: UserRole.WALKER,
        bio: "Estudiante de veterinaria. Me encanta pasar tiempo al aire libre con mascotas.",
        address: "Calle Florida 567, CABA",
        isApproved: false,
        isAvailable: false,
        age: 24,
        experience: "Estudiante de veterinaria. 2 años paseando perros.",
        createdAt: new Date().toISOString(),
      },
      {
        uid: "dummy_walker_3",
        displayName: "Roberto Gómez",
        email: "roberto.test@example.com",
        role: UserRole.WALKER,
        bio: "Entrenador canino certificado. Paciente y dedicado.",
        address: "Av. Rivadavia 8901, CABA",
        isApproved: false,
        isAvailable: false,
        age: 45,
        experience: "Entrenador canino certificado. 10 años de experiencia.",
        createdAt: new Date().toISOString(),
      }
    ];

    try {
      for (const walker of dummyWalkers) {
        // Add to users collection
        await setDoc(doc(db, "users", walker.uid), walker);
        // Add to walkers collection
        await setDoc(doc(db, "walkers", walker.uid), walker);
      }
      toast.success("Paseadores ficticios creados con éxito");
    } catch (err) {
      console.error("Error seeding walkers:", err);
      toast.error("Error al crear paseadores ficticios");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteDummyWalkers = async () => {
    setIsSeeding(true);
    const dummyIds = ["dummy_walker_1", "dummy_walker_2", "dummy_walker_3"];
    try {
      for (const id of dummyIds) {
        await deleteDoc(doc(db, "users", id));
        await deleteDoc(doc(db, "walkers", id));
      }
      toast.success("Paseadores ficticios eliminados");
    } catch (err) {
      console.error("Error deleting dummy walkers:", err);
      toast.error("Error al eliminar datos de prueba");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleApproval = async (uid: string, currentStatus: boolean, role: UserRole) => {
    try {
      const updates: any = {
        isApproved: !currentStatus
      };

      // If approving, also set KYC to verified if it was pending or manual_pending
      const userDoc = users.find(u => u.uid === uid);
      if (!currentStatus && (userDoc?.ciVerificationStatus === 'pending' || userDoc?.ciVerificationStatus === 'manual_pending')) {
        updates.ciVerificationStatus = 'verified';
      }

      // Update registry
      await updateDoc(doc(db, "users", uid), updates);
      
      // Update specialized collection
      const collectionName = role === UserRole.OWNER ? "owners" : "walkers";
      await updateDoc(doc(db, collectionName, uid), updates);

      // Notify user
      if (!currentStatus) {
        await sendNotification({
          userId: uid,
          title: "¡Tu cuenta ha sido aprobada!",
          body: "Tu solicitud ha sido aprobada. Ahora puedes empezar a aceptar paseos.",
          type: 'walker_approved'
        });
        toast.success("Usuario aprobado y notificado");
      } else {
        toast.info("Aprobación removida");
      }
    } catch (err) {
      console.error("Error updating approval status:", err);
      toast.error("Error al actualizar el estado");
    }
  };

  const handleRejectUser = async (uid: string, role: UserRole) => {
    console.log("Rejecting user:", uid, role);
    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      });

      if (!response.ok) throw new Error("Error al eliminar cuenta en Auth");

      // First delete from specialized collection (walkers/owners)
      const collectionName = role === UserRole.OWNER ? "owners" : "walkers";
      await deleteDoc(doc(db, collectionName, uid));
      
      // Then delete from main users collection
      await deleteDoc(doc(db, "users", uid));
      
      toast.success("Solicitud rechazada y perfil eliminado");
      setSelectedUser(null);
      setConfirmReject(null);
    } catch (err) {
      console.error("Error rejecting user:", err);
      toast.error("Error al rechazar el usuario");
    }
  };

  const handleAdminDeleteAccount = async (uid: string) => {
    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid })
      });

      if (!response.ok) throw new Error("Error al eliminar cuenta en Auth");

      // Delete from specialized collections if they exist
      await deleteDoc(doc(db, "walkers", uid)).catch(() => {});
      await deleteDoc(doc(db, "owners", uid)).catch(() => {});
      await deleteDoc(doc(db, "users", uid));

      toast.success("Cuenta de usuario eliminada permanentemente");
      setSelectedUser(null);
      setConfirmDeleteAccount(null);
    } catch (err) {
      console.error("Error deleting user account:", err);
      toast.error("Error al eliminar la cuenta");
    }
  };

  const handleSuspendUser = async () => {
    if (!suspensionData) return;
    if (!suspensionForm.reason) {
      toast.error("Por favor ingresa un motivo");
      return;
    }

    try {
      const res = await fetch("/api/admin/suspend-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: suspensionData.uid,
          reason: suspensionForm.reason,
          durationDays: parseInt(suspensionForm.duration)
        })
      });

      if (!res.ok) throw new Error("Error al suspender usuario");

      toast.success(`Usuario ${suspensionData.displayName} suspendido`);
      setSuspensionData(null);
      setSuspensionForm({ reason: "", duration: "7" });
      setSelectedUser(null);
    } catch (err) {
      console.error("Error suspending user:", err);
      toast.error("Error al suspender al usuario");
    }
  };

  const handleUnsuspendUser = async (uid: string, displayName: string) => {
    try {
      const res = await fetch("/api/admin/suspend-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          unsuspend: true
        })
      });

      if (!res.ok) throw new Error("Error al levantar suspensión");

      toast.success(`Suspensión levatada para ${displayName}`);
      setSelectedUser(null);
    } catch (err) {
      console.error("Error unsuspending user:", err);
      toast.error("Error al levantar suspensión");
    }
  };

  const handleCancelWalk = async (walkId: string) => {
    try {
      const walkRef = doc(db, "walks", walkId);
      const walkSnap = await getDoc(walkRef);
      const walkData = walkSnap.data() as Walk;

      await updateDoc(walkRef, {
        status: WalkStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancelledBy: "admin"
      });

      // Notify owner
      await sendNotification({
        userId: walkData.ownerId,
        title: "Paseo Cancelado por Admin",
        body: "Un administrador ha cancelado el paseo.",
        type: 'walk_cancelled',
        walkId: walkId
      });

      // Notify walker if assigned
      if (walkData.walkerId) {
        await sendNotification({
          userId: walkData.walkerId,
          title: "Paseo Cancelado por Admin",
          body: "Un administrador ha cancelado el paseo.",
          type: 'walk_cancelled',
          walkId: walkId
        });
      }

      // Notify other admins
      const adminEmails = ["gamingwithglitch@gmail.com"];
      const adminQuery = query(collection(db, "users"), where("isAdmin", "==", true));
      const adminSnap = await getDocs(adminQuery);
      adminSnap.forEach(async (adminDoc) => {
        await sendNotification({
          userId: adminDoc.id,
          title: "Paseo Cancelado",
          body: `Un administrador ha cancelado un paseo.`,
          type: 'walk_cancelled',
          walkId: walkId
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
              body: `Un administrador ha cancelado un paseo.`,
              type: 'walk_cancelled',
              walkId: walkId
            });
          }
        });
      }

      toast.success("Paseo cancelado y notificado");
      setSelectedWalk(null);
      setConfirmCancel(null);
    } catch (err) {
      console.error("Error cancelling walk:", err);
      toast.error("Error al cancelar el paseo");
    }
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === 'PENDING' || tab === 'WALKS' || tab === UserRole.OWNER || tab === UserRole.WALKER)) {
      setActiveTab(tab as UserRole | 'PENDING' | 'WALKS');
    }
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    // Track if we've received at least one update for users
    let usersLoaded = false;
    
    const usersQuery = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const userList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      // Sort in memory to avoid index requirements
      const sortedUsers = userList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUsers(sortedUsers);
      usersLoaded = true;
      // If we are on a tab that only needs users, we can stop loading early
      if (activeTab === UserRole.OWNER || activeTab === UserRole.WALKER || activeTab === 'PENDING') {
        setLoading(false);
      }
    }, (error) => {
      console.error("AdminUsers snapshot error (users):", error);
      toast.error("Error al cargar usuarios");
      setLoading(false);
    });

    const walksQuery = query(collection(db, "walks"));
    const unsubscribeWalks = onSnapshot(walksQuery, (snapshot) => {
      const walkList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      // Sort in memory
      const sortedWalks = walkList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllWalks(sortedWalks);
      // Only set loading to false if users have also loaded at least once
      if (usersLoaded) {
        setLoading(false);
      }
    }, (error) => {
      console.error("AdminUsers snapshot error (walks):", error);
      // Still set loading to false so the user can at least see the users
      if (usersLoaded) {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeWalks();
    };
  }, [activeTab]);

  useEffect(() => {
    const pastQuery = query(
      collection(db, "walks"),
      where("status", "==", WalkStatus.COMPLETED)
    );

    const unsubscribe = onSnapshot(pastQuery, (snapshot) => {
      const walks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Walk));
      setPastJobs(walks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });

    const unsubscribeProfile = onSnapshot(doc(db, "users", auth.currentUser!.uid), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeProfile();
    };
  }, []);

  const totalEarnings = pastJobs.reduce((sum, job) => sum + (job.cost || 0), 0);
  const thisMonthEarnings = pastJobs
    .filter(job => {
      const jobDate = new Date(job.createdAt);
      const now = new Date();
      return jobDate.getMonth() === now.getMonth() && jobDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, job) => sum + (job.cost || 0), 0);

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

  if (loading) return <div className="p-8 text-center">Cargando usuarios...</div>;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="bg-white p-6 shadow-sm flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-orange-500 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
        <div className="flex-1" />
        <button 
          onClick={toggleTheme}
          disabled={isUpdatingTheme}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-all active:scale-95 dark:bg-slate-800 dark:text-slate-400 mr-2"
          title="Cambiar tema"
        >
          {profile?.theme === 'dark' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} />}
        </button>
        <button 
          onClick={handleSeedWalkers}
          disabled={isSeeding}
          className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 transition-all hover:bg-gray-200 active:scale-95 disabled:opacity-50"
        >
          <Database size={18} />
          {isSeeding ? "Creando..." : "Sembrar Datos"}
        </button>
        <button 
          onClick={handleDeleteDummyWalkers}
          disabled={isSeeding}
          className="flex items-center justify-center rounded-xl bg-red-50 p-2 text-red-500 transition-all hover:bg-red-100 active:scale-95 disabled:opacity-50"
          title="Eliminar datos de prueba"
        >
          <Trash2 size={18} />
        </button>
      </header>

      <main className="flex-1 p-4">
        <div className="mb-6 grid grid-cols-2 gap-4">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-3xl bg-orange-500 p-6 text-white shadow-lg shadow-orange-200"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <DollarSign size={16} />
            </div>
            <p className="text-xs font-medium opacity-80">Total Plataforma</p>
            <h2 className="text-2xl font-bold">{formatCurrency(totalEarnings)}</h2>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold">
              <TrendingUp size={12} />
              <span>+12% vs mes anterior</span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl bg-white p-6 shadow-sm border border-gray-100"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-500">
              <Calendar size={16} />
            </div>
            <p className="text-xs font-medium text-gray-500">Este Mes</p>
            <h2 className="text-2xl font-bold text-gray-900">{formatCurrency(thisMonthEarnings)}</h2>
            <p className="mt-1 text-[10px] text-gray-400">{pastJobs.filter(j => {
              const d = new Date(j.createdAt);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length} paseos</p>
          </motion.div>
        </div>

        <div className="mb-6 flex gap-2 rounded-2xl bg-white p-1 shadow-sm">
          <button 
            onClick={() => setActiveTab(UserRole.OWNER)}
            className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
              activeTab === UserRole.OWNER 
                ? "bg-orange-500 text-white shadow-md" 
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Dueños
          </button>
          <button 
            onClick={() => setActiveTab(UserRole.WALKER)}
            className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
              activeTab === UserRole.WALKER 
                ? "bg-orange-500 text-white shadow-md" 
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Paseadores
          </button>
          <button 
            onClick={() => setActiveTab('PENDING')}
            className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
              activeTab === 'PENDING' 
                ? "bg-orange-500 text-white shadow-md" 
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Pendientes
          </button>
          <button 
            onClick={() => setActiveTab('WALKS')}
            className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
              activeTab === 'WALKS' 
                ? "bg-orange-500 text-white shadow-md" 
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            Paseos
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-md">
          <div className="overflow-x-auto">
            {activeTab === 'WALKS' ? (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Paseo</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Dueño / Paseador</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allWalks.map((walk) => {
                    const owner = users.find(u => u.uid === walk.ownerId);
                    const walker = users.find(u => u.uid === walk.walkerId);
                    return (
                      <motion.tr 
                        key={walk.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold text-gray-900">Paseo {walk.durationOption} min</p>
                            <p className="text-xs text-gray-400 truncate max-w-[150px]">{walk.pickupLocation?.address || 'Ubicación seleccionada'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-block rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                            walk.status === WalkStatus.COMPLETED ? "bg-green-100 text-green-600" :
                            walk.status === WalkStatus.CANCELLED ? "bg-red-100 text-red-600" :
                            walk.status === WalkStatus.IN_PROGRESS ? "bg-blue-100 text-blue-600" :
                            "bg-orange-100 text-orange-600"
                          }`}>
                            {walk.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs">
                            <p><span className="text-gray-400">D:</span> {owner?.displayName || "Desconocido"}</p>
                            <p><span className="text-gray-400">P:</span> {walker?.displayName || "No asignado"}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(walk.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => navigate(`/walk/${walk.id}`)}
                              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200"
                            >
                              Ver
                            </button>
                            {(walk.status === WalkStatus.REQUESTED || walk.status === WalkStatus.ACCEPTED || walk.status === WalkStatus.IN_PROGRESS) && (
                              <button 
                                onClick={() => setConfirmCancel(walk.id)}
                                className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-200"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Usuario</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Email</th>
                  {(activeTab === UserRole.WALKER || activeTab === 'PENDING') && (
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Aprobación</th>
                  )}
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Registro</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.filter(u => {
                  if (activeTab === 'PENDING') {
                    return u.role === UserRole.WALKER && !u.isApproved;
                  }
                  return u.role === activeTab;
                }).map((user) => (
                  <motion.tr 
                    key={user.uid}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 overflow-hidden">
                          {user.photoURL ? (
                            <img src={user.photoURL} alt={user.displayName} className="h-full w-full object-cover" />
                          ) : (
                            <User size={20} />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 flex items-center gap-1">
                            {user.displayName}
                            {user.isAdmin && <Shield size={12} className="text-orange-500" />}
                          </p>
                          <p className="text-xs text-gray-400">ID: {user.uid.substring(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail size={14} className="text-gray-400" />
                        {user.email}
                      </div>
                    </td>
                    {(activeTab === UserRole.WALKER || activeTab === 'PENDING') && (
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => handleToggleApproval(user.uid, !!user.isApproved, user.role)}
                          className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                            user.isApproved 
                              ? "bg-green-100 text-green-600 hover:bg-green-200" 
                              : "bg-red-100 text-red-600 hover:bg-red-200"
                          }`}
                        >
                          {user.isApproved ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {user.isApproved ? "Aprobado" : "Pendiente"}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar size={14} className="text-gray-400" />
                        {new Date(user.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setSelectedUser(user)}
                          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200"
                        >
                          Ver Detalles
                        </button>
                        {activeTab === 'PENDING' && (
                          <>
                            <button 
                              onClick={() => handleToggleApproval(user.uid, false, user.role)}
                              className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-bold text-green-600 transition-colors hover:bg-green-200"
                            >
                              Aprobar
                            </button>
                            <button 
                              onClick={() => setConfirmReject({ uid: user.uid, role: user.role })}
                              className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-200"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Total: {users.filter(u => {
              if (activeTab === 'PENDING') return u.role === UserRole.WALKER && !u.isApproved;
              return u.role === activeTab;
            }).length} {activeTab === UserRole.OWNER ? 'dueños' : activeTab === 'PENDING' ? 'paseadores pendientes' : 'paseadores'} registrados
          </p>
        </div>

        {selectedUser && (
          <div className="fixed inset-0 z-50 flex justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto items-start sm:items-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-md rounded-3xl bg-white shadow-2xl my-auto overflow-hidden"
            >
              <div className="bg-orange-500 p-6 text-white">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-white shadow-md">
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-orange-500">
                        <User size={40} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{selectedUser.displayName}</h2>
                    <p className="text-orange-100 text-sm">{selectedUser.email}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Biografía</h3>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-xl text-sm leading-relaxed italic">
                    {selectedUser.bio || "No se ha proporcionado biografía."}
                  </p>
                </div>

                {selectedUser.role === UserRole.WALKER && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Experiencia</h3>
                    <p className="text-gray-700 bg-gray-50 p-4 rounded-xl text-sm leading-relaxed">
                      {selectedUser.experience || "No se ha proporcionado experiencia."}
                    </p>
                  </div>
                )}

                 {selectedUser.role === UserRole.WALKER && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">C.I</h3>
                      <p className="text-sm font-bold text-gray-900">{sensitiveData?.ci || selectedUser.ci || "N/A"}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Celular</h3>
                      <p className="text-sm font-bold text-gray-900">{selectedUser.phoneNumber || "N/A"}</p>
                    </div>
                  </div>
                )}

                {selectedUser.role === UserRole.WALKER && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ciudad</h3>
                      <p className="text-sm font-bold text-gray-900">{selectedUser.city || "N/A"}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Barrio</h3>
                      <p className="text-sm font-bold text-gray-900">{selectedUser.neighborhood || "N/A"}</p>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ubicación / Dirección</h3>
                  <div className="flex items-start gap-2 text-gray-700 bg-gray-50 p-4 rounded-xl text-sm">
                    <Mail size={16} className="text-gray-400 mt-0.5" />
                    <span>{selectedUser.address || "No se ha proporcionado dirección."}</span>
                  </div>
                </div>

                {selectedUser.role === UserRole.WALKER && (
                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Documentación Cargada</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* CI Front */}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">CI Frontal</p>
                        {(sensitiveData?.ciFrontPhoto || selectedUser.ciFrontPhoto) ? (
                          <div className="aspect-video w-full rounded-lg bg-gray-100 overflow-hidden shadow-inner cursor-pointer" onClick={() => window.open(sensitiveData?.ciFrontPhoto || selectedUser.ciFrontPhoto)}>
                            <img src={sensitiveData?.ciFrontPhoto || selectedUser.ciFrontPhoto} alt="CI Front" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-video w-full rounded-lg bg-gray-50 flex items-center justify-center border-2 border-dashed border-gray-200">
                            <span className="text-[10px] text-gray-300">No cargado</span>
                          </div>
                        )}
                      </div>
                      
                      {/* CI Back */}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">CI Dorsal</p>
                        {(sensitiveData?.ciBackPhoto || selectedUser.ciBackPhoto) ? (
                          <div className="aspect-video w-full rounded-lg bg-gray-100 overflow-hidden shadow-inner cursor-pointer" onClick={() => window.open(sensitiveData?.ciBackPhoto || selectedUser.ciBackPhoto)}>
                            <img src={sensitiveData?.ciBackPhoto || selectedUser.ciBackPhoto} alt="CI Back" className="h-full w-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-video w-full rounded-lg bg-gray-50 flex items-center justify-center border-2 border-dashed border-gray-200">
                            <span className="text-[10px] text-gray-300">No cargado</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Rol</h3>
                    <p className="text-sm font-bold text-gray-900 capitalize">{selectedUser.role}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Edad / F.Nac</h3>
                    <p className="text-sm font-bold text-gray-900">{selectedUser.birthDate || selectedUser.age || "N/A"}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Registro</h3>
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(selectedUser.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {selectedUser.role === UserRole.WALKER && selectedUser.ciVerificationStatus && (
                  <div className={`rounded-xl p-4 border-2 ${
                    selectedUser.ciVerificationStatus === 'verified' ? 'border-green-100 bg-green-50/30' : 
                    selectedUser.ciVerificationStatus === 'rejected' ? 'border-red-100 bg-red-50/30' : 
                    'border-blue-100 bg-blue-50/30'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                       <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={14} className={selectedUser.ciVerificationStatus === 'verified' ? 'text-green-500' : 'text-orange-500'} />
                        Control de Identidad
                      </h3>
                      {selectedUser.ciVerificationStatus === 'verified' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase">
                          <CheckCircle size={12} />
                          Verificado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 uppercase">
                          <Database size={12} />
                          Manual
                        </span>
                      )}
                    </div>
                    
                    {selectedUser.ciVerificationResult && (() => {
                      try {
                        // Check if it's JSON (old AI results) or plain text
                        const isJson = selectedUser.ciVerificationResult.startsWith('{');
                        if (isJson) {
                          const res = JSON.parse(selectedUser.ciVerificationResult);
                          return (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-700 leading-relaxed italic">
                                {res.reasoning}
                              </p>
                            </div>
                          );
                        }
                        return <p className="text-xs text-gray-600 leading-relaxed">{selectedUser.ciVerificationResult}</p>;
                      } catch (e) {
                         return <p className="text-xs text-gray-600 leading-relaxed">{selectedUser.ciVerificationResult}</p>;
                      }
                    })()}
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Estado</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                      selectedUser.isApproved ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    }`}>
                      {selectedUser.isApproved ? "Aprobado" : "Pendiente"}
                    </span>
                    {selectedUser.isSuspended && (
                      <span className="inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase bg-orange-100 text-orange-600">
                        Suspendido hasta: {selectedUser.suspendedUntil ? new Date(selectedUser.suspendedUntil).toLocaleDateString() : 'Indefinido'}
                      </span>
                    )}
                  </div>
                  {selectedUser.isSuspended && selectedUser.suspensionReason && (
                    <p className="mt-2 text-xs text-orange-600 font-medium italic">Motivo: {selectedUser.suspensionReason}</p>
                  )}
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setSelectedUser(null)}
                      className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                    >
                      Cerrar
                    </button>
                    {selectedUser.isSuspended ? (
                      <button 
                        onClick={() => handleUnsuspendUser(selectedUser.uid, selectedUser.displayName)}
                        className="flex-1 rounded-xl bg-green-500 py-3 text-sm font-bold text-white shadow-lg shadow-green-200 transition-all hover:bg-green-600 active:scale-95"
                      >
                        Levantar Suspensión
                      </button>
                    ) : (
                      <button 
                        onClick={() => setSuspensionData({ uid: selectedUser.uid, displayName: selectedUser.displayName })}
                        className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 active:scale-95"
                      >
                        Suspender
                      </button>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => setConfirmDeleteAccount({ uid: selectedUser.uid, displayName: selectedUser.displayName })}
                    className="w-full rounded-xl bg-red-100 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-200 active:scale-95"
                  >
                    Eliminar Cuenta Permanentemente
                  </button>

                  {activeTab === 'PENDING' && !selectedUser.isApproved && (
                    <div className="flex gap-3 mt-2">
                      <button 
                        onClick={() => setConfirmReject({ uid: selectedUser.uid, role: selectedUser.role })}
                        className="flex-1 rounded-xl bg-red-100 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-200 active:scale-95"
                      >
                        Rechazar
                      </button>
                      <button 
                        onClick={() => {
                          handleToggleApproval(selectedUser.uid, false, selectedUser.role);
                          setSelectedUser(null);
                        }}
                        className="flex-1 rounded-xl bg-orange-500 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 active:scale-95"
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmReject && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-2">¿Rechazar solicitud?</h2>
              <p className="text-gray-500 mb-6">Esta acción eliminará el perfil del usuario de forma permanente. No se puede deshacer.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmReject(null)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleRejectUser(confirmReject.uid, confirmReject.role)}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95"
                >
                  Rechazar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {confirmCancel && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-2">¿Cancelar paseo?</h2>
              <p className="text-gray-500 mb-6">¿Estás seguro de que deseas cancelar este paseo? Se notificará a las partes involucradas.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmCancel(null)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Volver
                </button>
                <button 
                  onClick={() => handleCancelWalk(confirmCancel)}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {suspensionData && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-gray-900 mb-4">Suspender a {suspensionData.displayName}</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Motivo de Suspensión</label>
                  <textarea 
                    value={suspensionForm.reason}
                    onChange={(e) => setSuspensionForm({...suspensionForm, reason: e.target.value})}
                    placeholder="Ej: Incumplimiento de términos, reportes de conducta..."
                    className="w-full h-24 rounded-xl border-2 border-gray-100 p-3 text-sm focus:border-orange-500 focus:outline-none bg-gray-50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Duración (días)</label>
                  <select 
                    value={suspensionForm.duration}
                    onChange={(e) => setSuspensionForm({...suspensionForm, duration: e.target.value})}
                    className="w-full rounded-xl border-2 border-gray-100 p-3 text-sm focus:border-orange-500 focus:outline-none bg-gray-50 transition-all"
                  >
                    <option value="1">1 día</option>
                    <option value="3">3 días</option>
                    <option value="7">7 días</option>
                    <option value="15">15 días</option>
                    <option value="30">30 días</option>
                    <option value="365">1 año</option>
                    <option value="9999">Indefinido</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setSuspensionData(null)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Cerrar
                </button>
                <button 
                  onClick={handleSuspendUser}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95"
                >
                  Confirmar Suspensión
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {confirmDeleteAccount && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500">
                <Trash2 size={24} />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Eliminar Cuenta</h2>
              <p className="text-gray-500 mb-6 font-sm">
                ¿Estás 100% seguro de eliminar la cuenta de <span className="font-bold text-gray-900">{confirmDeleteAccount.displayName}</span>? 
                Esta acción es IRREVERSIBLE y eliminará todos sus datos de Auth y Firestore.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteAccount(null)}
                  className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleAdminDeleteAccount(confirmDeleteAccount.uid)}
                  className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition-all hover:bg-red-600 active:scale-95"
                >
                  Eliminar Ahora
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
