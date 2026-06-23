/* Simple banner manager: presets, localStorage, countdowns */

const GAMES = [
    { id: 'genshin', name: 'Genshin Impact', defaultDays: 21 },
	{ id: 'wuthering', name: 'Wuthering Waves', defaultDays: 14 },
	{ id: 'zenless', name: 'Zenless Zone Zero', defaultDays: 14 },
    { id: 'hsr', name: 'Honkai: Star Rail', defaultDays: 21 },
    { id: 'nte', name: 'Neverness to everness', defaultDays: 21 },
	{ id: 'arknights', name: 'Arknights', defaultDays: 14 },
	{ id: 'arknightsE', name: 'Arknights: Endfield', defaultDays: 14 },
    { id: 'bluearchive', name: 'Blue Archive', defaultDays: 14 },
    { id: 'fgo', name: 'Fate/Grand Order', defaultDays: 14 },
    { id: 'reverse1999', name: 'Reverse: 1999', defaultDays: 14 },
	{ id: 'duet', name: 'Duet Night Abyss', defaultDays: 14 },
    { id: 'mongil', name: 'MONGIL: STAR DIVE', defaultDays: 14 },
    { id: 'czn', name: 'chaos zero Nightmare' , defaultDays: 21},
	{ id: 'IN', name: 'infinity Nikki', defaultDays: 14 },
	{ id: 'GOV', name: 'Goddess of Victory: Nikke', defaultDays: 14 },
	{ id: 'SL', name: 'Solo leveling', defaultDays: 14 },
	{ id: 'sp', name: 'Silver Palace', defaultDays: 14 }
];

const STORAGE_KEY = 'gacha_banners_v1';

// Per-game known news endpoints (used as fallbacks when no sourceUrl provided)
// NOTE: most of these will fail with a CORS error from the browser — see fetchSource().
const GAME_FETCH_RULES = {
	genshin: [
		'https://genshin.hoyoverse.com/en/news'
	],
	hsr: [
		'https://www.honkaistarrail.com/en/news'
	],
	arknights: [
		'https://www.arknights.global/en/news'
	],
	wuthering: [
		'https://wutheringwaves.kurogame.com/en/main'
	],
	zenless: [
		'https://zzzh.hoyoverse.com/en/news'
	],
	duet: [
        'https://duetnightabyss.com/en/news'
    ],
    nte: [
        'https://nevernesstoeverness.com/en/news'
    ],
    bluearchive: [
        'https://bluearchive.com/en/news'
    ],
    czn: [
        'https://chaoszeronightmare.com/en/news'
    ],
    mongil: [
        'https://mongilstardive.com/en/news'
    ],
    fgo: [
        'https://fate-go.us/news'
    ],
    reverse1999: [
        'https://reverse1999.com/en/news'
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
	// set initial duration to match the first game in the list
	if(GAMES.length){
		$('durationDays').value = GAMES[0].defaultDays;
	}
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
				    <span class="game-badge">${b.gameName}</span>
				    <strong class="banner-title">${b.bannerName}</strong>
				</div>
				
			</div>
			<div>from: ${b.startDate} — to: ${b.endDate}</div>
			<div class="remaining">${formatRemaining(remaining)}</div>
			<div class="source">source: ${b.sourceUrl || '-'} (${b.fetchMethod})</div>
                <div class="banner-actions">
					<button data-id="${b.id}" class="fetch">Fetch Now</button>
					<button data-id="${b.id}" class="del">Delete</button>
				</div>
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

	if(candidates.length === 0){
		alert('No source URL configured for this game. Add one manually in "Source (URL)".');
		return;
	}

	let success = false;
	let lastErrorWasLikelyCors = false;

	for(const url of candidates){
		const controller = new AbortController();
		const timeout = setTimeout(()=>controller.abort(), 8000);
		try{
			const res = await fetch(url, { signal: controller.signal });
			clearTimeout(timeout);
			const ct = res.headers.get('content-type') || '';
			let foundEnd = null;
			if(ct.includes('application/json')){
				const j = await res.json();
				const parsed = parseDatesFromJSON(j);
				foundEnd = parsed.end;
			} else {
				const text = await res.text();
				const parsed = parseDatesFromText(text);
				foundEnd = parsed.end;
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
			// TypeError with no further detail is the typical signature of a CORS block
			if(err instanceof TypeError) lastErrorWasLikelyCors = true;
			// try next candidate
		}
	}

	if(!success){
		if(lastErrorWasLikelyCors){
			alert('Could not reach the source automatically — this is almost always a CORS restriction ' +
				'(the official site does not allow requests from browser pages on other domains). ' +
				'You will need to update the end date manually, or paste the news text using the ' +
				'"Parse pasted text" option ( not availble yet ) .');
		} else {
			alert('Failed to fetch end date: no recognizable date pattern found in the page content.');
		}
	}
}

function parseDatesFromJSON(j){
	const candidates = ['end','endDate','end_date','finish','to','until'];
	const startCandidates = ['start','startDate','start_date','from'];
	const flat = JSON.stringify(j);
	for(const k of candidates){
		const re = new RegExp(`"${k}"\\s*:\\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})`,'i');
		const m = flat.match(re);
		if(m) return { end: m[1], start: null };
	}
	for(const k of startCandidates){
		const re = new RegExp(`"${k}"\\s*:\\s*"([0-9]{4}-[0-9]{2}-[0-9]{2})`,'i');
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
	// FIX: \d must be escaped as \\d inside the JS string literal, otherwise it
	// degrades to the literal letter "d" and never matches a digit.
	const monthNames = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
	const longRe = new RegExp(monthNames + '\\s+\\d{1,2},?\\s+\\d{4}','gi');
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
	const dt = text.match(/datetime="([^"]{8,30})"/i);
	if(dt) return { start:null, end: dt[1] };

	return { start:null, end:null };
}

function addBannerFromForm(e){
	e.preventDefault();

	const gameId = $('gameSelect').value;
	const game = GAMES.find(g=>g.id===gameId);
	if(!game) return;

	const startVal = $('startDate').value;
	const days = parseInt($('durationDays').value, 10);
	if(!startVal || isNaN(days) || days <= 0){
		alert('Please provide a valid start date and duration.');
		return;
	}

	const end = new Date(startVal);
	end.setDate(end.getDate() + days);

	const banner = {
		id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
		gameId,
		gameName: game.name,
		bannerName: $('bannerName').value.trim() || 'Unnamed banner',
		startDate: startVal,
		endDate: end.toISOString().slice(0,10),
		sourceUrl: $('sourceUrl').value.trim(),
		fetchMethod: $('fetchMethod').value
	};

	const list = loadBanners();
	list.push(banner);
	saveBanners(list);
	renderBanners();
	e.target.reset();
	populateGames(); // reset duration field to first game's default after form.reset()
}

function loadPresets(){
	const today = new Date().toISOString().slice(0,10);
	const presets = GAMES.map(g=>{
		const end = new Date();
		end.setDate(end.getDate() + g.defaultDays);
		return {
			id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + g.id),
			gameId: g.id,
			gameName: g.name,
			bannerName: 'Example banner',
			startDate: today,
			endDate: end.toISOString().slice(0,10),
			sourceUrl: '',
			fetchMethod: 'manual'
		};
	});
	saveBanners(presets);
	renderBanners();
}

function init(){
	populateGames();
	renderBanners();
	$('bannerForm').addEventListener('submit', addBannerFromForm);
	$('loadPresets').addEventListener('click', loadPresets);

	// keep countdowns live without needing a manual refresh
	setInterval(renderBanners, 1000);
}

document.addEventListener('DOMContentLoaded', init);
