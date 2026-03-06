# Backend API Documentation

## Overview

The backend is a Node.js/Express REST API built with TypeScript that powers the Amazon Price Tracker application. It provides multi-tenant user authentication, product tracking, automated price scraping from Amazon.com.br, price history management, and dashboard statistics.

### Key Features

- **Multi-tenant architecture** with user-scoped data isolation
- **JWT-based authentication** with 7-day token expiry
- **Automated price scraping** using Playwright Firefox headless browser
- **Scheduled price updates** via cron jobs (daily at midnight by default)
- **Real-time progress streaming** via Server-Sent Events (SSE)
- **SQLite database** with automatic migrations
- **Product list management** for custom product groupings
- **Price tracking** with history and drop/increase analytics
- **ASIN import/export** functionality for bulk operations

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | - | Runtime environment |
| TypeScript | 5.3.3 | Type-safe JavaScript |
| Express | 4.18.2 | HTTP server and routing |
| SQLite3 | 5.1.6 | Embedded database |
| Playwright | 1.40.0 | Browser automation for scraping |
| bcrypt | 6.0.0 | Password hashing |
| jsonwebtoken | 9.0.3 | JWT token generation/verification |
| node-cron | 3.0.3 | Job scheduling |
| cors | 2.8.5 | Cross-origin resource sharing |
| ts-node-dev | 2.0.0 | Development tooling with hot reload |

## Project Structure

```
backend/
├── src/
│   ├── server.ts                    # Application entry point
│   ├── middleware/
│   │   └── auth.ts                  # JWT authentication middleware
│   ├── models/
│   │   └── types.ts                 # TypeScript interfaces
│   ├── routes/
│   │   ├── auth.ts                  # Authentication endpoints
│   │   ├── products.ts              # Product CRUD operations
│   │   ├── prices.ts                # Price update triggers (SSE)
│   │   ├── dashboard.ts             # Price statistics endpoints
│   │   ├── lists.ts                 # List management
│   │   └── config.ts                # Import/export configuration
│   ├── services/
│   │   ├── database.ts              # Database operations (~1334 lines)
│   │   ├── scraper.ts               # Amazon scraping logic
│   │   └── scheduler.ts             # Cron job management
│   └── utils/
│       ├── logger.ts                # Timestamped logging
│       └── validation.ts            # ASIN validation
├── test/                            # Debug utilities (no test suite)
├── package.json
└── tsconfig.json
```

## Database Schema

The database is a SQLite file located at `database/products.db`. All tables include user-scoped data via foreign keys.

### Tables

#### users
User accounts with password hashing.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| username | TEXT | UNIQUE NOT NULL |
| password_hash | TEXT | NOT NULL (bcrypt) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### products
User-tracked Amazon products.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FOREIGN KEY → users(id) ON DELETE CASCADE |
| asin | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Unique constraint:** `(user_id, asin)` - prevents duplicate ASINs per user

#### categories
Normalized category names (shared across all users).

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |

#### product_categories
Many-to-many relationship between products and categories with hierarchy level.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| product_id | INTEGER | FOREIGN KEY → products(id) ON DELETE CASCADE |
| category_id | INTEGER | FOREIGN KEY → categories(id) ON DELETE CASCADE |
| level | INTEGER | NOT NULL (hierarchy depth) |

**Unique constraint:** `(product_id, category_id, level)`

#### price_history
Historical price records for each product.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| product_id | INTEGER | FOREIGN KEY → products(id) |
| price | REAL | Nullable (null if unavailable) |
| available | BOOLEAN | DEFAULT 1 |
| unavailable_reason | TEXT | Nullable |
| date | DATETIME | DEFAULT CURRENT_TIMESTAMP |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

#### user_lists
Custom product collections per user.

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| user_id | INTEGER | FOREIGN KEY → users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

**Unique constraint:** `(user_id, name)`

#### product_lists
Many-to-many relationship between products and lists.

| Column | Type | Constraints |
|--------|------|-------------|
| product_id | INTEGER | FOREIGN KEY → products(id) ON DELETE CASCADE |
| list_id | INTEGER | FOREIGN KEY → user_lists(id) ON DELETE CASCADE |

**Primary key:** `(product_id, list_id)`

### Database Indexes

The following indexes are automatically created for performance:

- `idx_product_id` on `price_history(product_id)`
- `idx_asin` on `products(asin)`
- `idx_products_user` on `products(user_id)`
- `idx_category_name` on `categories(name)`
- `idx_product_category_product` on `product_categories(product_id)`
- `idx_product_category_category` on `product_categories(category_id)`
- `idx_product_category_level` on `product_categories(level)`
- `idx_user_lists_user` on `user_lists(user_id)`
- `idx_product_lists_product` on `product_lists(product_id)`
- `idx_product_lists_list` on `product_lists(list_id)`

### Database Migrations

Migrations run automatically on server startup in `database.ts`. The system handles schema evolution through table recreation when necessary:

1. **price_history table migration**: Adds `available` and `unavailable_reason` columns, makes `price` nullable
2. **products table migration**: Adds `user_id` column for multi-tenancy

## API Endpoints

### Authentication (`/api/auth`)

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "username": "string (min 3 chars)",
  "password": "string (min 6 chars)"
}
```

**Response (201):**
```json
{
  "user": {
    "id": 1,
    "username": "username",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "token": "jwt-token-string"
}
```

#### POST `/api/auth/login`
Authenticate and receive JWT token.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "username",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "token": "jwt-token-string"
}
```

#### POST `/api/auth/logout`
Logout (client-side token removal).

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

#### GET `/api/auth/me`
Get current authenticated user info.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": 1,
  "username": "username",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

#### POST `/api/auth/change-password`
Change user password.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string (min 6 chars)"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

### Products (`/api/products`)

All product routes require authentication.

#### GET `/api/products`
List all products with pagination and optional category filtering.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `category` (optional): Filter by category name (partial match)
- `page` (optional): Page number, default 1
- `pageSize` (optional): Items per page, default 20, max 100

**Response (200):**
```json
{
  "products": [
    {
      "id": 1,
      "asin": "B08X...",
      "description": "Product name",
      "categories": [
        {
          "id": 1,
          "name": "Category name",
          "level": 0
        }
      ],
      "lists": [
        {
          "id": 1,
          "user_id": 1,
          "name": "My List",
          "created_at": "2024-01-01T00:00:00.000Z"
        }
      ],
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 100,
    "totalPages": 5
  }
}
```

#### GET `/api/products/search?q=<query>`
Search products by description or ASIN.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `q` (required): Search query (matches description or ASIN)
- `category` (optional): Filter by category name

**Response (200):** Array of products with categories and lists

#### GET `/api/products/categories`
Get all available categories.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Category name",
    "level": 0
  }
]
```

#### GET `/api/products/ids/sorted`
Get all product IDs sorted alphabetically by description.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "productIds": [1, 2, 3, 4, 5]
}
```

#### GET `/api/products/:id`
Get product with price history.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": 1,
  "asin": "B08X...",
  "description": "Product name",
  "categories": [...],
  "lists": [...],
  "created_at": "2024-01-01T00:00:00.000Z",
  "current_price": 123.45,
  "previous_price": 130.00,
  "price_drop": 6.55,
  "price_drop_percentage": 5.04,
  "last_updated": "2024-01-01T00:00:00.000Z",
  "price_history": [
    {
      "id": 1,
      "product_id": 1,
      "price": 130.00,
      "available": true,
      "unavailable_reason": null,
      "date": "2024-01-01T00:00:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### POST `/api/products`
Add a new product by ASIN. The system will scrape Amazon.com.br for product details.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "asin": "B08X..."
}
```

**Response (201):**
```json
{
  "id": 1,
  "asin": "B08X...",
  "description": "Product name",
  "categories": [...],
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

#### DELETE `/api/products/:id`
Delete a product and all associated data.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Product deleted successfully"
}
```

### Prices (`/api/prices`)

#### POST `/api/prices/update`
Trigger manual price update for all user products. Uses Server-Sent Events for real-time progress.

**Headers:** `Authorization: Bearer <token>`

**SSE Events:**
```json
{
  "status": "starting",
  "progress": 0
}
{
  "status": "processing",
  "progress": 45,
  "current": 5,
  "total": 10,
  "currentProduct": "Product name",
  "updated": 3,
  "skipped": 1,
  "errors": 1
}
{
  "status": "completed",
  "progress": 100,
  "updated": 5,
  "skipped": 3,
  "errors": 2
}
```

### Dashboard (`/api/dashboard`)

#### GET `/api/dashboard/drops?limit=10`
Get biggest price drops.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Number of results, default 10

**Response (200):**
```json
[
  {
    "product": {...},
    "current_price": 100.00,
    "previous_price": 150.00,
    "price_drop": 50.00,
    "price_drop_percentage": 33.33,
    "last_updated": "2024-01-01T00:00:00.000Z",
    "price_history": [...]
  }
]
```

#### GET `/api/dashboard/increases?limit=10`
Get biggest price increases.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Number of results, default 10

**Response (200):** Same structure as drops

### Lists (`/api/lists`)

#### GET `/api/lists`
Get all lists for current user.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "name": "My List",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### POST `/api/lists`
Create a new list.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "My New List"
}
```

**Response (201):** Created list object

#### PUT `/api/lists/:id`
Rename an existing list.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Updated List Name"
}
```

**Response (200):** Updated list object

#### DELETE `/api/lists/:id`
Delete a list.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "List deleted successfully"
}
```

#### POST `/api/lists/:id/products`
Add a product to a list.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "productId": 1
}
```

**Response (200):**
```json
{
  "message": "Product added to list successfully"
}
```

#### DELETE `/api/lists/:id/products/:productId`
Remove a product from a list.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "message": "Product removed from list successfully"
}
```

#### GET `/api/lists/:id/products`
Get all products in a list.

**Headers:** `Authorization: Bearer <token>`

**Response (200):** Array of products with categories

### Configuration (`/api/config`)

#### GET `/api/config/export-asins`
Export all user ASINs as CSV.

**Headers:** `Authorization: Bearer <token>`

**Response:** CSV file download (one ASIN per line, no header)

#### POST `/api/config/import-asins`
Import ASINs from CSV. Uses Server-Sent Events for progress.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "csvContent": "B08X...\nB09Y...\nB10Z..."
}
```

**SSE Events:**
```json
{
  "status": "starting",
  "current": 0,
  "total": 100,
  "success": 0,
  "failed": 0,
  "skipped": 0
}
{
  "status": "processing",
  "current": 50,
  "total": 100,
  "currentASIN": "B08X...",
  "success": 45,
  "failed": 3,
  "skipped": 2
}
{
  "status": "completed",
  "current": 100,
  "total": 100,
  "success": 95,
  "failed": 3,
  "skipped": 2
}
```

#### GET `/api/config/database-info`
Get database information.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "productCount": 100,
  "databaseSize": 1048576,
  "databaseSizeFormatted": "1.00 MB"
}
```

#### GET `/api/config/export-database`
Export entire database file.

**Headers:** `Authorization: Bearer <token>`

**Response:** SQLite database file download

### Health Check

#### GET `/health`
Check server health (no authentication required).

**Response (200):**
```json
{
  "status": "ok"
}
```

## Core Services

### Database Service (`database.ts`)

The `DatabaseService` class handles all database operations using direct SQL queries (no ORM). It's implemented as a singleton pattern.

**Key Methods:**

#### User Operations
- `createUser(username, password)` - Create user with bcrypt hashed password
- `getUserByUsername(username)` - Retrieve user with password hash
- `getUserById(id)` - Get user by ID (without password)
- `updateUserPassword(userId, newPassword)` - Update user password
- `getAllUsers()` - Get all users (for scheduled updates)

#### Product Operations
- `addProduct(userId, asin, description, categories)` - Create product with categories
- `getProductById(id, userId)` - Get product with categories
- `getProductByASIN(userId, asin)` - Get product by ASIN
- `getAllProducts(userId, categoryFilter)` - Get all user products with optional filtering
- `searchProducts(userId, query, categoryFilter)` - Search products
- `deleteProduct(id, userId)` - Delete product and related data
- `getProductsWithLists(userId, categoryFilter, limit, offset)` - Get products with list memberships
- `getProductsCount(userId, categoryFilter)` - Get product count for pagination
- `getAllProductIdsSorted(userId)` - Get all IDs sorted alphabetically
- `getProductCount(userId)` - Get total product count

#### Category Operations
- `getOrCreateCategory(name)` - Get existing or create new category
- `setProductCategories(productId, categoryNames)` - Update product categories
- `getProductCategories(productId)` - Get product categories
- `getAllCategories()` - Get all unique categories

#### Price History Operations
- `addPriceHistory(productId, price, available, unavailableReason)` - Add price record
- `getLastPrice(productId)` - Get most recent available price
- `getPriceHistory(productId)` - Get all price records
- `getProductWithPriceHistory(productId, userId)` - Get product with price analytics

#### List Operations
- `createList(userId, name)` - Create user list
- `getUserLists(userId)` - Get all user lists
- `getListById(listId)` - Get list by ID
- `updateList(listId, name)` - Rename list
- `deleteList(listId)` - Delete list
- `addProductToList(productId, listId)` - Add product to list
- `removeProductFromList(productId, listId)` - Remove product from list
- `getProductLists(productId, userId)` - Get lists containing product
- `getListProducts(listId)` - Get products in a list

#### Dashboard Operations
- `getBiggestPriceDrops(userId, limit)` - Get products with largest price decreases
- `getBiggestPriceIncreases(userId, limit)` - Get products with largest price increases

#### Utility Methods
- `getDatabasePath()` - Get database file path
- `close()` - Close database connection

### Scraper Service (`scraper.ts`)

The `ScraperService` class handles Amazon.com.br scraping using Playwright Firefox headless browser.

**Key Methods:**

#### `initialize()`
Initialize Playwright Firefox browser with Chrome user-agent and 1920x1080 viewport.

#### `close()`
Close browser and context.

#### `scrapeProduct(asin, retries = 2)`
Scrape a single product from Amazon.com.br.

**Scraping Process:**

1. Navigate to `https://www.amazon.com.br/dp/${asin}`
2. Wait 4 seconds for dynamic content
3. Extract product title using cascading selectors:
   - Priority 1: `#productTitle`
   - Priority 2: `span#productTitle`
   - Priority 3: `h1.a-size-large`
   - Priority 4: `h1[data-automation-id="title"]`
4. Check availability using Portuguese and English patterns:
   - `não disponível`, `indisponível`, `fora de estoque`, `esgotado`
   - `temporarily unavailable`, `out of stock`
5. If unavailable, record reason and skip price extraction
6. Extract price using cascading methods:
   - Method 1: `.a-price.priceToPay` (prioritizes visible, non-strikethrough prices)
   - Method 2: `#corePriceDisplay_desktop_feature_div` or `#corePrice_feature_div`
   - Method 3: First visible `span.a-price-whole` + `span.a-price-fraction`
   - Method 4: Fallback to `.a-offscreen` text
7. Parse Brazilian price format (dot as thousands separator, comma as decimal)
8. Extract categories from breadcrumbs:
   - Priority 1: Breadcrumb links in `#wayfinding-breadcrumbs_feature_div`
   - Priority 2: Product details table
   - Priority 3: Meta tags
9. Return scraped data

**Return Value:**
```typescript
{
  asin: string;
  description: string;
  price: number | null;
  available: boolean;
  unavailableReason?: string;
  categories?: string[];
}
```

#### `scrapeMultipleProducts(asins)`
Scrape multiple products with 2-second delays between requests.

**Scraper Behavior:**
- Uses Firefox headless mode
- Chrome user-agent string to avoid detection
- 4-second wait after page load
- 2-second delay between product requests
- Automatic retry on failure (2 retries by default)
- Detects and reports CAPTCHA/blocking pages

### Scheduler Service (`scheduler.ts`)

The `SchedulerService` class manages scheduled price updates using node-cron.

**Key Methods:**

#### `start(schedule = '0 0 * * *')`
Start cron job. Default schedule is daily at midnight.

Cron expression format: `minute hour day month day-of-week`

#### `stop()`
Stop the scheduled job.

#### `updateUserPrices(userId, onProgress)`
Update prices for a specific user with progress callbacks via SSE.

**Progress Callback Parameters:**
```typescript
{
  status: 'starting' | 'processing' | 'completed' | 'error' | 'skipped';
  progress?: number;           // 0-100
  current?: number;            // Current product index
  total?: number;              // Total products
  currentProduct?: string;     // Product description
  updated?: number;            // Products updated
  skipped?: number;            // Products skipped (no change)
  errors?: number;             // Products with errors
  error?: string;              // Error message
}
```

**Update Process:**

1. Initialize scraper
2. Get all user products
3. For each product:
   - Scrape current data from Amazon
   - Update categories if changed
   - Check availability
   - Record new price if changed or first price
   - 2-second delay between products
4. Close scraper
5. Report final statistics

#### `updateAllPrices()`
Update prices for all users (called by cron job).

**Concurrency Control:**
- `isUpdating` flag prevents concurrent updates
- Returns early if update already in progress

#### `isRunning()`
Check if scheduler is active.

## Middleware

### Authentication Middleware (`auth.ts`)

#### `authenticate(req, res, next)`
Required authentication for protected routes.

**Process:**
1. Extract `Authorization` header
2. Validate Bearer token format
3. Verify JWT signature
4. Fetch user from database
5. Attach `userId` and `user` to request object
6. Call next middleware

**Error Responses:**
- 401: Missing or invalid token
- 500: Authentication error

#### `optionalAuthenticate(req, res, next)`
Optional authentication - doesn't fail if no token provided.

**Process:**
1. Try to extract and verify token
2. If valid, attach user info to request
3. Always call next middleware (even if auth fails)

#### `generateToken(userId, username)`
Generate JWT token with 7-day expiry.

## Utilities

### Logger (`logger.ts`)

Overrides global `console` methods to add timestamps:

- `console.log()` → `[2024-01-01 12:00:00.000] message`
- `console.error()` → `[2024-01-01 12:00:00.000] error message`
- `console.warn()` → `[2024-01-01 12:00:00.000] warning message`
- `console.info()` → `[2024-01-01 12:00:00.000] info message`

Timestamp format: `YYYY-MM-DD HH:mm:ss.SSS`

**Usage:**
Import `./utils/logger` first in `server.ts` to ensure all logs are timestamped.

### Validation (`validation.ts`)

#### `validateASIN(asin)`
Validate Amazon ASIN format.

**Rules:**
- Exactly 10 characters
- Alphanumeric only (A-Z, 0-9)
- Case-insensitive

**Returns:** `true` if valid, `false` otherwise

#### `normalizeASIN(asin)`
Normalize ASIN by trimming whitespace and converting to uppercase.

**Example:**
- `" b08x... "` → `"B08X..."`

## Environment Variables

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `JWT_SECRET` | JWT signing secret | `"your-secret-key-change-in-production"` |

**Important:** Always change `JWT_SECRET` in production!

### Optional

No optional environment variables are currently used.

## Development Workflow

### Setup

```bash
cd backend
npm install
```

### Development

```bash
npm run dev        # Start dev server with hot reload
```

The dev server runs on port 3000 and binds to `0.0.0.0` for Tailscale compatibility.

### Build

```bash
npm run build      # Compile TypeScript to dist/
```

### Production

```bash
npm start          # Run compiled JavaScript from dist/server.js
```

### Watch Mode

```bash
npm run watch      # TypeScript watch mode
```

## Key Implementation Details

### No ORM Pattern

The database layer uses direct SQL queries with the `sqlite3` callback pattern. This provides:

- Full control over SQL queries
- Optimal performance for simple operations
- No additional dependencies
- Explicit transaction handling via `serialize()`

**Trade-off:** More verbose code compared to ORMs

### User Scoping

All data is isolated by user ID through foreign keys and query filters. This ensures:

- Users can only access their own data
- Multi-tenant data isolation
- Cascade deletes on user removal

### Multi-Tenancy Implementation

1. All tables with user data have `user_id` foreign key
2. Unique constraints include `user_id` (e.g., `(user_id, asin)`)
3. All queries filter by `user_id`
4. Authentication middleware enforces access control

### Price Nullable Design

The `price` field in `price_history` is nullable to handle:

- Unavailable products (`price: null`)
- Products with no price information
- Future price tracking scenarios

### Server-Sent Events (SSE)

Two endpoints use SSE for real-time progress:

1. `/api/prices/update` - Price update progress
2. `/api/config/import-asins` - ASIN import progress

**SSE Headers:**
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Event Format:**
```
data: {"status":"processing","progress":45,"current":5,"total":10}
```

### Scraping Strategy

The scraper uses a robust multi-fallback approach:

1. **Cascading selectors**: Try multiple selectors in priority order
2. **Availability check**: Check for unavailable patterns before price extraction
3. **Price extraction**: Multiple methods with font-size prioritization
4. **Category extraction**: Breadcrumb, table, and meta tag fallbacks
5. **Retry logic**: 2 retries with 3-second delays on failure

### Brazilian Price Format

Amazon.com.br uses Brazilian Real (R$) formatting:
- Dot (.) as thousands separator: `1.234,56`
- Comma (,) as decimal separator: `1.234,56` → 1234.56

**Parsing Logic:**
1. Remove all dots (thousands separators)
2. Replace comma with dot (decimal separator)
3. Parse as float

### Scheduler Concurrency Control

The scheduler uses a singleton pattern with `isUpdating` flag:

1. Check `isUpdating` before starting
2. Set `isUpdating = true` on start
3. Set `isUpdating = false` on completion (finally block)
4. Skip if update already in progress

This prevents concurrent price updates that could overwhelm the scraper.

### CORS Configuration

CORS is configured to allow all origins:

```typescript
app.use(cors());
```

**Security Note:** Access control is handled via Tailscale networking rather than CORS restrictions.

### Graceful Shutdown

The server handles SIGTERM and SIGINT signals:

1. Stop scheduler
2. Close database connection
3. Exit process

### Database Path Resolution

The database path is resolved relative to `__dirname`:

```typescript
const DB_PATH = path.resolve(__dirname, '../../../database/products.db');
```

**Important:** This differs between source (`backend/src/services/`) and compiled (`backend/dist/services/`) environments.

### Timestamped Logging

The logger utility overrides global console methods to add timestamps. This is imported first in `server.ts` to ensure all subsequent logs are timestamped.

### ASIN Validation

ASINs are validated before storage:

- Exactly 10 alphanumeric characters
- Stored in uppercase
- Normalized (trimmed) before validation
- Duplicate detection per user (unique constraint on `user_id, asin`)

## Error Handling

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (access denied) |
| 404 | Not found |
| 409 | Conflict (duplicate resource) |
| 500 | Internal server error |

### Error Response Format

```json
{
  "error": "Error message description"
}
```

### Logging Strategy

All errors are logged to console with timestamps via the logger utility. Errors include:

- Stack traces for uncaught errors
- Contextual information (user ID, product ID, ASIN)
- Request/response details for API errors

## Performance Considerations

### Database Optimization

- Indexed all foreign keys and frequently queried columns
- Used `LIMIT` and `OFFSET` for pagination
- Batched category loading with `Promise.all`
- Avoided N+1 queries where possible

### Scraping Optimization

- 2-second delays between requests to avoid rate limiting
- Headless browser mode to reduce resource usage
- Single browser instance reused across requests
- Early exit on unavailable products

### Concurrency Control

- `isUpdating` flag prevents concurrent price updates
- Sequential processing in scheduler (not parallel)
- SSE streams for non-blocking progress updates

## Security Considerations

### Password Security

- bcrypt hashing with 10 salt rounds
- Minimum 6 character password requirement
- Password never logged or returned in API responses

### JWT Security

- 7-day token expiry
- Bearer token authentication
- Secret key configurable via environment
- Token verification on every protected route

### User Isolation

- All queries filtered by `user_id`
- Foreign key constraints enforce data integrity
- Unique constraints include user context

### Input Validation

- ASIN format validation before scraping
- Username/password length requirements
- Parameter type checking (parseInt for IDs)
- SQL injection prevention via parameterized queries

## Testing

No formal test suite is configured. The `test/` directory contains debug utilities for development:

- `debug-price.ts` - Price extraction debugging
- `price-selector-analyzer.ts` - Selector analysis
- `selector-analyzer.ts` - Generic selector debugging

## Deployment

### Build Process

```bash
npm run build
```

This compiles TypeScript to `dist/` directory with the same structure as `src/`.

### Database Setup

The database is automatically created on first run with:

- Automatic directory creation (`database/`)
- Schema initialization
- Migration execution
- Index creation

### Environment Configuration

Set the following environment variables in production:

```bash
PORT=3000
JWT_SECRET=<strong-random-secret>
```

**Important:** Never use the default JWT_SECRET in production!

### Process Management

Use a process manager like PM2 for production:

```bash
pm2 start dist/server.js --name amzscraper-backend
pm2 save
pm2 startup
```

## Troubleshooting

### Database Path Issues

If the database file is not found:
- Check that `database/` directory exists
- Verify `__dirname` resolution in compiled vs source mode
- Ensure write permissions on database directory

### Scraping Failures

Common causes:
- CAPTCHA or rate limiting from Amazon
- Network connectivity issues
- Changed Amazon page structure

**Solutions:**
- Increase delay between requests (scraper.ts:636)
- Check VPN/proxy settings
- Review selector patterns in scraper.ts

### Memory Issues

Large databases or many concurrent requests may cause memory issues:

**Solutions:**
- Implement pagination for large queries
- Increase Node.js memory limit: `NODE_OPTIONS="--max-old-space-size=4096"`
- Consider implementing request rate limiting

## Future Improvements

### Potential Enhancements

1. **Test Suite**: Add Jest or Mocha for automated testing
2. **ORM Migration**: Consider Prisma or TypeORM for better type safety
3. **Queue System**: Implement job queue for concurrent scraping
4. **Caching**: Add Redis cache for frequently accessed products
5. **Rate Limiting**: Add API rate limiting middleware
6. **Monitoring**: Add health checks and metrics endpoints
7. **Docker**: Create Docker container for easy deployment
8. **Webhooks**: Add webhook support for price drop notifications
9. **Multi-Region**: Support for multiple Amazon regional sites
10. **Export Formats**: Add JSON, Excel export options

### Code Quality

1. Add ESLint/Prettier for consistent code style
2. Add TypeScript strict mode enforcement
3. Implement proper error types/classes
4. Add API documentation with Swagger/OpenAPI
5. Add request/response validation schemas

### Performance

1. Implement database connection pooling
2. Add query result caching
3. Optimize scraping with browser contexts
4. Implement parallel scraping for independent ASINs
5. Add database indexing for complex queries

## License

ISC License

## Support

For issues or questions, refer to the main project documentation or create an issue in the project repository.
