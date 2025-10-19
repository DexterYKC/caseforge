// ==============================
// CaseForge — app.js (CDN build)
// ==============================

// Firebase CDN imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc, serverTimestamp, runTransaction,
  onSnapshot, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  getStorage, ref as sref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// ---- CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyCUi5u-fB6rjOYC4jNRzAur146oz11HFjE",
  authDomain: "mvp-case-opening-login.firebaseapp.com",
  projectId: "mvp-case-opening-login",
  storageBucket: "mvp-case-opening-login.firebasestorage.app",
  messagingSenderId: "213272608509",
  appId: "1:213272608509:web:54853eefefe2abbe2d8894"
};
const ADMIN_EMAILS = ["ykacem59@gmail.com"];
const PROXY_BASE   = ""; // optional payment proxy

// ---- INIT
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

// session persistence
(async ()=>{ try{ await setPersistence(auth, browserLocalPersistence); } catch(e){ console.warn(e); } })();

// ---- Helpers
const $     = (s)=>document.querySelector(s);
const state = { user:null, userDoc:null, cases:[], selectedCase:null };
const fmt   = (n)=> `$${Number(n||0).toFixed(2)}`;
const show  = (sel, yes=true)=>{ const el=$(sel); if(el) el.classList.toggle('hidden', !yes); };
function showView(view){
  show('#cases-grid',  view === 'cases');
  show('#inventory',   view === 'inventory');
  show('#case-detail', view === 'detail');
}

// ===================
// Navigation
// ===================
$('#nav-home').onclick  = ()=> showView('cases');
$('#nav-cases').onclick = ()=> showView('cases');
$('#nav-inventory').onclick = ()=>{
  if(!state.user){ show('#auth-modal', true); return; }
  showView('inventory'); // inventory auto-renders via onSnapshot
};

// ===================
// Auth UI (tabs)
// ===================
$('#btn-login').onclick  = ()=> show('#auth-modal', true);
$('#close-auth').onclick = ()=> show('#auth-modal', false);
$('#btn-logout').onclick = ()=> signOut(auth);

$('#tab-login').onclick = ()=>{
  $('#tab-login').classList.add('active'); $('#tab-signup').classList.remove('active');
  show('#login-view', true); show('#signup-view', false);
};
$('#tab-signup').onclick = ()=>{
  $('#tab-signup').classList.add('active'); $('#tab-login').classList.remove('active');
  show('#login-view', false); show('#signup-view', true);
};

// Login
$('#do-login').onclick = async ()=>{
  const e = $('#auth-email').value.trim();
  const p = $('#auth-pass').value.trim();
  $('#auth-status').textContent = '';
  try{
    await signInWithEmailAndPassword(auth, e, p);
  }catch(err){
    console.error(err);
    $('#auth-status').textContent = err.code || err.message;
  }
};

// Sign up with username + email verification
$('#do-signup').onclick = async ()=>{
  const uname = $('#su-username').value.trim().toLowerCase();
  const email = $('#su-email').value.trim();
  const pass1 = $('#su-pass').value; const pass2 = $('#su-pass2').value;
  $('#auth-status').textContent = '';

  if(!uname || !email || !pass1){ $('#auth-status').textContent = 'Fill all fields'; return; }
  if(pass1 !== pass2){ $('#auth-status').textContent = 'Passwords don’t match'; return; }
  if(!/^[a-z0-9_]{3,20}$/.test(uname)){ $('#auth-status').textContent = 'Username invalid'; return; }

  try{
    // reserve username via tx
    const unameRef = doc(db,'usernames', uname);
    await runTransaction(db, async (tx)=>{
      const s = await tx.get(unameRef);
      if (s.exists()) throw new Error('Username already taken');
      // temp reservation; link uid after user created
    });

    // create auth user
    const cred = await createUserWithEmailAndPassword(auth, email, pass1);

    // finalize username->uid
    await runTransaction(db, async (tx)=>{
      const s = await tx.get(unameRef);
      if (s.exists()) throw new Error('Username already taken');
      tx.set(unameRef, { uid: cred.user.uid, createdAt: serverTimestamp() });
    });

    // create user doc
    await setDoc(doc(db,'users',cred.user.uid),{
      email, username: uname, balance:0, role:'user',
      level:1, xp:0, avatar:'', createdAt: serverTimestamp()
    });

    await sendEmailVerification(cred.user);
    $('#auth-status').textContent = 'Verification email sent. Check your inbox.';
  }catch(err){
    console.error(err);
    $('#auth-status').textContent = err.message || err.code;
  }
};

// Avatar upload (bound once)
$('#avatar-upload').onclick = async ()=>{
  try{
    const f = $('#avatar-file').files[0];
    if(!f || !state.user) return;
    const r = sref(storage, `avatars/${state.user.uid}.jpg`);
    await uploadBytes(r, f);
    const url = await getDownloadURL(r);
    await updateDoc(doc(db,'users',state.user.uid), { avatar:url });
    $('#avatar').src = url;
  }catch(e){ alert('Upload failed'); console.error(e); }
};

onAuthStateChanged(auth, async (user)=>{
  state.user = user;
  show('#btn-login', !user);
  show('#btn-logout', !!user);
  show('#auth-modal', false);
  show('#nav-admin', !!user && ADMIN_EMAILS.includes(user?.email));

  if(user && !user.emailVerified){
    console.warn('Email not verified');
    // If you want to hard-block case openings, flip a flag here.
  }

  if(!user){
    $('#balance').textContent = '$0.00';
    if (invUnsub) { invUnsub(); invUnsub = null; }
    return;
  }

  // ensure user doc
  const uref = doc(db,'users', user.uid);
  const snap = await getDoc(uref);
  if(!snap.exists()){
    await setDoc(uref, { email:user.email, balance:0, role:'user', level:1, xp:0, avatar:'', createdAt:serverTimestamp() });
  }

  state.userDoc = (await getDoc(uref)).data();
  $('#balance').textContent   = fmt(state.userDoc.balance||0);
  $('#pf-username').textContent = state.userDoc.username || user.email || '';
  $('#pf-level').textContent    = `Level ${state.userDoc.level||1} — ${state.userDoc.xp||0} XP`;
  $('#avatar').src              = state.userDoc.avatar || 'https://picsum.photos/80';

  subscribeInventory();
});

$('#sell-all').onclick = async ()=>{
  if(!state.user){ show('#auth-modal', true); return; }

  const invCol = collection(db,'users',state.user.uid,'inventory');
  const qs = await getDocs(invCol);
  if(qs.empty){ alert('Inventory is empty'); return; }

  let total = 0;
  const ids = [];
  qs.forEach(d=>{
    const it = d.data().item || d.data();
    total += Number(it.value||0);
    ids.push(d.id);
  });

  try{
    // crédite toute la somme
    await runTransaction(db, async (tx)=>{
      const uref = doc(db,'users',state.user.uid);
      const usnap= await tx.get(uref);
      const u = usnap.data() || { balance:0 };
      tx.update(uref, { balance: (u.balance||0) + total });
    });

    // supprime tous les items
    await Promise.all(ids.map(id => deleteDoc(doc(db,'users',state.user.uid,'inventory', id))));

    // refresh header + petit effet
    const snap = await getDoc(doc(db,'users',state.user.uid));
    state.userDoc = snap.data();
    $('#balance').textContent = fmt(state.userDoc.balance||0);
    bumpBalance(total);
  }catch(err){
    console.error(err);
    alert('Sell all failed');
  }
};




// ===================
// Cases (list + detail)
// ===================
async function loadCases(){
  const arr = [];
  const qs  = await getDocs(collection(db,'cases'));
  qs.forEach(d => arr.push({ id:d.id, ...d.data() }));
  state.cases = arr;
  renderCases();
}
function renderCases(){
  const grid = $('#cases-grid'); grid.innerHTML = '';
  state.cases.forEach(c=>{
    const card = document.createElement('div');
    card.className = 'card case-card';
    card.innerHTML = `
      <img src="${c.image||'https://picsum.photos/600/300?blur=2'}" alt=""
           style="width:100%;height:140px;object-fit:cover;border-radius:12px"/>
      <h4>${c.name}</h4>
      <div class="row">
        <span class="badge">${c.items?.length||0} items</span>
        <span class="price">${fmt(c.price)}</span>
      </div>
      <button class="view-case">View</button>`;

    // bouton “View”
    card.querySelector('.view-case').onclick = (e)=> { e.stopPropagation(); showCaseDetail(c); };
    // toute la carte
    card.addEventListener('click', (e)=>{
      if (e.target.closest('button')) return; // ignore click sur le bouton
      showCaseDetail(c);
    });

    grid.appendChild(card);
  });
}

loadCases();

function showCaseDetail(c){
  state.selectedCase = c;
  $('#cd-name').textContent  = c.name;
  $('#cd-price').textContent = `Price: ${fmt(c.price)}`;
  $('#cd-image').src         = c.image || 'https://picsum.photos/800/400?blur=1';

  // bouton “Open for $X.XX”
  const openBtn = $('#cd-open');
  openBtn.textContent = `Open for ${fmt(c.price)}`;
  openBtn.onclick = ()=> openSelectedCase();

  $('#back-to-cases').onclick = ()=> showView('cases');

  const list = $('#cd-items'); list.innerHTML = '';
  (c.items||[]).forEach(it=>{
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${it.img||'https://picsum.photos/200'}"
           style="width:100%;height:120px;object-fit:cover;border-radius:12px"/>
      <h4>${it.name}</h4>
      <div class="badge">${it.rarity||''}</div>
      <div class="price">${fmt(it.value)}</div>`;
    list.appendChild(div);
  });

  $('#cd-open').onclick = ()=> openSelectedCase();
  $('#back-to-cases').onclick = ()=> showView('cases');
  showView('detail');
}

// ===================
// Opening logic
// ===================
function weightedPick(items){
  const total = items.reduce((s,i)=> s + Number(i.weight||1), 0);
  let roll = Math.random()*total;
  for(const i of items){ if((roll -= Number(i.weight||1)) <= 0) return i; }
  return items.at(-1);
}

async function addXP(amount=10){
  if(!state.user) return;
  await runTransaction(db, async (tx)=>{
    const uref = doc(db,'users',state.user.uid);
    const usnap = await tx.get(uref);
    const u = usnap.data() || { xp:0, level:1 };
    let xp = (u.xp||0) + amount;
    let lvl = u.level||1;
    const need = lvl*100; // basic curve
    if (xp >= need){ xp -= need; lvl += 1; }
    tx.update(uref, { xp, level: lvl });
  });
  const s = await getDoc(doc(db,'users',state.user.uid));
  $('#pf-level').textContent = `Level ${s.data().level} — ${s.data().xp} XP`;
}

async function openSelectedCase(){
  const c = state.selectedCase;
  if(!c) return;
  if(!state.user){ show('#auth-modal', true); return; }

  // debit transaction
  try{
    await runTransaction(db, async (tx)=>{
      const uref = doc(db,'users',state.user.uid);
      const usnap = await tx.get(uref);
      const u = usnap.data();
      if(!u || (u.balance||0) < c.price) throw new Error('Insufficient balance');
      tx.update(uref,{ balance:(u.balance||0) - c.price });
    });
  }catch(e){ alert(e.message); return; }

  // optimistic UI
  if(state.userDoc){
    state.userDoc.balance = (state.userDoc.balance||0) - c.price;
    $('#balance').textContent = fmt(state.userDoc.balance);
  }

  openCase(c);
}

async function openCase(c){
  $('#open-title').textContent = `Opening ${c.name}…`;

  const wheel = $('#wheel'); wheel.innerHTML = '';
  const strip = document.createElement('div'); strip.className = 'strip';
  wheel.appendChild(strip);

  const VIS_COUNT = 60;
  const CENTER    = Math.floor(VIS_COUNT/2);
  const win = weightedPick(c.items);

  const rand = ()=> c.items[Math.floor(Math.random()*c.items.length)];
  const pool = Array.from({length: VIS_COUNT}, rand);
  pool[CENTER] = win;

  pool.forEach(i=>{
    const cell = document.createElement('div');
    cell.className = 'item';
    cell.innerHTML = `
      <img src="${i.img||'https://picsum.photos/100'}"/>
      <div>${i.name}</div>
      <div class="badge">${i.rarity||''}</div>`;
    strip.appendChild(cell);
  });

  strip.style.transition = 'none';
  strip.style.transform  = 'translateX(0px)';
  show('#open-modal', true);

  await new Promise(r=> requestAnimationFrame(r));
  const cellW = strip.querySelector('.item').getBoundingClientRect().width + 8;
  const targetOffset = -(CENTER*cellW - (wheel.clientWidth/2 - cellW/2));

  await new Promise(r=> requestAnimationFrame(r));
  strip.style.transition = 'transform 2.6s cubic-bezier(.08,.9,.05,1)';
  strip.style.transform  = `translateX(${targetOffset}px)`;

  setTimeout(async ()=>{
    $('#result').textContent = `You won: ${win.name} (${fmt(win.value)})`;
    $('#result').style.color = 'var(--win)';
    show('#open-again', true);
    $('#open-again').onclick = ()=> openSelectedCase();

    // persist spin + inventory (flat shape for Sell)
    const spinRef = await addDoc(collection(db,'spins'),{
      uid: state.user.uid, caseId: c.id, item: win, price: c.price,
      ts: serverTimestamp(), roll: Math.random()
    });
    await addDoc(collection(db,'users',state.user.uid,'inventory'),{
      name:  win.name,
      value: Number(win.value || 0),
      rarity: win.rarity || '',
      img:   win.img || '',
      item:  win,
      spinId: spinRef.id,
      ts: serverTimestamp()
    });

    // resync balance (safety)
    const snap = await getDoc(doc(db,'users',state.user.uid));
    $('#balance').textContent = fmt((snap.data()?.balance)||0);

    // XP tick
    await addXP(10);
  }, 2700);
}

function bumpBalance(delta){
  if(!delta) return;
  const b = $('#balance');
  const rect = b.getBoundingClientRect();
  const fx = document.createElement('div');
  fx.className = 'money-fx';
  fx.textContent = `+${Number(delta).toFixed(2)}`;
  fx.style.left = (rect.left + rect.width/2) + 'px';
  fx.style.top  = (rect.top - 4) + 'px';
  document.body.appendChild(fx);
  setTimeout(()=> fx.remove(), 900);
}

$('#close-open').onclick = ()=> show('#open-modal', false);

// ===================
// Inventory (live)
// ===================
let invUnsub = null;
function subscribeInventory() {
  if (invUnsub) { invUnsub(); invUnsub = null; }
  if (!state.user) return;

  const ref = collection(db, 'users', state.user.uid, 'inventory');
  invUnsub = onSnapshot(ref, snap => {
    const invGrid = $('#inv-grid'); 
    if (!invGrid) return;
    invGrid.innerHTML = '';
    if (snap.empty) {
      invGrid.innerHTML = '<div class="muted">Your inventory is empty.</div>';
      return;
    }
    snap.forEach(d => {
      const it = d.data().item || d.data();
      const id = d.id;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <img src="${it.img || 'https://picsum.photos/400'}"
             style="width:100%;height:120px;object-fit:cover;border-radius:12px"/>
        <h4>${it.name}</h4>
        <div class="badge">${it.rarity || ''}</div>
        <div class="price">${fmt(it.value)}</div>
        <button class="sell-btn" data-id="${id}" data-value="${Number(it.value||0)}">Sell</button>
      `;
      invGrid.appendChild(card);
    });
  });
}

// Optional one-shot loader (not strictly needed with onSnapshot)
async function loadInventory(){
  const invGrid = $('#inv-grid'); invGrid.innerHTML='';
  const items = await getDocs(collection(db,'users',state.user.uid,'inventory'));
  if (items.empty) {
    invGrid.innerHTML = '<div class="muted">Your inventory is empty.</div>';
    return;
  }
  items.forEach(d=>{
    const it = d.data().item || d.data();
    const id = d.id;
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <img src="${it.img||'https://picsum.photos/400'}"
           style="width:100%;height:120px;object-fit:cover;border-radius:12px"/>
      <h4>${it.name}</h4>
      <div class="badge">${it.rarity||''}</div>
      <div class="price">${fmt(it.value)}</div>
      <button class="sell-btn" data-id="${id}" data-value="${Number(it.value||0)}">Sell</button>
    `;
    invGrid.appendChild(card);
  });
}

// Sell via event delegation
document.body.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.sell-btn');
  if (!btn) return;
  if (!state.user) { show('#auth-modal', true); return; }

  const itemId = btn.dataset.id;
  const val = Number(btn.dataset.value||0);

  try{
    // credit balance
    await runTransaction(db, async (tx)=>{
      const uref = doc(db,'users',state.user.uid);
      const usnap = await tx.get(uref);
      const u = usnap.data() || { balance:0 };
      tx.update(uref, { balance: (u.balance||0) + val });
    });
    // remove item
    await deleteDoc(doc(db, 'users', state.user.uid, 'inventory', itemId));
    // update header
    const snap = await getDoc(doc(db,'users',state.user.uid));
    state.userDoc = snap.data();
    $('#balance').textContent = fmt(state.userDoc.balance);
    // fx
    bumpBalance(val);
  }catch(err){
    console.error('Sell failed:', err);
    alert(err.message || 'Sell failed');
  }
});

// ===================
// Deposits (codes + proxy placeholder)
// ===================
const depModal = document.querySelector('#deposit-modal');

document.body.addEventListener('click', (e)=>{
  const id = e.target.id;

  if (id === 'btn-deposit') show('#deposit-modal', true);
  if (id === 'close-dep')   show('#deposit-modal', false);

  if (id === 'redeem-toggle') {
    document.querySelector('#redeem-wrap')?.classList.toggle('hidden');
  }

  if (id === 'redeem-do') {
    (async ()=>{
      if(!state.user) return;
      const code = document.querySelector('#redeem-code').value.trim();
      const map = { TEST10:10, TEST25:25, TEST50:50 };
      const amount = map[code];
      if(!amount){ document.querySelector('#dep-status').textContent='Invalid code'; return; }

      await runTransaction(db, async (tx)=>{
        const uref = doc(db,'users',state.user.uid);
        const usnap = await tx.get(uref);
        const u = usnap.data();
        tx.update(uref,{ balance:(u.balance||0)+amount });
      });

      document.querySelector('#dep-status').textContent = `Redeemed ${fmt(amount)}`;
      const snap = await getDoc(doc(db,'users',state.user.uid));
      $('#balance').textContent = fmt(snap.data().balance);
    })();
  }

  if (id === 'dep-create') {
    (async ()=>{
      const amount = Number(document.getElementById('dep-amount').value||0);
      if(amount < 5){ document.getElementById('dep-status').textContent='Minimum is $5'; return; }
      if(!PROXY_BASE){ document.getElementById('dep-status').textContent='No payment proxy configured'; return; }
      try{
        const r = await fetch(`${PROXY_BASE}/api/nowpayments/create-invoice`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ amountUSD: amount, uid: state.user.uid })
        });
        const data = await r.json();
        if(!data || !data.invoice_url) throw new Error('Bad response');
        document.getElementById('dep-status').innerHTML =
          `<a href="${data.invoice_url}" target="_blank">Open crypto checkout</a>`;
      }catch(err){
        document.getElementById('dep-status').textContent = 'Failed to create invoice';
      }
    })();
  }
});

// Esc + backdrop
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') show('#deposit-modal', false); });
if (depModal) {
  depModal.addEventListener('click', (e)=>{ if(e.target===depModal) show('#deposit-modal', false); });
}

// === Withdraw UI open/close
$('#btn-withdraw').onclick = ()=>{
  if(!state.user){ show('#auth-modal', true); return; }
  $('#wd-status').textContent = '';
  show('#withdraw-modal', true);
};
$('#wd-close').onclick = ()=> show('#withdraw-modal', false);

// === Basic address validators (lightweight)
function looksLikeAddress(addr, currency, network){
  if(!addr || addr.length < 10) return false;
  if(currency === 'BTC') {
    // starts with 1,3,bc1 (super basique)
    return /^(1|3|bc1)[a-zA-Z0-9]{20,}$/i.test(addr);
  }
  if(currency === 'ETH' || (currency==='USDT' && network==='ETHEREUM')) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
  if(currency === 'USDT' && network === 'TRON') {
    // TRC20 T...
    return /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(addr);
  }
  return true; // fallback
}

// === Withdraw submit
$('#wd-submit').onclick = async ()=>{
  if(!state.user){ show('#auth-modal', true); return; }

  const amount  = Number($('#wd-amount').value||0);
  const currency= $('#wd-currency').value;
  const network = $('#wd-network').value;
  const address = $('#wd-address').value.trim();
  const statusEl= $('#wd-status');

  statusEl.textContent = '';

  // hard validation MVP
  if(amount < 10){ statusEl.textContent = 'Minimum withdraw is $10'; return; }
  if(!looksLikeAddress(address, currency, network)){ statusEl.textContent = 'Invalid address'; return; }

  try{
    // 1) Hold funds immediately to prevent abuse (transaction)
    await runTransaction(db, async (tx)=>{
      const uref = doc(db,'users',state.user.uid);
      const usnap= await tx.get(uref);
      const u    = usnap.data() || { balance:0 };
      if((u.balance||0) < amount) throw new Error('Insufficient balance');
      tx.update(uref, { balance: (u.balance||0) - amount });
    });

    // 2) Create withdrawal request
    const wref = await addDoc(collection(db,'withdrawals'),{
      uid: state.user.uid,
      amountUSD: amount,
      currency, network, address,
      status: 'requested',   // only allowed on create by rules
      createdAt: serverTimestamp(),
    });

    // 3) Resync header balance
    const snap = await getDoc(doc(db,'users',state.user.uid));
    state.userDoc = snap.data();
    $('#balance').textContent = fmt(state.userDoc.balance||0);

    // 4) Optional: ping your payout proxy to queue the send (admin will approve)
    if(PROXY_BASE){
      try{
        const r = await fetch(`${PROXY_BASE}/api/payouts/create`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            wid: wref.id,
            uid: state.user.uid,
            amountUSD: amount,
            currency, network, address
          })
        });
        if(!r.ok) throw new Error('Proxy error');
      }catch(e){
        console.warn('Proxy notify failed (admin can still approve in panel).', e);
      }
    }

    statusEl.textContent = 'Withdraw requested. Admin will review.';
    show('#withdraw-modal', false);
  }catch(err){
    // if it failed after balance was deducted? we deducted only inside tx above; failures before addDoc do not refund. Here it failed before addDoc, so nothing to refund.
    console.error(err);
    statusEl.textContent = err.message || 'Withdraw failed';
  }
};
