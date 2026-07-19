import "dotenv/config";
import express from "express";
import path from "path";
import { dbHelper } from "./src/lib/mongodb-server.js";

// Static users list matching the client-side fallbacks
const USERS = [
  { username: 'adminC3', password: 'admin123', role: 'Admin C3', name: 'Iwan Gunawan', companyId: 'COMPANY_C3_CORP' },
  { username: 'petugasC3', password: 'petugas123', role: 'Petugas', name: 'Arief Nugroho', companyId: 'COMPANY_C3_CORP' },
  { username: 'kasiejkt', password: 'kasiejkt123', role: 'Kepala Gudang JKT', name: 'Moch. Johar Prasojo', companyId: 'COMPANY_C3_CORP' },
  { username: 'admin', password: 'admin123', role: 'Super Admin', name: 'HQ Warehouse', companyId: 'COMPANY_C3_CORP' },
  { username: 'adji', password: 'adji123', role: 'Developer', name: 'Adji Prasetyo', companyId: 'COMPANY_C3_CORP' },
];

// In-memory cache for GSheet Proxy
const gsheetCache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple In-memory Rate Limiter
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

// Simple authentication middleware check
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  next();
};

export const appPromise = (async () => {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware for parsing JSON requests
  app.use(express.json({ limit: "10mb" }));

  // GSheet Proxy to bypass CORS / iframe security restrictions
  app.get("/api/gsheet-proxy", requireAuth, async (req, res) => {
    try {
      // Rate limiting logic
      const ip = req.ip || 'unknown';
      const now = Date.now();
      let limitData = rateLimitMap.get(ip);
      
      if (!limitData || limitData.resetTime < now) {
         limitData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      } else {
         limitData.count++;
      }
      rateLimitMap.set(ip, limitData);

      if (limitData.count > MAX_REQUESTS) {
         return res.status(429).json({ error: "Too many requests. Please try again later." });
      }

      const defaultUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv';
      const requestedUrl = typeof req.query.url === "string" ? req.query.url : defaultUrl;

      // Basic security validation to ensure it targets google spreadsheets only
      if (!requestedUrl.startsWith("https://docs.google.com/spreadsheets/")) {
        return res.status(400).json({ error: "URL spreadsheet tidak valid. Harus diawali dengan https://docs.google.com/spreadsheets/" });
      }

      // Check Cache
      const cached = gsheetCache.get(requestedUrl);
      if (cached && (now - cached.timestamp < CACHE_TTL)) {
         res.setHeader("Content-Type", "text/csv; charset=utf-8");
         return res.send(cached.data);
      }
      
      const response = await fetch(requestedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/csv,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from GSheet: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();

      // Set Cache
      gsheetCache.set(requestedUrl, { data: csvText, timestamp: now });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csvText);
    } catch (error: any) {
      console.info("Proxy GSheet status info:", error.message || error);
      res.status(500).json({ error: error.message || "Failed to load GSheet data" });
    }
  });

  // Auth endpoints
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { usernameOrEmail, password, firebaseUid, firebaseEmail } = req.body;
      const cleanUsername = usernameOrEmail.trim();
      
      let searchUsername = cleanUsername;
      if (cleanUsername.includes("@")) {
        searchUsername = cleanUsername.split("@")[0];
      }

      // Match from static list first (highly preferred)
      const staticUser = USERS.find(u => {
        const matchesUsername = u.username.toLowerCase() === searchUsername.toLowerCase();
        if (firebaseUid) return matchesUsername;
        return matchesUsername && u.password === password;
      });
      
      let matchedUser = staticUser ? {
        uid: firebaseUid || "static-" + staticUser.username,
        username: staticUser.username,
        role: staticUser.role,
        name: staticUser.name,
        companyId: staticUser.companyId,
        email: firebaseEmail || `${staticUser.username.toLowerCase()}@gudangpsn.com`
      } : null;

      if (!matchedUser) {
        // Try querying users collection from MongoDB
        const dbUser = await dbHelper.findOne("users", { 
          username: searchUsername.toLowerCase()
        });
        if (dbUser) {
          if (firebaseUid || dbUser.password === password) {
            matchedUser = {
              uid: firebaseUid || dbUser.uid || `user-${dbUser.username}`,
              username: dbUser.username,
              role: dbUser.role,
              name: dbUser.name,
              companyId: dbUser.companyId,
              email: firebaseEmail || dbUser.email
            } as any;
          }
        }
      }

      if (!matchedUser) {
        return res.status(401).json({ error: "Password salah atau akun tidak terdaftar di sistem." });
      }

      const sessionId = "SESS_" + Math.random().toString(36).substring(2, 15);
      await dbHelper.upsert("sessions", { username: matchedUser.username }, {
        username: matchedUser.username,
        sessionId,
        lastActive: new Date().toISOString()
      });

      res.json({
        uid: matchedUser.uid,
        username: matchedUser.username,
        role: matchedUser.role,
        name: matchedUser.name,
        companyId: matchedUser.companyId,
        email: matchedUser.email,
        sessionId
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/auth/session/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const session = await dbHelper.findOne("sessions", { username: username.toLowerCase() });
      res.json(session || { sessionId: null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/db-diagnostics", async (req, res) => {
    try {
      const diag = await dbHelper.getDiagnostics();
      res.json(diag);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { fullName, username, email, role, password, companyId } = req.body;
      const cleanUsername = username.trim().toLowerCase();

      // Check if user already exists
      const existing = await dbHelper.findOne("users", { username: cleanUsername });
      if (existing) {
        return res.status(400).json({ error: "Alamat email / username tersebut sudah terdaftar." });
      }

      const newProfile = {
        uid: "user-" + Math.random().toString(36).substring(2, 15),
        username: cleanUsername,
        email: email || `${cleanUsername}@gudangpsn.com`,
        role,
        name: fullName,
        password,
        companyId: companyId || "COMPANY_C3_CORP"
      };

      await dbHelper.upsert("users", { username: cleanUsername }, newProfile);
      res.json(newProfile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Products CRUD
  app.get("/api/products", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      const queryObj: any = {};
      if (companyId) queryObj.companyId = companyId;
      const list = await dbHelper.find("products", queryObj);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const product = req.body;
      await dbHelper.upsert("products", { sku: product.sku }, product);
      res.json({ success: true, product });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/products/:sku", async (req, res) => {
    try {
      const { sku } = req.params;
      const data = req.body;
      await dbHelper.upsert("products", { sku }, data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/products/:sku", async (req, res) => {
    try {
      const { sku } = req.params;
      await dbHelper.deleteOne("products", { sku });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products/batch", async (req, res) => {
    try {
      const { products } = req.body;
      await dbHelper.insertMany("products", products);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products/batch-with-stock", async (req, res) => {
    try {
      const { items, operator } = req.body;
      const productsList = items.map((x: any) => x.product);
      await dbHelper.insertMany("products", productsList);

      const txs = items
        .filter((x: any) => x.qty && x.qty > 0 && x.locatorId)
        .map((x: any) => ({
          id: "tx-" + Math.random().toString(36).substring(2, 15),
          companyId: x.product.companyId,
          type: "INBOUND",
          sku: x.product.sku,
          qty: x.qty,
          locatorId: x.locatorId,
          operator: operator || "System",
          timestamp: new Date().toISOString(),
          status: "CONFIRMED",
          memo: "CSV Import Stock Setup"
        }));

      if (txs.length > 0) {
        await dbHelper.insertMany("transactions", txs);
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Locators CRUD
  app.get("/api/locators", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      const queryObj: any = {};
      if (companyId) queryObj.companyId = companyId;
      const list = await dbHelper.find("locators", queryObj);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/locators", async (req, res) => {
    try {
      const locator = req.body;
      await dbHelper.upsert("locators", { id: locator.id }, locator);
      res.json({ success: true, locator });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/locators/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      await dbHelper.upsert("locators", { id }, data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/locators/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await dbHelper.deleteOne("locators", { id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/locators/batch", async (req, res) => {
    try {
      const { locators } = req.body;
      await dbHelper.insertMany("locators", locators);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Transactions CRUD
  app.get("/api/transactions", async (req, res) => {
    try {
      const { companyId, startDate, pageSize, startAfterId, typeFilter, skuFilter } = req.query;
      const queryObj: any = {};
      if (companyId) queryObj.companyId = companyId;
      if (startDate) {
        queryObj.timestamp = { $gte: startDate };
      }
      if (typeFilter && typeFilter !== "ALL") {
        queryObj.type = typeFilter;
      }
      if (skuFilter) {
        queryObj.sku = skuFilter;
      }

      const limitVal = pageSize ? parseInt(pageSize as string) : 0;
      
      let list = await dbHelper.find("transactions", queryObj, { timestamp: -1 });

      let startIndex = 0;
      if (startAfterId) {
        const idx = list.findIndex((t: any) => t.id === startAfterId);
        if (idx !== -1) {
          startIndex = idx + 1;
        }
      }

      const paginatedList = limitVal > 0 ? list.slice(startIndex, startIndex + limitVal) : list.slice(startIndex);
      const hasMore = limitVal > 0 ? (startIndex + limitVal < list.length) : false;

      res.json({
        data: paginatedList,
        hasMore,
        lastDocId: paginatedList.length > 0 ? paginatedList[paginatedList.length - 1].id : null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const tx = req.body;
      await dbHelper.upsert("transactions", { id: tx.id }, tx);
      res.json({ success: true, tx });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/transactions/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await dbHelper.upsert("transactions", { id }, { status });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/transactions/delete-batch", async (req, res) => {
    try {
      const { ids } = req.body;
      await dbHelper.deleteMany("transactions", { id: { $in: ids } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Users CRUD
  app.get("/api/users", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      const queryObj: any = {};
      if (companyId) queryObj.companyId = companyId;
      const list = await dbHelper.find("users", queryObj);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const user = req.body;
      await dbHelper.upsert("users", { username: user.username }, user);
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Companies & Subscriptions
  app.get("/api/companies", async (req, res) => {
    try {
      const list = await dbHelper.find("companies");
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/subscriptions", async (req, res) => {
    try {
      const list = await dbHelper.find("subscriptions");
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/subscriptions/:companyId", async (req, res) => {
    try {
      const { companyId } = req.params;
      const sub = await dbHelper.findOne("subscriptions", { companyId });
      res.json(sub);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/usage-logs", async (req, res) => {
    try {
      const { companyId, feature, action, count } = req.body;
      const monthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
      const docId = `${companyId}_${feature}_${monthYear}`;
      
      const existing = await dbHelper.findOne("usage_logs", { id: docId });
      const currentCount = existing ? (existing.count || 0) : 0;
      
      const newLog = {
        id: docId,
        companyId,
        feature,
        action,
        count: currentCount + (count || 1),
        date: new Date().toISOString()
      };
      
      await dbHelper.upsert("usage_logs", { id: docId }, newLog);
      res.json({ success: true, log: newLog });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Physical stock counts
  app.get("/api/physical-stock-counts", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      const queryObj: any = {};
      if (companyId) queryObj.companyId = companyId;
      const list = await dbHelper.find("physical_stock_counts", queryObj);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/physical-stock-counts", async (req, res) => {
    try {
      const { locatorId, sku, qty, companyId } = req.body;
      const docId = `${locatorId}_${sku}`;
      await dbHelper.upsert("physical_stock_counts", { id: docId }, {
        id: docId,
        companyId,
        locatorId,
        sku,
        qty,
        updatedAt: new Date().toISOString()
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Save scan history
  app.post("/api/scan-history", async (req, res) => {
    try {
      const scanRecord = req.body;
      const id = 'scan_' + Math.random().toString(36).substring(2, 12);
      await dbHelper.upsert("scan_history", { id }, { ...scanRecord, id });
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset database for a company
  app.post("/api/reset-data", async (req, res) => {
    try {
      const { companyId } = req.body;
      if (!companyId) {
        return res.status(400).json({ error: "Missing companyId" });
      }
      await dbHelper.deleteMany("products", { companyId });
      await dbHelper.deleteMany("transactions", { companyId });
      await dbHelper.deleteMany("physical_stock_counts", { companyId });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Rack Scanner (Mock for Backend Requirement)
  app.get("/api/racks/:barcode", async (req, res) => {
    try {
      const { barcode } = req.params;
      res.json({
         success: true,
         rack: {
           code: barcode,
           zone: "A",
           capacity: 1000,
           used: 650
         },
         items: [
           { sku: "SKU001", name: "Produk A", qty: 100, batch: "B001", expired: "2027-01-01" }
         ]
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
})();

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  appPromise.then((app) => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}