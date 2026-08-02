import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, handleFirestoreError, OperationType } from "../firebase";
import { Pet } from "../types";
import { Plus, Dog, Trash2, X, Upload, Camera, Search, ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { DOG_BREEDS } from "../data/breeds";

export default function Pets() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    breed: "",
    age: "",
    size: "medium" as 'small' | 'medium' | 'large',
    behaviorNotes: "",
    photo: ""
  });

  const [petToDelete, setPetToDelete] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const [breedSearch, setBreedSearch] = useState("");
  const [showBreedDropdown, setShowBreedDropdown] = useState(false);

  const filteredBreeds = DOG_BREEDS.filter(b => 
    b.toLowerCase().includes(breedSearch.toLowerCase())
  );

  useEffect(() => {
    if (!auth.currentUser) return;

    const petsQuery = query(
      collection(db, "pets"),
      where("ownerId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(petsQuery, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pet));
      setPets(petList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleFile = async (file: File) => {
    if (file) {
      if (file.size > 7 * 1024 * 1024) {
        toast.error("La imagen es demasiado grande. Máximo 7MB.");
        return;
      }
      
      setUploadProgress(true);
      try {
        // We handle the local preview immediately
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, photo: reader.result as string }));
          setUploadProgress(false);
        };
        reader.onerror = () => {
          console.error("FileReader error");
          setUploadProgress(false);
          toast.error("Error al leer el archivo");
        };
        reader.readAsDataURL(file);

        // We store the file for the actual upload later in handleAddPet
        setSelectedFile(file);
      } catch (err) {
        console.error(err);
        toast.error("Error al procesar la imagen");
        setUploadProgress(false);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleAddPet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setIsSubmitting(true);
    try {
      let photoURL = "";
      
      if (selectedFile) {
        if (storage) {
          try {
            const storagePath = `pets/${auth.currentUser.uid}/${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const storageRef = ref(storage, storagePath);
            
            // Add a timeout of 30 seconds to the upload
            const uploadPromise = uploadBytes(storageRef, selectedFile);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Timeout")), 30000)
            );
            
            const snapshot = await Promise.race([uploadPromise, timeoutPromise]) as any;
            photoURL = await getDownloadURL(snapshot.ref);
          } catch (storageErr) {
            console.error("Storage error:", storageErr);
            // Fallback to base64 if it's reasonably small
            if (selectedFile.size < 1024 * 1024) { // Increased to 1MB for fallback
              photoURL = formData.photo;
            } else {
              throw new Error("No se pudo subir la imagen y es demasiado grande.");
            }
          }
        } else {
          // Fallback to base64 if storage is not available
          if (selectedFile.size > 1024 * 1024) {
            throw new Error("La imagen es demasiado grande para guardar sin almacenamiento (máx 1MB).");
          }
          photoURL = formData.photo;
        }
      }

      const petData = {
        ownerId: auth.currentUser.uid,
        name: formData.name.trim(),
        breed: formData.breed.trim(),
        age: parseInt(formData.age) || 0,
        size: formData.size,
        behaviorNotes: formData.behaviorNotes.trim(),
        photos: photoURL ? [photoURL] : [],
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "pets"), petData);
      setShowAddModal(false);
      setSelectedFile(null);
      toast.success("Mascota agregada con éxito");
      setFormData({ 
        name: "", 
        breed: "", 
        age: "", 
        size: "medium", 
        behaviorNotes: "",
        photo: ""
      });
    } catch (err) {
      console.error("Error adding pet:", err);
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se pudo agregar: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePet = async () => {
    if (!petToDelete) return;
    try {
      await deleteDoc(doc(db, "pets", petToDelete));
      setPetToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando...</div>;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b overflow-hidden shrink-0">
        <img 
          src="/jaguata_banner.jpg" 
          alt="Jaguata" 
          className="w-full h-16 object-cover sm:h-24"
          referrerPolicy="no-referrer"
        />
      </div>
      <header className="bg-white dark:bg-slate-900 p-6 shadow-sm transition-colors">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Mascotas</h1>
      </header>

      <main className="flex-1 p-4">
        {pets.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pets.map(pet => (
              <motion.div 
                key={pet.id}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-md transition-colors"
              >
                <div className="mb-4 flex items-center gap-4">
                  <div className="h-16 w-16 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-500">
                    {pet.photos?.[0] ? (
                      <img src={pet.photos[0]} alt={pet.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-3">
                        <Dog size={40} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{pet.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      {pet.breed} • {pet.age} años • {
                        pet.size === 'small' ? 'Pequeño' : 
                        pet.size === 'medium' ? 'Mediano' : 
                        pet.size === 'large' ? 'Grande' : 
                        `${pet.weight} kg`
                      }
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 dark:bg-slate-800 p-3 transition-colors">
                  <p className="text-xs font-bold text-gray-400 uppercase">Notas de comportamiento</p>
                  <p className="text-sm text-gray-700 dark:text-slate-300">{pet.behaviorNotes || "Sin notas especiales."}</p>
                </div>
                <button 
                  onClick={() => setPetToDelete(pet.id)}
                  className="absolute top-4 right-4 text-gray-300 dark:text-slate-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
            <Dog size={64} className="mb-4 opacity-20" />
            <p>Aún no has añadido ninguna mascota.</p>
          </div>
        )}

        <button 
          onClick={() => setShowAddModal(true)}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 p-4 font-bold text-white shadow-md active:scale-95"
        >
          <Plus size={20} />
          Añadir Mascota
        </button>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl transition-colors"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold dark:text-white">Nueva Mascota</h3>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedFile(null);
                  setFormData({ 
                    name: "", 
                    breed: "", 
                    age: "", 
                    size: "medium", 
                    behaviorNotes: "",
                    photo: ""
                  });
                }} 
                className="text-gray-400"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddPet} className="space-y-6">
              <div 
                className={`relative flex flex-col items-center justify-center transition-all ${dragActive ? "scale-105" : ""}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  id="pet-photo"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label 
                  htmlFor="pet-photo"
                  className={`group relative h-32 w-32 overflow-hidden rounded-3xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center ${
                    dragActive 
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" 
                      : formData.photo 
                        ? "border-orange-200 bg-white dark:bg-slate-800" 
                        : "border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:border-orange-300 hover:bg-orange-50/30"
                  }`}
                >
                  {formData.photo ? (
                    <div className="relative h-full w-full">
                      <img src={formData.photo} alt="Preview" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                        <Camera className="text-white" size={32} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center px-4">
                      {uploadProgress ? (
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                      ) : (
                        <>
                          <Upload className={`mb-2 transition-colors ${dragActive ? "text-orange-500" : "text-gray-400 group-hover:text-orange-400"}`} size={28} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-orange-400">
                            Arrastra o toca para subir
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </label>
                {!formData.photo && <p className="mt-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Máximo 7MB</p>}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 p-3 text-sm focus:ring-2 focus:ring-orange-500 dark:text-white"
                  placeholder="Ej: Max"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-400 uppercase tracking-wider">Edad</label>
                  <input 
                    required
                    type="number" 
                    min="0"
                    value={formData.age}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || parseInt(value) >= 0) {
                        setFormData({ ...formData, age: value });
                      }
                    }}
                    className="w-full rounded-xl border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 p-3 text-sm focus:ring-2 focus:ring-orange-500 dark:text-white"
                    placeholder="Ej: 3"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-400 uppercase tracking-wider">Raza</label>
                  <div className="relative">
                    <div 
                      onClick={() => setShowBreedDropdown(!showBreedDropdown)}
                      className="flex w-full cursor-pointer items-center justify-between rounded-xl border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 p-3 text-sm focus:ring-2 focus:ring-orange-500 dark:text-white"
                    >
                      <span className={formData.breed ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                        {formData.breed || "Seleccionar raza"}
                      </span>
                      <ChevronDown size={16} className={`transition-transform ${showBreedDropdown ? "rotate-180" : ""}`} />
                    </div>

                    <AnimatePresence>
                      {showBreedDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-[60]" 
                            onClick={() => setShowBreedDropdown(false)} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute left-0 right-0 z-[70] mt-2 max-h-64 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="sticky top-0 border-b border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                <input 
                                  autoFocus
                                  type="text"
                                  placeholder="Buscar raza..."
                                  value={breedSearch}
                                  onChange={(e) => setBreedSearch(e.target.value)}
                                  className="w-full rounded-lg border-none bg-gray-100 p-2 pl-9 text-xs focus:ring-0 dark:bg-slate-800 dark:text-white"
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1 scrollbar-hide">
                              {filteredBreeds.length > 0 ? (
                                filteredBreeds.map((breed) => (
                                  <button
                                    key={breed}
                                    type="button"
                                    onClick={() => {
                                      setFormData({ ...formData, breed });
                                      setShowBreedDropdown(false);
                                      setBreedSearch("");
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-orange-50 dark:hover:bg-orange-950/20 ${
                                      formData.breed === breed ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30" : "text-gray-600 dark:text-slate-400"
                                    }`}
                                  >
                                    {breed}
                                    {formData.breed === breed && <Check size={12} />}
                                  </button>
                                ))
                              ) : (
                                <div className="p-4 text-center text-xs text-gray-400">
                                  No se encontraron razas
                                </div>
                              )}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-gray-400 uppercase tracking-wider">Tamaño</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['small', 'medium', 'large'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData({ ...formData, size: s })}
                      className={`rounded-xl py-2 text-xs font-bold transition-all ${
                        formData.size === s
                          ? "bg-orange-500 text-white shadow-md"
                          : "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400"
                      }`}
                    >
                      {s === 'small' ? 'Pequeño' : s === 'medium' ? 'Mediano' : 'Grande'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-gray-400 uppercase tracking-wider">Descripción Extra (Opcional)</label>
                <textarea 
                  value={formData.behaviorNotes}
                  onChange={(e) => setFormData({ ...formData, behaviorNotes: e.target.value })}
                  className="w-full rounded-xl border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 p-3 text-sm focus:ring-2 focus:ring-orange-500 dark:text-white"
                  rows={3}
                  placeholder="Ej: No le gustan otros perros, es muy juguetón..."
                />
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-4 font-bold text-white shadow-lg active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : "Guardar Mascota"}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {petToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl text-center"
          >
            <Trash2 size={48} className="mx-auto mb-4 text-red-500" />
            <h3 className="mb-2 text-xl font-bold dark:text-white">¿Eliminar mascota?</h3>
            <p className="mb-6 text-gray-500 dark:text-slate-400">Esta acción no se puede deshacer.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setPetToDelete(null)}
                className="flex-1 rounded-xl bg-gray-100 dark:bg-slate-800 py-3 font-bold text-gray-500 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeletePet}
                className="flex-1 rounded-xl bg-red-500 py-3 font-bold text-white shadow-md"
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
