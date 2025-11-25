# Algolia Sync Commands

## Sync Static Pages

**Full resync (starting fresh or major issues):**
```bash
node scripts/clear-and-resync-pages.js
```
Takes ~10-15 minutes. Syncs ~661 pages (all locales). Deletes all existing static pages first.

**Incremental sync (update changed pages only):**
```bash
node scripts/sync-static-pages-only.js
```
Faster. Only syncs pages that changed since last sync.

**Monthly full sync (test locally):**
```bash
node scripts/sync-static-pages-only.js --force-full
```
Or via API endpoint:
```bash
curl http://localhost:3000/api/sync-static-pages-incremental?forceFullSync=true
```
This runs automatically on Vercel on the 1st of each month.

## Sync CMS Collections

**Sync all CMS collections:**
```bash
node scripts/sync-cms-collections.js
```
Or:
```bash
npm run sync-cms
```
Takes ~20-30 minutes. Syncs all 34 collections (~4,382 items).

**Sync single collection:**
```bash
node scripts/sync-single-collection.js <collection-slug>
```
Or:
```bash
npm run sync-collection <collection-slug>
```

Examples:
```bash
node scripts/sync-single-collection.js news
npm run sync-collection people
npm run sync-collection events
```
