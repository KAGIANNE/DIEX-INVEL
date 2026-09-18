const STORAGE_KEY = "diex-invel-local-v1";

const unitMultipliers = { unidad: 1, docena: 12, pack: 6, caja: 24, kilo: 1, litro: 1, fraccion: 0.5 };
const documentLabels = { boleta: "Boleta", factura: "Factura", pedido: "Nota de pedido", cotizacion: "Cotización", otro: "Otro" };
const movementLabels = { purchase: "Compra", sale: "Venta" };

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const money = (value) => `S/ ${Number(value || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const number = (value) => Number(value || 0);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const shortDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

function initialState() {
  return {
    products: [
      { id: "p-harina", code: "MP-001", name: "Harina preparada premium", family: "Insumos", brand: "Molitalia", presentation: "Saco", cost: 4.2, physical: 86, documented: 74, minStock: 20, prices: { unidad: 5.5, docena: 62, pack: 31, caja: 125 } },
      { id: "p-azucar", code: "MP-002", name: "Azúcar rubia", family: "Insumos", brand: "Cartavio", presentation: "Kilo", cost: 3.1, physical: 44, documented: 44, minStock: 15, prices: { unidad: 4.2, docena: 48, pack: 24, caja: 96 } },
      { id: "p-caja", code: "EM-001", name: "Caja para torta mediana", family: "Empaques", brand: "DIEX", presentation: "Unidad", cost: 1.45, physical: 9, documented: 4, minStock: 15, prices: { unidad: 2.5, docena: 27, pack: 14, caja: 54 } },
      { id: "p-mantequilla", code: "MP-003", name: "Mantequilla sin sal", family: "Insumos", brand: "Gloria", presentation: "Barra", cost: 8.4, physical: 0, documented: 0, minStock: 10, prices: { unidad: 10.5, docena: 120, pack: 61, caja: 245 } }
    ],
    sales: [],
    purchases: [],
    movements: [],
    nextSale: 1,
    nextPurchase: 1
  };
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.warn("No se pudo leer el almacenamiento local", error);
  }
  return initialState();
}

let state = loadState();
let saleCart = [];
let toastTimer;
let cloudSnapshotTimer;
let remoteContext = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function productById(id) { return state.products.find((product) => product.id === id); }
function productInitials(product) { return (product?.name || "PR").split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase(); }
function stockStatus(product) { if (number(product.physical) <= 0) return "out"; if (number(product.physical) <= number(product.minStock)) return "low"; return "good"; }
function priceFor(product, unit) { return number(product?.prices?.[unit] ?? product?.prices?.unidad); }
function baseQuantity(quantity, unit) { return number(quantity) * (unitMultipliers[unit] || 1); }
function statusPill(status, label) { return `<span class="status-pill ${status}">${esc(label)}</span>`; }

function showToast(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3500);
}

function updateRemoteUI(errorMessage = "") {
  const client = window.DiexSupabase;
  const configured = Boolean(client?.isConfigured());
  const connected = Boolean(remoteContext);
  const badge = $("#connection-badge");
  const stateLabel = $("#connection-state");
  const authForm = $("#remote-auth-form");
  const authenticatedActions = $("#authenticated-actions");
  const connectionLabel = $("#connection-label");
  const connectionNote = $("#connection-note");
  const userName = $("#user-name");
  const userSession = $("#user-session");
  const userAvatar = $("#user-avatar");

  if (!configured) {
    badge.className = "connection-badge error";
    badge.textContent = "Sin configurar";
    stateLabel.textContent = "Falta la configuración pública de Supabase.";
    authForm.hidden = true;
    authenticatedActions.hidden = true;
    return;
  }
  if (connected) {
    const name = remoteContext.fullName || remoteContext.email || "Usuario";
    const initials = name.split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    badge.className = "connection-badge connected";
    badge.textContent = "Conectado";
    stateLabel.textContent = `${name} · ${remoteContext.role} · ${remoteContext.organization?.trade_name || "DIEX INVEL"}`;
    authForm.hidden = true;
    authenticatedActions.hidden = false;
    connectionLabel.textContent = "Modo local + Supabase";
    connectionNote.textContent = "Los cambios se guardan localmente y se pueden respaldar en la nube";
    userName.textContent = name;
    userSession.textContent = `Supabase · ${remoteContext.role}`;
    userAvatar.textContent = initials || "US";
    return;
  }
  badge.className = errorMessage ? "connection-badge error" : "connection-badge";
  badge.textContent = errorMessage ? "Revisar" : "Sin sesión";
  stateLabel.textContent = errorMessage || "Configuración lista. Inicia sesión para habilitar la copia remota.";
  authForm.hidden = false;
  authenticatedActions.hidden = true;
  connectionLabel.textContent = "Modo local activo";
  connectionNote.textContent = "Los datos se guardan en este equipo";
  userName.textContent = "Administrador";
  userSession.textContent = "Sesión local";
  userAvatar.textContent = "AD";
}

async function refreshRemoteConnection() {
  if (!window.DiexSupabase) return;
  try {
    const status = await window.DiexSupabase.connectionStatus();
    remoteContext = status.context;
    updateRemoteUI();
  } catch (error) {
    remoteContext = null;
    updateRemoteUI(error.message);
  }
}

async function signInRemote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("#remote-signin");
  button.disabled = true;
  try {
    await window.DiexSupabase.signIn($("#remote-email").value.trim(), $("#remote-password").value);
    remoteContext = await window.DiexSupabase.getUserContext();
    updateRemoteUI();
    showToast("Sesión de Supabase iniciada.");
    form.reset();
  } catch (error) {
    updateRemoteUI(error.message);
    showToast(`No se pudo iniciar sesión: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function signUpRemote() {
  const form = $("#remote-auth-form");
  if (!form.reportValidity()) return;
  const button = $("#remote-signup");
  button.disabled = true;
  try {
    const result = await window.DiexSupabase.signUp($("#remote-email").value.trim(), $("#remote-password").value, $("#remote-full-name").value.trim());
    if (result?.access_token) {
      remoteContext = await window.DiexSupabase.getUserContext();
      updateRemoteUI();
      showToast("Usuario creado y conectado como administrador.");
      form.reset();
    } else {
      showToast("Usuario creado. Revisa tu correo para confirmar la cuenta y luego inicia sesión.");
    }
  } catch (error) {
    updateRemoteUI(error.message);
    showToast(`No se pudo crear el usuario: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function signOutRemote() {
  await window.DiexSupabase.signOut();
  remoteContext = null;
  updateRemoteUI();
  showToast("Sesión remota cerrada. El modo local continúa disponible.");
}

async function saveRemoteSnapshot(showResult = true) {
  if (!remoteContext) return showToast("Inicia sesión en Supabase antes de guardar la copia.", "error");
  try {
    await window.DiexSupabase.saveLocalSnapshot(state);
    if (showResult) showToast("Copia local guardada en Supabase.");
  } catch (error) {
    if (showResult) showToast(`No se pudo guardar la copia: ${error.message}`, "error");
    else console.warn("La copia remota quedó pendiente", error);
  }
}

function queueCloudSnapshot() {
  if (!remoteContext) return;
  clearTimeout(cloudSnapshotTimer);
  cloudSnapshotTimer = setTimeout(() => saveRemoteSnapshot(false), 800);
}

async function loadRemoteSnapshot() {
  if (!remoteContext) return showToast("Inicia sesión en Supabase antes de descargar la copia.", "error");
  try {
    const row = await window.DiexSupabase.loadLocalSnapshot();
    if (!row?.value_json) return showToast("Todavía no existe una copia remota para esta organización.", "error");
    if (!window.confirm("Esto reemplazará los datos locales de este equipo por la copia remota. ¿Continuar?")) return;
    if (!Array.isArray(row.value_json.products) || !Array.isArray(row.value_json.sales) || !Array.isArray(row.value_json.purchases)) throw new Error("La copia remota no tiene el formato esperado.");
    state = row.value_json;
    saleCart = [];
    persist();
    renderAll();
    showToast("Copia remota descargada en este equipo.");
  } catch (error) {
    showToast(`No se pudo descargar la copia: ${error.message}`, "error");
  }
}

function setSection(section) {
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
  $$(".page-section").forEach((page) => page.classList.toggle("active", page.id === `section-${section}`));
  const active = $(`.nav-item[data-section="${section}"]`);
  $("#page-title").textContent = active?.textContent.trim() || "Resumen";
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const salesTotal = state.sales.reduce((sum, sale) => sum + number(sale.total), 0);
  const pending = state.sales.reduce((sum, sale) => sum + Math.max(0, number(sale.total) - number(sale.payment)), 0);
  const lowStock = state.products.filter((product) => stockStatus(product) !== "good");
  const inventoryValue = state.products.reduce((sum, product) => sum + number(product.physical) * number(product.cost), 0);
  $("#stat-sales").textContent = money(salesTotal);
  $("#stat-sales-note").textContent = `${state.sales.length} operación${state.sales.length === 1 ? "" : "es"} registrada${state.sales.length === 1 ? "" : "s"}`;
  $("#stat-pending").textContent = money(pending);
  $("#stat-pending-note").textContent = pending ? "Ventas con saldo pendiente" : "No hay saldos pendientes";
  $("#stat-products").textContent = state.products.length;
  $("#stat-products-note").textContent = `${lowStock.length} con stock bajo o agotado`;
  $("#stat-inventory").textContent = money(inventoryValue);

  const days = [...Array(7)].map((_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return date.toISOString().slice(0, 10); });
  const amounts = days.map((day) => state.sales.filter((sale) => sale.date === day).reduce((sum, sale) => sum + number(sale.total), 0));
  const max = Math.max(...amounts, 1);
  $("#sales-chart").innerHTML = days.map((day, index) => `<div class="chart-column"><em>${money(amounts[index])}</em><div class="chart-bar-wrap"><div class="chart-bar" style="height:${Math.max(4, (amounts[index] / max) * 100)}%" title="${money(amounts[index])}"></div></div><small>${new Date(`${day}T12:00:00`).toLocaleDateString("es-PE", { weekday: "short" }).replace(".", "")}</small></div>`).join("");

  $("#low-stock-list").innerHTML = lowStock.length ? lowStock.slice(0, 4).map((product) => `<div class="stock-row"><div class="stock-product"><span class="product-badge">${esc(productInitials(product))}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.code)} · mínimo ${number(product.minStock)}</small></span></div><span class="stock-number">${number(product.physical)} und.</span></div>`).join("") : `<div class="empty-state">No hay productos con stock bajo.</div>`;
  const recent = [...state.sales.map((sale) => ({ ...sale, kind: "sale" })), ...state.purchases.map((purchase) => ({ ...purchase, kind: "purchase" }))].sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`)).slice(0, 6);
  $("#recent-operations").innerHTML = recent.length ? recent.map((operation) => `<tr><td><span class="ref">${esc(operation.reference)}</span></td><td>${operation.kind === "sale" ? "Venta" : "Compra"}</td><td>${shortDate(operation.date)}</td><td>Administrador</td><td class="align-right">${money(operation.total)}</td><td>${operation.kind === "sale" ? statusPill(number(operation.payment) >= number(operation.total) ? "paid" : "pending", number(operation.payment) >= number(operation.total) ? "Pagada" : "Pendiente") : statusPill("done", "Registrada")}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">Todavía no hay operaciones. Registra tu primera compra o venta.</div></td></tr>`;
}

function renderProducts() {
  const query = $("#products-search")?.value.toLowerCase() || "";
  const products = state.products.filter((product) => [product.code, product.name, product.family, product.brand].join(" ").toLowerCase().includes(query));
  $("#products-table").innerHTML = products.length ? products.map((product) => `<tr><td><span class="ref">${esc(product.code)}</span></td><td><div class="product-cell"><span class="product-badge">${esc(productInitials(product))}</span><span class="product-meta"><strong>${esc(product.name)}</strong><small>${esc(product.brand || "Sin marca")}</small></span></div></td><td>${esc(product.family || "Sin familia")}</td><td>${esc(product.presentation || "Unidad")}</td><td class="align-right">${money(priceFor(product, "unidad"))}</td><td class="align-right">${money(priceFor(product, "pack"))}</td><td class="align-right">${money(product.cost)}</td><td><button class="row-action" type="button" title="Edición disponible en siguiente fase">⋯</button></td></tr>`).join("") : `<tr><td colspan="8"><div class="empty-state">No se encontraron productos.</div></td></tr>`;
}

function renderInventory() {
  const query = $("#inventory-search")?.value.toLowerCase() || "";
  const filter = $("#inventory-stock-filter")?.value || "all";
  const physical = state.products.reduce((sum, product) => sum + number(product.physical), 0);
  const documented = state.products.reduce((sum, product) => sum + number(product.documented), 0);
  const alerts = state.products.filter((product) => stockStatus(product) !== "good").length;
  $("#inventory-physical").textContent = physical.toLocaleString("es-PE");
  $("#inventory-documented").textContent = documented.toLocaleString("es-PE");
  $("#inventory-alerts").textContent = alerts;
  const products = state.products.filter((product) => {
    const matches = [product.code, product.name, product.family, product.brand].join(" ").toLowerCase().includes(query);
    const status = stockStatus(product);
    return matches && (filter === "all" || (filter === "low" && status === "low") || (filter === "out" && status === "out"));
  });
  $("#inventory-table").innerHTML = products.length ? products.map((product) => { const status = stockStatus(product); const label = status === "good" ? "Normal" : status === "low" ? "Stock bajo" : "Agotado"; return `<tr><td><div class="product-cell"><span class="product-badge">${esc(productInitials(product))}</span><span class="product-meta"><strong>${esc(product.name)}</strong><small>${esc(product.code)}</small></span></div></td><td><span class="family">${esc(product.family || "-")} · ${esc(product.brand || "-")}</span></td><td class="${status === "good" ? "good-number" : status === "out" ? "muted-number" : "warning-number"}">${number(product.physical)}</td><td>${number(product.documented)}</td><td>${money(product.cost)}</td><td>${money(number(product.physical) * number(product.cost))}</td><td>${statusPill(status === "good" ? "done" : status, label)}</td></tr>`; }).join("") : `<tr><td colspan="7"><div class="empty-state">No se encontraron productos.</div></td></tr>`;
}

function renderSales() {
  const query = $("#sales-search")?.value.toLowerCase() || "";
  const status = $("#sales-status-filter")?.value || "all";
  const type = $("#sales-type-filter")?.value || "all";
  const sales = state.sales.filter((sale) => { const paid = number(sale.payment) >= number(sale.total); return [sale.reference, sale.client].join(" ").toLowerCase().includes(query) && (status === "all" || (status === "paid" && paid) || (status === "pending" && !paid)) && (type === "all" || sale.type === type); }).sort((a, b) => b.date.localeCompare(a.date));
  $("#sales-table").innerHTML = sales.length ? sales.map((sale) => { const paid = number(sale.payment) >= number(sale.total); return `<tr><td><span class="ref">${esc(sale.reference)}</span></td><td><strong>${esc(sale.client)}</strong><small>${sale.lines.length} línea${sale.lines.length === 1 ? "" : "s"}</small></td><td>${esc(documentLabels[sale.type] || sale.type)}</td><td>${shortDate(sale.date)}</td><td class="align-right">${money(sale.total)}</td><td>${statusPill(paid ? "paid" : "pending", paid ? "Pagada" : `Saldo ${money(sale.total - sale.payment)}`)}</td><td><button class="row-action print-sale" data-sale-id="${esc(sale.id)}" type="button" title="Imprimir ticket térmico" aria-label="Imprimir ticket térmico">⎙</button></td></tr>`; }).join("") : `<tr><td colspan="7"><div class="empty-state">No hay ventas que coincidan con el filtro.</div></td></tr>`;
}

function renderPurchases() {
  $("#purchase-count").textContent = state.purchases.length;
  $("#purchase-total").textContent = money(state.purchases.reduce((sum, purchase) => sum + number(purchase.total), 0));
  $("#purchase-pen").textContent = money(state.purchases.filter((purchase) => purchase.currency === "PEN").reduce((sum, purchase) => sum + number(purchase.total), 0));
  $("#purchases-table").innerHTML = state.purchases.length ? [...state.purchases].reverse().map((purchase) => `<tr><td><span class="ref">${esc(purchase.reference)}</span></td><td>${esc(purchase.supplier)}</td><td>${esc(productById(purchase.productId)?.name || "Producto eliminado")}</td><td>${esc(documentLabels[purchase.type] || purchase.type)}</td><td>${shortDate(purchase.date)}</td><td class="align-right">${money(purchase.total)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">No hay compras registradas todavía.</div></td></tr>`;
}

function renderReports() {
  const value = state.products.reduce((sum, product) => sum + number(product.physical) * number(product.cost), 0);
  const totalPhysical = state.products.reduce((sum, product) => sum + number(product.physical), 0);
  const out = state.movements.filter((movement) => movement.direction === "out").reduce((sum, movement) => sum + number(movement.quantity), 0);
  const input = state.movements.filter((movement) => movement.direction === "in").reduce((sum, movement) => sum + number(movement.quantity), 0);
  $("#report-stock-value").textContent = money(value);
  $("#report-progress").style.width = `${Math.min(100, totalPhysical ? 65 : 0)}%`;
  $("#report-progress-label").textContent = totalPhysical ? `${totalPhysical.toLocaleString("es-PE")} unidades físicas valorizadas` : "Sin datos todavía";
  $("#report-out").textContent = out.toLocaleString("es-PE");
  $("#report-in").textContent = input.toLocaleString("es-PE");
  $("#report-rotation").textContent = totalPhysical ? (out / Math.max(totalPhysical, 1)).toFixed(2) : "0.00";
  const selectedProduct = $("#report-product")?.value || "all";
  const from = $("#report-from")?.value || "";
  const to = $("#report-to")?.value || "";
  const movements = state.movements.filter((movement) => (selectedProduct === "all" || movement.productId === selectedProduct) && (!from || movement.date >= from) && (!to || movement.date <= to)).slice().reverse();
  $("#kardex-table").innerHTML = movements.length ? movements.map((movement) => `<tr><td>${shortDate(movement.date)}</td><td><span class="ref">${esc(movement.reference)}</span></td><td>${esc(productById(movement.productId)?.name || "Producto eliminado")}</td><td>${movement.direction === "in" ? statusPill("done", movementLabels[movement.kind]) : statusPill("low", movementLabels[movement.kind])}</td><td class="align-right">${movement.direction === "in" ? "+" : "−"}${number(movement.quantity)}</td><td class="align-right">${money(movement.unitCost)}</td><td class="align-right">${money(movement.value)}</td></tr>`).join("") : `<tr><td colspan="7"><div class="empty-state">Aún no hay movimientos del Kardex.</div></td></tr>`;
}

function fillProductSelects() {
  const options = state.products.map((product) => `<option value="${esc(product.id)}">${esc(product.code)} · ${esc(product.name)}</option>`).join("");
  $("#sale-product").innerHTML = options;
  $("#purchase-product").innerHTML = options;
  $("#report-product").innerHTML = `<option value="all">Todos los productos</option>${options}`;
  updateSaleUnits();
}

function updateSaleUnits() {
  const product = productById($("#sale-product")?.value);
  const units = Object.keys(unitMultipliers).filter((unit) => priceFor(product, unit) > 0 || unit === "unidad");
  $("#sale-unit").innerHTML = units.map((unit) => `<option value="${unit}">${unit[0].toUpperCase()}${unit.slice(1)}</option>`).join("");
}

function renderCart() {
  const total = saleCart.reduce((sum, line) => sum + line.amount, 0);
  $("#cart-count").textContent = `${saleCart.length} producto${saleCart.length === 1 ? "" : "s"}`;
  $("#empty-cart").hidden = saleCart.length > 0;
  $("#sale-cart").innerHTML = saleCart.map((line, index) => `<tr><td><strong>${esc(line.name)}</strong><small>${esc(line.code)}</small></td><td>${esc(line.unit)}</td><td class="align-right">${number(line.quantity)}</td><td class="align-right">${money(line.unitPrice)}</td><td class="align-right">${money(line.amount)}</td><td><button class="row-action remove-line" data-index="${index}" type="button">×</button></td></tr>`).join("");
  $("#sale-total").textContent = money(total);
  const payment = number($("#sale-payment")?.value);
  $("#sale-balance").textContent = `Saldo: ${money(Math.max(0, total - payment))}`;
}

function openModal(type) {
  const backdrop = $("#modal-backdrop");
  $("#modal-sale").hidden = type !== "sale";
  $("#modal-purchase").hidden = type !== "purchase";
  $("#modal-product").hidden = type !== "product";
  $("#modal-title").textContent = type === "sale" ? "Nueva venta" : type === "purchase" ? "Registrar compra" : "Nuevo producto";
  backdrop.hidden = false;
  if (type === "sale") { saleCart = []; $("#sale-client").value = ""; $("#sale-payment").value = "0"; renderCart(); }
  if (type === "purchase") { $("#purchase-form").reset(); $("#purchase-exchange").value = "1"; }
  if (type === "product") $("#product-form").reset();
  fillProductSelects();
}

function closeModal() { $("#modal-backdrop").hidden = true; }

function addSaleLine() {
  const product = productById($("#sale-product").value);
  const quantity = number($("#sale-qty").value);
  const unit = $("#sale-unit").value;
  if (!product || quantity <= 0) return showToast("Indica un producto y una cantidad válida.", "error");
  const needed = baseQuantity(quantity, unit);
  if ($("#sale-type").value !== "cotizacion" && needed > number(product.physical)) return showToast(`Stock físico insuficiente. Disponible: ${product.physical} unidades base.`, "error");
  const unitPrice = priceFor(product, unit);
  saleCart.push({ productId: product.id, code: product.code, name: product.name, quantity, unit, baseQuantity: needed, unitPrice, amount: quantity * unitPrice });
  renderCart();
}

function recordSale(event) {
  event.preventDefault();
  if (!saleCart.length) return showToast("Agrega al menos un producto a la venta.", "error");
  const type = $("#sale-type").value;
  const total = saleCart.reduce((sum, line) => sum + line.amount, 0);
  const payment = number($("#sale-payment").value);
  const reference = `V-${String(state.nextSale++).padStart(5, "0")}`;
  const sale = { id: uid("sale"), reference, date: todayISO(), client: $("#sale-client").value.trim() || "Cliente general", type, total, payment, lines: saleCart.map((line) => ({ ...line })) };
  sale.lines.forEach((line) => {
    const product = productById(line.productId);
    const affectsPhysical = type !== "cotizacion";
    const documentedOut = affectsPhysical && ["boleta", "factura"].includes(type) ? Math.min(number(product.documented), line.baseQuantity) : 0;
    if (affectsPhysical) product.physical = number(product.physical) - line.baseQuantity;
    product.documented = number(product.documented) - documentedOut;
    if (affectsPhysical) state.movements.push({ id: uid("mov"), date: sale.date, reference, productId: product.id, kind: "sale", direction: "out", quantity: line.baseQuantity, documentedQuantity: documentedOut, unitCost: number(product.cost), value: line.baseQuantity * number(product.cost) });
    line.documentedQuantity = documentedOut;
  });
  state.sales.push(sale);
  persist(); queueCloudSnapshot(); renderAll(); closeModal();
  showToast(`${reference} registrada correctamente.`);
}

function recordPurchase(event) {
  event.preventDefault();
  const product = productById($("#purchase-product").value);
  const quantity = number($("#purchase-qty").value);
  const cost = number($("#purchase-cost").value);
  const currency = $("#purchase-currency").value;
  const exchange = number($("#purchase-exchange").value) || 1;
  if (!product || quantity <= 0 || cost < 0) return showToast("Completa producto, cantidad y costo.", "error");
  const type = $("#purchase-type").value;
  const reference = `C-${String(state.nextPurchase++).padStart(5, "0")}`;
  const costInSoles = currency === "USD" ? cost * exchange : cost;
  const oldQuantity = number(product.physical);
  product.cost = oldQuantity + quantity ? ((oldQuantity * number(product.cost)) + (quantity * costInSoles)) / (oldQuantity + quantity) : costInSoles;
  product.physical = oldQuantity + quantity;
  if (type === "factura") product.documented = number(product.documented) + quantity;
  const purchase = { id: uid("purchase"), reference, date: todayISO(), supplier: $("#purchase-supplier").value.trim(), type, productId: product.id, quantity, cost, exchange, currency, costInSoles, total: quantity * costInSoles };
  state.purchases.push(purchase);
  state.movements.push({ id: uid("mov"), date: purchase.date, reference, productId: product.id, kind: "purchase", direction: "in", quantity, unitCost: costInSoles, value: quantity * costInSoles });
  persist(); queueCloudSnapshot(); renderAll(); closeModal();
  showToast(`${reference} registrada y stock actualizado.`);
}

function recordProduct(event) {
  event.preventDefault();
  const product = { id: uid("product"), code: $("#product-code").value.trim(), name: $("#product-name").value.trim(), family: $("#product-family").value.trim() || "Sin familia", brand: $("#product-brand").value.trim() || "Sin marca", presentation: $("#product-presentation").value.trim() || "Unidad", cost: number($("#product-cost").value), physical: number($("#product-physical").value), documented: number($("#product-documented").value), minStock: number($("#product-min").value), prices: { unidad: number($("#product-price-unit").value), docena: number($("#product-price-dozen").value), pack: number($("#product-price-pack").value) } };
  if (state.products.some((item) => item.code.toLowerCase() === product.code.toLowerCase())) return showToast("Ese código de producto ya existe.", "error");
  state.products.push(product);
  if (product.physical > 0) state.movements.push({ id: uid("mov"), date: todayISO(), reference: "SALDO-INICIAL", productId: product.id, kind: "purchase", direction: "in", quantity: product.physical, unitCost: product.cost, value: product.physical * product.cost });
  persist(); queueCloudSnapshot(); renderAll(); closeModal();
  showToast(`${product.name} agregado al catálogo.`);
}

function spreadsheetDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? value : date;
}

function productSpreadsheetRows() {
  return [["Código", "Producto", "Familia", "Marca", "Presentación", "Stock físico", "Stock documentado", "Costo promedio", "Precio unidad", "Precio docena", "Precio pack"], ...state.products.map((product) => [product.code, product.name, product.family, product.brand, product.presentation, number(product.physical), number(product.documented), number(product.cost), priceFor(product, "unidad"), priceFor(product, "docena"), priceFor(product, "pack")])];
}

function salesSpreadsheetRows() {
  return [["Referencia", "Cliente", "Documento", "Fecha", "Total", "Pago", "Saldo", "Estado"], ...state.sales.map((sale) => { const balance = Math.max(0, number(sale.total) - number(sale.payment)); return [sale.reference, sale.client, documentLabels[sale.type] || sale.type, spreadsheetDate(sale.date), number(sale.total), number(sale.payment), balance, balance ? "Pendiente" : "Pagada"]; })];
}

function purchasesSpreadsheetRows() {
  return [["Referencia", "Proveedor", "Producto", "Documento", "Fecha", "Cantidad", "Moneda", "Costo unitario", "Costo en soles", "Total"], ...state.purchases.map((purchase) => [purchase.reference, purchase.supplier, productById(purchase.productId)?.name || "Producto eliminado", documentLabels[purchase.type] || purchase.type, spreadsheetDate(purchase.date), number(purchase.quantity), purchase.currency, number(purchase.cost), number(purchase.costInSoles), number(purchase.total)])];
}

function kardexSpreadsheetRows() {
  return [["Fecha", "Referencia", "Producto", "Movimiento", "Cantidad", "Costo unitario", "Valor"], ...state.movements.map((movement) => [spreadsheetDate(movement.date), movement.reference, productById(movement.productId)?.name || "Producto eliminado", movement.direction === "in" ? "Entrada" : "Salida", number(movement.quantity), number(movement.unitCost), number(movement.value)])];
}

function exportWorkbook(filename, sheets, message) {
  if (!window.DiexExcel) return showToast("El exportador Excel no está disponible.", "error");
  try {
    window.DiexExcel.downloadWorkbook(filename, sheets);
    showToast(message);
  } catch (error) {
    showToast(`No se pudo exportar Excel: ${error.message}`, "error");
  }
}

function exportProducts() {
  exportWorkbook("productos-diex-invel.xlsx", [{ name: "Productos", rows: productSpreadsheetRows(), widths: [16, 34, 18, 18, 18, 14, 18, 16, 16, 16, 16], numberColumns: [5, 6], currencyColumns: [7, 8, 9, 10] }], "Catálogo exportado en Excel.");
}

function exportKardex() {
  exportWorkbook("reporte-diex-invel.xlsx", [
    { name: "Productos", rows: productSpreadsheetRows(), widths: [16, 34, 18, 18, 18, 14, 18, 16, 16, 16, 16], numberColumns: [5, 6], currencyColumns: [7, 8, 9, 10] },
    { name: "Ventas", rows: salesSpreadsheetRows(), widths: [16, 28, 18, 14, 14, 14, 14, 14], currencyColumns: [4, 5, 6] },
    { name: "Compras", rows: purchasesSpreadsheetRows(), widths: [16, 26, 28, 18, 14, 12, 12, 16, 16, 14], numberColumns: [5], currencyColumns: [7, 8, 9] },
    { name: "Kardex", rows: kardexSpreadsheetRows(), widths: [14, 16, 30, 16, 14, 16, 14], numberColumns: [4], currencyColumns: [5, 6] }
  ], "Reporte completo exportado en Excel.");
}

function printSaleTicket(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale) return showToast("No se encontró la venta para imprimir.", "error");
  const popup = window.open("", "diex-invel-ticket", "width=420,height=720");
  if (!popup) return showToast("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para DIEX INVEL.", "error");
  const lineRows = sale.lines.map((line) => `<tr><td>${esc(line.name)}<small>${number(line.quantity)} ${esc(line.unit)} · ${money(line.unitPrice)}</small></td><td>${money(line.amount)}</td></tr>`).join("");
  const balance = Math.max(0, number(sale.total) - number(sale.payment));
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(sale.reference)} · DIEX INVEL</title><style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}.ticket{width:80mm;padding:4mm;font-size:11px}.center{text-align:center}.business{font-size:16px;font-weight:700;letter-spacing:.04em}.muted{color:#555;font-size:10px}.rule{border-top:1px dashed #111;margin:3mm 0}.meta{display:flex;justify-content:space-between;gap:8px;font-size:10px}.meta span:last-child{text-align:right}table{width:100%;border-collapse:collapse;margin-top:3mm}th{border-bottom:1px solid #111;text-align:left;font-size:10px}th:last-child,td:last-child{text-align:right}td{padding:2mm 0;vertical-align:top}td small{display:block;margin-top:1mm;color:#555;font-size:9px}.totals{margin-top:2mm}.total{font-size:15px;font-weight:700}.footer{margin-top:5mm;text-align:center;font-size:10px}</style></head><body><main class="ticket"><div class="center business">DIEX INVEL</div><div class="center muted">Gestión comercial</div><div class="rule"></div><div class="meta"><span>Referencia</span><strong>${esc(sale.reference)}</strong></div><div class="meta"><span>Fecha</span><span>${esc(shortDate(sale.date))}</span></div><div class="meta"><span>Cliente</span><span>${esc(sale.client)}</span></div><div class="rule"></div><table><thead><tr><th>Detalle</th><th>Importe</th></tr></thead><tbody>${lineRows}</tbody></table><div class="rule"></div><div class="meta totals"><span>Total</span><span class="total">${money(sale.total)}</span></div><div class="meta"><span>Pago recibido</span><span>${money(sale.payment)}</span></div><div class="meta"><span>Saldo</span><span>${money(balance)}</span></div><div class="footer">Gracias por su compra</div></main></body></html>`);
  popup.document.close();
  popup.focus();
  popup.onafterprint = () => popup.close();
  setTimeout(() => popup.print(), 250);
}

function renderAll() { renderDashboard(); renderProducts(); renderInventory(); renderSales(); renderPurchases(); renderReports(); fillProductSelects(); }

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => setSection(item.dataset.section)));
  $$('[data-section-link]').forEach((button) => button.addEventListener("click", () => setSection(button.dataset.sectionLink)));
  $$('[data-open]').forEach((button) => button.addEventListener("click", () => openModal(button.dataset.open)));
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", closeModal));
  $("#modal-backdrop").addEventListener("click", (event) => { if (event.target.id === "modal-backdrop") closeModal(); });
  $("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#add-sale-line").addEventListener("click", addSaleLine);
  $("#sale-form").addEventListener("submit", recordSale);
  $("#purchase-form").addEventListener("submit", recordPurchase);
  $("#product-form").addEventListener("submit", recordProduct);
  $("#sales-table").addEventListener("click", (event) => {
    const button = event.target.closest(".print-sale");
    if (button) printSaleTicket(button.dataset.saleId);
  });
  $("#sale-product").addEventListener("change", updateSaleUnits);
  $("#sale-payment").addEventListener("input", renderCart);
  $("#sale-cart").addEventListener("click", (event) => { const button = event.target.closest(".remove-line"); if (!button) return; saleCart.splice(number(button.dataset.index), 1); renderCart(); });
  ["#products-search", "#inventory-search", "#inventory-stock-filter", "#sales-search", "#sales-status-filter", "#sales-type-filter", "#report-from", "#report-to", "#report-product"].forEach((selector) => $(selector)?.addEventListener("input", () => { renderProducts(); renderInventory(); renderSales(); renderReports(); }));
  $("#export-products").addEventListener("click", exportProducts);
  $("#export-kardex").addEventListener("click", exportKardex);
  $("#remote-auth-form")?.addEventListener("submit", signInRemote);
  $("#remote-signup")?.addEventListener("click", signUpRemote);
  $("#remote-signout")?.addEventListener("click", signOutRemote);
  $("#remote-save")?.addEventListener("click", () => saveRemoteSnapshot(true));
  $("#remote-load")?.addEventListener("click", loadRemoteSnapshot);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#modal-backdrop").hidden) closeModal(); });
}

function init() {
  $("#today-label").textContent = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  bindEvents();
  renderAll();
  refreshRemoteConnection();
}

document.addEventListener("DOMContentLoaded", init);
