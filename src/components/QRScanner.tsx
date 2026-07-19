import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scannerRef.current) return;

    const html5QrcodeScanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    html5QrcodeScanner.render((decodedText) => {
      onScan(decodedText);
      html5QrcodeScanner.clear();
    }, (error) => {
      // ignore
    });

    return () => {
      html5QrcodeScanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Scan QR Code</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 bg-slate-50 relative">
           <div id="qr-reader" ref={scannerRef} className="w-full"></div>
        </div>
      </div>
    </div>
  );
}
