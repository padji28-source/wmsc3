import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity, User, Clock, FileText } from 'lucide-react';
import { Transaction } from '../types';
import { getTransactionsByDateRange } from '../lib/db';

export function AuditLog({ globalSearch = '' }: { globalSearch?: string }) {
  const [logs, setLogs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const startDate = todayStart.toISOString();

    getTransactionsByDateRange(startDate).then(data => {
        setLogs(data);
        setLoading(false);
    }).catch(console.error);
  }, []);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const filteredLogs = logs.filter((log) => {
    // Filter by today's date (beginning of the day)
    const logDate = new Date(log.timestamp);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    if (logDate < todayStart) return false;

    if (globalSearch === '') return true;
    
    const searchLower = globalSearch.toLowerCase();
    return (
      log.operator.toLowerCase().includes(searchLower) ||
      log.sku.toLowerCase().includes(searchLower) ||
      log.type.toLowerCase().includes(searchLower) ||
      log.status.toLowerCase().includes(searchLower)
    );
  })
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by newest first

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-purple-700" />
          System Audit Logs
        </h2>
        <p className="text-slate-500 mt-1 text-sm">
          Strict monitoring of inbound and outbound operational activities.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[850px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">Memuat data...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500">
                      Tidak ada rekaman audit log.
                    </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-slate-600 whitespace-nowrap flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <User className="w-4 h-4 text-slate-400" />
                        {log.operator}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border ${
                        log.type === 'INBOUND' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        <Activity className="w-3.5 h-3.5" />
                        {log.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700 flex items-center gap-2">
                       <FileText className="w-4 h-4 text-slate-400" />
                       <span>
                         Processed <strong className="font-mono">{Math.abs(log.qty)}</strong> units of Kode <strong className="font-mono bg-slate-100 px-1 rounded">{log.sku}</strong> at locator <strong className="font-mono">{log.locatorId}</strong>
                       </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        log.status === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        log.status === 'PENDING' || log.status === 'BOOKED' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
