// ==============================
// CaseForge — admin.js (CDN build)
// ==============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUi5u-fB6rjOYC4jNRzAur146oz11HFjE",
  authDomain: "mvp-case-opening-login.firebaseapp.com",
  projectId: "mvp-case-opening-login",
  storageBucket: "mvp-case-opening-login.firebasestorage.app",
  messagingSenderId: "213272608509",
  appId: "1:213272608509:web:54853eefefe2abbe2d8894"
};
const ADMIN_EMAILS = ["ykacem59@gmail.com"];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = (s)=>document.querySelector(s);
let currentCaseId = null;

function fmt(n){ return `$${Number(n||0).toFixed(2)}`; }

onAuthStateChanged(auth, async (user)=>{
  if(!user || !ADMIN_EMAILS.includes(user.email)){
    document.body.innerHTML = '<div class="container"><h2>Forbidden</h2><p>Admin only.</p></div>';
    return;
  }
  await loadCases();
  await loadWithdrawals(); // NEW
});

// Load all cases
async function loadCases(){
  const grid = $('#cases-admin'); grid.innerHTML='';
  const snap = await getDocs(collection(db,'cases'));
  snap.forEach(d=>{
    const c = { id:d.id, ...d.data() };
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <h4>${c.name}</h4>
      <div>${c.items?.length||0} items</div>
      <div>${fmt(c.price)}</div>
      <div class="row" style="gap:8px">
        <button class="sel">Select</button>
        <button class="save">Save</button>
        <button class="danger del-case">Delete case</button>
      </div>`;
    card.querySelector('.sel').onclick = async ()=>{
      currentCaseId=c.id;
      $('#case-name').value=c.name; $('#case-price').value=c.price; $('#case-image').value=c.image||'';
      await loadItems(c.id);
    };
    card.querySelector('.save').onclick = async ()=>{
      const name = $('#case-name').value||c.name;
      const price= Number($('#case-price').value||c.price);
      const image= $('#case-image').value||c.image||'';
      await setDoc(doc(db,'cases',c.id),{ name, price, image },{ merge:true });
      await loadCases();
    };
    card.querySelector('.del-case').onclick = async ()=>{
      if(!confirm('Delete this case?')) return;
      await deleteDoc(doc(db,'cases', c.id));
      if(currentCaseId===c.id){ currentCaseId=null; $('#items-admin').innerHTML=''; }
      await loadCases();
    };
    grid.appendChild(card);
  });
}

// Load items for selected case
async function loadItems(caseId){
  const csnap = await getDoc(doc(db,'cases',caseId));
  const c = csnap.data();
  const grid = $('#items-admin'); grid.innerHTML='';
  (c.items||[]).forEach((it)=>{
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <h4>${it.name}</h4>
      <div>${it.rarity||''}</div>
      <div>${fmt(it.value)} · w=${it.weight}</div>
      <button class="danger del-item">Delete item</button>`;
    card.querySelector('.del-item').onclick = async ()=>{
      await deleteItemFromCase(caseId, it.name);
      await loadItems(caseId);
    };
    grid.appendChild(card);
  });
}

// Delete a single item (by name) from case.items array
async function deleteItemFromCase(caseId, itemName){
  const cref = doc(db,'cases', caseId);
  const snap = await getDoc(cref);
  const data = snap.data() || {};
  const next = (data.items||[]).filter(i => i.name !== itemName);
  await updateDoc(cref, { items: next });
}

// Add / update case
$('#case-add').onclick = async ()=>{
  const name = $('#case-name').value.trim();
  const price= Number($('#case-price').value||0);
  const image= $('#case-image').value.trim();
  if(!name||price<=0){ alert('Provide name and positive price'); return; }

  if(!currentCaseId){
    const ref = await addDoc(collection(db,'cases'),{ name, price, image, items:[] });
    currentCaseId = ref.id;
  }else{
    await setDoc(doc(db,'cases',currentCaseId),{ name, price, image },{ merge:true });
  }
  await loadCases();
  await loadItems(currentCaseId);
};

// Add item to selected case
$('#item-add').onclick = async ()=>{
  if(!currentCaseId){ alert('Select a case'); return; }
  const name  = $('#item-name').value.trim();
  const value = Number($('#item-value').value||0);
  const weight= Number($('#item-weight').value||1);
  const rarity= $('#item-rarity').value.trim();
  const img   = $('#item-img').value.trim();
  if(!name||value<=0||weight<=0){ alert('Invalid item fields'); return; }

  const cref = doc(db,'cases',currentCaseId);
  const csnap = await getDoc(cref);
  const c = csnap.data() || {};
  const items = [...(c.items||[]), {name,value,weight,rarity,img}];
  await updateDoc(cref,{ items });
  await loadItems(currentCaseId);
};

// === Load withdrawals (requested/pending) ===
async function loadWithdrawals(){
  const cont = document.querySelector('#wd-admin');
  if(!cont) return;
  cont.innerHTML = '';

  // simple fetch: get all withdrawals and filter in JS
  const qs = await getDocs(collection(db,'withdrawals'));
  qs.forEach(d=>{
    const w = { id:d.id, ...d.data() };
    // show newest requested first
    if(w.status !== 'requested' && w.status !== 'approved' && w.status !== 'failed') return;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h4>${w.currency} on ${w.network}</h4>
      <div>Amount: $${Number(w.amountUSD||0).toFixed(2)}</div>
      <div>To: <code>${w.address}</code></div>
      <div>User: <code>${w.uid}</code></div>
      <div>Status: <span class="badge">${w.status}</span></div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="approve">Approve & Send</button>
        <button class="reject">Reject</button>
      </div>`;
    card.querySelector('.approve').onclick = ()=> approveWithdrawal(w);
    card.querySelector('.reject').onclick  = ()=> rejectWithdrawal(w);
    cont.appendChild(card);
  });
}

// Call after admin auth ok
onAuthStateChanged(auth, async (user)=>{
  if(!user || !ADMIN_EMAILS.includes(user.email)){
    document.body.innerHTML = '<div class="container"><h2>Forbidden</h2><p>Admin only.</p></div>';
    return;
  }
  await loadCases();
  await loadWithdrawals(); // NEW
});

// === Approve flow ===
// Option A: ton proxy fait le réel envoi et renvoie txid.
// Option B: tu cliques Approve -> proxy /api/payouts/send
async function approveWithdrawal(w){
  if(!confirm(`Approve and send $${w.amountUSD} ${w.currency} to ${w.address}?`)) return;

  // 1) Call proxy to do payout (NOWPayments payout API, etc.)
  let txid = '';
  try{
    if(PROXY_BASE){
      const r = await fetch(`${PROXY_BASE}/api/payouts/send`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ wid: w.id })
      });
      const data = await r.json();
      if(!r.ok) throw new Error(data?.error || 'Proxy send failed');
      txid = data.txid || '';
    } else {
      // No proxy: just mark approved (DUMMY). Do NOT use in prod.
      txid = 'manual-'+Date.now();
    }
  }catch(e){
    alert('Proxy error: '+ (e.message||e));
    return;
  }

  // 2) Mark as sent/approved with txid
  await updateDoc(doc(db,'withdrawals', w.id), {
    status: 'sent',
    txid: txid,
    processedAt: serverTimestamp()
  });

  alert('Withdrawal marked as sent.');
  await loadWithdrawals();
}

// === Reject flow ===
// Refund balance to user then mark rejected
async function rejectWithdrawal(w){
  if(!confirm('Reject this withdrawal and refund the balance?')) return;

  // 1) refund user
  await runTransaction(db, async (tx)=>{
    const uref = doc(db,'users', w.uid);
    const usnap= await tx.get(uref);
    const u = usnap.data() || { balance:0 };
    tx.update(uref, { balance: (u.balance||0) + Number(w.amountUSD||0) });
  });

  // 2) mark rejected
  await updateDoc(doc(db,'withdrawals', w.id), {
    status: 'rejected',
    processedAt: serverTimestamp()
  });

  alert('Withdrawal rejected & refunded.');
  await loadWithdrawals();
}


// Adjust user balance by email
$('#user-adjust').onclick = async ()=>{
  const email = $('#user-email').value.trim();
  const delta = Number($('#user-delta').value||0);
  if(!email || !delta) return;

  const usersSnap = await getDocs(collection(db,'users'));
  for(const d of usersSnap.docs){
    const u = d.data();
    if(u.email===email){
      const ref = doc(db,'users',d.id);
      await updateDoc(ref,{ balance: (u.balance||0)+delta });
      alert('Balance updated');
      return;
    }
  }
  alert('User not found');
};
