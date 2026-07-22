import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Layers, Map, AlertTriangle, GripVertical, CheckCircle2 } from 'lucide-react';
import { getLocators, getProducts, getInventoryDetails, transferInventory, getAlowedRacksForCategory } from '../lib/db';
import { Locator, Product, ZoneCategory } from '../types';
import { getCurrentUser } from '../lib/auth';

interface DragItem {
  sku: string;
  fromLocatorId: string;
  maxQty: number;
  productName: string;
  volumeM3: number;
}

const ZONE_COLORS: Record<ZoneCategory | string, { text: string; bg: string; border: string; label: string }> = {
  'PLUMBING': { text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Plumbing (R1, R2 & Floor A-B)' },
  'FG_PLUMBING': { text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Plumbing (R1, R2 & Floor A-B)' },
  'FILTER': { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Filter (R3)' },
  'SMART_WATER': { text: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Smart Water (R4 & Floor E-F)' },
  'FITTING': { text: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Fitting (R5 & Floor E-F)' },
  'PACKAGING_MATERIALS': { text: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Packaging & Aksesoris (R6)' },
  'VALVE_FILTER_PART_MESIN': { text: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', label: 'Oto Valve, Water Filter, Part Mesin (R7)' },
  'OTHER_CATEGORIES': { text: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', label: 'Lainnya (R8)' },
  'DEFAULT': { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Buffer / General Storage' },
};

const RACK_LAYOUT = [
  { id: 'FL A-B', label: 'Lantai FL-A & FL-B (Zonasi PLUMBING)', racks: ['FL-A', 'FL-B'], zone: 'PLUMBING' },
  { id: 'FL C-D', label: 'Lantai FL-C & FL-D (Buffer / General)', racks: ['FL-C', 'FL-D'], zone: 'DEFAULT' },
  { id: 'FL E-F', label: 'Lantai FL-E & FL-F (Zonasi SMART WATER & FITTING)', racks: ['FL-E', 'FL-F'], zone: 'SMART_WATER' },
  { id: 'FL G-H', label: 'Lantai FL-G & FL-H (Buffer / General)', racks: ['FL-G', 'FL-H'], zone: 'DEFAULT' },
  { id: 'FL-I', label: 'Lantai FL-I (Buffer / General)', racks: ['FL-I'], zone: 'DEFAULT' },
  { id: 'R1', label: 'Rack R1 (PLUMBING)', zone: 'PLUMBING', racks: ['R1'] },
  { id: 'R2', label: 'Rack R2 (PLUMBING)', zone: 'PLUMBING', racks: ['R2'] },
  { id: 'R3', label: 'Rack R3 (FILTER)', zone: 'FILTER', racks: ['R3'] },
  { id: 'R4', label: 'Rack R4 (SMART WATER)', zone: 'SMART_WATER', racks: ['R4'] },
  { id: 'R5', label: 'Rack R5 (FITTING)', zone: 'FITTING', racks: ['R5'] },
  { id: 'R6', label: 'Rack R6 (PACKAGING & FG Aksesoris)', zone: 'PACKAGING_MATERIALS', racks: ['R6'] },
  { id: 'R7', label: 'Rack R7 (FG Oto Valve, Water Filter & Part Mesin)', zone: 'VALVE_FILTER_PART_MESIN', racks: ['R7'] },
  { id: 'R8', label: 'Rack R8 (Kategori Lainnya / Sisanya)', zone: 'OTHER_CATEGORIES', racks: ['R8'] },
];

export const MovingRack = () => {
  const [locators, setLocators] = useState<Locator[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [inventory, setInventory] = useState<any>({});
  const [loading, setLoading] = useState(true);

  // Layout View State
  const [selectedRack, setSelectedRack] = useState<string>('FL A-B');

  // Drag State
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transferData, setTransferData] = useState<{
    sku: string;
    productName: string;
    fromLocatorId: string;
    toLocatorId: string;
    maxQty: number;
    qtyToMove: number;
    volumeM3: number;
    destinationMaxVolume: number;
    destinationUsedVolume: number;
  } | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lData, pData, iData] = await Promise.all([
        getLocators(),
        getProducts(),
        getInventoryDetails()
      ]);
      setLocators(lData);
      
      const pMap: Record<string, Product> = {};
      pData.forEach(p => pMap[p.sku] = p);
      setProducts(pMap);
      setInventory(iData);
    } catch (err) {
      console.error("Gagal mengambil data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const s: Record<string, { usedVol: number; maxVol: number; percentage: number; items: { sku: string; name: string; qty: number; product: Product }[] }> = {};
    locators.forEach(l => {
      s[l.id] = { usedVol: 0, maxVol: l.maxVolumeM3, percentage: 0, items: [] };
    });

    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const prod = products[sku];
      if (!prod) return;
      const volPerUnit = prod.volumeM3;
      
      Object.entries(data.locators).forEach(([locId, locData]: [string, any]) => {
        const qty = locData.physicalQty;
        if (qty > 0 && s[locId]) {
          s[locId].usedVol += (qty * volPerUnit);
          s[locId].items.push({ sku, name: prod.name, qty, product: prod });
        }
      });
    });

    Object.values(s).forEach(stat => {
      stat.percentage = Math.min(100, Math.round((stat.usedVol / stat.maxVol) * 100));
    });

    return s;
  }, [inventory, locators, products]);

  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    e.stopPropagation(); // prevent drag bubbling if any
    setDraggedItem(item);
    e.dataTransfer.setData('text/plain', item.sku); // required for firefox
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // allow drop
  };

  const handleDragEnterRackButton = (e: React.DragEvent, rackId: string) => {
    e.preventDefault();
    if (draggedItem) {
      setSelectedRack(rackId); // Auto switch rack while dragging
    }
  };

  const handleDrop = (e: React.DragEvent, toLocatorId: string) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.fromLocatorId === toLocatorId) {
      setDraggedItem(null);
      return; 
    }

    const destinationLocator = locators.find(l => l.id === toLocatorId);
    if (!destinationLocator) return;

    // Validate zoning rules first
    const product = products[draggedItem.sku];
    if (product) {
      const allowedRacks = getAlowedRacksForCategory(product.category);
      if (!allowedRacks.includes(destinationLocator.rack)) {
        setError(`Target Slot ${toLocatorId} (Rak ${destinationLocator.rack}) tidak sesuai dengan aturan zonasi baru untuk Kategori "${product.category}".`);
        setDraggedItem(null);
        return;
      }
    }

    let destUsedVol = stats[toLocatorId]?.usedVol || 0;

    const availableVol = Math.max(0, destinationLocator.maxVolumeM3 - destUsedVol);
    const fitQty = draggedItem.volumeM3 > 0 ? Math.floor(availableVol / draggedItem.volumeM3) : draggedItem.maxQty;
    const finalMaxQty = Math.min(draggedItem.maxQty, fitQty);
    const defaultQty = Math.min(1, finalMaxQty);

    setTransferData({
      sku: draggedItem.sku,
      productName: draggedItem.productName,
      fromLocatorId: draggedItem.fromLocatorId,
      toLocatorId: toLocatorId,
      maxQty: finalMaxQty,
      qtyToMove: defaultQty,
      volumeM3: draggedItem.volumeM3,
      destinationMaxVolume: destinationLocator.maxVolumeM3,
      destinationUsedVolume: destUsedVol
    });
    
    setIsModalOpen(true);
    setDraggedItem(null);
    setError('');
    setSuccess('');
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferData) return;

    setSaving(true);
    setError('');
    
    try {
      const user = getCurrentUser();
      await transferInventory(
        transferData.sku,
        transferData.fromLocatorId,
        transferData.toLocatorId,
        transferData.qtyToMove,
        user?.name || 'System'
      );
      
      setSuccess(`Berhasil memindahkan ${transferData.qtyToMove} ${transferData.productName} ke ${transferData.toLocatorId}`);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Gagal melakukan pemindahan barang');
    } finally {
      setSaving(false);
    }
  };

  // Derive rack specific data for the Right Panel
  const selectedConfig = RACK_LAYOUT.find(r => r.id === selectedRack);
  const rackLocators = locators.filter(l => selectedConfig?.racks?.includes(l.rack) ?? false);
  const rackZone = selectedConfig?.zone || 'DEFAULT';
  const columns = Array.from(new Set(rackLocators.map(l => l.column as string))).sort((a, b) => (a as string).localeCompare(b as string, undefined, { numeric: true }));
  const isFloatingRack = selectedRack.startsWith('FL');
  const maxLevel = isFloatingRack ? 2 : (rackLocators.length > 0 ? Math.max(...rackLocators.map(l => l.level)) : 4);
  const levels = Array.from({length: maxLevel}, (_, i) => maxLevel - i);

  const totalRackVolume = rackLocators.reduce((sum, l) => sum + l.maxVolumeM3, 0);
  const usedRackVolume = rackLocators.reduce((sum, l) => sum + (stats[l.id]?.usedVol || 0), 0);

  const getUtilColor = (pct: number) => {
    if (pct >= 95) return 'bg-rose-500';
    if (pct >= 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const getBorderUtilColor = (pct: number) => {
    if (pct >= 95) return 'border-rose-500';
    if (pct >= 70) return 'border-amber-400';
    if (pct > 0) return 'border-emerald-400';
    return 'border-slate-200';
  };

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-blue-600" />
            Moving Rack
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Pindahkan barang antar rak. Drag barang dari rak asal dan lepaskan di rak tujuan. Tahan item di atas Denah Lantai untuk berganti Rak.
          </p>
        </div>
      </div>

      {error && !isModalOpen && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {error}
        </div>
      )}

      {success && !isModalOpen && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Visualizer Container */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden font-sans shadow-sm relative text-slate-800">
        {loading ? (
          <div className="p-12 text-center text-slate-500 animate-pulse">Memuat data visualisasi...</div>
        ) : (
          <div className="flex flex-col xl:flex-row min-h-[600px]">
            {/* Left Panel - 2D Floor Plan */}
            <div className="w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-r border-slate-200 p-5 shrink-0 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase">Denah Lantai</h3>
                <span className="px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded text-[10px] font-bold">2D MAP</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-2 gap-3 flex-1">
                {RACK_LAYOUT.map(rack => {
                  const colors = ZONE_COLORS[rack.zone] || ZONE_COLORS['DEFAULT'];
                  const isActive = selectedRack === rack.id;
                  return (
                    <button
                      key={rack.id}
                      onClick={() => !(rack as any).static && setSelectedRack(rack.id)}
                      onDragEnter={(e) => !(rack as any).static ? handleDragEnterRackButton(e, rack.id) : undefined}
                      onDragOver={(e) => e.preventDefault()} // necessary for dragEnter to trigger appropriately without cursor dropping effect
                      disabled={(rack as any).static}
                      className={`flex flex-col items-start p-3 border rounded-lg transition-all text-left ${isActive ? 'ring-2 ring-indigo-500 shadow-sm ' + colors.border : 'border-slate-200 hover:border-slate-300'} ${(rack as any).static ? 'bg-slate-50 opacity-70 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
                    >
                      <span className={`text-sm font-bold ${colors.text}`}>{rack.id}</span>
                      <span className="text-[10px] text-slate-500 mt-1 leading-tight">{rack.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-xs font-bold text-center leading-relaxed">
                Tip: Tahan drag barang Anda dan arahkan (hover) kursor ke tombol rak ini untuk berpindah ke tampilan rak yang berbeda!
              </div>
            </div>

            {/* Right Panel - Rack Elevation */}
            <div className="flex-1 bg-white p-6 overflow-hidden flex flex-col">
              {/* Elevation Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 flex flex-wrap items-center gap-2">
                    <Map className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span>ELEVASI DEPAN (FRONT VIEW) RAK: RACK {selectedRack}</span>
                    <span className="text-slate-400 text-xs sm:text-sm font-mono font-normal">({columns[0]} - {columns[columns.length - 1]})</span>
                  </h3>
                  {selectedRack.startsWith('FL') ? null : (
                    <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
                      Kategori Zona: <span className={`font-bold ${ZONE_COLORS[rackZone]?.text || ''}`}>{ZONE_COLORS[rackZone]?.label}</span>
                    </p>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-left sm:text-right w-full sm:w-auto shrink-0">
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Volume Terpakai</p>
                  <p className="text-xs sm:text-sm font-mono font-bold text-slate-800">
                    {usedRackVolume.toFixed(2)} m³ / {totalRackVolume.toFixed(1)} m³
                  </p>
                </div>
              </div>

              {/* Grid Container */}
              <div className="flex-1 overflow-auto bg-slate-50/30 rounded-xl border border-slate-100 p-4">
                <div className="inline-flex flex-col gap-6 w-max min-w-full pb-4">
                  {levels.map(level => (
                    <div key={level} className="flex relative items-stretch">
                      {/* Level Label */}
                      <div className="w-16 shrink-0 flex items-center justify-end pr-4 text-xs font-bold text-slate-400">
                        Level {level}
                      </div>

                      {/* Columns */}
                      <div className="flex gap-4">
                        {columns.map(col => {
                          const locId = `${col}.${level}`;
                          const stat = stats[locId] || { usedVol: 0, maxVol: 5.4, percentage: 0, items: [] };
                          const isVacant = stat.items.length === 0;
                          const borderColor = getBorderUtilColor(stat.percentage);

                          return (
                            <div key={locId} className="w-[200px] flex flex-col items-center">
                              {/* Slot Card - Drop Target */}
                              <div 
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, locId)}
                                className={`w-full bg-white border-2 ${borderColor} rounded-[10px] p-3 shadow-sm relative transition-all hover:shadow-md h-[180px] flex flex-col justify-between`}
                              >
                                {/* Slot ID & % */}
                                <div className="flex justify-between items-start mb-2 shrink-0">
                                  <span className="font-bold text-slate-800 text-sm">{(col as string).replace('FL-', '')}.{level}</span>
                                  <span className={`text-[11px] font-bold ${stat.percentage >= 95 ? 'text-rose-600' : 'text-slate-400'}`}>
                                    {stat.percentage}%
                                  </span>
                                </div>

                                {/* Content - Draggable Items */}
                                <div className="flex-1 overflow-y-auto mb-2 text-left w-full pr-1 font-sans space-y-1.5 custom-scrollbar">
                                  {isVacant ? (
                                    <div className="flex items-center justify-center h-full">
                                      <span className="text-[10px] italic font-bold text-slate-300 tracking-widest uppercase">Kosong (Drop Item)</span>
                                    </div>
                                  ) : (
                                    stat.items.map((item, idx) => (
                                      <div 
                                        key={idx}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, {
                                          sku: item.sku,
                                          fromLocatorId: locId,
                                          maxQty: item.qty,
                                          productName: item.name,
                                          volumeM3: item.product.volumeM3
                                        })}
                                        className="group bg-slate-50 border border-slate-200 p-2 rounded flex items-center gap-2 cursor-grab active:cursor-grabbing hover:border-blue-400 hover:bg-blue-50 transition-colors"
                                      >
                                        <div className="text-slate-300 group-hover:text-blue-500 shrink-0">
                                          <GripVertical className="w-3 h-3" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] font-bold text-slate-700 truncate" title={item.name}>{item.name}</div>
                                          <div className="text-[9px] text-slate-500 font-mono truncate">{item.sku}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="font-black text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded leading-none">{item.qty} PCS</div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>

                                {/* Progress bar */}
                                <div className="mt-auto shrink-0 pt-1">
                                  <div className="h-[3px] w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full transition-all duration-500 ${getUtilColor(stat.percentage)}`} style={{ width: `${stat.percentage}%` }}></div>
                                  </div>
                                  <div className="flex justify-between items-center mt-1">
                                    <span className="text-[9px] font-bold text-slate-400">{stat.usedVol.toFixed(2)} m³</span>
                                    <span className="text-[9px] font-bold text-slate-300">{stat.maxVol.toFixed(1)} m³ Max</span>
                                  </div>
                                </div>
                              </div>
                              {/* Beam representation */}
                              <div className="w-[92%] h-2.5 bg-slate-800 rounded-full mt-2.5 relative shadow-sm"></div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {isModalOpen && transferData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
              <h3 className="text-lg font-black text-blue-800 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                Konfirmasi Pindah Barang
              </h3>
            </div>
            
            <form onSubmit={handleTransferSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500 font-semibold mb-1">Barang yang dipindah:</div>
                  <div className="font-bold text-slate-800">{transferData.productName}</div>
                  <div className="text-xs text-slate-500 font-mono">{transferData.sku}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Rak Asal</label>
                    <div className="font-bold text-slate-700 border border-slate-200 rounded bg-slate-50 px-3 py-2 text-center text-sm">{transferData.fromLocatorId}</div>
                  </div>
                  <ArrowRightLeft className="w-5 h-5 text-slate-300" />
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Rak Tujuan</label>
                    <div className="font-bold text-blue-700 border border-blue-200 rounded bg-blue-50 px-3 py-2 text-center text-sm">{transferData.toLocatorId}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex justify-between">
                    <span>Jumlah (QTY)</span>
                    <span className="text-blue-600">Maks: {transferData.maxQty}</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={transferData.maxQty}
                    required
                    disabled={transferData.maxQty === 0}
                    value={transferData.qtyToMove}
                    onChange={(e) => {
                      const qty = parseInt(e.target.value) || 0;
                      setTransferData({ ...transferData, qtyToMove: Math.min(transferData.maxQty, Math.max(1, qty)) });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-lg text-center font-black bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  
                  {/* Volume Check */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500 font-medium">Vol Tujuan (Terpakai):</span>
                      <span className="font-bold text-slate-700">{transferData.destinationUsedVolume.toFixed(2)} M³</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-500 font-medium">Vol Barang ({transferData.qtyToMove} pcs):</span>
                      <span className="font-bold text-blue-600">+{(transferData.qtyToMove * transferData.volumeM3).toFixed(2)} M³</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 mt-2">
                       <span className="text-slate-700 font-bold">Total Estimasi:</span>
                       <span className={`font-black ${(transferData.destinationUsedVolume + (transferData.qtyToMove * transferData.volumeM3)) > transferData.destinationMaxVolume ? 'text-red-600' : 'text-emerald-600'}`}>
                         {(transferData.destinationUsedVolume + (transferData.qtyToMove * transferData.volumeM3)).toFixed(2)} / {transferData.destinationMaxVolume.toFixed(2)} M³
                       </span>
                    </div>
                    {transferData.maxQty === 0 ? (
                      <div className="mt-2 text-xs text-red-600 font-bold flex items-start gap-1">
                         <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                         <span>Peringatan: Rak tujuan sudah penuh atau tidak cukup untuk menampung 1 pc barang ini.</span>
                      </div>
                    ) : (transferData.destinationUsedVolume + (transferData.qtyToMove * transferData.volumeM3)) > transferData.destinationMaxVolume && (
                      <div className="mt-2 text-xs text-red-600 font-bold flex items-start gap-1">
                         <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                         <span>Peringatan: Kapasitas rak tujuan tidak mencukupi (Overload). Pemindahan akan ditolak oleh sistem.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || transferData.maxQty === 0 || (transferData.destinationUsedVolume + (transferData.qtyToMove * transferData.volumeM3)) > transferData.destinationMaxVolume}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Memproses...' : 'Proses Pindah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

