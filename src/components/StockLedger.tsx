import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { History, ArrowDownLeft, ArrowUpRight, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { Transaction } from '../types';
import { useTransactions } from '../hooks/useTransactions';
import { TableSkeleton } from './Skeleton';

interface StockLedgerProps {
  globalSearch?: string;
}

// Sub-component for individual transaction rows to optimize renders
const TransactionRow = React.memo(({ tx, onClick, formatDate }: { tx: Transaction; onClick: () => void; formatDate: (iso: string) => string }) => {
  return (
    <tr onClick={onClick} className="hover:bg-slate-50 transition-colors cursor-pointer">
      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
        {formatDate(tx.timestamp)}
      </td>
      <td className="px-6 py-4">
        {tx.type === 'INBOUND' ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider border border-emerald-100">
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Inbound
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider border border-amber-100">
            <ArrowUpRight className="w-3.5 h-3.5" />
            Outbound
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-sm font-bold text-slate-900 font-mono tracking-tight">
        {tx.sku}
      </td>
      <td className="px-6 py-4 text-sm font-mono text-slate-600">
        {tx.locatorId}
        {tx.systemLocator && (
          <div className="text-[9px] text-slate-400 mt-0.5">{tx.systemLocator}</div>
        )}
      </td>
      <td className={`px-6 py-4 text-sm font-bold text-right font-mono ${tx.qty > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
        {tx.qty > 0 ? '+' : ''}{tx.qty}
      </td>
      <td className="px-6 py-4 text-sm font-medium text-slate-700">
        {tx.operator}
      </td>
      <td className="px-6 py-4">
        <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
          tx.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
          tx.status === 'PENDING' || tx.status === 'BOOKED' ? 'bg-amber-50 text-amber-700 border-amber-100' :
          'bg-slate-100 text-slate-600 border-slate-200'
        }`}>
          {tx.status}
        </span>
      </td>
    </tr>
  );
});

TransactionRow.displayName = 'TransactionRow';

export function StockLedger({ globalSearch = '' }: StockLedgerProps) {
  const [historyPageSize, setHistoryPageSize] = useState<number>(30);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Use our customized paginated transactions hook
  const {
    transactions,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    retry
  } = useTransactions({
    pageSize: historyPageSize,
    globalSearch
  });

  const formatDate = useCallback((isoString: string) => {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }, []);

  // Calculate aggregates dynamically using useMemo for performance
  const totalInbound = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'INBOUND')
      .reduce((sum, tx) => sum + Math.abs(tx.qty), 0);
  }, [transactions]);

  const totalOutbound = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'OUTBOUND')
      .reduce((sum, tx) => sum + Math.abs(tx.qty), 0);
  }, [transactions]);

  // Net movement (Inbound minus Outbound)
  const netChange = useMemo(() => totalInbound - totalOutbound, [totalInbound, totalOutbound]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-700" />
            Stock Ledger & Riwayat Transaksi
          </h2>
          <p className="text-slate-500 mt-1 text-sm">
            Daftar aktivitas inbound dan outbound teroptimasi dengan lazy-loading & pagination.
          </p>
        </div>
        <select 
          className="text-xs border border-slate-300 rounded p-2 bg-white"
          value={historyPageSize} 
          onChange={(e) => {
            setHistoryPageSize(Number(e.target.value));
          }}
        >
          <option value={30}>30/halaman</option>
          <option value={50}>50/halaman</option>
          <option value={100}>100/halaman</option>
        </select>
      </div>

      {error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
          <button 
            onClick={retry}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[850px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Kode</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Locator</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Qty</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-6">
                      <TableSkeleton rows={5} cols={7} />
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      Belum ada riwayat transaksi yang cocok atau terdaftar.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <TransactionRow 
                      key={tx.id} 
                      tx={tx} 
                      onClick={() => setSelectedTx(tx)} 
                      formatDate={formatDate} 
                    />
                  ))
                )}
              </tbody>

              {transactions.length > 0 && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-slate-800 font-bold sticky bottom-0 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-xs font-extrabold text-slate-600 uppercase tracking-wider text-right">
                      Net Balance ({transactions.length} Transaksi Terfilter) :
                    </td>
                    <td className={`px-6 py-4 text-sm font-extrabold font-mono text-right whitespace-nowrap ${
                      netChange === 0 ? 'text-slate-500' : netChange > 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {netChange > 0 ? '+' : ''}{netChange.toLocaleString('id-ID')}
                    </td>
                    <td colSpan={2} className="px-6 py-3 text-[11px] text-slate-500 font-bold tracking-wide border-l border-slate-200">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50/60 px-1.5 py-0.5 rounded border border-emerald-100 w-fit">
                          <ArrowDownLeft className="w-3 h-3" /> Total In: +{totalInbound.toLocaleString('id-ID')}
                        </div>
                        <div className="flex items-center gap-1 text-amber-700 bg-amber-50/60 px-1.5 py-0.5 rounded border border-amber-100 w-fit">
                          <ArrowUpRight className="w-3 h-3" /> Total Out: -{totalOutbound.toLocaleString('id-ID')}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center p-4 border-t border-slate-200 bg-slate-50">
              <button 
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Memuat...
                  </>
                ) : (
                  'Muat Lebih Banyak'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {selectedTx && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                Detail Transaksi
              </h3>
              <button 
                onClick={() => setSelectedTx(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Transaction ID</label>
                  <div className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded border border-slate-100 break-all">
                    {selectedTx.id}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date & Time</label>
                  <div className="text-sm font-medium text-slate-800 p-2">
                    {formatDate(selectedTx.timestamp)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Kode SKU</label>
                  <div className="text-lg font-bold font-mono text-blue-900">{selectedTx.sku}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Locator ID</label>
                  <div className="text-lg font-bold font-mono text-slate-800">{selectedTx.locatorId}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-100 py-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                  <div className={`text-xl font-bold font-mono ${selectedTx.qty > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedTx.qty > 0 ? '+' : ''}{selectedTx.qty}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Type</label>
                  <div className="text-sm font-bold text-slate-700 mt-1">{selectedTx.type}</div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                  <div className="text-sm font-bold text-slate-700 mt-1">{selectedTx.status}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator</label>
                <div className="text-sm font-medium text-slate-800 py-1">
                  {selectedTx.operator}
                </div>
              </div>

              {selectedTx.memo && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Memo / Notes</label>
                  <div className="text-sm text-slate-700 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                    {selectedTx.memo}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
               <button 
                onClick={() => setSelectedTx(null)}
                className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors cursor-pointer"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
