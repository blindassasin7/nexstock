const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api';
const token = () => localStorage.getItem('nexstock_token');
async function request(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers };
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'Request failed.');
  return data;
}
export async function register(name,email,password){return request('/auth/register',{method:'POST',body:JSON.stringify({name,email,password})});}
export async function login(email,password){return request('/auth/login',{method:'POST',body:JSON.stringify({email,password})});}
export async function getMe(){return request('/auth/me');}
export async function logout(){return request('/auth/logout',{method:'POST'});}
export async function getProducts(){return request('/products');}
export async function createProduct(product){return request('/products',{method:'POST',body:JSON.stringify(product)});}
export async function updateProduct(id,product){return request(`/products/${id}`,{method:'PUT',body:JSON.stringify(product)});}
export async function deleteProduct(id){return request(`/products/${id}`,{method:'DELETE'});}
