import { useState } from "react";
import { Star, Heart, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { doc, updateDoc, addDoc, collection, getDoc, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Walk, UserProfile } from "../types";
import { toast } from "sonner";
import { sendNotification } from "../services/notificationService";
import { formatCurrency } from "../lib/utils";

interface PostWalkFeedbackProps {
  walk: Walk;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PostWalkFeedback({ walk, onClose, onSuccess }: PostWalkFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [tipAmount, setTipAmount] = useState<number | null>(0);
  const [customTip, setCustomTip] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tipOptions = [2000, 5000, 10000, 15000];

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Por favor selecciona una calificación");
      return;
    }

    setIsSubmitting(true);
    try {
      const finalTip = tipAmount !== null ? tipAmount : (customTip ? parseFloat(customTip) : 0);
      
      const walkRef = doc(db, "walks", walk.id);
      await updateDoc(walkRef, {
        rating: rating,
        ratingComment: comment,
        tipAmount: finalTip
      });

      // Update walker profile with new average rating
      if (walk.walkerId) {
        const walkerRef = doc(db, "users", walk.walkerId);
        const walkerSnap = await getDoc(walkerRef);
        
        if (walkerSnap.exists()) {
          const walkerData = walkerSnap.data() as UserProfile;
          const currentWalkCount = walkerData.walkCount || 0;
          const currentRating = walkerData.rating || 5;
          
          // Calculate new average rating
          const newRating = ((currentRating * currentWalkCount) + rating) / (currentWalkCount + 1);
          
          await updateDoc(walkerRef, {
            rating: Number(newRating.toFixed(1)),
            walkCount: currentWalkCount + 1
          });
        }
      }

      if (finalTip > 0 && auth.currentUser) {
        await addDoc(collection(db, "transactions"), {
          walkId: walk.id,
          userId: auth.currentUser.uid,
          amount: finalTip,
          method: 'card',
          status: 'completed',
          type: 'tip',
          createdAt: new Date().toISOString()
        });
      }

      // Notify walker
      if (walk.walkerId) {
        await sendNotification({
          userId: walk.walkerId,
          title: "¡Nueva Calificación!",
          body: `El dueño te ha calificado con ${rating} estrellas${finalTip > 0 ? ` y te ha enviado una propina de ${formatCurrency(finalTip)}` : ""}.`,
          type: 'walk_completed',
          walkId: walk.id
        });
      }

      toast.success("¡Gracias por tu reseña!");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error("Error submitting feedback:", err);
      toast.error("No se pudo enviar la calificación");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="relative p-8">
          <button 
            onClick={onClose}
            className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <X size={24} />
          </button>

          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">¿Cómo estuvo el paseo?</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Tu calificación ayuda a mejorar nuestra comunidad.</p>
          </div>

          <div className="mb-10 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="transition-transform active:scale-90"
              >
                <Star 
                  size={44} 
                  className={`transition-colors ${
                    (hoverRating || rating) >= star 
                      ? "fill-yellow-400 text-yellow-400" 
                      : "text-gray-200 dark:text-slate-700"
                  }`} 
                />
              </button>
            ))}
          </div>

          <div className="mb-8">
            <div className="mb-4 flex items-center gap-2">
              <Heart size={20} className="text-orange-500" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider dark:text-white">Propina</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => {
                  setTipAmount(0);
                  setCustomTip("");
                }}
                className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                  tipAmount === 0 
                    ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-900/20" 
                    : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"
                }`}
              >
                No esta vez (0 Gs)
              </button>
              {tipOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setTipAmount(option);
                    setCustomTip("");
                  }}
                  className={`rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                    tipAmount === option 
                      ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-900/20" 
                      : "border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400"
                  }`}
                >
                  {option.toLocaleString("es-PY")}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="number"
                value={customTip}
                onChange={(e) => {
                  setCustomTip(e.target.value);
                  setTipAmount(null);
                }}
                placeholder="Otro monto..."
                className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800/50 dark:text-white"
              />
            </div>
          </div>

          <div className="mb-8">
            <h3 className="mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider dark:text-slate-500">¿Algún comentario? (Opcional)</h3>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ej: ¡Excelente servicio, muy puntual!"
              rows={2}
              className="w-full rounded-2xl border-2 border-gray-100 bg-gray-50 p-4 text-sm focus:border-orange-500 focus:outline-none dark:border-slate-800 dark:bg-slate-800/50 dark:text-white"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="w-full rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none dark:shadow-none"
          >
            {isSubmitting ? "Enviando..." : "Enviar Calificación"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
