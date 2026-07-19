import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: (id: string) => void;
  key?: any;
}

export function Toast({ id, message, type = 'info', duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const config = {
    success: {
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-800',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    },
    error: {
      bg: 'bg-rose-50 border-rose-200',
      text: 'text-rose-800',
      icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
    },
    info: {
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      icon: <Info className="w-5 h-5 text-blue-600" />,
    },
  };

  const current = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${current.bg} ${current.text} max-w-md w-full`}
    >
      {current.icon}
      <span className="flex-1 text-sm font-semibold">{message}</span>
      <button 
        onClick={() => onClose(id)}
        className="p-1 hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
      >
        <X className="w-4 h-4 opacity-70" />
      </button>
    </motion.div>
  );
}

export interface ToastContainerProps {
  toasts: { id: string; message: string; type: ToastType }[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={onClose}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
