'use strict';
// 读取工作台控件，统一使用元素 ID。
const $ = id => document.getElementById(id);
const canvas = $('canvas');
const state = {workspace:'collage', images:[], selected:null, mode:'custom', interaction:'swap', rowColumns:[1,2,2,2], busy:false};
let regions = [], drag = null;
// 统一提示导入、编辑与导出的结果。
function report(message) { $('status').textContent = message; }
// 根据长边与比例计算真实导出尺寸。
function dimensions(size = Number($('size').value)) {
  const source=state.images[0]?.source;
  const ratio = $('ratio').value==='original'?(source?source.width/source.height:1):Number($('ratio').value);
  return ratio >= 1 ? [size, Math.round(size/ratio)] : [Math.round(size*ratio), size];
}
// 获取所选图片，使用稳定 ID 避免排序后选错素材。
function selected() { return state.images.find(image => image.id === state.selected); }
// 绘制预览或导出画布，共用布局与裁切逻辑，导出不含选中边框。
function paint(target, selection = false) {
  const c = target.getContext('2d'), W = target.width, H = target.height;
  const unit = Math.min(W,H)/900, gap = Number($('gap').value)*unit, radius = Number($('radius').value)*unit;
  c.fillStyle = $('background').value; c.fillRect(0,0,W,H);
  const boxes = collageLayout(state.images.length,state.mode,$('grid-rows').value,state.rowColumns).map(cell => ({x:gap/2+cell.x*(W-gap)+gap/2,y:gap/2+cell.y*(H-gap)+gap/2,w:cell.w*(W-gap)-gap,h:cell.h*(H-gap)-gap}));
  boxes.forEach((box,i) => {
    const item = state.images[i];
    if(!item) {
      if(selection && box.w>0 && box.h>0) {c.save();c.strokeStyle='#8e9684';c.setLineDash([6,5]);c.strokeRect(box.x,box.y,box.w,box.h);c.restore();}
      return;
    }
    const source=item.source;
    if (box.w <= 0 || box.h <= 0) return;
    const scale = (item.fit === 'contain' ? Math.min : Math.max)(box.w/source.width,box.h/source.height);
    const w = source.width*scale, h = source.height*scale;
    const dx = item.fit === 'cover' ? item.x*Math.max(0,w-box.w)/2 : 0;
    const dy = item.fit === 'cover' ? item.y*Math.max(0,h-box.h)/2 : 0;
    c.save(); if(selection && state.interaction==='swap' && drag?.moved && drag.id===item.id)c.globalAlpha=.25; c.beginPath(); c.roundRect(box.x,box.y,box.w,box.h,Math.min(radius,box.w/2,box.h/2)); c.clip();
    c.drawImage(source,box.x+(box.w-w)/2+dx,box.y+(box.h-h)/2+dy,w,h); c.restore();
    if (selection && (item.id === state.selected || drag?.target === i)) { c.strokeStyle='#79bc43';c.lineWidth=3;c.strokeRect(box.x+1.5,box.y+1.5,box.w-3,box.h-3); }
    Object.assign(box,{overflowX:Math.max(0,w-box.w),overflowY:Math.max(0,h-box.h)});
  });
  if(typeof drawCollageText==='function')drawCollageText(c,W,H,selection);
  if(selection)drawDragPreview(c);
  return boxes;
}
// 拖动浮层沿用原单元格的裁切画面，只影响预览，不写入导出。
function drawDragPreview(c) {
  if(state.interaction!=='swap'||!drag?.moved||!drag.preview)return;
  const b=drag.box,x=b.x+drag.current.x-drag.p.x,y=b.y+drag.current.y-drag.p.y;
  c.save();
  c.shadowColor='#0007';c.shadowBlur=18;c.shadowOffsetY=7;
  c.globalAlpha=.92;c.drawImage(drag.preview,x,y,b.w,b.h);
  c.shadowColor='transparent';c.globalAlpha=1;c.strokeStyle='#b4f478';c.lineWidth=3;
  c.strokeRect(x+1.5,y+1.5,b.w-3,b.h-3);c.restore();
}
// 刷新预览及导出状态，预览长边固定以控制交互开销。
function render() {
  if(state.mode==='custom') {
    const next=collageRowColumns(state.images.length,$('grid-rows').value,state.rowColumns);
    if(next.join()!==state.rowColumns.join()) {state.rowColumns=next;renderRowControls();}
    $('grid-info').textContent=next.map((n,i)=>'第 '+(i+1)+' 行 '+n+' 列').join(' / ')+' · 空格导出为背景色；容量不足自动增加最后一行列数';
  }
  const presetActive=state.mode==='custom'&&state.rowColumns.join(',')==='1,2,2,2';
  const singleActive=state.mode==='custom'&&state.rowColumns.join(',')==='1'&&Number($('gap').value)===0&&Number($('radius').value)===0;
  $('preset-single').setAttribute('aria-pressed',String(singleActive));
  $('preset-1222').setAttribute('aria-pressed',String(presetActive));
  document.querySelectorAll('[data-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.layout===state.mode&&!presetActive&&!singleActive)));
  $('custom-grid').hidden=state.mode!=='custom';
  [canvas.width,canvas.height] = dimensions(900);
  regions = paint(canvas,true);
  canvas.hidden = !state.images.length; $('empty').hidden = !!state.images.length;
  $('export').disabled = !state.images.length || state.busy;
  $('dimensions').textContent = dimensions().join(' × ');
  const item=selected(); $('selected').hidden=!item;
  if(item) { $('fit').value=item.fit; $('selected-title').textContent=`图片 ${state.images.indexOf(item)+1} · 调整`; }
  window.collageChanged?.();
}
// 用 DOM 创建素材列表，文件名仅作为文本，避免注入 HTML。
function renderList() {
  $('images').replaceChildren();
  state.images.forEach((item,index) => {
    const row=document.createElement('div');row.className='image-item'+(item.id===state.selected?' active':'');
    const pick=document.createElement('button');pick.className='image-pick';pick.title=item.name;
    const img=document.createElement('img');img.src=item.thumbnail;img.alt='';
    const name=document.createElement('span');name.textContent=item.name;pick.append(img,name);
    pick.onclick=()=>{state.selected=item.id;renderList();render();};row.append(pick);
    for(const [label,title,delta] of [['↑','向前移动',-1],['↓','向后移动',1],['×','移除图片',0]]) {
      const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',title+' '+item.name);
      button.disabled=!!delta && (index+delta<0 || index+delta>=state.images.length);
      button.onclick=()=>{ if(delta) [state.images[index],state.images[index+delta]]=[state.images[index+delta],state.images[index]];else { state.images.splice(index,1);if(state.selected===item.id)state.selected=state.images[0]?.id??null; } renderList();render(); };
      row.append(button);
    }
    $('images').append(row);
  });
}
// 解码并缩小过大的图片，避免长期保留原图占用内存；拒绝 SVG 和超大文件。
async function loadImage(file,fromDraft=false) {
  if (!file.type.startsWith('image/') || file.type==='image/svg+xml') throw new Error('仅支持浏览器可解码的普通图片');
  if(!fromDraft&&file.size>30*1024*1024) throw new Error('单张图片不能超过 30 MB');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,3000/Math.max(image.naturalWidth,image.naturalHeight));
    const source=document.createElement('canvas');source.width=Math.max(1,Math.round(image.naturalWidth*scale));source.height=Math.max(1,Math.round(image.naturalHeight*scale));source.getContext('2d').drawImage(image,0,0,source.width,source.height);
    const thumb=document.createElement('canvas');thumb.width=96;thumb.height=96;thumb.getContext('2d').drawImage(source,0,0,96,96);
    return {id:crypto.randomUUID(),name:file.name,source,thumbnail:thumb.toDataURL(),fit:'cover',x:0,y:0};
  } finally { URL.revokeObjectURL(url); }
}
// 顺序导入，容量在每张处理前检查；失败的文件不会影响其他图片。
async function importImages(files) {
  if(state.busy)return;
  state.busy=true;$('files').disabled=true;render();let added=0,failed=0;
  report('正在读取图片…');
  try { for(const file of files) { if(state.workspace==='collage'&&state.images.length>=9)break;try {const item=await loadImage(file);if(state.workspace==='meme')state.images=[item];else state.images.push(item);state.selected=item.id;added++;if(state.workspace==='meme')break;}catch {failed++;} } }
  finally {state.busy=false;$('files').disabled=false;$('files').value='';renderList();render();}
  report(`已添加 ${added} 张${failed?`，${failed} 张无法读取或超过 30 MB`:''}${state.images.length>=9?' · 最多 9 张':''}`);
}
$('files').addEventListener('change',event=>importImages([...event.target.files]));
// 文件拖放仅接收本地文件，不解析外部链接。
for(const type of ['dragenter','dragover']) document.addEventListener(type,event=>{event.preventDefault();$('dropzone').classList.add('drag-over');});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)$('dropzone').classList.remove('drag-over');});
document.addEventListener('drop',event=>{event.preventDefault();$('dropzone').classList.remove('drag-over');importImages([...event.dataTransfer.files]);});
$('layouts').addEventListener('click',event=>{const button=event.target.closest('[data-layout]');if(!button)return;drag=null;state.mode=button.dataset.layout;document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();});
for(const id of ['ratio','gap','radius','background','size']) $(id).addEventListener('input',()=>{if($(id+'-value'))$(id+'-value').value=$(id).value;render();});
$('fit').addEventListener('change',()=>{const item=selected();if(item)item.fit=$('fit').value;render();});
$('reset').addEventListener('click',()=>{const item=selected();if(item)item.x=item.y=0;render();});
// 将指针从 CSS 尺寸转换为画布坐标，支持触屏和鼠标。
function point(event) {const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};}
// 命中已有图片；背景与空格不参与交换。
function hitImage(p) {return regions.findIndex((b,i)=>i<state.images.length&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);}
// 交换完整记录，裁切参数跟随图片。
function swapImages(from,to) {
  if(from<0||to<0||from===to||to>=state.images.length)return;
  [state.images[from],state.images[to]]=[state.images[to],state.images[from]];
  report('已互换图片 '+(from+1)+' 与 '+(to+1));renderList();
}
canvas.addEventListener('pointerdown',event=>{
  if(state.busy||!event.isPrimary||event.button!==0)return;
  const p=point(event);
  if(state.interaction==='text') {
    if(!selectTextAt(p))return;
    drag={text:true,p,x:Number($('text-x').value),y:Number($('text-y').value),pointerId:event.pointerId};
    canvas.focus();canvas.setPointerCapture(event.pointerId);return;
  }
  const i=hitImage(p);if(i<0)return;
  const item=state.images[i];state.selected=item.id;
  drag={id:item.id,p,current:p,x:item.x,y:item.y,box:regions[i],target:-1,moved:false,pointerId:event.pointerId};
  if(state.interaction==='swap') {
    const snapshot=document.createElement('canvas');snapshot.width=canvas.width;snapshot.height=canvas.height;paint(snapshot);
    const b=drag.box;drag.preview=document.createElement('canvas');drag.preview.width=Math.max(1,Math.round(b.w));drag.preview.height=Math.max(1,Math.round(b.h));
    drag.preview.getContext('2d').drawImage(snapshot,b.x,b.y,b.w,b.h,0,0,drag.preview.width,drag.preview.height);
  }
  canvas.setPointerCapture(event.pointerId);renderList();render();
});
canvas.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(drag.text) {
    const p=point(event);
    $('text-x').value=Math.max(0,Math.min(100,drag.x+(p.x-drag.p.x)/canvas.width*100));
    $('text-y').value=Math.max(0,Math.min(100,drag.y+(p.y-drag.p.y)/canvas.height*100));updateSelectedText();render();return;
  }
  const item=state.images.find(i=>i.id===drag.id);if(!item)return;
  const p=point(event);drag.current=p;drag.moved ||= Math.hypot(p.x-drag.p.x,p.y-drag.p.y)>8;
  if(state.interaction==='swap')drag.target=drag.moved?hitImage(p):-1;
  else {item.x=Math.max(-1,Math.min(1,drag.x+(p.x-drag.p.x)*2/(drag.box.overflowX||Infinity)));item.y=Math.max(-1,Math.min(1,drag.y+(p.y-drag.p.y)*2/(drag.box.overflowY||Infinity)));}
  render();
});
canvas.addEventListener('pointerup',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;
  if(state.interaction==='swap'&&drag.moved)swapImages(state.images.findIndex(i=>i.id===drag.id),hitImage(point(event)));
  drag=null;render();
});
// 取消手势时仅清除高亮，不触发互换。
for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;render();});
canvas.addEventListener('keydown',event=>{
  if(state.interaction==='text' && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
    event.preventDefault();const id=['ArrowLeft','ArrowRight'].includes(event.key)?'text-x':'text-y';
    $(id).value=Math.max(0,Math.min(100,Number($(id).value)+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)));updateSelectedText();render();return;
  }
  const item=selected();if(!item||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const horizontal=event.key==='ArrowLeft'||event.key==='ArrowRight',direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
  if(state.interaction==='crop') {const axis=horizontal?'x':'y';item[axis]=Math.max(-1,Math.min(1,item[axis]+direction*.05));}
  else {
    const from=state.images.indexOf(item),a=regions[from],ax=a.x+a.w/2,ay=a.y+a.h/2;
    const candidates=regions.map((b,i)=>({i,dx:b.x+b.w/2-ax,dy:b.y+b.h/2-ay})).filter(b=>b.i<state.images.length&&b.i!==from&&(horizontal?b.dx:b.dy)*direction>1);
    candidates.sort((a,b)=>Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy));if(candidates[0])swapImages(from,candidates[0].i);
  }
  render();
});
// 行列使用有限选项，每行的控制器仅在配置结构改变时重建，避免编辑中丢失焦点。
function addGridOptions(select) {
  for(let n=1;n<=9;n++){const option=document.createElement('option');option.value=n;option.textContent=n;select.append(option);}
}
// 展示独立列数，修改一行不影响其他行；容量不足时末行补足。
function renderRowControls() {
  $('row-columns').replaceChildren();
  state.rowColumns.forEach((count,index)=>{
    const label=document.createElement('label');label.append('第 '+(index+1)+' 行列数');
    const select=document.createElement('select');select.setAttribute('aria-label','第 '+(index+1)+' 行列数');addGridOptions(select);select.value=count;
    select.addEventListener('change',()=>{
      drag=null;state.rowColumns[index]=Number(select.value);
      const requested=state.rowColumns.join();
      render();
      if(requested!==state.rowColumns.join())report('格子不足，已增加最后一行列数以保留全部图片');
    });
    label.append(select);$('row-columns').append(label);
  });
}
addGridOptions($('grid-rows'));
$('grid-rows').value='4';
$('grid-rows').addEventListener('change',()=>{
  drag=null;state.rowColumns=collageRowColumns(state.images.length,$('grid-rows').value,state.rowColumns);
  renderRowControls();render();
});
renderRowControls();
// 单图预设不删除已有素材，多图时提示先保留一张再应用。
$('preset-single').addEventListener('click',()=>{
  if(state.images.length>1){report('单图模式请先保留一张图片，再点击“单图”');return;}
  window.collageChanged?.();
  drag=null;state.rowColumns=[1];$('grid-rows').value='1';
  for(const id of ['gap','radius']){$(id).value='0';$(id+'-value').value='0';}
  if(state.images[0])state.images[0].fit='cover';
  renderRowControls();document.querySelector('[data-layout="custom"]').click();
});
// 一键应用四行七格预设，复用自定义网格的编辑、草稿与撤销流程。
$('preset-1222').addEventListener('click',()=>{
  drag=null;state.rowColumns=[1,2,2,2];$('grid-rows').value='4';
  renderRowControls();document.querySelector('[data-layout="custom"]').click();
});
document.querySelector('.interaction-tools').addEventListener('click',event=>{
  const button=event.target.closest('[data-interaction]');if(!button)return;
  drag=null;state.interaction=button.dataset.interaction;
  document.querySelectorAll('[data-interaction]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('interaction-hint').textContent=state.interaction==='swap'?'拖到另一张图片上松开，互换位置':state.interaction==='text'?'拖动移动文字，方向键微调':'拖动调整裁切位置，方向键微调';render();
});
// 独立画布生成 PNG，不包含预览选中框；失败后恢复导出按钮。
$('export').addEventListener('click',async()=>{if(!state.images.length||state.busy)return;state.busy=true;render();report('正在生成 PNG…');try {const output=document.createElement('canvas');[output.width,output.height]=dimensions();paint(output);const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(state.workspace==='meme'?'剪易表情包-':'剪易拼图-')+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);report('已生成 PNG，请查看浏览器下载');}catch {report('导出失败，请降低导出尺寸后重试');}finally{state.busy=false;render();}});
render();
