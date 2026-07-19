import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Progress bar animation simulation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Random incremental steps for realistic feel
        const increment = Math.floor(Math.random() * 25) + 15;
        return Math.min(100, prev + increment);
      });
    }, 40);

    // End splash screen after loading is done and smooth buffer
    const timeout = setTimeout(() => {
      onComplete();
    }, 600);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(29,78,216,0.15)_0%,rgba(15,23,42,0)_70%)] pointer-events-none" />

      <div className="relative text-center max-w-sm px-6 flex flex-col items-center">
        {/* Animated logo image container with golden & blue glowing border */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ 
            type: 'spring', 
            stiffness: 100, 
            damping: 15,
            delay: 0.2 
          }}
          className="relative w-28 h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/20 border-2 border-slate-700 bg-white p-1.5 flex items-center justify-center mb-8"
        >
          <img
            src="/wms.png"
            alt="Gudang C3 Logo"
            className="w-full h-full object-cover rounded-2xl"
            referrerPolicy="no-referrer"
          />
          {/* Edge glowing effect */}
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-amber-500/10 pointer-events-none" />
        </motion.div>

        {/* Title reveal animation */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
          className="text-3xl md:text-4xl font-extrabold tracking-widest text-[#F1B122] uppercase"
        >
          GUDANG C3
        </motion.h1>

        {/* Subtitle reveal */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7, ease: 'easeOut' }}
          className="text-xs md:text-sm text-slate-400 mt-2 font-medium tracking-wide uppercase"
        >
          Warehouse Management System
        </motion.p>

        {/* Loading Progress Bar Container */}
        <div className="w-48 h-1 bg-slate-800 rounded-full mt-10 overflow-hidden relative border border-slate-700/50">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: 'easeInOut' }}
            className="h-full bg-gradient-to-r from-blue-500 to-amber-500"
          />
        </div>

        {/* Percentage Loading Text */}
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-[10px] font-mono font-bold text-slate-500 mt-2"
        >
          LOADING {progress}%
        </motion.span>
      </div>

      {/* Modern footer watermark */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="absolute bottom-6 text-[10px] font-mono text-slate-500 uppercase tracking-widest"
      >
        Enterprise Edition v2.0
      </motion.div>
    </div>
  );
}
