import { useEffect, useMemo, useState } from 'react';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  register, login, getMe, logout,
} from './api';
import './App.css';

const money = value =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);

const emptyForm = {
  name: '',
  sku: '',
  category: 'Electronics',
  price: '',
  stock: '',
  icon: '📦',
};


function OrbitalBackdrop() {
  useEffect(() => {
    const root = document.documentElement;
    const move = event => {
      root.style.setProperty('--pointer-x', `${event.clientX}px`);
      root.style.setProperty('--pointer-y', `${event.clientY}px`);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  return (
    <div className="orbital-backdrop" aria-hidden="true">
      <div className="orbital-nebula nebula-one" />
      <div className="orbital-nebula nebula-two" />
      <div className="orbital-starfield" />
      <div className="orbital-system">
        <div className="orbit orbit-one"><span className="orbiting-planet planet-cyan"><i /></span></div>
        <div className="orbit orbit-two"><span className="orbiting-planet planet-violet"><i /></span></div>
        <div className="orbit orbit-three"><span className="orbiting-planet planet-ringed"><i /></span></div>
        <div className="orbit orbit-four"><span className="orbiting-planet planet-moon"><i /></span></div>
        <div className="orbital-sun"><span /></div>
      </div>
      <div className="orbital-cursor-glow" />
    </div>
  );
}

function InventoryApp({ user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('Overview');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const categories = ['All', 'Electronics', 'Accessories', 'Home'];

  useEffect(() => {
    let active = true;

    getProducts()
      .then(data => {
        if (!active) return;
        setProducts(data);
        setApiConnected(true);
      })
      .catch(error => {
        console.error('Could not load products:', error);
        if (active) {
          setApiConnected(false);
          setNotice('Could not connect to the backend. Make sure node server.js is running.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => products.filter(product => {
    const matchesSearch = `${product.name} ${product.sku}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory = category === 'All' || product.category === category;
    const matchesPage = page !== 'Low Stock' || product.stock <= 10;
    return matchesSearch && matchesCategory && matchesPage;
  }), [products, search, category, page]);

  const totalUnits = products.reduce((sum, product) => sum + product.stock, 0);
  const inventoryValue = products.reduce((sum, product) => sum + product.price * product.stock, 0);
  const lowStock = products.filter(product => product.stock > 0 && product.stock <= 10).length;
  const outOfStock = products.filter(product => product.stock === 0).length;

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(product) {
    setEditing(product.id);
    setForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
      icon: product.icon || '📦',
    });
    setShowForm(true);
  }

  async function saveProduct(event) {
    event.preventDefault();

    const name = form.name.trim();
    const sku = form.sku.trim();
    const price = Number(form.price);
    const stock = Number(form.stock);

    if (!name || !sku || form.price === '' || form.stock === '' ||
        !Number.isFinite(price) || price < 0 ||
        !Number.isInteger(stock) || stock < 0) {
      setNotice('Enter a name, SKU, valid price, and whole-number stock quantity.');
      return;
    }

    const duplicate = products.some(product =>
      product.sku.toLowerCase() === sku.toLowerCase() && product.id !== editing
    );
    if (duplicate) {
      setNotice('That SKU already exists. Choose a unique SKU.');
      return;
    }

    const payload = {
      name,
      sku,
      category: form.category,
      price,
      stock,
      icon: form.icon.trim() || '📦',
    };

    setBusy(true);
    try {
      if (editing !== null) {
        const updated = await updateProduct(editing, payload);
        setProducts(current => current.map(product =>
          product.id === editing ? updated : product
        ));
        setNotice('Product updated successfully.');
      } else {
        const created = await createProduct(payload);
        setProducts(current => [created, ...current]);
        setNotice('Product added successfully.');
      }
      setApiConnected(true);
      setShowForm(false);
    } catch (error) {
      setNotice(error.message || 'Could not save the product.');
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(product) {
    if (!window.confirm(`Delete "${product.name}" from your inventory?`)) return;

    try {
      await deleteProduct(product.id);
      setProducts(current => current.filter(item => item.id !== product.id));
      setNotice('Product deleted successfully.');
    } catch (error) {
      setNotice(error.message || 'Could not delete the product.');
    }
  }

  async function changeStock(product, amount) {
    const nextStock = Math.max(0, product.stock + amount);
    if (nextStock === product.stock) {
      setNotice('Stock cannot go below zero.');
      return;
    }

    try {
      const updated = await updateProduct(product.id, {
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        stock: nextStock,
        icon: product.icon || '📦',
      });
      setProducts(current => current.map(item => item.id === product.id ? updated : item));
      setNotice(`${product.name}: stock is now ${updated.stock}.`);
    } catch (error) {
      setNotice(error.message || 'Could not update stock.');
    }
  }

  function exportCSV() {
    const rows = [
      ['Name', 'SKU', 'Category', 'Price (INR)', 'Stock', 'Inventory Value'],
      ...products.map(product => [
        product.name, product.sku, product.category,
        product.price, product.stock, product.price * product.stock,
      ]),
    ];
    const csv = rows.map(row =>
      row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventory-report.csv';
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Inventory CSV exported.');
  }

  const navItems = [
    { name: 'Overview', icon: '◫' },
    { name: 'Products', icon: '▤' },
    { name: 'Low Stock', icon: '⚠', count: lowStock + outOfStock },
    { name: 'Analytics', icon: '▥' },
  ];

  return (
    <div className="app-shell">
      <OrbitalBackdrop />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div><strong>NEXSTOCK</strong><span>INVENTORY OS</span></div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace"><span className="workspace-dot" /> Main Warehouse <span className="chevron">⌄</span></div>
        <div className="nex-user"><span className="nex-avatar">{(user?.email || 'U')[0].toUpperCase()}</span><span className="nex-user-email">{user?.email}</span><button onClick={onLogout} title="Log out">↗</button></div>

        <div className="nav-label">MENU</div>
        <nav>
          {navItems.map(item => (
            <button key={item.name}
              className={`nav-item ${page === item.name ? 'active' : ''}`}
              onClick={() => { setPage(item.name); setSearch(''); setCategory('All'); }}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {item.count > 0 && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-orb">✦</div>
            <strong>Your inventory, upgraded.</strong>
            <p>One clear view of every product, every movement.</p>
            <button onClick={() => { setPage('Analytics'); setNotice('Explore your inventory analytics.'); }}>
              Explore analytics ↗
            </button>
          </div>
          <div className="profile">
            <div className="avatar">IM</div>
            <div className="profile-info"><strong>Inventory Admin</strong><span>Administrator</span></div>
            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-right">
            <span className="live-indicator">
              <i /> {loading ? 'CONNECTING...' : apiConnected ? 'API CONNECTED' : 'API OFFLINE'}
            </span>
            <button className="icon-button" title="Low stock alerts"
              onClick={() => setPage('Low Stock')}>♧{lowStock + outOfStock > 0 && <b />}</button>
            <div className="top-avatar">IM</div>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="sparkle">✳</span> YOUR COMMAND CENTER</div>
              <h1>{page === 'Overview' ? <>Inventory, <span>in focus.</span></> : page}</h1>
              <p className="page-subtitle">
                {page === 'Overview' && 'Everything in stock. Everything in control.'}
                {page === 'Products' && 'Manage your products, your way.'}
                {page === 'Low Stock' && 'Catch stock shortages before they catch you.'}
                {page === 'Analytics' && 'Turn your inventory into actionable insights.'}
              </p>
            </div>
            <div className="welcome-actions">
              <button className="secondary-button" onClick={exportCSV}>↓ <span>Export CSV</span></button>
              <button className="primary-button" onClick={openAdd}><span>＋</span> Add product</button>
            </div>
          </section>

          {!apiConnected && !loading && (
            <div className="insight-box connection-warning">
              <span>⚠</span>
              <div><strong>Backend is offline</strong><p>Start the backend in the VS Code terminal with <code>node server.js</code>, then refresh this page.</p></div>
            </div>
          )}

          <section className="stat-grid">
            <article className="stat-card">
              <div className="stat-top"><span>Total products</span><span className="stat-icon purple">▤</span></div>
              <div className="stat-number">{products.length.toLocaleString('en-IN')}</div>
              <div className="stat-bottom"><span className="trend">↗ Live</span><span>unique SKUs</span></div>
              <div className="stat-decoration decoration-purple" />
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Units in stock</span><span className="stat-icon cyan">▦</span></div>
              <div className="stat-number">{totalUnits.toLocaleString('en-IN')}</div>
              <div className="stat-bottom"><span className="trend">● Current</span><span>across all products</span></div>
              <div className="stat-decoration decoration-cyan" />
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Inventory value</span><span className="stat-icon green">₹</span></div>
              <div className="stat-number money-number">{money(inventoryValue)}</div>
              <div className="stat-bottom"><span className="trend">↗ Estimated</span><span>at listed prices</span></div>
              <div className="stat-decoration decoration-green" />
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Stock alerts</span><span className="stat-icon orange">⚠</span></div>
              <div className="stat-number">{lowStock + outOfStock}</div>
              <div className="stat-bottom"><span className={lowStock + outOfStock ? 'warning-text' : 'trend'}>{outOfStock} out of stock</span><span>need attention</span></div>
              <div className="stat-decoration decoration-orange" />
            </article>
          </section>

          {page === 'Analytics' ? (
            <section className="panel analytics-panel">
              <div className="panel-heading"><div><h2>Category breakdown</h2><p>Current stock distribution</p></div><span className="panel-badge">LIVE INVENTORY DATA</span></div>
              <div className="analytics-list">
                {categories.filter(item => item !== 'All').map((item, index) => {
                  const categoryProducts = products.filter(product => product.category === item);
                  const units = categoryProducts.reduce((sum, product) => sum + product.stock, 0);
                  const total = totalUnits || 1;
                  return <div className="analytics-row" key={item}>
                    <div className="analytics-label"><span className={`category-dot dot-${index}`} />{item}<span>{categoryProducts.length} products</span></div>
                    <div className="progress-track"><div className={`progress-fill fill-${index}`} style={{ width: `${units / total * 100}%` }} /></div>
                    <strong>{units} units</strong>
                  </div>;
                })}
              </div>
              <div className="insight-box"><span>✦</span><div><strong>Inventory insight</strong><p>{lowStock + outOfStock ? `${lowStock + outOfStock} products have 10 or fewer units. Review Low Stock to plan replenishment.` : 'All products are above the low-stock threshold.'}</p></div></div>
            </section>
          ) : (
            <section className="panel">
              <div className="panel-heading">
                <div><h2>{page === 'Overview' ? 'Inventory overview' : page === 'Low Stock' ? 'Stock requiring attention' : 'Product catalogue'}</h2>
                  <p>{page === 'Overview' ? 'Your products at a glance.' : 'Search, filter, and manage your inventory.'}</p></div>
                <span className="panel-badge"><i /> {filtered.length} RECORDS</span>
              </div>

              <div className="toolbar">
                <div className="search-box"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or SKU..." /></div>
                <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filter category">
                  {categories.map(item => <option key={item}>{item}</option>)}
                </select>
                <button className="filter-button" onClick={() => { setSearch(''); setCategory('All'); }}>↺ Reset</button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>UNIT PRICE</th><th>STOCK LEVEL</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {filtered.map(product => {
                      const status = product.stock === 0 ? 'Out of stock' : product.stock <= 10 ? 'Low stock' : 'In stock';
                      return <tr key={product.id}>
                        <td><div className="product-cell"><div className="product-icon">{product.icon || '📦'}</div><strong>{product.name}</strong></div></td>
                        <td><span className="sku">{product.sku}</span></td>
                        <td><span className="category-pill">{product.category}</span></td>
                        <td className="price-cell">{money(product.price)}</td>
                        <td><div className="stock-cell"><strong>{product.stock}</strong><div className="mini-track"><span className={product.stock <= 10 ? 'mini-low' : ''} style={{ width: `${Math.min(product.stock / 50 * 100, 100)}%` }} /></div></div></td>
                        <td><span className={`status status-${product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'good'}`}><i />{status}</span></td>
                        <td><div className="action-group"><button title="Decrease stock" onClick={() => changeStock(product, -1)}>−</button><button title="Increase stock" onClick={() => changeStock(product, 1)}>＋</button><button title="Edit product" onClick={() => openEdit(product)}>✎</button><button title="Delete product" onClick={() => removeProduct(product)}>×</button></div></td>
                      </tr>;
                    })}
                    {loading && <tr><td colSpan="7"><div className="empty-state"><strong>Loading inventory…</strong><p>Connecting to your backend.</p></div></td></tr>}
                    {!loading && filtered.length === 0 && <tr><td colSpan="7"><div className="empty-state"><span>⌕</span><strong>No products found</strong><p>Try a different search or add a new product.</p><button className="primary-button" onClick={openAdd}>＋ Add product</button></div></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="table-footer"><span>Showing <strong>{filtered.length}</strong> of <strong>{products.length}</strong> products</span><span>INR ₹ <span className="footer-separator">•</span> {apiConnected ? 'Connected API' : 'Offline'}</span></div>
            </section>
          )}

          <footer className="footer"><span>✳ NEXSTOCK <span className="footer-muted">INVENTORY MANAGEMENT SYSTEM</span></span><span>Built for better stock decisions <span className="footer-spark">✦</span></span></footer>
        </div>
      </main>

      {notice && <div className="toast"><span>✓</span>{notice}</div>}

      {showForm && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) setShowForm(false); }}>
        <form className="product-modal" onSubmit={saveProduct}>
          <div className="modal-heading"><div><span className="eyebrow">INVENTORY CONTROL</span><h2>{editing !== null ? 'Edit product' : 'Add a product'}</h2><p>Give your inventory a new entry.</p></div><button type="button" className="modal-close" onClick={() => setShowForm(false)} disabled={busy}>×</button></div>
          <label>Product name<input required maxLength="80" placeholder="e.g. Wireless Mouse" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <div className="form-row"><label>SKU / product code<input required maxLength="30" placeholder="e.g. EL-1004" value={form.sku} onChange={event => setForm({ ...form, sku: event.target.value })} /></label><label>Category<select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{categories.filter(item => item !== 'All').map(item => <option key={item}>{item}</option>)}</select></label></div>
          <div className="form-row"><label>Unit price (₹)<input required type="number" min="0" step="0.01" placeholder="999" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label><label>Opening stock<input required type="number" min="0" step="1" placeholder="25" value={form.stock} onChange={event => setForm({ ...form, stock: event.target.value })} /></label></div>
          <label>Product emoji<input maxLength="8" value={form.icon} onChange={event => setForm({ ...form, icon: event.target.value })} /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing !== null ? 'Save changes' : '＋ Create product'}</button></div>
        </form>
      </div>}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('nexstock_token')) { setChecking(false); return; }
    getMe().then(data => setUser(data.user)).catch(() => localStorage.removeItem('nexstock_token')).finally(() => setChecking(false));
  }, []);
  async function submit(e) {
    e.preventDefault(); setError('');
    if (mode === 'register' && password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setWorking(true);
    try { const data = mode === 'login' ? await login(email,password) : await register(fullName,email,password); localStorage.setItem('nexstock_token',data.token); setUser(data.user); }
    catch (err) { setError(err.message || 'Authentication failed.'); }
    finally { setWorking(false); }
  }
  async function signOut() { try { await logout(); } catch {} localStorage.removeItem('nexstock_token'); setUser(null); setPassword(''); }
  if (checking) return <div className="auth-screen"><div className="auth-card"><div className="auth-logo">N</div><h1>NEXSTOCK</h1><p>SECURE INVENTORY WORKSPACE</p></div></div>;
  if (!user) return <div className="auth-screen"><div className="auth-orbit auth-orbit-a"/><div className="auth-orbit auth-orbit-b"/><form className="auth-card" onSubmit={submit}>
    <div className="auth-logo">N</div><div className="auth-kicker">INVENTORY OPERATIONS</div><h1>{mode === 'login' ? 'Welcome back.' : 'Create your workspace.'}</h1><p className="auth-subtitle">{mode === 'login' ? 'Sign in to access your inventory.' : 'Set up your secure NEXSTOCK account.'}</p>
    {mode === 'register' && <><label htmlFor="auth-name">Full name</label><input id="auth-name" type="text" autoComplete="name" placeholder="Your full name" value={fullName} onChange={e=>setFullName(e.target.value)} minLength={2} required /></>}
    <label htmlFor="auth-email">Email address</label><input id="auth-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)} required />
    <label htmlFor="auth-password">Password</label><input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} value={password} onChange={e=>setPassword(e.target.value)} minLength={mode === 'login' ? 1 : 8} required />
    {mode === 'register' && <><label htmlFor="auth-confirm-password">Confirm password</label><input id="auth-confirm-password" type="password" autoComplete="new-password" placeholder="Re-enter your password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} required /></>}
    {error && <div className="auth-error">{error}</div>}<button className="auth-submit" type="submit" disabled={working}>{working ? 'Please wait…' : mode === 'login' ? 'Sign in securely  →' : 'Create account  →'}</button>
    <div className="auth-switch">{mode === 'login' ? 'New to NEXSTOCK?' : 'Already have an account?'} <button type="button" onClick={()=>{setMode(mode==='login'?'register':'login');setError('');setPassword('');setConfirmPassword('');}}>{mode==='login'?'Create account':'Sign in'}</button></div><div className="auth-security"><span/> PASSWORDS ARE SECURELY HASHED · PRIVATE WORKSPACE</div>
  </form></div>;
  return <InventoryApp user={user} onLogout={signOut} />;
}

export default App;
