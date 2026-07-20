import React, { useState, useEffect } from 'react';
import { Layers, Plus, Pencil, Trash2, X, Save, Search, RefreshCw, AlertTriangle, Printer, QrCode, Download, Upload, FileSpreadsheet } from 'lucide-react';
import QRCode from 'react-qr-code';
import { getLocators, addLocator, updateLocator, deleteLocator, addLocatorsBatch, deleteLocatorsBatch } from '../lib/db';
import { getCurrentUser } from '../lib/auth';
import { Locator, ZoneCategory } from '../types';

const zones: ZoneCategory[] = [
  'DEFAULT',
  'FG_PLUMBING',
  'FG_SMART_WATER',
  'FG_FITTING',
  'FG_FILTER',
  'PACKAGING_MATERIALS',
  'ASSEMBLY_KIT',
  'SPECIFIC_AREA',
  'RAW_MATERIALS'
];

export const RackManagement = () => {
  const [locators, setLocators] = useState<Locator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const currentUser = getCurrentUser();
  const isSuperAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Developer';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isBatchPrintModalOpen, setIsBatchPrintModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [printLocator, setPrintLocator] = useState<Locator | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [id, setId] = useState('');
  const [rack, setRack] = useState('');
  const [column, setColumn] = useState('');
  const [level, setLevel] = useState<number>(1);
  const [zone, setZone] = useState<ZoneCategory>('DEFAULT');
  const [maxVolume, setMaxVolume] = useState<number>(5.4);
  const [barcode, setBarcode] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Import State
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedLocators, setParsedLocators] = useState<Locator[]>([]);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const downloadTemplateCSV = () => {
    const headers = 'id,rack,column,level,zone,maxVolume,barcode';
    const row1 = 'FL-A1.1,FL-A,FL-A1,1,FG_PLUMBING,5.4,FL-A1.1';
    const row2 = 'FL-B1.1,FL-B,FL-B1,1,FG_SMART_WATER,5.4,FL-B1.1';
    const row3 = 'FL-C1.1,FL-C,FL-C1,2,DEFAULT,5.4,FL-C1.1';
    const csvContent = `${headers}\n${row1}\n${row2}\n${row3}`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_import_rak.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCSVFileChange = (file: File) => {
    setImportError('');
    setImportSuccess('');
    setParsedLocators([]);
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setImportError('File kosong atau tidak dapat dibaca.');
        return;
      }

      try {
        const lines = text.split(/\r?\n/);
        if (lines.length <= 1) {
          setImportError('File CSV tidak memiliki data baris.');
          return;
        }

        // Parse headers
        // Support either comma (,) or semicolon (;) delimiter
        const firstLine = lines[0];
        let delimiter = ',';
        if (firstLine.includes(';')) {
          delimiter = ';';
        }

        const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        
        // Find required column indexes
        const idIdx = headers.findIndex(h => h === 'id' || h === 'locatorid' || h === 'locator_id' || h === 'kode');
        const rackIdx = headers.findIndex(h => h === 'rack' || h === 'rak' || h === 'nama_rak');
        const columnIdx = headers.findIndex(h => h === 'column' || h === 'kolom');
        const levelIdx = headers.findIndex(h => h === 'level' || h === 'tingkat');
        const zoneIdx = headers.findIndex(h => h === 'zone' || h === 'zona' || h === 'kategori');
        const maxVolIdx = headers.findIndex(h => h === 'maxvolume' || h === 'maxvol' || h === 'volume' || h === 'kapasitas');
        const barcodeIdx = headers.findIndex(h => h === 'barcode');

        if (idIdx === -1 || rackIdx === -1 || columnIdx === -1) {
          setImportError('Format CSV salah. Harus memiliki kolom: id, rack, column (atau locatorid, rak, kolom).');
          return;
        }

        const list: Locator[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Split columns accounting for optional quotes
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
              cols.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current.trim());

          const idVal = cols[idIdx]?.replace(/^["']|["']$/g, '').trim();
          const rackVal = cols[rackIdx]?.replace(/^["']|["']$/g, '').trim();
          const colVal = cols[columnIdx]?.replace(/^["']|["']$/g, '').trim();

          if (!idVal || !rackVal || !colVal) {
            continue; // Skip invalid row
          }

          // Parse optional values
          let levelVal = 1;
          if (levelIdx !== -1 && cols[levelIdx]) {
            const parsedLevel = parseInt(cols[levelIdx].replace(/^["']|["']$/g, ''));
            if (!isNaN(parsedLevel)) levelVal = parsedLevel;
          }

          let zoneVal: ZoneCategory = 'DEFAULT';
          if (zoneIdx !== -1 && cols[zoneIdx]) {
            const tempZone = cols[zoneIdx].replace(/^["']|["']$/g, '').toUpperCase().trim();
            // Validate zone value if in categories
            if (zones.includes(tempZone as ZoneCategory)) {
              zoneVal = tempZone as ZoneCategory;
            } else {
              // Try replacing spaces with underscores
              const formattedZone = tempZone.replace(/\s+/g, '_');
              if (zones.includes(formattedZone as ZoneCategory)) {
                zoneVal = formattedZone as ZoneCategory;
              }
            }
          }

          let maxVolVal = 5.4;
          if (maxVolIdx !== -1 && cols[maxVolIdx]) {
            const parsedVol = parseFloat(cols[maxVolIdx].replace(/^["']|["']$/g, ''));
            if (!isNaN(parsedVol)) maxVolVal = parsedVol;
          }

          const barVal = (barcodeIdx !== -1 && cols[barcodeIdx]) ? cols[barcodeIdx].replace(/^["']|["']$/g, '').trim() : idVal;

          list.push({
            id: idVal,
            rack: rackVal,
            column: colVal,
            level: levelVal,
            zone: zoneVal,
            maxVolumeM3: maxVolVal,
            barcode: barVal
          });
        }

        if (list.length === 0) {
          setImportError('Tidak ada data rak valid yang ditemukan untuk diimport.');
        } else {
          setParsedLocators(list);
        }
      } catch (err: any) {
        setImportError('Gagal memproses file CSV: ' + err.message);
      }
    };

    reader.onerror = () => {
      setImportError('Gagal membaca file.');
    };

    reader.readAsText(file);
  };

  const processImport = async () => {
    if (parsedLocators.length === 0) return;
    setImporting(true);
    setImportError('');
    setImportSuccess('');

    try {
      await addLocatorsBatch(parsedLocators);
      setImportSuccess(`Berhasil mengimport ${parsedLocators.length} rak baru ke database.`);
      setParsedLocators([]);
      setImportFile(null);
      fetchLocators();
      // Delay modal closure slightly so they can see the success state
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportSuccess('');
      }, 2000);
    } catch (err: any) {
      setImportError('Gagal menyimpan data rak ke database: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const fetchLocators = async () => {
    setLoading(true);
    try {
      const data = await getLocators();
      setLocators(data);
    } catch (err) {
      console.error("Gagal mengambil data rak:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocators();
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setId('');
    setRack('');
    setColumn('');
    setLevel(1);
    setZone('DEFAULT');
    setMaxVolume(5.4);
    setBarcode('');
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const openEditModal = (locator: Locator) => {
    setEditingId(locator.id);
    setId(locator.id);
    setRack(locator.rack);
    setColumn(locator.column);
    setLevel(locator.level);
    setZone(locator.zone);
    setMaxVolume(locator.maxVolumeM3);
    setBarcode(locator.barcode || '');
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus Rak (Locator) ini? Tindakan ini tidak dapat dibatalkan.')) {
      try {
        await deleteLocator(id);
        setSuccess(`Rak ${id} berhasil dihapus.`);
        // Remove from selection if deleted
        setSelectedIds(prev => prev.filter(item => item !== id));
        fetchLocators();
      } catch (err: any) {
        setError(`Gagal menghapus rak: ${err.message}`);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (!isSuperAdmin) {
      setError('Hanya Super Admin yang diizinkan untuk menghapus beberapa rak sekaligus.');
      return;
    }

    if (selectedIds.length === 0) {
      setError('Silakan pilih setidaknya satu rak untuk dihapus.');
      return;
    }

    if (window.confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} Rak (Locator) terpilih? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        setLoading(true);
        setError('');
        setSuccess('');
        await deleteLocatorsBatch(selectedIds);
        setSuccess(`${selectedIds.length} rak berhasil dihapus.`);
        setSelectedIds([]);
        fetchLocators();
      } catch (err: any) {
        setError(`Gagal menghapus beberapa rak: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!id.trim() || !rack.trim() || !column.trim()) {
      setError('ID Locator, Nama Rak, dan Kolom wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const dataToSave: Locator = {
        id: id.trim(),
        rack: rack.trim(),
        column: column.trim(),
        level: level,
        zone: zone,
        maxVolumeM3: maxVolume,
        barcode: barcode.trim() || id.trim(),
      };

      if (editingId) {
        if (editingId !== dataToSave.id) {
          // If ID changed, we need to add new and delete old
          const existing = locators.find(l => l.id === dataToSave.id);
          if (existing) {
            throw new Error('ID Locator sudah digunakan. Silakan gunakan ID lain.');
          }
          await addLocator(dataToSave);
          await deleteLocator(editingId);
        } else {
          await updateLocator(editingId, dataToSave);
        }
        setSuccess(`Rak ${dataToSave.id} berhasil diperbarui.`);
      } else {
        const existing = locators.find(l => l.id === dataToSave.id);
        if (existing) {
          throw new Error('ID Locator sudah digunakan. Silakan gunakan ID lain.');
        }
        await addLocator(dataToSave);
        setSuccess(`Rak ${dataToSave.id} berhasil ditambahkan.`);
      }
      
      setIsModalOpen(false);
      fetchLocators();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredLocators = locators.filter(l => 
    l.id.toLowerCase().includes(search.toLowerCase()) || 
    l.rack.toLowerCase().includes(search.toLowerCase()) ||
    l.zone.toLowerCase().includes(search.toLowerCase())
  );

  const downloadSingleBarcodeAsPng = (locatorId: string, barcodeValue: string) => {
    const svgEl = document.getElementById(`qr-svg-${locatorId}`);
    if (!svgEl) {
      console.warn(`SVG element qr-svg-${locatorId} not found`);
      return;
    }
    
    try {
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const context = canvas.getContext('2d');
        if (context) {
          // White background
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw QR code
          context.drawImage(image, 60, 25, 280, 280);
          
          // Outer border for card styling on canvas
          context.strokeStyle = '#0F172A'; // Black slate-900 border
          context.lineWidth = 6;
          context.strokeRect(10, 10, 380, 380);
          
          // Inner text (ID / Barcode text) - Much larger
          context.font = 'bold 36px monospace';
          context.fillStyle = '#0F172A'; // slate-900
          context.textAlign = 'center';
          context.fillText(barcodeValue, 200, 355);
          
          const pngURL = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngURL;
          downloadLink.download = `BARCODE_RAK_${locatorId}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (err) {
      console.error("Error generating PNG for locator", locatorId, err);
    }
  };

  const downloadAllPngs = () => {
    if (filteredLocators.length === 0) return;
    
    setDownloadingAll(true);
    setDownloadProgress(0);
    let index = 0;
    
    const nextDownload = () => {
      if (index >= filteredLocators.length) {
        setDownloadingAll(false);
        setDownloadProgress(0);
        return;
      }
      
      const loc = filteredLocators[index];
      const val = loc.barcode || loc.id;
      downloadSingleBarcodeAsPng(loc.id, val);
      
      index++;
      setDownloadProgress(index);
      setTimeout(nextDownload, 250); // Stagger downloads
    };
    
    nextDownload();
  };

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Manajemen Rak (Developer)
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm">
            Kelola tata letak gudang, posisi rak (locator), dan kapasitas setiap slot penyimpanan.
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={fetchLocators}
            className="p-2.5 hover:bg-slate-100 rounded-lg border border-slate-200 bg-white transition-colors flex items-center justify-center text-slate-600"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setIsBatchPrintModalOpen(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
          >
            <QrCode className="w-4 h-4 text-slate-300" />
            Download Semua Barcode
          </button>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Rak Baru
          </button>
        </div>
      </div>

      {success && !isModalOpen && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-bold flex items-center gap-2">
          {success}
        </div>
      )}
      
      {error && !isModalOpen && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Cari berdasarkan ID Locator, Rak, atau Zone..."
          />
        </div>
        <div className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          Total: {filteredLocators.length} Rak
        </div>
      </div>

      {/* Bulk Delete Bar (Super Admin only) */}
      {isSuperAdmin && selectedIds.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 animate-bounce" />
            <span className="text-sm font-bold text-red-800">
              {selectedIds.length} Rak terpilih untuk dihapus
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSelectedIds([])}
              className="w-full sm:w-auto px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-lg transition-colors shadow-sm"
            >
              Batal
            </button>
            <button
              onClick={handleBulkDelete}
              className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-red-100"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Rak Terpilih ({selectedIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {isSuperAdmin && (
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={filteredLocators.length > 0 && filteredLocators.every(loc => selectedIds.includes(loc.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSelections = [...selectedIds];
                          filteredLocators.forEach(loc => {
                            if (!newSelections.includes(loc.id)) {
                              newSelections.push(loc.id);
                            }
                          });
                          setSelectedIds(newSelections);
                        } else {
                          const filteredIds = filteredLocators.map(loc => loc.id);
                          setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                    />
                  </th>
                )}
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">ID LOCATOR</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">BARCODE</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">RAK</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">KOLOM / TINGKAT</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 tracking-wider">KATEGORI ZONA</th>
                <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 tracking-wider">KAPASITAS (M³)</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-bold text-slate-500 tracking-wider">AKSI</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                      <span className="text-sm font-semibold text-slate-500">Memuat data rak...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLocators.length > 0 ? (
                filteredLocators.map((loc) => (
                  <tr key={loc.id} className={`hover:bg-slate-50/50 transition-colors ${selectedIds.includes(loc.id) ? 'bg-blue-50/40 hover:bg-blue-50/60' : ''}`}>
                    {isSuperAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(loc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(prev => [...prev, loc.id]);
                            } else {
                              setSelectedIds(prev => prev.filter(id => id !== loc.id));
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded">
                        {loc.id}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {loc.barcode || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">
                      {loc.rack}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                      Kolom {loc.column} <span className="mx-2 text-slate-300">|</span> Tingkat {loc.level}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                        {loc.zone.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 text-right font-mono">
                      {loc.maxVolumeM3.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => {
                            setPrintLocator(loc);
                            setIsPrintModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                          title="Print Barcode"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEditModal(loc)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit Rak"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(loc.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Hapus Rak"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-500 font-medium text-sm">
                    Tidak ada data rak yang ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                {editingId ? 'Edit Rak / Locator' : 'Tambah Rak Baru'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">ID Locator *</label>
                  <input
                    type="text"
                    required
                    value={id}
                    onChange={e => setId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    placeholder="Contoh: FL-A1.1"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Harus unik. Gunakan format konsisten (Misal Rak-Kolom.Tingkat)</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Barcode (Opsional)</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    placeholder="Otomatis sama dengan ID Locator jika kosong"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Nama Rak *</label>
                    <input
                      type="text"
                      required
                      value={rack}
                      onChange={e => setRack(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                      placeholder="Contoh: FL-A"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Kolom *</label>
                    <input
                      type="text"
                      required
                      value={column}
                      onChange={e => setColumn(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                      placeholder="Contoh: FL-A1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Tingkat / Level *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={level}
                      onChange={e => setLevel(parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Maks Vol (M³) *</label>
                    <input
                      type="number"
                      required
                      step="0.1"
                      min="0.1"
                      value={maxVolume}
                      onChange={e => setMaxVolume(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Kategori Zona *</label>
                  <select
                    value={zone}
                    onChange={e => setZone(e.target.value as ZoneCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-bold text-slate-700"
                  >
                    {zones.map(z => (
                      <option key={z} value={z}>{z.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Rak'}
                  {!saving && <Save className="w-4 h-4" />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPrintModalOpen && printLocator && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 print:shadow-none print:border-none print:w-[300px]">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between print:hidden">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                Print Barcode Rack
              </h3>
              <button 
                onClick={() => {
                  setIsPrintModalOpen(false);
                  setPrintLocator(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Area Print Aktual */}
            <div className="p-8 pb-4 text-center bg-white print:p-4">
              <div className="border-4 border-slate-900 inline-block p-4 rounded-xl bg-white">
                <QRCode 
                  id={`qr-svg-${printLocator.id}`}
                  value={printLocator.barcode || printLocator.id} 
                  size={200}
                  level="H"
                />
              </div>
              <h4 className="mt-8 text-5xl font-black text-slate-900 tracking-widest font-mono uppercase">
                {printLocator.barcode || printLocator.id}
              </h4>
              <p className="text-xs text-slate-500 font-mono mt-1 font-bold">
                Slot: {printLocator.id}
              </p>
            </div>
            
            <div className="p-6 pt-2 pb-6 print:hidden flex flex-col gap-3">
              <p className="text-xs text-center text-slate-500 mb-2">Tempelkan barcode ini pada rak fisik agar operator dapat memindainya melalui Rack Scanner.</p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => downloadSingleBarcodeAsPng(printLocator.id, printLocator.barcode || printLocator.id)}
                  className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  title="Download Barcode PNG"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  Unduh PNG
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </div>
          </div>
          
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * { visibility: hidden; }
              .print\\:block, .print\\:block * { visibility: visible !important; }
              .fixed.inset-0.z-\\[60\\] { position: absolute; left: 0; top: 0; width: 100%; height: auto; background: white; }
              .fixed.inset-0.z-\\[60\\] > div { box-shadow: none; border: none; align-items: flex-start; justify-content: flex-start; }
              .fixed.inset-0.z-\\[60\\] * { visibility: visible; }
              .print\\:hidden { display: none !important; }
            }
          `}} />
        </div>
      )}

      {isBatchPrintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:bg-white print:p-0">
          <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-slate-200 print:shadow-none print:border-none print:w-full print:h-auto print:static">
            
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between print:hidden">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-blue-600" />
                  Cetak / Download Massal Barcode Rak
                </h3>
                <p className="text-xs text-slate-500 mt-1">Ditemukan {filteredLocators.length} rak yang akan diunduh/dicetakan.</p>
              </div>
              <button 
                onClick={() => {
                  if (downloadingAll) return;
                  setIsBatchPrintModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                disabled={downloadingAll}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Banner if is downloading */}
            {downloadingAll && (
              <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between text-blue-800 text-xs font-bold animate-pulse print:hidden">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  Grup download sedang berlangsung... Mohon tunggu sistem menyelesaikan pengunduhan file barcode PNG.
                </span>
                <span className="bg-blue-100 px-2.5 py-1 rounded">
                  {downloadProgress} / {filteredLocators.length} Barcode Selesai
                </span>
              </div>
            )}

            {/* Area Grid yang Bisa Diprint & Diunduh */}
            <div className="flex-1 overflow-auto p-6 bg-slate-100 print:bg-white print:p-0 batch-print-area">
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3 print:gap-8 print:w-full">
                {filteredLocators.map((loc) => {
                  const barVal = loc.barcode || loc.id;
                  return (
                    <div 
                      key={loc.id} 
                      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center relative print:shadow-none print:border print:border-slate-300 print:rounded-lg print:break-inside-avoid print:page-break-inside-avoid print:p-4 print:m-1"
                    >
                      {/* Hidden SVG helper for serialized XML source */}
                      <div className="border border-slate-200 p-3 rounded-lg bg-white inline-block">
                        <QRCode 
                          id={`qr-svg-${loc.id}`}
                          value={barVal} 
                          size={120}
                          level="H"
                        />
                      </div>
                      
                      <h4 className="mt-4 text-2.5xl text-2xl font-black text-slate-900 tracking-widest font-mono uppercase truncate w-full">
                        {barVal}
                      </h4>
                      
                      <p className="text-[11px] text-slate-500 font-mono mt-1 font-bold">
                        Slot: {loc.id}
                      </p>

                      <button
                        onClick={() => downloadSingleBarcodeAsPng(loc.id, barVal)}
                        className="mt-3 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors w-full print:hidden"
                        title="Unduh PNG"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Unduh PNG
                      </button>
                    </div>
                  );
                })}
              </div>

              {filteredLocators.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="font-bold">Tidak ada rak yang cocok untuk dicetak.</p>
                  <p className="text-xs">Ubah kata kunci pencarian Anda untuk memfilter rak.</p>
                </div>
              )}
            </div>

            {/* Footer containing master actions */}
            <div className="bg-white px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-center print:hidden">
              <span className="text-xs text-slate-500 text-center sm:text-left">
                Pilih opsi di samping kanan untuk mengunduh seluruh file PNG satu per satu secara otomatis atau memicu print massal PDF.
              </span>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={downloadAllPngs}
                  disabled={downloadingAll || filteredLocators.length === 0}
                  className="flex-1 sm:flex-none px-4 py-2 text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg text-xs font-bold transition-colors border border-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {downloadingAll ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                      Proses: {downloadProgress} / {filteredLocators.length}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 text-slate-600" />
                      Download Semua (PNG)
                    </>
                  )}
                </button>

                <button
                  onClick={() => window.print()}
                  disabled={downloadingAll || filteredLocators.length === 0}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors shadow flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  Cetak / Save PDF Semua
                </button>
              </div>
            </div>
            
            <style dangerouslySetInnerHTML={{__html: `
              @media print {
                body * { visibility: hidden; }
                .batch-print-area, .batch-print-area * { visibility: visible !important; }
                .batch-print-area { position: absolute; left: 0; top: 0; width: 100%; height: auto; display: block !important; background: white !important; }
                .print\\:hidden { display: none !important; }
              }
            `}} />
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Import Rak dari File CSV
              </h3>
              <button 
                onClick={() => {
                  if (importing) return;
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setParsedLocators([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                disabled={importing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                <div className="flex justify-between items-center font-bold text-slate-700">
                  <span>Panduan Format CSV:</span>
                  <button
                    type="button"
                    onClick={downloadTemplateCSV}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Template CSV
                  </button>
                </div>
                <p>Kolom wajib dalam file CSV:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>id</strong> / <strong>locatorId</strong>: ID unik rak (misalnya: <code className="bg-white px-1 py-0.5 rounded border">FL-A1.1</code>)</li>
                  <li><strong>rack</strong> / <strong>rak</strong>: Nama/kode kelompok rak (misalnya: <code className="bg-white px-1 py-0.5 rounded border">FL-A</code>)</li>
                  <li><strong>column</strong> / <strong>kolom</strong>: Kode kolom rak (misalnya: <code className="bg-white px-1 py-0.5 rounded border">FL-A1</code>)</li>
                </ul>
                <p>Kolom opsional:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>level</strong> / <strong>tingkat</strong>: Angka tingkat rak (Default: <code className="bg-white px-1 py-0.5 rounded border">1</code>)</li>
                  <li><strong>zone</strong> / <strong>zona</strong>: Nama kategori zona, misalnya: <code className="bg-white px-1 py-0.5 rounded border">FG_PLUMBING</code>, <code className="bg-white px-1 py-0.5 rounded border">DEFAULT</code> (Default: <code className="bg-white px-1 py-0.5 rounded border">DEFAULT</code>)</li>
                  <li><strong>maxVolume</strong> / <strong>kapasitas</strong>: Angka kapasitas volume dalam M³ (Default: <code className="bg-white px-1 py-0.5 rounded border">5.4</code>)</li>
                  <li><strong>barcode</strong>: Nilai barcode (Otomatis sama dengan ID jika kosong)</li>
                </ul>
              </div>

              {/* Drag and Drop Area */}
              <div 
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    handleCSVFileChange(files[0]);
                  }
                }}
                onClick={() => {
                  document.getElementById('csv-file-input')?.click();
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  dragOver 
                    ? 'border-emerald-500 bg-emerald-50' 
                    : importFile 
                      ? 'border-emerald-300 bg-emerald-50/20' 
                      : 'border-slate-300 hover:border-slate-400 bg-white'
                }`}
              >
                <input 
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleCSVFileChange(files[0]);
                    }
                  }}
                />
                
                <Upload className={`w-8 h-8 ${importFile ? 'text-emerald-500' : 'text-slate-400'}`} />
                {importFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">{importFile.name}</p>
                    <p className="text-xs text-slate-500">{(importFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-700">Tarik & lepas file CSV Anda di sini, atau klik untuk memilih file</p>
                    <p className="text-xs text-slate-400">Hanya mendukung format file .csv</p>
                  </div>
                )}
              </div>

              {importError && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0 text-emerald-600" />
                  <span>{importSuccess}</span>
                </div>
              )}

              {/* Preview Data Parsed */}
              {parsedLocators.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <span>Pratinjau Data ({parsedLocators.length} Rak Terdeteksi)</span>
                    <span className="text-emerald-600 font-black">Siap Diimport</span>
                  </div>
                  
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto bg-slate-50">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-bold text-slate-600">ID LOCATOR</th>
                          <th className="px-3 py-2 font-bold text-slate-600">RAK</th>
                          <th className="px-3 py-2 font-bold text-slate-600">KOLOM</th>
                          <th className="px-3 py-2 font-bold text-slate-600">TINGKAT</th>
                          <th className="px-3 py-2 font-bold text-slate-600">ZONA</th>
                          <th className="px-3 py-2 font-bold text-slate-600 text-right">KAPASITAS</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-100">
                        {parsedLocators.slice(0, 10).map((loc, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-bold font-mono text-blue-700">{loc.id}</td>
                            <td className="px-3 py-2 text-slate-700">{loc.rack}</td>
                            <td className="px-3 py-2 text-slate-700">{loc.column}</td>
                            <td className="px-3 py-2 text-slate-600">{loc.level}</td>
                            <td className="px-3 py-2 text-slate-500 font-medium">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                                {loc.zone.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{loc.maxVolumeM3} M³</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedLocators.length > 10 && (
                    <p className="text-[10px] text-slate-500 italic text-right">*Menampilkan 10 baris pertama saja.</p>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setParsedLocators([]);
                  setImportError('');
                  setImportSuccess('');
                }}
                disabled={importing}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={processImport}
                disabled={importing || parsedLocators.length === 0}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg text-sm font-bold text-white transition-colors shadow flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? 'Sedang Mengimport...' : `Mulai Import (${parsedLocators.length} Rak)`}
                {!importing && <Upload className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
