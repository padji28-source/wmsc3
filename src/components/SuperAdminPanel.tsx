import React, { useEffect, useState } from 'react';
import { Users, CreditCard, Building2, TrendingUp, AlertTriangle } from 'lucide-react';
import { Company, Subscription } from '../types';
import { companyService } from '../services/companyService';

export function SuperAdminPanel() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const c = await companyService.getCompanies();
        const s = await companyService.getSubscriptions();
        setCompanies(c);
        setSubs(s);
      } catch (err) {
        console.error("SuperAdminPanel error loading data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading Super Admin Data...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">Super Admin Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Global SaaS Management Panel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-blue-500 mb-2"><Building2 className="w-6 h-6"/></div>
           <div className="text-2xl font-black text-slate-800">{companies.length}</div>
           <div className="text-xs font-bold text-slate-500 uppercase">Registered Tenants</div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-emerald-500 mb-2"><CreditCard className="w-6 h-6"/></div>
           <div className="text-2xl font-black text-slate-800">{subs.filter(s => s.status === 'ACTIVE').length}</div>
           <div className="text-xs font-bold text-slate-500 uppercase">Active Subscriptions</div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-red-500 mb-2"><AlertTriangle className="w-6 h-6"/></div>
           <div className="text-2xl font-black text-slate-800">{subs.filter(s => s.status === 'EXPIRED').length}</div>
           <div className="text-xs font-bold text-slate-500 uppercase">Expired Tenants</div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-indigo-500 mb-2"><TrendingUp className="w-6 h-6"/></div>
           <div className="text-2xl font-black text-slate-800">Rp 0</div>
           <div className="text-xs font-bold text-slate-500 uppercase">Est. Monthly MRR</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200 font-bold text-slate-800">Tenant Registration List</div>
        <div className="p-0">
          <table className="w-full text-left border-collapse">
             <thead>
                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                  <th className="p-3">Company Name</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Created</th>
                </tr>
             </thead>
             <tbody>
                {companies.map(c => {
                  const s = subs.find(sub => sub.companyId === c.id);
                  return (
                    <tr key={c.id} className="border-b hover:bg-slate-50 text-sm">
                      <td className="p-3 font-bold text-slate-800">{c.name}</td>
                      <td className="p-3 font-mono text-xs">{s?.plan || 'NONE'}</td>
                      <td className="p-3">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${s?.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                           {s?.status || 'INACTIVE'}
                         </span>
                      </td>
                      <td className="p-3 text-right text-slate-500 text-xs">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
             </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
