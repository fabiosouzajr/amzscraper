#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track if anything needs to be installed
MISSING_REQUIREMENTS=false

# Initialize browser status variables
FIREFOX_OK=false
CHROMIUM_OK=false

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Amazon Scraper Installation Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Node.js version
check_node_version() {
    if command_exists node; then
        NODE_VERSION=$(node -v | sed 's/v//')
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1)
        
        if [ "$MAJOR_VERSION" -ge 18 ]; then
            echo -e "${GREEN}✓${NC} Node.js v$NODE_VERSION is installed (requires v18+)"
            return 0
        else
            echo -e "${RED}✗${NC} Node.js v$NODE_VERSION is installed, but v18+ is required"
            MISSING_REQUIREMENTS=true
            return 1
        fi
    else
        echo -e "${RED}✗${NC} Node.js is not installed (requires v18+)"
        MISSING_REQUIREMENTS=true
        return 1
    fi
}

# Function to check npm
check_npm() {
    if command_exists npm; then
        NPM_VERSION=$(npm -v)
        echo -e "${GREEN}✓${NC} npm v$NPM_VERSION is installed"
        return 0
    else
        echo -e "${RED}✗${NC} npm is not installed"
        MISSING_REQUIREMENTS=true
        return 1
    fi
}

# Function to check if node_modules exists
check_node_modules() {
    local DIR=$1
    local NAME=$2
    
    if [ -d "$DIR/node_modules" ]; then
        echo -e "${GREEN}✓${NC} $NAME dependencies are installed"
        return 0
    else
        echo -e "${YELLOW}✗${NC} $NAME dependencies are not installed"
        MISSING_REQUIREMENTS=true
        return 1
    fi
}

# Function to check Playwright browsers
check_playwright_browsers() {
    cd backend 2>/dev/null || return 1
    
    # Check if playwright is installed
    if [ ! -d "node_modules/playwright" ]; then
        cd ..
        return 1
    fi
    
    # Playwright stores browsers in ~/.cache/ms-playwright or in node_modules/.cache/playwright
    # Check for firefox (primary browser used in scraper)
    FIREFOX_FOUND=false
    if [ -d "$HOME/.cache/ms-playwright" ]; then
        if ls -d "$HOME/.cache/ms-playwright/firefox-"* 2>/dev/null | head -1 | grep -q .; then
            FIREFOX_FOUND=true
        fi
    fi
    if [ "$FIREFOX_FOUND" = false ] && [ -d "node_modules/.cache/playwright" ]; then
        if ls -d "node_modules/.cache/playwright/firefox-"* 2>/dev/null | head -1 | grep -q .; then
            FIREFOX_FOUND=true
        fi
    fi
    
    if [ "$FIREFOX_FOUND" = true ]; then
        echo -e "${GREEN}✓${NC} Playwright Firefox browser is installed"
        FIREFOX_OK=true
    else
        echo -e "${YELLOW}✗${NC} Playwright Firefox browser is not installed"
        MISSING_REQUIREMENTS=true
        FIREFOX_OK=false
    fi
    
    # Check for chromium (used in tests)
    CHROMIUM_FOUND=false
    if [ -d "$HOME/.cache/ms-playwright" ]; then
        if ls -d "$HOME/.cache/ms-playwright/chromium-"* 2>/dev/null | head -1 | grep -q .; then
            CHROMIUM_FOUND=true
        fi
    fi
    if [ "$CHROMIUM_FOUND" = false ] && [ -d "node_modules/.cache/playwright" ]; then
        if ls -d "node_modules/.cache/playwright/chromium-"* 2>/dev/null | head -1 | grep -q .; then
            CHROMIUM_FOUND=true
        fi
    fi
    
    if [ "$CHROMIUM_FOUND" = true ]; then
        echo -e "${GREEN}✓${NC} Playwright Chromium browser is installed"
        CHROMIUM_OK=true
    else
        echo -e "${YELLOW}✗${NC} Playwright Chromium browser is not installed"
        MISSING_REQUIREMENTS=true
        CHROMIUM_OK=false
    fi
    
    cd ..
}

# Function to install Node.js
install_nodejs() {
    echo ""
    echo -e "${YELLOW}To install Node.js v18+, you can:${NC}"
    echo "  1. Visit https://nodejs.org/ and download the LTS version"
    echo "  2. Use your system package manager:"
    echo "     - Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
    echo "     - Using nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo ""
    read -p "Press Enter after installing Node.js to continue checking..."
}

# Function to install backend dependencies
install_backend_deps() {
    echo ""
    echo -e "${BLUE}Installing backend dependencies...${NC}"
    cd backend
    npm install
    INSTALL_STATUS=$?
    cd ..
    
    if [ $INSTALL_STATUS -eq 0 ]; then
        echo -e "${GREEN}✓ Backend dependencies installed successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to install backend dependencies${NC}"
        return 1
    fi
}

# Function to install frontend dependencies
install_frontend_deps() {
    echo ""
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    INSTALL_STATUS=$?
    cd ..
    
    if [ $INSTALL_STATUS -eq 0 ]; then
        echo -e "${GREEN}✓ Frontend dependencies installed successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
        return 1
    fi
}

# Function to install Playwright browsers
install_playwright_browsers() {
    echo ""
    echo -e "${BLUE}Installing Playwright browsers...${NC}"
    cd backend
    
    # Install firefox (primary browser)
    if [ "$FIREFOX_OK" != "true" ]; then
        echo -e "${BLUE}Installing Firefox...${NC}"
        npx playwright install firefox
    fi
    
    # Install chromium (for tests)
    if [ "$CHROMIUM_OK" != "true" ]; then
        echo -e "${BLUE}Installing Chromium...${NC}"
        npx playwright install chromium
    fi
    
    cd ..
    echo -e "${GREEN}✓ Playwright browsers installation complete${NC}"
}

# Main check sequence
echo -e "${BLUE}Checking requirements...${NC}"
echo ""

# Check Node.js
check_node_version
NODE_OK=$?

# Check npm (only if Node.js is OK, as npm usually comes with Node.js)
if [ $NODE_OK -eq 0 ]; then
    check_npm
    NPM_OK=$?
else
    NPM_OK=1
fi

# Only check npm packages if Node.js and npm are available
if [ $NODE_OK -eq 0 ] && [ $NPM_OK -eq 0 ]; then
    echo ""
    echo -e "${BLUE}Checking npm dependencies...${NC}"
    
    # Check backend dependencies
    check_node_modules "backend" "Backend"
    BACKEND_DEPS_OK=$?
    
    # Check frontend dependencies
    check_node_modules "frontend" "Frontend"
    FRONTEND_DEPS_OK=$?
    
    # Check Playwright browsers (only if backend deps are installed)
    if [ $BACKEND_DEPS_OK -eq 0 ]; then
        echo ""
        echo -e "${BLUE}Checking Playwright browsers...${NC}"
        check_playwright_browsers
    else
        echo -e "${YELLOW}⚠ Skipping Playwright browser check (backend dependencies not installed)${NC}"
        FIREFOX_OK=false
        CHROMIUM_OK=false
    fi
else
    echo ""
    echo -e "${YELLOW}⚠ Skipping npm dependency checks (Node.js/npm not available)${NC}"
    BACKEND_DEPS_OK=1
    FRONTEND_DEPS_OK=1
    FIREFOX_OK=false
    CHROMIUM_OK=false
fi

# Summary and installation prompts
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$MISSING_REQUIREMENTS" = false ]; then
    echo -e "${GREEN}All requirements are installed!${NC}"
    echo ""
    echo "You can now run the application:"
    echo "  Backend:  cd backend && npm run dev"
    echo "  Frontend: cd frontend && npm run dev"
    exit 0
else
    echo -e "${YELLOW}Some requirements are missing.${NC}"
    echo ""
    
    # Offer to install missing components
    if [ $NODE_OK -ne 0 ]; then
        echo -e "${RED}Node.js is missing or version is too old.${NC}"
        install_nodejs
        # Re-check after user installs
        check_node_version
        NODE_OK=$?
        if [ $NODE_OK -eq 0 ]; then
            check_npm
            NPM_OK=$?
        fi
    fi
    
    if [ $NODE_OK -eq 0 ] && [ $NPM_OK -eq 0 ]; then
        if [ $BACKEND_DEPS_OK -ne 0 ]; then
            echo ""
            read -p "Install backend dependencies? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                install_backend_deps
            fi
        fi
        
        if [ $FRONTEND_DEPS_OK -ne 0 ]; then
            echo ""
            read -p "Install frontend dependencies? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                install_frontend_deps
            fi
        fi
        
        # Re-check Playwright browsers if backend deps are now installed
        if [ -d "backend/node_modules/playwright" ]; then
            if [ "$FIREFOX_OK" != "true" ] || [ "$CHROMIUM_OK" != "true" ]; then
                echo ""
                read -p "Install Playwright browsers (Firefox and Chromium)? (y/n) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    install_playwright_browsers
                fi
            fi
        fi
    fi
    
    echo ""
    echo -e "${BLUE}Run this script again to verify all requirements are installed.${NC}"
    exit 1
fi

