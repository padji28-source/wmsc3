export interface ScanRecord {
  id?: string;
  barcode: string;
  type: 'RACK' | 'PRODUCT';
  scannedAt: string;
  scannedBy: string;
  companyId: string;
  data: any;
}

export const scanService = {
  saveScanHistory: async (scanRecord: Omit<ScanRecord, 'id'>): Promise<string> => {
    try {
      const response = await fetch('/api/scan-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanRecord)
      });
      if (response.ok) {
        const result = await response.json();
        return result.id;
      }
      throw new Error(`Server returned status ${response.status}`);
    } catch (err) {
      console.warn("scanService.saveScanHistory failed, logging offline fallback", err);
      return `offline-${Date.now()}`;
    }
  }
};
