import {formatWeekend, formatWeekendTab, isEventUpcoming, upcomingWeekend} from './weekend.mjs';

const state={events:[],date:'all',filter:'all',query:'',meta:{}};
const $=s=>document.querySelector(s);
const fmtDate=d=>new Intl.DateTimeFormat('ru-RU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${d}T12:00:00Z`)).replace('.','');
function renderDateTabs(){
  const weekend=upcomingWeekend();
  const tabs=[['all','Все дни'],[weekend[0],formatWeekendTab(weekend[0],'Сб')],[weekend[1],formatWeekendTab(weekend[1],'Вс')]];
  const container=$('.date-tabs');
  container.innerHTML=tabs.map(([date,label])=>`<button class="date-tab${state.date===date?' active':''}" data-date="${date}">${label}</button>`).join('');
  $('#weekendTitle').textContent=formatWeekend(weekend);
  container.querySelectorAll('.date-tab').forEach(button=>button.addEventListener('click',()=>{
    state.date=button.dataset.date;
    renderDateTabs();
    render();
  }));
}
function matches(e){const q=state.query.toLowerCase();const text=`${e.title} ${e.place} ${e.description} ${e.tags?.join(' ')}`.toLowerCase();return isEventUpcoming(e)&&(state.date==='all'||e.date===state.date)&&(!q||text.includes(q))&&(state.filter==='all'||(state.filter==='free'&&e.free)||(state.filter==='solo'&&e.solo)||(state.filter==='outdoor'&&e.outdoor));}
function card(e){const price=e.free?'Бесплатно':e.price||'Цена по ссылке';return `<article class="event-card"><div class="card-top"><div class="date-stamp">${fmtDate(e.date)} · ${e.time||'время уточняется'}</div><div class="card-actions"><span class="badge ${e.free?'':'paid'}">${price}</span><a class="card-link" href="${e.source}" target="_blank" rel="noreferrer">открыть ↗</a><div class="tags">${(e.tags||[]).slice(0,3).map(t=>`<span class="tag">${t}</span>`).join('')}</div></div></div><h2><a href="${e.source}" target="_blank" rel="noreferrer">${e.title}</a></h2><div class="meta">${e.place} · ${e.area||'Gdańsk'}<br>${e.outdoor?'На улице':'В помещении'}${e.registration?' · нужна регистрация':''}</div><p class="description">${e.description||''}</p></article>`;}
function render(){const list=state.events.filter(matches);$('#events').innerHTML=list.map(card).join('');$('#empty').hidden=list.length>0;$('#emptyMessage').textContent=state.query||state.filter!=='all'?'Попробуйте снять фильтр или изменить запрос.':'Источники пока не вернули события на выбранные даты. Проверьте первоисточники или зайдите позже — афиша обновляется автоматически.';$('#eventCount').textContent=list.length;$('#checkedAt').textContent=state.meta?.lastChecked||'—';}
async function load(){try{const data=await fetch('./data/events.json',{cache:'no-store'}).then(r=>r.json());state.events=data.events||[];state.meta=data.meta||{};if(data.meta?.message)$('#notice').textContent=data.meta.message;renderDateTabs();render();}catch(e){$('#notice').hidden=false;$('#notice').textContent='Не удалось загрузить данные. Откройте страницу позже.';}}
async function loadSources(){try{const sources=await fetch('./data/sources.json',{cache:'no-store'}).then(r=>r.json());$('#sourcesList').innerHTML=sources.map(s=>`<a class="source-row" href="${s.url}" target="_blank" rel="noreferrer"><span class="source-type">${s.type||'source'}</span><span><strong>${s.name}</strong><small>${s.url}</small></span><b>↗</b></a>`).join('');}catch(e){$('#sourcesList').innerHTML='<p class="sources-loading">Не удалось загрузить список источников.</p>';}}
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;render();}));
$('#search').addEventListener('input',e=>{state.query=e.target.value;render();});$('#refreshBtn').addEventListener('click',()=>{location.reload();});
const sourcesModal=document.getElementById('sourcesModal');const openSources=()=>{sourcesModal.hidden=false;sourcesModal.classList.add('is-open');loadSources();};const closeSources=()=>{sourcesModal.hidden=true;sourcesModal.classList.remove('is-open');};
document.getElementById('sourcesBtn').addEventListener('click',openSources);document.querySelectorAll('[data-close-sources]').forEach(el=>el.addEventListener('click',closeSources));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSources();});
let activeWeekend=upcomingWeekend().join('/');
setInterval(()=>{const weekend=upcomingWeekend().join('/');if(weekend!==activeWeekend){activeWeekend=weekend;if(state.date!=='all')state.date='all';renderDateTabs();render();}else render();},60_000);
load();
