import { useEffect, useMemo, useState } from 'react';
import { getProducts, createProduct, updateProduct, deleteProduct, register, login, getMe, logout } from './api';
import './App.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
const emptyForm = { name: '', sku: '', category: 'Groceries', price: '', stock: '', icon: '📦' };
const defaultCategories = ['Groceries', 'Beverages', 'Snacks', 'Household', 'Personal Care', 'Other'];

function InventoryApp({ user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('Dashboard');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => ['All', ...new Set([...defaultCategories, ...products.map(p => p.category).filter(Boolean)])], [products]);

  useEffect(() => {
    let active = true;
    getProducts().then(data => { if (active) { setProducts(data); setApiConnected(true); } })
      .catch(error => { console.error('Could not load products:', error); if (active) { setApiConnected(false); setNotice('Could not connect. Check your internet connection and try refreshing.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => products.filter(product => {
    const matchesSearch = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'All' || product.category === category;
    const matchesPage = page !== 'Low Stock' || product.stock <= 10;
    return matchesSearch && matchesCategory && matchesPage;
  }), [products, search, category, page]);

  const totalUnits = products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const inventoryValue = products.reduce((sum, product) => sum + Number(product.price || 0) * Number(product.stock || 0), 0);
  const lowStockProducts = products.filter(product => Number(product.stock) > 0 && Number(product.stock) <= 10);
  const outOfStockProducts = products.filter(product => Number(product.stock) === 0);
  const attentionCount = lowStockProducts.length + outOfStockProducts.length;
  const recentProducts = [...products].slice(0, 5);

  function openAdd() { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); }
  function openEdit(product) {
    setEditing(product.id);
    setForm({ name: product.name, sku: product.sku, category: product.category, price: String(product.price), stock: String(product.stock), icon: product.icon || '📦' });
    setShowForm(true);
  }
  async function saveProduct(event) {
    event.preventDefault();
    const name = form.name.trim(); const sku = form.sku.trim(); const price = Number(form.price); const stock = Number(form.stock);
    if (!name || !sku || form.price === '' || form.stock === '' || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      setNotice('Enter a product name, code, valid price and whole-number quantity.'); return;
    }
    if (products.some(p => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== editing)) { setNotice('That product code already exists. Please use a different one.'); return; }
    const payload = { name, sku, category: form.category, price, stock, icon: form.icon.trim() || '📦' };
    setBusy(true);
    try {
      if (editing !== null) {
        const updated = await updateProduct(editing, payload);
        setProducts(current => current.map(p => p.id === editing ? updated : p)); setNotice('Product updated.');
      } else {
        const created = await createProduct(payload); setProducts(current => [created, ...current]); setNotice('Product added.');
      }
      setApiConnected(true); setShowForm(false);
    } catch (error) { setNotice(error.message || 'Could not save the product.'); }
    finally { setBusy(false); }
  }
  async function removeProduct(product) {
    if (!window.confirm(`Delete ${product.name} from your stock?`)) return;
    try { await deleteProduct(product.id); setProducts(current => current.filter(p => p.id !== product.id)); setNotice('Product deleted.'); }
    catch (error) { setNotice(error.message || 'Could not delete the product.'); }
  }
  async function changeStock(product, amount) {
    const nextStock = Math.max(0, Number(product.stock) + amount);
    if (nextStock === Number(product.stock)) { setNotice('Stock cannot go below zero.'); return; }
    try {
      const updated = await updateProduct(product.id, { name: product.name, sku: product.sku, category: product.category, price: product.price, stock: nextStock, icon: product.icon || '📦' });
      setProducts(current => current.map(p => p.id === product.id ? updated : p)); setNotice(`${product.name}: quantity is now ${updated.stock}.`);
    } catch (error) { setNotice(error.message || 'Could not update stock.'); }
  }
  function exportCSV() {
    const rows = [['Product', 'Code', 'Category', 'Price (INR)', 'Quantity', 'Stock Value'], ...products.map(p => [p.name, p.sku, p.category, p.price, p.stock, p.price * p.stock])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = 'stockease-inventory.csv'; link.click(); URL.revokeObjectURL(url); setNotice('Stock list downloaded.');
  }
