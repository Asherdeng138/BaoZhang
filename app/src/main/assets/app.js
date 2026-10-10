'use strict';
const P=ReceiptParser,$=id=>document.getElementById(id),C=P.CATEGORIES;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const S={tab:'calendar',receipts:[],days:{},draft:null,month:today().slice(0,7),selectedDay:today(),listCategory:'all',search:'',exportCategory:null,from:'',to:'',selected:new Set(),warnings:[],parsed:null,busy:false,modal:null,demo:typeof Native==='undefined'};
const ICONS={receipt:'<path d="M6 3h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h2m4 0h2m-8 4h2"/>',folder:'<path d="M3 7V5h7l2 3h9v12H3z"/><path d="M3 12h18"/>',export:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',train:'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M8 18l-2 3m10-3 2 3M9 14h.01M15 14h.01"/>',travel:'<path d="M3 15h18M5 15v3h14v-3M8 15V8h8v7M6 8h12M10 5h4M9 18l-2 3m8-3 2 3"/>',food:'<path d="M5 3v7m3-7v7M2 3v7h6m-3 0v11M16 3c-3 3-4 8 0 9h3V3h-3zm3 9v9"/>',box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11M8 5l9 4"/>',client:'<path d="M4 9h13v5a6 6 0 0 1-12 0V9m13 1h2a3 3 0 0 1 0 6h-2M3 21h17M8 3v3m5-3v3"/>',plus:'<path d="M12 5v14M5 12h14"/>',camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="14" r="4"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',chevron:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>',back:'<path d="m14 5-7 7 7 7"/>'};
const catIcons=['train','travel','food','box','client'],catDescriptions=['地铁、公交与市内出行','火车、长途交通与跨城出行','出差期间的餐饮发票','办公耗材与用品','客户餐饮与接待费用'];
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.receipt}</svg>`;}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function amount(n){return '£'+P.money(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function sum(rows){return rows.reduce((n,r)=>n+Number(r.amountMinor),0);}
function typeName(type){return {business:'出差',office:'办公',holiday:'休假'}[type]||'未标记';}
function catIcon(category){return catIcons[C.indexOf(category)]||'receipt';}
function modal(title,body,type){S.modal=type;$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modalBackdrop').classList.remove('hidden');$('modalBackdrop').scrollTop=0;}
function closeModal(){if(S.modal==='editor'){if(!confirm('关闭核对页面？草稿仍会保留，可稍后继续。'))return;persistFields();}S.modal=null;$('modalBackdrop').classList.add('hidden');}
function hideModal(){S.modal=null;$('modalBackdrop').classList.add('hidden');}
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function busy(text){S.busy=true;$('busyText').textContent=text;$('busy').classList.remove('hidden');}
function idle(){S.busy=false;$('busy').classList.add('hidden');}
function call(method,...args){if(S.demo)return demoCall(method,...args);try{Native[method](...args);}catch(e){idle();toast('无法调用手机功能：'+e.message);}}
function nav(){const tabs=[['calendar','calendar','日历'],['receipts','folder','发票'],['export','export','导出']];$('bottomNav').innerHTML=tabs.map(([t,i,label])=>`<button data-tab="${t}" class="${S.tab===t?'active':''}" aria-current="${S.tab===t?'page':'false'}">${icon(i)}${label}</button>`).join('');}
function render(){nav();if(S.tab==='calendar')renderCalendar();else if(S.tab==='receipts')renderReceipts();else renderExport();}
function receiptCard(r,select=false){const selected=S.selected.has(r.id);return `<article class="receipt" data-${select?'toggle':'receipt'}="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.merchant)} ${amount(r.amountMinor)}${select?'，'+(selected?'已选中':'未选中'):''}">${select?`<input class="check" type="checkbox" aria-label="选择${esc(r.merchant)}" data-checkbox="${esc(r.id)}" ${selected?'checked':''}>`:''}<span class="receipt-icon">${icon(catIcon(r.category))}</span><div class="receipt-content"><strong>${esc(r.merchant)}</strong><small>${esc(r.category)} · ${esc(r.date.slice(5).replace('-','/'))}${r.location?' · '+esc(r.location):''}</small></div><div class="receipt-money">${amount(r.amountMinor)}<small>${r.documents.length} 个附件</small></div></article>`;}
function empty(text){return `<div class="empty-state">${icon('receipt')}<p>${text}</p></div>`;}
function draftBanner(){return S.draft?`<button class="notice" id="resumeDraft" style="width:100%;text-align:left;border:0">有一张未完成的发票，点击继续核对 →</button>`:'';}
function renderCalendar(){
 const [y,m]=S.month.split('-').map(Number),monthRows=S.receipts.filter(r=>r.date.startsWith(S.month));
 const daysIn=new Date(y,m,0).getDate(),offset=(new Date(y,m-1,1).getDay()+6)%7;
 const dates=S.receipts.reduce((o,r)=>(o[r.date]=(o[r.date]||0)+1,o),{});
 let grid='<div class="day empty"></div>'.repeat(offset);
 for(let day=1;day<=daysIn;day++){const key=`${S.month}-${String(day).padStart(2,'0')}`,type=S.days[key]||'',count=dates[key]||0;grid+=`<button class="day ${type} ${key===S.selectedDay?'selected':''} ${key===today()?'today':''}" data-day="${key}" aria-label="${key} ${typeName(type)} ${count}张发票"><span class="num">${day}</span><span class="type">${type?typeName(type):'　'}</span><span class="count">${count?count+' 张':'　'}</span></button>`;}
 const picked=S.receipts.filter(r=>r.date===S.selectedDay),type=S.days[S.selectedDay]||'unmarked';
 $('main').innerHTML=`${draftBanner()}<section class="hero"><div class="hero-line"><span class="eyebrow">${y} 年 ${m} 月 · 已保存费用</span><span class="hero-badge">${monthRows.length} 张发票</span></div><div class="hero-line"><div><h1><span>£</span>${P.money(sum(monthRows)).replace(/\B(?=(\d{3})+(?!\d))/g,',')}</h1><p>把报账留在日历里</p></div><button id="addReceipt">${icon('plus')}添加发票</button></div></section><section><div class="section-title"><h2>我的日历</h2><button class="subtle-link" id="markDay">标记出差 / 办公 / 休假</button></div><div class="calendar"><div class="month-head"><button id="prevMonth" aria-label="上个月">‹</button><strong>${y} 年 ${m} 月</strong><button id="nextMonth" aria-label="下个月">›</button></div><div class="weekdays">${['一','二','三','四','五','六','日'].map(s=>`<span>${s}</span>`).join('')}</div><div class="calendar-grid">${grid}</div><div class="legend"><span><i class="dot business"></i>出差</span><span><i class="dot office"></i>办公</span><span><i class="dot holiday"></i>休假</span></div></div></section><div class="section-title"><h2>${Number(S.selectedDay.slice(5,7))} 月 ${Number(S.selectedDay.slice(8))} 日<span class="day-status ${type}">${typeName(type)}</span></h2><button class="subtle-link" id="addForDay">添加发票</button></div>${picked.length?picked.map(r=>receiptCard(r)).join(''):empty('这一天还没有保存发票<br>拍照或导入，让费用有迹可循')}<p class="privacy-note">日期状态由你标记 · 所有金额均为英镑</p>`;
}
function monthChange(n){let [y,m]=S.month.split('-').map(Number);const date=new Date(y,m-1+n,1);S.month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;S.selectedDay=S.month===today().slice(0,7)?today():S.month+'-01';render();}
function showMark(){modal('标记日期状态',`<p class="page-sub">标记一天或一段时间。已有发票的费用分类不受影响。</p><div class="fields-row"><label class="field"><span>开始日期</span><input type="date" id="markFrom" value="${S.selectedDay}"></label><label class="field"><span>结束日期</span><input type="date" id="markTo" value="${S.selectedDay}"></label></div><label class="field"><span>日期状态</span><select id="markType"><option value="business">绿色 · 出差</option><option value="office">红色 · 办公</option><option value="holiday">蓝色 · 休假</option><option value="">清除标记</option></select></label><button class="primary" id="saveMark">保存日期状态</button>`,'mark');$('markType').value=S.days[S.selectedDay]||'business';}
function categoryTiles(action){return C.map((c,i)=>{const rows=S.receipts.filter(r=>r.category===c);return `<button class="category-tile ${S.newCategory===c&&action==='choose'?'chosen':''}" data-${action}="${i}"><span class="receipt-icon">${icon(catIcons[i])}</span><span><strong>${esc(c)}</strong><small>${action==='exportcat'?rows.length+' 张发票 · '+amount(sum(rows)):catDescriptions[i]}</small></span><span class="arrow">${icon('chevron')}</span></button>`;}).join('');}
function showNew(){if(S.draft){showEditor();return;}S.newCategory=null;modal('添加一张发票',`<span class="step">01 / 先选择费用来源</span><p class="page-sub">一条记录对应一张发票。多页发票可以追加附件。</p><div id="newCats">${categoryTiles('choose')}</div><div class="button-row"><button class="primary" id="captureNew" disabled>${icon('camera')}拍照扫描</button><button class="secondary" id="importNew" disabled>${icon('folder')}导入图片 / PDF</button></div><p class="privacy-note">扫描后核对日期、金额与商家，再保存</p>`,'new');}
function startCapture(kind,append){const cat=append?S.draft.category:S.newCategory;if(!cat)return toast('请先选择费用种类');if(append)persistFields();hideModal();busy('正在打开'+(kind==='capture'?'相机…':'文件选择器…'));call(kind,cat,append);}
function fieldData(){return {date:$('editDate').value,amount:$('editAmount').value,merchant:$('editMerchant').value.trim(),location:$('editLocation').value.trim(),category:$('editCategory').value,note:$('editNote').value,confirmed:$('editConfirmed').checked};}
function persistFields(){if(S.modal!=='editor')return;const f=fieldData();Object.assign(S.draft,f);call('updateDraft',JSON.stringify(f));}
function attachments(r,editable){return `<div class="attachments">${r.documents.map((d,i)=>`<div class="attachment"><img src="${S.demo?demoPreview(d):'/preview/'+encodeURIComponent(d.name)}" alt="发票附件${i+1}预览" loading="lazy">${editable?`<button class="remove" data-remove="${i}" aria-label="移除此附件">移除</button>`:''}<button data-open="${i}" data-owner="${editable?'draft':esc(r.id)}">${d.mime==='application/pdf'?'PDF · '+d.pages+' 页':'发票图片'} · 查看原件</button></div>`).join('')}</div>`;}
function showEditor(){
 if(!S.draft)return;const r=S.draft;
 modal(r.id?'修改发票':'核对这张发票',`${r.documents.length?attachments(r,true):empty('请先拍照或导入发票附件')}<div class="button-row"><button class="secondary" id="appendCamera">${icon('camera')}追加拍照</button><button class="secondary" id="appendFile">${icon('plus')}追加附件</button></div>${S.warnings.length?`<div class="warning"><ul>${S.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:'<div class="notice">请核对费用发生日期、实付总额和商家信息。</div>'}<label class="field"><span>费用来源</span><select id="editCategory">${C.map(c=>`<option ${r.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><div class="fields-row"><label class="field"><span>费用发生日期 *</span><input type="date" id="editDate" value="${esc(r.date)}" required><div class="candidates">${(S.parsed?.dates||[]).map(d=>`<button data-datecandidate="${d}">${d}</button>`).join('')}</div></label><label class="field"><span>实付金额（£） *</span><input id="editAmount" type="text" inputmode="decimal" placeholder="0.00" value="${esc(r.amount)}" required><div class="candidates">${(S.parsed?.amounts||[]).map(a=>`<button data-amountcandidate="${a}">£${a}</button>`).join('')}</div></label></div><label class="field"><span>商家 / 交通运营方 *</span><input id="editMerchant" maxlength="200" value="${esc(r.merchant)}" placeholder="例如 TfL、Tesco、餐厅名称"></label><label class="field"><span>所在地（选填）</span><input id="editLocation" maxlength="200" value="${esc(r.location)}" placeholder="例如 London / B&Q 门店"></label><label class="field"><span>备注（选填）</span><textarea id="editNote" maxlength="2000" placeholder="例如出差地点、客户名称、出行路线">${esc(r.note)}</textarea></label><details><summary>查看识别出的原始文字</summary><div class="raw">${esc(r.ocr||'未识别出文字，可手动填写')}</div></details><label class="confirm-label"><input type="checkbox" class="check" id="editConfirmed">我已核对日期、实付金额、商家和费用分类。</label><button class="primary" id="saveReceipt">${icon('check')}确认并保存</button><button class="subtle-link" style="width:100%;margin-top:12px;color:#a34e4e" id="discardDraft">放弃这张草稿</button>`,'editor');
}
function showDetail(id){const r=S.receipts.find(r=>r.id===id);if(!r)return;modal('发票详情',`<span class="step">${esc(r.category)}</span><div class="detail-amount">${amount(r.amountMinor)}</div><dl class="detail-grid"><dt>费用日期</dt><dd>${esc(r.date)}</dd><dt>商家 / 运营方</dt><dd>${esc(r.merchant)}</dd><dt>所在地</dt><dd>${esc(r.location||'—')}</dd><dt>备注</dt><dd>${esc(r.note||'—')}</dd></dl><div class="section-title"><h2 style="font-size:15px">发票原件</h2><span class="export-count">${r.documents.length} 个附件</span></div>${attachments(r,false)}<div class="button-row"><button class="primary" data-edit="${esc(id)}">修改信息</button><button class="danger" data-delete="${esc(id)}">删除发票</button></div>`,'detail');}
function renderReceipts(){const rows=P.filter(S.receipts,{category:S.listCategory,search:S.search}).reverse();$('main').innerHTML=`${draftBanner()}<h1 class="page-heading">我的发票</h1><p class="page-sub">原件与信息一起保存，随时查看与校准</p><input id="receiptSearch" class="search" type="search" placeholder="搜索商家、所在地或备注" value="${esc(S.search)}"><div class="filter-pills"><button class="pill ${S.listCategory==='all'?'active':''}" data-listcat="all">全部</button>${C.map((c,i)=>`<button class="pill ${S.listCategory===c?'active':''}" data-listcat="${i}">${esc(c)}</button>`).join('')}</div><div class="stats-line"><span>${rows.length} 张发票</span><strong>${amount(sum(rows))}</strong></div>${rows.length?rows.map(r=>receiptCard(r)).join(''):empty('还没有符合条件的发票')}<div class="button-row"><button class="primary" id="addReceipt">${icon('plus')}添加发票</button></div>`;}
function exportRows(){if(!S.exportCategory)return [];return P.filter(S.receipts,{category:S.exportCategory,from:S.from,to:S.to});}
function exportChanged(){S.selected=new Set(exportRows().map(r=>r.id));renderExport();}
function renderExport(){
 if(!S.exportCategory){$('main').innerHTML=`<span class="step">01 / 选择费用来源</span><h1 class="page-heading">按类别导出</h1><p class="page-sub">先选费用种类，再选择日期范围<br>生成一份发票 PDF 和一份 Excel 汇总表</p>${categoryTiles('exportcat')}<p class="privacy-note">市内交通 / 市外交通 / 餐补 / 办公用品 / 客户招待</p>`;return;}
 const rows=exportRows(),chosen=rows.filter(r=>S.selected.has(r.id));
 $('main').innerHTML=`<button class="back-link" id="exportBack">${icon('back')}重新选择费用种类</button><span class="step">02 / 选择日期和发票</span><h1 class="page-heading" style="font-size:24px">${esc(S.exportCategory)}</h1><p class="page-sub">只导出此类别，日期包含开始日与结束日</p><div class="panel"><div class="fields-row"><label class="field"><span>开始日期</span><input type="date" id="exportFrom" value="${S.from}"></label><label class="field"><span>结束日期</span><input type="date" id="exportTo" value="${S.to}"></label></div><div class="filter-pills" style="padding-bottom:0"><button class="pill" id="thisMonth">本月</button><button class="pill" id="lastMonth">上月</button><button class="pill" id="allDates">全部日期</button></div></div><div class="section-title"><h2 style="font-size:16px">选择要导出的发票</h2><button class="subtle-link" id="toggleAll">${rows.length&&chosen.length===rows.length?'取消全选':'全选'}</button></div>${rows.length?rows.map(r=>receiptCard(r,true)).join(''):empty('这段日期没有此类别的发票')}<div class="export-fixed"><div class="summary-strip"><small>已选择 ${chosen.length} 张发票</small><strong>${amount(sum(chosen))}</strong></div><button class="primary" id="generateExport" ${chosen.length?'':'disabled'}>${icon('export')}生成 PDF + Excel</button></div><p class="privacy-note">按费用日期排序 · 汇总表包含对应的 PDF 页码<br>合并PDF为可视页面，原始图片/PDF保留在手机中</p>`;
}
function chooseExport(i){S.exportCategory=C[i];const rows=S.receipts.filter(r=>r.category===S.exportCategory).sort((a,b)=>a.date.localeCompare(b.date));S.from=rows[0]?.date||today().slice(0,7)+'-01';S.to=rows.at(-1)?.date||today();exportChanged();}
function datePreset(delta,all=false){if(all){const r=S.receipts.filter(r=>r.category===S.exportCategory).sort((a,b)=>a.date.localeCompare(b.date));S.from=r[0]?.date||today();S.to=r.at(-1)?.date||today();}else{const [y,m]=today().split('-').map(Number),d=new Date(y,m-1+delta,1);S.from=P.iso(d.getFullYear(),d.getMonth()+1,1);S.to=P.iso(d.getFullYear(),d.getMonth()+1,new Date(d.getFullYear(),d.getMonth()+1,0).getDate());}exportChanged();}
function showSettings(){modal('说明与备份',`<div class="settings-list"><p><strong>随手报账 · 0.1.0</strong>${S.demo?' · 界面演示':''}<br>所有费用固定以英镑记录。</p><p><strong>拍照与识别</strong><br>先选费用来源，再拍照或导入文件。建议平放发票，保证文字清楚。一张记录对应一张发票；多页可追加。PDF 识别前 3 页，导出保留所有页的可视内容。</p><p><strong>你的日历</strong><br>绿色出差、红色办公、蓝色休假。点击日期看当天发票，点击“标记日期”可设置一段时间。</p><p><strong>按来源导出</strong><br>先选五类费用之一，再选日期和具体发票。输出 PDF 合集、Excel 明细和分类合计，全部金额为 £。</p><p><strong>原件保存在本机</strong><br>卸载或清除应用数据会删除发票。建议定期导出原件备份。备份 ZIP 包含原始文件、明细和日历状态，当前版本暂未提供一键恢复。</p><button class="primary" id="backupButton">${icon('folder')}导出全部原件备份（ZIP）</button><p>不需要注册账号。识别在手机上进行。识别结果为候选值，保存前请人工核对。</p></div>`,'settings');}
window.onNative=function(event){
 if(event.type==='busy'){busy(event.data);return;}idle();
 switch(event.type){
 case 'data':S.receipts=event.data.receipts;S.days=event.data.days;S.draft=event.data.draft;hideModal();render();break;
 case 'draft':S.draft=event.data;showEditor();break;
 case 'scan':{
   S.draft=event.data.draft;S.warnings=[];
   if(event.data.first){S.parsed=P.parse(event.data.text);S.warnings.push(...S.parsed.warnings);for(const k of ['date','amount','merchant'])if(!S.draft[k]&&S.parsed[k])S.draft[k]=S.parsed[k];}
   else S.parsed=null;
   if(event.data.duplicate)S.warnings.push('这个原件已导入过，请确认是否重复报账');
   if(event.data.message)S.warnings.push(event.data.message);
   if(S.draft.documents.some(d=>d.pages>1))S.warnings.push('多页PDF请确认只包含一张发票；多张不同发票请分别导入');
   showEditor();persistFields();break;
 }
 case 'cancel':call('ready');break;
 case 'toast':toast(event.data);break;
 case 'error':if(typeof event.data==='object'){toast(event.data.message);S.draft=event.data.draft;}else toast(event.data);if(S.draft&&S.modal!=='editor')showEditor();break;
 case 'exported':modal('文件已生成',`<div class="notice">${event.data.length===2?'发票合集和报账汇总表已生成。请保存或分享这两个文件。':'原始发票、明细和日历标记已打包。请保存备份文件。'}</div>${event.data.map(n=>`<div class="file-ready">${icon(n.endsWith('.pdf')?'receipt':'folder')}<span>${esc(n)}</span></div>`).join('')}<button class="primary" id="saveFiles">保存到手机文件夹</button><div class="button-row"><button class="secondary" id="shareFiles">分享文件</button></div>`,'exported');break;
 case 'savedFiles':toast('已保存：'+event.data.join('、'));break;
 }
};
document.addEventListener('click',e=>{
 const button=e.target.closest('button'),el=e.target.closest('[data-receipt],[data-toggle]');
 if(S.busy)return;
 if(e.target.dataset.checkbox){S.selected.has(e.target.dataset.checkbox)?S.selected.delete(e.target.dataset.checkbox):S.selected.add(e.target.dataset.checkbox);renderExport();return;}
 if(el&&el.dataset.receipt){showDetail(el.dataset.receipt);return;}
 if(el&&el.dataset.toggle){const id=el.dataset.toggle;S.selected.has(id)?S.selected.delete(id):S.selected.add(id);renderExport();return;}
 if(!button)return;const d=button.dataset;
 if(d.tab){S.tab=d.tab;render();window.scrollTo(0,0);return;}
 if(d.day){S.selectedDay=d.day;renderCalendar();document.querySelectorAll('#main .section-title')[1]?.scrollIntoView({block:'start',behavior:'smooth'});return;}
 if(d.choose!==undefined){S.newCategory=C[+d.choose];$('newCats').innerHTML=categoryTiles('choose');$('captureNew').disabled=false;$('importNew').disabled=false;return;}
 if(d.exportcat!==undefined){chooseExport(+d.exportcat);return;}
 if(d.listcat!==undefined){S.listCategory=d.listcat==='all'?'all':C[+d.listcat];renderReceipts();return;}
 if(d.edit){hideModal();S.warnings=[];S.parsed=null;busy('正在打开发票…');call('edit',d.edit);return;}
 if(d.delete){if(confirm('删除这张发票及其原件？此操作无法撤销。')){hideModal();busy('正在删除…');call('delete',d.delete);}return;}
 if(d.open!==undefined){call('open',d.owner,+d.open);return;}
 if(d.remove!==undefined){if(confirm('移除这个附件？')){persistFields();busy('正在移除附件…');call('removeAttachment',+d.remove);}return;}
 if(d.datecandidate){$('editDate').value=d.datecandidate;persistFields();return;}
 if(d.amountcandidate){$('editAmount').value=d.amountcandidate;persistFields();return;}
 switch(button.id){
 case 'settingsButton':showSettings();break;
 case 'closeModal':closeModal();break;
 case 'prevMonth':monthChange(-1);break;case 'nextMonth':monthChange(1);break;
 case 'markDay':showMark();break;
 case 'saveMark':{const f=$('markFrom').value,t=$('markTo').value;if(!P.validDate(f)||!P.validDate(t)||t<f)return toast('请选择有效的日期范围');busy('正在更新日历…');call('markDays',f,t,$('markType').value);break;}
 case 'addReceipt':case 'addForDay':showNew();break;
 case 'resumeDraft':S.warnings=[];S.parsed=null;showEditor();break;
 case 'captureNew':startCapture('capture',false);break;case 'importNew':startCapture('importFile',false);break;
 case 'appendCamera':startCapture('capture',true);break;case 'appendFile':startCapture('importFile',true);break;
 case 'saveReceipt':{const f=fieldData();if(!P.validDate(f.date))return toast('请填写有效的完整日期');try{P.minor(f.amount);}catch(err){return toast(err.message);}if(!f.merchant)return toast('请填写商家或交通运营方');if(!f.confirmed)return toast('请勾选已核对发票信息');if(!S.draft.documents.length)return toast('请添加至少一个发票附件');busy('正在保存发票…');call('save',JSON.stringify(f));break;}
 case 'discardDraft':if(confirm('放弃当前草稿？未保存的新附件将被移除。')){busy('正在放弃草稿…');call('discardDraft');}break;
 case 'exportBack':S.exportCategory=null;S.selected.clear();renderExport();break;
 case 'thisMonth':datePreset(0);break;case 'lastMonth':datePreset(-1);break;case 'allDates':datePreset(0,true);break;
 case 'toggleAll':{const rows=exportRows();S.selected=rows.length&&rows.every(r=>S.selected.has(r.id))?new Set():new Set(rows.map(r=>r.id));renderExport();break;}
 case 'generateExport':if(!P.validDate(S.from)||!P.validDate(S.to)||S.to<S.from)return toast('请选择有效的日期范围');busy('正在生成发票 PDF 和 Excel…');call('export',JSON.stringify({category:S.exportCategory,from:S.from,to:S.to,ids:[...S.selected]}));break;
 case 'saveFiles':call('saveExport');break;case 'shareFiles':call('shareExport');break;
 case 'backupButton':busy('正在打包原件备份…');call('backup');break;
 }
});
document.addEventListener('change',e=>{if(S.modal==='editor'&&e.target.id?.startsWith('edit'))persistFields();if(e.target.id==='exportFrom'||e.target.id==='exportTo'){S.from=$('exportFrom').value;S.to=$('exportTo').value;exportChanged();}});
document.addEventListener('input',e=>{if(e.target.id==='receiptSearch'){S.search=e.target.value;const pos=e.target.selectionStart;renderReceipts();$('receiptSearch').focus();$('receiptSearch').setSelectionRange(pos,pos);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if((e.key==='Enter'||e.key===' ')&&e.target.matches('article.receipt')){e.preventDefault();e.target.click();}});
window.handleBack=function(){if(S.busy)return;if(S.modal){closeModal();return;}if(S.tab==='export'&&S.exportCategory){S.exportCategory=null;render();return;}if(S.tab!=='calendar'){S.tab='calendar';render();return;}call('quit');};
$('brandIcon').innerHTML=icon('receipt');$('settingsButton').innerHTML=icon('settings');
// Browser-only preview uses clearly labelled synthetic records. Native Android starts empty.
function demoPreview(d){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="300"><rect width="220" height="300" fill="white"/><text x="25" y="45" font-family="sans-serif" font-size="18" fill="#253a34">DEMO RECEIPT</text><text x="25" y="80" font-family="sans-serif" font-size="11" fill="#888">09/10/2026</text><path d="M25 100h170M25 130h150M25 155h165M25 180h110" stroke="#ddd"/><text x="25" y="235" font-family="sans-serif" font-size="17" fill="#253a34">TOTAL     £ 12.80</text><text x="25" y="275" font-family="sans-serif" font-size="10" fill="#888">UI DEMO / SAMPLE DATA</text></svg>`;return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
function demoLoad(){const saved=localStorage.getItem('baozhang-demo');if(saved){try{const data=JSON.parse(saved);S.receipts=data.receipts;S.days=data.days;S.draft=data.draft||null;return;}catch(_){}}const base=today().slice(0,7);S.days={[base+'-05']:'business',[base+'-06']:'business',[base+'-07']:'office',[base+'-08']:'office',[base+'-09']:'business',[base+'-10']:'holiday',[base+'-11']:'holiday'};S.receipts=[['TfL · 地铁',690,C[0],'09'],['Tesco · 出差午餐',1280,C[2],'09'],['客户晚餐',4850,C[4],'05'],['Great Western Railway',3240,C[1],'05'],['Ryman · 办公用品',1599,C[3],'07']].map(([merchant,n,category,day],i)=>({id:'demo-'+i,date:base+'-'+day,merchant,location:'London',note:'界面演示数据',category,amountMinor:n,currency:'GBP',documents:[{name:'sample.jpg',mime:'image/jpeg',pages:1}]}));S.selectedDay=base+'-09';}
function demoSave(){localStorage.setItem('baozhang-demo',JSON.stringify({receipts:S.receipts,days:S.days,draft:S.draft}));}
function demoCall(method,...args){
 const emit=(type,data)=>window.onNative({type,data});
 if(method==='ready'){demoLoad();emit('data',{receipts:S.receipts,days:S.days,draft:S.draft});return;}
 if(method==='capture'||method==='importFile'){const [cat,append]=args;if(!append)S.draft={category:cat,date:'',amount:'',merchant:'',location:'',note:'',ocr:'',documents:[]};S.draft.documents.push({name:'sample.jpg',mime:'image/jpeg',pages:1});const text='Tesco\nLondon\n09/10/2026\nSubtotal 10.67\nVAT 2.13\nTOTAL £12.80';S.draft.ocr=text;emit('scan',{draft:S.draft,text,first:!append,duplicate:false,message:'界面演示：这是模拟扫描结果，真实相机和识别需在安卓应用中使用。'});demoSave();return;}
 if(method==='updateDraft'){Object.assign(S.draft,JSON.parse(args[0]));demoSave();return;}
 if(method==='save'){const f=JSON.parse(args[0]);const id=S.draft.id||'demo-'+Date.now(),r={...S.draft,...f,id,amountMinor:P.minor(f.amount),currency:'GBP'};S.receipts=S.receipts.filter(o=>o.id!==id);S.receipts.push(r);S.draft=null;demoSave();emit('data',{receipts:S.receipts,days:S.days,draft:null});toast('演示发票已保存');return;}
 if(method==='edit'){S.draft={...S.receipts.find(r=>r.id===args[0])};S.draft.documents=JSON.parse(JSON.stringify(S.draft.documents));S.draft.amount=P.money(S.draft.amountMinor);emit('draft',S.draft);demoSave();return;}
 if(method==='discardDraft'){S.draft=null;demoSave();emit('data',{receipts:S.receipts,days:S.days,draft:null});return;}
 if(method==='removeAttachment'){S.draft.documents.splice(args[0],1);demoSave();emit('draft',S.draft);return;}
 if(method==='delete'){S.receipts=S.receipts.filter(r=>r.id!==args[0]);demoSave();emit('data',{receipts:S.receipts,days:S.days,draft:S.draft});return;}
 if(method==='markDays'){const [f,t,type]=args;if(t<f)return emit('error','结束日期不能早于开始日期');const end=new Date(t+'T00:00:00Z'),date=new Date(f+'T00:00:00Z');if((end-date)/86400000>731)return emit('error','标记范围不能超过两年');while(date<=end){const key=date.toISOString().slice(0,10);if(type)S.days[key]=type;else delete S.days[key];date.setUTCDate(date.getUTCDate()+1);}demoSave();emit('data',{receipts:S.receipts,days:S.days,draft:S.draft});return;}
 if(method==='export'||method==='backup')return emit('error','此文件仅用于界面预览。真实 PDF、Excel 与备份导出在安卓应用中执行。');
 if(method==='open')return toast('界面演示：原件查看在安卓应用中使用');
 if(method==='quit')return toast('这是浏览器预览，可直接关闭此页面');idle();
}
render();if(S.demo){document.querySelector('.brand small').textContent='界面预览 · 使用模拟数据';}call('ready');

