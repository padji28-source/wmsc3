import React, { useEffect, useState } from 'react';
import { Plus, Upload, Download, Edit2, Trash2, X, Save, AlertCircle, ChevronDown, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Product, ZoneCategory, Locator, Transaction } from '../types';
import { getProducts, addProduct, updateProduct, deleteProduct as deleteProductFromDb, addProductsBatch, getTransactions, getInventoryDetails, getLocators, addProductWithStock, addProductsBatchWithStock, addTransaction, getAlowedRacksForCategory } from '../lib/db';
import { getCurrentUser } from '../lib/auth'; // Mengambil fungsi auth
import { v4 as uuidv4 } from 'uuid';

export function Inventory({ globalSearch = '' }: { globalSearch?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryDetails, setInventoryDetails] = useState<Record<string, any>>({});
  const [locators, setLocators] = useState<Locator[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
  const [initialQty, setInitialQty] = useState<number | ''>('');
  const [initialLocatorId, setInitialLocatorId] = useState<string>('');
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [editLocStocks, setEditLocStocks] = useState<{ [locId: string]: number }>({});
  const [previousLocStocks, setPreviousLocStocks] = useState<{ [locId: string]: number }>({});
  const [newLocId, setNewLocId] = useState<string>('');
  const [newLocQty, setNewLocQty] = useState<string>('');

  // Ambil data user aktif dan validasi hak akses khusus (Dibatasi hanya untuk Super Admin sesuai permintaan)
  const currentUser = getCurrentUser();
  const userRoleClean = currentUser?.role?.trim().toUpperCase() || '';
  
  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN' || currentUser?.role?.toLowerCase() === 'super admin';
  const isKepalaGudangJkt = userRoleClean === 'KEPALA_GUDANG_JKT' || userRoleClean === 'KEPALA GUDANG JKT';
  
  const canImportCSV = isSuperAdmin;

  // Menggabungkan izin untuk melihat & mengeksekusi menu AKSI (Sekrung dibatasi HANYA untuk Super Admin)
  const hasActionAccess = isSuperAdmin;

  // Local search states
  const [localSearch, setLocalSearch] = useState(globalSearch);
  const [searchQuery, setSearchQuery] = useState(globalSearch);

  // Synchronize with globalSearch if it changes
  useEffect(() => {
    setLocalSearch(globalSearch);
    setSearchQuery(globalSearch);
  }, [globalSearch]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  // Reset page ke 1 saat filter / search berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, searchQuery]);

  const [transactions, setTransactions] = useState<any[]>([]);

  const fetchProducts = () => {
    Promise.all([
      getProducts(),
      getInventoryDetails(),
      getLocators(),
      getTransactions()
    ]).then(([prods, inv, locs, txs]) => {
      setProducts(prods);
      setInventoryDetails(inv);
      setLocators(locs);
      setTransactions(txs);
    }).catch(console.error);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Menghitung volume terpakai di setiap locator saat ini
  const locatorUsage = React.useMemo(() => {
    const usages: Record<string, number> = {};
    locators.forEach(l => {
      usages[l.id] = 0;
    });

    transactions.forEach(tx => {
      if (tx.status === 'CANCELLED' || tx.status === 'PENDING') return;
      if (usages[tx.locatorId] !== undefined) {
        const p = products.find(x => x.sku === tx.sku);
        if (p) {
          if (tx.type === 'INBOUND' && tx.status === 'CONFIRMED') {
            usages[tx.locatorId] += (tx.qty * p.volumeM3);
          } else if (tx.type === 'OUTBOUND' && (tx.status === 'CONFIRMED' || tx.status === 'BOOKED')) {
            usages[tx.locatorId] += (tx.qty * p.volumeM3);
          }
        }
      }
    });

    return usages;
  }, [locators, transactions, products]);

  // Logika penyaringan gabungan (Filter Kategori Dropdown + Live Global Search Bar)
  const filteredProducts = products.filter(p => {
    const matchesCategory = categoryFilter === '' || p.category === categoryFilter;
    const matchesSearch = searchQuery === '' || 
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesCategory && matchesSearch;
  });

  // 1. HITUNG AGREGAT GRAND TOTAL UNTUK BALANCING KAPASITAS & STOK (Secara Dinamis)
  const totalMetrics = filteredProducts.reduce((acc, p) => {
    const invData = inventoryDetails[p.sku] || { totalPhysicalQty: 0 };
    const qty = invData.totalPhysicalQty || 0;
    
    acc.totalQty += qty;
    acc.totalVolume += (p.volumeM3 || 0) * qty;
    acc.totalWeight += ((p.volumeM3 || 0) * 100) * qty; // Estimasi berat total berdasarkan volume terpakai
    
    return acc;
  }, { totalQty: 0, totalVolume: 0, totalWeight: 0 });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const handleSave = async () => {
    if (!formData.sku || !formData.name || !formData.category || formData.volumeM3 === undefined || (formData as any).volumeM3 === '' || !formData.uom) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }

    try {
      if (editingProduct) {
        if (!hasActionAccess) {
          setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin yang boleh mengubah data produk.' });
          return;
        }

        const productVol = Number(formData.volumeM3) || 0;
        const oldProductVol = Number(editingProduct.volumeM3) || 0;

        // 1. Validasi kapasitas dlu untuk semua slot yang diedit maupun yang ditempati produk ini
        const locsToCheck = new Set<string>();

        // Tambah slot-slot dari editLocStocks (jika super admin mengedit stocks)
        if (isSuperAdmin) {
          Object.keys(editLocStocks).forEach(locId => locsToCheck.add(locId));
        }

        // Tambah slot-slot yang memiliki produk ini saat ini (dari inventoryDetails)
        const invData = inventoryDetails[editingProduct.sku];
        if (invData && invData.locators) {
          Object.entries(invData.locators).forEach(([locId, data]: [string, any]) => {
            if (data.physicalQty > 0) {
              locsToCheck.add(locId);
            }
          });
        }

        // Jalankan pengecekan kapasitas untuk setiap slot yang terlibat
        for (const locId of locsToCheck) {
          const targetLoc = locators.find(l => l.id === locId);
          if (targetLoc) {
            const currentUsage = locatorUsage[locId] || 0;
            const originalSkuQty = previousLocStocks[locId] || 0;
            const newSkuQty = isSuperAdmin ? (editLocStocks[locId] || 0) : originalSkuQty;

            // Hitung sisa volume selain produk ini
            const baseUsage = Math.max(0, currentUsage - (originalSkuQty * oldProductVol));
            // Proyeksi occupancy total dengan volume produk baru & qty produk baru
            const projectedUsage = baseUsage + (newSkuQty * productVol);

            if (projectedUsage > targetLoc.maxVolumeM3) {
              const maxPcsPossible = productVol > 0 ? Math.floor((targetLoc.maxVolumeM3 - baseUsage) / productVol) : 0;
              setMessage({
                type: 'error',
                text: `Gagal Menyimpan! Kapasitas Rak Slot "${locId}" melampaui batas.\n` +
                      `Sisa Kapasitas selain produk ini: ${(targetLoc.maxVolumeM3 - baseUsage).toFixed(4)} m³.\n` +
                      `👉 Rak ini hanya dapat menampung maksimal ${maxPcsPossible} PCS produk ini.`
              });
              return;
            }
          }
        }

        // Jika validasi sukses, lakukan update
        await updateProduct(editingProduct.sku, formData);

        // 2. Jika user adalah Super Admin, proses update stok di masing-masing rack unit
        if (isSuperAdmin) {
          const operatorName = currentUser?.name || 'SUPER ADMIN';
          
          // Gabungkan keys lama dan baru
          const allLocs = Array.from(new Set([...Object.keys(previousLocStocks), ...Object.keys(editLocStocks)]));
          for (const locId of allLocs) {
            const oldQty = previousLocStocks[locId] || 0;
            const newQty = editLocStocks[locId] || 0;
            const diff = Number(newQty) - Number(oldQty);
            
            if (diff !== 0) {
              const txId = uuidv4();
              const newTx: Transaction = {
                id: txId,
                type: diff > 0 ? 'INBOUND' : 'OUTBOUND',
                sku: editingProduct.sku,
                qty: Math.abs(diff),
                locatorId: locId,
                operator: operatorName,
                timestamp: new Date().toISOString(),
                status: 'CONFIRMED',
                memo: `Super Admin Stock Manual Adjustment (dari ${oldQty} ke ${newQty})`
              };
              await addTransaction(newTx);
            }
          }
        }
      } else {
        const qty = initialQty === '' ? 0 : initialQty;
        if (qty > 0) {
          if (!initialLocatorId) {
            setMessage({ type: 'error', text: 'Posisi Rak (Slot) wajib diisi apabila Jumlah On Hand diisi.' });
            return;
          }
          const targetLoc = locators.find(l => l.id === initialLocatorId);
          if (!targetLoc) {
            setMessage({ type: 'error', text: `Posisi Rak Slot "${initialLocatorId}" tidak valid.` });
            return;
          }
          const allowedRacks = getAlowedRacksForCategory(formData.category || '');
          if (!allowedRacks.includes(targetLoc.rack)) {
            setMessage({ type: 'error', text: `Posisi Rak (Slot) ${initialLocatorId} (Rak ${targetLoc.rack}) tidak sesuai dengan aturan zonasi baru untuk Kategori "${formData.category}".` });
            return;
          }

          // Validasi Kapasitas Tersedia sesuai volume
          const currentUsage = locatorUsage[initialLocatorId] || 0;
          const remainingVol = targetLoc.maxVolumeM3 - currentUsage;
          const productVol = Number(formData.volumeM3) || 0;
          const requiredVol = qty * productVol;
          if (requiredVol > remainingVol) {
            const maxPcsPossible = productVol > 0 ? Math.floor(remainingVol / productVol) : 0;
            setMessage({ 
              type: 'error', 
              text: `Produk "${formData.sku}" Gagal Ditambahkan!\nVolume Rak pada Slot "${initialLocatorId}" sudah penuh / tidak cukup.\n\n` +
                    `• Sisa Kapasitas Rak: ${remainingVol.toFixed(4)} m³\n` +
                    `• Volume yang Dibutuhkan untuk ${qty} Unit: ${requiredVol.toFixed(4)} m³\n\n` +
                    `👉 Rak ini hanya dapat menampung maksimal ${maxPcsPossible} PCS produk ini.`
            });
            return;
          }
        }
        
        const operatorName = currentUser?.name || 'SYSTEM';
        await addProductWithStock(formData as Product, qty, initialLocatorId, operatorName);
      }
      setMessage({ type: 'success', text: `Product ${editingProduct ? 'updated' : 'added'} successfully.` });
      setShowForm(false);
      setEditingProduct(null);
      setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: 0, uom: 'PCS' });
      setInitialQty('');
      setInitialLocatorId('');
      fetchProducts();
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleDelete = async (sku: string) => {
    if (!hasActionAccess) {
      setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin yang berhak menghapus data produk.' });
      return;
    }

    if (!confirm(`Are you sure you want to delete product code: ${sku}?`)) return;
    try {
      const txs = await getTransactions();
      const hasTransactions = txs.some(tx => tx.sku === sku);
      if (hasTransactions) {
        setMessage({ type: 'error', text: 'Cannot delete product with existing transactions' });
        return;
      }
      await deleteProductFromDb(sku);
      setMessage({ type: 'success', text: 'Product deleted successfully.' });
      fetchProducts();
    } catch (e) {
      setMessage({ type: 'error', text: 'Network error.' });
    }
  };

  const handleEditClick = (product: Product) => {
    if (!hasActionAccess) return;
    setEditingProduct(product);
    setFormData(product);
    setShowForm(true);
    setMessage(null);

    // Inisialisasi stok rak untuk diedit (hanya jika Super Admin)
    const currentLocs: Record<string, number> = {};
    const invData = inventoryDetails[product.sku];
    if (invData && invData.locators) {
      Object.entries(invData.locators).forEach(([locId, data]: [string, any]) => {
        if (data.physicalQty > 0) {
          currentLocs[locId] = data.physicalQty;
        }
      });
    }
    setEditLocStocks(currentLocs);
    setPreviousLocStocks(currentLocs);
    setNewLocId('');
    setNewLocQty('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddEditLoc = () => {
    if (!newLocId) {
      setMessage({ type: 'error', text: 'Pilih slot rak terlebih dahulu.' });
      return;
    }
    const qty = parseInt(newLocQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setMessage({ type: 'error', text: 'Jumlah quantity harus lebih besar dari 0.' });
      return;
    }
    setEditLocStocks({ ...editLocStocks, [newLocId]: qty });
    setNewLocId('');
    setNewLocQty('');
    setMessage(null);
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,sku,name,category,volumeM3,uom\n" +
                       "P-PLUMB-001,Pipa PVC 2 Inch,FG_PLUMBING,0.015,PCS\n" +
                       "S-SMART-002,Water Flow Meter Digital,FG_SMART_WATER,0.008,BOX\n" +
                       "F-FIT-003,Sock Drat Dalam 1/2,FG_FITTING,0.002,PCS";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_import_sku.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportCSV) {
      setMessage({ type: 'error', text: 'Akses ditolak. Anda tidak memiliki izin untuk mengimpor file CSV.' });
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) {
        setMessage({ type: 'error', text: 'File CSV kosong atau tidak valid.' });
        return;
      }

      // Detect delimiter globally from the header line
      const headerLine = lines[0] || '';
      const commaCount = (headerLine.match(/,/g) || []).length;
      const semicolonCount = (headerLine.match(/;/g) || []).length;
      const tabCount = (headerLine.match(/\t/g) || []).length;

      let delimiter = ',';
      if (semicolonCount > commaCount && semicolonCount > tabCount) {
        delimiter = ';';
      } else if (tabCount > commaCount && tabCount > semicolonCount) {
        delimiter = '\t';
      }

      // Helper function to parse CSV line keeping quoted fields intact
      const parseCSVLine = (lineStr: string, delim: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let idx = 0; idx < lineStr.length; idx++) {
          const char = lineStr[idx];
          if (char === '"') {
            if (inQuotes && lineStr[idx + 1] === '"') {
              current += '"';
              idx++; // skip next quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === delim && !inQuotes) {
            result.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current);
        return result;
      };

      // Helper to strip outer quotes and unescape inner quotes
      const cleanValue = (val: string): string => {
        let cleaned = val.trim();
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
          cleaned = cleaned.slice(1, -1);
        } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
          cleaned = cleaned.slice(1, -1);
        }
        cleaned = cleaned.replace(/""/g, '"');
        return cleaned.trim();
      };

      const itemsToImport: { product: Product; qty?: number; locatorId?: string }[] = [];
      const skippedRows: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = parseCSVLine(line, delimiter).map(cleanValue);
        const [sku, name, category, volumeM3, uom] = parts;

        if (sku && name && category && volumeM3 !== undefined && volumeM3 !== '') {
          const skuClean = sku.trim().toUpperCase();
          
          // Keep original category name exactly as imported from CSV
          const pCategory = category.trim();

          // Validate Volume
          const parsedVolume = parseFloat(volumeM3.replace(',', '.').trim());
          if (isNaN(parsedVolume)) {
            skippedRows.push(`Baris ${i + 1}: Volume '${volumeM3}' bukan angka desimal yang valid.`);
            continue;
          }

          itemsToImport.push({
            product: {
              sku: skuClean,
              name: name.trim(),
              category: pCategory,
              volumeM3: parsedVolume,
              uom: uom ? uom.trim().toUpperCase() : 'PCS'
            }
          });
        } else {
          skippedRows.push(`Baris ${i + 1}: Format kolom tidak lengkap (wajib ada Kode, Nama, Kategori, Volume).`);
        }
      }

      if (itemsToImport.length > 0) {
        try {
          const existSkus = new Set(products.map(p => p.sku));
          const newItems = itemsToImport.filter(item => !existSkus.has(item.product.sku));
          const updatedItems = itemsToImport.filter(item => existSkus.has(item.product.sku));
          
          const operatorName = currentUser?.name || 'SYSTEM';
          await addProductsBatchWithStock(itemsToImport, operatorName);
          
          let alertText = `Berhasil memproses impor data: Total ${itemsToImport.length} produk berhasil diunggah.`;
          if (newItems.length > 0) {
            alertText += `\n- ${newItems.length} produk baru ditambahkan ke database.`;
          }
          if (updatedItems.length > 0) {
            alertText += `\n- ${updatedItems.length} produk yang sudah ada diperbarui datanya.`;
          }
          if (skippedRows.length > 0) {
            alertText += `\n\nDetail Baris yang Dilompati / Gagal:\n` + skippedRows.join('\n');
          }
          
          setMessage({ 
            type: 'success', 
            text: alertText 
          });
          fetchProducts();
        } catch (err: any) {
          console.error("Firestore batch upload failed:", err);
          setMessage({ 
            type: 'error', 
            text: `Gagal mengimpor produk ke database. Detail error: ${err?.message || err}` 
          });
        }
      } else {
        let alertText = 'Tidak ada produk baru atau baris valid yang berhasil diproses.';
        if (skippedRows.length > 0) {
          alertText += `\n\nDetail Kegagalan:\n` + skippedRows.join('\n');
        }
        setMessage({ type: 'error', text: alertText });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 relative">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
        <div 
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-200"
          onClick={() => {
            if (!hasActionAccess) {
              setMessage({ type: 'error', text: 'Akses ditolak. Hanya Super Admin yang berhak mendaftarkan produk baru.' });
              return;
            }
            if (!showForm || editingProduct) {
              setEditingProduct(null);
              setFormData({ sku: '', name: '', category: 'FG_PLUMBING', volumeM3: '' as any, uom: 'PCS' });
              setInitialQty('');
              setInitialLocatorId('');
              setShowForm(true);
            } else {
              setShowForm(false);
            }
            setMessage(null);
          }}
        >
          <div>
            <h2 className="text-[17px] font-bold text-slate-800 flex items-center gap-2 tracking-wide uppercase">
              <span className="w-5 h-5 rounded-full border-2 border-blue-600 text-blue-600 flex items-center justify-center text-lg">+</span>
              Katalog Kode Produk & Kontrol Safety Stock Pabrik
            </h2>
            <p className="text-slate-500 mt-1.5 text-[13px]">
              Daftar Kode Produk Aktif, dimensi unit, dan pengaturan manajemen stok gudang. Klik untuk membuka/menutup panel registrasi baru.
            </p>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showForm ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Aksi Massal (Bulk Management)</h4>
          <p className="text-xs text-slate-500 mt-0.5">Unggah data katalog gudang dalam jumlah banyak sekaligus menggunakan file spreadsheet (CSV).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors shadow-sm w-full sm:w-auto"
          >
            <Download className="w-4 h-4 text-slate-500" />
            Unduh Template CSV
          </button>
          
          {canImportCSV ? (
            <label className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors shadow-sm cursor-pointer w-full sm:w-auto">
              <Upload className="w-4 h-4" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          ) : (
            <button
              type="button"
              disabled
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold rounded-lg opacity-60 cursor-not-allowed w-full sm:w-auto"
              title="Fitur import hanya tersedia untuk Super Admin"
            >
              <Upload className="w-4 h-4" />
              Import CSV (Terproteksi)
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-semibold border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'} shadow-sm animate-in fade-in slide-in-from-top-1 duration-150`}>
          <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${message.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}/>
          <div className="flex-1 whitespace-pre-line leading-relaxed">
            {message.text}
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5 rounded-lg hover:bg-slate-100 transition-colors ml-2" onClick={() => setMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white border-2 border-blue-200 rounded-xl p-6 shadow-md mb-6 animate-fadeIn">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
            <h3 className="text-lg font-bold text-slate-800">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
            <button onClick={() => { setShowForm(false); setEditingProduct(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">KODE PRODUK</label>
              <input 
                type="text" 
                value={formData.sku || ''} 
                onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                disabled={!!editingProduct}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono disabled:opacity-50"
                placeholder="e.g. ITEM-001"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Product Name</label>
              <input 
                type="text" 
                value={formData.name || ''} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500"
                placeholder="Product description"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Category / Zone</label>
              <select 
                value={formData.category || 'FG_PLUMBING'} 
                onChange={e => setFormData({...formData, category: e.target.value as ZoneCategory})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500"
              >
                <option value="FG_PLUMBING">Plumbing</option>
                <option value="FG_SMART_WATER">Smart Water</option>
                <option value="FG_FITTING">Fitting</option>
                <option value="FG_FILTER">Filter</option>
                <option value="PACKAGING_MATERIALS">Bahan Packing</option>
                <option value="ASSEMBLY_KIT">Manufacture / Assembly</option>
                <option value="SPECIFIC_AREA">Spesifik (R9)</option>
                <option value="RAW_MATERIALS">Raw Materials</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Volume (m³ / Unit)</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={formData.volumeM3 === undefined || formData.volumeM3 === null ? '' : formData.volumeM3} 
                onChange={e => setFormData({...formData, volumeM3: (e.target.value === '' ? '' : parseFloat(e.target.value)) as any})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Satuan Terkecil (UOM)</label>
              <input 
                type="text" 
                value={formData.uom || ''} 
                onChange={e => setFormData({...formData, uom: e.target.value.toUpperCase()})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="PCS"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Pack UOM (Opsional)</label>
              <input 
                type="text" 
                value={formData.packUom || ''} 
                onChange={e => setFormData({...formData, packUom: e.target.value.toUpperCase()})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="DUS / CARTON"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Isi per Pack</label>
              <input 
                type="number"
                min="1" 
                value={formData.packingSize || ''} 
                onChange={e => setFormData({...formData, packingSize: e.target.value === '' ? undefined : parseInt(e.target.value, 10)})}
                className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="10"
              />
            </div>

            {!editingProduct && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider text-slate-800">Jumlah On Hand</label>
                  <input 
                    type="number" 
                    min="1"
                    value={initialQty === '' ? '' : initialQty} 
                    onChange={e => setInitialQty(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-700"
                    placeholder="Stok awal (opsional)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider flex items-center justify-between text-slate-800">
                    <span>Posisi Rak Slot</span>
                    <span className="text-[9px] text-blue-600 font-semibold normal-case">Zona / Buffer</span>
                  </label>
                  <select
                    value={initialLocatorId}
                    disabled={!initialQty}
                    onChange={e => setInitialLocatorId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 font-mono text-xs font-bold disabled:opacity-[0.55] disabled:cursor-not-allowed text-slate-700"
                  >
                    <option value="">-- Pilih Slot ({formData.category ? formData.category.replace('FG_', '') : 'Semua'}) --</option>
                    {locators
                      .filter(l => l.zone === formData.category || l.rack.startsWith('FL'))
                      .map(l => {
                        const currentUsage = locatorUsage[l.id] || 0;
                        const remainingVol = l.maxVolumeM3 - currentUsage;
                        return { locator: l, remainingVol };
                      })
                      .filter(item => {
                        const productVol = Number(formData.volumeM3) || 0;
                        const qty = Number(initialQty) || 0;
                        const requiredVol = productVol * qty;
                        return item.remainingVol >= requiredVol && item.remainingVol > 0;
                      })
                      .sort((a,b) => a.locator.id.localeCompare(b.locator.id, undefined, {numeric: true, sensitivity: 'base'}))
                      .map(({ locator: l, remainingVol }) => (
                        <option key={l.id} value={l.id}>
                          {l.id} [{l.rack}] ({l.zone === 'DEFAULT' ? 'BUFFER' : l.zone.replace('FG_', '')}) - Sisa: {remainingVol.toFixed(3)} m³
                        </option>
                      ))
                    }
                  </select>
                </div>
              </>
            )}
          </div>
          
          {editingProduct && isSuperAdmin && (
            <div className="col-span-12 border-t border-slate-100 pt-5 mt-4">
              <h4 className="text-xs font-black text-[#24549A] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="w-1.5 h-3.5 bg-[#24549A] block rounded-full"></span>
                Super Admin Area: Atur Kuantitas Stok per Rak Slot
              </h4>
              
              {/* Tabel Lokasi Rak Aktif */}
              <div className="mb-4 overflow-x-auto border border-slate-100 rounded-lg shadow-sm">
                <table className="min-w-full divide-y divide-slate-100 text-left">
                  <thead className="bg-[#f8fafc]">
                    <tr>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Slot Rak</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe Zona</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Sisa Kapasitas</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider w-48">Jumlah On-Hand (Pcs)</th>
                      <th className="px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {Object.keys(editLocStocks).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-xs text-slate-400 italic font-medium">
                          Barang ini belum diletakkan di rak mana pun. Gunakan form di bawah untuk mendaftarkan lokasi baru.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(editLocStocks).map(([locId, qty]) => {
                        const targetLoc = locators.find(l => l.id === locId);
                        const currentUsage = locatorUsage[locId] || 0;
                        const originalSkuQty = previousLocStocks[locId] || 0;
                        // Sisa kapasitas setelah mengeluarkan volume produk ini sebelumnya
                        const baseUsage = Math.max(0, currentUsage - (originalSkuQty * (Number(formData.volumeM3) || 0)));
                        const remainingCapacity = targetLoc ? Math.max(0, targetLoc.maxVolumeM3 - baseUsage) : 0;

                        return (
                          <tr key={locId} className="hover:bg-slate-50/40">
                            <td className="px-4 py-3 text-xs font-bold text-slate-800 font-mono">{locId}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                              {targetLoc ? (targetLoc.zone === 'DEFAULT' ? 'BUFFER' : targetLoc.zone.replace('FG_', '')) : '---'}
                            </td>
                            <td className="px-4 py-3 text-xs font-bold text-slate-600 font-mono">
                              {remainingCapacity.toFixed(4)} m³
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                value={qty || ''}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 0) {
                                    setEditLocStocks({ ...editLocStocks, [locId]: val });
                                  } else if (e.target.value === '') {
                                    setEditLocStocks({ ...editLocStocks, [locId]: 0 });
                                  }
                                }}
                                className="w-28 p-1.5 border border-slate-200 rounded font-bold font-mono text-xs focus:ring-1 focus:ring-blue-500 bg-slate-50 outline-none"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = { ...editLocStocks };
                                  delete next[locId];
                                  setEditLocStocks(next);
                                }}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                title="Kosongkan slot"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Form Tambah Lokasi Rak Baru */}
              <div className="bg-[#f8fafc] border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-end gap-3 max-w-2xl mt-4">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase font-bold text-[#24549A] mb-1">Pilih Slot Baru</label>
                  <select
                    value={newLocId}
                    onChange={e => setNewLocId(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs font-bold font-mono text-slate-700 outline-none"
                  >
                    <option value="">-- Cari Slot Baru --</option>
                    {locators
                      .filter(l => l.zone === formData.category || l.rack.startsWith('FL'))
                      .filter(l => !editLocStocks.hasOwnProperty(l.id))
                      .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true, sensitivity: 'base'}))
                      .map(l => {
                        const currentUsage = locatorUsage[l.id] || 0;
                        const remVol = l.maxVolumeM3 - currentUsage;
                        return (
                          <option key={l.id} value={l.id}>
                            {l.id} [{l.rack}] ({l.zone === 'DEFAULT' ? 'BUFFER' : l.zone.replace('FG_', '')}) - Sisa: {remVol.toFixed(3)} m³
                          </option>
                        );
                      })}
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-[10px] uppercase font-bold text-[#24549A] mb-1">Qty Awal</label>
                  <input
                    type="number"
                    min="1"
                    value={newLocQty}
                    onChange={e => setNewLocQty(e.target.value)}
                    placeholder="Qty"
                    className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs font-bold font-mono text-slate-700 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddEditLoc}
                  className="bg-[#24549A] text-white hover:bg-blue-800 text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm h-10 flex items-center gap-1 shrink-0 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Tambah Posisi
                </button>
              </div>
            </div>
          )}
          
          <div className="mt-6 flex justify-end gap-3">
            <button 
              onClick={() => { setShowForm(false); setEditingProduct(null); setInitialQty(''); setInitialLocatorId(''); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white rounded-lg font-bold hover:bg-blue-800 shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Product
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-4 mt-6 gap-4">
         <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div>
               <h3 className="font-bold text-slate-800 text-sm">Filter Overview</h3>
               <p className="text-xs text-slate-500 mt-0.5">Saring katalog berdasarkan kategori layout</p>
            </div>
            <div className="flex items-center gap-3">
               <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100 text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                  Total SKU Produk: <strong className="font-mono text-sm">{products.length}</strong>
               </div>
               {filteredProducts.length !== products.length && (
                 <div className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">
                    Terfilter: <strong className="font-mono text-sm">{filteredProducts.length}</strong>
                 </div>
               )}
            </div>
         </div>
         <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari SKU atau nama produk..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchQuery(localSearch);
                  }
                }}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={() => setSearchQuery(localSearch)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
            >
              <Search className="w-4 h-4" />
              Cari
            </button>
            <select 
              value={categoryFilter} 
              onChange={e => setCategoryFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-sm text-slate-800 bg-slate-50 outline-none sm:w-56 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
            >
              <option value="">Semua Kategori Layout</option>
              {Array.from(new Set(products.map(p => p.category))).map(cat => (
                <option key={cat as string} value={cat as string}>{(cat as string).replace('_', ' ')}</option>
              ))}
            </select>
         </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KODE PRODUK</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DESKRIPSI NAMA</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">KATEGORI LAYOUT SLOT</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">PACKAGING / UOM</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">POSISI RAK (SLOT)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">DIMENSI (VOL/BERAT)</th>
              {hasActionAccess && (
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">AKSI</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedProducts.map(p => {
              const invData = inventoryDetails[p.sku] || { totalPhysicalQty: 0, locators: {} };
              const onHandQty = invData.totalPhysicalQty;
              const weightEstimate = (p.volumeM3 * 100).toFixed(1);
              
              const activeLocators = Object.entries(invData.locators)
                 .filter(([_locId, data]: [string, any]) => data.physicalQty > 0)
                 .map(([locId, data]: [string, any]) => `${locId} (${data.physicalQty})`);

              return (
                <tr key={p.sku} className="hover:bg-slate-50 transition-colors group">
                  <td 
                    className={`px-6 py-4 text-sm font-bold text-blue-700 font-mono tracking-tight ${hasActionAccess ? 'cursor-pointer hover:underline' : 'cursor-default'}`} 
                    onClick={() => hasActionAccess && handleEditClick(p)}
                  >
                    {p.sku}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-800">{p.name}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500">{p.category.replace('_', ' ')}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold text-slate-700">{p.uom}</span>
                      {p.packUom && p.packingSize && (
                        <span className="text-[10px] text-slate-500 font-medium">1 {p.packUom} = {p.packingSize} {p.uom}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     {activeLocators.length > 0 ? (
                       <div className="flex flex-wrap gap-1">
                         {activeLocators.map(loc => (
                           <span key={loc} className="px-2.5 py-0.5 text-[10px] font-bold font-mono bg-sky-50 text-sky-700 border border-sky-200 rounded-sm">
                             {loc}
                           </span>
                         ))}
                       </div>
                     ) : (
                       <span className="text-xs text-slate-400 font-medium italic">Tidak ada stok fisik</span>
                     )}
                  </td>
                  <td className="px-6 py-4">
                     <div className="text-sm font-bold text-slate-700 font-mono">{p.volumeM3} m³</div>
                     <div className="text-xs text-slate-400 mt-0.5">{weightEstimate} Kg</div>
                  </td>
                  
                  {hasActionAccess && (
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleEditClick(p)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors shadow-sm bg-white border border-blue-200"
                          title="Edit Product"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(p.sku)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors shadow-sm bg-white border border-red-200"
                          title="Delete Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {paginatedProducts.length === 0 && (
              <tr>
                <td colSpan={hasActionAccess ? 7 : 6} className="p-12 text-center text-slate-500 font-medium">
                  Tidak ada produk yang cocok dengan pencarian atau filter kategori.
                </td>
              </tr>
            )}
          </tbody>

          {/* 2. BARIS GRAND TOTAL BARU UNTUK INVENTORY BALANCING KAPASITAS */}
          {filteredProducts.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-slate-800 font-bold sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                  Grand Total ({filteredProducts.length} Produk Terfilter) :
                </td>
                {/* Akumulasi Total Dimensi Terpakai (Volume & Berat Kumulatif dari Stok On-Hand) */}
                <td className="px-6 py-4">
                  <div className="text-sm font-extrabold text-slate-700 font-mono">
                    {totalMetrics.totalVolume.toFixed(3)} m³
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {totalMetrics.totalWeight.toFixed(1)} Kg
                  </div>
                </td>
                {/* Total Kuantitas Fisik On Hand Kumulatif */}
                <td className="px-6 py-4 text-sm font-extrabold font-mono text-blue-700 whitespace-nowrap">
                  {totalMetrics.totalQty.toLocaleString('id-ID')} Items
                </td>
                {/* Kolom Aksi Kosong jika akses tersedia */}
                {hasActionAccess && <td className="px-6 py-4"></td>}
              </tr>
            </tfoot>
          )}
        </table>
        </div>

        {/* Pagination Controls */}
        {filteredProducts.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 gap-4">
            <div className="text-xs text-slate-500 font-medium">
              Menampilkan <span className="font-bold text-slate-800">{Math.min(filteredProducts.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredProducts.length, currentPage * itemsPerPage)}</span> dari <span className="font-bold text-slate-800">{filteredProducts.length}</span> Kode Produk
            </div>
            
            <div className="flex items-center gap-4 flex-wrap">
              {/* Items Per Page Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Baris per halaman:</span>
                <select
                  value={itemsPerPage}
                  onChange={e => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700 outline-none focus:border-blue-500 font-bold"
                >
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
                  // Only show current page, 1, last page, and neighbor pages to avoid overflow if there are many pages
                  const isNear = Math.abs(pageNum - currentPage) <= 1;
                  const isFirstOrLast = pageNum === 1 || pageNum === totalPages;

                  if (!isNear && !isFirstOrLast) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return <span key={pageNum} className="text-slate-400 px-1 text-xs">...</span>;
                    }
                    return null;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}