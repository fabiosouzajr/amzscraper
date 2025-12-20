# Amazon Price Tracker

A full-stack TypeScript web application that tracks Amazon product prices, stores data in SQLite, and provides a React frontend with dashboard, product management, and price history visualization.

## Features

- **Product Management**: Add Amazon products by ASIN with validation
- **Price Tracking**: Automatically tracks price changes (only stores when price decreases)
- **Dashboard**: View products with the biggest price drops
- **Product Search**: Live search functionality to find products
- **Price History**: View chronological price data with charts
- **Automatic Updates**: Scheduled daily price updates via cron
- **Manual Updates**: Trigger price updates on demand

## Technology Stack

- **Backend**: Node.js, Express, TypeScript, Playwright, SQLite, node-cron
- **Frontend**: React, TypeScript, Vite, Recharts
- **Database**: SQLite3

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Git

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd amzscraper
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

## Configuration

The application uses the following default ports:
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

You can change the backend port by setting the `PORT` environment variable:
```bash
export PORT=3000
```

## Running the Application

### Development Mode

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

3. Open your browser and navigate to `http://localhost:5173`

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

### Adding Products

1. Navigate to the "Products" page
2. Enter an Amazon ASIN (10-character alphanumeric code)
3. Click "Add Product"
4. The app will validate the ASIN, scrape the product page, and save it to the database

### Viewing Price Drops

1. Navigate to the "Dashboard" page
2. View products sorted by biggest price drops
3. Click "Update Prices Now" to manually trigger a price update

### Searching Products

1. Navigate to the "Search" page
2. Type in the search box to find products by name or ASIN
3. Click on a result to view detailed price history

### Viewing Product Details

1. Search for a product or navigate from the dashboard
2. View the product's price history chart
3. See chronological price data in the table below

## Database

The SQLite database is stored at `database/products.db`. It contains two tables:

- **products**: Stores product information (id, asin, description, created_at)
- **price_history**: Stores price history entries (id, product_id, price, date, created_at)

## Scheduled Updates

The application automatically runs price updates daily at midnight (00:00). The schedule can be modified in `backend/src/services/scheduler.ts`.

## API Endpoints

- `GET /api/products` - List all products
- `POST /api/products` - Add new ASIN (with validation)
- `DELETE /api/products/:id` - Remove product
- `GET /api/products/search?q=...` - Search products
- `GET /api/products/:id` - Get product with price history
- `POST /api/prices/update` - Manual price update trigger
- `GET /api/dashboard/drops` - Get biggest price drops

## Project Structure

```
amzscraper/
├── backend/
│   ├── src/
│   │   ├── server.ts              # Express server setup
│   │   ├── routes/                # API routes
│   │   ├── services/              # Business logic
│   │   ├── models/                # TypeScript types
│   │   └── utils/                 # Utilities
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/            # React components
│   │   ├── services/              # API client
│   │   └── types.ts               # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── database/
│   └── products.db                # SQLite database
└── README.md
```

## Notes

- The scraper uses Playwright to navigate Amazon pages and extract product information
- Price history is only stored when the current price is lower than the previous price
- The app scrapes Amazon Brazil (amazon.com.br) - modify the URL in `scraper.ts` for other regions
- Rate limiting: The scraper includes delays between requests to avoid being blocked

## Troubleshooting

### Playwright browser not found
Run `npx playwright install chromium` in the backend directory

### Database errors
Ensure the `database/` directory exists and is writable

### CORS errors
Make sure the backend is running on port 3000 and frontend on port 5173, or update the proxy configuration in `vite.config.ts`

## License

ISC

