import { USERS } from '../lib/auth';

export interface StaffMember {
  uid: string;
  username: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  isPredefined: boolean;
}

let cachedStaff: Record<string, StaffMember[]> = {};

export const staffService = {
  getStaff: async (currentUser: any, forceRefresh = false): Promise<StaffMember[]> => {
    const key = currentUser?.companyId || 'global';
    if (cachedStaff[key] && !forceRefresh) {
      return cachedStaff[key];
    }

    const fbUsers: StaffMember[] = [];
    try {
      const companyIdParam = (!['Developer', 'OWNER'].includes(currentUser?.role || '')) 
        ? `?companyId=${currentUser?.companyId || ''}` 
        : '';
        
      const response = await fetch(`/api/users${companyIdParam}`);
      if (response.ok) {
        const usersList = await response.json();
        usersList.forEach((data: any) => {
          fbUsers.push({
            uid: data.uid || data.username,
            username: data.username,
            name: data.name,
            email: data.email,
            role: data.role,
            companyId: data.companyId,
            isPredefined: false
          });
        });
      }
    } catch (err) {
      console.warn('Gagal mengambil daftar staff dari MongoDB API, menggunakan fallback list:', err);
    }

    const mergedList = [...fbUsers];
    USERS.forEach((staticUser) => {
      if (!['Developer', 'OWNER'].includes(currentUser?.role || '') && staticUser.companyId !== currentUser?.companyId) return;
      const exists = fbUsers.some(
        (u) => u.username?.toLowerCase() === staticUser.username.toLowerCase()
      );
      if (!exists) {
        mergedList.push({
          uid: `static-${staticUser.username}`,
          username: staticUser.username,
          name: staticUser.name,
          email: `${staticUser.username.toLowerCase()}@gudangpsn.com`,
          role: staticUser.role,
          companyId: staticUser.companyId,
          isPredefined: true
        });
      }
    });

    // Sort by role precedence, then name
    mergedList.sort((a, b) => {
      const rolePriority: { [key: string]: number } = {
        'Developer': 0,
        'OWNER': 1,
        'Super Admin': 2,
        'ADMIN': 3,
        'Admin C3': 4,
        'MANAGER': 5,
        'Kepala Gudang': 6,
        'Kepala Gudang JKT': 7,
        'Petugas': 8,
      };
      const pA = rolePriority[a.role] !== undefined ? rolePriority[a.role] : 99;
      const pB = rolePriority[b.role] !== undefined ? rolePriority[b.role] : 99;
      if (pA !== pB) return pA - pB;
      return (a.name || '').localeCompare(b.name || '');
    });

    cachedStaff[key] = mergedList;
    return mergedList;
  },

  clearCache: (companyId?: string) => {
    if (companyId) {
      delete cachedStaff[companyId];
    } else {
      cachedStaff = {};
    }
  }
};
