const $ = (selector, root = document) => root.querySelector(selector);
const dialog = $("#booking-dialog");
const content = $("#booking-content");
const state = { config: null, services: [], barbers: [], step: 1, service: null, barber: "any", date: "", time: "", availability: null, pending: false };
const stepLabels = ["Услуга", "Дата", "Время", "Контакты"];

const DEMO_CONFIG = {
  name: "FORMA Barber Studio", shortName: "FORMA", tagline: "Точность в деталях. Свой ритм.",
  logo: "assets/logo.svg", logoLight: "assets/logo.svg", logoDark: "assets/logo.svg", favicon: "assets/favicon.svg",
  address: "ul. Mokotowska 12, Warszawa", phone: "+48 600 000 000",
  socials: { instagram: "", facebook: "", tiktok: "", whatsapp: "", telegram: "" },
  mapsUrl: "https://maps.google.com/?q=ul.+Mokotowska+12,+Warszawa",
  timezone: "Europe/Warsaw", currency: "PLN",
  theme: { primary: "#191916", secondary: "#d0a66e", background: "#f5f3ee", surface: "#ffffff", text: "#22221f", muted: "#77766f", border: "#e7e4dc", accent: "#c79b60", success: "#34775a", error: "#b54d42", radius: "18px", headingFont: "DM Sans", bodyFont: "DM Sans" },
  hours: { sunday: null, monday: { open: "09:00", close: "18:00" }, tuesday: { open: "09:00", close: "18:00" }, wednesday: { open: "09:00", close: "18:00" }, thursday: { open: "09:00", close: "20:00" }, friday: { open: "09:00", close: "20:00" }, saturday: { open: "10:00", close: "16:00" } },
  interval: 30, noticeMinutes: 30, horizonDays: 60, cancellationHours: 2, breakStart: "13:00", breakEnd: "14:00",
  welcomeTitle: "Хорошая стрижка меняет больше, чем образ.",
  welcomeDescription: "Выбери услугу и удобное время — система автоматически найдёт свободного мастера.",
  homeNote: "Место, где форма встречается с характером.",
  cancellationPolicy: "Бесплатная отмена не позднее чем за 2 часа до визита."
};
const DEMO_SERVICES = [
  { id: 1, name: "Мужская стрижка", description: "Форма, текстура и укладка", price: 80, duration: 60 },
  { id: 2, name: "Стрижка бороды", description: "Контур и горячее полотенце", price: 50, duration: 30 },
  { id: 3, name: "Стрижка + борода", description: "Полный образ за одно посещение", price: 120, duration: 90 },
  { id: 4, name: "Камуфляж седины", description: "Естественный и незаметный результат", price: 60, duration: 45 },
  { id: 5, name: "Детская стрижка", description: "Для гостей до 12 лет", price: 65, duration: 45 }
];
const DEMO_BARBERS = [
  { id: 1, name: "Максим", bio: "Спокойный подход и чистые формы. Внимание к каждой детали.", specialty: "Классика · fade", photo: "assets/barber-max.svg" },
  { id: 2, name: "Артём", bio: "Современные текстуры и выразительные силуэты.", specialty: "Текстура · борода", photo: "assets/barber-artem.svg" },
  { id: 3, name: "Даниил", bio: "Точный контур, уверенная рука и лёгкий разговор.", specialty: "Классика · уход", photo: "assets/barber-daniil.svg" }
];

function minutesOf(time) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
function timeOf(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function busySlot(date, time) { let hash = 0; for (const ch of `${date} ${time}`) hash = (hash * 31 + ch.charCodeAt(0)) % 997; return hash % 5 === 0; }
function weekdayOf(date) { return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${date}T12:00:00Z`).getUTCDay()]; }
function slotsFor(date, durationMinutes) {
  const day = DEMO_CONFIG.hours[weekdayOf(date)];
  if (!day) return { state: "closed", slots: [] };
  const slots = [];
  for (let start = minutesOf(day.open); start + durationMinutes <= minutesOf(day.close); start += DEMO_CONFIG.interval) {
    const time = timeOf(start), end = start + durationMinutes;
    const inBreak = start < minutesOf(DEMO_CONFIG.breakEnd) && end > minutesOf(DEMO_CONFIG.breakStart);
    const busy = inBreak || busySlot(date, time);
    slots.push({ time, available: !busy, status: busy ? "busy" : "free" });
  }
  return { state: "open", slots };
}
function demoDelay(data) { return new Promise((resolve) => setTimeout(() => resolve(data), 120)); }

async function api(path, options = {}) {
  const url = new URL(path, location.origin);
  const method = (options.method || "GET").toUpperCase();
  if (path === "/api/config") return demoDelay(DEMO_CONFIG);
  if (path === "/api/services") return demoDelay(DEMO_SERVICES);
  if (path === "/api/barbers") return demoDelay(DEMO_BARBERS);
  if (url.pathname === "/api/availability") {
    const date = url.searchParams.get("date"), service = DEMO_SERVICES.find((s) => s.id === Number(url.searchParams.get("serviceId"))) || DEMO_SERVICES[0];
    return demoDelay({ date, ...slotsFor(date, service.duration) });
  }
  if (url.pathname === "/api/availability/days") {
    const from = url.searchParams.get("from"), days = Number(url.searchParams.get("days")) || 8;
    const service = DEMO_SERVICES.find((s) => s.id === Number(url.searchParams.get("serviceId"))) || DEMO_SERVICES[0];
    const out = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      const { slots, state: dayState } = slotsFor(date, service.duration);
      const free = slots.filter((slot) => slot.available).length;
      out.push({ date, state: dayState === "closed" ? "closed" : free === 0 ? "full" : "available", available: free });
    }
    return demoDelay(out);
  }
  const manageMatch = /^\/api\/bookings\/([A-Za-z0-9_-]+)\/cancel$/.exec(url.pathname);
  if (manageMatch && method === "POST") return demoDelay({ ok: true });
  const bookingMatch = /^\/api\/bookings\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (bookingMatch && method === "GET") {
    return demoDelay({ serviceName: "Мужская стрижка", barberName: "Максим", date: dateForInput(new Date()), time: "11:00", duration: 60, customerName: "Гость", status: "CONFIRMED", address: DEMO_CONFIG.address, phone: DEMO_CONFIG.phone, mapsUrl: DEMO_CONFIG.mapsUrl, price: 80 });
  }
  if (path === "/api/bookings" && method === "POST") {
    const body = JSON.parse(options.body || "{}");
    const service = DEMO_SERVICES.find((s) => s.id === body.serviceId) || DEMO_SERVICES[0];
    const barber = DEMO_BARBERS[Math.floor(Math.random() * DEMO_BARBERS.length)];
    return demoDelay({ id: Date.now(), serviceName: service.name, barberName: barber.name, date: body.date, time: body.startTime, duration: service.duration, price: service.price, manageUrl: "#top" });
  }
  throw Object.assign(new Error("Демо-режим: данные не сохраняются."), { status: 404 });
}

function money(value) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: state.config.currency, maximumFractionDigits: 0 }).format(value); }
function dateForInput(date) { return new Intl.DateTimeFormat("en-CA", { timeZone: state.config.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function dateLabel(date, options = {}) { return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: options.weekday || "short", day: "numeric", ...(options.month ? { month: "short" } : {}) }).format(new Date(`${date}T12:00:00Z`)); }
function escapeHtml(value = "") { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("visible"); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove("visible"), 3400); }
function applyBrand() {
  const { config } = state;
  const { theme } = config;
  const root = document.documentElement;
  root.style.setProperty("--ink", theme.primary); root.style.setProperty("--accent", theme.accent); root.style.setProperty("--paper", theme.background); root.style.setProperty("--surface", theme.surface); root.style.setProperty("--text", theme.text); root.style.setProperty("--muted", theme.muted); root.style.setProperty("--line", theme.border); root.style.setProperty("--success", theme.success); root.style.setProperty("--danger", theme.error); root.style.setProperty("--radius", theme.radius); root.style.setProperty("--font", `'${theme.bodyFont}', sans-serif`); root.style.setProperty("--heading", `'${theme.headingFont}', sans-serif`);
  document.title = `${config.shortName} — онлайн-запись`;
  $("meta[name='theme-color']").content = theme.primary;
  $("#brand-name").textContent = config.shortName; $("#footer-brand").textContent = config.shortName;
  document.querySelectorAll(".brand-lockup img").forEach((image) => { image.src = config.logo; image.alt = config.name; });
  $("#tagline").textContent = config.tagline; $("#welcome-title").textContent = config.welcomeTitle; $("#welcome-description").textContent = config.welcomeDescription;
  $("#hero-address").textContent = config.address; $("#visit-address").textContent = config.address; $("#footer-note").textContent = config.homeNote;
  $("#phone-link").textContent = config.phone; $("#phone-link").href = `tel:${config.phone.replace(/[^+\d]/g, "")}`;
  $("#maps-link").href = config.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(config.address)}`;
  const today = dateForInput(new Date()), dayName = new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, weekday: "long" }).format(new Date()).toLowerCase();
  const todayHours = config.hours[dayName]; $("#hero-hours").textContent = todayHours ? `${todayHours.open} — ${todayHours.close}` : "Сегодня выходной";
  $("#hours-list").innerHTML = Object.entries(config.hours).map(([day, hours]) => `<div><span>${dayNames[day]}</span><span>${hours ? `${hours.open} — ${hours.close}` : "Выходной"}</span></div>`).join("");
  $("#social-links").innerHTML = Object.entries(config.socials).filter(([, href]) => href).map(([name, href]) => `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${name}</a>`).join("");
  $("link[rel='icon']").href = config.favicon;
  $("meta[name='description']").content = config.welcomeDescription;
  return today;
}
const dayNames = { monday: "Понедельник", tuesday: "Вторник", wednesday: "Среда", thursday: "Четверг", friday: "Пятница", saturday: "Суббота", sunday: "Воскресенье" };
function renderCatalog() {
  $("#service-list").innerHTML = state.services.map((service, index) => `<a class="service-row" href="#booking" data-service="${service.id}"><span class="service-no">0${index + 1}</span><span class="service-copy"><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.description)}</small></span><span class="service-duration">${service.duration} мин</span><strong class="service-price">${money(service.price)}</strong><span class="service-arrow">↗</span></a>`).join("");
}
function openBooking(serviceId = null) {
  state.step = 1; state.service = state.services.find((service) => service.id === Number(serviceId)) || null; state.barber = "any"; state.date = ""; state.time = "";
  renderBooking(); dialog.showModal();
}
function closeBooking() { if (dialog.open) dialog.close(); }
function stepper() { return `<div class="booking-stepper">${stepLabels.map((label, index) => `<div class="step-dot ${state.step === index + 1 ? "active" : ""} ${state.step > index + 1 ? "done" : ""}"><span>${state.step > index + 1 ? "✓" : index + 1}</span><small>${label}</small></div>`).join("")}</div>`; }
function heading(eyebrow, title, sub = "") { return `<div class="booking-heading"><span class="eyebrow">${eyebrow}</span><h2 id="booking-title">${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`; }
function backButton() { return `<button type="button" class="back-link" data-back>← Назад</button>`; }
function renderBooking() {
  content.innerHTML = `<div class="booking-topline"><span class="mini-brand"><img src="${escapeHtml(state.config.logo)}" alt=""> ${escapeHtml(state.config.shortName)}</span><span>${state.step > 4 ? "✓ Готово" : `${state.step} <i>/</i> 4`}</span></div>${state.step <= 4 ? stepper() : ""}<div class="booking-main">${state.step === 1 ? renderServiceStep() : state.step === 2 ? renderDateStep() : state.step === 3 ? renderTimeStep() : state.step === 4 ? renderContactStep() : state.step === 5 ? renderReviewStep() : renderSuccessStep()}</div>`;
}
function renderServiceStep() {
  return `${heading("ШАГ 1 · УСЛУГА", "С чего начнём?", "Выбери то, что подходит именно тебе.")}<div class="choice-list">${state.services.map((service) => `<button class="choice-card ${state.service?.id === service.id ? "selected" : ""}" type="button" data-pick-service="${service.id}"><span class="choice-main"><strong>${escapeHtml(service.name)}</strong><small>${escapeHtml(service.description)} · ${service.duration} мин</small></span><span class="choice-end"><strong>${money(service.price)}</strong><i>→</i></span></button>`).join("")}</div>`;
}
function addDays(date, count) { return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10); }
function renderDateStep() {
  const today = dateForInput(new Date());
  const dates = Array.from({ length: Math.min(8, state.config.horizonDays) }, (_, i) => addDays(today, i));
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const selected = state.date || dates.find((date) => state.config.hours[weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()]]);
  const options = dates.map((date) => {
    const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const working = Boolean(state.config.hours[weekday]);
    const isPast = date < today;
    const status = state.dayStates?.[date];
    const closed = !working || isPast || status === "closed";
    return `<button type="button" class="date-chip ${selected === date ? "selected" : ""} ${closed ? "closed" : status === "full" ? "full" : status === "available" ? "has-slots" : ""}" data-date="${date}" ${closed ? "disabled" : ""} aria-label="${dateLabel(date, { weekday: "long", month: "long" })}${status === "full" ? ", нет времени" : status === "available" ? ", есть свободное время" : ""}"><small>${dateLabel(date)}</small><strong>${date.slice(8, 10)}</strong><i>${closed ? "Закрыто" : status === "full" ? "Нет мест" : status === "available" ? "Есть время" : ""}</i></button>`;
  }).join("");
  return `${heading("ШАГ 2 · ДАТА", "Когда тебе удобно?", "Выбери день. Зелёная отметка — есть свободное время.")}${backButton()}<div class="date-picker-row"><div class="date-strip">${options}</div><label class="calendar-button" aria-label="Выбрать другую дату">▦<input type="date" min="${today}" max="${addDays(today, state.config.horizonDays)}" value="${selected}" data-calendar></label></div><div class="availability-legend"><span><i class="dot green"></i>Есть время</span><span><i class="dot red"></i>Занято</span><span><i class="dot grey"></i>Выходной</span></div><div class="booking-footer"><span>${escapeHtml(serviceCaption())}</span><button class="button button-dark" type="button" data-next-date ${selected ? "" : "disabled"}>Показать время <span>→</span></button></div>`;
}
function serviceCaption() { return state.service ? `${state.service.name} · ${state.service.duration} мин` : ""; }
function renderTimeStep() {
  if (!state.availability) return `${heading("ШАГ 3 · ВРЕМЯ", "Ищем свободное время…", "")}<div class="loading-line"></div>`;
  const available = state.availability.slots.filter((slot) => slot.available);
  const times = state.availability.slots;
  return `${heading("ШАГ 3 · ВРЕМЯ", state.availability.state === "closed" ? "В этот день мы закрыты." : available.length ? "Выбирай время." : "На этот день свободного времени нет.", `${dateLabel(state.date, { weekday: "long", month: "long" })} · ${serviceCaption()}`)}${backButton()}${times.length ? `<div class="time-grid">${times.map((slot) => `<button type="button" class="time-slot ${slot.status} ${state.time === slot.time ? "selected" : ""}" data-time="${slot.time}" ${slot.available ? "" : "disabled"} aria-label="${slot.time}, ${slot.available ? "свободно" : slot.status === "busy" ? "занято" : "недоступно"}">${slot.time}<small>${slot.available ? "Свободно" : slot.status === "busy" ? "Занято" : "Недоступно"}</small></button>`).join("")}</div>` : `<div class="empty-slots">Для выбранного дня нет рабочих часов.</div>`}${!available.length ? `<button type="button" class="nearest-link" data-nearest ${state.config.horizonDays > 0 ? "" : "disabled"}>Найти ближайшее время <span>↗</span></button>` : `<div class="booking-footer"><span>${state.time ? `${state.time} · ${state.service.duration} мин` : "Выбери время"}</span><button class="button button-dark" type="button" data-next-time ${state.time ? "" : "disabled"}>Продолжить <span>→</span></button></div>`}`;
}
function renderContactStep() {
  return `${heading("ШАГ 4 · КОНТАКТЫ", "Как к тебе обращаться?", "Без регистрации — только имя и телефон для подтверждения записи.")}${backButton()}<form id="contact-form" class="contact-form"><label>Имя<input name="name" autocomplete="name" maxlength="100" placeholder="Например, Алексей" required></label><label>Номер телефона<div class="phone-row"><select name="country" aria-label="Код страны"><option value="+48">🇵🇱 +48</option><option value="+7">+7</option><option value="+44">🇬🇧 +44</option><option value="+1">🇺🇸 +1</option><option value="+49">🇩🇪 +49</option><option value="+380">+380</option></select><input name="phone" type="tel" autocomplete="tel-national" inputmode="tel" placeholder="600 000 000" required></div><small class="field-hint">Международный номер, например +48 600 000 000</small></label><label>Комментарий <span class="optional">необязательно</span><textarea name="comment" rows="3" maxlength="1000" placeholder="Пожелания мастеру"></textarea></label><button class="button button-dark full-button" type="submit">Проверить запись <span>→</span></button></form>`;
}
function renderReviewStep() {
  const form = state.contact;
  return `${heading("ПОСЛЕДНИЙ ШАГ", "Всё верно?", "Проверь детали перед подтверждением.")}${backButton()}<div class="summary-card"><div><span>Барбершоп</span><strong>${escapeHtml(state.config.name)}</strong></div><div><span>Услуга</span><strong>${escapeHtml(state.service.name)}</strong></div><div><span>Дата и время</span><strong>${dateLabel(state.date, { weekday: "long", month: "long" })}, ${state.time}</strong></div><div><span>Длительность</span><strong>${state.service.duration} минут</strong></div><div><span>Имя и телефон</span><strong>${escapeHtml(form.name)} · ${escapeHtml(form.fullPhone)}</strong></div>${form.comment ? `<div><span>Комментарий</span><strong>${escapeHtml(form.comment)}</strong></div>` : ""}<div class="summary-total"><span>К оплате в барбершопе</span><strong>${money(state.service.price)}</strong></div></div><button type="button" class="button button-accent full-button confirm-button" data-confirm ${state.pending ? "disabled" : ""}>${state.pending ? "Подтверждаем запись…" : "Подтвердить запись"}<span>↗</span></button><p class="policy-note">${escapeHtml(state.config.cancellationPolicy)}</p>`;
}
function renderSuccessStep() {
  const booking = state.confirmed;
  return `<div class="success-view"><div class="success-check">✓</div><span class="eyebrow">ЗАПИСЬ СОЗДАНА</span><h2>До встречи,<br><em>${escapeHtml(booking.customerName)}.</em></h2><p>Запись подтверждена. Сохрани ссылку, чтобы посмотреть детали или отменить визит.</p><div class="summary-card success-summary"><div><span>Услуга</span><strong>${escapeHtml(booking.serviceName)}</strong></div><div><span>Мастер</span><strong>${escapeHtml(booking.barberName)}</strong></div><div><span>Дата и время</span><strong>${dateLabel(booking.date, { weekday: "long", month: "long" })}, ${booking.time}</strong></div><div><span>Стоимость</span><strong>${money(booking.price)}</strong></div><div><span>Адрес</span><strong>${escapeHtml(state.config.address)}</strong></div></div><a class="button button-dark full-button" href="${escapeHtml(booking.manageUrl)}">Моя запись <span>↗</span></a><a class="success-phone" href="tel:${state.config.phone.replace(/[^+\d]/g, "")}">Позвонить в барбершоп</a><p class="policy-note">Демо-режим: запись не сохраняется на сервере.</p></div>`;
}
async function selectDate(date) {
  state.date = date; state.time = ""; state.step = 3; state.availability = null; renderBooking();
  try { state.availability = await api(`/api/availability?date=${date}&serviceId=${state.service.id}&barberId=${state.barber}`); renderBooking(); }
  catch (error) { toast(error.message); }
}
async function loadDateStatus() {
  const today = dateForInput(new Date());
  try {
    const days = await api(`/api/availability/days?from=${today}&days=${Math.min(8, state.config.horizonDays)}&serviceId=${state.service.id}&barberId=${state.barber}`);
    state.dayStates = Object.fromEntries(days.map((day) => [day.date, day.state]));
  } catch { state.dayStates = {}; }
  renderBooking();
}
async function findNearest() {
  const from = addDays(state.date, 1);
  try {
    const days = await api(`/api/availability/days?from=${from}&days=${Math.min(14, state.config.horizonDays)}&serviceId=${state.service.id}&barberId=${state.barber}`);
    const next = days.find((day) => day.available > 0);
    if (!next) return toast("Пока нет свободных дат. Попробуй позже.");
    await selectDate(next.date);
  } catch (error) { toast(error.message); }
}
function zonedIso(date, time, timezone) {
  const [year, month, day] = date.split("-").map(Number), [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute); let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) { const p = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value])); guess += target - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); }
  return new Date(guess);
}
function toCalendarDate() {
  const title = state.service.name, description = `Запись к ${state.confirmed?.barberName || "мастеру"}`;
  const start = zonedIso(state.date, state.time, state.config.timezone);
  const end = new Date(start.getTime() + state.service.duration * 60_000);
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//${state.config.shortName}//Booking//RU\nBEGIN:VEVENT\nDTSTART:${start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nDTEND:${end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nSUMMARY:${title}\nDESCRIPTION:${description}\nLOCATION:${state.config.address}\nEND:VEVENT\nEND:VCALENDAR`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "barber-appointment.ics"; a.click(); URL.revokeObjectURL(a.href);
}
async function renderManageBooking(token) {
  dialog.showModal(); content.innerHTML = `<div class="booking-loading"><div class="loading-line"></div><div class="loading-line"></div></div>`;
  try {
    const booking = await api(`/api/bookings/${encodeURIComponent(token)}`);
    content.innerHTML = `<div class="manage-booking"><div class="booking-topline"><span class="mini-brand"><img src="${escapeHtml(state.config.logo)}" alt=""> ${escapeHtml(state.config.shortName)}</span><button class="dialog-close inline-close" type="button" data-close aria-label="Закрыть">×</button></div><div class="success-check">${booking.status === "CANCELLED" ? "×" : "✓"}</div><span class="eyebrow">${booking.status === "CANCELLED" ? "ЗАПИСЬ ОТМЕНЕНА" : "ТВОЯ ЗАПИСЬ"}</span><h2>${booking.status === "CANCELLED" ? "До встречи в другой раз." : "Всё готово."}</h2><div class="summary-card success-summary"><div><span>Услуга</span><strong>${escapeHtml(booking.serviceName)}</strong></div><div><span>Мастер</span><strong>${escapeHtml(booking.barberName)}</strong></div><div><span>Дата и время</span><strong>${dateLabel(booking.date, { weekday: "long", month: "long" })}, ${booking.time}</strong></div><div><span>Имя</span><strong>${escapeHtml(booking.customerName)}</strong></div><div><span>Статус</span><strong>${booking.status === "CANCELLED" ? "Отменена" : booking.status === "COMPLETED" ? "Завершена" : "Подтверждена"}</strong></div><div><span>Адрес</span><strong>${escapeHtml(booking.address)}</strong></div></div><div class="manage-actions"><button type="button" class="button button-dark full-button" data-calendar>Добавить в календарь <span>↓</span></button><a class="button button-outline full-button" href="tel:${booking.phone.replace(/[^+\d]/g, "")}">Позвонить <span>↗</span></a><a class="text-link" href="${escapeHtml(booking.mapsUrl)}" target="_blank" rel="noreferrer">Открыть маршрут ↗</a>${booking.status !== "CANCELLED" && booking.status !== "COMPLETED" ? `<button type="button" class="cancel-booking" data-cancel="${escapeHtml(token)}">Отменить запись</button>` : ""}</div><p class="policy-note">Демо-режим: пример страницы управления записью.</p></div>`;
    $("[data-calendar]", content)?.addEventListener("click", () => { state.date = booking.date; state.time = booking.time; state.service = state.services.find((service) => service.name === booking.serviceName) || { name: booking.serviceName, duration: booking.duration }; state.confirmed = booking; toCalendarDate(); });
  } catch (error) { content.innerHTML = `${heading("ССЫЛКА НА ЗАПИСЬ", "Запись не найдена.", "Проверь ссылку или свяжись с барбершопом.")}<a class="button button-dark" href="./">На главную</a>`; }
}

dialog.addEventListener("click", async (event) => {
  const button = event.target.closest("button"); if (!button) return;
  if (button.matches("[data-close]")) return closeBooking();
  if (button.matches("[data-pick-service]")) { state.service = state.services.find((item) => item.id === Number(button.dataset.pickService)); state.step = 2; state.dayStates = {}; renderBooking(); await loadDateStatus(); }
  if (button.matches("[data-back]")) { state.step = Math.max(1, state.step - 1); renderBooking(); }
  if (button.matches("[data-date]")) { await selectDate(button.dataset.date); }
  if (button.matches("[data-next-date]")) { const selected = $("[data-date].selected", content)?.dataset.date || $("[data-calendar]", content)?.value; if (selected) await selectDate(selected); }
  if (button.matches("[data-time]")) { state.time = button.dataset.time; renderBooking(); }
  if (button.matches("[data-next-time]")) { state.step = 4; renderBooking(); }
  if (button.matches("[data-nearest]")) await findNearest();
  if (button.matches("[data-confirm]")) await submitBooking();
  if (button.matches("[data-cancel]")) {
    button.disabled = true;
    try { await api(`/api/bookings/${encodeURIComponent(button.dataset.cancel)}/cancel`, { method: "POST", body: "{}" }); toast("Запись отменена."); await renderManageBooking(button.dataset.cancel); }
    catch (error) { toast(error.message); button.disabled = false; }
  }
});

dialog.addEventListener("change", async (event) => {
  if (event.target.matches("[data-calendar]")) {
    const chosen = event.target.value; if (!chosen) return;
    if (chosen > addDays(dateForInput(new Date()), state.config.horizonDays)) return toast("Запись доступна только в пределах расписания.");
    try {
      const data = await api(`/api/availability?date=${chosen}&serviceId=${state.service.id}&barberId=${state.barber}`);
      state.date = chosen; state.availability = data; state.step = 3; renderBooking();
    } catch (error) { toast(error.message); }
  }
});
dialog.addEventListener("submit", (event) => {
  if (!event.target.matches("#contact-form")) return;
  event.preventDefault();
  const form = new FormData(event.target), country = form.get("country");
  const typed = String(form.get("phone") || "").trim();
  const fullPhone = typed.startsWith("+") ? typed : `${country}${typed.replace(/^0+/, "")}`;
  if (!/^\+[1-9]\d{7,14}$/.test(fullPhone.replace(/[\s().-]/g, ""))) { toast("Проверь номер телефона в международном формате."); return; }
  state.contact = { name: String(form.get("name")).trim(), fullPhone: fullPhone.replace(/[\s().-]/g, ""), comment: String(form.get("comment") || "").trim() };
  state.step = 5; renderBooking();
});
async function submitBooking() {
  if (state.pending) return;
  state.pending = true; renderBooking();
  try {
    const result = await api("/api/bookings", { method: "POST", body: JSON.stringify({ serviceId: state.service.id, barberId: state.barber, date: state.date, startTime: state.time, customerName: state.contact.name, phone: state.contact.fullPhone, comment: state.contact.comment, idempotencyKey: crypto.randomUUID() }) });
    state.confirmed = { ...result, customerName: state.contact.name }; state.step = 6; renderBooking();
  } catch (error) {
    state.step = 3; state.time = ""; state.pending = false;
    try { state.availability = await api(`/api/availability?date=${state.date}&serviceId=${state.service.id}&barberId=${state.barber}`); } catch { state.availability = null; }
    renderBooking(); toast(error.status === 409 ? "Это время только что заняли. Выбери другое." : error.message);
  }
}
document.addEventListener("click", (event) => {
  const book = event.target.closest("[data-book]"); if (book) { event.preventDefault(); openBooking(); }
  const service = event.target.closest("[data-service]"); if (service) { event.preventDefault(); openBooking(service.dataset.service); }
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dialog.open) closeBooking(); });

async function boot() {
  try {
    [state.config, state.services, state.barbers] = await Promise.all([api("/api/config"), api("/api/services"), api("/api/barbers")]);
    applyBrand(); renderCatalog();
    const match = /^\/booking\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
    if (match) await renderManageBooking(match[1]);
  } catch (error) { toast(error.message); }
}
boot();
