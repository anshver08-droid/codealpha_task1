// ---------- State ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const money = n => '$' + Number(n).toFixed(2);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  get cart() { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } },
  set cart(c) { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); },
  login(data) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); },
  logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && store.token) { store.logout(); renderNav(); }
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

// ---------- Cart ----------
function addToCart(p, qty = 1) {
  const cart = store.cart;
  const line = cart.find(i => i.id === p.id);
  const next = Math.min((line ? line.quantity : 0) + qty, p.stock);
  if (line) line.quantity = next; else cart.push({ id: p.id, name: p.name, price: p.price, emoji: p.emoji, stock: p.stock, quantity: next });
  store.cart = cart;
  toast(`Added ${p.name} to your cart`);
}

// ---------- Nav ----------
function renderNav() {
  const count = store.cart.reduce((n, i) => n + i.quantity, 0);
  const u = store.user;
  $('#nav').innerHTML = `
    <a href="#/">Shop</a>
    <a href="#/cart" class="cartpill">Cart<span class="badge">${count}</span></a>
    ${u ? `<a href="#/orders">My orders</a><a href="#/" id="logout">Log out (${esc(u.name)})</a>`
        : `<a href="#/login">Log in</a><a href="#/register">Create account</a>`}`;
  const lo = $('#logout');
  if (lo) lo.onclick = () => { store.logout(); renderNav(); toast('Logged out'); };
}

// ---------- Views ----------
const tileTag = p => p.stock < 1 ? '<em class="tag">Sold out</em>' : p.stock < 6 ? '<em class="tag">Low stock</em>' : '';

async function homeView() {
  app.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <span class="chip">New season edit</span>
        <h1>Modern essentials for everyday living.</h1>
        <p>Coffee gear, carry-alls, plants and desk basics. A small range, chosen with care.</p>
        <div class="row"><button class="btn light" id="shopnow">Shop now</button><a class="btn outline" href="#/register">Create account</a></div>
      </div>
      <div class="hero-art" aria-hidden="true"><span>☕</span><span>👜</span><span>🪴</span><span>🎧</span></div>
    </section>
    <section class="perks">
      <div><b>Simple checkout</b><span>Three steps, no clutter</span></div>
      <div><b>Live stock counts</b><span>See what is left before you buy</span></div>
      <div><b>Order history</b><span>Every purchase, in one place</span></div>
    </section>
    <section id="shop">
      <div class="head"><h2>Shop the collection</h2>
        <input class="search" id="q" placeholder="Search products" aria-label="Search products"></div>
      <div class="grid" id="grid"></div>
    </section>`;
  $('#shopnow').onclick = () => $('#shop').scrollIntoView({ behavior: 'smooth' });
  const load = async q => {
    const products = await api('/products?q=' + encodeURIComponent(q || ''));
    $('#grid').innerHTML = products.length ? products.map(p => `
      <article class="card">
        <a class="tile" href="#/product/${p.id}" aria-label="${esc(p.name)}"><span>${esc(p.emoji)}</span>${tileTag(p)}</a>
        <div class="meta">
          <div><h3>${esc(p.name)}</h3><p class="price">${money(p.price)}</p></div>
          <button class="add" data-id="${p.id}" ${p.stock < 1 ? 'disabled' : ''} aria-label="Add ${esc(p.name)} to cart">+</button>
        </div>
      </article>`).join('') : '<p class="muted">No products match your search. Try a different word.</p>';
    $('#grid').querySelectorAll('button[data-id]').forEach(b =>
      b.onclick = () => addToCart(products.find(p => p.id == b.dataset.id)));
  };
  let timer;
  $('#q').oninput = e => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value), 250); };
  await load();
}

async function productView(id) {
  const p = await api('/products/' + id);
  app.innerHTML = `
    <p class="crumb"><a href="#/">Shop</a> / ${esc(p.name)}</p>
    <div class="detail">
      <div class="tile big"><span>${esc(p.emoji)}</span>${tileTag(p)}</div>
      <div class="info">
        <h1>${esc(p.name)}</h1>
        <p class="price xl">${money(p.price)}</p>
        <p class="lead">${esc(p.description)}</p>
        <p class="muted">${p.stock > 0 ? p.stock + ' in stock' : 'Sold out'}</p>
        <div class="stepper" aria-label="Quantity">
          <button type="button" id="minus" aria-label="Decrease">−</button>
          <input id="qty" type="number" min="1" max="${p.stock}" value="1" aria-label="Quantity">
          <button type="button" id="plus" aria-label="Increase">+</button>
        </div>
        <button class="btn dark wide" id="add" ${p.stock < 1 ? 'disabled' : ''}>Add to cart</button>
      </div>
    </div>`;
  const clamp = () => Math.max(1, Math.min(parseInt($('#qty').value, 10) || 1, p.stock));
  $('#minus').onclick = () => { $('#qty').value = Math.max(1, clamp() - 1); };
  $('#plus').onclick = () => { $('#qty').value = Math.min(p.stock, clamp() + 1); };
  $('#add').onclick = () => addToCart(p, clamp());
}

function cartView() {
  const cart = store.cart;
  if (!cart.length) { app.innerHTML = `<div class="page"><h1>Your cart</h1><p class="muted">Your cart is empty.</p><a class="btn dark" href="#/">Browse products</a></div>`; return; }
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  app.innerHTML = `
    <div class="page"><h1>Your cart</h1>
    <div class="cart-layout">
      <div class="lines">${cart.map(i => `
        <div class="line">
          <div class="mini">${esc(i.emoji)}</div>
          <div class="grow"><b>${esc(i.name)}</b><div class="muted">${money(i.price)} each</div>
            <button class="link" data-rm="${i.id}">Remove</button></div>
          <input class="qty" type="number" min="1" max="${i.stock}" value="${i.quantity}" data-id="${i.id}" aria-label="Quantity for ${esc(i.name)}">
          <b class="sub">${money(i.price * i.quantity)}</b>
        </div>`).join('')}
      </div>
      <aside class="panel"><h2>Order summary</h2>
        <div class="sumrow"><span>Items</span><span>${cart.reduce((n, i) => n + i.quantity, 0)}</span></div>
        <div class="sumrow total"><span>Total</span><span>${money(total)}</span></div>
        <a class="btn light wide" href="#/checkout">Go to checkout</a>
      </aside>
    </div></div>`;
  app.querySelectorAll('input[data-id]').forEach(inp => inp.onchange = () => {
    const c = store.cart, line = c.find(i => i.id == inp.dataset.id);
    line.quantity = Math.max(1, Math.min(parseInt(inp.value, 10) || 1, line.stock));
    store.cart = c; cartView();
  });
  app.querySelectorAll('button[data-rm]').forEach(b => b.onclick = () => {
    store.cart = store.cart.filter(i => i.id != b.dataset.rm); cartView();
  });
}

function checkoutView() {
  if (!store.user) { toast('Log in to check out'); location.hash = '#/login'; return; }
  const cart = store.cart;
  if (!cart.length) { location.hash = '#/cart'; return; }
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  app.innerHTML = `
    <div class="page"><h1>Checkout</h1>
    <div class="cart-layout">
      <div class="form-card">
        <label for="addr">Shipping address</label>
        <textarea id="addr" rows="4" placeholder="Name, street, city, postcode"></textarea>
        <p class="muted">Demo store: no real payment is taken.</p>
        <button class="btn dark wide" id="place">Place order</button>
        <p class="error" id="err"></p>
      </div>
      <aside class="panel"><h2>Your items</h2>
        ${cart.map(i => `<div class="sumrow"><span>${esc(i.emoji)} ${esc(i.name)} × ${i.quantity}</span><span>${money(i.price * i.quantity)}</span></div>`).join('')}
        <div class="sumrow total"><span>Total</span><span>${money(total)}</span></div>
      </aside>
    </div></div>`;
  $('#place').onclick = async () => {
    $('#place').disabled = true;
    try {
      const r = await api('/orders', { method: 'POST', body: { address: $('#addr').value, items: cart.map(i => ({ id: i.id, quantity: i.quantity })) } });
      store.cart = [];
      app.innerHTML = `<div class="page"><h1>Order placed</h1><p class="lead">Thanks! Order #${r.id} for ${money(r.total)} is confirmed.</p><a class="btn dark" href="#/orders">View my orders</a></div>`;
    } catch (e) { $('#err').textContent = e.message; $('#place').disabled = false; }
  };
}

function authView(mode) {
  const reg = mode === 'register';
  app.innerHTML = `
    <div class="auth">
      <div class="auth-side"><h2>${reg ? 'Join Corner Shop' : 'Welcome back'}</h2>
        <p>${reg ? 'Save your orders and check out faster.' : 'Log in to check out and see your past orders.'}</p></div>
      <div class="form-card">
        <h1>${reg ? 'Create account' : 'Log in'}</h1>
        ${reg ? '<label for="name">Name</label><input id="name" autocomplete="name">' : ''}
        <label for="email">Email</label><input id="email" type="email" autocomplete="email">
        <label for="pw">Password</label><input id="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}">
        <button class="btn dark wide" id="go">${reg ? 'Create account' : 'Log in'}</button>
        <p class="error" id="err"></p>
        <p class="muted">${reg ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p>
      </div>
    </div>`;
  const submit = async () => {
    try {
      const body = { email: $('#email').value, password: $('#pw').value };
      if (reg) body.name = $('#name').value;
      store.login(await api(reg ? '/register' : '/login', { method: 'POST', body }));
      renderNav(); toast('Welcome!');
      location.hash = store.cart.length ? '#/checkout' : '#/';
    } catch (e) { $('#err').textContent = e.message; }
  };
  $('#go').onclick = submit;
  app.querySelectorAll('input').forEach(i => i.onkeydown = e => e.key === 'Enter' && submit());
}

async function ordersView() {
  if (!store.user) { location.hash = '#/login'; return; }
  const orders = await api('/orders');
  app.innerHTML = `<div class="page"><h1>My orders</h1>` + (orders.length ? orders.map(o => `
    <div class="order">
      <header><span>Order #${o.id}</span><span>${money(o.total)}</span></header>
      <p class="muted">${new Date(o.created_at + 'Z').toLocaleString()} · Ship to: ${esc(o.address)}</p>
      <ul>${o.items.map(i => `<li>${esc(i.emoji)} ${esc(i.name)} × ${i.quantity} (${money(i.price)} each)</li>`).join('')}</ul>
    </div>`).join('') : '<p class="muted">You have not placed any orders yet.</p>') + '</div>';
}

// ---------- Router ----------
async function route() {
  const [, page, id] = (location.hash || '#/').split('/');
  window.scrollTo(0, 0);
  try {
    if (!page) await homeView();
    else if (page === 'product') await productView(id);
    else if (page === 'cart') cartView();
    else if (page === 'checkout') checkoutView();
    else if (page === 'login') authView('login');
    else if (page === 'register') authView('register');
    else if (page === 'orders') await ordersView();
    else app.innerHTML = '<h1>Page not found</h1><a href="#/">Back to shop</a>';
  } catch (e) {
    app.innerHTML = `<h1>Something went wrong</h1><p class="error">${esc(e.message)}</p><a href="#/">Back to shop</a>`;
  }
}
window.addEventListener('hashchange', route);
renderNav();
route();
