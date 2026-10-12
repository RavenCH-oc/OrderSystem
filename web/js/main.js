async function loadProducts() {
  const listEl = document.getElementById('product-list');
  const emptyEl = document.getElementById('empty-msg');

  listEl.innerHTML = '<p>載入中...</p>';
  emptyEl.style.display = 'none';

  try {
    const products = await eel.api_list_products()();   // ← 不傳參數

    if (!products || products.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.innerHTML = products.map(renderCard).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="empty">載入失敗：${err}</p>`;
  }
}


function renderCard(p) {
  const imgHtml = p.img
    ? `<img src="${escapeHtml(p.img)}" alt="${escapeHtml(p.ProductName)}"
            onerror="this.outerHTML='<div class=\\'no-img\\'>無圖片</div>'">`
    : `<div class="no-img">無圖片</div>`;

  let stockClass = '';
  if (p.stock <= 0)        stockClass = 'out';
  else if (p.stock < 5)    stockClass = 'low';

  return `
    <div class="product-card">
      ${imgHtml}
      <div class="name">${escapeHtml(p.ProductName)}</div>
      <div class="price">$${p.price}</div>
      <div class="stock ${stockClass}">庫存 ${p.stock}</div>
    </div>
  `;
}


function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


document.addEventListener('DOMContentLoaded', () => {
  loadProducts();

  document.getElementById('btn-reload').addEventListener('click', () => {
    loadProducts();
  });
});