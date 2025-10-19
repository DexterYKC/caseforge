// Firebase (CDN v12.4.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ==== CONFIG ====
const firebaseConfig = {
  apiKey: "AIzaSyCUi5u-fB6rjOYC4jNRzAur146oz11HFjE",
  authDomain: "mvp-case-opening-login.firebaseapp.com",
  projectId: "mvp-case-opening-login",
  storageBucket: "mvp-case-opening-login.firebasestorage.app",
  messagingSenderId: "213272608509",
  appId: "1:213272608509:web:54853eefefe2abbe2d8894"
};
const ADMIN_EMAILS = ["ykacem59@gmail.com"]; // <- mets TON email admin
const PROXY_BASE = ""; // ex: "https://your-proxy.onrender.com" (optionnel pour paiements)

// ==== INIT ====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==== Helpers ====
const $  = (s)=>document.querySelector(s);
const state = { user:null, userDoc:null, cases:[], selectedCase:null };
const fmt = n => `$${Number(n||0).toFixed(2)}`;
const show = (sel, yes=true)=>{ const el=$(sel); if(el) el.classList.toggle('hidden', !yes); };

// ==== Auth UI ====
$('#btn-login').onclick  = ()=> show('#auth-modal', true);
$('#close-auth').onclick = ()=> show('#auth-modal', false);
$('#do-login').onclick   = async ()=> {
  const e=$('#auth-email').value, p=$('#auth-pass').value;
  await signInWithEmailAndPassword(auth,e,p);
};
$('#do-signup').onclick  = async ()=> {
  const e=$('#auth-email').value, p=$('#auth-pass').value;
  const cred = await createUserWithEmailAndPassword(auth,e,p);
  await setDoc(doc(db,'users',cred.user.uid),{ email:e, balance:0, role:'user', createdAt:serverTimestamp() });
};
$('#btn-logout').onclick = ()=> signOut(auth);

onAuthStateChanged(auth, async (user)=>{
  state.user = user;
  show('#btn-login', !user);
  show('#btn-logout', !!user);
  show('#auth-modal', false);
  show('#nav-admin', !!user && ADMIN_EMAILS.includes(user.email));
  if(!user){ $('#balance').textContent = '$0.00'; return; }

  const uref = doc(db,'users',user.uid);
  if(!(await getDoc(uref)).exists()){
    await setDoc(uref,{ email:user.email, balance:0, role:'user', createdAt:serverTimestamp() });
  }
  state.userDoc = (await getDoc(uref)).data();
  $('#balance').textContent = fmt(state.userDoc.balance);
});

// ==== Load & render cases ====
async function loadCases(){
  const arr=[];
  const qsnap = await getDocs(collection(db,'cases'));
  qsnap.forEach(d=> arr.push({ id:d.id, ...d.data() }));
  state.cases = arr;
  renderCases();
}
function renderCases(){
  const grid = $('#cases-grid'); grid.innerHTML='';
  state.cases.forEach(c=>{
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <img src="${c.image||'https://picsum.photos/600/300?blur=2'}" alt="" style="width:100%;height:140px;object-fit:cover;border-radius:12px"/>
      <h4>${c.name}</h4>
      <div class="row"><span class="badge">${c.items?.length||0} items</span><span class="price">${fmt(c.price)}</span></div>
      <button class="open-case">Open</button>`;
    card.querySelector('.open-case').onclick = ()=> openCase(c);
    grid.appendChild(card);
  });
}
loadCases();

// ==== Weighted RNG & opening ====
function weightedPick(items){
  const total = items.reduce((s,i)=> s + Number(i.weight||1), 0);
  let roll = Math.random()*total;
  for(const i of items){ if((roll -= Number(i.weight||1)) <= 0) return i; }
  return items.at(-1);
}

async function openCase(c){
  if(!state.user){ show('#auth-modal', true); return; }
  try{
    await runTransaction(db, async (tx)=>{
      const uref = doc(db,'users',state.user.uid);
      const usnap = await tx.get(uref);
      const u = usnap.data();
      if(!u || (u.balance||0) < c.price) throw new Error('Insufficient balance');
      tx.update(uref,{ balance:(u.balance||0) - c.price });
    });
  }catch(e){ alert(e.message); return; }

  state.selectedCase = c;
  $('#open-title').textContent = `Opening ${c.name}…`;
  const strip = document.createElement('div'); strip.className='strip';
  const pool = [...c.items, ...c.items, ...c.items];
  pool.forEach(i=>{
    const cell = document.createElement('div');
    cell.className='item';
    cell.innerHTML = `<img src="${i.img||'https://picsum.photos/100'}"/><div>${i.name}</div><div class="badge">${i.rarity||''}</div>`;
    strip.appendChild(cell);
  });
  const wheel = $('#wheel'); wheel.innerHTML=''; wheel.appendChild(strip);
  show('#open-modal', true);

  const win = weightedPick(c.items);
  const index = Math.floor(Math.random()*pool.length);
  const offset = -(index*128 + 10);
  requestAnimationFrame(()=> strip.style.transform = `translateX(${offset}px)`);
  setTimeout(async ()=>{
    $('#result').textContent = `You won: ${win.name} (${fmt(win.value)})`;
    $('#result').style.color = 'var(--win)';
    show('#open-again', true);
    $('#open-again').onclick = ()=> openCase(c);

    const spinRef = await addDoc(collection(db,'spins'),{
      uid: state.user.uid, caseId: c.id, item: win, price: c.price,
      ts: serverTimestamp(), roll: Math.random()
    });
    await addDoc(collection(db,'users',state.user.uid,'inventory'),{
      item: win, spinId: spinRef.id, ts: serverTimestamp()
    });
    const snap = await getDoc(doc(db,'users',state.user.uid));
    $('#balance').textContent = fmt((snap.data()?.balance)||0);
  }, 2400);
}
$('#close-open').onclick = ()=> show('#open-modal', false);

// ==== Inventory ====
$('#nav-inventory').onclick = async ()=>{
  if(!state.user){ show('#auth-modal', true); return; }
  show('#inventory', true);
  const invGrid = $('#inv-grid'); invGrid.innerHTML='';
  const items = await getDocs(collection(db,'users',state.user.uid,'inventory'));
  items.forEach(d=>{
    const it = d.data().item;
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `<img src="${it.img||'https://picsum.photos/400'}" style="width:100%;height:120px;object-fit:cover;border-radius:12px"/>
                      <h4>${it.name}</h4><div class="badge">${it.rarity||''}</div><div class="price">${fmt(it.value)}</div>`;
    invGrid.appendChild(card);
  });
};

// ==== Deposits (robuste : délégation + Esc + backdrop) ====
const depModal = document.querySelector('#deposit-modal');

// Délégation: on accroche sur <body>, pas sur chaque bouton
document.body.addEventListener('click', (e) => {
  const id = e.target.id;

  if (id === 'btn-deposit') {
    show('#deposit-modal', true);
  }

  if (id === 'close-dep') {
    show('#deposit-modal', false);
  }

  if (id === 'redeem-toggle') {
    document.querySelector('#redeem-wrap')?.classList.toggle('hidden');
  }

  if (id === 'redeem-do') {
    (async () => {
      if (!state.user) return;
      const code = document.querySelector('#redeem-code').value.trim();
      const map = { TEST10: 10, TEST25: 25, TEST50: 50 };
      const amount = map[code];
      if (!amount) {
        document.querySelector('#dep-status').textContent = 'Invalid code';
        return;
      }
      await runTransaction(db, async (tx) => {
        const uref = doc(db, 'users', state.user.uid);
        const usnap = await tx.get(uref);
        const u = usnap.data();
        tx.update(uref, { balance: (u.balance || 0) + amount });
      });
      document.querySelector('#dep-status').textContent = `Redeemed ${fmt(amount)}`;
      const snap = await getDoc(doc(db, 'users', state.user.uid));
      document.querySelector('#balance').textContent = fmt(snap.data().balance);
    })();
  }

  if (id === 'dep-create') {
    (async () => {
      const amount = Number(document.getElementById('dep-amount').value || 0);
      if (amount < 5) { document.getElementById('dep-status').textContent = 'Minimum is $5'; return; }
      if (!PROXY_BASE) { document.getElementById('dep-status').textContent = 'No payment proxy configured'; return; }
      try {
        const r = await fetch(`${PROXY_BASE}/api/nowpayments/create-invoice`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountUSD: amount, uid: state.user.uid })
        });
        const data = await r.json();
        if (!data || !data.invoice_url) throw new Error('Bad response');
        document.getElementById('dep-status').innerHTML =
          `<a href="${data.invoice_url}" target="_blank">Open crypto checkout</a>`;
      } catch (err) {
        document.getElementById('dep-status').textContent = 'Failed to create invoice';
      }
    })();
  }
});

// Fermer avec Échap
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') show('#deposit-modal', false);
});

// Fermer en cliquant sur le fond (backdrop)
if (depModal) {
  depModal.addEventListener('click', (e) => {
    if (e.target === depModal) show('#deposit-modal', false);
  });
}

