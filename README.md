# Zen Café — Full-Stack Web Application & Cloudflare Worker

A state-of-the-art web application and administrative dashboard for **Zen Café** (Colombo, Sri Lanka), featuring full PostgreSQL database persistence (`zencafe_db`), dual runtime support (Node.js backend + Cloudflare Worker serverless edge backend), private Cloudflare R2 media storage, automated email & WhatsApp notifications, durable cryptographic session authentication, room booking collision safeguards, and responsive, interactive UI.

---

## 🌟 Key Architecture

1. **Frontend**: Multi-page application built with React 18, TypeScript, Tailwind CSS, Lucide icons, and SweetAlert2.
2. **Backend**:
   - **Node.js HTTP Server (`server.mjs`)**: Native HTTP backend with modular route controllers under `server/api/`.
   - **Cloudflare Worker (`worker/index.ts`)**: Serverless Edge Worker serving both static assets (`dist/`) and `/api/*` routes authoritatively backed by PostgreSQL and Cloudflare R2 without mock fallback.
3. **Database**: PostgreSQL (`zencafe_db`, user `zencafe_app`) on private VPS infrastructure.
4. **Object Storage**: Cloudflare R2 bucket (`zencafe-gallery`) for customer community photos.
5. **Notification Engine**: Outbox pattern (`public.notification_outbox`) with automatic dispatching to Resend (Email) and Meta Cloud API (WhatsApp).

---

## 🚀 Local Development

### 1. Prerequisites
- Node.js 20+
- Access to Hostinger VPS PostgreSQL database (`zencafe_db`)

### 2. Connect to Database via SSH Tunnel
```bash
ssh -N -L 55432:127.0.0.1:5432 root@<VPS_IP>
```

### 3. Install Dependencies & Build
```bash
npm install
npm run build
```

### 4. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000`.

To run Vite standalone in HMR mode:
```bash
npm run dev:vite
```

---

## 🧪 Automated Testing

Run the full automated test suite (all 9 test suites, 100% passing):
```bash
npm test
```

### Included Test Suites:
1. `test/products-api.test.mjs`: Products & categories CRUD, image URLs, dietary & availability sync.
2. `test/offers-api.test.mjs`: Offers & promotions CRUD, promo codes, dates, banner visibility.
3. `test/bookings-api.test.mjs`: Room booking availability, 30-min slot calculation, conflict prevention (409), status workflow.
4. `test/auth-registration.test.mjs`: Customer registration, single-use token verification, gallery access unlock.
5. `test/gallery-api.test.mjs`: 18 tests for image validation (magic bytes, 5 MB, max 2), approval, rejection, deletion, and public isolation.
6. `test/games-settings-api.test.mjs`: Scratch card game configuration, exactly two winning cards enforcement.
7. `test/phase7-safety-auth.test.mjs`: Durable session hashing (SHA-256), revocation, session invalidation on password change.
8. `test/http-server.test.mjs`: End-to-end integration over live HTTP on port 3088.
9. `test/worker-integration.test.mjs`: 12 integration tests verifying Cloudflare Worker (`worker/index.ts`) against PostgreSQL.

---

## 📦 Cloudflare Deployment

Zen Café Cloudflare deployment is performed manually by the site owner.

See the complete step-by-step instructions in [DEPLOYMENT_GUIDE.md](file:///C:/Users/suresh/Documents/zen-cafe-v150-perfect-audited/DEPLOYMENT_GUIDE.md).

### Quick Dry-Run Verification:
```bash
npm run build
npx wrangler deploy --dry-run
```
