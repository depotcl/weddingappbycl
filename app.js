const firebaseConfig = {
    apiKey: "AIzaSyAvy-RseQtH3cNIT1vBfRwoKYDdp9jzb7g",
    authDomain: "weddingappbycl.firebaseapp.com",
    projectId: "weddingappbycl",
    storageBucket: "weddingappbycl.firebasestorage.app",
    messagingSenderId: "821863562021",
    appId: "1:821863562021:web:4d24221203e2c2466e38cc"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");

let currentUser = null;
let currentRole = null;
let weddingId = null;
let globalGeneralInfo = {}; 

function fmtNum(num) {
    if (!num) return '0';
    return parseFloat(num).toLocaleString('en-US');
}

// មុខងារជំនួយសម្រាប់លុបទិន្នន័យ (Batch Delete)
async function deleteCollectionByQuery(query) {
    const snapshot = await query.get();
    if (snapshot.size === 0) return;
    
    const batches = [];
    let batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
        // Firebase batch supports up to 500 operations
        if (count === 490) {
            batches.push(batch.commit());
            batch = db.batch();
            count = 0;
        }
    });
    
    if (count > 0) batches.push(batch.commit());
    await Promise.all(batches);
}

// មុខងារពិនិត្យ និងលុបទិន្នន័យស្វ័យប្រវត្តិបើហួសកំណត់ ១ឆ្នាំ (៣៦៥ថ្ងៃ)
async function checkAndAutoDeleteOldData(weddingDateStr) {
    if (!weddingDateStr) return;
    const weddingDate = new Date(weddingDateStr);
    const currentDate = new Date();
    
    // ធានាថាថ្ងៃបច្ចុប្បន្ន គឺពិតជាក្រោយថ្ងៃរៀបការ
    if (currentDate <= weddingDate) return;

    // គណនាគម្លាតពេលជាថ្ងៃ
    const diffTime = currentDate.getTime() - weddingDate.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    
    // បើលើសពី ១ឆ្នាំ (៣៦៥ថ្ងៃ) ធ្វើការលុបទិន្នន័យចោល
    if (diffDays > 365) {
        try {
            console.log("ទិន្នន័យមានអាយុកាលលើសពី ១ឆ្នាំ, កំពុងដំណើរការលុប...");
            
            // 1. លុបទិន្នន័យភ្ញៀវ ចំណងដៃ ចំណាយ របស់ពិធីនេះ
            await deleteCollectionByQuery(db.collection('guests').where('weddingId', '==', weddingId));
            await deleteCollectionByQuery(db.collection('donations').where('weddingId', '==', weddingId));
            await deleteCollectionByQuery(db.collection('expenses').where('weddingId', '==', weddingId));
            
            // 2. លុបគណនីបុគ្គលិក (Sub-users / Staff) ដែលភ្ជាប់ជាមួយពិធីនេះ
            await deleteCollectionByQuery(db.collection('users').where('ownerId', '==', weddingId));
            
            // 3. លុបឯកសារព័ត៌មានពិធីមង្គលការ (Wedding Document)
            await db.collection('weddings').doc(weddingId).delete();
            
            alert("ចំណាំ៖ ប្រព័ន្ធបានលុបទិន្នន័យរបស់លោកអ្នកចេញពី Database ដោយស្វ័យប្រវត្តិ ដោយសារកាលបរិច្ឆេទអាពាហ៍ពិពាហ៍បានកន្លងផុតលើសពី ១ ឆ្នាំ។");
            
            // ចាកចេញពីប្រព័ន្ធ
            logout();
        } catch(e) {
            console.error("កំហុសក្នុងការលុបទិន្នន័យស្វ័យប្រវត្តិ: ", e);
        }
    }
}

// ================= UI & Navigation =================
function showPage(pageId, btnElement = null) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('page-' + pageId).classList.remove('hidden');
    
    if(btnElement) {
        document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active-menu'));
        btnElement.classList.add('active-menu');
    }

    if(pageId === 'guests') loadGuests();
    if(pageId === 'donations') { loadDonations(); populateGuestSelect(); }
    if(pageId === 'expenses') loadExpenses();
    if(pageId === 'reports') loadReports();
    if(pageId === 'users') loadUsers();
    
    if(currentRole === 'staff') {
         document.getElementById('menu-expenses').classList.add('hidden');
         document.getElementById('menu-users').classList.add('hidden');
         if(pageId === 'expenses') document.getElementById('page-expenses').innerHTML = "<p class='text-red-500 p-6'>បុគ្គលិកមិនមានសិទ្ធិចូលមើលការចំណាយទេ!</p>";
         if(pageId === 'reports') document.getElementById('page-reports').innerHTML = "<p class='text-red-500 p-6'>បុគ្គលិកមិនមានសិទ្ធិមើលរបាយការណ៍ទេ!</p>";
         if(pageId === 'users') document.getElementById('page-users').innerHTML = "<p class='text-red-500 p-6'>បុគ្គលិកមិនមានសិទ្ធិចូលទីនេះទេ!</p>";
    } else {
         document.getElementById('menu-expenses').classList.remove('hidden');
         document.getElementById('menu-users').classList.remove('hidden');
    }
}

// ================= Auth =================
async function handleAuth(action) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("សូមបំពេញចន្លោះ!");
    try { await auth.signInWithEmailAndPassword(email, password); } 
    catch (error) { alert("កំហុស: " + error.message); }
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if(doc.exists) {
            const data = doc.data();
            currentUser = user; currentRole = data.role;
            weddingId = (currentRole === 'admin') ? user.uid : data.ownerId;

            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('app-section').classList.remove('hidden');
            
            document.getElementById('current-user-display').innerText = "គណនី: " + user.email;
            document.getElementById('current-role-display').innerText = (currentRole === 'admin') ? "[អ្នកគ្រប់គ្រង (Admin)]" : "[បុគ្គលិក (Staff)]";

            loadGeneralInfo();
            showPage('info', document.getElementById('menu-info'));
        } else {
            await db.collection('users').doc(user.uid).set({
                email: user.email, role: 'admin', ownerId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.location.reload();
        }
    } else {
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('app-section').classList.add('hidden');
    }
});

function logout() { auth.signOut(); }

function openModal(id) { 
    document.getElementById(id).classList.remove('hidden'); 
    if(id === 'donation-modal') document.getElementById('d-date').valueAsDate = new Date();
    if(id === 'expense-modal') document.getElementById('e-date').valueAsDate = new Date();
}
function closeModal(id) { 
    document.getElementById(id).classList.add('hidden');
    if(id === 'guest-modal') {
        document.getElementById('g-docId').value = ''; document.getElementById('g-autoId').value = '';
        document.querySelectorAll('#guest-modal input[type="text"], #guest-modal input[type="number"]').forEach(el => el.value = '');
        document.getElementById('g-side').value = '';
    }
    if(id === 'donation-modal') {
        document.querySelectorAll('#donation-modal input').forEach(el => el.value = '');
        document.getElementById('guest-custom-dropdown').classList.add('hidden');
    }
    if(id === 'expense-modal') document.querySelectorAll('#expense-modal input, #expense-modal textarea').forEach(el => el.value = '');
}
function searchTable(tbodyId, query) {
    const rows = document.querySelectorAll(`#${tbodyId} tr`);
    query = query.toLowerCase();
    rows.forEach(row => { row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none'; });
}

// ================= ព័ត៌មានទូទៅ & Backup/Restore =================
async function loadGeneralInfo() {
    try {
        const doc = await db.collection('weddings').doc(weddingId).get();
        if(doc.exists) {
            globalGeneralInfo = doc.data();
            document.getElementById('info-groom').value = globalGeneralInfo.groom || '';
            document.getElementById('info-bride').value = globalGeneralInfo.bride || '';
            document.getElementById('info-date').value = globalGeneralInfo.date || '';
            document.getElementById('info-location').value = globalGeneralInfo.location || '';
            let groomName = globalGeneralInfo.groom || 'កូនកំលោះ'; let brideName = globalGeneralInfo.bride || 'កូនក្រមុំ';
            document.getElementById('sidebar-couple-names').innerText = `${groomName} និង ${brideName}`;
            
            // ហៅមុខងារពិនិត្យ និងលុបទិន្នន័យស្វ័យប្រវត្តិ
            checkAndAutoDeleteOldData(globalGeneralInfo.date);
        }
    } catch(e) { console.error(e); }
}
async function saveGeneralInfo() {
    if(currentRole !== 'admin') return alert("សិទ្ធិត្រឹមជា Admin ទើបអាចកែប្រែបាន!");
    const data = {
        groom: document.getElementById('info-groom').value, bride: document.getElementById('info-bride').value,
        date: document.getElementById('info-date').value, location: document.getElementById('info-location').value
    };
    await db.collection('weddings').doc(weddingId).set(data, {merge: true});
    document.getElementById('sidebar-couple-names').innerText = `${data.groom || 'កូនកំលោះ'} និង ${data.bride || 'កូនក្រមុំ'}`;
    alert("រក្សាទុកជោគជ័យ!");
}
async function backupData() {
    if(currentRole !== 'admin') return alert("Admin ទើបអាច Backup បាន");
    try {
        let backup = { guests: [], donations: [], expenses: [] };
        const collections = ['guests', 'donations', 'expenses'];
        for(let col of collections) {
            let snap = await db.collection(col).where('weddingId', '==', weddingId).get();
            snap.forEach(doc => backup[col].push(doc.data()));
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
        const anchor = document.createElement('a'); anchor.href = dataStr;
        anchor.download = `Backup_Wedding_${weddingId}.json`; anchor.click();
    } catch(e) { alert("Backup Failed: " + e.message); }
}
function restoreData(event) {
    if(currentRole !== 'admin') return alert("Admin ទើបអាច Restore បាន");
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(confirm("តើអ្នកចង់ Restore បញ្ចូលទិន្នន័យនេះមែនទេ?")) {
                const collections = ['guests', 'donations', 'expenses'];
                for(let col of collections) {
                    if(data[col]) {
                        for(let item of data[col]) { item.weddingId = weddingId; await db.collection(col).add(item); }
                    }
                }
                alert("Restore ជោគជ័យ!"); window.location.reload();
            }
        } catch(error) { alert("ឯកសារមិនត្រឹមត្រូវទេ"); }
    };
    reader.readAsText(file);
}

// ================= បញ្ជីភ្ញៀវ & Import/Export Excel =================
function downloadGuestTemplate() {
    const ws_data = [ ["លេខកូដ", "ឈ្មោះភ្ញៀវ", "ភេទ", "ខាងណា", "ទូរស័ព្ទ", "អាសយដ្ឋាន", "ចំនួនចូលរួម"] ];
    const ws = XLSX.utils.aoa_to_sheet(ws_data); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Guest_Template.xlsx");
}

async function exportGuestsToExcel() {
    try {
        const snapshot = await db.collection('guests').where('weddingId', '==', weddingId).get();
        let guests = []; snapshot.forEach(doc => guests.push(doc.data()));
        guests.sort((a, b) => parseInt(a.autoId) - parseInt(b.autoId));

        const donSnap = await db.collection('donations').where('weddingId', '==', weddingId).get();
        let donations = []; donSnap.forEach(d => donations.push(d.data()));

        let exportData = [];
        guests.forEach(d => {
            let totalRiel = 0, totalUsd = 0, otherItems = [];
            
            donations.forEach(don => {
                if(don.guestId === d.autoId) {
                    totalRiel += (parseFloat(don.riel) || 0);
                    totalUsd += (parseFloat(don.usd) || 0);
                    if(don.other) otherItems.push(don.other);
                }
            });

            exportData.push({
                "លេខកូដ": d.autoId || '',
                "ឈ្មោះភ្ញៀវ": d.name || '',
                "ភេទ": d.gender || '',
                "ខាងណា": d.side || '',
                "ទូរស័ព្ទ": d.phone1 || '',
                "អាសយដ្ឋាន": d.address || '',
                "ចំនួនចូលរួម": parseInt(d.pax) || 0,
                "ចំណងដៃ (៛)": totalRiel,
                "ចំណងដៃ ($)": totalUsd,
                "ផ្សេងៗ": otherItems.join(', ')
            });
        });

        let headerName = document.getElementById('report-header-names') ? document.getElementById('report-header-names').innerText : 'បញ្ជីភ្ញៀវនិងចំណងដៃ';
        
        let ws_data = [
            [`បញ្ជីឈ្មោះភ្ញៀវ និងចំណងដៃ - ${headerName}`],
            ["លេខកូដ", "ឈ្មោះភ្ញៀវ", "ភេទ", "ខាងណា", "ទូរស័ព្ទ", "អាសយដ្ឋាន", "ចំនួនចូលរួម", "ចំណងដៃ (៛)", "ចំណងដៃ ($)", "ផ្សេងៗ"]
        ];
        
        exportData.forEach(r => {
            ws_data.push([
                r['លេខកូដ'], r['ឈ្មោះភ្ញៀវ'], r['ភេទ'], r['ខាងណា'], r['ទូរស័ព្ទ'], r['អាសយដ្ឋាន'], 
                r['ចំនួនចូលរួម'], r['ចំណងដៃ (៛)'], r['ចំណងដៃ ($)'], r['ផ្សេងៗ']
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Guests & Donations");
        XLSX.writeFile(wb, "Guest_List.xlsx");
    } catch(e) { alert("បរាជ័យក្នុងការ ទាញទៅExcel៖ " + e.message); }
}

function importGuestsFromExcel(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, {type: 'array'});
            const sheetName = workbook.SheetNames[0]; const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            if(json.length === 0) return alert("ឯកសារទទេ!");
            
            const snapshot = await db.collection('guests').where('weddingId', '==', weddingId).get();
            let existingByAutoId = {}; let maxId = 0;
            snapshot.forEach(doc => {
                const d = doc.data(); existingByAutoId[d.autoId] = doc.id;
                const currentId = parseInt(d.autoId); if(currentId > maxId) maxId = currentId;
            });

            let hasDuplicates = false;
            for(let row of json) {
                let code = (row['លេខកូដ'] || '').toString().padStart(3, '0');
                if(code !== '000' && existingByAutoId[code]) { hasDuplicates = true; break; }
            }

            let overwrite = false;
            if(hasDuplicates) overwrite = confirm("ប្រព័ន្ធរកឃើញមាន 'លេខកូដ' ស្ទួនគ្នានឹងទិន្នន័យចាស់។\n- ចុច [OK] យកទិន្នន័យថ្មីទៅជំនួស (Overwrite)\n- ចុច [Cancel] ដើម្បីរំលង");
            else if(!confirm(`រកឃើញទិន្នន័យ ${json.length} ជួរ។ ចុច OK ដើម្បីបញ្ចូនចូល។`)) return;

            document.getElementById('guest-tbody').innerHTML = '<tr><td colspan="11" class="text-center p-4">កំពុងបញ្ចូនទិន្នន័យ... សូមរង់ចាំ...</td></tr>';
            for(let row of json) {
                let code = (row['លេខកូដ'] || '').toString(); let name = (row['ឈ្មោះភ្ញៀវ'] || row['Name'] || '').toString().trim();
                if(!name) continue; 
                let finalAutoId = ''; let docIdToUpdate = null;
                if(code && existingByAutoId[code.padStart(3, '0')]) {
                    if(overwrite) { finalAutoId = code.padStart(3, '0'); docIdToUpdate = existingByAutoId[finalAutoId]; } 
                    else { continue; }
                } else {
                    maxId++; finalAutoId = code ? code.padStart(3, '0') : maxId.toString().padStart(3, '0');
                }
                const newData = {
                    weddingId: weddingId, autoId: finalAutoId, name: name, gender: row['ភេទ'] || '', side: row['ខាងណា'] || '', 
                    phone1: (row['ទូរស័ព្ទ'] || '').toString(), address: row['អាសយដ្ឋាន'] || '', pax: parseInt(row['ចំនួនចូលរួម']) || 0,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                if(docIdToUpdate) await db.collection('guests').doc(docIdToUpdate).update(newData);
                else await db.collection('guests').add(newData);
            }
            alert("ទាញយកចូលជោគជ័យ!"); loadGuests();
        } catch(err) { alert("មានបញ្ហាក្នុងការទាញចូល៖ " + err.message); loadGuests(); }
    };
    reader.readAsArrayBuffer(file); event.target.value = ''; 
}
async function saveGuest() {
    try {
        const docId = document.getElementById('g-docId').value; let autoId = document.getElementById('g-autoId').value;
        if (!docId) {
            const snapshot = await db.collection('guests').where('weddingId', '==', weddingId).get();
            let maxId = 0; snapshot.forEach(doc => { const currentId = parseInt(doc.data().autoId); if(currentId > maxId) maxId = currentId; });
            autoId = (maxId + 1).toString().padStart(3, '0');
        }
        const data = {
            weddingId: weddingId, autoId: autoId, name: document.getElementById('g-name').value || '', 
            gender: document.getElementById('g-gender').value || '', side: document.getElementById('g-side').value || '', 
            phone1: document.getElementById('g-phone1').value || '', phone2: document.getElementById('g-phone2').value || '', 
            address: document.getElementById('g-address').value || '', pax: parseInt(document.getElementById('g-pax').value) || 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if(docId) await db.collection('guests').doc(docId).update(data); else await db.collection('guests').add(data);
        closeModal('guest-modal'); loadGuests(); 
    } catch(error) { alert("បរាជ័យ៖ " + error.message); }
}
async function loadGuests() {
    try {
        const tbody = document.getElementById('guest-tbody'); tbody.innerHTML = '<tr><td colspan="11" class="text-center p-4">កំពុងទាញទិន្នន័យ...</td></tr>';
        const guestsSnapshot = await db.collection('guests').where('weddingId', '==', weddingId).get();
        let guests = []; let totalPax = 0;
        guestsSnapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; guests.push(d); });
        guests.sort((a, b) => parseInt(a.autoId) - parseInt(b.autoId));

        const donationsSnapshot = await db.collection('donations').where('weddingId', '==', weddingId).get();
        let donations = []; donationsSnapshot.forEach(d => donations.push(d.data()));

        tbody.innerHTML = ''; let i = 1;
        guests.forEach(d => {
            let pax = d.pax || 0; totalPax += pax;
            let totalRiel = 0, totalUsd = 0, otherItems = [];
            donations.forEach(don => {
                if(don.guestId === d.autoId) {
                    totalRiel += (parseFloat(don.riel) || 0); totalUsd += (parseFloat(don.usd) || 0);
                    if(don.other) otherItems.push(don.other);
                }
            });
            let otherText = otherItems.join(', ');

            let moneyUI = `<td class="p-2 border font-bold text-gray-700">${fmtNum(totalRiel)}</td><td class="p-2 border font-bold text-gray-700">${fmtNum(totalUsd)}</td><td class="p-2 border text-purple-700">${otherText}</td>`;
            
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2 border">${i++}</td><td class="p-2 border font-bold"><a href="#" onclick="editGuest('${d.id}')" class="text-blue-600 hover:underline">${d.autoId}</a></td>
                    <td class="p-2 border">${d.name}</td><td class="p-2 border">${d.gender}</td>
                    <td class="p-2 border">${d.phone1}</td><td class="p-2 border">${d.side}</td>
                    <td class="p-2 border text-center font-bold text-green-600">${pax}</td>
                    ${moneyUI}
                    <td class="p-2 border text-center flex justify-center gap-2">
                        <button onclick="editGuest('${d.id}')" class="text-blue-500 hover:underline">កែ</button>
                        ${currentRole === 'admin' ? `<button onclick="deleteDoc('guests', '${d.id}')" class="text-red-500 hover:underline">លុប</button>` : ''}
                    </td>
                </tr>`;
        });
        document.getElementById('total-guest-count').innerText = `(សរុបមានអ្នកចូលរួម៖ ${totalPax} នាក់)`;
    } catch(e) { console.error(e); }
}
async function editGuest(id) {
    const doc = await db.collection('guests').doc(id).get(); const d = doc.data();
    document.getElementById('g-docId').value = id; document.getElementById('g-autoId').value = d.autoId;
    document.getElementById('g-name').value = d.name || ''; document.getElementById('g-gender').value = d.gender || '';
    document.getElementById('g-side').value = d.side || ''; document.getElementById('g-pax').value = d.pax !== undefined ? d.pax : '';
    document.getElementById('g-phone1').value = d.phone1 || ''; document.getElementById('g-phone2').value = d.phone2 || '';
    document.getElementById('g-address').value = d.address || ''; openModal('guest-modal');
}

// ================= បញ្ជីចំណងដៃ =================
let allGuests = [];
async function populateGuestSelect() {
    try {
        const snapshot = await db.collection('guests').where('weddingId', '==', weddingId).get();
        allGuests = [];
        snapshot.forEach(doc => {
            const d = doc.data(); d.id = doc.id;
            d.searchStr = `[${d.autoId}] ${d.name} ${d.phone1 ? '- ' + d.phone1 : ''}`;
            allGuests.push(d);
        });
        
        allGuests.sort((a, b) => parseInt(a.autoId) - parseInt(b.autoId));
        renderGuestDropdown(allGuests);
    } catch(e) { console.error(e); }
}

function renderGuestDropdown(list) {
    const ul = document.getElementById('guest-dropdown-list');
    ul.innerHTML = '';
    if(list.length === 0) {
        ul.innerHTML = '<li class="p-2 text-gray-500 text-sm">មិនមានទិន្នន័យ...</li>';
        return;
    }
    list.forEach(guest => {
        const li = document.createElement('li');
        li.className = 'p-2 hover:bg-blue-100 cursor-pointer border-b text-sm transition text-gray-700';
        li.innerText = guest.searchStr;
        li.onclick = () => selectGuestFromDropdown(guest);
        ul.appendChild(li);
    });
}
function filterGuestDropdown() {
    const val = document.getElementById('d-guestSearch').value.toLowerCase();
    const filtered = allGuests.filter(g => g.searchStr.toLowerCase().includes(val));
    renderGuestDropdown(filtered);
    showGuestDropdown();
    
    if(val === '') {
        document.getElementById('d-guestDocId').value = ''; document.getElementById('d-guestId').value = '';
        document.getElementById('d-name').value = ''; document.getElementById('d-gender').value = ''; document.getElementById('d-side').value = '';
    }
}
function showGuestDropdown() { document.getElementById('guest-custom-dropdown').classList.remove('hidden'); }
function hideGuestDropdown() { 
    setTimeout(() => document.getElementById('guest-custom-dropdown').classList.add('hidden'), 200); 
}
function selectGuestFromDropdown(guest) {
    document.getElementById('d-guestSearch').value = guest.searchStr;
    document.getElementById('d-guestDocId').value = guest.id;
    document.getElementById('d-guestId').value = guest.autoId;
    document.getElementById('d-name').value = guest.name;
    document.getElementById('d-gender').value = guest.gender;
    document.getElementById('d-side').value = guest.side;
    document.getElementById('guest-custom-dropdown').classList.add('hidden');
}

async function saveDonation() {
    try {
        const docId = document.getElementById('d-docId').value;
        const guestId = document.getElementById('d-guestId').value;
        if(!docId && guestId) {
            const checkQuery = await db.collection('donations').where('weddingId', '==', weddingId).where('guestId', '==', guestId).get();
            if(!checkQuery.empty) {
                if(!confirm("ភ្ញៀវនេះធ្លាប់ចងដៃហើយ តើអ្នកចង់បញ្ចូលគាត់ម្តងទៀតឬ? (ចុច OK ដើម្បីបន្ថែមថ្មី, Cancel ដើម្បីបោះបង់)")) return;
            }
        }
        const data = {
            weddingId: weddingId, date: document.getElementById('d-date').value || '', guestId: guestId, 
            guestDocId: document.getElementById('d-guestDocId').value || '', name: document.getElementById('d-name').value || '', 
            gender: document.getElementById('d-gender').value || '', side: document.getElementById('d-side').value || '', 
            riel: parseFloat(document.getElementById('d-riel').value) || 0, usd: parseFloat(document.getElementById('d-usd').value) || 0,
            other: document.getElementById('d-other').value || '', updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if(docId) await db.collection('donations').doc(docId).update(data);
        else await db.collection('donations').add(data);
        closeModal('donation-modal'); loadDonations();
    } catch(error) { alert("បរាជ័យ៖ " + error.message); }
}

async function loadDonations() {
    try {
        const tbody = document.getElementById('donation-tbody'); tbody.innerHTML = '<tr><td colspan="9" class="text-center p-4">កំពុងទាញទិន្នន័យ...</td></tr>';
        const snapshot = await db.collection('donations').where('weddingId', '==', weddingId).get();
        let donations = [];
        snapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; donations.push(d); });
        
        donations.sort((a, b) => {
            let timeA = a.updatedAt ? a.updatedAt.toMillis() : 0;
            let timeB = b.updatedAt ? b.updatedAt.toMillis() : 0;
            return timeB - timeA;
        });

        tbody.innerHTML = '';
        let i = 1;
        donations.forEach(d => {
            let moneyUI = `<td class="p-2 border text-gray-700">${fmtNum(d.riel)}</td><td class="p-2 border text-gray-700">${fmtNum(d.usd)}</td><td class="p-2 border text-purple-700">${d.other || ''}</td>`;
            
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2 border">${i++}</td><td class="p-2 border"><a href="#" onclick="showPage('donations', document.getElementById('menu-donations')); editDonation('${d.id}')" class="text-blue-500 hover:underline">${d.date}</a></td>
                    <td class="p-2 border font-bold text-blue-600">${d.guestId}</td><td class="p-2 border">${d.name}</td>
                    <td class="p-2 border">${d.side}</td> ${moneyUI}
                    <td class="p-2 border text-center flex justify-center gap-2">
                        <button onclick="editDonation('${d.id}')" class="text-blue-500 hover:underline">កែ</button>
                        ${currentRole === 'admin' ? `<button onclick="deleteDoc('donations', '${d.id}')" class="text-red-500 hover:underline">លុប</button>` : ''}
                    </td>
                </tr>`;
        });
    } catch(e) { console.error(e); }
}
async function editDonation(id) {
    const doc = await db.collection('donations').doc(id).get(); const d = doc.data();
    document.getElementById('d-docId').value = id; document.getElementById('d-date').value = d.date || '';
    const guestObj = allGuests.find(g => g.autoId === d.guestId);
    if(guestObj) { 
        document.getElementById('d-guestSearch').value = guestObj.searchStr; 
        selectGuestFromDropdown(guestObj);
    }
    document.getElementById('d-riel').value = d.riel || ''; 
    document.getElementById('d-usd').value = d.usd || '';
    document.getElementById('d-other').value = d.other || '';
    openModal('donation-modal');
}

// ================= បញ្ជីចំណាយ =================
async function saveExpense() {
    try {
        const docId = document.getElementById('e-docId').value;
        const data = {
            weddingId: weddingId, date: document.getElementById('e-date').value || '', supplier: document.getElementById('e-supplier').value || '', 
            desc: document.getElementById('e-desc').value || '', riel: parseFloat(document.getElementById('e-riel').value) || 0, 
            usd: parseFloat(document.getElementById('e-usd').value) || 0, other: document.getElementById('e-other').value || '', 
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if(docId) await db.collection('expenses').doc(docId).update(data);
        else await db.collection('expenses').add(data);
        closeModal('expense-modal'); loadExpenses();
    } catch (error) { alert("បរាជ័យ៖ " + error.message); }
}
async function loadExpenses() {
    try {
        const tbody = document.getElementById('expense-tbody'); tbody.innerHTML = '';
        const snapshot = await db.collection('expenses').where('weddingId', '==', weddingId).get();
        let expenses = [];
        snapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; expenses.push(d); });
        
        expenses.sort((a, b) => {
            let timeA = a.updatedAt ? a.updatedAt.toMillis() : 0;
            let timeB = b.updatedAt ? b.updatedAt.toMillis() : 0;
            return timeB - timeA;
        });
        
        let i = 1;
        expenses.forEach(d => {
            tbody.innerHTML += `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2 border">${i++}</td><td class="p-2 border"><a href="#" onclick="showPage('expenses', document.getElementById('menu-expenses')); editExpense('${d.id}')" class="text-blue-500 hover:underline">${d.date}</a></td>
                    <td class="p-2 border">${d.supplier}</td><td class="p-2 border">${d.desc}</td>
                    <td class="p-2 border">${fmtNum(d.riel)}</td><td class="p-2 border">${fmtNum(d.usd)}</td>
                    <td class="p-2 border text-center flex justify-center gap-2">
                        <button onclick="editExpense('${d.id}')" class="text-blue-500 hover:underline">កែ</button>
                        ${currentRole === 'admin' ? `<button onclick="deleteDoc('expenses', '${d.id}')" class="text-red-500 hover:underline">លុប</button>` : ''}
                    </td>
                </tr>`;
        });
    } catch(e) { console.error(e); }
}
async function editExpense(id) {
    const doc = await db.collection('expenses').doc(id).get(); const d = doc.data();
    document.getElementById('e-docId').value = id; document.getElementById('e-date').value = d.date || '';
    document.getElementById('e-supplier').value = d.supplier || ''; document.getElementById('e-desc').value = d.desc || '';
    document.getElementById('e-riel').value = d.riel || ''; document.getElementById('e-usd').value = d.usd || '';
    document.getElementById('e-other').value = d.other || '';
    openModal('expense-modal');
}
async function deleteDoc(collection, id) {
    if(confirm("តើអ្នកពិតជាចង់លុបទិន្នន័យនេះមែនទេ?")) {
        await db.collection(collection).doc(id).delete();
        if(collection === 'guests') loadGuests();
        if(collection === 'donations') loadDonations();
        if(collection === 'expenses') loadExpenses();
    }
}

// ================= របាយការណ៍ =================
async function loadReports() {
    if(currentRole !== 'admin') return;
    try {
        const type = document.getElementById('report-type').value;
        
        document.getElementById('report-view-all').classList.add('hidden');
        document.getElementById('report-view-income').classList.add('hidden');
        document.getElementById('report-view-expense').classList.add('hidden');
        document.getElementById('report-view-guest').classList.add('hidden');

        let title = (globalGeneralInfo.groom && globalGeneralInfo.bride) ? `អាពាហ៍ពិពាហ៍៖ ${globalGeneralInfo.groom} និង ${globalGeneralInfo.bride}` : "";
        document.getElementById('report-header-names').innerText = title;

        const gSnap = await db.collection('guests').where('weddingId', '==', weddingId).get();
        let totalPax = 0; let guests = [];
        gSnap.forEach(doc => { guests.push(doc.data()); });
        guests.sort((a, b) => parseInt(a.autoId) - parseInt(b.autoId));

        const guestBody = document.getElementById('rpt-guest-tbody'); guestBody.innerHTML = '';
        guests.forEach(d => {
            totalPax += (d.pax || 0); 
            guestBody.innerHTML += `<tr><td class="p-2 border font-bold text-blue-600">${d.autoId}</td><td class="p-2 border">${d.name}</td><td class="p-2 border">${d.side}</td><td class="p-2 border text-center font-bold text-green-600">${d.pax || 0}</td></tr>`;
        });
        document.getElementById('rpt-total-pax').innerText = totalPax + " នាក់";

        const inSnap = await db.collection('donations').where('weddingId', '==', weddingId).get();
        let totalInRiel = 0, totalInUsd = 0; let donations = []; let otherItemsArr = [];
        inSnap.forEach(doc => { donations.push(doc.data()); });
        
        donations.sort((a, b) => parseInt(a.guestId) - parseInt(b.guestId));

        const inBody = document.getElementById('rpt-income-tbody'); inBody.innerHTML = '';
        donations.forEach(d => {
            totalInRiel += (parseFloat(d.riel) || 0); totalInUsd += (parseFloat(d.usd) || 0);
            if(d.other) otherItemsArr.push(d.other); 
            
            inBody.innerHTML += `<tr>
                <td class="p-2 border">${d.date}</td><td class="p-2 border">${d.guestId}</td>
                <td class="p-2 border">${d.name}</td><td class="p-2 border">${fmtNum(d.riel)}</td>
                <td class="p-2 border">${fmtNum(d.usd)}</td><td class="p-2 border text-purple-700 font-bold">${d.other || ''}</td>
            </tr>`;
        });
        document.getElementById('rpt-total-in-riel').innerText = fmtNum(totalInRiel) + " ៛";
        document.getElementById('rpt-total-in-usd').innerText = "$ " + fmtNum(totalInUsd);
        document.getElementById('rpt-total-other').innerText = otherItemsArr.join(", ") || "គ្មាន";

        const exSnap = await db.collection('expenses').where('weddingId', '==', weddingId).get();
        let totalExRiel = 0, totalExUsd = 0; let expenses = [];
        exSnap.forEach(doc => { expenses.push(doc.data()); });
        expenses.sort((a, b) => b.updatedAt?.toMillis() - a.updatedAt?.toMillis());

        const exBody = document.getElementById('rpt-expense-tbody'); exBody.innerHTML = '';
        expenses.forEach(d => {
            totalExRiel += (parseFloat(d.riel) || 0); totalExUsd += (parseFloat(d.usd) || 0);
            exBody.innerHTML += `<tr><td class="p-2 border">${d.date}</td><td class="p-2 border">${d.supplier}</td><td class="p-2 border">${d.desc}</td><td class="p-2 border">${fmtNum(d.riel)}</td><td class="p-2 border">${fmtNum(d.usd)}</td></tr>`;
        });
        document.getElementById('rpt-total-ex-riel').innerText = fmtNum(totalExRiel) + " ៛";
        document.getElementById('rpt-total-ex-usd').innerText = "$ " + fmtNum(totalExUsd);

        const netRiel = totalInRiel - totalExRiel; const netUsd = totalInUsd - totalExUsd;
        document.getElementById('rpt-net-riel').innerText = fmtNum(netRiel) + " ៛";
        document.getElementById('rpt-net-usd').innerText = "$ " + fmtNum(netUsd);

        if(type === 'all') {
            document.getElementById('report-view-all').classList.remove('hidden');
            document.getElementById('report-view-income').classList.remove('hidden');
            document.getElementById('report-view-expense').classList.remove('hidden');
        } else {
            document.getElementById(`report-view-${type}`).classList.remove('hidden');
        }
    } catch(e) { console.error(e); }
}

function getSheetWithTitle(tableId, title) {
    const tbl = document.getElementById(tableId);
    const ws = XLSX.utils.table_to_sheet(tbl, { raw: true }); 
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
    aoa.unshift([title]);
    return XLSX.utils.aoa_to_sheet(aoa);
}

async function exportReportToExcel() {
    try {
        const type = document.getElementById('report-type').value;
        let wb = XLSX.utils.book_new();
        
        let reportNameMap = { 'all': 'របាយការណ៍សរុប', 'income': 'របាយការណ៍ចំណូល', 'expense': 'របាយការណ៍ចំណាយ', 'guest': 'របាយការណ៍ភ្ញៀវ' };
        let headerName = document.getElementById('report-header-names').innerText;
        let fileName = `${reportNameMap[type]}.xlsx`;

        if(type === 'all' || type === 'income') {
            const snap = await db.collection('donations').where('weddingId', '==', weddingId).get();
            let arr = []; snap.forEach(doc => arr.push(doc.data()));
            arr.sort((a, b) => parseInt(a.guestId) - parseInt(b.guestId));
            
            let ws_data = [
                [`របាយការណ៍ចំណូល - ${headerName}`], 
                ["កាលបរិច្ឆេទ", "លេខកូដ", "ឈ្មោះភ្ញៀវ", "ទឹកប្រាក់ (៛)", "ទឹកប្រាក់ ($)", "ផ្សេងៗ (សម្ភារៈ)"]
            ];
            arr.forEach(d => { ws_data.push([ d.date || '', d.guestId || '', d.name || '', parseFloat(d.riel) || 0, parseFloat(d.usd) || 0, d.other || '' ]); });
            let ws = XLSX.utils.aoa_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, "ចំណូល");
        }

        if(type === 'all' || type === 'expense') {
            const snap = await db.collection('expenses').where('weddingId', '==', weddingId).get();
            let arr = []; snap.forEach(doc => arr.push(doc.data()));
            arr.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0));
            
            let ws_data = [ [`របាយការណ៍ចំណាយ - ${headerName}`], ["កាលបរិច្ឆេទ", "អ្នកផ្គត់ផ្គង់", "បរិយាយ", "ទឹកប្រាក់ (៛)", "ទឹកប្រាក់ ($)", "ផ្សេងៗ"] ];
            arr.forEach(d => { ws_data.push([ d.date || '', d.supplier || '', d.desc || '', parseFloat(d.riel) || 0, parseFloat(d.usd) || 0, d.other || '' ]); });
            let ws = XLSX.utils.aoa_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, "ចំណាយ");
        }

        if(type === 'all' || type === 'guest') {
            const snap = await db.collection('guests').where('weddingId', '==', weddingId).get();
            let arr = []; snap.forEach(doc => arr.push(doc.data()));
            arr.sort((a, b) => parseInt(a.autoId) - parseInt(b.autoId));
            
            let ws_data = [ [`របាយការណ៍ភ្ញៀវចូលរួម - ${headerName}`], ["លេខកូដ", "ឈ្មោះភ្ញៀវ", "ខាងណា?", "ចំនួនចូលរួម (នាក់)"] ];
            arr.forEach(d => { ws_data.push([ d.autoId || '', d.name || '', d.side || '', parseInt(d.pax) || 0 ]); });
            let ws = XLSX.utils.aoa_to_sheet(ws_data);
            XLSX.utils.book_append_sheet(wb, ws, "ភ្ញៀវចូលរួម");
        }
        
        XLSX.writeFile(wb, fileName);
    } catch(e) { alert("បរាជ័យក្នុងការ Export របាយការណ៍៖ " + e.message); }
}

// ================= គ្រប់គ្រងគណនីប្រើប្រាស់ (User Management) =================
let editingUserId = null;
window.allUsersData = [];

async function loadUsers() {
    if(currentRole !== 'admin') return;
    try {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">កំពុងទាញទិន្នន័យ...</td></tr>';
        
        const snapshot = await db.collection('users').where('ownerId', '==', weddingId).get();
        let users = []; snapshot.forEach(doc => { let d = doc.data(); d.id = doc.id; users.push(d); });
        
        window.allUsersData = users;
        document.getElementById('users-count').innerText = `(${users.length} / 5)`;
        
        tbody.innerHTML = ''; let i = 1;
        users.forEach(u => {
            let roleText = u.role === 'admin' ? '<span class="text-green-600 font-bold">Admin</span>' : '<span class="text-blue-600">Staff</span>';
            let actionBtns = (u.id !== currentUser.uid) ? 
                `<button onclick="editUser('${u.id}')" class="text-blue-500 hover:underline mr-3">កែប្រែ</button>
                 <button onclick="removeUser('${u.id}')" class="text-red-500 hover:underline">លុប</button>` 
                : `<span class="text-gray-400">ខ្លួនឯង</span>`;
                
            tbody.innerHTML += `<tr class="border-b"><td class="p-2 border">${i++}</td><td class="p-2 border font-bold">${u.email}</td><td class="p-2 border">${roleText}</td><td class="p-2 border text-center">${actionBtns}</td></tr>`;
        });
    } catch(error) { console.error(error); }
}

function editUser(id) {
    editingUserId = id;
    const u = window.allUsersData.find(x => x.id === id);
    document.getElementById('u-email').value = u.email;
    document.getElementById('u-role').value = u.role;
    document.getElementById('u-pass').value = '';
    document.getElementById('u-pass').placeholder = '(ទុកចំហរ បើមិនចង់ដូរលេខសម្ងាត់)';
    
    document.getElementById('btn-create-user').innerText = 'រក្សាទុកការកែប្រែ';
    document.getElementById('btn-cancel-edit-user').classList.remove('hidden');
}

function cancelEditUser() {
    editingUserId = null;
    document.getElementById('u-email').value = '';
    document.getElementById('u-pass').value = '';
    document.getElementById('u-pass').placeholder = 'ពាក្យសម្ងាត់ (យ៉ាងតិច ៦ខ្ទង់)';
    document.getElementById('btn-create-user').innerText = 'បង្កើតគណនីថ្មី';
    document.getElementById('btn-cancel-edit-user').classList.add('hidden');
}

async function saveAccount() {
    if(currentRole !== 'admin') return alert("មានតែ Admin ទេដែលអាចកំណត់បាន!");
    
    const email = document.getElementById('u-email').value; 
    const pass = document.getElementById('u-pass').value;
    const role = document.getElementById('u-role').value;

    if(editingUserId) {
        try {
            document.getElementById('btn-create-user').innerText = "កំពុងកែប្រែ...";
            document.getElementById('btn-create-user').disabled = true;
            
            await db.collection('users').doc(editingUserId).update({ email: email, role: role });
            
            if(pass) {
                alert("ចំណាំ៖ ប្រព័ន្ធសុវត្ថិភាព Firebase មិនអនុញ្ញាតអោយ Admin ដូរលេខសម្ងាត់អ្នកផ្សេងដោយផ្ទាល់នោះទេ។\nដើម្បីប្តូរលេខសម្ងាត់គណនីនេះ សូមលុបគណនីចាស់នេះចោលសិន ហើយបង្កើតជាគណនីថ្មីវិញ!");
            } else {
                alert("កែប្រែព័ត៌មានគណនីជោគជ័យ!");
            }
            cancelEditUser(); loadUsers();
        } catch(e) { alert("បរាជ័យ: " + e.message); } 
        finally { document.getElementById('btn-create-user').disabled = false; }
        return;
    }

    const snapshot = await db.collection('users').where('ownerId', '==', weddingId).get();
    if(snapshot.size >= 5) return alert("អ្នកអាចបង្កើតគណនីបានអតិបរមាត្រឹម ៥ ប៉ុណ្ណោះ!");
    if(!email || pass.length < 6) return alert("សូមបំពេញអ៊ីមែល និងពាក្យសម្ងាត់ (យ៉ាងតិច ៦ខ្ទង់)!");

    try {
        document.getElementById('btn-create-user').innerText = "កំពុងបង្កើត...";
        document.getElementById('btn-create-user').disabled = true;
        
        const res = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        await db.collection('users').doc(res.user.uid).set({
            email: email, role: role, ownerId: weddingId, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await secondaryApp.auth().signOut();
        document.getElementById('u-email').value = ''; document.getElementById('u-pass').value = '';
        alert("បង្កើតគណនីជោគជ័យ!"); loadUsers();
    } catch(error) { alert("បរាជ័យ: " + error.message); } 
    finally { document.getElementById('btn-create-user').innerText = "បង្កើតគណនីថ្មី"; document.getElementById('btn-create-user').disabled = false; }
}

async function removeUser(uid) {
    if(uid === currentUser.uid) return alert("អ្នកមិនអាចលុបគណនីខ្លួនឯងបានទេ!");
    if(confirm("តើអ្នកពិតជាចង់លុបសិទ្ធិគណនីនេះមែនទេ?")) {
        try { await db.collection('users').doc(uid).delete(); alert("លុបសិទ្ធិគណនីជោគជ័យ!"); loadUsers(); } 
        catch(error) { alert("បរាជ័យក្នុងការលុបសិទ្ធិ៖ " + error.message); }
    }
}