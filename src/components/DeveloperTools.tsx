import React, { useState } from 'react';
import { Database, AlertTriangle, Trash2, ShieldAlert, CheckCircle, RefreshCw, Rocket, Download } from 'lucide-react';
import { resetStockAndTransactions, getTransactions, getProducts, getLocators } from '../lib/db';

export function DeveloperTools() {
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const targetPhrase = 'RESET GUDANG';

  const handleBackup = async () => {
    setBackupLoading(true);
    setError('');
    setSuccess('');
    try {
      const txs = await getTransactions();
      const prods = await getProducts();
      const locs = await getLocators();

      const backupData = {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        transactions: txs,
        products: prods,
        locators: locs
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute("download", `wms_backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setSuccess('Backup data gudang (Transaksi, Produk, dan Locator) berhasil diunduh dalam bentuk file JSON!');
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Error tidak diketahui';
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit')) {
        errMsg = 'Limit kuota harian database gratis telah tercapai. Sebagian data mungkin diambil dari memori lokal atau gagal diunduh.';
      }
      setError('Gagal mengekspor data backup: ' + errMsg);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPhrase !== targetPhrase) {
      setError(`Silakan ketik "${targetPhrase}" dengan benar untuk konfirmasi.`);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await resetStockAndTransactions();
      setSuccess('Semua data Stock Overview dan Riwayat Transaksi berhasil direset!');
      setConfirmPhrase('');
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Error tidak diketahui';
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('limit')) {
        errMsg = 'Limit kuota harian database gratis telah tercapai. Firestore tidak dapat diakses untuk sementara. Namun, data lokal tetap berhasil direset.';
      }
      setError('Gagal mereset data Firestore: ' + errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setError('');
    setSuccess('');

    try {
      setSuccess('Sistem Anda sudah sepenuhnya berjalan di atas arsitektur MongoDB Multi-Tenant. Migrasi data tidak lagi diperlukan!');
    } catch (err: any) {
      console.error(err);
      setError('Gagal Migrasi: ' + (err.message || 'Unknown error'));
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-600" />
          Developer Tools
        </h2>
        <p className="text-slate-500 mt-1.5 text-sm">
          Fasilitas khusus untuk Administrator Sistem dan Developer guna mengelola data database secara penuh.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 text-red-800 border border-red-200 text-xs font-bold rounded-lg flex items-center gap-2 animate-in fade-in-50">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-lg flex items-center gap-2 animate-in fade-in-50">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Backup Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 flex items-start gap-3.5 bg-emerald-50/75">
          <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
            <Download className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-md font-extrabold text-emerald-950 leading-snug">Backup & Ekspor Data Gudang</h3>
            <p className="text-xs text-emerald-800 mt-1 mb-4 font-medium max-w-2xl">
              Fasilitas untuk melakukan backup data WMS secara berkala. Tombol di bawah ini akan mengekspor seluruh data riwayat transaksi, daftar produk persediaan (stock overview), dan daftar rak fisik (locator) langsung dalam format JSON standar untuk disimpan secara aman.
            </p>
            <button
               onClick={handleBackup}
               disabled={backupLoading}
               className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
             >
               {backupLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
               Mulai Backup Data (JSON)
             </button>
          </div>
        </div>
      </div>

      {/* SaaS Migration Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 flex items-start gap-3.5 bg-blue-50">
          <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
            <Rocket className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-md font-extrabold text-blue-900 leading-snug">Migrate ke SaaS (Sistem Tenant)</h3>
            <p className="text-xs text-blue-700 mt-1 mb-4 font-medium max-w-2xl">
              Skrip ini akan membuat induk "COMPANY_C3_CORP" (sebagai tenant Gudang Anda), membuat paket "Enterprise" seumur hidup, lalu mengubah seluruh koleksi database lama menjadi milik company tersebut untuk support arsitektur Multi-Tenant.
            </p>
            <button
               onClick={handleMigrate}
               disabled={migrating}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
             >
               {migrating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
               Jalankan Migrasi SaaS
             </button>
          </div>
        </div>
      </div>

      {/* Reset Data Danger Zone Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header Warning */}
        <div className="p-6 bg-red-50 border-b border-red-100 flex items-start gap-3.5">
          <div className="p-2.5 bg-red-100 text-red-700 rounded-lg shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-md font-extrabold text-red-900 leading-snug">Zona Bahaya: Reset Seluruh Data Gudang</h3>
            <p className="text-xs text-red-700 mt-1 font-medium max-w-2xl">
              Tindakan ini permanen dan tidak dapat dibatalkan. Menjalankan operasi ini akan menghapus seluruh data Kode Produk (Stock Overview) serta seluruh catatan transaksi keluar-masuk (Inbound & Outbound) dari database Firestore.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <Trash2 className="w-3.5 h-3.5 text-red-500" /> DATA YANG AKAN DIHAPUS:
              </h4>
              <ul className="list-disc pl-4 space-y-1.5 font-medium">
                <li><strong className="text-slate-800">Semua Kode Produk</strong> (nama, kategori, volume, uom, detail packaging)</li>
                <li><strong className="text-slate-800">Riwayat Inbound</strong> (catatan detail penerimaan produk baru)</li>
                <li><strong className="text-slate-800">Riwayat Outbound</strong> (catatan pengeluaran barang & status booking)</li>
                <li><strong className="text-slate-800">Perhitungan On-hand Stock</strong> di seluruh lokasi rak</li>
              </ul>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="font-bold text-emerald-800 mb-2 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> DATA YANG TETAP DIPERTAHANKAN:
              </h4>
              <ul className="list-disc pl-4 space-y-1.5 font-medium text-slate-600">
                <li><strong className="text-slate-800">Struktur Fisik Rak/Locator</strong> (rancangan ribuan slot koordinat rak)</li>
                <li><strong className="text-slate-800">Daftar Akun Staff & Hak Akses</strong> (pengguna terdaftar tetap aktif)</li>
                <li><strong className="text-slate-800">Metrik Kapasitas Maksimal Rak</strong></li>
              </ul>
            </div>
          </div>

          <form onSubmit={handleReset} className="pt-4 border-t border-slate-100 max-w-lg space-y-5">
            <div className="space-y-2">
              <label htmlFor="confirmPhrase" className="block text-xs font-bold text-slate-700 leading-normal">
                Ketik <span className="font-black text-red-600 select-all">RESET GUDANG</span> di bawah untuk mengaktifkan tombol:
              </label>
              <input
                id="confirmPhrase"
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="Tulis frasa konfirmasi..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all"
                disabled={loading}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading || confirmPhrase !== targetPhrase}
                className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-45 disabled:hover:bg-red-600 text-white font-black rounded-lg text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mereset Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Hapus Seluruh Data Persediaan</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
