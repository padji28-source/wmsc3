import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanBarcode, Layers, AlertTriangle, CheckCircle2, RefreshCw, X, Box, Plus, Minus } from 'lucide-react';
import { getRackDetailsByBarcode, savePhysicalStockCount } from '../lib/db';
import { getCurrentUser } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';

export function RackScanner() {
  const [scanResult, setScanResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [scannerActive, setScannerActive] = useState<boolean>(true);
  const [showSuccessFlash, setShowSuccessFlash] = useState<boolean>(false);
  const [confirmingLocId, setConfirmingLocId] = useState<string | null>(null);
  const [confirmedStatus, setConfirmedStatus] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const user = getCurrentUser();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleQtyChange = (idx: number, newQty: number) => {
    if (newQty < 0) return;
    setScanResult((prev: any) => {
      if (!prev) return prev;
      const updatedItems = [...prev.items];
      const targetItem = updatedItems[idx];
      const originalQty = targetItem.originalQty !== undefined ? targetItem.originalQty : targetItem.qty;
      
      updatedItems[idx] = {
        ...targetItem,
        qty: newQty,
        originalQty
      };
      return {
        ...prev,
        items: updatedItems
      };
    });
  };

  const handleConfirmStock = async () => {
    if (!scanResult || !scanResult.rack) return;
    setConfirmingLocId(scanResult.rack.code);
    setConfirmedStatus(false);
    
    try {
      if (scanResult.items && scanResult.items.length > 0) {
        for (const item of scanResult.items) {
          await savePhysicalStockCount(scanResult.rack.code, item.sku, item.qty);
        }
      } else {
        // If the rack is empty, maybe we don't save or we save a blank? We'll just confirm no action or something. 
        // For now, if empty, we just mark it confirmed.
      }
      setConfirmedStatus(true);
      setTimeout(() => setConfirmedStatus(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Gagal mengkonfirmasi stok.');
    } finally {
      setConfirmingLocId(null);
    }
  };


  useEffect(() => {
    let isMounted = true;
    let scannerInstance: Html5Qrcode | null = null;

    if (scannerActive) {
      // Small timeout to ensure the DOM element "rack-scanner-region" is fully rendered and ready
      const startTimer = setTimeout(() => {
        if (!isMounted) return;
        try {
          const container = document.getElementById("rack-scanner-region");
          if (!container) return;

          scannerInstance = new Html5Qrcode("rack-scanner-region");
          html5QrcodeRef.current = scannerInstance;

          scannerInstance.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 }
            },
            (decodedText) => {
              if (isMounted) {
                onScanSuccess(decodedText);
              }
            },
            (err) => {
              // Ignore routine scanning errors
            }
          ).catch(err => {
            console.error("Camera start failed:", err);
          });
        } catch (e) {
          console.error("Failed to initialize Html5Qrcode:", e);
        }
      }, 300);

      return () => {
        isMounted = false;
        clearTimeout(startTimer);
        if (scannerInstance) {
          if (scannerInstance.isScanning) {
            scannerInstance.stop().then(() => {
              try {
                scannerInstance?.clear();
              } catch (e) {
                console.warn("Clear scanner after stop error:", e);
              }
            }).catch(e => console.warn("Stop scanner error:", e));
          } else {
            try {
              scannerInstance.clear();
            } catch (e) {
              console.warn("Clear scanner error:", e);
            }
          }
        }
        html5QrcodeRef.current = null;
      };
    }
  }, [scannerActive]);

  const recordScanHistory = async (barcode: string, status: string) => {
    try {
      if (user) {
        await fetch('/api/scan-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: user.username,
            rack: barcode,
            action: 'SCAN_RACK',
            status,
            timestamp: new Date().toISOString()
          })
        });
      }
    } catch (e) {
      console.error("Error recording scan:", e);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    // Prevent double scan
    if (loading) return;
    
    // Attempt vibrate on scan
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
    
    setLoading(true);

    // Stop scanning first before unmounting DOM container
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (err) {
        console.warn("Failed to stop scanner in onScanSuccess:", err);
      }
    }
    
    setScannerActive(false); // turn off camera temporarilly
    try {
      const res = await getRackDetailsByBarcode(decodedText);
      if (res.success) {
        setScanResult(res);
        setError('');
        setShowSuccessFlash(true);
        setTimeout(() => setShowSuccessFlash(false), 900);
        await recordScanHistory(decodedText, 'SUCCESS');
      } else {
        setError(res.message);
        setScanResult(null);
        await recordScanHistory(decodedText, 'NOT_FOUND');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan sistem');
      await recordScanHistory(decodedText, 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const onScanError = (errorMessage: string) => {
    // Ignore routine scan errors
  };

  const resetScanner = () => {
    setScanResult(null);
    setError('');
    setScannerActive(true);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <ScanBarcode className="w-6 h-6 text-blue-600" />
            Rack Scanner
          </h2>
          <p className="text-slate-500 text-sm mt-1">Scan barcode rak untuk melihat detail lokasi penyimpanan.</p>
        </div>
      </div>

      <div className={isMobile ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
        {(!isMobile || scannerActive) && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-slate-500" /> Camera Preview
              </h3>
            </div>
            <div className="p-4 flex-1 flex flex-col items-center justify-center min-h-[300px]">
              {scannerActive ? (
                <div id="rack-scanner-region" className="w-full"></div>
              ) : (
                <div className="text-center">
                  <button 
                    onClick={resetScanner}
                    className="mx-auto flex flex-col items-center justify-center w-32 h-32 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors border border-blue-200 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-8 h-8 mb-2" />
                    <span className="font-bold text-sm">Scan Ulang</span>
                  </button>
                </div>
              )}
            </div>
            
            <AnimatePresence>
              {showSuccessFlash && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.9, times: [0, 0.15, 0.8, 1] }}
                  className="absolute inset-0 bg-emerald-500/15 flex items-center justify-center pointer-events-none z-40"
                >
                  <div className="absolute inset-0 border-8 border-emerald-500 animate-pulse" />
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: [0.4, 1.2, 1], opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="bg-emerald-500 text-white rounded-full p-4 shadow-lg shadow-emerald-500/30 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-12 h-12" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {(!isMobile || !scannerActive) && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" /> Hasil Scan
              </h3>
              {isMobile && !loading && (scanResult || error) && (
                <button
                  onClick={resetScanner}
                  className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold rounded-lg border border-blue-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Scan Baru</span>
                </button>
              )}
            </div>
            <div className="flex-1 p-4">
              {loading && (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}

              {!loading && error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full min-h-[300px] flex flex-col justify-center text-center p-6 bg-red-50 rounded-xl border border-red-100"
                >
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h4 className="font-bold text-red-700 mb-1">Rack Tidak Ditemukan</h4>
                  <p className="text-red-600 text-sm mb-4">{error}</p>
                  <button
                    onClick={resetScanner}
                    className="mx-auto flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg cursor-pointer transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Scan Ulang</span>
                  </button>
                </motion.div>
              )}

              {!loading && !scanResult && !error && (
                <div className="h-full min-h-[300px] flex flex-col justify-center text-center p-6 text-slate-400">
                  <ScanBarcode className="w-16 h-16 mx-auto mb-3 opacity-20" />
                  <p>Arahkan kamera ke barcode rak.</p>
                </div>
              )}

              {!loading && scanResult && scanResult.success && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-6 text-left"
                >
                  {isMobile && (
                    <button
                      onClick={resetScanner}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-md cursor-pointer mb-2 transition-all active:scale-98"
                    >
                      <ScanBarcode className="w-5 h-5" />
                      <span>Scan Rak Lain</span>
                    </button>
                  )}

                  <motion.div 
                    initial={{ scale: 0.98, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                    className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 shadow-sm relative overflow-hidden"
                  >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-2">
                      <motion.div
                        initial={{ rotate: -10, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                      >
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </motion.div>
                      <h4 className="font-black text-emerald-800 text-lg">Rack: {scanResult.rack.code}</h4>
                    </div>
                    <span className="bg-white px-3 py-1 rounded-full text-xs font-bold text-emerald-700 border border-emerald-200 font-mono">
                      Zone: {scanResult.rack.zone.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-2 relative z-10">
                    <div className="flex justify-between text-sm font-bold text-emerald-800">
                      <span>Kapasitas Digunakan</span>
                      <span>{scanResult.rack.usedCapacity.toFixed(2)} / {scanResult.rack.capacity} M³</span>
                    </div>
                    <div className="w-full bg-emerald-200/50 rounded-full h-3 overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (scanResult.rack.usedCapacity / scanResult.rack.capacity) * 100)}%` }}
                        transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
                        className="bg-emerald-500 h-3 rounded-full" 
                      />
                    </div>
                  </div>
                </motion.div>

                <div>
                  <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                    <Box className="w-4 h-4 text-slate-400" />
                    Isi Rak ({scanResult.items?.length || 0} Item)
                  </h4>

                  {scanResult.items.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                      <p className="text-slate-500 font-bold">Rack Kosong</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      <AnimatePresence>
                        {scanResult.items.map((item: any, idx: number) => (
                          <motion.div 
                            key={idx} 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.1 + idx * 0.05, duration: 0.25 }}
                            className="bg-white border text-left border-slate-200 rounded-lg p-3 shadow-sm flex items-center justify-between hover:border-blue-300 transition-colors"
                          >
                            <div className="min-w-0 pr-4">
                              <p className="font-black text-blue-700 text-sm truncate">{item.sku}</p>
                              <p className="text-xs text-slate-500 truncate">{item.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                                  Batch: {item.batch}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(idx, Math.max(0, item.qty - 1))}
                                  className="p-1 text-slate-500 hover:bg-slate-200 rounded cursor-pointer transition-colors"
                                  title="Kurangi Qty"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  value={item.qty}
                                  onChange={(e) => handleQtyChange(idx, parseInt(e.target.value) || 0)}
                                  className="w-16 text-center bg-white border border-slate-200 rounded font-bold font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none p-1 text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleQtyChange(idx, item.qty + 1)}
                                  className="p-1 text-slate-500 hover:bg-slate-200 rounded cursor-pointer transition-colors"
                                  title="Tambah Qty"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-bold text-slate-500 px-1.5">{item.uom || 'PCS'}</span>
                              </div>
                              {item.originalQty !== undefined && item.qty !== item.originalQty && (
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Ada Perbedaan: {item.qty - item.originalQty > 0 ? '+' : ''}{item.qty - item.originalQty} {item.uom || 'PCS'}
                                </span>
                              )}
                              {item.packUom && item.packingSize && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    ({Math.floor(item.qty / item.packingSize)} {item.packUom} + {item.qty % item.packingSize} {item.uom})
                                  </span>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                  
                  {user?.role === 'Developer' || user?.role === 'Supervisor' || user?.role === 'Admin' ? (
                    <div className="pt-2 mt-4 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={handleConfirmStock}
                        disabled={confirmingLocId !== null || confirmedStatus || scanResult.items.length === 0}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg shadow-sm transition-colors ${
                          confirmedStatus 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                        }`}
                      >
                        {confirmingLocId !== null ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : confirmedStatus ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>{confirmedStatus ? 'Stock Terkonfirmasi' : 'Konfirmasi Stock (Fisik Sesuai Sistem)'}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
