import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TicketService {
  id: number; name: string; type: 'Bus' | 'Train' | 'Movie' | 'Event'; from: string; to: string;
  date: string; times: string[]; price: number; rating: number; availableSeats: number; desc: string; icon: string;
}
export interface BookingReceipt {
  bookingId: string; userEmail: string; serviceId: number; serviceName: string; serviceType: string;
  from: string; to: string; date: string; time: string; ticketCount: number; pricePerTicket: number;
  totalPrice: number; payment: string; status: 'Confirmed' | 'Cancelled'; timestamp: number;
}
interface Toast { id: number; msg: string; kind: 'success' | 'error' | 'warning' | 'info'; }
interface User { name: string; email: string; phone?: string; }

const K = { user: 'ticketgo_user', users: 'ticketgo_users', bookings: 'ticketgo_bookings',
  favs: 'ticketgo_favorites', services: 'ticketgo_services', theme: 'ticketgo_theme' };

const DEFAULTS: TicketService[] = [
  { id: 1, name: 'Chennai → Bangalore Express', type: 'Bus', from: 'Chennai', to: 'Bangalore', date: '2026-10-05', times: ['06:00 AM', '09:00 AM', '10:30 PM'], price: 800, rating: 4.6, availableSeats: 24, icon: '🚌', desc: 'AC sleeper coach with charging ports, blankets and live tracking.' },
  { id: 2, name: 'Chennai → Coimbatore Deluxe', type: 'Bus', from: 'Chennai', to: 'Coimbatore', date: '2026-10-06', times: ['08:00 PM', '10:00 PM'], price: 650, rating: 4.3, availableSeats: 8, icon: '🚌', desc: 'Semi-sleeper overnight service with two comfort stops.' },
  { id: 3, name: 'Chennai → Madurai Superfast', type: 'Train', from: 'Chennai', to: 'Madurai', date: '2026-10-07', times: ['07:15 AM', '09:30 PM'], price: 450, rating: 4.7, availableSeats: 40, icon: '🚆', desc: 'Superfast express with AC chair car and onboard catering.' },
  { id: 4, name: 'Bengaluru → Hyderabad Rail', type: 'Train', from: 'Bengaluru', to: 'Hyderabad', date: '2026-10-09', times: ['06:30 AM', '08:45 PM'], price: 1200, rating: 4.5, availableSeats: 0, icon: '🚆', desc: 'Premium intercity train with reclining seats and Wi-Fi.' },
  { id: 5, name: 'Leo – Tamil Action Blockbuster', type: 'Movie', from: 'PVR Chennai', to: 'Screen 3', date: '2026-10-08', times: ['01:00 PM', '04:30 PM', '08:00 PM'], price: 300, rating: 4.8, availableSeats: 60, icon: '🎬', desc: 'Dolby Atmos screening of the high-octane action thriller.' },
  { id: 6, name: 'Tech Conference 2026', type: 'Event', from: 'Chennai Trade Centre', to: 'Hall A', date: '2026-10-15', times: ['09:00 AM', '02:00 PM'], price: 1800, rating: 4.9, availableSeats: 6, icon: '🎤', desc: 'Keynotes, workshops and networking with leading engineers.' },
];

@Component({
  selector: 'app-root', standalone: true, imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './app.html',
})
export class App {
  categories = ['All', 'Bus', 'Train', 'Movie', 'Event', 'Favorites'];
  steps = ['Select Service', 'Date & Time', 'Tickets', 'Payment', 'Confirmation'];
  today = new Date().toISOString().slice(0, 10);

  loading = signal(true);
  searchTerm = signal('');
  selectedCategory = signal('All');
  sortBy = signal('recommended');
  minPrice = signal(0);
  maxPrice = signal(2000);
  services = signal<TicketService[]>(this.load(K.services, DEFAULTS));
  favorites = signal<number[]>(this.load(K.favs, []));
  user = signal<User | null>(this.load<User | null>(K.user, null));
  bookings = signal<BookingReceipt[]>(this.load(K.bookings, []));
  theme = signal<string>(this.load(K.theme, 'light'));

  selectedService = signal<TicketService | null>(null);
  detail = signal<TicketService | null>(null);
  selectedDate = signal('');
  selectedTime = signal('');
  ticketCount = signal(1);
  dateError = signal('');

  modal = signal<'' | 'login' | 'bookings' | 'profile' | 'payment' | 'receipt' | 'cancel' | 'detail'>('');
  authMode = signal<'login' | 'signup'>('login');
  authError = signal('');
  menuOpen = signal(false);
  profileOpen = signal(false);
  payMethod = signal('UPI');
  payError = signal('');
  processing = signal(false);
  paid = signal(false);
  receipt = signal<BookingReceipt | null>(null);
  cancelId = signal('');
  toasts = signal<Toast[]>([]);
  pendingBooking = false;
  private toastId = 0;

  form = { name: '', email: '', phone: '', password: '', confirm: '' };
  pay = { upi: '', card: '', exp: '', cvv: '', holder: '' };

  maxQty = computed(() => { const s = this.selectedService(); return s ? Math.max(0, Math.min(10, s.availableSeats)) : 10; });
  total = computed(() => (this.selectedService()?.price ?? 0) * this.ticketCount());
  // Filtered + sorted copy (original services array is never mutated)
  visible = computed(() => {
    const q = this.searchTerm().trim().toLowerCase(), cat = this.selectedCategory(), favs = this.favorites();
    const list = this.services().filter(s => {
      const hay = [s.name, s.type, s.from, s.to, s.date, String(s.rating)].join(' ').toLowerCase();
      return (!q || hay.includes(q)) && (cat === 'All' || (cat === 'Favorites' ? favs.includes(s.id) : s.type === cat))
        && s.price >= this.minPrice() && s.price <= this.maxPrice();
    });
    const sorted = [...list];
    switch (this.sortBy()) {
      case 'low': sorted.sort((a, b) => a.price - b.price); break;
      case 'high': sorted.sort((a, b) => b.price - a.price); break;
      case 'rating': sorted.sort((a, b) => b.rating - a.rating); break;
      case 'seats': sorted.sort((a, b) => b.availableSeats - a.availableSeats); break;
    }
    return sorted;
  });
  myBookings = computed(() => { const u = this.user(); return u ? this.bookings().filter(b => b.userEmail === u.email).sort((a, b) => b.timestamp - a.timestamp) : []; });
  step = computed(() => {
    if (this.modal() === 'receipt' && this.paid()) return 5;
    if (this.modal() === 'payment') return 4;
    if (!this.selectedService()) return 1;
    return this.selectedDate() && this.selectedTime() ? 3 : 2;
  });

  constructor() {
    effect(() => { document.documentElement.dataset['theme'] = this.theme(); this.save(K.theme, this.theme()); });
    effect(() => this.save(K.services, this.services()));
    effect(() => this.save(K.favs, this.favorites()));
    effect(() => this.save(K.bookings, this.bookings()));
    effect(() => this.save(K.user, this.user()));
    setTimeout(() => this.loading.set(false), 900); // realistic loading state
  }

  // ---------- persistence ----------
  load<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(key); if (raw === null) return fallback; const v = JSON.parse(raw); return v ?? fallback; }
    catch { return fallback; }
  }
  save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore quota errors */ } }

  // ---------- helpers ----------
  showToast(msg: string, kind: Toast['kind'] = 'success') {
    const id = ++this.toastId;
    this.toasts.update(t => [...t, { id, msg, kind }]);
    setTimeout(() => this.toasts.update(t => t.filter(x => x.id !== id)), 3500);
  }
  stars(r: number) { const n = Math.round(r); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  seatStatus(s: TicketService) {
    return s.availableSeats === 0 ? { label: 'Sold Out', cls: 'out' } : s.availableSeats <= 10 ? { label: 'Few seats left', cls: 'few' } : { label: 'Available', cls: 'ok' };
  }
  scrollTo(id: string) { this.menuOpen.set(false); this.profileOpen.set(false); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  openBookings() { this.menuOpen.set(false); if (this.user()) this.modal.set('bookings'); else { this.showToast('Please login to view your bookings.', 'warning'); this.openAuth(); } }
  closeModal() { this.modal.set(''); this.detail.set(null); this.processing.set(false); }
  toggleTheme() { this.theme.update(t => (t === 'light' ? 'dark' : 'light')); }

  // ---------- filters ----------
  setPrice(kind: 'min' | 'max', v: number) {
    if (kind === 'min') this.minPrice.set(Math.min(v, this.maxPrice())); else this.maxPrice.set(Math.max(v, this.minPrice()));
  }
  resetFilters() { this.searchTerm.set(''); this.selectedCategory.set('All'); this.sortBy.set('recommended'); this.minPrice.set(0); this.maxPrice.set(2000); }
  isFavorite(id: number) { return this.favorites().includes(id); }
  toggleFavorite(id: number, e?: Event) {
    e?.stopPropagation();
    const adding = !this.isFavorite(id);
    this.favorites.update(f => (adding ? [...f, id] : f.filter(x => x !== id)));
    this.showToast(adding ? 'Added to favorites' : 'Removed from favorites', adding ? 'success' : 'info');
  }

  // ---------- selection ----------
  openDetail(s: TicketService) { this.detail.set(s); this.modal.set('detail'); }
  selectService(s: TicketService) {
    if (s.availableSeats === 0) { this.showToast('This service is sold out.', 'error'); return; }
    this.selectedService.set(s);
    this.selectedDate.set(s.date >= this.today ? s.date : this.today);
    this.selectedTime.set(''); this.ticketCount.set(1); this.dateError.set('');
    this.closeModal(); this.scrollTo('booking');
  }
  onDate(v: string) {
    this.selectedDate.set(v);
    this.dateError.set(!v || v < this.today ? 'Please select a valid future date.' : '');
  }
  changeQty(d: number) {
    const n = this.ticketCount() + d;
    if (n < 1) return;
    if (n > this.maxQty()) { this.showToast(`Only ${this.maxQty()} tickets can be booked.`, 'warning'); return; }
    this.ticketCount.set(n);
  }

  // ---------- auth (frontend demo only) ----------
  openAuth(mode: 'login' | 'signup' = 'login') { this.form = { name: '', email: '', phone: '', password: '', confirm: '' }; this.authError.set(''); this.authMode.set(mode); this.modal.set('login'); this.menuOpen.set(false); this.profileOpen.set(false); }
  private validEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  login() {
    const f = this.form, users = this.load<(User & { password: string })[]>(K.users, []);
    if (!f.email || !f.password) return this.authError.set('Email and password are required.');
    if (!this.validEmail(f.email)) return this.authError.set('Enter a valid email address.');
    const u = users.find(x => x.email.toLowerCase() === f.email.toLowerCase() && x.password === f.password);
    if (!u) return this.authError.set('Invalid email or password. Create an account if you are new.');
    this.finishAuth({ name: u.name, email: u.email, phone: u.phone }, 'Logged in successfully');
  }
  signup() {
    const f = this.form, users = this.load<(User & { password: string })[]>(K.users, []);
    if (!f.name || !f.email || !f.phone || !f.password || !f.confirm) return this.authError.set('All fields are required.');
    if (!this.validEmail(f.email)) return this.authError.set('Enter a valid email address.');
    if (!/^\d{10}$/.test(f.phone.replace(/\D/g, '').slice(-10)) || f.phone.replace(/\D/g, '').length < 10) return this.authError.set('Enter a valid 10-digit phone number.');
    if (f.password.length < 6) return this.authError.set('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return this.authError.set('Passwords do not match.');
    if (users.some(x => x.email.toLowerCase() === f.email.toLowerCase())) return this.authError.set('An account with this email already exists.');
    this.save(K.users, [...users, { name: f.name, email: f.email, phone: f.phone, password: f.password }]);
    this.finishAuth({ name: f.name, email: f.email, phone: f.phone }, 'Account created. Welcome to TicketGo!');
  }
  forgotPassword() { this.showToast('Demo app: password reset is not available. Create a new account.', 'info'); }
  private finishAuth(u: User, msg: string) {
    this.user.set(u); this.closeModal(); this.showToast(msg);
    if (this.pendingBooking) { this.pendingBooking = false; this.confirmBooking(); } // resume booking, selection preserved
  }
  logout() { this.user.set(null); this.profileOpen.set(false); this.closeModal(); this.showToast('Logged out successfully', 'info'); }

  // ---------- booking ----------
  validateBooking(): string {
    const s = this.selectedService();
    if (!s) return 'Please select a service first.';
    if (!this.selectedDate()) return 'Please select a date.';
    if (this.selectedDate() < this.today) return 'Please select a valid future date.';
    if (!this.selectedTime()) return 'Please select a time slot.';
    if (this.ticketCount() < 1) return 'Select at least 1 ticket.';
    if (s.availableSeats === 0) return 'This service is sold out.';
    if (this.ticketCount() > s.availableSeats) return `Only ${s.availableSeats} seats are available.`;
    return '';
  }
  confirmBooking() {
    const err = this.validateBooking();
    if (err) { this.dateError.set(err.includes('date') ? err : ''); this.showToast(err, 'error'); return; }
    if (!this.user()) { this.pendingBooking = true; this.showToast('Please login before confirming your booking.', 'warning'); this.openAuth('login'); return; }
    this.pay = { upi: '', card: '', exp: '', cvv: '', holder: '' }; this.payError.set(''); this.paid.set(false);
    this.modal.set('payment');
  }
  validatePayment(): string {
    const m = this.payMethod(), p = this.pay;
    if (m === 'UPI' && !/^[\w.\-]{2,}@[\w]{2,}$/.test(p.upi.trim())) return 'Enter a valid UPI ID (e.g. name@bank).';
    if (m === 'Card') {
      if (!/^\d{16}$/.test(p.card.replace(/\s/g, ''))) return 'Card number must be 16 digits.';
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(p.exp)) return 'Expiry must be MM/YY.';
      if (!/^\d{3}$/.test(p.cvv)) return 'CVV must be 3 digits.';
      if (p.holder.trim().length < 2) return 'Enter the card holder name.';
    }
    return '';
  }
  processPayment() {
    if (this.processing()) return; // blocks double clicks
    const e = this.validatePayment(); this.payError.set(e); if (e) return;
    const re = this.validateBooking(); if (re) { this.payError.set(re); return; }
    this.processing.set(true);
    setTimeout(() => {
      this.paid.set(true);
      setTimeout(() => { this.createBooking(); this.processing.set(false); }, 900);
    }, 1600);
  }
  private newId(): string {
    const used = new Set(this.bookings().map(b => b.bookingId));
    let id = ''; do { id = 'TGO-' + Math.floor(100000 + Math.random() * 900000); } while (used.has(id));
    return id;
  }
  private createBooking() {
    const s = this.selectedService(), u = this.user(); if (!s || !u) return;
    const qty = this.ticketCount();
    const b: BookingReceipt = { bookingId: this.newId(), userEmail: u.email, serviceId: s.id, serviceName: s.name, serviceType: s.type, from: s.from, to: s.to,
      date: this.selectedDate(), time: this.selectedTime(), ticketCount: qty, pricePerTicket: s.price, totalPrice: s.price * qty,
      payment: this.payMethod(), status: 'Confirmed', timestamp: Date.now() }; // no card/UPI data stored
    this.bookings.update(l => [...l, b]);
    this.services.update(l => l.map(x => (x.id === s.id ? { ...x, availableSeats: x.availableSeats - qty } : x)));
    this.receipt.set(b); this.modal.set('receipt'); this.showToast('Booking confirmed successfully!');
    this.selectedService.set(null); this.selectedTime.set(''); this.ticketCount.set(1);
  }
  viewBooking(b: BookingReceipt) { this.paid.set(false); this.receipt.set(b); this.modal.set('receipt'); }
  askCancel(id: string) { this.cancelId.set(id); this.modal.set('cancel'); }
  cancelBooking() {
    const b = this.bookings().find(x => x.bookingId === this.cancelId());
    if (b && b.status === 'Confirmed') {
      this.bookings.update(l => l.map(x => (x.bookingId === b.bookingId ? { ...x, status: 'Cancelled' as const } : x)));
      this.services.update(l => l.map(x => (x.id === b.serviceId ? { ...x, availableSeats: x.availableSeats + b.ticketCount } : x)));
      this.showToast('Booking cancelled.', 'info');
    }
    this.modal.set('bookings');
  }
  printReceipt() { window.print(); }
  async shareBooking() {
    const b = this.receipt(); if (!b) return;
    const text = `TicketGo Booking ${b.bookingId}\n${b.serviceName}\n${b.date} ${b.time}\nTickets: ${b.ticketCount} | Total: ₹${b.totalPrice}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'TicketGo Booking', text }); return; }
      await navigator.clipboard.writeText(text); this.showToast('Booking details copied!');
    } catch { this.showToast('Could not share booking.', 'error'); }
  }
}
