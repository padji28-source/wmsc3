import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Map } from 'lucide-react';
import { Locator, Product, ZoneCategory } from '../types';
import { getLocators, getProducts, getInventoryDetails } from '../lib/db';

interface LocatorStat {
  usedVol: number;
  maxVol: number;
  percentage: number;
  items: { sku: string; name: string; qty: number }[];
}

// Interface baru untuk mengunci tipe data tooltip hover agar tidak error
interface HoveredSlotState extends LocatorStat {
  locId: string;
  zoneLabel: string;
  totalWeight: number;
  x: number;
  y: number;
}

const ZONE_COLORS: Record<ZoneCategory | string, { text: string; bg: string; border: string; label: string }> = {
  'PLUMBING': { text: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Plumbing (R1 & Floor A-B)' },
  'FILTER': { text: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Filter (R2, R3 & R4)' },
  'SMART_WATER': { text: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Smart Water (R5 & Floor E-F)' },
  'FITTING': { text: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Fitting (R6 & Floor E-F)' },
  'PACKAGING_MATERIALS': { text: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Packaging & Aksesoris (R7)' },
  'VALVE_FILTER_PART_MESIN': { text: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', label: 'Oto Valve, Water Filter, Part Mesin (R8)' },
  'OTHER_CATEGORIES': { text: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-200', label: 'Lainnya (R9)' },
  'DEFAULT': { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Buffer / General Storage' },
};

const RACK_LAYOUT = [
  { id: 'FL A-B', label: 'Lantai FL-A & FL-B (Zonasi PLUMBING)', racks: ['FL-A', 'FL-B'], zone: 'PLUMBING' },
  { id: 'FL C-D', label: 'Lantai FL-C & FL-D (Buffer / General)', racks: ['FL-C', 'FL-D'], zone: 'DEFAULT' },
  { id: 'FL E-F', label: 'Lantai FL-E & FL-F (Zonasi SMART WATER & FITTING)', racks: ['FL-E', 'FL-F'], zone: 'SMART_WATER' },
  { id: 'FL G-H', label: 'Lantai FL-G & FL-H (Buffer / General)', racks: ['FL-G', 'FL-H'], zone: 'DEFAULT' },
  { id: 'FL-I', label: 'Lantai FL-I (Buffer / General)', racks: ['FL-I'], zone: 'DEFAULT' },
  { id: 'R1', label: 'Rack R1 (PLUMBING)', zone: 'PLUMBING', racks: ['R1'] },
  { id: 'R2', label: 'Rack R2 (FILTER)', zone: 'FILTER', racks: ['R2'] },
  { id: 'R3', label: 'Rack R3 (FILTER)', zone: 'FILTER', racks: ['R3'] },
  { id: 'R4', label: 'Rack R4 (FILTER)', zone: 'FILTER', racks: ['R4'] },
  { id: 'R5', label: 'Rack R5 (SMART WATER)', zone: 'SMART_WATER', racks: ['R5'] },
  { id: 'R6', label: 'Rack R6 (FITTING)', zone: 'FITTING', racks: ['R6'] },
  { id: 'R7', label: 'Rack R7 (PACKAGING & FG Aksesoris)', zone: 'PACKAGING_MATERIALS', racks: ['R7'] },
  { id: 'R8', label: 'Rack R8 (FG Oto Valve, Water Filter & Part Mesin)', zone: 'VALVE_FILTER_PART_MESIN', racks: ['R8'] },
  { id: 'R9', label: 'Rack R9 (Kategori Lainnya / Sisanya)', zone: 'OTHER_CATEGORIES', racks: ['R9'] },
];

export function WarehouseVisualizer() {
  const [locators, setLocators] = useState<Locator[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<any>({});
  const [selectedRack, setSelectedRack] = useState<string>('FL A-B');
  const [loading, setLoading] = useState(true);

  // State pelacak pergerakan dan penampung data untuk Tooltip Hover
  const [hoveredSlot, setHoveredSlot] = useState<HoveredSlotState | null>(null);

  useEffect(() => {
    Promise.all([
      getLocators(),
      getProducts(),
      getInventoryDetails()
    ]).then(([locData, prodData, invData]) => {
      setLocators(locData);
      setProducts(prodData);
      setInventory(invData);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  const stats = useMemo(() => {
    const s: Record<string, LocatorStat> = {};
    locators.forEach(l => {
      s[l.id] = { usedVol: 0, maxVol: l.maxVolumeM3, percentage: 0, items: [] };
    });

    Object.entries(inventory).forEach(([sku, data]: [string, any]) => {
      const prod = products.find(p => p.sku === sku);
      const volPerUnit = prod ? prod.volumeM3 : 0;
      
      Object.entries(data.locators).forEach(([locId, locData]: [string, any]) => {
        const qty = locData.physicalQty;
        if (qty > 0 && s[locId]) {
          s[locId].usedVol += (qty * volPerUnit);
          s[locId].items.push({ sku, name: prod?.name || 'Unknown', qty });
        }
      });
    });

    // Calculate percentages
    Object.values(s).forEach(stat => {
      stat.percentage = Math.min(100, Math.round((stat.usedVol / stat.maxVol) * 100));
    });

    return s;
  }, [inventory, locators, products]);

  // Fungsi pengontrol aksi kursor masuk, bergeser, dan keluar area slot
  const handleSlotMouseEnter = (e: React.MouseEvent, locId: string, stat: LocatorStat, zoneLabel: string, rackPrefix: string) => {
    // Kalkulasi perkiraan berat (safety fallback seberat 2.5 Kg per item jika data produk kosong)
    const calculatedWeight = stat.items.reduce((acc, current) => {
      const prod = products.find(p => p.sku === current.sku);
      const weightPerUnit = prod && (prod as any).weightKg ? (prod as any).weightKg : 2.5; 
      return acc + (current.qty * weightPerUnit);
    }, 0);

    // Format ID visual seperti pada gambar screenshot (contoh: R1-A1.1 atau FL-A1.1)
    const cleanCol = locId.split('.')[0];
    const cleanLvl = locId.split('.')[1];
    const formattedLocId = selectedRack.startsWith('FL') 
      ? `${cleanCol}.${cleanLvl}` 
      : `${rackPrefix}-${cleanCol}.${cleanLvl}`;

    setHoveredSlot({
      locId: formattedLocId,
      zoneLabel,
      totalWeight: calculatedWeight,
      ...stat,
      x: e.clientX,
      y: e.clientY
    });
  };

  const handleSlotMouseMove = (e: React.MouseEvent) => {
    if (hoveredSlot) {
      setHoveredSlot(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    }
  };

  const handleSlotMouseLeave = () => {
    setHoveredSlot(null);
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
    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden font-sans shadow-sm relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-800 uppercase">
              Visualisasi Zonasi Layout & Raks (Gudang C3)
            </h2>
            <p className="text-xs text-slate-500">Klik Rak pada denah lantai untuk membuka elevasi rak (Front View Grid) & detail slot locator.</p>
          </div>
        </div>
        
        {/* Legend Map */}
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {Object.entries(ZONE_COLORS).map(([key, val]) => {
            if (key === 'DEFAULT') return null;
            return (
              <span key={key} className={`px-2 py-1 ${val.bg} ${val.text} ${val.border} border rounded text-[10px] font-bold uppercase tracking-wider`}>
                {val.label}
              </span>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">Memuat data visualisasi...</div>
      ) : (
        <div className="flex flex-col xl:flex-row min-h-[600px]">
          
          {/* Left Panel - 2D Floor Plan */}
          <div className="w-full xl:w-80 bg-white border-b xl:border-b-0 xl:border-r border-slate-200 p-5 shrink-0 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase">Denah Lantai (Floor Plan)</h3>
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
                    disabled={(rack as any).static}
                    className={`flex flex-col items-start p-3 border rounded-lg transition-all text-left ${isActive ? 'ring-2 ring-indigo-500 shadow-sm ' + colors.border : 'border-slate-200 hover:border-slate-300'} ${(rack as any).static ? 'bg-slate-50 opacity-70 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
                  >
                    <span className={`text-sm font-bold ${colors.text}`}>{rack.id}</span>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">{rack.label}</span>
                  </button>
                );
              })}
              
              <div className="col-span-full mt-2">
                <div className="w-full py-2 bg-slate-100 border border-slate-200 border-dashed rounded text-center text-[10px] font-bold text-slate-400 tracking-widest">
                  LANE / GANGWAY AKSES FORKLIFT (CLEARANCE ZONE)
                </div>
                <div className="flex justify-center gap-2 mt-2">
                  <span className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-[10px] font-bold">IN/OUT GATE</span>
                  <span className="px-3 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-[10px] font-bold">DISPATCH BAY</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span> Beban Aman (0 - 70% Terpakai)
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-amber-400"></span> Beban Tinggi (70% - 95% Terpakai)
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span> Kritis / Maksimum (95% - 100% Terpakai)
              </div>
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
                  <div key={level} className="flex relative">
                    {/* Level Label */}
                    <div className="w-16 shrink-0 flex items-center justify-end pr-4 text-xs font-bold text-slate-400">
                      Level {level}
                    </div>

                    {/* Columns */}
                    <div className="flex gap-4">
                      {columns.map(col => {
                        const locId = `${col}.${level}`;
                        const stat = stats[locId] || { usedVol: 0, maxVol: 5.4, percentage: 0, items: [] };
                        const isVacant = stat.percentage === 0;
                        const borderColor = getBorderUtilColor(stat.percentage);

                        return (
                          <div key={locId} className="w-[190px] flex flex-col items-center">
                            {/* Slot Card */}
                            <div 
                              onMouseEnter={(e) => handleSlotMouseEnter(e, locId, stat, ZONE_COLORS[rackZone]?.label || 'General', selectedRack)}
                              onMouseMove={handleSlotMouseMove}
                              onMouseLeave={handleSlotMouseLeave}
                              className={`w-full bg-white border-2 ${borderColor} rounded-[10px] p-3 shadow-sm relative overflow-hidden transition-all hover:shadow-md cursor-crosshair h-[140px] flex flex-col justify-between`}
                            >
                              
                              {/* Slot ID & % */}
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-slate-800 text-sm">{(col as string).replace('FL-', '')}.{level}</span>
                                <span className={`text-[11px] font-bold ${stat.percentage >= 95 ? 'text-rose-600' : 'text-slate-400'}`}>
                                  {stat.percentage}%
                                </span>
                              </div>

                              {/* Content */}
                              <div className="flex-1 flex flex-col justify-center my-1 text-left w-full">
                                {isVacant ? (
                                  <div className="flex items-center justify-center h-full">
                                    <span className="text-sm italic font-bold text-slate-200 tracking-widest uppercase">Vacant</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-xs font-bold text-slate-800 truncate w-full" title={stat.items[0]?.name}>
                                      {stat.items[0]?.sku}
                                    </div>
                                    <div className="text-xs font-medium text-slate-500 mt-0.5 mt-1">
                                      {stat.items.map(i => i.qty).reduce((a,b)=>a+b,0)} PCS
                                      {stat.items.length > 1 && <span className="text-indigo-500 ml-1 font-bold">+{stat.items.length - 1} Mix</span>}
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Progress bar */}
                              <div className="mt-auto">
                                <div className="h-[3px] w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full transition-all duration-500 ${getUtilColor(stat.percentage)}`} style={{ width: `${stat.percentage}%` }}></div>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                  <span className="text-[10px] font-bold text-slate-400">{stat.usedVol.toFixed(2)} m³</span>
                                  <span className="text-[10px] font-bold text-slate-300">{stat.maxVol.toFixed(1)} m³ Max</span>
                                </div>
                              </div>
                            </div>

                            {/* Beam representation directly under card */}
                            <div className="w-[92%] h-2.5 bg-slate-800 rounded-full mt-2.5 relative shadow-sm"></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-[10px] font-mono font-medium text-slate-400 uppercase tracking-widest">
              <span>Rack Sill Beam (Tie Beam Protection Flange)</span>
              <span>MAX 5.4 m³ (Maksimal 2 Pallet @ 2.7 m³ per level)</span>
            </div>

          </div>
        </div>
      )}

      {/* RENDER MODAL TOOLTIP SEPERTI PADA GAMBAR SCREENSHOT */}
      {hoveredSlot && (
        <div 
          className="fixed pointer-events-none z-50 bg-white text-slate-800 p-4 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 w-64 flex flex-col font-sans"
          style={{ 
            left: `${hoveredSlot.x + 12}px`, 
            top: `${hoveredSlot.y + 12}px` 
          }}
        >
          {/* Header Identitas Locator */}
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-slate-700">
              Locator: <span className="font-mono text-slate-900 font-black">{hoveredSlot.locId}</span>
            </span>
            <span className={`text-xs font-bold ${hoveredSlot.percentage >= 95 ? 'text-rose-600' : 'text-emerald-500'}`}>
              {hoveredSlot.percentage}% Load
            </span>
          </div>

          <div className="space-y-1 text-xs font-medium text-slate-500 border-b border-slate-100 pb-3">
            <div>
              Kategori Rencana: <span className="text-slate-700 font-semibold">{hoveredSlot.zoneLabel}</span>
            </div>
            <div>
              Total Volume: <span className="text-slate-900 font-bold font-mono">{hoveredSlot.usedVol.toFixed(3)} m³</span> / {hoveredSlot.maxVol.toFixed(1)} m³
            </div>
            <div>
              Total Berat: <span className="text-slate-900 font-bold font-mono">{hoveredSlot.totalWeight.toFixed(1)} Kg</span> <span className="text-[10px] text-slate-400 font-normal">(Safety Fallback)</span>
            </div>
          </div>

          {/* Konten Daftar Isi Stok */}
          <div className="mt-3">
            <div className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase mb-2">
              Daftar Isi Stok:
            </div>
            
            {hoveredSlot.items.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-1 tracking-wide">
                VACANT / KOSONG
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {hoveredSlot.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center bg-slate-50 px-2 py-1.5 rounded border border-slate-100 font-mono text-xs">
                    <span className="font-bold text-indigo-600 truncate max-w-[130px]" title={item.sku}>
                      {item.sku}
                    </span>
                    <span className="font-black text-slate-800 text-right bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {item.qty} <span className="text-[10px] text-slate-400 font-bold">Qty</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
