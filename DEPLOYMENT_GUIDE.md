# ZEN CAFÉ — PRODUCTION MANUAL DEPLOYMENT GUIDE

**Target Production Domain:** `zencafe.lk` / `www.zencafe.lk`  
**Database:** Hostinger VPS PostgreSQL (`zencafe_db`, Role: `zencafe_app`)  
**Deployment Operator:** Site Owner (Manual Cloudflare CLI / Dashboard)

---

## ⚠️ CRITICAL ISOLATION NOTICE
- Never modify or access **Gen Zi Corner POS**, its database, tunnels, workers, or domains.
- Zen Café operates on isolated resources: database `zencafe_db`, user `zencafe_app`, Cloudflare tunnel `zencafe-postgres`, and R2 bucket `zencafe-gallery`.
- Do not run unapproved migrations or restart shared VPS services.

---

## 1. REQUIRED CLOUDFLARE ACCOUNT RESOURCES

Ensure your Cloudflare account has the following resources provisioned:
1. **Cloudflare Workers Paid / Standard Plan**: Required for Hyperdrive, R2 private bucket bindings, and Cron Triggers.
2. **Cloudflare Tunnel (or Workers VPC Service)**:
   - Tunnel name: `zencafe-postgres`
   - Maps private PostgreSQL port `5432` on the VPS to a private Cloudflare network endpoint.
   - Port 5432 must **never** be exposed publicly to the internet.
3. **Cloudflare Hyperdrive**: Connection pooling and acceleration proxy for PostgreSQL.
4. **Cloudflare R2 Storage**: Private bucket for customer gallery photos.
5. **Cloudflare DNS Zone**: Zone for `zencafe.lk`.

---

## 2. POSTGRESQL CONNECTION BINDING (HYPERDRIVE / TUNNEL)

Cloudflare Hyperdrive connects from Cloudflare edge locations to your PostgreSQL database. Because PostgreSQL runs on your private VPS on `127.0.0.1:5432`, Hyperdrive must route traffic through your isolated Cloudflare Tunnel (`zencafe-postgres`).

> [!IMPORTANT]
> Never use `127.0.0.1` or `localhost` as the database host in the Hyperdrive connection string. `127.0.0.1` will resolve to Cloudflare's internal edge server, not your VPS!

### Step 2.1: Route PostgreSQL Through Cloudflare Tunnel
In the Cloudflare Zero Trust Dashboard:
1. Navigate to **Networks** -> **Tunnels** -> Select your isolated `zencafe-postgres` tunnel.
2. Under **Public Hostname**, click **Add a public hostname**:
   - **Subdomain:** `postgres` (or `db`)
   - **Domain:** `zencafe.lk`
   - **Type:** `TCP`
   - **URL:** `127.0.0.1:5432`
3. Save the hostname. Cloudflare Tunnel will now route encrypted TCP traffic destined for `postgres.zencafe.lk:5432` securely to PostgreSQL on the VPS without opening port 5432 to the public internet.

### Step 2.2: Create Hyperdrive Configuration
Run the Cloudflare Wrangler command in your terminal:
```bash
npx wrangler hyperdrive create zencafe-postgres-pool \
  --connection-string="postgresql://zencafe_app:<DB_PASSWORD>@postgres.zencafe.lk:5432/zencafe_db"
```

*(Alternatively, if your Cloudflare Tunnel uses a Zero Trust Private Network CIDR, use the routed private IP: `--connection-string="postgresql://zencafe_app:<DB_PASSWORD>@<PRIVATE_ROUTED_IP>:5432/zencafe_db"`).*

### Step 2.3: Record Hyperdrive ID
The command will return a unique Hyperdrive ID (e.g., `a1b2c3d4e5f6...`).

### Step 2.4: Update `wrangler.jsonc`
Open `wrangler.jsonc` and replace the placeholder ID with your real Hyperdrive ID:
```jsonc
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<YOUR_REAL_HYPERDRIVE_ID>"
    }
  ]
```

---

## 3. CLOUDFLARE R2 BUCKET SETUP

### Step 3.1: Create Private R2 Bucket
Run the following command to create the gallery bucket:
```bash
npx wrangler r2 bucket create zencafe-gallery
```

### Step 3.2: Verify Bucket Binding
The bucket binding is already configured in `wrangler.jsonc`:
```jsonc
  "r2_buckets": [
    {
      "binding": "GALLERY_BUCKET",
      "bucket_name": "zencafe-gallery"
    }
  ]
```
The bucket remains private. Images are served securely through authenticated and public endpoints (`/api/gallery/photos/:key`) managed by the Worker.

---

## 4. RESEND EMAIL SETUP

Zen Café uses [Resend](https://resend.com) for customer email verification and booking status updates.

1. Sign in to your [Resend Dashboard](https://resend.com).
2. Go to **Domains** -> **Add Domain** -> Enter `zencafe.lk`.
3. Add the required DNS records (DKIM, SPF, and MX) into Cloudflare DNS for `zencafe.lk`.
4. Once verified, go to **API Keys** -> Create an API key named `zencafe-production`.
5. Copy the secret key (`re_...`).
6. Set the secret in Cloudflare Worker (see Section 6).

---

## 5. WHATSAPP CLOUD API SETUP

Zen Café uses Meta WhatsApp Cloud API for automated notifications on booking requests.

1. Go to [Meta for Developers](https://developers.facebook.com) and open your WhatsApp Business App.
2. Under **WhatsApp** -> **API Setup**:
   - Copy the **Phone Number ID** (e.g., `104857692...`).
   - Generate a permanent System User Access Token with `whatsapp_business_messaging` permissions.
3. Configure your verified business phone number.
4. Set the secret and ID in Cloudflare Worker (see Section 6).

---

## 6. REQUIRED ENVIRONMENT VARIABLES & SECRETS

### 6.1 Public Variables (Configured in `wrangler.jsonc`)
| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `PUBLIC_BASE_URL` | `https://zencafe.lk` | Base URL for verification links |
| `RESEND_FROM_EMAIL` | `Zen Café <bookings@zencafe.lk>` | Verified email sender |

### 6.2 Production Secrets (Set via `wrangler secret put`)
Run each command from the project root and paste the secret when prompted:

```bash
# 1. Resend Email API Key
npx wrangler secret put RESEND_API_KEY

# 2. WhatsApp Meta Access Token
npx wrangler secret put WHATSAPP_API_TOKEN

# 3. WhatsApp Phone Number ID
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID

# 4. Fallback PostgreSQL Connection String (Optional if Hyperdrive is bound)
npx wrangler secret put DATABASE_URL
```

*Never commit these secrets to git or store them in plain-text files.*

---

## 7. BUILD COMMANDS

Always compile the TypeScript codebase and build the optimized production distribution before deploying:

```bash
# 1. Clean and build production bundle
npm run build

# 2. Run test verification suite
npm test
```

Ensure `dist/` contains all built HTML pages, CSS stylesheets, and JavaScript bundles.

---

## 8. MANUAL CLOUDFLARE DEPLOYMENT COMMANDS

### Step 8.1: Test Dry-Run
Validate that the configuration, assets, and bindings are error-free:
```bash
npx wrangler deploy --dry-run
```

Expected output:
```
Total Upload: ~280 KiB
Bindings:
  env.HYPERDRIVE
  env.GALLERY_BUCKET
  env.ASSETS
  env.PUBLIC_BASE_URL
  env.RESEND_FROM_EMAIL
--dry-run: exiting now.
```

### Step 8.2: Deploy to Production
Execute the deployment:
```bash
npx wrangler deploy
```

---

## 9. DOMAIN CONFIGURATION FOR `zencafe.lk`

In the Cloudflare Dashboard:
1. Navigate to **Workers & Pages** -> Select `zen-cafe`.
2. Click **Settings** -> **Domains & Routes** -> **Add**.
3. Select **Custom Domain**:
   - Add `zencafe.lk`
   - Add `www.zencafe.lk`
4. Cloudflare will automatically provision SSL certificates and routing for both hostnames.

---

## 10. PRODUCTION SMOKE TESTS CHECKLIST

After deployment, verify the live production website using this checklist:

- [ ] **1. Public Homepage**: Visit `https://zencafe.lk` — confirm hero, drinks, promotional banner, and navigation render smoothly.
- [ ] **2. Health Check**: Visit `https://zencafe.lk/api/health` — confirm response:
  ```json
  {"status":"ok","database":"connected","mode":"postgresql"}
  ```
- [ ] **3. Menu Sync**: Visit `https://zencafe.lk/zen-kitchen.html` — confirm products load dynamically from `zencafe_db`.
- [ ] **4. Offers Sync**: Visit `https://zencafe.lk/offers.html` — confirm active promotions are displayed.
- [ ] **5. Room Booking**: Open the booking form on the homepage — verify available time slots calculate dynamically according to café opening hours.
- [ ] **6. Admin Login**: Visit `https://zencafe.lk/admin-login.html` — log in with admin credentials. Confirm session persistence and dashboard loading.
- [ ] **7. Admin Operations**:
  - Add or update a product -> check reflection on public menu.
  - Review bookings -> accept or reject a test booking.
  - Check settings -> update opening hours and save.
- [ ] **8. Customer Registration & Gallery**:
  - Visit `https://zencafe.lk/register.html` -> register test account.
  - Verify email link handling and access to community photo upload.
- [ ] **9. Games**: Visit `https://zencafe.lk/games.html` — verify scratch cards function with 2 winning cards.

---

## 11. ROLLBACK INSTRUCTIONS

If any critical issue occurs in production:
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> `zen-cafe` -> **Deployments**.
2. Find the previous successful deployment version.
3. Click the three dots (`...`) next to the deployment -> Select **Rollback**.
4. Confirm the rollback. Cloudflare will instantaneously revert edge routing to the previous build.
5. Alternatively, via CLI:
   ```bash
   npx wrangler rollback [DEPLOYMENT_ID]
   ```

---

## 12. TROUBLESHOOTING GUIDANCE

### Problem 1: `503 Service Unavailable` on `/api/*`
- **Cause**: The Worker cannot connect to PostgreSQL.
- **Remedy**:
  - Check whether Cloudflare Tunnel `zencafe-postgres` is active (`cloudflared` process running on VPS).
  - Verify Hyperdrive configuration in Cloudflare dashboard.
  - Ensure VPS PostgreSQL is accepting connections on `127.0.0.1:5432`.

### Problem 2: `503 R2 Bucket not bound` on photo upload
- **Cause**: `GALLERY_BUCKET` binding missing or bucket name mismatched.
- **Remedy**: Check that `zencafe-gallery` bucket exists in R2 and is listed under `r2_buckets` in `wrangler.jsonc`.

### Problem 3: Outbox notifications remaining in `pending` status
- **Cause**: Cron Trigger not triggering or missing `RESEND_API_KEY` / `WHATSAPP_API_TOKEN`.
- **Remedy**:
  - Verify `RESEND_API_KEY` via `npx wrangler secret put RESEND_API_KEY`.
  - Check Worker logs in Cloudflare Dashboard under **Logs** -> **Real-time logs**.
  - Query `SELECT id, channel, status, last_error FROM public.notification_outbox WHERE status = 'failed';` in `zencafe_db`.

### Problem 4: 401 Unauthorized errors on Admin Dashboard
- **Cause**: Session expired, token revoked, or admin password changed.
- **Remedy**: Log out completely at `/admin-login.html` and re-authenticate to obtain a fresh durable session token.
