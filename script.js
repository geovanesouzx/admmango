import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDocs, getDoc, query, where, serverTimestamp, onSnapshot, deleteDoc, updateDoc, addDoc, writeBatch, collectionGroup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDLGgSoNwLy_f6FRG3jHmlNJ5AIb9MC7fs",
    authDomain: "mango-anime.firebaseapp.com",
    projectId: "mango-anime",
    storageBucket: "mango-anime.firebasestorage.app",
    messagingSenderId: "269303739791",
    appId: "1:269303739791:web:bee162ff744b83e41187fa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TMDB_API_KEY = '5954890d9e9b723ff3032f2ec429fec3';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_STILL_URL = 'https://image.tmdb.org/t/p/w300';

let tmdbData = null;
let catalogData = []; 
let featuredItemIds = []; 
let carouselsData = [];
let avatarGroupsData = [];
let backgroundGroupsData = [];
let verticalGroupsData = [];
let requestsData = []; 
let achievementsData = []; 

// NOVA VARIÁVEL GLOBAL PARA O TELEGRAM
let telegramConfig = { botToken: '', channels: '', appLink: '', active: false };

function escapeHTML(str) { return str == null ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

window.initializeGlassEffects = function() {
    document.querySelectorAll('.glass-container:not(.glass-init), .glass-button:not(.glass-init)').forEach(el => {
        el.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const specular = this.querySelector('.glass-specular');
            if (specular) specular.style.background = `radial-gradient(circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px, rgba(255,255,255,0.15) 0%, transparent 60%)`;
        });
        el.addEventListener('mouseleave', function() {
            const specular = this.querySelector('.glass-specular');
            if (specular) specular.style.background = 'none';
        });
        el.classList.add('glass-init');
    });
}

function showButtonSpinner(btn) { btn.disabled = true; btn.querySelector('.button-text').style.display = 'none'; btn.querySelector('.button-spinner').style.display = 'block'; }
function hideButtonSpinner(btn, text) { btn.disabled = false; btn.querySelector('.button-text').textContent = text; btn.querySelector('.button-text').style.display = 'block'; btn.querySelector('.button-spinner').style.display = 'none'; }

let toastTimeout;
window.showToast = function(message, isError = false) {
    clearTimeout(toastTimeout);
    const toast = document.getElementById('toast-notification');
    document.getElementById('toast-message').textContent = message;
    toast.querySelector('.glass-overlay').style.setProperty('--bg-color', isError ? 'rgba(220, 38, 38, 0.9)' : 'rgba(245, 158, 11, 0.9)');
    toast.classList.remove('translate-x-[120%]');
    toastTimeout = setTimeout(() => toast.classList.add('translate-x-[120%]'), 4000);
}

window.showConfirm = function(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    modal.classList.remove('hidden');
    const hide = () => modal.classList.add('hidden');
    
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newOkBtn.onclick = () => { onConfirm(); hide(); };
    newCancelBtn.onclick = hide;
}

function createSlug(title) { return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, ''); }

async function fetchTMDB(endpoint, params = '') {
    try {
        const response = await fetch(`${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=pt-BR&${params}`);
        if (!response.ok) throw new Error('Erro TMDB');
        return await response.json();
    } catch (e) { return null; }
}

function mapAgeRating(rating) {
    const r = rating ? rating.toString().toUpperCase().trim() : '';
    if (['L', 'LIVRE', 'AL'].includes(r)) return 'L';
    if (r === '10') return '10';
    if (r === '12') return '12';
    if (r === '14') return '14';
    if (r === '16') return '16';
    if (r === '18') return '18';
    return '14'; // Padrão fallback
}

async function fetchTmdbAgeRating(id, type) {
    try {
        if (type === 'tv') {
            const res = await fetchTMDB(`tv/${id}/content_ratings`);
            if (res && res.results) {
                const br = res.results.find(r => r.iso_3166_1 === 'BR');
                if (br && br.rating) return mapAgeRating(br.rating);
                const us = res.results.find(r => r.iso_3166_1 === 'US');
                if (us && us.rating) {
                    if (us.rating === 'TV-MA') return '18';
                    if (us.rating === 'TV-14') return '14';
                    if (us.rating === 'TV-Y7' || us.rating === 'TV-G') return 'L';
                    if (us.rating === 'TV-PG') return '10';
                }
            }
        } else if (type === 'movie') {
            const res = await fetchTMDB(`movie/${id}/release_dates`);
            if (res && res.results) {
                const br = res.results.find(r => r.iso_3166_1 === 'BR');
                if (br && br.release_dates && br.release_dates.length > 0) {
                    const cert = br.release_dates.find(d => d.certification)?.certification;
                    if (cert) return mapAgeRating(cert);
                }
                const us = res.results.find(r => r.iso_3166_1 === 'US');
                if (us && us.release_dates && us.release_dates.length > 0) {
                    const cert = us.release_dates.find(d => d.certification)?.certification;
                    if (cert === 'R' || cert === 'NC-17') return '18';
                    if (cert === 'PG-13') return '14';
                    if (cert === 'PG') return '10';
                    if (cert === 'G') return 'L';
                }
            }
        }
    } catch(e) { console.error("Erro age rating", e); }
    return '14'; 
}

// ==========================================
// SISTEMA DE NOTIFICAÇÕES (IN-APP, PUSH E TELEGRAM)
// ==========================================

window.sendToTelegram = async function(title, synopsis, imageUrl, isUpdate = false) {
    if (!telegramConfig.active || !telegramConfig.botToken || !telegramConfig.channels) return;

    const channels = telegramConfig.channels.split(',').map(c => c.trim());
    const appLink = telegramConfig.appLink || 'https://linktr.ee/seuapp';
    const header = isUpdate ? "🔄 <b>NOVOS EPISÓDIOS DISPONÍVEIS!</b>" : "🎬 <b>NOVIDADE NO CATÁLOGO!</b>";

    let safeSynopsis = synopsis || "Sem sinopse disponível.";
    if (safeSynopsis.length > 500) safeSynopsis = safeSynopsis.substring(0, 497) + "...";

    const caption = `${header}\n\n🍿 <b>${title}</b>\n\n📖 <i>${safeSynopsis}</i>\n\n📱 <a href="${appLink}">👉 Baixe nosso app aqui e assista!</a>`;

    for (const chatId of channels) {
        if (!chatId) continue;
        try {
            const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendPhoto`;
            const payload = {
                chat_id: chatId,
                photo: imageUrl,
                caption: caption,
                parse_mode: 'HTML'
            };

            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) {
            console.error("Erro ao enviar para Telegram no canal:", chatId, e);
        }
    }
};

window.sendPushNotification = async function(topic, title, body) {
    let webhookUrl = '';
    try {
        const conf = await getDoc(doc(db, 'config', 'fcm'));
        if (conf.exists()) webhookUrl = conf.data().webhookUrl;
    } catch(e){}

    if (!webhookUrl) {
        console.warn("Webhook para Push Notification não configurado. Disparo ignorado.");
        return;
    }
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, title, body })
        });
    } catch(e) {
        console.error("Erro ao contactar Webhook Push:", e);
    }
};

window.sendInAppNotification = async function(uidList, title, message) {
    try {
        const batch = writeBatch(db);
        let count = 0;
        
        const limitedUids = uidList.slice(0, 150); 
        
        for (const uid of limitedUids) {
            const profilesSnap = await getDocs(collection(db, 'users', uid, 'profiles'));
            profilesSnap.forEach(pDoc => {
                const notifRef = doc(collection(db, 'users', uid, 'profiles', pDoc.id, 'notifications'));
                batch.set(notifRef, {
                    title: title,
                    message: message,
                    timestamp: serverTimestamp()
                });
                count++;
            });
        }
        
        if (count > 0) {
            await batch.commit();
        }
    } catch (e) {
        console.error("Erro ao enviar In-App Notification:", e);
    }
};

function initNotificationsLogic() {
    getDoc(doc(db, 'config', 'fcm')).then(docSnap => {
        if (docSnap.exists() && docSnap.data().webhookUrl) {
            document.getElementById('notif-webhook-url').value = docSnap.data().webhookUrl;
        }
    });

    getDoc(doc(db, 'config', 'telegram')).then(docSnap => {
        if (docSnap.exists()) {
            telegramConfig = docSnap.data();
            if(document.getElementById('tg-bot-token')) document.getElementById('tg-bot-token').value = telegramConfig.botToken || '';
            if(document.getElementById('tg-channels')) document.getElementById('tg-channels').value = telegramConfig.channels || '';
            if(document.getElementById('tg-app-link')) document.getElementById('tg-app-link').value = telegramConfig.appLink || '';
            if(document.getElementById('tg-active')) document.getElementById('tg-active').checked = telegramConfig.active || false;
        }
    });

    document.getElementById('webhook-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('save-webhook-btn');
        showButtonSpinner(btn);
        try {
            await setDoc(doc(db, 'config', 'fcm'), { webhookUrl: document.getElementById('notif-webhook-url').value }, { merge: true });
            showToast("URL do Webhook atualizado com sucesso!");
        } catch(err) {
            showToast("Erro ao salvar Webhook.", true);
        }
        hideButtonSpinner(btn, 'Salvar Webhook');
    };

    const tgForm = document.getElementById('telegram-form');
    if(tgForm) {
        tgForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('save-telegram-btn');
            showButtonSpinner(btn);
            try {
                telegramConfig = {
                    botToken: document.getElementById('tg-bot-token').value.trim(),
                    channels: document.getElementById('tg-channels').value.trim(),
                    appLink: document.getElementById('tg-app-link').value.trim(),
                    active: document.getElementById('tg-active').checked
                };
                await setDoc(doc(db, 'config', 'telegram'), telegramConfig, { merge: true });
                showToast("Configurações do Telegram salvas!");
            } catch(err) {
                showToast("Erro ao salvar Telegram.", true);
            }
            hideButtonSpinner(btn, 'Salvar Telegram');
        };
    }

    document.getElementById('global-notif-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('send-global-notif-btn');
        const title = document.getElementById('notif-title').value.trim();
        const body = document.getElementById('notif-body').value.trim();
        
        showConfirm('Aviso Global', `Deseja enviar a notificação "${title}" para todos os aparelhos?`, async () => {
            showButtonSpinner(btn);
            await window.sendPushNotification("all", title, body);
            showToast("Notificação Global Disparada!");
            document.getElementById('global-notif-form').reset();
            hideButtonSpinner(btn, 'Disparar Notificação');
        });
    };
}

// ==========================================
// SISTEMA DE VERIFICAÇÃO (SELO AZUL)
// ==========================================
function initVerifyLogic() {
    window.searchUserForVerification = async function() {
        const input = document.getElementById('verify-username-search').value.trim().toLowerCase().replace('@', '').replace(/\s+/g, '');
        if(!input) return showToast("Digite um nome de usuário.", true);
        
        const btn = document.getElementById('verify-search-btn');
        showButtonSpinner(btn);
        const resDiv = document.getElementById('verify-search-result');
        resDiv.innerHTML = '<div class="spinner mx-auto block mt-4"></div>';

        try {
            const usernameDoc = await getDoc(doc(db, 'usernames', input));
            if(!usernameDoc.exists()) {
                resDiv.innerHTML = '<p class="text-red-400 text-center py-4">Usuário não encontrado. O username está correto?</p>';
                return;
            }

            const { uid, profileId } = usernameDoc.data();
            const profileDoc = await getDoc(doc(db, 'users', uid, 'profiles', profileId));
            
            if(!profileDoc.exists()) {
                resDiv.innerHTML = '<p class="text-red-400 text-center py-4">Perfil não encontrado no banco de dados.</p>';
                return;
            }

            const profile = profileDoc.data();
            const isVerified = profile.isVerified || false;

            resDiv.innerHTML = `
                <div class="flex items-center gap-4 p-4 bg-black/40 rounded-xl border ${isVerified ? 'border-blue-500/50 shadow-[0_0_15px_rgba(56,151,240,0.3)]' : 'border-slate-700/50'}">
                    <img src="${profile.avatarUrl || 'https://ui-avatars.com/api/?name=U'}" class="w-16 h-16 rounded-full object-cover border-2 ${isVerified ? 'border-[#3897f0]' : 'border-slate-600'}">
                    <div class="flex-1 min-w-0">
                        <h4 class="text-lg font-bold text-white flex items-center gap-2 truncate">
                            ${escapeHTML(profile.name)}
                            ${isVerified ? '<svg class="w-5 h-5 text-[#3897f0] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : ''}
                        </h4>
                        <p class="text-sm text-slate-400 truncate">@${escapeHTML(input)}</p>
                    </div>
                    <div class="flex-shrink-0">
                        <button onclick="toggleVerification('${uid}', '${profileId}', ${!isVerified})" class="glass-button rounded-lg py-2 px-4 text-sm font-bold" style="--bg-color: ${isVerified ? 'rgba(239, 68, 68, 0.6)' : 'rgba(56, 151, 240, 0.8)'};">
                            <div class="glass-content text-white">${isVerified ? 'Remover Selo' : 'Dar Selo de Verificado'}</div>
                        </button>
                    </div>
                </div>
            `;
        } catch(e) {
            console.error(e);
            resDiv.innerHTML = '<p class="text-red-400 text-center py-4">Erro ao buscar.</p>';
        } finally {
            hideButtonSpinner(btn, 'Buscar Usuário');
        }
    };

    window.toggleVerification = async function(uid, profileId, newState) {
        showConfirm(
            newState ? 'Verificar Usuário' : 'Remover Verificação', 
            newState ? 'Deseja conceder o selo azul para este usuário? Isto vai atualizar todos os comentários dele.' : 'Deseja remover o selo azul deste usuário?', 
            async () => {
                try {
                    await updateDoc(doc(db, 'users', uid, 'profiles', profileId), {
                        isVerified: newState
                    });

                    const commentsQuery = query(collection(db, 'comments'), where('profileId', '==', profileId));
                    const commentsSnap = await getDocs(commentsQuery);
                    
                    if (!commentsSnap.empty) {
                        const batch = writeBatch(db);
                        commentsSnap.forEach(cDoc => {
                            batch.update(cDoc.ref, { isAuthorVerified: newState });
                        });
                        await batch.commit();
                    }

                    showToast(newState ? 'Usuário verificado com sucesso!' : 'Selo removido com sucesso!');
                    document.getElementById('verify-search-btn').click();
                    loadVerifiedUsers();
                } catch(e) {
                    console.error(e);
                    showToast('Erro: ' + e.message, true);
                }
            }
        );
    };

    window.loadVerifiedUsers = async function() {
        const listDiv = document.getElementById('verified-users-list');
        listDiv.innerHTML = '<div class="spinner mx-auto block mt-4"></div>';
        
        try {
            const q = query(collectionGroup(db, 'profiles'), where('isVerified', '==', true));
            const snap = await getDocs(q);
            
            listDiv.innerHTML = '';
            
            if (snap.empty) {
                listDiv.innerHTML = '<p class="text-slate-400 text-sm py-4 text-center">Nenhum usuário verificado encontrado.</p>';
                return;
            }
            
            snap.forEach(docSnap => {
                const p = docSnap.data();
                const uid = docSnap.ref.parent.parent.id;
                const profileId = docSnap.id;
                
                const div = document.createElement('div');
                div.className = "flex items-center justify-between p-3 bg-black/40 rounded-xl border border-slate-700/50 hover:bg-slate-800/50 transition";
                div.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden">
                        <img src="${p.avatarUrl || 'https://ui-avatars.com/api/?name=U'}" class="w-10 h-10 rounded-full object-cover border border-[#3897f0]">
                        <div class="min-w-0">
                            <h4 class="text-sm font-bold text-white flex items-center gap-1 truncate">
                                ${escapeHTML(p.name)}
                                <svg class="w-4 h-4 text-[#3897f0] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                            </h4>
                            <p class="text-xs text-slate-400 truncate">@${escapeHTML(p.username)}</p>
                        </div>
                    </div>
                    <button onclick="toggleVerification('${uid}', '${profileId}', false)" class="text-red-400 hover:text-red-300 p-2 flex-shrink-0" title="Remover Selo">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"/></svg>
                    </button>
                `;
                listDiv.appendChild(div);
            });
        } catch(e) {
            console.error(e);
            if (e.message.includes('index')) {
                const linkMatch = e.message.match(/https:\/\/[^\s]+/);
                const linkHtml = linkMatch ? `<a href="${linkMatch[0]}" target="_blank" class="text-blue-400 underline">AQUI</a>` : 'no console do Firebase';
                listDiv.innerHTML = `<p class="text-amber-400 text-sm py-2">Falta criar um Índice no Firestore para exibir esta lista! Clique ${linkHtml} para criar (Demora cerca de 1 min).</p>`;
            } else {
                listDiv.innerHTML = '<p class="text-red-400 text-sm py-2">Erro ao carregar lista. Verifique a consola.</p>';
            }
        }
    };
}

// ==========================================
// SISTEMA DE PEDIDOS
// ==========================================
function initRequestsLogic() {
    onSnapshot(collection(db, 'requests'), (snapshot) => {
        requestsData = [];
        snapshot.forEach(doc => requestsData.push({ id: doc.id, ...doc.data() }));
        renderRequests();
        
        const pendingCount = requestsData.filter(r => r.status === 'PENDING').length;
        const badge = document.getElementById('pending-requests-badge');
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

function renderRequests() {
    const list = document.getElementById('requests-list');
    list.innerHTML = '';
    if (requestsData.length === 0) {
        list.innerHTML = '<p class="text-slate-400 text-center py-8">Nenhum pedido encontrado.</p>';
        return;
    }

    const sorted = [...requestsData].sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return (b.votes || 0) - (a.votes || 0);
    });

    sorted.forEach(req => {
        let reqTypeText = "Obra Completa";
        if (req.requestType === "SEASON") reqTypeText = `Temporada ${req.seasonNumber}`;
        if (req.requestType === "EPISODE") reqTypeText = `Temporada ${req.seasonNumber} - Ep ${req.episodeNumber}`;

        let statusColor = "text-amber-500 bg-amber-500/20";
        let statusText = "Pendente";
        if (req.status === "ACCEPTED") { statusColor = "text-blue-500 bg-blue-500/20"; statusText = "Aceito (Em Breve)"; }
        if (req.status === "REJECTED") { statusColor = "text-red-500 bg-red-500/20"; statusText = "Recusado"; }
        if (req.status === "ADDED") { statusColor = "text-emerald-500 bg-emerald-500/20"; statusText = "Adicionado"; }

        const div = document.createElement('div');
        div.className = "flex flex-col md:flex-row gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 transition hover:bg-slate-800/50";
        div.innerHTML = `
            <img src="${escapeHTML(req.posterPath)}" class="w-16 h-24 object-cover rounded-lg shadow-md bg-slate-900">
            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <h4 class="font-bold text-white text-lg truncate">${escapeHTML(req.title)}</h4>
                <p class="text-sm text-slate-300 mb-1">Pedido: <span class="font-bold text-white">${reqTypeText}</span></p>
                <div class="flex items-center gap-3 mt-1">
                    <span class="text-xs font-bold px-2 py-1 rounded-md ${statusColor}">${statusText}</span>
                    <span class="text-xs text-slate-400 font-bold flex items-center gap-1">⬆️ ${req.votes || 0} Votos</span>
                </div>
            </div>
            <div class="flex flex-wrap gap-2 items-center justify-end md:w-auto w-full border-t md:border-t-0 border-slate-700/50 pt-3 md:pt-0">
                <button onclick="goToAddFromRequest(${req.tmdbId}, '${req.mediaType}')" class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(147,51,234,0.6);" title="Buscar Obra"><div class="glass-content">🔍 Buscar Obra</div></button>
                ${req.status !== 'ACCEPTED' && req.status !== 'ADDED' ? `<button onclick="updateRequestStatus('${req.id}', 'ACCEPTED')" class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(59,130,246,0.6);"><div class="glass-content">Aceitar</div></button>` : ''}
                ${req.status !== 'REJECTED' && req.status !== 'ADDED' ? `<button onclick="updateRequestStatus('${req.id}', 'REJECTED')" class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(239,68,68,0.6);"><div class="glass-content">Recusar</div></button>` : ''}
                ${req.status !== 'ADDED' ? `<button onclick="updateRequestStatus('${req.id}', 'ADDED')" class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(16,185,129,0.6);"><div class="glass-content">Marcar Adicionado</div></button>` : ''}
                <button onclick="deleteRequest('${req.id}')" class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(100,116,139,0.6);" title="Excluir Pedido"><div class="glass-content">🗑️</div></button>
            </div>
        `;
        list.appendChild(div);
    });
    window.initializeGlassEffects();
}

window.updateRequestStatus = async function(id, status) {
    try {
        await updateDoc(doc(db, 'requests', id), { status: status });
        showToast("Status do pedido atualizado!");

        if (status === 'ADDED') {
            const req = requestsData.find(r => r.id === id);
            if (req && req.voters && req.voters.length > 0) {
                showConfirm(
                    'Notificar Usuários', 
                    `Deseja avisar os ${req.voters.length} usuários que pediram/votaram que já está disponível?`, 
                    async () => {
                        showToast("Enviando notificações...");
                        await window.sendInAppNotification(req.voters, "Seu pedido chegou! 🎉", `O seu pedido '${req.title}' já foi adicionado ao catálogo. Vá conferir!`);
                        await window.sendPushNotification(`request_${req.tmdbId}`, "Seu pedido chegou! 🎉", `'${req.title}' já está disponível no catálogo!`);
                        showToast("Notificações enviadas com sucesso!");
                    }
                );
            }
        }
    } catch (e) {
        showToast("Erro ao atualizar status.", true);
    }
};

window.deleteRequest = function(id) {
    showConfirm('Excluir Pedido', 'Tem certeza que deseja apagar este pedido permanentemente?', async () => {
        try {
            await deleteDoc(doc(db, 'requests', id));
            showToast('Pedido excluído com sucesso!');
        } catch (e) {
            showToast('Erro ao excluir pedido.', true);
        }
    });
};

window.goToAddFromRequest = function(tmdbId, mediaType) {
    window.location.hash = 'addContent';
    window.selectItem(tmdbId, mediaType);
};

// ==========================================
// SISTEMA DE IMAGENS DO TMDB
// ==========================================
window.openTmdbImages = async function(mode) {
    const tmdbId = mode === 'add' ? document.getElementById('tmdb-id').value : document.getElementById('edit-tmdb-id').value;
    const type = mode === 'add' ? document.getElementById('media-type').value : document.getElementById('edit-media-type').value;
    
    if (!tmdbId || !type) return showToast('Selecione um anime primeiro!', true);

    const modal = document.getElementById('tmdb-images-modal');
    const loading = document.getElementById('images-loading');
    const postersGrid = document.getElementById('tmdb-posters-grid');
    const backdropsGrid = document.getElementById('tmdb-backdrops-grid');
    const logosGrid = document.getElementById('tmdb-logos-grid');

    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    postersGrid.innerHTML = '';
    backdropsGrid.innerHTML = '';
    if(logosGrid) logosGrid.innerHTML = '';

    const data = await fetchTMDB(`${type}/${tmdbId}/images`, 'include_image_language=pt-BR,pt,en,null');
    loading.classList.add('hidden');

    if (data) {
        (data.posters || []).slice(0, 24).forEach(img => {
            const url = `https://image.tmdb.org/t/p/w500${img.file_path}`;
            const div = document.createElement('div');
            div.innerHTML = `<img src="${url}" class="w-full aspect-[2/3] object-cover rounded-lg image-selector-img">`;
            div.onclick = () => {
                document.getElementById(mode === 'add' ? 'custom-poster' : 'edit-custom-poster').value = url;
                modal.classList.add('hidden');
                showToast('Capa atualizada com sucesso!');
            };
            postersGrid.appendChild(div);
        });

        (data.backdrops || []).slice(0, 12).forEach(img => {
            const url = `https://image.tmdb.org/t/p/original${img.file_path}`;
            const div = document.createElement('div');
            div.innerHTML = `<img src="${url}" class="w-full aspect-video object-cover rounded-lg image-selector-img">`;
            div.onclick = () => {
                document.getElementById(mode === 'add' ? 'custom-backdrop' : 'edit-custom-backdrop').value = url;
                modal.classList.add('hidden');
                showToast('Imagem de Fundo atualizada com sucesso!');
            };
            backdropsGrid.appendChild(div);
        });

        if(logosGrid) {
            (data.logos || []).slice(0, 15).forEach(img => {
                const url = `https://image.tmdb.org/t/p/original${img.file_path}`;
                const div = document.createElement('div');
                div.innerHTML = `<img src="${url}" class="w-full object-contain rounded-lg image-selector-img bg-slate-800 p-2" style="max-height: 80px;">`;
                div.onclick = () => {
                    document.getElementById(mode === 'add' ? 'custom-logo' : 'edit-custom-logo').value = url;
                    modal.classList.add('hidden');
                    showToast('Logo atualizado com sucesso!');
                };
                logosGrid.appendChild(div);
            });
        }
    } else {
        postersGrid.innerHTML = '<p class="text-white">Nenhuma imagem encontrada.</p>';
    }
}

// ==========================================
// SISTEMA UNIFICADO DE TEMPORADAS E EPISÓDIOS
// ==========================================
function createEpisodeRow(episodeNumber, episodeName = '', episodeOverview = '', stillPath = '', isManual = false, existingUrl = '', existingAltUrl = '', isComingSoon = false, tmdbSeason = '', tmdbEp = '') {
    let displayUrl = 'https://placehold.co/120x67/1c1917/999999?text=EP';
    if (stillPath && stillPath !== 'https://placehold.co/120x67/1c1917/999999?text=EP') {
        if (stillPath.startsWith('/')) displayUrl = `${TMDB_STILL_URL}${stillPath}`;
        else displayUrl = stillPath;
    }
    const row = document.createElement('div');
    row.className = 'episode-row space-y-2 p-3 bg-black/40 rounded-xl border border-slate-700/50 transition-colors';
    if (existingUrl || existingAltUrl || isComingSoon) row.classList.add('filled');
    
    if (tmdbSeason) row.dataset.tmdbSeason = tmdbSeason;
    if (tmdbEp) row.dataset.tmdbEp = tmdbEp;
    
    row.innerHTML = `
    <div class="flex items-start gap-4">
        <input type="checkbox" class="episode-select mt-1 flex-shrink-0 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500">
        <img src="${escapeHTML(displayUrl)}" class="w-24 h-16 object-cover rounded-md flex-shrink-0 hidden md:block">
        <div class="flex-grow min-w-0">
            <div class="flex items-center gap-2 mb-1 w-full">
                <span class="text-sm font-bold text-slate-400">Ep</span>
                <input type="number" class="episode-number w-16 p-1 glass-input rounded-md text-sm font-bold text-center text-amber-400" value="${episodeNumber}">
                <span class="font-bold text-white">:</span>
                <input type="text" class="episode-title flex-1 bg-transparent border-b border-transparent hover:border-slate-500 focus:border-amber-500 focus:outline-none text-white text-sm font-bold min-w-0" value="${escapeHTML(episodeName)}" required placeholder="Título do Episódio">
            </div>
        </div>
        <button type="button" class="remove-episode-btn flex-shrink-0 bg-red-600/50 hover:bg-red-600/80 p-2 rounded-md leading-none transition"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
    </div>
    <div class="pt-2 border-t border-slate-700/50 space-y-2">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label class="block text-xs font-medium text-slate-400 mb-1">URL (Padrão/Dub)</label><input type="url" class="episode-url w-full p-2 glass-input rounded-md text-sm ${(!existingUrl && !existingAltUrl && !isComingSoon) ? 'missing-link' : ''}" value="${escapeHTML(existingUrl)}"></div>
            <div><label class="block text-xs font-medium text-indigo-400 mb-1">URL (Alternativo/Leg)</label><input type="url" class="episode-alt-url w-full p-2 glass-input border-indigo-500/50 rounded-md text-sm" placeholder="Opcional..." value="${escapeHTML(existingAltUrl)}"></div>
            <div><label class="block text-xs font-medium text-emerald-400 mb-1">URL da Capa (Manual)</label><input type="url" class="episode-still-path w-full p-2 glass-input border-emerald-500/50 rounded-md text-sm" placeholder="URL da imagem..." value="${displayUrl.includes('placehold') ? '' : escapeHTML(displayUrl)}"></div>
        </div>
        <div class="flex items-center gap-2 mt-2"><input type="checkbox" class="episode-coming-soon w-4 h-4 rounded text-pink-500" ${isComingSoon ? 'checked' : ''}><label class="text-xs text-pink-400 font-bold select-none cursor-pointer">Em Breve</label></div>
        <input type="hidden" class="episode-overview" value="${escapeHTML(episodeOverview || '')}">
    </div>`;
    
    row.querySelector('.remove-episode-btn').onclick = () => showConfirm('Remover Episódio', 'Tem certeza?', () => row.remove());
    
    const urlInp = row.querySelector('.episode-url');
    const altUrlInp = row.querySelector('.episode-alt-url');
    const chk = row.querySelector('.episode-coming-soon');
    const stillInp = row.querySelector('.episode-still-path');
    const imgEl = row.querySelector('img');

    // Ao digitar uma URL de capa, atualiza a imagem em tempo real
    stillInp.oninput = () => {
        imgEl.src = stillInp.value || 'https://placehold.co/120x67/1c1917/999999?text=EP';
    };

    const upd = () => { 
        if(!!urlInp.value.trim() || !!altUrlInp.value.trim() || chk.checked) { 
            row.classList.add('filled'); 
            urlInp.classList.remove('missing-link'); 
        } else { 
            row.classList.remove('filled'); 
            urlInp.classList.add('missing-link'); 
        } 
    };
    urlInp.oninput = upd; altUrlInp.oninput = upd; chk.onchange = upd;
    return row;
}

window.syncTmdbEpisodes = async function(listId, tmdbIdInputId) {
    const tmdbId = document.getElementById(tmdbIdInputId).value;
    if (!tmdbId) return showToast("TMDB ID não encontrado. Busque um anime primeiro.", true);

    const list = document.getElementById(listId);
    showToast("Sincronizando com TMDB... aguarde.", false);
    
    try {
        const showData = await fetchTMDB(`tv/${tmdbId}`);
        if (!showData || !showData.seasons) throw new Error("Erro ao buscar série.");

        const groups = Array.from(list.querySelectorAll('.season-group'));
        const existingRowsMap = new Map();
        
        groups.forEach(g => {
            g.querySelectorAll('.episode-row').forEach(row => {
                if (row.dataset.tmdbSeason && row.dataset.tmdbEp) {
                    existingRowsMap.set(`${row.dataset.tmdbSeason}-${row.dataset.tmdbEp}`, row);
                }
            });
        });

        let addedCount = 0;
        let updatedCount = 0;
        let addedSeasonsCount = 0;
        let nextVisualSeasonNum = groups.length > 0 ? Math.max(...groups.map(g => parseInt(g.dataset.season))) + 1 : 1;
        const today = new Date();

        for (let tmdbSeason of showData.seasons) {
            const seasonNum = tmdbSeason.season_number;
            if (seasonNum <= 0) continue; 

            const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${seasonNum}`);
            if (!seasonData || !seasonData.episodes) continue;

            let targetGroup = groups.slice().reverse().find(g => (g.dataset.tmdbSeason || g.dataset.season) == seasonNum);
            
            if (!targetGroup) {
                const validEps = seasonData.episodes.filter(ep => {
                    const airDate = ep.air_date ? new Date(ep.air_date) : null;
                    const hasAired = airDate && airDate <= today;
                    const isGenericName = ep.name && (ep.name.toLowerCase().startsWith('episode') || ep.name.toLowerCase().startsWith('episódio') || ep.name.toLowerCase().startsWith('ep '));
                    const hasInfo = ep.still_path || (ep.overview && ep.overview.trim() !== '') || !isGenericName;
                    return hasAired || hasInfo;
                });

                if (validEps.length === 0) continue;

                targetGroup = createSeasonGroupElement(nextVisualSeasonNum, seasonData.name || `Temporada ${seasonNum}`, listId, tmdbId, seasonNum);
                list.appendChild(targetGroup);
                groups.push(targetGroup);
                nextVisualSeasonNum++;
                addedSeasonsCount++;
            }

            const epsC = targetGroup.querySelector('.episodes-list');

            seasonData.episodes.forEach(tmdbEp => {
                const epNum = tmdbEp.episode_number;
                const uniqueId = `${seasonNum}-${epNum}`;

                const airDate = tmdbEp.air_date ? new Date(tmdbEp.air_date) : null;
                const hasAired = airDate && airDate <= today;
                const isGenericName = tmdbEp.name && (tmdbEp.name.toLowerCase().startsWith('episode') || tmdbEp.name.toLowerCase().startsWith('episódio') || tmdbEp.name.toLowerCase().startsWith('ep '));
                const hasInfo = tmdbEp.still_path || (tmdbEp.overview && tmdbEp.overview.trim() !== '') || !isGenericName;

                if (existingRowsMap.has(uniqueId)) {
                    const row = existingRowsMap.get(uniqueId);
                    const titleInput = row.querySelector('.episode-title');
                    const overviewInput = row.querySelector('.episode-overview');
                    const stillInput = row.querySelector('.episode-still-path');
                    const imgEl = row.querySelector('img');

                    let updated = false;

                    if (tmdbEp.name && !isGenericName) {
                        // Sempre atualiza o nome se o TMDB tiver um nome válido e não genérico
                        if (titleInput.value !== tmdbEp.name) {
                            titleInput.value = tmdbEp.name;
                            updated = true;
                        }
                    }

                    if (tmdbEp.overview && !overviewInput.value.trim()) {
                        overviewInput.value = tmdbEp.overview;
                        updated = true;
                    }

                    if (tmdbEp.still_path) {
                        const url = `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}`;
                        // Atualiza a imagem se estiver vazia, for placeholder ou for link antigo do tmdb
                        if (!stillInput.value || stillInput.value.includes('placehold') || stillInput.value.includes('tmdb.org')) {
                            if (stillInput.value !== url) {
                                stillInput.value = url;
                                imgEl.src = url;
                                updated = true;
                            }
                        }
                    }

                    if(updated) updatedCount++;

                } else {
                    if (hasAired || hasInfo) {
                        let nextDisplayNum = epNum;
                        const inputs = Array.from(epsC.querySelectorAll('.episode-number'));
                        if (inputs.length > 0) nextDisplayNum = parseInt(inputs[inputs.length - 1].value) + 1;
                        
                        const newRow = createEpisodeRow(nextDisplayNum, tmdbEp.name, tmdbEp.overview, tmdbEp.still_path, false, '', '', false, seasonNum, epNum);
                        epsC.appendChild(newRow);
                        existingRowsMap.set(uniqueId, newRow);
                        addedCount++;
                    }
                }
            });
        }

        const wrapperId = listId === 'edit-seasons-list' ? 'edit-add-season-wrapper' : 'seasons-selector-area';
        const containerId = listId === 'edit-seasons-list' ? 'edit-season-pills' : 'season-pills-container';
        if(document.getElementById(wrapperId)) {
            document.getElementById(wrapperId).classList.add('hidden');
            document.getElementById(wrapperId).classList.remove('flex');
            document.getElementById(containerId).innerHTML = '';
        }

        window.initializeGlassEffects();
        if (addedCount > 0 || addedSeasonsCount > 0 || updatedCount > 0) {
            showToast(`Varredura TMDB: ${addedSeasonsCount} abas criadas, ${addedCount} episódios adicionados, ${updatedCount} atualizados/preenchidos!`);
        } else {
            showToast("Tudo certo! O catálogo local já está igualzinho ao TMDB.");
        }
    } catch (e) {
        console.error(e);
        showToast("Erro ao sincronizar com TMDB.", true);
    }
};

function createSeasonGroupElement(seasonNumber, seasonName, targetListId, tmdbId = null, tmdbSeason = null) {
    const grp = document.createElement('div');
    grp.className = 'season-group bg-slate-900/40 p-4 rounded-2xl border border-slate-700/50 hide-filled mb-6';
    grp.dataset.season = seasonNumber; 
    grp.dataset.tmdbSeason = tmdbSeason || seasonNumber; 
    if (tmdbId) grp.dataset.tmdbId = tmdbId; 

    grp.innerHTML = `
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 border-b border-slate-700/50 pb-4"> 
        <input type="text" class="season-title-input text-lg font-bold text-amber-500 bg-transparent border-b-2 border-transparent hover:border-amber-500/50 focus:border-amber-500 focus:outline-none px-1 w-full md:flex-1" value="${escapeHTML(seasonName)}" placeholder="Nome da Temporada">
        <div class="flex items-center gap-2 flex-wrap justify-end">
            <button type="button" class="split-ai-btn glass-button rounded-lg h-9 px-3 text-xs" style="--bg-color: rgba(236,72,153,0.6);"><div class="glass-content text-white font-bold">✨ IA Dividir</div></button>
            <button type="button" class="fix-numbering-btn glass-button rounded-lg h-9 px-3 text-xs"><div class="glass-content font-bold">🛠️ Numeração</div></button>
            <button type="button" class="split-season-btn glass-button rounded-lg h-9 px-3 text-xs" style="--bg-color: rgba(249,115,22,0.6);"><div class="glass-content text-white font-bold">✂️ Dividir</div></button>
            <button type="button" class="toggle-filled-btn glass-button rounded-lg h-9 px-3 text-xs"><div class="glass-content">Mostrar Preenchidos</div></button>
            <button type="button" class="delete-season-btn glass-button rounded-lg h-9 w-9 text-xs" style="--bg-color: rgba(220,38,38,0.6);"><div class="glass-content"><svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></div></button>
        </div>
    </div>
    <div class="episodes-list space-y-3"></div>
    <button type="button" class="add-manual-episode-btn mt-4 w-full glass-button rounded-xl py-3 px-4" style="--bg-color: rgba(37,99,235,0.6);"><div class="glass-content">Adicionar Próximo Episódio</div></button>`;

    grp.querySelector('.split-ai-btn').onclick = async (e) => {
        const btn = e.currentTarget;
        let key = localStorage.getItem('mango_gemini_key');
        if(!key) {
            key = prompt("Para usar a divisão automática por IA, cole sua API Key do Google AI Studio (Gemini):");
            if(!key) return;
            localStorage.setItem('mango_gemini_key', key);
        }

        const epsRows = Array.from(grp.querySelectorAll('.episode-row'));
        if(epsRows.length < 2) return showToast("Esta aba tem muito poucos episódios para dividir.", true);

        const epsData = epsRows.map((r, index) => ({
            idx: index,
            title: r.querySelector('.episode-title').value
        }));

        const originalText = btn.innerHTML;
        btn.innerHTML = `<div class="glass-content"><div class="spinner w-4 h-4 border-2"></div> <span class="ml-1">Analisando...</span></div>`;
        btn.disabled = true;

        const sysPrompt = `
        Atue como especialista em Anime e Séries. O TMDB agrupou os seguintes episódios em uma única temporada, mas eles frequentemente pertencem a temporadas diferentes (ex: Jujutsu Kaisen, Dan Da Dan, Bleach).
        Sua tarefa é analisar os títulos e dividi-los lógicamente nas temporadas oficiais de exibição, ou arcos/cours conhecidos do anime.
        Lista de episódios: ${JSON.stringify(epsData)}
        
        Regras obrigatórias:
        1. Responda APENAS ESTRITAMENTE com um array JSON. Sem formatação markdown, sem texto extra, nada mais.
        2. Estrutura exigida: [{"season_number": 1, "season_name": "1ª Temporada", "episodes_idx": [0, 1, 2...]}, {"season_number": 2, "season_name": "2ª Temporada", "episodes_idx": [24, 25...]}]
        3. O array 'episodes_idx' DEVE conter os números 'idx' exatos fornecidos na lista original.
        4. Coloque TODOS os 'idx' da lista original na resposta, não pule nenhum.
        `;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: sysPrompt }] }] })
            });
            if(!res.ok) throw new Error("Erro de comunicação com Gemini API");
            const data = await res.json();
            
            let aiText = data.candidates[0].content.parts[0].text;
            aiText = aiText.substring(aiText.indexOf('['), aiText.lastIndexOf(']') + 1);
            const splitData = JSON.parse(aiText);

            if(splitData && splitData.length > 0) {
                const tmdbSeasonOrigin = grp.dataset.tmdbSeason;
                const tmdbIdOrigin = grp.dataset.tmdbId;

                splitData.reverse().forEach(seasonInfo => {
                    const targetGroup = createSeasonGroupElement(Date.now(), seasonInfo.season_name, targetListId, tmdbIdOrigin, tmdbSeasonOrigin);
                    grp.parentNode.insertBefore(targetGroup, grp.nextSibling);
                    
                    const targetList = targetGroup.querySelector('.episodes-list');
                    seasonInfo.episodes_idx.forEach(idx => {
                        if(epsRows[idx]) targetList.appendChild(epsRows[idx]);
                    });
                });

                grp.remove();
                window.initializeGlassEffects();
                showToast("Série dividida em temporadas com sucesso pela IA!");
            }
        } catch(err) {
            console.error(err);
            showToast("Falha na IA. Verifique sua API Key ou se o limite foi atingido.", true);
        } finally {
            if(document.body.contains(btn)) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };

    grp.querySelector('.fix-numbering-btn').onclick = () => {
        const rows = grp.querySelectorAll('.episode-row');
        if(!rows.length) return;
        const startVal = prompt("Esta temporada começa em qual episódio absoluto?", rows[0].querySelector('.episode-number').value);
        if(startVal && !isNaN(parseInt(startVal))) {
            let num = parseInt(startVal);
            rows.forEach(r => r.querySelector('.episode-number').value = num++);
        }
    };
    
    grp.querySelector('.split-season-btn').onclick = () => {
        const selected = Array.from(grp.querySelectorAll('.episode-select:checked')).map(cb => cb.closest('.episode-row'));
        if (!selected.length) return showToast('Selecione os episódios para dividir.', true);
        const newSeasonName = prompt(`Mover ${selected.length} episódio(s) para qual NOVA temporada? (Nome)`);
        if (!newSeasonName) return;
        
        const targetGroup = createSeasonGroupElement(Date.now(), newSeasonName, targetListId, grp.dataset.tmdbId, grp.dataset.tmdbSeason);
        grp.parentNode.insertBefore(targetGroup, grp.nextSibling);
        window.initializeGlassEffects();

        const targetList = targetGroup.querySelector('.episodes-list');
        selected.forEach(row => {
            row.querySelector('.episode-select').checked = false;
            targetList.appendChild(row);
        });
        showToast('Movidos com sucesso!');
    };

    grp.querySelector('.toggle-filled-btn').onclick = (e) => {
        grp.classList.toggle('hide-filled');
        e.currentTarget.querySelector('.glass-content').textContent = grp.classList.contains('hide-filled') ? 'Mostrar Preenchidos' : 'Ocultar Preenchidos';
    };
    
    grp.querySelector('.delete-season-btn').onclick = () => showConfirm('Excluir Temporada', `Remover TODA a temporada?`, () => grp.remove());
    
    grp.querySelector('.add-manual-episode-btn').onclick = async (e) => {
        const btn = e.currentTarget;
        const eps = grp.querySelector('.episodes-list');
        const rows = Array.from(eps.querySelectorAll('.episode-row'));
        
        let nextNum = rows.length ? parseInt(rows[rows.length-1].querySelector('.episode-number').value) + 1 : 1;
        let nextTmdbEp = rows.length && rows[rows.length-1].dataset.tmdbEp ? parseInt(rows[rows.length-1].dataset.tmdbEp) + 1 : 1;

        const originalText = btn.innerHTML;
        btn.innerHTML = `<div class="glass-content"><div class="spinner w-4 h-4 border-2"></div> Buscando TMDB...</div>`;
        btn.disabled = true;

        try {
            let epName = `Episódio ${nextNum}`;
            let epOverview = '';
            let epStill = '';

            const currentTmdbId = grp.dataset.tmdbId;
            const currentTmdbSeason = grp.dataset.tmdbSeason || seasonNumber; 

            if (currentTmdbId && currentTmdbId !== "null" && currentTmdbId !== "undefined") {
                const epData = await fetchTMDB(`tv/${currentTmdbId}/season/${currentTmdbSeason}/episode/${nextTmdbEp}`);
                if (epData && !epData.status_code) { 
                    if (epData.name) epName = epData.name;
                    if (epData.overview) epOverview = epData.overview;
                    if (epData.still_path) epStill = epData.still_path;
                }
            }

            eps.appendChild(createEpisodeRow(nextNum, epName, epOverview, epStill, true, '', '', false, currentTmdbSeason, nextTmdbEp));
            window.initializeGlassEffects();
        } catch (err) {
            console.error(err);
            eps.appendChild(createEpisodeRow(nextNum, `Episódio ${nextNum}`, '', '', true, '', '', false, grp.dataset.tmdbSeason || seasonNumber, nextTmdbEp));
            window.initializeGlassEffects();
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    return grp;
}

window.handleAddSeasonClick = async function(seasonNum, btnElement, isEdit, tmdbId) {
    showButtonSpinner(btnElement);
    const listId = isEdit ? 'edit-seasons-list' : 'seasons-list';
    const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${seasonNum}`);
    if (!seasonData || !seasonData.episodes) return showToast("Erro carregar temporada.", true);
    
    btnElement.remove();
    
    const containerId = isEdit ? 'edit-season-pills' : 'season-pills-container';
    const wrapperId = isEdit ? 'edit-add-season-wrapper' : 'seasons-selector-area';
    if (document.getElementById(containerId).children.length === 0) {
        document.getElementById(wrapperId).classList.add('hidden');
        document.getElementById(wrapperId).classList.remove('flex');
    }

    let startNum = 1;
    const absoluteInput = prompt(`A ${seasonData.name} tem ${seasonData.episodes.length} episódios.\nEm qual episódio absoluto começa?`, "1");
    if(absoluteInput) startNum = parseInt(absoluteInput) || 1;

    const group = createSeasonGroupElement(seasonNum, seasonData.name || `Temporada ${seasonNum}`, listId, tmdbId, seasonNum);
    const epsContainer = group.querySelector('.episodes-list');
    
    const today = new Date();
    const validEps = seasonData.episodes.filter(ep => {
        const airDate = ep.air_date ? new Date(ep.air_date) : null;
        const hasAired = airDate && airDate <= today;
        const isGenericName = ep.name && (ep.name.toLowerCase().startsWith('episode') || ep.name.toLowerCase().startsWith('episódio') || ep.name.toLowerCase().startsWith('ep '));
        const hasInfo = ep.still_path || (ep.overview && ep.overview.trim() !== '') || !isGenericName;
        return hasAired || hasInfo;
    });

    validEps.forEach((ep, i) => epsContainer.appendChild(createEpisodeRow(startNum + i, ep.name, ep.overview, ep.still_path, false, '', '', false, seasonNum, ep.episode_number)));
    document.getElementById(listId).appendChild(group);
    
    if (isEdit) {
        document.getElementById('global-renumber-toolbar').classList.remove('hidden'); 
        document.getElementById('global-renumber-toolbar').classList.add('flex');
    } else {
        document.getElementById('add-global-toolbar').classList.remove('hidden'); 
        document.getElementById('add-global-toolbar').classList.add('flex');
    }

    window.initializeGlassEffects();
    group.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==========================================
// CATÁLOGO
// ==========================================
function listenForFeaturedItems() {
    onSnapshot(doc(db, 'config', 'featured'), (docSnap) => {
        featuredItemIds = docSnap.exists() ? (docSnap.data()?.items || []) : [];
        renderCatalog();
    });
}

function listenForCatalog() {
    onSnapshot(collection(db, 'content'), (snapshot) => {
        catalogData = [];
        snapshot.forEach(doc => catalogData.push({ id: doc.id, ...doc.data() }));
        renderCatalog();
        if (window.renderBmList) window.renderBmList();
    });
    document.getElementById('catalog-search').addEventListener('input', renderCatalog);
}

function renderCatalog() {
    const list = document.getElementById('catalog-list');
    const term = document.getElementById('catalog-search').value.toLowerCase();
    const filtered = catalogData.filter(i => i.title && i.title.toLowerCase().includes(term));
    
    if(!filtered.length) { 
        list.className = "flex justify-center w-full mt-10";
        list.innerHTML = '<p class="text-slate-400 text-center py-8 col-span-full font-semibold">Nenhum anime encontrado.</p>'; 
        return; 
    }

    list.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[65vh] overflow-y-auto pr-2 pb-4";
    list.innerHTML = '';
    
    filtered.sort((a,b)=>a.title.localeCompare(b.title)).forEach(item => {
        const isFeatured = featuredItemIds.includes(item.id);
        const featColor = isFeatured ? 'rgba(245,158,11,0.8)' : 'rgba(100,116,139,0.5)';
        const featText = isFeatured ? '⭐ Destaque' : '☆ Destacar';

        const div = document.createElement('div');
        div.className = 'flex items-start gap-4 p-4 bg-black/40 rounded-xl border border-slate-700/50 hover:bg-black/60 transition-colors group';
        div.innerHTML = `
            <img src="${item.poster || 'https://placehold.co/120x160/1c1917/999999?text=IMG'}" class="w-16 h-24 object-cover rounded-lg shadow-md group-hover:scale-105 transition-transform duration-300">
            <div class="flex-1 min-w-0 flex flex-col h-full">
                <h4 class="font-bold text-white truncate text-base mb-1" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</h4>
                <p class="text-xs text-amber-500 mb-3 font-semibold">${item.type==='tv'?'Série':'Filme'} • ${escapeHTML(item.year)}</p>
                <div class="flex flex-wrap gap-2 mt-auto">
                    <button class="glass-button rounded-lg py-1.5 px-3 text-xs flex-1" style="--bg-color:${featColor};" onclick="toggleFeaturedItem('${item.id}')"><div class="glass-content">${featText}</div></button>
                    <button class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(147,51,234,0.6);" onclick="openEditPage('${item.id}')"><div class="glass-content">✏️</div></button>
                    <button class="glass-button rounded-lg py-1.5 px-3 text-xs" style="--bg-color:rgba(220,38,38,0.6);" onclick="deleteContent('${item.id}', '${escapeHTML(item.title).replace(/'/g, "\\'")}')"><div class="glass-content">🗑️</div></button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
    window.initializeGlassEffects();
}

window.toggleFeaturedItem = async function(docId) {
    const isFeatured = featuredItemIds.includes(docId);
    try {
        if (isFeatured) { await setDoc(doc(db, 'config', 'featured'), { items: [] }, { merge: true }); showToast('Removido do destaque.'); } 
        else { await setDoc(doc(db, 'config', 'featured'), { items: [docId] }, { merge: true }); showToast('Definido como Destaque principal!'); }
    } catch (err) { showToast('Erro ao atualizar.', true); }
}

window.deleteContent = function(id, title) {
    showConfirm('Apagar Anime', `Excluir permanentemente "${title}" do banco de dados?`, async () => {
        await deleteDoc(doc(db, 'content', id)); showToast('Excluído com sucesso!');
    });
}

// ==========================================
// ADICIONAR / EDITAR LÓGICA
// ==========================================
function initAddContentLogic() {
    document.getElementById('search-tmdb-btn').onclick = async () => {
        const q = document.getElementById('search-query').value.trim();
        if(!q) return;
        
        showButtonSpinner(document.getElementById('search-tmdb-btn'));
        document.getElementById('details-form-container').classList.add('hidden');
        const res = document.getElementById('search-results');
        res.innerHTML = '<div class="spinner-lg mx-auto"></div>';

        const data = await fetchTMDB('search/multi', `query=${encodeURIComponent(q)}`);
        hideButtonSpinner(document.getElementById('search-tmdb-btn'), 'Buscar Anime');
        res.innerHTML = '';

        if(data && data.results) {
            const valid = data.results.filter(i => (i.media_type === 'tv' || i.media_type === 'movie') && i.poster_path);
            if(!valid.length) { res.innerHTML = '<p class="text-slate-400 text-center">Nenhum resultado.</p>'; return; }
            valid.forEach(item => {
                const div = document.createElement('div');
                div.className = 'flex items-center gap-4 p-3 bg-black/30 rounded-xl cursor-pointer hover:bg-amber-500/20 border border-transparent hover:border-amber-500/50';
                div.innerHTML = `<img src="${TMDB_IMG_URL}${item.poster_path}" class="w-12 h-16 object-cover rounded shadow-md"><div><h4 class="font-bold text-white">${item.name||item.title}</h4><p class="text-xs text-amber-500">${item.media_type === 'tv' ? 'Série' : 'Filme'} • ${(item.first_air_date||item.release_date||'').substring(0,4)}</p></div>`;
                div.onclick = () => window.selectItem(item.id, item.media_type);
                res.appendChild(div);
            });
        }
    };
}

window.selectItem = async (id, type) => {
    document.getElementById('search-results').innerHTML = '';
    try {
        const q = query(collection(db, 'content'), where('tmdb_id', '==', id));
        const snap = await getDocs(q);
        if(!snap.empty) return showConfirm('Já Existe', `Deseja abrir o modo de EDIÇÃO para atualizar este conteúdo?`, () => window.openEditPage(snap.docs[0].id));
    } catch (err) {}

    document.getElementById('details-form-container').classList.remove('hidden');
    document.getElementById('tmdb-details').innerHTML = '<div class="spinner-lg mx-auto mt-4"></div>';
    
    // FETCH ATUALIZADO: Traz as imagens junto com os dados da série/filme
    const [data, ageRating] = await Promise.all([
        fetchTMDB(`${type}/${id}`, 'append_to_response=images&include_image_language=pt-BR,pt,en,null'),
        fetchTmdbAgeRating(id, type)
    ]);
    
    if(data) { 
        tmdbData = data; 
        renderForm(data, type, ageRating); 
    }
};

function renderForm(data, mediaType, ageRating = '14') {
    document.getElementById('tmdb-id').value = data.id; 
    document.getElementById('media-type').value = mediaType;
    
    document.getElementById('add-main-title').value = data.name || data.title;
    document.getElementById('add-age-rating').value = ageRating; 
    
    document.getElementById('custom-poster').value = data.poster_path ? `${TMDB_IMG_URL}${data.poster_path}` : '';
    document.getElementById('custom-backdrop').value = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';

    // NOVO: Capturar Logo
    let logoUrl = '';
    if (data.images && data.images.logos && data.images.logos.length > 0) {
        logoUrl = `https://image.tmdb.org/t/p/original${data.images.logos[0].file_path}`;
    }
    // Verifica se o input custom-logo existe na tela e preenche
    if(document.getElementById('custom-logo')) {
        document.getElementById('custom-logo').value = logoUrl;
    }

    document.getElementById('tmdb-details').innerHTML = `<img src="${TMDB_IMG_URL}${data.poster_path}" class="w-28 h-40 object-cover rounded-xl border-2 border-slate-700"><div class="flex-1"><h2 class="text-3xl font-black text-white">${data.name||data.title}</h2><p class="text-amber-500 font-bold text-sm mb-2">${mediaType === 'tv'?'Série':'Filme'}</p><p class="text-slate-300 text-sm line-clamp-3">${data.overview||'Sem sinopse'}</p></div>`;
    
    const selArea = document.getElementById('seasons-selector-area');
    const addGlobalToolbar = document.getElementById('add-global-toolbar');
    
    document.getElementById('url-container').innerHTML = ''; document.getElementById('seasons-list').innerHTML = ''; document.getElementById('season-pills-container').innerHTML = '';
    selArea.classList.add('hidden'); selArea.classList.remove('flex');
    addGlobalToolbar.classList.add('hidden'); addGlobalToolbar.classList.remove('flex');

    if(mediaType === 'movie') {
        document.getElementById('url-container').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label class="block text-sm font-bold text-amber-500 mb-2">URL do Filme (Padrão/Dub)</label><input type="url" id="movie-url" class="w-full p-4 glass-input rounded-xl text-lg missing-link"></div>
                <div><label class="block text-sm font-bold text-indigo-400 mb-2">URL do Filme (Alternativo/Leg)</label><input type="url" id="movie-alt-url" class="w-full p-4 glass-input border-indigo-500/50 rounded-xl text-lg" placeholder="Opcional..."></div>
            </div>`;
        
        const mUrl = document.getElementById('movie-url');
        const mAltUrl = document.getElementById('movie-alt-url');
        const updateMovieLinks = () => {
            if (mUrl.value.trim() || mAltUrl.value.trim()) {
                mUrl.classList.remove('missing-link');
            } else {
                mUrl.classList.add('missing-link');
            }
        };
        mUrl.oninput = updateMovieLinks;
        mAltUrl.oninput = updateMovieLinks;
    } else {
        selArea.classList.remove('hidden'); selArea.classList.add('flex');
        const pills = document.getElementById('season-pills-container');
        (data.seasons || []).filter(s => s.season_number > 0).forEach(s => {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'glass-button rounded-full py-2 px-4 text-sm'; btn.style.setProperty('--bg-color', 'rgba(245,158,11,0.25)');
            btn.innerHTML = `<div class="glass-filter rounded-full"></div><div class="glass-overlay rounded-full"></div><div class="glass-specular rounded-full"></div><div class="glass-content text-white"><span class="button-text font-bold">+ ${s.name} (${s.episode_count} eps)</span><div class="button-spinner" style="display:none;"><div class="spinner w-4 h-4 border-2"></div></div></div>`;
            btn.onclick = () => window.handleAddSeasonClick(s.season_number, btn, false, data.id);
            pills.appendChild(btn);
        });
        window.initializeGlassEffects();
    }
}

window.openEditPage = async (docId) => {
    const item = catalogData.find(i => i.id === docId);
    if (!item) return;

    window.location.hash = 'editContentPage';
    document.getElementById('edit-title-header').textContent = `Editando...`;
    document.getElementById('edit-doc-id').value = item.id;
    document.getElementById('edit-media-type').value = item.type;
    document.getElementById('edit-tmdb-id').value = item.tmdb_id;
    
    document.getElementById('edit-main-title').value = item.title || '';
    
    let currentRating = item.ageRating;
    if (!currentRating) {
        currentRating = await fetchTmdbAgeRating(item.tmdb_id, item.type);
    }
    document.getElementById('edit-age-rating').value = currentRating || '14'; 

    const editBadgeSelect = document.getElementById('edit-badge-text');
    editBadgeSelect.value = item.badgeText || '';
    
    if (editBadgeSelect.value === '' && item.badgeText) {
        const matchOpt = Array.from(editBadgeSelect.options).find(o => o.value.toLowerCase() === item.badgeText.toLowerCase());
        if (matchOpt) {
            editBadgeSelect.value = matchOpt.value;
        } else {
            const newOpt = document.createElement('option');
            newOpt.value = item.badgeText;
            newOpt.text = item.badgeText + ' (Personalizado)';
            editBadgeSelect.appendChild(newOpt);
            editBadgeSelect.value = item.badgeText;
        }
    }

    if (item.badgeExpiration && item.badgeExpiration > 0) {
        const d = new Date(item.badgeExpiration);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        document.getElementById('edit-badge-expiration').value = localDate.toISOString().split('T')[0];
    } else {
        document.getElementById('edit-badge-expiration').value = '';
    }

    document.getElementById('edit-custom-poster').value = item.poster || '';
    document.getElementById('edit-custom-backdrop').value = item.backdrop || '';

    // NOVO: Carregar Logo salvo
    if(document.getElementById('edit-custom-logo')) {
        document.getElementById('edit-custom-logo').value = item.logo || '';
    }

    const urlContainer = document.getElementById('edit-url-container');
    const list = document.getElementById('edit-seasons-list');
    const addArea = document.getElementById('edit-add-season-wrapper');
    const pills = document.getElementById('edit-season-pills');
    const globalToolbar = document.getElementById('global-renumber-toolbar');
    
    urlContainer.innerHTML = ''; list.innerHTML = ''; pills.innerHTML = '';
    addArea.classList.add('hidden'); addArea.classList.remove('flex');
    globalToolbar.classList.add('hidden'); globalToolbar.classList.remove('flex');

    if (item.type === 'movie') {
        urlContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label class="block text-sm font-bold text-purple-400 mb-2">URL do Filme (Padrão/Dub)</label><input type="url" id="edit-movie-url" class="w-full p-4 glass-input rounded-xl text-lg ${(!item.url && !item.altUrl) ?'missing-link':''}" value="${item.url||''}"></div>
                <div><label class="block text-sm font-bold text-indigo-400 mb-2">URL do Filme (Alternativo/Leg)</label><input type="url" id="edit-movie-alt-url" class="w-full p-4 glass-input border-indigo-500/50 rounded-xl text-lg" placeholder="Opcional..." value="${item.altUrl||''}"></div>
            </div>`;
            
        const emUrl = document.getElementById('edit-movie-url');
        const emAltUrl = document.getElementById('edit-movie-alt-url');
        const updateEditMovieLinks = () => {
            if (emUrl.value.trim() || emAltUrl.value.trim()) {
                emUrl.classList.remove('missing-link');
            } else {
                emUrl.classList.add('missing-link');
            }
        };
        emUrl.oninput = updateEditMovieLinks;
        emAltUrl.oninput = updateEditMovieLinks;
    } else {
        list.innerHTML = '<div class="spinner-lg mx-auto my-8"></div>';
        const fresh = await fetchTMDB(`tv/${item.tmdb_id}`);
        list.innerHTML = '';
        
        globalToolbar.classList.remove('hidden'); globalToolbar.classList.add('flex');

        if(fresh && fresh.seasons) {
            const existTmdbKeys = Object.entries(item.seasons||{}).map(([key, s]) => Number(s.tmdbSeason || key));
            
            const newSeasons = fresh.seasons.filter(s => s.season_number > 0 && !existTmdbKeys.includes(s.season_number));
            if(newSeasons.length > 0) {
                addArea.classList.remove('hidden'); addArea.classList.add('flex');
                newSeasons.forEach(s => {
                    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'glass-button rounded-full py-2 px-4 text-sm'; btn.style.setProperty('--bg-color', 'rgba(168,85,247,0.25)');
                    btn.innerHTML = `<div class="glass-filter rounded-full"></div><div class="glass-overlay rounded-full"></div><div class="glass-specular rounded-full"></div><div class="glass-content text-white"><span class="button-text font-bold">+ ${s.name}</span><div class="button-spinner" style="display:none;"><div class="spinner w-4 h-4 border-2"></div></div></div>`;
                    btn.onclick = () => window.handleAddSeasonClick(s.season_number, btn, true, item.tmdb_id);
                    pills.appendChild(btn);
                });
            }
        }

        Object.keys(item.seasons||{}).sort((a,b)=>Number(a)-Number(b)).forEach(sNum => {
            const s = item.seasons[sNum]; if(!s||!s.episodes) return;
            const group = createSeasonGroupElement(sNum, s.title, 'edit-seasons-list', item.tmdb_id, s.tmdbSeason || sNum);
            const epsC = group.querySelector('.episodes-list');
            s.episodes.sort((a,b)=>a.episode_number-b.episode_number).forEach(ep => {
                epsC.appendChild(createEpisodeRow(ep.episode_number, ep.title, ep.overview, ep.still_path, false, ep.url, ep.altUrl || '', ep.isComingSoon, ep.tmdbSeason || s.tmdbSeason || sNum, ep.tmdbEp || ep.episode_number));
            });
            list.appendChild(group);
        });

        document.getElementById('global-renumber-btn').onclick = () => {
            const startVal = prompt("Qual o número do PRIMEIRO episódio de TODA a série?", "1");
            if(startVal && !isNaN(parseInt(startVal))) {
                let c = parseInt(startVal);
                list.querySelectorAll('.episode-row').forEach(row => {
                    row.querySelector('.episode-number').value = c;
                    c++;
                });
                showToast("Série renumerada!");
            }
        };
        window.initializeGlassEffects();
    }
};

// Salvar Adição (Adicionado Gatilho Telegram)
document.getElementById('content-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = document.getElementById('save-btn'); showButtonSpinner(btn);
    const type = document.getElementById('media-type').value;
    
    let docId = createSlug(tmdbData.name || tmdbData.title);
    if (!docId || docId.trim() === '') docId = tmdbData.id.toString();

    const badgeExpInput = document.getElementById('add-badge-expiration').value;
    const badgeExpiration = badgeExpInput ? new Date(badgeExpInput + 'T23:59:59').getTime() : 0;

    let contentData = { 
        title: document.getElementById('add-main-title').value.trim(), 
        ageRating: document.getElementById('add-age-rating').value, 
        type: type, 
        tmdb_id: tmdbData.id, 
        poster: document.getElementById('custom-poster').value, 
        backdrop: document.getElementById('custom-backdrop').value, 
        logo: document.getElementById('custom-logo') ? document.getElementById('custom-logo').value : '', // NOVO
        synopsis: tmdbData.overview||'', 
        year: (tmdbData.first_air_date||tmdbData.release_date||'').substring(0,4), 
        genres: (tmdbData.genres||[]).map(g=>g.name), 
        badgeText: document.getElementById('add-badge-text').value,
        badgeExpiration: badgeExpiration,
        addedAt: serverTimestamp(), 
        updatedAt: serverTimestamp() 
    };
    try {
        if (type === 'movie') {
            contentData.url = document.getElementById('movie-url').value; 
            contentData.altUrl = document.getElementById('movie-alt-url').value;
        } else {
            const sMap = {}; const grps = document.querySelectorAll('#seasons-list .season-group');
            if(!grps.length) throw new Error("Adicione temporadas.");
            
            grps.forEach((g, index) => {
                const sNum = index + 1;
                const eps = [];
                g.querySelectorAll('.episode-row').forEach(r => eps.push({ 
                    episode_number: parseInt(r.querySelector('.episode-number').value), 
                    tmdbSeason: r.dataset.tmdbSeason || g.dataset.tmdbSeason,
                    tmdbEp: r.dataset.tmdbEp || r.querySelector('.episode-number').value,
                    title: r.querySelector('.episode-title').value, 
                    url: r.querySelector('.episode-url').value, 
                    altUrl: r.querySelector('.episode-alt-url').value,
                    still_path: r.querySelector('.episode-still-path').value, 
                    overview: r.querySelector('.episode-overview').value, 
                    isComingSoon: r.querySelector('.episode-coming-soon').checked 
                }));
                sMap[sNum] = { title: g.querySelector('.season-title-input').value.trim(), tmdbSeason: g.dataset.tmdbSeason, episodes: eps };
            });
            contentData.seasons = sMap;
        }
        await setDoc(doc(db, 'content', docId), contentData);
        
        if (document.getElementById('notify-add').checked) {
            await window.sendPushNotification('all', 'Novo Lançamento! 🍿', `${contentData.title} acabou de chegar no catálogo. Vá conferir!`);
            // Disparo Telegram Novo Conteúdo
            await window.sendToTelegram(contentData.title, contentData.synopsis, contentData.poster, false);
        }

        showToast('Salvo com sucesso!'); 
        document.getElementById('content-form').reset(); 
        document.getElementById('details-form-container').classList.add('hidden'); 
        document.getElementById('search-query').value = '';
        document.getElementById('add-badge-text').value = '';
        document.getElementById('add-badge-expiration').value = '';
        // NOVO: Limpa o input do logo se existir
        if(document.getElementById('custom-logo')) document.getElementById('custom-logo').value = '';
    } catch(e) { showToast(e.message, true); } finally { hideButtonSpinner(btn, 'Salvar no Mango'); }
};

// Salvar Edição (Adicionado Gatilho Telegram)
document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = document.getElementById('edit-save-btn'); showButtonSpinner(btn);
    const docId = document.getElementById('edit-doc-id').value; const type = document.getElementById('edit-media-type').value;
    
    const editBadgeExpInput = document.getElementById('edit-badge-expiration').value;
    const editBadgeExpiration = editBadgeExpInput ? new Date(editBadgeExpInput + 'T23:59:59').getTime() : 0;

    try {
        let p = { 
            title: document.getElementById('edit-main-title').value.trim(),
            ageRating: document.getElementById('edit-age-rating').value,
            updatedAt: serverTimestamp(),
            poster: document.getElementById('edit-custom-poster').value,
            backdrop: document.getElementById('edit-custom-backdrop').value,
            logo: document.getElementById('edit-custom-logo') ? document.getElementById('edit-custom-logo').value : '', // NOVO
            badgeText: document.getElementById('edit-badge-text').value,
            badgeExpiration: editBadgeExpiration
        };
        if(type === 'movie') {
            p.url = document.getElementById('edit-movie-url').value;
            p.altUrl = document.getElementById('edit-movie-alt-url').value;
        } else {
            const sMap = {}; const grps = document.querySelectorAll('#edit-seasons-list .season-group');
            grps.forEach((g, index) => {
                const sNum = index + 1; 
                const eps = [];
                g.querySelectorAll('.episode-row').forEach(r => eps.push({ 
                    episode_number: parseInt(r.querySelector('.episode-number').value), 
                    tmdbSeason: r.dataset.tmdbSeason || g.dataset.tmdbSeason,
                    tmdbEp: r.dataset.tmdbEp || r.querySelector('.episode-number').value,
                    title: r.querySelector('.episode-title').value, 
                    url: r.querySelector('.episode-url').value, 
                    altUrl: r.querySelector('.episode-alt-url').value,
                    still_path: r.querySelector('.episode-still-path').value, 
                    overview: r.querySelector('.episode-overview').value, 
                    isComingSoon: r.querySelector('.episode-coming-soon').checked 
                }));
                sMap[sNum] = { title: g.querySelector('.season-title-input').value.trim(), tmdbSeason: g.dataset.tmdbSeason, episodes: eps };
            });
            p.seasons = sMap;
        }
        await updateDoc(doc(db, 'content', docId), p);
        
        if (document.getElementById('notify-edit').checked) {
            await window.sendPushNotification(`content_${docId}`, 'Tem novidade! 📺', `${p.title} acaba de receber uma atualização!`);
            
            // Disparo Telegram Atualização
            const currentItemInfo = catalogData.find(i => i.id === docId);
            const synopsisToUse = currentItemInfo ? currentItemInfo.synopsis : 'Acesse o aplicativo para ver as novidades!';
            await window.sendToTelegram(p.title, synopsisToUse, p.poster, true);
        }

        showToast('Editado com sucesso!'); setTimeout(()=> { window.location.hash = 'manageContent'; }, 1000);
    } catch(e) { showToast(e.message, true); } finally { hideButtonSpinner(btn, 'Salvar Alterações'); }
};

// ==========================================
// GERENCIADOR DE SELOS RÁPIDO 
// ==========================================
function initBadgeManagerLogic() {
    window.renderBmList = function() {
        const term = document.getElementById('bm-search').value.toLowerCase();
        const list = document.getElementById('bm-list');
        list.innerHTML = '';

        const filtered = catalogData
            .filter(i => i.title && i.title.toLowerCase().includes(term))
            .sort((a,b) => a.title.localeCompare(b.title));

        if(filtered.length === 0) {
            list.innerHTML = '<p class="text-slate-400 text-center text-sm py-4">Nenhum anime encontrado.</p>';
            return;
        }

        filtered.forEach(item => {
            const isBadgeActive = item.badgeText && (item.badgeExpiration === 0 || item.badgeExpiration > Date.now());
            const badgeHtml = isBadgeActive
                ? `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded font-bold">${item.badgeText}</span>`
                : ``;

            const div = document.createElement('div');
            div.className = 'flex items-center gap-3 p-3 bg-black/40 rounded-xl cursor-pointer hover:bg-amber-500/20 border border-transparent hover:border-amber-500/50 transition';
            div.innerHTML = `
                <img src="${item.poster || 'https://placehold.co/120x160/1c1917/999999?text=IMG'}" class="w-10 h-14 object-cover rounded shadow">
                <div class="flex-1 min-w-0">
                    <h4 class="font-bold text-white text-sm truncate">${escapeHTML(item.title)}</h4>
                    <div class="flex items-center gap-2 mt-1">
                        <p class="text-[10px] text-slate-400 uppercase">${item.type === 'tv' ? 'Série' : 'Filme'}</p>
                        ${badgeHtml}
                    </div>
                </div>
            `;
            div.onclick = () => selectBmItem(item);
            list.appendChild(div);
        });
    };

    document.getElementById('bm-search').addEventListener('input', renderBmList);

    window.selectBmItem = function(item) {
        document.getElementById('bm-editor-empty').classList.add('hidden');
        document.getElementById('bm-form').classList.remove('hidden');

        document.getElementById('bm-id').value = item.id;
        document.getElementById('bm-poster').src = item.poster || 'https://placehold.co/120x160/1c1917/999999?text=IMG';
        document.getElementById('bm-title').textContent = item.title;
        document.getElementById('bm-type').textContent = item.type === 'tv' ? 'Série' : 'Filme';

        const bmBadgeSelect = document.getElementById('bm-badge-text');
        bmBadgeSelect.value = item.badgeText || '';

        if (bmBadgeSelect.value === '' && item.badgeText) {
            const matchOpt = Array.from(bmBadgeSelect.options).find(o => o.value.toLowerCase() === item.badgeText.toLowerCase());
            if (matchOpt) {
                bmBadgeSelect.value = matchOpt.value;
            } else {
                const newOpt = document.createElement('option');
                newOpt.value = item.badgeText;
                newOpt.text = item.badgeText + ' (Personalizado)';
                bmBadgeSelect.appendChild(newOpt);
                bmBadgeSelect.value = item.badgeText;
            }
        }

        if (item.badgeExpiration && item.badgeExpiration > 0) {
            const d = new Date(item.badgeExpiration);
            const offset = d.getTimezoneOffset() * 60000;
            const localDate = new Date(d.getTime() - offset);
            document.getElementById('bm-badge-expiration').value = localDate.toISOString().split('T')[0];
        } else {
            document.getElementById('bm-badge-expiration').value = '';
        }
    };

    document.getElementById('bm-form').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('bm-id').value;
        const text = document.getElementById('bm-badge-text').value;
        const expDate = document.getElementById('bm-badge-expiration').value;
        const btn = document.getElementById('bm-save-btn');

        let expirationTs = 0;
        if (text !== "" && expDate) {
            expirationTs = new Date(expDate + 'T23:59:59').getTime();
        }

        showButtonSpinner(btn);
        try {
            await updateDoc(doc(db, 'content', id), {
                badgeText: text,
                badgeExpiration: expirationTs
            });
            showToast("Selo atualizado com sucesso!");
        } catch (err) {
            console.error(err);
            showToast("Erro ao atualizar o selo.", true);
        } finally {
            hideButtonSpinner(btn, 'Salvar Selo Rápido');
        }
    };
}

// ==========================================
// LÓGICA DE GERAÇÃO AVANÇADA DE CARROSSEL COM IA
// ==========================================
function initCarouselLogic() {
    const savedGeminiKey = localStorage.getItem('mango_gemini_key');
    const savedGroqKey = localStorage.getItem('mango_groq_key');
    
    if(savedGeminiKey && document.getElementById('gemini-api-key')) document.getElementById('gemini-api-key').value = savedGeminiKey;
    if(savedGroqKey && document.getElementById('groq-api-key')) document.getElementById('groq-api-key').value = savedGroqKey;

    const grid = document.getElementById('carousel-items-grid');
    let pendingAiCarousels = []; 
    
    onSnapshot(collection(db, 'carousels'), (snapshot) => {
        carouselsData = [];
        snapshot.forEach(doc => carouselsData.push({ id: doc.id, ...doc.data() }));
        renderSavedCarousels();
    });

    function renderGrid() {
        if(!grid) return;
        grid.innerHTML = '';
        catalogData.forEach(item => {
            const div = document.createElement('label'); div.className = "cursor-pointer relative";
            div.innerHTML = `<input type="checkbox" class="catalog-check sr-only" value="${item.id}"><div class="p-2 border border-slate-700/50 rounded-lg hover:border-amber-500/50 transition-colors bg-slate-900/50"><img src="${item.poster}" class="w-full aspect-[2/3] object-cover rounded shadow mb-2"><p class="text-xs text-center text-white font-bold truncate">${item.title}</p><svg class="check-icon hidden absolute top-4 right-4 w-6 h-6 text-amber-500 bg-black/50 rounded-full" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg></div>`;
            grid.appendChild(div);
        });
    }
    
    const cInt = setInterval(() => { if(catalogData.length > 0) { clearInterval(cInt); renderGrid(); } }, 500);

    function renderSavedCarousels() {
        const list = document.getElementById('saved-carousels-list');
        if(!list) return;
        list.innerHTML = '';
        if (carouselsData.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400">Nenhum carrossel salvo.</p>';
            return;
        }
        carouselsData.forEach(c => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-black/30 rounded-lg border border-slate-700 mb-2 transition hover:bg-slate-800";
            div.innerHTML = `
                <div class="cursor-pointer flex-1" onclick="editCarousel('${c.id}')">
                    <p class="text-sm font-bold text-white">${c.title}</p>
                    <p class="text-xs text-amber-500">${(c.items || []).length} itens ${c.isAiGenerated ? '(IA)' : '(Manual)'}</p>
                </div>
                <div class="flex gap-2">
                    <button class="text-red-400 hover:text-red-300 p-2" onclick="deleteCarousel('${c.id}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    window.editCarousel = function(id) {
        const c = carouselsData.find(x => x.id === id);
        if (!c) return;
        document.getElementById('carousel-edit-id').value = c.id;
        document.getElementById('carousel-title').value = c.title;
        document.querySelectorAll('.catalog-check').forEach(chk => {
            chk.checked = (c.items || []).includes(chk.value);
        });
        document.getElementById('save-carousel-btn').querySelector('.button-text').textContent = "Atualizar Carrossel";
    };

    window.deleteCarousel = function(id) {
        showConfirm('Apagar Carrossel', 'Deseja apagar esta categoria da Home do App?', async () => {
            await deleteDoc(doc(db, 'carousels', id));
            showToast('Carrossel apagado!');
        });
    };

    window.deleteAllCarousels = function() {
        showConfirm('Apagar TODOS', 'Tem certeza absoluta? Isso excluirá todas as categorias (manuais e geradas por IA) da tela inicial do seu app.', async () => {
            try {
                const snap = await getDocs(collection(db, 'carousels'));
                if (snap.empty) return showToast('Nenhum carrossel para apagar.');
                
                showToast('Apagando todos os carrosséis...');
                const deletePromises = snap.docs.map(d => deleteDoc(doc(db, 'carousels', d.id)));
                await Promise.all(deletePromises);
                
                showToast('Todos os carrosséis foram apagados!');
                clearCarouselEdit();
            } catch(e) {
                console.error(e);
                showToast('Erro ao apagar carrosséis.', true);
            }
        });
    };

    window.clearCarouselEdit = function() {
        document.getElementById('carousel-edit-id').value = '';
        document.getElementById('carousel-title').value = '';
        document.querySelectorAll('.catalog-check').forEach(c=>c.checked=false);
        document.getElementById('save-carousel-btn').querySelector('.button-text').textContent = "Salvar Novo Carrossel";
    }

    document.getElementById('generate-all-ai-btn').onclick = async () => {
        const aiModelElement = document.getElementById('ai-model-select');
        const aiModel = aiModelElement ? aiModelElement.value : 'gemini'; 
        
        const geminiKeyEl = document.getElementById('gemini-api-key');
        const groqKeyEl = document.getElementById('groq-api-key');
        const geminiKey = geminiKeyEl ? geminiKeyEl.value.trim() : localStorage.getItem('mango_gemini_key') || '';
        const groqKey = groqKeyEl ? groqKeyEl.value.trim() : localStorage.getItem('mango_groq_key') || '';
        
        const qtyEl = document.getElementById('carousel-quantity');
        const qty = qtyEl ? parseInt(qtyEl.value) : 5;

        const btn = document.getElementById('generate-all-ai-btn');

        if(aiModel === 'gemini' && !geminiKey) return showToast("Por favor, insira a chave da API do Gemini.", true);
        if(aiModel === 'groq' && !groqKey) return showToast("Por favor, insira a chave da API da Groq.", true);
        if(catalogData.length === 0) return showToast("Seu catálogo está vazio.", true);
        
        if(geminiKey) localStorage.setItem('mango_gemini_key', geminiKey); 
        if(groqKey) localStorage.setItem('mango_groq_key', groqKey); 

        showButtonSpinner(btn);
        
        const simpleCat = catalogData.map(c => ({ id: c.id, title: c.title, gen: c.genres.join(',') }));
        
        const sysPrompt = `Você é um curador especialista em animes e filmes. Analise o seguinte catálogo: ${JSON.stringify(simpleCat)}.
        Sua tarefa é criar EXATAMENTE ${qty} categorias temáticas.
        Use nomes extremamente criativos e chamativos para os títulos dos carrosséis (ex: "Shounen de Arrepiar", "Romances para Chorar", "Ação Frenética", "Para Maratonar Hoje").
        NÃO crie as categorias padrão do sistema: "Lançamentos", "Adicionados Recentemente" ou "Destaques da Semana".
        Para cada categoria criada, adicione de 4 a 12 IDs de conteúdos que combinem perfeitamente com o tema.
        Responda APENAS E EXCLUSIVAMENTE com um JSON Array de objetos. Sem formatação markdown, sem texto antes ou depois.
        Formato OBRIGATÓRIO exato:
        [
          {"title": "Nome Criativo Aqui", "items": ["id1", "id2"]},
          {"title": "Outro Nome Divertido", "items": ["id3", "id4"]}
        ]`;

        try {
            let aiText = "";

            if (aiModel === 'gemini') {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: sysPrompt }] }] })
                });
                
                if(!res.ok) {
                    const errObj = await res.json();
                    throw new Error(`Erro Gemini: ${errObj.error?.message || res.status}`);
                }
                const data = await res.json();
                aiText = data.candidates[0].content.parts[0].text;
                
            } else if (aiModel === 'groq') {
                const res = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${groqKey}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile", 
                        messages: [
                            {
                                "role": "system", 
                                "content": "You are a machine that outputs ONLY pure JSON arrays. No markdown, no conversational text."
                            },
                            {
                                "role": "user", 
                                "content": sysPrompt
                            }
                        ],
                        temperature: 0.7
                    })
                });
                
                if(!res.ok) {
                    let errMsg = "Erro Desconhecido";
                    try {
                        const errObj = await res.json();
                        errMsg = errObj.error?.message || JSON.stringify(errObj);
                    } catch(e) { errMsg = res.statusText; }
                    throw new Error(`Erro Groq: ${errMsg}`);
                }
                
                const data = await res.json();
                aiText = data.choices[0].message.content;
            }
            
            console.log("Resposta bruta da IA:", aiText);

            const startIndex = aiText.indexOf('[');
            const endIndex = aiText.lastIndexOf(']');
            
            if (startIndex === -1 || endIndex === -1) {
                throw new Error("A resposta da IA não contém um formato JSON válido.");
            }
            
            aiText = aiText.substring(startIndex, endIndex + 1);
            pendingAiCarousels = JSON.parse(aiText);
            
            if(document.getElementById('ai-carousel-preview-area')) {
                renderAiPreview(pendingAiCarousels);
                showToast(`A IA gerou ${pendingAiCarousels.length} sugestões! Revise antes de salvar.`);
            } else {
                await saveAllPendingCarouselsDirectly(pendingAiCarousels);
            }
            
        } catch(e) { 
            console.error(e);
            if (e.name === 'TypeError') {
                showToast("Erro de Conexão ou CORS. Verifique sua chave da API.", true);
            } else {
                showToast(e.message, true); 
            }
        } finally { 
            hideButtonSpinner(btn, 'Gerar Sugestões com IA'); 
        }
    };

    window.renderAiPreview = function(carousels) {
        const container = document.getElementById('ai-carousel-preview-area');
        const list = document.getElementById('ai-carousel-suggestions-list');
        if(!container || !list) return;

        container.classList.remove('hidden');
        list.innerHTML = '';

        carousels.forEach((c, idx) => {
            const div = document.createElement('div');
            div.className = "p-4 bg-black/40 rounded-xl border border-pink-500/30 mb-3";
            
            const imagesHtml = c.items.map(itemId => {
                const catItem = catalogData.find(x => x.id === itemId);
                if(catItem) return `<img src="${catItem.poster}" class="w-10 h-14 object-cover rounded shadow border border-slate-700" title="${escapeHTML(catItem.title)}">`;
                return '';
            }).join('');

            div.innerHTML = `
                <div class="flex items-center gap-3 mb-3">
                    <input type="checkbox" class="ai-suggestion-check w-5 h-5 text-pink-500 rounded border-gray-500 bg-transparent focus:ring-pink-500 cursor-pointer" value="${idx}" checked>
                    <input type="text" id="ai-title-${idx}" value="${escapeHTML(c.title)}" class="flex-1 p-2 glass-input rounded-lg font-bold text-pink-300 text-sm">
                    <span class="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded border border-slate-600">${c.items.length} itens</span>
                </div>
                <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    ${imagesHtml || '<span class="text-xs text-slate-500">Itens não encontrados</span>'}
                </div>
            `;
            list.appendChild(div);
        });
    };

    const saveSelectedBtn = document.getElementById('save-selected-ai-btn');
    if(saveSelectedBtn) {
        saveSelectedBtn.onclick = async (e) => {
            const btn = e.currentTarget;
            showButtonSpinner(btn);

            try {
                const checkboxes = document.querySelectorAll('.ai-suggestion-check:checked');
                if(checkboxes.length === 0) {
                    hideButtonSpinner(btn, 'Salvar Selecionados');
                    return showToast("Selecione pelo menos um carrossel para salvar.", true);
                }

                const finalCarousels = [];
                checkboxes.forEach(chk => {
                    const idx = chk.value;
                    const title = document.getElementById(`ai-title-${idx}`).value.trim();
                    finalCarousels.push({
                        title: title,
                        items: pendingAiCarousels[idx].items
                    });
                });

                const oldDocs = await getDocs(query(collection(db, 'carousels'), where('isAiGenerated', '==', true)));
                const deletePromises = oldDocs.docs.map(d => deleteDoc(doc(db, 'carousels', d.id)));
                await Promise.all(deletePromises);

                const savePromises = finalCarousels.map(c => {
                    return addDoc(collection(db, 'carousels'), {
                        title: c.title,
                        items: c.items,
                        isAiGenerated: true,
                        createdAt: serverTimestamp()
                    });
                });
                await Promise.all(savePromises);

                showToast(`Sucesso! ${finalCarousels.length} novos carrosséis publicados no App.`);
                document.getElementById('ai-carousel-preview-area').classList.add('hidden');
                pendingAiCarousels = []; 
            } catch (err) {
                console.error(err);
                showToast("Erro ao salvar os carrosséis.", true);
            } finally {
                hideButtonSpinner(btn, 'Salvar Selecionados');
            }
        };
    }

    async function saveAllPendingCarouselsDirectly(carouselsArray) {
        const oldDocs = await getDocs(query(collection(db, 'carousels'), where('isAiGenerated', '==', true)));
        const deletePromises = oldDocs.docs.map(d => deleteDoc(doc(db, 'carousels', d.id)));
        await Promise.all(deletePromises);

        const savePromises = carouselsArray.map(c => {
            return addDoc(collection(db, 'carousels'), {
                title: c.title,
                items: c.items,
                isAiGenerated: true,
                createdAt: serverTimestamp()
            });
        });
        await Promise.all(savePromises);
        showToast(`A IA gerou ${carouselsArray.length} categorias com sucesso!`);
    }

    document.getElementById('save-carousel-btn').onclick = async () => {
        const title = document.getElementById('carousel-title').value.trim();
        const selected = Array.from(document.querySelectorAll('.catalog-check:checked')).map(c => c.value);
        const id = document.getElementById('carousel-edit-id').value;
        const btn = document.getElementById('save-carousel-btn');

        if(!title || !selected.length) return showToast("Preencha título e marque itens.", true);
        
        showButtonSpinner(btn);
        try {
            if (id) {
                await updateDoc(doc(db, 'carousels', id), { title: title, items: selected, updatedAt: serverTimestamp() });
                showToast("Carrossel Atualizado!");
            } else {
                await addDoc(collection(db, 'carousels'), { title: title, items: selected, isAiGenerated: false, createdAt: serverTimestamp() });
                showToast("Carrossel Criado!");
            }
            clearCarouselEdit();
        } catch(e) { showToast("Erro ao salvar.", true); } finally { hideButtonSpinner(btn, 'Salvar Carrossel'); }
    };
}

// ==========================================
// LÓGICA DA ABA DE AVATARES DE PERFIL
// ==========================================
function initAvatarLogic() {
    let currentAvatarUrls = [];
    let cropperInstance = null;
    let currentCropIndex = -1;

    onSnapshot(collection(db, 'avatar_groups'), (snapshot) => {
        avatarGroupsData = [];
        snapshot.forEach(doc => avatarGroupsData.push({ id: doc.id, ...doc.data() }));
        renderSavedAvatarGroups();
    });

    function renderSavedAvatarGroups() {
        const list = document.getElementById('saved-avatar-groups-list');
        list.innerHTML = '';
        if (avatarGroupsData.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400">Nenhum grupo de avatar salvo.</p>';
            return;
        }
        avatarGroupsData.forEach(group => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-black/30 rounded-lg border border-slate-700 mb-2 transition hover:bg-slate-800";
            div.innerHTML = `
                <div class="cursor-pointer flex-1" onclick="editAvatarGroup('${group.id}')">
                    <p class="text-sm font-bold text-white">${escapeHTML(group.title)}</p>
                    <p class="text-xs text-indigo-400">${(group.avatars || []).length} avatares cadastrados</p>
                </div>
                <div class="flex gap-2">
                    <button class="text-red-400 hover:text-red-300 p-2" onclick="deleteAvatarGroup('${group.id}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    document.getElementById('avatar-tmdb-search-btn').onclick = async () => {
        const q = document.getElementById('avatar-tmdb-search').value.trim();
        if(!q) return;
        
        const btn = document.getElementById('avatar-tmdb-search-btn');
        showButtonSpinner(btn);
        const res = document.getElementById('avatar-tmdb-results');
        res.innerHTML = '<div class="spinner-lg mx-auto"></div>';

        const data = await fetchTMDB('search/multi', `query=${encodeURIComponent(q)}`);
        hideButtonSpinner(btn, 'Buscar Imagens');
        res.innerHTML = '';

        if(data && data.results) {
            const valid = data.results.filter(i => (i.media_type === 'tv' || i.media_type === 'movie') && i.poster_path);
            if(!valid.length) { res.innerHTML = '<p class="text-slate-400 text-center text-sm">Nenhum resultado.</p>'; return; }
            valid.forEach(item => {
                const div = document.createElement('div');
                div.className = 'flex items-center gap-3 p-2 bg-black/40 rounded-xl cursor-pointer hover:bg-indigo-500/20 border border-transparent hover:border-indigo-500/50 transition-colors';
                div.innerHTML = `<img src="${TMDB_IMG_URL}${item.poster_path}" class="w-10 h-14 object-cover rounded shadow-md"><div><h4 class="font-bold text-white text-sm">${item.name||item.title}</h4><p class="text-xs text-indigo-400">${item.media_type === 'tv' ? 'Série' : 'Filme'}</p></div>`;
                div.onclick = () => fetchTmdbPostersForAvatars(item.id, item.media_type, item.name||item.title);
                res.appendChild(div);
            });
        }
    };

    async function fetchTmdbPostersForAvatars(id, type, title) {
        document.getElementById('avatar-group-title').value = title;
        showToast("Carregando imagens...");
        
        const data = await fetchTMDB(`${type}/${id}/images`, 'include_image_language=pt,en,null');
        let images = [];
        
        if (data) {
            if (data.posters) {
                images = images.concat(data.posters.slice(0, 15).map(c => `${TMDB_IMG_URL}${c.file_path}`));
            }
            if (data.backdrops) {
                images = images.concat(data.backdrops.slice(0, 15).map(c => `https://image.tmdb.org/t/p/original${c.file_path}`));
            }
            
            if (images.length > 0) {
                currentAvatarUrls = [...new Set([...currentAvatarUrls, ...images])]; 
                renderAvatarEditorGrid();
                showToast(`${images.length} imagens carregadas!`);
            } else {
                showToast("Este conteúdo não tem imagens no TMDB.", true);
            }
        }
    }

    let autoPasteEnabled = false;
    let lastClipboardText = "";

    document.getElementById('auto-paste-toggle').addEventListener('change', async function() {
        const statusText = document.getElementById('auto-paste-status');
        autoPasteEnabled = this.checked;
        
        if (autoPasteEnabled) {
            statusText.textContent = "Ligado (Foque na aba ou dê Ctrl+V)";
            statusText.classList.replace("text-slate-400", "text-emerald-400");
            try {
                lastClipboardText = await navigator.clipboard.readText();
                showToast("Modo Auto-Captura ligado! Copie links e volte aqui.");
            } catch (e) {
                showToast("Permita o acesso à área de transferência, ou use Ctrl+V na página.", true);
            }
        } else {
            statusText.textContent = "Desligado";
            statusText.classList.replace("text-emerald-400", "text-slate-400");
        }
    });

    window.addEventListener('focus', async () => {
        if (!autoPasteEnabled) return;
        if (!document.getElementById('avatarPage').classList.contains('active')) return;
        try {
            const text = await navigator.clipboard.readText();
            processAutoPaste(text);
        } catch (err) {}
    });

    window.addEventListener('paste', (e) => {
        if (!autoPasteEnabled) return;
        if (!document.getElementById('avatarPage').classList.contains('active')) return;
        
        const activeTag = document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        const text = (e.clipboardData || window.clipboardData).getData('text');
        processAutoPaste(text);
    });

    function processAutoPaste(text) {
        if (text && text !== lastClipboardText && text.trim().startsWith('http')) {
            lastClipboardText = text;
            const urls = text.split(/[\n,;]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
            if (urls.length > 0) {
                currentAvatarUrls = [...currentAvatarUrls, ...urls];
                renderAvatarEditorGrid();
                showToast(`${urls.length} link(s) capturado(s) com sucesso!`);
            }
        }
    }

    document.getElementById('add-manual-avatar-btn').onclick = () => {
        const urlInput = document.getElementById('manual-avatar-url');
        const text = urlInput.value.trim();
        if(text) { 
            const urls = text.split(/[\n,;]+/).map(u => u.trim()).filter(u => u.startsWith('http'));
            if (urls.length > 0) {
                currentAvatarUrls = [...currentAvatarUrls, ...urls];
                renderAvatarEditorGrid();
            }
            urlInput.value = ''; 
        }
    }

    function renderAvatarEditorGrid() {
        const grid = document.getElementById('avatar-editor-grid');
        document.getElementById('avatar-count-badge').textContent = currentAvatarUrls.length;
        grid.innerHTML = '';
        
        currentAvatarUrls.forEach((url, index) => {
            const div = document.createElement('div');
            div.className = 'avatar-preview-container';
            div.innerHTML = `
                <img src="${escapeHTML(url)}" class="w-full aspect-square object-cover rounded-full border-2 border-slate-700 shadow-lg bg-black/50">
                <div class="avatar-edit-btn cursor-pointer" onclick="openAvatarCropper(${index})" title="Recortar Avatar">✏️</div>
                <div class="avatar-remove-btn cursor-pointer" onclick="removeAvatarImage(${index})" title="Remover Imagem">X</div>
            `;
            grid.appendChild(div);
        });
    }

    window.openAvatarCropper = async function(index) {
        currentCropIndex = index;
        const url = currentAvatarUrls[index];
        const modal = document.getElementById('avatar-crop-modal');
        const img = document.getElementById('cropper-image');
        
        modal.classList.remove('hidden');
        
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        
        img.src = '';
        
        const initCropper = () => {
            cropperInstance = new Cropper(img, {
                aspectRatio: 1, 
                viewMode: 1, 
                dragMode: 'move', 
                background: false,
                autoCropArea: 0.9, 
                cropBoxMovable: false, 
                cropBoxResizable: false, 
                toggleDragModeOnDblclick: false,
                zoomable: true,
                scalable: true,
            });
        };

        if (url.startsWith('data:')) {
            img.src = url;
            img.onload = initCropper;
            return;
        }

        const loadWithFetch = async (targetUrl) => {
            const response = await fetch(targetUrl, { mode: 'cors' });
            if (!response.ok) throw new Error("Network error");
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        };

        try {
            const objectUrl = await loadWithFetch(url);
            img.src = objectUrl;
            img.onload = () => {
                initCropper();
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); 
            };
        } catch (error) {
            console.warn("CORS bloqueou o acesso direto. Tentando via Proxy Público...", error);
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const objectUrlProxy = await loadWithFetch(proxyUrl);
                img.src = objectUrlProxy;
                img.onload = () => {
                    initCropper();
                    setTimeout(() => URL.revokeObjectURL(objectUrlProxy), 1000); 
                };
            } catch (proxyError) {
                console.error("Falha completa de CORS.", proxyError);
                showToast("Acesso à imagem foi negado pelo servidor remoto. Tente outra URL.", true);
                closeAvatarCropper();
            }
        }
    };

    window.closeAvatarCropper = function() {
        document.getElementById('avatar-crop-modal').classList.add('hidden');
        if (cropperInstance) {
            cropperInstance.destroy();
            cropperInstance = null;
        }
        currentCropIndex = -1;
    };

    window.saveAvatarCrop = function() {
        if (!cropperInstance || currentCropIndex === -1) return;
        
        try {
            const canvas = cropperInstance.getCroppedCanvas({
                width: 300,
                height: 300,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            });
            
            const base64Url = canvas.toDataURL('image/jpeg', 0.85);
            currentAvatarUrls[currentCropIndex] = base64Url;
            
            closeAvatarCropper();
            renderAvatarEditorGrid();
            showToast('Avatar recortado com sucesso!');
        } catch (error) {
            console.error(error);
            showToast("Erro ao recortar imagem.", true);
        }
    };

    window.removeAvatarImage = function(index) {
        currentAvatarUrls.splice(index, 1);
        renderAvatarEditorGrid();
    }

    window.editAvatarGroup = function(id) {
        const g = avatarGroupsData.find(x => x.id === id);
        if (!g) return;
        document.getElementById('avatar-group-id').value = g.id;
        document.getElementById('avatar-group-title').value = g.title;
        currentAvatarUrls = [...(g.avatars || [])];
        renderAvatarEditorGrid();
        document.getElementById('save-avatar-group-btn').querySelector('.button-text').textContent = "Atualizar Grupo";
    };

    window.deleteAvatarGroup = function(id) {
        showConfirm('Apagar Grupo', 'Deseja apagar este grupo de avatares?', async () => {
            await deleteDoc(doc(db, 'avatar_groups', id));
            if (document.getElementById('avatar-group-id').value === id) window.clearAvatarEdit();
            showToast('Grupo apagado!');
        });
    };

    window.clearAvatarEdit = function() {
        document.getElementById('avatar-group-id').value = '';
        document.getElementById('avatar-group-title').value = '';
        document.getElementById('avatar-tmdb-search').value = '';
        document.getElementById('avatar-tmdb-results').innerHTML = '';
        currentAvatarUrls = [];
        renderAvatarEditorGrid();
        document.getElementById('save-avatar-group-btn').querySelector('.button-text').textContent = "Salvar Grupo de Avatares";
    }

    document.getElementById('save-avatar-group-btn').onclick = async () => {
        const title = document.getElementById('avatar-group-title').value.trim();
        const id = document.getElementById('avatar-group-id').value;
        const btn = document.getElementById('save-avatar-group-btn');

        if(!title || currentAvatarUrls.length === 0) return showToast("Preencha o título e adicione imagens.", true);
        
        showButtonSpinner(btn);
        try {
            if (id) {
                await updateDoc(doc(db, 'avatar_groups', id), { title: title, avatars: currentAvatarUrls, updatedAt: serverTimestamp() });
                showToast("Grupo Atualizado!");
            } else {
                await addDoc(collection(db, 'avatar_groups'), { title: title, avatars: currentAvatarUrls, createdAt: serverTimestamp() });
                showToast("Grupo Criado!");
            }
            window.clearAvatarEdit();
        } catch(e) { showToast("Erro ao salvar.", true); } finally { hideButtonSpinner(btn, 'Salvar Grupo de Avatares'); }
    };
}

// ==========================================
// LÓGICA DA ABA DE FUNDOS DE PERFIL
// ==========================================
function initBackgroundLogic() {
    let currentBgUrls = [];

    onSnapshot(collection(db, 'background_groups'), (snapshot) => {
        backgroundGroupsData = [];
        snapshot.forEach(doc => backgroundGroupsData.push({ id: doc.id, ...doc.data() }));
        renderSavedBgGroups();
    });

    function renderSavedBgGroups() {
        const list = document.getElementById('saved-bg-groups-list');
        list.innerHTML = '';
        if (backgroundGroupsData.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400">Nenhum grupo de fundo salvo.</p>';
            return;
        }
        backgroundGroupsData.forEach(group => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-black/30 rounded-lg border border-slate-700 mb-2 transition hover:bg-slate-800";
            div.innerHTML = `
                <div class="cursor-pointer flex-1" onclick="editBgGroup('${group.id}')">
                    <p class="text-sm font-bold text-white">${escapeHTML(group.title)}</p>
                    <p class="text-xs text-cyan-400">${(group.backgrounds || []).length} fundos cadastrados</p>
                </div>
                <div class="flex gap-2">
                    <button class="text-red-400 hover:text-red-300 p-2" onclick="deleteBgGroup('${group.id}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    document.getElementById('bg-tmdb-search-btn').onclick = async () => {
        const q = document.getElementById('bg-tmdb-search').value.trim();
        if(!q) return;
        
        const btn = document.getElementById('bg-tmdb-search-btn');
        showButtonSpinner(btn);
        const res = document.getElementById('bg-tmdb-results');
        res.innerHTML = '<div class="spinner-lg mx-auto"></div>';

        const data = await fetchTMDB('search/multi', `query=${encodeURIComponent(q)}`);
        hideButtonSpinner(btn, 'Buscar Fundos');
        res.innerHTML = '';

        if(data && data.results) {
            const valid = data.results.filter(i => (i.media_type === 'tv' || i.media_type === 'movie') && i.poster_path);
            if(!valid.length) { res.innerHTML = '<p class="text-slate-400 text-center text-sm">Nenhum resultado.</p>'; return; }
            valid.forEach(item => {
                const div = document.createElement('div');
                div.className = 'flex items-center gap-3 p-2 bg-black/40 rounded-xl cursor-pointer hover:bg-cyan-500/20 border border-transparent hover:border-cyan-500/50 transition-colors';
                div.innerHTML = `<img src="${TMDB_IMG_URL}${item.poster_path}" class="w-10 h-14 object-cover rounded shadow-md"><div><h4 class="font-bold text-white text-sm">${item.name||item.title}</h4><p class="text-xs text-cyan-400">${item.media_type === 'tv' ? 'Série' : 'Filme'}</p></div>`;
                div.onclick = () => fetchTmdbBackdrops(item.id, item.media_type, item.name||item.title);
                res.appendChild(div);
            });
        }
    };

    async function fetchTmdbBackdrops(id, type, title) {
        document.getElementById('bg-group-title').value = title;
        showToast("Carregando fundos...");
        
        const data = await fetchTMDB(`${type}/${id}/images`, 'include_image_language=pt,en,null');
        if (data && data.backdrops) {
            const backdrops = data.backdrops.slice(0, 20).map(c => `https://image.tmdb.org/t/p/original${c.file_path}`);
            
            if (backdrops.length > 0) {
                currentBgUrls = [...new Set([...currentBgUrls, ...backdrops])]; 
                renderBgEditorGrid();
                showToast(`${backdrops.length} fundos carregados! Apague os que não quiser.`);
            } else {
                showToast("Este conteúdo não tem fundos no TMDB.", true);
            }
        }
    }

    document.getElementById('add-manual-bg-btn').onclick = () => {
        const urlInput = document.getElementById('manual-bg-url');
        const url = urlInput.value.trim();
        if(url) { 
            currentBgUrls.push(url); 
            renderBgEditorGrid(); 
            urlInput.value = ''; 
        }
    }

    function renderBgEditorGrid() {
        const grid = document.getElementById('bg-editor-grid');
        document.getElementById('bg-count-badge').textContent = currentBgUrls.length;
        grid.innerHTML = '';
        
        currentBgUrls.forEach((url, index) => {
            const div = document.createElement('div');
            div.className = 'bg-preview-container';
            div.innerHTML = `
                <img src="${escapeHTML(url)}" class="w-full aspect-video object-cover rounded-lg border-2 border-slate-700 shadow-lg">
                <div class="bg-remove-btn cursor-pointer" onclick="removeBgImage(${index})">X</div>
            `;
            grid.appendChild(div);
        });
    }

    window.removeBgImage = function(index) {
        currentBgUrls.splice(index, 1);
        renderBgEditorGrid();
    }

    window.editBgGroup = function(id) {
        const g = backgroundGroupsData.find(x => x.id === id);
        if (!g) return;
        document.getElementById('bg-group-id').value = g.id;
        document.getElementById('bg-group-title').value = g.title;
        currentBgUrls = [...(g.backgrounds || [])];
        renderBgEditorGrid();
        document.getElementById('save-bg-group-btn').querySelector('.button-text').textContent = "Atualizar Grupo";
    };

    window.deleteBgGroup = function(id) {
        showConfirm('Apagar Grupo', 'Deseja apagar este grupo de fundos?', async () => {
            await deleteDoc(doc(db, 'background_groups', id));
            if (document.getElementById('bg-group-id').value === id) window.clearBgEdit();
            showToast('Grupo apagado!');
        });
    };

    window.clearBgEdit = function() {
        document.getElementById('bg-group-id').value = '';
        document.getElementById('bg-group-title').value = '';
        document.getElementById('bg-tmdb-search').value = '';
        document.getElementById('bg-tmdb-results').innerHTML = '';
        currentBgUrls = [];
        renderBgEditorGrid();
        document.getElementById('save-bg-group-btn').querySelector('.button-text').textContent = "Salvar Grupo de Fundos";
    }

    document.getElementById('save-bg-group-btn').onclick = async () => {
        const title = document.getElementById('bg-group-title').value.trim();
        const id = document.getElementById('bg-group-id').value;
        const btn = document.getElementById('save-bg-group-btn');

        if(!title || currentBgUrls.length === 0) return showToast("Preencha o título e adicione imagens.", true);
        
        showButtonSpinner(btn);
        try {
            if (id) {
                await updateDoc(doc(db, 'background_groups', id), { title: title, backgrounds: currentBgUrls, updatedAt: serverTimestamp() });
                showToast("Grupo Atualizado!");
            } else {
                await addDoc(collection(db, 'background_groups'), { title: title, backgrounds: currentBgUrls, createdAt: serverTimestamp() });
                showToast("Grupo Criado!");
            }
            window.clearBgEdit();
        } catch(e) { showToast("Erro ao salvar.", true); } finally { hideButtonSpinner(btn, 'Salvar Grupo de Fundos'); }
    };
}

// ==========================================
// LÓGICA DA ABA DE FUNDOS VERTICAIS (QUEM ASSISTE)
// ==========================================
function initVerticalBgLogic() {
    let currentVerticalUrls = [];

    onSnapshot(collection(db, 'vertical_bg_groups'), (snapshot) => {
        verticalGroupsData = [];
        snapshot.forEach(doc => verticalGroupsData.push({ id: doc.id, ...doc.data() }));
        renderSavedVerticalGroups();
    });

    function renderSavedVerticalGroups() {
        const list = document.getElementById('saved-vertical-groups-list');
        list.innerHTML = '';
        if (verticalGroupsData.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400">Nenhum grupo salvo.</p>';
            return;
        }
        verticalGroupsData.forEach(group => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-black/30 rounded-lg border border-slate-700 mb-2 transition hover:bg-slate-800";
            div.innerHTML = `
                <div class="cursor-pointer flex-1" onclick="editVerticalGroup('${group.id}')">
                    <p class="text-sm font-bold text-white">${escapeHTML(group.title)}</p>
                    <p class="text-xs text-fuchsia-400">${(group.backgrounds || []).length} fundos verticais cadastrados</p>
                </div>
                <div class="flex gap-2">
                    <button class="text-red-400 hover:text-red-300 p-2" onclick="deleteVerticalGroup('${group.id}')"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    document.getElementById('vertical-tmdb-search-btn').onclick = async () => {
        const q = document.getElementById('vertical-tmdb-search').value.trim();
        if(!q) return;
        
        const btn = document.getElementById('vertical-tmdb-search-btn');
        showButtonSpinner(btn);
        const res = document.getElementById('vertical-tmdb-results');
        res.innerHTML = '<div class="spinner-lg mx-auto"></div>';

        const data = await fetchTMDB('search/multi', `query=${encodeURIComponent(q)}`);
        hideButtonSpinner(btn, 'Buscar Capas Verticais');
        res.innerHTML = '';

        if(data && data.results) {
            const valid = data.results.filter(i => (i.media_type === 'tv' || i.media_type === 'movie') && i.poster_path);
            if(!valid.length) { res.innerHTML = '<p class="text-slate-400 text-center text-sm">Nenhum resultado.</p>'; return; }
            valid.forEach(item => {
                const div = document.createElement('div');
                div.className = 'flex items-center gap-3 p-2 bg-black/40 rounded-xl cursor-pointer hover:bg-fuchsia-500/20 border border-transparent hover:border-fuchsia-500/50 transition-colors';
                div.innerHTML = `
                    <img src="${TMDB_IMG_URL}${item.poster_path}" class="w-10 h-14 object-cover rounded shadow-md">
                    <div>
                        <h4 class="font-bold text-white text-sm">${item.name||item.title}</h4>
                        <p class="text-xs text-fuchsia-400">${item.media_type === 'tv' ? 'Série' : 'Filme'}</p>
                    </div>`;
                div.onclick = () => fetchTmdbVerticalPosters(item.id, item.media_type, item.name||item.title);
                res.appendChild(div);
            });
        }
    };

    async function fetchTmdbVerticalPosters(id, type, title) {
        document.getElementById('vertical-group-title').value = title;
        showToast("Carregando capas verticais...");
        
        const data = await fetchTMDB(`${type}/${id}/images`, 'include_image_language=pt,en,null');
        if (data && data.posters) {
            const posters = data.posters.slice(0, 20).map(c => `${TMDB_IMG_URL}${c.file_path}`);
            
            if (posters.length > 0) {
                currentVerticalUrls = [...new Set([...currentVerticalUrls, ...posters])]; 
                renderVerticalEditorGrid();
                showToast(`${posters.length} capas carregadas! Apague as que não quiser.`);
            } else {
                showToast("Este conteúdo não tem capas no TMDB.", true);
            }
        }
    }

    document.getElementById('add-manual-vertical-btn').onclick = () => {
        const urlInput = document.getElementById('manual-vertical-url');
        const url = urlInput.value.trim();
        if(url) { 
            currentVerticalUrls.push(url); 
            renderVerticalEditorGrid(); 
            urlInput.value = ''; 
        }
    }

    function renderVerticalEditorGrid() {
        const grid = document.getElementById('vertical-editor-grid');
        document.getElementById('vertical-count-badge').textContent = currentVerticalUrls.length;
        grid.innerHTML = '';
        
        currentVerticalUrls.forEach((url, index) => {
            const div = document.createElement('div');
            div.className = 'vertical-preview-container';
            div.innerHTML = `
                <img src="${escapeHTML(url)}" class="w-full aspect-[2/3] object-cover rounded-lg border-2 border-slate-700 shadow-lg">
                <div class="vertical-remove-btn cursor-pointer" onclick="removeVerticalImage(${index})">X</div>
            `;
            grid.appendChild(div);
        });
    }

    window.removeVerticalImage = function(index) {
        currentVerticalUrls.splice(index, 1);
        renderVerticalEditorGrid();
    }

    window.editVerticalGroup = function(id) {
        const g = verticalGroupsData.find(x => x.id === id);
        if (!g) return;
        document.getElementById('vertical-group-id').value = g.id;
        document.getElementById('vertical-group-title').value = g.title;
        currentVerticalUrls = [...(g.backgrounds || [])];
        renderVerticalEditorGrid();
        document.getElementById('save-vertical-group-btn').querySelector('.button-text').textContent = "Atualizar Grupo";
    };

    window.deleteVerticalGroup = function(id) {
        showConfirm('Apagar Grupo', 'Deseja apagar este grupo de fundos verticais?', async () => {
            await deleteDoc(doc(db, 'vertical_bg_groups', id));
            if (document.getElementById('vertical-group-id').value === id) window.clearVerticalEdit();
            showToast('Grupo apagado!');
        });
    };

    window.clearVerticalEdit = function() {
        document.getElementById('vertical-group-id').value = '';
        document.getElementById('vertical-group-title').value = '';
        document.getElementById('vertical-tmdb-search').value = '';
        document.getElementById('vertical-tmdb-results').innerHTML = '';
        currentVerticalUrls = [];
        renderVerticalEditorGrid();
        document.getElementById('save-vertical-group-btn').querySelector('.button-text').textContent = "Salvar Grupo Vertical";
    }

    document.getElementById('save-vertical-group-btn').onclick = async () => {
        const title = document.getElementById('vertical-group-title').value.trim();
        const id = document.getElementById('vertical-group-id').value;
        const btn = document.getElementById('save-vertical-group-btn');

        if(!title || currentVerticalUrls.length === 0) return showToast("Preencha o título e adicione imagens.", true);
        
        showButtonSpinner(btn);
        try {
            if (id) {
                await updateDoc(doc(db, 'vertical_bg_groups', id), { title: title, backgrounds: currentVerticalUrls, updatedAt: serverTimestamp() });
                showToast("Grupo Atualizado!");
            } else {
                await addDoc(collection(db, 'vertical_bg_groups'), { title: title, backgrounds: currentVerticalUrls, createdAt: serverTimestamp() });
                showToast("Grupo Criado!");
            }
            window.clearVerticalEdit();
        } catch(e) { showToast("Erro ao salvar.", true); } finally { hideButtonSpinner(btn, 'Salvar Grupo Vertical'); }
    };
}

// ==========================================
// LÓGICA DE ATUALIZAÇÃO DO APP (O CÉREBRO)
// ==========================================
function initUpdateLogic() {
    function compareVersions(v1, v2) {
        const parts1 = String(v1).split('.').map(Number);
        const parts2 = String(v2).split('.').map(Number);
        const len = Math.max(parts1.length, parts2.length);
        for (let i = 0; i < len; i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    let updatesHistory = [];

    onSnapshot(collection(db, 'app_updates'), (snapshot) => {
        updatesHistory = [];
        snapshot.forEach(doc => updatesHistory.push({ id: doc.id, ...doc.data() }));
        updatesHistory.sort((a, b) => compareVersions(b.version, a.version));
        renderUpdateHistory(updatesHistory);
    });

    function renderUpdateHistory(history) {
        const list = document.getElementById('update-history-list');
        list.innerHTML = '';
        if (history.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400">Nenhuma atualização lançada ainda.</p>';
            return;
        }
        
        history.forEach((u, index) => {
            const isLatest = index === 0;
            const div = document.createElement('div');
            div.className = "p-4 bg-black/30 rounded-xl border border-slate-700 mb-3 transition hover:bg-slate-800";
            div.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-white text-lg flex items-center gap-2">
                        v${escapeHTML(u.version)}
                        ${isLatest ? '<span class="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Pública</span>' : ''}
                    </h4>
                    <button class="text-red-400 hover:text-red-300 p-1" onclick="deleteUpdate('${u.id}')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
                <p class="text-xs text-slate-400 mb-2 truncate">Link: <a href="${escapeHTML(u.link)}" target="_blank" class="text-blue-400 hover:underline">${escapeHTML(u.link)}</a></p>
                <div class="text-sm text-slate-300 bg-slate-900/50 p-3 rounded-lg whitespace-pre-line">${escapeHTML(u.notes)}</div>
            `;
            list.appendChild(div);
        });
    }

    window.deleteUpdate = function(id) {
        showConfirm('Apagar Histórico', 'Deseja apagar este registro de atualização? (Se apagar a mais recente, os usuários pararão de receber o aviso).', async () => {
            await deleteDoc(doc(db, 'app_updates', id));
            showToast('Atualização apagada do histórico.');
        });
    };

    document.getElementById('save-update-btn').onclick = async () => {
        const version = document.getElementById('update-version').value.trim();
        const link = document.getElementById('update-link').value.trim();
        const notes = document.getElementById('update-notes').value.trim();
        const btn = document.getElementById('save-update-btn');

        if (!version || !link || !notes) {
            return showToast("Preencha todos os campos da atualização.", true);
        }
        
        if (updatesHistory.length > 0 && compareVersions(version, updatesHistory[0].version) <= 0) {
            return showToast(`A versão deve ser maior que ${updatesHistory[0].version}!`, true);
        }

        showButtonSpinner(btn);
        try {
            await addDoc(collection(db, 'app_updates'), { 
                version: version, 
                link: link, 
                notes: notes,
                createdAt: serverTimestamp()
            });
            
            await window.sendPushNotification("all", "Temos uma Nova Atualização! 🚀", `A versão ${version} já está disponível para baixar no aplicativo.`);

            showToast(`Versão ${version} publicada! Os apps vão detectar isso em breve.`);
            
            document.getElementById('update-version').value = '';
            document.getElementById('update-link').value = '';
            document.getElementById('update-notes').value = '';
            
        } catch(e) { 
            console.error(e);
            showToast("Erro ao publicar atualização.", true); 
        } finally { 
            hideButtonSpinner(btn, 'Lançar Versão para Usuários'); 
        }
    };
}


// ==========================================
// LÓGICA DO RADAR DE ATUALIZAÇÕES E ATUALIZAÇÃO EM MASSA
// ==========================================
window.startUpdateScan = async function() {
    const btn = document.getElementById('start-radar-btn');
    const resultsDiv = document.getElementById('radar-results-list');
    const progressText = document.getElementById('radar-progress');

    const tvShows = catalogData.filter(c => c.type === 'tv');
    
    if (tvShows.length === 0) {
        return showToast("Você não possui séries cadastradas no catálogo.", true);
    }

    showButtonSpinner(btn);
    resultsDiv.innerHTML = '';
    progressText.classList.remove('hidden');
    let foundUpdates = 0;

    progressText.textContent = `Analisando 0 de ${tvShows.length} séries...`;

    for (let i = 0; i < tvShows.length; i++) {
        const show = tvShows[i];
        progressText.textContent = `Buscando dados: ${i + 1}/${tvShows.length} (${show.title})...`;

        try {
            const tmdbData = await fetchTMDB(`tv/${show.tmdb_id}`);
            if (!tmdbData) continue;

            let localEpCount = 0;
            if (show.seasons) {
                Object.entries(show.seasons).forEach(([key, s]) => {
                    const sNum = parseInt(s.tmdbSeason !== undefined ? s.tmdbSeason : key);
                    if (sNum > 0 && s.episodes) {
                        const validEps = s.episodes.filter(ep => 
                            (ep.url && ep.url.trim() !== '') || 
                            (ep.altUrl && ep.altUrl.trim() !== '') || 
                            ep.isComingSoon
                        );
                        localEpCount += validEps.length;
                    }
                });
            }

            let validTmdbEpCount = 0;
            if (tmdbData.seasons) {
                // Ao invés de usar o count superficial que pode incluir vazios futuros
                // Buscamos e filtramos usando a mesma regra de adição oficial
                for (let s of tmdbData.seasons) {
                    if (s.season_number > 0) {
                        const seasonData = await fetchTMDB(`tv/${show.tmdb_id}/season/${s.season_number}`);
                        if (seasonData && seasonData.episodes) {
                            const today = new Date();
                            const validEps = seasonData.episodes.filter(ep => {
                                const airDate = ep.air_date ? new Date(ep.air_date) : null;
                                const hasAired = airDate && airDate <= today;
                                const isGenericName = ep.name && (ep.name.toLowerCase().startsWith('episode') || ep.name.toLowerCase().startsWith('episódio') || ep.name.toLowerCase().startsWith('ep '));
                                const hasInfo = ep.still_path || (ep.overview && ep.overview.trim() !== '') || !isGenericName;
                                return hasAired || hasInfo;
                            });
                            validTmdbEpCount += validEps.length;
                        } else {
                            validTmdbEpCount += (s.episode_count || 0); // fallback
                        }
                    }
                }
            } else {
                validTmdbEpCount = tmdbData.number_of_episodes || 0;
            }

            if (validTmdbEpCount > localEpCount) {
                foundUpdates++;
                const diff = validTmdbEpCount - localEpCount;
                
                const div = document.createElement('div');
                div.className = 'flex items-start gap-4 p-4 bg-black/50 rounded-xl border border-emerald-500/30 hover:border-emerald-500 transition-colors group relative overflow-hidden';
                div.innerHTML = `
                    <div class="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
                        +${diff} Novo(s)
                    </div>
                    <img src="${show.poster || 'https://placehold.co/120x160/1c1917/999999?text=IMG'}" class="w-16 h-24 object-cover rounded-lg shadow-md group-hover:scale-105 transition-transform duration-300">
                    <div class="flex-1 min-w-0 flex flex-col h-full justify-between">
                        <div>
                            <h4 class="font-bold text-white truncate text-base mb-1" title="${escapeHTML(show.title)}">${escapeHTML(show.title)}</h4>
                            <p class="text-xs text-slate-400 mb-2">Temos: ${localEpCount} | TMDB: <span class="text-emerald-400 font-bold">${validTmdbEpCount}</span></p>
                        </div>
                        <button onclick="handleQuickUpdate('${show.id}')" class="glass-button w-full rounded-lg py-1.5 text-xs" style="--bg-color: rgba(16, 185, 129, 0.7);">
                            <div class="glass-content text-white font-bold">⚙️ Adicionar Agora</div>
                        </button>
                    </div>
                `;
                resultsDiv.appendChild(div);
            }
        } catch (e) {
            console.error("Erro ao escanear a série", show.title, e);
        }
    }

    if (foundUpdates === 0) {
        resultsDiv.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center h-48 text-emerald-500">
                <svg class="w-16 h-16 mb-3 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <p class="font-bold text-lg text-white">Tudo Atualizado!</p>
                <p class="text-sm">Nenhuma série possui episódios novos no TMDB.</p>
            </div>
        `;
    }

    progressText.textContent = `Escaneamento concluído! Encontrado(s) ${foundUpdates} série(s) desatualizada(s).`;
    hideButtonSpinner(btn, '📡 Escanear Novamente');
    window.initializeGlassEffects();
};

window.handleQuickUpdate = async function(docId) {
    await window.openEditPage(docId);
    showToast("Buscando novos episódios automaticamente...");
    
    setTimeout(() => {
        const syncBtn = document.querySelector('#edit-seasons-episodes-container button[onclick*="syncTmdbEpisodes"]');
        if (syncBtn) {
            syncBtn.click();
            
            setTimeout(() => {
                const editForm = document.getElementById('edit-form');
                editForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 500);
        }
    }, 1000);
};

window.startBulkAgeRatingUpdate = async function() {
    const btn = document.getElementById('start-bulk-btn');
    const resultsDiv = document.getElementById('bulk-results-list');
    const progressText = document.getElementById('bulk-progress-text');

    const missingItems = catalogData.filter(c => !c.ageRating || c.ageRating.trim() === '');
    
    if (missingItems.length === 0) {
        return showToast("Parabéns! Todos os seus animes já possuem Classificação Indicativa.", false);
    }

    showConfirm('Atualização em Massa', `Encontramos ${missingItems.length} animes sem classificação. Deseja buscar automaticamente no TMDB? O processo pode demorar alguns segundos.`, async () => {
        showButtonSpinner(btn);
        resultsDiv.innerHTML = '';
        progressText.classList.remove('hidden');
        let successCount = 0;

        progressText.textContent = `Processando 0 de ${missingItems.length} animes...`;

        for (let i = 0; i < missingItems.length; i++) {
            const item = missingItems[i];
            progressText.textContent = `Buscando idade: ${i + 1}/${missingItems.length} (${item.title})...`;

            try {
                const rating = await fetchTmdbAgeRating(item.tmdb_id, item.type);
                
                await updateDoc(doc(db, 'content', item.id), { ageRating: rating });
                successCount++;

                const div = document.createElement('div');
                div.className = 'flex items-center gap-3 p-3 bg-black/50 rounded-xl border border-yellow-500/30';
                div.innerHTML = `
                    <img src="${item.poster}" class="w-10 h-14 object-cover rounded shadow-md">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-bold text-white text-sm truncate">${escapeHTML(item.title)}</h4>
                        <p class="text-xs text-slate-400">Classificação definida: <span class="text-yellow-400 font-bold">${rating === 'L' ? 'Livre' : rating + ' Anos'}</span></p>
                    </div>
                    <div class="bg-yellow-500/20 p-2 rounded-full"><svg class="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
                `;
                resultsDiv.prepend(div); 
            } catch (e) {
                console.error("Erro ao atualizar o item", item.title, e);
            }
        }

        progressText.textContent = `Varredura concluída! ${successCount} animes atualizados com sucesso.`;
        hideButtonSpinner(btn, '⚡ Iniciar Novamente');
        window.initializeGlassEffects();
        showToast(`Processo finalizado! ${successCount} itens atualizados.`);
    });
};

window.startBulkLogoUpdate = async function() {
    const btn = document.getElementById('start-bulk-logos-btn');
    const resultsDiv = document.getElementById('bulk-logos-results-list');
    const progressText = document.getElementById('bulk-logos-progress-text');

    // Filtra itens que NÃO possuem a chave logo ou que a URL está vazia
    const missingItems = catalogData.filter(c => !c.logo || c.logo.trim() === '');
    
    if (missingItems.length === 0) {
        return showToast("Parabéns! Todos os animes e filmes já possuem Logo (Clearlogo).", false);
    }

    showConfirm('Atualização em Massa', `Encontramos ${missingItems.length} obras sem logo. Deseja buscar e sincronizar automaticamente no TMDB? O processo pode demorar um pouco.`, async () => {
        showButtonSpinner(btn);
        resultsDiv.innerHTML = '';
        progressText.classList.remove('hidden');
        let successCount = 0;

        progressText.textContent = `Processando 0 de ${missingItems.length} animes...`;

        for (let i = 0; i < missingItems.length; i++) {
            const item = missingItems[i];
            progressText.textContent = `Buscando logo: ${i + 1}/${missingItems.length} (${item.title})...`;

            try {
                // Fetch focado em pegar imagens em pt-BR e inglês
                const imgData = await fetchTMDB(`${item.type}/${item.tmdb_id}/images`, 'include_image_language=pt-BR,pt,en,null');
                
                if (imgData && imgData.logos && imgData.logos.length > 0) {
                    const logoUrl = `https://image.tmdb.org/t/p/original${imgData.logos[0].file_path}`;
                    
                    // Atualiza no Firebase
                    await updateDoc(doc(db, 'content', item.id), { logo: logoUrl });
                    successCount++;

                    // Renderiza o visual do sucesso (Glassmorphism + Cores Pink)
                    const div = document.createElement('div');
                    div.className = 'flex items-center gap-3 p-3 bg-black/50 rounded-xl border border-pink-500/30';
                    div.innerHTML = `
                        <div class="w-16 h-12 flex items-center justify-center bg-slate-800 rounded p-1">
                            <img src="${logoUrl}" class="max-w-full max-h-full object-contain">
                        </div>
                        <div class="flex-1 min-w-0">
                            <h4 class="font-bold text-white text-sm truncate">${escapeHTML(item.title)}</h4>
                            <p class="text-xs text-slate-400">Logo: <span class="text-pink-400 font-bold">Adicionado</span></p>
                        </div>
                        <div class="bg-pink-500/20 p-2 rounded-full"><svg class="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
                    `;
                    resultsDiv.prepend(div); 
                }
            } catch (e) {
                console.error("Erro ao atualizar o logo do item", item.title, e);
            }
        }

        progressText.textContent = `Varredura concluída! ${successCount} logos atualizados com sucesso.`;
        hideButtonSpinner(btn, '✨ Buscar Logos Novamente');
        window.initializeGlassEffects();
        showToast(`Processo finalizado! ${successCount} novos logos sincronizados.`);
    });
};

// ==========================================
// LÓGICA DE CONQUISTAS E INICIALIZAÇÃO GERAL
// ==========================================
function initAchievementsLogic() {
    onSnapshot(collection(db, 'achievements'), (snapshot) => {
        achievementsData = [];
        snapshot.forEach(doc => achievementsData.push({ id: doc.id, ...doc.data() }));
        renderAchievements();
    });

    document.getElementById('achievement-icon').addEventListener('input', function() {
        const preview = document.getElementById('achievement-icon-preview');
        preview.src = this.value.trim() || 'https://placehold.co/100x100/1c1917/999999?text=IMG';
    });

    function renderAchievements() {
        const list = document.getElementById('achievements-list');
        list.innerHTML = '';
        if (achievementsData.length === 0) {
            list.innerHTML = '<p class="text-sm text-slate-400 col-span-full">Nenhuma conquista cadastrada.</p>';
            return;
        }

        achievementsData.sort((a, b) => (a.difficultyLevel || 1) - (b.difficultyLevel || 1));
        
        achievementsData.forEach(ach => {
            const div = document.createElement('div');
            div.className = "flex gap-4 p-4 bg-black/40 rounded-xl border border-yellow-500/20 transition hover:border-yellow-500/50";
            
            let diffColor = "text-green-400";
            if(ach.difficultyLevel == 2) diffColor = "text-blue-400";
            if(ach.difficultyLevel == 3) diffColor = "text-yellow-400";
            if(ach.difficultyLevel == 4) diffColor = "text-orange-500";
            if(ach.difficultyLevel == 5) diffColor = "text-red-500";

            div.innerHTML = `
                <img src="${escapeHTML(ach.iconUrl)}" class="w-16 h-16 object-contain drop-shadow-[0_0_8px_rgba(234,179,8,0.4)] bg-black/50 p-1 rounded-full border border-yellow-500/30 flex-shrink-0">
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <div class="flex items-center gap-2">
                        <h4 class="font-bold text-white truncate text-base">${escapeHTML(ach.title)}</h4>
                        <span class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/50 border border-slate-700 ${diffColor}">LVL ${ach.difficultyLevel || 1}</span>
                    </div>
                    <p class="text-xs text-slate-400 line-clamp-2 mt-1">${escapeHTML(ach.description)}</p>
                    <div class="flex gap-2 mt-2">
                        <span class="bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded font-bold">${ach.conditionType} (${ach.conditionValue})</span>
                    </div>
                </div>
                <div class="flex flex-col gap-2 justify-center ml-2 border-l border-slate-700/50 pl-3">
                    <button class="text-indigo-400 hover:text-indigo-300 p-1" onclick="editAchievement('${ach.id}')" title="Editar">✏️</button>
                    <button class="text-red-400 hover:text-red-300 p-1" onclick="deleteAchievement('${ach.id}')" title="Excluir">🗑️</button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    window.editAchievement = function(id) {
        const ach = achievementsData.find(a => a.id === id);
        if (!ach) return;
        document.getElementById('achievement-id').value = ach.id;
        document.getElementById('achievement-title').value = ach.title;
        document.getElementById('achievement-desc').value = ach.description;
        document.getElementById('achievement-icon').value = ach.iconUrl;
        document.getElementById('achievement-icon-preview').src = ach.iconUrl;
        document.getElementById('achievement-type').value = ach.conditionType || 'WATCH_EPISODES';
        document.getElementById('achievement-target').value = ach.conditionValue || 0;
        document.getElementById('achievement-difficulty').value = ach.difficultyLevel || 1;
        document.getElementById('save-achievement-btn').querySelector('.button-text').textContent = "Atualizar Conquista";
    };

    window.deleteAchievement = function(id) {
        showConfirm('Apagar Conquista', 'Deseja excluir esta conquista? (Os usuários que já têm não a perderão, mas novos não poderão ganhar).', async () => {
            await deleteDoc(doc(db, 'achievements', id));
            if(document.getElementById('achievement-id').value === id) window.clearAchievementEdit();
            showToast('Conquista apagada!');
        });
    };

    window.clearAchievementEdit = function() {
        document.getElementById('achievement-id').value = '';
        document.getElementById('achievement-title').value = '';
        document.getElementById('achievement-desc').value = '';
        document.getElementById('achievement-icon').value = '';
        document.getElementById('achievement-icon-preview').src = 'https://placehold.co/100x100/1c1917/999999?text=IMG';
        document.getElementById('achievement-type').value = 'WATCH_EPISODES';
        document.getElementById('achievement-target').value = '';
        document.getElementById('achievement-difficulty').value = '1';
        document.getElementById('save-achievement-btn').querySelector('.button-text').textContent = "Salvar Conquista";
    };

    document.getElementById('save-achievement-btn').onclick = async () => {
        const id = document.getElementById('achievement-id').value;
        const title = document.getElementById('achievement-title').value.trim();
        const desc = document.getElementById('achievement-desc').value.trim();
        const icon = document.getElementById('achievement-icon').value.trim();
        const type = document.getElementById('achievement-type').value;
        const diff = parseInt(document.getElementById('achievement-difficulty').value) || 1;
        const target = parseInt(document.getElementById('achievement-target').value) || 0;
        const btn = document.getElementById('save-achievement-btn');

        if(!title || !desc || !icon || target <= 0) {
            return showToast("Preencha todos os campos e coloque um alvo maior que zero.", true);
        }

        showButtonSpinner(btn);
        try {
            const data = {
                title: title,
                description: desc,
                iconUrl: icon,
                conditionType: type,
                conditionValue: target,
                difficultyLevel: diff,
                updatedAt: serverTimestamp()
            };

            if (id) {
                await updateDoc(doc(db, 'achievements', id), data);
                showToast("Conquista Atualizada!");
            } else {
                data.createdAt = serverTimestamp();
                await addDoc(collection(db, 'achievements'), data);
                showToast("Conquista Criada!");
            }
            window.clearAchievementEdit();
        } catch(e) { 
            console.error(e);
            showToast("Erro ao salvar conquista.", true); 
        } finally { 
            hideButtonSpinner(btn, id ? 'Atualizar Conquista' : 'Salvar Conquista'); 
        }
    };

    document.getElementById('generate-achievements-ai-btn').onclick = async () => {
        let key = localStorage.getItem('mango_gemini_key');
        if(!key) {
            key = prompt("Cole sua API Key do Google AI Studio (Gemini):");
            if(!key) return;
            localStorage.setItem('mango_gemini_key', key);
        }

        const theme = document.getElementById('ai-achievement-theme').value.trim();
        const btn = document.getElementById('generate-achievements-ai-btn');
        showButtonSpinner(btn);

        const sysPrompt = `
        Você é um Game Designer criando um sistema de conquistas para um app de streaming de animes.
        Sua tarefa é gerar EXATAMENTE 5 conquistas, sendo estritamente uma para cada nível de dificuldade:
        Nível 1: Muito Fácil (Para iniciantes)
        Nível 2: Fácil (Para usuários regulares)
        Nível 3: Normal (Requer dedicação)
        Nível 4: Difícil (Para usuários hardcore)
        Nível 5: Quase Impossível (Apenas para as lendas do app)

        ${theme ? `Foque as ideias neste tema: ${theme}` : 'Misture os temas: assistir episódios, escrever comentários e dias de conta.'}

        As condições válidas ('conditionType') são EXATAMENTE: 'WATCH_EPISODES', 'WRITE_COMMENTS', 'ACCOUNT_AGE_DAYS'.
        O 'conditionValue' deve ser um número inteiro compatível com o nível. Ex: Nível 5 de episódios pode ser 5000.
        
        Responda EXCLUSIVAMENTE com um JSON Array, sem marcações markdown, sem nada antes ou depois.
        Exemplo de Formato Esperado:
        [
          {
            "title": "Nome Criativo",
            "description": "Descrição envolvente e divertida",
            "conditionType": "WATCH_EPISODES",
            "conditionValue": 100,
            "difficultyLevel": 1
          }
        ]
        `;

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: sysPrompt }] }] })
            });
            if(!res.ok) throw new Error("Erro na requisição ao Gemini");
            
            const data = await res.json();
            let aiText = data.candidates[0].content.parts[0].text;
            aiText = aiText.substring(aiText.indexOf('['), aiText.lastIndexOf(']') + 1);
            const newAchievements = JSON.parse(aiText);
            
            if (!Array.isArray(newAchievements) || newAchievements.length === 0) throw new Error("Resposta inválida da IA.");

            const savePromises = newAchievements.map(ach => {
                let color = "10B981"; // Verde (Lvl 1)
                if(ach.difficultyLevel == 2) color = "3B82F6"; // Azul
                if(ach.difficultyLevel == 3) color = "EAB308"; // Amarelo
                if(ach.difficultyLevel == 4) color = "F97316"; // Laranja
                if(ach.difficultyLevel == 5) color = "EF4444"; // Vermelho

                const iconUrl = `https://placehold.co/200x200/${color}/ffffff?text=Lvl+${ach.difficultyLevel}&font=montserrat`;
                
                return addDoc(collection(db, 'achievements'), {
                    title: ach.title,
                    description: ach.description,
                    iconUrl: iconUrl,
                    conditionType: ach.conditionType,
                    conditionValue: ach.conditionValue,
                    difficultyLevel: ach.difficultyLevel,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });
            await Promise.all(savePromises);

            showToast(`${newAchievements.length} conquistas geradas com sucesso pela IA!`);
            document.getElementById('ai-achievement-theme').value = '';
        } catch(e) { 
            console.error(e);
            showToast("Erro ao gerar com IA. Verifique sua Chave API.", true); 
        } finally { 
            hideButtonSpinner(btn, 'Gerar Pack de Conquistas'); 
        }
    };
}

// Inicialização principal da aplicação
document.addEventListener('DOMContentLoaded', () => {
    // FUNÇÃO PRINCIPAL DE ROTEAMENTO (Navegação via Link/Hash)
    function navigateTo(pageId) {
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.content-page').forEach(p => p.classList.remove('active'));

        const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
        const page = document.getElementById(pageId);

        if (link && link.closest('#sidebar-nav')) {
            link.classList.add('active');
        }
        
        if (page) {
            page.classList.add('active');
        } else {
            // Fallback caso a rota não exista
            document.querySelector('.nav-link[data-page="addContent"]')?.classList.add('active');
            document.getElementById('addContent')?.classList.add('active');
        }
    }

    // Ouvinte que dispara sempre que a rota/hash (#) na URL muda (como ao clicar no botão "Voltar" do navegador)
    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'addContent';
        navigateTo(pageId);
    });

    onAuthStateChanged(auth, (user) => {
        const mainApp = document.getElementById('main-app-container');
        if (user) {
            if (document.getElementById('login-overlay')) document.getElementById('login-overlay').remove();
            mainApp.classList.remove('opacity-0');
            
            window.initializeGlassEffects();
            listenForFeaturedItems();
            listenForCatalog();

            initAddContentLogic(); 
            initBadgeManagerLogic();
            initCarouselLogic(); 
            initAvatarLogic();
            initBackgroundLogic();
            initVerticalBgLogic();
            initUpdateLogic(); 
            initRequestsLogic(); 
            initVerifyLogic(); 
            initNotificationsLogic(); 
            initAchievementsLogic(); 

            // Ao entrar, verifica se já existe uma rota na URL para carregar direto nela
            const initialPage = window.location.hash.substring(1) || 'addContent';
            navigateTo(initialPage);

            // Transforma os cliques nos menus para mudar a rota (#) ao invés de apenas trocar a classe CSS
            document.querySelectorAll('.nav-link').forEach(l => {
                l.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.location.hash = l.dataset.page; // Isso dispara o 'hashchange' automaticamente
                });
            });
            
            document.getElementById('logout-btn').onclick = () => signOut(auth).then(() => window.location.reload());
        } else {
            mainApp.classList.add('opacity-0');
            if (!document.getElementById('login-overlay')) {
                const lDiv = document.createElement('div'); lDiv.id = 'login-overlay'; lDiv.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md';
                lDiv.innerHTML = `<div class="glass-container rounded-2xl w-full max-w-md border border-amber-500/20" style="--bg-color: rgba(15,23,42,0.8);"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content p-8 space-y-6"><div class="text-center"><div class="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-600 rounded-2xl mx-auto flex items-center justify-center text-3xl mb-4">🥭</div><h1 class="text-3xl font-black text-white">Mango Studio</h1></div><form id="login-form" class="space-y-4"><input type="email" id="l-email" class="w-full p-3 glass-input rounded-xl" placeholder="admin@mango.com" required><input type="password" id="l-pass" class="w-full p-3 glass-input rounded-xl" placeholder="Senha" required><button type="submit" id="l-btn" class="glass-button w-full rounded-xl py-3 text-slate-900" style="--bg-color: rgba(245,158,11,0.8);"><div class="glass-filter"></div><div class="glass-overlay"></div><div class="glass-specular"></div><div class="glass-content"><span class="button-text">Acessar</span><div class="button-spinner"><div class="spinner border-slate-900 border-b-white"></div></div></div></button><p id="l-err" class="text-red-400 text-sm text-center hidden"></p></form></div></div>`;
                document.body.appendChild(lDiv); window.initializeGlassEffects();
                document.getElementById('login-form').onsubmit = (e) => {
                    e.preventDefault(); const btn = document.getElementById('l-btn'); const err = document.getElementById('l-err'); showButtonSpinner(btn); err.classList.add('hidden');
                    signInWithEmailAndPassword(auth, document.getElementById('l-email').value, document.getElementById('l-pass').value).catch(error => { hideButtonSpinner(btn, 'Acessar'); err.textContent = "Credenciais inválidas."; err.classList.remove('hidden'); });
                };
            }
        }
    });
});
