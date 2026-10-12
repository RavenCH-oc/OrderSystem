let allProducts = [];
let editingId   = null;
let currentImg  = null;
let pendingImgDataUrl = null;


document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  document.getElementById('btn-save').addEventListener('click', submitForm);
  document.getElementById('btn-cancel').addEventListener('click', resetForm);
  document.getElementById('btn-reload').addEventListener('click', loadProducts);

  document.getElementById('f-img-file').addEventListener('change', onFileChange);
  document.getElementById('btn-clear-img').addEventListener('click', clearImage);
});


async function loadProducts() {
  const listEl  = document.getElementById('product-list');
  const emptyEl = document.getElementById('empty-msg');

  listEl.innerHTML = '<p>載入中...</p>';
  emptyEl.style.display = 'none';

  try {
    allProducts = await eel.api_list_products()();

    if (!allProducts || allProducts.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.innerHTML = allProducts.map(renderCard).join('');
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
  if (p.stock <= 0)      stockClass = 'out';
  else if (p.stock < 5)  stockClass = 'low';

  return `
    <div class="product-card">
      <div class="img-wrap">${imgHtml}</div>
      <div class="name">${escapeHtml(p.ProductName)}</div>
      <div class="price">$${p.price}</div>
      <div class="stock ${stockClass}">庫存 ${p.stock}</div>
      <div class="card-actions">
        <button class="small" onclick="editProduct(${p.ProductID})">編輯</button>
      </div>
    </div>
  `;
}


function editProduct(pid) {
  const p = allProducts.find(x => x.ProductID === pid);
  if (!p) return;

  editingId      = pid;
  currentImg     = p.img;
  pendingImgDataUrl = null;

  document.getElementById('form-title').textContent = `編輯商品 #${pid}`;
  document.getElementById('f-name').value  = p.ProductName;
  document.getElementById('f-price').value = p.price;
  document.getElementById('f-stock').value = p.stock;
  document.getElementById('f-img-file').value = '';
  document.getElementById('btn-save').textContent = '儲存';

  // 顯示現有圖片
  const preview = document.getElementById('f-img-preview');
  const clearBtn = document.getElementById('btn-clear-img');
  if (p.img) {
    preview.src = p.img;
    preview.style.display = 'block';
    clearBtn.style.display = 'inline-block';
  } else {
    preview.style.display = 'none';
    clearBtn.style.display = 'none';
  }

  document.getElementById('btn-cancel').style.display = 'inline-block';

  // 捲到表單
  document.querySelector('.panel').scrollIntoView({ behavior: 'smooth' });
}
window.editProduct = editProduct;


function onFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImgDataUrl = ev.target.result;

    const preview = document.getElementById('f-img-preview');
    preview.src = pendingImgDataUrl;
    preview.style.display = 'block';

    document.getElementById('btn-clear-img').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
}


function clearImage() {
  pendingImgDataUrl = null;
  currentImg = null;
  document.getElementById('f-img-file').value = '';
  document.getElementById('f-img-preview').style.display = 'none';
  document.getElementById('f-img-preview').src = '';
  document.getElementById('btn-clear-img').style.display = 'none';
}


async function submitForm() {
  const name  = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value);
  const stock = parseFloat(document.getElementById('f-stock').value);

  if (!name)                 return showMsg('請輸入商品名稱', 'err');
  if (isNaN(price) || price < 0) return showMsg('單價必須是大於等於 0 的數字', 'err');
  if (isNaN(stock) || stock < 0) return showMsg('庫存必須是大於等於 0 的數字', 'err');

  try {
    let imgPath = currentImg;
    if (pendingImgDataUrl) {
      const file = document.getElementById('f-img-file').files[0];
      const filename = file ? file.name : 'upload.jpg';
      imgPath = await eel.api_upload_image(filename, pendingImgDataUrl)();
    }

    if (editingId === null) {
      const pid = await eel.api_add_product({
        ProductName: name,
        price: price,
        stock: stock,
        img: imgPath,
      })();
      showMsg(`✅ 新增成功（ProductID = ${pid}）`, 'ok');
    } else {
      await eel.api_update_product({
        ProductID:   editingId,
        ProductName: name,
        price:       price,
        stock:       stock,
        img:         imgPath,
      })();
      showMsg('✅ 更新成功', 'ok');
    }

    resetForm();
    await loadProducts();

  } catch (err) {
    showMsg('❌ ' + (err.message || err), 'err');
  }
}


function resetForm() {
  editingId = null;
  currentImg = null;
  pendingImgDataUrl = null;

  document.getElementById('form-title').textContent = '新增商品';
  document.getElementById('f-name').value  = '';
  document.getElementById('f-price').value = '';
  document.getElementById('f-stock').value = '0';
  document.getElementById('f-img-file').value = '';
  document.getElementById('f-img-preview').style.display = 'none';
  document.getElementById('f-img-preview').src = '';
  document.getElementById('btn-clear-img').style.display = 'none';
  document.getElementById('btn-save').textContent = '新增';
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('form-msg').textContent = '';
}


function showMsg(text, type) {
  const el = document.getElementById('form-msg');
  el.textContent = text;
  el.className = 'msg ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'msg'; }, 4000);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}