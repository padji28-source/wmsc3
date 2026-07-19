import React, { useEffect, useState } from 'react';
import { CreditCard, Rocket, CheckCircle2, AlertTriangle, Download, Clock } from 'lucide-react';
import { getCurrentUser } from '../lib/auth';
import { checkSubscription } from '../lib/tenant';
import { Subscription } from '../types';

export function BillingMenu() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const user = getCurrentUser();
    if (user && user.companyId) {
      checkSubscription(user.companyId).then(data => {
        setSub(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading Billing Data...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Billing & Subscription</h2>
          <p className="text-sm text-slate-500 mt-1">Manage your tenant subscription, usage, and payments.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors">
          <Rocket className="w-4 h-4" />
          Upgrade Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm col-span-2">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Current Plan</h3>
          
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20 text-white">
              <CreditCard className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-2xl font-black text-slate-800 uppercase">
                {sub ? sub.plan : 'NO PLAN'}
              </h4>
              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full mt-1 ${
                sub?.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 
                sub?.status === 'EXPIRED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {sub?.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {sub?.status || 'N/A'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500 mb-1">Billing Period</p>
              <p className="text-sm font-bold text-slate-800">
                {sub ? `${new Date(sub.startDate).toLocaleDateString()} - ${new Date(sub.endDate).toLocaleDateString()}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Auto Renew</p>
              <p className="text-sm font-bold text-slate-800">
                {sub?.autoRenew ? 'Enabled via Midtrans/Xendit' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-6 shadow-sm overflow-hidden relative">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Usage Tracker</h3>
          <div className="space-y-4 relative z-10">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">Users</span>
                <span className="text-slate-500">2 / {sub?.features.multiWarehouse ? '20' : '5'}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full" style={{ width: '40%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">Products</span>
                <span className="text-slate-500">1400 / {sub?.features.multiWarehouse ? '50000' : '2000'}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full" style={{ width: '70%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700">Warehouses</span>
                <span className="text-slate-500">1 / {sub?.features.multiWarehouse ? '5' : '1'}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm">
         <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Payment History</h3>
         <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="p-3 font-bold">Invoice</th>
                <th className="p-3 font-bold">Date</th>
                <th className="p-3 font-bold">Amount</th>
                <th className="p-3 font-bold">Status</th>
                <th className="p-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {/* Dummy Invoice for representation */}
              <tr className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 font-mono text-sm text-blue-600 font-bold">INV-2026-001</td>
                <td className="p-3 text-sm text-slate-700">June 20, 2026</td>
                <td className="p-3 text-sm font-bold text-slate-800">Rp 4.500.000</td>
                <td className="p-3">
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded">PAID</span>
                </td>
                <td className="p-3 text-right">
                   <button className="text-slate-400 hover:text-blue-600">
                     <Download className="w-4 h-4 inline-block" />
                   </button>
                </td>
              </tr>
            </tbody>
         </table>
      </div>
    </div>
  );
}
