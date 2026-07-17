# Admin Panel Clone Plan

Goal: `https://dev.admin.thekinggame.online` ka **same-to-same UI** clone karna hai — sirf design/layout/pages, koi real data wiring nahi. Sab pages dummy/placeholder data ke saath.

## Approach

1. **Login page pe screenshots capture** karunga (Playwright) — dashboard aur har section ka. Total ~32 pages, so ~32 screenshots.
2. **Route structure** banaunga current app ke andar `/admin/*` ke neeche:
   - `/admin/login`
   - `/admin/dashboard`
   - `/admin/users`, `/admin/games`, `/admin/banners`, `/admin/moderators`, `/admin/support`, `/admin/announcements`, `/admin/forgotten-passwords`
   - `/admin/deposits`, `/admin/withdrawals`, `/admin/wallet-adjust`, `/admin/analytics`, `/admin/spare-wallet`, `/admin/daily-analytics`, `/admin/bonus-income-report`, `/admin/financials-report`
   - `/admin/user-theme`, `/admin/plans/deposit`, `/admin/plans/bet`, `/admin/plans/salary`, `/admin/plans/rank`
   - `/admin/system-controls`, `/admin/site-logo`, `/admin/bonus-settings`, `/admin/aviator-bucket`, `/admin/cron`, `/admin/gift-codes`, `/admin/settings`, `/admin/deposit-type`, `/admin/withdraw-limit`, `/admin/profile`
3. **Shared shell**: `AdminLayout` with dark sidebar (Operations / Financial / Insights / Configuration groups) + top header + main content area — matching original colors, spacing, icons.
4. **Har page** ko screenshot ke basis pe recreate — same cards, tables, filters, buttons, chart placeholders. Tables mein 5-10 rows dummy data.
5. **Design tokens**: admin ke liye alag CSS variables (dark navy bg, accent color) — game app ke tokens ko disturb nahi karunga.
6. **Login page**: simple email/password form — koi auth nahi, submit karte hi `/admin/dashboard` pe le jaayega.

## Technical Notes

- Naya folder: `src/pages/admin/` — har page ek file.
- Naya component: `src/components/admin/AdminLayout.tsx`, `AdminSidebar.tsx`, `AdminHeader.tsx`, aur reusable `StatCard`, `DataTable`, `ChartPlaceholder`.
- Admin tokens: `src/styles/admin.css` ya `index.css` mein `.admin-scope` class ke andar.
- Routes existing router (`src/App.tsx` ya jaha bhi routes hain) mein add karunga.
- shadcn `Table`, `Card`, `Button`, `Input`, `Select`, `Tabs`, `Dialog` reuse.
- Charts: `recharts` (already available) se area/bar/pie placeholders.

## Scope (Confirm)

- ~32 pages, UI-only, dummy data. Approx 1500-2500 lines. Ek hi baar mein batches me build karunga.
- Existing game app / user-facing routes ko touch nahi karunga.
- No backend calls, no auth. Login form → dashboard redirect only.

Approve karo to shuru karta hu — screenshots capture se.
