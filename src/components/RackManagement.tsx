import React, { useState, useEffect } from 'react';
import { 
  Layers, Plus, Pencil, Trash2, X, Save, Search, RefreshCw, AlertTriangle, 
  Printer, QrCode, Download, Upload, FileSpreadsheet, SlidersHorizontal, Check, 
  Edit3, CheckSquare, RotateCcw, Copy, Table, ChevronDown, ChevronUp, Sparkles, CheckCircle2
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { 
  getLocators, addLocator, updateLocator, deleteLocator, 
  addLocatorsBatch, deleteLocatorsBatch, updateLocatorsBatch, updateMultipleLocators 
} from '../lib/db';
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
  const [batchPrintSelectedOnly, setBatchPrintSelectedOnly] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [printLocator, setPrintLocator] = useState<Locator | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bulk / Multi-Rack Edit State
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditTab, setBulkEditTab] = useState<'BATCH' | 'GRID'>('BATCH');
  const [bulkPickerSearch, setBulkPickerSearch] = useState('');
  const [isRackPickerOpen, setIsRackPickerOpen] = useState(false);

  // Batch Update State (Nilai Sama)
  const [bulkZoneEnabled, setBulkZoneEnabled] = useState(false);
  const [bulkZone, setBulkZone] = useState<ZoneCategory>('DEFAULT');
  const [bulkRackEnabled, setBulkRackEnabled] = useState(false);
  const [bulkRack, setBulkRack] = useState('');
  const [bulkColumnEnabled, setBulkColumnEnabled] = useState(false);
  const [bulkColumn, setBulkColumn] = useState('');
  const [bulkLevelEnabled, setBulkLevelEnabled] = useState(false);
  const [bulkLevel, setBulkLevel] = useState<number>(1);
  const [bulkMaxVolumeEnabled, setBulkMaxVolumeEnabled] = useState(false);
  const [bulkMaxVolume, setBulkMaxVolume] = useState<number>(5.4);
  const [bulkSyncBarcode, setBulkSyncBarcode] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  // Multi-row Grid Edit State (Rincian per masing-masing rak dalam modal)
  const [bulkRowEdits, setBulkRowEdits] = useState<Record<string, Partial<Locator>>>({});

  // Table In-line Edit Mode State
  const [isTableEditMode, setIsTableEditMode] = useState(false);
  const [tableEdits, setTableEdits] = useState<Record<string, Partial<Locator>>>({});
  const [tableSaving, setTableSaving] = useState(false);

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

  const initBulkRowEdits = (ids: string[]) => {
    const edits: Record<string, Partial<Locator>> = {};
    ids.forEach(locId => {
      const loc = locators.find(l => l.id === locId);
      if (loc) {
        edits[locId] = {
          rack: loc.rack,
          column: loc.column,
          level: loc.level,
          zone: loc.zone,
          maxVolumeM3: loc.maxVolumeM3,
          barcode: loc.barcode || loc.id
        };
      }
    });
    setBulkRowEdits(edits);
  };

  const openBulkEditModal = (targetIds?: string[]) => {
    let ids = targetIds || selectedIds;
    if (ids.length === 0) {
      setIsRackPickerOpen(true);
    } else {
      setIsRackPickerOpen(false);
    }

    const firstSelected = locators.find(l => ids.includes(l.id)) || locators[0];
    setBulkZoneEnabled(false);
    setBulkZone(firstSelected?.zone || 'DEFAULT');
    setBulkRackEnabled(false);
    setBulkRack(firstSelected?.rack || '');
    setBulkColumnEnabled(false);
    setBulkColumn(firstSelected?.column || '');
    setBulkLevelEnabled(false);
    setBulkLevel(firstSelected?.level || 1);
    setBulkMaxVolumeEnabled(false);
    setBulkMaxVolume(firstSelected?.maxVolumeM3 || 5.4);
    setBulkSyncBarcode(false);
    setBulkError('');
    setBulkPickerSearch('');
    initBulkRowEdits(ids);
    setIsBulkEditModalOpen(true);
  };

  const handleBulkRowEditChange = (locId: string, field: keyof Locator, value: any) => {
    setBulkRowEdits(prev => {
      const current = prev[locId] || {};
      return {
        ...prev,
        [locId]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleCopyFirstRowToAll = () => {
    if (selectedIds.length <= 1) return;
    const firstId = selectedIds[0];
    const firstData = bulkRowEdits[firstId];
    if (!firstData) return;

    setBulkRowEdits(prev => {
      const updated = { ...prev };
      selectedIds.forEach((id, idx) => {
        if (idx === 0) return;
        const current = updated[id] || {};
        updated[id] = {
          ...current,
          rack: firstData.rack,
          column: firstData.column,
          level: firstData.level,
          zone: firstData.zone,
          maxVolumeM3: firstData.maxVolumeM3,
        };
      });
      return updated;
    });
  };

  const handleRemoveRackFromSelection = (locId: string) => {
    setSelectedIds(prev => prev.filter(id => id !== locId));
    setBulkRowEdits(prev => {
      const copy = { ...prev };
      delete copy[locId];
      return copy;
    });
  };

  const handleAddRackToSelection = (locId: string) => {
    if (!selectedIds.includes(locId)) {
      const newSelections = [...selectedIds, locId];
      setSelectedIds(newSelections);
      const loc = locators.find(l => l.id === locId);
      if (loc) {
        setBulkRowEdits(prev => ({
          ...prev,
          [locId]: {
            rack: loc.rack,
            column: loc.column,
            level: loc.level,
            zone: loc.zone,
            maxVolumeM3: loc.maxVolumeM3,
            barcode: loc.barcode || loc.id
          }
        }));
      }
    }
  };

  const handleBulkSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkError('');

    if (selectedIds.length === 0) {
      setBulkError('Pilih setidaknya satu rak untuk diedit.');
      return;
    }

    setBulkSaving(true);
    try {
      if (bulkEditTab === 'BATCH') {
        if (!bulkZoneEnabled && !bulkRackEnabled && !bulkColumnEnabled && !bulkLevelEnabled && !bulkMaxVolumeEnabled && !bulkSyncBarcode) {
          setBulkError('Pilih setidaknya satu atribut untuk diperbarui (centang kotak di sebelah atribut).');
          setBulkSaving(false);
          return;
        }

        if (bulkRackEnabled && !bulkRack.trim()) {
          setBulkError('Nama Rak tidak boleh kosong jika dicentang.');
          setBulkSaving(false);
          return;
        }

        if (bulkColumnEnabled && !bulkColumn.trim()) {
          setBulkError('Kolom Rak tidak boleh kosong jika dicentang.');
          setBulkSaving(false);
          return;
        }

        if (bulkMaxVolumeEnabled && (isNaN(bulkMaxVolume) || bulkMaxVolume <= 0)) {
          setBulkError('Kapasitas maksimal harus berupa angka positif.');
          setBulkSaving(false);
          return;
        }

        const commonUpdates: Partial<Locator> = {};
        if (bulkZoneEnabled) commonUpdates.zone = bulkZone;
        if (bulkRackEnabled) commonUpdates.rack = bulkRack.trim();
        if (bulkColumnEnabled) commonUpdates.column = bulkColumn.trim();
        if (bulkLevelEnabled) commonUpdates.level = bulkLevel;
        if (bulkMaxVolumeEnabled) commonUpdates.maxVolumeM3 = bulkMaxVolume;

        if (bulkSyncBarcode) {
          const itemsToUpdate = selectedIds.map(locId => ({
            id: locId,
            data: {
              ...commonUpdates,
              barcode: locId
            }
          }));
          await updateMultipleLocators(itemsToUpdate);
        } else {
          await updateLocatorsBatch(selectedIds, commonUpdates);
        }

        setSuccess(`Berhasil memperbarui ${selectedIds.length} rak secara serentak.`);
      } else {
        // GRID MODE
        const itemsToUpdate = selectedIds.map(locId => {
          const edits = bulkRowEdits[locId] || {};
          const orig = locators.find(l => l.id === locId);
          return {
            id: locId,
            data: {
              rack: edits.rack !== undefined ? edits.rack : (orig?.rack || ''),
              column: edits.column !== undefined ? edits.column : (orig?.column || ''),
              level: edits.level !== undefined ? edits.level : (orig?.level || 1),
              zone: edits.zone !== undefined ? edits.zone : (orig?.zone || 'DEFAULT'),
              maxVolumeM3: edits.maxVolumeM3 !== undefined ? edits.maxVolumeM3 : (orig?.maxVolumeM3 || 5.4),
              barcode: edits.barcode !== undefined ? edits.barcode : (orig?.barcode || locId)
            }
          };
        });

        // Validation
        for (const item of itemsToUpdate) {
          if (!item.data.rack || !item.data.column) {
            setBulkError(`Rak dan Kolom untuk ID ${item.id} tidak boleh kosong.`);
            setBulkSaving(false);
            return;
          }
          if (item.data.level < 1) {
            setBulkError(`Tingkat/level untuk ID ${item.id} minimal 1.`);
            setBulkSaving(false);
            return;
          }
          if (item.data.maxVolumeM3 <= 0) {
            setBulkError(`Kapasitas M³ untuk ID ${item.id} harus lebih dari 0.`);
            setBulkSaving(false);
            return;
          }
        }

        await updateMultipleLocators(itemsToUpdate);
        setSuccess(`Berhasil menyimpan perubahan data untuk ${itemsToUpdate.length} rak.`);
      }

      setIsBulkEditModalOpen(false);
      setSelectedIds([]);
      await fetchLocators();
    } catch (err: any) {
      setBulkError('Gagal memperbarui rak: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleTableEditChange = (locId: string, field: keyof Locator, value: any) => {
    setTableEdits(prev => {
      const current = prev[locId] || {};
      return {
        ...prev,
        [locId]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleSaveTableEdits = async () => {
    const editKeys = Object.keys(tableEdits);
    if (editKeys.length === 0) return;

    setTableSaving(true);
    setError('');
    try {
      const items = editKeys.map(locId => ({
        id: locId,
        data: tableEdits[locId]
      }));
      await updateMultipleLocators(items);
      setSuccess(`Berhasil menyimpan perubahan langsung pada ${items.length} rak.`);
      setTableEdits({});
      setIsTableEditMode(false);
      await fetchLocators();
    } catch (err: any) {
      setError('Gagal menyimpan perubahan tabel: ' + err.message);
    } finally {
      setTableSaving(false);
    }
  };

  const handleCancelTableEdits = () => {
    setTableEdits({});
    setIsTableEditMode(false);
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

  const filteredLocators = locators
    .filter(l => 
      l.id.toLowerCase().includes(search.toLowerCase()) || 
      l.rack.toLowerCase().includes(search.toLowerCase()) ||
      l.zone.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));

  const batchLocators = batchPrintSelectedOnly && selectedIds.length > 0
    ? locators.filter(l => selectedIds.includes(l.id))
    : filteredLocators;

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
    if (batchLocators.length === 0) return;
    
    setDownloadingAll(true);
    setDownloadProgress(0);
    let index = 0;
    
    const nextDownload = () => {
      if (index >= batchLocators.length) {
        setDownloadingAll(false);
        setDownloadProgress(0);
        return;
      }
      
      const loc = batchLocators[index];
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
            onClick={() => openBulkEditModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow flex items-center gap-2 transition-colors"
            title="Edit konfigurasi beberapa rak sekaligus atau ubah rinciannya"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Edit Beberapa Rak {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Cari berdasarkan ID, Rak, atau Zone..."
            />
          </div>

          {filteredLocators.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (filteredLocators.every(loc => selectedIds.includes(loc.id))) {
                  const filteredIds = filteredLocators.map(loc => loc.id);
                  setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
                } else {
                  const newSelections = [...selectedIds];
                  filteredLocators.forEach(loc => {
                    if (!newSelections.includes(loc.id)) {
                      newSelections.push(loc.id);
                    }
                  });
                  setSelectedIds(newSelections);
                }
              }}
              className="w-full sm:w-auto px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
              {filteredLocators.every(loc => selectedIds.includes(loc.id))
                ? 'Batal Pilih Semua'
                : `Pilih Semua (${filteredLocators.length})`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (isTableEditMode && Object.keys(tableEdits).length > 0) {
                if (window.confirm('Ada perubahan yang belum disimpan. Yakin ingin keluar dari Mode Edit Tabel?')) {
                  handleCancelTableEdits();
                }
              } else {
                setIsTableEditMode(!isTableEditMode);
                setTableEdits({});
              }
            }}
            className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap ${
              isTableEditMode
                ? 'bg-amber-500 text-white border-amber-600 shadow-amber-200'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Edit langsung beberapa data rak pada baris tabel seperti spreadsheet"
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isTableEditMode ? 'Keluar Edit Tabel' : 'Mode Edit Cepat Tabel'}
          </button>
        </div>

        <div className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 self-end md:self-auto">
          Total: {filteredLocators.length} Rak
        </div>
      </div>

      {/* Selection Action Bar (Multi/Bulk Edit Bar) */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all animate-in fade-in duration-300 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {selectedIds.length}
            </span>
            <div>
              <span className="text-sm font-black text-blue-950 block">
                {selectedIds.length} Rak Terpilih
              </span>
              <span className="text-xs text-blue-700">
                Pilih aksi massal yang ingin Anda terapkan pada seluruh rak terpilih
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            <button
              onClick={() => setSelectedIds([])}
              className="px-3.5 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors shadow-sm"
            >
              Batal Pilihan
            </button>

            {/* Tombol Edit Beberapa Rak */}
            <button
              onClick={() => openBulkEditModal()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
              title="Edit zona, kapasitas, kolom, atau rincian rak terpilih secara serentak"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Edit Beberapa Rak ({selectedIds.length})
            </button>

            {/* Tombol Cetak Barcode Terpilih */}
            <button
              onClick={() => {
                setBatchPrintSelectedOnly(true);
                setIsBatchPrintModalOpen(true);
              }}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              title="Cetak barcode rak terpilih"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              Cetak Barcode ({selectedIds.length})
            </button>

            {/* Tombol Hapus Terpilih */}
            {isSuperAdmin && (
              <button
                onClick={handleBulkDelete}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                title="Hapus semua rak terpilih"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus ({selectedIds.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden relative">
        {isTableEditMode && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 font-semibold">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                Mode Edit Cepat Tabel Aktif — Silakan ubah data rak langsung pada baris tabel di bawah.
              </span>
            </div>
            <span className="font-bold bg-amber-200/80 px-2 py-0.5 rounded text-amber-950 font-mono">
              {Object.keys(tableEdits).length} baris telah dimodifikasi
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
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
                    title="Pilih semua rak yang ditampilkan"
                  />
                </th>
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
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                      <span className="text-sm font-semibold text-slate-500">Memuat data rak...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLocators.length > 0 ? (
                filteredLocators.map((loc) => {
                  const edits = tableEdits[loc.id] || {};
                  const isRowEdited = Object.keys(edits).length > 0;
                  const effectiveRack = edits.rack !== undefined ? edits.rack : loc.rack;
                  const effectiveColumn = edits.column !== undefined ? edits.column : loc.column;
                  const effectiveLevel = edits.level !== undefined ? edits.level : loc.level;
                  const effectiveZone = edits.zone !== undefined ? edits.zone : loc.zone;
                  const effectiveMaxVolume = edits.maxVolumeM3 !== undefined ? edits.maxVolumeM3 : loc.maxVolumeM3;
                  const effectiveBarcode = edits.barcode !== undefined ? edits.barcode : (loc.barcode || '');

                  return (
                    <tr 
                      key={loc.id} 
                      onClick={(e) => {
                        if (isTableEditMode) return;
                        const target = e.target as HTMLElement;
                        if (['INPUT', 'BUTTON', 'SELECT', 'A', 'TEXTAREA'].includes(target.tagName) || target.closest('button') || target.closest('input') || target.closest('select')) {
                          return;
                        }
                        setSelectedIds(prev => prev.includes(loc.id) ? prev.filter(id => id !== loc.id) : [...prev, loc.id]);
                      }}
                      className={`hover:bg-slate-50/70 transition-colors ${!isTableEditMode ? 'cursor-pointer' : ''} ${
                        isRowEdited 
                          ? 'bg-amber-50/60 hover:bg-amber-50/80 border-l-4 border-amber-400' 
                          : selectedIds.includes(loc.id) 
                            ? 'bg-blue-50/50 hover:bg-blue-50/70' 
                            : ''
                      }`}
                    >
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded flex items-center gap-1.5 w-fit font-mono">
                          {loc.id}
                          {isRowEdited && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Baris diedit" />
                          )}
                        </span>
                      </td>

                      {/* Barcode column */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                        {isTableEditMode ? (
                          <input
                            type="text"
                            value={effectiveBarcode}
                            onChange={(e) => handleTableEditChange(loc.id, 'barcode', e.target.value)}
                            className="w-32 px-2 py-1 text-xs border border-slate-300 rounded bg-white font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder={loc.id}
                          />
                        ) : (
                          loc.barcode || "-"
                        )}
                      </td>

                      {/* Rack column */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">
                        {isTableEditMode ? (
                          <input
                            type="text"
                            value={effectiveRack}
                            onChange={(e) => handleTableEditChange(loc.id, 'rack', e.target.value)}
                            className="w-24 px-2 py-1 text-xs font-bold border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                          />
                        ) : (
                          loc.rack
                        )}
                      </td>

                      {/* Column / Level */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                        {isTableEditMode ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={effectiveColumn}
                              onChange={(e) => handleTableEditChange(loc.id, 'column', e.target.value)}
                              className="w-20 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              placeholder="Kolom"
                            />
                            <span className="text-slate-300">|</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-slate-400">Lvl</span>
                              <input
                                type="number"
                                min="1"
                                value={effectiveLevel}
                                onChange={(e) => handleTableEditChange(loc.id, 'level', parseInt(e.target.value) || 1)}
                                className="w-14 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <>Kolom {loc.column} <span className="mx-2 text-slate-300">|</span> Tingkat {loc.level}</>
                        )}
                      </td>

                      {/* Zone category */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isTableEditMode ? (
                          <select
                            value={effectiveZone}
                            onChange={(e) => handleTableEditChange(loc.id, 'zone', e.target.value as ZoneCategory)}
                            className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            {zones.map(z => (
                              <option key={z} value={z}>{z.replace('_', ' ')}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            {loc.zone.replace('_', ' ')}
                          </span>
                        )}
                      </td>

                      {/* Max volume */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-700 text-right font-mono">
                        {isTableEditMode ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={effectiveMaxVolume}
                              onChange={(e) => handleTableEditChange(loc.id, 'maxVolumeM3', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 text-xs border border-slate-300 rounded bg-white text-right font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                            <span className="text-[11px] text-slate-400 font-normal">M³</span>
                          </div>
                        ) : (
                          loc.maxVolumeM3.toFixed(2)
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {isTableEditMode ? (
                          isRowEdited ? (
                            <button
                              type="button"
                              onClick={() => {
                                setTableEdits(prev => {
                                  const copy = { ...prev };
                                  delete copy[loc.id];
                                  return copy;
                                });
                              }}
                              className="px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100 rounded border border-amber-300 transition-colors"
                              title="Reset perubahan baris ini"
                            >
                              Reset
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Belum diubah</span>
                          )
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500 font-medium text-sm">
                    Tidak ada data rak yang ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Sticky Save Bar for Table In-Line Edits */}
      {isTableEditMode && Object.keys(tableEdits).length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-5 border border-slate-700 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">
              {Object.keys(tableEdits).length}
            </span>
            <span className="text-sm font-bold">
              {Object.keys(tableEdits).length} Rak Telah Dimodifikasi
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancelTableEdits}
              disabled={tableSaving}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Batalkan
            </button>
            <button
              onClick={handleSaveTableEdits}
              disabled={tableSaving}
              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
            >
              {tableSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Simpan Semua Perubahan ({Object.keys(tableEdits).length})
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bulk / Multi-Rack Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-2xl shadow-2xl w-full ${bulkEditTab === 'GRID' ? 'max-w-5xl' : 'max-w-2xl'} overflow-hidden border border-slate-200 transition-all duration-200 flex flex-col max-h-[90vh]`}>
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-indigo-800 px-6 py-4 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
                  <SlidersHorizontal className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white leading-tight flex items-center gap-2">
                    Edit Beberapa Rak
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white font-mono">
                      {selectedIds.length} Rak
                    </span>
                  </h3>
                  <span className="text-xs text-indigo-100">
                    Ubah konfigurasi rak sekaligus atau sesuaikan rincian masing-masing
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsBulkEditModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors p-1.5 hover:bg-white/10 rounded-lg"
                disabled={bulkSaving}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setBulkEditTab('BATCH')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  bulkEditTab === 'BATCH'
                    ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Ubah Serentak (Nilai Sama)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkEditTab('GRID');
                  initBulkRowEdits(selectedIds);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                  bulkEditTab === 'GRID'
                    ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-sm'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Table className="w-4 h-4" />
                Edit Rincian Per Rak (Grid Spreadsheet)
              </button>
            </div>

            {/* Selected Racks Management Bar */}
            <div className="bg-slate-100/90 border-b border-slate-200 px-6 py-2.5 flex flex-col gap-2 flex-shrink-0 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Daftar Rak yang Diedit:</span>
                  <span className="font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    {selectedIds.length} dipilih
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRackPickerOpen(!isRackPickerOpen)}
                    className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    {isRackPickerOpen ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        Tutup Pemilih Rak
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        + Tambah / Ubah Rak yang Dipilih
                      </>
                    )}
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds([]);
                        setBulkRowEdits({});
                      }}
                      className="text-slate-400 hover:text-red-600 ml-2"
                      title="Kosongkan pilihan"
                    >
                      Kosongkan
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Rack Picker */}
              {isRackPickerOpen && (
                <div className="mt-2 p-3 bg-white rounded-xl border border-slate-200 shadow-inner space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={bulkPickerSearch}
                        onChange={(e) => setBulkPickerSearch(e.target.value)}
                        placeholder="Cari ID locator, rak, atau zona..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const matching = locators.filter(l => 
                          !bulkPickerSearch || 
                          l.id.toLowerCase().includes(bulkPickerSearch.toLowerCase()) ||
                          l.rack.toLowerCase().includes(bulkPickerSearch.toLowerCase()) ||
                          l.zone.toLowerCase().includes(bulkPickerSearch.toLowerCase())
                        );
                        const matchIds = matching.map(m => m.id);
                        const allSelected = matchIds.every(id => selectedIds.includes(id));
                        if (allSelected) {
                          setSelectedIds(prev => prev.filter(id => !matchIds.includes(id)));
                        } else {
                          const newIds = Array.from(new Set([...selectedIds, ...matchIds]));
                          setSelectedIds(newIds);
                          initBulkRowEdits(newIds);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold whitespace-nowrap text-[11px]"
                    >
                      Pilih Semua Hasil
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 p-1">
                    {locators
                      .filter(l => 
                        !bulkPickerSearch || 
                        l.id.toLowerCase().includes(bulkPickerSearch.toLowerCase()) ||
                        l.rack.toLowerCase().includes(bulkPickerSearch.toLowerCase()) ||
                        l.zone.toLowerCase().includes(bulkPickerSearch.toLowerCase())
                      )
                      .map(l => {
                        const isChecked = selectedIds.includes(l.id);
                        return (
                          <label
                            key={l.id}
                            className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  handleRemoveRackFromSelection(l.id);
                                } else {
                                  handleAddRackToSelection(l.id);
                                }
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                            />
                            <span className="font-mono truncate">{l.id}</span>
                            <span className="text-[10px] text-slate-400 font-normal truncate">({l.rack})</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Quick Chips preview */}
              {selectedIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pt-0.5">
                  {selectedIds.map(locId => (
                    <span 
                      key={locId} 
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-300 text-slate-800 rounded text-[11px] font-mono font-bold shadow-2xs"
                    >
                      {locId}
                      <button
                        type="button"
                        onClick={() => handleRemoveRackFromSelection(locId)}
                        className="text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-full p-0.5"
                        title="Hapus dari daftar edit"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Belum ada rak yang dipilih. Silakan centang rak di atas untuk mulai mengedit.</span>
                </div>
              )}
            </div>

            {/* Error Notification */}
            {bulkError && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2 flex-shrink-0">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{bulkError}</span>
              </div>
            )}

            {/* Modal Body */}
            <form onSubmit={handleBulkSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              {bulkEditTab === 'BATCH' ? (
                /* ======================== TAB 1: BATCH UPDATE ======================== */
                <div className="space-y-4">
                  <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      Petunjuk Mode Nilai Sama:
                    </div>
                    <p className="text-blue-800 leading-relaxed">
                      Centang atribut yang ingin diubah. Nilai yang Anda tetapkan akan diterapkan serentak ke seluruh <strong>{selectedIds.length} rak</strong> yang dipilih. Atribut yang tidak dicentang akan dibiarkan tetap seperti semula.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* 1. Kategori Zona */}
                    <div className={`p-3.5 rounded-xl border transition-all ${bulkZoneEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-black text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkZoneEnabled}
                            onChange={(e) => setBulkZoneEnabled(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Ubah Kategori Zona</span>
                        </label>
                        {bulkZoneEnabled && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Aktif
                          </span>
                        )}
                      </div>
                      <select
                        disabled={!bulkZoneEnabled}
                        value={bulkZone}
                        onChange={(e) => setBulkZone(e.target.value as ZoneCategory)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      >
                        {zones.map((z) => (
                          <option key={z} value={z}>{z.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Nama Rak */}
                    <div className={`p-3.5 rounded-xl border transition-all ${bulkRackEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-black text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkRackEnabled}
                            onChange={(e) => setBulkRackEnabled(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Ubah Nama Rak / Baris</span>
                        </label>
                        {bulkRackEnabled && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Aktif
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={!bulkRackEnabled}
                        value={bulkRack}
                        onChange={(e) => setBulkRack(e.target.value.toUpperCase())}
                        placeholder="Contoh: RAK-A atau MAIN-ZONE"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold uppercase bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    {/* 3. Kolom Rak */}
                    <div className={`p-3.5 rounded-xl border transition-all ${bulkColumnEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-black text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkColumnEnabled}
                            onChange={(e) => setBulkColumnEnabled(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Ubah Kolom Rak</span>
                        </label>
                        {bulkColumnEnabled && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Aktif
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={!bulkColumnEnabled}
                        value={bulkColumn}
                        onChange={(e) => setBulkColumn(e.target.value.toUpperCase())}
                        placeholder="Contoh: 01, A, atau 02"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold uppercase bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    {/* 4. Tingkat / Level */}
                    <div className={`p-3.5 rounded-xl border transition-all ${bulkLevelEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-black text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkLevelEnabled}
                            onChange={(e) => setBulkLevelEnabled(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Ubah Tingkat / Level</span>
                        </label>
                        {bulkLevelEnabled && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Aktif
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        disabled={!bulkLevelEnabled}
                        value={bulkLevel}
                        onChange={(e) => setBulkLevel(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    {/* 5. Kapasitas Maksimal */}
                    <div className={`p-3.5 rounded-xl border transition-all md:col-span-2 ${bulkMaxVolumeEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-black text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={bulkMaxVolumeEnabled}
                            onChange={(e) => setBulkMaxVolumeEnabled(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                          />
                          <span>Ubah Kapasitas Maksimal (M³)</span>
                        </label>
                        {bulkMaxVolumeEnabled && (
                          <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                            Aktif
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        disabled={!bulkMaxVolumeEnabled}
                        value={bulkMaxVolume}
                        onChange={(e) => setBulkMaxVolume(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>

                    {/* 6. Sinkronisasi Barcode ke ID */}
                    <div className={`p-3.5 rounded-xl border transition-all md:col-span-2 ${bulkSyncBarcode ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                      <label className="flex items-start gap-2.5 text-xs font-black text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bulkSyncBarcode}
                          onChange={(e) => setBulkSyncBarcode(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-0.5"
                        />
                        <div>
                          <span>Sinkronisasi Barcode dengan ID Locator</span>
                          <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                            Menetapkan barcode masing-masing rak agar sama persis dengan ID Locator-nya (contoh: rak dengan ID LOC-01 akan memiliki barcode LOC-01).
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                /* ======================== TAB 2: GRID EDIT ======================== */
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-600">
                      <span className="font-bold text-slate-800">Mode Grid Spreadsheet:</span> Edit masing-masing kolom langsung di bawah.
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyFirstRowToAll}
                        disabled={selectedIds.length <= 1}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Salin Rak, Kolom, Tingkat, Zona, dan Kapasitas dari baris pertama ke seluruh baris lainnya"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Salin Baris 1 ke Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => initBulkRowEdits(selectedIds)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                        title="Kembalikan semua nilai ke data awal sebelum diedit"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto max-h-96">
                      <table className="min-w-full divide-y divide-slate-200 text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left w-8">#</th>
                            <th className="px-3 py-2.5 text-left">ID LOCATOR</th>
                            <th className="px-3 py-2.5 text-left">BARCODE</th>
                            <th className="px-3 py-2.5 text-left">RAK</th>
                            <th className="px-3 py-2.5 text-left">KOLOM</th>
                            <th className="px-3 py-2.5 text-left">TINGKAT</th>
                            <th className="px-3 py-2.5 text-left">ZONA</th>
                            <th className="px-3 py-2.5 text-left">KAPASITAS (M³)</th>
                            <th className="px-3 py-2.5 text-center w-12">HAPUS</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {selectedIds.length > 0 ? (
                            selectedIds.map((locId, idx) => {
                              const edits = bulkRowEdits[locId] || {};
                              const orig = locators.find(l => l.id === locId);
                              const currentBarcode = edits.barcode !== undefined ? edits.barcode : (orig?.barcode || locId);
                              const currentRack = edits.rack !== undefined ? edits.rack : (orig?.rack || '');
                              const currentColumn = edits.column !== undefined ? edits.column : (orig?.column || '');
                              const currentLevel = edits.level !== undefined ? edits.level : (orig?.level || 1);
                              const currentZone = edits.zone !== undefined ? edits.zone : (orig?.zone || 'DEFAULT');
                              const currentMaxVolume = edits.maxVolumeM3 !== undefined ? edits.maxVolumeM3 : (orig?.maxVolumeM3 || 5.4);

                              return (
                                <tr key={locId} className="hover:bg-indigo-50/30 transition-colors">
                                  <td className="px-3 py-2 font-mono text-slate-400">{idx + 1}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                      {locId}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      value={currentBarcode}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'barcode', e.target.value)}
                                      className="w-28 px-2 py-1 text-xs border border-slate-300 rounded font-mono focus:border-indigo-500 outline-none"
                                      placeholder={locId}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      value={currentRack}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'rack', e.target.value.toUpperCase())}
                                      className="w-20 px-2 py-1 text-xs font-bold uppercase border border-slate-300 rounded focus:border-indigo-500 outline-none"
                                      placeholder="Nama Rak"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="text"
                                      value={currentColumn}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'column', e.target.value.toUpperCase())}
                                      className="w-16 px-2 py-1 text-xs font-bold uppercase border border-slate-300 rounded focus:border-indigo-500 outline-none"
                                      placeholder="Kolom"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="number"
                                      min="1"
                                      value={currentLevel}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'level', parseInt(e.target.value) || 1)}
                                      className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:border-indigo-500 outline-none"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <select
                                      value={currentZone}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'zone', e.target.value as ZoneCategory)}
                                      className="w-36 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:border-indigo-500 outline-none"
                                    >
                                      {zones.map(z => (
                                        <option key={z} value={z}>{z.replace('_', ' ')}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="number"
                                      step="0.1"
                                      min="0.1"
                                      value={currentMaxVolume}
                                      onChange={(e) => handleBulkRowEditChange(locId, 'maxVolumeM3', parseFloat(e.target.value) || 0)}
                                      className="w-20 px-2 py-1 text-xs border border-slate-300 rounded focus:border-indigo-500 outline-none"
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRackFromSelection(locId)}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                                      title="Keluarkan rak ini dari daftar edit"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-xs font-semibold">
                                Belum ada rak yang dipilih. Silakan pilih rak terlebih dahulu di bagian atas.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBulkEditModalOpen(false)}
                  disabled={bulkSaving}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={bulkSaving || selectedIds.length === 0}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bulkSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyimpan Perubahan...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {bulkEditTab === 'BATCH' 
                        ? `Terapkan Perubahan Massal (${selectedIds.length} Rak)` 
                        : `Simpan Semua Perubahan (${selectedIds.length} Rak)`}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  {batchPrintSelectedOnly ? `Cetak / Download Barcode Rak Terpilih (${batchLocators.length})` : 'Cetak / Download Massal Barcode Rak'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {batchPrintSelectedOnly 
                    ? `Menyiapkan ${batchLocators.length} barcode dari rak yang dipilih.` 
                    : `Ditemukan ${batchLocators.length} rak yang akan diunduh/dicetakan.`}
                </p>
              </div>
              <button 
                onClick={() => {
                  if (downloadingAll) return;
                  setIsBatchPrintModalOpen(false);
                  setBatchPrintSelectedOnly(false);
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
                  {downloadProgress} / {batchLocators.length} Barcode Selesai
                </span>
              </div>
            )}

            {/* Area Grid yang Bisa Diprint & Diunduh */}
            <div className="flex-1 overflow-auto p-6 bg-slate-100 print:bg-white print:p-0 batch-print-area">
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 print:grid-cols-3 print:gap-8 print:w-full">
                {batchLocators.map((loc) => {
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

              {batchLocators.length === 0 && (
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
                  disabled={downloadingAll || batchLocators.length === 0}
                  className="flex-1 sm:flex-none px-4 py-2 text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg text-xs font-bold transition-colors border border-slate-200 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {downloadingAll ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
                      Proses: {downloadProgress} / {batchLocators.length}
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
                  disabled={downloadingAll || batchLocators.length === 0}
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
