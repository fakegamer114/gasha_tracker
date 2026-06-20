/* Simple banner manager: presets, localStorage, countdowns */

const GAMES = [
	{ id: 'wuthering', name: 'Wuthering Waves', defaultDays: 14 },
	{ id: 'zenless', name: 'Zenless Zone Zero', defaultDays: 14 },
	{ id: 'genshin', name: 'Genshin Impact', defaultDays: 21 },
	{ id: 'arknights', name: 'Arknights', defaultDays: 14 },
	{ id: 'hsr', name: 'Honkai: Star Rail', defaultDays: 21 },
	{ id: 'duet', name: 'Duet Night Abyss', defaultDays: 14 }
];

const STORAGE_KEY = 'gacha_banners_v1';

// Per-game known news endpoints (used as fallbacks when no sourceUrl provided)
const GAME_FETCH_RULES = {
	genshin: [
		'https://genshin.hoyoverse.com/en/news',
		'https://www.hoyolab.com/article' // generic HoYoLAB article base
	],
	hsr: [
		'https://www.honkaistarrail.com/en/news',
		'https://hsr.hoyoverse.com/en-us/news'
	],
	arknights: [
		'https://www.arknights.global/en/news',
		'https://ak.hypergryph.com/news'
	],
	wuthering: [
		'https://wutheringwaves.kurogame.com/en/main'
	],
	zenless: [
		'https://zzzh.hoyoverse.com/en/news'
	],
	duet: [
		// no official known news endpoint; user should provide source
	]
};

function $(id){ return document.getElementById(id); }

function loadBanners(){
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw ? JSON.parse(raw) : [];
}

function saveBanners(list){
	localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function populateGames(){
	const sel = $('gameSelect');
	sel.innerHTML = '';
	GAMES.forEach(g=>{
		const o = document.createElement('option');
		o.value = g.id; o.textContent = g.name;
		sel.appendChild(o);
	});
	sel.addEventListener('change', ()=>{
		const g = GAMES.find(x=>x.id===sel.value);
		if(g) $('durationDays').value = g.defaultDays;
	});
}

function formatRemaining(ms){
	if(ms <= 0) return 'Ended';
	const s = Math.floor(ms/1000);
	const d = Math.floor(s/86400);
	const h = Math.floor(s%86400/3600);
	const m = Math.floor(s%3600/60);
	const sec = s%60;
	return `${d}d ${h}h ${m}m ${sec}s`;
}

function renderBanners(){
	const list = loadBanners();
	const container = $('bannersList');
	if(list.length === 0){ container.textContent = 'No banners yet.'; return; }
	container.innerHTML = '';
	list.forEach(b=>{
		const el = document.createElement('div');
		el.className = 'banner';
		const now = Date.now();
		const end = new Date(b.endDate).getTime();
		const remaining = end - now;

		el.innerHTML = `
			<div class="banner-head">
				<strong>${b.gameName}</strong> — ${b.bannerName}
				<div>
					<button data-id="${b.id}" class="fetch">Fetch Now</button>
					<button data-id="${b.id}" class="del">Delete</button>
				</div>
			</div>
			<div>from: ${b.startDate} — to: ${b.endDate}</div>
			<div class="remaining">${formatRemaining(remaining)}</div>
			<div class="source">source: ${b.sourceUrl || '—'} (${b.fetchMethod})</div>
		`;
		container.appendChild(el);
	});

	// attach delete handlers
	container.querySelectorAll('button.del').forEach(btn=>{
		btn.addEventListener('click', ()=>{
			const id = btn.getAttribute('data-id');
			const updated = loadBanners().filter(x=>x.id!==id);
			saveBanners(updated);
			renderBanners();
		});
	});

	container.querySelectorAll('button.fetch').forEach(btn=>{
		btn.addEventListener('click', ()=>{
			const id = btn.getAttribute('data-id');
			fetchSource(id);
		});
	});
}

async function fetchSource(id){
	const list = loadBanners();
	const b = list.find(x=>x.id===id);
	if(!b){ alert('Banner not found'); return; }
	// try specific sourceUrl first, then fall back to GAME_FETCH_RULES
	const candidates = [];
	if(b.sourceUrl) candidates.push(b.sourceUrl);
	const rules = GAME_FETCH_RULES[b.gameId] || [];
	for(const u of rules) if(!candidates.includes(u)) candidates.push(u);

	let success = false;
	for(const url of candidates){
		const controller = new AbortController();
		const timeout = setTimeout(()=>controller.abort(), 8000);
		try{
			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timeout);
			const ct = res.headers.get('content-type') || '';
			let foundStart = null, foundEnd = null;
			if(ct.includes('application/json')){
				const j = await res.json();
				const parsed = parseDatesFromJSON(j);
				foundStart = parsed.start; foundEnd = parsed.end;
			} else {
				const text = await res.text();
				const parsed = parseDatesFromText(text);
				foundStart = parsed.start; foundEnd = parsed.end;
			}

			if(foundEnd){
				const d = new Date(foundEnd);
				if(!isNaN(d.getTime())){
					b.endDate = d.toISOString().slice(0,10);
					saveBanners(list);
					renderBanners();
					alert('EndDate updated from source: ' + b.endDate + '\n(Source: ' + url + ')');
					success = true; break;
				}
			}
		}catch(err){
			clearTimeout(timeout);
			console.warn('fetch failed for', url, err);
			// try next candidate
		}
	}
	if(!success){
		alert('Failed to fetch end date from any available source (could be due to CORS or no extractable dates).');
	}
}

function parseDatesFromJSON(j){
	// try common keys
	const candidates = ['end','endDate','end_date','finish','to','until'];
	const startCandidates = ['start','startDate','start_date','from'];
	const flat = JSON.stringify(j);
	for(const k of candidates){
		const re = new RegExp(`"${k}"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})`,'i');
		const m = flat.match(re);
		if(m) return { end: m[1], start: null };
	}
	for(const k of startCandidates){
		const re = new RegExp(`"${k}"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})`,'i');
		const m = flat.match(re);
		if(m) return { start: m[1], end: null };
	}
	return { start:null, end:null };
}

function parseDatesFromText(text){
	// 1) ISO dates
	const iso = text.match(/\d{4}-\d{2}-\d{2}/g);
	if(iso && iso.length>0){
		return { start: iso[0], end: iso[iso.length-1] };
	}

	// 2) ranges like "YYYY-MM-DD to YYYY-MM-DD" or "YYYY/MM/DD - YYYY/MM/DD"
	const rangeIso = text.match(/(\d{4}[\-\/]\d{2}[\-\/]\d{2})\s*(?:to|\-|–)\s*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/i);
	if(rangeIso) return { start: rangeIso[1], end: rangeIso[2] };

	// 3) long month formats like "July 1, 2026" — capture multiple occurrences
	const monthNames = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
	const longRe = new RegExp(monthNames + '\\s+\d{1,2},?\\s+\d{4}','gi');
	const longMatches = text.match(longRe);
	if(longMatches && longMatches.length>0){
		const parsed = longMatches.map(s=>new Date(s));
		const valid = parsed.filter(d=>!isNaN(d.getTime()));
		if(valid.length>0){
			const start = valid[0].toISOString().slice(0,10);
			const end = valid[valid.length-1].toISOString().slice(0,10);
			return { start, end };
		}
	}

	// 4) datetime attributes or meta tags
	const dt = text.match(/datetime=\"([^\"]{8,30})\"/i);
	if(dt) return { start:null, end: dt[1] };

	return { start:null, end:null };
}

function tick(){
	const nodes = document.querySelectorAll('.banner .remaining');
	const list = loadBanners();
	nodes.forEach((node, i)=>{
		const b = list[i];
		if(!b) return;
		const rem = new Date(b.endDate).getTime() - Date.now();
		node.textContent = formatRemaining(rem);
	});
}

function initForm(){
	const form = $('bannerForm');
	form.addEventListener('submit', (e)=>{
		e.preventDefault();
		const gameId = $('gameSelect').value;
		const game = GAMES.find(g=>g.id===gameId) || {name:gameId};
		const bannerName = $('bannerName').value.trim();
		const startDate = $('startDate').value;
		const days = parseInt($('durationDays').value,10) || 0;
		const sourceUrl = $('sourceUrl').value.trim();
		const fetchMethod = $('fetchMethod').value;

		if(!startDate || !bannerName){ alert('Please fill in the required fields.'); return; }

		// compute endDate
		const start = new Date(startDate);
		const end = new Date(start.getTime() + days*24*60*60*1000);

		const banners = loadBanners();
		banners.push({
			id: String(Date.now()),
			gameId, gameName: game.name,
			bannerName, startDate: startDate,
			endDate: end.toISOString().slice(0,10),
			durationDays: days,
			sourceUrl, fetchMethod
		});
		saveBanners(banners);
		form.reset();
		// reset duration to selected game's default
		const g = GAMES.find(x=>x.id===gameId);
		if(g) $('durationDays').value = g.defaultDays;
		renderBanners();
	});

	$('loadPresets').addEventListener('click', ()=>{
		const g = GAMES[0];
		if(g) $('durationDays').value = g.defaultDays;
		alert('Presets loaded to form — Please select a game and fill in the details.');
	});
}

document.addEventListener('DOMContentLoaded', ()=>{
	populateGames();
	initForm();
	renderBanners();
	setInterval(()=>{ renderBanners(); }, 1000);
});

