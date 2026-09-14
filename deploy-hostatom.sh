#!/bin/bash
# deploy-hostatom.sh — Deploy Nong-Kati to Hostatom Plesk hosting
# Usage: Run this script from the project root

set -e

echo "🚀 Starting deployment to Hostatom..."
echo ""

# Step 1: Build the project
echo "📦 Step 1: Building project..."
npm run build

# Step 2: Create deployment package
echo ""
echo "📁 Step 2: Creating deployment package..."

# Create a clean deployment directory
DEPLOY_DIR="nong-kati-deploy"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy necessary files
cp -r .next $DEPLOY_DIR/
cp -r node_modules $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp prisma $DEPLOY_DIR/ -r
cp server.js $DEPLOY_DIR/ 2>/dev/null || true
cp ecosystem.config.js $DEPLOY_DIR/ 2>/dev/null || true

# Create .env file for production
cat > $DEPLOY_DIR/.env << 'EOF'
# Production Environment Variables
NODE_ENV=production
DATABASE_URL="postgresql://YOUR_SUPABASE_URL_HERE"
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
NK_JWT_SECRET="your-very-long-random-secret"
NK_OMISE_PUBLIC_KEY="your-omise-public-key"
NK_OMISE_SECRET_KEY="your-omise-secret-key"
NK_CSP_REPORT_ONLY="false"
EOF

# Create deployment instructions
cat > $DEPLOY_DIR/README.md << 'EOF'
# Deployment Instructions for Hostatom Plesk

## Step 1: Upload Files
1. Log into Plesk panel
2. Go to File Manager
3. Navigate to your domain folder
4. Upload all files from this directory

## Step 2: Set Up Node.js
1. Go to Node.js section in Plesk
2. Create new application or edit existing
3. Set:
   - Node.js version: 18.x or 20.x
   - Application mode: Production
   - Application startup file: server.js
   - Application URL: your domain

## Step 3: Configure Environment
1. Edit .env file with your actual values:
   - DATABASE_URL: Your Supabase PostgreSQL URL
   - NK_JWT_SECRET: Generate a secure random string
   - NK_OMISE_*: Your Omise API keys

## Step 4: Install and Start
```bash
cd nong-kati-deploy
npm ci --production
npx prisma generate
node server.js
```

## Step 5: Start with PM2 (Recommended)
```bash
pm2 start server.js --name "nong-kati"
pm2 save
pm2 startup
```

## Step 6: Configure SSL
1. Go to SSL/TLS in Plesk
2. Enable Let's Encrypt
3. Force HTTPS redirect

## Step 7: Configure Domain
1. Set document root to nong-kati-deploy
2. Set up reverse proxy to port 3000 (if using PM2)
EOF

echo ""
echo "✅ Deployment package created: $DEPLOY_DIR/"
echo ""
echo "📋 Next Steps:"
echo "1. Upload $DEPLOY_DIR/ to your Hostatom server via File Manager or FTP"
echo "2. Follow instructions in $DEPLOY_DIR/README.md"
echo "3. Set up environment variables"
echo "4. Start the application with PM2"
echo ""
echo "🔗 Or use Vercel (recommended):"
echo "   git push origin master  # Auto-deploys to Vercel"
echo ""
echo "Done! 🎉"
