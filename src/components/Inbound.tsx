import React, { useState, useEffect } from 'react';
import { Camera, Shield, CheckCircle2, AlertCircle, Zap, Trash2, Printer, Eye, X, QrCode } from 'lucide-react';
import { Product, Locator, Transaction } from '../types';
import { getProducts, getPutawayRecommendations, addTransaction, getTransactions, getInventoryDetails, getLocators, getAlowedRacksForCategory, deleteTransactions } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentUser } from '../lib/auth';
import { QRScanner } from './QRScanner';
import SearchableSelect from './SearchableSelect';

interface TempAllocation {
  locatorId: string;
  qty: number;
  volume: number;
}

interface ReceiptPreviewData {
  rows: any[];
  operator: string;
  date: string;
}

export function Inbound({ globalSearch = '' }: { globalSearch?: string }) {
  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Developer';

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState('');
  const [totalQty, setTotalQty] = useState('');
  const [inputUnit, setInputUnit] = useState<'PCS' | 'PACK'>('PCS');
  const [systemLocator, setSystemLocator] = useState<string>('PSN-JKT C3');
  const [recommendations, setRecommendations] = useState<Locator[]>([]);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [locators, setLocators] = useState<Locator[]>([]);
  const [inventory, setInventory] = useState<any>({});
  const [tempAllocations, setTempAllocations] = useState<TempAllocation[]>([]);
  
  // Pagination State
  const [historyPageSize, setHistoryPageSize] = useState<number>(30);
  const [historyCurrentPage, setHistoryCurrentPage] = useState<number>(1);
  
  // State mengontrol penampilan Live Receipt Preview Lembar Kasir
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreviewData | null>(null);

  const [showScanner, setShowScanner] = useState(false);
  const [manualRack, setManualRack] = useState<string>('');

  // ==========================================
  // STATE MANAGEMENT (LOCALSTORAGE)
  // ==========================================
  const [inboundList, setInboundList] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('wms_inbound_list');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('wms_inbound_list', JSON.stringify(inboundList));
  }, [inboundList]);

  // ==========================================
  // FETCH DATA INITIALIZATION
  // ==========================================
  useEffect(() => {
    Promise.all([
      getProducts(),
      getTransactions(),
      getLocators(),
      getInventoryDetails()
    ]).then(([prods, txs, locs, inv]) => {
      setProducts(prods);
      const inbounds = txs.filter(tx => tx.type === 'INBOUND').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTransactions(inbounds);
      setLocators(locs);
      setInventory(inv);
    }).catch(console.error);
  }, []);

  const fetchTransactions = () => {
    Promise.all([getTransactions(), getInventoryDetails()]).then(([txs, inv]) => {
      const inbounds = txs.filter(tx => tx.type === 'INBOUND').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTransactions(inbounds);
      setInventory(inv);
    }).catch(console.error);
  };

  const handleDeleteHistorical = async (txTimestamp: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus seluruh batch transaksi inbound ini? Tindakan ini akan mengembalikan jumlah stok barang terkait.")) {
      return;
    }
    setLoading(true);
    try {
      // Find all transaction IDs matching this timestamp
      const txsToDelete = transactions.filter(t => t.timestamp === txTimestamp);
      const ids = txsToDelete.map(t => t.id);
      
      if (ids.length > 0) {
        await deleteTransactions(ids);
        setMessage({ type: 'success', text: 'Berhasil menghapus transaksi inbound dan mengupdate stok.' });
        fetchTransactions(); // Refresh the list & inventory
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Gagal menghapus transaksi: ' + (err.message || err) });
    } finally {
      setLoading(false);
    }
  };

  const productDetails = products.find(p => p.sku === selectedSku);

  const compatibleLocators = locators.filter(l => {
    if (!productDetails?.category) return true;
    const allowedRacks = getAlowedRacksForCategory(productDetails.category);
    return allowedRacks.includes(l.rack);
  });

  // Validasi otomatis saat SKU dipilih
  useEffect(() => {
    setTempAllocations([]);
    setManualRack('');
    if (selectedSku) {
      const prod = products.find(p => p.sku === selectedSku);
      if (!prod || prod.volumeM3 === undefined || prod.volumeM3 === null || prod.volumeM3 <= 0) {
        setMessage({ 
          type: 'error', 
          text: 'Barang tersebut tidak ada volumenya. Tidak bisa melakukan transaksi, silakan hubungi Super Admin untuk menambahkan volumenya.' 
        });
      } else {
        setMessage(null);
      }
    } else {
      setMessage(null);
    }
  }, [selectedSku, products]);

  const actualTotalQty = React.useMemo(() => {
    if (!totalQty || isNaN(Number(totalQty))) return 0;
    const baseQty = Number(totalQty);
    if (inputUnit === 'PACK' && productDetails?.packingSize && productDetails?.packUom) {
      return baseQty * productDetails.packingSize;
    }
    return baseQty;
  }, [totalQty, inputUnit, productDetails]);

  const unallocatedQty = Math.max(0, actualTotalQty - tempAllocations.reduce((sum, item) => sum + item.qty, 0));

  const handleRecommend = async () => {
    if (!selectedSku || unallocatedQty <= 0) return;
    // Blokir rekomendasi jika volume produk tidak valid
    if (!productDetails || productDetails.volumeM3 === undefined || productDetails.volumeM3 === null || productDetails.volumeM3 <= 0) {
      return;
    }
    setLoading(true);
    try {
      const recs = await getPutawayRecommendations(selectedSku, unallocatedQty);
      const filteredRecs = recs.filter(r => !productDetails?.category || r.zone === productDetails.category || r.rack.startsWith('FL'));
      setRecommendations(filteredRecs);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleRecommend();
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedSku, totalQty, tempAllocations]);

  const getSlotStat = (locId: string) => {
    let usedVol = 0;
    const items: any[] = [];
    
    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const pData = products.find(p => p.sku === sku);
      const locQty = data.locators[locId]?.physicalQty || 0;
      if (locQty > 0 && pData) {
        usedVol += locQty * (pData.volumeM3 || 0);
        items.push({ sku, qty: locQty });
      }
    });
    
    inboundList.filter(i => i.locatorId === locId).forEach(pendingItem => {
      const pData = products.find(p => p.sku === pendingItem.sku);
      if (pData) usedVol += pendingItem.qty * (pData.volumeM3 || 0);
      const existing = items.find(i => i.sku === pendingItem.sku);
      if (existing) existing.qty += pendingItem.qty;
      else items.push({ sku: pendingItem.sku, qty: pendingItem.qty });
    });

    const activeTemp = tempAllocations.find(t => t.locatorId === locId);
    if (activeTemp && productDetails) {
      usedVol += activeTemp.qty * (productDetails.volumeM3 || 0);
      const existing = items.find(i => i.sku === selectedSku);
      if (existing) existing.qty += activeTemp.qty;
      else items.push({ sku: selectedSku, qty: activeTemp.qty });
    }
    
    const maxVol = locators.find(r => r.id === locId)?.maxVolumeM3 || 5.4;
    const pct = Math.min(100, Math.round((usedVol / maxVol) * 100));
    return { usedVol, maxVol, pct, items, allocatedQty: activeTemp?.qty || 0 };
  };

  const handleSlotGridClick = (locId: string) => {
    if (!selectedSku) {
      setMessage({ type: 'error', text: 'Tentukan Kode barang terlebih dahulu.' });
      return;
    }

    // Proteksi tingkat grid klik jika volume kosong/0
    if (!productDetails || productDetails.volumeM3 === undefined || productDetails.volumeM3 === null || productDetails.volumeM3 <= 0) {
      setMessage({ 
        type: 'error', 
        text: 'Tidak dapat melanjutkan transaksi. Barang tersebut tidak ada volumenya, silakan hubungi Super Admin untuk menambahkan volumenya.' 
      });
      return;
    }

    if (!actualTotalQty || actualTotalQty <= 0) {
      setMessage({ type: 'error', text: 'Masukkan kuantitas total material masuk.' });
      return;
    }

    if (tempAllocations.some(t => t.locatorId === locId)) {
      setTempAllocations(tempAllocations.filter(t => t.locatorId !== locId));
      return;
    }

    if (unallocatedQty <= 0) {
      setMessage({ type: 'error', text: 'Seluruh kuantitas barang sudah habis teralokasi ke rak.' });
      return;
    }

    const targetLoc = locators.find(l => l.id === locId);
    if (targetLoc && productDetails) {
      const allowedRacks = getAlowedRacksForCategory(productDetails.category);
      if (!allowedRacks.includes(targetLoc.rack)) {
        setMessage({ 
          type: 'error', 
          text: `Slot Rak ${locId} (Rak ${targetLoc.rack}) tidak sesuai dengan aturan zonasi baru untuk Kategori "${productDetails.category}".` 
        });
        return;
      }
    }

    const unitVolume = productDetails.volumeM3;
    const stat = getSlotStat(locId);
    const availableVol = Math.max(0, stat.maxVol - stat.usedVol);
    if (availableVol <= 0) {
      setMessage({ type: 'error', text: `Slot Rak ${locId} sudah terisi penuh!` });
      return;
    }

    const maxQtyForThisSlot = Math.floor(availableVol / unitVolume);
    if (maxQtyForThisSlot <= 0) {
      setMessage({ type: 'error', text: `Sisa volume di Slot ${locId} tidak cukup untuk ukuran 1 unit Kode ini.` });
      return;
    }

    const allocatedQty = Math.min(unallocatedQty, maxQtyForThisSlot);

    setTempAllocations([...tempAllocations, {
      locatorId: locId,
      qty: allocatedQty,
      volume: allocatedQty * unitVolume
    }]);
    setMessage(null);
  };

  const handleAddBatchToList = () => {
    if (!productDetails || productDetails.volumeM3 === undefined || productDetails.volumeM3 === null || productDetails.volumeM3 <= 0) {
      setMessage({ 
        type: 'error', 
        text: 'Tidak dapat menyimpan alokasi. Barang tersebut tidak ada volumenya, silakan hubungi Super Admin untuk menambahkan volumenya.' 
      });
      return;
    }

    if (tempAllocations.length === 0) {
      setMessage({ type: 'error', text: 'Pilih minimal 1 atau beberapa rak pada grid matrix.' });
      return;
    }

    const newStagingItems = tempAllocations.map(alloc => ({
      id: uuidv4(),
      sku: selectedSku,
      qty: alloc.qty,
      locatorId: alloc.locatorId,
      name: productDetails?.name || 'Unknown Product',
      volume: alloc.volume,
      systemLocator: systemLocator
    }));

    setInboundList([...inboundList, ...newStagingItems]);
    setTotalQty('');
    setInputUnit('PCS');
    setSelectedSku('');
    setTempAllocations([]);
    setMessage({ type: 'success', text: 'Alokasi pembagian slot masuk daftar staging.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRemoveItem = (id: string) => {
    setInboundList(inboundList.filter(item => item.id !== id));
  };

  // ==========================================
  // KONFIRMASI DAN PROSES MASUK DATABASE
  // ==========================================
  const handleConfirmAll = async () => {
    if (inboundList.length === 0) return;
    try {
      const user = getCurrentUser();
      const operatorName = user ? user.name : 'IWAN GUNAWAN';
      
      const now = new Date();
      const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${String(now.getFullYear()).slice(-2)}, ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}.${String(now.getSeconds()).padStart(2, '0')}`;
      const isoTimestamp = now.toISOString();

      // Eksekusi penyimpanan data individu per baris split locator ke DB
      for (const item of inboundList) {
        const individualTx = {
           id: uuidv4(),
           type: 'INBOUND' as const,
           sku: item.sku,
           qty: item.qty,
           locatorId: item.locatorId,
           systemLocator: item.systemLocator,
           operator: operatorName,
           timestamp: isoTimestamp, 
           status: 'CONFIRMED' as const
        };
        await addTransaction(individualTx);
      }

      // Struk menampilkan murni baris list barang seperti yang diinput
      setReceiptPreview({
        rows: inboundList.map(item => ({
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          volume: item.volume,
          locatorId: item.locatorId
        })),
        operator: operatorName,
        date: formattedDate
      });
      
      setInboundList([]);
      fetchTransactions();
      
      setMessage({ type: 'success', text: 'Konfirmasi sukses! Silakan periksa pratinjau struk thermal di bawah.' });
      setTimeout(() => setMessage(null), 3500);

    } catch (e) {
      setMessage({ type: 'error', text: 'Gagal memproses transaksi.' });
    }
  };

  // Membuka riwayat struk lama secara utuh berdasarkan kesamaan timestamp batch submit
  const handlePreviewHistorical = (tx: Transaction) => {
    const batchTxs = transactions.filter(t => t.timestamp === tx.timestamp);
    const txDate = new Date(tx.timestamp);
    const formattedDate = `${txDate.getDate()}/${txDate.getMonth() + 1}/${String(txDate.getFullYear()).slice(-2)}, ${String(txDate.getHours()).padStart(2, '0')}.${String(txDate.getMinutes()).padStart(2, '0')}.${String(txDate.getSeconds()).padStart(2, '0')}`;

    const rows = batchTxs.map(bTx => {
      const prod = products.find(p => p.sku === bTx.sku);
      return {
        sku: bTx.sku,
        name: prod ? prod.name : 'PRODUCT REMOVED',
        qty: bTx.qty,
        volume: prod ? ((prod.volumeM3 || 0) * bTx.qty) : 0,
        locatorId: bTx.locatorId
      };
    });

    setReceiptPreview({
      rows: rows,
      operator: tx.operator || 'IWAN GUNAWAN',
      date: formattedDate
    });

    setTimeout(() => {
      document.getElementById('thermal-preview-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 150);
  };

  // ==========================================
  // HELPER UNTUK KONSOLIDASI TAMPILAN TABEL RIWAYAT
  // ==========================================
  const getConsolidatedTransactions = (txs: Transaction[]) => {
    const map = new Map<string, any>();
    
    txs.forEach(tx => {
      const key = tx.timestamp;
      if (!map.has(key)) {
        map.set(key, {
          id: tx.id,
          type: tx.type,
          sku: tx.sku,
          qty: tx.qty,
          locatorId: tx.locatorId,
          operator: tx.operator,
          timestamp: tx.timestamp,
          status: tx.status,
          locators: [tx.locatorId],
          skus: [tx.sku]
        });
      } else {
        const existing = map.get(key);
        existing.qty += tx.qty;
        if (!existing.locators.includes(tx.locatorId)) {
          existing.locators.push(tx.locatorId);
        }
        if (!existing.skus.includes(tx.sku)) {
          existing.skus.push(tx.sku);
        }
      }
    });
    
    return Array.from(map.values()).map(item => ({
      ...item,
      locatorId: item.locators.sort().join(', '),
      sku: item.skus.join(', ')
    }));
  };

  const allConsolidated = getConsolidatedTransactions(transactions);
  
  let filteredConsolidated = allConsolidated.filter(tx => tx && tx.type === 'INBOUND');
  
  // Filter pencarian
  if (globalSearch) {
    const searchLower = globalSearch.toLowerCase();
    filteredConsolidated = filteredConsolidated.filter(tx => 
      tx.sku.toLowerCase().includes(searchLower) ||
      tx.locatorId.toLowerCase().includes(searchLower) ||
      (tx.operator && tx.operator.toLowerCase().includes(searchLower))
    );
  }

  const consolidatedHistoryList = filteredConsolidated.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalHistoryPages = Math.ceil(consolidatedHistoryList.length / historyPageSize) || 1;
  const currentHistoryData = consolidatedHistoryList.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize);

  const recommendedLoc = recommendations[0];
  
  const availableRacks = Array.from(new Set(compatibleLocators.map(l => l.rack))).sort((a,b) => {
    return (a as string).localeCompare(b as string, undefined, {numeric: true});
  }) as string[];

  let selectedActiveRack = 'FL-A';
  if (manualRack && availableRacks.includes(manualRack)) {
    selectedActiveRack = manualRack;
  } else if (tempAllocations.length > 0) {
    const lastSelected = compatibleLocators.find(l => l.id === tempAllocations[tempAllocations.length - 1].locatorId);
    if (lastSelected) selectedActiveRack = lastSelected.rack;
  } else if (recommendedLoc) {
    selectedActiveRack = recommendedLoc.rack;
  } else if (compatibleLocators.length > 0) {
    selectedActiveRack = compatibleLocators[0].rack;
  }
  
  const rackLocators = compatibleLocators.filter(l => l.rack === selectedActiveRack);
  const columns = Array.from(new Set(rackLocators.map(l => l.column as string))).sort((a, b) => (a as string).localeCompare(b as string, undefined, { numeric: true }));
  const maxLevel = selectedActiveRack.startsWith('FL') ? 2 : (rackLocators.length > 0 ? Math.max(...rackLocators.map(l => l.level)) : 4);
  const levels = Array.from({length: maxLevel}, (_, i) => maxLevel - i);

  return (
    <div className="space-y-6 max-w-full mx-auto p-4">
      
      {/* 1. INTERFACES UTAMA */}
      <div className="print:hidden space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[#0F294D] tracking-tight">Directed Putaway</h2>
            <p className="text-slate-500 mt-1 text-xs">Multi-rack routing interface. Alokasikan pecahan kuantitas barang ke beberapa rak secara real-time.</p>
          </div>
          <div className="bg-[#009254] text-white px-3 py-1.5 rounded font-bold text-xs flex items-center gap-1.5 shadow-sm">
            <Zap className="w-3.5 h-3.5 fill-white" />
            Multi-Slot Active
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Input Pelayan Gudang */}
          <section className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5 text-[#24549A] uppercase tracking-wider">
                <span className="w-1 h-4 bg-[#24549A] block rounded"></span>
                Batch Receipt Entry
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-semibold">Locator Sistem</label>
                  <select 
                    value={systemLocator} 
                    onChange={e => setSystemLocator(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-xs outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="PSN-JKT C3">PSN-JKT C3</option>
                    <option value="PSN-JKT C3 KARANTINA">PSN-JKT C3 KARANTINA</option>
                    <option value="TRA-JKT C3">TRA-JKT C3</option>
                    <option value="PRO-JKT C3">PRO-JKT C3</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1 font-semibold">Kode Barang</label>
                  <div className="flex gap-2">
                    <SearchableSelect
                      options={products.map(p => ({
                        value: p.sku,
                        label: p.sku,
                        sublabel: p.name
                      }))}
                      value={selectedSku}
                      onChange={setSelectedSku}
                      placeholder="-- Pilih Kode Material --"
                      emptyMessage="Material tidak ditemukan"
                      focusBorderColorClass="focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
                    />
                    <button 
                      onClick={() => setShowScanner(true)}
                      className="px-3 bg-blue-50 border border-blue-200 rounded text-blue-600 hover:bg-blue-100 transition-colors flex items-center justify-center shrink-0"
                      title="Scan QR Code Kode"
                    ><QrCode className="w-4 h-4" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1 font-semibold flex justify-between">
                      <span>Total Masuk</span>
                      {productDetails?.packUom && productDetails?.packingSize && (
                        <select 
                          value={inputUnit} 
                          onChange={(e: any) => setInputUnit(e.target.value)}
                          className="bg-transparent text-blue-600 font-bold outline-none cursor-pointer"
                        >
                          <option value="PCS">{productDetails.uom}</option>
                          <option value="PACK">{productDetails.packUom}</option>
                        </select>
                      )}
                    </label>
                    <input 
                      type="number" 
                      value={totalQty}
                      onChange={e => setTotalQty(e.target.value)}
                      placeholder="Contoh: 30"
                      className="w-full p-2 border border-slate-300 rounded text-xs outline-none focus:border-blue-500"
                    />
                    {inputUnit === 'PACK' && productDetails?.packingSize && (
                      <p className="text-[10px] text-blue-600 mt-1 font-medium">Berdampak pada: {actualTotalQty} {productDetails.uom}</p>
                    )}
                  </div>
                  <div>
                     <label className="block text-xs text-slate-600 mb-1 font-semibold">Total Vol (m³)</label>
                    <input 
                      type="text" 
                      value={productDetails && actualTotalQty ? (Number(productDetails.volumeM3 || 0) * actualTotalQty).toFixed(3) : '0.000'}
                      readOnly
                      className="w-full p-2 border border-slate-300 rounded text-xs bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                {actualTotalQty > 0 && (
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] space-y-1 font-medium">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Sisa Belum Terbagi:</span>
                      <span className={`font-bold ${unallocatedQty > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{unallocatedQty} {productDetails?.uom || 'PCS'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Terbagi ke Multi-Rak:</span>
                      <span className="font-bold text-blue-600">{tempAllocations.reduce((sum, i) => sum + i.qty, 0)} {productDetails?.uom || 'PCS'}</span>
                    </div>
                  </div>
                )}
                
                {tempAllocations.length > 0 && (
                  <div className="bg-blue-50/50 border border-blue-200 rounded p-2.5">
                    <p className="text-[11px] font-bold text-blue-800 mb-1">Rencana Distribusi Alokasi:</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {tempAllocations.map(t => (
                        <div key={t.locatorId} className="text-[10px] flex justify-between font-mono text-slate-700 bg-white p-1 px-2 rounded border border-slate-100">
                          <span>Slot {t.locatorId}</span>
                          <span className="font-bold">{t.qty} PCS ({t.volume.toFixed(3)} m³)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {message && (
                  <div className={`p-2 rounded text-[11px] font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700 flex items-start gap-1'}`}>
                    {message.type === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                    {message.text}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
              <button 
                onClick={handleAddBatchToList}
                disabled={tempAllocations.length === 0 || !productDetails || !productDetails.volumeM3 || productDetails.volumeM3 <= 0}
                className="w-full bg-[#34d399] font-bold text-slate-900 py-2.5 rounded text-xs flex items-center justify-center gap-1.5 hover:bg-[#10b981] transition-colors disabled:opacity-40"
              >
                <Shield className="w-3.5 h-3.5" />
                Simpan Alokasi Slot ({tempAllocations.length})
              </button>

              {inboundList.length > 0 && (
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-[10px] font-black text-slate-600 uppercase">Antrean Staging:</h4>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">{inboundList.length} Slot</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto mb-2">
                    {inboundList.map(item => (
                      <div key={item.id} className="text-[11px] flex justify-between bg-slate-50 p-1.5 rounded border border-slate-200 items-center">
                        <div className="truncate pr-2">
                          <p className="font-bold text-blue-700 font-mono text-[10px]">{item.sku}</p>
                          <p className="text-[9px] text-slate-500">Qty: <span className="text-slate-800 font-bold">{item.qty} PCS</span> ➔ Slot {item.locatorId} ({item.systemLocator})</p>
                        </div>
                        <button onClick={() => handleRemoveItem(item.id)} className="text-slate-400 hover:text-rose-600 p-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={handleConfirmAll}
                    className="w-full bg-[#0055C4] font-bold text-white py-2.5 rounded text-xs flex items-center justify-center gap-1.5 hover:bg-blue-800 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Konfirmasi & Generate Struk
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Matrix Board */}
          <section className="col-span-12 lg:col-span-8 flex flex-col gap-4">
            <div className="bg-[#0b5cd5] text-white rounded-lg p-4 shadow-sm">
               <span className="inline-block px-2 py-0.5 bg-white/20 text-white text-[9px] font-extrabold tracking-wider rounded mb-1 uppercase">AI Recommendation</span>
               <h3 className="text-base font-light">Rekomendasi Utama Penempatan Slot: <span className="font-mono font-bold underline">{recommendedLoc?.id || '---'}</span></h3>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex-1">
               {availableRacks.length > 1 && (
                 <div className="mb-4">
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Blok Rak Aktif (Zona & Buffer FL):</label>
                   <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100">
                     {availableRacks.map(rPref => {
                       const isActive = selectedActiveRack === (rPref as string);
                       const isFL = (rPref as string).startsWith('FL');
                       return (
                         <button
                           key={rPref as string}
                           type="button"
                           onClick={() => setManualRack(rPref as string)}
                           className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                             isActive 
                               ? 'bg-[#24549A] text-white ring-2 ring-blue-200' 
                               : isFL 
                                 ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200' 
                                 : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                           }`}
                         >
                           {rPref} {isFL ? '⚡ FL' : '📦 Rack'}
                         </button>
                       );
                     })}
                   </div>
                 </div>
               )}

               <div className="flex justify-between items-center mb-4">
                 <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                   Live Layout Grid: 
                   <span className="p-1 border border-slate-200 bg-slate-50 text-slate-800 rounded font-mono font-bold text-xs">Block Rack {selectedActiveRack}</span>
                 </h4>
                 <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase">
                   <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#e2e8f0]"></span> Kosong</span>
                   <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span> Penuh</span>
                   <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Terpilih</span>
                 </div>
               </div>

               <div className="relative w-full overflow-x-auto pb-2">
                 <div className="flex flex-col gap-4 w-max min-w-full">
                   {levels.map((lvl) => (
                     <div key={lvl} className="flex relative items-center py-0.5">
                       <div className="w-10 text-right pr-2 text-[10px] font-mono font-bold text-slate-400">L-{lvl}</div>
                       <div className="flex gap-3">
                         {columns.map(c => {
                           const locId = `${c}.${lvl}`;
                           const isValidLoc = rackLocators.some(l => l.id === locId);
                           if (!isValidLoc) return <div key={c} className="w-24 flex-shrink-0" />;

                           const stat = getSlotStat(locId);
                           const isAllocatedInGrid = tempAllocations.some(t => t.locatorId === locId);
                           const isVacant = stat.pct === 0 && !isAllocatedInGrid;
                           
                           const cardBorderColor = isAllocatedInGrid 
                             ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20' 
                             : 'border-slate-200 hover:border-slate-400';
                           
                           return (
                             <div key={c} className="w-24 flex-shrink-0 cursor-pointer" onClick={() => handleSlotGridClick(locId)}>
                                <div className={`w-full bg-white border ${cardBorderColor} rounded p-1.5 relative transition-all`}>
                                   <div className="flex justify-between items-center text-[9px] font-bold text-slate-700 mb-1">
                                     <span>{(c as string).replace('FL-','')}.{lvl}</span>
                                     <span className="text-slate-400">{stat.pct}%</span>
                                   </div>
                                   <div className="h-6 flex flex-col justify-center text-[9px]">
                                     {isAllocatedInGrid ? (
                                       <div className="text-center bg-rose-500 text-white rounded font-bold py-0.5 animate-pulse text-[8px]">
                                         +{stat.allocatedQty} PCS
                                       </div>
                                     ) : isVacant ? (
                                       <span className="text-slate-300 text-center block italic text-[8px]">KOSONG</span>
                                     ) : (
                                       <>
                                         <p className="font-bold text-slate-800 truncate leading-none mb-0.5">{stat.items[0]?.sku || '---'}</p>
                                         <p className="text-[8px] text-slate-400 leading-none">{stat.items.reduce((acc: number, curr: any) => acc + curr.qty, 0)} Pcs</p>
                                       </>
                                     )}
                                   </div>
                                   <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                                     <div className={`h-full ${isAllocatedInGrid ? 'bg-rose-500' : stat.pct >= 85 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.min(stat.pct, 100)}%` }}></div>
                                   </div>
                                </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </section>
        </div>

        {/* KOTAK LIVE RECEIPT PREVIEW */}
        {receiptPreview && (
          <div id="thermal-preview-section" className="bg-slate-100 rounded-lg p-6 border border-slate-300 flex flex-col items-center justify-center gap-4 transition-all animate-fadeIn">
            <div className="w-full flex justify-between items-center max-w-[400px]">
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                <Printer className="w-3.5 h-3.5 text-emerald-600" /> Live Receipt Preview (Murni Baris Input)
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] px-2.5 py-1 rounded font-bold flex items-center gap-1 transition-colors"
                >
                  Print Struk
                </button>
                <button 
                  onClick={() => setReceiptPreview(null)}
                  className="bg-slate-300 hover:bg-slate-400 text-slate-700 text-[11px] p-1 rounded transition-colors"
                  title="Tutup Preview"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            
            {/* Render Box Kertas Thermal */}
            <div className="bg-white text-black p-4 font-mono text-[11px] leading-tight w-[100%] max-w-[400px] border border-slate-300 shadow-md uppercase">
              <div className="text-center">
                <p className="font-bold border-b border-dashed border-black pb-1">
                  DOKUMEN VALID Ref: INB-MULTI-SPLIT
                </p>
                <p className="font-bold tracking-wide pt-1 text-xs">
                  TERIMA BARANG (INBOUND)
                </p>
              </div>

              <div className="border-b border-dashed border-black my-2"></div>

              <div className="space-y-1 text-left text-[10px]">
                <p><span className="font-bold">WAKTU VALIDASI SUKSES:</span></p>
                <p className="pl-2 mb-1 font-sans">{receiptPreview.date}</p>
                <p><span className="font-bold">OPERATOR GUDANG:</span></p>
                <p className="pl-2">{receiptPreview.operator}</p>
              </div>

              <div className="border-b border-dashed border-black my-2"></div>

              <p className="font-bold text-left text-[10px] mb-1.5">
                DAFTAR HASIL DISTRIBUSI MULTI-RAK (PUTAWAY ALOKASI):
              </p>

              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-black align-bottom">
                    <th className="py-1 font-bold w-[25%]">KODE<br />BARANG</th>
                    <th className="py-1 font-bold w-[30%]">NAMA<br />PRODUK</th>
                    <th className="py-1 font-bold text-center w-[15%]">KUANTITAS<br />MASUK</th>
                    <th className="py-1 font-bold text-center w-[15%]">VOLUME<br />TERPAKAI</th>
                    <th className="py-1 font-bold text-right w-[15%]">TARGET<br />SLOT<br />RAK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-300">
                  {receiptPreview.rows.map((item, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="py-1.5 font-bold break-all pr-1">{item.sku}</td>
                      <td className="py-1.5 truncate max-w-[80px] pr-1">{item.name}</td>
                      <td className="py-1.5 text-center font-bold">{item.qty} PCS</td>
                      <td className="py-1.5 text-center text-slate-700 font-sans">{item.volume.toFixed(3)} m³</td>
                      <td className="py-1.5 text-right font-bold break-all text-emerald-700">{item.locatorId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-b border-dashed border-black my-3"></div>

              <div className="grid grid-cols-2 text-center text-[10px] mt-4 pt-1 gap-4">
                <div className="flex flex-col justify-between h-14">
                  <p className="font-bold">PETUGAS GUDANG</p>
                  <div className="border-t border-black w-full pt-1 truncate">{receiptPreview.operator}</div>
                </div>
                <div className="flex flex-col justify-between h-14">
                  <p className="font-bold">ADMIN GUDANG</p>
                  <div className="border-t border-black w-full pt-1">ADMIN</div>
                </div>
              </div>

              <div className="text-center text-[9px] text-slate-500 mt-6 pt-1 border-t border-dashed border-black normal-case italic">
                * Dokumen ini dicetak otomatis melalui sistem thermal WMS *
              </div>
            </div>
          </div>
        )}

        {/* RIWAYAT TRANSAKSI INBOUND (KONSOLIDASI 1 BARIS PER BATCH) */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#0F294D] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1 h-4 bg-slate-700 block rounded"></span>
                Riwayat Transaksi Inbound Gudang
              </h3>
              <p className="text-[11px] text-slate-500">Daftar manifest log masuk dikonsolidasikan berdasarkan batch transaksi.</p>
            </div>
            
            <select 
               className="text-xs border-slate-300 rounded p-1"
               value={historyPageSize} 
               onChange={(e) => {
                 setHistoryPageSize(Number(e.target.value));
                 setHistoryCurrentPage(1);
               }}
            >
               <option value={30}>30/halaman</option>
               <option value={50}>50/halaman</option>
               <option value={100}>100/halaman</option>
            </select>
          </div>
          
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="p-2.5">Waktu Transaksi</th>
                  <th className="p-2.5">Kode Barang</th>
                  <th className="p-2.5 text-center">Total Qty</th>
                  <th className="p-2.5">Alokasi Slot Rak</th>
                  <th className="p-2.5">Operator</th>
                  <th className="p-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {currentHistoryData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400 italic">Belum ada data transaksi masuk.</td>
                  </tr>
                ) : (
                  <>
                    {currentHistoryData.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-2.5 whitespace-nowrap font-sans text-slate-500">
                          {new Date(tx.timestamp).toLocaleString('id-ID')}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-blue-700">{tx.sku}</td>
                        <td className="p-2.5 text-center font-bold text-slate-800">{tx.qty} PCS</td>
                        <td className="p-2.5 font-bold text-emerald-700 max-w-xs truncate" title={tx.locatorId}>
                          {tx.locatorId}
                        </td>
                        <td className="p-2.5 text-slate-600 uppercase text-[11px]">{tx.operator || 'SYSTEM'}</td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handlePreviewHistorical(tx)}
                              className="inline-flex items-center gap-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 px-2.5 py-1 rounded text-[11px] font-semibold border border-slate-200 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Preview Struk
                            </button>
                            {isSuperAdmin && (
                              <button
                                onClick={() => handleDeleteHistorical(tx.timestamp)}
                                className="inline-flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 px-2 py-1 rounded text-[11px] font-bold border border-red-200 transition-colors"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="w-3 h-3" />
                                Hapus
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-800">
                      <td colSpan={2} className="p-2.5 text-right uppercase tracking-wider">Grand Total Inbound:</td>
                      <td className="p-2.5 text-center text-blue-700 text-sm">{consolidatedHistoryList.reduce((sum, tx) => sum + tx.qty, 0)} PCS</td>
                      <td colSpan={3} className="p-2.5"></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          {totalHistoryPages > 1 && (
            <div className="flex justify-end items-center mt-4 gap-2 text-xs">
              <button 
                disabled={historyCurrentPage === 1}
                onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
                className="px-2 py-1 border border-slate-300 rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span>Halaman {historyCurrentPage} dari {totalHistoryPages}</span>
              <button 
                disabled={historyCurrentPage === totalHistoryPages}
                onClick={() => setHistoryCurrentPage(p => Math.min(totalHistoryPages, p + 1))}
                className="px-2 py-1 border border-slate-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>

      {/* 2. AREA BACKEND WINDOW PRINT */}
      {receiptPreview && (
        <div className="hidden print:block bg-white text-black p-0 font-mono text-[11px] leading-tight w-[76mm] mx-auto uppercase tracking-tight">
          <div className="text-center">
            <p className="font-bold border-b border-dashed border-black pb-1">
              DOKUMEN VALID Ref: INB-MULTI-SPLIT
            </p>
            <p className="font-bold tracking-wide pt-1 text-xs">
              TERIMA BARANG (INBOUND)
            </p>
          </div>

          <div className="border-b border-dashed border-black my-2"></div>

          <div className="space-y-1 text-left text-[10px]">
            <p><span className="font-bold">WAKTU VALIDASI SUKSES:</span></p>
            <p className="pl-2 mb-1 font-sans">{receiptPreview.date}</p>
            <p><span className="font-bold">OPERATOR GUDANG:</span></p>
            <p className="pl-2">{receiptPreview.operator}</p>
          </div>

          <div className="border-b border-dashed border-black my-2"></div>

          <p className="font-bold text-left text-[10px] mb-1.5">
            DAFTAR HASIL DISTRIBUSI MULTI-RAK (PUTAWAY ALOKASI):
          </p>

          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-black align-bottom">
                <th className="py-1 font-bold w-[25%]">KODE<br />BARANG</th>
                <th className="py-1 font-bold w-[30%]">NAMA<br />PRODUK</th>
                <th className="py-1 font-bold text-center w-[15%]">KUANTITAS<br />MASUK</th>
                <th className="py-1 font-bold text-center w-[15%]">VOLUME<br />TERPAKAI</th>
                <th className="py-1 font-bold text-right w-[15%]">TARGET<br />SLOT<br />RAK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-gray-400">
              {receiptPreview.rows.map((item, idx) => (
                <tr key={idx} className="align-top">
                  <td className="py-1.5 font-bold break-all pr-1">{item.sku}</td>
                  <td className="py-1.5 truncate max-w-[75px] pr-1">{item.name}</td>
                  <td className="py-1.5 text-center font-bold">{item.qty}</td>
                  <td className="py-1.5 text-center font-sans">{item.volume.toFixed(3)}</td>
                  <td className="py-1.5 text-right font-bold break-all">{item.locatorId}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-b border-dashed border-black my-3"></div>

          <div className="grid grid-cols-2 text-center text-[10px] mt-4 pt-1 gap-4 page-break-inside-avoid">
            <div className="flex flex-col justify-between h-14">
              <p className="font-bold">PETUGAS GUDANG</p>
              <div className="border-t border-black w-full pt-1 truncate">{receiptPreview.operator}</div>
            </div>
            <div className="flex flex-col justify-between h-14">
              <p className="font-bold">ADMIN GUDANG</p>
              <div className="border-t border-black w-full pt-1">ADMIN</div>
            </div>
          </div>

          <div className="text-center text-[9px] text-gray-600 mt-6 pt-1 border-t border-dashed border-black normal-case italic">
            * Dokumen ini dicetak otomatis melalui sistem thermal WMS *
          </div>
        </div>
      )}

      {showScanner && (
        <QRScanner 
          onScan={(text) => {
            const found = products.find(p => p.sku === text || (p as any).barcode === text);
            if (found) {
              setSelectedSku(found.sku);
              setShowScanner(false);
              setMessage({ type: 'success', text: `Berhasil scan Kode: ${found.sku}` });
            } else {
              setMessage({ type: 'error', text: `Kode atau Barcode tidak ditemukan: ${text}` });
              setShowScanner(false);
            }
          }} 
          onClose={() => setShowScanner(false)} 
        />
      )}

    </div>
  );
}