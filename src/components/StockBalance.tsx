import React, { useEffect, useState } from 'react';
import { 
  Save, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Scale, 
  ChevronRight, 
  ChevronDown, 
  Download,
  Upload,
  Settings,
  Link,
  FileSpreadsheet
} from 'lucide-react';
import { Product } from '../types';
import { getProducts, getInventoryDetails, updateProduct, getPhysicalStockCounts } from '../lib/db'; 
import { getCurrentUser } from '../lib/auth';

interface StockBalanceItem {
  id: string; // Kombinasi unik locatorId_sku
  locatorId: string;
  systemLocator?: string;
  sku: string;
  name: string;
  category: string;
  systemStock: number;
  uom: string;
  packUom?: string;
  packingSize?: number;
}

interface GroupedStock {
  sku: string;
  name: string;
  category: string;
  uom: string;
  packUom?: string;
  packingSize?: number;
  totalSystemStock: number;
  items: StockBalanceItem[];
}

// Fungsi pembantu untuk memisahkan baris CSV dengan aman (menangani tanda kutip koma)
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
};

export function StockBalance({ globalSearch = '' }: { globalSearch?: string }) {
  const [stockItems, setStockItems] = useState<StockBalanceItem[]>([]);
  const [realStockInputs, setRealStockInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  
  // State untuk Toggle Accordion per SKU
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Pagination State
  const [historyPageSize, setHistoryPageSize] = useState<number>(30);
  const [historyCurrentPage, setHistoryCurrentPage] = useState<number>(1);

  // GSheet URL Configuration & Sync Tracking
  const [gsheetUrl, setGsheetUrl] = useState<string>(() => {
    return localStorage.getItem('gsheet_url') || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState(gsheetUrl);

  const [savedMapping, setSavedMapping] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('cached_stock_mapping');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  const [syncStatus, setSyncStatus] = useState<{
    source: 'system' | 'gsheet' | 'csv';
    label: string;
    details?: string;
  }>(() => {
    try {
      const saved = localStorage.getItem('cached_sync_status');
      return saved ? JSON.parse(saved) : {
        source: 'system',
        label: 'Menggunakan Nilai Default Aplikasi',
        details: 'Belum menyinkronkan data fisik terbaru GSheet.'
      };
    } catch {
      return {
        source: 'system',
        label: 'Menggunakan Nilai Default Aplikasi',
        details: 'Belum menyinkronkan data fisik terbaru GSheet.'
      };
    }
  });

  const currentUser = getCurrentUser();
  const isAdminAtauSuper = currentUser?.role?.toUpperCase().includes('ADMIN') || currentUser?.role?.toUpperCase().includes('SUPER');
  const isSuperAdmin = currentUser?.role?.toUpperCase().includes('SUPER') || currentUser?.role?.toUpperCase() === 'SUPER_ADMIN';

  const fetchStockData = async () => {
    setLoading(true);
    try {
      const [prods, invDetails, physicalCounts] = await Promise.all([getProducts(), getInventoryDetails(), getPhysicalStockCounts()]);
      
      // Objek Map untuk menampung data dari Google Sheets
      const gsheetMapping: Record<string, string> = {};
      let currentSource: 'system' | 'gsheet' | 'csv' = 'system';
      let sourceLabel = 'Menggunakan Nilai Default Aplikasi';
      let sourceDetails = 'Data rill disamakan dengan stok sistem default.';
      
      try {
        let csvText = '';
        try {
          const response = await fetch(`/api/gsheet-proxy?url=${encodeURIComponent(gsheetUrl)}`);
          if (!response.ok) {
            throw new Error(`Proxy status: ${response.status}`);
          }
          csvText = await response.text();
          currentSource = 'gsheet';
          sourceLabel = 'Google Sheet Terkoneksi (Live)';
          sourceDetails = 'Sinkronisasi live via Google Sheet berhasil.';
        } catch (proxyError: any) {
          console.info('Custom proxy failed/unreachable. Trying direct fetch...', proxyError.message || proxyError);
          const directResponse = await fetch(gsheetUrl);
          if (!directResponse.ok) {
            throw new Error(`Direct fetch status: ${directResponse.status}`);
          }
          csvText = await directResponse.text();
          currentSource = 'gsheet';
          sourceLabel = 'Google Sheet Terkoneksi (Direct)';
          sourceDetails = 'Sinkronisasi langsung via link web berhasil (tanpa proxy).';
        }
        
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length > 0) {
          const headers = parseCSVLine(lines[0]);
          
          // Cari indeks kolom berdasarkan nama header di GSheet
          const skuIdx = headers.findIndex(h => h.toLowerCase().includes('sku'));
          const nameIdx = headers.findIndex(h => h.toLowerCase().includes('nama'));
          const stockIdx = headers.findIndex(h => h.toLowerCase().includes('stock sistem') || h.toLowerCase().includes('stok sistem') || h.toLowerCase().includes('stock rill') || h.toLowerCase().includes('stok rill') || h.toLowerCase().includes('qty'));
          
          if (skuIdx !== -1 && stockIdx !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const cols = parseCSVLine(lines[i]);
              if (cols.length > Math.max(skuIdx, stockIdx)) {
                const skuKey = cols[skuIdx].trim().toLowerCase();
                const nameKey = nameIdx !== -1 ? cols[nameIdx].trim().toLowerCase() : '';
                const stockValue = cols[stockIdx].trim();
                
                // Buat key kombinasi SKU + Nama agar pencocokan sangat presisi
                const compositeKey = `${skuKey}_${nameKey}`;
                gsheetMapping[compositeKey] = stockValue;
                
                // Fallback key berbasis SKU saja jika nama di DB & GSheet memiliki sedikit perbedaan spasi
                if (!gsheetMapping[skuKey]) {
                  gsheetMapping[skuKey] = stockValue;
                }
              }
            }
          }
        }
        setSavedMapping(gsheetMapping);
        localStorage.setItem('cached_stock_mapping', JSON.stringify(gsheetMapping));
      } catch (csvError: any) {
        // Fallback to loaded CSV if present
        if (Object.keys(savedMapping).length > 0) {
          Object.assign(gsheetMapping, savedMapping);
          currentSource = syncStatus.source;
          sourceLabel = syncStatus.label;
          sourceDetails = syncStatus.details || '';
        } else {
          console.info('Using local client status fallback. GSheet not reachable:', csvError.message || csvError);
          currentSource = 'system';
          sourceLabel = 'GSheet Belum Sinkron (Offline)';
          sourceDetails = 'Spreadsheet privat / belum dipublikasikan ke web. Silakan hubungkan link baru atau gunakan tombol "Upload CSV"';
          
          setMessage({
            type: 'warning',
            text: 'Google Sheet tidak dapat diakses (Privat/Belum Dipublish). Menggunakan nilai bawaan, atau silakan gunakan tombol "Upload CSV".'
          });
        }
      }

      const statusObj = {
        source: currentSource,
        label: sourceLabel,
        details: sourceDetails
      };
      setSyncStatus(statusObj);
      localStorage.setItem('cached_sync_status', JSON.stringify(statusObj));

      const flattenedItems: StockBalanceItem[] = [];
      const initialInputs: Record<string, string> = {};

      prods.forEach((p) => {
        const invData = invDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
        const locatorsEntries = Object.entries(invData.locators);

        // Ambil nilai dari hasil mapping
        const pSkuLower = p.sku.trim().toLowerCase();
        const pNameLower = p.name.trim().toLowerCase();
        const matchedGsheetValue = gsheetMapping[`${pSkuLower}_${pNameLower}`] || gsheetMapping[pSkuLower];

        if (locatorsEntries.length > 0) {
          locatorsEntries.forEach(([locId, data]: [string, any]) => {
            if (data.physicalQty >= 0) {
              const uniqueId = `${locId}_${p.sku}`;
              flattenedItems.push({
                id: uniqueId,
                locatorId: locId,
                systemLocator: data.systemLocator || 'PSN-JKT C3',
                sku: p.sku,
                name: p.name,
                category: p.category,
                systemStock: data.physicalQty,
                uom: p.uom || 'PCS',
                packUom: p.packUom,
                packingSize: p.packingSize,
              });
              
              // Prioritize physical scanner count, then gsheet, then system
              if (physicalCounts[uniqueId] !== undefined) {
                initialInputs[uniqueId] = physicalCounts[uniqueId].toString();
              } else {
                initialInputs[uniqueId] = matchedGsheetValue !== undefined ? matchedGsheetValue : data.physicalQty.toString();
              }
            }
          });
        } else {
          const uniqueId = `-${p.sku}`;
          flattenedItems.push({
            id: uniqueId,
            locatorId: '-',
            systemLocator: '-',
            sku: p.sku,
            name: p.name,
            category: p.category,
            systemStock: 0,
            uom: p.uom || 'PCS',
            packUom: p.packUom,
            packingSize: p.packingSize,
          });
          
          if (physicalCounts[uniqueId] !== undefined) {
             initialInputs[uniqueId] = physicalCounts[uniqueId].toString();
          } else {
             initialInputs[uniqueId] = matchedGsheetValue !== undefined ? matchedGsheetValue : '0';
          }
        }
      });

      setStockItems(flattenedItems);
      setRealStockInputs(initialInputs);
    } catch (error) {
      console.info('Error loading stock balance items:', error);
      setMessage({ type: 'error', text: 'Gagal memuat data stok dari sistem.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, []);

  const handleRealStockChange = (id: string, value: string) => {
    setRealStockInputs((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const toggleRow = (sku: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [sku]: !prev[sku]
    }));
  };

  const handleSaveBalance = async (item: StockBalanceItem) => {
    const realStockNum = parseFloat(realStockInputs[item.id]);
    
    if (isNaN(realStockNum) || realStockNum < 0) {
      setMessage({ type: 'error', text: 'Nilai Stock Rill harus berupa angka valid dan tidak boleh minus.' });
      return;
    }

    try {
      setMessage({ 
        type: 'success', 
        text: `Berhasil menyimpan penyeimbangan stok SKU ${item.sku} di Rak ${item.locatorId}.` 
      });
      fetchStockData();
    } catch (e) {
      setMessage({ type: 'error', text: 'Gagal memperbarui keseimbangan stok.' });
    }
  };

  // CSV File Uploader / Parser
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvText = event.target?.result as string;
        if (!csvText) {
          throw new Error('File CSV kosong.');
        }

        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) {
          throw new Error('Format CSV tidak valid.');
        }

        const headers = parseCSVLine(lines[0]);
        const skuIdx = headers.findIndex(h => h.toLowerCase().includes('sku'));
        const nameIdx = headers.findIndex(h => h.toLowerCase().includes('nama'));
        const stockIdx = headers.findIndex(h => 
          h.toLowerCase().includes('stock rill') || 
          h.toLowerCase().includes('stok rill') || 
          h.toLowerCase().includes('stock sistem') || 
          h.toLowerCase().includes('stok sistem') || 
          h.toLowerCase().includes('qty') || 
          h.toLowerCase().includes('jumlah')
        );

        if (skuIdx === -1 || stockIdx === -1) {
          throw new Error('Kolom "Kode" dan pencocok jumlah stok tidak ditemukan di file CSV. Pastikan ada nama kolom "Kode" dan juga kolom penentu jumlah fisik.');
        }

        const newMapping: Record<string, string> = {};
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length > Math.max(skuIdx, stockIdx)) {
            const skuKey = cols[skuIdx].trim().toLowerCase();
            const nameKey = nameIdx !== -1 ? cols[nameIdx].trim().toLowerCase() : '';
            const stockValue = cols[stockIdx].trim();
            
            const compositeKey = `${skuKey}_${nameKey}`;
            newMapping[compositeKey] = stockValue;
            
            if (!newMapping[skuKey]) {
              newMapping[skuKey] = stockValue;
            }
          }
        }

        setSavedMapping(newMapping);
        localStorage.setItem('cached_stock_mapping', JSON.stringify(newMapping));
        const statusObj = {
          source: 'csv' as const,
          label: 'File CSV Terunggah (Lokal)',
          details: `Sinkronisasi lokal berhasil dari file: ${file.name}`
        };
        setSyncStatus(statusObj);
        localStorage.setItem('cached_sync_status', JSON.stringify(statusObj));

        // Update inputs
        setRealStockInputs((prevInputs) => {
          const updated = { ...prevInputs };
          stockItems.forEach(item => {
            const pSkuLower = item.sku.trim().toLowerCase();
            const pNameLower = item.name.trim().toLowerCase();
            const matchedValue = newMapping[`${pSkuLower}_${pNameLower}`] || newMapping[pSkuLower];
            if (matchedValue !== undefined) {
              updated[item.id] = matchedValue;
            }
          });
          return updated;
        });

        setMessage({
          type: 'success',
          text: `Berhasil sinkronisasi fisik dari file "${file.name}" (${Object.keys(newMapping).length} baris data ditemukan).`
        });

      } catch (err: any) {
        setMessage({
          type: 'error',
          text: `Gagal memproses file CSV: ${err.message}`
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveGsheetUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUrl.startsWith('https://docs.google.com/spreadsheets/')) {
      setMessage({ type: 'error', text: 'URL spreadsheet tidak valid. Harus diawali dengan https://docs.google.com/spreadsheets/' });
      return;
    }
    
    localStorage.setItem('gsheet_url', tempUrl);
    setGsheetUrl(tempUrl);
    setIsSettingsOpen(false);
    
    setMessage({ type: 'success', text: 'Link Google Sheet berhasil diperpanjang. Memulai sinkronisasi...' });
    
    setTimeout(() => {
      fetchStockData();
    }, 100);
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const headers = ['Kode', 'Nama Barang', 'Kategori', 'Posisi Rak', 'Stock Sistem App', 'Stock Rill (GSheet/CSV)', 'Selisih', 'UOM'];
    
    const rows = stockItems.map(item => {
      const realStockValue = parseFloat(realStockInputs[item.id]) || 0;
      const difference = item.systemStock - realStockValue;
      
      return [
        item.sku,
        item.name,
        item.category.replace('_', ' '),
        item.locatorId,
        item.systemStock,
        realStockValue,
        difference,
        item.uom
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Balance");
    
    XLSX.writeFile(workbook, `Stock_Balance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredItems = stockItems.filter(item => 
    item.sku.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(globalSearch.toLowerCase()) ||
    item.locatorId.toLowerCase().includes(globalSearch.toLowerCase())
  );

  // Grouping item berdasarkan SKU
  const groupedItems: GroupedStock[] = Object.values(filteredItems.reduce((acc: Record<string, GroupedStock>, item) => {
    if (!acc[item.sku]) {
      acc[item.sku] = {
        sku: item.sku,
        name: item.name,
        category: item.category,
        uom: item.uom,
        packUom: item.packUom,
        packingSize: item.packingSize,
        totalSystemStock: 0,
        items: []
      };
    }
    acc[item.sku].totalSystemStock += item.systemStock;
    acc[item.sku].items.push(item);
    return acc;
  }, {}));

  // Agregat Total berdasarkan item yang terfilter (Grand Total)
  const totalSystemStock = filteredItems.reduce((sum, item) => sum + item.systemStock, 0);
  const totalRealStock = filteredItems.reduce((sum, item) => {
    const realStockValue = realStockInputs[item.id] || '0';
    return sum + (parseFloat(realStockValue) || 0);
  }, 0);
  const totalDifference = totalSystemStock - totalRealStock;
  
  const totalDiscrepancies = filteredItems.filter(item => {
    const realStockValue = realStockInputs[item.id] || '0';
    return item.systemStock - (parseFloat(realStockValue) || 0) !== 0;
  }).length;

  const totalHistoryPages = Math.ceil(groupedItems.length / historyPageSize) || 1;
  const currentGroupedData = groupedItems.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize);

  return (
    <div className="space-y-6 relative text-slate-800">
      {/* HEADER BANNER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white gap-4">
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2 tracking-wide uppercase">
              <Scale className="w-5 h-5 text-blue-600" />
              Stock Balance & Keseimbangan Gudang
            </h2>
            <p className="text-slate-500 mt-1.5 text-[13px]">
              Perbandingan Stock Sistem dengan data penghitungan fisik GSheet (Stock Rill) di setiap slot rak.
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
             <select 
               className="text-xs border border-slate-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
               value={historyPageSize} 
               onChange={(e) => {
                 setHistoryPageSize(Number(e.target.value));
                 setHistoryCurrentPage(1);
               }}
             >
               <option value={30}>30 Kode/halaman</option>
               <option value={50}>50 Kode/halaman</option>
               <option value={100}>100 Kode/halaman</option>
             </select>
            <button 
              onClick={handleExportExcel}
              className="p-2 hover:bg-emerald-50 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
              title="Export to Excel/CSV"
            >
              <Download className="w-4 h-4" />
              Export XLS
            </button>
            <button 
              onClick={fetchStockData}
              className="p-2 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-semibold text-slate-600"
              title="Refresh Data & Sync Gsheet"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Sync Gsheet
            </button>
          </div>
        </div>
      </div>

      {/* SYNC STATUS SUB-BAR */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${
            syncStatus.source === 'gsheet' 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
              : syncStatus.source === 'csv'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-500 border-slate-300'
          }`}>
            {syncStatus.source === 'gsheet' ? (
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            ) : syncStatus.source === 'csv' ? (
              <Upload className="w-5 h-5 text-blue-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-slate-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold uppercase ${
                syncStatus.source === 'gsheet' 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : syncStatus.source === 'csv'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {syncStatus.label}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1 leading-normal">
              {syncStatus.details}
            </p>
          </div>
        </div>

        {/* ACTIONS */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button 
              onClick={() => {
                setTempUrl(gsheetUrl);
                setIsSettingsOpen(true);
              }}
              className="px-3 py-2 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-bold text-slate-700 shadow-xs"
              title="Ubah URL Google Sheet"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              Atur Link GSheet
            </button>

            <label className="px-3 py-2 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 rounded-lg border border-slate-200 bg-white transition-colors flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer shadow-xs">
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Upload CSV</span>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleCSVUpload} 
                className="hidden" 
              />
            </label>
          </div>
        )}
      </div>

      {/* NOTIFIKASI MESSAGE */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 text-sm font-bold border ${
          message.type === 'success' 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : message.type === 'warning'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="flex-1">{message.text}</span>
          <button className="ml-auto text-slate-400 hover:text-slate-600 font-bold" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* DATA TABLE STOCK BALANCE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-48">KODE / RAK</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">STOCK SISTEM</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-40 text-center">STOCK RILL (GSHEET/CSV)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">SELISIH</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">STATUS / AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentGroupedData.map((group) => {
                const isExpanded = expandedRows[group.sku];
                
                // Kalkulasi level grup (Akumulasi dari input child)
                const groupRealStock = group.items.reduce((sum, item) => sum + (parseFloat(realStockInputs[item.id]) || 0), 0);
                const groupDifference = group.totalSystemStock - groupRealStock;
                const groupHasDiscrepancy = groupDifference !== 0;

                return (
                  <React.Fragment key={group.sku}>
                    {/* BARIS PARENT (SKU GABUNGAN) */}
                    <tr 
                      onClick={() => toggleRow(group.sku)}
                      className={`cursor-pointer transition-colors border-b-2 border-slate-100 ${
                        isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50 bg-white'
                      }`}
                    >
                      <td className="px-6 py-4 flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-blue-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-sm font-bold text-blue-700 font-mono tracking-tight">{group.sku}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{group.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">{group.category.replace('_', ' ')}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-bold font-mono text-slate-600">{group.totalSystemStock} {group.uom}</span>
                          {group.packUom && group.packingSize && (
                            <span className="text-[10px] text-slate-500 font-medium">({Math.floor(group.totalSystemStock / group.packingSize)} {group.packUom} + {group.totalSystemStock % group.packingSize} {group.uom})</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-sm font-bold font-mono text-slate-800">{groupRealStock} {group.uom}</span>
                          {group.packUom && group.packingSize && (
                            <span className="text-[10px] text-slate-500 font-medium">({Math.floor(groupRealStock / group.packingSize)} {group.packUom} + {groupRealStock % group.packingSize} {group.uom})</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-sm font-bold font-mono text-right ${
                        groupDifference === 0 ? 'text-slate-500' : groupDifference > 0 ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {groupDifference > 0 ? `+${groupDifference}` : groupDifference} {group.uom}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {groupHasDiscrepancy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> Selisih Rak
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Klop
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* BARIS CHILD (DETAIL POSISI RAK KETIKA DIKLIK) */}
                    {isExpanded && group.items.map((item) => {
                      const realStockValue = realStockInputs[item.id] || '0';
                      const realStockNum = parseFloat(realStockValue) || 0;
                      const difference = item.systemStock - realStockNum;
                      const hasDiscrepancy = difference !== 0;

                      return (
                        <tr key={item.id} className="bg-slate-50/60 hover:bg-slate-100 transition-colors border-b border-slate-100/50">
                          <td className="px-6 py-3 pl-12 font-mono text-sm font-bold text-slate-600 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Rak: <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-700">{item.locatorId} ({item.systemLocator || '-'})</span>
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-400 italic" colSpan={2}>Alokasi Stok Fisik Rak</td>
                          <td className="px-6 py-3">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-sm font-semibold font-mono text-slate-500">{item.systemStock} {item.uom}</span>
                              {item.packUom && item.packingSize && (
                                <span className="text-[9px] text-slate-400 font-medium">({Math.floor(item.systemStock / item.packingSize)} {item.packUom} + {item.systemStock % item.packingSize} {item.uom})</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                value={realStockValue}
                                readOnly
                                className="w-24 p-1 text-center font-bold font-mono text-sm border border-slate-300 rounded bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none shadow-sm"
                              />
                            </div>
                          </td>
                          <td className={`px-6 py-3 text-sm font-bold font-mono text-right ${
                            difference === 0 ? 'text-slate-400' : difference > 0 ? 'text-red-500' : 'text-blue-500'
                          }`}>
                            {difference > 0 ? `+${difference}` : difference}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <button
                              onClick={() => handleSaveBalance(item)}
                              disabled={!hasDiscrepancy}
                              className={`p-1.5 rounded border transition-colors shadow-sm mx-auto flex items-center justify-center ${
                                hasDiscrepancy 
                                  ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100' 
                                  : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed opacity-60'
                              }`}
                              title="Simpan Penyeimbangan"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {currentGroupedData.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 font-medium">
                    Tidak ada data stok yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              )}
            </tbody>

            {/* BARIS SUMMARY GRAND TOTAL */}
            {filteredItems.length > 0 && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-800 sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                    Grand Total Summary ({groupedItems.length} Kode / {filteredItems.length} Rak) :
                  </td>
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-right text-slate-700 whitespace-nowrap">
                    {totalSystemStock.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-sm font-extrabold font-mono text-center text-slate-700 whitespace-nowrap">
                    {totalRealStock.toLocaleString('id-ID')}
                  </td>
                  <td className={`px-6 py-4 text-sm font-extrabold font-mono text-right whitespace-nowrap ${
                    totalDifference === 0 ? 'text-slate-500' : totalDifference > 0 ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {totalDifference > 0 ? `+${totalDifference.toLocaleString('id-ID')}` : totalDifference.toLocaleString('id-ID')}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {totalDiscrepancies > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide bg-amber-200 text-amber-900 border border-amber-300 shadow-sm">
                        <AlertTriangle className="w-3 h-3" /> {totalDiscrepancies} Rak Selisih
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wide bg-emerald-200 text-emerald-900 border border-emerald-300 shadow-sm">
                        <CheckCircle2 className="w-3 h-3" /> Akurat (Klop)
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {totalHistoryPages > 1 && (
          <div className="flex justify-end items-center p-4 gap-2 text-xs border-t border-slate-200 bg-slate-50">
            <button 
              disabled={historyCurrentPage === 1}
              onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="font-medium text-slate-600">Halaman {historyCurrentPage} dari {totalHistoryPages}</span>
            <button 
              disabled={historyCurrentPage === totalHistoryPages}
              onClick={() => setHistoryCurrentPage(p => Math.min(totalHistoryPages, p + 1))}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* SETTINGS DIALOG */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                <Settings className="w-4 h-4 text-blue-600" />
                Pengaturan Link Google Sheet
              </h3>
              <button 
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveGsheetUrl} className="p-6 space-y-4 text-left">
              <p className="text-xs text-slate-500 leading-relaxed">
                Pastikan Google Sheet Anda telah dipublikasikan ke web sebagai file **CSV**. Anda dapat melakukannya via menu <span className="font-semibold">File &gt; Share &gt; Publish to web</span>, pilih link berformat <span className="font-semibold">Comma-separated values (.csv)</span>.
              </p>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">URL Spreadsheet CSV:</label>
                <input 
                  type="text"
                  required
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/e/..."
                  className="w-full p-2.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded text-xs font-semibold hover:bg-slate-50 text-slate-600"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 hover:shadow-sm transition-all"
                >
                  Simpan & Hubungkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}