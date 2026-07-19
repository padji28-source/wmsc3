import React, { useEffect, useState } from 'react';
import { Building2, Users, Box, Layers, Search } from 'lucide-react';

export function OwnerDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const [cmpRes, userRes, prodRes, locRes] = await Promise.all([
          fetch('/api/companies').then(r => r.ok ? r.json() : []),
          fetch('/api/users').then(r => r.ok ? r.json() : []),
          fetch('/api/products').then(r => r.ok ? r.json() : []),
          fetch('/api/locators').then(r => r.ok ? r.json() : [])
        ]);

        const companiesData: any[] = cmpRes.length > 0 ? cmpRes : [
          { id: 'COMPANY_C3_CORP', name: 'Gudang Utama C3 Corp', status: 'ACTIVE' }
        ];

        const usersData: any[] = userRes;
        const productsData: any[] = prodRes;
        const locatorsData: any[] = locRes;

        const statsData = companiesData.map(company => {
          const companyId = company.id || company.companyId;
          const usersCount = usersData.filter((u: any) => u.companyId === companyId).length;
          const skusCount = productsData.filter((p: any) => p.companyId === companyId).length;
          const racksCount = locatorsData.filter((l: any) => l.companyId === companyId).length;

          return {
            company,
            usersCount,
            skusCount,
            racksCount
          };
        });

        setStats(statsData);
      } catch (err) {
        console.error("OwnerDashboard gagal mengambil data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500 text-center animate-pulse">Memuat Data Dashboard Global...</div>;
  }

  const filtered = stats.filter(s => s.company.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalTenants = stats.length;
  const totalUsers = stats.reduce((acc, curr) => acc + curr.usersCount, 0);
  const totalSkus = stats.reduce((acc, curr) => acc + curr.skusCount, 0);
  const totalRacks = stats.reduce((acc, curr) => acc + curr.racksCount, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">Global Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Ringkasan Sistem untuk Owner & Developer.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-blue-500 mb-3"><Building2 className="w-8 h-8"/></div>
           <div className="text-3xl font-black text-slate-800">{totalTenants}</div>
           <div className="text-xs font-bold text-slate-500 uppercase mt-1">Total Tenants</div>
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-indigo-500 mb-3"><Users className="w-8 h-8"/></div>
           <div className="text-3xl font-black text-slate-800">{totalUsers}</div>
           <div className="text-xs font-bold text-slate-500 uppercase mt-1">Total Users</div>
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-emerald-500 mb-3"><Box className="w-8 h-8"/></div>
           <div className="text-3xl font-black text-slate-800">{totalSkus}</div>
           <div className="text-xs font-bold text-slate-500 uppercase mt-1">Total Kode Produk</div>
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
           <div className="text-amber-500 mb-3"><Layers className="w-8 h-8"/></div>
           <div className="text-3xl font-black text-slate-800">{totalRacks}</div>
           <div className="text-xs font-bold text-slate-500 uppercase mt-1">Total Racks</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-slate-800">Detail Per Tenant</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari tenant..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="p-4 font-black">Tenant / Company</th>
                <th className="p-4 font-black text-center">Users</th>
                <th className="p-4 font-black text-center">Kode Produk</th>
                <th className="p-4 font-black text-center">Racks</th>
                <th className="p-4 font-black text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{s.company.name}</div>
                    <div className="text-xs text-slate-500">{s.company.email || '-'}</div>
                  </td>
                  <td className="p-4 text-center font-mono">{s.usersCount}</td>
                  <td className="p-4 text-center font-mono">{s.skusCount}</td>
                  <td className="p-4 text-center font-mono">{s.racksCount}</td>
                  <td className="p-4 text-right">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${s.company.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                       {s.company.status || 'ACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Tidak ada tenant ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
