#!/bin/bash

# HRIS v0 - Local Development Setup Script
# This script sets up the local development environment

echo "============================================"
echo "HRIS v0 - Local Development Setup"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}Node.js version: ${NODE_VERSION}${NC}"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}pnpm not found. Installing...${NC}"
    npm install -g pnpm
fi

PNPM_VERSION=$(pnpm -v)
echo -e "${GREEN}pnpm version: ${PNPM_VERSION}${NC}"

# Create database directory
echo ""
echo "Setting up database directory..."
mkdir -p ./database

if [ -d "./database" ]; then
    echo -e "${GREEN}Database directory created: ./database${NC}"
else
    echo -e "${RED}Failed to create database directory${NC}"
    exit 1
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
pnpm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Dependencies installed successfully${NC}"
else
    echo -e "${RED}Failed to install dependencies${NC}"
    exit 1
fi

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo ""
    echo "Creating .env.local file..."
    cat > .env.local << EOF
# HRIS v0 Local Development Environment Variables

# Database (SQLite for local dev)
DATABASE_URL="file:./database/hris_dev.sqlite"

# Session Secret (change this in production)
SESSION_SECRET="local-dev-secret-change-in-production"

# Node Environment
NODE_ENV=development
EOF
    echo -e "${GREEN}.env.local created${NC}"
else
    echo -e "${YELLOW}.env.local already exists, skipping...${NC}"
fi

# Run build to compile the project
echo ""
echo "Building the project..."
pnpm build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Build completed successfully${NC}"
else
    echo -e "${YELLOW}Build had warnings or errors. Check the output above.${NC}"
fi

echo ""
echo "============================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "============================================"
echo ""
echo "To start the development server, run:"
echo "  pnpm dev"
echo ""
echo "Default login credentials:"
echo "  Username: failsafe"
echo "  Password: Knightfall1939"
echo ""
echo "Database location: ./database/hris_dev.sqlite"
echo ""
