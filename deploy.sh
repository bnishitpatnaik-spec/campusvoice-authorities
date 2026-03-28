#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  CampusVoice Authorities — EC2 Deploy Script
#  Usage:  chmod +x deploy.sh && ./deploy.sh
# ─────────────────────────────────────────────────────────────────

set -e  # Exit immediately on any error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║   CampusVoice Authorities — EC2 Deployment   ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Git Sync ─────────────────────────────────────────────
echo -e "${YELLOW}[1/5] Pulling latest changes from main...${NC}"
git pull origin main
echo -e "${GREEN}✅ Git sync complete.${NC}\n"

# ── Step 2: Environment Check ────────────────────────────────────
echo -e "${YELLOW}[2/5] Checking environment files...${NC}"

if [ ! -f "./backend/.env" ]; then
  echo -e "${RED}❌ ERROR: ./backend/.env not found!${NC}"
  echo "   Please create it before deploying."
  echo "   Reference: ./backend/.env.example"
  exit 1
fi

if [ ! -f "./ai-service/.env" ]; then
  echo -e "${RED}❌ ERROR: ./ai-service/.env not found!${NC}"
  echo "   Please create it before deploying."
  exit 1
fi

echo -e "${GREEN}✅ Environment files found.${NC}\n"

# ── Step 3: Cleanup ──────────────────────────────────────────────
echo -e "${YELLOW}[3/5] Stopping existing containers and pruning Docker cache...${NC}"
docker-compose down --remove-orphans
docker system prune -f
echo -e "${GREEN}✅ Cleanup complete.${NC}\n"

# ── Step 4: Build & Launch ───────────────────────────────────────
echo -e "${YELLOW}[4/5] Building and launching containers...${NC}"
docker-compose up --build -d
echo -e "${GREEN}✅ Containers launched.${NC}\n"

# ── Step 5: Verification ─────────────────────────────────────────
echo -e "${YELLOW}[5/5] Waiting 10 seconds for services to initialize...${NC}"
sleep 10

echo -e "\n${GREEN}📦 Running containers:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\n${GREEN}🌐 Service URLs:${NC}"
echo "   Frontend:           http://$(curl -s ifconfig.me):80"
echo "   Authority Backend:  http://$(curl -s ifconfig.me):5002"
echo "   AI Service:         http://$(curl -s ifconfig.me):8001/health"

echo -e "\n${GREEN}✅ Deployment complete!${NC}"
