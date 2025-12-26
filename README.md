# Amazon Price Tracker

A full-stack TypeScript web application that tracks Amazon product prices, stores data in SQLite, and provides a React frontend with dashboard, product management, price history visualization, user authentication, and product lists organization.

## Features

### Core Features
- **User Authentication**: Secure login/register system with JWT tokens and password hashing
- **Product Management**: Add Amazon products by ASIN with validation
- **Price Tracking**: Automatically tracks price changes (only stores when price decreases)
- **Dashboard**: View products with the biggest price drops
- **Product Search**: Live search functionality with pagination showing most recently added products
- **Price History**: View chronological price data with interactive charts
- **Automatic Updates**: Scheduled daily price updates via cron
- **Manual Updates**: Trigger price updates on demand

### Advanced Features
- **Product Lists**: Create custom lists to organize products (e.g., "Wishlist", "To Buy", etc.)
- **Categories**: Automatic product categorization from Amazon
- **Category Filtering**: Filter products by category on dashboard and products page
- **CSV Import/Export**: Import multiple ASINs from CSV or export all tracked ASINs
- **Database Export**: Export the complete SQLite database for backup
- **Account Management**: Change password functionality
- **Internationalization**: Support for English and Portuguese (Brazil)
- **Responsive Design**: Mobile-friendly interface

## Technology Stack

- **Backend**: Node.js, Express, TypeScript, Playwright, SQLite, node-cron, bcrypt, jsonwebtoken
- **Frontend**: React, TypeScript, Vite, Recharts, react-i18next
- **Database**: SQLite3
- **Authentication**: JWT (JSON Web Tokens)

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git
- Playwright browsers (Firefox and Chromium) - installed automatically by install script

## Quick Start

### Option 1: Using Installation Script (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd amzscraper
```

2. Run the installation script:
```bash
chmod +x install.sh
./install.sh
```

The script will:
- Check for Node.js (v18+) and npm
- Verify/install backend and frontend dependencies
- Check/install Playwright browsers (Firefox and Chromium)
- Guide you through any missing requirements

3. Run the application:
```bash
chmod +x run.sh
./run.sh
```

The run script will:
- Prompt for backend port (default: 3030)
- Prompt for frontend port (default: 5174)
- Start both backend and frontend in the background
- Display access URLs (including Tailscale if available)
- Save process IDs for easy shutdown

### Option 2: Manual Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd amzscraper
```

2. Install backend dependencies:
```bash
cd backend
npm install
npx playwright install firefox chromium
cd ..
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

## Installation Script (`install.sh`)

The `install.sh` script automates the installation process and checks for all requirements.

### What it does:
- ✅ Checks Node.js version (requires v18+)
- ✅ Checks npm installation
- ✅ Verifies backend dependencies (`backend/node_modules`)
- ✅ Verifies frontend dependencies (`frontend/node_modules`)
- ✅ Checks Playwright browsers (Firefox and Chromium)
- ✅ Offers to install missing components interactively

### Usage:
```bash
chmod +x install.sh
./install.sh
```

### Interactive Features:
- Prompts to install missing Node.js (with instructions)
- Offers to install backend dependencies if missing
- Offers to install frontend dependencies if missing
- Offers to install Playwright browsers if missing

### Exit Codes:
- `0`: All requirements met
- `1`: Some requirements missing

## Run Script (`run.sh`)

The `run.sh` script starts both backend and frontend servers with custom port configuration.

### Features:
- Configurable ports for backend and frontend
- Port validation (1-65535)
- Background process management with `nohup`
- Log file generation in `logs/` directory
- PID file storage for process management
- Tailscale detection and URL display
- Process continues running after terminal closes

### Usage:
```bash
chmod +x run.sh
./run.sh
```

### Prompts:
1. **Backend port**: Default is `3030` (press Enter for default)
2. **Frontend port**: Default is `5174` (press Enter for default)

### Output:
- Process IDs (PIDs) for both services
- Log file locations
- Access URLs (localhost and Tailscale if available)
- Command to stop processes

### Stopping the Application:
```bash
kill $(cat logs/*.pid)
```

Or stop individually:
```bash
kill $(cat logs/backend.pid)
kill $(cat logs/frontend.pid)
```

### Log Files:
- `logs/backend.log` - Backend server logs
- `logs/frontend.log` - Frontend server logs
- `logs/backend.pid` - Backend process ID
- `logs/frontend.pid` - Frontend process ID

### Tailscale Support:
If Tailscale is detected, the script automatically displays:
- Tailscale IP addresses for both services
- Tailscale hostname URLs (if available)

## Configuration

### Port Configuration

**Default Ports:**
- Backend: `3030` (configurable via `run.sh` or `PORT` environment variable)
- Frontend: `5174` (configurable via `run.sh` or Vite config)

**Using Environment Variables:**
```bash
export PORT=3030
cd backend
npm run dev
```

**Using run.sh:**
The script prompts for ports and validates them automatically.

**Frontend Proxy:**
The frontend Vite configuration proxies `/api` requests to the backend. Update `frontend/vite.config.ts` if you change the backend port:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3030',  // Update this
    changeOrigin: true
  }
}
```

## Running the Application

### Development Mode

#### Using run.sh (Recommended):
```bash
./run.sh
```

#### Manual Start:
1. Start the backend server:
```bash
cd backend
npm run dev
```

2. In a separate terminal, start the frontend:
```bash
cd frontend
npm run dev
```

3. Open your browser and navigate to `http://localhost:5174` (or the port you configured)

### Production Mode

1. Build the backend:
```bash
cd backend
npm run build
npm start
```

2. Build the frontend:
```bash
cd frontend
npm run build
npm run preview
```

## Usage

### Authentication

1. **Register**: Create a new account with username (min 3 chars) and password (min 6 chars)
2. **Login**: Use your credentials to access the application
3. **Change Password**: Navigate to Config → Account section to change your password

### Adding Products

#### Single Product:
1. Navigate to the "Products" page
2. Enter an Amazon ASIN (10-character alphanumeric code)
3. Click "Add Product"
4. The app will validate the ASIN, scrape the product page, and save it to the database

#### Bulk Import (CSV):
1. Navigate to the "Products" page
2. Click "Import ASINs"
3. Select a CSV file containing ASINs (one per line, optional header)
4. Monitor progress in real-time
5. View import results (success/failed/skipped counts)

#### Export ASINs:
1. Navigate to the "Config" page
2. Click "Export ASINs" in the Data Export section
3. Download CSV file with all your tracked ASINs

### Product Lists

1. **Create List**: Use the sidebar on the Products page to create custom lists
2. **Add to List**: Click "Add to List" on any product and select a list
3. **View by List**: Click a list in the sidebar to filter products
4. **Remove from List**: Click the × button next to a list badge on a product
5. **Rename/Delete Lists**: Use the edit and delete buttons in the sidebar

### Viewing Price Drops

1. Navigate to the "Dashboard" page
2. View products sorted by biggest price drops
3. Click on a product to see detailed price history
4. Click "Update Prices Now" to manually trigger a price update
5. Filter by category by clicking category badges

### Searching Products

1. Navigate to the "Search" page
2. **Default View**: Shows 10 most recently added products with pagination
3. **Search Mode**: Type in the search box to find products by name or ASIN
4. Click on a result to view detailed price history
5. View list information for each product in search results

### Viewing Product Details

1. Search for a product or navigate from the dashboard/products page
2. View the product's price history chart
3. See chronological price data in the table below
4. View which lists the product belongs to
5. See product categories and metadata

### Configuration

1. Navigate to the "Config" page
2. **Database Info**: View total products and database size
3. **Export Database**: Download complete SQLite database backup
4. **Export ASINs**: Export all tracked ASINs as CSV
5. **Account Settings**: Change your password

## Database

The SQLite database is stored at `database/products.db`. It contains the following tables:

- **users**: User accounts (id, username, password_hash, created_at)
- **products**: Product information (id, user_id, asin, description, created_at)
- **categories**: Product categories (id, name)
- **product_categories**: Product-category relationships (product_id, category_id, level)
- **price_history**: Price history entries (id, product_id, price, date, created_at)
- **user_lists**: User-created lists (id, user_id, name, created_at)
- **product_lists**: Product-list relationships (product_id, list_id)

### Database Features:
- Multi-user support with user isolation
- Automatic category extraction from Amazon
- Cascading deletes (deleting user deletes all their data)
- Foreign key constraints for data integrity

## Scheduled Updates

The application automatically runs price updates daily at midnight (00:00). The schedule can be modified in `backend/src/services/scheduler.ts`.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Authenticate user and get token
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change user password

### Products
- `GET /api/products` - List all products (with pagination, category filter)
- `POST /api/products` - Add new ASIN (with validation)
- `DELETE /api/products/:id` - Remove product
- `GET /api/products/search?q=...` - Search products
- `GET /api/products/:id` - Get product with price history
- `GET /api/products/categories` - Get all available categories

### Lists
- `GET /api/lists` - Get all lists for current user
- `POST /api/lists` - Create new list
- `PUT /api/lists/:id` - Rename list
- `DELETE /api/lists/:id` - Delete list
- `POST /api/lists/:id/products` - Add product to list
- `DELETE /api/lists/:id/products/:productId` - Remove product from list

### Prices
- `POST /api/prices/update` - Manual price update trigger

### Dashboard
- `GET /api/dashboard/drops?limit=10` - Get biggest price drops

### Config
- `GET /api/config/database-info` - Get database information
- `GET /api/config/export-database` - Export the entire database
- `GET /api/config/export-asins` - Export all ASINs as CSV
- `POST /api/config/import-asins` - Import ASINs from CSV (Server-Sent Events)

## Project Structure

```
amzscraper/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express server setup
│   │   ├── routes/                # API routes
│   │   │   ├── auth.ts            # Authentication routes
│   │   │   ├── products.ts        # Product management
│   │   │   ├── lists.ts           # List management
│   │   │   ├── prices.ts          # Price updates
│   │   │   ├── dashboard.ts       # Dashboard data
│   │   │   └── config.ts          # Configuration & export
│   │   ├── services/              # Business logic
│   │   │   ├── database.ts        # Database operations
│   │   │   ├── scraper.ts         # Amazon scraping
│   │   │   └── scheduler.ts       # Scheduled tasks
│   │   ├── middleware/            # Express middleware
│   │   │   └── auth.ts            # JWT authentication
│   │   ├── models/                # TypeScript types
│   │   └── utils/                 # Utilities
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Main app component
│   │   ├── components/            # React components
│   │   │   ├── Auth.tsx           # Login/Register
│   │   │   ├── Dashboard.tsx      # Price drops dashboard
│   │   │   ├── ProductList.tsx     # Product management
│   │   │   ├── ProductSearch.tsx   # Product search
│   │   │   ├── ProductDetail.tsx      # Price history
│   │   │   ├── ListsSidebar.tsx   # List management
│   │   │   ├── Config.tsx         # Configuration
│   │   │   └── ...
│   │   ├── contexts/              # React contexts
│   │   │   └── AuthContext.tsx   # Authentication state
│   │   ├── services/              # API client
│   │   │   └── api.ts             # API methods
│   │   ├── i18n/                  # Internationalization
│   │   │   ├── config.ts
│   │   │   └── locales/
│   │   │       ├── en.json        # English translations
│   │   │       └── pt-BR.json    # Portuguese translations
│   │   └── types.ts               # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── database/
│   └── products.db                # SQLite database
├── logs/                          # Application logs (created by run.sh)
│   ├── backend.log
│   ├── frontend.log
│   ├── backend.pid
│   └── frontend.pid
├── install.sh                     # Installation script
├── run.sh                         # Run script
└── README.md
```

## Internationalization

The application supports multiple languages:
- **English** (en) - Default
- **Portuguese (Brazil)** (pt-BR)

Switch languages using the language selector in the navigation bar. All UI text is translated, including:
- Navigation menus
- Form labels and buttons
- Error messages
- Success messages
- Product information

## Notes

- The scraper uses Playwright to navigate Amazon pages and extract product information
- Price history is only stored when the current price is lower than the previous price
- The app scrapes Amazon Brazil (amazon.com.br) - modify the URL in `scraper.ts` for other regions
- Rate limiting: The scraper includes delays between requests to avoid being blocked
- User data is isolated - each user only sees their own products and lists
- Passwords are hashed using bcrypt before storage
- JWT tokens are used for authentication and expire after a set period

## Troubleshooting

### Installation Issues

**Node.js version too old:**
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

**Playwright browser not found:**
```bash
cd backend
npx playwright install firefox chromium
```

**Dependencies installation fails:**
- Ensure you have Node.js v18+ installed
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- Check your internet connection

### Runtime Issues

**Port already in use:**
- Use `run.sh` to specify different ports
- Or manually set `PORT` environment variable for backend
- Update `vite.config.ts` for frontend port

**Database errors:**
- Ensure the `database/` directory exists and is writable
- Check file permissions: `chmod 755 database/`

**CORS errors:**
- Make sure the backend is running on the port specified in `vite.config.ts` proxy
- Check that the frontend proxy target matches your backend port

**Authentication issues:**
- Clear browser localStorage: `localStorage.clear()` in browser console
- Check that JWT_SECRET is set in backend (if using environment variables)

**Scraper fails:**
- Ensure Playwright browsers are installed: `npx playwright install firefox`
- Check internet connection
- Amazon may have changed their page structure - check scraper logs

**Process won't stop:**
```bash
# Find and kill processes
ps aux | grep node
kill <PID>

# Or use the PID files
kill $(cat logs/*.pid)
```

### Log Files

Check log files for detailed error messages:
- `logs/backend.log` - Backend errors and debug info
- `logs/frontend.log` - Frontend build and runtime errors

## Security Considerations

- Passwords are hashed using bcrypt (10 rounds)
- JWT tokens are used for stateless authentication
- All API routes (except auth) require authentication
- User data is isolated at the database level
- SQL injection protection via parameterized queries
- XSS protection via React's built-in escaping

## License

ISC
