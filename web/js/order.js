let allProducts = [];    
let cart = [];           


document.addEventListener('DOMContentLoaded', async () => {
  await loadProductsToSelect();
  await loadOrders();

  document.getElementById('btn-add-item').addEventListener('click', addToCart);
  document.getElementById('btn-submit').addEventListener('click', submitOrder);
  document.getElementById('btn-reload-orders').addEventListener('click', loadOrders);

  document.getElementById('chk-picked').addEventListener('change', loadOrders);
  document.getElementById('chk-canceled').addEventListener('change', loadOrders);
});


async function loadProductsToSelect() {
  try {
    allProducts = await eel.api_list_products()();
    const sel = document.getElementById('product-select');
    sel.innerHTML = '<option value="">-- 請選擇 --</option>';

    for (const p of allProducts) {
      const opt = document.createElement('option');
      opt.value = p.ProductID;
      opt.textContent = `${p.ProductName}（$${p.price}，庫存 ${p.stock}）`;
      sel.appendChild(opt);
    }
  } catch (err) {
    alert('載入商品失敗：' + err);
  }
}


function addToCart() {
  const pid = parseInt(document.getElementById('product-select').value, 10);
  const qty = parseFloat(document.getElementById('qty').value);

  if (!pid)         return alert('請選擇商品');
  if (!qty || qty <= 0) return alert('數量必須大於 0');

  const product = allProducts.find(p => p.ProductID === pid);
  if (!product)     return alert('商品不存在');

  if (qty > product.stock) {
    return alert(`庫存不足（剩 ${product.stock}）`);
  }

  const existing = cart.find(c => c.ProductID === pid);
  if (existing) {
    if (existing.qty + qty > product.stock) {
      return alert(`庫存不足（剩 ${product.stock}）`);
    }
    existing.qty += qty;
  } else {
    cart.push({
      ProductID:   pid,
      ProductName: product.ProductName,
      price:       product.price,
      qty:         qty,
    });
  }

  document.getElementById('qty').value = 1;
  renderCart();
}


function renderCart() {
  const body = document.getElementById('cart-body');
  if (cart.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-row">尚未加入商品</td></tr>';
    document.getElementById('cart-total').textContent = '$0';
    return;
  }

  let total = 0;
  body.innerHTML = cart.map((c, i) => {
    const btotal = Math.floor(c.qty * c.price); 
    total += btotal;
    return `
      <tr>
        <td>${escapeHtml(c.ProductName)}</td>
        <td>$${c.price}</td>
        <td>${c.qty}</td>
        <td>$${btotal}</td>
        <td><button class="danger small" onclick="removeFromCart(${i})">移除</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById('cart-total').textContent = '$' + total;
}


function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}
window.removeFromCart = removeFromCart;


async function submitOrder() {
  const customer = document.getElementById('customer').value.trim();
  const msg = document.getElementById('order-msg');

  if (!customer)    return showMsg('請輸入客戶名稱', 'err');
  if (cart.length === 0) return showMsg('尚未加入任何商品', 'err');

  try {
    const orderId = await eel.api_create_order({
      customer: customer,
      items: cart.map(c => ({ ProductID: c.ProductID, qty: c.qty })),
    })();

    showMsg(`✅ 下單成功！OrderID = ${orderId}`, 'ok');

    document.getElementById('customer').value = '';
    cart = [];
    renderCart();

    await loadProductsToSelect();
    await loadOrders();

  } catch (err) {
    showMsg('❌ ' + (err.message || err), 'err');
  }
}


function showMsg(text, type) {
  const el = document.getElementById('order-msg');
  el.textContent = text;
  el.className = 'msg ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'msg'; }, 4000);
}


async function loadOrders() {
  const listEl = document.getElementById('order-list');
  listEl.innerHTML = '<p>載入中...</p>';

  const includePicked   = document.getElementById('chk-picked').checked;
  const includeCanceled = document.getElementById('chk-canceled').checked;

  try {
    const orders = await eel.api_list_orders(includePicked, includeCanceled)();

    if (!orders || orders.length === 0) {
      listEl.innerHTML = '<p class="empty">目前沒有訂單</p>';
      return;
    }

    listEl.innerHTML = orders.map(renderOrder).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="empty">載入失敗：${err}</p>`;
  }
}


function renderOrder(o) {
  const itemsHtml = o.items.map(it => `
    <tr>
      <td>${escapeHtml(it.ProductName)}</td>
      <td>$${it.unit_price}</td>
      <td>${it.qty}</td>
      <td>$${it.btotal}</td>
    </tr>
  `).join('');

  let actionsHtml = '';
  if (o.status === 0 || o.status === 1) {
    actionsHtml += `<button class="small" onclick="markDone(${o.OrderID})">標記已完成</button>`;
    actionsHtml += `<button class="small" onclick="markPicked(${o.OrderID})">標記已取貨</button>`;
    actionsHtml += `<button class="danger small" onclick="cancelOrder(${o.OrderID})">取消訂單</button>`;
  } else if (o.status === 2) {
    actionsHtml = '<span style="color:#888;font-size:13px;">已取貨</span>';
  } else if (o.status === 3) {
    actionsHtml = '<span style="color:#888;font-size:13px;">已取消</span>';
  }

  return `
    <div class="order-card">
      <div class="head">
        <span class="oid">#${o.OrderID}</span>
        <span>${escapeHtml(o.customer)}</span>
        <span class="status status-${o.status}">${o.status_text}</span>
        <span class="time">${o.created_at}</span>
        <span class="total">$${o.total_price}</span>
      </div>
      <div class="body">
        <table>
          <thead>
            <tr><th>商品</th><th>單價</th><th>數量</th><th>小計</th></tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
      <div class="actions">${actionsHtml}</div>
    </div>
  `;
}


async function markDone(orderId) {
  try {
    await eel.api_update_order_status(orderId, 1)();
    await loadOrders();
  } catch (err) { alert('操作失敗：' + err); }
}

async function markPicked(orderId) {
  try {
    await eel.api_update_order_status(orderId, 2)();
    await loadOrders();
  } catch (err) { alert('操作失敗：' + err); }
}

async function cancelOrder(orderId) {
  if (!confirm(`確定要取消訂單 #${orderId}？`)) return;
  try {
    await eel.api_cancel_order(orderId)();
    await loadOrders();
  } catch (err) { alert('取消失敗：' + err); }
}

window.markDone     = markDone;
window.markPicked   = markPicked;
window.cancelOrder  = cancelOrder;


function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}