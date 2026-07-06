import { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { 
  User, Mail, Shield, Key, LogOut, 
  Bell, Smartphone, Target, Camera,
  Award, Calendar, Hash, Save,
  Moon, Sun, Users
} from 'lucide-react';

export default function PerfilScreen() {
  const { showToast, temaGlobal, toggleTemaGlobal } = useAppStore();
  
  const fileInputPerfil = useRef(null);
  const fileInputPortada = useRef(null);
  
  const [userData, setUserData] = useState({
    nombre: 'Christopher Rubén Rosales Gómez',
    rol: 'Administrador / Senior Dev',
    email: 'christopher.rosales@upa.edu.mx',
    telefono: '449 000 0000',
    fecha_nacimiento: '2001-04-01',
    id_empleado: 'EMP-001',
    foto_perfil: null,
    foto_portada: null
  });

  const [settings, setSettings] = useState({
    notifications: true,
    twoFactor: false
  });

  const handleImageUpload = (e, tipo) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Solo se permiten imágenes', 'error');

    const imageUrl = URL.createObjectURL(file);
    if (tipo === 'perfil') setUserData({ ...userData, foto_perfil: imageUrl });
    else setUserData({ ...userData, foto_portada: imageUrl });
  };

  const handleSave = () => {
    if (!userData.email.includes('@')) return showToast('Correo inválido', 'error');
    showToast('Perfil actualizado correctamente', 'success');
  };

  const MetricCard = ({ titulo, valor, sub, icono: Icono, color }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border-2 border-slate-50 dark:border-slate-700 shadow-sm transition-colors">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${color}`}>
          <Icono className="w-5 h-5 text-ui-text" />
        </div>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sub}</span>
      </div>
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">{titulo}</p>
      <p className="text-2xl font-black text-ui-text dark:text-ui-text">{valor}</p>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col h-full animate-in fade-in duration-500 pb-20">
      
      {/* ─── HEADER PERFIL ─── */}
      <div className="relative mb-12">
        <div className="h-48 w-full bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          {userData.foto_portada ? (
            <img src={userData.foto_portada} alt="Portada" className="w-full h-full object-cover opacity-90 group-hover:opacity-70 transition-opacity" />
          ) : (
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
          )}
          
          <button onClick={() => fileInputPortada.current.click()} 
            className="absolute top-6 right-6 bg-black/60 hover:bg-black/80 text-ui-text px-4 py-2.5 rounded-2xl backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 flex items-center gap-2 shadow-lg"
          >
            <Camera className="w-4 h-4" /> <span className="text-xs font-bold uppercase tracking-widest">Cambiar Portada</span>
          </button>
          <input type="file" ref={fileInputPortada} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'portada')} />
        </div>

        <div className="absolute -bottom-16 left-12 flex flex-col md:flex-row items-end gap-6">
          <div className="relative group cursor-pointer" onClick={() => fileInputPerfil.current.click()}>
            <div className="w-36 h-36 rounded-[2.5rem] bg-white dark:bg-slate-800 p-2 shadow-2xl transition-transform group-hover:scale-105">
              {userData.foto_perfil ? (
                <img src={userData.foto_perfil} alt="Perfil" className="w-full h-full rounded-[2rem] object-cover border-4 border-white dark:border-slate-800" />
              ) : (
                <div className="w-full h-full rounded-[2rem] bg-indigo-500 flex items-center justify-center text-ui-text text-5xl font-black border-4 border-white dark:border-slate-800">
                  {userData.nombre[0]}
                </div>
              )}
            </div>
            <div className="absolute inset-0 bg-black/50 rounded-[2.5rem] m-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center border-4 border-transparent backdrop-blur-sm">
              <Camera className="w-8 h-8 text-ui-text" />
            </div>
            <input type="file" ref={fileInputPerfil} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'perfil')} />
          </div>

          <div className="mb-4">
            <h1 className="text-3xl font-black text-slate-900 dark:text-ui-text tracking-tight">{userData.nombre}</h1>
            <p className="text-indigo-600 dark:text-indigo-400 font-black flex items-center gap-2 uppercase text-xs tracking-widest bg-indigo-50 dark:bg-indigo-500/20 px-3 py-1.5 rounded-xl w-fit mt-2 border border-indigo-100 dark:border-indigo-500/30">
              <Shield className="w-3.5 h-3.5" /> {userData.rol}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-16">
        
        {/* ─── COLUMNA IZQUIERDA ─── */}
        <div className="space-y-6">
          <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Desempeño Hoy</h3>
          <div className="grid grid-cols-1 gap-4">
            <MetricCard titulo="Ventas Realizadas" valor="$4,250.00" sub="Caja" icono={Target} color="bg-brand-cesped" />
            <MetricCard titulo="Tickets Abiertos" valor="12" sub="Atención" icono={Users} color="bg-blue-500" />
            <MetricCard titulo="Tiempo Promedio" valor="18 min" sub="Servicio" icono={Calendar} color="bg-amber-500" />
          </div>
          
          <div className="bg-slate-900 dark:bg-black rounded-[2.5rem] p-8 text-ui-text relative overflow-hidden shadow-xl border border-slate-800">
             <Award className="absolute -right-4 -bottom-4 w-32 h-32 text-ui-text/5 rotate-12" />
             <h4 className="font-black text-lg mb-2 relative z-10">Logro del Mes</h4>
             <p className="text-slate-400 text-sm font-medium mb-4 relative z-10">Has mantenido una puntualidad del 100% en tus turnos.</p>
             <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden relative z-10">
                <div className="bg-indigo-400 h-full w-[95%]" />
             </div>
          </div>
        </div>

        {/* ─── COLUMNA DERECHA ─── */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Datos Personales */}
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] border-2 border-slate-50 dark:border-slate-700 shadow-sm transition-colors">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-ui-text dark:text-ui-text flex items-center gap-3">
                  <User className="w-6 h-6 text-indigo-500 dark:text-indigo-400" /> Datos Personales
                </h3>
                <button onClick={handleSave} className="bg-indigo-600 text-ui-text px-6 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-600/30">
                  <Save className="w-4 h-4" /> Guardar
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Correo Electrónico *</label>
                   <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" value={userData.email} onChange={e => setUserData({...userData, email: e.target.value})} 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-ui-text dark:text-ui-text outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-all shadow-inner" />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Teléfono de Contacto</label>
                   <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="tel" value={userData.telefono} onChange={e => setUserData({...userData, telefono: e.target.value})} 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-ui-text dark:text-ui-text outline-none focus:border-indigo-500 transition-all shadow-inner" />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Fecha Nacimiento</label>
                   <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="date" value={userData.fecha_nacimiento} onChange={e => setUserData({...userData, fecha_nacimiento: e.target.value})} 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-ui-text dark:text-ui-text outline-none focus:border-indigo-500 transition-all shadow-inner color-scheme-dark" />
                   </div>
                </div>
                <div className="space-y-2 opacity-70">
                   <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2 flex justify-between">
                     ID Empleado <span className="text-rose-400">No editable</span>
                   </label>
                   <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="text" value={userData.id_empleado} readOnly 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-100 dark:bg-slate-900/50 border-2 border-transparent rounded-2xl font-black text-slate-500 dark:text-slate-600 outline-none cursor-not-allowed" />
                   </div>
                </div>
             </div>
          </div>

          {/* Acciones y Preferencias */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             
             {/* 🌟 BOTÓN MODO OSCURO (CONECTADO A ZUSTAND) 🌟 */}
             <button onClick={toggleTemaGlobal}
               className={`p-6 rounded-[2rem] border-2 flex items-center justify-between transition-all ${
                 temaGlobal === 'dark' 
                 ? 'bg-slate-800 border-slate-700 text-ui-text shadow-lg shadow-black/20' 
                 : 'bg-white border-slate-100 text-ui-text hover:border-indigo-200'
               }`}
             >
               <div className="flex items-center gap-3">
                 <div className={`p-2.5 rounded-xl ${temaGlobal === 'dark' ? 'bg-indigo-500/20' : 'bg-amber-50'}`}>
                   {temaGlobal === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                 </div>
                 <div className="text-left">
                   <span className="font-black block">Modo Visual</span>
                   <span className={`text-[10px] font-bold uppercase tracking-widest ${temaGlobal === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>
                     {temaGlobal === 'dark' ? 'Nocturno Activado' : 'Claro Activado'}
                   </span>
                 </div>
               </div>
               <div className={`w-12 h-7 rounded-full relative transition-colors ${temaGlobal === 'dark' ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                 <div className={`absolute top-1 bg-white w-5 h-5 rounded-full transition-all shadow-sm ${temaGlobal === 'dark' ? 'left-6' : 'left-1'}`} />
               </div>
             </button>

             {/* Notificaciones Toggle */}
             <button onClick={() => setSettings({...settings, notifications: !settings.notifications})}
               className="p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between transition-all hover:border-indigo-200 dark:hover:border-indigo-500"
             >
               <div className="flex items-center gap-3">
                 <div className={`p-2.5 rounded-xl ${settings.notifications ? 'bg-indigo-50 dark:bg-indigo-500/20' : 'bg-slate-50 dark:bg-slate-700'}`}>
                   <Bell className={`w-5 h-5 ${settings.notifications ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                 </div>
                 <div className="text-left">
                   <span className="font-black text-ui-text dark:text-ui-text block">Notificaciones</span>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alertas del sistema</span>
                 </div>
               </div>
               <div className={`w-12 h-7 rounded-full relative transition-colors ${settings.notifications ? 'bg-brand-cesped' : 'bg-slate-200 dark:bg-slate-600'}`}>
                 <div className={`absolute top-1 bg-white w-5 h-5 rounded-full transition-all shadow-sm ${settings.notifications ? 'left-6' : 'left-1'}`} />
               </div>
             </button>

             <button className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-6 rounded-[2rem] flex items-center gap-4 hover:border-indigo-200 dark:hover:border-indigo-500 transition-all group">
                <div className="bg-indigo-50 dark:bg-indigo-500/20 p-2.5 rounded-xl group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/40 transition-colors">
                  <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-left">
                  <p className="font-black text-ui-text dark:text-ui-text">Contraseña</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actualizar credenciales</p>
                </div>
             </button>
             
             <button className="bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-100 dark:border-rose-500/20 p-6 rounded-[2rem] flex items-center justify-center gap-3 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all group">
                <LogOut className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                <span className="font-black text-rose-700 dark:text-rose-400">Cerrar Sesión Segura</span>
             </button>
          </div>

        </div>
      </div>
    </div>
  );
}