# Testing Scenario: Rack Barcode Scanner

## Tujuan
Memastikan fitur baru 'Rack Barcode Scanner' berfungsi dengan baik dan tidak terjadi regresi pada alur inventory yang ada. Terdiri dari beberapa test case yang mencakup End-to-End dan Security Checking.

---

### Skenario 1: Test Barcode Scanning Valid
**Langkah-langkah:**
1. Generate dan cetak QR Code rak yang sudah ada (misal `FL-A1.1`) menggunakan tombol `Print Barcode` di menu Manajemen Rak.
2. Login sebagai *Operator*. Buka menu **Rack Scanner**.
3. Arahkan kamera device/handphone ke QR Code.
4. Sistem memproses scan.

**Ekspektasi Hasil:**
- Kamera menangkap kode dengan cepat (auto-focus works minimal via browser).
- Getaran perangkat aktif (jika didukung perangkat mobile).
- Tidak terjadi *double scan* (debounce terproteksi `loading`).
- UI menampilkan: Rack Code: `FL-A1.1`, info zona, usage progress bar, beserta tabel inventory dengan SKU yang tersimpan di dalamnya.
- History tercatat di database (`scan_history`).

---

### Skenario 2: Test Barcode Scanning Tidak Valid (Not Found)
**Langkah-langkah:**
1. Arahkan kamera scanner ke Barcode acak/salah.

**Ekspektasi Hasil:**
- UI menampilkan modal error/peringatan: "Rack Tidak Ditemukan"
- History tercatat di DB dengan action error.

---

### Skenario 3: Print Barcode oleh Admin
**Langkah-langkah:**
1. Login sebagai Developer / Super Admin.
2. Buka Menu **Manajemen Rak**.
3. Pilih salah satu baris rak, klik icon QR Code (Print Barcode).
4. Klik tombol "Print Sekarang".

**Ekspektasi Hasil:**
- Print dialog sistem operasi terbuka memanggil view struk ukuran 80mm roll, berisi QR Code tajam. Label yang tercetak adalah ID Locator dan Zone.

---

### Skenario 4: Role Based Access Control
**Langkah-langkah:**
1. Login sebagai Developer. Ekspektasi: Menu `Rack Scanner` ADA, CRUD `Manajemen Rak` ADA.
2. Login sebagai Kepala Gudang/Supervisor. Ekspektasi: Menu `Rack Scanner` ADA, CRUD `Manajemen Rak` TIDAK ADA.
3. Login sebagai Logistik/Operator Biasa. Ekspektasi: Menu `Rack Scanner` ADA, dan hanya punya akses Inbound/Outbound.

---

### Skenario 5: Integritas Inbound & Outbound
**Langkah-langkah:**
1. Lakukan Inbound dan tempatkan ke rak "FL-B1.1".
2. Buka `Rack Scanner` dan scan kode "FL-B1.1".

**Ekspektasi Hasil:**
- Qty pada grid hasil scanner harus bertambah persis sesuai Inbound.

**Langkah-langkah:**
1. Lakukan Outbound/Pengambilan dari rak tersebut.
2. Scan kembali "FL-B1.1".

**Ekspektasi Hasil:**
- Qty harus berkurang atau lenyap jika habis (Menampilkan label "Rack Kosong").
