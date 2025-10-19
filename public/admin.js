// Firebase (CDN v12.4.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUi5u-fB6rjOYC4jNRzAur146oz11HFjE",
  authDomain: "mvp-case-opening-login.firebaseapp.com",
  projectId: "mvp-case-opening-login",
  storageBucket: "mvp-case-opening-login.firebasestorage.app",
  messagingSenderId: "213272608509",
  appId: "1:213272608509:web:54853eefefe2abbe2d8894"
};
const ADMIN_EMAILS = ["ykacem59@gmail.com"]; // <- mets TON email admin

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const $ = (s)=>document.querySelector(s);
let currentCaseId = null;

onAuthStateChanged(auth, async (user)=>{
  if(!user || !ADMIN_EMAILS.includes(user.email)){
    document.body.innerHTML = '<div class="container"><h2>Forbidden</h2><p>Admin only.</p></div>';
    return;
  }
  await loadCases();
});

function fmt(n){ return `$${Number(n||0).toFixed(2)}`; }

async function loadCases(){
  const grid = $('#cases-admin'); grid.innerHTML='';
  const snap = await getDocs(collection(db,'cases'));
  snap.forEach(d=>{
    const c = { id:d.id, ...d.data() };
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `<h4>${c.name}</h4><div>${c.items?.length||0} items</div><div>${fmt(c.price)}</div>
      <div class="row"><button class="sel">Select</button><button class="save">Save</button></div>`;
    card.querySelector('.sel').onclick = ()=>{ currentCaseId=c.id; loadItems(c.id); $('#case-name').value=c.name; $('#case-price').value=c.price; $('#case-image').value=c.image||''; };
    card.querySelector('.save').onclick = async ()=>{
      await setDoc(doc(db,'cases',c.id),{
        name: $('#case-name').value||c.name,
        price:Number($('#case-price').value||c.price),
        image: $('#case-image').value||c.image
      },{ merge:true });
      await loadCases();
    };
    grid.appendChild(card);
  });
}

$('#case-add').onclick = async ()=>{
  const name=$('#case-name').value.trim();
  const price=Number($('#case-price').value||0);
  const image=$('#case-image').value.trim();
  if(!name||price<=0){ alert('name/price'); return; }
  let id=currentCaseId;
  if(!id){
    const ref = await addDoc(collection(db,'cases'),{ name, price, image, items:[] });
    id=ref.id;
  }else{
    await setDoc(doc(db,'cases',id),{ name, price, image },{ merge:true });
  }
  currentCaseId=id;
  await loadCases();
  await loadItems(id);
};

async function loadItems(caseId){
  const csnap = await getDoc(doc(db,'cases',caseId));
  const c = csnap.data();
  const grid = $('#items-admin'); grid.innerHTML='';
  (c.items||[]).forEach((it,idx)=>{
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `<h4>${it.name}</h4><div>${it.rarity||''}</div><div>${fmt(it.value)} · w=${it.weight}</div>`;
    grid.appendChild(card);
  });
}

$('#item-add').onclick = async ()=>{
  if(!currentCaseId){ alert('select case'); return; }
  const name=$('#item-name').value.trim();
  const value=Number($('#item-value').value||0);
  const weight=Number($('#item-weight').value||1);
  const rarity=$('#item-rarity').value.trim();
  const img=$('#item-img').value.trim();
  if(!name||value<=0||weight<=0){ alert('name/value/weight'); return; }
  const cref = doc(db,'cases',currentCaseId);
  const csnap = await getDoc(cref);
  const c = csnap.data();
  const items = [...(c.items||[]), {name,value,weight,rarity,img}];
  await updateDoc(cref,{ items });
  await loadItems(currentCaseId);
};

$('#user-adjust').onclick = async ()=>{
  const email = $('#user-email').value.trim();
  const delta = Number($('#user-delta').value||0);
  if(!email||!delta) return;
  const usersSnap = await getDocs(collection(db,'users'));
  for(const d of usersSnap.docs){
    const u = d.data();
    if(u.email===email){
      const ref = doc(db,'users',d.id);
      await updateDoc(ref,{ balance: (u.balance||0)+delta });
      alert('updated');
      return;
    }
  }
  alert('user not found');
};
