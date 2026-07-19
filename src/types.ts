export type ZoneCategory = string;

export interface Company {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: 'FREE TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  price: number;
  duration: number; // in days
  features: {
    barcodeScanner: boolean;
    batch: boolean;
    auditLog: boolean;
    exportReport: boolean;
    multiWarehouse: boolean;
    customWorkflow: boolean;
    apiIntegration: boolean;
  };
  limits: {
    users: number;
    products: number;
    warehouses: number;
  };
}

export interface Subscription {
  id: string;
  companyId: string;
  plan: 'FREE TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELED';
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  createdAt: string;
  features: SubscriptionPlan['features'];
}

export type Permission = 
  | 'product.create' | 'product.update' 
  | 'inventory.adjust' | 'rack.manage' 
  | 'inbound.create' | 'outbound.approve' 
  | 'user.manage' | 'billing.manage';

export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER' | 'Super Admin' | 'Developer' | 'Admin C3' | 'Kepala Gudang JKT' | 'Kepala Gudang' | 'Petugas';

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  permissions?: Permission[];
}

export interface Product {
  sku: string;
  companyId?: string; // TEANT ID
  warehouseId?: string;
  name: string;
  category: ZoneCategory;
  volumeM3: number;
  uom: string;
  packUom?: string;
  packingSize?: number;
  barcode?: string;
}

export interface Locator {
  id: string;
  companyId?: string; // TENANT ID
  warehouseId?: string; // Multi-warehouse support
  rack: string;
  column: string;
  level: number;
  zone: ZoneCategory;
  maxVolumeM3: number;
  barcode?: string;
}

export type TransactionType = 'INBOUND' | 'OUTBOUND' | 'TRANSFER';
export type TransactionStatus = 'PENDING' | 'BOOKED' | 'CONFIRMED' | 'CANCELLED';

export interface Transaction {
  id: string;
  companyId?: string; // TENANT ID
  warehouseId?: string;
  type: TransactionType;
  sku: string;
  qty: number;
  locatorId: string;
  operator: string;
  timestamp: string;
  status: TransactionStatus;
  memo?: string;
  transferToLocatorId?: string;
  batch?: string;
  bookingRef?: string;
  systemLocator?: string;
}

export interface InventoryItem {
  sku: string;
  companyId?: string; // TENANT ID
  warehouseId?: string;
  locatorId: string;
  qty: number;
}

export interface UsageLog {
  id?: string;
  companyId: string;
  feature: string;
  action: string;
  count: number;
  date: string;
}
