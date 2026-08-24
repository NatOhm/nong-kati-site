# Supabase Setup Guide for Nong-Kati

This guide walks you through setting up Supabase as your production PostgreSQL database with Prisma.

---

## Step 1: Create Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub (recommended) or email
3. Create a new project:
   - **Project name**: `nong-kati`
   - **Database password**: Use a strong password (save it!)
   - **Region**: Choose `Southeast Asia (Singapore)` for best latency in Thailand

---

## Step 2: Get Your Credentials

### 2.1 Project URL and Anon Key
1. Go to **Project Settings → API**
2. Copy these values:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2.2 Database Connection String
1. Go to **Project Settings → Database**
2. Under **Connection string**, click **URI**
3. Copy the full connection string
4. Replace `[YOUR-PASSWORD]` with your database password

**Important**: For Vercel/serverless, use the **Transaction mode** (port 6543):
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

For direct connections (migrations), use **Session mode** (port 5432):
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

---

## Step 3: Configure Environment Variables

Create/update your `.env.local` file:

```bash
# Database (use Transaction mode for serverless)
DATABASE_URL="postgresql://postgres.xxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct connection for migrations (Session mode)
DATABASE_DIRECT_URL="postgresql://postgres.xxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Supabase Client (optional - for client-side features)
NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIs..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIs..."
```

---

## Step 4: Update Prisma Schema

Your existing `prisma/schema.prisma` is already configured correctly:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")  # Add this line for migrations
}

generator client {
  provider = "prisma-client-js"
}
```

**Add `directUrl`** to your schema - this tells Prisma to use the direct connection for migrations (not through the connection pooler).

---

## Step 5: Run Initial Migration

### Option A: From Supabase SQL Editor (Recommended for first setup)

1. Go to **SQL Editor** in Supabase dashboard
2. Copy the SQL from your Prisma schema:
   ```bash
   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
   ```
3. Paste and run the SQL in Supabase SQL Editor

### Option B: Using Prisma Migrate

```bash
# Generate Prisma Client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name init

# For production (after first migration)
npx prisma migrate deploy
```

---

## Step 6: Seed Your Database

Create a seed script at `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create categories
  const gaming = await prisma.category.create({
    data: {
      name: 'Gaming',
      slug: 'gaming',
      icon: '🎮',
      sortOrder: 1,
    },
  })

  const streaming = await prisma.category.create({
    data: {
      name: 'Streaming',
      slug: 'streaming',
      icon: '📺',
      sortOrder: 2,
    },
  })

  // Add more seed data...
  console.log('Seed complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Run the seed:
```bash
npx prisma db seed
```

---

## Step 7: Verify Connection

Test your connection:

```bash
# Open Prisma Studio (visual database browser)
npx prisma studio

# Or test with a simple query
npx prisma db pull
```

---

## Step 8: Add to Vercel

1. Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**
2. Add the following variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `DATABASE_URL` | Your transaction mode connection string | Production, Preview |
| `DATABASE_DIRECT_URL` | Your session mode connection string | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | Production, Preview |

**Important**: Set `SUPABASE_SERVICE_ROLE_KEY` to **Production only** (not Preview) for security.

---

## Step 9: Run Production Migration

After deploying to Vercel, run the migration:

### Option A: Vercel CLI
```bash
vercel env pull .env.local
npx prisma migrate deploy
```

### Option B: Supabase SQL Editor
1. Go to SQL Editor
2. Run: `npx prisma migrate deploy --schema prisma/schema.prisma`

---

## Troubleshooting

### Connection Refused
- Ensure your IP is allowed in **Supabase → Settings → Database → Network Restrictions**
- Add `0.0.0.0/0` for Vercel (or specific Vercel IPs)

### SSL Error
Add `?sslmode=require` to your connection string:
```
DATABASE_URL="postgresql://...?sslmode=require"
```

### Timeout Errors
- Use Transaction mode (port 6543) for serverless
- Add `?connection_limit=1` to reduce pool size

### Migration Errors
- Use `DATABASE_DIRECT_URL` (Session mode) for migrations
- Ensure the database user has proper permissions

---

## Cost Estimate

Supabase free tier includes:
- 500 MB database storage
- 1 GB file storage
- 50,000 monthly active users
- 500 MB bandwidth
- 2 projects

For production, consider the **Pro plan** ($25/month) for:
- 8 GB database storage
- 100 GB bandwidth
- Daily backups
- Email support

---

## Next Steps

1. Set up **Row Level Security (RLS)** policies if using Supabase Auth
2. Configure **database backups** (automatic on Pro plan)
3. Set up **connection pooling** monitoring
4. Consider **Supabase Edge Functions** for webhook handling

---

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [Prisma + Supabase Guide](https://supabase.com/docs/guides/integrations/prisma)
- [Connection Management](https://supabase.com/docs/guides/database/connecting-to-postgres)
