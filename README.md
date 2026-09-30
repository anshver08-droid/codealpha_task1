<<<<<<< HEAD
# Corner Shop: Simple E-commerce Store

Express.js + SQLite backend, vanilla HTML/CSS/JS single-page frontend.

## Run it

```bash
cd ecommerce-store
npm install
npm start
```

Open http://localhost:3000. The database (`store.db`) and 8 sample products are created on first run.

Set `JWT_SECRET` and `PORT` as environment variables for real use.

## Structure

```
ecommerce-store/
├── package.json
├── server.js          API, database, auth, orders
└── public/
    ├── index.html     page shell
    ├── style.css
    └── app.js         router, cart, login, checkout
```

## Features

- Product listing with search
- Product details page (`#/product/1`)
- Shopping cart (saved in the browser, quantity edit and remove)
- Registration and login (bcrypt password hashes, JWT sessions)
- Checkout and order processing: prices and stock are checked on the server, stock is reduced in a transaction
- Order history per user
- SQLite tables: `users`, `products`, `orders`, `order_items`

## API

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /api/register | no | Create account |
| POST | /api/login | no | Log in |
| GET | /api/products?q= | no | List or search products |
| GET | /api/products/:id | no | Product details |
| POST | /api/orders | yes | Place order `{items:[{id,quantity}], address}` |
| GET | /api/orders | yes | Current user's orders |

## Next steps

Real payments (Stripe), an admin page for products, HTTPS and rate limiting before going live.
=======
# codealpha_task1
>>>>>>> 4415d90f7badae5be13e8479afcebea759617d4d
