import { firebaseConfig, OCR_FUNCTION_URL, TELEGRAM_TEST_FUNCTION_URL, VAPID_PUBLIC_KEY } from './firebase-config.js';
const $=id=>document.getElementById(id);
let firebaseReady=Boolean(firebaseConfig.apiKey&&firebaseConfig.projectId),auth,db,storage,currentUser=null,demoMode=!firebaseReady,deferredPrompt=null,newWorker=null,latestData=null,pendingOcrDebtor=null;
const LS='debt_collector_phase3_v1',blank={debtors:[],debts:[],payments:[],followups:[],documents:[],settings:{}};
const uid=()=>String(Date.now())+Math.random().toString(16).slice(2),today=()=>new Date().toISOString().slice(0,10);
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').replace(/[^0-9.\-]/g,''));return Number.isFinite(n)?n:0},money=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const maskId=id=>{const s=String(id||'').replace(/\D/g,'');return s.length>=13?`${s.slice(0,1)}-${s.slice(1,5)}-xxxxx-${s.slice(10,12)}-${s.slice(12,13)}`:s.replace(/.(?=.{4})/g,'x')};
const normalizeIdCard=id=>String(id||'').replace(/\D/g,'');
function isDuplicateIdCard(id,ignoreId=''){const v=normalizeIdCard(id);if(!v)return false;return (latestData?.debtors||[]).some(d=>d.id!==ignoreId&&normalizeIdCard(d.idCard)===v)};
const fullNameOf=o=>[o.prefix,o.firstName,o.lastName].filter(Boolean).join(' ').trim();
function toast(m){$('toast').textContent=m;$('toast').classList.add('show');clearTimeout(window.t);window.t=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function getProfileName(){
 const p=(latestData?.settings?.profile)||latestData?.settings||{};
 return p.alias||p.displayName||currentUser?.displayName||currentUser?.email||'ผู้ใช้งาน';
}
function setUserDisplay(text){
 const name=text||getProfileName();
 if($('loginUserText')) $('loginUserText').textContent='ระบบติดตามทวงหนี้';
 if($('settingsUserText')) $('settingsUserText').textContent=name||'ยังไม่ได้ตั้งชื่อผู้ใช้งาน';
 if($('dropdownUserText')) $('dropdownUserText').textContent=name||'-';
 if($('userMenuWrap')) $('userMenuWrap').classList.toggle('hidden',!currentUser&&!demoMode);
}
function local(){return JSON.parse(localStorage.getItem(LS)||JSON.stringify(blank))}function setLocal(d){localStorage.setItem(LS,JSON.stringify({...blank,...d}))}
async function getData(){if(demoMode)return local();const{collection,getDocs}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');const names=['debtors','debts','payments','followups','documents','settings'];const result={};for(const n of names){const snap=await getDocs(collection(db,`users/${currentUser.uid}/${n}`));result[n]=snap.docs.map(d=>({id:d.id,...d.data()}))}result.settings=result.settings?.[0]||{};return{...blank,...result}}
async function add(type,row){if(demoMode){const d=local();d[type].push({id:uid(),...row});setLocal(d);return}const{collection,addDoc,serverTimestamp}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');await addDoc(collection(db,`users/${currentUser.uid}/${type}`),{...row,createdAt:serverTimestamp()})}
async function updateRow(type,id,row){if(demoMode){const d=local();d[type]=d[type].map(x=>x.id===id?{...x,...row}:x);setLocal(d);return}const{doc,updateDoc}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');await updateDoc(doc(db,`users/${currentUser.uid}/${type}/${id}`),row)}
async function deleteRow(type,id){
 if(demoMode){const d=local();d[type]=d[type].filter(x=>x.id!==id);setLocal(d);return}
 const{doc,deleteDoc}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
 await deleteDoc(doc(db,`users/${currentUser.uid}/${type}/${id}`));
}
async function saveSettings(row){if(demoMode){const d=local();d.settings={...(d.settings||{}),...row};setLocal(d);return}await add('settings',row)}
function canDeleteDebtor(id,d=latestData){
 if(!d)return false;
 return !d.debts.some(x=>x.debtorId===id)&&!d.followups.some(x=>x.debtorId===id)&&!d.documents.some(x=>x.debtorId===id);
}

function safeFileName(name){return String(name||'file').replace(/[^\w.\-\u0E00-\u0E7F]+/g,'_').slice(0,120)}
function fileIcon(mime,name=''){if(String(mime).startsWith('image/'))return 'bi-file-earmark-image';if(String(mime).includes('pdf')||String(name).toLowerCase().endsWith('.pdf'))return 'bi-file-earmark-pdf';return 'bi-file-earmark'}
async function uploadDocumentFiles(debtorId,type,files){
 if(demoMode){
   for(const f of files){await add('documents',{debtorId,type,fileName:f.name,mimeType:f.type,size:f.size,createdDate:today(),storagePath:'',downloadURL:''})}
   return;
 }
 const{ref,uploadBytes,getDownloadURL}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');
 for(const f of files){
   const path=`users/${currentUser.uid}/debtors/${debtorId}/${Date.now()}_${safeFileName(f.name)}`;
   const fileRef=ref(storage,path);
   await uploadBytes(fileRef,f,{contentType:f.type||'application/octet-stream'});
   const downloadURL=await getDownloadURL(fileRef);
   await add('documents',{debtorId,type,fileName:f.name,mimeType:f.type||'',size:f.size||0,createdDate:today(),storagePath:path,downloadURL});
 }
}
async function deleteDocument(docId){
 const doc=(latestData?.documents||[]).find(x=>x.id===docId);
 if(!doc)return toast('ไม่พบเอกสาร');
 if(!confirm(`ลบเอกสาร ${doc.fileName||''} ใช่หรือไม่?`))return;
 if(!demoMode&&doc.storagePath){
   try{const{ref,deleteObject}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');await deleteObject(ref(storage,doc.storagePath));}catch(e){console.warn('Storage delete warning',e)}
 }
 await deleteRow('documents',docId);
 toast('ลบเอกสารแล้ว');
 render();
}
window.deleteDocument=deleteDocument;
window.previewDocument=(id)=>{
 const doc=(latestData?.documents||[]).find(x=>x.id===id);
 if(!doc)return toast('ไม่พบเอกสาร');
 const url=doc.downloadURL;
 if(!url)return toast('ไฟล์นี้ยังไม่มี URL สำหรับเปิดดู');
 $('previewTitle').textContent=doc.fileName||'ดูเอกสาร';
 const mime=doc.mimeType||'';
 if(mime.startsWith('image/')) $('previewBody').innerHTML=`<img src="${url}" alt="${doc.fileName||''}">`;
 else if(mime.includes('pdf')||String(doc.fileName||'').toLowerCase().endsWith('.pdf')) $('previewBody').innerHTML=`<iframe src="${url}"></iframe>`;
 else $('previewBody').innerHTML=`<div class="empty"><i class="bi ${fileIcon(mime,doc.fileName)}"></i><br>ไม่รองรับ Preview ไฟล์ชนิดนี้<br>กดดาวน์โหลด/เปิดไฟล์</div>`;
 $('previewDownloadBtn').href=url;
 $('documentPreviewModal').classList.remove('hidden');
};

function calc(d){const paid={};d.payments.forEach(p=>paid[p.debtId]=(paid[p.debtId]||0)+num(p.amount));const debtors=Object.fromEntries(d.debtors.map(x=>[x.id,x]));const debts=d.debts.map(x=>{const p=paid[x.id]||0,remaining=Math.max(0,num(x.principal)-p),days=Math.max(0,Math.floor((new Date(today())-new Date(x.dueDate||today()))/86400000));return{...x,paid:p,remaining,isDue:remaining>0&&String(x.dueDate||'')<=today(),isDueToday:remaining>0&&String(x.dueDate||'')===today(),daysOverdue:days,debtor:debtors[x.debtorId]}});return{debtors,debts,debtsById:Object.fromEntries(debts.map(x=>[x.id,x]))}}
async function render(){const d=await getData();latestData=d;const c=calc(d),due=c.debts.filter(x=>x.isDue).sort((a,b)=>b.daysOverdue-a.daysOverdue||b.remaining-a.remaining),followToday=d.followups.filter(f=>String(f.nextFollowupDate||f.contactDate||'')<=today());$('debtorCount').textContent=d.debtors.length;$('debtTotal').textContent=money(c.debts.reduce((s,x)=>s+num(x.principal),0));$('openDebtTotal').textContent=money(c.debts.reduce((s,x)=>s+x.remaining,0));$('dueTotal').textContent=money(due.reduce((s,x)=>s+x.remaining,0));$('minCollectTotal').textContent=money(due.reduce((s,x)=>s+Math.min(num(x.minCollectAmount||x.remaining),x.remaining),0));$('dueTodayCount').textContent=c.debts.filter(x=>x.isDueToday).length;$('followupTodayCount').textContent=followToday.length;renderAging(c.debts);$('priorityList').innerHTML=due.length?due.map(x=>`<div class="item"><div><div class="item-title">${x.debtor?.name||'-'} · ${x.title}</div><div class="item-sub">ครบกำหนด ${x.dueDate} · เกิน ${x.daysOverdue} วัน · ขั้นต่ำ ${money(Math.min(num(x.minCollectAmount||x.remaining),x.remaining))}</div></div><div class="amount">${money(x.remaining)}</div></div>`).join(''):'<div class="empty">ยังไม่มีรายการถึงกำหนด</div>';$('todayFollowupList').innerHTML=followToday.length?followToday.map(f=>`<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name||'-'} · ${f.status||f.channel}</div><div class="item-sub">${f.result||'-'} · นัด ${f.nextFollowupDate||'-'}</div></div></div>`).join(''):'<div class="empty">ยังไม่มีรายการติดตามวันนี้</div>';$('debtorList').innerHTML=d.debtors.length?d.debtors.map(x=>{const remain=c.debts.filter(dd=>dd.debtorId===x.id).reduce((s,dd)=>s+dd.remaining,0);return`<div class="item"><div><div class="item-title">${x.name}</div><div class="item-sub">${x.phone||'-'} · ${maskId(x.idCard)} · ${x.district||''} ${x.province||''}</div><div class="item-sub">ยอดคงเหลือ ${money(remain)}</div></div><div class="item-actions"><button class="mini" onclick="openDebtForm('${x.id}','${String(x.name).replace(/'/g,"\\'")}')">เพิ่มหนี้</button><button class="mini" onclick="openEditDebtor('${x.id}')">แก้ไข</button>${canDeleteDebtor(x.id,d)?`<button class="mini mini-danger" onclick="deleteDebtor('${x.id}')">ลบ</button>`:''}</div></div>`}).join(''):'<div class="empty">ยังไม่มีลูกหนี้</div>';fillSelects(d,c);fillLists(d,c);fillSettings(d.settings||{})}
function renderAging(debts){const b={a:0,b:0,c:0,d:0};debts.filter(x=>x.remaining>0&&x.isDue).forEach(x=>{if(x.daysOverdue<=30)b.a+=x.remaining;else if(x.daysOverdue<=60)b.b+=x.remaining;else if(x.daysOverdue<=90)b.c+=x.remaining;else b.d+=x.remaining});$('aging030').textContent=money(b.a);$('aging3160').textContent=money(b.b);$('aging6190').textContent=money(b.c);$('aging90').textContent=money(b.d)}
function fillSelects(d,c){const debtorOpts='<option value="">-- เลือกลูกหนี้ --</option>'+d.debtors.map(x=>`<option value="${x.id}">${x.name}</option>`).join('');['followupDebtorId','documentDebtorId','transactionDebtorId'].forEach(id=>{if($(id))$(id).innerHTML=debtorOpts});const debtOpts='<option value="">-- เลือกก้อนหนี้ --</option>'+c.debts.filter(x=>x.remaining>0).map(x=>`<option value="${x.id}">${x.debtor?.name||'-'} · ${x.title} · ${money(x.remaining)}</option>`).join('');$('paymentDebtId').innerHTML=debtOpts;$('followupDebtId').innerHTML='<option value="">-- ไม่ระบุก้อนหนี้ --</option>'+debtOpts.replace('<option value="">-- เลือกก้อนหนี้ --</option>','')}
function fillLists(d,c){$('paymentList').innerHTML=d.payments.length?d.payments.map(p=>`<div class="item"><div><div class="item-title">${money(p.amount)}</div><div class="item-sub">${p.paidDate} · ${c.debtsById[p.debtId]?.title||'-'} · ${p.note||''}</div></div></div>`).join(''):'<div class="empty">ยังไม่มีประวัติชำระ</div>';$('followupList').innerHTML=d.followups.length?d.followups.map(f=>`<div class="item"><div><div class="item-title">${c.debtors[f.debtorId]?.name||'-'} · ${f.status||'-'}</div><div class="item-sub">${f.contactDate} · ${f.channel||'-'} · นัด ${f.nextFollowupDate||'-'}</div><div class="item-sub">${f.result||''}</div></div></div>`).join(''):'<div class="empty">ยังไม่มีประวัติติดตาม</div>';$('documentList').innerHTML=d.documents.length?d.documents.map(doc=>{const isImg=String(doc.mimeType||'').startsWith('image/');const thumb=isImg&&doc.downloadURL?`<img src="${doc.downloadURL}" alt="">`:`<i class="bi ${fileIcon(doc.mimeType,doc.fileName)}"></i>`;return`<div class="item doc-card"><div class="doc-thumb">${thumb}</div><div><div class="item-title">${doc.type} · ${doc.fileName}</div><div class="item-sub">${c.debtors[doc.debtorId]?.name||'-'} · ${doc.createdDate||'-'} · ${doc.size?money(doc.size/1024)+' KB':''}</div></div><div class="doc-actions"><button class="mini" onclick="previewDocument('${doc.id}')">เปิด</button><button class="mini mini-danger" onclick="deleteDocument('${doc.id}')">ลบ</button></div></div>`}).join(''):'<div class="empty">ยังไม่มีเอกสาร</div>'}
function fillSettings(s){
 if($('notifyEmail'))$('notifyEmail').value=s.notifyEmail||'';
 if($('telegramChatId'))$('telegramChatId').value=s.telegramChatId||'';
 const p=s.profile||s||{};
 if($('profileAlias'))$('profileAlias').value=p.alias||'';
 if($('profilePhone'))$('profilePhone').value=p.phone||'';
 if($('profileLineId'))$('profileLineId').value=p.lineId||'';
 if($('profileTelegramId'))$('profileTelegramId').value=p.telegramId||'';
 setUserDisplay();
}
window.openDebtForm=(id,name)=>{if($('transactionDebtorId'))$('transactionDebtorId').value=id;switchTransaction('debt');switchTab('transactions')};
window.openEditDebtor=id=>{const d=(latestData?.debtors||[]).find(x=>x.id===id);if(!d)return;['Name','Phone','LineId','IdCard','Address','District','Province'].forEach(k=>{$('editDebtor'+k).value=d[k.charAt(0).toLowerCase()+k.slice(1)]||''});$('editDebtorId').value=id;$('editDebtorCard').classList.remove('hidden');switchTab('customers')};
window.deleteDebtor=async id=>{if(!canDeleteDebtor(id))return toast('ลบไม่ได้ เพราะลูกหนี้ถูกนำไปใช้งานแล้ว');const debtor=(latestData?.debtors||[]).find(x=>x.id===id);if(!confirm(`ลบลูกหนี้ ${debtor?.name||''} ใช่หรือไม่?`))return;await deleteRow('debtors',id);toast('ลบลูกหนี้แล้ว');render()};
$('addDebtorBtn').onclick=async()=>{const name=$('debtorName').value.trim();if(!name)return toast('กรุณากรอกชื่อลูกหนี้');if(isDuplicateIdCard($('debtorIdCard').value))return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว');await add('debtors',{name,phone:$('debtorPhone').value.trim(),lineId:$('debtorLineId').value.trim(),idCard:$('debtorIdCard').value.trim(),address:$('debtorAddress').value.trim(),district:$('debtorDistrict').value.trim(),province:$('debtorProvince').value.trim()});['debtorName','debtorPhone','debtorLineId','debtorIdCard','debtorAddress','debtorDistrict','debtorProvince'].forEach(id=>$(id).value='');toast('เพิ่มลูกหนี้สำเร็จ');hideCustomerForm();switchTab('customers');render()};
$('saveEditDebtorBtn').onclick=async()=>{const id=$('editDebtorId').value;if(!id)return;if(isDuplicateIdCard($('editDebtorIdCard').value,id))return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว');await updateRow('debtors',id,{name:$('editDebtorName').value.trim(),phone:$('editDebtorPhone').value.trim(),lineId:$('editDebtorLineId').value.trim(),idCard:$('editDebtorIdCard').value.trim(),address:$('editDebtorAddress').value.trim(),district:$('editDebtorDistrict').value.trim(),province:$('editDebtorProvince').value.trim()});$('editDebtorCard').classList.add('hidden');toast('แก้ไขข้อมูลลูกหนี้แล้ว');render()};
$('cancelEditDebtorBtn').onclick=()=>$('editDebtorCard').classList.add('hidden');
$('addDebtBtn').onclick=async()=>{const debtorId=$('transactionDebtorId').value,principal=num($('debtPrincipal').value);if(!debtorId)return toast('เลือกลูกหนี้ก่อน');if(principal<=0)return toast('กรอกยอดหนี้');await add('debts',{debtorId,title:$('debtTitle').value||'ก้อนหนี้',principal,minCollectAmount:num($('debtMinCollect').value)||principal,dueDate:$('debtDueDate').value||today(),status:'open'});['debtTitle','debtPrincipal','debtMinCollect','debtDueDate'].forEach(id=>$(id).value='');toast('เพิ่มก้อนหนี้สำเร็จ');switchTab('transactions');switchTransaction('debt');render()};
$('addPaymentBtn').onclick=async()=>{if(!$('paymentDebtId').value)return toast('เลือกก้อนหนี้');const amount=num($('paymentAmount').value);if(amount<=0)return toast('กรอกจำนวนเงิน');await add('payments',{debtId:$('paymentDebtId').value,amount,paidDate:$('paymentDate').value||today(),note:$('paymentNote').value});$('paymentAmount').value='';$('paymentNote').value='';toast('บันทึกชำระแล้ว');switchTab('transactions');switchTransaction('payment');render()};
$('addFollowupBtn').onclick=async()=>{if(!$('followupDebtorId').value)return toast('เลือกลูกหนี้');await add('followups',{debtorId:$('followupDebtorId').value,debtId:$('followupDebtId').value,contactDate:$('followupDate').value||today(),status:$('followupStatus').value,channel:$('followupChannel').value,result:$('followupResult').value,nextFollowupDate:$('nextFollowupDate').value});toast('บันทึกการติดตามแล้ว');switchTab('transactions');switchTransaction('followup');render()};
$('addDocumentBtn').onclick=async()=>{
 if(!$('documentDebtorId').value)return toast('เลือกลูกหนี้');
 const files=[...$('documentFile').files];
 if(!files.length)return toast('กรุณาเลือกไฟล์เอกสาร');
 try{
   $('dropzoneText').textContent=`กำลังอัปโหลด ${files.length} ไฟล์...`;
   await uploadDocumentFiles($('documentDebtorId').value,$('documentType').value,files);
   $('documentFile').value='';
   $('dropzoneText').textContent='รองรับรูปภาพ / PDF / เอกสารทั่วไป';
   toast('บันทึกเอกสารแล้ว');
   switchTab('customers');
   render();
 }catch(e){console.error(e);toast('อัปโหลดไม่สำเร็จ: '+e.message)}
};
function normalizeThaiLocation(text){
 const raw=String(text||'').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
 const provinces=['กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พะเยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'];
 let province='';
 if(/กรุงเทพ|กทม/.test(raw)) province='กรุงเทพมหานคร';
 if(!province){province=provinces.find(p=>raw.includes(p))||''}
 let district='';
 const districtPatterns=[
  /(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/,
  /(?:แขวง|ตำบล|ต\.)\s*[ก-๙A-Za-z]+\s+(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+(?:\s+[ก-๙A-Za-z]+)?)/,
  /(?:เขต|อำเภอ|อ\.)\s*([ก-๙A-Za-z]+)(?=\s*(?:จังหวัด|จ\.|กรุงเทพ|$))/
 ];
 for(const p of districtPatterns){const m=raw.match(p);if(m&&m[1]){district=m[1].trim();break}}
 if(district){
   district=district.replace(/จังหวัด.*$/,'').replace(/กรุงเทพมหานคร.*$/,'').replace(/กทม.*$/,'').trim();
 }
 return{district,province};
}
function parseOcrResult(data){
 const full=data.fullName||data.name||'';let prefix='',firstName='',lastName='';
 const nm=full.match(/(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*([^\s]+)\s*(.*)/);
 if(nm){prefix=nm[1];firstName=nm[2]||'';lastName=(nm[3]||'').trim()}else{const p=full.split(/\s+/).filter(Boolean);firstName=p[0]||'';lastName=p.slice(1).join(' ')}
 const raw=(data.rawText||'')+' '+(data.address||'')+' '+(data.district||'')+' '+(data.province||'');
 const loc=normalizeThaiLocation(raw);
 return{prefix,firstName,lastName,idCard:data.idCard||'',address:data.address||'',district:(data.district||loc.district||'').trim(),province:(data.province||loc.province||'').trim()}
}
async function compressImageToBase64(file,maxWidth=1600,quality=.86){const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=URL.createObjectURL(file)});const scale=Math.min(1,maxWidth/img.width),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',quality).split(',')[1]}
async function getAuthToken(){return currentUser?.getIdToken?await currentUser.getIdToken():''}
function fillOcrFields(o){$('ocrPrefix').value=o.prefix||'';$('ocrFirstName').value=o.firstName||'';$('ocrLastName').value=o.lastName||'';$('ocrIdCard').value=o.idCard||'';$('ocrAddress').value=o.address||'';$('ocrDistrict').value=o.district||'';$('ocrProvince').value=o.province||'';$('ocrIdMasked').textContent=o.idCard?`แสดงแบบซ่อน: ${maskId(o.idCard)}`:''}
function ocrDebtorObject(){return{name:fullNameOf({prefix:$('ocrPrefix').value,firstName:$('ocrFirstName').value,lastName:$('ocrLastName').value}),phone:'',lineId:'',idCard:$('ocrIdCard').value,address:$('ocrAddress').value,district:$('ocrDistrict').value,province:$('ocrProvince').value,source:'ocr'}}
$('runOcrBtn').onclick=async()=>{const file=$('ocrFile').files[0];if(!file)return toast('กรุณาถ่ายรูปหรือเลือกรูปบัตรก่อน');if(!OCR_FUNCTION_URL)return toast('ยังไม่ได้ตั้งค่า OCR URL');try{toast('กำลังอ่าน OCR...');const imageBase64=await compressImageToBase64(file),token=await getAuthToken();const res=await fetch(OCR_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({imageBase64})});const data=await res.json();if(!res.ok)throw new Error(data.error||'OCR failed');const parsed=parseOcrResult(data);fillOcrFields(parsed);pendingOcrDebtor=ocrDebtorObject();$('confirmText').textContent=`ชื่อ: ${pendingOcrDebtor.name}\nเลขบัตร: ${maskId(pendingOcrDebtor.idCard)}\nเขต/อำเภอ: ${pendingOcrDebtor.district||'-'}\nจังหวัด: ${pendingOcrDebtor.province||'-'}`;$('confirmModal').classList.remove('hidden');toast('อ่าน OCR สำเร็จ')}catch(e){console.error(e);toast('OCR ไม่สำเร็จ: '+e.message)}};
$('confirmCreateDebtorBtn').onclick=async()=>{if(!pendingOcrDebtor)pendingOcrDebtor=ocrDebtorObject();if(!pendingOcrDebtor.name)return toast('ไม่มีชื่อลูกหนี้');if(isDuplicateIdCard(pendingOcrDebtor.idCard))return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว');await add('debtors',pendingOcrDebtor);$('confirmModal').classList.add('hidden');toast('เพิ่มลูกหนี้จาก OCR แล้ว');$('confirmModal')?.classList.add('hidden');hideCustomerForm();switchTab('customers');render()};
$('cancelCreateDebtorBtn').onclick=()=>$('confirmModal').classList.add('hidden');$('autoCreateDebtorBtn').onclick=async()=>{const row=ocrDebtorObject();if(!row.name)return toast('ไม่มีข้อมูล OCR');if(isDuplicateIdCard(row.idCard))return toast('เลขบัตรประชาชนนี้มีอยู่แล้ว');await add('debtors',row);toast('เพิ่มลูกหนี้จาก OCR แล้ว');$('confirmModal')?.classList.add('hidden');hideCustomerForm();switchTab('customers');render()};$('useOcrToDebtorBtn').onclick=()=>{const row=ocrDebtorObject();$('debtorName').value=row.name;$('debtorIdCard').value=row.idCard;$('debtorAddress').value=row.address;$('debtorDistrict').value=row.district;$('debtorProvince').value=row.province;showCustomerForm('manual');switchTab('customers');toast('นำข้อมูล OCR ไปกรอกฟอร์มแล้ว')};
function bindDropzones(){[['dropzone','documentFile','dropzoneText'],['ocrDropzone','ocrFile','ocrFileName']].forEach(([dzId,fileId,textId])=>{const dz=$(dzId),file=$(fileId),text=$(textId);if(!dz||!file)return;const show=()=>{if(file.files[0]){if(text)text.textContent=file.files[0].name;if(fileId==='ocrFile'){$('ocrPreview').src=URL.createObjectURL(file.files[0]);$('ocrPreview').classList.remove('hidden')}}};file.addEventListener('change',show);['dragenter','dragover'].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.add('dragover')}));['dragleave','drop'].forEach(evt=>dz.addEventListener(evt,e=>{e.preventDefault();dz.classList.remove('dragover')}));dz.addEventListener('drop',e=>{if(e.dataTransfer.files.length){file.files=e.dataTransfer.files;show()}})})}
function sanitizeDecimalInput(value){
  let v=String(value||'').replace(/,/g,'').replace(/[^\d.]/g,'');
  const firstDot=v.indexOf('.');
  if(firstDot!==-1){
    v=v.slice(0,firstDot+1)+v.slice(firstDot+1).replace(/\./g,'');
  }
  const parts=v.split('.');
  if(parts[1]!==undefined) parts[1]=parts[1].slice(0,2);
  return parts.join('.');
}
function bindMoneyInputs(){
  document.querySelectorAll('.money-input').forEach(input=>{
    input.setAttribute('inputmode','decimal');
    input.setAttribute('autocomplete','off');
    input.addEventListener('input',()=>{
      const before=input.value;
      const pos=input.selectionStart;
      input.value=sanitizeDecimalInput(input.value);
      const diff=before.length-input.value.length;
      const next=Math.max(0,(pos||input.value.length)-diff);
      try{input.setSelectionRange(next,next)}catch(e){}
    });
    input.addEventListener('focus',()=>{
      input.value=String(input.value||'').replace(/,/g,'');
      input.select();
    });
    input.addEventListener('blur',()=>{
      const n=num(input.value);
      input.value=input.value===''?'':money(n);
    });
  });
}
bindDropzones();bindMoneyInputs();

function bindNumericInputs(){
  const specs=[
    ['debtorPhone',10],['editDebtorPhone',10],['profilePhone',10],
    ['debtorIdCard',13],['editDebtorIdCard',13],['ocrIdCard',13]
  ];
  specs.forEach(([id,max])=>{
    const input=$(id);
    if(!input)return;
    input.setAttribute('type','tel');
    input.setAttribute('inputmode','numeric');
    input.setAttribute('maxlength',String(max));
    input.addEventListener('input',()=>{
      input.value=String(input.value||'').replace(/\D/g,'').slice(0,max);
    });
  });
}
bindNumericInputs();

function showCustomerForm(mode='manual'){
  $('customerFormArea').classList.remove('hidden');
  if(mode==='ocr'){ $('ocrCustomerBox').classList.remove('hidden'); $('manualCustomerBox').classList.add('hidden'); $('ocrCustomerBtn').classList.add('active'); $('manualCustomerBtn').classList.remove('active'); }
  else { $('manualCustomerBox').classList.remove('hidden'); $('ocrCustomerBox').classList.add('hidden'); $('manualCustomerBtn').classList.add('active'); $('ocrCustomerBtn').classList.remove('active'); }
  $('customerFormArea').scrollIntoView({behavior:'smooth'});
}
function hideCustomerForm(){ $('customerFormArea').classList.add('hidden'); }
function switchTransaction(type){
  document.querySelectorAll('[data-tx]').forEach(b=>b.classList.toggle('active',b.dataset.tx===type));
  $('txDebtBox').classList.toggle('active',type==='debt');
  $('txPaymentBox').classList.toggle('active',type==='payment');
  $('txFollowupBox').classList.toggle('active',type==='followup');
}
if($('showAddCustomerBtn')) $('showAddCustomerBtn').onclick=()=>showCustomerForm('manual');
if($('closeCustomerFormBtn')) $('closeCustomerFormBtn').onclick=hideCustomerForm;
if($('manualCustomerBtn')) $('manualCustomerBtn').onclick=()=>showCustomerForm('manual');
if($('ocrCustomerBtn')) $('ocrCustomerBtn').onclick=()=>showCustomerForm('ocr');
document.querySelectorAll('[data-tx]').forEach(b=>b.onclick=()=>switchTransaction(b.dataset.tx));

$('saveProfileBtn').onclick=async()=>{
 const alias=$('profileAlias').value.trim();
 if(!alias)return toast('กรุณากรอกชื่อหรือนามแฝง');
 await saveSettings({profile:{alias,phone:$('profilePhone').value.trim(),lineId:$('profileLineId').value.trim(),telegramId:$('profileTelegramId').value.trim()}});
 toast('บันทึกข้อมูลผู้ใช้งานแล้ว');switchTab('settings');
 render();
};
$('saveReminderSettingsBtn').onclick=async()=>{await saveSettings({notifyEmail:$('notifyEmail').value.trim(),telegramChatId:$('telegramChatId').value.trim()});toast('บันทึกการแจ้งเตือนแล้ว');switchTab('settings');render()};$('testTelegramBtn').onclick=async()=>{toast(TELEGRAM_TEST_FUNCTION_URL?'กำลังทดสอบ Telegram':'ยังไม่ได้ตั้งค่า Telegram Function URL')};
function switchTab(tab){
  document.querySelectorAll('.bottom-tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll(`.bottom-tab[data-tab="${tab}"]`).forEach(x=>x.classList.add('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  const panel=$('tab-'+tab);
  if(panel) panel.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-tab]');
  if(nav && nav.classList.contains('bottom-tab')){
    e.preventDefault();
    switchTab(nav.dataset.tab);
  }
});$('demoBtn').onclick=()=>{demoMode=true;currentUser={uid:'demo'};$('authView').classList.remove('active');$('appView').classList.add('active');setUserDisplay('Demo Mode');toast('Demo Mode');render()};
async function initFirebase(){if(!firebaseReady)return;const{initializeApp}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');const{getAuth,signInWithEmailAndPassword,createUserWithEmailAndPassword,onAuthStateChanged,signOut}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');const{getFirestore}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');const{getStorage}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js');const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);storage=getStorage(app);$('loginBtn').onclick=async()=>{try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value)}catch(e){toast(e.code||e.message)}};$('registerBtn').onclick=async()=>{try{await createUserWithEmailAndPassword(auth,$('email').value,$('password').value)}catch(e){toast(e.code||e.message)}};$('logoutBtn').onclick=async()=>{await signOut(auth);location.reload()};onAuthStateChanged(auth,u=>{if(u){currentUser=u;demoMode=false;$('authView').classList.remove('active');$('appView').classList.add('active');setUserDisplay(u.email||u.displayName||'ผู้ใช้ Firebase');render()}else{setUserDisplay('')}})}if(!firebaseReady){$('loginBtn').onclick=$('demoBtn').onclick;$('registerBtn').onclick=$('demoBtn').onclick}
$('exportJsonBtn').onclick=async()=>download(JSON.stringify({data:await getData()},null,2),'debt-backup.json','application/json');$('exportTxtBtn').onclick=async()=>download('DEBT_BACKUP\n'+JSON.stringify({data:await getData()},null,2),'debt-backup.txt','text/plain');function download(c,n,t){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([c],{type:t}));a.download=n;a.click()}$('importFile').onchange=async e=>{let f=e.target.files[0];if(!f)return;let txt=(await f.text()).replace(/^DEBT_BACKUP\s*/,'').trim();setLocal(JSON.parse(txt).data||JSON.parse(txt));demoMode=true;toast('Import เข้า Demo');render()};

if($('userMenuBtn')) $('userMenuBtn').onclick=(e)=>{e.stopPropagation();$('userDropdown').classList.toggle('hidden')};
if($('openProfileBtn')) $('openProfileBtn').onclick=()=>{switchTab('settings');$('userDropdown').classList.add('hidden');$('userProfileCard')?.scrollIntoView({behavior:'smooth'})};
if($('dropdownLogoutBtn')) $('dropdownLogoutBtn').onclick=()=>$('logoutBtn')?.click();
document.addEventListener('click',e=>{if($('userDropdown')&&!$('userMenuWrap')?.contains(e.target))$('userDropdown').classList.add('hidden')});

if($('closePreviewBtn')) $('closePreviewBtn').onclick=()=>$('documentPreviewModal').classList.add('hidden');
const themeModes=['light','dark','auto'];function getThemeMode(){return localStorage.getItem('themeMode')||'auto'}function applyTheme(){const mode=getThemeMode(),resolved=mode==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;document.documentElement.setAttribute('data-theme',resolved);document.body.setAttribute('data-theme',resolved);$('themeIcon').className=mode==='auto'?'bi bi-circle-half':resolved==='dark'?'bi bi-moon-stars':'bi bi-sun'}$('themeBtn').onclick=()=>{const cur=getThemeMode(),next=themeModes[(themeModes.indexOf(cur)+1)%themeModes.length];localStorage.setItem('themeMode',next);applyTheme();toast(next==='auto'?'โหมดอัตโนมัติ':next==='dark'?'โหมดกลางคืน':'โหมดกลางวัน')};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden')});$('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').classList.add('hidden')}};
async function setupSW(){if(!('serviceWorker'in navigator))return;const reg=await navigator.serviceWorker.register('service-worker.js');if(reg.waiting){newWorker=reg.waiting;$('updateBtn').classList.remove('hidden')}reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){newWorker=w;$('updateBtn').classList.remove('hidden');toast('มีเวอร์ชันใหม่พร้อมอัปเดต')}})});navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload())}$('updateBtn').onclick=()=>{if(newWorker)newWorker.postMessage({type:'SKIP_WAITING'});else location.reload()};$('clearCacheBtn').onclick=async()=>{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));toast('ล้าง Cache แล้ว')}};$('enablePushBtn').onclick=async()=>{if(!('Notification'in window))return toast('Browser ไม่รองรับ Notification');const p=await Notification.requestPermission();toast(p==='granted'?'เปิด Notification แล้ว':'ยังไม่ได้อนุญาต Notification')};
try{
  applyTheme();
  initFirebase();
  setupSW();
}catch(e){
  console.error('App init error:', e);
  toast('โหลดระบบไม่สำเร็จ: '+e.message);
}
