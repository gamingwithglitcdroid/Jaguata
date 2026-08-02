import { motion } from "motion/react";
import { Check, X, Shield, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Terms() {
  const navigate = useNavigate();

  const handleAccept = () => {
    localStorage.setItem("jaguata_terms_accepted", "true");
    localStorage.setItem("jaguata_terms_date", new Date().toISOString());
    window.close();
    // Fallback if window.close doesn't work (most browsers block it if not opened by script)
    // But since it's "opening in a tab", we should try.
    // If it doesn't close, we can just show a success message.
    alert("Has aceptado los términos. Puedes cerrar esta pestaña y continuar tu registro.");
  };

  const handleReject = () => {
    localStorage.removeItem("jaguata_terms_accepted");
    window.close();
    alert("Has rechazado los términos. Debes aceptarlos para ser paseador.");
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl"
      >
        <div className="bg-orange-500 p-8 text-white">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
            <Shield size={24} />
          </div>
          <h1 className="text-3xl font-bold">Términos y Condiciones</h1>
          <p className="mt-2 text-orange-100 opacity-80 uppercase tracking-widest text-xs font-bold">
            Paseadores – JAGUATA • v1.0
          </p>
        </div>

        <div className="p-8 md:p-12 prose prose-orange max-w-none">
          <p className="text-gray-500 text-sm italic mb-8">Última actualización: 17 de Abril, 2026</p>

          <p className="text-gray-700 leading-relaxed mb-6">
            Los presentes Términos y Condiciones (en adelante, los “Términos”) regulan el acceso y uso de la plataforma digital denominada Jaguata (en adelante, la “Plataforma”), por parte de las personas físicas que se registran como paseadores de perros (en adelante, el “Paseador”).
          </p>

          <p className="text-gray-700 leading-relaxed mb-10">
            Al registrarse y utilizar la Plataforma, el Paseador declara haber leído, comprendido y aceptado en su totalidad los presentes Términos.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">1</span>
              Naturaleza de la Relación Jurídica
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El Paseador reconoce y acepta que su relación con Jaguata es de carácter independiente, no existiendo vínculo laboral, de dependencia, sociedad, representación ni mandato. El Paseador actúa por cuenta propia, siendo el único responsable de la ejecución de los servicios ofrecidos a los usuarios propietarios de mascotas.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">2</span>
              Requisitos de Registro
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El Paseador declara y garantiza que: Es mayor de edad conforme a la legislación vigente en la República del Paraguay. Posee capacidad legal para contratar. Proporciona información veraz, completa y actualizada. Mantendrá la confidencialidad de sus credenciales de acceso. Jaguata se reserva el derecho de verificar la información proporcionada y de rechazar o cancelar registros a su discreción.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">3</span>
              Obligaciones del Paseador
            </h2>
            <ul className="list-inside list-disc text-gray-600 text-sm space-y-2">
              <li>Cumplir con todas las leyes, ordenanzas y regulaciones aplicables en la República del Paraguay.</li>
              <li>Prestar el servicio con diligencia, prudencia y profesionalismo.</li>
              <li>Respetar las instrucciones proporcionadas por el propietario del animal.</li>
              <li>Garantizar el bienestar físico y emocional del animal durante todo el servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">4</span>
              Bienestar Animal
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              El Paseador se compromete a no incurrir en actos de maltrato animal, evitar cualquier conducta que genere estrés y utilizar métodos de manejo seguros. El incumplimiento de esta cláusula será considerado falta grave.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">5</span>
              Higiene y Manejo de Residuos
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El Paseador deberá recoger los residuos generados por el animal durante el paseo y disponer los mismos únicamente en contenedores o basureros habilitados.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">6</span>
              Seguridad y Custodia
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El Paseador será responsable de la custodia del animal, debiendo mantenerlo bajo control, utilizar sujeción adecuada y no dejarlo solo en ningún momento.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">7</span>
              Responsabilidad
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El Paseador asume plena responsabilidad por daños o lesiones, derivado de su negligencia. Jaguata actúa solo como intermediario tecnológico.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">8</span>
              Emergencias
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              En caso de emergencia, deberá actuar con diligencia, contactar inmediatamente al propietario y, si es necesario, trasladar al animal a un veterinario.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">9</span>
              Prohibiciones
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed font-bold">
              Queda estrictamente prohibido: Maltratar al animal, consumir alcohol o drogas durante el servicio, delegar el servicio a terceros o usar la plataforma para fines ilícitos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">10</span>
              Sistema de Evaluación
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              El desempeño podrá ser evaluado. Jaguata podrá suspender cuentas por malas evaluaciones o incumplimiento de términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 text-sm font-bold">11-13</span>
              Legales
            </h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              Los Términos se rigen por las leyes de la República del Paraguay. Para cualquier controversia, las partes se someten a los tribunales de Asunción.
            </p>
          </section>

          <div className="mt-16 border-t border-gray-100 pt-10">
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gray-100 py-4 font-bold text-gray-600 transition-all hover:bg-gray-200"
              >
                <X size={20} />
                Rechazar
              </button>
              <button 
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600"
              >
                <Check size={20} />
                He leído y acepto los términos
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
