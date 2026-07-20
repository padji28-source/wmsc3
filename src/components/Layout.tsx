import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Box, 
  LogIn, 
  LogOut, 
  History, 
  Settings, 
  Bell, 
  Search, 
  Power, 
  Scale, 
  ShieldAlert, 
  UserPlus, 
  Layers, 
  ArrowRightLeft, 
  ScanBarcode, 
  Database, 
  ClipboardList, 
  CreditCard,
  Smartphone,
  Monitor,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Home,
  User,
  Boxes,
  Camera,
  Info,
  X,
  Share,
  Download
} from 'lucide-react';
import { getCurrentUser, logoutUser } from '../lib/auth';
import { Transaction } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  // Menambahkan properti Opsional untuk Search agar terhubung secara global
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function Layout({ 
  children, 
  currentTab, 
  onTabChange, 
  onLogout,
  searchQuery,
  onSearchChange 
}: LayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [deviceView, setDeviceView] = useState<'desktop' | 'ios' | 'android'>('desktop');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [mobileProfileActive, setMobileProfileActive] = useState(false);
  const [isStockSheetOpen, setIsStockSheetOpen] = useState(false);
  const [isTxSheetOpen, setIsTxSheetOpen] = useState(false);
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const user = getCurrentUser();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const [isTransaksiOpen, setIsTransaksiOpen] = useState(false);
  const [isStockOpen, setIsStockOpen] = useState(false);
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstallable(false);
    } else {
      setIsInstallable(true);
    }

    const handleAppInstalled = () => {
      console.log('App successfully installed!');
      setIsInstallable(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User installation decision: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else {
      setShowInstallGuide(true);
    }
  };

  useEffect(() => {
    if (['inbound', 'outbound', 'moving'].includes(currentTab)) {
      setIsTransaksiOpen(true);
    }
    if (['controlstock', 'ledger', 'balance'].includes(currentTab)) {
      setIsStockOpen(true);
    }
    if (['staff', 'rack', 'billing'].includes(currentTab)) {
      setIsManagementOpen(true);
    }
  }, [currentTab]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  useEffect(() => {
    const companyId = user?.companyId;
    const isDeveloper = user?.role === 'Developer';
    
    const fetchRecentTxs = async () => {
      try {
        const url = `/api/transactions?pageSize=15${(!isDeveloper && companyId) ? `&companyId=${encodeURIComponent(companyId)}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const result = await res.json();
          if (result && Array.isArray(result.data)) {
            setRecentTransactions(result.data);
          }
        }
      } catch (err) {
        console.warn("Gagal mengambil transaksi terbaru:", err);
      }
    };

    fetchRecentTxs();
    const interval = setInterval(fetchRecentTxs, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Membagi transaksi realtime berdasarkan hari
  const groupedTransactions = useMemo(() => {
    const groups: { dateLabel: string; items: Transaction[] }[] = [];
    const absoluteGroups: Record<string, Transaction[]> = {};

    recentTransactions.forEach((tx) => {
      if (!tx.timestamp) return;
      const dateObj = new Date(tx.timestamp);
      
      const dateLabel = dateObj.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      if (!absoluteGroups[dateLabel]) {
        absoluteGroups[dateLabel] = [];
      }
      absoluteGroups[dateLabel].push(tx);
    });

    Object.keys(absoluteGroups).forEach((label) => {
      groups.push({
        dateLabel: label,
        items: absoluteGroups[label]
      });
    });

    return groups;
  }, [recentTransactions]);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Fallback state lokal jika App.tsx belum melemparkan state search global (menghindari error)
  const [localSearch, setLocalSearch] = useState('');
  const activeSearchValue = searchQuery !== undefined ? searchQuery : localSearch;

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
    } else {
      setLocalSearch(value);
    }
  };

  const handleLogout = () => {
    logoutUser();
    if (onLogout) onLogout();
  };

  let tabs: any[] = [];
  const role = user?.role || '';

  // 1. Dashboard is generally available to all recognized roles
  tabs.push({ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });

  // 2. Roles: OWNER dan Developer -> Billing, User management, Settings
  if (['OWNER', 'Developer', 'Super Admin'].includes(role)) {
    tabs.push({ id: 'staff', label: 'Staff Management', icon: UserPlus });
    if (role === 'Super Admin' || role === 'Developer') {
      tabs.push({ id: 'rack', label: 'Manajemen Rak', icon: Layers });
    }
    tabs.push({ id: 'billing', label: 'Billing & Plan', icon: CreditCard });
  }

  if (role === 'Developer') {
    tabs.push({ id: 'superadmin', label: 'Super Admin', icon: Database });
    tabs.push({ id: 'developer', label: 'Developer Tools', icon: Database });
  }

  // 3. Roles: ADMIN -> Semua operasional warehouse
  if (['ADMIN', 'Super Admin', 'Admin C3'].includes(role)) {
    tabs.push({ id: 'inventory', label: 'Master Data', icon: Box });
    tabs.push({ id: 'controlstock', label: 'Control Stock', icon: ClipboardList });
    tabs.push({ id: 'inbound', label: 'Inbound', icon: LogIn });
    tabs.push({ id: 'moving', label: 'Moving Rack', icon: ArrowRightLeft });
    tabs.push({ id: 'outbound', label: 'Outbound', icon: LogOut });
    tabs.push({ id: 'ledger', label: 'Stock Ledger', icon: History });
    tabs.push({ id: 'balance', label: 'Stock Balance', icon: Scale });
    tabs.push({ id: 'scanner', label: 'Rack Scanner', icon: ScanBarcode });
  }

  // 4. Roles: MANAGER dan Kepala Gudang -> Approve transaksi, Report
  if (['MANAGER', 'Kepala Gudang', 'Kepala Gudang JKT'].includes(role)) {
    tabs.push({ id: 'inbound', label: 'Inbound', icon: LogIn });
    tabs.push({ id: 'outbound', label: 'Outbound', icon: LogOut });
    tabs.push({ id: 'controlstock', label: 'Control Stock', icon: ClipboardList });
    tabs.push({ id: 'ledger', label: 'Stock Ledger', icon: History });
    tabs.push({ id: 'balance', label: 'Stock Balance', icon: Scale });
  }

  // 5. Roles: Petugas, Helper -> Inbound, Outbound, Scanner
  if (['Petugas', 'Helper'].includes(role)) {
    tabs.push({ id: 'inbound', label: 'Inbound', icon: LogIn });
    tabs.push({ id: 'outbound', label: 'Outbound', icon: LogOut });
    tabs.push({ id: 'scanner', label: 'Rack Scanner', icon: ScanBarcode });
  }

  // Deduplicate tabs just in case a role matches multiple overlapping conditions
  tabs = tabs.filter((t, index, self) => index === self.findIndex(i => i.id === t.id));

  const visibleTabs = useMemo(() => {
    return new Set(tabs.map(t => t.id));
  }, [tabs]);

  const renderMenuItem = (id: string, label: string, Icon: any, isSubmenu = false) => {
    if (!visibleTabs.has(id)) return null;
    const isActive = currentTab === id;
    return (
      <button
        key={id}
        onClick={() => {
          onTabChange(id);
          setIsMobileOpen(false);
        }}
        className={`w-full flex items-center gap-3 cursor-pointer text-sm font-medium transition-all ${
          isSubmenu 
            ? 'pl-12 pr-6 py-2 border-r-2 border-transparent hover:border-slate-300 hover:bg-slate-50/50 text-xs' 
            : 'px-6 py-3 border-r-4 border-transparent hover:bg-slate-50'
        } ${
          isActive 
            ? isSubmenu 
              ? 'text-blue-700 bg-blue-50/30 font-bold border-r-2 !border-blue-600' 
              : 'text-blue-700 border-r-4 !border-blue-700 bg-blue-50/50 font-bold' 
            : 'text-slate-600 hover:text-blue-600'
        }`}
      >
        <Icon className={`${isSubmenu ? 'w-4 h-4' : 'w-5 h-5'} ${isActive ? 'text-blue-700' : 'text-slate-400'}`} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  const renderGroupHeader = (
    label: string, 
    Icon: any, 
    isOpen: boolean, 
    setIsOpen: (val: boolean) => void, 
    subIds: string[]
  ) => {
    const hasVisibleSub = subIds.some(id => visibleTabs.has(id));
    if (!hasVisibleSub) return null;

    const isAnyActive = subIds.includes(currentTab);

    return (
      <div className="flex flex-col">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between px-6 py-3 cursor-pointer text-sm font-semibold transition-all hover:bg-slate-50 ${
            isAnyActive ? 'text-blue-700 bg-slate-50/40' : 'text-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${isAnyActive ? 'text-blue-700' : 'text-slate-500'}`} aria-hidden="true" />
            <span>{label}</span>
          </div>
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {isOpen && (
          <div className="bg-slate-50/20 py-0.5 border-y border-slate-100/50 transition-all duration-200">
            {label === 'Transaksi' && (
              <>
                {renderMenuItem('inbound', 'Inbound', LogIn, true)}
                {renderMenuItem('outbound', 'Outbound', LogOut, true)}
                {renderMenuItem('moving', 'Moving Rack', ArrowRightLeft, true)}
              </>
            )}
            {label === 'Stock' && (
              <>
                {renderMenuItem('controlstock', 'Control Stock', ClipboardList, true)}
                {renderMenuItem('ledger', 'Stock Ledger', History, true)}
                {renderMenuItem('balance', 'Stock Balance', Scale, true)}
              </>
            )}
            {label === 'Management' && (
              <>
                {renderMenuItem('staff', 'Staff Management', UserPlus, true)}
                {renderMenuItem('rack', 'Manajemen Rak', Layers, true)}
                {renderMenuItem('billing', 'Billing & Plan', CreditCard, true)}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const mainContent = (
    <div className={`flex ${deviceView === 'desktop' ? 'h-screen' : 'h-full'} bg-slate-50 overflow-hidden font-sans text-slate-900`}>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-45 lg:hidden transition-all duration-300"
        />
      )}

      {/* Sidebar - responsive collapse & slide-in */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static print:hidden ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-6 py-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-700 flex items-center gap-2">
              <Building2 className="w-6 h-6" />
              Gudang C3
            </h1>
            <p className="text-sm text-slate-500 mt-1">Warehouse Operations</p>
          </div>
          <button 
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors cursor-pointer"
            title="Tutup Menu"
            aria-label="Tutup Menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <nav className="flex-1 mt-4 space-y-1 overflow-y-auto max-h-[calc(100vh-180px)]">
          {/* Dashboard */}
          {renderMenuItem('dashboard', 'Dashboard', LayoutDashboard)}

          {/* Master Data */}
          {renderMenuItem('inventory', 'Master Data', Box)}

          {/* Group: Transaksi */}
          {renderGroupHeader(
            'Transaksi', 
            ArrowRightLeft, 
            isTransaksiOpen, 
            setIsTransaksiOpen, 
            ['inbound', 'outbound', 'moving']
          )}

          {/* Group: Stock */}
          {renderGroupHeader(
            'Stock', 
            Boxes, 
            isStockOpen, 
            setIsStockOpen, 
            ['controlstock', 'ledger', 'balance']
          )}

          {/* Group: Management */}
          {renderGroupHeader(
            'Management', 
            Settings, 
            isManagementOpen, 
            setIsManagementOpen, 
            ['staff', 'rack', 'billing']
          )}

          {/* Rack Scanner */}
          {renderMenuItem('scanner', 'Rack Scanner', ScanBarcode)}

          {/* Super Admin */}
          {renderMenuItem('superadmin', 'Super Admin', Database)}

          {/* Developer Tools */}
          {renderMenuItem('developer', 'Developer Tools', Database)}
        </nav>

        {isInstallable && (
          <div className="mx-4 mb-4 p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100 shadow-xs text-left">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-xl shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black text-slate-800 tracking-tight leading-snug">Pasang Aplikasi WMS</h4>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">Instal di perangkat Anda untuk akses instan & performa cepat.</p>
              </div>
            </div>
            <button
              onClick={handleInstallClick}
              className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-[10px] rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Instal Sekarang
            </button>
          </div>
        )}

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 font-sans">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                {user ? user.name.substring(0, 2).toUpperCase() : 'AR'}
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-slate-800">{user ? user.name : 'Unknown'}</p>
                <p className="text-xs text-slate-500">{user ? user.role : 'Guest'}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Logout" aria-label="Logout">
              <Power className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 z-30 sticky top-0 gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="lg:hidden p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Buka Menu"
              aria-label="Buka Menu"
              aria-expanded={isMobileOpen}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 relative">
            {/* Device View Switcher (Desktop Only) */}
            <div className="hidden md:flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setDeviceView('desktop')}
                className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${deviceView === 'desktop' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Tampilan Desktop"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Desktop</span>
              </button>
              <button
                onClick={() => setDeviceView('ios')}
                className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${deviceView === 'ios' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Tampilan iPhone 15"
              >
                <Smartphone className="w-3.5 h-3.5 text-slate-800" />
                <span className="hidden lg:inline">iPhone 15</span>
              </button>
              <button
                onClick={() => setDeviceView('android')}
                className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold ${deviceView === 'android' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                title="Tampilan Galaxy S24"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden lg:inline">Android</span>
              </button>
            </div>

            <button 
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 text-slate-500 hover:text-blue-600 transition-colors" 
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" aria-hidden="true" />
              {recentTransactions.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-12 w-96 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in-50 slide-in-from-top-2 duration-150">
                <div className="p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-800">Realtime Updates Ledger</h3>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                    {recentTransactions.length} update
                  </span>
                </div>
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {groupedTransactions.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">Belum ada update aktivitas terbaru</div>
                  ) : (
                    groupedTransactions.map((group) => (
                      <div key={group.dateLabel} className="bg-white">
                        {/* Day Header */}
                        <div className="sticky top-0 bg-slate-100 px-4 py-1.5 text-[11px] font-bold text-slate-600 border-b border-slate-200 flex justify-between">
                          <span>{group.dateLabel}</span>
                          <span className="text-slate-400 font-medium">({group.items.length} aktivitas)</span>
                        </div>
                        {/* Day Items */}
                        <div className="flex flex-col divide-y divide-slate-50">
                          {group.items.map((tx) => (
                            <div key={tx.id} className="p-3.5 hover:bg-slate-50/50 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                  {tx.type === 'INBOUND' ? (
                                    <div className="p-1 px-1.5 bg-emerald-50 rounded text-emerald-600 font-bold text-[10px]">IN</div>
                                  ) : (
                                    <div className="p-1 px-1.5 bg-orange-50 rounded text-orange-600 font-bold text-[10px]">OUT</div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                      {tx.sku}
                                    </p>
                                    <span className="text-[10px] font-medium text-slate-400 shrink-0">
                                      {formatTime(tx.timestamp)}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-1">
                                    Jumlah: <span className="font-bold text-slate-700">{Math.abs(tx.qty)}</span> di <span className="font-bold text-slate-700">{tx.locatorId || 'Buffer/Bin'}</span>
                                  </p>
                                  {/* Operator Info */}
                                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-400 bg-slate-50 rounded px-2 py-1 inline-flex max-w-full">
                                    <span className="font-bold text-slate-500 shrink-0">Operator:</span>
                                    <span className="truncate text-slate-600 font-semibold">{tx.operator || 'System'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 md:p-8">
          <div className="w-full mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );

  const stockOptions = [
    { id: 'controlstock', label: 'Control Stock', icon: ClipboardList, desc: 'Pengendalian & visualizer fisik' },
    { id: 'inventory', label: 'Master Data', icon: Box, desc: 'Registrasi SKU & info produk' },
    { id: 'ledger', label: 'Stock Ledger', icon: History, desc: 'Jurnal & jejak log transaksi' },
    { id: 'balance', label: 'Stock Balance', icon: Scale, desc: 'Neraca total stock & filter' }
  ].filter(opt => tabs.some(t => t.id === opt.id));

  const txOptions = [
    { id: 'inbound', label: 'Inbound (Barang Masuk)', icon: LogIn, desc: 'Catat penerimaan & verifikasi barang masuk', bg: 'bg-emerald-500' },
    { id: 'outbound', label: 'Outbound (Barang Keluar)', icon: LogOut, desc: 'Catat pengiriman & penarikan barang dari rak', bg: 'bg-rose-500' },
    { id: 'moving', label: 'Moving Rack (Pindah Lokasi)', icon: ArrowRightLeft, desc: 'Pemindahan stok fisik antar bin / rak gudang', bg: 'bg-indigo-500' }
  ].filter(opt => tabs.some(t => t.id === opt.id));

  const isInsideSimulator = deviceView !== 'desktop';

  const mobileContent = (
    <div className={`w-full h-full flex flex-col bg-slate-50 relative overflow-hidden font-sans text-slate-900 ${isInsideSimulator ? 'rounded-[26px]' : 'rounded-none'}`}>
      {/* Mobile Top Header */}
      <div className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-5 sticky top-0 z-30 shrink-0">
        {isMobileSearchExpanded ? (
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="search" 
                placeholder="Cari Kode, Batch, atau Rak..." 
                autoFocus
                value={activeSearchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border-none rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
              />
            </div>
            <button 
              onClick={() => {
                setIsMobileSearchExpanded(false);
                handleSearchChange('');
              }}
              className="text-xs font-black text-blue-600 hover:text-blue-700 shrink-0 transition-colors"
            >
              Batal
            </button>
          </div>
        ) : (
          <>
            {/* Header left */}
            <div className="flex items-center gap-2.5">
              {(mobileProfileActive || currentTab !== 'dashboard') ? (
                <button
                  onClick={() => {
                    if (mobileProfileActive) {
                      setMobileProfileActive(false);
                      onTabChange('dashboard');
                    } else if (['staff', 'rack', 'billing', 'developer', 'superadmin'].includes(currentTab)) {
                      setMobileProfileActive(true);
                    } else {
                      onTabChange('dashboard');
                    }
                  }}
                  className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg border border-slate-100 transition-colors cursor-pointer flex items-center justify-center"
                  title="Kembali"
                >
                  <ChevronLeft className="w-4.5 h-4.5" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shadow-inner">
                  {user ? user.name.substring(0, 2).toUpperCase() : 'AR'}
                </div>
              )}

              <div className="text-left">
                {mobileProfileActive ? (
                  <h2 className="text-sm font-black text-slate-800">Profil Operator</h2>
                ) : currentTab === 'dashboard' ? (
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Warehouse Operator</p>
                    <h2 className="text-xs font-black text-slate-800 leading-none">Halo, {user ? user.name.split(' ')[0] : 'Operator'}</h2>
                  </div>
                ) : (
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide truncate max-w-[150px]">
                    {tabs.find(t => t.id === currentTab)?.label || 'Gudang C3'}
                  </h2>
                )}
              </div>
            </div>

            {/* Header right */}
            <div className="flex items-center gap-1">
              {['dashboard', 'inventory', 'controlstock', 'inbound', 'outbound', 'ledger', 'balance'].includes(currentTab) && !mobileProfileActive && (
                <button 
                  onClick={() => setIsMobileSearchExpanded(true)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                  title="Cari"
                >
                  <Search className="w-4.5 h-4.5" />
                </button>
              )}

              <button 
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-1.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                title="Notifikasi"
              >
                <Bell className="w-4.5 h-4.5" />
                {recentTransactions.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white animate-pulse"></span>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Realtime notifications popup for mobile overlay */}
      {notificationsOpen && (
        <div className="absolute top-14 left-4 right-4 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_24px_rgba(0,0,0,0.12)] max-h-[300px] overflow-hidden z-50 flex flex-col text-left">
          <div className="p-3 border-b border-slate-50 bg-slate-50/80 backdrop-blur-sm flex justify-between items-center shrink-0">
            <span className="text-xs font-extrabold text-slate-800">Ledger Realtime ({recentTransactions.length})</span>
            <button 
              onClick={() => setNotificationsOpen(false)}
              className="text-[10px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Tutup
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {recentTransactions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">Tidak ada update ledger</div>
            ) : (
              recentTransactions.slice(0, 8).map((tx) => (
                <div key={tx.id} className="p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${tx.type === 'INBOUND' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                      {tx.type}
                    </span>
                    <span className="text-[9px] text-slate-400">{formatTime(tx.timestamp)}</span>
                  </div>
                  <p className="font-bold text-slate-800 mt-1">{tx.sku}</p>
                  <p className="text-[10px] text-slate-500">Qty: {Math.abs(tx.qty)} | Bin: {tx.locatorId || 'Buffer'}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main viewport body inside Phone */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {mobileProfileActive ? (
          /* Custom Mobile Profile Screen */
          <div className="flex flex-col h-full bg-slate-50 text-left">
            {/* User Profile Card */}
            <div className="p-4 bg-white border-b border-slate-100 shadow-2xs flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-black text-xl border-4 border-slate-100 shadow-sm relative">
                {user ? user.name.substring(0, 2).toUpperCase() : 'AR'}
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white"></div>
              </div>
              <h3 className="text-sm font-black text-slate-800 mt-2.5">{user ? user.name : 'Unknown Operator'}</h3>
              <p className="text-[10px] text-slate-400">{user?.email || 'operator@warehouse.com'}</p>
              
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-black rounded-full border border-blue-100 mt-2 uppercase tracking-wider">
                {user?.role || 'Operator'}
              </span>
              
              <div className="w-full grid grid-cols-2 gap-4 mt-4 pt-3.5 border-t border-slate-100">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Warehouse</p>
                  <p className="text-xs font-extrabold text-slate-600 mt-0.5 truncate">{user?.companyId || 'Gudang C3'}</p>
                </div>
                <div className="text-center border-l border-slate-100">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Sesi</p>
                  <p className="text-xs font-black text-emerald-600 mt-0.5">Aktif</p>
                </div>
              </div>
            </div>

            {/* Menu options list grouped */}
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase text-slate-400 px-1 tracking-wider">Sistem & Pengaturan</p>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                  {/* Staff Management */}
                  {['OWNER', 'Developer', 'Super Admin'].includes(role) && (
                    <button 
                      onClick={() => {
                        onTabChange('staff');
                        setMobileProfileActive(false);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                          <UserPlus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Staff Management</p>
                          <p className="text-[9px] text-slate-400">Atur hak akses & operator</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  )}

                  {/* Manajemen Rak */}
                  {(role === 'Super Admin' || role === 'Developer') && (
                    <button 
                      onClick={() => {
                        onTabChange('rack');
                        setMobileProfileActive(false);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Manajemen Rak</p>
                          <p className="text-[9px] text-slate-400">Desain layout & denah fisik</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  )}

                  {/* Billing & Plan */}
                  {['OWNER', 'Developer', 'Super Admin'].includes(role) && (
                    <button 
                      onClick={() => {
                        onTabChange('billing');
                        setMobileProfileActive(false);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Billing & Plan</p>
                          <p className="text-[9px] text-slate-400">Langganan kuota & tagihan</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  )}
                </div>
              </div>



              {role === 'Developer' && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase text-slate-400 px-1 tracking-wider">Developer & DB</p>
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                    <button 
                      onClick={() => {
                        onTabChange('superadmin');
                        setMobileProfileActive(false);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                          <Database className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Super Admin Panel</p>
                          <p className="text-[9px] text-slate-400">Konsol kendali data</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>

                    <button 
                      onClick={() => {
                        onTabChange('developer');
                        setMobileProfileActive(false);
                      }}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                          <Settings className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">Developer Tools</p>
                          <p className="text-[9px] text-slate-400">Uji coba & reset database</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  </div>
                </div>
              )}

              {isInstallable && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-100 overflow-hidden">
                  <button 
                    onClick={() => {
                      setMobileProfileActive(false);
                      handleInstallClick();
                    }}
                    className="w-full p-3.5 flex items-center justify-between text-left hover:bg-blue-50/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">Pasang Aplikasi (PWA)</p>
                        <p className="text-[9px] text-slate-500">Instal di layar utama perangkat Anda</p>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-blue-600" />
                  </button>
                </div>
              )}

              {/* Keluar */}
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <button 
                  onClick={handleLogout}
                  className="w-full p-3.5 flex items-center justify-between text-left hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 text-red-600 rounded-xl">
                      <Power className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black">Keluar Aplikasi (Logout)</p>
                      <p className="text-[9px] text-red-400">Akhiri sesi operator</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-red-300" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Active children page view wrapper for standard screens */
          <div className="p-4">
            {children}
          </div>
        )}
      </div>

      {/* Bottomsheets Overlay Modal for Stock */}
      {isStockSheetOpen && (
        <div className="absolute inset-0 z-48 flex flex-col justify-end text-left">
          <div 
            onClick={() => setIsStockSheetOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
          />
          <div className="bg-white rounded-t-[28px] border-t border-slate-200 shadow-2xl p-5 pb-6 z-50 flex flex-col gap-4 max-w-full">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
            <div className="text-left">
              <h3 className="text-xs font-black text-slate-800">Menu Persediaan Stock</h3>
              <p className="text-[9px] text-slate-400">Atur barang & pantau balance pergudangan</p>
            </div>
            
            {stockOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-600">Akses Terbatas</p>
                <p className="mt-0.5 text-[9px]">Peran Anda ({role}) tidak memiliki izin akses untuk Menu Stock.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 mt-1">
                {stockOptions.map((opt) => {
                  const IconComponent = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onTabChange(opt.id);
                        setMobileProfileActive(false);
                        setIsStockSheetOpen(false);
                      }}
                      className={`p-3 border rounded-2xl flex flex-col gap-2 text-left transition-all cursor-pointer ${
                        currentTab === opt.id ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
                      }`}
                    >
                      <div className="p-1.5 bg-blue-500 text-white rounded-xl w-8 h-8 flex items-center justify-center">
                        <IconComponent className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{opt.label}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottomsheets Overlay Modal for Transaksi */}
      {isTxSheetOpen && (
        <div className="absolute inset-0 z-48 flex flex-col justify-end text-left">
          <div 
            onClick={() => setIsTxSheetOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
          />
          <div className="bg-white rounded-t-[28px] border-t border-slate-200 shadow-2xl p-5 pb-6 z-50 flex flex-col gap-4 max-w-full">
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
            <div className="text-left">
              <h3 className="text-xs font-black text-slate-800">Menu Transaksi Warehouse</h3>
              <p className="text-[9px] text-slate-400">Pencatatan aktivitas keluar masuk barang & rak</p>
            </div>
            
            {txOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-bold text-slate-600">Akses Terbatas</p>
                <p className="mt-0.5 text-[9px]">Peran Anda ({role}) tidak memiliki izin akses untuk Menu Transaksi.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 mt-1">
                {txOptions.map((opt) => {
                  const IconComponent = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onTabChange(opt.id);
                        setMobileProfileActive(false);
                        setIsTxSheetOpen(false);
                      }}
                      className={`p-3 border rounded-2xl flex items-center gap-3 text-left transition-all cursor-pointer ${
                        currentTab === opt.id ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 hover:bg-slate-100 border-slate-100'
                      }`}
                    >
                      <div className={`p-2 ${opt.bg} text-white rounded-xl`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{opt.label}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Navigation Bar */}
      <div className="h-16 bg-white border-t border-slate-200/80 px-2 flex items-center justify-between shrink-0 relative z-40 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.03)] rounded-b-[26px]">
        {/* Slot 1: Beranda */}
        <button 
          onClick={() => {
            onTabChange('dashboard');
            setMobileProfileActive(false);
            setIsStockSheetOpen(false);
            setIsTxSheetOpen(false);
          }} 
          className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-all duration-150 cursor-pointer ${
            !mobileProfileActive && currentTab === 'dashboard'
              ? 'text-blue-600 font-extrabold scale-102'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Beranda</span>
        </button>

        {/* Slot 2: Stock */}
        <button 
          onClick={() => {
            setIsStockSheetOpen(!isStockSheetOpen);
            setIsTxSheetOpen(false);
          }} 
          className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-all duration-150 cursor-pointer ${
            !mobileProfileActive && ['controlstock', 'inventory', 'ledger', 'balance'].includes(currentTab)
              ? 'text-blue-600 font-extrabold scale-102'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Stock</span>
        </button>

        {/* Slot 3: Center Scanner Camera Button */}
        <div className="flex-1 flex flex-col items-center justify-center relative -top-3.5">
          <button 
            onClick={() => {
              onTabChange('scanner');
              setMobileProfileActive(false);
              setIsStockSheetOpen(false);
              setIsTxSheetOpen(false);
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer ${
              !mobileProfileActive && currentTab === 'scanner'
                ? 'bg-blue-600 text-white shadow-blue-500/45 ring-4 ring-blue-50'
                : 'bg-emerald-600 text-white shadow-emerald-500/45 ring-4 ring-emerald-50'
            }`}
            title="Scan Rak"
          >
            <Camera className="w-5.5 h-5.5" />
          </button>
          <span className="text-[9px] font-bold text-slate-500 mt-1.5">Scan Rak</span>
        </div>

        {/* Slot 4: Transaksi */}
        <button 
          onClick={() => {
            setIsTxSheetOpen(!isTxSheetOpen);
            setIsStockSheetOpen(false);
          }} 
          className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-all duration-150 cursor-pointer ${
            !mobileProfileActive && ['inbound', 'outbound', 'moving'].includes(currentTab)
              ? 'text-blue-600 font-extrabold scale-102'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ArrowRightLeft className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Transaksi</span>
        </button>

        {/* Slot 5: Profil */}
        <button 
          onClick={() => {
            setMobileProfileActive(true);
            setIsStockSheetOpen(false);
            setIsTxSheetOpen(false);
          }} 
          className={`flex flex-col items-center justify-center flex-1 py-1.5 transition-all duration-150 cursor-pointer ${
            mobileProfileActive || ['staff', 'rack', 'billing', 'developer', 'superadmin'].includes(currentTab)
              ? 'text-blue-600 font-extrabold scale-102'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[9px] font-bold mt-1">Profil</span>
        </button>
      </div>
    </div>
  );



  const renderInstallGuideModal = () => {
    if (!showInstallGuide) return null;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowInstallGuide(false)}></div>
        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-6 w-full max-w-md z-50 relative text-left text-slate-800 animate-in fade-in zoom-in-95 duration-200 font-sans">
          <button 
            onClick={() => setShowInstallGuide(false)}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900">Panduan Instalasi Aplikasi</h3>
              <p className="text-[9px] text-slate-400 mt-0.5">Pasang WMS Gudang PSN di layar utama perangkat Anda</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Android/Chrome */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">1</span>
                <h4 className="text-[11px] font-black text-slate-800">Pengguna Android (Chrome/Opera)</h4>
              </div>
              <p className="text-[10px] text-slate-600 pl-7 leading-relaxed">
                Ketuk ikon <span className="font-bold text-slate-800">titik tiga (⋮)</span> di pojok kanan atas browser Chrome, lalu pilih <span className="font-bold text-slate-800">"Instal Aplikasi"</span> atau <span className="font-bold text-slate-800">"Tambahkan ke Layar Utama"</span>.
              </p>
            </div>

            {/* iOS Safari */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center">2</span>
                <h4 className="text-[11px] font-black text-slate-800">Pengguna iPhone / iOS (Safari)</h4>
              </div>
              <p className="text-[10px] text-slate-600 pl-7 leading-relaxed">
                Buka aplikasi ini di browser <span className="font-bold text-slate-800">Safari</span>, ketuk tombol <span className="font-bold text-slate-800">Bagikan/Share (ikon kotak panah atas)</span> di bar bawah, gulir ke bawah, lalu pilih <span className="font-bold text-slate-800">"Tambahkan ke Layar Utama"</span>.
              </p>
            </div>

            {/* Desktop Chrome */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center">3</span>
                <h4 className="text-[11px] font-black text-slate-800">Pengguna Laptop / Desktop</h4>
              </div>
              <p className="text-[10px] text-slate-600 pl-7 leading-relaxed">
                Ketuk ikon <span className="font-bold text-slate-800">Instal (ikon monitor bertanda panah bawah)</span> di bilah alamat browser (URL bar) atau tombol instal di sidebar kiri aplikasi ini.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowInstallGuide(false)}
            className="mt-5 w-full py-2.5 bg-slate-950 hover:bg-slate-900 active:bg-slate-950 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer text-center"
          >
            Saya Mengerti
          </button>
        </div>
      </div>
    );
  };

  if (deviceView === 'desktop') {
    if (isMobileViewport) {
      return (
        <div className="w-screen h-screen flex flex-col bg-slate-50 relative overflow-hidden font-sans text-slate-950">
          <div className="flex-1 bg-slate-50 relative overflow-hidden flex flex-col">
            {mobileContent}
          </div>
          {renderInstallGuideModal()}
        </div>
      );
    }
    return (
      <div className="relative">
        {mainContent}
        {renderInstallGuideModal()}
      </div>
    );
  }

  const isIOS = deviceView === 'ios';

  return (
    <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden select-none font-sans text-slate-200">
      {/* Interactive Grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35"></div>
      
      {/* Subtle radial light leak */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Simulator Control Header */}
      <div className="z-40 flex items-center justify-between w-full max-w-4xl px-6 py-3 bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-2xl absolute top-4 shadow-[0_15px_35px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wider text-slate-100 uppercase">WMS Mobile Simulator</span>
              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] rounded-full border border-blue-500/20 font-bold uppercase">Ready</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Simulasi perangkat mobile untuk kemudahan scan barcode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setDeviceView('desktop')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1.5 hover:bg-slate-900 cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop
            </button>
            <button
              onClick={() => setDeviceView('ios')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${isIOS ? 'bg-blue-600 text-white shadow-md font-extrabold' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-100" />
              iPhone 15
            </button>
            <button
              onClick={() => setDeviceView('android')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${!isIOS ? 'bg-emerald-600 text-white shadow-md font-extrabold' : 'text-slate-400 hover:text-white hover:bg-slate-900'}`}
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-100" />
              Android
            </button>
          </div>
        </div>
      </div>

      {/* Simulator Frame Wrapper */}
      <div className="relative mt-20 transition-all duration-300 transform scale-[0.88] sm:scale-100 shrink-0">
        {/* Hardware buttons */}
        <div className="absolute -left-1.5 top-28 w-1.5 h-10 bg-slate-800 rounded-l-md border-y border-slate-700"></div>
        <div className="absolute -left-1.5 top-44 w-1.5 h-14 bg-slate-800 rounded-l-md border-y border-slate-700"></div>
        <div className="absolute -left-1.5 top-60 w-1.5 h-14 bg-slate-800 rounded-l-md border-y border-slate-700"></div>
        <div className="absolute -right-1.5 top-36 w-1.5 h-20 bg-slate-800 rounded-r-md border-y border-slate-700"></div>

        {/* Outer Phone Bezel */}
        <div className={`relative w-[385px] h-[785px] p-3 bg-slate-950 border-[6px] border-slate-800 shadow-[0_30px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden ${isIOS ? 'rounded-[52px]' : 'rounded-[38px]'}`}>
          
          {/* Dynamic Island or Punch Hole camera */}
          {isIOS ? (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-6 bg-slate-950 rounded-full z-50 flex items-center justify-between px-3.5 border border-slate-800/10">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-950 border border-blue-900/30"></div>
              <div className="w-2 h-2 rounded-full bg-slate-900"></div>
            </div>
          ) : (
            <div className="absolute top-5.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-slate-950 rounded-full z-50 border border-slate-900"></div>
          )}

          {/* Simulated Mobile Status Bar (Clock, Wifi, Battery) */}
          <div className="h-9 flex justify-between items-center px-6 text-[10.5px] font-extrabold text-slate-800 select-none z-45 bg-white shrink-0 relative border-b border-slate-100 rounded-t-[28px]">
            <div className="pl-1">
              {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <div className="flex items-center gap-2 pr-1">
              {/* Cellular Signal Icon */}
              <svg className="w-3 h-3 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 22h20V2z" />
              </svg>
              {/* Wifi Icon */}
              <svg className="w-3.5 h-3.5 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21l-12-12c5.05-5.05 13.95-5.05 19 0l-7 12z" />
              </svg>
              {/* Battery Icon */}
              <div className="w-[18px] h-2.5 border border-slate-700 rounded-sm p-0.5 flex items-center shrink-0">
                <div className="bg-slate-800 h-full w-[85%] rounded-2xs"></div>
              </div>
            </div>
          </div>

          {/* Simulated App Frame Body */}
          <div className="flex-1 bg-slate-50 relative overflow-hidden rounded-[26px] flex flex-col border border-slate-200">
            <div className="absolute inset-0 flex flex-col">
              {mobileContent}
            </div>
          </div>

          {/* Home Indicator Gesture Line or Android Buttons */}
          <div className="h-5 flex items-center justify-center shrink-0 bg-white z-45 relative rounded-b-[28px] border-t border-slate-50">
            {isIOS ? (
              <div className="w-28 h-1 bg-slate-900 rounded-full mb-1"></div>
            ) : (
              <div className="flex gap-12 items-center justify-center mb-1 text-slate-800">
                <div className="w-3 h-3 border-2 border-slate-700 rounded-xs"></div>
                <div className="w-3 h-3 rounded-full border-2 border-slate-700"></div>
                <div className="w-3.5 h-3 border-t-2 border-l-2 border-slate-700 transform -rotate-45"></div>
              </div>
            )}
          </div>

        </div>
      </div>
      {renderInstallGuideModal()}
    </div>
  );
}